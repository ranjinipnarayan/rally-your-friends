import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyOgImage } from "../src/lib/og-proxy.server";
import {
  handleImage,
  type ImageRally,
} from "../supabase/functions/og-image/handler";

const token = "a".repeat(32);
const request = new Request(`https://rally.pages.dev/api/public/og/${token}`);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
afterEach(() => vi.restoreAllMocks());

describe("Pages image proxy", () => {
  it("serves cache hits without another renderer invocation", async () => {
    const fetcher = vi.fn();
    const cache = { match: vi.fn(async () => new Response(png)), put: vi.fn() };
    const response = await proxyOgImage(request, token, {
      supabaseUrl: "https://project.supabase.co",
      secret: "secret",
      fetcher,
      cache,
    });
    expect(response.status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forwards only the invite token and server secret, and caches PNG responses", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(png, {
          headers: { "Content-Type": "image/png", "X-Private": "hidden" },
        }),
    );
    const result = await proxyOgImage(request, token, {
      supabaseUrl: "https://project.supabase.co",
      secret: "secret",
      fetcher,
    });
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.href).toBe(
      `https://project.supabase.co/functions/v1/og-image?token=${token}`,
    );
    expect(options.redirect).toBe("manual");
    expect(options.headers).toEqual({ "X-Rally-Render-Secret": "secret" });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("max-age=300");
    expect(result.headers.has("X-Private")).toBe(false);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);
  });
  it.each(["", "../anything", "a".repeat(65)])(
    "does not fetch for invalid token %j",
    async (badToken) => {
      const fetcher = vi.fn();
      expect(
        (
          await proxyOgImage(request, badToken, {
            supabaseUrl: "https://project.supabase.co",
            secret: "secret",
            fetcher,
          })
        ).status,
      ).toBe(302);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "timeout", "redirect", "status", "html", "bad-png"])(
    "falls back without caching failures: %s",
    async (failure) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetcher = vi.fn(async () => {
        if (failure === "timeout") throw new Error("timeout");
        return new Response("not a PNG", {
          status: failure === "redirect" ? 302 : failure === "status" ? 503 : 200,
          headers: {
            "Content-Type": failure === "html" ? "text/html" : "image/png",
          },
        });
      });
      const result = await proxyOgImage(request, token, {
        supabaseUrl: "https://project.supabase.co",
        secret: failure === "missing" ? undefined : "secret",
        fetcher,
      });
      expect(result.status).toBe(302);
      expect(result.headers.get("location")).toBe(
        "https://rally.pages.dev/og.png",
      );
      expect(result.headers.get("cache-control")).toBe("no-store");
    },
  );
});

describe("renderer authentication and data boundaries", () => {
  const row: ImageRally = {
    activity: "Dinner",
    time_mode: "poll",
    starts_at: null,
    location: "Cafe",
    status: "open",
    final_time: null,
    final_location: null,
    rally_candidates: [{ id: "one" }, { id: "two" }],
  };
  const edgeRequest = (secret = "secret", inviteToken = token) =>
    new Request(
      `https://project.supabase.co/functions/v1/og-image?token=${inviteToken}`,
      { headers: { "X-Rally-Render-Secret": secret } },
    );
  it.each(["", "wrong"])(
    "rejects secret %j before accessing data",
    async (secret) => {
      const load = vi.fn();
      const render = vi.fn();
      expect(
        (
          await handleImage(edgeRequest(secret), {
            secret: "secret",
            load,
            render,
          })
        ).status,
      ).toBe(401);
      expect(load).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid tokens before accessing data", async () => {
    const load = vi.fn();
    expect(
      (
        await handleImage(edgeRequest("secret", "bad"), {
          secret: "secret",
          load,
          render: vi.fn(),
        })
      ).status,
    ).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });
  it("renders public details and reflects confirmation changes", async () => {
    const load = vi.fn(async () => row);
    const render = vi.fn(async () => new Response(png));
    await handleImage(edgeRequest(), { secret: "secret", load, render });
    expect(render).toHaveBeenLastCalledWith({
      activity: "Dinner",
      when: "2 times to pick from",
      where: "Cafe",
      confirmed: false,
    });
    load.mockResolvedValue({
      ...row,
      status: "confirmed",
      final_location: "Park",
    });
    await handleImage(edgeRequest(), { secret: "secret", load, render });
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: "Park", confirmed: true }),
    );
  });
  it("returns a fallback status for missing rallies and unformed plans", async () => {
    const render = vi.fn();
    for (const rally of [
      null,
      { ...row, location: null, rally_candidates: [] },
    ]) {
      expect(
        (
          await handleImage(edgeRequest(), {
            secret: "secret",
            load: async () => rally,
            render,
          })
        ).status,
      ).toBe(404);
    }
    expect(render).not.toHaveBeenCalled();
  });
});
