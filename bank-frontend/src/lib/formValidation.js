const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NATIONAL_ID_RE = /^[A-Za-z0-9-]+$/
const PHONE_RE = /^[0-9+\s().-]{6,20}$/
const AMOUNT_RE = /^\d{1,15}(\.\d{1,2})?$/
const RATE_RE = /^\d{1,3}(\.\d{1,4})?$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const todayString = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const isRealDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const isUuid = (value) => UUID_RE.test(String(value ?? ''))

// "10 000,50" -> "10000.50"
export const normalizeAmount = (value) => String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')

// Mirrors the backend Zod rules. Returns a list of French error messages.
export function validateCustomerForm(form) {
  const errors = []
  const firstName = form.firstName.trim()
  const lastName = form.lastName.trim()
  const nationalId = form.nationalId.trim()
  const email = form.email.trim()
  const phone = form.phone.trim()
  const address = form.address.trim()
  const dateOfBirth = form.dateOfBirth.trim()

  if (!firstName) errors.push('Le prénom est obligatoire.')
  else if (firstName.length > 100) errors.push('Le prénom ne doit pas dépasser 100 caractères.')

  if (!lastName) errors.push('Le nom est obligatoire.')
  else if (lastName.length > 100) errors.push('Le nom ne doit pas dépasser 100 caractères.')

  if (nationalId.length < 5 || nationalId.length > 30) {
    errors.push('La pièce d’identité doit contenir entre 5 et 30 caractères.')
  } else if (!NATIONAL_ID_RE.test(nationalId)) {
    errors.push('La pièce d’identité ne peut contenir que des lettres, chiffres et tirets.')
  }

  if (!['INDIVIDUAL', 'BUSINESS'].includes(form.customerType)) errors.push('Type de client invalide.')
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) errors.push('Veuillez saisir une adresse email valide.')
  if (phone && !PHONE_RE.test(phone)) errors.push('Numéro de téléphone invalide (6 à 20 chiffres ou symboles + ( ) . -).')
  if (address.length > 255) errors.push('L’adresse ne doit pas dépasser 255 caractères.')

  if (dateOfBirth) {
    if (!isRealDate(dateOfBirth)) errors.push('La date de naissance n’est pas une date valide.')
    else if (dateOfBirth > todayString()) errors.push('La date de naissance ne peut pas être dans le futur.')
  }
  return errors
}

export function validateAccountForm(form, customerId) {
  const errors = []
  if (!isUuid(customerId)) errors.push('Veuillez sélectionner un titulaire.')
  if (!['COURANT', 'EPARGNE'].includes(form.accountType)) errors.push('Type de compte invalide.')
  if (!['DZD', 'EUR', 'USD'].includes(form.currency)) errors.push('Devise invalide.')

  if (form.accountType === 'COURANT') {
    const overdraft = normalizeAmount(form.overdraftLimit)
    if (overdraft && !AMOUNT_RE.test(overdraft)) {
      errors.push('Le découvert autorisé doit être un montant positif avec 2 décimales maximum.')
    }
  } else {
    const rate = normalizeAmount(form.interestRate)
    const minimum = normalizeAmount(form.minimumBalance)
    if (rate && (!RATE_RE.test(rate) || Number(rate) > 100)) {
      errors.push('Le taux annuel doit être compris entre 0 et 100 (4 décimales maximum).')
    }
    if (minimum && !AMOUNT_RE.test(minimum)) {
      errors.push('Le solde minimum doit être un montant positif avec 2 décimales maximum.')
    }
  }
  return errors
}