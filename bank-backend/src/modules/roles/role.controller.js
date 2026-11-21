import { asyncHandler } from "../../utils/asyncHandler.js";
import * as service from "./role.service.js";

const ctx = (req) => ({ ipAddress: req.ip });

export const list = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listRoles() });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getRole(req.validated.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createRole(req.user, req.body, ctx(req)) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.updateRole(req.user, req.validated.params.id, req.body, ctx(req)) });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteRole(req.user, req.validated.params.id, ctx(req));
  res.json({ success: true, data: { message: "Role deleted" } });
});

export const setPermissions = asyncHandler(async (req, res) => {
  const data = await service.setRolePermissions(req.user, req.validated.params.id, req.body, ctx(req));
  res.json({ success: true, data });
});
