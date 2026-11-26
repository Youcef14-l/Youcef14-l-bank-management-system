// Append-only: this module only exposes a "create" operation (no update / delete).
// `db` is either the global prisma client or the `tx` of a $transaction, so the audit row is
// written in the SAME transaction as the change it describes (both succeed or both fail).
import * as prismaModule from "../../config/prisma.js";

const prisma = prismaModule.default ?? prismaModule.prisma;

const toJson = (v) =>
  v === undefined ? undefined : JSON.parse(JSON.stringify(v));

export function recordAudit(
  db,
  {
    employeeId = null,
    action,
    entityType,
    entityId,
    description,
    oldValues,
    newValues,
    ipAddress,
  }
) {
  return db.auditLog.create({
    data: {
      employeeId,
      action,
      entityType,
      entityId: String(entityId),
      description,
      oldValues: toJson(oldValues),
      newValues: toJson(newValues),
      ipAddress: ipAddress ?? null,
    },
  });
}

/* ------------------------- read-only queries ------------------------- */

const SENSITIVE_KEY = /pass|hash|token|secret|national|cin\b|iban|pin/i;

// Defensive redaction of old/new snapshots before they leave the server.
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? "[masqué]" : sanitize(v),
      ])
    );
  }
  return value;
}

export async function listAuditLogs(
  bankId,
  { page, limit, action, entityType, employeeId, from, to }
) {
  // Bank isolation: only employees of the caller's bank.
  const employees = await prisma.employee.findMany({
    where: { bankId },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));

  const empty = {
    items: [],
    pagination: { page, limit, total: 0, totalPages: 0 },
  };

  // An employeeId from another bank behaves like "no results" (no information leak).
  if (employeeId && !byId.has(employeeId)) return empty;
  if (byId.size === 0) return empty;

  const where = {
    employeeId: employeeId ?? { in: [...byId.keys()] },
    ...(action && { action }),
    ...(entityType && { entityType }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((r) => {
      const e = byId.get(r.employeeId);
      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        description: r.description,
        oldValues: sanitize(r.oldValues ?? null),
        newValues: sanitize(r.newValues ?? null),
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
        employee: e
          ? {
              id: e.id,
              employeeNumber: e.employeeNumber,
              firstName: e.firstName,
              lastName: e.lastName,
            }
          : null,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
