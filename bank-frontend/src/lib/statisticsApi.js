import { apiFetch } from './api.js'

export const TYPE_LABELS = {
  DEPOT: 'Dépôts',
  RETRAIT: 'Retraits',
  VIREMENT: 'Virements'
}

// Must match CURRENCIES in statistics.service.js (backend).
export const CURRENCIES = ['DZD', 'EUR', 'USD']

const CURRENCY_SYMBOLS = {
  DZD: 'DA',
  EUR: '€',
  USD: '$'
}

export const currencySymbol = (currency) =>
  CURRENCY_SYMBOLS[currency] ?? currency

// Response: { period, currencies, byCurrency: { DZD: {kpis, byType, netFlow}, EUR: {...}, USD: {...} } }
export async function getStatistics({ from, to, tzOffset = 0 }) {
  const qs = new URLSearchParams({ from, to, tzOffset: String(tzOffset) })
  const json = await apiFetch(`/statistics?${qs.toString()}`)
  return json.data
}

const nf = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

// Decimal strings from the API are formatted for display only (no arithmetic on them).
export function formatAmount(decimalString, currency = 'DZD') {
  return `${nf.format(decimalString ?? '0')} ${currencySymbol(currency)}`.replace(
    /[\u202f\u00a0]/g,
    ' '
  )
}

// Compact number WITHOUT the currency (the caller appends currencySymbol()).
export function formatCompact(decimalString) {
  const n = Math.abs(Number(decimalString ?? 0))
  const sign = Number(decimalString) < 0 ? '-' : ''
  const f = (x) => x.toFixed(2).replace('.', ',')
  if (n >= 1e9) return `${sign}${f(n / 1e9)} Md`
  if (n >= 1e6) return `${sign}${f(n / 1e6)} M`
  if (n >= 1e3) return `${sign}${f(n / 1e3)} k`
  return `${sign}${n.toFixed(0)}`
}