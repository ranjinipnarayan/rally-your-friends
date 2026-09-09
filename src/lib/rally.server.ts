import { supabaseAdmin as db } from "../integrations/supabase/client.server";
import type { Tables } from "../integrations/supabase/types";
import type {
  CreateRallyInput,
  ResponseInput,
  UpdateRallyInput,
} from "./rally-schema";
import type {
  Candidate,
  NextAction,
  RallyStatus,
  RallyView,
  ResponseView,
} from "./rally-shared";
import type { SavedRally } from "./account.functions";
import { RallyError } from "./rally-error";
import { siteUrl } from "./site-url";

type RallyRow = Tables<"rallies">;
const RESPONSE_COLUMNS =
  "id, name, consensus, note, response_candidates(candidate_id, available), location_suggestions(text), time_suggestions(starts_at)";

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  // Only our deliberately raised validation errors may reach public clients.
  if (error.code === "P0001")
    throw new RallyError("invalid_state", error.message, 409);
  throw new RallyError(
    "unavailable",
    "Could not load or save this Rally. Please try again.",
    503,
  );
}

function makeToken(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (b) => alphabet[b % alphabet.length],
  ).join("");
}

function toView(
  row: RallyRow,
  candidates: Candidate[],
  publicFacing = false,
): RallyView {
  const publicUrl = siteUrl(`/r/${row.invite_token}`);
  const time = row.final_time ?? row.starts_at;
  const location = row.final_location ?? row.location;
  const locked = row.status === "confirmed" || row.status === "completed";
  const mapsUrl =
    locked && location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
      : null;
  // UTC is explicit: native clients can format the ISO time in the user's zone.
  const finalMessage =
    locked && row.confirmed_at && time && location
      ? `${row.activity} is confirmed!\n${new Date(time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" })} UTC\n${location}\n${publicUrl}`
      : null;
  return {
    id: row.id,
    activity: row.activity,
    timeMode: row.time_mode as RallyView["timeMode"],
    startsAt: row.starts_at,
    locationMode: row.location_mode as RallyView["locationMode"],
    location: row.location,
    status: row.status as RallyStatus,
    nextAction: row.next_action as NextAction,
    // Retained for older native decoders; archiving is no longer supported.
    archivedAt: null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    responsesOpen:
      row.status === "open" && new Date(row.expires_at).getTime() > Date.now(),
    publicUrl,
    mapsUrl,
    finalMessage,
    // While collecting replies, recipients answer the original question.
    // Tentative organizer choices must not silently change its meaning.
    finalTime: publicFacing && row.status === "open" ? null : row.final_time,
    finalLocation:
      publicFacing && row.status === "open" ? null : row.final_location,
    expiresAt: row.expires_at,
    candidates,
  };
}

async function candidatesFor(id: string) {
  const { data, error } = await db
    .from("rally_candidates")
    .select("id, starts_at")
    .eq("rally_id", id)
    .order("position");
  check(error);
  return (data ?? []).map((c) => ({ id: c.id, startsAt: c.starts_at }));
}

async function responsesFor(
  id: string,
  responseId?: string,
): Promise<ResponseView[]> {
  const result: ResponseView[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = db
      .from("responses")
      .select(RESPONSE_COLUMNS)
      .eq("rally_id", id)
      .order("created_at")
      .order("id")
      .range(offset, offset + 99);
    if (responseId) query = query.eq("id", responseId);
    const { data, error } = await query;
    check(error);
    for (const r of data ?? []) {
      result.push({
        id: r.id,
        name: r.name,
        consensus: r.consensus as ResponseView["consensus"],
        note: r.note,
        available: r.response_candidates
          .filter((c) => c.available)
          .map((c) => c.candidate_id),
        suggestions: r.location_suggestions.map((s) => s.text),
        timeSuggestions: r.time_suggestions.map((s) => s.starts_at).sort(),
      });
    }
    if (!data || data.length < 100) return result;
  }
}

async function refreshed(row: RallyRow): Promise<RallyRow> {
  const { error } = await db.rpc("refresh_rallies", { p_rally_id: row.id });
  check(error);
  const result = await db.from("rallies").select("*").eq("id", row.id).single();
  check(result.error);
  if (!result.data)
    throw new RallyError("not_found", "This link isn't valid.", 404);
  return result.data;
}

async function byToken(
  token: string,
  column: "invite_token" | "creator_token",
) {
  const { data, error } = await db
    .from("rallies")
    .select("*")
    .eq(column, token)
    .maybeSingle();
  check(error);
  return data;
}

function authorize(
  row: RallyRow,
  userId: string | null,
  creatorToken?: string,
) {
  if (row.user_id) {
    if (!userId)
      throw new RallyError(
        "unauthorized",
        "Please sign in to manage your Rallies.",
        401,
      );
    if (row.user_id !== userId)
      throw new RallyError(
        "not_found",
        "This Rally isn't in your account.",
        404,
      );
  } else if (!creatorToken || row.creator_token !== creatorToken) {
    throw new RallyError("not_found", "This Rally isn't in your account.", 404);
  }
}

export async function createPlan(
  data: CreateRallyInput,
  userId: string | null,
) {
  if (data.status === "draft" && !userId)
    throw new RallyError(
      "unauthorized",
      "Please sign in to save a draft.",
      401,
    );
  const { data: row, error } = await db
    .rpc("create_rally", {
      p_payload: data,
      p_user_id: userId,
      p_invite_token: makeToken(),
      p_creator_token: makeToken(),
    })
    .single<RallyRow>();
  check(error);
  if (!row)
    throw new RallyError("unavailable", "Could not create this Rally.", 503);
  return {
    id: row.id,
    inviteToken: row.invite_token,
    creatorToken: row.creator_token,
    publicUrl: siteUrl(`/r/${row.invite_token}`),
    title: row.activity,
  };
}

export async function inviteView(inviteToken: string) {
  const found = await byToken(inviteToken, "invite_token");
  if (!found || !found.published_at)
    return {
      rally: null,
      responseCount: 0,
      deleted: !found && (await wasDeleted(inviteToken, "invite_token")),
    };
  const row = await refreshed(found);
  const [candidates, count] = await Promise.all([
    candidatesFor(row.id),
    db
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("rally_id", row.id),
  ]);
  check(count.error);
  return {
    rally: toView(row, candidates, true),
    responseCount: count.count ?? 0,
  };
}

export async function myResponse(inviteToken: string, responseId: string) {
  const row = await byToken(inviteToken, "invite_token");
  if (!row || !row.published_at) return { response: null };
  return { response: (await responsesFor(row.id, responseId))[0] ?? null };
}

export async function respond(inviteToken: string, data: ResponseInput) {
  const { data: responseId, error } = await db.rpc("respond_to_rally", {
    p_invite_token: inviteToken,
    p_payload: data,
  });
  check(error);
  if (!responseId)
    throw new RallyError("unavailable", "Could not save your response.", 503);
  return { responseId };
}

export async function organizerView(
  userId: string | null,
  lookup: { id: string } | { creatorToken: string },
) {
  const result =
    "id" in lookup
      ? await db
          .from("rallies")
          .select("*")
          .eq("id", lookup.id)
          .eq("user_id", userId!)
          .maybeSingle()
      : {
          data: await byToken(lookup.creatorToken, "creator_token"),
          error: null,
        };
  check(result.error);
  if (!result.data)
    return {
      rally: null,
      responses: [],
      inviteToken: null,
      creatorToken: null,
      deleted:
        "creatorToken" in lookup &&
        (await wasDeleted(lookup.creatorToken, "creator_token")),
    };
  authorize(
    result.data,
    userId,
    "creatorToken" in lookup ? lookup.creatorToken : undefined,
  );
  const row = await refreshed(result.data);
  authorize(
    row,
    userId,
    "creatorToken" in lookup ? lookup.creatorToken : undefined,
  );
  const [candidates, responses] = await Promise.all([
    candidatesFor(row.id),
    responsesFor(row.id),
  ]);
  return {
    rally: toView(row, candidates),
    responses,
    inviteToken: row.invite_token,
    creatorToken: row.creator_token,
  };
}

export async function managePlan(
  userId: string | null,
  lookup: { id: string } | { creatorToken: string },
  patch: UpdateRallyInput,
) {
  const result =
    "id" in lookup
      ? await db
          .from("rallies")
          .select("*")
          .eq("id", lookup.id)
          .eq("user_id", userId!)
          .maybeSingle()
      : {
          data: await byToken(lookup.creatorToken, "creator_token"),
          error: null,
        };
  check(result.error);
  if (!result.data)
    throw new RallyError("not_found", "This Rally isn't in your account.", 404);
  authorize(
    result.data,
    userId,
    "creatorToken" in lookup ? lookup.creatorToken : undefined,
  );
  const { error } = await db.rpc("manage_rally", {
    p_rally_id: result.data.id,
    p_user_id: userId,
    p_creator_token: "creatorToken" in lookup ? lookup.creatorToken : null,
    p_patch: patch,
  });
  check(error);
  return { ok: true };
}

export async function deletePlan(
  userId: string | null,
  lookup: { id: string } | { creatorToken: string },
) {
  if ("id" in lookup && !userId)
    throw new RallyError("unauthorized", "Please sign in.", 401);
  const result =
    "id" in lookup
      ? await db
          .from("rallies")
          .select("*")
          .eq("id", lookup.id)
          .eq("user_id", userId!)
          .maybeSingle()
      : {
          data: await byToken(lookup.creatorToken, "creator_token"),
          error: null,
        };
  check(result.error);
  if (!result.data)
    throw new RallyError(
      "not_found",
      "This Rally was not found in your account.",
      404,
    );
  authorize(
    result.data,
    userId,
    "creatorToken" in lookup ? lookup.creatorToken : undefined,
  );
  // The transaction rechecks ownership under a row lock before deleting data.
  const { data, error } = await db.rpc("delete_rally", {
    p_rally_id: result.data.id,
    p_user_id: userId,
    p_creator_token: "creatorToken" in lookup ? lookup.creatorToken : null,
  });
  check(error);
  if (!data)
    throw new RallyError(
      "not_found",
      "This Rally was not found in your account.",
      404,
    );
  return { deleted: true };
}

async function wasDeleted(
  token: string,
  column: "invite_token" | "creator_token",
) {
  const { data, error } = await db
    .from("deleted_rallies")
    .select("deleted_at")
    .eq(column, token)
    .maybeSingle();
  check(error);
  return !!data;
}

export async function saveToAccount(creatorToken: string, userId: string) {
  const row = await byToken(creatorToken, "creator_token");
  if (!row) throw new RallyError("not_found", "This link isn't valid.", 404);
  if (row.user_id === userId) return { saved: true };
  if (row.user_id)
    throw new RallyError(
      "conflict",
      "This Rally is already saved to another account.",
      409,
    );
  // Compare-and-set prevents two organizers claiming the same anonymous Rally.
  const { data, error } = await db
    .from("rallies")
    .update({ user_id: userId })
    .eq("id", row.id)
    .is("user_id", null)
    .select("id");
  check(error);
  if (!data?.length) {
    const latest = await byToken(creatorToken, "creator_token");
    if (latest?.user_id !== userId)
      throw new RallyError(
        "conflict",
        "This Rally is already saved to another account.",
        409,
      );
  }
  return { saved: true };
}

export async function savedState(creatorToken: string, userId: string) {
  const row = await byToken(creatorToken, "creator_token");
  return { saved: row?.user_id === userId };
}

export async function listPlans(
  userId: string,
): Promise<{ rallies: SavedRally[] }> {
  const { error } = await db.rpc("refresh_rallies", { p_user_id: userId });
  check(error);
  const rallies: SavedRally[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from("rallies")
      .select("*, responses(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 99);
    check(error);
    for (const r of data ?? []) {
      const nextAction = r.next_action as NextAction;
      const past =
        r.status === "cancelled" || r.status === "completed";
      const needsYou =
        r.status === "draft" ||
        ["choose_time", "choose_location", "finalize"].includes(nextAction);
      rallies.push({
        id: r.id,
        creatorToken: r.creator_token,
        inviteToken: r.invite_token,
        publicUrl: siteUrl(`/r/${r.invite_token}`),
        activity: r.activity,
        time: r.final_time ?? r.starts_at,
        location: r.final_location ?? r.location,
        status: r.status as RallyStatus,
        nextAction,
        archivedAt: null,
        responseCount: r.responses[0]?.count ?? 0,
        section: past ? "past" : needsYou ? "needs_you" : "active",
      });
    }
    if (!data || data.length < 100) return { rallies };
  }
}
