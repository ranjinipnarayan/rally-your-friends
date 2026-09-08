# Release validation

## Automated local checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
deno check --config supabase/functions/og-image/deno.json supabase/functions/og-image/index.ts
deno test --allow-read --allow-env=NODE_ENV,JEST_WORKER_ID --config supabase/functions/og-image/deno.json supabase/functions/og-image/render_test.ts
npm run preview
# In another terminal, while the preview is running:
npm run test:runtime
```

Tests apply all migrations to an embedded Postgres instance, check RLS/permissions,
exercise 200 queued concurrent quota attempts, test UTC-day separation, prove
autocomplete fails closed without retries, test renderer authentication/caching/
fallbacks, and check email error messages. The Deno test renders actual cold/warm
PNGs with bundled fonts and checks their dimensions and changing content.

Embedded Postgres serializes queries in one process; also exercise the quota
against concurrent connections to the hosted database before public launch. The
SQL's atomic upsert provides the cross-process synchronization.

## Hosted acceptance checks

These require the new Supabase project, configured authentication, and deployed
Pages/Edge Function. Do not mark them complete based only on mocked tests.

- Create a fixed-time rally, follow its invite in a separate browser, submit and
  edit a reply, then confirm the plan using the creator link.
- Create a poll with multiple times, select availability, suggest another time
  and location, and verify the creator sees the correct responses.
- Confirm invalid links show the existing invalid-link page. Set a test rally's
  expiry in the past and verify it stops accepting responses.
- Exercise Google autocomplete, then disable its key and verify plain-text entry
  still works. In a dedicated test environment, exhaust the quota and confirm no
  further Google calls occur. Never reset production counts to run this test.
- Request a real magic link, return to the original page, save a rally, refresh,
  and verify it appears in My Rallies. Log out and back in. With a second account,
  verify the first account's saved rallies are not listed and cannot be claimed.
- Load a personalized image through `/api/public/og/:token`. Verify a 1200×630 PNG,
  a five-minute cache lifetime, and the confirmed image after changing the plan.
  Check repeat requests reduce renderer invocations. Missing secrets, invalid
  tokens, and unavailable renderers must use `/og.png` without caching failures.
- Verify home/invite metadata uses the deployed Pages address. Confirm client
  assets contain no server keys and network requests use only the configured services.
- Check cold/warm SSR and server-function CPU usage in Cloudflare and renderer
  CPU/memory in Supabase. Check all three accounts remain on Free plans and the
  Google key is dedicated to this app with the shared reservation limit active.
- Record hosted test results and actual usage measurements before public launch.

No hosted account access or production resource measurements are implied by a
successful local build.

## Local implementation verification — 2026-09-08

- Clean npm install and final lockfile validation passed on Node 22.23.2.
- Type checking and production Pages build passed using the production domain and connected Supabase public config.
- 38 Vitest tests passed; Deno type checking and the actual PNG render test passed.
- HTTP smoke checks passed against Wrangler's local Pages runtime: page routes,
  static image, fallback redirect, server-function transport, CSRF, and validation.
- Lint has no errors or warnings; unused-variable checks are enabled.
- npm reported zero known vulnerabilities after updating Nitro and Wrangler.
- Source/config scans found no removed-platform references. A build with dummy
  server-secret canaries confirmed they were absent from both client and worker output.
- The confirmed PNG was visually inspected locally. No browser connection was
  available for interactive UI testing.
- Cloudflare Pages is deployed at `https://rally-your-friends.pages.dev`. Live HTTP
  route/static-image/CSRF/input-validation checks pass. Both custom domains are
  attached, pending nameserver activation.
- All four migrations are applied to Supabase project `ynfuafalrvgcszyxpguy`; local
  migration versions match the remote history. Security advisors report only the
  expected informational RLS-without-policies findings (server-only access).
- Live fixed-time and poll rally creation, reply editing, availability, time/location
  suggestions, confirmation, expiry, and authenticated saved-rally/account isolation
  checks passed. Temporary test accounts and rallies were deleted afterward.
- Auth redirects and Resend SMTP are configured for `help@rally-your-friends.com`,
  with four sign-in emails per hour. Supabase accepted one user-authorized test
  email; the user confirmed inbox receipt and successful sign-in.
- Supabase `og-image` is active. Direct cold/warm PNG checks and both local and hosted Pages
  proxy/cache/update checks passed. Cloudflare requires `redirect: "manual"`;
  both upstream integrations reject redirects without forwarding their secrets.
- Hosted homepage samples all succeeded. CPU was usually 4–8 ms, with one 11 ms
  sample and a cold 55 ms sample. These exceed the nominal Free 10 ms limit on
  some requests; no paid upgrade was enabled. Free-tier runtime compatibility
  under all cold-start conditions is not established.
- Google Places autocomplete is enabled with an encrypted server-only key in
  production and preview. A live Central Park query returned five suggestions;
  the shared database counter increased from 0 to 1. The key was absent from
  every build artifact. The 150-request daily limit and failure behavior remain
  covered by the tests. Google-side key restrictions were not independently verified.
- Cloudflare's Free DNS zone is prepared, including existing mailbox records and
  Resend's DKIM and sending CNAME. Registrar nameserver activation remains pending.
