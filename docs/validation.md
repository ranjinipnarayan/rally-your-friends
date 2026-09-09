# Release validation

## Repeatable local checks

Use Node 22.14+ and the committed npm lockfile:

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

The tests cover server session verification, the organizer JSON API, transactional
creation/management/replies, account/capability authorization, publication privacy,
five lifecycle states, separate next actions, and account sections. Database tests
apply all five migrations to embedded Postgres and verify service-only grants.
They also cover the shared Google quota, failed reservations, upstream failures,
and no retries. Image tests cover authentication, lifecycle mapping, unpublished
draft privacy, caching, and fallback. Deno renders real 1200×630 PNGs with the
bundled fonts for Open, Confirmed, Cancelled, and Completed.

Embedded Postgres serializes work through one connection. It cannot establish
behavior under independent hosted connections; verify those separately. HTTP
smoke checks exercise routes, static images, fallback, server-function transport,
CSRF, and input validation. They do not replace interactive browser checks or
hosted CPU measurements.

## Recorded evidence — 2026-09-08

The lifecycle migration is applied as `20260908232741_rally_lifecycle`; all five
local migration versions match Supabase's remote history. The Pages release is
[`8c43be91`](https://8c43be91.rally-your-friends.pages.dev), and the updated
Supabase `og-image` function is active. The Cloudflare API reports the apex and
`www` domains Active and the DNS zone on Free. Native identifiers have since been
supplied; see the native callback verification below.

Local validation passed: type checking, lint, all **115 Vitest tests** (including
31 image tests), the production build, Deno type checking, and one Deno test
rendering real PNGs across all four public lifecycle statuses. Clean npm
installation and lockfile validation passed earlier during this setup. HTTP
runtime/CSRF smoke checks also passed. No dependencies were installed for native
targets.

The lifecycle acceptance matrix passed against both **local Pages with the
hosted Supabase database** and the **production Pages deployment**, using
temporary accounts and Rallies:

- All four combinations of specific/poll timing and specific/open location.
- Immediate account ownership for native API and signed-in web creation, plus
  anonymous website creation and private creator-link management.
- Two-account isolation, including denied access through another organizer's
  Rally ID or creator link.
- Private drafts and cancelled unpublished drafts; successful publication before
  a reserved public URL becomes usable.
- Anonymous replies, edits, availability, and time/location suggestions;
  recommended actions progress through time, location, and finalization.
- Explicit confirmation locks a final plan, produces share text, and closes
  replies; cancellation, archive/unarchive, post-expiry finalization, and
  Completed/Past behavior work through the backend.
- Real concurrent hosted requests: eight replies, a reply/confirmation race,
  and a single winner when two accounts claim an anonymous Rally.
- Public SSR includes confirmed details and the Maps link while omitting private
  organizer/response data. Open public questions keep their original time/place.

Temporary accounts and Rallies were deleted after both runs. These checks
exercise the shared database, production website API, web server functions, and
public SSR; they do not exercise native code or interactive browser controls.
The `www` host also returned the expected 401 for an unauthenticated `/api/v1/me`.

The deployed image function passed authenticated cold/warm 1200×630 PNG checks,
and production Pages passed proxy, five-minute cache, and updated confirmed-image
checks. The resulting PNG was visually inspected. Image-test data was cleaned
up. Scanning generated assets for the actual configured private key values found
none.

Cloudflare's production tail recorded 96 requests, all with execution outcome
`ok`. CPU samples for this release were:

| Request group | Count | Median CPU | Maximum CPU | Samples above 10 ms |
| --- | ---: | ---: | ---: | ---: |
| Web server functions | 65 | 2 ms | 15 ms | 3 |
| Native organizer API | 25 | 4 ms | 19 ms | 2 |
| Rendered pages | 2 | 33 ms | 37 ms | 2 |
| Image proxy | 4 | 4 ms | 9 ms | 0 |

Some successful requests exceeded the nominal Free 10 ms CPU budget. This small
sample does not prove compatibility under every cold-start condition, and an
earlier deployment had a 55 ms cold homepage sample. No paid upgrade was enabled;
continue measuring errors and CPU as usage changes.

Supabase security advisors report the expected informational RLS-without-policies
findings for server-only tables, plus a warning that leaked-password protection
is disabled. Rally's implemented login uses email magic links. No paid feature
was enabled to clear that password warning.

Earlier live integration evidence remains relevant:

- Resend SMTP sends as `help@rally-your-friends.com`, with the configured four
  sign-in emails/hour limit. The user confirmed receipt and successful sign-in
  from the one authorized test email. No further email was sent for this release.
- Google Places autocomplete returned five suggestions for a live query and
  consumed one shared database reservation. The encrypted key was absent from
  build artifacts. Google-side key restrictions were not independently verified.
- Both upstream integrations use
  `redirect: "manual"` because the deployed Cloudflare runtime rejects
  `redirect: "error"`; redirects do not forward the internal credentials.

## Remaining verification and release checks

Run these against the actual production host after any functional deployment:

- Repeat the lifecycle/account-isolation acceptance checks above using temporary
  test data and clean it up afterward. Confirm native API and web flows see the
  same organizer records and final state.
- Check personalized PNGs directly and through Pages: cold/warm rendering,
  five-minute caching, changed-state images, and static fallback on invalid
  tokens or renderer failure. Unpublished drafts must remain private.
- Inspect the generated browser assets for private keys and confirm requests use
  only the configured services. Metadata and returned share URLs must use the
  canonical site URL.
- Measure hosted cold/warm SSR, API/server-function CPU, and renderer resources.
  Keep the providers on Free; temporary service limits must not trigger upgrades.
  Never reset production's Google quota counter to simulate exhaustion.
- Exercise the preserved creation, recipient, and organizer screens in a browser:
  edit and submit forms, confirm a plan, refresh Needs You/Active/Past, switch
  accounts, and inspect final Maps/calendar/share actions.

Interactive UI verification has not been completed in this environment: no
connected browser was available, and permission for isolated Chrome testing was
declined. Automated HTTP and database results do not prove rendered interactions.

The exact native callback `com.example.RallyMessages://auth/callback` was added
to Supabase's redirect allowlist and verified by rereading the hosted Auth
configuration. Existing web redirects, Site URL, Resend SMTP settings, email
templates, and send limits were preserved. Email login remains enabled and
Apple login disabled. Native identifiers are recorded in
[native-integration.md](native-integration.md).

A generated, unsent magic link for a temporary account redirected to the exact
native callback with a valid session. That session authenticated the same user
through the production `/api/v1/me` endpoint. The session was revoked and the
temporary user removed; no email was sent. This checks Supabase's redirect and
the API session, not iOS URL handling, shared Keychain access, or Messages.

Native callback handling, App Group/shared Keychain sessions, the logged-out
extension prompt, native screens, and inserting messages are implemented in the
[native repository](https://github.com/ranjinipnarayan/rally) reviewed at `a14f9e9`.
They still need signed-device verification. Its existing Swift integration
checks passed locally using mocked HTTP responses. See
[native-integration.md](native-integration.md) for the contract and native
acceptance checks; website tests do not establish those device behaviors.

## Native client against production — 2026-09-09

Compiled the native repository's actual `RallyAPI` and `RallyAccountAPI` clients
at `a14f9e9` into a temporary macOS test runner and used a temporary authenticated
account against `https://rally-your-friends.com/api/v1`. All four timing/location
combinations passed creation, immediate organizer-list visibility, detail
decoding, public-page rendering, saving final choices, explicit confirmation,
Maps/final-message fields, cancellation, and archiving. Private draft creation,
Needs You placement, updating/publishing the same draft ID, and Active/Past
grouping also passed.

The test session was revoked, all five test rallies and the temporary account
were removed, and cleanup was verified. No email was sent. This proves the native
HTTP clients interoperate with the deployed backend; it does not exercise native
UI, PKCE on-device, Keychain entitlements, or the Messages insertion API.

## Deletion, drafts, and management links — 2026-09-09

Applied `20260909193502_rally_deletion` and deployed Pages release
[`80ee4052`](https://80ee4052.rally-your-friends.pages.dev). Type checking, lint,
all 123 tests, and the production build passed. The deletion tests cover owner
and anonymous-capability authorization, cascading removal, minimal deleted-link
records, and public-role denial. Anonymous draft creation is rejected before
database access. Generated build artifacts contain none of the configured
privileged environment values.

Live temporary-account checks passed authenticated draft creation, anonymous
draft rejection through both API and website server functions, cross-account and
unauthenticated deletion rejection, owner API/web deletion, disappearance from
My Rallies, deleted attendee-page HTML, deleted management-view data, rejection
of late replies, and removal of related database rows. Temporary users, sessions,
rallies, and deleted-link test records were cleaned up without sending email.

Both apex and `www` serve the association JSON with HTTP 200 and no redirect.
App-first management links additionally require the native Associated Domains
entitlements and URL handler described in the native integration guide; this
website deployment alone does not activate those native capabilities. The new
draft-login UI, delete confirmation, and app-installed/app-absent link behavior
still need interactive device/browser checks.

## Email codes — September 9, 2026

Supabase's Magic Link and Confirm signup templates now include both the code and
existing confirmation URL. Read-back verification confirmed both templates and
subjects, with SMTP, redirect URLs, send/verification limits, eight-digit length,
and one-hour expiry preserved.

Live verification used unsent admin-generated credentials and independent Auth
clients: new-account and existing-account email codes established sessions accepted
by production `/api/v1/me`; incorrect and reused codes were rejected. A separate
magic link still signed in on the website, after which its code was rejected as
used. Temporary sessions were revoked and accounts removed. No test email was
sent. Website browser interaction and the native code-entry screen still need
device verification. Typecheck, lint, 127 tests, and production build passed.
Cloudflare runtime HTTP smoke checks passed, and browser assets contained none
of the configured privileged keys.

## Archiving retired — September 9, 2026

Removed Archive/Unarchive controls and archived labels. Website and REST input
validation reject archive actions; deletion remains the explicit DELETE operation.
Previously archived plans are listed by lifecycle and next action, and the
deprecated `archivedAt` response field is always null for existing clients.
Historical migration fields remain in the database without affecting the app;
no existing Rally is deleted by this change. Tests cover archive rejection without
mutation and all lifecycle sections for previously archived plans. Typecheck,
lint, all 130 tests, and the production build passed.
