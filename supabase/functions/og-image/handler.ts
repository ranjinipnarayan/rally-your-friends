import type { OgCardData } from "./og-card.ts";

export type ImageRally = {
  activity: string;
  time_mode: string;
  starts_at: string | null;
  location: string | null;
  status: string;
  final_time: string | null;
  final_location: string | null;
  rally_candidates: { id: string }[];
};

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
    if (!row) return fail(404);
    const count = row.rally_candidates?.length ?? 0;
    const time = fmt(row.final_time) ?? fmt(row.starts_at);
    const where = row.final_location ?? row.location;
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
      confirmed: row.status === "confirmed",
    });
  } catch {
    console.error("Share image generation failed");
    return fail(503);
  }
}
