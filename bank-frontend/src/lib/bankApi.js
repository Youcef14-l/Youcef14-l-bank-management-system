
import { apiFetch } from "./api.js";

// Get complete bank information (admin only)
export async function getBank() {
  const response = await apiFetch("/bank");
  return response.data;
}

// Get public-to-authenticated-users bank summary
export async function getBankSummary() {
  const response = await apiFetch("/bank/summary");
  return response.data;
}

// Update bank information (admin only)
export async function updateBank(data) {
  const response = await apiFetch("/bank", {
    method: "PATCH",
    body: data,
  });

  return response.data;
}
