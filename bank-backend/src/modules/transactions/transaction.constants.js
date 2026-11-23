import { AppError } from "../../utils/AppError.js";

// Types and statuses are owned by the domain class; re-exported here for the module.
export { TRANSACTION_TYPES, TRANSACTION_STATUS } from "../../domain/Transaction.js";

// Exact names of the EXISTING permissions (no new permission is invented).
export const TRANSACTION_PERMISSIONS = Object.freeze({
  DEPOSITS_CREATE: "DEPOSITS_CREATE",
  WITHDRAWALS_CREATE: "WITHDRAWALS_CREATE",
  TRANSFERS_CREATE: "TRANSFERS_CREATE",
  TRANSACTIONS_VIEW: "TRANSACTIONS_VIEW",
  TRANSACTIONS_APPROVE: "TRANSACTIONS_APPROVE",
  TRANSACTIONS_REJECT: "TRANSACTIONS_REJECT",
});

export const PAGINATION = Object.freeze({ DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

/**
 * HTTP-aware error of this module. ASSUMPTION: your errorHandler reads
 * `statusCode`, `code`, `message`. If you have an AppError class, make this
 * class extend it (or replace the body) - nothing else needs to change.
 */

export class TransactionError extends AppError {
  constructor(statusCode, code, message, details = undefined) {
    super(message, statusCode, code, details);
    this.name = "TransactionError";
  }
}


// Read at call time (not import time) so it can be changed in tests.
// absent -> null (no approval) | "0" -> always | "500.00" -> amount >= 500.00
export function getApprovalThreshold() {
  const raw = process.env.TRANSACTION_APPROVAL_THRESHOLD;
  if (raw === undefined || raw.trim() === "") return null;
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new TransactionError(500, "INVALID_CONFIGURATION", "TRANSACTION_APPROVAL_THRESHOLD must be a non-negative amount such as 0 or 500.00");
  }
  return value;
}
