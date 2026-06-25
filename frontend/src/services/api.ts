// src/services/api.ts
const BASE_URL = 'http://10.14.144.233:5000'

export function apiUrl(path: string) {
  return `${BASE_URL}${path}`
}

export function authHeaders(token?: string | null) {
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export function jsonHeaders(token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}