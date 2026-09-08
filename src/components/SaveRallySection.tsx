import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { EmailSignIn } from "@/components/EmailSignIn";
import { useSession } from "@/hooks/useSession";
import { getSavedState, saveRally } from "@/lib/account.functions";

/**
 * Secondary account prompt shown below the created-Rally content. Never blocks
 * creating, sharing, or responding to a Rally.
 */
export function SaveRallySection({ creatorToken }: { creatorToken: string }) {
  const { signedIn, loading } = useSession();
  const save = useServerFn(saveRally);
  const check = useServerFn(getSavedState);

  const [saved, setSaved] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingKey = `rally-save-${creatorToken}`;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;

    (async () => {
      try {
        const state = await check({ data: { creatorToken } });
        if (!active) return;
        if (state.saved) {
          setSaved(true);
          localStorage.removeItem(pendingKey);
          return;
        }
        // Returning from the sign-in email: finish the save they asked for.
        if (localStorage.getItem(pendingKey)) {
          await save({ data: { creatorToken } });
          if (!active) return;
          localStorage.removeItem(pendingKey);
          setSaved(true);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not save this Rally.");
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, creatorToken]);

  async function onSave() {
    if (!signedIn) {
      localStorage.setItem(pendingKey, "1");
      setShowEmail(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save({ data: { creatorToken } });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this Rally.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (saved) {
    return <p className="mt-10 text-sm text-muted-foreground">Saved to My Rallies</p>;
  }

  return (
    <section className="mt-10 space-y-2 border-t border-border pt-6">
      <h2 className="text-base font-semibold">Keep track of your Rallies</h2>
      <p className="text-sm text-muted-foreground">
        Save this Rally so you can come back and see how people respond.
      </p>
      {error && <p className="text-sm font-medium">{error}</p>}
      {showEmail ? (
        <EmailSignIn
          returnTo={`/m/${creatorToken}`}
          buttonLabel="Send sign-in email"
          onCancel={() => {
            localStorage.removeItem(pendingKey);
            setShowEmail(false);
          }}
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="w-full border border-border px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save my Rally"}
        </button>
      )}
    </section>
  );
}
