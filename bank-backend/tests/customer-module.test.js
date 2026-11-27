
import request from "supertest";
import { jest } from "@jest/globals";

// ============================================
// 1. Prisma Mock
// ============================================

const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
  },

  customer: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },

  $transaction: jest.fn(),
};

jest.unstable_mockModule("../src/config/prisma.js", () => ({
  prisma: mockPrisma,
  disconnectPrisma: jest.fn(),
}));

// ============================================
// 2. Audit Service Mock
// ============================================

const mockRecordAudit = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../src/modules/audit/audit.service.js", () => ({
  recordAudit: mockRecordAudit,
}));

// ============================================
// 3. Import App After Mocks
// ============================================

const { default: app } = await import("../src/app.js");

const { signToken } = await import(
  "../src/modules/auth/auth.helpers.js"
);

// ============================================
// 4. Constants
// ============================================

const BANK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BANK_ID = "22222222-2222-4222-8222-222222222222";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";

const CUSTOMER_ID = "55555555-5555-4555-8555-555555555555";

// ============================================
// 5. Employees
// ============================================

const adminEmployee = {
  id: ADMIN_ID,
  bankId: BANK_ID,
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  isActive: true,

  role: {
    id: "admin-role-id",
    name: "ADMINISTRATEUR",

    permissions: [
      { permission: { code: "CUSTOMERS_VIEW" } },
      { permission: { code: "CUSTOMERS_CREATE" } },
      { permission: { code: "CUSTOMERS_UPDATE" } },
    ],
  },
};

const employeeWithoutPermissions = {
  id: EMPLOYEE_ID,
  bankId: BANK_ID,
  firstName: "Employee",
  lastName: "User",
  email: "employee@example.com",
  isActive: true,

  role: {
    id: "employee-role-id",
    name: "EMPLOYEE",
    permissions: [],
  },
};

// ============================================
// 6. Transaction Mock
// ============================================

const txMock = {
  customer: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  account: {
    count: jest.fn(),
  },
};

// ============================================
// 7. JWT Tokens
// IMPORTANT: signToken receives employee ID,
// not an object containing sub.
// ============================================

const adminToken = signToken(ADMIN_ID);
const employeeToken = signToken(EMPLOYEE_ID);

const auth = (token) => ({
  Authorization: `Bearer ${token}`,
});

// ============================================
// 8. Sample Customer
// ============================================

const sampleCustomer = {
  id: CUSTOMER_ID,
  bankId: BANK_ID,
  firstName: "Mohamed",
  lastName: "Benali",
  nationalId: "123456789",
  email: "mohamed@example.com",
  phone: "0550123456",
  address: "Alger Centre",
  dateOfBirth: null,
  customerType: "INDIVIDUAL",
  isActive: true,
};

// ============================================
// 9. Reset Mocks Before Each Test
// ============================================

beforeEach(() => {
  jest.clearAllMocks();

  // Authentication: find employee by token sub
  mockPrisma.employee.findUnique.mockImplementation(async ({ where }) => {
    if (where.id === ADMIN_ID) return adminEmployee;

    if (where.id === EMPLOYEE_ID) {
      return employeeWithoutPermissions;
    }

    return null;
  });

  // Direct Prisma customer queries
  mockPrisma.customer.findFirst.mockResolvedValue(sampleCustomer);
  mockPrisma.customer.count.mockResolvedValue(1);
  mockPrisma.customer.findMany.mockResolvedValue([sampleCustomer]);

  // Transaction mock
  mockPrisma.$transaction.mockImplementation(async (operation) => {
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }

    return operation(txMock);
  });

  // Transaction customer queries
  txMock.customer.findFirst.mockResolvedValue(null);
  txMock.customer.create.mockResolvedValue(sampleCustomer);
  txMock.customer.update.mockResolvedValue(sampleCustomer);

  // Account queries
  txMock.account.count.mockResolvedValue(0);

  // Audit
  mockRecordAudit.mockResolvedValue(undefined);
});

// ============================================
// 10. CUSTOMER MODULE TESTS
// ============================================

describe("BankServices - Customers Module API", () => {

  // ------------------------------------------
  // GET /api/customers
  // ------------------------------------------

  test("GET /api/customers - should return customers", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toBeDefined();

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bankId: BANK_ID,
        }),
      })
    );
  });

  test("GET /api/customers - should filter customers by search", async () => {
    const response = await request(app)
      .get("/api/customers?search=Mohamed")
      .set(auth(adminToken));

    expect(response.status).toBe(200);

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bankId: BANK_ID,
        }),
      })
    );
  });

  test("GET /api/customers - should reject invalid pagination", async () => {
    const response = await request(app)
      .get("/api/customers?page=0&limit=200")
      .set(auth(adminToken));

    expect(response.status).toBe(400);
  });

  // ------------------------------------------
  // GET /api/customers/:id
  // ------------------------------------------

  test("GET /api/customers/:id - should return customer details", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...sampleCustomer,
      accounts: [],
    });

    const response = await request(app)
      .get(`/api/customers/${CUSTOMER_ID}`)
      .set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.firstName).toBe("Mohamed");

    expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: CUSTOMER_ID,
          bankId: BANK_ID,
        },
      })
    );
  });

  test("GET /api/customers/:id - should reject invalid customer ID", async () => {
    const response = await request(app)
      .get("/api/customers/invalid-id")
      .set(auth(adminToken));

    expect(response.status).toBe(400);
  });

  test("GET /api/customers/:id - should return 404 for another bank's customer", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/customers/${CUSTOMER_ID}`)
      .set(auth(adminToken));

    expect(response.status).toBe(404);
  });

  // ------------------------------------------
  // POST /api/customers
  // ------------------------------------------

  test("POST /api/customers - should create a customer", async () => {
    const response = await request(app)
      .post("/api/customers")
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
        lastName: "Kaci",
        nationalId: "123456789",
        email: "ahmed@example.com",
        phone: "0550123456",
        address: "Alger",
        customerType: "INDIVIDUAL",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(txMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "Ahmed",
          nationalId: "123456789",
          bankId: BANK_ID,
        }),
      })
    );

    expect(mockRecordAudit).toHaveBeenCalled();
  });

  test("POST /api/customers - should reject missing required fields", async () => {
    const response = await request(app)
      .post("/api/customers")
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
      });

    expect(response.status).toBe(400);
  });

  test("POST /api/customers - should reject duplicate national ID", async () => {
    txMock.customer.findFirst.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
    });

    const response = await request(app)
      .post("/api/customers")
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
        lastName: "Kaci",
        nationalId: "123456789",
        email: "ahmed@example.com",
      });

    expect(response.status).toBe(409);
  });

  test("POST /api/customers - should reject unknown fields", async () => {
    const response = await request(app)
      .post("/api/customers")
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
        lastName: "Kaci",
        nationalId: "123456789",
        bankId: OTHER_BANK_ID,
      });

    expect(response.status).toBe(400);
  });

  // ------------------------------------------
  // PATCH /api/customers/:id
  // ------------------------------------------

  test("PATCH /api/customers/:id - should update customer information", async () => {
    txMock.customer.findFirst.mockResolvedValue(sampleCustomer);

    txMock.customer.update.mockResolvedValue({
      ...sampleCustomer,
      firstName: "Ahmed",
    });

    const response = await request(app)
      .patch(`/api/customers/${CUSTOMER_ID}`)
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.firstName).toBe("Ahmed");

    expect(txMock.customer.update).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  test("PATCH /api/customers/:id - should reject empty update data", async () => {
    const response = await request(app)
      .patch(`/api/customers/${CUSTOMER_ID}`)
      .set(auth(adminToken))
      .send({});

    expect(response.status).toBe(400);
  });

  test("PATCH /api/customers/:id - should return 404 for customer outside the bank", async () => {
    txMock.customer.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/customers/${CUSTOMER_ID}`)
      .set(auth(adminToken))
      .send({
        firstName: "Ahmed",
      });

    expect(response.status).toBe(404);
  });

  // ------------------------------------------
  // DEACTIVATE CUSTOMER
  // ------------------------------------------

  test("POST /api/customers/:id/deactivate - should deactivate customer", async () => {
    txMock.customer.findFirst.mockResolvedValue(sampleCustomer);

    txMock.customer.update.mockResolvedValue({
      ...sampleCustomer,
      isActive: false,
    });

    txMock.account.count.mockResolvedValue(0);

    const response = await request(app)
      .post(`/api/customers/${CUSTOMER_ID}/deactivate`)
      .set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(txMock.customer.update).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  test("POST /api/customers/:id/deactivate - should reject customer with active accounts", async () => {
    txMock.customer.findFirst.mockResolvedValue(sampleCustomer);
    txMock.account.count.mockResolvedValue(2);

    const response = await request(app)
      .post(`/api/customers/${CUSTOMER_ID}/deactivate`)
      .set(auth(adminToken));

    expect(response.status).toBe(400);

    expect(txMock.customer.update).not.toHaveBeenCalled();
  });

  // ------------------------------------------
  // REACTIVATE CUSTOMER
  // ------------------------------------------

  test("POST /api/customers/:id/reactivate - should reactivate customer", async () => {
    txMock.customer.findFirst.mockResolvedValue({
      ...sampleCustomer,
      isActive: false,
    });

    txMock.customer.update.mockResolvedValue({
      ...sampleCustomer,
      isActive: true,
    });

    const response = await request(app)
      .post(`/api/customers/${CUSTOMER_ID}/reactivate`)
      .set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(txMock.customer.update).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  // ------------------------------------------
  // AUTHENTICATION & AUTHORIZATION
  // ------------------------------------------

  test("GET /api/customers - should reject unauthenticated users", async () => {
    const response = await request(app)
      .get("/api/customers");

    expect(response.status).toBe(401);
  });

  test("POST /api/customers - should reject users without create permission", async () => {
    const response = await request(app)
      .post("/api/customers")
      .set(auth(employeeToken))
      .send({
        firstName: "Ahmed",
        lastName: "Kaci",
        nationalId: "123456789",
      });

    expect(response.status).toBe(403);
  });

  test("GET /api/customers - should reject users without view permission", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set(auth(employeeToken));

    expect(response.status).toBe(403);
  });

});
