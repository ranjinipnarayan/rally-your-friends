import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: db,
}));
import { createPlan } from "../src/lib/rally.server";

it("rejects anonymous draft creation before calling the database", async () => {
  await expect(
    createPlan(
      {
        status: "draft",
        activity: "",
        timeMode: "poll",
        startsAt: null,
        candidates: [],
        locationMode: "open",
        location: null,
      },
      null,
    ),
  ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  expect(db.rpc).not.toHaveBeenCalled();
});
