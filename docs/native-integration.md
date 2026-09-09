# Native integration setup

Rally uses **email sign-in with a magic link or one-time code**, sent through Resend SMTP by Supabase Auth.
There is no Sign in with Apple or other OAuth-provider flow. This repository
owns the website and shared backend; the iOS organizer app and iMessage extension
live in [ranjinipnarayan/rally](https://github.com/ranjinipnarayan/rally).
Preserve their existing structured interfaces.

Use [api.md](api.md) for the HTTP contract, payloads, lifecycle, response shapes,
and extension creation/sharing flow. Use [validation.md](validation.md) for the
website/backend test evidence. Native behavior is not established by those tests.

The native source reviewed at `a14f9e9` contains PKCE email login, organizer
management, shared Keychain storage, and structured Messages creation. Its Swift
integration checks pass with mocked HTTP responses. The containing app owns
session refresh; the extension rereads its access-token snapshot on activation.
Open email links on the device that requested them so PKCE can complete. Signed
device testing is still required for callbacks, session sharing, and insertion.

## Development native configuration

These are the development identifiers supplied by the native project. Confirm
the production app's identifiers and callback separately before its release.

| Setting | Value |
| --- | --- |
| Containing app bundle ID | `com.example.RallyMessages` |
| Extension bundle ID | `com.example.RallyMessages.MessagesExtension` |
| Apple Team ID | `NWUMX9X84W` |
| App Group | `group.com.example.RallyMessages` |
| Shared Keychain entitlement | `$(AppIdentifierPrefix)com.example.RallyMessages.shared` |
| Sign-in callback | `com.example.RallyMessages://auth/callback` |

The exact callback is allowlisted in Supabase → Authentication → URL Configuration
→ Redirect URLs alongside the existing web redirects. Register
`com.example.RallyMessages` in the containing app's URL Types in Xcode. This
custom-scheme callback does not require a website association file.
The native project owns the app registration and signed entitlements.

The native targets need the same Supabase project URL and **publishable** key as
the website. Never include a service-role key, Supabase personal access token,
Resend SMTP/API key, or Google API key. Rally data goes through the website API;
Supabase Auth supplies the user session.

## Containing-app email login

Start the containing app with email login. After registering the URL scheme in
Xcode, use the Swift SDK:

```swift
// supabase is the configured SupabaseClient.
let callbackURL = URL(string: "com.example.RallyMessages://auth/callback")!
try await supabase.auth.signInWithOTP(
    email: email,
    redirectTo: callbackURL,
    shouldCreateUser: true
)

// In the containing app's callback handler, after checking its URL:
try await supabase.auth.session(from: url)
```

The same email also includes an **8-digit code**, valid for one hour. Add a code
entry screen to the containing app so someone can read email on another device:

```swift
try await supabase.auth.verifyOTP(
    email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
    token: code.trimmingCharacters(in: .whitespacesAndNewlines),
    type: .email
)
let session = try await supabase.auth.session
// Pass session through the existing verified-account/shared-Keychain flow.
```

Use `type: .email` for both new and existing accounts. Offer “I already have a
code” without sending another email. The person must enter the same email
address; opening the link consumes the same credential, so they should use the
code instead when signing in elsewhere. Keep codes in memory only. Show expired,
used, invalid, and throttled errors; resend only on an explicit request. Verify
`GET /api/v1/me` and update the extension's shared session after successful code
verification, just as after a callback. No new Rally REST endpoint is needed.

The website and hosted email template support codes. **The native repository
still needs this code-entry UI and device verification.** See
[Swift verifyOTP](https://supabase.com/docs/reference/swift/auth-verifyotp).

Supabase creates the Auth user on first sign-in and reuses the account afterward.
Confirm the authenticated backend identity with `GET /api/v1/me`. Sending an email
is not proof of login. Show retry-later errors for send limits; do not automatically
resend emails. Handle expired or already-used links without discarding the
organizer's unsaved plan. See [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Swift signInWithOTP](https://supabase.com/docs/reference/swift/auth-signinwithotp),
and the [Swift callback example](https://supabase.com/docs/guides/getting-started/tutorials/with-swift).

Pin a compatible Supabase Swift SDK version in the native project and verify its
callback behavior on a real device. Keep the website's existing magic-link email
template and browser redirects working when adding the native callback.

Before passing an incoming URL to the SDK, require the scheme
`com.example.RallyMessages` (case-insensitive), host `auth`, and path `/callback`.
Preserve the SDK's callback query/fragment parameters, including error responses,
without logging them. Verify cold-launch and already-running app handling. See
[Supabase's deep-linking guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

## Shared app and extension session

Enable the same App Group and shared Keychain access group for both native
targets. Keep access/refresh tokens in shared Keychain storage, with matching
service, access group, and storage-key configuration. Use the App Group for
non-secret configuration and coordination. Never copy session tokens into shared
UserDefaults, application-generated URLs, Messages text, or logs.

Use the App Group and Keychain entitlement from the table in both targets.
Xcode expands `$(AppIdentifierPrefix)` during signing; use the resulting signed
access-group value in runtime Keychain configuration, not the literal build
variable. Verify both provisioning profiles authorize the shared groups.

Follow [Apple's Keychain sharing setup](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps).
Check the selected SDK version's
[Keychain storage implementation](https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/Storage/KeychainLocalStorage.swift)
when configuring its storage. The native implementation must coordinate refresh
across both processes and reread the shared session on activation. Sign-out must
clear shared credentials and cached account displays in both targets.

If the extension has no usable session, show **“Open Rally to sign in.”** It must
not create anonymously as a fallback. With a session, use the structured flow
and insert the returned title/public HTTPS URL as described in [api.md](api.md).
Do not access contacts or add natural-language creation.

The backend remains the source of truth. Refresh organizer data after extension
creation, on foreground/manual refresh, and while a management screen is visible
as needed. Use the server's Needs You/Active/Past sections and next actions.
Do not maintain an independent native lifecycle or background keep-alive job.

## Match the website's poll shortcuts

The API accepts concrete timestamps, not date-window labels. Match
[`generateCandidates`](../src/lib/rally-shared.ts) when reproducing the current
website shortcuts:

| Website choice | Three dates, in the device's local calendar |
| --- | --- |
| This week | Tomorrow, two days from today, three days from today |
| This weekend | Next future Friday, then Saturday and Sunday |
| Next week | Next future Monday, then Wednesday and Friday |

“Future” excludes today: choosing This weekend on Friday uses the following
Friday; choosing Next week on Monday uses the following Monday. These are the
current website rules, including when “This week” crosses a week boundary.

| Time-of-day choice | Local time on each candidate date |
| --- | --- |
| Morning | 10:00 |
| Afternoon | 14:00 |
| Evening | 19:00 |

Apply calendar-day changes in the user's time zone, set the selected clock time,
and send the resulting ISO timestamps with an offset or `Z`. Do not treat a
calendar day as always 24 elapsed hours across daylight-saving changes. Let
the organizer edit the generated dates before submission. For unspecified
activity, the website uses `Let's hang out`.

## Native acceptance checks

### Management links and deletion

The website serves `/.well-known/apple-app-site-association` on the apex and
`www` hosts for `NWUMX9X84W.com.example.RallyMessages`, matching only `/m/*`.
Public `/r/*` recipient links continue to open on the website. iOS Universal
Links select the installed app and otherwise open the website; same-domain
Safari navigation may stay in Safari according to the user's browsing intent.
[Apple's Universal Links documentation](https://developer.apple.com/documentation/Xcode/allowing-apps-and-websites-to-link-to-your-content)
describes this behavior.

The native team must add `applinks:rally-your-friends.com` and
`applinks:www.rally-your-friends.com` to the containing app's Associated Domains
entitlement and implement `NSUserActivityTypeBrowsingWeb` routing for `/m/:token`.
These changes are not present in the previously reviewed native commit `a14f9e9`.
Validate the HTTPS host/path and token, require sign-in, decode `creatorToken`
from the authenticated `GET /rallies` list, and open the matching Rally by ID.
The token never bypasses account ownership. If the link is not in that account,
offer its website URL with `?web=1`, which is excluded from app routing and shows
the web management or deleted-link page. Do not log or insert management tokens
into Messages. Test app-installed, app-absent, logged-out, deleted, and
wrong-account links on a signed device.

Add a confirmed Delete action using `DELETE /rallies/:id`; accept an empty `204`
response and remove the row from all lists. Draft saving already uses authenticated
`POST /rallies` with `status: "draft"`; no new draft endpoint is required.

### Device checks

Before releasing either native target, verify these on devices:

- New and existing email accounts; successful, expired, and already-used
  callbacks; the expected account from `/me`.
- App-to-extension session sharing after relaunch, concurrent refresh,
  sign-out/account switching, and the logged-out extension prompt.
- All four timing/location combinations, editable poll shortcuts, creation
  appearing immediately in the organizer app, and no duplicate POST on an
  ambiguous connection failure.
- Anonymous browser replies, updated totals and Needs You flags, explicit
  confirmation, and the final message inserted into the current conversation.
- Cancellation, deletion, and Completed/Past after the event time.
- Private drafts staying unshared; no creator links or session secrets inserted
  into Messages; no contacts permission requested.

URL scheme registration, signed entitlements, shared storage, native screens,
and message insertion are owned by the native project and still require device
verification. Website API tests cannot substitute for these device checks.

## Replace archive with delete

Remove Archive/Unarchive controls from the native app. Use the existing
`DELETE /api/v1/rallies/:id` endpoint after explicit deletion confirmation, then
remove the item from local state and refresh My Rallies. The API rejects
`archive`/`unarchive` actions with HTTP 400; it never converts them into deletion.
`archivedAt` is a deprecated compatibility field that now always returns null.
Previously archived plans reappear according to their current lifecycle and next
action. Cancelled and Completed plans remain in Past until explicitly deleted.
