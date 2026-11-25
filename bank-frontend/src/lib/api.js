const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const TOKEN_KEY = 'bankservices.token'

export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (token) => sessionStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function apiFetch(
  path,
  {
    method = 'GET',
    body,
    auth = true,
    headers: customHeaders = {},
  } = {}
) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }

  const token = getToken()

  if (auth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res

  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Serveur injoignable', 0, 'NETWORK_ERROR')
  }

  const json = await res.json().catch(() => null)

  if (!res.ok || json?.success === false) {
    const err = json?.error ?? {}

    throw new ApiError(
      err.message ?? 'Erreur serveur',
      res.status,
      err.code
    )
  }

  return json
}