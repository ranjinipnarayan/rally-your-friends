import type { RallyView } from "@/lib/rally-shared";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIcsUtc(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildIcs(rally: RallyView, url?: string): string | null {
  const start = rally.finalTime ?? rally.startsAt;
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const location = rally.finalLocation ?? rally.location ?? "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rally//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:rally-${rally.id}@rally`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(startDate)}`,
    `DTEND:${toIcsUtc(endDate)}`,
    `SUMMARY:${escapeText(rally.activity)}`,
    "CONTACT:help@rally-your-friends.com",
    location ? `LOCATION:${escapeText(location)}` : null,
    url ? `URL:${escapeText(url)}` : null,
    url ? `DESCRIPTION:${escapeText(`Rally plan: ${url}`)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];

  return lines.join("\r\n");
}

export function downloadIcs(rally: RallyView, url?: string) {
  const ics = buildIcs(rally, url);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${rally.activity.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "rally"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
