import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { tokenSchema } from "./rally-schema";
import type { NextAction, RallyStatus } from "./rally-shared";

export type SavedRally = {
  id: string;
  creatorToken: string;
  inviteToken: string;
  publicUrl: string;
  activity: string;
  time: string | null;
  location: string | null;
  status: RallyStatus;
  nextAction: NextAction;
  archivedAt: string | null;
  responseCount: number;
  section: "needs_you" | "active" | "past";
};

export const saveRally = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ creatorToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveToAccount } = await import("./rally.server");
    return saveToAccount(data.creatorToken, context.userId);
  });

export const getSavedState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ creatorToken: tokenSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { savedState } = await import("./rally.server");
    return savedState(data.creatorToken, context.userId);
  });

export const listMyRallies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listPlans } = await import("./rally.server");
    return listPlans(context.userId);
  });
