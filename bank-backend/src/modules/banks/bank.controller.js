
import * as bankService from "./bank.service.js";

export async function getBank(req, res, next) {
  try {
    const data = await bankService.getBank(req.user.bankId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBankSummary(req, res, next) {
  try {
    const data = await bankService.getBankSummary(req.user.bankId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBank(req, res, next) {
  try {
    const data = await bankService.updateBank(
      req.user.bankId,
      req.body
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}
