import type { SupabaseClient } from "@supabase/supabase-js";
import type { OgCardData } from "./og-card.ts";

export type ImageRally = {
  activity: string;
  time_mode: string;
  starts_at: string | null;
  location: string | null;
  status: string;
  published_at: string | null;
  final_time: string | null;
  final_location: string | null;
  expires_at: string;
  rally_candidates: { id: string }[];
};

/** Refresh only this public Rally so image-only visits use the same lifecycle. */
export async function loadImageRally(
  token: string,
  db: Pick<SupabaseClient, "from" | "rpc">,
): Promise<ImageRally | null> {
  const { data: found, error: lookupError } = await db
    .from("rallies")
    .select("id,status,published_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!found || !found.published_at || found.status === "draft") return null;
  const { error: refreshError } = await db.rpc("refresh_rallies", {
    p_rally_id: found.id,
  });
  if (refreshError) throw refreshError;
  const { data, error } = await db
    .from("rallies")
    .select(
      "activity,time_mode,starts_at,location,status,published_at,final_time,final_location,expires_at,rally_candidates(id)",
    )
    .eq("id", found.id)
    .neq("status", "draft")
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data as ImageRally | null;
}

function fmt(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

async function secretsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

export async function handleImage(
  request: Request,
  deps: {
    secret: string | undefined;
    load: (token: string) => Promise<ImageRally | null>;
    render: (card: OgCardData) => Promise<Response>;
  },
): Promise<Response> {
  const fail = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET") return fail(405);
  if (!deps.secret) return fail(503);
  const provided = request.headers.get("X-Rally-Render-Secret");
  if (
    !provided ||
    provided.length > 512 ||
    !(await secretsMatch(provided, deps.secret))
  )
    return fail(401);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-z0-9]{16,64}$/.test(token)) return fail(400);
  try {
    const row = await deps.load(token);
    if (!row || !row.published_at || row.status === "draft") return fail(404);
    if (
      row.status !== "open" &&
      row.status !== "confirmed" &&
      row.status !== "cancelled" &&
      row.status !== "completed"
    )
      return fail(404);
    const count = row.rally_candidates?.length ?? 0;
    // While voting is open, the preview must match the question recipients see.
    const time =
      row.status === "open"
        ? fmt(row.starts_at)
        : (fmt(row.final_time) ?? fmt(row.starts_at));
    const where =
      row.status === "open"
        ? row.location
        : (row.final_location ?? row.location);
    if (!where && !time && !(row.time_mode === "poll" && count > 0))
      return fail(404);
    return await deps.render({
      activity: row.activity,
      when:
        time ??
        (row.time_mode === "poll" && count > 0
          ? `${count} times to pick from`
          : "Time TBD"),
      where: where || "Place TBD",
      status: row.status,
      responsesOpen:
        row.status === "open" &&
        new Date(row.expires_at).getTime() > Date.now(),
    });
  } catch {
    console.error("Share image generation failed");
    return fail(503);
  }
}
