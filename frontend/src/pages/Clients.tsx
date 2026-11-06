import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useClients } from '../api/hooks'
import { ClientDialog } from '../components/forms'
import { Button, Chip, Dot, Empty, Freshness, Input, PageHeader, Spinner } from '../components/ui'
import { ago, daysSince } from '../lib/format'

export function Clients() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const overdue = params.get('overdue') === '1'
  const page = Number(params.get('page') ?? 1)
  const clients = useClients({ search: search || undefined, overdue: overdue || undefined, page, page_size: 24 })
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params)
    if (v === null) n.delete(k)
    else n.set(k, v)
    if (k !== 'page') n.delete('page')
    setParams(n, { replace: true })
  }

  const data = clients.data
  const pages = data ? Math.ceil(data.count / 24) : 1

  return (
    <div>
      <PageHeader title="العملاء" sub={data && <><span className="num">{data.count}</span> عميل</>}
        actions={<Button variant="primary" onClick={() => setAdding(true)}>+ عميل جديد</Button>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 pb-3.5">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); set('q', e.target.value || null) }}
          placeholder="اسم، رقم هاتف، مدينة…" className="w-72" />
        <Chip on={!overdue} onClick={() => set('overdue', null)}>الكل</Chip>
        <Chip on={overdue} onClick={() => set('overdue', '1')}><Dot color="var(--color-accent)" />عنده متابعة متأخرة</Chip>
      </div>

      <div className="px-6 py-4">
        {clients.isLoading ? <Spinner /> : data?.results.length === 0 ? (
          <Empty title={search ? 'ما لقينا عميل بهالاسم' : 'ما في عملاء لسا'} hint="ضيف أول عميل، بيكفي الاسم والرقم"
            action={<Button variant="primary" onClick={() => setAdding(true)}>+ عميل جديد</Button>} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {data?.results.map((c) => {
              const days = daysSince(c.last_contact_at)
              return (
                <Link key={c.id} to={`/clients/${c.id}`}
                  className="flex flex-col rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-line-strong">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-[13px] text-muted">{c.phone ? <span className="num">{c.phone}</span> : 'بدون رقم'}{c.city ? ` · ${c.city}` : ''}</div>
                    </div>
                    {c.has_overdue && <span title="عنده متابعة متأخرة" className="mt-1.5 size-2 rounded-full bg-accent" />}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[12.5px] text-faint">
                    <Freshness days={days} />
                    <span>{c.last_contact_at ? `تواصل ${ago(c.last_contact_at)}` : 'ما في تواصل'}</span>
                    <span className="ms-auto"><span className="num">{c.open_requests}</span> مفتوح</span>
                  </div>
                  {!!c.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-subtle px-1.5 text-[12px] text-muted">{t}</span>)}</div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px]">
            <Button size="sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>السابق</Button>
            <span className="num text-muted">{page} / {pages}</span>
            <Button size="sm" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>التالي</Button>
          </div>
        )}
      </div>
      <ClientDialog open={adding} onClose={() => setAdding(false)} onSaved={(c) => navigate(`/clients/${c.id}`)} />
    </div>
  )
}
