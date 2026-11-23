import { z } from "zod";
import { TRANSACTION_STATUS, TRANSACTION_TYPES, PAGINATION, TransactionError } from "./transaction.constants.js";

// Money: decimal string, max 2 decimals, > 0. A JS number is converted to text first
// (never used in arithmetic); odd values such as 1e21 or 0.1000001 are rejected.
const amount = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z.string({ required_error: "amount is required", invalid_type_error: "amount must be a decimal string" })
    .trim()
    .regex(/^\d{1,17}(\.\d{1,2})?$/, "amount must be a positive decimal with at most 2 decimals")
    .refine((v) => /[1-9]/.test(v), "amount must be greater than zero")
);
const uuid = z.string().uuid("must be a valid UUID");
const description = z.string().trim().max(255).optional().transform((v) => (v ? v : undefined));

// .strict(): unknown fields (bankId, status, fee, employeeId, balance...) are REJECTED -> no mass assignment.
export const depositSchema = z.object({ accountId: uuid, amount, description }).strict();
export const withdrawalSchema = z.object({ accountId: uuid, amount, description }).strict();
export const transferSchema = z.object({ sourceAccountId: uuid, destinationAccountId: uuid, amount, description }).strict();
export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export const emptyBodySchema = z.object({}).strict();

export const idParamSchema = uuid;
export const referenceParamSchema = z.string().trim().min(1).max(100);
export const idempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(Object.values(TRANSACTION_STATUS)).optional(),
  type: z.enum(Object.values(TRANSACTION_TYPES)).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();

// Parses `data` or throws a 400 TransactionError listing every problem.
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  throw new TransactionError(400, "VALIDATION_ERROR", "Validation failed", details);
}
