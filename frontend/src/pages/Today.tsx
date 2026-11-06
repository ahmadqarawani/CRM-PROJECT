import { Link, useNavigate } from 'react-router'
import { useDashboard, useMe, useSaveTask, useTasks } from '../api/hooks'
import { RequestCard } from '../components/bits'
import { Card, Dot, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { longDate, time, when } from '../lib/format'

/** "Your day": one sentence, then lists. No charts. */
export function Today() {
  const me = useMe()
  const dash = useDashboard()
  const tasks = useTasks({ assignee: 'me', done: false, ordering: 'due_at' })
  const saveTask = useSaveTask()
  const navigate = useNavigate()
  if (dash.isLoading) return <Spinner />
  const d = dash.data!
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'صباح الخير' : 'مسا الخير'
  const dueTasks = (tasks.data?.results ?? []).filter((t) => new Date(t.due_at) < new Date(Date.now() + 86400000))

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title={`${greet} ${me.data?.name ?? ''}`}
        sub={<>{longDate()} · {d.overdue_count > 0
          ? <span className="text-accent">عندك {d.overdue_count} طلبات بدها متابعة</span>
          : <span className="text-mint-ink">ما في شي متأخر، كل شي ماشي</span>}
          {dueTasks.length > 0 && <> · {dueTasks.length} مهام لليوم</>}</>}
      />

      <div className="grid grid-cols-1 gap-5 px-6 pb-8 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">بدها انتباه الآن</h2>
          {d.overdue.length === 0
            ? <Empty title="ما في طلبات متأخرة" hint="كل الطلبات إلها متابعة بوقتها" />
            : <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
                {d.overdue.map((r) => <RequestCard key={r.id} r={r} showStage onClick={() => navigate(`/requests?open=${r.id}`)} />)}
              </div>}
        </section>

        <aside className="flex flex-col gap-5">
          <section>
            <h2 className="m-0 mb-2.5 flex items-center text-[13px] font-medium text-muted">
              مهامي
              <Link to="/tasks" className="ms-auto text-[12.5px] font-normal text-primary">الكل</Link>
            </h2>
            <Card>
              {dueTasks.length === 0 && <div className="px-4 py-5 text-center text-[13px] text-faint">ما في مهام لليوم</div>}
              {dueTasks.map((t) => {
                const late = new Date(t.due_at) < new Date()
                return (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2.5 border-b border-line px-3.5 py-2.5 last:border-0 hover:bg-bg">
                    <input type="checkbox" className="mt-1 accent-[var(--color-primary)]"
                      onChange={() => saveTask.mutate({ id: t.id, body: { is_done: true } })} />
                    <span className="flex-1">
                      <span className="block">{t.title}</span>
                      <span className={cx('text-[12.5px]', late ? 'text-accent-ink' : 'text-faint')}>{late ? when(t.due_at) : `اليوم ${time(t.due_at)}`}</span>
                    </span>
                  </label>
                )
              })}
            </Card>
          </section>

          <section>
            <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">الطلبات المفتوحة حسب المرحلة</h2>
            <Card className="px-3.5 py-2">
              {d.stages.map((s) => (
                <Link key={s.id} to="/requests" className="flex items-center gap-2 py-1.5 text-ink no-underline hover:text-primary">
                  <Dot color={s.color} />{s.name}
                  <span className="num ms-auto text-faint">{s.count}</span>
                </Link>
              ))}
              <div className="mt-1 flex border-t border-line pt-2 text-[13px] text-muted">
                طلبات جديدة هالشهر<span className="num ms-auto">{d.new_requests_this_month}</span>
              </div>
            </Card>
          </section>
        </aside>
      </div>
    </div>
  )
}
