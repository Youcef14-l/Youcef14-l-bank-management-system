import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { authEmployeeInclude, buildAuthUser, signToken } from "./auth.helpers.js";

// Used when the email does not exist, so the response time is the same as for a wrong password
// (prevents discovering which emails exist by measuring the response time).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", env.BCRYPT_ROUNDS);

export async function login({ email, password }) {
  const employee = await prisma.employee.findUnique({
    where: { email },
    include: authEmployeeInclude,
  });

  const passwordOk = await bcrypt.compare(password, employee?.password ?? DUMMY_HASH);

  if (!employee || !passwordOk) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  if (!employee.isActive) {
    throw new AppError("This account has been deactivated", 403, "ACCOUNT_DISABLED");
  }

  const updated = await prisma.employee.update({
    where: { id: employee.id },
    data: { lastLoginAt: new Date() },
    select: { lastLoginAt: true },
  });

  return {
    token: signToken(employee.id),
    employee: buildAuthUser({ ...employee, lastLoginAt: updated.lastLoginAt }),
  };
}

export async function changePassword(employeeId, { currentPassword, newPassword }) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, password: true },
  });
  if (!employee) throw new AppError("Employee not found", 404, "NOT_FOUND");

  const ok = await bcrypt.compare(currentPassword, employee.password);
  if (!ok) throw new AppError("Current password is incorrect", 400, "WRONG_PASSWORD");

  const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await prisma.employee.update({ where: { id: employeeId }, data: { password: hash } });
}
