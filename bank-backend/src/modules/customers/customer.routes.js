import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
} from "./customer.schema.js";
import * as controller from "./customer.controller.js";

const router = Router();

router.use(authenticate); // every customer route requires a JWT

router.get("/", authorize(PERMISSIONS.CUSTOMERS_VIEW), validate(listCustomersQuerySchema, "query"), controller.listCustomers);

router.get("/:id", authorize(PERMISSIONS.CUSTOMERS_VIEW), validate(customerIdParamSchema, "params"), controller.getCustomer);

router.post("/", authorize(PERMISSIONS.CUSTOMERS_CREATE), validate(createCustomerSchema), controller.createCustomer);

router.patch(
  "/:id",
  authorize(PERMISSIONS.CUSTOMERS_UPDATE),
  validate(customerIdParamSchema, "params"),
  validate(updateCustomerSchema),
  controller.updateCustomer
);

router.post("/:id/deactivate", authorize(PERMISSIONS.CUSTOMERS_UPDATE), validate(customerIdParamSchema, "params"), controller.deactivateCustomer);

router.post("/:id/reactivate", authorize(PERMISSIONS.CUSTOMERS_UPDATE), validate(customerIdParamSchema, "params"), controller.reactivateCustomer);

export default router;