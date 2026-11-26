import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Download } from 'lucide-react'
import { PageHeader, Button } from '../components/ui.jsx'
import { listTransactions, describeApiError } from '../lib/transactionApi.js'
import { formatDecimal } from '../lib/decimal.js'

const LIMIT = 15

const TYPE_FILTERS = [
  ['Tous', 'Tous'],
  ['DEPOT', 'Dépôts'],
  ['RETRAIT', 'Retraits'],
  ['VIREMENT', 'Virements'],
]
const TYPE_LABELS = { DEPOT: 'Dépôt', RETRAIT: 'Retrait', VIREMENT: 'Virement' }
const STATUS_LABELS = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
  COMPLETED: 'Terminée',
  FAILED: 'Échouée',
}
const STATUS_COLORS = {
  PENDING: { background: '#fef3c7', color: '#92400e' },
  APPROVED: { background: '#dbeafe', color: '#1e40af' },
  REJECTED: { background: '#fee2e2', color: '#991b1b' },
  COMPLETED: { background: '#dcfce7', color: '#166534' },
  FAILED: { background: '#fee2e2', color: '#991b1b' },
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const formatDateTime = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFormatter.format(d)
}

// DEPOT -> destination, RETRAIT -> source, VIREMENT -> source → destination
function accountDisplay(tx) {
  const src = tx.sourceAccount?.accountNumber
  const dst = tx.destinationAccount?.accountNumber
  if (tx.transactionType === 'DEPOT') return dst ?? '—'
  if (tx.transactionType === 'RETRAIT') return src ?? '—'
  return `${src ?? '—'} → ${dst ?? '—'}`
}

// A cell is dangerous if, after any leading whitespace / invisible characters, it starts with
// = + - @ (spreadsheet formula), or if it starts with a tab or carriage return.
const FORMULA_START = /^[\t\r]|^[\s\u00a0\u200b-\u200d\u2060\ufeff]*[=+\-@]/

// CSV escaping (quotes, commas, line breaks) + spreadsheet formula neutralisation.
function csvText(value) {
  let s = String(value ?? '')
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Exports ONLY the rows currently displayed (current page, after the local search filter).
function exportCsv(rows, pageNumber) {
  const header = ['Référence', 'Compte', 'Type', 'Statut', 'Montant', 'Devise', 'Date', 'Description']
  const lines = rows.map((tx) =>
    [
      csvText(tx.reference),
      csvText(accountDisplay(tx)),
      csvText(TYPE_LABELS[tx.transactionType] ?? tx.transactionType),
      csvText(STATUS_LABELS[tx.status] ?? tx.status),
      csvText(tx.amount), // raw decimal string from the API, e.g. 1250.50
      csvText(tx.currency ?? ''),
      csvText(tx.createdAt),
      csvText(tx.description ?? ''),
    ].join(',')
  )
  const csv = '\uFEFF' + [header.map(csvText).join(','), ...lines].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `operations-page-${pageNumber}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function OperationsPage({ query, setQuery, canCreate = true }) {
  const [type, setType] = useState('Tous')
  const [status, setStatus] = useState('Tous')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const dateRangeInvalid = !!from && !!to && from > to

  useEffect(() => {
    if (dateRangeInvalid) {
      setItems([])
      setPagination(null)
      setLoading(false)
      setError('La date de début doit précéder la date de fin.')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await listTransactions({
          page,
          limit: LIMIT,
          type: type === 'Tous' ? undefined : type,
          status: status === 'Tous' ? undefined : status,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
        })
        if (cancelled) return
        setItems(res?.data?.items ?? [])
        setPagination(res?.data?.pagination ?? null)
      } catch (e) {
        // Every error (401 included) is caught and displayed: nothing is rethrown from this
        // async IIFE, so no unhandled Promise rejection. For a 401 the existing session flow
        // behind apiFetch is responsible for redirecting to the login page.
        if (!cancelled) {
          setItems([])
          setPagination(null)
          setError(describeApiError(e, 'Impossible de charger les opérations.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, type, status, from, to, reloadKey, dateRangeInvalid])

  // The backend has no search parameter: local filtering of the loaded page only.
  const rows = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return items
    return items.filter((tx) =>
      [
        tx.reference,
        tx.description,
        tx.sourceAccount?.accountNumber,
        tx.destinationAccount?.accountNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [items, query])

  const resetPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }
  const totalPages = pagination?.totalPages ?? 1
  const currentPage = pagination?.page ?? page

  return (
    <>
      <PageHeader
        title="Historique des opérations"
        description="Consultez les mouvements de tous les comptes."
        action={
          <>
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() => exportCsv(rows, currentPage)}
            >
              <Download /> Exporter la page (CSV)
            </Button>
            {canCreate && (
              <Link className="button" to="/operations/new">
                <Plus /> Nouvelle opération
              </Link>
            )}
          </>
        }
      />
      <section className="card list-card">
        <div className="toolbar">
          <label className="search-box">
            <Search />
            <input
              placeholder="Référence, description ou compte (page affichée)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="segmented">
            {TYPE_FILTERS.map(([k, label]) => (
              <button key={k} className={type === k ? 'selected' : ''} onClick={() => resetPage(setType)(k)}>
                {label}
              </button>
            ))}
          </div>
          <select
            className="field-control"
            aria-label="Filtrer par statut"
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value)}
          >
            <option value="Tous">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="field-control"
            type="date"
            aria-label="Date de début"
            value={from}
            onChange={(e) => resetPage(setFrom)(e.target.value)}
          />
          <input
            className="field-control"
            type="date"
            aria-label="Date de fin"
            value={to}
            onChange={(e) => resetPage(setTo)(e.target.value)}
          />
        </div>

        {error && (
          <div className="inline-error">
            {error}{' '}
            {!dateRangeInvalid && (
              <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                Réessayer
              </Button>
            )}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Type</th>
                <th>Compte</th>
                <th>Description</th>
                <th>Statut</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}>Chargement des opérations…</td>
                </tr>
              )}
              {!loading && !error && items.length === 0 && (
                <tr>
                  <td colSpan={7}>Aucune opération trouvée.</td>
                </tr>
              )}
              {!loading && !error && items.length > 0 && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>Aucune opération de cette page ne correspond à la recherche.</td>
                </tr>
              )}
              {!loading &&
                rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="mono">{tx.reference}</td>
                    <td>{TYPE_LABELS[tx.transactionType] ?? tx.transactionType}</td>
                    <td className="mono">{accountDisplay(tx)}</td>
                    <td>{tx.description ?? '—'}</td>
                    <td>
                      <span
                        className="badge"
                        title={tx.rejectionReason ?? undefined}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          ...(STATUS_COLORS[tx.status] ?? {}),
                        }}
                      >
                        {STATUS_LABELS[tx.status] ?? tx.status}
                      </span>
                    </td>
                    <td>{formatDateTime(tx.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{formatDecimal(tx.amount, tx.currency)}</b>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            {pagination ? `${pagination.total} opération${pagination.total > 1 ? 's' : ''}` : '—'} · Page{' '}
            {currentPage} / {totalPages}
          </span>
          <span>
            <Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </Button>{' '}
            <Button
              variant="outline"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </span>
        </div>
      </section>
    </>
  )
}