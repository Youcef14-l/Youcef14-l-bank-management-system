// Frontend permission checks are UX only (hide buttons). The backend is the real security boundary.
const FALLBACK_BY_ROLE = {
  // Used only if /auth/me returned no permission list. Mirrors the backend default matrix.
  'charge-clientele': ['CUSTOMERS_VIEW', 'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE', 'ACCOUNTS_VIEW', 'ACCOUNTS_CREATE'],
}

export function hasPermission(user, code) {
  if (!user) return false
  const list = (user.permissions ?? []).map((item) => (typeof item === 'string' ? item : item?.code))
  if (list.length > 0) return list.includes(code)
  return (FALLBACK_BY_ROLE[user.roleId] ?? []).includes(code)
}