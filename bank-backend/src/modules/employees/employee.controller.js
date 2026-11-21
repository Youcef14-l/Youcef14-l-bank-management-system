import { asyncHandler } from "../../utils/asyncHandler.js";
import * as service from "./employee.service.js";

const ctx = (req) => ({ ipAddress: req.ip });

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listEmployees(req.user, req.validated.query);
  res.json({ success: true, data: items, meta });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getEmployee(req.user, req.validated.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  const data = await service.createEmployee(req.user, req.body, ctx(req));
  res.status(201).json({ success: true, data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await service.updateEmployee(req.user, req.validated.params.id, req.body, ctx(req));
  res.json({ success: true, data });
});

export const deactivate = asyncHandler(async (req, res) => {
  const data = await service.deactivateEmployee(req.user, req.validated.params.id, ctx(req));
  res.json({ success: true, data });
});

export const reactivate = asyncHandler(async (req, res) => {
  const data = await service.reactivateEmployee(req.user, req.validated.params.id, ctx(req));
  res.json({ success: true, data });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await service.resetEmployeePassword(req.user, req.validated.params.id, req.body, ctx(req));
  res.json({ success: true, data: { message: "Password reset successfully" } });
});
