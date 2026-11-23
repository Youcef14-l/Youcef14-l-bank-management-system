import { DomainError } from "./DomainError.js";

// Money is handled as BigInt "cents": 123.45 -> 12345n. No floating point at all.
const MONEY_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

// Accepts a string ("12.50"), a number (12.5) or a Decimal-like object (Prisma Decimal).
export const toCents = (value) => {
  let text;
  if (typeof value === "string") text = value.trim();
  else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
  else if (value && typeof value === "object" && typeof value.toFixed === "function") text = value.toFixed(2);

  const match = text === undefined ? null : MONEY_PATTERN.exec(text);
  if (!match) {
    throw new DomainError("INVALID_AMOUNT", "Amount must be a number with at most 2 decimal places");
  }

  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign ? -cents : cents;
};

// 12345n -> "123.45", -5n -> "-0.05"
export const fromCents = (cents) => {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};