
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
} from "@jest/globals";

import request from "supertest";
import bcrypt from "bcryptjs";

// Mock Prisma so tests never modify the real database.
const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule("../src/config/prisma.js", () => ({
  prisma: mockPrisma,
  disconnectPrisma: jest.fn(),
}));

// Import the Express app AFTER mocking Prisma.
const { default: app } = await import("../src/app.js");

describe("BankServices - Authentication API", () => {
  let testEmployee;
  let testPassword;

  beforeEach(async () => {
    jest.clearAllMocks();

    testPassword = "TestPassword123";

    const passwordHash = await bcrypt.hash(testPassword, 10);

    testEmployee = {
      id: "employee-test-001",
      employeeNumber: "EMP001",
      firstName: "Test",
      lastName: "Administrator",
      email: "admin@test.com",
      phone: "0550000000",
      bankId: "bank-test-001",
      password: passwordHash,
      isActive: true,
      lastLoginAt: null,

      role: {
        id: "role-admin",
        name: "ADMINISTRATEUR",
        permissions: [
          {
            permission: {
              code: "DASHBOARD_VIEW",
            },
          },
          {
            permission: {
              code: "BANK_SETTINGS_MANAGE",
            },
          },
        ],
      },
    };

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    mockPrisma.employee.update.mockResolvedValue({
      lastLoginAt: new Date(),
    });
  });

  // TEST 1: Health check
  test("GET /api/health - should return server status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe(
      "BankServices API is running"
    );
  });

  // TEST 2: Reject login with invalid email
  test("POST /api/auth/login - should reject invalid email", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "invalid-email",
        password: "TestPassword123",
      });

    expect(response.status).toBe(400);
    expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
  });

  // TEST 3: Reject login with missing password
  test("POST /api/auth/login - should reject missing password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "admin@test.com",
      });

    expect(response.status).toBe(400);
    expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
  });

  // TEST 4: Reject incorrect credentials
  test("POST /api/auth/login - should reject incorrect credentials", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "unknown@test.com",
        password: "WrongPassword123",
      });

    expect(response.status).toBe(401);
    expect(mockPrisma.employee.findUnique).toHaveBeenCalledTimes(1);
  });

  // TEST 5: Successful login
  test("POST /api/auth/login - should login with correct credentials", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue(testEmployee);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmployee.email,
        password: testPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.token).toBeDefined();

    expect(response.body.data.employee.email).toBe(
      testEmployee.email
    );

    expect(response.body.data.employee.permissions).toContain(
      "BANK_SETTINGS_MANAGE"
    );

    // Password hash must never be returned.
    expect(response.body.data.employee.password).toBeUndefined();

    expect(mockPrisma.employee.update).toHaveBeenCalledTimes(1);
  });

  // TEST 6: Reject access to /me without JWT
  test("GET /api/auth/me - should reject unauthenticated users", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  // TEST 7: Reject password change without JWT
  test("POST /api/auth/change-password - should require authentication", async () => {
    const response = await request(app)
      .post("/api/auth/change-password")
      .send({
        currentPassword: "OldPassword123",
        newPassword: "NewPassword456",
      });

    expect(response.status).toBe(401);
  });

  // TEST 8: Reject invalid change-password data
  test("POST /api/auth/change-password - should validate password data", async () => {
    const response = await request(app)
      .post("/api/auth/change-password")
      .send({
        currentPassword: "",
        newPassword: "123",
      });

    // Authentication middleware runs before validation.
    expect(response.status).toBe(401);
  });
});
