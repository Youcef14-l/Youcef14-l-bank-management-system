import { useState } from 'react'
import { Check, LockKeyhole, ShieldCheck, UnlockKeyhole, X } from 'lucide-react'
import { accounts, effectuer, formatMontant, operations } from '../lib/mock.js'
import { PageHeader } from '../components/ui.jsx'
import { listBlockedAccounts, pendingTransactions, setAccountBlocked, updatePendingTransaction } from '../lib/auth.js'

export default function DirectorPage() {
  const [items, setItems] = useState(() => pendingTransactions.map((item) => ({ ...item })))
  const [blockedAccounts, setBlockedAccounts] = useState(() => new Set(listBlockedAccounts()))
  const decide = (id, status) => {
    const item = items.find((transaction) => transaction.id === id)
    if (!item) return
    if (status === 'approved' && item.accountNumber) {
      const account = accounts.find((candidate) => candidate.numero === item.accountNumber)
      const destination = accounts.find((candidate) => candidate.numero === item.destinationNumber)
      try {
        effectuer(item.transactionType, account, item.transactionType === 'VIREMENT' ? destination : null, item.amount)
      } catch (error) {
        return
      }
    }
    updatePendingTransaction(id, status)
    setItems((current) => current.map((transaction) => transaction.id === id ? { ...transaction, status } : transaction))
  }
  const toggleAccount = (number) => {
    const blocked = !blockedAccounts.has(number)
    setAccountBlocked(number, blocked)
    setBlockedAccounts((current) => {
      const next = new Set(current)
      if (blocked) next.add(number)
      else next.delete(number)
      return next
    })
  }

  return <>
    <PageHeader title="Pilotage de l’agence" description="Validation des opérations importantes et contrôle des comptes." />
    <section className="kpi-grid director-kpis"><article className="kpi"><div className="kpi-top">À valider <span className="kpi-icon amber"><ShieldCheck size={17} /></span></div><strong>{items.filter((item) => item.status === 'pending').length}</strong><small>Opérations de montant élevé</small></article><article className="kpi"><div className="kpi-top">Opérations aujourd’hui <span className="kpi-icon blue"><ShieldCheck size={17} /></span></div><strong>{operations.length}</strong><small>Activité de l’agence</small></article><article className="kpi"><div className="kpi-top">Comptes bloqués <span className="kpi-icon mint"><LockKeyhole size={17} /></span></div><strong>{blockedAccounts.size}</strong><small>Contrôle temporaire</small></article></section>
    <section className="card role-card"><div className="card-heading"><div><h2>Opérations à approbation renforcée</h2><p>Les opérations simulées sont proposées à la validation de la direction.</p></div></div><div className="role-table-wrap"><table className="role-table"><thead><tr><th>Référence / client</th><th>Type</th><th>Date</th><th>Montant</th><th>Décision</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.id}</b><small>{item.client}</small></td><td>{item.type}</td><td>{item.date}</td><td className="amount-cell">{formatMontant(item.amount)}</td><td>{item.status !== 'pending' ? <span className={`decision ${item.status}`}>{item.status === 'approved' ? 'Approuvée' : 'Refusée'}</span> : <div className="row-actions"><button className="role-icon-button approve" aria-label={`Approuver ${item.id}`} onClick={() => decide(item.id, 'approved')}><Check size={15} /></button><button className="role-icon-button reject" aria-label={`Refuser ${item.id}`} onClick={() => decide(item.id, 'rejected')}><X size={15} /></button></div>}</td></tr>)}</tbody></table></div></section>
    <section className="card role-card"><div className="card-heading"><div><h2>État des comptes</h2><p>Bloquez ou réactivez un compte bancaire.</p></div></div><div className="role-table-wrap"><table className="role-table"><thead><tr><th>Compte</th><th>Client</th><th>Solde</th><th>Statut</th><th>Action</th></tr></thead><tbody>{accounts.slice(0, 6).map((account) => { const blocked = blockedAccounts.has(account.numero); return <tr key={account.numero}><td className="mono">{account.numero}</td><td>{account.clientId}</td><td className="amount-cell">{formatMontant(account.balance)}</td><td><span className={`decision ${blocked ? 'rejected' : 'approved'}`}>{blocked ? 'Bloqué' : 'Actif'}</span></td><td><button className="text-action" onClick={() => toggleAccount(account.numero)}>{blocked ? <><UnlockKeyhole size={14} /> Réactiver</> : <><LockKeyhole size={14} /> Bloquer</>}</button></td></tr>})}</tbody></table></div></section>
  </>
}
