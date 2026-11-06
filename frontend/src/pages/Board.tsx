import { useState } from 'react'
import type { DealKind, Pipeline } from '../api/client'
import { useDeals, useStageCounts, useStages } from '../api/hooks'
import { DealCard } from '../components/bits'
import { DealPanel } from '../components/DealPanel'
import { DealDialog } from '../components/forms'
import { Button, Chip, Dot, Empty, Input, PageHeader, Pager, Select, Spinner, cx } from '../components/ui'
import { KIND_LABEL, longDate } from '../lib/format'
import { useAccess } from '../lib/access'
import { useUrlFilters } from '../lib/url'

const TITLES: Record<Pipeline, string> = { FINISHING: 'الإكساء', BROKERAGE: 'طلبات العقارات' }
/** 4 cards per row × 5 rows on a wide screen */
const PER_PAGE = 20
const STATUS: [string, string][] = [['open', 'مفتوحة'], ['closed', 'مسكّرة'], ['all', 'الكل']]
const SORTS: [string, string][] = [
  ['-needs_attention,next_step_at', 'الأهم أولاً'], ['-created_at', 'الأحدث'], ['created_at', 'الأقدم'], ['stage_entered_at', 'أطول وقت بالمرحلة'],
]

/** Requests as a card grid: filters (all in the URL) + server-side pages of 20. */
export function Board({ pipeline }: { pipeline: Pipeline }) {
  const f = useUrlFilters()
  const openId = f.num('open') ?? null
  const who = f.get('f') ?? 'all' // all | mine | attention
  const kind = f.get('kind') as DealKind | null
  const status = f.get('status') ?? 'open'
  const stage = f.num('stage')
  const sort = f.get('sort') ?? SORTS[0][0]
  const [search, setSearch] = useState(f.get('q') ?? '')
  const stages = useStages(pipeline)
  const { can } = useAccess()

  // everything except stage/page: shared by the list and the per-stage counts
  const filters = {
    pipeline, search: f.get('q') || undefined, kind: kind ?? undefined,
    status: status === 'open' ? 'OPEN' : status === 'closed' ? 'CLOSED' : undefined,
    ...(who === 'mine' ? { assignee: 'me' } : {}), ...(who === 'attention' ? { attention: true } : {}),
  }
  const counts = useStageCounts(filters)
  const countOf = (id: number) => counts.data?.find((c) => c.stage === id)?.count ?? 0
  const visibleStages = (stages.data ?? []).filter((s) => status === 'all' || (status === 'open' ? s.type === 'OPEN' : s.type !== 'OPEN'))
  const stageIds = new Set(visibleStages.map((s) => s.id))
  const total = counts.data?.filter((c) => stageIds.has(c.stage)).reduce((n, c) => n + c.count, 0) ?? 0
  const attention = useDeals({ pipeline, status: 'OPEN', attention: true, page_size: 1 })

  const deals = useDeals({
    ...filters, stage, ordering: sort, page: f.page, page_size: PER_PAGE,
  })
  const rows = deals.data?.results ?? []
  const [adding, setAdding] = useState(false)
  const setOpen = (id: number | null) => f.set('open', id) // keeps the page
  const late = attention.data?.count ?? 0

  return (
    <div className="flex h-full" data-section={pipeline === 'FINISHING' ? 'finishing' : 'realestate'}>
      <div data-scroll className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
        <PageHeader title={TITLES[pipeline]}
          sub={<>{longDate()}{late > 0 && <> · <button onClick={() => f.set('f', 'attention')} className="text-accent hover:underline"><span className="num">{late}</span> بدها انتباه</button></>}</>}
          actions={can('deals.create') && <Button variant="primary" onClick={() => setAdding(true)}>+ طلب جديد</Button>} />

        {/* filters */}
        <div className="flex flex-col gap-2.5 border-b border-line px-4 pb-3.5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => { setSearch(e.target.value); f.set('q', e.target.value) }} placeholder="اسم أو رقم أو عنوان…" className="w-full sm:w-56" />
            <Chip on={who === 'all'} onClick={() => f.set('f', null)}>الكل</Chip>
            <Chip on={who === 'mine'} onClick={() => f.set('f', 'mine')}>شغلي</Chip>
            <Chip on={who === 'attention'} onClick={() => f.set('f', 'attention')}><Dot color="var(--color-accent)" />بدها انتباه</Chip>
            {pipeline === 'BROKERAGE' && (['BUY', 'RENT', 'SELL', 'LEASE'] as DealKind[]).map((k) => (
              <Chip key={k} on={kind === k} onClick={() => f.set('kind', kind === k ? null : k)}>{KIND_LABEL[k]}</Chip>
            ))}
            <div className="flex items-center gap-2 sm:ms-auto">
              <div className="flex rounded-full border border-white/70 bg-white/60 p-0.5 backdrop-blur">
                {STATUS.map(([k, label]) => (
                  <button key={k} onClick={() => f.setMany({ status: k === 'open' ? null : k, stage: null })}
                    className={cx('h-6 rounded-full px-2.5 text-[12.5px]', status === k ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink')}>{label}</button>
                ))}
              </div>
              <Select value={sort} onChange={(e) => f.set('sort', e.target.value === SORTS[0][0] ? null : e.target.value)} className="h-7 w-auto text-[12.5px]" aria-label="الترتيب">
                {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </div>
          </div>
          {/* stages, each with its count under the filters above */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            <StageChip on={!stage} onClick={() => f.set('stage', null)} label="كل المراحل" count={total} />
            {visibleStages.map((s) => (
              <StageChip key={s.id} on={stage === s.id} onClick={() => f.set('stage', stage === s.id ? null : s.id)} label={s.name} count={countOf(s.id)} color={s.color} />
            ))}
          </div>
        </div>

        {/* cards: 1 → 2 → 3 → 4 per row */}
        <div className="px-4 py-4 md:px-6">
          {deals.isLoading ? <Spinner /> : !rows.length ? (
            <Empty title="ما في طلبات بهالفلتر" hint="غيّر الفلتر أو المرحلة" action={<Button onClick={() => { setSearch(''); f.setMany({ q: null, f: null, stage: null, kind: null }) }}>مسح الفلاتر</Button>} />
          ) : (
            <div className={cx('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', deals.isPlaceholderData && 'opacity-60')}>
              {rows.map((d) => <DealCard key={d.id} d={d} showStage={!stage} selected={openId === d.id} onClick={() => setOpen(d.id)} />)}
            </div>
          )}
          {deals.data && <Pager page={f.page} count={deals.data.count} pageSize={PER_PAGE} onChange={f.setPage} />}
        </div>
      </div>
      {openId && <DealPanel id={openId} onClose={() => setOpen(null)} />}
      <DealDialog open={adding} onClose={() => setAdding(false)} kind={pipeline === 'FINISHING' ? 'FINISHING' : kind ?? 'BUY'}
        onSaved={(d) => setOpen(d.id)} />
    </div>
  )
}

function StageChip({ on, onClick, label, count, color }: { on: boolean; onClick: () => void; label: string; count: number; color?: string | null }) {
  return (
    <button onClick={onClick}
      className={cx('btn inline-flex h-7.5 flex-none items-center gap-1.5 rounded-[9px] border px-2.5 text-[13px] whitespace-nowrap',
        on ? 'btn-primary border-transparent text-white' : 'chip border-white/70 text-ink')}>
      {color && <Dot color={color} />}{label}
      <span className={cx('num text-[12px]', on ? 'text-white/80' : 'text-faint')}>{count}</span>
    </button>
  )
}
