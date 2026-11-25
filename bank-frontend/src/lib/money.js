// Backend amounts are decimal strings in major units ("1250.00"), NOT centimes.
// Everything here uses BigInt cents, so there is no floating-point error.

const CURRENCY_SYMBOLS = { DZD: 'DA', EUR: '€', USD: '$' }

const DECIMAL_SEPARATOR =
  new Intl.NumberFormat('fr-DZ').formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? ','
const integerFormat = new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 })

export const currencySymbol = (currency) => CURRENCY_SYMBOLS[currency] ?? currency ?? ''

export function decimalToCents(value) {
  if (value === null || value === undefined) return null
  const match = String(value).trim().match(/^(-)?(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  const [, sign, whole, fraction = ''] = match
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
  return sign ? -cents : cents
}

export function formatCents(cents, currency = 'DZD') {
  if (cents === null || cents === undefined) return '—'
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const whole = integerFormat.format(abs / 100n)
  const fraction = String(abs % 100n).padStart(2, '0')
  return `${negative ? '−' : ''}${whole}${DECIMAL_SEPARATOR}${fraction} ${currencySymbol(currency)}`
}

export const formatMoney = (value, currency = 'DZD') => formatCents(decimalToCents(value), currency)

export function isNegative(value) {
  const cents = decimalToCents(value)
  return cents !== null && cents < 0n
}

// Available balance = balance + overdraft (COURANT) or balance - minimum balance (EPARGNE).
export function availableCents(account) {
  const balance = decimalToCents(account?.balance)
  if (balance === null) return null
  if (account.accountType === 'COURANT') return balance + (decimalToCents(account.overdraftLimit) ?? 0n)
  return balance - (decimalToCents(account.minimumBalance) ?? 0n)
}

export const formatAvailable = (account) => formatCents(availableCents(account), account.currency)

// { DZD: 12345n, EUR: 500n } — never mixes currencies.
export function sumByCurrency(accounts, { excludeClosed = false } = {}) {
  return accounts.reduce((totals, account) => {
    if (excludeClosed && account.status === 'FERME') return totals
    const cents = decimalToCents(account.balance)
    if (cents === null) return totals
    return { ...totals, [account.currency]: (totals[account.currency] ?? 0n) + cents }
  }, {})
}

export function formatTotals(totals) {
  const entries = Object.entries(totals)
  if (!entries.length) return formatCents(0n)
  return entries.map(([currency, cents]) => formatCents(cents, currency)).join(' · ')
}