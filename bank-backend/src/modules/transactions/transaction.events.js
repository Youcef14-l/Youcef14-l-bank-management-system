import { EventEmitter } from "node:events";

// No imports from other modules -> no circular dependency possible.
export const TRANSACTION_EVENTS = Object.freeze({
  DEPOSIT_COMPLETED: "transaction.deposit.completed",
  WITHDRAWAL_COMPLETED: "transaction.withdrawal.completed",
  TRANSFER_COMPLETED: "transaction.transfer.completed",
  APPROVED: "transaction.approved",
  REJECTED: "transaction.rejected",
  FAILED: "transaction.failed",
});

export const transactionEvents = new EventEmitter();

// Listeners run in their own tick and inside try/catch: a listener that throws (or rejects)
// can never undo or break a financial operation that is already committed.
// NOTE: an in-memory EventEmitter is NOT a durable queue - events are lost if the process
// stops, and nothing is retried. Use it for notifications, never as the source of truth (the DB is).
export function emitTransactionEvent(name, payload) {
  for (const listener of transactionEvents.listeners(name)) {
    setImmediate(() => {
      const report = (e) => console.error(`[transaction-event] listener failed for ${name}:`, e?.message ?? e);
      try {
        const result = listener(payload);
        if (result && typeof result.catch === "function") result.catch(report);
      } catch (e) {
        report(e);
      }
    });
  }
}

export const onTransactionEvent = (name, listener) => transactionEvents.on(name, listener);

// Default subscriber (demonstrates event-driven programming): logs each committed operation.
if (process.env.NODE_ENV !== "test") {
  for (const name of Object.values(TRANSACTION_EVENTS)) {
    onTransactionEvent(name, (p) => console.log(`[transaction-event] ${name} ref=${p.reference} amount=${p.amount}`));
  }
}
