import { z } from "zod";

export const tokenSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[a-z0-9]+$/);
const iso = z.string().datetime({ offset: true });
const fields = {
  activity: z.string().trim().max(200),
  timeMode: z.enum(["specific", "poll"]),
  startsAt: iso.nullable(),
  locationMode: z.enum(["specific", "open"]),
  location: z.string().trim().max(200).nullable(),
  candidates: z.array(iso).max(10),
} as const;

export const createRallySchema = z
  .object({
    ...fields,
    status: z.enum(["draft", "open"]).default("open"),
  })
  .strict();

export const updateRallySchema = z
  .object(fields)
  .partial()
  .extend({
    finalTime: iso.nullable().optional(),
    finalLocation: z.string().trim().max(200).nullable().optional(),
    action: z.enum(["save", "publish", "confirm", "cancel"]).default("save"),
  })
  .strict();

export const responseSchema = z
  .object({
    responseId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(60),
    consensus: z
      .enum(["yes", "no", "another_day", "none_work", "some_work"])
      .nullable(),
    available: z.array(z.string().uuid()).max(10),
    note: z.string().trim().max(300).nullable(),
    locationSuggestion: z.string().trim().max(200).nullable(),
    timeSuggestions: z.array(iso).max(3).optional(),
  })
  .strict();

export type CreateRallyInput = z.infer<typeof createRallySchema>;
export type UpdateRallyInput = z.infer<typeof updateRallySchema>;
export type ResponseInput = z.infer<typeof responseSchema>;
