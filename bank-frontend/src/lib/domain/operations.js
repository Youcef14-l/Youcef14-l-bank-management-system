import { accounts } from '../data/accounts.js'
import { clients } from '../data/clients.js'
import { operations } from '../data/operations.js'
import { formatMontant } from '../format.js'

export const clientFor = (id) => clients.find((client) => client.id === id)
export const balanceTotal = () => accounts.reduce((total, account) => total + account.balance, 0)

export function frais(type, account, amount) {
  if (type === 'VIREMENT') return Math.min(50000, Math.max(5000, Math.floor((amount + 100) / 200)))
  if (type === 'RETRAIT' && account?.type === 'EPARGNE') return Math.floor((amount + 50) / 100)
  return 0
}

export function effectuer(type, source, destination, amount, description) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw Error('Le montant doit être strictement supérieur à 0.')
  }
  if (!source || source.status !== 'ACTIF') {
    throw Error('Ce compte est bloqué : aucune opération n’est possible.')
  }
  if (type === 'VIREMENT' && (!destination || destination.status !== 'ACTIF')) {
    throw Error('Le compte destination doit être actif.')
  }
  if (type === 'VIREMENT' && source.numero === destination.numero) {
    throw Error('Le compte source et le compte destination doivent être différents.')
  }

  const fee = frais(type, source, amount)
  const available = source.balance + (source.type === 'COURANT' ? source.overdraft : -(source.minimum || 0))
  if (type !== 'DEPOT' && amount + fee > available) {
    throw Error(`Solde insuffisant : disponible ${formatMontant(available)}, montant demandé ${formatMontant(amount + fee)}.`)
  }

  if (type === 'DEPOT') source.balance += amount
  else source.balance -= amount + fee
  if (type === 'VIREMENT') destination.balance += amount

  const operation = {
    reference: `TRX-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(operations.length + 1).padStart(4, '0')}`,
    account: source.numero,
    type,
    amount,
    fee,
    date: new Date(),
    description: description?.trim() || (type === 'VIREMENT' ? `Virement vers ${destination.numero}` : 'Opération au guichet'),
    counterparty: destination?.numero,
  }
  operations.unshift(operation)
  return operation
}
