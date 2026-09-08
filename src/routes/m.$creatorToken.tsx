import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { PlaceInput } from "@/components/PlaceInput";
import { EmailSignIn } from "@/components/EmailSignIn";
import { RallyCard } from "@/components/RallyCard";
import { SaveRallySection } from "@/components/SaveRallySection";
import { useSession } from "@/hooks/useSession";
import { downloadIcs } from "@/lib/ics";
import { getCreatorView, updateRally } from "@/lib/rally.functions";
import {
  CONSENSUS_LABEL,
  NEXT_ACTION_LABEL,
  STATUS_LABEL,
  type RallyView,
  type ResponseView,
  formatDateTime,
  leadingCandidate,
  toLocalInputValue,
} from "@/lib/rally-shared";

export const Route = createFileRoute("/m/$creatorToken")({
  validateSearch: (search: Record<string, unknown>) => ({
    created:
      search["created"] === true || search["created"] === "true"
        ? true
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manage your Rally" },
      {
        name: "description",
        content: "Private page to share your Rally and see responses.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Manage your Rally" },
      {
        property: "og:description",
        content: "Private management page for your Rally.",
      },
    ],
  }),
  component: CreatorPage,
});

function CreatorPage() {
  const { creatorToken } = Route.useParams();
  const { signedIn, email, loading: sessionLoading } = useSession();

  const load = useServerFn(getCreatorView);
  const update = useServerFn(updateRally);

  const [loading, setLoading] = useState(true);
  const [rally, setRally] = useState<RallyView | null>(null);
  const [responses, setResponses] = useState<ResponseView[]>([]);
  const [activity, setActivity] = useState("");
  const [finalTime, setFinalTime] = useState("");
  const [finalLocation, setFinalLocation] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    let view;
    try {
      view = await load({ data: { creatorToken } });
    } catch (err) {
      if (request !== requestNumber.current) return;
      throw err;
    }
    if (request !== requestNumber.current) return;
    setRally(view.rally);
    setResponses(view.responses);
    if (view.rally) {
      setActivity(view.rally.activity);
      const time = view.rally.finalTime ?? view.rally.startsAt;
      setFinalTime(time ? toLocalInputValue(new Date(time)) : "");
      setFinalLocation(view.rally.finalLocation ?? view.rally.location ?? "");
    }
    setError(null);
    setLoading(false);
  }, [creatorToken, load]);

  useEffect(() => {
    if (sessionLoading) return;
    setLoading(true);
    setRally(null);
    setEditing(false);
    refresh().catch((err) => {
      setError(
        err instanceof Error ? err.message : "Could not load this Rally.",
      );
      setLoading(false);
    });
    return () => {
      requestNumber.current += 1;
    };
  }, [refresh, signedIn, email, sessionLoading]);

  useEffect(() => {
    const refreshVisible = () => {
      if (
        document.visibilityState !== "visible" ||
        editing ||
        busy ||
        sessionLoading
      )
        return;
      void refresh().catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not refresh this Rally.",
        ),
      );
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 60_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh, editing, busy, sessionLoading]);

  const inviteUrl = rally?.publicUrl ?? "";
  const creatorUrl =
    typeof window !== "undefined"
      ? (window.location.href.split("?")[0] ?? "")
      : "";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
      setError("Could not copy automatically. Select and copy the text below.");
    }
  }

  async function share() {
    await copy(inviteUrl, "invite");
  }

  async function patch(payload: {
    finalTime?: string | null;
    finalLocation?: string | null;
    activity?: string;
    timeMode?: "specific" | "poll";
    startsAt?: string | null;
    locationMode?: "specific" | "open";
    location?: string | null;
    action?:
      "save" | "publish" | "confirm" | "cancel" | "archive" | "unarchive";
  }) {
    setBusy(true);
    setError(null);
    try {
      await update({ data: { creatorToken, action: "save", ...payload } });
      await refresh();
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update this Rally.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell>Loading…</Shell>;

  if (!rally) {
    return (
      <Shell>
        <h1 className="text-lg font-bold">
          {error ? "Manage your Rally" : "This link isn’t valid"}
        </h1>
        <p
          role={error ? "alert" : undefined}
          className="mt-2 text-sm text-muted-foreground"
        >
          {error ??
            "The management link may be mistyped or the Rally was removed."}
        </p>
        {error && !signedIn && (
          <div className="mt-4">
            <EmailSignIn
              returnTo={`/m/${creatorToken}`}
              buttonLabel="Send sign-in email"
            />
          </div>
        )}
        {error && (
          <button
            type="button"
            onClick={() =>
              void refresh().catch((err) =>
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not load this Rally.",
                ),
              )
            }
            className="mt-3 border border-border px-3 py-2 text-sm"
          >
            Try again
          </button>
        )}
      </Shell>
    );
  }

  const isPoll = rally.timeMode === "poll";
  const openLocation = rally.locationMode === "open";
  const isDraft = rally.status === "draft";
  const canEdit = isDraft || rally.status === "open";
  const leader = isPoll ? leadingCandidate(rally.candidates, responses) : null;
  const suggestions = responses.flatMap((r) =>
    r.suggestions.map((s) => ({ name: r.name, text: s })),
  );
  const currentRally = rally;

  async function toggleEdit() {
    if (!editing) {
      setEditing(true);
      return;
    }
    const time = finalTime ? new Date(finalTime).toISOString() : null;
    const location = finalLocation.trim() || null;
    const saved = await patch(
      isDraft
        ? {
            activity: activity.trim() || "Let's hang out",
            timeMode: time ? "specific" : currentRally.timeMode,
            startsAt: time,
            locationMode: location ? "specific" : "open",
            location,
          }
        : { finalTime: time, finalLocation: location },
    );
    if (saved) setEditing(false);
  }

  function responseTime(r: ResponseView): string | null {
    if (isPoll) {
      const c = currentRally.candidates.find((cand) =>
        r.available.includes(cand.id),
      );
      return c ? c.startsAt : null;
    }
    return currentRally.startsAt ?? null;
  }

  async function applyFromResponse(
    r: ResponseView,
    opts: { time?: boolean; place?: boolean },
  ) {
    const payload: {
      finalTime?: string | null;
      finalLocation?: string | null;
    } = {};
    if (opts.time) {
      const t = responseTime(r);
      if (t) {
        payload.finalTime = new Date(t).toISOString();
        setFinalTime(toLocalInputValue(new Date(t)));
      }
    }
    if (opts.place) {
      const place = r.suggestions[0];
      if (place) {
        payload.finalLocation = place;
        setFinalLocation(place);
      }
    }
    if (Object.keys(payload).length === 0) return;
    await patch(payload);
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold">Manage your Rally</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {STATUS_LABEL[rally.status]}
        {rally.archivedAt ? " · Archived" : ""} · {responses.length}{" "}
        {responses.length === 1 ? "response" : "responses"}
      </p>
      <p className="mb-4 border border-border p-3 text-sm" aria-live="polite">
        Next: {NEXT_ACTION_LABEL[rally.nextAction]}
      </p>
      <RallyCard
        rally={rally}
        editing={editing}
        onEdit={canEdit && !busy ? () => void toggleEdit() : undefined}
      >
        <div className="space-y-3">
          {isDraft && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Plan</span>
              <input
                value={activity}
                maxLength={200}
                onChange={(e) => setActivity(e.target.value)}
                className="w-full border border-border px-3 py-2 text-base"
              />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Time</span>
            <input
              type="datetime-local"
              value={finalTime}
              onChange={(e) => setFinalTime(e.target.value)}
              className="w-full border border-border px-3 py-2 text-base"
            />
          </label>
          {isPoll && rally.candidates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rally.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setFinalTime(toLocalInputValue(new Date(c.startsAt)))
                  }
                  className="border border-border px-2 py-1 text-xs"
                >
                  {formatDateTime(c.startsAt)}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <span className="text-sm font-medium">Location</span>
            <PlaceInput
              value={finalLocation}
              onChange={setFinalLocation}
              placeholder="Search a place or address"
              ariaLabel="Location"
            />
          </div>
        </div>
      </RallyCard>

      <section className="mt-6 space-y-2">
        {rally.publishedAt && (
          <>
            <h2 className="text-base font-semibold">Share with your friends</h2>
            <input
              readOnly
              aria-label="Public Rally link"
              value={inviteUrl}
              className="w-full border border-border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={share}
              className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background"
            >
              {copied === "invite" ? "Copied" : "Copy attendee link"}
            </button>
          </>
        )}

        <details className="text-sm">
          <summary>Private management link</summary>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {creatorUrl}
          </p>
          <button
            type="button"
            onClick={() => copy(creatorUrl, "creator")}
            className="mt-1 border border-border px-3 py-2 text-sm"
          >
            {copied === "creator" ? "Copied" : "Copy management link"}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep this to yourself. Saved Rallies also require the organizer’s
            account.
          </p>
        </details>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">
          Responses ({responses.length})
        </h2>
        {responses.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No responses yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {responses.map((r) => {
              const time = responseTime(r);
              const place = r.suggestions[0] ?? null;
              return (
                <li key={r.id} className="border border-border p-2 text-sm">
                  <p className="font-medium">{r.name}</p>
                  <p>{r.consensus ? CONSENSUS_LABEL[r.consensus] : "—"}</p>
                  {isPoll && (
                    <ul className="mt-1">
                      {rally.candidates.map((c) => (
                        <li key={c.id}>
                          {r.available.includes(c.id) ? "✓" : "✕"}{" "}
                          {formatDateTime(c.startsAt)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.note && <p className="mt-1">Note: {r.note}</p>}
                  {r.suggestions.length > 0 && (
                    <p className="mt-1">
                      Location needs: {r.suggestions.join(", ")}
                    </p>
                  )}
                  {(r.timeSuggestions?.length ?? 0) > 0 && (
                    <div className="mt-1">
                      <p className="font-medium">Suggested new times</p>
                      <ul className="mt-1 space-y-1">
                        {(r.timeSuggestions ?? []).map((t) => (
                          <li
                            key={t}
                            className="flex items-center justify-between gap-2"
                          >
                            <span>{formatDateTime(t)}</span>
                            {canEdit && (
                              <button
                                type="button"
                                disabled={busy || editing}
                                onClick={() => {
                                  setFinalTime(toLocalInputValue(new Date(t)));
                                  void patch({
                                    finalTime: new Date(t).toISOString(),
                                  });
                                }}
                                className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                              >
                                Use this time
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {canEdit && (time || place) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {time && place && (
                        <button
                          type="button"
                          disabled={busy || editing}
                          onClick={() =>
                            void applyFromResponse(r, {
                              time: true,
                              place: true,
                            })
                          }
                          className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Use as plan
                        </button>
                      )}
                      {time && (
                        <button
                          type="button"
                          disabled={busy || editing}
                          onClick={() =>
                            void applyFromResponse(r, { time: true })
                          }
                          className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Use this time
                        </button>
                      )}
                      {place && (
                        <button
                          type="button"
                          disabled={busy || editing}
                          onClick={() =>
                            void applyFromResponse(r, { place: true })
                          }
                          className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Use this place
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isPoll && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">Leading time</h2>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              {leader
                ? `${formatDateTime(leader.candidate.startsAt)} — ${leader.count} available`
                : "No votes yet."}
            </p>
            {leader && canEdit && !isDraft && (
              <button
                type="button"
                disabled={busy || editing}
                onClick={() => {
                  const iso = new Date(leader.candidate.startsAt).toISOString();
                  setFinalTime(
                    toLocalInputValue(new Date(leader.candidate.startsAt)),
                  );
                  void patch({ finalTime: iso });
                }}
                className="border border-border px-2 py-1 text-xs"
              >
                Use this time
              </button>
            )}
          </div>
        </section>
      )}

      {openLocation && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">Location needs</h2>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>
                    {s.text}{" "}
                    <span className="text-muted-foreground">({s.name})</span>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy || editing}
                      onClick={() => {
                        setFinalLocation(s.text);
                        void patch({ finalLocation: s.text });
                      }}
                      className="border border-border px-2 py-1 text-xs"
                    >
                      Use
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-6 space-y-2">
        {error && (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        )}
        {isDraft && (
          <>
            <p className="text-sm text-muted-foreground">
              This draft is private until you publish it.
            </p>
            <button
              type="button"
              disabled={busy || editing}
              onClick={() => void patch({ action: "publish" })}
              className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
            >
              Publish Rally
            </button>
          </>
        )}
        {rally.status === "open" && (
          <button
            type="button"
            disabled={busy || editing || !finalTime || !finalLocation.trim()}
            onClick={() =>
              void patch({
                finalTime: finalTime ? new Date(finalTime).toISOString() : null,
                finalLocation: finalLocation.trim() || null,
                action: "confirm",
              })
            }
            className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
          >
            Confirm plan
          </button>
        )}
        {editing ? (
          <p className="text-xs text-muted-foreground">
            Choose “Done editing” to save your changes first.
          </p>
        ) : (
          rally.status === "open" &&
          (!finalTime || !finalLocation.trim()) && (
            <p className="text-xs text-muted-foreground">
              Choose the final time and place before confirming.
            </p>
          )
        )}

        {rally.status === "confirmed" && (
          <button
            type="button"
            onClick={() => downloadIcs(rally, inviteUrl || undefined)}
            className="w-full border border-border px-4 py-3 text-sm"
          >
            Add to calendar
          </button>
        )}
        {rally.finalMessage && (
          <div className="space-y-2 border border-border p-3">
            <p className="text-sm font-semibold">Final plan to share</p>
            <p className="whitespace-pre-line break-words text-sm">
              {rally.finalMessage}
            </p>
            <button
              type="button"
              onClick={() => void copy(rally.finalMessage!, "final")}
              className="w-full border border-border px-3 py-2 text-sm"
            >
              {copied === "final" ? "Copied" : "Copy final message"}
            </button>
          </div>
        )}
        {(rally.status === "draft" ||
          rally.status === "open" ||
          rally.status === "confirmed") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Cancel this Rally? Friends will see that the plan is cancelled.",
                )
              ) {
                setEditing(false);
                void patch({ action: "cancel" });
              }
            }}
            className="w-full border border-border px-4 py-3 text-sm disabled:opacity-50"
          >
            Cancel Rally
          </button>
        )}
        <button
          type="button"
          disabled={busy || editing}
          onClick={() =>
            void patch({ action: rally.archivedAt ? "unarchive" : "archive" })
          }
          className="w-full border border-border px-4 py-3 text-sm disabled:opacity-50"
        >
          {rally.archivedAt ? "Unarchive Rally" : "Archive Rally"}
        </button>
        {!rally.archivedAt && (
          <p className="text-xs text-muted-foreground">
            Archiving moves this Rally to Past in your account.
          </p>
        )}
      </section>

      <SaveRallySection creatorToken={creatorToken} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-4 py-6">{children}</main>;
}
