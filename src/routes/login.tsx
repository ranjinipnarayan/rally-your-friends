import { createFileRoute, Link } from "@tanstack/react-router";

import { EmailSignIn } from "@/components/EmailSignIn";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Rally" },
      {
        name: "description",
        content:
          "Log in to Rally to keep track of the Rallies you have created.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Log in — Rally" },
      {
        property: "og:description",
        content: "Keep track of the Rallies you have created.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signedIn, email } = useSession();

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-lg font-bold">Log in</h1>
      {signedIn ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>Signed in as {email}.</p>
          <Link
            to="/my-rallies"
            className="inline-block border border-border px-3 py-2"
          >
            My Rallies
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in to find and manage your Rallies. You can still create and
            share a Rally, or answer one, without an account.
          </p>
          <EmailSignIn
            returnTo="/my-rallies"
            buttonLabel="Send sign-in email"
          />
        </div>
      )}
    </main>
  );
}
