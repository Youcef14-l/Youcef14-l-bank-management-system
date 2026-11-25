import { apiFetch } from './api.js'

// Backend role name -> French display label (display only, never sent to the API)
export const ROLE_LABELS = {
  CAISSIER: 'Caissier',
  CHARGE_CLIENTELE: 'Chargé de clientèle',
  DIRECTEUR_AGENCE: 'Directeur d’agence',
  CONTROLEUR: 'Contrôleur / Auditeur',
  ADMINISTRATEUR: 'Administrateur',
}

export const roleLabel = (name) => ROLE_LABELS[name] ?? name ?? '—'

const ERROR_MESSAGES = {
  INVALID_ROLE: 'Le rôle sélectionné est invalide.',
  LAST_ADMIN: 'Action impossible : il doit rester au moins un administrateur actif.',
  SELF_ROLE_CHANGE: 'Vous ne pouvez pas modifier votre propre rôle.',
  SELF_DEACTIVATION: 'Vous ne pouvez pas désactiver votre propre compte.',
  ALREADY_ACTIVE: 'Cet employé est déjà actif.',
  ALREADY_INACTIVE: 'Cet employé est déjà désactivé.',
  FORBIDDEN: 'Vous n’avez pas l’autorisation d’effectuer cette action.',
  NOT_FOUND: 'Employé introuvable. Il a peut-être été supprimé ou n’appartient pas à votre agence.',
}

export function getErrorMessage(err) {
  if (err?.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code]
  return err?.message || 'Une erreur est survenue.'
}

function buildQuery(params) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  })
  const str = qs.toString()
  return str ? `?${str}` : ''
}

/**
 * Reads the pagination info from whatever the backend helper returns in `meta`.
 * It looks for the usual field names and falls back gracefully.
 * Check the Network tab once to confirm which fields your backend sends.
 */
export function normalizePagination(meta, { page, limit, count }) {
  const m = meta?.pagination ?? meta ?? {}
  const total = m.total ?? m.totalItems ?? m.totalCount ?? null
  let totalPages = m.totalPages ?? m.pages ?? m.pageCount ?? null
  if (totalPages == null && total != null) totalPages = Math.max(1, Math.ceil(total / limit))
  const hasNext =
    m.hasNext ?? m.hasNextPage ?? (totalPages != null ? page < totalPages : count >= limit)
  return { page: m.page ?? page, total, totalPages, hasNext: Boolean(hasNext), hasPrev: page > 1 }
}

export async function getEmployees(params = {}) {
  const json = await apiFetch(`/employees${buildQuery(params)}`)
  return { employees: json.data ?? [], meta: json.meta ?? {} }
}

export async function getRoles() {
  const json = await apiFetch('/roles')
  return json.data ?? []
}

export async function createEmployee(data) {
  const json = await apiFetch('/employees', { method: 'POST', body: data })
  return json.data
}

export async function updateEmployee(id, data) {
  const json = await apiFetch(`/employees/${encodeURIComponent(id)}`, { method: 'PATCH', body: data })
  return json.data
}

export async function deactivateEmployee(id) {
  const json = await apiFetch(`/employees/${encodeURIComponent(id)}/deactivate`, { method: 'POST' })
  return json.data
}

export async function reactivateEmployee(id) {
  const json = await apiFetch(`/employees/${encodeURIComponent(id)}/reactivate`, { method: 'POST' })
  return json.data
}

export async function resetEmployeePassword(id, newPassword) {
  const json = await apiFetch(`/employees/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: { newPassword },
  })
  return json.data
}