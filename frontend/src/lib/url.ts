import { useSearchParams } from 'react-router'

type V = string | number | null | undefined

/** Keys that say what is open, not what is listed: changing them keeps the current page. */
const VIEW_KEYS = new Set(['page', 'open', 'deal', 'tab'])

/** List filters + page live in the URL, so back/forward and shared links keep them.
 *  Changing any filter sends you back to page 1. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k)
  const num = (k: string) => Number(params.get(k)) || undefined
  const page = Math.max(1, Number(params.get('page')) || 1)
  /** several keys in one navigation (two separate calls would each start from the same old URL) */
  const setMany = (changes: Record<string, V>) => {
    const n = new URLSearchParams(params)
    let filterChanged = false
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === '') n.delete(k)
      else n.set(k, String(v))
      if (!VIEW_KEYS.has(k)) filterChanged = true
    }
    if (filterChanged) n.delete('page')
    // page turns get their own history entry (back = previous page); filter typing does not
    setParams(n, { replace: !('page' in changes) })
  }
  const set = (k: string, v: V) => setMany({ [k]: v })
  return { get, num, page, set, setMany, setPage: (p: number) => set('page', p > 1 ? p : null) }
}
