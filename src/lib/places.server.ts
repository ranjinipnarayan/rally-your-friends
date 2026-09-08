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
