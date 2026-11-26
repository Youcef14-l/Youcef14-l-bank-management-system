import { z } from "zod";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./audit.constants.js";

export const listAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.enum(Object.values(AUDIT_ACTIONS)).optional(),
    entityType: z.enum(Object.values(ENTITY_TYPES)).optional(),
    employeeId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && new Date(v.from) > new Date(v.to)) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "La date de début doit précéder la date de fin",
      });
    }
  });