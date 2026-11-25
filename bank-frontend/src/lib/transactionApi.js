import { apiFetch } from './api.js'

// Paths are relative to VITE_API_URL (the brief says it normally ends with /api).
// They must match app.use("/api/transactions", ...) and app.use("/api/accounts", ...) in app.js.
// Keep them here, and only here, so a mismatch is a one-line fix.
const TRANSACTIONS_PATH = '/transactions'
const ACCOUNTS_PATH = '/accounts'

export const ACCOUNTS_PAGE_SIZE = 50
const RESOLVE_MAX_PAGES = 5

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => UUID_RE.test(String(v ?? '').trim())

function toQuery(params = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/* ---------- Transactions ---------- */

// GET /transactions?page&limit&status&type&from&to
// Response: { success, data: { items: [...], pagination: { page, limit, total, totalPages } } }
export const listTransactions = (params = {}) =>
  apiFetch(`${TRANSACTIONS_PATH}${toQuery(params)}`)

function postOperation(path, payload, idempotencyKey) {
  const headers = { 'Content-Type': 'application/json' }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  return apiFetch(`${TRANSACTIONS_PATH}${path}`, {
    method: 'POST',
    headers,
    body: payload,
  })
}

// payload: { accountId, amount, description? }
export const createDeposit = (payload, idempotencyKey) =>
  postOperation('/deposits', payload, idempotencyKey)

// payload: { accountId, amount, description? }
export const createWithdrawal = (payload, idempotencyKey) =>
  postOperation('/withdrawals', payload, idempotencyKey)

// payload: { sourceAccountId, destinationAccountId, amount, description? }
export const createTransfer = (payload, idempotencyKey) =>
  postOperation('/transfers', payload, idempotencyKey)

// Key matching the backend schema: 8-128 characters [A-Za-z0-9._:-]
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/* ---------- Accounts ---------- */

// GET /accounts?page&limit&status=ACTIF&search=<accountNumber>
// The server-side `search` parameter matches accountNumber only.
// Returns one page: { accounts, page, totalPages, total }.
export async function fetchActiveAccountsPage({ page = 1, limit = ACCOUNTS_PAGE_SIZE, search } = {}) {
  const res = await apiFetch(
    `${ACCOUNTS_PATH}${toQuery({
      page,
      limit,
      status: 'ACTIF',
      search: search && search.trim() ? search.trim() : undefined,
    })}`
  )
  const data = res?.data ?? []
  const meta = res?.meta ?? {}
  return {
    accounts: data.filter((a) => a.status === 'ACTIF'),
    page: meta.page ?? page,
    totalPages: meta.totalPages ?? 1,
    total: meta.total ?? data.length,
  }
}

// GET /accounts/:id  (existing account detail endpoint, keyed by the account UUID).
// Unlike the list, this returns the account whatever its status, so a blocked or
// closed account is detected instead of silently disappearing.
// The detail payload may be { data: account } or { data: { account } }: both are accepted.
export async function fetchAccountById(id) {
  const wanted = String(id ?? '').trim().toLowerCase()
  const res = await apiFetch(`${ACCOUNTS_PATH}/${encodeURIComponent(wanted)}`)
  const account = res?.data?.account ?? res?.data ?? null
  if (!account || typeof account !== 'object' || String(account.id ?? '').toLowerCase() !== wanted) {
    throw clientError('Réponse inattendue du serveur lors du chargement du compte.')
  }
  return account
}

// Resolves the ?compte= parameter:
//  - UUID           -> GET /accounts/:id
//  - account number -> server-side search by account number (exact match required)
// Returns { account } when an ACTIF account is found, otherwise
// { account: null, reason: 'NOT_FOUND' | 'INACTIVE', status? }. Other errors are thrown.
export async function resolveAccountParam(param) {
  const value = String(param ?? '').trim()
  if (!value) return { account: null, reason: 'NOT_FOUND' }

  if (isUuid(value)) {
    try {
      const account = await fetchAccountById(value)
      if (account.status === 'ACTIF') return { account }
      return { account: null, reason: 'INACTIVE', status: account.status }
    } catch (e) {
      if (getErrorStatus(e) === 404) return { account: null, reason: 'NOT_FOUND' }
      throw e
    }
  }

  let page = 1
  let totalPages = 1
  do {
    const res = await fetchActiveAccountsPage({ page, limit: ACCOUNTS_PAGE_SIZE, search: value })
    const hit = res.accounts.find((a) => a.accountNumber === value)
    if (hit) return { account: hit }
    totalPages = res.totalPages
    page += 1
  } while (page <= totalPages && page <= RESOLVE_MAX_PAGES)
  return { account: null, reason: 'NOT_FOUND' }
}

/* ---------- Errors ---------- */

export const getErrorStatus = (err) =>
  err?.status ?? err?.statusCode ?? err?.response?.status ?? null

export const getErrorCode = (err) =>
  err?.code ??
  err?.data?.code ??
  err?.data?.error?.code ??
  err?.body?.code ??
  err?.body?.error?.code ??
  err?.payload?.code ??
  err?.payload?.error?.code ??
  null

export const isAuthError = (err) => getErrorStatus(err) === 401

// Client-side error carrying its own French message (e.g. unexpected response shape).
export function clientError(message) {
  const e = new Error(message)
  e.clientMessage = message
  return e
}

export function describeApiError(err, fallback = 'Une erreur est survenue.') {
  if (err?.clientMessage) return err.clientMessage

  const status = getErrorStatus(err)
  const code = getErrorCode(err)

  if (status === 401) return 'Session expirée. Veuillez vous reconnecter.'
  if (status === 403) return 'Vous n’avez pas la permission d’effectuer cette action.'
  if (status === 404) {
    return code === 'ACCOUNT_NOT_FOUND'
      ? 'Compte introuvable. Actualisez la liste des comptes puis réessayez.'
      : 'Ressource introuvable.'
  }
  if (status === 400) return 'Les informations saisies sont invalides. Vérifiez le compte et le montant.'
  if (status === 409) {
    return code === 'IDEMPOTENCY_KEY_REUSED'
      ? 'Cette demande a déjà été utilisée avec des détails différents. Relancez l’opération.'
      : 'Conflit : l’état de l’opération a changé. Actualisez la page puis réessayez.'
  }
  if (status === 422) {
    switch (code) {
      case 'INSUFFICIENT_FUNDS':
        return 'Solde insuffisant (ou limite de découvert / solde minimum dépassé) pour ce compte.'
      case 'ACCOUNT_NOT_ACTIVE':
        return 'Opération refusée : l’un des comptes n’est pas actif.'
      case 'CURRENCY_MISMATCH':
        return 'Le virement est impossible : les deux comptes n’ont pas la même devise.'
      default:
        return 'Opération refusée par les règles du compte.'
    }
  }
  if (typeof status === 'number' && status >= 500) {
    return 'Erreur du serveur. Réessayez dans quelques instants.'
  }
  if (status === null) return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
  return fallback
}