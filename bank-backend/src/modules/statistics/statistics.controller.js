import { statisticsQuerySchema } from "./statistics.schema.js";
import * as service from "./statistics.service.js";

export async function getStatistics(req, res, next) {
  try {
    const query = statisticsQuerySchema.parse(req.query);
    const data = await service.getStatistics(req.user.bankId, query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}