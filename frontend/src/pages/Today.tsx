import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Activity } from '../api/client'
import { useActivities, useCompleteActivity, useDashboard, useMe } from '../api/hooks'
import { DealCard } from '../components/bits'
import { useAccess } from '../lib/access'
import { Card, Chip, Dot, Empty, PageHeader, Pager, Spinner, cx } from '../components/ui'
import { ACTIVITY_LABEL, inDays, longDate, time, when } from '../lib/format'

const OVERDUE_PAGE = 15
const NO_STEP_SHOWN = 12

/** "Your day": one sentence, then lists. */
export function Today() {
  const me = useMe()
  const { can } = useAccess()
  const [scope, setScope] = useState<'me' | 'all'>('me')
  const [overduePage, setOverduePage] = useState(1)
  const dash = useDashboard(scope)
  // the dashboard sends the first 30 overdue; past that, page through the activities endpoint
  const overdue = useActivities({ due: 'overdue', assignee: scope === 'me' ? 'me' : undefined, page: overduePage, page_size: OVERDUE_PAGE },
    overduePage > 1)
  const navigate = useNavigate()
  if (dash.isLoading || !dash.data) return <Spinner />
  const d = dash.data
  const greet = new Date().getHours() < 12 ? 'صباح الخير' : 'مسا الخير'
  const openDeal = (a: { deal?: { id: number; kind: string } | null }) =>
    a.deal && navigate(`/${a.deal.kind === 'FINISHING' ? 'finishing' : 'real-estate'}?open=${a.deal.id}`)
  const overdueItems = overduePage > 1 ? overdue.data?.results ?? [] : d.overdue.slice(0, OVERDUE_PAGE)
  const switchScope = (s: 'me' | 'all') => { setScope(s); setOverduePage(1) }
  const moreNoStep = d.no_next_step_count - Math.min(d.no_next_step.length, NO_STEP_SHOWN)

  return (
    <div className="mx-auto max-w-[1100px] pb-24 md:pb-8">
      <PageHeader title={`${greet} ${me.data?.name ?? ''}`}
        sub={<>{longDate()} · {d.overdue_count > 0
          ? <span className="text-accent"><span className="num">{d.overdue_count}</span> متابعات تأخرت</span>
          : <span className="text-mint-ink">ما في شي متأخر</span>}
          {d.today.length > 0 && <> · {d.today.length} مواعيد اليوم</>}</>}
        actions={can('reports.team') && <><Chip on={scope === 'me'} onClick={() => switchScope('me')}>شغلي</Chip><Chip on={scope === 'all'} onClick={() => switchScope('all')}>كل الفريق</Chip></>} />

      <div className="grid grid-cols-1 gap-5 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <AgendaList title="متأخرة" count={d.overdue_count} tone="accent" items={overdueItems} onOpen={openDeal} empty="ما في متابعات متأخرة" />
            <Pager page={overduePage} count={d.overdue_count} pageSize={OVERDUE_PAGE} onChange={setOverduePage} className="mt-2.5" />
          </div>
          <AgendaList title="اليوم" tone="primary" items={d.today} onOpen={openDeal} empty="ما في مواعيد لليوم" />
          <section>
            <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">طلبات مفتوحة بلا خطوة جاية <span className="num">({d.no_next_step_count})</span></h2>
            {d.no_next_step.length === 0 ? <Empty title="كل الطلبات إلها خطوة جاية" /> : (<>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-2.5">
                {d.no_next_step.slice(0, NO_STEP_SHOWN).map((x) => <DealCard key={x.id} d={x} showStage onClick={() => openDeal({ deal: x })} />)}
              </div>
              {moreNoStep > 0 && (
                <div className="mt-2.5 text-[13px] text-muted">
                  و <span className="num">{moreNoStep}</span> كمان — شوفهم كلهم بـ{' '}
                  <Link to="/finishing?f=attention">الإكساء</Link> و <Link to="/real-estate?f=attention">طلبات العقارات</Link>
                </div>
              )}
            </>)}
          </section>
        </div>
        <aside>
          <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">الطلبات المفتوحة حسب المرحلة</h2>
          {(['FINISHING', 'BROKERAGE'] as const).map((p) => (
            <Card key={p} className="mb-3 px-3.5 py-2">
              <Link to={p === 'FINISHING' ? '/finishing' : '/real-estate'} className="mb-1 block text-[13px] font-medium text-navy no-underline">
                {p === 'FINISHING' ? 'الإكساء' : 'العقارات'}
              </Link>
              {d.pipelines.filter((s) => s.pipeline === p).map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1 text-[13.5px]"><Dot color={s.color} />{s.name}<span className="num mr-auto text-faint">{s.count}</span></div>
              ))}
            </Card>
          ))}
          <Card className="px-3.5 py-2.5 text-[13px] text-muted">
            <div className="flex">طلبات واقفة بمرحلتها<span className="num mr-auto">{d.stuck_count}</span></div>
            <div className="flex">عملاء جدد هالشهر<span className="num mr-auto">{d.new_contacts_this_month}</span></div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function AgendaList({ title, items, count, empty, tone, onOpen }: {
  title: string; items: Activity[]; count?: number; empty: string; tone: 'accent' | 'primary'; onOpen: (a: Activity) => void
}) {
  const complete = useCompleteActivity()
  const { canOn } = useAccess()
  return (
    <section>
      <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">{title} <span className="num">({count ?? items.length})</span></h2>
      {items.length === 0 ? <div className="rounded-card border border-dashed border-line-strong px-4 py-4 text-center text-[13px] text-faint">{empty}</div> : (
        <Card>
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-line/80 px-3.5 py-2.5 transition-colors last:border-0 hover:bg-white/70">
              {canOn('activities.edit', [a.assignee?.id, a.created_by?.id]) ? <button title="تمت" onClick={() => complete.mutate({ id: a.id, next_due: inDays(3) })}
                className="grid size-5 flex-none place-items-center rounded border border-line-strong text-[11px] text-transparent hover:border-mint hover:text-mint-ink">✓</button> : <span className="size-5 flex-none" />}
              <button onClick={() => onOpen(a)} className="min-w-0 flex-1 text-start">
                <span className="block truncate"><b className="font-medium">{a.contact.name}</b> · {ACTIVITY_LABEL[a.type]}{a.subject && ` — ${a.subject}`}</span>
                <span className={cx('text-[12.5px]', tone === 'accent' ? 'text-accent-ink' : 'text-primary')}>{tone === 'accent' ? when(a.due_at) : time(a.due_at!)}</span>
              </button>
              <Link to={`/contacts/${a.contact.id}`} className="text-[12.5px] text-faint">الكرت</Link>
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}
