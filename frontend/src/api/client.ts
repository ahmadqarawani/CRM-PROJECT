import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './schema'

export type S = components['schemas']
export type Contact = S['Contact']
export type Deal = S['Deal']
export type Property = S['Property']
export type Activity = S['Activity']
export type Stage = S['Stage']
export type Doc = S['Document']
export type Quote = S['Quote']
export type Payment = S['Payment']
export type Notification = S['Notification']
export type Me = S['Me']
export type UserRef = S['UserRef']
export type DealKind = S['DealKindEnum']
export type Pipeline = S['PipelineEnum']
export type ActivityType = S['ActivityTypeEnum']
export type Lookup = { id: number; name: string; order?: number; is_active?: boolean; [k: string]: unknown }

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
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) request.headers.set('X-CSRFToken', csrfToken())
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

export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p
  if (!response.ok) throw new ApiError(response.status, error)
  return data as T
}

/** Untyped JSON call for the few generic endpoints (catalog lists). */
export async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRFToken': csrfToken() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export async function uploadDocument(form: FormData): Promise<Doc> {
  const res = await fetch('/api/v1/documents/', {
    method: 'POST', body: form, credentials: 'same-origin', headers: { 'X-CSRFToken': csrfToken() },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as Doc
}

export async function ensureCsrf() {
  await fetch('/api/v1/auth/csrf/', { credentials: 'same-origin' })
}
