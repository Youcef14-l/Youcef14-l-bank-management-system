import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { PageHeader, Button } from '../components/ui.jsx'
import { listAuditLogs } from '../lib/auditApi.js'
import { describeError } from '../lib/errorMessages.js'

const LIMIT = 15

const ACTION_LABELS = {
  EMPLOYEE_CREATED: 'Employé créé',
  EMPLOYEE_UPDATED: 'Employé modifié',
  EMPLOYEE_DEACTIVATED: 'Employé désactivé',
  EMPLOYEE_REACTIVATED: 'Employé réactivé',
  EMPLOYEE_PASSWORD_RESET: 'Mot de passe réinitialisé',
  ROLE_CREATED: 'Rôle créé',
  ROLE_UPDATED: 'Rôle modifié',
  ROLE_DELETED: 'Rôle supprimé',
  ROLE_PERMISSIONS_UPDATED: 'Permissions modifiées',
  CUSTOMER_CREATED: 'Client créé',
  CUSTOMER_UPDATED: 'Client modifié',
  CUSTOMER_DEACTIVATED: 'Client désactivé',
  CUSTOMER_REACTIVATED: 'Client réactivé',
  ACCOUNT_CREATED: 'Compte créé',
  ACCOUNT_BLOCKED: 'Compte bloqué',
  ACCOUNT_UNBLOCKED: 'Compte débloqué',
  ACCOUNT_CLOSED: 'Compte clôturé',
  DEPOSIT_COMPLETED: 'Dépôt effectué',
  WITHDRAWAL_COMPLETED: 'Retrait effectué',
  TRANSFER_COMPLETED: 'Virement effectué',
  TRANSACTION_PENDING: 'Transaction en attente',
  TRANSACTION_APPROVED: 'Transaction approuvée',
  TRANSACTION_REJECTED: 'Transaction rejetée',
  TRANSACTION_FAILED: 'Transaction échouée'
}

const ENTITY_LABELS = {
  Employee: 'Employé',
  Role: 'Rôle',
  Customer: 'Client',
  Account: 'Compte',
  Transaction: 'Transaction'
}

const dayStart = (s) => new Date(`${s}T00:00:00`).toISOString()
const dayEnd = (s) => new Date(`${s}T23:59:59.999`).toISOString()

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  })

const empName = (e) =>
  e ? `${e.firstName} ${e.lastName}` : 'Système / inconnu'

export default function AuditLogsPage() {
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    from: '',
    to: '',
    employeeId: ''
  })
  const [employeeLabel, setEmployeeLabel] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({
    items: [],
    pagination: { page: 1, limit: LIMIT, total: 0, totalPages: 0 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const requestId = useRef(0)

  const dateInvalid =
    filters.from && filters.to && filters.from > filters.to

  const load = useCallback(async () => {
    if (dateInvalid) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await listAuditLogs({
        page,
        limit: LIMIT,
        action: filters.action,
        entityType: filters.entityType,
        employeeId: filters.employeeId,
        from: filters.from ? dayStart(filters.from) : '',
        to: filters.to ? dayEnd(filters.to) : ''
      })
      if (id !== requestId.current) return
      setData(res)
    } catch (err) {
      if (id !== requestId.current) return
      setError(describeError(err))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [page, filters, dateInvalid])

  useEffect(() => {
    load()
  }, [load])

  const update = (patch) => {
    setPage(1)
    setOpenId(null)
    setFilters((f) => ({ ...f, ...patch }))
  }

  const { items, pagination } = data

  return (
    <>
      <PageHeader
        title="Journal d’audit"
        description="Consultez l’historique inaltérable des actions effectuées dans l’agence."
      />

      <section className="card list-card">
        <div className="toolbar audit-toolbar">
          <select
            value={filters.action}
            onChange={(e) => update({ action: e.target.value })}
          >
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={filters.entityType}
            onChange={(e) => update({ entityType: e.target.value })}
          >
            <option value="">Toutes les entités</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            aria-label="Date de début"
          />
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            aria-label="Date de fin"
          />

          {filters.employeeId && (
            <button
              type="button"
              className="audit-chip"
              onClick={() => {
                setEmployeeLabel('')
                update({ employeeId: '' })
              }}
            >
              {employeeLabel} <X size={14} />
            </button>
          )}
        </div>

        {dateInvalid && (
          <p className="range-error">
            La date de début doit précéder la date de fin.
          </p>
        )}

        {error ? (
          <div className="empty-state">
            <p>{error}</p>
            <Button variant="outline" onClick={load}>
              Réessayer
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="empty-state">
            {loading
              ? 'Chargement du journal…'
              : 'Aucun événement d’audit trouvé.'}
          </p>
        ) : (
          <div className={`table-scroll${loading ? ' is-loading' : ''}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>EMPLOYÉ</th>
                  <th>ACTION</th>
                  <th>ENTITÉ</th>
                  <th>DESCRIPTION</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <FragmentRow
                    key={log.id}
                    log={log}
                    open={openId === log.id}
                    onToggle={() =>
                      setOpenId(openId === log.id ? null : log.id)
                    }
                    onFilterEmployee={() => {
                      if (!log.employee) return
                      setEmployeeLabel(empName(log.employee))
                      update({ employeeId: log.employee.id })
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          <span>
            {pagination.total} événement{pagination.total > 1 ? 's' : ''}
          </span>
          <div>
            <Button
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <span className="audit-page">
              Page {pagination.page} / {Math.max(pagination.totalPages, 1)}
            </span>
            <Button
              variant="outline"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

function FragmentRow({ log, open, onToggle, onFilterEmployee }) {
  return (
    <>
      <tr>
        <td className="audit-date">{fmtDate(log.createdAt)}</td>
        <td>
          {log.employee ? (
            <button
              type="button"
              className="audit-link"
              onClick={onFilterEmployee}
              title="Filtrer par cet employé"
            >
              {empName(log.employee)}
              <small className="mono"> {log.employee.employeeNumber}</small>
            </button>
          ) : (
            empName(null)
          )}
        </td>
        <td>
          <b>{ACTION_LABELS[log.action] ?? log.action}</b>
          <div className="mono">{log.action}</div>
        </td>
        <td>
          {ENTITY_LABELS[log.entityType] ?? log.entityType}
          <div className="mono">{log.entityId}</div>
        </td>
        <td className="audit-desc">{log.description}</td>

      </tr>


    </>
  )
}