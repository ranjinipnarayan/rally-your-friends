import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export type { PlaceSuggestion } from "./places.server";

export const suggestPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { lookupPlaces } = await import("./places.server");
    return lookupPlaces(data.query, {
      apiKey: process.env["GOOGLE_MAPS_API_KEY"],
      reserve: async () => {
        const { supabaseAdmin } =
          await import("@/integrations/supabase/client.server");
        const { data: allowed, error } = await supabaseAdmin.rpc(
          "reserve_places_request",
        );
        if (error) throw new Error("Autocomplete budget unavailable");
        return allowed === true;
      },
    });
  });
