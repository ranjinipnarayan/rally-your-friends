import { createClient } from "@supabase/supabase-js";
import { handleImage, type ImageRally } from "./handler.ts";
import { renderCard } from "./render.ts";

Deno.serve((request: Request) =>
  handleImage(request, {
    secret: Deno.env.get("OG_RENDER_SECRET"),
    load: async (token: string) => {
      const db = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const { data, error } = await db
        .from("rallies")
        .select(
          "activity,time_mode,starts_at,location,status,final_time,final_location,rally_candidates(id)",
        )
        .eq("invite_token", token)
        .maybeSingle();
      if (error) throw error;
      return data as ImageRally | null;
    },
    render: renderCard,
  }),
);
