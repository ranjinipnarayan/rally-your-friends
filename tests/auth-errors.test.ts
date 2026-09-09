import { expect, it } from "vitest";
import { signInError, signInCodeError } from "../src/lib/auth-errors";

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

it.each([{ status: 429 }, { code: "over_request_rate_limit" }])(
  "explains verification throttling without encouraging immediate retries",
  (error) => expect(signInCodeError(error)).toContain("try again later"),
);
it("explains expired and consumed codes", () => {
  expect(signInCodeError({ code: "otp_expired" })).toContain(
    "Request a new code",
  );
});
it("does not expose unknown verification error details", () => {
  expect(signInCodeError(new Error("private transport details"))).toBe(
    "Could not verify the code. Check your email and code, then try again.",
  );
});
