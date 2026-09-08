export type TimeMode = "specific" | "poll";
export type LocationMode = "specific" | "open";
export type RallyStatus =
  "draft" | "open" | "confirmed" | "cancelled" | "completed";
export type NextAction =
  | "waiting_for_responses"
  | "choose_time"
  | "choose_location"
  | "finalize"
  | "none";
export type Consensus =
  "yes" | "no" | "another_day" | "none_work" | "some_work";

export type Candidate = { id: string; startsAt: string };

export type RallyView = {
  id: string;
  activity: string;
  timeMode: TimeMode;
  startsAt: string | null;
  locationMode: LocationMode;
  location: string | null;
  status: RallyStatus;
  nextAction: NextAction;
  archivedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  responsesOpen: boolean;
  publicUrl: string;
  mapsUrl: string | null;
  finalMessage: string | null;
  finalTime: string | null;
  finalLocation: string | null;
  expiresAt: string;
  candidates: Candidate[];
};

export type ResponseView = {
  id: string;
  name: string;
  consensus: Consensus | null;
  note: string | null;
  available: string[];
  suggestions: string[];
  timeSuggestions: string[];
};

export const ACTIVITY_SUGGESTIONS = [
  "Dinner",
  "Coffee",
  "Drinks",
  "Movie",
  "Walk",
];
export const DATE_WINDOWS = ["This week", "This weekend", "Next week"] as const;
export const TIME_OF_DAY = ["Morning", "Afternoon", "Evening"] as const;

export type DateWindow = (typeof DATE_WINDOWS)[number];
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

const VAGUE = [
  "",
  "i don't know",
  "i dont know",
  "idk",
  "not sure",
  "dunno",
  "no idea",
];

export function normalizeActivity(input: string): string {
  const trimmed = input.trim();
  if (VAGUE.includes(trimmed.toLowerCase())) return "Let's hang out";
  return trimmed;
}

const HOUR_BY_TIME_OF_DAY: Record<TimeOfDay, number> = {
  Morning: 10,
  Afternoon: 14,
  Evening: 19,
};

function atHour(base: Date, hour: number) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Three concrete date/time candidates derived from the poll answers. */
export function generateCandidates(
  window: DateWindow,
  timeOfDay: TimeOfDay,
  now: Date = new Date(),
): string[] {
  const hour = HOUR_BY_TIME_OF_DAY[timeOfDay];
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const dates: Date[] = [];

  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  if (window === "This week") {
    dates.push(addDays(1), addDays(2), addDays(3));
  } else if (window === "This weekend") {
    const daysToFri = (5 - day + 7) % 7 || 7;
    dates.push(
      addDays(daysToFri),
      addDays(daysToFri + 1),
      addDays(daysToFri + 2),
    );
  } else {
    const daysToNextMon = (8 - day) % 7 || 7;
    dates.push(
      addDays(daysToNextMon),
      addDays(daysToNextMon + 2),
      addDays(daysToNextMon + 4),
    );
  }

  return dates.map((d) => toLocalInputValue(atHour(d, hour)));
}

/** "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Full, unambiguous label: weekday, date, year, time and timezone name. */
export function formatFullDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** ISO-8601 timestamp including the UTC offset, for <time datetime="…">. */
export function isoWithOffset(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toLocalInputValue(d)}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** IANA timezone of the rendering environment, e.g. "America/New_York". */
export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

export const STATUS_LABEL: Record<RallyStatus, string> = {
  draft: "Draft",
  open: "Open",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  waiting_for_responses: "Waiting for responses",
  choose_time: "Choose time",
  choose_location: "Choose location",
  finalize: "Finalize",
  none: "None",
};

export const CONSENSUS_LABEL: Record<Consensus, string> = {
  yes: "Yes",
  no: "No",
  another_day: "Please choose another day",
  none_work: "None of these work",
  some_work: "Some times work",
};

/** Snapshot of the plan used for link previews in messaging apps. */
export function rallyPreview(rally: RallyView | null | undefined): {
  title: string;
  description: string;
} {
  if (!rally) {
    return {
      title: "Rally invite",
      description: "This link isn’t valid — ask for a new one.",
    };
  }
  const confirmedTime = rally.finalTime ?? rally.startsAt;
  const when = confirmedTime
    ? formatDateTime(confirmedTime)
    : rally.timeMode === "poll" && rally.candidates.length > 0
      ? `${rally.candidates.length} times to pick from`
      : "Time TBD";
  const where = rally.finalLocation ?? rally.location ?? "Place TBD";
  return {
    title: `${rally.activity} · ${when}`,
    description: `${where} — ${rally.status === "confirmed" ? "the plan is confirmed." : rally.status === "cancelled" ? "this plan was cancelled." : rally.status === "completed" ? "this event has passed." : "tap to say if this works for you."}`,
  };
}

export function leadingCandidate(
  candidates: Candidate[],
  responses: ResponseView[],
): { candidate: Candidate; count: number } | null {
  if (candidates.length === 0) return null;
  const counts = candidates.map((c) => ({
    candidate: c,
    count: responses.filter((r) => r.available.includes(c.id)).length,
  }));
  counts.sort(
    (a, b) =>
      b.count - a.count ||
      new Date(a.candidate.startsAt).getTime() -
        new Date(b.candidate.startsAt).getTime(),
  );
  const top = counts[0];
  return top && top.count > 0 ? top : null;
}
