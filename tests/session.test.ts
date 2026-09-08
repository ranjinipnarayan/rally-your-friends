import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../src/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
import { requestUser } from "../src/integrations/supabase/session.server";

const user = { id: "verified-organizer", email: "organizer@example.com" };
const token = "test.access.token";

function request(authorization?: string) {
  return new Request("https://rally.example/api/v1/me", {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  admin.auth.getUser.mockResolvedValue({ data: { user }, error: null });
});

describe("backend session verification", () => {
  it("permits an absent session only for explicitly optional website requests", async () => {
    expect(await requestUser(request(), false)).toBeNull();
    expect(await requestUser(request(""), false)).toBeNull();
    expect(admin.auth.getUser).not.toHaveBeenCalled();
    await expect(requestUser(request())).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    await expect(requestUser(request(""))).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(admin.auth.getUser).not.toHaveBeenCalled();
  });

  it.each(["Basic test.access.token", "Bearer", "Bearer token", "Bearer a.b", "Bearer a.b.c.d", "Bearer a.b.c extra"])(
    "rejects malformed authorization %j even when a session is optional",
    async (authorization) => {
      await expect(requestUser(request(authorization))).rejects.toMatchObject({ code: "unauthorized", status: 401 });
      await expect(requestUser(request(authorization), false)).rejects.toMatchObject({ code: "unauthorized", status: 401 });
      expect(admin.auth.getUser).not.toHaveBeenCalled();
    },
  );

  it("validates the supplied bearer token with Supabase Auth before returning its user", async () => {
    expect(await requestUser(request(`bEaReR ${token}`))).toEqual(user);
    expect(admin.auth.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: { user: null }, error: { message: "JWT expired" } },
    { data: { user: null }, error: { message: "User from token no longer exists" } },
    { data: { user: null }, error: null },
    { data: { user }, error: { message: "Auth failed" } },
  ])("rejects failed verification without falling back to an anonymous request", async (result) => {
    admin.auth.getUser.mockResolvedValue(result);
    await expect(requestUser(request(`Bearer ${token}`), false)).rejects.toMatchObject({
      code: "unauthorized", status: 401, message: "Your session has expired. Please sign in again.",
    });
    expect(admin.auth.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("uses the Auth user's ID instead of caller claims or editable metadata", async () => {
    const payload = Buffer.from(JSON.stringify({ sub: "claimed-owner", user_metadata: { userId: "claimed-owner" } })).toString("base64url");
    const claimedToken = `header.${payload}.signature`;
    admin.auth.getUser.mockResolvedValue({
      data: { user: { ...user, user_metadata: { userId: "claimed-owner", role: "admin" } } }, error: null,
    });
    const verified = await requestUser(request(`Bearer ${claimedToken}`));
    expect(verified?.id).toBe(user.id);
    expect(admin.auth.getUser).toHaveBeenCalledExactlyOnceWith(claimedToken);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("does not accept a token when the Auth service is unavailable", async () => {
    admin.auth.getUser.mockRejectedValue(new Error("Auth network unavailable"));
    await expect(requestUser(request(`Bearer ${token}`), false)).rejects.toThrow("Auth network unavailable");
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
