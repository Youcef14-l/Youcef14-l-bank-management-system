import { Router } from "express";
// ASSUMED paths/names - adjust these two lines to your middleware files if they differ:
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { TRANSACTION_PERMISSIONS as P } from "./transaction.constants.js";
import * as controller from "./transaction.controller.js";

const router = Router();
router.use(authenticate); // sets req.user

// Create
router.post("/deposits", authorize(P.DEPOSITS_CREATE), controller.createDeposit);
router.post("/withdrawals", authorize(P.WITHDRAWALS_CREATE), controller.createWithdrawal);
router.post("/transfers", authorize(P.TRANSFERS_CREATE), controller.createTransfer);

// Read: static / multi-segment routes BEFORE the dynamic "/:id"
router.get("/", authorize(P.TRANSACTIONS_VIEW), controller.listTransactions);
router.get("/reference/:reference", authorize(P.TRANSACTIONS_VIEW), controller.getTransactionByReference);
router.get("/account/:accountId", authorize(P.TRANSACTIONS_VIEW), controller.listByAccount);
router.get("/customer/:customerId", authorize(P.TRANSACTIONS_VIEW), controller.listByCustomer);
router.get("/:id", authorize(P.TRANSACTIONS_VIEW), controller.getTransactionById);

// Approval
router.patch("/:id/approve", authorize(P.TRANSACTIONS_APPROVE), controller.approveTransaction);
router.patch("/:id/reject", authorize(P.TRANSACTIONS_REJECT), controller.rejectTransaction);

export default router;
