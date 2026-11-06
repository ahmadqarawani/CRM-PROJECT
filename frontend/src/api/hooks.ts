import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { paths } from './schema'
import { api, call, unwrap, type Lookup, type S } from './client'

type Q<P extends keyof paths> = paths[P] extends { get: { parameters: { query?: infer T } } } ? NonNullable<T> : never

export const K = {
  me: ['me'] as const,
  users: ['users'] as const,
  stages: ['stages'] as const,
  catalog: ['catalog'] as const,
  contacts: ['contacts'] as const,
  deals: ['deals'] as const,
  properties: ['properties'] as const,
  activities: ['activities'] as const,
  timeline: ['timeline'] as const,
  documents: ['documents'] as const,
  quotes: ['quotes'] as const,
  payments: ['payments'] as const,
  notifications: ['notifications'] as const,
  dashboard: ['dashboard'] as const,
  search: ['search'] as const,
  audit: ['audit'] as const,
  duplicates: ['duplicates'] as const,
  settings: ['settings'] as const,
}

const list = { placeholderData: keepPreviousData }

/* ---------- reads ---------- */
export const useMe = () =>
  useQuery({ queryKey: K.me, queryFn: () => unwrap(api.GET('/api/v1/auth/me/')), retry: false, staleTime: 60_000 })
export const useUsers = () =>
  useQuery({ queryKey: K.users, queryFn: () => unwrap(api.GET('/api/v1/users/')), staleTime: 300_000 })
export const useStages = (pipeline?: S['PipelineEnum'], includeInactive = false) =>
  useQuery({
    queryKey: [...K.stages, pipeline, includeInactive],
    queryFn: () => unwrap(api.GET('/api/v1/stages/', { params: { query: { pipeline, include_inactive: includeInactive || undefined } } })),
    staleTime: 60_000,
  })

export type CatalogSlug = 'sources' | 'lost-reasons' | 'locations' | 'property-types' | 'finish-levels' | 'service-types'
  | 'ownership-types' | 'features' | 'tags'
export const useCatalog = (slug: CatalogSlug, includeInactive = false) =>
  useQuery({
    queryKey: [...K.catalog, slug, includeInactive],
    queryFn: () => call<Lookup[]>('GET', `/api/v1/catalog/${slug}/${includeInactive ? '?include_inactive=true' : ''}`),
    staleTime: 120_000,
  })

export const useContacts = (query: Q<'/api/v1/contacts/'>, enabled = true) =>
  useQuery({ queryKey: [...K.contacts, query], queryFn: () => unwrap(api.GET('/api/v1/contacts/', { params: { query } })), enabled, ...list })
export const useContact = (id: number) =>
  useQuery({ queryKey: [...K.contacts, id], queryFn: () => unwrap(api.GET('/api/v1/contacts/{id}/', { params: { path: { id } } })), enabled: id > 0 })
export const useDuplicates = () =>
  useQuery({ queryKey: K.duplicates, queryFn: () => unwrap(api.GET('/api/v1/contacts/duplicates/')) })
export const usePhoneCheck = (phone: string) =>
  useQuery({
    queryKey: [...K.contacts, 'check', phone],
    queryFn: () => unwrap(api.GET('/api/v1/contacts/check-phone/', { params: { query: { phone } } })),
    enabled: phone.replace(/\D/g, '').length >= 8,
  })

export const useDeals = (query: Q<'/api/v1/deals/'>, enabled = true) =>
  useQuery({ queryKey: [...K.deals, query], queryFn: () => unwrap(api.GET('/api/v1/deals/', { params: { query } })), enabled, ...list })
/** Requests per stage under the same filters as the list (the numbers on the stage filter chips). */
export const useStageCounts = (query: Record<string, string | number | boolean | undefined>) =>
  useQuery({
    queryKey: [...K.deals, 'stage-counts', query],
    queryFn: () => {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))
      return call<{ stage: number; count: number }[]>('GET', `/api/v1/deals/stage-counts/?${qs}`)
    },
    ...list,
  })
export const useDeal = (id: number | null) =>
  useQuery({ queryKey: [...K.deals, 'one', id], queryFn: () => unwrap(api.GET('/api/v1/deals/{id}/', { params: { path: { id: id! } } })), enabled: !!id })
export const useMatches = (id: number, enabled: boolean) =>
  useQuery({ queryKey: [...K.deals, 'matches', id], queryFn: async () => (await unwrap(api.GET('/api/v1/deals/{id}/matches/', { params: { path: { id } } }))) as unknown as { property: Record<string, unknown>; status: string | null }[], enabled })

export const useProperties = (query: Q<'/api/v1/properties/'>, enabled = true) =>
  useQuery({ queryKey: [...K.properties, query], queryFn: () => unwrap(api.GET('/api/v1/properties/', { params: { query } })), enabled, ...list })
export const useProperty = (id: number) =>
  useQuery({ queryKey: [...K.properties, 'one', id], queryFn: () => unwrap(api.GET('/api/v1/properties/{id}/', { params: { path: { id } } })) })
export const usePropertyDemands = (id: number) =>
  useQuery({
    queryKey: [...K.properties, 'demands', id],
    queryFn: () => call<{ deal_id: number; title: string; contact: string; kind: string }[]>('GET', `/api/v1/properties/${id}/demands/`),
  })

export const useActivities = (query: Q<'/api/v1/activities/'>, enabled = true) =>
  useQuery({ queryKey: [...K.activities, query], queryFn: () => unwrap(api.GET('/api/v1/activities/', { params: { query: { page_size: 100, ...query } } })), enabled, ...list })

export type TimelineItem =
  | ({ kind: 'activity'; at: string } & S['Activity'])
  | { kind: 'document'; at: string; id: number; name: string; category: string; by: string | null; url: string }
export const useTimeline = (scope: { contact?: number; deal?: number; property?: number }) =>
  useQuery({ queryKey: [...K.timeline, scope], queryFn: async () => (await unwrap(api.GET('/api/v1/timeline/', { params: { query: scope } }))) as unknown as TimelineItem[] })

export const useDocuments = (query: Q<'/api/v1/documents/'>, enabled = true) =>
  useQuery({ queryKey: [...K.documents, query], queryFn: () => unwrap(api.GET('/api/v1/documents/', { params: { query: { page_size: 200, ...query } } })), enabled })
export const useQuotes = (deal: number) =>
  useQuery({ queryKey: [...K.quotes, deal], queryFn: () => unwrap(api.GET('/api/v1/quotes/', { params: { query: { deal } } })) })
export const usePayments = (deal: number) =>
  useQuery({ queryKey: [...K.payments, deal], queryFn: () => unwrap(api.GET('/api/v1/payments/', { params: { query: { deal } } })) })
export const useNotifications = () =>
  useQuery({ queryKey: K.notifications, queryFn: () => unwrap(api.GET('/api/v1/notifications/', { params: { query: { page_size: 30 } } })) })

export type AuditEntry = { at: string; action: string; by: string; changes: { field: string; old: string; new: string }[] }
export const useAudit = (model: 'contact' | 'deal' | 'property', id: number, enabled = true) =>
  useQuery({ queryKey: [...K.audit, model, id], queryFn: () => call<AuditEntry[]>('GET', `/api/v1/audit/?model=${model}&id=${id}`), enabled })

export interface Dashboard {
  overdue: S['Activity'][]
  overdue_count: number
  today: S['Activity'][]
  no_next_step: S['Deal'][]
  no_next_step_count: number
  stuck_count: number
  open_deals: number
  pipelines: { id: number; pipeline: S['PipelineEnum']; name: string; color: string; count: number }[]
  unread_notifications: number
  new_contacts_this_month: number
}
export const useDashboard = (scope: 'me' | 'all' = 'me') =>
  useQuery({ queryKey: [...K.dashboard, scope], queryFn: () => call<Dashboard>('GET', `/api/v1/dashboard/?scope=${scope}`) })

export interface SearchResult {
  contacts: { id: number; name: string; phone: string | null }[]
  deals: { id: number; title: string; kind: string; contact_id: number }[]
  properties: { id: number; code: string; address: string; owner_id: number }[]
}
export const useSearch = (q: string) =>
  useQuery({ queryKey: [...K.search, q], queryFn: () => call<SearchResult>('GET', `/api/v1/search/?q=${encodeURIComponent(q)}`), enabled: q.trim().length >= 2, ...list })

/* ---------- writes ---------- */
function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })))
}

const ALL_RECORDS = [K.contacts, K.deals, K.properties, K.activities, K.timeline, K.dashboard, K.audit]

export function useSaveContact() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedContactRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/contacts/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/contacts/', { body: body as S['ContactRequest'] })),
    onSuccess: () => inv(...ALL_RECORDS, K.duplicates),
  })
}
export function useMerge() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ primary, other }: { primary: number; other: number }) =>
      unwrap(api.POST('/api/v1/contacts/{id}/merge/', { params: { path: { id: primary } }, body: { other_id: other } })),
    onSuccess: () => inv(...ALL_RECORDS, K.duplicates),
  })
}
export function useSaveDeal() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedDealRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/deals/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/deals/', { body: body as S['DealRequest'] })),
    onSuccess: () => inv(...ALL_RECORDS),
  })
}
export function useSaveProperty() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedPropertyRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/properties/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/properties/', { body: body as S['PropertyRequest'] })),
    onSuccess: () => inv(...ALL_RECORDS),
  })
}
export function useSaveActivity() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedActivityRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/activities/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/activities/', { body: body as S['ActivityRequest'] })),
    onSuccess: () => inv(...ALL_RECORDS, K.notifications),
  })
}
export function useCompleteActivity() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, outcome, next_due }: { id: number; outcome?: string; next_due?: string | null }) =>
      unwrap(api.POST('/api/v1/activities/{id}/complete/', { params: { path: { id } }, body: { outcome, ...(next_due ? { next_due } : {}) } })),
    onSuccess: () => inv(...ALL_RECORDS),
  })
}
export function useRemove() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (url: string) => call('DELETE', url),
    onSuccess: () => inv(...ALL_RECORDS, K.documents, K.quotes, K.payments),
  })
}
export function useSetMatch(deal: number) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: { property_id: number; status: S['MatchUpdateStatusEnum'] }) =>
      unwrap(api.POST('/api/v1/deals/{id}/match/', { params: { path: { id: deal } }, body })),
    onSuccess: () => inv(K.deals),
  })
}
export function useConvertToFinishing() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.POST('/api/v1/deals/{id}/convert-to-finishing/', { params: { path: { id } } })),
    onSuccess: () => inv(...ALL_RECORDS),
  })
}
export function useSaveQuote() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedQuoteRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/quotes/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/quotes/', { body: body as S['QuoteRequest'] })),
    onSuccess: () => inv(K.quotes, K.deals),
  })
}
export function useSavePayment() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: S['PaymentRequest']) => unwrap(api.POST('/api/v1/payments/', { body })),
    onSuccess: () => inv(K.payments, K.deals),
  })
}
export function usePatchDocument() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: S['PatchedDocumentRequest'] }) =>
      unwrap(api.PATCH('/api/v1/documents/{id}/', { params: { path: { id } }, body })),
    onSuccess: () => inv(K.documents, K.timeline),
  })
}
export function useSaveStage() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedStageRequest'] }) =>
      id ? unwrap(api.PATCH('/api/v1/stages/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/stages/', { body: body as S['StageRequest'] })),
    onSuccess: () => inv(K.stages, K.deals, K.dashboard),
  })
}
export function useSaveCatalog(slug: CatalogSlug) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Partial<Lookup> }) =>
      call<Lookup>(id ? 'PATCH' : 'POST', `/api/v1/catalog/${slug}/${id ? `${id}/` : ''}`, body),
    onSuccess: () => inv(K.catalog),
  })
}
export function useMarkNotification() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.PATCH('/api/v1/notifications/{id}/', { params: { path: { id } }, body: { is_read: true } })),
    onSuccess: () => inv(K.notifications, K.dashboard),
  })
}
export function useReadAll() {
  const inv = useInvalidate()
  return useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all/')), onSuccess: () => inv(K.notifications, K.dashboard) })
}
