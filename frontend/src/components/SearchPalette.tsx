import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSearch } from '../api/hooks'
import { useAccess } from '../lib/access'
import { KIND_LABEL, phoneLabel } from '../lib/format'
import { cx } from './ui'

type Item = { key: string; kind: 'contact' | 'deal' | 'property' | 'page'; text: string; sub?: string | null; to: string }

const svg = (d: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const ICON = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  contact: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1-3.6 3.9-5.5 7-5.5s6 1.9 7 5.5" /></>,
  deal: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M4 10h16" /></>,
  property: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9.5 20v-6h5v6" /></>,
  page: <><path d="M9 6l6 6-6 6" /></>,
}
const TONE: Record<Item['kind'], string> = {
  contact: 'bg-primary-soft text-primary',
  deal: 'bg-mint-soft text-mint-ink',
  property: 'bg-accent-soft text-accent-ink',
  page: 'bg-subtle text-muted',
}
const GROUP_LABEL: Record<Item['kind'], string> = { contact: 'عملاء', deal: 'طلبات', property: 'عقارات', page: 'روح لـ' }

/** Ctrl/⌘ K: one box for clients (any phone format), requests and property codes. ↑↓ to move, Enter to open. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const term = q.trim()
  const res = useSearch(term)
  const navigate = useNavigate()
  const { can } = useAccess()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pages: Item[] = useMemo(() => [
    { key: 'p-today', kind: 'page' as const, text: 'اليوم', to: '/' },
    ...(can('deals.view') ? [
      { key: 'p-fin', kind: 'page' as const, text: 'الإكساء', to: '/finishing' },
      { key: 'p-re', kind: 'page' as const, text: 'طلبات العقارات', to: '/real-estate' },
    ] : []),
    ...(can('contacts.view') ? [{ key: 'p-c', kind: 'page' as const, text: 'العملاء', to: '/contacts' }] : []),
    ...(can('properties.view') ? [{ key: 'p-p', kind: 'page' as const, text: 'العقارات المعروضة', to: '/properties' }] : []),
  ], [can])

  const items: Item[] = useMemo(() => {
    if (term.length < 2) return pages
    if (!res.data) return []
    return [
      ...res.data.contacts.map((c) => {
        const unnamed = c.name.startsWith('+') // no name: the server sends the number itself
        return { key: `c${c.id}`, kind: 'contact' as const, text: unnamed ? phoneLabel(c.name) : c.name,
          sub: unnamed ? 'بلا اسم' : c.phone && phoneLabel(c.phone), to: `/contacts/${c.id}` }
      }),
      ...res.data.deals.map((d) => ({
        key: `d${d.id}`, kind: 'deal' as const, text: d.title || `طلب #${d.id}`, sub: `${KIND_LABEL[d.kind] ?? ''} · #${d.id}`,
        to: `/${d.kind === 'FINISHING' ? 'finishing' : 'real-estate'}?open=${d.id}`,
      })),
      ...res.data.properties.map((p) => ({ key: `p${p.id}`, kind: 'property' as const, text: p.code, sub: p.address, to: `/properties/${p.id}` })),
    ]
  }, [term, res.data, pages])

  // new results → back to the first one
  useEffect(() => setActive(0), [term, res.data])
  // keep the highlighted row in view
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (it?: Item) => {
    if (!it) return
    onClose()
    navigate(it.to)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]) }
  }

  const searching = term.length >= 2 && res.isFetching && !res.data
  const groups = (['page', 'contact', 'deal', 'property'] as const)
    .map((kind) => ({ kind, rows: items.map((it, index) => ({ it, index })).filter(({ it }) => it.kind === kind) }))
    .filter((g) => g.rows.length)

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-navy/25 px-3 pt-[10vh] backdrop-blur-[3px]" onMouseDown={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="بحث" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
        className="flex h-fit max-h-[78dvh] w-[min(600px,100%)] flex-col overflow-hidden rounded-[var(--r-lg)] border border-white bg-white/95 shadow-[0_0_0_1px_rgb(11_46_74/0.06),0_30px_80px_-24px_rgb(11_46_74/0.55)] backdrop-blur-xl [animation:pop_.16s_var(--ease)]">

        {/* search field: a rounded box inside the panel; focus = soft ring + coloured border (no clipped outline) */}
        <div className="border-b border-line/70 p-3">
          <label className="group flex h-12 items-center gap-3 rounded-[var(--r-lg)] border border-line bg-bg/70 px-3.5 transition-[border-color,box-shadow,background-color] duration-150
            hover:border-line-strong focus-within:border-primary/45 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgb(var(--brand-rgb)/0.12),0_6px_18px_-10px_rgb(var(--brand-rgb)/0.45)]">
            <span className="text-faint transition-colors group-focus-within:text-primary">{svg(ICON.search, 19)}</span>
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن عميل أو طلب أو عقار…"
              aria-label="بحث"
              aria-activedescendant={items[active] ? `sp-${items[active].key}` : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-[15.5px] text-ink outline-none placeholder:text-faint focus:outline-none focus-visible:outline-none"
            />
            {q && (
              <button type="button" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="مسح"
                className="grid size-7 flex-none place-items-center rounded-full text-faint transition hover:bg-subtle hover:text-ink">✕</button>
            )}
            <kbd className="hidden flex-none rounded-md border border-line bg-white px-1.5 py-0.5 font-mono text-[11px] text-faint shadow-[0_1px_0_rgb(11_46_74/0.08)] sm:inline">Esc</kbd>
          </label>
        </div>

        {/* results */}
        <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {term.length < 2 && (
            <p className="m-0 px-2.5 pt-1 pb-2 text-[12.5px] text-faint">
              بالاسم، أو بالرقم بأي شكل (<span className="num">0933…</span> أو <span className="num">+963…</span>)، أو بكود العقار
            </p>
          )}
          {searching && <div className="px-3 py-6 text-center text-[13px] text-faint">عم يدوّر…</div>}
          {term.length >= 2 && !searching && items.length === 0 && (
            <div className="px-3 py-8 text-center">
              <div className="font-medium text-ink">ما لقينا شي لـ «{term}»</div>
              <div className="mt-1 text-[12.5px] text-faint">جرّب جزء من الاسم أو آخر 6 أرقام من الهاتف</div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.kind} className="mb-1">
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-faint">
                {GROUP_LABEL[g.kind]}{g.kind !== 'page' && <span className="num">{g.rows.length}</span>}
              </div>
              {g.rows.map(({ it, index }) => (
                <button key={it.key} id={`sp-${it.key}`} data-index={index} role="option" aria-selected={index === active}
                  onMouseMove={() => index !== active && setActive(index)} onClick={() => go(it)}
                  className={cx('flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-start transition-colors',
                    index === active ? 'bg-primary-soft/80 shadow-[inset_0_0_0_1px_rgb(var(--brand-rgb)/0.12)]' : 'hover:bg-bg')}>
                  <span className={cx('grid size-8 flex-none place-items-center rounded-[var(--r-ctl)]', TONE[it.kind])}>{svg(ICON[it.kind])}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate', index === active ? 'font-medium text-navy' : 'text-ink', (it.kind === 'property' || /^[0+]\d/.test(it.text)) && 'num text-start')}>{it.text}</span>
                    {it.sub && <span className={cx('block truncate text-[12.5px] text-faint', it.kind === 'contact' && 'num text-start')}>{it.sub}</span>}
                  </span>
                  <span className={cx('flex-none text-[12px] text-primary transition-opacity', index === active ? 'opacity-100' : 'opacity-0')}>فتح ↵</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* keyboard hints */}
        <div className="hidden items-center gap-4 border-t border-line/80 bg-bg/60 px-4 py-2 text-[11.5px] text-faint sm:flex">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> تنقّل</span>
          <span><Kbd>Enter</Kbd> فتح</span>
          <span><Kbd>Esc</Kbd> إغلاق</span>
          <span className="ms-auto"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> من أي مكان</span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mx-0.5 inline-grid min-w-5 place-items-center rounded-[5px] border border-line bg-white px-1 font-mono text-[10.5px] text-muted shadow-[0_1px_0_rgb(11_46_74/0.08)]">{children}</kbd>
}
