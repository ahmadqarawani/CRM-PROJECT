import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCatalog, useContacts } from '../api/hooks'
import { ContactDialog } from '../components/forms'
import { Badge, Button, Chip, Dot, Empty, Freshness, Input, PAGE_SIZE, PageHeader, Pager, Select, Spinner } from '../components/ui'
import { ago, daysSince, phoneLabel } from '../lib/format'
import { useUrlFilters } from '../lib/url'

export function Contacts() {
  const f = useUrlFilters()
  const [search, setSearch] = useState(f.get('q') ?? '')
  const attention = f.get('attention') === '1'
  const source = f.num('source')
  const page = f.page
  const sources = useCatalog('sources')
  const contacts = useContacts({ search: f.get('q') || undefined, attention: attention || undefined, source, page, page_size: PAGE_SIZE })
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const set = f.set
  const data = contacts.data

  return (
    <div className="pb-24 md:pb-6" data-section="clients">
      <PageHeader title="العملاء" sub={data && <><span className="num">{data.count}</span> عميل</>}
        actions={<><Link to="/contacts/duplicates" className="text-[13px] text-primary">مكررات محتملة</Link><Button variant="primary" onClick={() => setAdding(true)}>+ عميل</Button></>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3.5 md:px-6">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); set('q', e.target.value || null) }} placeholder="اسم أو رقم بأي شكل…" className="w-full sm:w-64" />
        <Select className="w-auto min-w-36 flex-1 sm:flex-none" value={source ?? ''} onChange={(e) => set('source', e.target.value || null)}>
          <option value="">كل المصادر</option>{sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Chip on={attention} onClick={() => set('attention', attention ? null : '1')}><Dot color="var(--color-accent)" />عنده طلب بده انتباه</Chip>
      </div>
      <div className="px-4 py-4 md:px-6">
        {contacts.isLoading ? <Spinner /> : !data?.results.length ? <Empty title="ما في نتائج" action={<Button variant="primary" onClick={() => setAdding(true)}>+ عميل</Button>} /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-3">
            {data.results.map((c) => (
              <Link key={c.id} to={`/contacts/${c.id}`} className="flex flex-col rounded-card border border-line bg-surface p-3.5 text-ink no-underline hover:border-line-strong">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name || <span className="num">{phoneLabel(c.display_name)}</span>}</div>
                    <div className="truncate text-[13px] text-muted">{c.name && c.phones?.[0] && <span className="num">{phoneLabel(c.phones[0].number)}</span>}{c.source && ` · ${c.source.name}`}</div>
                  </div>
                  {c.needs_attention && <span title="عنده طلب بده انتباه" className="mt-1.5 size-2 rounded-full bg-accent" />}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[12.5px] text-faint">
                  <Freshness days={daysSince(c.last_contact_at)} />
                  <span>{c.last_contact_at ? `تواصل ${ago(c.last_contact_at)}` : 'ما في تواصل'}</span>
                  <span className="ms-auto">{c.open_deals ? `${c.open_deals} طلب` : ''}{c.properties_count ? ` · ${c.properties_count} عقار` : ''}</span>
                </div>
                {!!c.tags.length && <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t.id}>{t.name}</Badge>)}</div>}
              </Link>
            ))}
          </div>
        )}
        {data && <Pager page={page} count={data.count} onChange={f.setPage} />}
      </div>
      <ContactDialog open={adding} onClose={() => setAdding(false)} onSaved={(c) => navigate(`/contacts/${c.id}`)} />
    </div>
  )
}
