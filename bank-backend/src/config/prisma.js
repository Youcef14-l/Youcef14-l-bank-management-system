
import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

// Reuse one PrismaClient instance throughout the application
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__bankServicesPrisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.__bankServicesPrisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
