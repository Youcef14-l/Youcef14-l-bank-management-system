
import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";

import { updateBankSchema } from "./bank.validation.js";
import * as controller from "./bank.controller.js"; 
import { PERMISSIONS } from "../../constants/permissions.js";

const router = Router();

router.use(authenticate);

// All authenticated employees can read the bank summary.
router.get("/summary", controller.getBankSummary);

// Only administrators with this permission can view full details.
router.get(
  "/",
  authorize(PERMISSIONS.BANK_SETTINGS_MANAGE),
  controller.getBank
);

// Only administrators with this permission can update bank details.
router.patch(
  "/",
  authorize(PERMISSIONS.BANK_SETTINGS_MANAGE),
  validate(updateBankSchema),
  controller.updateBank
);

export default router;
