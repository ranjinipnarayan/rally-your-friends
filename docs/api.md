# Rally API v1 — iMessage and iOS handoff

**Production base URL:** `https://rally-your-friends.com/api/v1`

Authentication is **email magic links only**: Supabase Auth creates/identifies the
user and sends the link through Resend SMTP as `help@rally-your-friends.com`.
There is no Sign in with Apple or other OAuth-provider flow. Email delivery and
web sign-in are configured. Native callback routing and shared session storage
still need implementation in the separate iOS projects; see
[native-integration.md](native-integration.md).

This is the shared backend for the website, organizer app, and thin structured
iMessage extension. The backend owns Rally state. The website also supports
anonymous creation and recipient replies; this organizer API always requires an
account.

## Extension flow

1. Read the containing app's shared authenticated session. If unavailable, show
   **“Open Rally to sign in.”** Do not fall back to anonymous API creation.
2. Preserve the structured activity, timing, and location choices. No
   natural-language parsing or contacts access is required.
3. POST a complete plan to `/rallies` with `status: "open"`.
4. After `201`, use the returned `title` and `publicUrl` as the message text:
   `title + "\n" + publicUrl`. The Rally already belongs to the organizer.
5. Insert that text in the current conversation with
   [MSConversation.insertText](https://developer.apple.com/documentation/messages/msconversation/inserttext%28_%3Acompletionhandler%3A%29).
   This fills the Messages input field; the user taps Send. Recipients need no
   extension or account.

Never insert `creatorToken`, a `/m/` URL, access tokens, or refresh tokens into a
conversation. Only share a published Rally; drafts reserve a URL without making
their page public.

## Requests and authentication

Send the **Supabase user access-token JWT** in every request:

```http
GET /api/v1/me HTTP/1.1
Host: rally-your-friends.com
Authorization: Bearer <USER_ACCESS_TOKEN>
Accept: application/json
```

The bearer value is not the Supabase publishable key, service-role key, Resend
key, or a creator token. Native apps use the project's public URL/key only with
the Supabase Auth SDK to obtain/refresh a session. The Rally API verifies that
session and derives ownership from the backend user; callers never supply an
owner ID. Refresh tokens go to Supabase Auth, not this API.

POST and PATCH require `Content-Type: application/json`. Maximum body size is
**16,384 bytes (16 KiB)**. JSON request names are camelCase; unknown fields are
rejected. This API does not authenticate cookies, grant browser CORS access, or
use the generated TanStack server-function protocol. Account responses have
`Cache-Control: private, no-store`.

Examples below use synthetic IDs/tokens and future dates, not real records.
Replace the bearer token and Rally IDs before use. Timestamps must be ISO 8601
with seconds and `Z` or an explicit UTC offset. Parse response timestamps with
or without fractional seconds, and display them in the user's time zone.

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| GET | `/me` | `200`, current backend user |
| GET | `/rallies` | `200`, all Rallies owned by that user |
| POST | `/rallies` | `201`, saved ID, title, tokens, public URL |
| GET | `/rallies/:id` | `200`, organizer detail and responses |
| PATCH | `/rallies/:id` | `200`, updated organizer detail and responses |

### GET /me

```json
{
  "user": {
    "id": "22222222-2222-4222-8222-222222222222",
    "email": "organizer@example.com"
  }
}
```

`email` may be null. The ID is the verified Supabase Auth user ID, not a separate
native profile. An invalid, expired, or deleted-user token returns 401.

### POST /rallies

All fields below are required except `status`, which defaults to `open`:

```http
POST /api/v1/rallies HTTP/1.1
Host: rally-your-friends.com
Authorization: Bearer <USER_ACCESS_TOKEN>
Content-Type: application/json

{
  "activity": "Dinner",
  "timeMode": "specific",
  "startsAt": "2099-07-10T19:00:00-04:00",
  "locationMode": "specific",
  "location": "Central Park, New York",
  "candidates": [],
  "status": "open"
}
```

| Field | Contract |
| --- | --- |
| `activity` | Trimmed string, up to 200 characters; nonblank for Open/publish. A draft may be blank. Use `Let's hang out` to match the website's unspecified activity. |
| `timeMode` | `specific` or `poll` |
| `startsAt` | Future ISO timestamp for an Open specific-time plan; null for a poll |
| `candidates` | Array of timestamps, maximum 10. An Open poll requires 1–10 future times; send `[]` for a specific time. |
| `locationMode` | `specific` or `open` |
| `location` | String up to 200 characters, nonblank for an Open specific location; null for open location |
| `status` | `draft` or `open`; direct creation as Confirmed is rejected |

All four timing/location branches are supported:

| Branch | `timeMode` / `startsAt` / `candidates` | `locationMode` / `location` |
| --- | --- | --- |
| Fixed time, fixed place | `specific` / future timestamp / `[]` | `specific` / place text |
| Fixed time, ask about place | `specific` / future timestamp / `[]` | `open` / null |
| Poll, fixed place | `poll` / null / future timestamps | `specific` / place text |
| Poll, ask about place | `poll` / null / future timestamps | `open` / null |

For example, the poll/open-location body is:

```json
{
  "activity": "Dinner",
  "timeMode": "poll",
  "startsAt": null,
  "locationMode": "open",
  "location": null,
  "candidates": ["2099-07-10T23:00:00Z", "2099-07-11T23:00:00Z"],
  "status": "open"
}
```

Convert the website's relative date-window/time-of-day choices into concrete
timestamps before submitting; the API does not accept labels such as “This
weekend.” See the native integration guide for matching those shortcuts.

Creation saves the plan and its poll candidates atomically, immediately under
the authenticated organizer. Response:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "inviteToken": "abcdefgh23456789abcdefgh23456789",
  "creatorToken": "qrstuvwx23456789qrstuvwx23456789",
  "publicUrl": "https://rally-your-friends.com/r/abcdefgh23456789abcdefgh23456789",
  "title": "Dinner"
}
```

The `Location` header is `/api/v1/rallies/11111111-1111-4111-8111-111111111111`.
Use the returned URL rather than building it locally. A draft returns this same
shape but its URL remains private until Publish. Cancelling or archiving an
unpublished draft does not publish it; inspect `rally.publishedAt` in detail.

### GET /rallies

Returns every owned Rally across web, app, and extension, newest first. There is
no pagination or filtering parameter in v1.

```json
{
  "rallies": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "creatorToken": "qrstuvwx23456789qrstuvwx23456789",
    "inviteToken": "abcdefgh23456789abcdefgh23456789",
    "publicUrl": "https://rally-your-friends.com/r/abcdefgh23456789abcdefgh23456789",
    "activity": "Dinner",
    "time": "2099-07-10T23:00:00+00:00",
    "location": "Central Park, New York",
    "status": "open",
    "nextAction": "finalize",
    "archivedAt": null,
    "responseCount": 1,
    "section": "needs_you"
  }]
}
```

`time` and `location` may be null; they prefer the organizer's saved final choices
over the original proposal. Group by the server-provided `section`:

| `section` | UI | Membership |
| --- | --- | --- |
| `needs_you` | Needs You | Drafts and actionable Open plans |
| `active` | Active | Other current plans, including Confirmed |
| `past` | Past | Archived, Cancelled, or Completed |

Show the response count, status, and next action. Refetch after creating or
mutating, when returning to the foreground, and on manual refresh. Periodic
refresh while the screen is visible can update response totals/decision flags;
do not run background keep-alive traffic or maintain a separate local lifecycle.

### GET /rallies/:id

The ID must be a UUID belonging to the authenticated account. This example shows
the result after explicit confirmation of a poll:

```json
{
  "rally": {
    "id": "11111111-1111-4111-8111-111111111111",
    "activity": "Dinner",
    "timeMode": "poll",
    "startsAt": null,
    "locationMode": "open",
    "location": null,
    "status": "confirmed",
    "nextAction": "none",
    "archivedAt": null,
    "publishedAt": "2099-07-01T12:00:00+00:00",
    "updatedAt": "2099-07-02T12:00:00+00:00",
    "responsesOpen": false,
    "publicUrl": "https://rally-your-friends.com/r/abcdefgh23456789abcdefgh23456789",
    "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Central%20Park%2C%20New%20York",
    "finalMessage": "Dinner is confirmed!\nFriday, July 10, 2099 at 11:00 PM UTC\nCentral Park, New York\nhttps://rally-your-friends.com/r/abcdefgh23456789abcdefgh23456789",
    "finalTime": "2099-07-10T23:00:00+00:00",
    "finalLocation": "Central Park, New York",
    "expiresAt": "2099-07-31T12:00:00+00:00",
    "candidates": [{
      "id": "33333333-3333-4333-8333-333333333333",
      "startsAt": "2099-07-10T23:00:00+00:00"
    }]
  },
  "responses": [{
    "id": "44444444-4444-4444-8444-444444444444",
    "name": "Sam",
    "consensus": "some_work",
    "note": null,
    "available": ["33333333-3333-4333-8333-333333333333"],
    "suggestions": ["Central Park, New York"],
    "timeSuggestions": []
  }],
  "inviteToken": "abcdefgh23456789abcdefgh23456789",
  "creatorToken": "qrstuvwx23456789qrstuvwx23456789"
}
```

`publishedAt` is null for unpublished plans, including cancelled drafts.
`archivedAt` is null unless archived. `finalTime`/`finalLocation` can be null;
organizer detail includes tentative saved choices before confirmation. Public
Open pages keep the original question until the organizer locks the plan.
`responsesOpen` is false for closed states or an expired response deadline.

`mapsUrl` is nullable, available for Confirmed/Completed plans with a location;
it is a normal Google Maps URL, requiring no Maps SDK/key. `finalMessage` is
nullable, generated after explicit confirmation and retained for a previously
confirmed Completed plan. It includes a UTC time and the public HTTPS URL. Share
it as text; do not parse its prose to recover data.

`responses` contains all replies; its length is the detail response total.
`consensus` is `yes`, `no`, or `another_day` for fixed times, and `some_work` or
`none_work` for polls; legacy values may be null. `available` lists candidate
UUIDs, `suggestions` contains place/constraint text, `timeSuggestions` contains
ISO timestamps, and `note` may be null. These are recipient inputs, not accounts.

### PATCH /rallies/:id

PATCH returns the same full envelope as GET detail. Save decisions without
confirming:

```http
PATCH /api/v1/rallies/11111111-1111-4111-8111-111111111111 HTTP/1.1
Host: rally-your-friends.com
Authorization: Bearer <USER_ACCESS_TOKEN>
Content-Type: application/json

{
  "action": "save",
  "finalTime": "2099-07-10T23:00:00Z",
  "finalLocation": "Central Park, New York"
}
```

Then, on an explicit organizer confirmation, send:

```json
{ "action": "confirm" }
```

| `action` | Behavior |
| --- | --- |
| `save` (default) | Save draft edits or an Open plan's tentative final choices |
| `publish` | Validate a complete Draft, make it Open/public, start a fresh 30-day reply window |
| `confirm` | Open only; require a future final time and nonblank place, then lock the plan |
| `cancel` | Close a Draft, Open, or Confirmed plan; Completed cannot be cancelled |
| `archive` | Set `archivedAt` and move to Past without changing lifecycle or closing replies |
| `unarchive` | Clear `archivedAt`; Cancelled/Completed still stay in Past |

All creation fields are optional in PATCH and may edit **Drafts only**. Open
plans accept `finalTime` (future ISO timestamp or null) and `finalLocation`
(trimmed string up to 200 characters or null). Null clears the saved override.
Confirm uses those choices, falling back to original `startsAt`/`location`; final
choices may also be supplied in the same Confirm request. Blank locations become
null and cannot be confirmed. Confirmed/Cancelled/Completed plans cannot edit
their final choices. Send Cancel/Archive/Unarchive as action-only requests.
Do not send `status`, `nextAction`, ownership IDs, or publication timestamps.

## Lifecycle and recommended action

| `status` | Meaning |
| --- | --- |
| `draft` | Saved but not published; incomplete plans are allowed |
| `open` | Published, collecting replies until its response deadline |
| `confirmed` | Organizer explicitly locked time and place |
| `cancelled` | Organizer closed the plan |
| `completed` | The effective event time passed |

`nextAction` is a separate field: `waiting_for_responses` → Waiting for responses,
`choose_time` → Choose time, `choose_location` → Choose location,
`finalize` → Finalize, `none` → None.

The backend recalculates recommendations after replies and mutations and on
reads. For Open plans, a poll without a final time and with all candidates past
needs Choose time immediately. Otherwise it waits when there are no responses
and the deadline remains open; then it asks for a missing/disputed time, missing
place, or finalization. A fixed time is disputed when responses exist but nobody
says yes and the organizer has not saved a final-time override. Other lifecycle
states have `none`; Drafts still appear in Needs You. Recommendations never
automatically select a poll winner or confirm a plan.

Open/Confirmed records become Completed on the next read/write after
`finalTime ?? startsAt` passes. A poll without a chosen date stays unresolved.
Expiry closes replies independently of lifecycle; the organizer can still
finalize an expired Open plan with a future time. Archiving is also independent.

## Errors and retries

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Check the request fields.",
    "fields": [{ "path": "activity", "message": "String must contain at most 200 character(s)" }]
  }
}
```

`fields` appears only for schema validation errors. Use `code`/HTTP status for
logic and show the message; do not parse message wording.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request`, `invalid_json` | Invalid schema/UUID or malformed/missing JSON |
| 401 | `unauthorized` | Missing, invalid, or expired user session |
| 404 | `not_found` | Unknown endpoint or Rally absent from this account |
| 405 | `method_not_allowed` | Unsupported method; see `Allow` header |
| 409 | `invalid_state` | Backend plan/lifecycle validation failed; refresh and correct the action |
| 413 | `payload_too_large` | Body exceeds 16 KiB |
| 415 | `unsupported_media_type` | Body is not `application/json` |
| 503 | `unavailable` | Temporary backend failure; preserve unsaved input |

On 401, refresh through Supabase Auth if possible; otherwise show login. A
different organizer's Rally returns 404 even if its UUID or creator token is
known. On 409, fetch fresh detail before deciding which controls to show.

**There is no idempotency-key support in v1.** Disable double submission and do
not blindly retry POST/PATCH after a timeout or ambiguous network failure. Check
GET `/rallies` or GET detail to see whether the operation already saved before
offering a retry. Free-tier exhaustion may temporarily stop a service; retries
must not trigger email loops, keep-alive jobs, or paid upgrades.

## Recipient pages and native setup boundary

The returned `https://rally-your-friends.com/r/:inviteToken` is the anonymous
recipient **web page**, not a JSON endpoint. Recipients respond and edit replies
there. The organizer API has no anonymous reply endpoint. Do not call Supabase
tables/RPCs directly or integrate against private generated web RPC IDs.

Email magic-link infrastructure is ready. Apple Team ID, bundle IDs, the native
callback, and App Group/Keychain entitlements are not set yet; these are needed
for app routing/session sharing, **not Sign in with Apple**. Keep authentication
email-only. The separate native code must implement callback handling, secure
shared sessions, and message insertion. See [native-integration.md](native-integration.md)
for that checklist and [validation.md](validation.md) for current website/backend
test evidence and remaining device/browser verification.
