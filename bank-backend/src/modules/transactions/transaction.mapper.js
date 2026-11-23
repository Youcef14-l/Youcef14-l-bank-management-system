import { toCents, fromCents } from "../../domain/money.js";

// Prisma Decimal / string -> "1500.50". Never a JS number, never BigInt.
const money = (v) => (v === null || v === undefined ? null : fromCents(toCents(v)));

const mapAccount = (a) => (a ? { id: a.id, accountNumber: a.accountNumber, currency: a.currency } : null);
const mapEmployee = (e) =>
  e ? { id: e.id, employeeNumber: e.employeeNumber, firstName: e.firstName, lastName: e.lastName } : null;

// `row` = Prisma transaction with the relations selected by the service (no password anywhere).
export function toTransactionDto(row) {
  const source = mapAccount(row.sourceAccount);
  const destination = mapAccount(row.destinationAccount);
  return {
    id: row.id,
    reference: row.reference,
    transactionType: row.transactionType,
    status: row.status,
    amount: money(row.amount),
    fee: money(row.fee),
    currency: (source ?? destination)?.currency ?? null,
    description: row.description ?? null,
    sourceAccount: source,
    destinationAccount: destination,
    initiatedBy: mapEmployee(row.initiatedBy),
    approvedBy: mapEmployee(row.approvedBy),
    approvedAt: row.approvedAt ?? null,
    rejectionReason: row.rejectionReason ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// { id, accountNumber, before, after } (already strings) -> public shape
export const toAccountChangeDto = (c) => ({
  id: c.id, accountNumber: c.accountNumber, previousBalance: c.before, balance: c.after,
});

export const toPaginatedDto = (rows, page, limit, total) => ({
  items: rows.map(toTransactionDto),
  pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
});
