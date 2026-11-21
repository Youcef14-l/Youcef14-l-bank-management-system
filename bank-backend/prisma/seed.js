// Run with: npx prisma db seed     (safe to run many times - idempotent)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSIONS,
  moduleOf,
} from "../src/constants/permissions.js";

const prisma = new PrismaClient();
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

const BANK = { code: "BANKSERVICES-001", name: "BankServices", address: "Tlemcen, Algeria" };

const DEMO_EMPLOYEES = [
  { role: ROLES.CAISSIER, email: "caissier@bankservices.dz", firstName: "Karim", lastName: "Benali" },
  { role: ROLES.CHARGE_CLIENTELE, email: "clientele@bankservices.dz", firstName: "Amina", lastName: "Haddad" },
  { role: ROLES.DIRECTEUR_AGENCE, email: "directeur@bankservices.dz", firstName: "Yacine", lastName: "Mansouri" },
  { role: ROLES.CONTROLEUR, email: "controleur@bankservices.dz", firstName: "Sara", lastName: "Boudiaf" },
];

// Safety net: the business rules of the project must hold for the default matrix.
function assertRoleMatrix() {
  const financial = [PERMISSIONS.DEPOSITS_CREATE, PERMISSIONS.WITHDRAWALS_CREATE, PERMISSIONS.TRANSFERS_CREATE];
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const c of codes) {
      if (!c) throw new Error(`Unknown permission in role ${role}`);
    }
  }
  for (const role of [ROLES.ADMINISTRATEUR, ROLES.CONTROLEUR]) {
    if (ROLE_PERMISSIONS[role].some((c) => financial.includes(c))) {
      throw new Error(`${role} must not have financial permissions`);
    }
  }
  const writes = (c) => !c.endsWith("_VIEW");
  if (ROLE_PERMISSIONS[ROLES.CONTROLEUR].some(writes)) {
    throw new Error("CONTROLEUR must be read-only");
  }
}

async function createEmployeeIfMissing({ email, firstName, lastName, roleId, bankId, password, number }) {
  const existing = await prisma.employee.findUnique({ where: { email } });
  if (existing) return existing; // never overwrite an existing password
  return prisma.employee.create({
    data: {
      email,
      firstName,
      lastName,
      roleId,
      bankId,
      employeeNumber: number,
      password: await bcrypt.hash(password, ROUNDS),
    },
  });
}

async function main() {
  assertRoleMatrix();

  // 1) Permissions
  for (const { code, description } of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description, module: moduleOf(code) },
      create: { code, description, module: moduleOf(code) },
    });
  }

  // 2) Roles
  for (const name of Object.values(ROLES)) {
    await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name], isSystem: true },
      create: { name, description: ROLE_DESCRIPTIONS[name], isSystem: true },
    });
  }

  // 3) Role <-> Permission (additive: never removes what an admin granted later)
  const permissionId = Object.fromEntries((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  const roleId = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.name, r.id]));
  const rows = Object.entries(ROLE_PERMISSIONS).flatMap(([role, codes]) =>
    codes.map((code) => ({ roleId: roleId[role], permissionId: permissionId[code] }))
  );
  await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });

  // 4) Bank
  const bank = await prisma.bank.upsert({
    where: { code: BANK.code },
    update: {},
    create: BANK,
  });

  // 5) First administrator (needed to log in the first time)
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 chars) in .env");
  }
  await createEmployeeIfMissing({
    email: adminEmail,
    firstName: "System",
    lastName: "Admin",
    roleId: roleId[ROLES.ADMINISTRATEUR],
    bankId: bank.id,
    password: adminPassword,
    number: "EMP-0000",
  });

  // 6) Demo employees (development only)
  if (process.env.SEED_DEMO_USERS === "true" && process.env.NODE_ENV !== "production") {
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (!demoPassword || demoPassword.length < 8) throw new Error("Set SEED_DEMO_PASSWORD (min 8 chars)");
    for (const [i, e] of DEMO_EMPLOYEES.entries()) {
      await createEmployeeIfMissing({
        email: e.email,
        firstName: e.firstName,
        lastName: e.lastName,
        roleId: roleId[e.role],
        bankId: bank.id,
        password: demoPassword,
        number: `EMP-${String(i + 1).padStart(4, "0")}`,
      });
    }
  }

  console.log(
    `Seed done: ${PERMISSION_DEFINITIONS.length} permissions, ${Object.keys(ROLES).length} roles, ` +
      `${rows.length} role-permission links, bank "${bank.name}".`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
