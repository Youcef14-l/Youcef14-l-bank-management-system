import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { toSkipTake, buildPage } from "../../utils/pagination.js";
import { ROLES } from "../../constants/permissions.js";
import { recordAudit } from "../audit/audit.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../audit/audit.constants.js";

// The ONLY shape of an employee that leaves this module: `password` is not selectable here.
export const employeeSelect = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  isActive: true,
  bankId: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  role: { select: { id: true, name: true } },
};

// ----- helpers ----------------------------------------------------------------------------------

// An admin only sees / manages the employees of his own bank.
async function findInBank(db, actor, id) {
  const employee = await db.employee.findFirst({
    where: { id, bankId: actor.bankId },
    select: employeeSelect,
  });
  if (!employee) throw new AppError("Employee not found", 404, "NOT_FOUND");
  return employee;
}

async function assertRoleExists(db, roleId) {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) throw new AppError("Role not found", 400, "INVALID_ROLE");
  return role;
}

// Lock-out protection: the bank must always keep at least one active administrator.
async function assertNotLastActiveAdmin(db, target) {
  if (target.role.name !== ROLES.ADMINISTRATEUR || !target.isActive) return;
  const others = await db.employee.count({
    where: {
      bankId: target.bankId,
      isActive: true,
      id: { not: target.id },
      role: { name: ROLES.ADMINISTRATEUR },
    },
  });
  if (others === 0) {
    throw new AppError("The last active administrator cannot be removed or deactivated", 409, "LAST_ADMIN");
  }
}

const fullName = (e) => `${e.firstName} ${e.lastName} (${e.employeeNumber})`;

// ----- queries ----------------------------------------------------------------------------------

export async function listEmployees(actor, query) {
  const where = {
    bankId: actor.bankId,
    ...(query.roleId && { roleId: query.roleId }),
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      OR: ["firstName", "lastName", "email", "employeeNumber"].map((f) => ({
        [f]: { contains: query.search, mode: "insensitive" },
      })),
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      ...toSkipTake(query),
    }),
    prisma.employee.count({ where }),
  ]);
  return buildPage(items, total, query);
}

export const getEmployee = (actor, id) => findInBank(prisma, actor, id);

// ----- commands (each one = 1 DB transaction: change + audit log) -------------------------------

export async function createEmployee(actor, input, ctx) {
  await assertRoleExists(prisma, input.roleId);
  const password = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        employeeNumber: input.employeeNumber,
        roleId: input.roleId,
        bankId: actor.bankId, // new employees belong to the creator's bank
        password,
      },
      select: employeeSelect,
    });

    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
      entityType: ENTITY_TYPES.EMPLOYEE,
      entityId: created.id,
      description: `Employee ${fullName(created)} created with role ${created.role.name}`,
      newValues: created,
      ipAddress: ctx.ipAddress,
    });
    return created;
  });
}

export async function updateEmployee(actor, id, input, ctx) {
  return prisma.$transaction(async (tx) => {
    const target = await findInBank(tx, actor, id);

    // Keep only the fields that really change.
    const oldValues = {};
    const newValues = {};
    for (const [key, value] of Object.entries(input)) {
      const current = key === "roleId" ? target.role.id : target[key];
      if (value !== current) {
        oldValues[key] = current;
        newValues[key] = value;
      }
    }
    if (Object.keys(newValues).length === 0) return target; // nothing to do, nothing to audit

    if (newValues.roleId) {
      if (target.id === actor.id) {
        throw new AppError("You cannot change your own role", 403, "SELF_ROLE_CHANGE");
      }
      await assertRoleExists(tx, newValues.roleId);
      await assertNotLastActiveAdmin(tx, target); // demoting the last admin = lock-out
    }

    const updated = await tx.employee.update({ where: { id }, data: newValues, select: employeeSelect });

    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
      entityType: ENTITY_TYPES.EMPLOYEE,
      entityId: id,
      description: `Employee ${fullName(updated)} updated (${Object.keys(newValues).join(", ")})`,
      oldValues,
      newValues,
      ipAddress: ctx.ipAddress,
    });
    return updated;
  });
}

async function setActive(actor, id, isActive, ctx) {
  return prisma.$transaction(async (tx) => {
    const target = await findInBank(tx, actor, id);

    if (target.isActive === isActive) {
      throw new AppError(
        isActive ? "Employee is already active" : "Employee is already deactivated",
        409,
        isActive ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE"
      );
    }
    if (!isActive) {
      if (target.id === actor.id) {
        throw new AppError("You cannot deactivate your own account", 403, "SELF_DEACTIVATION");
      }
      await assertNotLastActiveAdmin(tx, target);
    }

    const updated = await tx.employee.update({ where: { id }, data: { isActive }, select: employeeSelect });

    await recordAudit(tx, {
      employeeId: actor.id,
      action: isActive ? AUDIT_ACTIONS.EMPLOYEE_REACTIVATED : AUDIT_ACTIONS.EMPLOYEE_DEACTIVATED,
      entityType: ENTITY_TYPES.EMPLOYEE,
      entityId: id,
      description: `Employee ${fullName(updated)} ${isActive ? "reactivated" : "deactivated"}`,
      oldValues: { isActive: !isActive },
      newValues: { isActive },
      ipAddress: ctx.ipAddress,
    });
    return updated;
  });
}

export const deactivateEmployee = (actor, id, ctx) => setActive(actor, id, false, ctx);
export const reactivateEmployee = (actor, id, ctx) => setActive(actor, id, true, ctx);

export async function resetEmployeePassword(actor, id, { newPassword }, ctx) {
  if (id === actor.id) {
    throw new AppError("Use /api/auth/change-password to change your own password", 400, "USE_CHANGE_PASSWORD");
  }
  const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const target = await findInBank(tx, actor, id);
    await tx.employee.update({ where: { id }, data: { password: hash } });

    // Never store the password (nor its hash) in the audit log.
    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.EMPLOYEE_PASSWORD_RESET,
      entityType: ENTITY_TYPES.EMPLOYEE,
      entityId: id,
      description: `Password of ${fullName(target)} reset by an administrator`,
      ipAddress: ctx.ipAddress,
    });
  });
}
