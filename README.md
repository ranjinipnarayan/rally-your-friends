# Rally

Make a plan, share a link, and collect replies. React + TanStack Start runs on
Cloudflare Pages Functions; Supabase provides Postgres, authentication, and the
personalized share-image renderer.

## Local development

Use Node 22.14+ (Node 22 is recorded in `.nvmrc`) and npm. No paid services are
needed for local checks.

```sh
npm ci
cp .env.example .env
# Fill in the public settings and local server credentials.
npm run dev
```

The dev site runs at http://localhost:3000. `VITE_` values are public and embedded
at build time. Runtime keys are loaded locally from `.env`; they must be configured
separately in Cloudflare for deployment. Never place an admin/secret key in a
`VITE_` variable. Use the publishable or legacy anon key for public settings.

```sh
npm run typecheck
npm run lint
npm test
npm run build
cp .dev.vars.example .dev.vars
# Fill in local Wrangler runtime credentials.
npm run preview
```

Wrangler previews the real Pages bundle at http://localhost:8788. The build requires
`VITE_SITE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
Lint checks correctness; `npm run format` handles formatting separately.
See [deployment setup](docs/deployment.md) and [validation checklist](docs/validation.md).

## Architecture and free-plan behavior

- Pages serves assets and runs server rendering, rally server functions, and the
  image proxy. The build emits `dist/_worker.js/` plus public assets.
- All rally database access stays server-side. Public invite links and private
  creator links retain their existing behavior. RLS blocks direct browser access.
- Google Places autocomplete has a shared, database-enforced 150-request UTC-day
  limit. Missing credentials, failed reservations, and exhausted quotas leave a
  plain-text location field. Failed requests count; no automatic retries.
- Email magic links use Supabase Auth with Resend Free SMTP and a domain you own.
- Personalized PNGs render in a secret-protected Supabase Edge Function using
  bundled fonts. Pages caches successful images for five minutes; failures fall
  back to `/og.png` without caching the redirect.
- Supabase Free can pause after one week of inactivity. Quota exhaustion can
  interrupt functionality. There are no automatic upgrades or keep-alive jobs.

The target is $0 in ongoing service fees under current provider allowances.
Existing domain renewal costs are separate. Google requires billing enabled;
its dedicated key must not be reused by another application. Deployment setup
includes quota controls and instructions to avoid paid plans.
