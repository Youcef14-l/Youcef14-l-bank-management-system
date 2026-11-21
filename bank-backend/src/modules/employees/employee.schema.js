import { z } from "zod";
import { emailSchema, passwordSchema } from "../auth/auth.schema.js";
import { paginationSchema } from "../../utils/schemas.js";

const name = z.string().trim().min(1, "Required").max(100);
const phone = z.string().trim().regex(/^[0-9+()\-\s]{6,20}$/, "Invalid phone number");
const roleId = z.string().uuid("Invalid role id");

export const createEmployeeSchema = z
  .object({
    firstName: name,
    lastName: name,
    email: emailSchema,
    phone: phone.optional(),
    employeeNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,20}$/, "Employee number: 3-20 letters, digits or dashes"),
    password: passwordSchema,
    roleId,
  })
  .strict(); // unknown fields (isActive, bankId...) are rejected: no mass assignment

// Only these fields can be changed here. Password -> reset-password, status -> (de)activate.
export const updateEmployeeSchema = z
  .object({
    firstName: name,
    lastName: name,
    email: emailSchema,
    phone: phone.nullable(),
    roleId,
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

export const resetPasswordSchema = z.object({ newPassword: passwordSchema }).strict();

export const listEmployeesQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  roleId: roleId.optional(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});
