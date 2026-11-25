import { apiFetch } from './api.js'

export const CUSTOMER_TYPES = [
  { id: 'INDIVIDUAL', label: 'Particulier' },
  { id: 'BUSINESS', label: 'Entreprise' },
]

export const customerTypeLabel = (type) => CUSTOMER_TYPES.find((item) => item.id === type)?.label ?? type ?? '—'
export const customerFullName = (customer) => [customer?.firstName, customer?.lastName].filter(Boolean).join(' ')
export const customerInitials = (customer) =>
  `${customer?.firstName?.[0] ?? ''}${customer?.lastName?.[0] ?? ''}`.toUpperCase()

// Prisma Date -> "2000-01-31T00:00:00.000Z" -> "2000-01-31" (for <input type="date"> and display).
export const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

function buildQuery(params) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  })
  const text = qs.toString()
  return text ? `?${text}` : ''
}

/* ---------- Payload builders: only exact backend field names are ever sent ---------- */

export function toCreatePayload(form) {
  const payload = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nationalId: form.nationalId.trim(),
    customerType: form.customerType,
  }
  const optional = {
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    dateOfBirth: form.dateOfBirth.trim(),
  }
  Object.entries(optional).forEach(([key, value]) => {
    if (value) payload[key] = value
  })
  return payload
}

// PATCH body: only the fields that really changed. A cleared optional field is sent as null.
export function toUpdatePayload(original, form) {
  const changes = {}

  const required = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nationalId: form.nationalId.trim(),
    customerType: form.customerType,
  }
  if (required.firstName !== (original.firstName ?? '')) changes.firstName = required.firstName
  if (required.lastName !== (original.lastName ?? '')) changes.lastName = required.lastName
  if (required.nationalId.toUpperCase() !== (original.nationalId ?? '').toUpperCase()) changes.nationalId = required.nationalId
  if (required.customerType !== original.customerType) changes.customerType = required.customerType

  const nullable = {
    email: [form.email.trim(), (original.email ?? '').toLowerCase(), (v) => v.toLowerCase()],
    phone: [form.phone.trim(), original.phone ?? '', (v) => v],
    address: [form.address.trim(), original.address ?? '', (v) => v],
    dateOfBirth: [form.dateOfBirth.trim(), toDateInput(original.dateOfBirth), (v) => v],
  }
  Object.entries(nullable).forEach(([key, [next, previous, normalize]]) => {
    if (normalize(next) === previous) return
    changes[key] = next === '' ? null : next
  })

  return changes
}

/* ---------- Requests (all go through apiFetch: JWT + error handling) ---------- */

export async function getCustomers({ page = 1, limit = 20, search, customerType, isActive } = {}) {
  const json = await apiFetch(`/customers${buildQuery({ page, limit, search, customerType, isActive })}`)
  return { data: json.data ?? [], meta: json.meta ?? { page, limit, total: 0, totalPages: 0 } }
}

export async function getCustomer(id) {
  const json = await apiFetch(`/customers/${encodeURIComponent(id)}`)
  return json.data
}

export async function createCustomer(payload) {
  const json = await apiFetch('/customers', { method: 'POST', body: payload })
  return json.data
}

export async function updateCustomer(id, payload) {
  const json = await apiFetch(`/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload })
  return json.data
}

export async function deactivateCustomer(id) {
  const json = await apiFetch(`/customers/${encodeURIComponent(id)}/deactivate`, { method: 'POST' })
  return json.data
}

export async function reactivateCustomer(id) {
  const json = await apiFetch(`/customers/${encodeURIComponent(id)}/reactivate`, { method: 'POST' })
  return json.data
}

// For the account-opening selector: pages through all ACTIVE customers (backend max limit = 100).
export async function getAllActiveCustomers({ pageSize = 100, maxPages = 20 } = {}) {
  const all = []
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, meta } = await getCustomers({ page, limit: pageSize, isActive: true })
    all.push(...data)
    if (page >= (meta.totalPages ?? 1)) break
  }
  return all
}