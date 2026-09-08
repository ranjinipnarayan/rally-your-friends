import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { PlaceInput } from "@/components/PlaceInput";
import { RallyCard } from "@/components/RallyCard";
import { SaveRallySection } from "@/components/SaveRallySection";
import { downloadIcs } from "@/lib/ics";
import { getCreatorView, updateRally } from "@/lib/rally.functions";
import {
  CONSENSUS_LABEL,
  type RallyStatus,
  type RallyView,
  type ResponseView,
  formatDateTime,
  leadingCandidate,
  toLocalInputValue,
} from "@/lib/rally-shared";

export const Route = createFileRoute("/m/$creatorToken")({
  validateSearch: (search: Record<string, unknown>) => ({
    created: search['created'] === true || search['created'] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manage your Rally" },
      { name: "description", content: "Private page to share your Rally and see responses." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Manage your Rally" },
      { property: "og:description", content: "Private management page for your Rally." },
    ],
  }),
  component: CreatorPage,
});

function CreatorPage() {
  const { creatorToken } = Route.useParams();
  const search = Route.useSearch();
  void search;

  const load = useServerFn(getCreatorView);
  const update = useServerFn(updateRally);

  const [loading, setLoading] = useState(true);
  const [rally, setRally] = useState<RallyView | null>(null);
  const [responses, setResponses] = useState<ResponseView[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [finalTime, setFinalTime] = useState("");
  const [finalLocation, setFinalLocation] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const refresh = useCallback(async () => {
    const view = await load({ data: { creatorToken } });
    setRally(view.rally);
    setResponses(view.responses);
    setInviteToken(view.inviteToken);
    if (view.rally) {
      const time = view.rally.finalTime ?? view.rally.startsAt;
      setFinalTime(time ? toLocalInputValue(new Date(time)) : "");
      setFinalLocation(view.rally.finalLocation ?? view.rally.location ?? "");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorToken]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorToken]);

  const inviteUrl =
    inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/r/${inviteToken}`
      : "";
  const creatorUrl = typeof window !== "undefined" ? (window.location.href.split("?")[0] ?? "") : "";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  async function share() {
    await copy(inviteUrl, "invite");
  }

  async function patch(payload: {
    finalTime?: string | null;
    finalLocation?: string | null;
    status?: RallyStatus;
  }) {
    setBusy(true);
    setError(null);
    // When a place is set but no time is locked in yet, auto-advance the plan
    // to the best-known time so "Confirm plan" always has a complete plan.
    if (payload.finalLocation && !payload.finalTime && rally && !rally.finalTime) {
      const auto =
        rally.startsAt ??
        (rally.timeMode === "poll"
          ? (leadingCandidate(rally.candidates, responses)?.candidate.startsAt ??
            rally.candidates[0]?.startsAt ??
            null)
          : null);
      if (auto) {
        payload.finalTime = new Date(auto).toISOString();
        setFinalTime(toLocalInputValue(new Date(auto)));
      }
    }
    try {
      await update({ data: { creatorToken, ...payload } });
      await refresh();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this Rally.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell>Loading…</Shell>;

  if (!rally) {
    return (
      <Shell>
        <h1 className="text-lg font-bold">This link isn’t valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The management link may be mistyped or the Rally was removed.
        </p>
      </Shell>
    );
  }

  const isPoll = rally.timeMode === "poll";
  const openLocation = rally.locationMode === "open";
  const leader = isPoll ? leadingCandidate(rally.candidates, responses) : null;
  const suggestions = responses.flatMap((r) => r.suggestions.map((s) => ({ name: r.name, text: s })));


  async function toggleEdit() {
    if (!editing) {
      setEditing(true);
      return;
    }
    await patch({
      finalTime: finalTime ? new Date(finalTime).toISOString() : null,
      finalLocation: finalLocation.trim() || null,
    });
    setEditing(false);
  }

  const currentRally = rally;
  function responseTime(r: ResponseView): string | null {
    if (isPoll) {
      const c = currentRally.candidates.find((cand) => r.available.includes(cand.id));
      return c ? c.startsAt : null;
    }
    return currentRally.startsAt ?? null;
  }

  async function applyFromResponse(r: ResponseView, opts: { time?: boolean; place?: boolean }) {
    const payload: { finalTime?: string | null; finalLocation?: string | null } = {};
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
      <RallyCard rally={rally} editing={editing} onEdit={() => void toggleEdit()}>

        <div className="space-y-3">
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
                  onClick={() => setFinalTime(toLocalInputValue(new Date(c.startsAt)))}
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
        <h2 className="text-base font-semibold">Share with your friends</h2>
        <button
          type="button"
          onClick={share}
          className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background"
        >
          {copied === "invite" ? "Copied" : "Copy attendee link"}
        </button>

        <details className="text-sm">
          <summary>Private management link</summary>
          <p className="mt-1 break-all text-xs text-muted-foreground">{creatorUrl}</p>
          <button
            type="button"
            onClick={() => copy(creatorUrl, "creator")}
            className="mt-1 border border-border px-3 py-2 text-sm"
          >
            {copied === "creator" ? "Copied" : "Copy management link"}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep this to yourself — anyone with it can manage the Rally.
          </p>
        </details>
      </section>


      <section className="mt-6">
        <h2 className="text-base font-semibold">Responses ({responses.length})</h2>
        {responses.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No responses yet.</p>
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
                          {r.available.includes(c.id) ? "✓" : "✕"} {formatDateTime(c.startsAt)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.note && <p className="mt-1">Note: {r.note}</p>}
                  {r.suggestions.length > 0 && (
                    <p className="mt-1">Location needs: {r.suggestions.join(", ")}</p>
                  )}
                  {(r.timeSuggestions?.length ?? 0) > 0 && (
                    <div className="mt-1">
                      <p className="font-medium">Suggested new times</p>
                      <ul className="mt-1 space-y-1">
                        {(r.timeSuggestions ?? []).map((t) => (
                          <li key={t} className="flex items-center justify-between gap-2">
                            <span>{formatDateTime(t)}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setFinalTime(toLocalInputValue(new Date(t)));
                                void patch({ finalTime: new Date(t).toISOString() });
                              }}
                              className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                            >
                              Use this time
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(time || place) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {time && place && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void applyFromResponse(r, { time: true, place: true })}
                          className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Use as plan
                        </button>
                      )}
                      {time && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void applyFromResponse(r, { time: true })}
                          className="border border-border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Use this time
                        </button>
                      )}
                      {place && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void applyFromResponse(r, { place: true })}
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
            {leader && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const iso = new Date(leader.candidate.startsAt).toISOString();
                  setFinalTime(toLocalInputValue(new Date(leader.candidate.startsAt)));
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
                    {s.text} <span className="text-muted-foreground">({s.name})</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFinalLocation(s.text);
                      void patch({ finalLocation: s.text });
                    }}
                    className="border border-border px-2 py-1 text-xs"
                  >
                    Use
                  </button>

                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-6 space-y-2">
        {error && <p className="text-sm font-medium">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            patch({
              finalTime: finalTime ? new Date(finalTime).toISOString() : null,
              finalLocation: finalLocation.trim() || null,
              status: "confirmed",
            })
          }
          className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
        >
          {rally.status === "confirmed" ? "Plan confirmed" : "Confirm plan"}
        </button>
        {!finalLocation.trim() && (
          <p className="text-xs text-muted-foreground">
            No place set — confirming keeps the location open.
          </p>
        )}

        {rally.status === "confirmed" && (
          <button
            type="button"
            onClick={() =>
              downloadIcs(
                { ...rally, finalTime: finalTime ? new Date(finalTime).toISOString() : null },
                inviteUrl || undefined,
              )
            }
            className="w-full border border-border px-4 py-3 text-sm"
          >
            Add to calendar
          </button>
        )}
      </section>

      <SaveRallySection creatorToken={creatorToken} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-4 py-6">{children}</main>;
}
