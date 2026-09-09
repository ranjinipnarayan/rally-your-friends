import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { validateEmail } from "@/lib/email.functions";
import { signInError, signInCodeError } from "@/lib/auth-errors";

/**
 * Email sign-in by link or code, including codes read on another device.
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
  const [enterCode, setEnterCode] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEmail = useServerFn(validateEmail);
  const navigate = useNavigate();

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
      setEmail(check.email);
      setCode("");
      setSent(true);
      setEnterCode(true);
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;
      setCode("");
      // Keep in-progress forms mounted when signing in on their own page.
      if (window.location.pathname !== returnTo) {
        await navigate({ to: returnTo });
      }
    } catch (err) {
      setError(signInCodeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (enterCode) {
    return (
      <form onSubmit={verify} className="space-y-2">
        <p className="text-sm" role="status">
          {sent ? `Check ${email}. ` : ""}
          Enter the code from your sign-in email here. You can read the email on
          another device, or use its link to sign in on the device where you
          open it.
        </p>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          readOnly={sent || busy}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="w-full border border-border px-3 py-2 text-base"
        />
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,10}"
          minLength={6}
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          placeholder="Email code"
          aria-label="Email code"
          readOnly={busy}
          className="w-full border border-border px-3 py-2 text-base"
        />
        {error && (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-sm underline"
          onClick={() => {
            setEnterCode(false);
            setSent(false);
            setCode("");
            setError(null);
          }}
        >
          Change email or request a new code
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="ml-3 text-sm underline"
          >
            Cancel
          </button>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="email"
        autoComplete="email"
        readOnly={busy}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="w-full border border-border px-3 py-2 text-base"
      />
      {error && (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      )}
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
      <button
        type="button"
        disabled={busy}
        className="text-sm underline"
        onClick={() => {
          setEnterCode(true);
          setError(null);
        }}
      >
        I already have a code
      </button>
    </form>
  );
}
