# Rally development

Rally runs on Cloudflare Pages and Supabase. Keep deployments on free plans.
Never rewrite published Git history (force pushes, rebases, amends, or squashes).
Keep the deployment branch working. Do not commit credentials.
Use npm; run typecheck, lint, tests, and the production build before shipping.
Server secrets must never be exposed through VITE_ variables.
