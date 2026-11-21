import { asyncHandler } from "../../utils/asyncHandler.js";
import { listPermissionsGrouped } from "./permission.service.js";

export const list = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await listPermissionsGrouped() });
});
