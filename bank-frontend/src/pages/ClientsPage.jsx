import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { PageHeader, Badge, Button, Empty } from '../components/ui.jsx'
import { formatDate } from '../lib/format.js'
import { CUSTOMER_TYPES, customerFullName, customerInitials, customerTypeLabel, getCustomers } from '../lib/customerApi.js'
import { getErrorMessage } from '../lib/apiErrors.js'
import { useApiResource, useDebouncedValue } from '../lib/hooks.js'

const PAGE_SIZE = 10

export default function ClientsPage({ query, setQuery, navigate, can }) {
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Backend search (debounced). Max length accepted by the backend: 100.
  const search = useDebouncedValue(query.trim().slice(0, 100), 350)

  // The page number belongs to a set of filters: when they change, the page falls back to 1
  // without firing an extra request with a stale page.
  const filterKey = `${search}|${typeFilter}|${statusFilter}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const goToPage = (next) => setPageState({ key: filterKey, page: next })

  const { data, error, loading, reload } = useApiResource(
    () => getCustomers({
      page,
      limit: PAGE_SIZE,
      search,
      customerType: typeFilter,
      isActive: statusFilter === '' ? undefined : statusFilter === 'active',
    }),
    [page, search, typeFilter, statusFilter],
  )

  const customers = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const totalPages = Math.max(1, data?.meta?.totalPages ?? 1)
  const hasFilters = Boolean(search || typeFilter || statusFilter)

  const resetFilters = () => {
    setQuery('')
    setTypeFilter('')
    setStatusFilter('')
  }

  const description = loading && !data
    ? 'Chargement des clients…'
    : `${total} client${total > 1 ? 's' : ''} ${hasFilters ? 'correspondant aux critères' : 'enregistrés dans votre agence'}`

  return <>
    <PageHeader
      title="Clients"
      description={description}
      action={can('CUSTOMERS_CREATE') && <Button onClick={() => navigate('/clients/new')}><Plus /> Nouveau client</Button>}
    />
    <section className="card list-card">
      <div className="toolbar">
        <label className="search-box"><Search /><input placeholder="Nom, email, téléphone ou identifiant…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <select className="select-control" aria-label="Type de client" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Tous les types</option>
          {CUSTOMER_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
        <select className="select-control" aria-label="Statut du client" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </select>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          {getErrorMessage(error)} <Button variant="outline" onClick={reload}>Réessayer</Button>
        </div>
      )}

      {!error && loading && !data && <Empty title="Chargement…" text="Récupération des clients depuis le serveur." />}

      {!error && data && (customers.length ? (
        <div className="table-scroll" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr><th>CLIENT</th><th>IDENTIFIANT</th><th>TÉLÉPHONE</th><th>TYPE</th><th>STATUT</th><th>CRÉÉ LE</th><th /></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="clickable-row">
                  <td>
                    <div className="person">
                      <span className="avatar small-avatar">{customerInitials(c)}</span>
                      <span><b>{customerFullName(c)}</b><small>{c.email || 'Email non renseigné'}</small></span>
                    </div>
                  </td>
                  <td className="mono">{c.nationalId}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{customerTypeLabel(c.customerType)}</td>
                  <td><Badge type={c.isActive ? 'actif' : 'ferme'}>{c.isActive ? 'Actif' : 'Désactivé'}</Badge></td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td><ChevronRight size={16} aria-hidden="true" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Aucun client trouvé"
          text={hasFilters ? 'Essayez avec un autre nom, identifiant ou filtre.' : 'Aucun client n’est encore enregistré.'}
          action={hasFilters ? <Button variant="outline" onClick={resetFilters}>Effacer la recherche</Button> : null}
        />
      ))}

      <div className="table-footer">
        <span>Affichage de <b>{customers.length}</b> sur <b>{total}</b> clients</span>
        <div className="pagination">
          <Button variant="outline" aria-label="Page précédente" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}><ChevronLeft /></Button>
          <span className="page-current">{page} / {totalPages}</span>
          <Button variant="outline" aria-label="Page suivante" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)}><ChevronRight /></Button>
        </div>
      </div>
    </section>
  </>
}