
import express from "express";
import cors from "cors";

import { env } from "./config/env.js";

import authRoutes from "./modules/auth/auth.routes.js"; 
import employeeRoutes from "./modules/employees/employee.routes.js";
import roleRoutes from "./modules/roles/role.routes.js";
import permissionRoutes from "./modules/permissions/permission.routes.js"; 
import customerRoutes from "./modules/customers/customer.routes.js"; 
import transactionRoutes from "./modules/transactions/transaction.routes.js"; 
import auditRoutes from "./modules/audit/audit.routes.js";
import statisticsRoutes from "./modules/statistics/statistics.routes.js";
import bankRoutes from "./modules/banks/bank.routes.js";

import accountRoutes, {
  customerAccountsRoutes
} from "./modules/accounts/account.routes.js"; 

import {
  notFoundHandler,
  errorHandler,
} from "./middlewares/errorHandler.js";

const app = express();

// 1. CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN,
  })
);

// 2. Parse JSON requests
app.use(express.json({ limit: "1mb" }));

// 3. Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "BankServices API is running",
  });
});

// 4. Database health check
import { prisma } from "./config/prisma.js";

app.get("/api/health/db", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Database connected successfully!",
    });
  } catch (error) {
    next(error);
  }
});

// 5. Authentication routes
app.use("/api/auth", authRoutes); 

app.use("/api/employees", employeeRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/permissions", permissionRoutes); 

app.use("/api/customers", customerRoutes);   

app.use(
  "/api/customers/:customerId/accounts",
  customerAccountsRoutes
);

app.use("/api/accounts", accountRoutes); 
app.use("/api/transactions", transactionRoutes); 

app.use("/api/audit-logs", auditRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/bank", bankRoutes);
// 6. Handle unknown routes
app.use(notFoundHandler);

// 7. Central error handler (always last)
app.use(errorHandler);

export default app;
