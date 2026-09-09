import { expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: db,
}));
import { listPlans } from "../src/lib/rally.server";

it("restores previously archived plans to their lifecycle sections without deleting them", async () => {
  const rows = [
    { id: "draft", status: "draft", next_action: "none" },
    {
      id: "open-waiting",
      status: "open",
      next_action: "waiting_for_responses",
    },
    { id: "open-finalize", status: "open", next_action: "finalize" },
    { id: "confirmed", status: "confirmed", next_action: "none" },
    { id: "cancelled", status: "cancelled", next_action: "none" },
    { id: "completed", status: "completed", next_action: "none" },
  ].map((r) => ({
    ...r,
    archived_at: "2026-09-09T00:00:00Z",
    responses: [{ count: 2 }],
  }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  db.rpc.mockResolvedValue({ error: null });
  db.from.mockReturnValue(query);
  const { rallies } = await listPlans("owner");
  expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(
    rallies.map(({ id, section, archivedAt }) => ({ id, section, archivedAt })),
  ).toEqual([
    { id: "draft", section: "needs_you", archivedAt: null },
    { id: "open-waiting", section: "active", archivedAt: null },
    { id: "open-finalize", section: "needs_you", archivedAt: null },
    { id: "confirmed", section: "active", archivedAt: null },
    { id: "cancelled", section: "past", archivedAt: null },
    { id: "completed", section: "past", archivedAt: null },
  ]);
  expect(db.rpc).toHaveBeenCalledExactlyOnceWith("refresh_rallies", {
    p_user_id: "owner",
  });
});
