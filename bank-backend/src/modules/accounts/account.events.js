import { EventEmitter } from "node:events";

export const ACCOUNT_EVENTS = Object.freeze({
  CREATED: "account.created",
  BLOCKED: "account.blocked",
  UNBLOCKED: "account.unblocked",
  CLOSED: "account.closed",
});

// One shared emitter for the whole application (in-memory, no broker).
export const accountEvents = new EventEmitter();

/**
 * EMITTER side. Called by account.service.js ONLY AFTER the database transaction committed.
 * A failing listener can never roll back or break the business operation.
 */
export const emitAccountEvent = (eventName, payload) => {
  try {
    accountEvents.emit(eventName, payload);
  } catch (error) {
    console.error(`[events] listener for ${eventName} failed:`, error.message);
  }
};

/**
 * LISTENER side. Here they only log; later they could send a notification or refresh statistics.
 * Audit logging is NOT done here: it is written in the same transaction as the change.
 */
const registerAccountListeners = () => {
  Object.values(ACCOUNT_EVENTS).forEach((eventName) => {
    accountEvents.on(eventName, (payload) => {
      console.log(`[event] ${eventName}`, payload);
    });
  });
};

// Listeners are registered once, when this module is first imported.
registerAccountListeners();