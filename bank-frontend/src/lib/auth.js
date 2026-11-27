
import {
  apiFetch,
  setToken,
  clearToken,
  getToken,
} from './api.js' 

export const roleOptions = [
  { id: 'caissier', label: 'Caissier', landing: '/operations/new' },
  { id: 'charge-clientele', label: 'Chargé de clientèle', landing: '/clients' },
  { id: 'directeur', label: 'Directeur d’agence', landing: '/direction' },
  { id: 'auditeur', label: 'Contrôleur / Auditeur', landing: '/statistiques' },
  { id: 'administrateur', label: 'Administrateur', landing: '/admin' },
] 

const BACKEND_ROLE_TO_FRONT = {
  caissier: 'caissier',
  'charge-clientele': 'charge-clientele',
  directeur: 'directeur',
  'directeur-agence': 'directeur',
  controleur: 'auditeur',
  auditeur: 'auditeur',
  administrateur: 'administrateur',
}
const slug = (value) =>
  String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')

// Converts the backend user (buildAuthUser) into the shape the UI already expects.
function toFrontUser(employee) {
  const backendRole = employee.role?.code ?? employee.role?.name ?? employee.role
  const roleId = BACKEND_ROLE_TO_FRONT[slug(backendRole)]
  const role = roleOptions.find((r) => r.id === roleId)
  if (!role) throw new Error(`Rôle non reconnu : ${backendRole}`)

  const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ')
  return {
    id: employee.id,
    email: employee.email,
    name: employee.name ?? (fullName || role.label),
    roleId,
    role,
    active: true,
    permissions: employee.permissions ?? [],
  }
}

export async function login(identifier, password) {
  const value = identifier.trim().toLowerCase()

  const email = value.includes('@')
    ? value
    : `${value}@bankservices.dz`

  const { data } = await apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })

  if (!data?.token || !data?.employee) {
    throw new Error('Invalid login response from server')
  }

  const user = toFrontUser(data.employee)

  setToken(data.token)

  return user
}

// Re-hydrates the session after a page refresh (token is validated by /auth/me).
export async function restoreSession() {
  if (!getToken()) return null
  try {
const { data } = await apiFetch('/auth/me')
return toFrontUser(data.employee ?? data)
  } catch {
    clearToken()
    return null
  }
}

export function logout() {
  clearToken()
}




const routeAccess = {
  caissier: ['/operations', '/operations/new'],
  'charge-clientele': ['/clients', '/comptes'],
  directeur: ['/direction'],
 auditeur: ['/operations', '/statistiques', '/audit'],
  administrateur: ['/admin'],
}

export function canAccessPath(roleId, path) {
  if (roleId === 'auditeur' && path.startsWith('/operations/')) return false
  return (routeAccess[roleId] || []).some((base) => path === base || path.startsWith(`${base}/`))
}
