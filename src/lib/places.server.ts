export type PlaceSuggestion = { label: string; secondary?: string };

type PlacesDependencies = {
  apiKey: string | undefined;
  reserve: () => Promise<boolean>;
  fetcher?: typeof fetch;
};

export async function lookupPlaces(
  query: string,
  { apiKey, reserve, fetcher = fetch }: PlacesDependencies,
) {
  const empty = { suggestions: [] as PlaceSuggestion[] };
  const input = query.trim().slice(0, 120);
  if (input.length < 3 || !apiKey) return empty;
  try {
    // Fail closed. Reservations are never refunded, even for network failures.
    if (!(await reserve())) return empty;
    const response = await fetcher(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      },
    );
    if (!response.ok) {
      console.error(`Places autocomplete failed [${response.status}]`);
      return empty;
    }
    const json = (await response.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
          text?: { text?: string };
        };
      }>;
    };
    const suggestions = (json.suggestions ?? [])
      .flatMap((s): PlaceSuggestion[] => {
        const p = s.placePrediction;
        const label = p?.structuredFormat?.mainText?.text ?? p?.text?.text;
        if (!label) return [];
        const secondary = p?.structuredFormat?.secondaryText?.text;
        return [secondary ? { label, secondary } : { label }];
      })
      .slice(0, 5);
    return { suggestions };
  } catch {
    console.error("Places autocomplete unavailable");
    return empty;
  }
}

export type CalendarPlace = {
  address: string;
  latitude: number;
  longitude: number;
};

/** Resolve only an unambiguous venue, within the shared Places request budget. */
export async function lookupCalendarPlace(
  query: string,
  { apiKey, reserve, fetcher = fetch }: PlacesDependencies,
): Promise<CalendarPlace | CalendarPlace[] | null> {
  const textQuery = query.trim().slice(0, 200);
  if (textQuery.length < 3 || !apiKey) return null;
  try {
    if (!(await reserve())) return null;
    const response = await fetcher(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.formattedAddress,places.location,nextPageToken",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ textQuery, pageSize: 2 }),
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      },
    );
    if (!response.ok) return null;
    const result = (await response.json()) as {
      nextPageToken?: string;
      places?: Array<{
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };
    if (result.nextPageToken || !result.places?.length) return null;
    const places: CalendarPlace[] = [];
    for (const place of result.places) {
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (
        !place.formattedAddress ||
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return null;
      places.push({ address: place.formattedAddress, latitude, longitude });
    }
    return places.length === 1 ? places[0]! : places;
  } catch {
    return null;
  }
}
