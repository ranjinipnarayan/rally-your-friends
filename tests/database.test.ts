import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);`);
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(name, folder), "utf8"));
  }
});
afterAll(() => db.close());

describe("fresh database migrations", () => {
  it("creates all six application tables with RLS", async () => {
    const { rows } = await db.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
    );
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("reserves exactly 150 of 200 concurrent attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        db.query<{ allowed: boolean }>(
          "SELECT public.reserve_places_request() AS allowed",
        ),
      ),
    );
    expect(results.filter((r) => r.rows[0]?.allowed)).toHaveLength(150);
    expect(
      (
        await db.query<{ requests: number }>(
          "SELECT requests FROM private.places_request_budget",
        )
      ).rows[0]?.requests,
    ).toBe(150);
  });
  it("keeps previous-day usage separate from today's allowance", async () => {
    await db.exec(`UPDATE private.places_request_budget SET day = day - 1`);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT public.reserve_places_request() AS allowed",
        )
      ).rows[0]?.allowed,
    ).toBe(true);
    const { rows } = await db.query<{ requests: number }>(
      "SELECT requests FROM private.places_request_budget ORDER BY day",
    );
    expect(rows.map((r) => r.requests)).toEqual([150, 1]);
  });
  it.each(["anon", "authenticated"])(
    "denies %s reservation and counter access",
    async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query("SELECT public.reserve_places_request()"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT * FROM private.places_request_budget"),
        ).rejects.toThrow(/permission denied/);
        await expect(db.query("SELECT * FROM public.rallies")).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    },
  );
  it("allows the service role to reserve without granting direct counter access", async () => {
    await db.exec("SET ROLE service_role");
    try {
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT public.reserve_places_request() AS allowed",
          )
        ).rows[0]?.allowed,
      ).toBe(true);
      await expect(
        db.query("UPDATE private.places_request_budget SET requests = 1"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
