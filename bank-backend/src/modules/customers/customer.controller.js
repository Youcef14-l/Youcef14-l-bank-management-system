import { asyncHandler } from "../../utils/asyncHandler.js";
import * as customerService from "./customer.service.js";

export const listCustomers = asyncHandler(async (req, res) => {
  const { data, meta } = await customerService.listCustomers(req.user.bankId, req.validated.query);
  res.status(200).json({ success: true, data, meta });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.user.bankId, req.validated.params.id);
  res.status(200).json({ success: true, data: customer });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.user, req.body, req.ip);
  res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.user, req.validated.params.id, req.body, req.ip);
  res.status(200).json({ success: true, message: "Customer updated successfully", data: customer });
});

export const deactivateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.deactivateCustomer(req.user, req.validated.params.id, req.ip);
  res.status(200).json({ success: true, message: "Customer deactivated successfully", data: customer });
});

export const reactivateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.reactivateCustomer(req.user, req.validated.params.id, req.ip);
  res.status(200).json({ success: true, message: "Customer reactivated successfully", data: customer });
});