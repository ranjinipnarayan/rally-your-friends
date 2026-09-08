import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const optionalSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const { requestUser } = await import("./session.server");
  const user = await requestUser(getRequest(), false);
  return next({ context: { userId: user?.id ?? null } });
});

export const requireSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const { requestUser } = await import("./session.server");
  const user = await requestUser(getRequest());
  return next({ context: { userId: user!.id } });
});
