import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Wallet } from 'lucide-react'
import { PageHeader, Badge, Button, Empty } from '../components/ui.jsx'
import { formatDate } from '../lib/format.js'
import { customerFullName, customerTypeLabel, getCustomer, toDateInput } from '../lib/customerApi.js'
import { accountStatusLabel, accountTypeLabel } from '../lib/accountApi.js'
import { formatMoney, formatTotals, sumByCurrency } from '../lib/money.js'
import { getErrorMessage } from '../lib/apiErrors.js'
import { useApiResource } from '../lib/hooks.js'

export default function ClientDetail({ id, navigate, can }) {
  const { data: customer, error, loading, reload } = useApiResource(() => getCustomer(id), [id])

  if (error) {
    return <>
      <PageHeader title="Fiche client" description="" />
      <div className="inline-error" role="alert">
        {getErrorMessage(error)}{' '}
        <Button variant="outline" onClick={reload}>Réessayer</Button>{' '}
        <Button variant="outline" onClick={() => navigate('/clients')}>Retour aux clients</Button>
      </div>
    </>
  }

  if (loading && !customer) {
    return <>
      <PageHeader title="Fiche client" description="Chargement…" />
      <Empty title="Chargement…" text="Récupération de la fiche client." />
    </>
  }

  if (!customer) return null

  const accounts = customer.accounts ?? []
  const totals = sumByCurrency(accounts, { excludeClosed: true })
  const canOpenAccount = can('ACCOUNTS_CREATE') && customer.isActive
  const openAccount = () => navigate(`/comptes/new?client=${customer.id}`)
  const birth = toDateInput(customer.dateOfBirth)

  return <>
    <PageHeader
      title={customerFullName(customer)}
      description={<span className="mono">{customer.nationalId}</span>}
      action={<>
        {can('CUSTOMERS_UPDATE') && <Button variant="outline" onClick={() => navigate(`/clients/${customer.id}/edit`)}>Modifier</Button>}
        {canOpenAccount && <Button onClick={openAccount}><Plus /> Ouvrir un compte</Button>}
      </>}
    />
    <div className="detail-grid">
      <section className="card detail-card">
        <h2>Informations personnelles</h2>
        <dl>
          <dt>Email</dt><dd>{customer.email || 'Non renseigné'}</dd>
          <dt>Téléphone</dt><dd>{customer.phone || 'Non renseigné'}</dd>
          <dt>Adresse</dt><dd>{customer.address || 'Non renseignée'}</dd>
          <dt>Date de naissance</dt><dd>{birth ? formatDate(new Date(`${birth}T00:00:00`)) : 'Non renseignée'}</dd>
          <dt>Pièce d’identité</dt><dd className="mono">{customer.nationalId}</dd>
          <dt>Type</dt><dd>{customerTypeLabel(customer.customerType)}</dd>
          <dt>Statut</dt><dd><Badge type={customer.isActive ? 'actif' : 'ferme'}>{customer.isActive ? 'Actif' : 'Désactivé'}</Badge></dd>
          <dt>Créé le</dt><dd>{formatDate(customer.createdAt)}</dd>
        </dl>
      </section>

      <section className="card detail-card">
        <div className="card-heading">
          <h2>Comptes bancaires</h2>
          <Badge>{accounts.length} compte{accounts.length !== 1 ? 's' : ''}</Badge>
        </div>
        {accounts.length > 0 && <p className="fee-note">Solde total (comptes non fermés) : <b>{formatTotals(totals)}</b></p>}
        {accounts.length ? accounts.map((a) => (
          <Link className="account-row" key={a.id} to={`/comptes/${a.id}`}>
            <span className="quick-icon green-bg"><Wallet /></span>
            <span><b>{a.accountNumber}</b><small>{accountTypeLabel(a.accountType)} · {accountStatusLabel(a.status)}</small></span>
            <strong>{formatMoney(a.balance, a.currency)}</strong>
            <ChevronRight />
          </Link>
        )) : (
          <Empty
            title="Aucun compte"
            text="Ce client n’a pas encore de compte."
            action={canOpenAccount ? <Button onClick={openAccount}>Ouvrir un compte</Button> : null}
          />
        )}
      </section>
    </div>
  </>
}