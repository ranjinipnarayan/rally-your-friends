import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

/** Tiny corner menu — the only navigation in the app. */
export function AppMenu() {
  const [open, setOpen] = useState(false);
  const { signedIn } = useSession();
  const navigate = useNavigate();

  return (
    <div className="fixed right-2 top-2 z-50 text-right">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border-2 border-foreground/60 bg-background px-3 py-2 text-base leading-none shadow-sm transition-colors hover:border-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:px-4 md:py-2.5"
      >
        <span aria-hidden>☰</span>
        <span className="hidden text-sm font-medium md:inline">Menu</span>
      </button>
      {open && (
        <div className="mt-1 border border-border bg-background p-2 text-sm">
          {signedIn ? (
            <div className="flex flex-col items-end gap-2">
              <Link to="/my-rallies" onClick={() => setOpen(false)}>
                My Rallies
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setOpen(false);
                  navigate({ to: "/" });
                }}
              >
                Log out
              </button>
            </div>
          ) : (
            <Link to="/login" onClick={() => setOpen(false)}>
              Log in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
