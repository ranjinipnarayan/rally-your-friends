# Renderer verification

The Edge Function has its own Deno dependency graph and lockfile. Type-check with:

```sh
deno check --config supabase/functions/og-image/deno.json supabase/functions/og-image/index.ts
deno test --allow-read --allow-env=NODE_ENV,JEST_WORKER_ID --config supabase/functions/og-image/deno.json supabase/functions/og-image/render_test.ts
```

`npm test` covers the renderer's request authentication and mapping independently
of Deno. The Deno test below actually creates cold/warm PNGs using the bundled
fonts. Hosted Edge Runtime resource limits must also be checked after deployment.
