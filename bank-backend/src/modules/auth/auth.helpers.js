import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

// Prisma "include" used every time we need the employee + role + permission codes.
export const authEmployeeInclude = {
  role: {
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
    },
  },
};

// Safe object exposed to the API / req.user. The password hash is NEVER included.
export function buildAuthUser(employee) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    bankId: employee.bankId,
    lastLoginAt: employee.lastLoginAt,
    role: { id: employee.role.id, name: employee.role.name },
    permissions: employee.role.permissions.map((rp) => rp.permission.code),
  };
}

// The token only carries the employee id. Role & permissions are re-read from the DB on every
// request, so a deactivation or a permission change takes effect immediately.
export function signToken(employeeId) {
  return jwt.sign({ sub: employeeId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
}
