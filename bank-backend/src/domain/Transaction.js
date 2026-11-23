import { DomainError } from "./DomainError.js";
import { toCents, fromCents } from "./money.js";

export const TRANSACTION_TYPES = Object.freeze({ DEPOT: "DEPOT", RETRAIT: "RETRAIT", VIREMENT: "VIREMENT" });
export const TRANSACTION_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

/**
 * Transaction domain class (no Express, no Prisma).
 * ENCAPSULATION: every attribute is private (#); the state changes only through
 * approve / reject / complete / fail, which enforce the allowed transitions:
 *   PENDING  -> APPROVED -> COMPLETED
 *   PENDING  -> COMPLETED          (no approval required: executed immediately)
 *   PENDING | APPROVED -> FAILED
 *   PENDING  -> REJECTED
 * COMPLETED, REJECTED and FAILED are final.
 */
export class Transaction {
  #id; #reference; #transactionType; #amountCents; #feeCents; #description; #status;
  #sourceAccountId; #destinationAccountId; #initiatedById; #approvedById;
  #approvedAt; #rejectionReason; #completedAt; #failureReason = null;

  constructor({
    id = null, reference, transactionType, amount, fee = "0.00", description = null,
    status = TRANSACTION_STATUS.PENDING, sourceAccountId = null, destinationAccountId = null,
    initiatedById, approvedById = null, approvedAt = null, rejectionReason = null, completedAt = null,
  }) {
    if (isBlank(reference)) throw new DomainError("INVALID_TRANSACTION", "A transaction needs a reference");
    if (!Object.values(TRANSACTION_TYPES).includes(transactionType)) {
      throw new DomainError("INVALID_TRANSACTION_TYPE", `Unknown transaction type: ${transactionType}`);
    }
    if (!Object.values(TRANSACTION_STATUS).includes(status)) {
      throw new DomainError("INVALID_TRANSACTION", `Unknown transaction status: ${status}`);
    }
    if (isBlank(initiatedById)) throw new DomainError("INVALID_TRANSACTION", "A transaction needs an initiator");

    const amountCents = toCents(amount);
    if (amountCents <= 0n) throw new DomainError("INVALID_AMOUNT", "Amount must be strictly positive");
    const feeCents = toCents(fee);
    if (feeCents < 0n) throw new DomainError("INVALID_AMOUNT", "Fee cannot be negative");

    const hasSource = !isBlank(sourceAccountId);
    const hasDestination = !isBlank(destinationAccountId);
    const T = TRANSACTION_TYPES;
    const validCombination =
      (transactionType === T.DEPOT && hasDestination && !hasSource) ||
      (transactionType === T.RETRAIT && hasSource && !hasDestination) ||
      (transactionType === T.VIREMENT && hasSource && hasDestination);
    if (!validCombination) {
      throw new DomainError("INVALID_TRANSACTION_ACCOUNTS", `Invalid account combination for a ${transactionType}`);
    }
    if (transactionType === T.VIREMENT && sourceAccountId === destinationAccountId) {
      throw new DomainError("SAME_ACCOUNT_TRANSFER", "Source and destination accounts must be different");
    }

    this.#id = id; this.#reference = reference; this.#transactionType = transactionType;
    this.#amountCents = amountCents; this.#feeCents = feeCents;
    this.#description = isBlank(description) ? null : String(description).trim();
    this.#status = status;
    this.#sourceAccountId = hasSource ? sourceAccountId : null;
    this.#destinationAccountId = hasDestination ? destinationAccountId : null;
    this.#initiatedById = initiatedById; this.#approvedById = approvedById;
    this.#approvedAt = approvedAt; this.#rejectionReason = rejectionReason; this.#completedAt = completedAt;
  }

  // Rebuilds the object from a Prisma row (Decimal values are accepted by toCents).
  static fromPersistence(row) {
    return new Transaction({
      id: row.id, reference: row.reference, transactionType: row.transactionType,
      amount: row.amount, fee: row.fee, description: row.description, status: row.status,
      sourceAccountId: row.sourceAccountId, destinationAccountId: row.destinationAccountId,
      initiatedById: row.initiatedById, approvedById: row.approvedById, approvedAt: row.approvedAt,
      rejectionReason: row.rejectionReason, completedAt: row.completedAt,
    });
  }

  /* ---------- Getters (no setters) ---------- */
  get id() { return this.#id; }
  get reference() { return this.#reference; }
  get transactionType() { return this.#transactionType; }
  get amount() { return fromCents(this.#amountCents); }
  get fee() { return fromCents(this.#feeCents); }
  get description() { return this.#description; }
  get status() { return this.#status; }
  get sourceAccountId() { return this.#sourceAccountId; }
  get destinationAccountId() { return this.#destinationAccountId; }
  get initiatedById() { return this.#initiatedById; }
  get approvedById() { return this.#approvedById; }
  get approvedAt() { return this.#approvedAt; }
  get rejectionReason() { return this.#rejectionReason; }
  get completedAt() { return this.#completedAt; }
  get failureReason() { return this.#failureReason; }

  isFinal() {
    return [TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.REJECTED, TRANSACTION_STATUS.FAILED].includes(this.#status);
  }

  // threshold: null/undefined/"" = no approval; "0" = always; "500.00" = amount >= 500.00
  requiresApproval(threshold) {
    if (isBlank(threshold)) return false;
    return this.#amountCents >= toCents(threshold);
  }

  /* ---------- Controlled state transitions ---------- */
  #assertStatus(allowed, action) {
    if (!allowed.includes(this.#status)) {
      throw new DomainError("INVALID_TRANSACTION_STATE", `Cannot ${action} a transaction that is ${this.#status}`);
    }
  }

  approve(approverId, at = new Date()) {
    this.#assertStatus([TRANSACTION_STATUS.PENDING], "approve");
    if (isBlank(approverId)) throw new DomainError("INVALID_TRANSACTION", "An approver is required");
    if (approverId === this.#initiatedById) {
      throw new DomainError("SELF_APPROVAL_FORBIDDEN", "The employee who initiated a transaction cannot approve it");
    }
    this.#approvedById = approverId;
    this.#approvedAt = at;
    this.#status = TRANSACTION_STATUS.APPROVED;
  }

  reject(rejectedById, reason) {
    this.#assertStatus([TRANSACTION_STATUS.PENDING], "reject");
    if (isBlank(rejectedById)) throw new DomainError("INVALID_TRANSACTION", "A rejecting employee is required");
    if (isBlank(reason)) throw new DomainError("REJECTION_REASON_REQUIRED", "A rejection reason is required");
    this.#rejectionReason = String(reason).trim();
    this.#status = TRANSACTION_STATUS.REJECTED;
  }

  complete(at = new Date()) {
    this.#assertStatus([TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.APPROVED], "complete");
    this.#completedAt = at;
    this.#status = TRANSACTION_STATUS.COMPLETED;
  }

  fail(reason) {
    this.#assertStatus([TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.APPROVED], "fail");
    this.#failureReason = isBlank(reason) ? "Unknown failure" : String(reason);
    this.#status = TRANSACTION_STATUS.FAILED;
  }

  toPersistence() {
    return {
      reference: this.#reference, transactionType: this.#transactionType,
      amount: this.amount, fee: this.fee, description: this.#description, status: this.#status,
      sourceAccountId: this.#sourceAccountId, destinationAccountId: this.#destinationAccountId,
      initiatedById: this.#initiatedById, approvedById: this.#approvedById, approvedAt: this.#approvedAt,
      rejectionReason: this.#rejectionReason, completedAt: this.#completedAt,
    };
  }
}
