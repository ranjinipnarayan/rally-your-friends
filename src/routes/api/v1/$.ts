import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleApi } = await import("@/lib/api.server");
        return handleApi(request);
      },
    },
  },
});
