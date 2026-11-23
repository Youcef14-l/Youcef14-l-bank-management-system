import { CompteBancaire } from "./CompteBancaire.js";
import { DomainError } from "./DomainError.js";
import { toCents, fromCents } from "./money.js";

/** Savings account: the balance can never fall below minimumBalance. */
export class CompteEpargne extends CompteBancaire {
  #interestRate;
  #minimumBalanceCents;

  constructor({ interestRate = "0", minimumBalance = "0", ...common }) {
    super(common);

    const rate = String(interestRate).trim();
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(rate) || Number(rate) > 100) {
      throw new DomainError("INVALID_ACCOUNT_CONFIGURATION", "Interest rate must be between 0 and 100");
    }
    const minimum = toCents(minimumBalance);
    if (minimum < 0n) {
      throw new DomainError("INVALID_ACCOUNT_CONFIGURATION", "Minimum balance cannot be negative");
    }
    this.#interestRate = rate; // a percentage, not money: kept as text
    this.#minimumBalanceCents = minimum;
  }

  get interestRate() { return this.#interestRate; }
  get minimumBalance() { return fromCents(this.#minimumBalanceCents); }

  // OVERRIDE: rule  newBalance >= minimumBalance
  withdraw(amount) {
    const cents = this._requirePositiveAmount(amount);
    this._assertActive();
    const newBalance = this._balanceInCents() - cents;
    if (newBalance < this.#minimumBalanceCents) {
      throw new DomainError(
        "INSUFFICIENT_FUNDS",
        `Withdrawal refused: the balance cannot fall below the minimum balance of ${this.minimumBalance}`
      );
    }
    this._debit(cents);
    return this.getBalance();
  }

  toPersistence() {
    return {
      ...super.toPersistence(),
      accountType: "EPARGNE",
      interestRate: this.#interestRate,
      minimumBalance: this.minimumBalance,
    };
  }
}