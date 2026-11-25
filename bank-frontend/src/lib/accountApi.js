import { apiFetch } from './api.js'

export const ACCOUNT_TYPE_LABELS = { COURANT: 'Compte courant', EPARGNE: 'Compte épargne' }
export const ACCOUNT_STATUS_LABELS = { ACTIF: 'Actif', BLOQUE: 'Bloqué', FERME: 'Fermé' }
export const CURRENCIES = ['DZD', 'EUR', 'USD']

export const accountTypeLabel = (type) => ACCOUNT_TYPE_LABELS[type] ?? type ?? '—'
export const accountStatusLabel = (status) => ACCOUNT_STATUS_LABELS[status] ?? status ?? '—'

function buildQuery(params) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  })
  const text = qs.toString()
  return text ? `?${text}` : ''
}

// Builds the exact body for POST /api/accounts. Never sends fields of the other account type,
// bankId, balance, status, accountNumber, id or initialDeposit.
export function toCreateAccountPayload({ customerId, accountType, currency, overdraftLimit, interestRate, minimumBalance }) {
  const body = { customerId, accountType, currency }
  if (accountType === 'COURANT') {
    if (overdraftLimit !== '') body.overdraftLimit = overdraftLimit
  } else {
    if (interestRate !== '') body.interestRate = interestRate
    if (minimumBalance !== '') body.minimumBalance = minimumBalance
  }
  return body
}

// search matches the ACCOUNT NUMBER only (backend behaviour).
export async function getAccounts({ page = 1, limit = 20, search, accountType, status, customerId } = {}) {
  const json = await apiFetch(`/accounts${buildQuery({ page, limit, search, accountType, status, customerId })}`)
  return { data: json.data ?? [], meta: json.meta ?? { page, limit, total: 0, totalPages: 0 } }
}

// :id is the account UUID (not the account number).
export async function getAccount(id) {
  const json = await apiFetch(`/accounts/${encodeURIComponent(id)}`)
  return json.data
}

export async function createAccount(body) {
  const json = await apiFetch('/accounts', { method: 'POST', body })
  return json.data
}

// -> { customer, accounts, summary: { totalAccounts, activeAccounts, totalBalanceByCurrency } }
export async function getCustomerAccounts(customerId, { accountType, status } = {}) {
  const json = await apiFetch(`/customers/${encodeURIComponent(customerId)}/accounts${buildQuery({ accountType, status })}`)
  return json.data
}