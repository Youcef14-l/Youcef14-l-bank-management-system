import { Link } from 'react-router-dom'
import { PageHeader, Badge, Button, Empty } from '../components/ui.jsx'
import { formatDate, formatDateTime } from '../lib/format.js'
import { accountStatusLabel, accountTypeLabel, getAccount } from '../lib/accountApi.js'
import { customerFullName } from '../lib/customerApi.js'
import { formatAvailable, formatMoney } from '../lib/money.js'
import { getErrorMessage } from '../lib/apiErrors.js'
import { useApiResource } from '../lib/hooks.js'

export default function AccountDetail({ id, navigate }) {
  const { data: account, error, loading, reload } = useApiResource(() => getAccount(id), [id])

  if (error) {
    return <>
      <PageHeader title="Détail du compte" description="" />
      <div className="inline-error" role="alert">
        {getErrorMessage(error)}{' '}
        <Button variant="outline" onClick={reload}>Réessayer</Button>{' '}
        <Button variant="outline" onClick={() => navigate('/comptes')}>Retour aux comptes</Button>
      </div>
    </>
  }

  if (loading && !account) {
    return <>
      <PageHeader title="Détail du compte" description="Chargement…" />
      <Empty title="Chargement…" text="Récupération du compte." />
    </>
  }

  if (!account) return null

  const holder = account.customer
  const isSavings = account.accountType === 'EPARGNE'

  return <>
    <PageHeader
      title={account.accountNumber}
      description={<>{accountTypeLabel(account.accountType)} · Titulaire {holder
        ? <Link className="text-link" to={`/clients/${holder.id}`}>{customerFullName(holder)}</Link>
        : '—'}</>}
    />

    <section className="card balance-detail">
      <div>
        <span>Solde du compte</span>
        <strong>{formatMoney(account.balance, account.currency)}</strong>
        <small>Solde disponible · {formatAvailable(account)}</small>
        {isSavings
          ? <small>Taux annuel {String(Number(account.interestRate))} % · Solde minimum {formatMoney(account.minimumBalance, account.currency)}</small>
          : <small>Découvert autorisé · {formatMoney(account.overdraftLimit, account.currency)}</small>}
      </div>
      <Badge type={account.status.toLowerCase()}>{accountStatusLabel(account.status)}</Badge>
    </section>

    <section className="card detail-card">
      <h2>Informations du compte</h2>
      <dl>
        <dt>Numéro de compte</dt><dd className="mono">{account.accountNumber}</dd>
        <dt>Type</dt><dd>{accountTypeLabel(account.accountType)}</dd>
        <dt>Devise</dt><dd>{account.currency}</dd>
        <dt>Titulaire</dt><dd>{holder ? customerFullName(holder) : '—'}</dd>
        <dt>Ouvert le</dt><dd>{formatDate(account.createdAt)}</dd>
        <dt>Dernière mise à jour</dt><dd>{formatDateTime(account.updatedAt)}</dd>
        {account.closedAt && <><dt>Fermé le</dt><dd>{formatDate(account.closedAt)}</dd></>}
      </dl>
      <p className="fee-note">L’historique des opérations n’est pas disponible pour votre rôle.</p>
    </section>
  </>
}