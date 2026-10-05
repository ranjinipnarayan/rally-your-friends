import type { CalendarPlace } from "@/lib/places.server";
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
    .replace(/\r\n|\r|\n/g, "\\n");
}

// iCalendar content lines are limited to 75 UTF-8 octets, including the
// continuation space. Fold between characters so Unicode remains intact.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

export function buildIcs(
  rally: RallyView,
  url?: string,
  place?: CalendarPlace,
): string | null {
  const start = rally.finalTime ?? rally.startsAt;
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const location = rally.finalLocation ?? rally.location ?? "";

  const mapsUrl = place
    ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    : location
      ? (rally.mapsUrl ??
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`)
      : null;
  const description = [
    mapsUrl ? `Open in maps: ${mapsUrl}` : null,
    url ? `Rally plan: ${url}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const venue = place ? `${location}\n${place.address}` : location;
  const title = location
    .replace(/\^/g, "^^")
    .replace(/\r\n|\r|\n/g, "^n")
    .replace(/"/g, "^'");
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
    location ? `LOCATION;ALTREP="${mapsUrl}":${escapeText(venue)}` : null,
    place ? `GEO:${place.latitude};${place.longitude}` : null,
    place
      ? `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-APPLE-RADIUS=0;X-TITLE="${title}":geo:${place.latitude},${place.longitude}`
      : null,
    url ? `URL:${url.replace(/[\r\n]/g, "")}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(
  rally: RallyView,
  url?: string,
  place?: CalendarPlace,
) {
  const ics = buildIcs(rally, url, place);
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
