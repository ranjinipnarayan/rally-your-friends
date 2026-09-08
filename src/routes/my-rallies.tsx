import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { useSession } from "@/hooks/useSession";
import { listMyRallies, type SavedRally } from "@/lib/account.functions";
import { STATUS_LABEL, formatDateTime } from "@/lib/rally-shared";

export const Route = createFileRoute("/my-rallies")({
  head: () => ({
    meta: [
      { title: "My Rallies" },
      { name: "description", content: "The Rallies you have created and saved." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My Rallies" },
      { property: "og:description", content: "The Rallies you have created and saved." },
    ],
  }),
  component: MyRalliesPage,
});

function MyRalliesPage() {
  const { signedIn, loading: sessionLoading } = useSession();
  const load = useServerFn(listMyRallies);

  const [rallies, setRallies] = useState<SavedRally[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    load()
      .then((res) => {
        if (active) setRallies(res.rallies);
      })
      .catch(() => {
        if (active) setRallies([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

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
          to see your saved Rallies.
        </p>
      ) : rallies === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : rallies.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No saved Rallies yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rallies.map((r) => (
            <li key={r.creatorToken} className="border border-border">
              <Link
                to="/m/$creatorToken"
                params={{ creatorToken: r.creatorToken }}
                search={{ created: undefined }}
                className="block p-3 text-sm"
              >
                <p className="text-base font-semibold">{r.activity}</p>
                <p>{r.time ? formatDateTime(r.time) : "Time to be decided"}</p>
                {r.location && <p>{r.location}</p>}
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[r.status]} · {r.responseCount}{" "}
                  {r.responseCount === 1 ? "response" : "responses"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
