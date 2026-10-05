import { describe, expect, it } from "vitest";
import { buildIcs } from "../src/lib/ics";
import type { RallyView } from "../src/lib/rally-shared";

const rally: RallyView = {
  id: "calendar-test",
  activity: "Dinner",
  timeMode: "specific",
  startsAt: "2099-06-15T18:00:00Z",
  locationMode: "specific",
  location: "Original venue",
  status: "confirmed",
  nextAction: "none",
  archivedAt: null,
  publishedAt: "2099-06-01T18:00:00Z",
  updatedAt: "2099-06-01T18:00:00Z",
  responsesOpen: false,
  publicUrl: "https://rally-your-friends.com/r/calendar-test",
  mapsUrl: null,
  finalMessage: null,
  finalTime: "2099-06-16T18:00:00Z",
  finalLocation: "Le Vin, Cœur; New York",
  expiresAt: "2099-07-01T18:00:00Z",
  candidates: [],
};
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("calendar export", () => {
  it("links the final venue in the location and notes while keeping the rally link", () => {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rally.finalLocation!)}`;
    const ics = unfold(buildIcs(rally, rally.publicUrl)!);
    expect(ics).toContain(
      `LOCATION;ALTREP="${maps}":Le Vin\\, Cœur\\; New York\r\n`,
    );
    expect(ics).toContain(
      `DESCRIPTION:Open in maps: ${maps}\\n\\nRally plan: ${rally.publicUrl}`,
    );
    expect(ics).toContain(`URL:${rally.publicUrl}\r\n`);
    expect(ics).toContain("DTSTART:20990616T180000Z");
  });
  it("includes a physical location with coordinates for Apple Calendar", () => {
    const ics = unfold(
      buildIcs(rally, rally.publicUrl, {
        address: "123 Main Street, New York",
        latitude: 40.7,
        longitude: -74,
      })!,
    );
    expect(ics).toContain("GEO:40.7;-74\r\n");
    expect(ics).toContain(
      'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-APPLE-RADIUS=0;X-TITLE="Le Vin, Cœur; New York":geo:40.7,-74\r\n',
    );
    expect(ics).toContain(
      "Le Vin\\, Cœur\\; New York\\n123 Main Street\\, New York\r\n",
    );
  });
  it("uses the existing map URL and includes it even without a rally URL", () => {
    const mapsUrl =
      "https://www.google.com/maps/search/?api=1&query=venue&query_place_id=abc";
    expect(unfold(buildIcs({ ...rally, mapsUrl })!)).toContain(
      `DESCRIPTION:Open in maps: ${mapsUrl}\r\n`,
    );
  });
  it("omits map fields when the location is still open", () => {
    const ics = unfold(
      buildIcs({
        ...rally,
        location: null,
        finalLocation: null,
        mapsUrl: null,
      })!,
    );
    expect(ics).not.toContain("LOCATION");
    expect(ics).not.toContain("Open in maps");
  });
  it("folds long UTF-8 lines without losing venue text or URLs", () => {
    const activity = "Café 🏁 ".repeat(30);
    const ics = buildIcs({ ...rally, activity }, rally.publicUrl)!;
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain(`SUMMARY:${activity}\r\n`);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});
