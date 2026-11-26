
import { apiFetch } from './api.js'

export async function listAuditLogs(params = {}) {
  const qs = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value))
    }
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  const json = await apiFetch(`/audit-logs${suffix}`)

  return json.data
}
