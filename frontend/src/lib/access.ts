import { useMe } from '../api/hooks'

export type Scope = 'none' | 'own' | 'all'
export type RecordAccess = { edit: boolean; delete: boolean }

/** What the current user may do with one record (the server sends it with each contact / request / property / file). */
export const accessOf = (record: unknown): RecordAccess =>
  (record as { access?: RecordAccess } | null)?.access ?? { edit: false, delete: false }

/** Role permissions from /auth/me: `can('deals.create')`, `scope('deals.view')`. The server enforces them too;
 *  the UI only hides what would be refused. */
export function useAccess() {
  const me = useMe()
  const perms = (me.data?.permissions ?? {}) as Record<string, unknown>
  const scope = (key: string): Scope => {
    const v = perms[key]
    return v === true || v === 'all' ? 'all' : v === 'own' ? 'own' : 'none'
  }
  const can = (key: string) => scope(key) !== 'none'
  /** a scope permission on a record we only know the people of (activities): own = assigned to me or mine */
  const canOn = (key: string, people: (number | null | undefined)[]) =>
    scope(key) === 'all' || (scope(key) === 'own' && people.includes(me.data?.id))
  return { can, scope, canOn, me: me.data, role: me.data?.role as { id: number; slug: string; name: string } | null | undefined }
}
