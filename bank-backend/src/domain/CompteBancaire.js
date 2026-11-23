import { DomainError } from "./DomainError.js";
import { toCents, fromCents } from "./money.js";

export const ACCOUNT_STATUS = Object.freeze({
  ACTIF: "ACTIF",
  BLOQUE: "BLOQUE",
  FERME: "FERME",
});

/**
 * Parent class of every bank account.
 * ENCAPSULATION: balance, status and closedAt are private (#). They can only
 * change through deposit / withdraw / block / unblock / close, which enforce the rules.
 * There is NO balance setter.
 */
export class CompteBancaire {
  #id;
  #accountNumber;
  #currency;
  #customerId;
  #balanceCents;
  #status;
  #closedAt;

  constructor({
    id = null,
    accountNumber,
    balance = "0.00",
    currency = "DZD",
    status = ACCOUNT_STATUS.ACTIF,
    customerId,
    closedAt = null,
  }) {
    if (!Object.values(ACCOUNT_STATUS).includes(status)) {
      throw new DomainError("INVALID_ACCOUNT_CONFIGURATION", `Unknown account status: ${status}`);
    }
    this.#id = id;
    this.#accountNumber = accountNumber;
    this.#currency = currency;
    this.#customerId = customerId;
    this.#balanceCents = toCents(balance);
    this.#status = status;
    this.#closedAt = closedAt;
  }

  /* ---------- Read-only accessors (getters without setters) ---------- */
  get id() { return this.#id; }
  get accountNumber() { return this.#accountNumber; }
  get currency() { return this.#currency; }
  get customerId() { return this.#customerId; }
  get status() { return this.#status; }
  get closedAt() { return this.#closedAt; }

  getBalance() { return fromCents(this.#balanceCents); }
  isActive() { return this.#status === ACCOUNT_STATUS.ACTIF; }

  /* ---------- Protected helpers (used by subclasses; "_" = do not call from outside) ---------- */
  _balanceInCents() { return this.#balanceCents; }

  _requirePositiveAmount(amount) {
    const cents = toCents(amount);
    if (cents <= 0n) {
      throw new DomainError("INVALID_AMOUNT", "Amount must be strictly positive");
    }
    return cents;
  }

  _assertActive() {
    if (!this.isActive()) {
      throw new DomainError("ACCOUNT_NOT_ACTIVE", `Operation refused: account is ${this.#status}`);
    }
  }

  _debit(cents) { this.#balanceCents -= cents; }

  /* ---------- Operations ---------- */
  deposit(amount) {
    const cents = this._requirePositiveAmount(amount);
    this._assertActive();
    this.#balanceCents += cents;
    return this.getBalance();
  }

  // Default rule of the parent class: the balance can never go below 0.
  // Subclasses OVERRIDE this method with their own rule (polymorphism).
  withdraw(amount) {
    const cents = this._requirePositiveAmount(amount);
    this._assertActive();
    if (this.#balanceCents - cents < 0n) {
      throw new DomainError("INSUFFICIENT_FUNDS", "Insufficient funds");
    }
    this._debit(cents);
    return this.getBalance();
  }

  block() {
    if (this.#status === ACCOUNT_STATUS.BLOQUE) {
      throw new DomainError("ACCOUNT_ALREADY_BLOCKED", "Account is already blocked");
    }
    if (this.#status === ACCOUNT_STATUS.FERME) {
      throw new DomainError("INVALID_ACCOUNT_STATUS_TRANSITION", "A closed account cannot be blocked");
    }
    this.#status = ACCOUNT_STATUS.BLOQUE;
  }

  unblock() {
    if (this.#status === ACCOUNT_STATUS.ACTIF) {
      throw new DomainError("ACCOUNT_NOT_BLOCKED", "Account is not blocked");
    }
    if (this.#status === ACCOUNT_STATUS.FERME) {
      throw new DomainError("INVALID_ACCOUNT_STATUS_TRANSITION", "A closed account cannot be unblocked");
    }
    this.#status = ACCOUNT_STATUS.ACTIF;
  }

  close() {
    if (this.#status === ACCOUNT_STATUS.FERME) {
      throw new DomainError("ACCOUNT_ALREADY_CLOSED", "Account is already closed");
    }
    if (this.#balanceCents !== 0n) {
      throw new DomainError(
        "ACCOUNT_BALANCE_NOT_ZERO",
        `Account cannot be closed while its balance is ${this.getBalance()} (it must be 0.00)`
      );
    }
    this.#status = ACCOUNT_STATUS.FERME;
    this.#closedAt = new Date();
  }

  // Plain object with the columns common to all accounts (no Prisma import needed).
  toPersistence() {
    return {
      accountNumber: this.#accountNumber,
      balance: this.getBalance(),
      currency: this.#currency,
      status: this.#status,
      customerId: this.#customerId,
      closedAt: this.#closedAt,
    };
  }
}

/**
 * POLYMORPHISM: this shared function does NOT check the account type.
 * It only calls withdraw(); each concrete class applies its own rule.
 */
export const performWithdrawal = (compte, amount) => compte.withdraw(amount);