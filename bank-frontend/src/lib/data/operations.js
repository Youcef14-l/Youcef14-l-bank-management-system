import { accounts } from './accounts.js'

export const operations = Array.from({ length: 40 }, (_, index) => {
  const account = accounts[(index * 7 + 1) % accounts.length]
  const type = ['DEPOT', 'RETRAIT', 'VIREMENT'][index % 3]
  const amount = 250000 + (index * 137000) % 2100000

  return {
    reference: `TRX-${new Date(Date.now() - index * 86400000).toISOString().slice(0, 10).replaceAll('-', '')}-${String(index + 1).padStart(4, '0')}`,
    account: account.numero,
    type,
    amount,
    fee: type === 'VIREMENT'
      ? Math.min(50000, Math.max(5000, Math.round(amount * 0.005)))
      : type === 'RETRAIT' && account.type === 'EPARGNE'
        ? Math.round(amount * 0.01)
        : 0,
    date: new Date(Date.now() - index * 86400000),
    description: ['Versement au guichet', 'Retrait distributeur', 'Virement mensuel'][index % 3],
  }
})
