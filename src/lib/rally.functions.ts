import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalSupabaseAuth } from "../integrations/supabase/auth-middleware";
import {
  createRallySchema,
  responseSchema,
  tokenSchema,
  updateRallySchema,
} from "./rally-schema";

export const createRally = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((data: unknown) => createRallySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createPlan } = await import("./rally.server");
    return createPlan(data, context.userId);
  });

export const getInviteView = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ inviteToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { inviteView } = await import("./rally.server");
    return inviteView(data.inviteToken);
  });

export const getMyResponse = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({ inviteToken: tokenSchema, responseId: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { myResponse } = await import("./rally.server");
    return myResponse(data.inviteToken, data.responseId);
  });

export const submitResponse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    responseSchema.extend({ inviteToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { respond } = await import("./rally.server");
    const { inviteToken, ...response } = data;
    return respond(inviteToken, response);
  });

export const getCreatorView = createServerFn({ method: "GET" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ creatorToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { organizerView } = await import("./rally.server");
    return organizerView(context.userId, data);
  });

export const updateRally = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((data: unknown) =>
    updateRallySchema.extend({ creatorToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { managePlan } = await import("./rally.server");
    const { creatorToken, ...patch } = data;
    return managePlan(context.userId, { creatorToken }, patch);
  });

export const deleteRally = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ creatorToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { deletePlan } = await import("./rally.server");
    return deletePlan(context.userId, data);
  });
