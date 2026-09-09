import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { proxyOgImage } from "../src/lib/og-proxy.server";
import {
  handleImage,
  loadImageRally,
  type ImageRally,
} from "../supabase/functions/og-image/handler";
import {
  ogCardTree,
  type OgCardData,
} from "../supabase/functions/og-image/og-card";

const token = "a".repeat(32);
const request = new Request(`https://rally.pages.dev/api/public/og/${token}`);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const row: ImageRally = {
  activity: "Dinner",
  time_mode: "poll",
  starts_at: null,
  location: "Cafe",
  status: "open",
  published_at: "2026-09-08T20:00:00.000Z",
  final_time: null,
  final_location: null,
  expires_at: "2099-09-08T20:00:00.000Z",
  rally_candidates: [{ id: "one" }, { id: "two" }],
};
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
          status:
            failure === "redirect" ? 302 : failure === "status" ? 503 : 200,
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
      status: "open",
      responsesOpen: true,
    });
    load.mockResolvedValue({
      ...row,
      status: "confirmed",
      final_location: "Park",
    });
    await handleImage(edgeRequest(), { secret: "secret", load, render });
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: "Park",
        status: "confirmed",
        responsesOpen: false,
      }),
    );
  });
  it("returns a fallback status for missing rallies and unformed plans", async () => {
    const render = vi.fn();
    for (const rally of [
      null,
      { ...row, status: "draft" },
      { ...row, status: "cancelled", published_at: null },
      { ...row, status: "expired" },
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
  it.each(["cancelled", "completed"])(
    "shows %s instead of inviting responses or claiming confirmation",
    async (status) => {
      const render = vi.fn(async () => new Response(png));
      const response = await handleImage(edgeRequest(), {
        secret: "secret",
        load: async () => ({ ...row, status }),
        render,
      });
      expect(response.status).toBe(200);
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ status, responsesOpen: false }),
      );
    },
  );
  it("preserves the original poll question until the organizer confirms", async () => {
    const render = vi.fn(async (_card: OgCardData) => new Response(png));
    const tentative = {
      ...row,
      location: null,
      final_time: "2099-09-09T20:00:00.000Z",
      final_location: "Chosen park",
    };
    await handleImage(edgeRequest(), {
      secret: "secret",
      load: async () => tentative,
      render,
    });
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        when: "2 times to pick from",
        where: "Place TBD",
        status: "open",
      }),
    );
    await handleImage(edgeRequest(), {
      secret: "secret",
      load: async () => ({ ...tentative, status: "confirmed" }),
      render,
    });
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: "Chosen park",
        status: "confirmed",
      }),
    );
    expect(render.mock.calls[1]![0].when).not.toBe("2 times to pick from");
  });
  it("preserves a specific time and place when tentative choices differ", async () => {
    const render = vi.fn(async (_card: OgCardData) => new Response(png));
    const original = {
      ...row,
      time_mode: "specific",
      starts_at: "2099-09-08T20:00:00.000Z",
    };
    await handleImage(edgeRequest(), {
      secret: "secret",
      load: async () => original,
      render,
    });
    const originalCard = render.mock.calls[0]![0];
    await handleImage(edgeRequest(), {
      secret: "secret",
      load: async () => ({
        ...original,
        final_time: "2099-09-09T20:00:00.000Z",
        final_location: "Chosen park",
      }),
      render,
    });
    expect(render).toHaveBeenLastCalledWith(originalCard);
  });
  it("keeps an elapsed response deadline separate from lifecycle", async () => {
    const render = vi.fn(async () => new Response(png));
    await handleImage(edgeRequest(), {
      secret: "secret",
      load: async () => ({ ...row, expires_at: "2000-01-01T00:00:00.000Z" }),
      render,
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open", responsesOpen: false }),
    );
  });
});

describe("renderer database loading", () => {
  const rallyId = "da4e49db-97b1-4768-a12b-c1250ba9634c";
  function clientWithResponses(responses: Response[]) {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _options?: RequestInit) => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected database request");
        return response;
      },
    );
    return {
      fetcher,
      db: createClient("https://project.supabase.co", "test-service-key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetcher },
      }),
    };
  }

  it.each([
    { label: "missing", lookup: [] },
    {
      label: "draft",
      lookup: [{ id: rallyId, status: "draft", published_at: null }],
    },
    {
      label: "cancelled unpublished",
      lookup: [{ id: rallyId, status: "cancelled", published_at: null }],
    },
  ])(
    "does not refresh or load private details for a $label Rally",
    async ({ lookup }) => {
      const { db, fetcher } = clientWithResponses([Response.json(lookup)]);
      expect(await loadImageRally(token, db)).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      const url = new URL(String(fetcher.mock.calls[0]![0]));
      expect(url.searchParams.get("select")).toBe("id,status,published_at");
      expect(url.searchParams.get("invite_token")).toBe(`eq.${token}`);
    },
  );

  it("refreshes only the requested public Rally before reading its new lifecycle", async () => {
    const completed = { ...row, status: "completed" };
    const { db, fetcher } = clientWithResponses([
      Response.json([
        { id: rallyId, status: "open", published_at: row.published_at },
      ]),
      new Response(null, { status: 204 }),
      Response.json([completed]),
    ]);
    expect(await loadImageRally(token, db)).toEqual(completed);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [rpcUrl, rpcOptions] = fetcher.mock.calls[1]!;
    const [detailsUrl] = fetcher.mock.calls[2]!;
    expect(new URL(String(rpcUrl)).pathname).toBe(
      "/rest/v1/rpc/refresh_rallies",
    );
    expect(rpcOptions?.method).toBe("POST");
    expect(JSON.parse(String(rpcOptions?.body))).toEqual({
      p_rally_id: rallyId,
    });
    const details = new URL(String(detailsUrl));
    expect(details.searchParams.get("id")).toBe(`eq.${rallyId}`);
    expect(details.searchParams.get("status")).toBe("neq.draft");
    expect(details.searchParams.get("published_at")).toBe("not.is.null");
    expect(details.searchParams.get("select")).toBe(
      "activity,time_mode,starts_at,location,status,published_at,final_time,final_location,expires_at,rally_candidates(id)",
    );
  });

  it("fails closed when the lifecycle refresh fails", async () => {
    const { db, fetcher } = clientWithResponses([
      Response.json([
        { id: rallyId, status: "open", published_at: row.published_at },
      ]),
      Response.json({ message: "Unavailable", code: "P0001" }, { status: 400 }),
    ]);
    await expect(loadImageRally(token, db)).rejects.toMatchObject({
      message: "Unavailable",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("share-image lifecycle copy", () => {
  const card: OgCardData = {
    activity: "Dinner",
    when: "Saturday at 7 PM",
    where: "Cafe",
    status: "open",
    responsesOpen: true,
  };
  it.each([
    ["open", "OPEN", "Tap to vote!"],
    ["confirmed", "CONFIRMED", "Tap to see the confirmed plan"],
    ["cancelled", "CANCELLED", "The organizer cancelled this Rally"],
    ["completed", "COMPLETED", "This event has passed"],
  ] as const)("labels %s accurately", (status, badge, footer) => {
    const tree = JSON.stringify(ogCardTree({ ...card, status }));
    expect(tree).toContain(badge);
    expect(tree).toContain(footer);
    if (status === "cancelled" || status === "completed") {
      expect(tree).not.toContain("confirmed plan");
      expect(tree).not.toContain("Tap to vote!");
    }
  });
  it("does not invite responses after the response deadline", () => {
    const tree = JSON.stringify(ogCardTree({ ...card, responsesOpen: false }));
    expect(tree).toContain("OPEN");
    expect(tree).toContain("Responses are closed");
    expect(tree).not.toContain("Tap to vote!");
  });
});
