import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Invalid email address");

// bcrypt only uses the first 72 bytes, hence the max(72).
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one digit");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(72),
    newPassword,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current one",
  });
