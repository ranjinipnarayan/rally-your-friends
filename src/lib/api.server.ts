import { z } from "zod";
import { requestUser } from "../integrations/supabase/session.server";
import { createRallySchema, updateRallySchema } from "./rally-schema";
import { RallyError } from "./rally-error";
import {
  createPlan,
  deletePlan,
  listPlans,
  managePlan,
  organizerView,
} from "./rally.server";

const MAX_BODY_BYTES = 16_384;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extra,
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new RallyError(
      "unsupported_media_type",
      "Send an application/json body.",
      415,
    );
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new RallyError("payload_too_large", "The request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RallyError("invalid_json", "A JSON body is required.");
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RallyError(
          "payload_too_large",
          "The request is too large.",
          413,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RallyError("invalid_json", "The body must contain valid JSON.");
  }
}

/** Stable JSON API for the organizer app and extension. Never authenticates cookies. */
export async function handleApi(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    const detail = path.match(/^\/api\/v1\/rallies\/([^/]+)$/);
    const collection = path === "/api/v1/rallies";
    const me = path === "/api/v1/me";
    if (!collection && !detail && !me)
      return json(
        { error: { code: "not_found", message: "Endpoint not found." } },
        404,
      );
    const allowed = collection
      ? ["GET", "POST"]
      : me
        ? ["GET"]
        : ["GET", "PATCH", "DELETE"];
    if (!allowed.includes(request.method)) {
      return json(
        {
          error: { code: "method_not_allowed", message: "Method not allowed." },
        },
        405,
        { Allow: allowed.join(", ") },
      );
    }
    // Cross-site forms cannot supply this header, and this API grants no CORS access.
    const user = (await requestUser(request))!;
    if (me) return json({ user: { id: user.id, email: user.email ?? null } });
    if (collection) {
      if (request.method === "GET") return json(await listPlans(user.id));
      const input = createRallySchema.parse(await readJson(request));
      const created = await createPlan(input, user.id);
      return json(created, 201, { Location: `/api/v1/rallies/${created.id}` });
    }
    const id = z.string().uuid().parse(detail![1]);
    if (request.method === "DELETE") {
      await deletePlan(user.id, { id });
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (request.method === "PATCH") {
      const patch = updateRallySchema.parse(await readJson(request));
      await managePlan(user.id, { id }, patch);
    }
    const view = await organizerView(user.id, { id });
    if (!view.rally)
      throw new RallyError(
        "not_found",
        "This Rally isn't in your account.",
        404,
      );
    return json(view);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Check the request fields.",
            fields: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
    if (error instanceof RallyError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    // Do not log request URLs, bearer tokens, or database error details.
    console.error("Rally API request failed");
    return json(
      {
        error: {
          code: "unavailable",
          message: "Rally is temporarily unavailable. Please try again.",
        },
      },
      503,
    );
  }
}
