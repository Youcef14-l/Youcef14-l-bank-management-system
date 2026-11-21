-- Paste this at the END of prisma/migrations/<timestamp>_init/migration.sql
-- (Prisma cannot express CHECK constraints in schema.prisma)

-- Balance can never be negative, except up to the overdraft explicitly granted to a COURANT account
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_balance_non_negative"
  CHECK ("balance" + COALESCE("overdraftLimit", 0) >= 0);

-- Overdraft only makes sense for COURANT accounts
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_overdraft_only_courant"
  CHECK ("overdraftLimit" IS NULL OR ("accountType" = 'COURANT' AND "overdraftLimit" >= 0));

-- Interest rate / minimum balance only for EPARGNE accounts
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_savings_fields_only_epargne"
  CHECK (("interestRate" IS NULL AND "minimumBalance" IS NULL) OR "accountType" = 'EPARGNE');

-- Amounts
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_non_negative" CHECK ("fee" >= 0);

-- Source / destination must match the transaction type
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accounts_match_type" CHECK (
  ("transactionType" = 'DEPOT'    AND "sourceAccountId" IS NULL     AND "destinationAccountId" IS NOT NULL) OR
  ("transactionType" = 'RETRAIT'  AND "sourceAccountId" IS NOT NULL AND "destinationAccountId" IS NULL) OR
  ("transactionType" = 'VIREMENT' AND "sourceAccountId" IS NOT NULL AND "destinationAccountId" IS NOT NULL
                                  AND "sourceAccountId" <> "destinationAccountId")
);

-- A rejected transaction must carry its rejection reason
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rejection_has_reason"
  CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);
