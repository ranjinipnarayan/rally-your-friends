import { siteUrl } from "@/lib/site-url";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { TimeStamp } from "@/components/TimeStamp";
import { RallyCard } from "@/components/RallyCard";
import { DeletedRally } from "@/components/DeletedRally";
import { downloadIcs } from "@/lib/ics";
import {
  getInviteView,
  getMyResponse,
  submitResponse,
} from "@/lib/rally.functions";

import {
  CONSENSUS_LABEL,
  STATUS_LABEL,
  type Consensus,
  formatFullDateTime,
  rallyPreview,
  toLocalInputValue,
} from "@/lib/rally-shared";

export const Route = createFileRoute("/r/$inviteToken")({
  loader: async ({ params }) => {
    try {
      return await getInviteView({ data: { inviteToken: params.inviteToken } });
    } catch {
      return { rally: null, responseCount: 0, deleted: false };
    }
  },
  staleTime: 30_000,
  gcTime: 5 * 60_000,

  head: ({ loaderData, params }) => {
    const rally = loaderData?.rally ?? null;
    const { title, description } = rallyPreview(rally);
    const version = rally
      ? rally.updatedAt.replace(/[^a-zA-Z0-9]/g, "").slice(-16)
      : "none";
    const image = rally
      ? siteUrl(`/api/public/og/${params.inviteToken}?v=${version}`)
      : siteUrl("/og.png");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex,nofollow" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },

  component: RecipientPage,
  errorComponent: () => (
    <Shell>
      <h1 className="text-lg font-bold">This link isn’t valid</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Double-check the link you were sent, or ask for a new one.
      </p>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <h1 className="text-lg font-bold">This link isn’t valid</h1>
    </Shell>
  ),
});

const NOTE_HINTS = [
  "Vegetarian",
  "No nuts",
  "Need to leave early",
  "Can't do late nights",
  "Bringing a +1",
  "Prefer somewhere close by",
];

const LOCATION_HINTS = [
  "Needs to be near a subway",
  "Somewhere in Soho",
  "Prefer the UWS",
  "Walking distance from home",
  "Outdoor seating",
  "Needs to be quiet",
];

function storageKey(token: string) {
  return `rally:${token}`;
}

function RecipientPage() {
  const { inviteToken } = Route.useParams();
  return <RecipientResponse key={inviteToken} />;
}

function RecipientResponse() {
  const router = useRouter();
  const { inviteToken } = Route.useParams();
  const view = Route.useLoaderData();
  const { rally } = view;
  const loadMine = useServerFn(getMyResponse);
  const send = useServerFn(submitResponse);

  const [name, setName] = useState("");
  const [responseId, setResponseId] = useState<string | null>(null);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [noneWork, setNoneWork] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [note, setNote] = useState("");
  const [timeIdeas, setTimeIdeas] = useState<string[]>(["", "", ""]);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void router.invalidate();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let stored: string | null;
    try {
      stored = localStorage.getItem(storageKey(inviteToken));
    } catch {
      return;
    }
    if (!stored || !rally) return;
    (async () => {
      const parsed = JSON.parse(stored) as { name: string; responseId: string };
      setName(parsed.name);
      const { response } = await loadMine({
        data: { inviteToken, responseId: parsed.responseId },
      });
      if (cancelled || !response) return;
      setResponseId(response.id);
      setConsensus(response.consensus);
      setAvailable(response.available);
      setNoneWork(response.consensus === "none_work");
      setSuggestion(response.suggestions[0] ?? "");
      setNote(response.note ?? "");
      setTimeIdeas(
        [0, 1, 2].map((i) => {
          const iso = response.timeSuggestions[i];
          return iso ? toLocalInputValue(new Date(iso)) : "";
        }),
      );
      setSaved(true);
      setEditing(false);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  if (!rally) {
    if ("deleted" in view && view.deleted)
      return (
        <Shell>
          <DeletedRally />
        </Shell>
      );
    return (
      <Shell>
        <h1 className="text-lg font-bold">This link isn’t valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Double-check the link you were sent, or ask for a new one.
        </p>
      </Shell>
    );
  }

  const isPoll = rally.timeMode === "poll";
  const openLocation = rally.locationMode === "open";
  const closed = !rally.responsesOpen;
  // Offer new times when the attendee says the current option(s) don't work.
  const wantsNewTimes = isPoll
    ? noneWork
    : consensus === "no" || consensus === "another_day";
  const proposedIso = timeIdeas
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    .map((d) => d.toISOString());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Add your name first.");
      return;
    }
    const resolvedConsensus: Consensus | null = isPoll
      ? noneWork
        ? "none_work"
        : available.length > 0
          ? "some_work"
          : null
      : consensus;
    if (!resolvedConsensus) {
      setError(
        isPoll
          ? "Pick the times that work, or “None of these work”."
          : "Pick an answer.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await send({
        data: {
          inviteToken,
          responseId,
          name: name.trim(),
          consensus: resolvedConsensus,
          available: noneWork ? [] : available,
          note: note.trim() ? note.trim().slice(0, 300) : null,
          locationSuggestion: openLocation ? suggestion.trim() || null : null,
          timeSuggestions: wantsNewTimes ? proposedIso : [],
        },
      });
      setResponseId(result.responseId);
      try {
        localStorage.setItem(
          storageKey(inviteToken),
          JSON.stringify({ name: name.trim(), responseId: result.responseId }),
        );
      } catch {
        // The reply is already saved on the backend; browser storage is optional.
      }
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your response.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold">{rally.activity}</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {STATUS_LABEL[rally.status]}
      </p>
      <RallyCard rally={rally} />

      {rally.status === "confirmed" && (rally.finalTime ?? rally.startsAt) && (
        <button
          type="button"
          onClick={() => downloadIcs(rally, rally.publicUrl)}
          className="mt-4 w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background"
        >
          Add to calendar
        </button>
      )}

      {closed && (
        <p className="mt-4 border border-border p-3 text-sm">
          {rally.status === "confirmed"
            ? "The plan is confirmed. See the final time and place above."
            : rally.status === "cancelled"
              ? "The organizer cancelled this Rally."
              : rally.status === "completed"
                ? "This Rally has ended."
                : "The response window has closed. The organizer can still finalize the plan."}
        </p>
      )}

      {!closed &&
        (saved && !editing ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold">Response saved</p>
            <ul className="text-sm">
              <li>Name: {name}</li>
              <li>
                Answer:{" "}
                {isPoll
                  ? noneWork
                    ? CONSENSUS_LABEL.none_work
                    : available
                        .map((id) =>
                          formatFullDateTime(
                            rally.candidates.find((c) => c.id === id)?.startsAt,
                          ),
                        )
                        .join(", ")
                  : consensus
                    ? CONSENSUS_LABEL[consensus]
                    : "—"}
              </li>
              {openLocation && <li>Location needs: {suggestion || "—"}</li>}
              {note.trim() && <li>Note: {note.trim()}</li>}
              {wantsNewTimes && proposedIso.length > 0 && (
                <li>
                  Times you suggested:{" "}
                  {proposedIso.map((t) => formatFullDateTime(t)).join(", ")}
                </li>
              )}
            </ul>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="border border-border px-3 py-2 text-sm"
            >
              Edit response
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Your name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border px-3 py-2 text-base"
                required
              />
            </label>

            {isPoll ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Which times work?
                </legend>
                {rally.candidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!noneWork && available.includes(c.id)}
                      disabled={noneWork}
                      onChange={(e) =>
                        setAvailable((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <TimeStamp value={c.startsAt} />
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={noneWork}
                    onChange={(e) => {
                      setNoneWork(e.target.checked);
                      if (e.target.checked) setAvailable([]);
                    }}
                  />
                  None of these work
                </label>
              </fieldset>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Does this work?</legend>
                {(["yes", "no", "another_day"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="consensus"
                      checked={consensus === value}
                      onChange={() => setConsensus(value)}
                    />
                    {CONSENSUS_LABEL[value]}
                  </label>
                ))}
              </fieldset>
            )}

            {wantsNewTimes && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Suggest up to three times that do work
                </legend>
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    type="datetime-local"
                    aria-label={`Suggested time ${i + 1}`}
                    value={timeIdeas[i] ?? ""}
                    onChange={(e) =>
                      setTimeIdeas((prev) =>
                        prev.map((v, idx) => (idx === i ? e.target.value : v)),
                      )
                    }
                    className="w-full border border-border px-3 py-2 text-base"
                  />
                ))}
                <p className="text-xs text-muted-foreground">
                  Optional — leave blank to skip.
                </p>
              </fieldset>
            )}

            {openLocation && (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Any location needs? (optional)
                  </span>
                  <textarea
                    value={suggestion}
                    onChange={(e) =>
                      setSuggestion(e.target.value.slice(0, 200))
                    }
                    rows={3}
                    maxLength={200}
                    aria-label="Any location needs? (optional)"
                    placeholder="e.g. need to be in Soho by 4, ideally the UWS, want to try a new wine bar called Demo"
                    className="w-full border border-border px-3 py-2 text-base"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {LOCATION_HINTS.map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() =>
                        setSuggestion((prev) =>
                          (prev.trim()
                            ? `${prev.trim()}, ${hint}`
                            : hint
                          ).slice(0, 200),
                        )
                      }
                      className="rounded-full border border-border px-3 py-1 text-xs"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Anything we should know? (optional)
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={3}
                  maxLength={300}
                  placeholder="e.g. I'm vegetarian, and I have to leave by 9"
                  className="w-full border border-border px-3 py-2 text-base"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {NOTE_HINTS.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() =>
                      setNote((prev) =>
                        (prev.trim() ? `${prev.trim()}, ${hint}` : hint).slice(
                          0,
                          300,
                        ),
                      )
                    }
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>

            <section
              aria-label="Review your response"
              className="border border-border p-3"
            >
              <h2 className="text-sm font-semibold">Review your response</h2>
              <dl className="mt-2 space-y-1 text-sm">
                <div>
                  <dt className="inline font-medium">Name: </dt>
                  <dd className="inline">{name.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Availability: </dt>
                  <dd className="inline">
                    {isPoll
                      ? noneWork
                        ? CONSENSUS_LABEL.none_work
                        : available.length > 0
                          ? rally.candidates
                              .filter((c) => available.includes(c.id))
                              .map((c) => formatFullDateTime(c.startsAt))
                              .join("; ")
                          : "Nothing selected yet"
                      : consensus
                        ? CONSENSUS_LABEL[consensus]
                        : "Nothing selected yet"}
                  </dd>
                </div>
                {wantsNewTimes && (
                  <div>
                    <dt className="inline font-medium">Times you suggest: </dt>
                    <dd className="inline">
                      {proposedIso.length > 0
                        ? proposedIso
                            .map((t) => formatFullDateTime(t))
                            .join("; ")
                        : "None"}
                    </dd>
                  </div>
                )}
                {openLocation && (
                  <div>
                    <dt className="inline font-medium">Location needs: </dt>
                    <dd className="inline">{suggestion.trim() || "None"}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-medium">Note: </dt>
                  <dd className="inline">{note.trim() || "None"}</dd>
                </div>
              </dl>
            </section>

            {error && (
              <p role="alert" className="text-sm font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
            >
              {busy
                ? "Saving…"
                : saved
                  ? "Submit updated response"
                  : "Submit response"}
            </button>
          </form>
        ))}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-4 py-6">{children}</main>;
}
