import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { validateEmail } from "@/lib/email.functions";
import { signInError } from "@/lib/auth-errors";

/**
 * Single-field email sign-in. Sends a one-time sign-in email that returns the
 * person to `returnTo` on the same device, so no onboarding step is involved.
 */
export function EmailSignIn({
  returnTo,
  buttonLabel = "Send code",
  onCancel,
}: {
  returnTo: string;
  buttonLabel?: string;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEmail = useServerFn(validateEmail);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const check = await checkEmail({ data: { email } });
      if (!check.ok) {
        setError(check.error);
        return;
      }
      const { error: err } = await supabase.auth.signInWithOtp({
        email: check.email,
        options: {
          emailRedirectTo: `${window.location.origin}${returnTo}`,
        },
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="text-sm">
        Check <span className="font-medium">{email.trim()}</span> and open the
        sign-in link on this device. You’ll come straight back here.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="w-full border border-border px-3 py-2 text-base"
      />
      {error && <p className="text-sm font-medium">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
        >
          {busy ? "Sending…" : buttonLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-3 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
