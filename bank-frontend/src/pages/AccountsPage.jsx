import { useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Badge, Button, Empty } from '../components/ui.jsx'
import { formatDate } from '../lib/format.js'
import { accountStatusLabel, accountTypeLabel, getAccounts } from '../lib/accountApi.js'
import { customerFullName, customerInitials } from '../lib/customerApi.js'
import { formatAvailable, formatMoney, formatTotals, isNegative, sumByCurrency } from '../lib/money.js'
import { getErrorMessage } from '../lib/apiErrors.js'
import { useApiResource, useDebouncedValue } from '../lib/hooks.js'

const PAGE_SIZE = 10
const TYPE_BY_FILTER = { Tous: '', Courants: 'COURANT', Épargne: 'EPARGNE' }

export default function AccountsPage({ query, setQuery, filter, setFilter, navigate, can }) {
  const [statusFilter, setStatusFilter] = useState('')

  // The backend search matches the ACCOUNT NUMBER only. Max length accepted: 50.
  const search = useDebouncedValue(query.trim().slice(0, 50), 350)
  const accountType = TYPE_BY_FILTER[filter] ?? ''

  const filterKey = `${search}|${accountType}|${statusFilter}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const goToPage = (next) => setPageState({ key: filterKey, page: next })

  const { data, error, loading, reload } = useApiResource(
    () => getAccounts({ page, limit: PAGE_SIZE, search, accountType, status: statusFilter }),
    [page, search, accountType, statusFilter],
  )

  const accounts = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const totalPages = Math.max(1, data?.meta?.totalPages ?? 1)
  const hasFilters = Boolean(search || accountType || statusFilter)

  const resetFilters = () => {
    setQuery('')
    setFilter('Tous')
    setStatusFilter('')
  }

  const description = loading && !data
    ? 'Chargement des comptes…'
    : `${total} compte${total > 1 ? 's' : ''} ${hasFilters ? 'correspondant aux critères' : 'dans votre agence'}`

  return <>
    <PageHeader
      title="Comptes bancaires"
      description={description}
      action={can('ACCOUNTS_CREATE') && <Button onClick={() => navigate('/comptes/new')}><Plus /> Ouvrir un compte</Button>}
    />
    <section className="card list-card">
      <div className="toolbar">
        <label className="search-box"><Search /><input placeholder="N° de compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="segmented">
          {Object.keys(TYPE_BY_FILTER).map((x) => (
            <button type="button" className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>
          ))}
        </div>
        <select className="select-control" aria-label="Statut du compte" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="ACTIF">Actif</option>
          <option value="BLOQUE">Bloqué</option>
          <option value="FERME">Fermé</option>
        </select>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          {getErrorMessage(error)} <Button variant="outline" onClick={reload}>Réessayer</Button>
        </div>
      )}

      {!error && loading && !data && <Empty title="Chargement…" text="Récupération des comptes depuis le serveur." />}

      {!error && data && (accounts.length ? (
        <div className="table-scroll" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr><th>N° COMPTE</th><th>TITULAIRE</th><th>TYPE</th><th>STATUT</th><th className="align-right">SOLDE</th><th className="align-right">DISPONIBLE</th><th>OUVERT LE</th><th /></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="clickable-row" onClick={() => navigate(`/comptes/${a.id}`)}>
                  <td className="mono account-num">
                    {a.accountNumber}
                    <button type="button" className="copy" aria-label="Copier le numéro" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(a.accountNumber); toast.success('Numéro copié') }}><Copy /></button>
                  </td>
                  <td>
                    <div className="person">
                      <span className="avatar tiny-avatar">{customerInitials(a.customer)}</span>
                      <b>{customerFullName(a.customer) || '—'}</b>
                    </div>
                  </td>
                  <td><Badge type={a.accountType === 'COURANT' ? 'courant' : 'epargne'}>{accountTypeLabel(a.accountType)}</Badge></td>
                  <td><Badge type={a.status.toLowerCase()}>{accountStatusLabel(a.status)}</Badge></td>
                  <td className={`align-right amount ${isNegative(a.balance) ? 'negative' : ''}`}>{formatMoney(a.balance, a.currency)}</td>
                  <td className="align-right amount">{formatAvailable(a)}</td>
                  <td>{formatDate(a.createdAt)}</td>
                  <td><ChevronRight size={16} aria-hidden="true" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Aucun compte trouvé"
          text={hasFilters ? 'Essayez avec un autre numéro de compte ou filtre.' : 'Aucun compte n’est encore ouvert.'}
          action={hasFilters ? <Button variant="outline" onClick={resetFilters}>Effacer les filtres</Button> : null}
        />
      ))}

      <div className="table-footer">
        <span>Solde total affiché <b>{formatTotals(sumByCurrency(accounts))}</b></span>
        <div className="pagination">
          <Button variant="outline" aria-label="Page précédente" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}><ChevronLeft /></Button>
          <span className="page-current">{page} / {totalPages}</span>
          <Button variant="outline" aria-label="Page suivante" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)}><ChevronRight /></Button>
        </div>
      </div>
    </section>
  </>
}