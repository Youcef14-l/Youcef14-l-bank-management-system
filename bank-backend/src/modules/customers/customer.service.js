import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { recordAudit } from "../audit/audit.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../audit/audit.constants.js";

const CUSTOMER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  nationalId: true,
  dateOfBirth: true,
  customerType: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const ACCOUNT_SELECT = {
  id: true,
  accountNumber: true,
  balance: true,
  accountType: true,
  status: true,
  currency: true,
  createdAt: true,
};

/* ---------- Pure helper functions (no DB, no side effects) ---------- */

// "ABC123456" -> "******456" (audit logs must not hold the full national ID)
export const maskNationalId = (nationalId) =>
  nationalId ? `${"*".repeat(Math.max(nationalId.length - 3, 0))}${nationalId.slice(-3)}` : nationalId;

const normalizeValue = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;

const auditValue = (field, value) =>
  field === "nationalId" ? maskNationalId(value) : normalizeValue(value);

// Keeps only the fields that really change + old/new values for the audit log.
export const buildChanges = (existing, requested) => {
  const changedFields = Object.keys(requested).filter(
    (field) => normalizeValue(existing[field]) !== normalizeValue(requested[field])
  );

  return {
    changedFields,
    data: Object.fromEntries(changedFields.map((f) => [f, requested[f]])),
    oldValues: Object.fromEntries(changedFields.map((f) => [f, auditValue(f, existing[f])])),
    newValues: Object.fromEntries(changedFields.map((f) => [f, auditValue(f, requested[f])])),
  };
};

// "mohamed test" => every word must match at least one field.
export const buildSearchFilter = (search) => {
  const terms = (search ?? "").split(/\s+/).filter(Boolean);
  const fields = ["firstName", "lastName", "email", "phone", "nationalId"];

  return terms.map((term) => ({
    OR: fields.map((field) => ({ [field]: { contains: term, mode: "insensitive" } })),
  }));
};

/* ---------- Internal helpers (use the database) ---------- */

// nationalId and email are unique in the whole table, so the check is global.
const assertNoConflict = async (db, { nationalId, email, excludeId }) => {
  const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

  if (nationalId) {
    const found = await db.customer.findFirst({
      where: { nationalId, ...notSelf },
      select: { id: true },
    });
    if (found) {
      throw new AppError(
        "A customer with this national ID already exists",
        409,
        "CUSTOMER_NATIONAL_ID_ALREADY_EXISTS"
      );
    }
  }

  if (email) {
    const found = await db.customer.findFirst({
      where: { email, ...notSelf },
      select: { id: true },
    });
    if (found) {
      throw new AppError(
        "A customer with this email already exists",
        409,
        "CUSTOMER_EMAIL_ALREADY_EXISTS"
      );
    }
  }
};

// Bank isolation: a customer is searched ONLY inside the employee's bank.
const findCustomerInBank = async (db, bankId, id) => {
  const customer = await db.customer.findFirst({
    where: { id, bankId },
    select: CUSTOMER_SELECT,
  });
  if (!customer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }
  return customer;
};

// Converts raw Prisma errors into clean AppErrors.
const translatePrismaError = (error) => {
  if (error instanceof AppError) return error;

  if (error?.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    if (target.includes("email")) {
      return new AppError("A customer with this email already exists", 409, "CUSTOMER_EMAIL_ALREADY_EXISTS");
    }
    if (target.includes("nationalId")) {
      return new AppError("A customer with this national ID already exists", 409, "CUSTOMER_NATIONAL_ID_ALREADY_EXISTS");
    }
    return new AppError("This customer already exists", 409, "CUSTOMER_ALREADY_EXISTS");
  }

  if (error?.code === "P2025") {
    return new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  return error;
};

/* ---------- Public service functions ---------- */

export const listCustomers = async (bankId, query) => {
  const { page, limit, search, customerType, isActive } = query;

  // bankId is ALWAYS part of the filter.
  const where = {
    bankId,
    ...(customerType && { customerType }),
    ...(isActive !== undefined && { isActive }),
    ...(search && { AND: buildSearchFilter(search) }),
  };

  const [total, data] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getCustomerById = async (bankId, id) => {
  const customer = await prisma.customer.findFirst({
    where: { id, bankId },
    select: { ...CUSTOMER_SELECT, accounts: { select: ACCOUNT_SELECT } },
  });
  if (!customer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }
  return customer;
};

export const createCustomer = async (user, input, ipAddress) => {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, { nationalId: input.nationalId, email: input.email });

      // bankId comes from the authenticated employee, never from the body.
      const customer = await tx.customer.create({
        data: { ...input, bankId: user.bankId },
        select: CUSTOMER_SELECT,
      });

      await recordAudit(tx, {
        employeeId: user.id,
        action: AUDIT_ACTIONS.CUSTOMER_CREATED,
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: customer.id,
        description: `Customer ${customer.firstName} ${customer.lastName} created`,
        oldValues: null,
        newValues: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          nationalId: maskNationalId(customer.nationalId),
          customerType: customer.customerType,
        },
        ipAddress,
      });

      return customer;
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
};

export const updateCustomer = async (user, id, input, ipAddress) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await findCustomerInBank(tx, user.bankId, id);
      const { changedFields, data, oldValues, newValues } = buildChanges(existing, input);

      // Nothing changed: no write, no audit entry.
      if (changedFields.length === 0) return existing;

      await assertNoConflict(tx, {
        nationalId: data.nationalId,
        email: data.email,
        excludeId: id,
      });

      const updated = await tx.customer.update({
        where: { id },
        data,
        select: CUSTOMER_SELECT,
      });

      await recordAudit(tx, {
        employeeId: user.id,
        action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: id,
        description: `Customer updated (fields: ${changedFields.join(", ")})`,
        oldValues,
        newValues,
        ipAddress,
      });

      return updated;
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
};

export const deactivateCustomer = async (user, id, ipAddress) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const customer = await findCustomerInBank(tx, user.bankId, id);

      if (!customer.isActive) {
        throw new AppError("This customer is already deactivated", 409, "CUSTOMER_ALREADY_DEACTIVATED");
      }

      // Banking rule: no deactivation while an ACTIF account exists.
      const activeAccounts = await tx.account.count({
        where: { customerId: id, status: "ACTIF" },
      });

      if (activeAccounts > 0) {
        throw new AppError(
          `This customer still has ${activeAccounts} active account(s). Close all accounts before deactivating the customer.`,
          400,
          "CUSTOMER_HAS_ACTIVE_ACCOUNTS"
        );
      }

      // Soft deactivation: the row is never deleted.
      const updated = await tx.customer.update({
        where: { id },
        data: { isActive: false },
        select: CUSTOMER_SELECT,
      });

      await recordAudit(tx, {
        employeeId: user.id,
        action: AUDIT_ACTIONS.CUSTOMER_DEACTIVATED,
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: id,
        description: `Customer ${customer.firstName} ${customer.lastName} deactivated`,
        oldValues: { isActive: true },
        newValues: { isActive: false },
        ipAddress,
      });

      return updated;
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
};

export const reactivateCustomer = async (user, id, ipAddress) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const customer = await findCustomerInBank(tx, user.bankId, id);

      if (customer.isActive) {
        throw new AppError("This customer is already active", 409, "CUSTOMER_ALREADY_ACTIVE");
      }

      const updated = await tx.customer.update({
        where: { id },
        data: { isActive: true },
        select: CUSTOMER_SELECT,
      });

      await recordAudit(tx, {
        employeeId: user.id,
        action: AUDIT_ACTIONS.CUSTOMER_REACTIVATED,
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: id,
        description: `Customer ${customer.firstName} ${customer.lastName} reactivated`,
        oldValues: { isActive: false },
        newValues: { isActive: true },
        ipAddress,
      });

      return updated;
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
};