import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { useSession } from "@/hooks/useSession";
import { listMyRallies, type SavedRally } from "@/lib/account.functions";
import {
  NEXT_ACTION_LABEL,
  STATUS_LABEL,
  formatDateTime,
} from "@/lib/rally-shared";

export const Route = createFileRoute("/my-rallies")({
  head: () => ({
    meta: [
      { title: "My Rallies" },
      { name: "description", content: "Manage the Rallies you have created." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My Rallies" },
      {
        property: "og:description",
        content: "Manage the Rallies you have created.",
      },
    ],
  }),
  component: MyRalliesPage,
});

const SECTIONS = [
  {
    key: "needs_you",
    label: "Needs You",
    empty: "No decisions needed right now.",
  },
  { key: "active", label: "Active", empty: "No active Rallies." },
  { key: "past", label: "Past", empty: "No past or archived Rallies." },
] as const;

function MyRalliesPage() {
  const { signedIn, email, loading: sessionLoading } = useSession();
  const load = useServerFn(listMyRallies);
  const [rallies, setRallies] = useState<SavedRally[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setRallies(null);
    setError(null);
    if (!signedIn || sessionLoading) return;
    let active = true;
    let pending = false;

    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const res = await load();
        if (active) {
          setRallies(res.rallies);
          setError(null);
        }
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Could not load your Rallies.",
          );
      } finally {
        pending = false;
      }
    }
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [signedIn, email, sessionLoading, load, revision]);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-lg font-bold">My Rallies</h1>
      {sessionLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : !signedIn ? (
        <p className="mt-3 text-sm">
          <Link to="/login" className="underline">
            Log in
          </Link>{" "}
          to see your Rallies.
        </p>
      ) : (
        <>
          <Link
            to="/"
            className="mt-3 inline-block border border-border px-3 py-2 text-sm"
          >
            Create Rally
          </Link>
          {error && (
            <div role="alert" className="mt-3 space-y-2 text-sm">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
                className="border border-border px-3 py-2"
              >
                Try again
              </button>
            </div>
          )}
          {rallies === null && !error ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (
            rallies !== null &&
            SECTIONS.map((section) => {
              const entries = rallies.filter(
                (rally) => rally.section === section.key,
              );
              return (
                <section
                  key={section.key}
                  aria-labelledby={`rallies-${section.key}`}
                  className="mt-6"
                >
                  <h2
                    id={`rallies-${section.key}`}
                    className="text-base font-semibold"
                  >
                    {section.label} ({entries.length})
                  </h2>
                  {entries.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {section.empty}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {entries.map((rally) => (
                        <li key={rally.id} className="border border-border">
                          <Link
                            to="/m/$creatorToken"
                            params={{ creatorToken: rally.creatorToken }}
                            search={{ created: undefined }}
                            className="block p-3 text-sm"
                          >
                            <p className="text-base font-semibold">
                              {rally.activity}
                            </p>
                            <p>
                              {rally.time
                                ? formatDateTime(rally.time)
                                : "Time to be decided"}
                            </p>
                            {rally.location && <p>{rally.location}</p>}
                            <p className="text-xs text-muted-foreground">
                              {STATUS_LABEL[rally.status]}
                              {rally.archivedAt ? " · Archived" : ""} ·{" "}
                              {rally.responseCount}{" "}
                              {rally.responseCount === 1
                                ? "response"
                                : "responses"}
                            </p>
                            <p
                              className={`mt-1 text-xs ${section.key === "needs_you" ? "font-semibold" : "text-muted-foreground"}`}
                            >
                              Next: {NEXT_ACTION_LABEL[rally.nextAction]}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </>
      )}
    </main>
  );
}
