import { accounts } from './mock.js'

export const roleOptions = [
  { id: 'caissier', label: 'Caissier', landing: '/operations/new' },
  { id: 'charge-clientele', label: 'Chargé de clientèle', landing: '/clients' },
  { id: 'directeur', label: 'Directeur d’agence', landing: '/direction' },
  { id: 'auditeur', label: 'Contrôleur / Auditeur', landing: '/statistiques' },
  { id: 'administrateur', label: 'Administrateur', landing: '/admin' },
]

export const demoEmployees = roleOptions.map((role, index) => ({
  id: `EMP-${String(index + 1).padStart(3, '0')}`,
  email: role.id,
  password: role.id,
  roleId: role.id,
  name: role.label,
  active: true,
}))

export function listEmployees() {
  return demoEmployees.map((employee) => ({ ...employee }))
}

export function addEmployee({ name, email, roleId }) {
  const employee = {
    id: `EMP-${String(demoEmployees.length + 1).padStart(3, '0')}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: roleId,
    roleId,
    active: true,
  }
  demoEmployees.push(employee)
  return { ...employee }
}

export function updateEmployee(id, updates) {
  const employee = demoEmployees.find((item) => item.id === id)
  if (!employee) return null
  Object.assign(employee, updates)
  return { ...employee }
}

export const pendingTransactions = [
  { id: 'TRX-2026-0418', client: 'Entreprise Atlas', type: 'Virement international', amount: 185000000, date: '20 nov. 2026', status: 'pending' },
  { id: 'TRX-2026-0412', client: 'Groupe El Amane', type: 'Virement', amount: 92500000, date: '20 nov. 2026', status: 'pending' },
  { id: 'TRX-2026-0409', client: 'SARL Nord', type: 'Retrait exceptionnel', amount: 62000000, date: '19 nov. 2026', status: 'pending' },
]

let nextTransactionId = 1
const blockedAccountNumbers = new Set(accounts.filter((account) => account.status !== 'ACTIF').map((account) => account.numero))

export function listBlockedAccounts() {
  return [...blockedAccountNumbers]
}

export function setAccountBlocked(accountNumber, blocked) {
  if (blocked) blockedAccountNumbers.add(accountNumber)
  else blockedAccountNumbers.delete(accountNumber)
}

export function isAccountBlocked(accountNumber) {
  return blockedAccountNumbers.has(accountNumber)
}

export function submitLargeTransaction(transaction) {
  const item = { ...transaction, id: `TRX-DEMO-${String(nextTransactionId++).padStart(4, '0')}`, status: 'pending' }
  pendingTransactions.unshift(item)
  return { ...item }
}

export function updatePendingTransaction(id, status) {
  const item = pendingTransactions.find((transaction) => transaction.id === id)
  if (!item) return null
  item.status = status
  return { ...item }
}

export function authenticate(email, password) {
  const normalizedEmail = email.trim().toLowerCase()
  const user = demoEmployees.find((candidate) =>
    [candidate.email, `${candidate.email}@bankservices.local`].includes(normalizedEmail) && candidate.password === password && candidate.active,
  )
  return user ? { ...user, role: roleOptions.find((role) => role.id === user.roleId) } : null
}

const routeAccess = {
  caissier: ['/operations', '/operations/new'],
  'charge-clientele': ['/clients', '/comptes'],
  directeur: ['/direction'],
  auditeur: ['/statistiques', '/operations'],
  administrateur: ['/admin'],
}

export function canAccessPath(roleId, path) {
  if (roleId === 'auditeur' && path.startsWith('/operations/')) return false
  return (routeAccess[roleId] || []).some((base) => path === base || path.startsWith(`${base}/`))
}
