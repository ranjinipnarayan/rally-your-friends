# Deploy Rally on free plans

Use Node 22.14+ and the committed npm lockfile. Choose **Free** for Cloudflare,
Supabase, and Resend. Do not enable usage-based upgrades. Domain renewal is outside
the $0 service budget. Provider limits can change; review the linked pricing pages
before enabling the integrations.

## 1. Fresh Supabase database

For a new installation, create a project in a **Free organization** in your own
Supabase account. The running Rally deployment already has a database and users;
upgrade it in place with migrations rather than recreating or resetting it.
Record the project reference, project URL, publishable key, and server secret or
legacy service-role key. Never send privileged keys through chat or commit them.

Install/use the Supabase CLI, then:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

For a fresh project, the dry-run includes six migrations: the three application
migrations, the Places budget, `20260908232741_rally_lifecycle.sql`, and
`20260909193502_rally_deletion.sql`. Apply the deletion migration before deploying
the Pages version that exposes deletion and deleted-link pages. It adds the
service-only link records and an atomic, ownership-checked deletion RPC. For an
existing project, it should list only unapplied migrations. Apply the lifecycle
migration once **before** deploying this version of Pages and the image renderer.
It preserves existing data, replaces the older status values, and adds publication,
confirmation, archiving, and recommended-action fields plus transactional RPCs.
The local
`project_id = "rally"` is a development label, not a hosted project reference.

The six application tables remain protected by RLS. `private.places_request_budget`
is not exposed through the API. Table access and the lifecycle/quota RPCs are
server-only: their grants allow `service_role`, with no public RLS policies that
let clients bypass the website's verified-session and ownership checks. Native
clients use the website's `/api/v1` organizer API, not direct table or RPC access.
The backend refreshes lifecycle/action state during relevant reads and writes;
no scheduled keep-alive job is required.

To regenerate public schema types after future migrations:

```sh
npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
```

The current generator omits SQL input nullability. Preserve the five documented
`string | null` annotations in `Functions`: `create_rally.Args.p_user_id`,
`manage_rally.Args.p_user_id`, `manage_rally.Args.p_creator_token`,
`delete_rally.Args.p_user_id`, and `delete_rally.Args.p_creator_token`. They model
anonymous web creation and the mutually exclusive account/capability checks.
Run type checking after regeneration.

Keep production and preview pointing to the **same** Supabase project if they
share a Google API key. A separate counter in another project would not share the
150-request limit. Public previews use the same data; only share previews with
people you trust to create/edit test rallies.

## 2. Personalized image renderer

Generate a random secret locally (`openssl rand -hex 32`). Put it in an ignored
file `.env.og` as `OG_RENDER_SECRET=...`, then:

```sh
npx supabase secrets set --env-file .env.og
npx supabase functions deploy og-image
```

Deploy from the repository root so `supabase/config.toml` includes the bundled
fonts. JWT verification is disabled **only** for this function because it validates
`X-Rally-Render-Secret` before accessing the database or rendering. Supabase provides
the function's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

Put the identical `OG_RENDER_SECRET` in Cloudflare Pages runtime secrets. The
public `/api/public/og/:inviteToken` route proxies to this function and never exposes
the secret. It caches successful PNGs with Cloudflare's Cache API and HTTP cache
headers for five minutes. Invalid/missing rallies and rendering failures redirect
to the static Rally image with `Cache-Control: no-store`. Unpublished drafts,
including cancelled drafts, do not receive public personalized images. Public
images follow the shared lifecycle and keep the original question while Open.

Rotate the secret in Supabase and Pages together. A mismatch temporarily uses the
static fallback. Keep the Supabase Edge Function on its Free plan; check invocation,
CPU, and memory usage after the first real requests.

## 3. Google Places within its free allowance

Enable Places API (New) in a dedicated Google Cloud project with billing enabled.
Create a server-only key restricted to **Places API (New)**, used only by this app.
Configure it as `GOOGLE_MAPS_API_KEY` in Pages runtime secrets. Do not use browser
referrer restrictions for a server-side key or enable unrelated Maps APIs.

The current Autocomplete Requests SKU includes 10,000 free requests per month.
This app allows only 150 outbound attempts per UTC day, including failed requests,
across all deployments using the same database. It does not request Place Details
or start sessions that require a billable details call. Limits are hardcoded in SQL
and cannot be increased by a request parameter. Concurrent reservations use one
atomic upsert; database failure stops autocomplete calls. Reservation failures and
quota exhaustion return an empty suggestion list, so manual location entry works.

In Google Cloud, reduce the available autocomplete quotas and configure billing
alerts as an additional control. **Budget alerts do not stop spending.** Per-minute
quotas alone are not a monthly spending cap; keep the database reservation in place.
Do not share the key, reset today's counter, use it outside the app, or point a
deployment at a different database. Remove the Pages secret to disable autocomplete.

The private table stores counts only, not queries or locations. You can inspect
usage in Supabase SQL Editor:

```sql
select day, requests from private.places_request_budget order by day desc limit 7;
```

Reference: [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
and [API quotas](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

## 4. Free email magic links

Create a Resend **Free** account. Verify a sending domain/subdomain you own using
the exact SPF/DKIM DNS records Resend provides. Preserve existing mail records;
use a sending subdomain if necessary. No domain purchase is required if you already
own one, but its existing renewal cost still applies.

In Supabase Authentication → Email/SMTP, enable custom SMTP with:

| Setting     | Value                                     |
| ----------- | ----------------------------------------- |
| Host        | `smtp.resend.com`                         |
| Port        | `465`                                     |
| Username    | `resend`                                  |
| Password    | Resend sending API key                    |
| Sender      | `help@rally-your-friends.com` |
| Sender name | Rally                                     |

Keep the magic-link email template's confirmation URL. Set Supabase's **Site URL**
to `https://rally-your-friends.com`. Allow redirects for
`https://rally-your-friends.com/**`, `https://www.rally-your-friends.com/**`,
`https://rally-your-friends.pages.dev/**`, `http://localhost:3000/**`, and
`http://localhost:8788/**`. Add only preview URLs you actually use; avoid wildcards
covering every Pages project. Existing code redirects users back to the same
page where they requested sign-in.

Also allow the exact native callback `com.example.RallyMessages://auth/callback`.
It is configured in the hosted project; preserve the existing web redirects.
The API contract and work required in the separate iOS projects are documented in
[native-integration.md](native-integration.md).

Resend Free currently allows 3,000 emails/month and 100/day. Keep that account on
Free. This deployment caps Supabase Auth email sends at four per hour, with
a 60-second per-user cooldown. Limit errors and temporary
SMTP failures display a retry-later message. Do not use Supabase's default test mail
service as the public production sender.

References: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Resend SMTP](https://resend.com/docs/send-with-smtp),
[Resend Free](https://resend.com/docs/knowledge-base/what-is-resend-pricing).

## 5. Cloudflare Pages

Authenticate and create a direct-upload Pages project in your Cloudflare account:

```sh
npx wrangler login
npx wrangler pages project create rally-your-friends --production-branch main
```

If the name is unavailable, choose an available name and update `name` in
`wrangler.json`. Use the actual assigned Pages URL; the repository name does not
guarantee that address is available.

Set the following in `.env.production.local` for production builds (or the build
environment for CI). Keep `.env` set to localhost for development:

| Build setting                   | Value                            |
| ------------------------------- | -------------------------------- |
| `VITE_SITE_URL`                 | `https://rally-your-friends.com` |
| `VITE_SUPABASE_URL`             | New Supabase project URL         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | New public publishable/anon key  |

In Pages Settings → Variables and Secrets, configure production **and** preview:

| Runtime setting             | Value                                              |
| --------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`              | Same Supabase project URL                          |
| `SUPABASE_PUBLISHABLE_KEY`  | Same public key                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret or service-role key; encrypted       |
| `GOOGLE_MAPS_API_KEY`       | Dedicated Places key; encrypted                    |
| `OG_RENDER_SECRET`          | Same random secret as the Edge Function; encrypted |

The compatibility date and `nodejs_compat` flag are committed in Wrangler config.
The build generates a matching configuration inside `dist/_worker.js`. Upload
**the complete `dist` directory** using Wrangler, including its worker modules;
this is a full-stack Pages deployment, not a static-only dashboard upload.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run deploy -- --branch main
```

For direct upload, Cloudflare does not build the app or inject your local build
settings: the three `VITE_` values must exist **before** `npm run build`. Changing
them requires rebuilding. The script builds and then uploads `dist`. Runtime
secrets are configured separately as above.

Use `wrangler pages deployment tail DEPLOYMENT_URL --project-name rally-your-friends` for request logs
and the Cloudflare dashboard for CPU/errors. Check the actual production CPU
distribution on the Free plan; local wall-clock timings cannot prove that hosted
requests fit the free CPU budget. Do not upgrade to solve an unexplained failure.

Reference: [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Custom domain and mailbox

The production Pages project is `rally-your-friends`, with the fallback address
`https://rally-your-friends.pages.dev`. Both `rally-your-friends.com` and
`www.rally-your-friends.com` are active custom domains, verified through the
Cloudflare API on 2026-09-08. The build uses the apex domain for public links.

Cloudflare's zone is active on the Free plan, using `ada.ns.cloudflare.com` and
`miguel.ns.cloudflare.com`. The apex/www CNAMEs point to
`rally-your-friends.pages.dev`.
Existing MX, SPF, and DMARC records were preserved. Resend's
`resend._domainkey` TXT and DNS-only `send` CNAME were copied from the active DNS.
Preserve Northwest's mailbox records when making future DNS changes. Do not
replace the mailbox's MX record with Resend's sending-subdomain MX record.

`help@rally-your-friends.com` remains hosted by Northwest. The sending domain is
verified in Resend, and Supabase is configured to use that address. The user
confirmed receipt and successful sign-in from an authorized test email. Downloaded
calendar files list it as the contact; Rally does not send calendar invitations
by email or collect attendee email addresses.

## Recovery and ongoing operation

- Supabase Free may pause after one week of inactivity. Restore the project in
  the Supabase dashboard when needed. Do not schedule artificial keep-alive traffic.
- Keep manual exports in a secure location. For application data and schema, use
  `npx supabase db dump --linked --schema public,private -f /secure/path/schema.sql`
  and `npx supabase db dump --linked --schema public,private --data-only -f /secure/path/data.sql`.
  These require Docker and are **not** a full Auth-user backup; use Supabase's
  documented Auth migration/export process before any future account migration.
- Treat exports as private: they contain creator tokens and user-associated data.
  Never commit them or reset the usage counter during an active billing period.
- Roll back through Pages deployment history only to an application compatible
  with the current schema. Releases using the old lifecycle status values are
  not a safe rollback target after this migration. Do not rewrite published Git
  history or reset the database to roll back frontend code.
- No automatic service upgrades are configured. Free-tier exhaustion may mean
  waiting, resuming a paused project, or disabling an optional integration.

Reference: [Supabase Free limits](https://supabase.com/pricing).
