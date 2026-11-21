import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middlewares/validate.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { loginSchema, changePasswordSchema } from "./auth.schema.js";
import * as controller from "./auth.controller.js";

const router = Router();

// Brute-force protection: 10 failed attempts / 15 minutes / IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts, try again later" },
  },
});

router.post("/login", loginLimiter, validate(loginSchema), controller.login);
router.get("/me", authenticate, controller.me);
router.post("/change-password", authenticate, validate(changePasswordSchema), controller.changePassword);

export default router;
