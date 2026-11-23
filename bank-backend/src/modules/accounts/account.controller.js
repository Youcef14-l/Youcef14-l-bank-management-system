import { asyncHandler } from "../../utils/asyncHandler.js";
import * as accountService from "./account.service.js";

export const createAccount = asyncHandler(async (req, res) => {
  const account = await accountService.createAccount(req.user, req.body, req.ip);
  res.status(201).json({ success: true, message: "Account created successfully", data: account });
});

export const listAccounts = asyncHandler(async (req, res) => {
  const { data, meta } = await accountService.listAccounts(req.user.bankId, req.validated.query);
  res.status(200).json({ success: true, data, meta });
});

export const getAccount = asyncHandler(async (req, res) => {
  const account = await accountService.getAccountById(req.user.bankId, req.validated.params.id);
  res.status(200).json({ success: true, data: account });
});

export const getCustomerAccounts = asyncHandler(async (req, res) => {
  const data = await accountService.getCustomerAccounts(
    req.user.bankId,
    req.validated.params.customerId,
    req.validated.query
  );
  res.status(200).json({ success: true, data });
});

export const blockAccount = asyncHandler(async (req, res) => {
  const account = await accountService.blockAccount(req.user, req.validated.params.id, req.ip);
  res.status(200).json({ success: true, message: "Account blocked successfully", data: account });
});

export const unblockAccount = asyncHandler(async (req, res) => {
  const account = await accountService.unblockAccount(req.user, req.validated.params.id, req.ip);
  res.status(200).json({ success: true, message: "Account unblocked successfully", data: account });
});

export const closeAccount = asyncHandler(async (req, res) => {
  const account = await accountService.closeAccount(req.user, req.validated.params.id, req.ip);
  res.status(200).json({ success: true, message: "Account closed successfully", data: account });
});