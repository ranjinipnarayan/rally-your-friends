import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RallyStatus } from "./rally-shared";

const tokenSchema = z.string().min(16).max(64).regex(/^[a-z0-9]+$/);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type SavedRally = {
  creatorToken: string;
  activity: string;
  time: string | null;
  location: string | null;
  status: RallyStatus;
  responseCount: number;
};

/** Attach an already-created Rally to the signed-in creator's account. */
export const saveRally = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ creatorToken: tokenSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: rally } = await db
      .from("rallies")
      .select("id, user_id")
      .eq("creator_token", data.creatorToken)
      .maybeSingle();
    if (!rally) throw new Error("This link isn't valid.");
    if (rally.user_id && rally.user_id !== context.userId) {
      throw new Error("This Rally is already saved to another account.");
    }
    if (!rally.user_id) {
      const { error } = await db
        .from("rallies")
        .update({ user_id: context.userId })
        .eq("id", rally.id);
      if (error) throw new Error("Could not save this Rally.");
    }
    return { saved: true };
  });

/** Whether this Rally is already saved to the signed-in creator's account. */
export const getSavedState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ creatorToken: tokenSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: rally } = await db
      .from("rallies")
      .select("user_id")
      .eq("creator_token", data.creatorToken)
      .maybeSingle();
    return { saved: !!rally?.user_id && rally.user_id === context.userId };
  });

/** Newest-first list of the signed-in creator's saved Rallies. */
export const listMyRallies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: rallies } = await db
      .from("rallies")
      .select(
        "id, creator_token, activity, starts_at, final_time, location, final_location, status, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    const rows = rallies ?? [];
    if (rows.length === 0) return { rallies: [] as SavedRally[] };

    const { data: responses } = await db
      .from("responses")
      .select("rally_id")
      .in(
        "rally_id",
        rows.map((r) => r.id),
      );

    const counts = new Map<string, number>();
    for (const r of responses ?? []) {
      counts.set(r.rally_id, (counts.get(r.rally_id) ?? 0) + 1);
    }

    return {
      rallies: rows.map((r) => ({
        creatorToken: r.creator_token as string,
        activity: r.activity as string,
        time: (r.final_time ?? r.starts_at) as string | null,
        location: (r.final_location ?? r.location) as string | null,
        status: r.status as RallyStatus,
        responseCount: counts.get(r.id) ?? 0,
      })) satisfies SavedRally[],
    };
  });
