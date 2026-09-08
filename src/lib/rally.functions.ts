import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Candidate, RallyStatus, RallyView, ResponseView } from "./rally-shared";

const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

function makeToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const tokenSchema = z.string().min(16).max(64).regex(/^[a-z0-9]+$/);
const isoSchema = z.string().datetime({ offset: true });

type Db = Awaited<ReturnType<typeof admin>>;

type RallyRow = {
  id: string;
  activity: string;
  time_mode: "specific" | "poll";
  starts_at: string | null;
  location_mode: "specific" | "open";
  location: string | null;
  status: RallyStatus;
  final_time: string | null;
  final_location: string | null;
  expires_at: string;
};

const RALLY_COLUMNS =
  "id, activity, time_mode, starts_at, location_mode, location, status, final_time, final_location, expires_at";

async function expireIfNeeded(db: Db, rally: RallyRow): Promise<RallyRow> {
  const expired = new Date(rally.expires_at).getTime() < Date.now();
  if (!expired || rally.status === "expired" || rally.status === "confirmed") return rally;
  await db.from("rallies").update({ status: "expired" }).eq("id", rally.id);
  return { ...rally, status: "expired" };
}

async function loadCandidates(db: Db, rallyId: string): Promise<Candidate[]> {
  const { data } = await db
    .from("rally_candidates")
    .select("id, starts_at")
    .eq("rally_id", rallyId)
    .order("position", { ascending: true });
  return (data ?? []).map((c) => ({ id: c.id, startsAt: c.starts_at }));
}

function toView(rally: RallyRow, candidates: Candidate[]): RallyView {
  return {
    activity: rally.activity,
    timeMode: rally.time_mode,
    startsAt: rally.starts_at,
    locationMode: rally.location_mode,
    location: rally.location,
    status: rally.status,
    finalTime: rally.final_time,
    finalLocation: rally.final_location,
    expiresAt: rally.expires_at,
    candidates,
  };
}

async function findRally(
  db: Db,
  column: "invite_token" | "creator_token",
  token: string,
): Promise<RallyRow | null> {
  const { data } = await db.from("rallies").select(RALLY_COLUMNS).eq(column, token).maybeSingle();
  if (!data) return null;
  return expireIfNeeded(db, data as RallyRow);
}

async function loadResponses(db: Db, rallyId: string): Promise<ResponseView[]> {
  const { data: responses } = await db
    .from("responses")
    .select("id, name, consensus, note")
    .eq("rally_id", rallyId)
    .order("created_at", { ascending: true });
  if (!responses || responses.length === 0) return [];
  const ids = responses.map((r) => r.id);

  const [{ data: avail }, { data: suggestions }, { data: timeSuggestions }] = await Promise.all([
    db.from("response_candidates").select("response_id, candidate_id, available").in("response_id", ids),
    db.from("location_suggestions").select("response_id, text").eq("rally_id", rallyId),
    db
      .from("time_suggestions")
      .select("response_id, starts_at")
      .eq("rally_id", rallyId)
      .order("starts_at", { ascending: true }),
  ]);

  return responses.map((r) => ({
    id: r.id,
    name: r.name,
    consensus: r.consensus as ResponseView["consensus"],
    note: r.note,
    available: (avail ?? [])
      .filter((a) => a.response_id === r.id && a.available)
      .map((a) => a.candidate_id),
    suggestions: (suggestions ?? []).filter((s) => s.response_id === r.id).map((s) => s.text),
    timeSuggestions: (timeSuggestions ?? [])
      .filter((s) => s.response_id === r.id)
      .map((s) => s.starts_at),
  }));
}

/* ---------------------------------- create --------------------------------- */

export const createRally = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        activity: z.string().min(1).max(200),
        timeMode: z.enum(["specific", "poll"]),
        startsAt: isoSchema.nullable(),
        locationMode: z.enum(["specific", "open"]),
        location: z.string().max(200).nullable(),
        candidates: z.array(isoSchema).max(10),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const inviteToken = makeToken();
    const creatorToken = makeToken();

    const { data: rally, error } = await db
      .from("rallies")
      .insert({
        activity: data.activity,
        time_mode: data.timeMode,
        starts_at: data.timeMode === "specific" ? data.startsAt : null,
        location_mode: data.locationMode,
        location: data.locationMode === "specific" ? data.location : null,
        status: "open",
        invite_token: inviteToken,
        creator_token: creatorToken,
      })
      .select("id")
      .single();

    if (error || !rally) throw new Error("Could not create this Rally.");

    if (data.timeMode === "poll" && data.candidates.length > 0) {
      const { error: candErr } = await db.from("rally_candidates").insert(
        data.candidates.map((startsAt, position) => ({
          rally_id: rally.id,
          starts_at: startsAt,
          position,
        })),
      );
      if (candErr) throw new Error("Could not save the time options.");
    }

    return { inviteToken, creatorToken };
  });

/* -------------------------------- recipient -------------------------------- */

export const getInviteView = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ inviteToken: tokenSchema }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    // Single round trip: rally + its candidates.
    const { data: row } = await db
      .from("rallies")
      .select(`${RALLY_COLUMNS}, rally_candidates(id, starts_at, position)`)
      .eq("invite_token", data.inviteToken)
      .maybeSingle();
    if (!row) return { rally: null as RallyView | null, responseCount: 0 };

    const nested = row as RallyRow & {
      rally_candidates?: Array<{ id: string; starts_at: string; position: number }>;
    };
    const candidates: Candidate[] = (nested.rally_candidates ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, startsAt: c.starts_at }));

    const rally = await expireIfNeeded(db, nested);
    return { rally: toView(rally, candidates), responseCount: 0 };
  });


export const getMyResponse = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ inviteToken: tokenSchema, responseId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const rally = await findRally(db, "invite_token", data.inviteToken);
    if (!rally) return { response: null as ResponseView | null };
    const responses = await loadResponses(db, rally.id);
    return { response: responses.find((r) => r.id === data.responseId) ?? null };
  });

export const submitResponse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        inviteToken: tokenSchema,
        responseId: z.string().uuid().nullable(),
        name: z.string().min(1).max(60),
        consensus: z.enum(["yes", "no", "another_day", "none_work", "some_work"]).nullable(),
        available: z.array(z.string().uuid()).max(10),
        note: z.string().max(300).nullable(),
        locationSuggestion: z.string().max(200).nullable(),
        timeSuggestions: z.array(isoSchema).max(3).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const rally = await findRally(db, "invite_token", data.inviteToken);
    if (!rally) throw new Error("This link isn't valid.");
    if (rally.status === "expired") throw new Error("This Rally has expired.");
    if (rally.status === "confirmed") throw new Error("This Rally is already confirmed.");

    const name = data.name.trim();

    // Upsert by (rally_id, name) so re-opening the link edits instead of duplicating.
    let responseId = data.responseId;
    if (responseId) {
      const { data: existing } = await db
        .from("responses")
        .select("id")
        .eq("id", responseId)
        .eq("rally_id", rally.id)
        .maybeSingle();
      if (!existing) responseId = null;
    }
    if (!responseId) {
      const { data: byName } = await db
        .from("responses")
        .select("id")
        .eq("rally_id", rally.id)
        .eq("name", name)
        .maybeSingle();
      responseId = byName?.id ?? null;
    }

    if (responseId) {
      const { error } = await db
        .from("responses")
        .update({ name, consensus: data.consensus, note: data.note })
        .eq("id", responseId);
      if (error) throw new Error("Could not save your response.");
    } else {
      const { data: inserted, error } = await db
        .from("responses")
        .insert({ rally_id: rally.id, name, consensus: data.consensus, note: data.note })
        .select("id")
        .single();
      if (error || !inserted) throw new Error("Could not save your response.");
      responseId = inserted.id;
    }

    const candidates = await loadCandidates(db, rally.id);
    if (candidates.length > 0) {
      await db.from("response_candidates").delete().eq("response_id", responseId);
      const valid = data.available.filter((id) => candidates.some((c) => c.id === id));
      if (valid.length > 0) {
        await db
          .from("response_candidates")
          .insert(valid.map((candidate_id) => ({ response_id: responseId!, candidate_id, available: true })));
      }
    }

    await db.from("location_suggestions").delete().eq("response_id", responseId);
    const suggestion = data.locationSuggestion?.trim();
    if (rally.location_mode === "open" && suggestion) {
      await db
        .from("location_suggestions")
        .insert({ rally_id: rally.id, response_id: responseId, text: suggestion });
    }

    // Alternative times proposed when none of the offered options work.
    await db.from("time_suggestions").delete().eq("response_id", responseId);
    const proposed = (data.timeSuggestions ?? []).slice(0, 3);
    if (proposed.length > 0) {
      await db
        .from("time_suggestions")
        .insert(proposed.map((starts_at) => ({ rally_id: rally.id, response_id: responseId!, starts_at })));
    }

    if (rally.status === "open") {
      await db.from("rallies").update({ status: "collecting" }).eq("id", rally.id);
    }

    return { responseId };
  });

/* --------------------------------- creator --------------------------------- */

export const getCreatorView = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ creatorToken: tokenSchema }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const rally = await findRally(db, "creator_token", data.creatorToken);
    if (!rally) {
      return { rally: null as RallyView | null, responses: [] as ResponseView[], inviteToken: null };
    }
    const [candidates, responses] = await Promise.all([
      loadCandidates(db, rally.id),
      loadResponses(db, rally.id),
    ]);
    const { data: tokenRow } = await db
      .from("rallies")
      .select("invite_token")
      .eq("id", rally.id)
      .single();
    return {
      rally: toView(rally, candidates),
      responses,
      inviteToken: tokenRow?.invite_token ?? null,
    };
  });

export const updateRally = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        creatorToken: tokenSchema,
        finalTime: isoSchema.nullish(),
        finalLocation: z.string().max(200).nullish(),
        status: z
          .enum(["open", "collecting", "choosing_location", "confirmed", "expired"])
          .nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const rally = await findRally(db, "creator_token", data.creatorToken);
    if (!rally) throw new Error("This link isn't valid.");

    const patch: {
      final_time?: string | null;
      final_location?: string | null;
      status?: RallyStatus;
    } = {};
    if (data.finalTime !== undefined) patch.final_time = data.finalTime ?? null;
    if (data.finalLocation !== undefined) patch.final_location = data.finalLocation ?? null;
    if (data.status) patch.status = data.status;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("rallies").update(patch).eq("id", rally.id);
      if (error) throw new Error("Could not update this Rally.");
    }
    return { ok: true };
  });
