import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authService from "./auth.service.js";

export const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  res.json({ success: true, data });
});

// req.user was built by the authenticate middleware (fresh from the DB).
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  res.json({ success: true, data: { message: "Password updated successfully" } });
});
