import { apiFetch } from './api.js'

// Only the query parameters documented by the backend are ever sent.
const TRANSACTION_QUERY_KEYS = ['page', 'limit', 'status', 'type', 'from', 'to']
const ACCOUNT_QUERY_KEYS = ['page', 'limit', 'search', 'accountType', 'status', 'customerId']

function buildQuery(params = {}, allowedKeys) {
  const query = new URLSearchParams()
  for (const key of allowedKeys) {
    const value = params[key]
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

const segment = (id) => encodeURIComponent(String(id))

/* ---------- Transactions ---------- */

// GET /transactions?page&limit&status&type&from&to  (no "search" on purpose)
export function listDirectorTransactions(params = {}) {
  return apiFetch(`/transactions${buildQuery(params, TRANSACTION_QUERY_KEYS)}`)
}

// PATCH /transactions/:id/approve  — id is the UUID, body is empty by contract
export function approveDirectorTransaction(id) {
  return apiFetch(`/transactions/${segment(id)}/approve`, { method: 'PATCH', body: {} })
}

// PATCH /transactions/:id/reject  — only the reason is sent
export function rejectDirectorTransaction(id, reason) {
  return apiFetch(`/transactions/${segment(id)}/reject`, { method: 'PATCH', body: { reason } })
}

/* ---------- Accounts ---------- */

// GET /accounts?page&limit&search&accountType&status&customerId
export function listDirectorAccounts(params = {}) {
  return apiFetch(`/accounts${buildQuery(params, ACCOUNT_QUERY_KEYS)}`)
}

// GET /accounts/:id  — UUID
export function getDirectorAccount(id) {
  return apiFetch(`/accounts/${segment(id)}`)
}

// POST /accounts/:id/block  — no body
export function blockDirectorAccount(id) {
  return apiFetch(`/accounts/${segment(id)}/block`, { method: 'POST' })
}

// POST /accounts/:id/unblock  — no body
export function unblockDirectorAccount(id) {
  return apiFetch(`/accounts/${segment(id)}/unblock`, { method: 'POST' })
}