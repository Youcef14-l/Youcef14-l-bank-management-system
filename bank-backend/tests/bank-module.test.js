
import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
  },
  bank: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

// Mock Prisma to avoid connecting to the real database
jest.unstable_mockModule("../src/config/prisma.js", () => ({
  prisma: mockPrisma,
  disconnectPrisma: jest.fn(),
}));

// Import app after mocking Prisma
const { default: app } = await import("../src/app.js");
const { signToken } = await import("../src/modules/auth/auth.helpers.js");

const BANK_ID = "bank-test-001";
const ADMIN_ID = "admin-test-001";
const CASHIER_ID = "cashier-test-001";

const bankData = {
  id: BANK_ID,
  name: "BankServices",
  code: "BANK001",
  address: "Tlemcen, Algeria",
  phone: "0550000000",
  email: "contact@bankservices.dz",
};

const createEmployee = (id, roleName, permissions = []) => ({
  id,
  employeeNumber: "EMP001",
  firstName: "Test",
  lastName: roleName,
  email: `${roleName.toLowerCase()}@test.com`,
  phone: "0550000000",
  bankId: BANK_ID,
  isActive: true,
  lastLoginAt: new Date(),
  role: {
    id: `role-${id}`,
    name: roleName,
    permissions: permissions.map((code) => ({
      permission: { code },
    })),
  },
});

const admin = createEmployee(
  ADMIN_ID,
  "ADMINISTRATEUR",
  ["BANK_SETTINGS_MANAGE"]
);

const cashier = createEmployee(
  CASHIER_ID,
  "CAISSIER",
  []
);

const adminToken = signToken(ADMIN_ID);
const cashierToken = signToken(CASHIER_ID);

const auth = (token) => ({
  Authorization: `Bearer ${token}`,
});

describe("BankServices - Bank Module API", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.employee.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === ADMIN_ID) return admin;
      if (where.id === CASHIER_ID) return cashier;
      return null;
    });

    mockPrisma.bank.findUnique.mockResolvedValue(bankData);
    mockPrisma.bank.update.mockResolvedValue(bankData);
  });

  // 1. GET BANK SUMMARY
  test("GET /api/bank/summary - should return bank summary", async () => {
    const response = await request(app)
      .get("/api/bank/summary")
      .set(auth(cashierToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("BankServices");
    expect(response.body.data.code).toBe("BANK001");

    expect(mockPrisma.bank.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BANK_ID },
      })
    );
  });

  // 2. GET BANK WITHOUT AUTHENTICATION
  test("GET /api/bank - should reject unauthenticated users", async () => {
    const response = await request(app).get("/api/bank");

    expect(response.status).toBe(401);
  });

  // 3. GET BANK WITH ADMIN PERMISSION
  test("GET /api/bank - should allow administrator to view bank details", async () => {
    const response = await request(app)
      .get("/api/bank")
      .set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("BankServices");
    expect(response.body.data.address).toBe("Tlemcen, Algeria");
  });

  // 4. GET BANK WITHOUT REQUIRED PERMISSION
  test("GET /api/bank - should reject employees without bank settings permission", async () => {
    const response = await request(app)
      .get("/api/bank")
      .set(auth(cashierToken));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // 5. UPDATE BANK WITH ADMIN PERMISSION
  test("PATCH /api/bank - should allow administrator to update bank information", async () => {
    const updatedBank = {
      ...bankData,
      name: "BankServices Updated",
      address: "Algiers, Algeria",
    };

    mockPrisma.bank.update.mockResolvedValue(updatedBank);

    const response = await request(app)
      .patch("/api/bank")
      .set(auth(adminToken))
      .send({
        name: "BankServices Updated",
        address: "Algiers, Algeria",
        phone: "0551111111",
        email: "updated@bankservices.dz",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("BankServices Updated");

    expect(mockPrisma.bank.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BANK_ID },
        data: {
          name: "BankServices Updated",
          address: "Algiers, Algeria",
          phone: "0551111111",
          email: "updated@bankservices.dz",
        },
      })
    );
  });

  // 6. UPDATE BANK WITHOUT PERMISSION
  test("PATCH /api/bank - should reject employees without permission", async () => {
    const response = await request(app)
      .patch("/api/bank")
      .set(auth(cashierToken))
      .send({
        name: "Unauthorized Update",
        address: "Algiers",
        phone: "0551111111",
        email: "test@bank.dz",
      });

    expect(response.status).toBe(403);
    expect(mockPrisma.bank.update).not.toHaveBeenCalled();
  });

  // 7. UPDATE BANK WITH INVALID EMAIL
  test("PATCH /api/bank - should reject invalid email", async () => {
    const response = await request(app)
      .patch("/api/bank")
      .set(auth(adminToken))
      .send({
        name: "BankServices",
        address: "Tlemcen",
        phone: "0550000000",
        email: "invalid-email",
      });

    expect(response.status).toBe(400);
    expect(mockPrisma.bank.update).not.toHaveBeenCalled();
  });

  // 8. UPDATE BANK WITH EMPTY NAME
  test("PATCH /api/bank - should reject empty bank name", async () => {
    const response = await request(app)
      .patch("/api/bank")
      .set(auth(adminToken))
      .send({
        name: "   ",
        address: "Tlemcen",
        phone: "0550000000",
        email: "contact@bankservices.dz",
      });

    expect(response.status).toBe(400);
    expect(mockPrisma.bank.update).not.toHaveBeenCalled();
  });

  // 9. UPDATE BANK WITH UNAUTHORIZED EXTRA FIELD
  test("PATCH /api/bank - should reject fields not defined in the schema", async () => {
    const response = await request(app)
      .patch("/api/bank")
      .set(auth(adminToken))
      .send({
        name: "BankServices",
        address: "Tlemcen",
        phone: "0550000000",
        email: "contact@bankservices.dz",
        bankId: "another-bank-id",
      });

    expect(response.status).toBe(400);
    expect(mockPrisma.bank.update).not.toHaveBeenCalled();
  });
});
