import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPlaces } from "../src/lib/places.server";

afterEach(() => vi.restoreAllMocks());

describe("autocomplete budget", () => {
  it.each(["", "ab", "  a "])(
    "does not reserve or fetch for short input %j",
    async (query) => {
      const reserve = vi.fn();
      const fetcher = vi.fn();
      expect(
        await lookupPlaces(query, { apiKey: "key", reserve, fetcher }),
      ).toEqual({ suggestions: [] });
      expect(reserve).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("does not reserve without a Google key", async () => {
    const reserve = vi.fn();
    await lookupPlaces("Boston", { apiKey: undefined, reserve });
    expect(reserve).not.toHaveBeenCalled();
  });
  it.each([false, "error"])(
    "fails closed when reservation returns %s",
    async (result) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetcher = vi.fn();
      const reserve = vi.fn(async () => {
        if (result === "error") throw new Error("database unavailable");
        return false;
      });
      expect(
        await lookupPlaces("Boston", { apiKey: "key", reserve, fetcher }),
      ).toEqual({ suggestions: [] });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("reserves before the only outgoing request and maps results", async () => {
    const calls: string[] = [];
    const reserve = async () => {
      calls.push("reserve");
      return true;
    };
    const fetcher = vi.fn(async () => {
      calls.push("fetch");
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              structuredFormat: {
                mainText: { text: "Cafe" },
                secondaryText: { text: "Boston" },
              },
            },
          },
          { queryPrediction: {} },
          { placePrediction: { text: { text: "Park" } } },
        ],
      });
    });
    expect(
      await lookupPlaces("  Boston  ", { apiKey: "key", reserve, fetcher }),
    ).toEqual({
      suggestions: [{ label: "Cafe", secondary: "Boston" }, { label: "Park" }],
    });
    expect(calls).toEqual(["reserve", "fetch"]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:autocomplete",
      expect.objectContaining({
        body: JSON.stringify({ input: "Boston" }),
        redirect: "manual",
        headers: {
          "X-Goog-Api-Key": "key",
          "Content-Type": "application/json",
        },
      }),
    );
  });
  it.each([302, 429, 500, "network", "malformed"])(
    "does not retry or refund failure %s",
    async (failure) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const reserve = vi.fn(async () => true);
      const fetcher = vi.fn(async () => {
        if (failure === "network") throw new Error("offline");
        return new Response(
          failure === "malformed" ? "invalid json" : "error",
          { status: typeof failure === "number" ? failure : 200 },
        );
      });
      expect(
        await lookupPlaces("Boston", { apiKey: "key", reserve, fetcher }),
      ).toEqual({ suggestions: [] });
      expect(reserve).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});
