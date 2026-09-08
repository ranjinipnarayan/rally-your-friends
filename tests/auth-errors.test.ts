import { expect, it } from "vitest";
import { signInError } from "../src/lib/auth-errors";

it.each([
  { status: 429 },
  { code: "over_email_send_rate_limit" },
  { status: 500 },
])("explains temporary email failures", (error) => {
  expect(signInError(error)).toContain("try again later");
});
it("preserves useful validation errors", () => {
  expect(signInError(new Error("Invalid email"))).toBe("Invalid email");
});
