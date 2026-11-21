// Single source of truth for roles & permissions.
// Used by: prisma/seed.js (to fill the DB) and the routes (authorize(PERMISSIONS.X)).

export const ROLES = Object.freeze({
  CAISSIER: "CAISSIER",
  CHARGE_CLIENTELE: "CHARGE_CLIENTELE",
  DIRECTEUR_AGENCE: "DIRECTEUR_AGENCE",
  CONTROLEUR: "CONTROLEUR",
  ADMINISTRATEUR: "ADMINISTRATEUR",
});

export const ROLE_DESCRIPTIONS = Object.freeze({
  CAISSIER: "Cashier: deposits, withdrawals and transfers",
  CHARGE_CLIENTELE: "Customer service officer: customers and account opening",
  DIRECTEUR_AGENCE: "Branch director: approvals, account blocking/closing, statistics",
  CONTROLEUR: "Controller / auditor: read-only access",
  ADMINISTRATEUR: "System administrator: employees, roles and permissions (no financial operations)",
});

export const PERMISSION_DEFINITIONS = [
  { code: "DASHBOARD_VIEW", description: "View the dashboard" },
  { code: "CUSTOMERS_VIEW", description: "View customers" },
  { code: "CUSTOMERS_CREATE", description: "Create customers" },
  { code: "CUSTOMERS_UPDATE", description: "Update customers" },
  { code: "ACCOUNTS_VIEW", description: "View accounts" },
  { code: "ACCOUNTS_CREATE", description: "Open accounts" },
  { code: "ACCOUNTS_BLOCK", description: "Block accounts" },
  { code: "ACCOUNTS_UNBLOCK", description: "Unblock accounts" },
  { code: "ACCOUNTS_CLOSE", description: "Close accounts" },
  { code: "DEPOSITS_CREATE", description: "Make deposits" },
  { code: "WITHDRAWALS_CREATE", description: "Make withdrawals" },
  { code: "TRANSFERS_CREATE", description: "Make transfers" },
  { code: "TRANSACTIONS_VIEW", description: "View transaction history" },
  { code: "TRANSACTIONS_APPROVE", description: "Approve pending transactions" },
  { code: "TRANSACTIONS_REJECT", description: "Reject pending transactions" },
  { code: "AUDIT_LOGS_VIEW", description: "View audit logs" },
  { code: "STATISTICS_VIEW", description: "View statistics" },
  { code: "EMPLOYEES_VIEW", description: "View employees" },
  { code: "EMPLOYEES_CREATE", description: "Create employees" },
  { code: "EMPLOYEES_UPDATE", description: "Update employees" },
  { code: "EMPLOYEES_DEACTIVATE", description: "Deactivate employees" },
  { code: "ROLES_MANAGE", description: "Manage roles" },
  { code: "PERMISSIONS_MANAGE", description: "Manage permissions" },
];

// { CUSTOMERS_VIEW: "CUSTOMERS_VIEW", ... } -> avoids typos: authorize(PERMISSIONS.CUSTOMERS_VIEW)
export const PERMISSIONS = Object.freeze(
  Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.code, p.code]))
);

// "CUSTOMERS_VIEW" -> "CUSTOMERS" (used to group permissions in the admin UI)
export const moduleOf = (code) => code.slice(0, code.lastIndexOf("_"));

const P = PERMISSIONS;

// Default permission matrix (additive on re-seed: the admin can add more in the DB).
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.CAISSIER]: [
    P.DASHBOARD_VIEW, P.CUSTOMERS_VIEW, P.ACCOUNTS_VIEW, P.TRANSACTIONS_VIEW,
    P.DEPOSITS_CREATE, P.WITHDRAWALS_CREATE, P.TRANSFERS_CREATE,
  ],
  [ROLES.CHARGE_CLIENTELE]: [
    P.DASHBOARD_VIEW, P.CUSTOMERS_VIEW, P.CUSTOMERS_CREATE, P.CUSTOMERS_UPDATE,
    P.ACCOUNTS_VIEW, P.ACCOUNTS_CREATE,
  ],
  [ROLES.DIRECTEUR_AGENCE]: [
    P.DASHBOARD_VIEW, P.CUSTOMERS_VIEW, P.ACCOUNTS_VIEW,
    P.ACCOUNTS_BLOCK, P.ACCOUNTS_UNBLOCK, P.ACCOUNTS_CLOSE,
    P.TRANSACTIONS_VIEW, P.TRANSACTIONS_APPROVE, P.TRANSACTIONS_REJECT,
    P.STATISTICS_VIEW,
  ],
  [ROLES.CONTROLEUR]: [
    P.DASHBOARD_VIEW, P.CUSTOMERS_VIEW, P.ACCOUNTS_VIEW, P.TRANSACTIONS_VIEW,
    P.AUDIT_LOGS_VIEW, P.STATISTICS_VIEW,
  ],
  [ROLES.ADMINISTRATEUR]: [
    P.DASHBOARD_VIEW,
    P.EMPLOYEES_VIEW, P.EMPLOYEES_CREATE, P.EMPLOYEES_UPDATE, P.EMPLOYEES_DEACTIVATE,
    P.ROLES_MANAGE, P.PERMISSIONS_MANAGE,
  ],
});

// ---------------------------------------------------------------------------------------------
// Separation-of-duties rules, enforced when the permissions of a role are edited (role.rules.js)
// ---------------------------------------------------------------------------------------------
export const FINANCIAL_PERMISSIONS = Object.freeze([
  P.DEPOSITS_CREATE,
  P.WITHDRAWALS_CREATE,
  P.TRANSFERS_CREATE,
  P.TRANSACTIONS_APPROVE,
  P.TRANSACTIONS_REJECT,
]);

export const ROLE_PERMISSION_RULES = Object.freeze({
  // The admin manages people and access, never money; and must keep what lets him administrate.
  [ROLES.ADMINISTRATEUR]: {
    forbidden: FINANCIAL_PERMISSIONS,
    required: [P.ROLES_MANAGE, P.PERMISSIONS_MANAGE, P.EMPLOYEES_VIEW],
  },
  // The controller is read-only: only *_VIEW permissions.
  [ROLES.CONTROLEUR]: { viewOnly: true },
  // A cashier can never approve operations (the director does).
  [ROLES.CAISSIER]: { forbidden: [P.TRANSACTIONS_APPROVE, P.TRANSACTIONS_REJECT] },
});
