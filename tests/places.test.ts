import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPlaces, lookupCalendarPlace } from "../src/lib/places.server";

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

describe("calendar venue lookup", () => {
  it("reserves one request and returns coordinates for one matching venue", async () => {
    const reserve = vi.fn(async () => true);
    const fetcher = vi.fn(async () =>
      Response.json({
        places: [
          {
            formattedAddress: "123 Main Street",
            location: { latitude: 40.7, longitude: -74 },
          },
        ],
      }),
    );
    expect(
      await lookupCalendarPlace("Venue, New York", {
        apiKey: "key",
        reserve,
        fetcher,
      }),
    ).toEqual({ address: "123 Main Street", latitude: 40.7, longitude: -74 });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { places: [] },
    { places: [{}, {}] },
    { places: [{ formattedAddress: "Unknown" }] },
    {
      places: [
        { formattedAddress: "Bad", location: { latitude: 91, longitude: 0 } },
      ],
    },
    { places: [{}], nextPageToken: "more" },
  ])(
    "does not invent a location for ambiguous or invalid results: %j",
    async (result) => {
      expect(
        await lookupCalendarPlace("Venue", {
          apiKey: "key",
          reserve: async () => true,
          fetcher: async () => Response.json(result),
        }),
      ).toBeNull();
    },
  );
  it("returns both map pins for the user to choose when a venue is ambiguous", async () => {
    const places = [
      {
        formattedAddress: "New York",
        location: { latitude: 40.7, longitude: -74 },
      },
      {
        formattedAddress: "Paris",
        location: { latitude: 48.8, longitude: 2.3 },
      },
    ];
    expect(
      await lookupCalendarPlace("Le Vin", {
        apiKey: "key",
        reserve: async () => true,
        fetcher: async () => Response.json({ places }),
      }),
    ).toEqual([
      { address: "New York", latitude: 40.7, longitude: -74 },
      { address: "Paris", latitude: 48.8, longitude: 2.3 },
    ]);
  });
  it("does not request coordinates when the budget is exhausted", async () => {
    const fetcher = vi.fn();
    expect(
      await lookupCalendarPlace("Venue", {
        apiKey: "key",
        reserve: async () => false,
        fetcher,
      }),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps export available if Google fails", async () => {
    expect(
      await lookupCalendarPlace("Venue", {
        apiKey: "key",
        reserve: async () => true,
        fetcher: async () => {
          throw new Error("offline");
        },
      }),
    ).toBeNull();
  });
});
