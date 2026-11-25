import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Wallet, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button } from '../components/ui.jsx'
import AccountCombobox from '../components/AccountCombobox.jsx'
import {
  fetchActiveAccountsPage,
  fetchAccountById,
  resolveAccountParam,
  ACCOUNTS_PAGE_SIZE,
  createDeposit,
  createWithdrawal,
  createTransfer,
  newIdempotencyKey,
  describeApiError,
  getErrorCode,
  getErrorStatus,
  isAuthError,
  clientError,
} from '../lib/transactionApi.js'
import { parseAmountInput, formatDecimal, currencySymbol } from '../lib/decimal.js'

const TYPES = [
  ['DEPOT', 'Dépôt'],
  ['RETRAIT', 'Retrait'],
  ['VIREMENT', 'Virement'],
]
const VALID_TYPES = TYPES.map(([k]) => k)
const NOUN = { DEPOT: 'Dépôt', RETRAIT: 'Retrait', VIREMENT: 'Virement' }
const ACTION = { DEPOT: 'le dépôt', RETRAIT: 'le retrait', VIREMENT: 'le virement' }
const QUICK_AMOUNTS = {
  DZD: ['1000', '5000', '10000', '50000'],
  EUR: ['20', '50', '100', '200'],
  USD: ['20', '50', '100', '200'],
}

const customerName = (a) =>
  `${a?.customer?.firstName ?? ''} ${a?.customer?.lastName ?? ''}`.trim() || 'Client inconnu'

const isActiveAccount = (a) => a?.status === 'ACTIF'

const mergeById = (prev, next) => {
  const seen = new Set(prev.map((a) => a.id))
  return [...prev, ...next.filter((a) => !seen.has(a.id))]
}

// Fresh server data wins, but a detail response without customer data must not erase a known name.
const mergeAccount = (prev, fresh) => ({
  ...(prev ?? {}),
  ...fresh,
  customer: fresh.customer ?? prev?.customer,
})

export default function OperationPage({ searchParams, setSearchParams }) {
  const initialType = searchParams.get('type')
  const [type, setType] = useState(VALID_TYPES.includes(initialType) ? initialType : 'DEPOT')

  // Accounts: current list (browse or server-side search results) + paging info.
  const [accounts, setAccounts] = useState([])
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 })
  const [accountsStatus, setAccountsStatus] = useState('loading') // loading | ready | error
  const [accountsError, setAccountsError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('') // what the user types (driven by the comboboxes)
  const [appliedSearch, setAppliedSearch] = useState('') // debounced value sent to the server

  // Latest server data for every account seen (by UUID). It is state, not a ref, so a refresh
  // that reveals a BLOQUE / FERME account immediately updates the UI and blocks submission.
  const [known, setKnown] = useState({})
  const [notice, setNotice] = useState('')
  const [loadedOnce, setLoadedOnce] = useState(false) // first accounts request finished
  const [baseTotal, setBaseTotal] = useState(null) // number of active accounts WITHOUT a search filter

  const [account, setAccount] = useState('') // UUID: account to credit / debit / transfer source
  const [dest, setDest] = useState('') // UUID: transfer destination
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null)

  const aliveRef = useRef(true)
  const submittingRef = useRef(false)
  const requestRef = useRef(0) // ignores stale account-list responses
  const refreshSeqRef = useRef({}) // per-account: ignores stale detail responses
  const userPickedRef = useRef(false) // the user chose an account: ?compte= must not override it
  // One key per submission: reused only when retrying the SAME request.
  const idemRef = useRef({ fingerprint: null, key: null })

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const rememberAccounts = useCallback((list) => {
    setKnown((prev) => {
      const next = { ...prev }
      for (const a of list) next[a.id] = mergeAccount(prev[a.id], a)
      return next
    })
  }, [])

  const forgetAccount = useCallback((id) => {
    setKnown((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Never rejects: every error is caught and shown in the UI, so calling it from an effect
  // cannot create an unhandled Promise rejection.
  const fetchAccounts = useCallback(
    async (searchTerm, page, append) => {
      const requestId = ++requestRef.current
      if (append) setLoadingMore(true)
      else setAccountsStatus('loading')
      setAccountsError('')
      try {
        const res = await fetchActiveAccountsPage({ page, limit: ACCOUNTS_PAGE_SIZE, search: searchTerm })
        if (!aliveRef.current || requestId !== requestRef.current) return
        rememberAccounts(res.accounts)
        setAccounts((prev) => (append ? mergeById(prev, res.accounts) : res.accounts))
        setMeta({ page: res.page, totalPages: res.totalPages, total: res.total })
        if (!searchTerm) setBaseTotal(res.total)
        setLoadedOnce(true)
        setAccountsStatus('ready')
      } catch (e) {
        setLoadedOnce(true)
        if (!aliveRef.current || requestId !== requestRef.current) return
        setAccountsError(describeApiError(e, 'Impossible de charger les comptes.'))
        setAccountsStatus(append ? 'ready' : 'error')
      } finally {
        if (aliveRef.current && requestId === requestRef.current) setLoadingMore(false)
      }
    },
    [rememberAccounts]
  )

  // Re-reads one account from the server (GET /accounts/:id) and stores the result.
  // Never throws. Resolves to { account } | { missing: true } | { error } | { stale: true }.
  const refreshAccount = useCallback(
    async (id) => {
      const seq = (refreshSeqRef.current[id] = (refreshSeqRef.current[id] ?? 0) + 1)
      try {
        const fresh = await fetchAccountById(id)
        if (!aliveRef.current) return { stale: true }
        if (refreshSeqRef.current[id] === seq) rememberAccounts([fresh])
        return { account: fresh }
      } catch (e) {
        if (getErrorStatus(e) === 404) {
          if (aliveRef.current && refreshSeqRef.current[id] === seq) forgetAccount(id)
          return { missing: true }
        }
        return { error: e }
      }
    },
    [rememberAccounts, forgetAccount]
  )

  // Debounce the server-side search.
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  // Initial load, and reload on every new search term.
  useEffect(() => {
    fetchAccounts(appliedSearch, 1, false)
  }, [appliedSearch, fetchAccounts])

  // ?compte= : a UUID is resolved with GET /accounts/:id, an account number with the
  // server-side account-number search (exact match).
  const compteParam = searchParams.get('compte')
  useEffect(() => {
    if (!compteParam) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const r = await resolveAccountParam(compteParam)
        if (cancelled || !aliveRef.current) return
        if (r.account) {
          rememberAccounts([r.account])
          if (!userPickedRef.current) setAccount(r.account.id)
        } else if (r.reason === 'INACTIVE') {
          setNotice(`Le compte demandé n’est pas actif (${r.status}). Il ne peut pas être utilisé.`)
        } else {
          setNotice('Le compte demandé est introuvable parmi les comptes actifs.')
        }
      } catch (e) {
        if (!cancelled && aliveRef.current) {
          setNotice(describeApiError(e, 'Impossible de charger le compte demandé.'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [compteParam, rememberAccounts])

  // Selectable accounts: the loaded list with the freshest known data, ACTIF only.
  const selectable = useMemo(
    () => accounts.map((a) => known[a.id] ?? a).filter(isActiveAccount),
    [accounts, known]
  )

  // Default / repaired source account: keep the current one only while it is known AND ACTIF.
  useEffect(() => {
    setAccount((cur) => (isActiveAccount(known[cur]) ? cur : selectable[0]?.id ?? ''))
  }, [selectable, known])

  const active = known[account] ?? null
  const activeCurrency = active?.currency
  const quickAmounts = QUICK_AMOUNTS[activeCurrency] ?? QUICK_AMOUNTS.DZD

  const quickAmountFormatter = new Intl.NumberFormat(activeCurrency === 'EUR' ? 'fr-FR' : 'fr-DZ', {
    maximumFractionDigits: 0,
  })

  // Default / repaired destination: first other account with the same currency, else first other.
  useEffect(() => {
    setDest((cur) => {
      if (cur && cur !== account && isActiveAccount(known[cur])) return cur
      const others = selectable.filter((a) => a.id !== account)
      const sameCurrency = others.find((a) => a.currency === activeCurrency)
      return (sameCurrency ?? others[0])?.id ?? ''
    })
  }, [selectable, known, account, activeCurrency])

  const destination = known[dest] ?? null

  // Whenever a selection changes, re-read the selected account(s) from the server so balance
  // and status are current, and tell the user if a selected account is no longer usable.
  useEffect(() => {
    const ids = [account, type === 'VIREMENT' ? dest : ''].filter(Boolean)
    ids.forEach(async (id) => {
      const r = await refreshAccount(id)
      if (!aliveRef.current) return
      if (r.missing) {
        setNotice('Un compte sélectionné est introuvable. La sélection a été mise à jour.')
      } else if (r.account && !isActiveAccount(r.account)) {
        setNotice(
          `Le compte ${r.account.accountNumber} n’est plus actif (${r.account.status}). La sélection a été mise à jour.`
        )
      }
      // Other errors are ignored here: the backend remains the final authority at submission.
    })
  }, [account, dest, type, refreshAccount])

  const amountValue = parseAmountInput(amount) // "1250.50" string or null
  const amountInvalid = amount.trim() !== '' && !amountValue
  const currencyMismatch =
    type === 'VIREMENT' && !!active && !!destination && active.currency !== destination.currency
  const searching = appliedSearch !== ''
  const transferNeedsTwo =
    type === 'VIREMENT' && !searching && accountsStatus === 'ready' && meta.total < 2
  const canSubmit =
    !submitting &&
    isActiveAccount(active) &&
    !!amountValue &&
    (type !== 'VIREMENT' ||
      (isActiveAccount(destination) && destination.id !== active.id && !currencyMismatch))

  const submit = async () => {
    if (submittingRef.current || !canSubmit) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

    try {
      // 1) Re-read the account(s) from the server right before submitting. A known account that is
      //    no longer ACTIF (or no longer exists) must never be submitted. If the refresh itself
      //    fails (network, 401...), we continue: the backend re-validates everything anyway.
      const ids = type === 'VIREMENT' ? [active.id, destination.id] : [active.id]
      const checks = await Promise.all(ids.map((id) => refreshAccount(id)))
      if (!aliveRef.current) return

      let problem = ''
      for (const c of checks) {
        if (c.missing) {
          problem = 'Un des comptes est introuvable. Actualisez la liste des comptes puis réessayez.'
          break
        }
        if (c.account && !isActiveAccount(c.account)) {
          problem = `Le compte ${c.account.accountNumber} n’est plus actif (${c.account.status}). Opération annulée.`
          break
        }
      }
      if (!problem && type === 'VIREMENT') {
        const [src, dst] = checks
        if (src.account && dst.account && src.account.currency !== dst.account.currency) {
          problem = 'Le virement est impossible : les deux comptes n’ont pas la même devise.'
        }
      }
      if (problem) {
        setSubmitError(problem)
        toast.error(problem)
        return
      }

      // 2) Build the exact payload and the per-submission idempotency key.
      const desc = description.trim()
      const payload =
        type === 'VIREMENT'
          ? { sourceAccountId: active.id, destinationAccountId: destination.id, amount: amountValue }
          : { accountId: active.id, amount: amountValue }
      if (desc) payload.description = desc

      const fingerprint = JSON.stringify([type, payload])
      if (idemRef.current.fingerprint !== fingerprint) {
        idemRef.current = { fingerprint, key: newIdempotencyKey() }
      }

      // 3) Send.
      const create =
        type === 'DEPOT' ? createDeposit : type === 'RETRAIT' ? createWithdrawal : createTransfer
      const res = await create(payload, idemRef.current.key)
      const tx = res?.data?.transaction
      if (!tx) {
        // The request may have been processed: keep the idempotency key for a safe retry.
        throw clientError('Réponse inattendue du serveur. Consultez l’historique avant de recommencer.')
      }

      idemRef.current = { fingerprint: null, key: null }
      const changes = res?.data?.accounts ?? []
      const replayed = !!res?.data?.replayed

      if (tx.status === 'PENDING') {
        setDone({ kind: 'pending', tx, changes: [], replayed })
        toast.success('Opération transmise à la direction pour approbation.')
      } else if (tx.status === 'COMPLETED') {
        setDone({ kind: 'completed', tx, changes, replayed })
        toast.success(`${NOUN[type]} effectué avec succès.`)
        fetchAccounts(appliedSearch, 1, false) // balances shown must come from the server
        ids.forEach((id) => refreshAccount(id))
      } else {
        setDone({ kind: 'unexpected', tx, changes: [], replayed })
        toast.warning('Statut inattendu renvoyé par le serveur.')
      }
    } catch (e) {
      if (getErrorCode(e) === 'IDEMPOTENCY_KEY_REUSED') {
        idemRef.current = { fingerprint: null, key: null }
      }
      const message = describeApiError(e, 'L’opération a échoué.')
      if (aliveRef.current) setSubmitError(message)
      // 401: shown inline only, NOT rethrown (a rethrow inside an async handler is an unhandled
      // rejection). Session expiry handling belongs to the existing auth layer, see notes.
      // The idempotency key is kept, so retrying after re-login cannot duplicate the operation.
      if (!isAuthError(e)) toast.error(message)
    } finally {
      submittingRef.current = false
      if (aliveRef.current) setSubmitting(false)
    }
  }

  const startNew = () => {
    setDone(null)
    setAmount('')
    setDescription('')
    setSubmitError('')
    setNotice('')
    idemRef.current = { fingerprint: null, key: null }
    fetchAccounts(appliedSearch, 1, false)
    ;[account, type === 'VIREMENT' ? dest : ''].filter(Boolean).forEach((id) => refreshAccount(id))
  }

  if (done) {
    const { kind, tx, changes, replayed } = done
    const title =
      kind === 'pending'
        ? 'Approbation requise'
        : kind === 'completed'
          ? 'Opération enregistrée'
          : 'Statut inattendu'
    const subtitle =
      kind === 'pending'
        ? 'Le directeur doit valider cette opération avant son exécution.'
        : kind === 'completed'
          ? 'Le mouvement a été ajouté à l’historique.'
          : 'Le serveur a renvoyé un statut que cette page ne sait pas interpréter.'
    return (
      <>
        <PageHeader title={title} description={subtitle} />
        <section className="card success-state">
          <div className="success-check">
            <Check />
          </div>
          <h2>{kind === 'pending' ? 'Opération en attente' : title}</h2>
          <p>
            Référence <span className="mono">{tx.reference}</span>
            {kind === 'pending' && (
              <>
                {' '}
                · Montant supérieur ou égal au seuil d’approbation. Le solde du compte n’a pas encore
                changé.
              </>
            )}
            {kind === 'completed' &&
              changes.length > 0 &&
              changes.map((c) => (
                <span key={c.id}>
                  {' '}
                  · Nouveau solde {c.accountNumber} : <b>{formatDecimal(c.balance, tx.currency)}</b>
                </span>
              ))}
            {kind === 'completed' && changes.length === 0 && replayed && (
              <> · Cette demande avait déjà été traitée.</>
            )}
            {kind === 'unexpected' && (
              <> · Statut renvoyé : {tx.status}. Consultez l’historique avant de recommencer.</>
            )}
          </p>
          <div>
            <Button onClick={startNew}>Nouvelle opération</Button>
          </div>
        </section>
      </>
    )
  }

  const header = (
    <>
      <PageHeader title="Nouvelle opération" description="Effectuez un mouvement sur un compte bancaire." />
      <div className="op-tabs">
        {TYPES.map(([k, v]) => (
          <button
            key={k}
            className={type === k ? 'active' : ''}
            onClick={() => {
              setType(k)
              setSubmitError('')
              setSearchParams({ type: k })
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </>
  )

  if (!loadedOnce && accountsStatus === 'loading') {
    return (
      <>
        {header}
        <section className="card operation-form">
          <p>Chargement des comptes…</p>
        </section>
      </>
    )
  }

  if (accountsStatus === 'ready' && baseTotal === 0) {
    return (
      <>
        {header}
        <section className="card operation-form">
          <div className="inline-error">{accountsError}</div>
          <Button onClick={() => fetchAccounts(appliedSearch, 1, false)}>Réessayer</Button>
        </section>
      </>
    )
  }

  if (accountsStatus === 'ready' && accounts.length === 0 && meta.total === 0 && !searching) {
    return (
      <>
        {header}
        <section className="card operation-form">
          <p>Aucun compte actif disponible pour effectuer une opération.</p>
        </section>
      </>
    )
  }

  const accountOption = (a, withBalance) => ({
    value: a.id,
    label: `${a.accountNumber} — ${customerName(a)}${
      withBalance ? ` · ${formatDecimal(a.balance, a.currency)}` : ` · ${a.currency}`
    }`,
    title: a.accountNumber,
    subtitle: `${customerName(a)} · ${withBalance ? formatDecimal(a.balance, a.currency) : a.currency}`,
    searchText: `${a.accountNumber} ${customerName(a)}`,
  })

  // Keeps the currently selected (still ACTIF) accounts selectable even when the loaded list
  // no longer contains them (new search, ?compte= lookup...).
  const withSelected = (list, ids) => {
    const seen = new Set(list.map((a) => a.id))
    const extra = ids
      .filter((id) => id && !seen.has(id))
      .map((id) => known[id])
      .filter(isActiveAccount)
    return [...extra, ...list]
  }

  const sourceOptions = withSelected(selectable, [account]).map((a) => accountOption(a, true))
  const destinationOptions = withSelected(
    selectable.filter((a) => a.id !== account),
    [dest]
  )
    .filter((a) => a.id !== account)
    .map((a) => accountOption(a, false))

  const hasMore = meta.page < meta.totalPages
  const searchPending = accountsStatus === 'loading' || search.trim() !== appliedSearch

  return (
    <>
      {header}
      <div className="operation-layout">
        <section className="card operation-form">
          <h2>Détails de l’opération</h2>
          <p className="form-sub">Renseignez les informations du mouvement.</p>
          <p className="approval-hint">
            Les opérations dont le montant atteint le seuil d’approbation configuré nécessitent la
            validation du directeur d’agence.
          </p>
          {notice && <div className="inline-error">{notice}</div>}
          {accountsError && (
            <div className="inline-error">
              {accountsError}{' '}
              <Button variant="outline" onClick={() => fetchAccounts(appliedSearch, 1, false)}>
                Réessayer
              </Button>
            </div>
          )}

          <AccountCombobox
            label={
              type === 'DEPOT' ? 'Compte à créditer' : type === 'RETRAIT' ? 'Compte à débiter' : 'Compte source'
            }
            value={account}
            options={sourceOptions}
            searching={searchPending}
            total={meta.total}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => fetchAccounts(appliedSearch, meta.page + 1, true)}
            onQueryChange={setSearch}
            onChange={(v) => {
              userPickedRef.current = true
              setNotice('')
              setAccount(v)
              setSubmitError('')
            }}
          />

          {type === 'VIREMENT' && (
            <AccountCombobox
              label="Compte destination"
              value={dest}
              options={destinationOptions}
              searching={searchPending}
              total={meta.total}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={() => fetchAccounts(appliedSearch, meta.page + 1, true)}
              onQueryChange={setSearch}
              onChange={(v) => {
                setNotice('')
                setDest(v)
                setSubmitError('')
              }}
            />
          )}

          <label className="field-label">Montant</label>
          <div className="amount-input">
            <input
              placeholder="0,00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setSubmitError('')
              }}
            />
            <span>{currencySymbol(active?.currency ?? 'DZD')}</span>
          </div>
          <div className="chips">
            {quickAmounts.map((x) => (
              <button
                key={`${activeCurrency}-${x}`}
                type="button"
                onClick={() => {
                  setAmount(x)
                  setSubmitError('')
                }}
              >
                {quickAmountFormatter.format(Number(x))} {currencySymbol(activeCurrency ?? 'DZD')}
              </button>
            ))}
          </div>

          <label className="field-label">
            Description <span className="optional">Facultatif</span>
          </label>
          <input
            className="field-control"
            maxLength={150}
            placeholder="Ex. Versement mensuel"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <small className="char-count">{description.length}/150 caractères</small>

          {amountInvalid && (
            <div className="inline-error">
              Montant invalide : saisissez un nombre positif avec au plus deux décimales.
            </div>
          )}
          {transferNeedsTwo && (
            <div className="inline-error">Un virement nécessite au moins deux comptes actifs.</div>
          )}
          {currencyMismatch && (
            <div className="inline-error">
              Devises différentes : le compte source est en {active.currency} et le compte destination
              en {destination.currency}. Un virement entre devises est impossible.
            </div>
          )}
          {submitError && <div className="inline-error">{submitError}</div>}

          <Button className="new-op submit-op" disabled={!canSubmit} onClick={submit}>
            {submitting ? (
              'Envoi en cours…'
            ) : (
              <>
                Valider {ACTION[type]}
                <ArrowRight size={17} />
              </>
            )}
          </Button>
        </section>

        <aside className="card summary-card">
          <h2>Récapitulatif</h2>
          <p>Vérifiez les détails avant validation.</p>
          <div className="summary-account">
            <span className="quick-icon green-bg">
              <Wallet />
            </span>
            <span>
              <b>{active?.accountNumber ?? '—'}</b>
              <small>{active ? customerName(active) : ''}</small>
            </span>
          </div>
          <div className="summary-lines">
            <span>
              Solde actuel <b>{active ? formatDecimal(active.balance, active.currency) : '—'}</b>
            </span>
            <span>
              Montant <b>{amountValue ? formatDecimal(amountValue, active?.currency) : '—'}</b>
            </span>
            {type === 'VIREMENT' && (
              <span>
                Compte destinataire <b>{destination?.accountNumber ?? '—'}</b>
              </span>
            )}
          </div>
          <small className="fee-note">
            Les frais éventuels et le solde final sont déterminés par le serveur lors de l’exécution.
          </small>
        </aside>
      </div>
    </>
  )
}