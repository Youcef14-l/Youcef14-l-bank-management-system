import { AppError } from "../utils/AppError.js";

// authorize(P.A, P.B)    -> the user must have ALL the listed permissions
// authorizeAny(P.A, P.B) -> the user must have AT LEAST ONE of them
// Always place it AFTER authenticate.

export const authorize =
  (...required) =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    const granted = new Set(req.user.permissions);
    if (!required.every((p) => granted.has(p))) {
      return next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
    }
    next();
  };

export const authorizeAny =
  (...required) =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    const granted = new Set(req.user.permissions);
    if (!required.some((p) => granted.has(p))) {
      return next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
    }
    next();
  };
