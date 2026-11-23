import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { recordAudit } from "../audit/audit.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../audit/audit.constants.js";
import { DomainError } from "../../domain/DomainError.js";
import { CompteCourant } from "../../domain/CompteCourant.js";
import { CompteEpargne } from "../../domain/CompteEpargne.js";
import { toCents, fromCents } from "../../domain/money.js";
import { mapAccountToDomain, accountSnapshot, toAccountDto } from "./account.mapper.js";
import { ACCOUNT_EVENTS, emitAccountEvent } from "./account.events.js";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ACCOUNT_SELECT = {
  id: true,
  accountNumber: true,
  accountType: true,
  balance: true,
  currency: true,
  status: true,
  overdraftLimit: true,
  interestRate: true,
  minimumBalance: true,
  customerId: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  customer: { select: { id: true, firstName: true, lastName: true, customerType: true, isActive: true } },
};

const MAX_ACCOUNT_NUMBER_ATTEMPTS = 5;

// HTTP status for each domain error code (the domain itself knows nothing about HTTP).
const DOMAIN_ERROR_STATUS = {
  ACCOUNT_ALREADY_BLOCKED: 409,
  ACCOUNT_NOT_BLOCKED: 409,
  ACCOUNT_ALREADY_CLOSED: 409,
  ACCOUNT_NOT_ACTIVE: 409,
  INVALID_ACCOUNT_STATUS_TRANSITION: 409,
  ACCOUNT_BALANCE_NOT_ZERO: 409,
  INSUFFICIENT_FUNDS: 400,
  INVALID_AMOUNT: 400,
  INVALID_ACCOUNT_CONFIGURATION: 400,
};

/* ------------------------------------------------------------------ */
/* Procedural helpers (small, focused functions)                       */
/* ------------------------------------------------------------------ */

// Random, unpredictable number from Node's crypto (never Math.random). Example: ACC-004815162342
export const generateAccountNumber = () =>
  `ACC-${String(crypto.randomInt(0, 1_000_000_000_000)).padStart(12, "0")}`;

// Checks that only fields valid for the account type were sent and applies safe defaults.
export const validateAccountConfiguration = (input) => {
  const { accountType, overdraftLimit, interestRate, minimumBalance } = input;

  if (accountType === "COURANT") {
    if (interestRate !== undefined || minimumBalance !== undefined) {
      throw new AppError(
        "interestRate and minimumBalance do not apply to a COURANT account",
        400,
        "INVALID_ACCOUNT_CONFIGURATION"
      );
    }
    return { overdraftLimit: overdraftLimit ?? "0" };
  }

  if (accountType === "EPARGNE") {
    if (overdraftLimit !== undefined) {
      throw new AppError("overdraftLimit does not apply to an EPARGNE account", 400, "INVALID_ACCOUNT_CONFIGURATION");
    }
    return { interestRate: interestRate ?? "0", minimumBalance: minimumBalance ?? "0" };
  }

  throw new AppError("Account type must be COURANT or EPARGNE", 400, "INVALID_ACCOUNT_TYPE");
};

// Builds the NEW domain object (balance 0, status ACTIF). The domain validates its own data.
const buildNewDomainAccount = ({ accountType, accountNumber, customerId, currency }, config) => {
  const common = { accountNumber, customerId, currency, balance: "0.00" };
  return accountType === "COURANT"
    ? new CompteCourant({ ...common, overdraftLimit: config.overdraftLimit })
    : new CompteEpargne({ ...common, interestRate: config.interestRate, minimumBalance: config.minimumBalance });
};

// Pure function: builds the Prisma "where". bankId is ALWAYS present (bank isolation).
export const buildAccountFilters = (bankId, { accountType, status, customerId, search } = {}) => ({
  bankId,
  ...(accountType && { accountType }),
  ...(status && { status }),
  ...(customerId && { customerId }),
  ...(search && { accountNumber: { contains: search, mode: "insensitive" } }),
});

// Pure function (functional style): filter + reduce + map, balances summed as BigInt cents.
export const summarizeAccounts = (accounts) => {
  const totalsInCents = accounts
    .filter((account) => account.status !== "FERME")
    .reduce(
      (totals, account) => ({
        ...totals,
        [account.currency]: (totals[account.currency] ?? 0n) + toCents(account.balance),
      }),
      {}
    );

  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter((account) => account.status === "ACTIF").length,
    totalBalanceByCurrency: Object.fromEntries(
      Object.entries(totalsInCents).map(([currency, cents]) => [currency, fromCents(cents)])
    ),
  };
};

const isAccountNumberCollision = (error) =>
  error?.code === "P2002" && String(error.meta?.target ?? "").includes("accountNumber");

/* ------------------------------------------------------------------ */
/* Error translation (higher-order function)                           */
/* ------------------------------------------------------------------ */

const translateError = (error) => {
  if (error instanceof AppError) return error;
  if (error instanceof DomainError) {
    return new AppError(error.message, DOMAIN_ERROR_STATUS[error.code] ?? 400, error.code);
  }
  if (error?.code === "P2025") return new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  return error; // unknown error: the central errorHandler returns a generic 500
};

// Wraps a service function so every error leaves as an AppError (never a raw Prisma error).
const guarded =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw translateError(error);
    }
  };

/* ------------------------------------------------------------------ */
/* Database helpers (always scoped by bankId)                          */
/* ------------------------------------------------------------------ */

const findCustomerInBank = async (db, bankId, customerId) => {
  const customer = await db.customer.findFirst({
    where: { id: customerId, bankId },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });
  if (!customer) throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  return customer;
};

const findAccountInBank = async (db, bankId, id) => {
  const account = await db.account.findFirst({ where: { id, bankId }, select: ACCOUNT_SELECT });
  if (!account) throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  return account;
};

/* ------------------------------------------------------------------ */
/* Public service functions                                            */
/* ------------------------------------------------------------------ */

export const createAccount = guarded(async (user, input, ipAddress) => {
  // Step 1: check the type-specific configuration and get safe defaults.
  const config = validateAccountConfiguration(input);

  // The account number is random. If it collides with an existing one, the UNIQUE constraint
  // raises P2002 and the WHOLE transaction is retried with a new number.
  // (A failed statement aborts a PostgreSQL transaction, so the retry must wrap the transaction.)
  for (let attempt = 1; attempt <= MAX_ACCOUNT_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      const account = await prisma.$transaction(async (tx) => {
        // Step 2: the customer must exist IN THE EMPLOYEE'S BANK and be active.
        const customer = await findCustomerInBank(tx, user.bankId, input.customerId);
        if (!customer.isActive) {
          throw new AppError("Cannot open an account for an inactive customer", 409, "CUSTOMER_INACTIVE");
        }

        // Step 3: create the domain object (balance 0.00, status ACTIF).
        const compte = buildNewDomainAccount(
          { ...input, accountNumber: generateAccountNumber() },
          config
        );

        // Step 4: persist. bankId comes from the authenticated employee, never from the body.
        const record = await tx.account.create({
          data: { ...compte.toPersistence(), bankId: user.bankId },
          select: ACCOUNT_SELECT,
        });

        // Step 5: audit in the SAME transaction.
        await recordAudit(tx, {
          employeeId: user.id,
          action: AUDIT_ACTIONS.ACCOUNT_CREATED,
          entityType: ENTITY_TYPES.ACCOUNT,
          entityId: record.id,
          description: `Account ${record.accountNumber} (${record.accountType}) opened for ${customer.firstName} ${customer.lastName}`,
          oldValues: null,
          newValues: accountSnapshot(record),
          ipAddress,
        });

        return record;
      });

      // Step 6: the transaction is committed -> now emit the event.
      emitAccountEvent(ACCOUNT_EVENTS.CREATED, {
        accountId: account.id,
        accountNumber: account.accountNumber,
        customerId: account.customerId,
        bankId: user.bankId,
        employeeId: user.id,
      });
      return toAccountDto(account);
    } catch (error) {
      if (!isAccountNumberCollision(error)) throw error;
      // collision: loop again with a new number
    }
  }

  throw new AppError("Could not generate a unique account number, please retry", 409, "DUPLICATE_ACCOUNT_NUMBER");
});

export const listAccounts = guarded(async (bankId, query) => {
  const { page, limit } = query;
  const where = buildAccountFilters(bankId, query);

  const [total, records] = await prisma.$transaction([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      select: ACCOUNT_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], // stable ordering
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: records.map(toAccountDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
});

export const getAccountById = guarded(async (bankId, id) => {
  const record = await findAccountInBank(prisma, bankId, id);
  return toAccountDto(record);
});

export const getCustomerAccounts = guarded(async (bankId, customerId, query) => {
  const customer = await findCustomerInBank(prisma, bankId, customerId);

  const records = await prisma.account.findMany({
    where: buildAccountFilters(bankId, { ...query, customerId }),
    select: ACCOUNT_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200, // a customer has only a few accounts
  });

  const accounts = records.map(toAccountDto);
  return {
    customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, isActive: customer.isActive },
    accounts,
    summary: summarizeAccounts(accounts),
  };
});

/**
 * Shared flow for block / unblock / close (only the domain rule, audit action and event differ).
 * 1. load the account inside the bank  2. map to a domain object  3. let the DOMAIN apply the rule
 * 4. persist with an optimistic guard  5. audit (same transaction)  6. emit the event after commit
 */
const changeAccountStatus = async ({ user, id, ipAddress, applyDomainRule, auditAction, eventName, describe }) => {
  const updated = await prisma.$transaction(async (tx) => {
    const record = await findAccountInBank(tx, user.bankId, id);
    const compte = mapAccountToDomain(record);

    applyDomainRule(compte); // throws DomainError if the transition is not allowed

    // Optimistic guard: the update only succeeds if nobody changed the row since we read it.
    const { count } = await tx.account.updateMany({
      where: { id, bankId: user.bankId, updatedAt: record.updatedAt },
      data: { status: compte.status, closedAt: compte.closedAt },
    });
    if (count !== 1) {
      throw new AppError(
        "The account was modified by another request, please retry",
        409,
        "ACCOUNT_CONCURRENT_MODIFICATION"
      );
    }

    const refreshed = await findAccountInBank(tx, user.bankId, id);

    await recordAudit(tx, {
      employeeId: user.id,
      action: auditAction,
      entityType: ENTITY_TYPES.ACCOUNT,
      entityId: id,
      description: describe(record.accountNumber),
      oldValues: { status: record.status },
      newValues: {
        status: refreshed.status,
        ...(refreshed.closedAt && { closedAt: refreshed.closedAt.toISOString() }),
      },
      ipAddress,
    });

    return refreshed;
  });

  emitAccountEvent(eventName, {
    accountId: updated.id,
    accountNumber: updated.accountNumber,
    status: updated.status,
    bankId: user.bankId,
    employeeId: user.id,
  });
  return toAccountDto(updated);
};

export const blockAccount = guarded((user, id, ipAddress) =>
  changeAccountStatus({
    user, id, ipAddress,
    applyDomainRule: (compte) => compte.block(),
    auditAction: AUDIT_ACTIONS.ACCOUNT_BLOCKED,
    eventName: ACCOUNT_EVENTS.BLOCKED,
    describe: (number) => `Account ${number} blocked`,
  })
);

export const unblockAccount = guarded((user, id, ipAddress) =>
  changeAccountStatus({
    user, id, ipAddress,
    applyDomainRule: (compte) => compte.unblock(),
    auditAction: AUDIT_ACTIONS.ACCOUNT_UNBLOCKED,
    eventName: ACCOUNT_EVENTS.UNBLOCKED,
    describe: (number) => `Account ${number} unblocked`,
  })
);

export const closeAccount = guarded((user, id, ipAddress) =>
  changeAccountStatus({
    user, id, ipAddress,
    applyDomainRule: (compte) => compte.close(), // refuses a non-zero balance
    auditAction: AUDIT_ACTIONS.ACCOUNT_CLOSED,
    eventName: ACCOUNT_EVENTS.CLOSED,
    describe: (number) => `Account ${number} closed`,
  })
);