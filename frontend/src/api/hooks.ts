import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { paths } from './schema'
import { api, unwrap, type S } from './client'

type Q<P extends keyof paths> = paths[P] extends { get: { parameters: { query?: infer T } } } ? NonNullable<T> : never

/* ---------- query keys (also used by SSE invalidation) ---------- */
export const K = {
  me: ['me'] as const,
  users: ['users'] as const,
  stages: ['stages'] as const,
  clients: ['clients'] as const,
  client: (id: number) => ['clients', id] as const,
  apartments: ['apartments'] as const,
  apartment: (id: number) => ['apartments', id] as const,
  requests: ['requests'] as const,
  request: (id: number) => ['requests', id] as const,
  activities: ['activities'] as const,
  timeline: ['timeline'] as const,
  documents: ['documents'] as const,
  tasks: ['tasks'] as const,
  notifications: ['notifications'] as const,
  dashboard: ['dashboard'] as const,
  search: ['search'] as const,
}

/* ---------- reads ---------- */
export const useMe = () =>
  useQuery({ queryKey: K.me, queryFn: () => unwrap(api.GET('/api/v1/auth/me/')), retry: false, staleTime: 60_000 })

export const useUsers = () =>
  useQuery({ queryKey: K.users, queryFn: () => unwrap(api.GET('/api/v1/users/')), staleTime: 300_000 })

export const useStages = (includeInactive = false) =>
  useQuery({
    queryKey: [...K.stages, includeInactive],
    queryFn: () => unwrap(api.GET('/api/v1/stages/', { params: { query: includeInactive ? { include_inactive: true } : {} } })),
    staleTime: 60_000,
  })

export const useClients = (query: Q<'/api/v1/clients/'>) =>
  useQuery({
    queryKey: [...K.clients, query],
    queryFn: () => unwrap(api.GET('/api/v1/clients/', { params: { query } })),
    placeholderData: keepPreviousData,
  })

export const useClient = (id: number) =>
  useQuery({ queryKey: K.client(id), queryFn: () => unwrap(api.GET('/api/v1/clients/{id}/', { params: { path: { id } } })) })

export const useApartments = (query: Q<'/api/v1/apartments/'>, enabled = true) =>
  useQuery({
    queryKey: [...K.apartments, query],
    queryFn: () => unwrap(api.GET('/api/v1/apartments/', { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useApartment = (id: number) =>
  useQuery({ queryKey: K.apartment(id), queryFn: () => unwrap(api.GET('/api/v1/apartments/{id}/', { params: { path: { id } } })) })

export const useRequests = (query: Q<'/api/v1/requests/'>, enabled = true) =>
  useQuery({
    queryKey: [...K.requests, query],
    queryFn: () => unwrap(api.GET('/api/v1/requests/', { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useRequest = (id: number | null) =>
  useQuery({
    queryKey: K.request(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/requests/{id}/', { params: { path: { id: id! } } })),
    enabled: !!id,
  })

export const useDocuments = (query: Q<'/api/v1/documents/'>, enabled = true) =>
  useQuery({
    queryKey: [...K.documents, query],
    queryFn: () => unwrap(api.GET('/api/v1/documents/', { params: { query: { page_size: 100, ...query } } })),
    enabled,
  })

export const useTasks = (query: Q<'/api/v1/tasks/'>) =>
  useQuery({
    queryKey: [...K.tasks, query],
    queryFn: () => unwrap(api.GET('/api/v1/tasks/', { params: { query: { page_size: 100, ...query } } })),
    placeholderData: keepPreviousData,
  })

export const useNotifications = () =>
  useQuery({
    queryKey: K.notifications,
    queryFn: () => unwrap(api.GET('/api/v1/notifications/', { params: { query: { page_size: 30 } } })),
  })

export type TimelineItem =
  | { kind: 'activity'; id: number; at: string; by: S['UserRef'] | null; type: S['TypeEnum']; body: string; request_id: number | null }
  | { kind: 'stage_change'; id: number; at: string; by: S['UserRef'] | null; request_id: number; from_stage: string | null; to_stage: string }
  | { kind: 'document'; id: number; at: string; by: S['UserRef'] | null; name: string; category: S['CategoryEnum']; request_id: number | null }

export const useTimeline = (scope: { client?: number; request?: number }) =>
  useQuery({
    queryKey: [...K.timeline, scope],
    queryFn: async () => (await unwrap(api.GET('/api/v1/timeline/', { params: { query: scope } }))) as unknown as TimelineItem[],
  })

export interface Dashboard {
  open_requests: number
  overdue_count: number
  overdue: S['Request'][]
  stages: { id: number; name: string; color: string; count: number }[]
  my_tasks_today: number
  unread_notifications: number
  new_requests_this_month: number
}
export const useDashboard = () =>
  useQuery({ queryKey: K.dashboard, queryFn: async () => (await unwrap(api.GET('/api/v1/dashboard/'))) as unknown as Dashboard })

export interface SearchResult {
  clients: { id: number; name: string; phone: string | null }[]
  apartments: { id: number; title: string; client_id: number }[]
  requests: { id: number; title: string; client_id: number }[]
  documents: { id: number; original_name: string; client_id: number }[]
}
export const useSearch = (q: string) =>
  useQuery({
    queryKey: [...K.search, q],
    queryFn: async () => (await unwrap(api.GET('/api/v1/search/', { params: { query: { q } } }))) as unknown as SearchResult,
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  })

/* ---------- writes ---------- */
function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })))
}

export function useSaveClient() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedClientRequest'] }) =>
      id
        ? unwrap(api.PATCH('/api/v1/clients/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/clients/', { body: body as S['ClientRequest'] })),
    onSuccess: () => inv(K.clients, K.requests, K.dashboard),
  })
}

export function useSaveApartment() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedApartmentRequest'] }) =>
      id
        ? unwrap(api.PATCH('/api/v1/apartments/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/apartments/', { body: body as S['ApartmentRequest'] })),
    onSuccess: () => inv(K.apartments, K.clients),
  })
}

export function useSaveRequest() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedRequestRequest'] }) =>
      id
        ? unwrap(api.PATCH('/api/v1/requests/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/requests/', { body: body as S['RequestRequest'] })),
    onSuccess: () => inv(K.requests, K.clients, K.dashboard, K.timeline),
  })
}

export function useLogActivity() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: S['ActivityRequest']) => unwrap(api.POST('/api/v1/activities/', { body })),
    onSuccess: () => inv(K.timeline, K.requests, K.clients, K.dashboard),
  })
}

export function useSaveTask() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: S['PatchedTaskRequest'] }) =>
      id
        ? unwrap(api.PATCH('/api/v1/tasks/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/tasks/', { body: body as S['TaskRequest'] })),
    onSuccess: () => inv(K.tasks, K.dashboard, K.notifications),
  })
}

export function useDeleteTask() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/v1/tasks/{id}/', { params: { path: { id } } })),
    onSuccess: () => inv(K.tasks, K.dashboard),
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
      id
        ? unwrap(api.PATCH('/api/v1/stages/{id}/', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/v1/stages/', { body: body as S['StageRequest'] })),
    onSuccess: () => inv(K.stages, K.requests, K.dashboard),
  })
}

export function useDeleteStage() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/v1/stages/{id}/', { params: { path: { id } } })),
    onSuccess: () => inv(K.stages),
  })
}

export function useMarkNotification() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.PATCH('/api/v1/notifications/{id}/', { params: { path: { id } }, body: { is_read: true } })),
    onSuccess: () => inv(K.notifications, K.dashboard),
  })
}

export function useReadAll() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all/')),
    onSuccess: () => inv(K.notifications, K.dashboard),
  })
}
