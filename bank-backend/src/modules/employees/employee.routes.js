import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { idParamSchema } from "../../utils/schemas.js";
import { PERMISSIONS as P } from "../../constants/permissions.js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  resetPasswordSchema,
  listEmployeesQuerySchema,
} from "./employee.schema.js";
import * as c from "./employee.controller.js";

const router = Router();
const id = validate(idParamSchema, "params");

// Order on every route: 1) who are you  2) are you allowed  3) is the input valid  4) do it
router.use(authenticate);

router.get("/", authorize(P.EMPLOYEES_VIEW), validate(listEmployeesQuerySchema, "query"), c.list);
router.get("/:id", authorize(P.EMPLOYEES_VIEW), id, c.getOne);
router.post("/", authorize(P.EMPLOYEES_CREATE), validate(createEmployeeSchema), c.create);
router.patch("/:id", authorize(P.EMPLOYEES_UPDATE), id, validate(updateEmployeeSchema), c.update);
router.post("/:id/reset-password", authorize(P.EMPLOYEES_UPDATE), id, validate(resetPasswordSchema), c.resetPassword);
router.post("/:id/deactivate", authorize(P.EMPLOYEES_DEACTIVATE), id, c.deactivate);
router.post("/:id/reactivate", authorize(P.EMPLOYEES_DEACTIVATE), id, c.reactivate);
// No DELETE route on purpose: employees are deactivated, never deleted (history stays intact).

export default router;
