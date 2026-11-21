import { z } from "zod";

const CUSTOMER_TYPES = ["INDIVIDUAL", "BUSINESS"];

const firstName = z.string().trim().min(1, "First name is required").max(100);
const lastName = z.string().trim().min(1, "Last name is required").max(100);

const nationalId = z
  .string()
  .trim()
  .min(5, "National ID must contain at least 5 characters")
  .max(30, "National ID must contain at most 30 characters")
  .regex(/^[A-Za-z0-9-]+$/, "National ID may only contain letters, digits and '-'")
  .transform((value) => value.toUpperCase());

const email = z.string().trim().toLowerCase().email("Email address is not valid").max(254);

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\s().-]{6,20}$/, "Phone number is not valid");

const address = z.string().trim().min(1, "Address cannot be empty").max(255);

const isRealDate = (value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must use the format YYYY-MM-DD")
  .refine(isRealDate, "Date of birth is not a valid date")
  .transform((value) => new Date(value))
  .refine((date) => date <= new Date(), "Date of birth cannot be in the future");

const customerType = z.enum(CUSTOMER_TYPES, {
  message: "Customer type must be INDIVIDUAL or BUSINESS",
});

// .strict() rejects unknown keys (bankId, isActive, id, ...) => no mass assignment
export const createCustomerSchema = z
  .object({
    firstName,
    lastName,
    nationalId,
    email: email.optional(),
    phone: phone.optional(),
    address: address.optional(),
    dateOfBirth: dateOfBirth.optional(),
    customerType: customerType.default("INDIVIDUAL"),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    firstName: firstName.optional(),
    lastName: lastName.optional(),
    nationalId: nationalId.optional(),
    email: email.nullable().optional(),
    phone: phone.nullable().optional(),
    address: address.nullable().optional(),
    dateOfBirth: dateOfBirth.nullable().optional(),
    customerType: customerType.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the customer",
  });

export const customerIdParamSchema = z
  .object({ id: z.string().uuid("Customer id must be a valid UUID") })
  .strict();

export const listCustomersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    customerType: customerType.optional(),
    isActive: z
      .enum(["true", "false"], { message: "isActive must be 'true' or 'false'" })
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();