import { listAuditLogsQuerySchema } from "./audit.schema.js";
import * as service from "./audit.service.js";

export async function listAuditLogs(req, res, next) {
  try {
    const query = listAuditLogsQuerySchema.parse(req.query);
    const data = await service.listAuditLogs(req.user.bankId, query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}