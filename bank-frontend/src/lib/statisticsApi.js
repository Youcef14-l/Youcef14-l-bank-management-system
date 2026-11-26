import { apiFetch } from './api.js'

export const TYPE_LABELS = {
  DEPOT: 'Dépôts',
  RETRAIT: 'Retraits',
  VIREMENT: 'Virements'
}

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
export function formatAmount(decimalString) {
  return `${nf.format(decimalString ?? '0')} DA`.replace(/[\u202f\u00a0]/g, ' ')
}

export function formatCompact(decimalString) {
  const n = Math.abs(Number(decimalString ?? 0))
  const sign = Number(decimalString) < 0 ? '-' : ''
  const f = (x) => x.toFixed(2).replace('.', ',')
  if (n >= 1e9) return `${sign}${f(n / 1e9)} Md`
  if (n >= 1e6) return `${sign}${f(n / 1e6)} M`
  if (n >= 1e3) return `${sign}${f(n / 1e3)} k`
  return `${sign}${n.toFixed(0)}`
}