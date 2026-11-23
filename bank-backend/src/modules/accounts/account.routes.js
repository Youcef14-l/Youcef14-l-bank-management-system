import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  createAccountSchema,
  accountIdParamSchema,
  customerAccountsParamSchema,
  listAccountsQuerySchema,
  listCustomerAccountsQuerySchema,
} from "./account.schema.js";
import * as controller from "./account.controller.js";

/* ---------- /api/accounts ---------- */
const router = Router();
router.use(authenticate); // every account route requires a JWT

router.post("/", authorize(PERMISSIONS.ACCOUNTS_CREATE), validate(createAccountSchema), controller.createAccount);

router.get("/", authorize(PERMISSIONS.ACCOUNTS_VIEW), validate(listAccountsQuerySchema, "query"), controller.listAccounts);

router.get("/:id", authorize(PERMISSIONS.ACCOUNTS_VIEW), validate(accountIdParamSchema, "params"), controller.getAccount);

router.post("/:id/block", authorize(PERMISSIONS.ACCOUNTS_BLOCK), validate(accountIdParamSchema, "params"), controller.blockAccount);

router.post("/:id/unblock", authorize(PERMISSIONS.ACCOUNTS_UNBLOCK), validate(accountIdParamSchema, "params"), controller.unblockAccount);

router.post("/:id/close", authorize(PERMISSIONS.ACCOUNTS_CLOSE), validate(accountIdParamSchema, "params"), controller.closeAccount);

export default router;

/* ---------- /api/customers/:customerId/accounts ---------- */
// Kept in this module so the Customers module is not modified.
// mergeParams: true lets this router see :customerId from the mount path.
export const customerAccountsRoutes = Router({ mergeParams: true });
customerAccountsRoutes.use(authenticate);

customerAccountsRoutes.get(
  "/",
  authorize(PERMISSIONS.ACCOUNTS_VIEW),
  validate(customerAccountsParamSchema, "params"),
  validate(listCustomerAccountsQuerySchema, "query"),
  controller.getCustomerAccounts
);