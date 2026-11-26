import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import * as controller from "./statistics.controller.js";

const router = Router();

router.use(authenticate);

// Read-only: GET only, no write routes exist in this module.
router.get("/", authorize(PERMISSIONS.STATISTICS_VIEW), controller.getStatistics);

export default router;