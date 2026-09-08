import { supabaseAdmin } from "./client.server";
import { RallyError } from "../../lib/rally-error";

/** Both web RPCs and native requests authenticate the actual backend user. */
export async function requestUser(request: Request, required = true) {
  const header = request.headers.get("authorization");
  if (!header && !required) return null;
  const token = header?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.split(".").length !== 3) {
    throw new RallyError(
      "unauthorized",
      "Please sign in to manage your Rallies.",
      401,
    );
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new RallyError(
      "unauthorized",
      "Your session has expired. Please sign in again.",
      401,
    );
  }
  return data.user;
}
