import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(), // only needed by the Prisma CLI (migrations)

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // No hard-coded threshold: it must come from the environment.
  APPROVAL_THRESHOLD: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "APPROVAL_THRESHOLD must be a decimal like 1000000.00"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
