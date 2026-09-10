import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const organizer = randomUUID();
const otherOrganizer = randomUUID();
const future = "2099-06-15T18:00:00.000Z";
const later = "2099-06-16T18:00:00.000Z";
const fixedPlan = {
  activity: "Dinner",
  timeMode: "specific",
  startsAt: future,
  locationMode: "specific",
  location: "Central Park",
  candidates: [],
};
type Rally = {
  id: string;
  user_id: string | null;
  invite_token: string;
  creator_token: string;
  status: string;
  next_action: string;
  archived_at: Date | null;
  confirmed_at: Date | null;
  published_at: Date | null;
  starts_at: Date | null;
  time_zone: string | null;
  final_time: Date | null;
  final_location: string | null;
  expires_at: Date;
};
const token = () => randomUUID().replaceAll("-", "");

async function create(payload: object = {}, user: string | null = organizer) {
  const result = await db.query<Rally>(
    "SELECT * FROM public.create_rally($1, $2, $3, $4)",
    [{ ...fixedPlan, ...payload }, user, token(), token()],
  );
  return result.rows[0]!;
}
async function manage(
  rally: Rally,
  patch: object,
  user: string | null = organizer,
  creatorToken: string | null = null,
) {
  return (
    await db.query<Rally>("SELECT * FROM public.manage_rally($1, $2, $3, $4)", [
      rally.id,
      user,
      creatorToken,
      patch,
    ])
  ).rows[0]!;
}
async function respond(rally: Rally, payload: object = {}) {
  return (
    await db.query<{ id: string }>(
      "SELECT public.respond_to_rally($1, $2) AS id",
      [
        rally.invite_token,
        {
          name: "Sam",
          consensus: "yes",
          available: [],
          responseId: null,
          note: null,
          locationSuggestion: null,
          timeSuggestions: [],
          ...payload,
        },
      ],
    )
  ).rows[0]!.id;
}
async function reload(rally: Rally) {
  return (
    await db.query<Rally>("SELECT * FROM public.rallies WHERE id = $1", [
      rally.id,
    ])
  ).rows[0]!;
}
async function candidates(rally: Rally) {
  return (
    await db.query<{ id: string }>(
      "SELECT id FROM public.rally_candidates WHERE rally_id = $1 ORDER BY position",
      [rally.id],
    )
  ).rows;
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);`);
  await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [
    organizer,
    otherOrganizer,
  ]);
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (name.endsWith("_rally_lifecycle.sql")) {
      for (const status of [
        "collecting",
        "choosing_location",
        "expired",
        "draft",
        "confirmed",
      ]) {
        await db.query(
          `INSERT INTO public.rallies (activity, time_mode, starts_at, location_mode, location,
          status, invite_token, creator_token, expires_at) VALUES ($1, 'specific', $2, 'specific', 'Park', $1, $3, $4, $5)`,
          [
            status,
            status === "confirmed" ? "2000-01-01" : future,
            token(),
            token(),
            status === "expired" ? "2000-01-01" : later,
          ],
        );
      }
      await db.query(
        `INSERT INTO public.rallies (activity, time_mode, starts_at, location_mode, location,
        status, invite_token, creator_token, expires_at)
        VALUES ('manually closed', 'specific', $1, 'specific', 'Park', 'expired', $2, $3, $4)`,
        [future, token(), token(), later],
      );
    }
    await db.exec(await readFile(new URL(name, folder), "utf8"));
  }
  await db.exec("SET ROLE service_role");
});
afterAll(() => db.close());

describe("canonical lifecycle and ownership", () => {
  it("migrates legacy states without losing expiry or automatically confirming", async () => {
    const { rows } = await db.query<{
      activity: string;
      status: string;
      next_action: string;
    }>(
      "SELECT activity, status, next_action FROM public.rallies ORDER BY activity",
    );
    expect(rows).toEqual([
      {
        activity: "choosing_location",
        status: "open",
        next_action: "waiting_for_responses",
      },
      {
        activity: "collecting",
        status: "open",
        next_action: "waiting_for_responses",
      },
      { activity: "confirmed", status: "completed", next_action: "none" },
      { activity: "draft", status: "draft", next_action: "none" },
      { activity: "expired", status: "open", next_action: "finalize" },
      { activity: "manually closed", status: "open", next_action: "finalize" },
    ]);
    const publication = await db.query<{
      activity: string;
      published: boolean;
      keeps_created_at: boolean;
    }>(
      `SELECT activity, published_at IS NOT NULL AS published,
        published_at = created_at AS keeps_created_at FROM public.rallies ORDER BY activity`,
    );
    expect(
      publication.rows.find((rally) => rally.activity === "draft")?.published,
    ).toBe(false);
    expect(
      publication.rows
        .filter((rally) => rally.activity !== "draft")
        .every((rally) => rally.published && rally.keeps_created_at),
    ).toBe(true);
  });

  it("preserves both elapsed deadlines and early manual response closure during migration", async () => {
    const { rows } = await db.query<Rally & { activity: string }>(
      "SELECT * FROM public.rallies WHERE activity IN ('expired', 'manually closed') ORDER BY activity",
    );
    const expired = rows[0]!;
    const manuallyClosed = rows[1]!;
    expect(new Date(expired.expires_at).toISOString()).toBe(
      "2000-01-01T00:00:00.000Z",
    );
    expect(new Date(manuallyClosed.expires_at).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    await expect(respond(expired)).rejects.toThrow(/expired/);
    await expect(respond(manuallyClosed)).rejects.toThrow(/expired/);
    expect(
      (
        await manage(
          manuallyClosed,
          { action: "confirm" },
          null,
          manuallyClosed.creator_token,
        )
      ).status,
    ).toBe("confirmed");
  });

  it("assigns authenticated creations immediately to their organizer", async () => {
    const rally = await create();
    expect(rally).toMatchObject({
      user_id: organizer,
      status: "open",
      next_action: "waiting_for_responses",
    });
    expect(rally.published_at).not.toBeNull();
    expect(
      (
        await db.query(
          "SELECT id FROM public.rallies WHERE user_id = $1 AND id = $2",
          [organizer, rally.id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("saves incomplete drafts and atomically validates them before publishing", async () => {
    let rally = await create({
      status: "draft",
      activity: "",
      startsAt: null,
      location: null,
    });
    expect(rally).toMatchObject({
      status: "draft",
      next_action: "none",
      published_at: null,
    });
    await expect(respond(rally)).rejects.toThrow(/not accepting responses/);
    await expect(manage(rally, { action: "confirm" })).rejects.toThrow(
      /Publish this draft/,
    );
    await expect(
      manage(rally, { action: "publish", activity: "Picnic" }),
    ).rejects.toThrow(/future time/);
    expect((await reload(rally)).status).toBe("draft");
    expect((await reload(rally)).published_at).toBeNull();
    await db.query(
      "UPDATE public.rallies SET expires_at = '2000-01-01' WHERE id = $1",
      [rally.id],
    );
    rally = await manage(rally, {
      action: "publish",
      activity: "Picnic",
      startsAt: future,
      location: "Park",
    });
    expect(rally.status).toBe("open");
    expect(rally.published_at).not.toBeNull();
    expect(new Date(rally.expires_at).getTime()).toBeGreaterThan(Date.now());
    await expect(
      manage(rally, { action: "save", activity: "Different question" }),
    ).rejects.toThrow(/Only drafts/);
  });

  it("keeps a cancelled or archived unpublished draft private", async () => {
    let rally = await create({
      status: "draft",
      activity: "",
      startsAt: null,
      location: null,
    });
    rally = await manage(rally, { action: "archive" });
    expect(rally.published_at).toBeNull();
    rally = await manage(rally, { action: "unarchive" });
    expect(rally.published_at).toBeNull();
    rally = await manage(rally, { action: "cancel" });
    expect(rally).toMatchObject({
      status: "cancelled",
      published_at: null,
      next_action: "none",
    });
    await expect(respond(rally)).rejects.toThrow(/not accepting responses/);
    await expect(manage(rally, { action: "publish" })).rejects.toThrow(
      /already closed/,
    );
    expect((await reload(rally)).published_at).toBeNull();
  });

  it.each([
    { activity: " " },
    { startsAt: null },
    { startsAt: "2000-01-01" },
    { location: " " },
    { timeMode: "poll", candidates: [] },
    { timeMode: "poll", candidates: ["2000-01-01"] },
    { status: "confirmed" },
    { timeMode: "invalid" },
  ])("rejects incomplete or invalid open creation: %j", async (payload) => {
    await expect(create(payload)).rejects.toThrow();
  });

  it("requires account ownership even when another user knows the private creator link", async () => {
    const rally = await create();
    await expect(
      manage(rally, { action: "cancel" }, otherOrganizer, rally.creator_token),
    ).rejects.toThrow(/not available/);
    await expect(
      manage(rally, { action: "cancel" }, null, rally.creator_token),
    ).rejects.toThrow(/not available/);
    expect((await reload(rally)).status).toBe("open");
    expect((await manage(rally, { action: "cancel" })).status).toBe(
      "cancelled",
    );
  });

  it("keeps the private creator capability for anonymous website organizers", async () => {
    const rally = await create({}, null);
    await expect(
      manage(rally, { action: "confirm" }, organizer),
    ).rejects.toThrow(/not available/);
    await expect(
      manage(rally, { action: "confirm" }, null, token()),
    ).rejects.toThrow(/not available/);
    const confirmed = await manage(
      rally,
      { action: "confirm" },
      null,
      rally.creator_token,
    );
    expect(confirmed).toMatchObject({
      user_id: null,
      status: "confirmed",
      next_action: "none",
    });
  });

  it("allows confirmation only after an explicit organizer action and locks the plan", async () => {
    const rally = await create();
    await respond(rally);
    expect(await reload(rally)).toMatchObject({
      status: "open",
      next_action: "finalize",
    });
    const confirmed = await manage(rally, { action: "confirm" });
    expect(confirmed).toMatchObject({
      status: "confirmed",
      next_action: "none",
      final_location: "Central Park",
    });
    expect(confirmed.confirmed_at).not.toBeNull();
    expect(new Date(confirmed.final_time!).toISOString()).toBe(future);
    await expect(respond(rally, { name: "Pat" })).rejects.toThrow(
      /not accepting responses/,
    );
    await expect(
      manage(rally, { finalLocation: "Another place" }),
    ).rejects.toThrow(/final plan cannot/);
    expect((await manage(rally, { action: "cancel" })).status).toBe(
      "cancelled",
    );
  });

  it.each(["open", "confirmed"])(
    "archives %s without changing public lifecycle",
    async (status) => {
      let rally = await create();
      if (status === "confirmed")
        rally = await manage(rally, { action: "confirm" });
      const archived = await manage(rally, { action: "archive" });
      expect(archived.status).toBe(status);
      expect(archived.published_at).toEqual(rally.published_at);
      expect(archived.archived_at).not.toBeNull();
      if (status === "open") {
        await respond(rally);
        expect((await reload(rally)).next_action).toBe("finalize");
      }
      expect(
        (await manage(rally, { action: "unarchive" })).archived_at,
      ).toBeNull();
    },
  );

  it("completes past events on refresh without a scheduler, preserving cancelled and draft states", async () => {
    const open = await create();
    const confirmed = await create();
    await manage(confirmed, { action: "confirm" });
    const cancelled = await create();
    await manage(cancelled, { action: "cancel" });
    const draft = await create({ status: "draft" });
    for (const rally of [open, confirmed, cancelled, draft]) {
      await db.query(
        "UPDATE public.rallies SET starts_at = '2000-01-01', final_time = '2000-01-01' WHERE id = $1",
        [rally.id],
      );
    }
    await db.query("SELECT public.refresh_rallies($1, NULL)", [organizer]);
    expect((await reload(open)).status).toBe("completed");
    expect((await reload(open)).confirmed_at).toBeNull();
    expect((await reload(confirmed)).status).toBe("completed");
    expect((await reload(confirmed)).confirmed_at).not.toBeNull();
    expect((await reload(cancelled)).status).toBe("cancelled");
    expect((await reload(draft)).status).toBe("draft");
    await expect(respond(open)).rejects.toThrow(/not accepting responses/);
    await expect(manage(open, { action: "cancel" })).rejects.toThrow(
      /completed Rally/,
    );
  });

  it("refreshes only the requested organizer and refuses an unscoped sweep", async () => {
    const other = await create({}, otherOrganizer);
    await db.query(
      "UPDATE public.rallies SET starts_at = '2000-01-01' WHERE id = $1",
      [other.id],
    );
    await db.query("SELECT public.refresh_rallies($1, NULL)", [organizer]);
    expect((await reload(other)).status).toBe("open");
    await expect(db.query("SELECT public.refresh_rallies()")).rejects.toThrow(
      /Rally or organizer/,
    );
    await db.query("SELECT public.refresh_rallies(NULL, $1)", [other.id]);
    expect((await reload(other)).status).toBe("completed");
  });
});

describe("decisions and anonymous responses", () => {
  it("flags unanswered polls once all time options have passed without inventing a final event date", async () => {
    const rally = await create({
      timeMode: "poll",
      candidates: [future, later],
    });
    await db.query(
      "UPDATE public.rally_candidates SET starts_at = '2000-01-01' WHERE rally_id = $1",
      [rally.id],
    );
    await db.query("SELECT public.refresh_rallies(NULL, $1)", [rally.id]);
    expect(await reload(rally)).toMatchObject({
      status: "open",
      next_action: "choose_time",
      confirmed_at: null,
      final_time: null,
    });
    const other = await create({
      timeMode: "poll",
      candidates: [future, later],
    });
    await db.query(
      "UPDATE public.rally_candidates SET starts_at = '2000-01-01' WHERE id = $1",
      [(await candidates(other))[0]!.id],
    );
    await db.query("SELECT public.refresh_rallies(NULL, $1)", [other.id]);
    expect((await reload(other)).next_action).toBe("waiting_for_responses");
  });

  it("flags the time decision when nobody can attend a fixed time, until the organizer chooses", async () => {
    const rally = await create();
    await respond(rally, { consensus: "no" });
    await respond(rally, {
      name: "Pat",
      consensus: "another_day",
      timeSuggestions: [later],
    });
    expect((await reload(rally)).next_action).toBe("choose_time");
    expect((await manage(rally, { finalTime: later })).next_action).toBe(
      "finalize",
    );
    expect((await reload(rally)).confirmed_at).toBeNull();
    const mixed = await create();
    await respond(mixed, { consensus: "another_day" });
    await respond(mixed, { name: "Pat", consensus: "yes" });
    expect((await reload(mixed)).next_action).toBe("finalize");
  });
  it.each([
    ["specific", "specific", "finalize"],
    ["specific", "open", "choose_location"],
    ["poll", "specific", "choose_time"],
    ["poll", "open", "choose_time"],
  ])(
    "recommends the next decision for %s timing / %s location",
    async (timeMode, locationMode, action) => {
      const rally = await create({
        timeMode,
        locationMode,
        candidates: timeMode === "poll" ? [future, later] : [],
      });
      expect(rally.next_action).toBe("waiting_for_responses");
      const available =
        timeMode === "poll" ? [(await candidates(rally))[0]!.id] : [];
      await respond(rally, {
        consensus: timeMode === "poll" ? "some_work" : "yes",
        available,
      });
      expect(await reload(rally)).toMatchObject({
        status: "open",
        next_action: action,
      });
    },
  );

  it("advances from time to location to finalize while requiring an explicit confirmation", async () => {
    const rally = await create({
      timeMode: "poll",
      locationMode: "open",
      candidates: [future, later],
    });
    await respond(rally, {
      consensus: "none_work",
      timeSuggestions: [later],
      locationSuggestion: "Cafe",
    });
    expect((await reload(rally)).next_action).toBe("choose_time");
    await expect(manage(rally, { action: "confirm" })).rejects.toThrow(
      /future final time/,
    );
    expect((await manage(rally, { finalTime: later })).next_action).toBe(
      "choose_location",
    );
    await expect(manage(rally, { action: "confirm" })).rejects.toThrow(
      /final location/,
    );
    await expect(
      manage(rally, { finalTime: "2000-01-01", finalLocation: "Cafe" }),
    ).rejects.toThrow(/future final time/);
    expect((await manage(rally, { finalLocation: "Cafe" })).next_action).toBe(
      "finalize",
    );
    expect((await reload(rally)).status).toBe("open");
    expect((await manage(rally, { action: "confirm" })).status).toBe(
      "confirmed",
    );
  });

  it("closes expired response links but leaves the organizer able to finalize", async () => {
    const rally = await create();
    await db.query(
      "UPDATE public.rallies SET expires_at = '2000-01-01' WHERE id = $1",
      [rally.id],
    );
    await db.query("SELECT public.refresh_rallies(NULL, $1)", [rally.id]);
    expect(await reload(rally)).toMatchObject({
      status: "open",
      next_action: "finalize",
    });
    await expect(respond(rally)).rejects.toThrow(/expired/);
    expect((await manage(rally, { action: "confirm" })).status).toBe(
      "confirmed",
    );
  });

  it("requires the private response ID to edit; matching a name grants no authority", async () => {
    const rally = await create();
    const responseId = await respond(rally, { note: "Original" });
    await expect(respond(rally, { note: "Overwrite" })).rejects.toThrow(
      /name is already used/,
    );
    await expect(respond(rally, { responseId: randomUUID() })).rejects.toThrow(
      /saved response/,
    );
    const other = await create();
    await expect(respond(other, { responseId })).rejects.toThrow(
      /saved response/,
    );
    expect(
      await respond(rally, { responseId, note: "Edited", consensus: "no" }),
    ).toBe(responseId);
    expect(
      (
        await db.query<{ note: string; consensus: string }>(
          "SELECT note, consensus FROM public.responses WHERE id = $1",
          [responseId],
        )
      ).rows[0],
    ).toEqual({ note: "Edited", consensus: "no" });
  });

  it("rejects another Rally's candidates instead of accepting partial or misleading votes", async () => {
    const rally = await create({ timeMode: "poll", candidates: [future] });
    const other = await create({ timeMode: "poll", candidates: [later] });
    await expect(
      respond(rally, {
        consensus: "some_work",
        available: [(await candidates(other))[0]!.id],
      }),
    ).rejects.toThrow(/does not belong/);
    expect(
      (
        await db.query("SELECT id FROM public.responses WHERE rally_id = $1", [
          rally.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect((await reload(rally)).next_action).toBe("waiting_for_responses");
  });

  it("replaces edited votes and suggestions without accumulating stale data", async () => {
    const rally = await create({
      timeMode: "poll",
      locationMode: "open",
      candidates: [future, later],
    });
    const options = await candidates(rally);
    const responseId = await respond(rally, {
      consensus: "some_work",
      available: [options[0]!.id],
      locationSuggestion: "Park",
      timeSuggestions: [later],
    });
    await respond(rally, {
      responseId,
      consensus: "some_work",
      available: [options[1]!.id],
      locationSuggestion: "Cafe",
    });
    expect(
      (
        await db.query<{ candidate_id: string }>(
          "SELECT candidate_id FROM public.response_candidates WHERE response_id = $1",
          [responseId],
        )
      ).rows,
    ).toEqual([{ candidate_id: options[1]!.id }]);
    expect(
      (
        await db.query<{ text: string }>(
          "SELECT text FROM public.location_suggestions WHERE response_id = $1",
          [responseId],
        )
      ).rows,
    ).toEqual([{ text: "Cafe" }]);
    expect(
      (
        await db.query(
          "SELECT id FROM public.time_suggestions WHERE response_id = $1",
          [responseId],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("rolls back all creation data when a child write fails", async () => {
    await db.exec(`RESET ROLE;
      CREATE FUNCTION public.fail_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected child failure'; END $$;
      CREATE TRIGGER fail_candidate BEFORE INSERT ON public.rally_candidates FOR EACH ROW EXECUTE FUNCTION public.fail_test_write();
      SET ROLE service_role;`);
    const before = (await db.query("SELECT id FROM public.rallies")).rows
      .length;
    try {
      await expect(
        create({ timeMode: "poll", candidates: [future] }),
      ).rejects.toThrow(/Injected child failure/);
      expect(
        (await db.query("SELECT id FROM public.rallies")).rows,
      ).toHaveLength(before);
    } finally {
      await db.exec(
        "RESET ROLE; DROP TRIGGER fail_candidate ON public.rally_candidates; SET ROLE service_role;",
      );
    }
  });

  it("rolls back response edits, votes, and recommendations when a later child write fails", async () => {
    const rally = await create({
      timeMode: "poll",
      locationMode: "open",
      candidates: [future, later],
    });
    const options = await candidates(rally);
    const responseId = await respond(rally, {
      consensus: "some_work",
      available: [options[0]!.id],
      note: "Original",
    });
    await db.exec(`RESET ROLE;
      CREATE TRIGGER fail_suggestion BEFORE INSERT ON public.location_suggestions FOR EACH ROW EXECUTE FUNCTION public.fail_test_write();
      SET ROLE service_role;`);
    try {
      await expect(
        respond(rally, {
          responseId,
          consensus: "some_work",
          available: [options[1]!.id],
          note: "Changed",
          locationSuggestion: "Cafe",
        }),
      ).rejects.toThrow(/Injected child failure/);
      expect(
        (
          await db.query<{ note: string }>(
            "SELECT note FROM public.responses WHERE id = $1",
            [responseId],
          )
        ).rows[0]?.note,
      ).toBe("Original");
      expect(
        (
          await db.query<{ candidate_id: string }>(
            "SELECT candidate_id FROM public.response_candidates WHERE response_id = $1",
            [responseId],
          )
        ).rows,
      ).toEqual([{ candidate_id: options[0]!.id }]);
    } finally {
      await db.exec(
        "RESET ROLE; DROP TRIGGER fail_suggestion ON public.location_suggestions; DROP FUNCTION public.fail_test_write(); SET ROLE service_role;",
      );
    }
  });

  it("serializes queued confirmations and responses around a locked parent", async () => {
    // PGlite has one connection; this verifies ordered transaction behavior.
    // Real parallel PostgreSQL sessions are also checked during deployment.
    const first = await create();
    const outcomes = await Promise.allSettled([
      manage(first, { action: "confirm" }),
      respond(first),
    ]);
    expect(outcomes.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(
      (
        await db.query("SELECT id FROM public.responses WHERE rally_id = $1", [
          first.id,
        ])
      ).rows,
    ).toHaveLength(0);
    const second = await create();
    await Promise.all([respond(second), manage(second, { action: "confirm" })]);
    expect(await reload(second)).toMatchObject({
      status: "confirmed",
      next_action: "none",
    });
    expect(
      (
        await db.query("SELECT id FROM public.responses WHERE rally_id = $1", [
          second.id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
});

describe("service-only database boundary", () => {
  it.each(["anon", "authenticated"])(
    "denies %s every privileged lifecycle RPC",
    async (role) => {
      await db.exec(`RESET ROLE; SET ROLE ${role}`);
      try {
        for (const sql of [
          "SELECT public.create_rally('{}', NULL, NULL, NULL)",
          "SELECT public.manage_rally(NULL, NULL, NULL, '{}')",
          "SELECT public.respond_to_rally(NULL, '{}')",
          "SELECT public.refresh_rallies(NULL, NULL)",
          "SELECT private.validate_rally_plan(NULL, NULL, false)",
        ])
          await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("RESET ROLE; SET ROLE service_role");
      }
    },
  );

  it("uses invoker privileges and an empty search path for lifecycle RPCs", async () => {
    const { rows } = await db.query<{
      prosecdef: boolean;
      proconfig: string[];
    }>(
      `SELECT prosecdef, proconfig FROM pg_proc WHERE pronamespace IN ('public'::regnamespace, 'private'::regnamespace)
       AND proname IN ('create_rally', 'manage_rally', 'respond_to_rally', 'refresh_rallies', 'validate_rally_plan')`,
    );
    expect(rows).toHaveLength(5);
    expect(
      rows.every(
        (row) => !row.prosecdef && row.proconfig.includes('search_path=""'),
      ),
    ).toBe(true);
  });
});

describe("Rally deletion", () => {
  it("deletes rally data atomically while preserving only link tombstones", async () => {
    const rally = await create({
      timeMode: "poll",
      startsAt: null,
      candidates: [future, later],
      locationMode: "open",
      location: null,
    });
    const options = await candidates(rally);
    await respond(rally, {
      consensus: "some_work",
      available: [options[0]!.id],
      locationSuggestion: "Park",
      timeSuggestions: [later],
    });
    const deleted = await db.query<{ deleted: boolean }>(
      "SELECT public.delete_rally($1,$2,$3) AS deleted",
      [rally.id, organizer, null],
    );
    expect(deleted.rows[0]?.deleted).toBe(true);
    expect(await reload(rally)).toBeUndefined();
    for (const table of [
      "responses",
      "rally_candidates",
      "location_suggestions",
      "time_suggestions",
    ]) {
      expect(
        (
          await db.query(`SELECT * FROM public.${table} WHERE rally_id = $1`, [
            rally.id,
          ])
        ).rows,
      ).toEqual([]);
    }
    expect(
      (
        await db.query(
          "SELECT invite_token, creator_token FROM public.deleted_rallies WHERE invite_token = $1",
          [rally.invite_token],
        )
      ).rows,
    ).toEqual([
      { invite_token: rally.invite_token, creator_token: rally.creator_token },
    ]);
    await expect(respond(rally)).rejects.toThrow();
  });
  it("requires the owner to delete saved rallies, even with the creator token", async () => {
    const rally = await create();
    for (const user of [otherOrganizer, null]) {
      const result = await db.query<{ deleted: boolean }>(
        "SELECT public.delete_rally($1,$2,$3) AS deleted",
        [rally.id, user, rally.creator_token],
      );
      expect(result.rows[0]?.deleted).toBe(false);
      expect(await reload(rally)).toBeDefined();
    }
  });
  it("allows anonymous deletion only with the matching private link", async () => {
    const rally = await create({}, null);
    const wrong = await db.query<{ deleted: boolean }>(
      "SELECT public.delete_rally($1,$2,$3) AS deleted",
      [rally.id, null, token()],
    );
    expect(wrong.rows[0]?.deleted).toBe(false);
    const right = await db.query<{ deleted: boolean }>(
      "SELECT public.delete_rally($1,$2,$3) AS deleted",
      [rally.id, null, rally.creator_token],
    );
    expect(right.rows[0]?.deleted).toBe(true);
  });
  it("keeps deletion records and the deletion RPC inaccessible to public roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query<{ readable: boolean; callable: boolean }>(
        "SELECT has_table_privilege($1, 'public.deleted_rallies', 'SELECT') AS readable, has_function_privilege($1, 'public.delete_rally(uuid,uuid,text)', 'EXECUTE') AS callable",
        [role],
      );
      expect(result.rows[0]).toEqual({ readable: false, callable: false });
    }
  });
});

describe("Rally timezone persistence", () => {
  it("preserves the organizer timezone through confirmation", async () => {
    const rally = await create({ timeZone: "America/New_York" });
    expect(rally.time_zone).toBe("America/New_York");
    expect(rally.starts_at?.toISOString()).toBe(future);
    const confirmed = await manage(rally, { action: "confirm" });
    expect(confirmed.time_zone).toBe("America/New_York");
  });
  it("supports older clients without guessing their timezone", async () => {
    expect((await create()).time_zone).toBeNull();
  });
  it("rejects invalid timezone names", async () => {
    await expect(create({ timeZone: "not/a-timezone" })).rejects.toThrow(
      "valid timezone",
    );
  });
});
