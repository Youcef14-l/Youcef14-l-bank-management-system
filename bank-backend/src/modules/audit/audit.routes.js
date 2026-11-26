import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import * as controller from "./audit.controller.js";

const router = Router();

router.use(authenticate);

// Append-only log: ONLY a GET exists. No POST/PATCH/PUT/DELETE.
router.get("/", authorize(PERMISSIONS.AUDIT_LOGS_VIEW), controller.listAuditLogs);

export default router;