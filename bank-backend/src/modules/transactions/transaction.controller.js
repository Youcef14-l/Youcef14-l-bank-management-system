import * as service from "./transaction.service.js";
import {
  validate, depositSchema, withdrawalSchema, transferSchema, rejectSchema, emptyBodySchema,
  idParamSchema, referenceParamSchema, idempotencyKeySchema, listQuerySchema,
} from "./transaction.schema.js";

// HTTP only: parse -> call service -> format. No financial logic here.
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const contextOf = (req) => ({
  idempotencyKey: validate(idempotencyKeySchema, req.get("Idempotency-Key")),
  ipAddress: req.ip,
});

const sendCreated = (res, result, doneMessage) => {
  const pending = result.transaction.status === "PENDING";
  const status = result.replayed ? 200 : pending ? 202 : 201;
  const message = result.replayed ? "Request already processed (idempotent replay)" : pending ? "Transaction created and waiting for approval" : doneMessage;
  res.status(status).json({ success: true, message, data: result });
};

export const createDeposit = handle(async (req, res) =>
  sendCreated(res, await service.createDeposit(req.user, validate(depositSchema, req.body), contextOf(req)), "Deposit completed"));

export const createWithdrawal = handle(async (req, res) =>
  sendCreated(res, await service.createWithdrawal(req.user, validate(withdrawalSchema, req.body), contextOf(req)), "Withdrawal completed"));

export const createTransfer = handle(async (req, res) =>
  sendCreated(res, await service.createTransfer(req.user, validate(transferSchema, req.body), contextOf(req)), "Transfer completed"));

export const listTransactions = handle(async (req, res) => {
  const data = await service.listTransactions(req.user, validate(listQuerySchema, req.query));
  res.json({ success: true, data });
});

export const getTransactionById = handle(async (req, res) => {
  const data = await service.getTransactionById(req.user, validate(idParamSchema, req.params.id));
  res.json({ success: true, data });
});

export const getTransactionByReference = handle(async (req, res) => {
  const data = await service.getTransactionByReference(req.user, validate(referenceParamSchema, req.params.reference));
  res.json({ success: true, data });
});

export const listByAccount = handle(async (req, res) => {
  const data = await service.listByAccount(req.user, validate(idParamSchema, req.params.accountId), validate(listQuerySchema, req.query));
  res.json({ success: true, data });
});

export const listByCustomer = handle(async (req, res) => {
  const data = await service.listByCustomer(req.user, validate(idParamSchema, req.params.customerId), validate(listQuerySchema, req.query));
  res.json({ success: true, data });
});

export const approveTransaction = handle(async (req, res) => {
  validate(emptyBodySchema, req.body ?? {});
  const data = await service.approveTransaction(req.user, validate(idParamSchema, req.params.id), { ipAddress: req.ip });
  res.json({ success: true, message: "Transaction approved and executed", data });
});

export const rejectTransaction = handle(async (req, res) => {
  const data = await service.rejectTransaction(req.user, validate(idParamSchema, req.params.id), validate(rejectSchema, req.body), { ipAddress: req.ip });
  res.json({ success: true, message: "Transaction rejected", data });
});
