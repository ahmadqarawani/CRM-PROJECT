import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './schema'

export type S = components['schemas']
export type Client = S['Client']
export type Request = S['Request']
export type Apartment = S['Apartment']
export type Stage = S['Stage']
export type Activity = S['Activity']
export type Doc = S['Document']
export type Task = S['Task']
export type Notification = S['Notification']
export type Me = S['Me']
export type UserRef = S['UserRef']

/** The backend's single error shape. */
export class ApiError extends Error {
  status: number
  type: string
  errors: Record<string, string[]>
  constructor(status: number, body: unknown) {
    const b = (body ?? {}) as { type?: string; detail?: string; errors?: Record<string, string[]> }
    const first = b.errors ? Object.values(b.errors)[0]?.[0] : undefined
    super(b.detail ?? first ?? `HTTP ${status}`)
    this.status = status
    this.type = b.type ?? 'error'
    this.errors = b.errors ?? {}
  }
}

export function csrfToken(): string {
  return document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1] ?? ''
}

const csrf: Middleware = {
  onRequest({ request }) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      request.headers.set('X-CSRFToken', csrfToken())
    }
    return request
  },
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const auth: Middleware = {
  onResponse({ response, request }) {
    if (response.status === 401 && !request.url.includes('/auth/')) onUnauthorized()
    return response
  },
}

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(csrf, auth)

/** Throw ApiError instead of returning {error}; keeps react-query code simple. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p
  if (!response.ok) throw new ApiError(response.status, error)
  return data as T
}

/** Multipart upload (openapi-fetch is JSON-first). */
export async function uploadDocument(form: FormData): Promise<Doc> {
  const res = await fetch('/api/v1/documents/', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { 'X-CSRFToken': csrfToken() },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as Doc
}

export async function ensureCsrf() {
  await fetch('/api/v1/auth/csrf/', { credentials: 'same-origin' })
}
