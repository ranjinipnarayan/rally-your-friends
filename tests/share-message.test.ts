import { expect, it } from "vitest";
import { formatFinalMessage } from "../src/lib/rally-shared";
it("shares the final plan in the organizer timezone with its daylight-saving abbreviation", () => {
  const message = formatFinalMessage(
    "Let's hang out",
    "2026-10-06T23:00:00Z",
    "le vin couer",
    "https://rally-your-friends.com/r/example",
    "America/New_York",
  );
  expect(message).toContain("Tuesday, October 6, 2026 at 7:00 PM EDT");
  expect(message).not.toContain("UTC");
  expect(message).toContain(
    "le vin couer\nhttps://rally-your-friends.com/r/example",
  );
});
it("uses standard time for a winter event", () => {
  expect(
    formatFinalMessage(
      "Dinner",
      "2026-12-06T23:00:00Z",
      "Cafe",
      "https://example.com",
      "America/New_York",
    ),
  ).toContain("6:00 PM EST");
});
