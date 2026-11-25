// Montants décimaux manipulés UNIQUEMENT sous forme de chaînes ("1250.50").
// Aucun calcul flottant, aucune conversion en centimes.

const AMOUNT_RE = /^\d{1,17}(\.\d{1,2})?$/

const CURRENCY_SYMBOLS = { DZD: 'DA', EUR: '€', USD: '$' }

export const currencySymbol = (currency) => CURRENCY_SYMBOLS[currency] ?? currency ?? 'DA'

/**
 * Saisie utilisateur ("1 250,5") -> chaîne canonique acceptée par le backend ("1250.50"),
 * ou null si la saisie est invalide (vide, <= 0, plus de 2 décimales, caractères parasites).
 */
export function parseAmountInput(raw) {
  const v = String(raw ?? '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
  if (!AMOUNT_RE.test(v)) return null
  if (!/[1-9]/.test(v)) return null
  const [int, frac = ''] = v.split('.')
  return `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`
}

/**
 * Chaîne décimale de l'API ("1250.50") -> "1 250,50 DA", par manipulation de texte uniquement.
 */
export function formatDecimal(value, currency = 'DZD') {
  if (value === null || value === undefined || value === '') return '—'
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value).trim())
  if (!m) return String(value)
  const sign = m[1] ?? ''
  const grouped = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
  const decimals = ((m[3] ?? '') + '00').slice(0, 2)
  return `${sign}${grouped},${decimals}\u00a0${currencySymbol(currency)}`
}
