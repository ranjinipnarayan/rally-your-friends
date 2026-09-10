import { expect, it } from "vitest";
import { createRallySchema } from "../src/lib/rally-schema";

it("rejects draft creation", () => {
  expect(
    createRallySchema.safeParse({
      status: "draft",
      activity: "Dinner",
      timeMode: "specific",
      startsAt: "2099-09-10T23:00:00Z",
      candidates: [],
      locationMode: "open",
      location: null,
    }).success,
  ).toBe(false);
});
