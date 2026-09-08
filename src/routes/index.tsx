import { siteUrl } from "@/lib/site-url";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { PlaceInput } from "@/components/PlaceInput";
import { createRally } from "@/lib/rally.functions";
import {
  ACTIVITY_SUGGESTIONS,
  DATE_WINDOWS,
  TIME_OF_DAY,
  type DateWindow,
  type TimeOfDay,
  generateCandidates,
  normalizeActivity,
  toLocalInputValue,
} from "@/lib/rally-shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rally — Make a plan with one link" },
      {
        name: "description",
        content:
          "Rally is a no-account way to plan: pick what, when and where, then share one link so friends reply in seconds.",
      },
      { property: "og:title", content: "Rally — Make a plan with one link" },
      {
        property: "og:description",
        content:
          "Create a plan, share a link, collect replies. No accounts, no app.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: siteUrl("/og.png") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: siteUrl("/og.png") },
    ],
  }),
  component: CreateRallyPage,
});

function CreateRallyPage() {
  const navigate = useNavigate();
  const create = useServerFn(createRally);

  const [activity, setActivity] = useState("");
  const [timeMode, setTimeMode] = useState<"specific" | "poll">("specific");
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [dateWindow, setDateWindow] = useState<DateWindow>("This week");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("Evening");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [locationMode, setLocationMode] = useState<"specific" | "open">(
    "specific",
  );
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function regenerate(w: DateWindow, t: TimeOfDay) {
    setCandidates(generateCandidates(w, t));
  }

  async function createPlan(status: "draft" | "open") {
    setError(null);
    const resolved = normalizeActivity(activity);
    const list = timeMode === "poll" ? candidates.filter(Boolean) : [];
    if (status === "open" && timeMode === "poll" && list.length === 0) {
      setError("Generate at least one time option.");
      return;
    }
    setBusy(true);
    try {
      const result = await create({
        data: {
          activity: resolved,
          status,
          timeMode,
          startsAt:
            timeMode === "specific" && startsAt
              ? new Date(startsAt).toISOString()
              : null,
          locationMode:
            locationMode === "specific" && location.trim()
              ? "specific"
              : "open",
          location:
            locationMode === "specific" ? location.trim() || null : null,
          candidates: list.map((v) => new Date(v).toISOString()),
        },
      });
      navigate({
        to: "/m/$creatorToken",
        params: { creatorToken: result.creatorToken },
        search: { created: true },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold">Rally</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createPlan("open");
        }}
        className="mt-6 space-y-8"
      >
        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">
            1. What are you planning?
          </legend>
          <input
            type="text"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="Dinner, coffee…"
            className="w-full border border-border px-3 py-2 text-base"
          />
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActivity(s)}
                className="border border-border px-2 py-1 text-sm"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActivity(normalizeActivity(""))}
              className={`border border-border px-2 py-1 text-sm ${
                activity === normalizeActivity("")
                  ? "bg-foreground text-background"
                  : ""
              }`}
            >
              Not sure yet
            </button>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold">2. When?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="timeMode"
                checked={timeMode === "specific"}
                onChange={() => setTimeMode("specific")}
              />
              Specific date and time
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="timeMode"
                checked={timeMode === "poll"}
                onChange={() => {
                  setTimeMode("poll");
                  if (candidates.length === 0)
                    regenerate(dateWindow, timeOfDay);
                }}
              />
              Poll
            </label>
          </div>

          {timeMode === "specific" ? (
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="w-full border border-border px-3 py-2 text-base"
            />
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm">When — date?</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DATE_WINDOWS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setDateWindow(w);
                        regenerate(w, timeOfDay);
                      }}
                      className={`border border-border px-2 py-1 text-sm ${
                        dateWindow === w ? "bg-foreground text-background" : ""
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm">When — time-wise?</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TIME_OF_DAY.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTimeOfDay(t);
                        regenerate(dateWindow, t);
                      }}
                      className={`border border-border px-2 py-1 text-sm ${
                        timeOfDay === t ? "bg-foreground text-background" : ""
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm">Time options (editable)</p>
                {candidates.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={c}
                      onChange={(e) =>
                        setCandidates((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? e.target.value : v,
                          ),
                        )
                      }
                      className="w-full border border-border px-3 py-2 text-base"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCandidates((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      className="border border-border px-2 text-sm"
                      aria-label={`Remove option ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => regenerate(dateWindow, timeOfDay)}
                  className="border border-border px-2 py-1 text-sm"
                >
                  Regenerate 3 options
                </button>
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold">3. Where?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="locationMode"
                checked={locationMode === "specific"}
                onChange={() => setLocationMode("specific")}
              />
              Specific location
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="locationMode"
                checked={locationMode === "open"}
                onChange={() => setLocationMode("open")}
              />
              Leave open
            </label>
          </div>
          {locationMode === "specific" && (
            <PlaceInput
              value={location}
              onChange={setLocation}
              placeholder="Search a place or address"
              ariaLabel="Where?"
            />
          )}
        </fieldset>

        {error && <p className="text-sm font-medium">{error}</p>}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-border bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create Rally"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createPlan("draft")}
            className="w-full border border-border px-4 py-3 text-sm disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
      </form>
    </main>
  );
}
