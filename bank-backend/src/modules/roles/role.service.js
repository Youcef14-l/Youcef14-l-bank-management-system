import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { recordAudit } from "../audit/audit.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../audit/audit.constants.js";
import { validatePermissionSet } from "./role.rules.js";

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { employees: true, permissions: true } },
};

const roleDetailSelect = {
  ...roleSelect,
  permissions: { select: { permission: { select: { id: true, code: true, module: true, description: true } } } },
};

// Flatten [{ permission: {...} }] -> [{...}] sorted by code
function shapeRole(role) {
  const { permissions, ...rest } = role;
  return { ...rest, permissions: permissions.map((p) => p.permission).sort((a, b) => a.code.localeCompare(b.code)) };
}

async function getRoleOr404(db, id) {
  const role = await db.role.findUnique({ where: { id }, select: roleDetailSelect });
  if (!role) throw new AppError("Role not found", 404, "NOT_FOUND");
  return shapeRole(role);
}

// ----- queries ----------------------------------------------------------------------------------
export const listRoles = () => prisma.role.findMany({ select: roleSelect, orderBy: { name: "asc" } });
export const getRole = (id) => getRoleOr404(prisma, id);

// ----- commands ---------------------------------------------------------------------------------
export async function createRole(actor, input, ctx) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { name: input.name, description: input.description ?? null, isSystem: false },
      select: roleSelect,
    });
    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.ROLE_CREATED,
      entityType: ENTITY_TYPES.ROLE,
      entityId: role.id,
      description: `Role ${role.name} created`,
      newValues: { name: role.name, description: role.description },
      ipAddress: ctx.ipAddress,
    });
    return role;
  });
}

export async function updateRole(actor, id, input, ctx) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
    if (!role) throw new AppError("Role not found", 404, "NOT_FOUND");

    // The 5 system roles are referenced by name in the code: their name is frozen.
    if (role.isSystem && input.name !== undefined && input.name !== role.name) {
      throw new AppError("The name of a system role cannot be changed", 403, "SYSTEM_ROLE");
    }

    const oldValues = {};
    const newValues = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== role[key]) {
        oldValues[key] = role[key];
        newValues[key] = value;
      }
    }
    if (Object.keys(newValues).length === 0) return role;

    const updated = await tx.role.update({ where: { id }, data: newValues, select: roleSelect });
    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      entityType: ENTITY_TYPES.ROLE,
      entityId: id,
      description: `Role ${updated.name} updated (${Object.keys(newValues).join(", ")})`,
      oldValues,
      newValues,
      ipAddress: ctx.ipAddress,
    });
    return updated;
  });
}

export async function deleteRole(actor, id, ctx) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
    if (!role) throw new AppError("Role not found", 404, "NOT_FOUND");
    if (role.isSystem) throw new AppError("System roles cannot be deleted", 403, "SYSTEM_ROLE");
    if (role._count.employees > 0) {
      throw new AppError("This role is still assigned to employees", 409, "ROLE_IN_USE");
    }

    await tx.role.delete({ where: { id } }); // role_permissions rows are removed by ON DELETE CASCADE
    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.ROLE_DELETED,
      entityType: ENTITY_TYPES.ROLE,
      entityId: id,
      description: `Role ${role.name} deleted`,
      oldValues: { name: role.name, description: role.description },
      ipAddress: ctx.ipAddress,
    });
  });
}

export async function setRolePermissions(actor, id, { permissions }, ctx) {
  const codes = [...new Set(permissions)];

  return prisma.$transaction(async (tx) => {
    const role = await getRoleOr404(tx, id);

    // 1) every code must exist in the permissions catalog
    const found = await tx.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    if (found.length !== codes.length) {
      const known = new Set(found.map((p) => p.code));
      throw new AppError("Unknown permission code(s)", 400, "UNKNOWN_PERMISSION", codes.filter((c) => !known.has(c)));
    }

    // 2) the business rules of the role (admin: no money, controller: read-only, ...)
    validatePermissionSet(role.name, codes);

    // 3) nothing changed -> nothing to write
    const before = role.permissions.map((p) => p.code).sort();
    const after = [...codes].sort();
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c) => !after.includes(c));
    if (added.length === 0 && removed.length === 0) return role;

    // 4) replace the set + audit, atomically
    await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: found.map((p) => p.id) } } });
    await tx.rolePermission.createMany({
      data: found.map((p) => ({ roleId: id, permissionId: p.id })),
      skipDuplicates: true,
    });

    await recordAudit(tx, {
      employeeId: actor.id,
      action: AUDIT_ACTIONS.ROLE_PERMISSIONS_UPDATED,
      entityType: ENTITY_TYPES.ROLE,
      entityId: id,
      description: `Permissions of role ${role.name} updated (+${added.length} / -${removed.length})`,
      oldValues: { permissions: before },
      newValues: { permissions: after },
      ipAddress: ctx.ipAddress,
    });

    return getRoleOr404(tx, id);
  });
}
