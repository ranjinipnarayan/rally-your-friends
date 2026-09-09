import { createFileRoute } from "@tanstack/react-router";
import { appAssociation } from "@/lib/native-links";

export const Route = createFileRoute("/.well-known/apple-app-site-association")(
  {
    server: {
      handlers: {
        GET: () =>
          Response.json(appAssociation, {
            headers: { "Cache-Control": "public, max-age=3600" },
          }),
      },
    },
  },
);
