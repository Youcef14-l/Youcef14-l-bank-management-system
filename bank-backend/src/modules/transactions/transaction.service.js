import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { DomainError } from "../../domain/DomainError.js";
import { Transaction } from "../../domain/Transaction.js";
import { CompteCourant } from "../../domain/CompteCourant.js";
import { CompteEpargne } from "../../domain/CompteEpargne.js";
import { performWithdrawal } from "../../domain/CompteBancaire.js";
import { toCents, fromCents } from "../../domain/money.js";
import { recordAudit } from "../audit/audit.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../audit/audit.constants.js";
import { TRANSACTION_TYPES, TRANSACTION_STATUS, PAGINATION, TransactionError, getApprovalThreshold } from "./transaction.constants.js";
import { toTransactionDto, toAccountChangeDto, toPaginatedDto } from "./transaction.mapper.js";
import { emitTransactionEvent, TRANSACTION_EVENTS } from "./transaction.events.js";

/* ============================ Configuration ============================ */

// ReadCommitted + explicit row locks (SELECT ... FOR UPDATE) = serialised access to the
// accounts being changed. Interactive transactions need a session-stable connection: with the
// Supabase pooler (port 6543, pgbouncer transaction mode) this works because Prisma holds ONE
// connection for the whole callback; DATABASE_URL must contain ?pgbouncer=true.
const TX_OPTIONS = { maxWait: 5000, timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

const ACCOUNT_BRIEF = { id: true, accountNumber: true, currency: true };
const EMPLOYEE_BRIEF = { id: true, employeeNumber: true, firstName: true, lastName: true };
const TX_INCLUDE = {
  sourceAccount: { select: ACCOUNT_BRIEF },
  destinationAccount: { select: ACCOUNT_BRIEF },
  initiatedBy: { select: EMPLOYEE_BRIEF },
  approvedBy: { select: EMPLOYEE_BRIEF },
};

const HTTP_STATUS_BY_DOMAIN_CODE = {
  INVALID_AMOUNT: 400, INVALID_TRANSACTION_TYPE: 400, INVALID_TRANSACTION_ACCOUNTS: 400,
  SAME_ACCOUNT_TRANSFER: 400, REJECTION_REASON_REQUIRED: 400, INVALID_TRANSACTION: 400,
  SELF_APPROVAL_FORBIDDEN: 403, INVALID_TRANSACTION_STATE: 409,
  INSUFFICIENT_FUNDS: 422, ACCOUNT_NOT_ACTIVE: 422,
};

// The domain knows nothing about HTTP: the service translates DomainError -> TransactionError.
const toApiError = (e) =>
  e instanceof DomainError ? new TransactionError(HTTP_STATUS_BY_DOMAIN_CODE[e.code] ?? 422, e.code, e.message) : e;

const notFound = () => new TransactionError(404, "NOT_FOUND", "Resource not found");
const accountNotFound = () => new TransactionError(404, "ACCOUNT_NOT_FOUND", "Account not found");
const money = (v) => fromCents(toCents(v));

/* ============================ Bank isolation ============================ */

// Deposits: destination in bank. Withdrawals: source in bank. Transfers: BOTH in bank.
const bankScope = (bankId) => ({
  OR: [
    { transactionType: TRANSACTION_TYPES.DEPOT, destinationAccount: { bankId } },
    { transactionType: TRANSACTION_TYPES.RETRAIT, sourceAccount: { bankId } },
    { transactionType: TRANSACTION_TYPES.VIREMENT, sourceAccount: { bankId }, destinationAccount: { bankId } },
  ],
});

const findScoped = (client, bankId, extraWhere) =>
  client.transaction.findFirst({ where: { AND: [extraWhere, bankScope(bankId)] }, include: TX_INCLUDE });

/* ============================ Account helpers ============================ */

// Locks the accounts (sorted ids -> same order for everybody -> no deadlock) and re-reads them.
// The lock query is restricted to the employee's bank: an account of another bank is simply
// "not found" (its existence is never revealed, and it is never locked).
async function lockAndLoadAccounts(tx, ids, bankId) {
  const unique = [...new Set(ids)].sort();
  const idList = Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`));
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM accounts WHERE "bankId" = ${bankId}::uuid AND id IN (${idList}) ORDER BY id FOR UPDATE`
  );
  // Fresh read AFTER the lock is held: balances cannot change under us any more.
  const rows = await tx.account.findMany({ where: { id: { in: unique }, bankId } });
  if (rows.length !== unique.length) throw accountNotFound();
  return new Map(rows.map((r) => [r.id, r]));
}

// Builds the right domain class from the accountType discriminator; nullable columns get safe defaults.
function toDomainAccount(row) {
  const common = {
    id: row.id, accountNumber: row.accountNumber, balance: row.balance, currency: row.currency,
    status: row.status, customerId: row.customerId, closedAt: row.closedAt,
  };
  if (row.accountType === "COURANT") {
    return new CompteCourant({ ...common, overdraftLimit: row.overdraftLimit ?? "0" });
  }
  return new CompteEpargne({
    ...common,
    interestRate: row.interestRate === null || row.interestRate === undefined ? "0" : row.interestRate.toFixed(4),
    minimumBalance: row.minimumBalance ?? "0",
  });
}

const assertAccountsActive = (rows) => {
  for (const row of rows.values()) {
    if (!toDomainAccount(row).isActive()) {
      throw new DomainError("ACCOUNT_NOT_ACTIVE", `Operation refused: account ${row.accountNumber} is ${row.status}`);
    }
  }
};

/**
 * Applies the movement with the DOMAIN classes, then writes the new balances.
 * All business rules (overdraft, minimum balance, active status) run first, in memory:
 * if one fails, a DomainError is thrown BEFORE any account row is written.
 */
async function executeMovement(tx, domainTx, rows) {
  const sourceRow = domainTx.sourceAccountId ? rows.get(domainTx.sourceAccountId) : null;
  const destRow = domainTx.destinationAccountId ? rows.get(domainTx.destinationAccountId) : null;
  const source = sourceRow ? toDomainAccount(sourceRow) : null;
  const destination = destRow ? toDomainAccount(destRow) : null;

  if (source) performWithdrawal(source, domainTx.amount); // polymorphic: Courant vs Epargne rule
  if (destination) destination.deposit(domainTx.amount);

  const changes = [];
  for (const [row, domain] of [[sourceRow, source], [destRow, destination]]) {
    if (!domain) continue;
    await tx.account.update({ where: { id: row.id }, data: { balance: domain.getBalance() } });
    changes.push({ id: row.id, accountNumber: row.accountNumber, before: money(row.balance), after: domain.getBalance() });
  }
  return changes;
}

/* ============================ Misc helpers ============================ */

// Idempotent requests: reference = hash(employeeId + key) -> scoped per employee, key never stored/logged raw.
const deriveReference = (employeeId, key) =>
  `IDEM-${createHash("sha256").update(`${employeeId}:${key}`).digest("hex").slice(0, 40)}`;
const newReference = () => `TXN-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;

const fingerprint = ({ type, amount, source, destination, description }) =>
  JSON.stringify([type, money(amount), source ?? null, destination ?? null, description ?? null]);
const fingerprintOfRow = (r) =>
  fingerprint({ type: r.transactionType, amount: r.amount, source: r.sourceAccountId, destination: r.destinationAccountId, description: r.description });

// Same key + same details -> original transaction. Same key + other details -> 409.
function replay(row, wantedFingerprint) {
  if (fingerprintOfRow(row) !== wantedFingerprint) {
    throw new TransactionError(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with different operation details");
  }
  return { transaction: toTransactionDto(row), accounts: [], replayed: true };
}

const auditTx = (tx, user, ctx, { action, transactionId, description, oldValues, newValues }) =>
  recordAudit(tx, {
    employeeId: user.id, action, entityType: ENTITY_TYPES.TRANSACTION, entityId: transactionId,
    description, oldValues, newValues, ipAddress: ctx.ipAddress,
  });

const COMPLETED_EVENT = {
  [TRANSACTION_TYPES.DEPOT]: TRANSACTION_EVENTS.DEPOSIT_COMPLETED,
  [TRANSACTION_TYPES.RETRAIT]: TRANSACTION_EVENTS.WITHDRAWAL_COMPLETED,
  [TRANSACTION_TYPES.VIREMENT]: TRANSACTION_EVENTS.TRANSFER_COMPLETED,
};
const COMPLETED_AUDIT = {
  [TRANSACTION_TYPES.DEPOT]: AUDIT_ACTIONS.DEPOSIT_COMPLETED,
  [TRANSACTION_TYPES.RETRAIT]: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
  [TRANSACTION_TYPES.VIREMENT]: AUDIT_ACTIONS.TRANSFER_COMPLETED,
};

const eventPayload = (row, user, extra = {}) => ({
  transactionId: row.id, reference: row.reference, transactionType: row.transactionType,
  amount: money(row.amount), status: row.status, bankId: user.bankId, employeeId: user.id, ...extra,
});

// Persists exactly the state fields owned by the domain object.
const persistState = (tx, id, domainTx) => {
  const p = domainTx.toPersistence();
  return tx.transaction.update({
    where: { id },
    data: { status: p.status, approvedById: p.approvedById, approvedAt: p.approvedAt, rejectionReason: p.rejectionReason, completedAt: p.completedAt },
    include: TX_INCLUDE,
  });
};

/* ============================ CREATE (deposit / withdrawal / transfer) ============================ */

async function runCreate(tx, user, spec, ctx, reference, threshold, wanted, key) {
  const ids = [spec.sourceAccountId, spec.destinationAccountId].filter(Boolean);
  const rows = await lockAndLoadAccounts(tx, ids, user.bankId);

  // Concurrent duplicate: we waited for the lock, so the first request has now committed.
  if (key) {
    const prior = await tx.transaction.findUnique({ where: { reference }, include: TX_INCLUDE });
    if (prior) return { replayed: true, row: prior };
  }

  if (spec.transactionType === TRANSACTION_TYPES.VIREMENT) {
    const [a, b] = [rows.get(spec.sourceAccountId), rows.get(spec.destinationAccountId)];
    if (a.currency !== b.currency) {
      throw new TransactionError(422, "CURRENCY_MISMATCH", "Source and destination accounts must use the same currency");
    }
  }

  const domainTx = new Transaction({
    reference, transactionType: spec.transactionType, amount: spec.amount, description: spec.description,
    sourceAccountId: spec.sourceAccountId, destinationAccountId: spec.destinationAccountId, initiatedById: user.id,
  });

  if (domainTx.requiresApproval(threshold)) {
    // No balance is touched. Funds are re-checked when the director approves.
    assertAccountsActive(rows);
    const row = await tx.transaction.create({ data: domainTx.toPersistence(), include: TX_INCLUDE });
    await auditTx(tx, user, ctx, {
      action: AUDIT_ACTIONS.TRANSACTION_PENDING, transactionId: row.id,
      description: `${row.transactionType} of ${domainTx.amount} created, waiting for approval`,
      newValues: { reference, status: row.status, amount: domainTx.amount, threshold },
    });
    return { row, changes: [], pending: true };
  }

  const changes = await executeMovement(tx, domainTx, rows);
  domainTx.complete();
  const row = await tx.transaction.create({ data: domainTx.toPersistence(), include: TX_INCLUDE });
  await auditTx(tx, user, ctx, {
    action: COMPLETED_AUDIT[row.transactionType], transactionId: row.id,
    description: `${row.transactionType} of ${domainTx.amount} completed`,
    oldValues: { balances: changes.map((c) => ({ account: c.accountNumber, balance: c.before })) },
    newValues: { reference, status: row.status, amount: domainTx.amount, balances: changes.map((c) => ({ account: c.accountNumber, balance: c.after })) },
  });
  return { row, changes };
}

async function createOperation(user, spec, ctx = {}) {
  const key = ctx.idempotencyKey ?? null;
  const reference = key ? deriveReference(user.id, key) : newReference();
  const threshold = getApprovalThreshold();
  const wanted = fingerprint({
    type: spec.transactionType, amount: spec.amount, source: spec.sourceAccountId,
    destination: spec.destinationAccountId, description: spec.description,
  });

  // 1) Fast path: identical retry of a finished request.
  if (key) {
    const prior = await prisma.transaction.findUnique({ where: { reference }, include: TX_INCLUDE });
    if (prior) return replay(prior, wanted);
  }

  let outcome;
  try {
    outcome = await prisma.$transaction((tx) => runCreate(tx, user, spec, ctx, reference, threshold, wanted, key), TX_OPTIONS);
  } catch (error) {
    // 3) Safety net: unique(reference) violated by a racing duplicate.
    if (key && error?.code === "P2002") {
      const prior = await prisma.transaction.findUnique({ where: { reference }, include: TX_INCLUDE });
      if (prior) return replay(prior, wanted);
    }
    throw toApiError(error);
  }

  // 2) Duplicate detected inside the transaction (after the lock).
  if (outcome.replayed) return replay(outcome.row, wanted);

  // Events ONLY after the commit.
  if (!outcome.pending) {
    emitTransactionEvent(COMPLETED_EVENT[outcome.row.transactionType], eventPayload(outcome.row, user));
  }
  return { transaction: toTransactionDto(outcome.row), accounts: outcome.changes.map(toAccountChangeDto), replayed: false };
}

export const createDeposit = (user, { accountId, amount, description }, ctx) =>
  createOperation(user, { transactionType: TRANSACTION_TYPES.DEPOT, destinationAccountId: accountId, amount, description }, ctx);

export const createWithdrawal = (user, { accountId, amount, description }, ctx) =>
  createOperation(user, { transactionType: TRANSACTION_TYPES.RETRAIT, sourceAccountId: accountId, amount, description }, ctx);

export const createTransfer = (user, { sourceAccountId, destinationAccountId, amount, description }, ctx) =>
  createOperation(user, { transactionType: TRANSACTION_TYPES.VIREMENT, sourceAccountId, destinationAccountId, amount, description }, ctx);

/* ============================ APPROVE ============================ */

export async function approveTransaction(user, id, ctx = {}) {
  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const found = await findScoped(tx, user.bankId, { id });
      if (!found) throw notFound();

      // Lock the transaction row: two directors clicking at once are serialised.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM transactions WHERE id = ${id}::uuid FOR UPDATE`);
      const row = await tx.transaction.findUnique({ where: { id } }); // fresh status after the lock
      const domainTx = Transaction.fromPersistence(row);
      domainTx.approve(user.id); // PENDING only + initiator cannot approve (DomainError)

      const ids = [row.sourceAccountId, row.destinationAccountId].filter(Boolean);
      const rows = await lockAndLoadAccounts(tx, ids, user.bankId);

      let changes;
      try {
        if (row.transactionType === TRANSACTION_TYPES.VIREMENT) {
          const [a, b] = [rows.get(row.sourceAccountId), rows.get(row.destinationAccountId)];
          if (a.currency !== b.currency) throw new DomainError("CURRENCY_MISMATCH", "Source and destination accounts must use the same currency");
        }
        assertAccountsActive(rows); // accounts may have been BLOCKED / CLOSED since the transaction was created
        changes = await executeMovement(tx, domainTx, rows); // re-checks balance rules NOW
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        // The rule is no longer satisfied. No balance was written (domain checks run first).
        // We RETURN (not throw) so this transaction COMMITS the FAILED status + audit.
        domainTx.fail(e.message);
        const failedRow = await persistState(tx, id, domainTx);
        await auditTx(tx, user, ctx, {
          action: AUDIT_ACTIONS.TRANSACTION_FAILED, transactionId: id,
          description: `Execution failed at approval: ${e.message}`,
          newValues: { status: failedRow.status, reason: e.message, code: e.code, amount: money(row.amount) },
        });
        return { failed: true, row: failedRow, reason: e.message, code: e.code };
      }

      domainTx.complete(); // APPROVED -> COMPLETED, persisted in ONE update (no separate APPROVED commit)
      const doneRow = await persistState(tx, id, domainTx);
      await auditTx(tx, user, ctx, {
        action: AUDIT_ACTIONS.TRANSACTION_APPROVED, transactionId: id,
        description: `${doneRow.transactionType} of ${money(doneRow.amount)} approved and completed`,
        oldValues: { status: row.status, balances: changes.map((c) => ({ account: c.accountNumber, balance: c.before })) },
        newValues: { status: doneRow.status, approvedById: user.id, balances: changes.map((c) => ({ account: c.accountNumber, balance: c.after })) },
      });
      return { row: doneRow, changes };
    }, TX_OPTIONS);
  } catch (error) {
    throw toApiError(error);
  }

  if (outcome.failed) {
    emitTransactionEvent(TRANSACTION_EVENTS.FAILED, eventPayload(outcome.row, user, { reason: outcome.reason }));
    throw new TransactionError(422, outcome.code ?? "TRANSACTION_FAILED", `Transaction failed: ${outcome.reason}`, {
      transactionId: outcome.row.id, status: TRANSACTION_STATUS.FAILED,
    });
  }
  emitTransactionEvent(TRANSACTION_EVENTS.APPROVED, eventPayload(outcome.row, user));
  emitTransactionEvent(COMPLETED_EVENT[outcome.row.transactionType], eventPayload(outcome.row, user));
  return { transaction: toTransactionDto(outcome.row), accounts: outcome.changes.map(toAccountChangeDto) };
}

/* ============================ REJECT ============================ */

export async function rejectTransaction(user, id, { reason }, ctx = {}) {
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const found = await findScoped(tx, user.bankId, { id });
      if (!found) throw notFound();
      await tx.$queryRaw(Prisma.sql`SELECT id FROM transactions WHERE id = ${id}::uuid FOR UPDATE`);
      const fresh = await tx.transaction.findUnique({ where: { id } });
      const domainTx = Transaction.fromPersistence(fresh);
      domainTx.reject(user.id, reason); // approvedById stays null; no balance touched
      const rejected = await persistState(tx, id, domainTx);
      await auditTx(tx, user, ctx, {
        action: AUDIT_ACTIONS.TRANSACTION_REJECTED, transactionId: id,
        description: `${rejected.transactionType} of ${money(rejected.amount)} rejected`,
        oldValues: { status: fresh.status },
        newValues: { status: rejected.status, rejectedById: user.id, reason: rejected.rejectionReason },
      });
      return rejected;
    }, TX_OPTIONS);
  } catch (error) {
    throw toApiError(error);
  }
  emitTransactionEvent(TRANSACTION_EVENTS.REJECTED, eventPayload(row, user, { reason: row.rejectionReason }));
  return { transaction: toTransactionDto(row) };
}

/* ============================ READ ============================ */

async function paginate(user, extraWhere, query) {
  const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, status, type, from, to } = query;
  const filters = [extraWhere, bankScope(user.bankId)];
  if (status) filters.push({ status });
  if (type) filters.push({ transactionType: type });
  if (from || to) filters.push({ createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } });
  const where = { AND: filters };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({ where, include: TX_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.transaction.count({ where }),
  ]);
  return toPaginatedDto(rows, page, limit, total);
}

export const listTransactions = (user, query) => paginate(user, {}, query);

export async function getTransactionById(user, id) {
  const row = await findScoped(prisma, user.bankId, { id });
  if (!row) throw notFound();
  return { transaction: toTransactionDto(row) };
}

export async function getTransactionByReference(user, reference) {
  const row = await findScoped(prisma, user.bankId, { reference });
  if (!row) throw notFound();
  return { transaction: toTransactionDto(row) };
}

export async function listByAccount(user, accountId, query) {
  const account = await prisma.account.findFirst({ where: { id: accountId, bankId: user.bankId }, select: { id: true } });
  if (!account) throw accountNotFound();
  return paginate(user, { OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] }, query);
}

export async function listByCustomer(user, customerId, query) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, bankId: user.bankId }, select: { id: true } });
  if (!customer) throw new TransactionError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  return paginate(user, { OR: [{ sourceAccount: { customerId } }, { destinationAccount: { customerId } }] }, query);
}
