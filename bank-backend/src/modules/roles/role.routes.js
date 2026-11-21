import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize, authorizeAny } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { idParamSchema } from "../../utils/schemas.js";
import { PERMISSIONS as P } from "../../constants/permissions.js";
import { createRoleSchema, updateRoleSchema, setRolePermissionsSchema } from "./role.schema.js";
import * as c from "./role.controller.js";

const router = Router();
const id = validate(idParamSchema, "params");

router.use(authenticate);

// The employee form needs the list of roles -> also open to who manages employees.
router.get("/", authorizeAny(P.ROLES_MANAGE, P.EMPLOYEES_VIEW, P.EMPLOYEES_CREATE, P.EMPLOYEES_UPDATE), c.list);
router.get("/:id", authorize(P.ROLES_MANAGE), id, c.getOne);
router.post("/", authorize(P.ROLES_MANAGE), validate(createRoleSchema), c.create);
router.patch("/:id", authorize(P.ROLES_MANAGE), id, validate(updateRoleSchema), c.update);
router.delete("/:id", authorize(P.ROLES_MANAGE), id, c.remove);
router.put("/:id/permissions", authorize(P.PERMISSIONS_MANAGE), id, validate(setRolePermissionsSchema), c.setPermissions);

export default router;
