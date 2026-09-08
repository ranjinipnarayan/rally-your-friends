import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/og/$inviteToken")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { proxyOgImage } = await import("@/lib/og-proxy.server");
        return proxyOgImage(request, params.inviteToken, {
          supabaseUrl: process.env["SUPABASE_URL"],
          secret: process.env["OG_RENDER_SECRET"],
          cache: (
            globalThis.caches as
              (CacheStorage & { default?: Cache }) | undefined
          )?.default,
        });
      },
    },
  },
});
