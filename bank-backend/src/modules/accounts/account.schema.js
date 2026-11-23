import { z } from "zod";

const ACCOUNT_TYPES = ["COURANT", "EPARGNE"];
const ACCOUNT_STATUSES = ["ACTIF", "BLOQUE", "FERME"];
const CURRENCIES = ["DZD", "EUR", "USD"];

/* ---------- Reusable fields ---------- */

const uuid = (label) => z.string().uuid(`${label} must be a valid UUID`);

// A money amount: number or string, >= 0, at most 2 decimals. Returned as a STRING
// ("10000"), never as a float, so no precision is lost before reaching the database.
const moneyAmount = z
  .union([z.number(), z.string().trim()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Amount must be a non-negative number with at most 2 decimals"));

// Percentage 0..100 with at most 4 decimals (database column is Decimal(7,4)).
const interestRate = z
  .union([z.number(), z.string().trim()])
  .transform((value) => String(value))
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, "Interest rate must have at most 4 decimals")
      .refine((value) => Number(value) <= 100, "Interest rate must be between 0 and 100")
  );

const currency = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(CURRENCIES, { message: `Currency must be one of: ${CURRENCIES.join(", ")}` }));

const accountType = z.enum(ACCOUNT_TYPES, { message: "Account type must be COURANT or EPARGNE" });
const accountStatus = z.enum(ACCOUNT_STATUSES, { message: "Status must be ACTIF, BLOQUE or FERME" });

/* ---------- Create account (declarative: one schema per account type) ---------- */

// .strict() rejects every unknown key: bankId, balance, status, id, and fields of the other type.
const courantSchema = z
  .object({
    customerId: uuid("customerId"),
    accountType: z.literal("COURANT"),
    currency: currency.default("DZD"),
    overdraftLimit: moneyAmount.default("0"),
  })
  .strict();

const epargneSchema = z
  .object({
    customerId: uuid("customerId"),
    accountType: z.literal("EPARGNE"),
    currency: currency.default("DZD"),
    interestRate: interestRate.default("0"),
    minimumBalance: moneyAmount.default("0"),
  })
  .strict();

export const createAccountSchema = z.discriminatedUnion("accountType", [courantSchema, epargneSchema]);

/* ---------- Params ---------- */

export const accountIdParamSchema = z.object({ id: uuid("Account id") }).strict();
export const customerAccountsParamSchema = z.object({ customerId: uuid("Customer id") }).strict();

/* ---------- Queries ---------- */

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const listAccountsQuerySchema = z
  .object({
    ...pagination,
    search: z.string().trim().max(50).optional(), // matches the account number
    accountType: accountType.optional(),
    status: accountStatus.optional(),
    customerId: uuid("customerId").optional(),
  })
  .strict();

export const listCustomerAccountsQuerySchema = z
  .object({
    accountType: accountType.optional(),
    status: accountStatus.optional(),
  })
  .strict();