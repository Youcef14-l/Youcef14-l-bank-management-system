import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  authEmployeeInclude,
  buildAuthUser,
  verifyToken,
} from "../modules/auth/auth.helpers.js";

// Requires "Authorization: Bearer <token>". Sets req.user = { id, role, permissions, ... }.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  let payload;
  try {
    payload = verifyToken(header.slice(7).trim());
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Session expired, please log in again", 401, "TOKEN_EXPIRED");
    }
    throw new AppError("Invalid token", 401, "TOKEN_INVALID");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: payload.sub },
    include: authEmployeeInclude,
  });

  if (!employee || !employee.isActive) {
    throw new AppError("Account not found or deactivated", 401, "ACCOUNT_DISABLED");
  }

  req.user = buildAuthUser(employee);
  next();
});
