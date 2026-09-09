export function signInError(error: unknown): string {
  if (error && typeof error === "object") {
    const { status, code } = error as { status?: number; code?: string };
    if (
      status === 429 ||
      status === 500 ||
      code === "over_email_send_rate_limit" ||
      code === "over_request_rate_limit" ||
      code === "unexpected_failure"
    ) {
      return "Sign-in emails are temporarily unavailable. Please try again later.";
    }
  }
  return error instanceof Error
    ? error.message
    : "Could not send the email. Please try again later.";
}

export function signInCodeError(error: unknown): string {
  const { status, code } = (
    error && typeof error === "object" ? error : {}
  ) as {
    status?: number;
    code?: string;
  };
  if (status === 429 || code === "over_request_rate_limit") {
    return "Too many sign-in attempts. Please try again later.";
  }
  if (code === "otp_expired" || code === "otp_disabled") {
    return "That code is invalid, expired, or already used. Request a new code and try again.";
  }
  return "Could not verify the code. Check your email and code, then try again.";
}
