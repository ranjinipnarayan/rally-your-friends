import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

/** Tiny corner menu — the only navigation in the app. */
export function AppMenu() {
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { signedIn } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={menu} className="app-menu fixed right-3 top-3 z-50">
      <button
        ref={toggle}
        type="button"
        aria-label="Menu"
        aria-controls="rally-navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="app-menu-toggle"
      >
        <span aria-hidden>☰</span>
        <span>Menu</span>
      </button>
      {open && (
        <nav
          id="rally-navigation"
          aria-label="Rally navigation"
          className="app-menu-panel"
        >
          <p className="app-menu-caption">Rally</p>
          <Link
            to="/"
            className="app-menu-item app-menu-new"
            onClick={() => setOpen(false)}
          >
            <span aria-hidden="true">＋</span> New Rally
          </Link>
          {signedIn ? (
            <div className="app-menu-account">
              <Link
                className="app-menu-item"
                to="/my-rallies"
                onClick={() => setOpen(false)}
              >
                My Rallies
              </Link>
              <button
                className="app-menu-item"
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
            <Link
              className="app-menu-item app-menu-account"
              to="/login"
              onClick={() => setOpen(false)}
            >
              Log in
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
