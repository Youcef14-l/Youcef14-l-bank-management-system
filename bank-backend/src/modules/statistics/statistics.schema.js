import { z } from "zod";

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

export const statisticsQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    // minutes, same sign as JS Date.getTimezoneOffset() (UTC+1 => -60)
    tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .superRefine((v, ctx) => {
    const from = new Date(v.from).getTime();
    const to = new Date(v.to).getTime();
    if (from > to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "La date de début doit précéder la date de fin",
      });
    } else if ((to - from) / DAY_MS > MAX_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `La période ne peut pas dépasser ${MAX_DAYS} jours`,
      });
    }
  })
  .transform((v) => ({
    from: new Date(v.from),
    to: new Date(v.to),
    tzOffset: v.tzOffset,
  }));