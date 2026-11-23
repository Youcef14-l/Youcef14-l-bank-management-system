import { CompteBancaire } from "./CompteBancaire.js";
import { DomainError } from "./DomainError.js";
import { toCents, fromCents } from "./money.js";

/** Current account: may go negative, but never below -overdraftLimit. */
export class CompteCourant extends CompteBancaire {
  #overdraftLimitCents;

  constructor({ overdraftLimit = "0", ...common }) {
    super(common);
    const cents = toCents(overdraftLimit);
    if (cents < 0n) {
      throw new DomainError("INVALID_ACCOUNT_CONFIGURATION", "Overdraft limit cannot be negative");
    }
    this.#overdraftLimitCents = cents;
  }

  get overdraftLimit() { return fromCents(this.#overdraftLimitCents); }

  // OVERRIDE: rule  newBalance >= -overdraftLimit
  withdraw(amount) {
    const cents = this._requirePositiveAmount(amount);
    this._assertActive();
    const newBalance = this._balanceInCents() - cents;
    if (newBalance < -this.#overdraftLimitCents) {
      throw new DomainError(
        "INSUFFICIENT_FUNDS",
        `Withdrawal refused: it would exceed the overdraft limit of ${this.overdraftLimit}`
      );
    }
    this._debit(cents);
    return this.getBalance();
  }

  toPersistence() {
    return { ...super.toPersistence(), accountType: "COURANT", overdraftLimit: this.overdraftLimit };
  }
}