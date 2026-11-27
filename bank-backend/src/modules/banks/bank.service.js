
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";

const BANK_SELECT = {
  id: true,
  name: true,
  code: true,
  address: true,
  phone: true,
  email: true,
};

const BANK_SUMMARY_SELECT = {
  id: true,
  name: true,
  code: true,
};

export async function getBank(bankId) {
  const bank = await prisma.bank.findUnique({
    where: { id: bankId },
    select: BANK_SELECT,
  });

  if (!bank) {
    throw new AppError("Bank not found", 404, "BANK_NOT_FOUND");
  }

  return bank;
}

export async function getBankSummary(bankId) {
  const bank = await prisma.bank.findUnique({
    where: { id: bankId },
    select: BANK_SUMMARY_SELECT,
  });

  if (!bank) {
    throw new AppError("Bank not found", 404, "BANK_NOT_FOUND");
  }

  return bank;
}

export async function updateBank(bankId, input) {
  const { name, address, phone, email } = input;

  try {
    return await prisma.bank.update({
      where: { id: bankId },
      data: {
        name,
        address,
        phone,
        email,
      },
      select: BANK_SELECT,
    });
  } catch (error) {
    if (error.code === "P2025") {
      throw new AppError("Bank not found", 404, "BANK_NOT_FOUND");
    }

    throw error;
  }
}
