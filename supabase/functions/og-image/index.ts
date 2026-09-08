import { createClient } from "@supabase/supabase-js";
import { handleImage, loadImageRally } from "./handler.ts";
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
      return await loadImageRally(token, db);
    },
    render: renderCard,
  }),
);
