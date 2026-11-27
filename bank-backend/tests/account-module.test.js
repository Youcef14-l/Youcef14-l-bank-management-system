/**
 * Jest tests for the Accounts module (ES Modules).
 *
 * File location: tests/account-module.test.js
 * Run with:      node --experimental-vm-modules node_modules/jest/bin/jest.js account
 * ...
 */
import { jest, describe, test, expect, beforeEach, afterEach } from "@jest/globals";

const STATUS_KEY = "statusCode";

/* Mocks (must be declared BEFORE the dynamic imports below) */

const prisma = {
  $transaction: jest.fn(),
  account: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  customer: { findFirst: jest.fn() },
};
const recordAudit = jest.fn();

jest.unstable_mockModule("../src/config/prisma.js", () => ({ prisma }));
jest.unstable_mockModule("../src/modules/audit/audit.service.js", () => ({ recordAudit }));

const { toCents, fromCents } = await import("../src/domain/money.js");
const { DomainError } = await import("../src/domain/DomainError.js");
const { CompteBancaire, ACCOUNT_STATUS, performWithdrawal } = await import("../src/domain/CompteBancaire.js");
const { CompteCourant } = await import("../src/domain/CompteCourant.js");
const { CompteEpargne } = await import("../src/domain/CompteEpargne.js");
const { AppError } = await import("../src/utils/AppError.js");
const schemas = await import("../src/modules/accounts/account.schema.js");
const { mapAccountToDomain, accountSnapshot, toAccountDto } = await import("../src/modules/accounts/account.mapper.js");
const { accountEvents, emitAccountEvent, ACCOUNT_EVENTS } = await import("../src/modules/accounts/account.events.js");
const service = await import("../src/modules/accounts/account.service.js");
/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const UUID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const USER = { id: "emp-1", bankId: "bank-1" };
const IP = "127.0.0.1";

// Minimal Prisma Decimal stand-in (the domain only needs .toFixed).
const dec = (value) => ({ toFixed: (places) => Number(value).toFixed(places) });

const makeRecord = (overrides = {}) => ({
  id: UUID,
  accountNumber: "ACC-000000000001",
  accountType: "COURANT",
  balance: dec("0"),
  currency: "DZD",
  status: "ACTIF",
  overdraftLimit: dec("500"),
  interestRate: null,
  minimumBalance: null,
  customerId: CUSTOMER_ID,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  closedAt: null,
  customer: { id: CUSTOMER_ID, firstName: "Amine", lastName: "Benali", customerType: "INDIVIDUAL", isActive: true },
  ...overrides,
});

const makeEpargneRecord = (overrides = {}) =>
  makeRecord({
    accountType: "EPARGNE",
    overdraftLimit: null,
    interestRate: dec("2.5"),
    minimumBalance: dec("1000"),
    ...overrides,
  });

// Returns the thrown error (sync) or rejection reason (async) so we can inspect code/status.
const caught = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
};
const rejection = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
};

const prismaCollision = () =>
  Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["accountNumber"] } });

/* ================================================================== */
/* 1. money.js                                                         */
/* ================================================================== */

describe("money.js", () => {
  describe("toCents", () => {
    test.each([
      ["12.50", 1250n],
      ["0", 0n],
      ["0.05", 5n],
      ["100", 10000n],
      ["-5.5", -550n],
      [12.5, 1250n],
      [" 7.10 ", 710n],
    ])("converts %p to %p cents", (input, expected) => {
      expect(toCents(input)).toBe(expected);
    });

    test("accepts a Decimal-like object", () => {
      expect(toCents(dec("1500"))).toBe(150000n);
    });

    test.each(["abc", "", "1.234", "1,5", "--3", null, undefined, NaN, Infinity, {}])(
      "rejects invalid amount %p",
      (input) => {
        const error = caught(() => toCents(input));
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe("INVALID_AMOUNT");
      }
    );
  });

  describe("fromCents", () => {
    test.each([
      [12345n, "123.45"],
      [0n, "0.00"],
      [5n, "0.05"],
      [-5n, "-0.05"],
      [100n, "1.00"],
      [-150000n, "-1500.00"],
    ])("formats %p as %p", (cents, expected) => {
      expect(fromCents(cents)).toBe(expected);
    });

    test("is the inverse of toCents", () => {
      expect(fromCents(toCents("999999999999.99"))).toBe("999999999999.99");
    });
  });
});

/* ================================================================== */
/* 2. Domain classes                                                   */
/* ================================================================== */

describe("CompteBancaire (base class)", () => {
  const make = (overrides = {}) =>
    new CompteBancaire({ accountNumber: "ACC-1", customerId: CUSTOMER_ID, ...overrides });

  test("uses safe defaults", () => {
    const compte = make();
    expect(compte.getBalance()).toBe("0.00");
    expect(compte.currency).toBe("DZD");
    expect(compte.status).toBe(ACCOUNT_STATUS.ACTIF);
    expect(compte.closedAt).toBeNull();
    expect(compte.isActive()).toBe(true);
  });

  test("rejects an unknown status", () => {
    const error = caught(() => make({ status: "WHATEVER" }));
    expect(error.code).toBe("INVALID_ACCOUNT_CONFIGURATION");
  });

  test("has no balance setter (encapsulation)", () => {
    const compte = make({ balance: "10.00" });
    expect(() => {
      compte.balance = "999.00";
    }).toThrow(TypeError);
    expect(() => {
      compte.status = "FERME";
    }).toThrow(TypeError);
    expect(compte.getBalance()).toBe("10.00");
  });

  describe("deposit", () => {
    test("adds to the balance and returns the new balance", () => {
      const compte = make({ balance: "10.00" });
      expect(compte.deposit("5.25")).toBe("15.25");
      expect(compte.getBalance()).toBe("15.25");
    });

    test("has no floating-point error (0.1 + 0.2)", () => {
      const compte = make();
      compte.deposit("0.1");
      compte.deposit("0.2");
      expect(compte.getBalance()).toBe("0.30");
    });

    test.each(["0", "-5", "abc", "10.999"])("rejects invalid amount %p", (amount) => {
      const error = caught(() => make().deposit(amount));
      expect(error.code).toBe("INVALID_AMOUNT");
    });

    test.each([ACCOUNT_STATUS.BLOQUE, ACCOUNT_STATUS.FERME])("is refused when the account is %s", (status) => {
      const error = caught(() => make({ status }).deposit("10"));
      expect(error.code).toBe("ACCOUNT_NOT_ACTIVE");
    });
  });

  describe("withdraw (default rule: balance >= 0)", () => {
    test("subtracts from the balance", () => {
      expect(make({ balance: "100.00" }).withdraw("40.50")).toBe("59.50");
    });

    test("allows withdrawing the exact balance", () => {
      const compte = make({ balance: "50.00" });
      compte.withdraw("50.00");
      expect(compte.getBalance()).toBe("0.00");
    });

    test("refuses to go below zero and leaves the balance untouched", () => {
      const compte = make({ balance: "50.00" });
      const error = caught(() => compte.withdraw("50.01"));
      expect(error.code).toBe("INSUFFICIENT_FUNDS");
      expect(compte.getBalance()).toBe("50.00");
    });

    test("is refused on a blocked account", () => {
      const error = caught(() => make({ balance: "50", status: "BLOQUE" }).withdraw("1"));
      expect(error.code).toBe("ACCOUNT_NOT_ACTIVE");
    });
  });

  describe("block / unblock", () => {
    test("block then unblock", () => {
      const compte = make();
      compte.block();
      expect(compte.status).toBe("BLOQUE");
      compte.unblock();
      expect(compte.status).toBe("ACTIF");
    });

    test("cannot block twice", () => {
      const compte = make({ status: "BLOQUE" });
      expect(caught(() => compte.block()).code).toBe("ACCOUNT_ALREADY_BLOCKED");
    });

    test("cannot block a closed account", () => {
      expect(caught(() => make({ status: "FERME" }).block()).code).toBe("INVALID_ACCOUNT_STATUS_TRANSITION");
    });

    test("cannot unblock an active account", () => {
      expect(caught(() => make().unblock()).code).toBe("ACCOUNT_NOT_BLOCKED");
    });

    test("cannot unblock a closed account", () => {
      expect(caught(() => make({ status: "FERME" }).unblock()).code).toBe("INVALID_ACCOUNT_STATUS_TRANSITION");
    });
  });

  describe("close", () => {
    test("closes a zero-balance account and sets closedAt", () => {
      const compte = make();
      compte.close();
      expect(compte.status).toBe("FERME");
      expect(compte.closedAt).toBeInstanceOf(Date);
    });

    test("can close a blocked account with zero balance", () => {
      const compte = make({ status: "BLOQUE" });
      compte.close();
      expect(compte.status).toBe("FERME");
    });

    test("refuses when the balance is not zero", () => {
      const compte = make({ balance: "0.01" });
      expect(caught(() => compte.close()).code).toBe("ACCOUNT_BALANCE_NOT_ZERO");
      expect(compte.status).toBe("ACTIF");
    });

    test("refuses to close twice", () => {
      const compte = make();
      compte.close();
      expect(caught(() => compte.close()).code).toBe("ACCOUNT_ALREADY_CLOSED");
    });
  });

  test("toPersistence returns only plain common columns", () => {
    const compte = make({ balance: "12.5", currency: "EUR" });
    expect(compte.toPersistence()).toEqual({
      accountNumber: "ACC-1",
      balance: "12.50",
      currency: "EUR",
      status: "ACTIF",
      customerId: CUSTOMER_ID,
      closedAt: null,
    });
  });
});

describe("CompteCourant", () => {
  const make = (overrides = {}) =>
    new CompteCourant({ accountNumber: "ACC-C", customerId: CUSTOMER_ID, ...overrides });

  test("is a CompteBancaire", () => {
    expect(make()).toBeInstanceOf(CompteBancaire);
  });

  test("defaults the overdraft limit to 0.00", () => {
    expect(make().overdraftLimit).toBe("0.00");
  });

  test("rejects a negative overdraft limit", () => {
    expect(caught(() => make({ overdraftLimit: "-1" })).code).toBe("INVALID_ACCOUNT_CONFIGURATION");
  });

  describe("withdraw (rule: newBalance >= -overdraftLimit)", () => {
    test("can go negative within the overdraft limit", () => {
      const compte = make({ balance: "100.00", overdraftLimit: "500" });
      expect(compte.withdraw("400.00")).toBe("-300.00");
    });

    test("allows reaching exactly -overdraftLimit", () => {
      const compte = make({ balance: "0", overdraftLimit: "500" });
      expect(compte.withdraw("500.00")).toBe("-500.00");
    });

    test("refuses one cent beyond the limit", () => {
      const compte = make({ balance: "0", overdraftLimit: "500" });
      const error = caught(() => compte.withdraw("500.01"));
      expect(error.code).toBe("INSUFFICIENT_FUNDS");
      expect(compte.getBalance()).toBe("0.00");
    });

    test("with no overdraft behaves like the default rule", () => {
      const compte = make({ balance: "10" });
      expect(caught(() => compte.withdraw("10.01")).code).toBe("INSUFFICIENT_FUNDS");
    });

    test("is refused when the account is not active", () => {
      const compte = make({ balance: "100", status: "BLOQUE" });
      expect(caught(() => compte.withdraw("1")).code).toBe("ACCOUNT_NOT_ACTIVE");
    });

    test("rejects invalid amounts", () => {
      expect(caught(() => make().withdraw("0")).code).toBe("INVALID_AMOUNT");
    });
  });

  test("can be restored with a negative balance", () => {
    expect(make({ balance: "-120.00", overdraftLimit: "500" }).getBalance()).toBe("-120.00");
  });

  test("toPersistence adds accountType and overdraftLimit", () => {
    expect(make({ overdraftLimit: "250" }).toPersistence()).toMatchObject({
      accountType: "COURANT",
      overdraftLimit: "250.00",
    });
  });
});

describe("CompteEpargne", () => {
  const make = (overrides = {}) =>
    new CompteEpargne({ accountNumber: "ACC-E", customerId: CUSTOMER_ID, ...overrides });

  test("is a CompteBancaire with defaults", () => {
    const compte = make();
    expect(compte).toBeInstanceOf(CompteBancaire);
    expect(compte.interestRate).toBe("0");
    expect(compte.minimumBalance).toBe("0.00");
  });

  test.each(["0", "2.5", "100", "99.9999", 3])("accepts interest rate %p", (rate) => {
    expect(make({ interestRate: rate }).interestRate).toBe(String(rate));
  });

  test.each(["-1", "100.5", "abc", "1.23456", "1000"])("rejects interest rate %p", (rate) => {
    expect(caught(() => make({ interestRate: rate })).code).toBe("INVALID_ACCOUNT_CONFIGURATION");
  });

  test("rejects a negative minimum balance", () => {
    expect(caught(() => make({ minimumBalance: "-10" })).code).toBe("INVALID_ACCOUNT_CONFIGURATION");
  });

  describe("withdraw (rule: newBalance >= minimumBalance)", () => {
    test("allows a withdrawal that keeps the minimum", () => {
      const compte = make({ balance: "1500.00", minimumBalance: "1000" });
      expect(compte.withdraw("500.00")).toBe("1000.00");
    });

    test("refuses a withdrawal that goes below the minimum", () => {
      const compte = make({ balance: "1500.00", minimumBalance: "1000" });
      const error = caught(() => compte.withdraw("500.01"));
      expect(error.code).toBe("INSUFFICIENT_FUNDS");
      expect(compte.getBalance()).toBe("1500.00");
    });

    test("with minimum 0 it cannot go negative", () => {
      expect(caught(() => make({ balance: "5" }).withdraw("5.01")).code).toBe("INSUFFICIENT_FUNDS");
    });
  });

  test("toPersistence adds EPARGNE specific columns", () => {
    expect(make({ interestRate: "2.5", minimumBalance: "1000" }).toPersistence()).toMatchObject({
      accountType: "EPARGNE",
      interestRate: "2.5",
      minimumBalance: "1000.00",
    });
  });
});

describe("Polymorphism: performWithdrawal", () => {
  test("applies each concrete class's own rule without checking the type", () => {
    const courant = new CompteCourant({ accountNumber: "C", customerId: CUSTOMER_ID, balance: "0", overdraftLimit: "100" });
    const epargne = new CompteEpargne({ accountNumber: "E", customerId: CUSTOMER_ID, balance: "500", minimumBalance: "450" });
    const base = new CompteBancaire({ accountNumber: "B", customerId: CUSTOMER_ID, balance: "0" });

    expect(performWithdrawal(courant, "100")).toBe("-100.00"); // overdraft allowed
    expect(caught(() => performWithdrawal(epargne, "100")).code).toBe("INSUFFICIENT_FUNDS"); // minimum balance
    expect(caught(() => performWithdrawal(base, "1")).code).toBe("INSUFFICIENT_FUNDS"); // default rule
  });
});

/* ================================================================== */
/* 3. Zod schemas                                                      */
/* ================================================================== */

describe("account.schema.js", () => {
  describe("createAccountSchema", () => {
    test("COURANT: applies defaults", () => {
      const result = schemas.createAccountSchema.parse({ customerId: CUSTOMER_ID, accountType: "COURANT" });
      expect(result).toEqual({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        currency: "DZD",
        overdraftLimit: "0",
      });
    });

    test("EPARGNE: applies defaults", () => {
      const result = schemas.createAccountSchema.parse({ customerId: CUSTOMER_ID, accountType: "EPARGNE" });
      expect(result).toMatchObject({ currency: "DZD", interestRate: "0", minimumBalance: "0" });
    });

    test("normalises currency to upper case", () => {
      const result = schemas.createAccountSchema.parse({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        currency: " eur ",
      });
      expect(result.currency).toBe("EUR");
    });

    test("turns numeric money values into strings (no float leaves the schema)", () => {
      const result = schemas.createAccountSchema.parse({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        overdraftLimit: 10000,
      });
      expect(result.overdraftLimit).toBe("10000");
    });

    test.each([
      ["unknown currency", { currency: "GBP" }],
      ["invalid customerId", { customerId: "not-a-uuid" }],
      ["negative overdraft", { overdraftLimit: "-5" }],
      ["3 decimals overdraft", { overdraftLimit: "10.123" }],
      ["non numeric overdraft", { overdraftLimit: "abc" }],
    ])("COURANT rejects %s", (_label, patch) => {
      const result = schemas.createAccountSchema.safeParse({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        ...patch,
      });
      expect(result.success).toBe(false);
    });

    test.each(["bankId", "balance", "status", "id"])("rejects the forbidden key %s (strict)", (key) => {
      const result = schemas.createAccountSchema.safeParse({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        [key]: "x",
      });
      expect(result.success).toBe(false);
    });

    test("COURANT rejects EPARGNE-only fields", () => {
      const result = schemas.createAccountSchema.safeParse({
        customerId: CUSTOMER_ID,
        accountType: "COURANT",
        interestRate: "2",
      });
      expect(result.success).toBe(false);
    });

    test("EPARGNE rejects overdraftLimit", () => {
      const result = schemas.createAccountSchema.safeParse({
        customerId: CUSTOMER_ID,
        accountType: "EPARGNE",
        overdraftLimit: "100",
      });
      expect(result.success).toBe(false);
    });

    test.each(["100.5", "1.12345", "-1", "abc"])("EPARGNE rejects interestRate %p", (rate) => {
      const result = schemas.createAccountSchema.safeParse({
        customerId: CUSTOMER_ID,
        accountType: "EPARGNE",
        interestRate: rate,
      });
      expect(result.success).toBe(false);
    });

    test("rejects a missing or invalid accountType", () => {
      expect(schemas.createAccountSchema.safeParse({ customerId: CUSTOMER_ID }).success).toBe(false);
      expect(schemas.createAccountSchema.safeParse({ customerId: CUSTOMER_ID, accountType: "PRO" }).success).toBe(false);
    });
  });

  describe("params", () => {
    test("accountIdParamSchema accepts a UUID only", () => {
      expect(schemas.accountIdParamSchema.safeParse({ id: UUID }).success).toBe(true);
      expect(schemas.accountIdParamSchema.safeParse({ id: "123" }).success).toBe(false);
      expect(schemas.accountIdParamSchema.safeParse({ id: UUID, extra: 1 }).success).toBe(false);
    });

    test("customerAccountsParamSchema accepts a UUID only", () => {
      expect(schemas.customerAccountsParamSchema.safeParse({ customerId: CUSTOMER_ID }).success).toBe(true);
      expect(schemas.customerAccountsParamSchema.safeParse({ customerId: "x" }).success).toBe(false);
    });
  });

  describe("listAccountsQuerySchema", () => {
    test("applies pagination defaults", () => {
      expect(schemas.listAccountsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    });

    test("coerces query strings to numbers", () => {
      expect(schemas.listAccountsQuerySchema.parse({ page: "2", limit: "50" })).toMatchObject({ page: 2, limit: 50 });
    });

    test.each([{ page: "0" }, { limit: "0" }, { limit: "101" }, { page: "1.5" }, { status: "OPEN" }, { accountType: "X" }, { unknown: "1" }])(
      "rejects %p",
      (query) => {
        expect(schemas.listAccountsQuerySchema.safeParse(query).success).toBe(false);
      }
    );

    test("accepts valid filters", () => {
      const result = schemas.listAccountsQuerySchema.parse({
        search: " ACC ",
        accountType: "EPARGNE",
        status: "BLOQUE",
        customerId: CUSTOMER_ID,
      });
      expect(result).toMatchObject({ search: "ACC", accountType: "EPARGNE", status: "BLOQUE", customerId: CUSTOMER_ID });
    });
  });

  describe("listCustomerAccountsQuerySchema", () => {
    test("accepts type and status, rejects pagination keys", () => {
      expect(schemas.listCustomerAccountsQuerySchema.safeParse({ accountType: "COURANT", status: "ACTIF" }).success).toBe(true);
      expect(schemas.listCustomerAccountsQuerySchema.safeParse({ page: "1" }).success).toBe(false);
    });
  });
});

/* ================================================================== */
/* 4. Mapper                                                           */
/* ================================================================== */

describe("account.mapper.js", () => {
  describe("mapAccountToDomain", () => {
    test("COURANT record -> CompteCourant", () => {
      const compte = mapAccountToDomain(makeRecord({ balance: dec("1500"), overdraftLimit: dec("500") }));
      expect(compte).toBeInstanceOf(CompteCourant);
      expect(compte.id).toBe(UUID);
      expect(compte.getBalance()).toBe("1500.00");
      expect(compte.overdraftLimit).toBe("500.00");
    });

    test("COURANT with null overdraftLimit falls back to 0", () => {
      expect(mapAccountToDomain(makeRecord({ overdraftLimit: null })).overdraftLimit).toBe("0.00");
    });

    test("EPARGNE record -> CompteEpargne", () => {
      const compte = mapAccountToDomain(makeEpargneRecord({ balance: dec("2000") }));
      expect(compte).toBeInstanceOf(CompteEpargne);
      expect(compte.interestRate).toBe("2.5000");
      expect(compte.minimumBalance).toBe("1000.00");
    });

    test("EPARGNE with null rate and minimum falls back to 0", () => {
      const compte = mapAccountToDomain(makeEpargneRecord({ interestRate: null, minimumBalance: null }));
      expect(compte.interestRate).toBe("0");
      expect(compte.minimumBalance).toBe("0.00");
    });

    test("keeps status and closedAt", () => {
      const closedAt = new Date("2026-03-01T00:00:00Z");
      const compte = mapAccountToDomain(makeRecord({ status: "FERME", closedAt }));
      expect(compte.status).toBe("FERME");
      expect(compte.closedAt).toBe(closedAt);
    });

    test("unsupported type -> AppError 400", () => {
      const error = caught(() => mapAccountToDomain(makeRecord({ accountType: "PRO" })));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("INVALID_ACCOUNT_TYPE");
      expect(error[STATUS_KEY]).toBe(400);
    });
  });

  describe("accountSnapshot / toAccountDto", () => {
    test("COURANT snapshot exposes overdraftLimit only", () => {
      const snapshot = accountSnapshot(makeRecord({ balance: dec("12.5") }));
      expect(snapshot).toMatchObject({ balance: "12.50", overdraftLimit: "500.00" });
      expect(snapshot).not.toHaveProperty("interestRate");
      expect(snapshot).not.toHaveProperty("minimumBalance");
    });

    test("EPARGNE snapshot exposes interestRate and minimumBalance only", () => {
      const snapshot = accountSnapshot(makeEpargneRecord());
      expect(snapshot).toMatchObject({ interestRate: "2.5000", minimumBalance: "1000.00" });
      expect(snapshot).not.toHaveProperty("overdraftLimit");
    });

    test("snapshot contains no dates or customer data (audit safe)", () => {
      const snapshot = accountSnapshot(makeRecord());
      expect(snapshot).not.toHaveProperty("createdAt");
      expect(snapshot).not.toHaveProperty("customer");
    });

    test("DTO adds customer and dates without mutating the record", () => {
      const record = makeRecord();
      const copy = JSON.stringify(record);
      const dto = toAccountDto(record);
      expect(dto.customer).toBe(record.customer);
      expect(dto.createdAt).toBe(record.createdAt);
      expect(dto.updatedAt).toBe(record.updatedAt);
      expect(dto.closedAt).toBeNull();
      expect(JSON.stringify(record)).toBe(copy);
    });
  });
});

/* ================================================================== */
/* 5. Events                                                           */
/* ================================================================== */

describe("account.events.js", () => {
  afterEach(() => jest.restoreAllMocks());

  test("emitAccountEvent delivers the payload to listeners", () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    const listener = jest.fn();
    accountEvents.on(ACCOUNT_EVENTS.CREATED, listener);

    emitAccountEvent(ACCOUNT_EVENTS.CREATED, { accountId: UUID });

    expect(listener).toHaveBeenCalledWith({ accountId: UUID });
    accountEvents.off(ACCOUNT_EVENTS.CREATED, listener);
  });

  test("a failing listener never breaks the caller", () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const bad = () => {
      throw new Error("listener exploded");
    };
    accountEvents.on(ACCOUNT_EVENTS.CLOSED, bad);

    expect(() => emitAccountEvent(ACCOUNT_EVENTS.CLOSED, { accountId: UUID })).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    accountEvents.off(ACCOUNT_EVENTS.CLOSED, bad);
  });

  test("ACCOUNT_EVENTS is frozen", () => {
    expect(Object.isFrozen(ACCOUNT_EVENTS)).toBe(true);
  });
});

/* ================================================================== */
/* 6. Service                                                          */
/* ================================================================== */

describe("account.service.js", () => {
  let emitSpy;

  beforeEach(() => {
    jest.resetAllMocks();
    // Same object plays the role of `tx`; array form (used by listAccounts) runs in parallel.
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)));
    recordAudit.mockResolvedValue(undefined);
    jest.spyOn(console, "log").mockImplementation(() => {});
    emitSpy = jest.spyOn(accountEvents, "emit");
  });

  afterEach(() => jest.restoreAllMocks());

  /* ---------- pure helpers ---------- */

  describe("generateAccountNumber", () => {
    test("matches ACC-############", () => {
      expect(service.generateAccountNumber()).toMatch(/^ACC-\d{12}$/);
    });

    test("produces different numbers", () => {
      const numbers = new Set(Array.from({ length: 50 }, () => service.generateAccountNumber()));
      expect(numbers.size).toBeGreaterThan(45);
    });
  });

  describe("validateAccountConfiguration", () => {
    test("COURANT: default overdraft", () => {
      expect(service.validateAccountConfiguration({ accountType: "COURANT" })).toEqual({ overdraftLimit: "0" });
    });

    test("COURANT: keeps the given overdraft", () => {
      expect(service.validateAccountConfiguration({ accountType: "COURANT", overdraftLimit: "300" })).toEqual({
        overdraftLimit: "300",
      });
    });

    test.each([{ interestRate: "1" }, { minimumBalance: "10" }])("COURANT rejects %p", (extra) => {
      const error = caught(() => service.validateAccountConfiguration({ accountType: "COURANT", ...extra }));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("INVALID_ACCOUNT_CONFIGURATION");
      expect(error[STATUS_KEY]).toBe(400);
    });

    test("EPARGNE: defaults", () => {
      expect(service.validateAccountConfiguration({ accountType: "EPARGNE" })).toEqual({
        interestRate: "0",
        minimumBalance: "0",
      });
    });

    test("EPARGNE rejects overdraftLimit", () => {
      const error = caught(() => service.validateAccountConfiguration({ accountType: "EPARGNE", overdraftLimit: "5" }));
      expect(error.code).toBe("INVALID_ACCOUNT_CONFIGURATION");
    });

    test("unknown type", () => {
      const error = caught(() => service.validateAccountConfiguration({ accountType: "PRO" }));
      expect(error.code).toBe("INVALID_ACCOUNT_TYPE");
    });
  });

  describe("buildAccountFilters", () => {
    test("always contains bankId (bank isolation)", () => {
      expect(service.buildAccountFilters("bank-1")).toEqual({ bankId: "bank-1" });
      expect(service.buildAccountFilters("bank-1", {})).toEqual({ bankId: "bank-1" });
    });

    test("adds only the provided filters", () => {
      expect(
        service.buildAccountFilters("bank-1", { accountType: "COURANT", status: "ACTIF", customerId: CUSTOMER_ID, search: "ACC" })
      ).toEqual({
        bankId: "bank-1",
        accountType: "COURANT",
        status: "ACTIF",
        customerId: CUSTOMER_ID,
        accountNumber: { contains: "ACC", mode: "insensitive" },
      });
    });

    test("a bankId inside the query can never override the real one", () => {
      expect(service.buildAccountFilters("bank-1", { bankId: "evil" }).bankId).toBe("bank-1");
    });
  });

  describe("summarizeAccounts", () => {
    test("empty list", () => {
      expect(service.summarizeAccounts([])).toEqual({
        totalAccounts: 0,
        activeAccounts: 0,
        totalBalanceByCurrency: {},
      });
    });

    test("ignores closed accounts in totals but counts them in totalAccounts", () => {
      const summary = service.summarizeAccounts([
        { status: "ACTIF", currency: "DZD", balance: "100.10" },
        { status: "BLOQUE", currency: "DZD", balance: "200.20" },
        { status: "FERME", currency: "DZD", balance: "0.00" },
        { status: "ACTIF", currency: "EUR", balance: "50.00" },
      ]);
      expect(summary).toEqual({
        totalAccounts: 4,
        activeAccounts: 2,
        totalBalanceByCurrency: { DZD: "300.30", EUR: "50.00" },
      });
    });

    test("sums exactly (no floating-point drift)", () => {
      const summary = service.summarizeAccounts([
        { status: "ACTIF", currency: "DZD", balance: "0.10" },
        { status: "ACTIF", currency: "DZD", balance: "0.20" },
      ]);
      expect(summary.totalBalanceByCurrency.DZD).toBe("0.30");
    });

    test("handles negative balances (overdraft)", () => {
      const summary = service.summarizeAccounts([
        { status: "ACTIF", currency: "DZD", balance: "-100.00" },
        { status: "ACTIF", currency: "DZD", balance: "40.00" },
      ]);
      expect(summary.totalBalanceByCurrency.DZD).toBe("-60.00");
    });

    test("does not mutate its input", () => {
      const accounts = [{ status: "ACTIF", currency: "DZD", balance: "1.00" }];
      const copy = JSON.parse(JSON.stringify(accounts));
      service.summarizeAccounts(accounts);
      expect(accounts).toEqual(copy);
    });
  });

  /* ---------- createAccount ---------- */

  describe("createAccount", () => {
    const customer = { id: CUSTOMER_ID, firstName: "Amine", lastName: "Benali", isActive: true };
    const input = { customerId: CUSTOMER_ID, accountType: "COURANT", currency: "DZD", overdraftLimit: "500" };

    test("creates, audits in the same transaction, emits after commit and returns a DTO", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockResolvedValue(makeRecord());

      const dto = await service.createAccount(USER, input, IP);

      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CUSTOMER_ID, bankId: "bank-1" } })
      );
      const { data } = prisma.account.create.mock.calls[0][0];
      expect(data).toMatchObject({
        bankId: "bank-1", // from the employee, never from the body
        accountType: "COURANT",
        balance: "0.00",
        status: "ACTIF",
        currency: "DZD",
        customerId: CUSTOMER_ID,
        overdraftLimit: "500.00",
      });
      expect(data.accountNumber).toMatch(/^ACC-\d{12}$/);

      expect(recordAudit).toHaveBeenCalledTimes(1);
      expect(recordAudit).toHaveBeenCalledWith(
        prisma, // the tx object, so the audit is part of the same transaction
        expect.objectContaining({ employeeId: "emp-1", entityId: UUID, ipAddress: IP, oldValues: null })
      );
      expect(emitSpy).toHaveBeenCalledWith(
        ACCOUNT_EVENTS.CREATED,
        expect.objectContaining({ accountId: UUID, bankId: "bank-1", employeeId: "emp-1" })
      );
      expect(dto).toMatchObject({ id: UUID, accountType: "COURANT", balance: "0.00", overdraftLimit: "500.00" });
    });

    test("creates an EPARGNE account with its own columns", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockResolvedValue(makeEpargneRecord());

      await service.createAccount(
        USER,
        { customerId: CUSTOMER_ID, accountType: "EPARGNE", currency: "DZD", interestRate: "2.5", minimumBalance: "1000" },
        IP
      );

      const { data } = prisma.account.create.mock.calls[0][0];
      expect(data).toMatchObject({ accountType: "EPARGNE", interestRate: "2.5", minimumBalance: "1000.00" });
    });

    test("rejects an invalid configuration before touching the database", async () => {
      const error = await rejection(
        service.createAccount(USER, { ...input, accountType: "EPARGNE", overdraftLimit: "5" }, IP)
      );
      expect(error.code).toBe("INVALID_ACCOUNT_CONFIGURATION");
      expect(error[STATUS_KEY]).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("404 when the customer is not in the employee's bank", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      const error = await rejection(service.createAccount(USER, input, IP));

      expect(error.code).toBe("CUSTOMER_NOT_FOUND");
      expect(error[STATUS_KEY]).toBe(404);
      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    test("409 when the customer is inactive", async () => {
      prisma.customer.findFirst.mockResolvedValue({ ...customer, isActive: false });

      const error = await rejection(service.createAccount(USER, input, IP));

      expect(error.code).toBe("CUSTOMER_INACTIVE");
      expect(error[STATUS_KEY]).toBe(409);
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    test("retries the whole transaction with a new number on an accountNumber collision", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockRejectedValueOnce(prismaCollision()).mockResolvedValueOnce(makeRecord());

      const dto = await service.createAccount(USER, input, IP);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.account.create).toHaveBeenCalledTimes(2);
      const [first, second] = prisma.account.create.mock.calls.map(([arg]) => arg.data.accountNumber);
      expect(first).not.toBe(second);
      expect(recordAudit).toHaveBeenCalledTimes(1); // only the successful attempt is audited
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(dto.id).toBe(UUID);
    });

    test("gives up after 5 collisions with 409 DUPLICATE_ACCOUNT_NUMBER", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockRejectedValue(prismaCollision());

      const error = await rejection(service.createAccount(USER, input, IP));

      expect(prisma.account.create).toHaveBeenCalledTimes(5);
      expect(error.code).toBe("DUPLICATE_ACCOUNT_NUMBER");
      expect(error[STATUS_KEY]).toBe(409);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    test("does not retry on other errors and does not leak them as AppError", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockRejectedValue(new Error("connection lost"));

      const error = await rejection(service.createAccount(USER, input, IP));

      expect(error.message).toBe("connection lost");
      expect(prisma.account.create).toHaveBeenCalledTimes(1);
    });

    test("a failing audit prevents the event", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.create.mockResolvedValue(makeRecord());
      recordAudit.mockRejectedValue(new Error("audit down"));

      await rejection(service.createAccount(USER, input, IP));

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  /* ---------- listAccounts ---------- */

  describe("listAccounts", () => {
    test("returns paginated DTOs and meta, scoped by bankId", async () => {
      prisma.account.count.mockResolvedValue(45);
      prisma.account.findMany.mockResolvedValue([makeRecord(), makeEpargneRecord({ id: "other" })]);

      const result = await service.listAccounts("bank-1", { page: 2, limit: 20, status: "ACTIF" });

      expect(prisma.account.count).toHaveBeenCalledWith({ where: { bankId: "bank-1", status: "ACTIF" } });
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bankId: "bank-1", status: "ACTIF" },
          skip: 20,
          take: 20,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      );
      expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
      expect(result.data).toHaveLength(2);
      expect(result.data[1]).toHaveProperty("interestRate", "2.5000");
    });

    test("empty result -> totalPages 0", async () => {
      prisma.account.count.mockResolvedValue(0);
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.listAccounts("bank-1", { page: 1, limit: 20 });

      expect(result).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    });
  });

  /* ---------- getAccountById ---------- */

  describe("getAccountById", () => {
    test("returns the DTO and filters by bankId", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord());

      const dto = await service.getAccountById("bank-1", UUID);

      expect(prisma.account.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: UUID, bankId: "bank-1" } }));
      expect(dto.id).toBe(UUID);
    });

    test("404 when the account is not found (or belongs to another bank)", async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      const error = await rejection(service.getAccountById("bank-1", UUID));

      expect(error.code).toBe("ACCOUNT_NOT_FOUND");
      expect(error[STATUS_KEY]).toBe(404);
    });
  });

  /* ---------- getCustomerAccounts ---------- */

  describe("getCustomerAccounts", () => {
    const customer = { id: CUSTOMER_ID, firstName: "Amine", lastName: "Benali", isActive: true };

    test("returns the customer, the accounts and a summary", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.account.findMany.mockResolvedValue([
        makeRecord({ balance: dec("100.10") }),
        makeEpargneRecord({ id: "acc-2", balance: dec("200.20") }),
        makeRecord({ id: "acc-3", status: "FERME", balance: dec("0") }),
      ]);

      const result = await service.getCustomerAccounts("bank-1", CUSTOMER_ID, { accountType: "COURANT" });

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bankId: "bank-1", accountType: "COURANT", customerId: CUSTOMER_ID },
          take: 200,
        })
      );
      expect(result.customer).toEqual(customer);
      expect(result.accounts).toHaveLength(3);
      expect(result.summary).toEqual({
        totalAccounts: 3,
        activeAccounts: 2,
        totalBalanceByCurrency: { DZD: "300.30" },
      });
    });

    test("404 when the customer does not exist in the bank", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      const error = await rejection(service.getCustomerAccounts("bank-1", CUSTOMER_ID, {}));

      expect(error.code).toBe("CUSTOMER_NOT_FOUND");
      expect(prisma.account.findMany).not.toHaveBeenCalled();
    });
  });

  /* ---------- block / unblock / close ---------- */

  describe("block / unblock / close", () => {
    beforeEach(() => {
      prisma.account.updateMany.mockResolvedValue({ count: 1 });
    });

    test("blockAccount: updates with an optimistic guard, audits and emits", async () => {
      const before = makeRecord({ status: "ACTIF" });
      prisma.account.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(makeRecord({ status: "BLOQUE" }));

      const dto = await service.blockAccount(USER, UUID, IP);

      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: { id: UUID, bankId: "bank-1", updatedAt: before.updatedAt },
        data: { status: "BLOQUE", closedAt: null },
      });
      expect(recordAudit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          employeeId: "emp-1",
          entityId: UUID,
          oldValues: { status: "ACTIF" },
          newValues: { status: "BLOQUE" },
          description: "Account ACC-000000000001 blocked",
          ipAddress: IP,
        })
      );
      expect(emitSpy).toHaveBeenCalledWith(
        ACCOUNT_EVENTS.BLOCKED,
        expect.objectContaining({ accountId: UUID, status: "BLOQUE", bankId: "bank-1" })
      );
      expect(dto.status).toBe("BLOQUE");
    });

    test("blockAccount: 409 if already blocked, nothing is written", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ status: "BLOQUE" }));

      const error = await rejection(service.blockAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_ALREADY_BLOCKED");
      expect(error[STATUS_KEY]).toBe(409);
      expect(prisma.account.updateMany).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    test("blockAccount: 404 when the account does not exist", async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      const error = await rejection(service.blockAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_NOT_FOUND");
    });

    test("unblockAccount: BLOQUE -> ACTIF", async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce(makeRecord({ status: "BLOQUE" }))
        .mockResolvedValueOnce(makeRecord({ status: "ACTIF" }));

      const dto = await service.unblockAccount(USER, UUID, IP);

      expect(prisma.account.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "ACTIF", closedAt: null } })
      );
      expect(emitSpy).toHaveBeenCalledWith(ACCOUNT_EVENTS.UNBLOCKED, expect.any(Object));
      expect(dto.status).toBe("ACTIF");
    });

    test("unblockAccount: 409 if the account is not blocked", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ status: "ACTIF" }));

      const error = await rejection(service.unblockAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_NOT_BLOCKED");
      expect(error[STATUS_KEY]).toBe(409);
    });

    test("closeAccount: closes a zero-balance account and stores closedAt", async () => {
      const closedAt = new Date("2026-06-01T00:00:00Z");
      prisma.account.findFirst
        .mockResolvedValueOnce(makeRecord({ balance: dec("0") }))
        .mockResolvedValueOnce(makeRecord({ status: "FERME", closedAt }));

      const dto = await service.closeAccount(USER, UUID, IP);

      expect(prisma.account.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "FERME", closedAt: expect.any(Date) } })
      );
      expect(recordAudit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ newValues: { status: "FERME", closedAt: closedAt.toISOString() } })
      );
      expect(emitSpy).toHaveBeenCalledWith(ACCOUNT_EVENTS.CLOSED, expect.any(Object));
      expect(dto.status).toBe("FERME");
    });

    test("closeAccount: 409 when the balance is not zero", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ balance: dec("10.50") }));

      const error = await rejection(service.closeAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_BALANCE_NOT_ZERO");
      expect(error[STATUS_KEY]).toBe(409);
      expect(prisma.account.updateMany).not.toHaveBeenCalled();
    });

    test("closeAccount: 409 when the account is already closed", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ status: "FERME", balance: dec("0") }));

      const error = await rejection(service.closeAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_ALREADY_CLOSED");
    });

    test("409 ACCOUNT_CONCURRENT_MODIFICATION when the optimistic guard fails", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ status: "ACTIF" }));
      prisma.account.updateMany.mockResolvedValue({ count: 0 });

      const error = await rejection(service.blockAccount(USER, UUID, IP));

      expect(error.code).toBe("ACCOUNT_CONCURRENT_MODIFICATION");
      expect(error[STATUS_KEY]).toBe(409);
      expect(recordAudit).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    test("a Prisma P2025 error is translated to 404 ACCOUNT_NOT_FOUND", async () => {
      prisma.account.findFirst.mockResolvedValue(makeRecord({ status: "ACTIF" }));
      prisma.account.updateMany.mockRejectedValue(Object.assign(new Error("gone"), { code: "P2025" }));

      const error = await rejection(service.blockAccount(USER, UUID, IP));

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("ACCOUNT_NOT_FOUND");
      expect(error[STATUS_KEY]).toBe(404);
    });
  });
});