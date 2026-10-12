import { beforeEach, expect, it, vi } from "vitest";
const admin = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: admin,
}));
import {
  deletePlan,
  managePlan,
  organizerView,
  saveToAccount,
} from "../src/lib/rally.server";
const id = "b4010717-dcf3-4a8c-a8c5-117028457074";
let query: Record<
  "select" | "eq" | "is" | "update" | "maybeSingle",
  ReturnType<typeof vi.fn>
>;
beforeEach(() => {
  vi.resetAllMocks();
  query = Object.fromEntries(
    ["select", "eq", "is", "update", "maybeSingle"].map((key) => [
      key,
      vi.fn(),
    ]),
  ) as typeof query;
  for (const fn of Object.values(query)) fn.mockReturnValue(query);
  admin.from.mockReturnValue(query);
});
it.each(["read", "patch", "delete", "claim"])(
  "rejects a valid token for a different rally before %s",
  async (action) => {
    query.maybeSingle.mockResolvedValue({
      data: { id: "other-rally", creator_token: "secret", user_id: null },
      error: null,
    });
    const lookup = { creatorToken: "secret", expectedId: id };
    const call =
      action === "read"
        ? organizerView(null, lookup)
        : action === "patch"
          ? managePlan(null, lookup, { action: "confirm" })
          : action === "delete"
            ? deletePlan(null, lookup)
            : saveToAccount("secret", "owner", id);
    await expect(call).rejects.toMatchObject({ status: 404 });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  },
);
it.each(["read", "patch", "delete", "claim"])(
  "rejects unknown tokens for %s",
  async (action) => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const lookup = { creatorToken: "wrong", expectedId: id };
    await expect(
      action === "read"
        ? organizerView(null, lookup)
        : action === "patch"
          ? managePlan(null, lookup, { action: "confirm" })
          : action === "delete"
            ? deletePlan(null, lookup)
            : saveToAccount("wrong", "owner", id),
    ).rejects.toMatchObject({ status: 404 });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  },
);
it("keeps claimed rallies protected by account ownership", async () => {
  query.maybeSingle.mockResolvedValue({
    data: { id, creator_token: "secret", user_id: "owner" },
    error: null,
  });
  await expect(
    deletePlan(null, { creatorToken: "secret", expectedId: id }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(saveToAccount("secret", "other", id)).rejects.toMatchObject({
    status: 409,
  });
  expect(await saveToAccount("secret", "owner", id)).toEqual({ saved: true });
  expect(query.update).not.toHaveBeenCalled();
});
it("claims an anonymous rally with a compare-and-set update", async () => {
  query.maybeSingle.mockResolvedValue({
    data: { id, user_id: null },
    error: null,
  });
  query.select.mockImplementation((columns: string) =>
    columns === "id" ? Promise.resolve({ data: [{ id }], error: null }) : query,
  );
  expect(await saveToAccount("secret", "owner", id)).toEqual({ saved: true });
  expect(query.update).toHaveBeenCalledWith({ user_id: "owner" });
  expect(query.is).toHaveBeenCalledWith("user_id", null);
});
