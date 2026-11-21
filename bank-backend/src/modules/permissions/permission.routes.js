import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorizeAny } from "../../middlewares/authorize.js";
import { PERMISSIONS as P } from "../../constants/permissions.js";
import * as c from "./permission.controller.js";

const router = Router();

// Read-only on purpose: a permission only has a meaning if a route enforces it in the code,
// so the catalog is created by the seed (from constants/permissions.js), not through the API.
router.get("/", authenticate, authorizeAny(P.PERMISSIONS_MANAGE, P.ROLES_MANAGE), c.list);

export default router;
