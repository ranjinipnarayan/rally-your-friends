# Native integration setup

Rally uses **email magic links only**, sent through Resend SMTP by Supabase Auth.
There is no Sign in with Apple or other OAuth-provider flow. This repository
owns the website and shared backend; the iOS organizer app and iMessage extension
belong in separate native projects. Preserve their existing structured interfaces.

Use [api.md](api.md) for the HTTP contract, payloads, lifecycle, response shapes,
and extension creation/sharing flow. Use [validation.md](validation.md) for the
website/backend test evidence. Native behavior is not established by those tests.

## Values still needed

The Apple Team ID, containing-app and extension bundle IDs, App Group, shared
Keychain access group, and native callback URL are **not set yet**. These values
configure app routing and secure session sharing, not an Apple login provider.
No placeholder association file or invented native redirect is installed.

The native targets need the same Supabase project URL and **publishable** key as
the website. Never include a service-role key, Supabase personal access token,
Resend SMTP/API key, or Google API key. Rally data goes through the website API;
Supabase Auth supplies the user session.

## Containing-app email login

Start the containing app with email login. Once its real callback is registered
in Xcode and added to Supabase's redirect allowlist, use the Swift SDK:

```swift
// supabase is the configured SupabaseClient.
// callbackURL is the actual allowlisted containing-app callback.
try await supabase.auth.signInWithOTP(
    email: email,
    redirectTo: callbackURL,
    shouldCreateUser: true
)

// In the containing app's callback handler, after checking its URL:
try await supabase.auth.session(from: url)
```

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

For an HTTPS universal-link callback, provide the real Apple application IDs so
this repository can serve the matching `apple-app-site-association` file and web
fallback. For a custom URL scheme, register that exact scheme in the containing
app and allowlist the intended callback in Supabase. Avoid broad redirect
wildcards. [Supabase's deep-linking guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
describes the redirect setup.

## Shared app and extension session

Enable the same App Group and shared Keychain access group for both native
targets. Keep access/refresh tokens in shared Keychain storage, with matching
service, access group, and storage-key configuration. Use the App Group for
non-secret configuration and coordination. Tokens must never enter shared
UserDefaults, URLs, Messages text, or logs.

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
- Cancellation, archive/unarchive, and Completed/Past after the event time.
- Private drafts staying unshared; no creator links or session secrets inserted
  into Messages; no contacts permission requested.

Apple identifiers/callback setup, shared storage, native screens, and message
insertion still require native implementation and verification. Website API
tests cannot substitute for these device checks.
