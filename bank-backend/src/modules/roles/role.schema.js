import { z } from "zod";

const roleName = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{2,49}$/, "Role name: 3-50 chars, letters, digits and underscores");
const description = z.string().trim().max(255);

export const createRoleSchema = z
  .object({ name: roleName, description: description.optional() })
  .strict();

export const updateRoleSchema = z
  .object({ name: roleName, description: description.nullable() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

// Full replacement of the permission set of a role, by permission CODE (stable, readable).
export const setRolePermissionsSchema = z
  .object({ permissions: z.array(z.string().trim().min(1)).max(100) })
  .strict();
