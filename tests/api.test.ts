import { beforeEach, describe, expect, it, vi } from "vitest";
import { RallyError } from "../src/lib/rally-error";

const service = vi.hoisted(() => ({
  createPlan: vi.fn(),
  deletePlan: vi.fn(),
  listPlans: vi.fn(),
  managePlan: vi.fn(),
  organizerView: vi.fn(),
  saveToAccount: vi.fn(),
}));
const auth = vi.hoisted(() => ({ requestUser: vi.fn() }));
vi.mock("../src/lib/rally.server", () => service);
vi.mock("../src/integrations/supabase/session.server", () => auth);
import { handleApi } from "../src/lib/api.server";

const id = "b4010717-dcf3-4a8c-a8c5-117028457074";
function request(
  path = "/rallies",
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://rally.example/api/v1${path}`, {
    method,
    headers: {
      Authorization: "Bearer test.token.value",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const input = {
  activity: "Dinner",
  timeMode: "specific",
  startsAt: "2099-01-01T19:00:00Z",
  locationMode: "open",
  location: null,
  candidates: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.requestUser.mockResolvedValue({
    id: "organizer",
    email: "organizer@example.com",
  });
  service.listPlans.mockResolvedValue({ rallies: [] });
  service.organizerView.mockResolvedValue({
    rally: { id, status: "open" },
    responses: [],
  });
});

describe("native organizer JSON API", () => {
  it("rejects new drafts even for signed-in organizers", async () => {
    const response = await handleApi(
      request("/rallies", "POST", { ...input, status: "draft" }),
    );
    expect(response.status).toBe(400);
    expect(service.createPlan).not.toHaveBeenCalled();
  });
  it.each(["archive", "unarchive"])(
    "rejects retired %s actions without deleting",
    async (action) => {
      const response = await handleApi(
        request(`/rallies/${id}`, "PATCH", { action }),
      );
      expect(response.status).toBe(400);
      expect(service.managePlan).not.toHaveBeenCalled();
      expect(service.deletePlan).not.toHaveBeenCalled();
    },
  );
  it("deletes only as the verified owner and returns an empty 204", async () => {
    const response = await handleApi(request(`/rallies/${id}`, "DELETE"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service.deletePlan).toHaveBeenCalledWith("organizer", { id });
    expect(service.organizerView).not.toHaveBeenCalled();
  });
  it("requires login for deleting and creating Rallies", async () => {
    auth.requestUser.mockRejectedValue(
      new RallyError("unauthorized", "Sign in", 401),
    );
    expect((await handleApi(request(`/rallies/${id}`, "DELETE"))).status).toBe(
      401,
    );
    expect((await handleApi(request("/rallies", "POST", input))).status).toBe(
      401,
    );
    expect(service.deletePlan).not.toHaveBeenCalled();
    expect(service.createPlan).not.toHaveBeenCalled();
  });
  it("does not reveal another account's deleted rally", async () => {
    service.deletePlan.mockRejectedValue(
      new RallyError("not_found", "Not found", 404),
    );
    expect((await handleApi(request(`/rallies/${id}`, "DELETE"))).status).toBe(
      404,
    );
  });
  it("requires authentication before a create reaches the backend", async () => {
    auth.requestUser.mockRejectedValue(
      new RallyError("unauthorized", "Sign in", 401),
    );
    const response = await handleApi(request("/rallies", "POST", input));
    expect(response.status).toBe(401);
    expect(service.createPlan).not.toHaveBeenCalled();
  });
  it("saves under the verified organizer and returns a public URL", async () => {
    service.createPlan.mockResolvedValue({
      id,
      publicUrl: "https://rally.example/r/token",
      title: "Dinner",
    });
    const response = await handleApi(request("/rallies", "POST", input));
    expect(response.status).toBe(201);
    expect(service.createPlan).toHaveBeenCalledWith(
      { ...input, status: "open" },
      "organizer",
    );
    expect(response.headers.get("location")).toBe(`/api/v1/rallies/${id}`);
    expect((await response.json()).publicUrl).toBe(
      "https://rally.example/r/token",
    );
  });
  it("lists and reads only through the verified organizer identity", async () => {
    await handleApi(request());
    await handleApi(request(`/rallies/${id}`));
    expect(service.listPlans).toHaveBeenCalledWith("organizer");
    expect(service.organizerView).toHaveBeenCalledWith("organizer", { id });
  });
  it("rejects caller-supplied owners and direct lifecycle assignment", async () => {
    expect(
      (
        await handleApi(
          request("/rallies", "POST", { ...input, userId: "victim" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleApi(
          request(`/rallies/${id}`, "PATCH", { status: "confirmed" }),
        )
      ).status,
    ).toBe(400);
    expect(service.createPlan).not.toHaveBeenCalled();
    expect(service.managePlan).not.toHaveBeenCalled();
  });
  it("rejects the deprecated cancel action before calling the service", async () => {
    const response = await handleApi(
      request(`/rallies/${id}`, "PATCH", { action: "cancel" }),
    );
    expect(response.status).toBe(400);
    expect(service.managePlan).not.toHaveBeenCalled();
  });
  it("uses an explicit action and returns the refreshed organizer view", async () => {
    const response = await handleApi(
      request(`/rallies/${id}`, "PATCH", { action: "confirm" }),
    );
    expect(response.status).toBe(200);
    expect(service.managePlan).toHaveBeenCalledWith(
      "organizer",
      { id },
      { action: "confirm" },
    );
    expect(service.organizerView).toHaveBeenCalledAfter(service.managePlan);
  });
  it("returns 404 for another organizer's rally without disclosing its data", async () => {
    service.organizerView.mockResolvedValue({ rally: null });
    expect((await handleApi(request(`/rallies/${id}`))).status).toBe(404);
  });
  it("never caches account responses or enables cross-origin browser access", async () => {
    const response = await handleApi(request("/me"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({
      user: { id: "organizer", email: "organizer@example.com" },
    });
  });
  it.each(["not-json", "{unfinished"])(
    "rejects malformed JSON %s",
    async (body) => {
      expect((await handleApi(request("/rallies", "POST", body))).status).toBe(
        400,
      );
      expect(service.createPlan).not.toHaveBeenCalled();
    },
  );
  it("rejects form posts, oversized bodies, unsupported methods and invalid IDs", async () => {
    expect(
      (
        await handleApi(
          request("/rallies", "POST", input, { "Content-Type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
    expect(
      (await handleApi(request("/rallies", "POST", "x".repeat(20_000)))).status,
    ).toBe(413);
    expect((await handleApi(request("/rallies", "DELETE"))).status).toBe(405);
    expect((await handleApi(request("/rallies/not-an-id"))).status).toBe(400);
    expect((await handleApi(request("/missing"))).status).toBe(404);
  });
  it("does not expose unexpected internal errors", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    service.listPlans.mockRejectedValue(new Error("secret database details"));
    const response = await handleApi(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    logging.mockRestore();
  });
});

describe("guest API", () => {
  function guest(
    path = "/rallies",
    method = "GET",
    body?: unknown,
    token?: string,
    ip = "guest-test",
  ) {
    const req = request(path, method, body, { "CF-Connecting-IP": ip });
    req.headers.delete("authorization");
    if (token) req.headers.set("X-Rally-Creator-Token", token);
    auth.requestUser.mockImplementation(async (_req, required) => {
      if (required) throw new RallyError("unauthorized", "Sign in", 401);
      return null;
    });
    return req;
  }
  it("creates anonymously with exactly the share and management fields", async () => {
    const created = {
      id,
      title: "Dinner",
      publicUrl: "https://rally.example/r/invite",
      creatorToken: "secret",
    };
    service.createPlan.mockResolvedValue({ ...created, inviteToken: "invite" });
    const response = await handleApi(guest("/rallies", "POST", input));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    expect(service.createPlan).toHaveBeenCalledWith(
      { ...input, status: "open" },
      null,
    );
  });
  it.each(["GET", "PATCH", "DELETE"])(
    "manages guests with a rally-bound token via %s",
    async (method) => {
      const response = await handleApi(
        guest(
          `/rallies/${id}`,
          method,
          method === "PATCH" ? { action: "confirm" } : undefined,
          "secret",
        ),
      );
      expect(response.status).toBe(method === "DELETE" ? 204 : 200);
      const fn =
        method === "DELETE"
          ? service.deletePlan
          : method === "PATCH"
            ? service.managePlan
            : service.organizerView;
      expect(fn.mock.calls[0]!.slice(0, 2)).toEqual([
        null,
        { creatorToken: "secret", expectedId: id },
      ]);
    },
  );
  it.each(["/me", "/rallies", `/rallies/${id}/claim`])(
    "requires account authentication for %s",
    async (path) => {
      expect(
        (
          await handleApi(
            guest(
              path,
              path.endsWith("claim") ? "POST" : "GET",
              undefined,
              "secret",
            ),
          )
        ).status,
      ).toBe(401);
      expect(service.saveToAccount).not.toHaveBeenCalled();
    },
  );
  it("claims using both credentials and the exact rally ID", async () => {
    service.saveToAccount.mockResolvedValue({ saved: true });
    const response = await handleApi(
      request(`/rallies/${id}/claim`, "POST", undefined, {
        "X-Rally-Creator-Token": "secret",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
    expect(service.saveToAccount).toHaveBeenCalledWith(
      "secret",
      "organizer",
      id,
    );
    expect(
      (await handleApi(request(`/rallies/${id}/claim`, "POST"))).status,
    ).toBe(401);
  });
  it("limits anonymous creation before calling the database", async () => {
    service.createPlan.mockResolvedValue({ id });
    for (let i = 0; i < 10; i++)
      expect(
        (
          await handleApi(
            guest("/rallies", "POST", input, undefined, "rate-test"),
          )
        ).status,
      ).toBe(201);
    expect(
      (
        await handleApi(
          guest("/rallies", "POST", input, undefined, "rate-test"),
        )
      ).status,
    ).toBe(429);
    expect(service.createPlan).toHaveBeenCalledTimes(10);
  });
});
