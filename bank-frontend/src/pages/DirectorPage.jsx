import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LockKeyhole, ShieldCheck, UnlockKeyhole, X } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { ApiError } from '../lib/api.js'
import {
  approveDirectorTransaction,
  blockDirectorAccount,
  getDirectorAccount,
  listDirectorAccounts,
  listDirectorTransactions,
  rejectDirectorTransaction,
  unblockDirectorAccount,
} from '../lib/directorApi.js'
import './utils/DirectorPage.css'

const PENDING_PAGE_SIZE = 10
const ACCOUNTS_PAGE_SIZE = 6
const REASON_MIN = 3
const REASON_MAX = 500

const TYPE_LABELS = { DEPOT: 'Dépôt', RETRAIT: 'Retrait', VIREMENT: 'Virement' }
const TX_STATUS_LABELS = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  COMPLETED: 'Terminée',
  REJECTED: 'Refusée',
  FAILED: 'Échouée',
}
const ACCOUNT_STATUS = {
  ACTIF: { label: 'Actif', className: 'approved' },
  BLOQUE: { label: 'Bloqué', className: 'rejected' },
  FERME: { label: 'Fermé', className: 'closed' },
}

/* ---------- helpers ---------- */

function formatAmount(value, currency = 'DZD') {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(number)
  } catch {
    return `${number.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${currency}`
  }
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function personName(person) {
  if (!person) return null
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ')
  return name || null
}

function accountsLabel(transaction) {
  const source = transaction.sourceAccount?.accountNumber
  const destination = transaction.destinationAccount?.accountNumber
  if (source && destination) return `${source} → ${destination}`
  return source || destination || 'Compte non renseigné'
}

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { from: start.toISOString(), to: end.toISOString() }
}

function describeError(error) {
  const status = error instanceof ApiError ? error.status : error?.status
  const detail = error?.message && error.message !== 'Erreur serveur' ? error.message : ''
  const withDetail = (base) => (detail ? `${base} (${detail})` : base)

  if (status === 0) return 'Serveur injoignable. Vérifiez la connexion puis réessayez.'
  if (status === 401) return 'Session expirée ou invalide. Veuillez vous reconnecter.'
  if (status === 403) return 'Vous n’avez pas l’autorisation d’effectuer cette action.'
  if (status === 404) return 'Élément introuvable : il a peut-être déjà été traité ou supprimé.'
  if (status === 409) return withDetail('Conflit d’état : l’élément a changé entre-temps.')
  if (status === 400 || status === 422) return withDetail('Règle métier non respectée.')
  if (status >= 500) return 'Erreur interne du serveur. Réessayez dans un instant.'
  return withDetail('Une erreur est survenue.')
}

function Pager({ page, totalPages, disabled, onChange }) {
  if (!totalPages || totalPages <= 1) return null
  return (
    <div className="director-pager">
      <button type="button" className="text-action" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
        Précédent
      </button>
      <span>Page {page} / {totalPages}</span>
      <button type="button" className="text-action" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
        Suivant
      </button>
    </div>
  )
}

/* ---------- page ---------- */

export default function DirectorPage({ user }) {
  const permissions = user?.permissions ?? []
  const can = (permission) => permissions.includes(permission)
  const canViewTransactions = can('TRANSACTIONS_VIEW')
  const canApprove = can('TRANSACTIONS_APPROVE')
  const canReject = can('TRANSACTIONS_REJECT')
  const canViewAccounts = can('ACCOUNTS_VIEW')
  const canBlock = can('ACCOUNTS_BLOCK')
  const canUnblock = can('ACCOUNTS_UNBLOCK')

  // pending queue
  const [pending, setPending] = useState({ items: [], page: 1, total: null, totalPages: 1 })
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState('')
  // accounts
  const [accounts, setAccounts] = useState({ items: [], page: 1, total: null, totalPages: 1 })
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError] = useState('')
  // KPIs that need their own request (null = unavailable)
  const [todayCount, setTodayCount] = useState(null)
  const [blockedCount, setBlockedCount] = useState(null)
  // actions
  const [feedback, setFeedback] = useState(null)
  const [busyKeys, setBusyKeys] = useState([])
  const [dialog, setDialog] = useState(null) // { mode: 'approve' | 'reject', item }
  const [reason, setReason] = useState('')
  const [dialogError, setDialogError] = useState('')

  const inFlight = useRef(new Set())
  const pendingReq = useRef(0)
  const accountsReq = useRef(0)

  const isBusy = (key) => busyKeys.includes(key)

  // Synchronous guard (a ref, not state) so a fast double click cannot send two requests.
  const runExclusive = async (key, task) => {
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setBusyKeys(Array.from(inFlight.current))
    try {
      await task()
    } finally {
      inFlight.current.delete(key)
      setBusyKeys(Array.from(inFlight.current))
    }
  }

  /* ----- loaders ----- */

  const loadPending = useCallback(async (page = 1) => {
    if (!canViewTransactions) return
    const req = ++pendingReq.current
    setPendingLoading(true)
    setPendingError('')
    try {
      const res = await listDirectorTransactions({ status: 'PENDING', page, limit: PENDING_PAGE_SIZE })
      if (req !== pendingReq.current) return
      const items = res?.data?.items ?? []
      const meta = res?.data?.pagination ?? {}
      const totalPages = meta.totalPages ?? 1
      if (items.length === 0 && page > 1) {
        // The last item of this page was just processed: step back to a page that exists.
        return await loadPending(Math.max(1, Math.min(page - 1, totalPages)))
      }
      setPending({ items, page: meta.page ?? page, total: meta.total ?? items.length, totalPages })
    } catch (error) {
      if (req === pendingReq.current) setPendingError(describeError(error))
    } finally {
      if (req === pendingReq.current) setPendingLoading(false)
    }
  }, [canViewTransactions])

  const loadAccounts = useCallback(async (page = 1) => {
    if (!canViewAccounts) return
    const req = ++accountsReq.current
    setAccountsLoading(true)
    setAccountsError('')
    try {
      const res = await listDirectorAccounts({ page, limit: ACCOUNTS_PAGE_SIZE })
      if (req !== accountsReq.current) return
      const items = res?.data ?? []
      const meta = res?.meta ?? {}
      setAccounts({
        items,
        page: meta.page ?? page,
        total: meta.total ?? items.length,
        totalPages: meta.totalPages ?? 1,
      })
    } catch (error) {
      if (req === accountsReq.current) setAccountsError(describeError(error))
    } finally {
      if (req === accountsReq.current) setAccountsLoading(false)
    }
  }, [canViewAccounts])

  // Count only: limit=1, we read the server-side total from the pagination metadata.
  const loadTodayCount = useCallback(async () => {
    if (!canViewTransactions) return
    try {
      const res = await listDirectorTransactions({ ...todayRange(), page: 1, limit: 1 })
      setTodayCount(res?.data?.pagination?.total ?? null)
    } catch {
      setTodayCount(null) // never show a guessed value
    }
  }, [canViewTransactions])

  const loadBlockedCount = useCallback(async () => {
    if (!canViewAccounts) return
    try {
      const res = await listDirectorAccounts({ status: 'BLOQUE', page: 1, limit: 1 })
      setBlockedCount(res?.meta?.total ?? null)
    } catch {
      setBlockedCount(null)
    }
  }, [canViewAccounts])

  useEffect(() => { loadPending(1); loadTodayCount() }, [loadPending, loadTodayCount])
  useEffect(() => { loadAccounts(1); loadBlockedCount() }, [loadAccounts, loadBlockedCount])

  /* ----- transaction decisions (dialog) ----- */

  const closeDialog = () => {
    setDialog(null)
    setReason('')
    setDialogError('')
  }

  const openDialog = (mode, item) => {
    setFeedback(null)
    setReason('')
    setDialogError('')
    setDialog({ mode, item })
  }

  const dialogKey = dialog ? `tx:${dialog.item.id}` : null
  const dialogBusy = dialogKey ? isBusy(dialogKey) : false

  useEffect(() => {
    if (!dialog || dialogBusy) return undefined
    const onKey = (event) => { if (event.key === 'Escape') closeDialog() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, dialogBusy])

  const submitDialog = async () => {
    if (!dialog) return
    const { mode, item } = dialog
    const trimmed = reason.trim()

    if (mode === 'reject' && (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX)) {
      setDialogError(`Le motif doit contenir entre ${REASON_MIN} et ${REASON_MAX} caractères.`)
      return
    }

    setDialogError('')
    await runExclusive(`tx:${item.id}`, async () => {
      try {
        if (mode === 'approve') await approveDirectorTransaction(item.id)
        else await rejectDirectorTransaction(item.id, trimmed)
      } catch (error) {
        const message = describeError(error)
        if (error?.status === 404 || error?.status === 409) {
          // The transaction changed on the server: close the dialog and resync.
          closeDialog()
          setFeedback({ type: 'error', message })
          loadPending(pending.page)
        } else {
          setDialogError(message)
        }
        return
      }

      // Reached only when the backend confirmed success.
      closeDialog()
      setFeedback({
        type: 'success',
        message: mode === 'approve'
          ? `Opération ${item.reference} approuvée.`
          : `Opération ${item.reference} refusée.`,
      })
      // Everything shown is re-read from the backend; nothing is computed locally.
      await Promise.all([
        loadPending(pending.page),
        loadTodayCount(),
        loadAccounts(accounts.page), // balances may have changed after an approval
        loadBlockedCount(),
      ])
    })
  }

  /* ----- account block / unblock ----- */

  const toggleAccount = async (account) => {
    const blocking = account.status === 'ACTIF'
    setFeedback(null)
    await runExclusive(`acc:${account.id}`, async () => {
      try {
        if (blocking) await blockDirectorAccount(account.id)
        else await unblockDirectorAccount(account.id)
      } catch (error) {
        setFeedback({ type: 'error', message: describeError(error) })
        if (error?.status === 404 || error?.status === 409) loadAccounts(accounts.page)
        return
      }

      setFeedback({
        type: 'success',
        message: blocking
          ? `Compte ${account.accountNumber} bloqué.`
          : `Compte ${account.accountNumber} réactivé.`,
      })
      // Refresh the affected account from the server.
      try {
        const res = await getDirectorAccount(account.id)
        const fresh = res?.data
        if (fresh?.id) {
          setAccounts((current) => ({
            ...current,
            items: current.items.map((row) => (row.id === fresh.id ? fresh : row)),
          }))
        } else {
          await loadAccounts(accounts.page)
        }
      } catch {
        await loadAccounts(accounts.page)
      }
      await loadBlockedCount()
    })
  }

  /* ----- render ----- */

  const kpiValue = (value) => (value === null || value === undefined ? '—' : value)
  const approving = dialog?.mode === 'approve'

  return <>
    <PageHeader title="Pilotage de l’agence" description="Validation des opérations importantes et contrôle des comptes." />

    {feedback && (
      <div className={`director-alert ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
        {feedback.message}
      </div>
    )}

    <section className="kpi-grid director-kpis">
      <article className="kpi">
        <div className="kpi-top">À valider <span className="kpi-icon amber"><ShieldCheck size={17} /></span></div>
        <strong>{kpiValue(pending.total)}</strong>
        <small>Opérations de montant élevé</small>
      </article>
      <article className="kpi">
        <div className="kpi-top">Opérations aujourd’hui <span className="kpi-icon blue"><ShieldCheck size={17} /></span></div>
        <strong>{kpiValue(todayCount)}</strong>
        <small>{todayCount === null ? 'Donnée indisponible' : 'Activité de l’agence'}</small>
      </article>
      <article className="kpi">
        <div className="kpi-top">Comptes bloqués <span className="kpi-icon mint"><LockKeyhole size={17} /></span></div>
        <strong>{kpiValue(blockedCount)}</strong>
        <small>Contrôle temporaire</small>
      </article>
    </section>

    <section className="card role-card">
      <div className="card-heading">
        <div>
          <h2>Opérations à approbation renforcée</h2>
          <p>Les opérations en attente sont soumises à la validation de la direction.</p>
        </div>
      </div>
      <div className="role-table-wrap">
        <table className="role-table">
          <thead>
            <tr>
              <th>Référence / client</th>
              <th>Type</th>
              <th>Date</th>
              <th>Montant</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {!canViewTransactions && (
              <tr><td colSpan={5} className="table-state">Vous n’avez pas accès à la liste des opérations.</td></tr>
            )}
            {canViewTransactions && pendingLoading && pending.items.length === 0 && !pendingError && (
              <tr><td colSpan={5} className="table-state">Chargement des opérations…</td></tr>
            )}
            {canViewTransactions && pendingError && (
              <tr>
                <td colSpan={5} className="table-state">
                  {pendingError}
                  <button type="button" className="text-action" onClick={() => loadPending(pending.page)}>Réessayer</button>
                </td>
              </tr>
            )}
            {canViewTransactions && !pendingLoading && !pendingError && pending.items.length === 0 && (
              <tr><td colSpan={5} className="table-state">Aucune opération en attente de validation.</td></tr>
            )}
            {canViewTransactions && pending.items.map((item) => {
              const busy = isBusy(`tx:${item.id}`)
              const initiator = personName(item.initiatedBy)
              return (
                <tr key={item.id}>
                  <td>
                    <b>{item.reference}</b>
                    <small>{accountsLabel(item)}</small>
                    {initiator && <small>Initiée par {initiator}</small>}
                  </td>
                  <td>{TYPE_LABELS[item.transactionType] ?? item.transactionType}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td className="amount-cell">{formatAmount(item.amount, item.currency)}</td>
                  <td>
                    {item.status !== 'PENDING'
                      ? <span className={`decision ${item.status === 'REJECTED' || item.status === 'FAILED' ? 'rejected' : 'approved'}`}>
                          {TX_STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      : (canApprove || canReject)
                        ? <div className="row-actions">
                            {canApprove && (
                              <button className="role-icon-button approve" aria-label={`Approuver ${item.reference}`}
                                disabled={busy} onClick={() => openDialog('approve', item)}>
                                <Check size={15} />
                              </button>
                            )}
                            {canReject && (
                              <button className="role-icon-button reject" aria-label={`Refuser ${item.reference}`}
                                disabled={busy} onClick={() => openDialog('reject', item)}>
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        : '—'
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={pending.page} totalPages={pending.totalPages} disabled={pendingLoading} onChange={loadPending} />
    </section>

    <section className="card role-card">
      <div className="card-heading">
        <div>
          <h2>État des comptes</h2>
          <p>Bloquez ou réactivez un compte bancaire.</p>
        </div>
      </div>
      <div className="role-table-wrap">
        <table className="role-table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Client</th>
              <th>Solde</th>
              <th>Statut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {!canViewAccounts && (
              <tr><td colSpan={5} className="table-state">Vous n’avez pas accès à la liste des comptes.</td></tr>
            )}
            {canViewAccounts && accountsLoading && accounts.items.length === 0 && !accountsError && (
              <tr><td colSpan={5} className="table-state">Chargement des comptes…</td></tr>
            )}
            {canViewAccounts && accountsError && (
              <tr>
                <td colSpan={5} className="table-state">
                  {accountsError}
                  <button type="button" className="text-action" onClick={() => loadAccounts(accounts.page)}>Réessayer</button>
                </td>
              </tr>
            )}
            {canViewAccounts && !accountsLoading && !accountsError && accounts.items.length === 0 && (
              <tr><td colSpan={5} className="table-state">Aucun compte à afficher.</td></tr>
            )}
            {canViewAccounts && accounts.items.map((account) => {
              const status = ACCOUNT_STATUS[account.status] ?? { label: account.status, className: 'closed' }
              const busy = isBusy(`acc:${account.id}`)
              const canAct = account.status === 'ACTIF' ? canBlock : account.status === 'BLOQUE' ? canUnblock : false
              return (
                <tr key={account.id}>
                  <td className="mono">{account.accountNumber}</td>
                  <td>{personName(account.customer) ?? '—'}</td>
                  <td className="amount-cell">{formatAmount(account.balance, account.currency)}</td>
                  <td><span className={`decision ${status.className}`}>{status.label}</span></td>
                  <td>
                    {account.status === 'FERME'
                      ? 'Fermé'
                      : canAct
                        ? <button className="text-action" disabled={busy} onClick={() => toggleAccount(account)}>
                            {account.status === 'BLOQUE'
                              ? <><UnlockKeyhole size={14} /> Réactiver</>
                              : <><LockKeyhole size={14} /> Bloquer</>
                            }
                          </button>
                        : '—'
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={accounts.page} totalPages={accounts.totalPages} disabled={accountsLoading} onChange={loadAccounts} />
    </section>

    {dialog && (
      <div
        className="director-modal-backdrop"
        onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) closeDialog() }}
      >
        <div className="director-modal" role="dialog" aria-modal="true" aria-labelledby="director-dialog-title">
          <h2 id="director-dialog-title">{approving ? 'Approuver l’opération' : 'Refuser l’opération'}</h2>
          <p>
            <b>{dialog.item.reference}</b> · {TYPE_LABELS[dialog.item.transactionType] ?? dialog.item.transactionType} · {formatAmount(dialog.item.amount, dialog.item.currency)}
            <br />
            {accountsLabel(dialog.item)}
          </p>

          {approving
            ? <p>L’opération sera exécutée par le serveur après vérification des conditions du compte et des fonds disponibles.</p>
            : <>
                <label htmlFor="director-reject-reason">Motif du refus</label>
                <textarea
                  id="director-reject-reason"
                  value={reason}
                  maxLength={REASON_MAX}
                  autoFocus
                  disabled={dialogBusy}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="director-modal-counter">{reason.length} / {REASON_MAX}</div>
              </>
          }

          {dialogError && <p className="form-error" role="alert">{dialogError}</p>}

          <div className="director-modal-actions">
            <button type="button" className="text-action" disabled={dialogBusy} onClick={closeDialog}>Annuler</button>
            <button
              type="button"
              className={`director-modal-confirm ${approving ? 'approve' : 'reject'}`}
              disabled={dialogBusy}
              onClick={submitDialog}
            >
              {dialogBusy ? 'Traitement…' : approving ? 'Confirmer l’approbation' : 'Confirmer le refus'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
}