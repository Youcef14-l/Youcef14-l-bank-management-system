import { AppError } from "../../utils/AppError.js";
import { CompteCourant } from "../../domain/CompteCourant.js";
import { CompteEpargne } from "../../domain/CompteEpargne.js";

// Prisma Decimal -> fixed string ("1500.00"); null stays null.
const formatDecimal = (value, places) => (value == null ? null : value.toFixed(places));

/**
 * Database record (Prisma) -> domain object (OOP).
 * COURANT -> CompteCourant, EPARGNE -> CompteEpargne.
 */
export const mapAccountToDomain = (record) => {
  const common = {
    id: record.id,
    accountNumber: record.accountNumber,
    balance: record.balance, // Decimal: converted to BigInt cents inside the domain
    currency: record.currency,
    status: record.status,
    customerId: record.customerId,
    closedAt: record.closedAt,
  };

  switch (record.accountType) {
    case "COURANT":
      return new CompteCourant({ ...common, overdraftLimit: record.overdraftLimit ?? "0" });
    case "EPARGNE":
      return new CompteEpargne({
        ...common,
        // Same normalisation as transaction.service.js (toDomainAccount): the domain receives a plain string.
        interestRate: record.interestRate == null ? "0" : record.interestRate.toFixed(4),
        minimumBalance: record.minimumBalance ?? "0",
      });
    default:
      throw new AppError(`Unsupported account type: ${record.accountType}`, 400, "INVALID_ACCOUNT_TYPE");
  }
};

// Only the fields that apply to the account type are returned.
const typeSpecificFields = (record) =>
  record.accountType === "COURANT"
    ? { overdraftLimit: formatDecimal(record.overdraftLimit, 2) }
    : { interestRate: formatDecimal(record.interestRate, 4), minimumBalance: formatDecimal(record.minimumBalance, 2) };

// Compact description of an account (used in audit logs: no dates, no customer data).
export const accountSnapshot = (record) => ({
  id: record.id,
  accountNumber: record.accountNumber,
  accountType: record.accountType,
  balance: formatDecimal(record.balance, 2),
  currency: record.currency,
  status: record.status,
  customerId: record.customerId,
  ...typeSpecificFields(record),
});

// Full API response (pure function, no mutation of the input).
export const toAccountDto = (record) => ({
  ...accountSnapshot(record),
  customer: record.customer,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  closedAt: record.closedAt,
});
