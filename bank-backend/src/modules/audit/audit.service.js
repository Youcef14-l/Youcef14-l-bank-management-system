// Append-only: this module only exposes a "create" operation (no update / delete).
// `db` is either the global prisma client or the `tx` of a $transaction, so the audit row is
// written in the SAME transaction as the change it describes (both succeed or both fail).

// Values go to a JSON column: normalise Dates etc. and drop `undefined`.
const toJson = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function recordAudit(db, { employeeId = null, action, entityType, entityId, description, oldValues, newValues, ipAddress }) {
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
