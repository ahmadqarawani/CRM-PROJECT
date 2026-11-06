import { Link } from 'react-router'
import { useContacts, useDeals, useProperties, useSaveContact, useSaveDeal, useSaveProperty } from '../api/hooks'
import { Button, Card, Chip, Empty, PAGE_SIZE, PageHeader, Pager, Spinner } from '../components/ui'
import { KIND_LABEL, shortDate } from '../lib/format'
import { accessOf } from '../lib/access'
import { useUrlFilters } from '../lib/url'

type T = 'contacts' | 'deals' | 'properties'
const TABS: [T, string][] = [['contacts', 'العملاء'], ['deals', 'الطلبات'], ['properties', 'العقارات']]

export function Archive() {
  const f = useUrlFilters()
  const t = (f.get('t') as T) || 'contacts'
  const q = { archived: true, page: f.page, page_size: PAGE_SIZE }
  const contacts = useContacts(q, t === 'contacts')
  const deals = useDeals(q, t === 'deals')
  const props = useProperties(q, t === 'properties')
  const sc = useSaveContact()
  const sd = useSaveDeal()
  const sp = useSaveProperty()
  const current = t === 'contacts' ? contacts : t === 'deals' ? deals : props
  const rows = t === 'contacts'
    ? contacts.data?.results.map((c) => ({ id: c.id, title: c.display_name, sub: c.source?.name ?? '', at: c.updated_at, to: `/contacts/${c.id}`, restore: accessOf(c).edit ? () => sc.mutate({ id: c.id, body: { is_archived: false } }) : null }))
    : t === 'deals'
      ? deals.data?.results.map((d) => ({ id: d.id, title: `${d.contact.name} — ${d.title || KIND_LABEL[d.kind]}`, sub: d.stage.name, at: d.updated_at, to: `/${d.pipeline === 'FINISHING' ? 'finishing' : 'real-estate'}?open=${d.id}`, restore: accessOf(d).edit ? () => sd.mutate({ id: d.id, body: { is_archived: false } }) : null }))
      : props.data?.results.map((p) => ({ id: p.id, title: `${p.code} — ${p.property_type?.name ?? ''}`, sub: p.owner.name, at: p.updated_at, to: `/properties/${p.id}`, restore: accessOf(p).edit ? () => sp.mutate({ id: p.id, body: { is_archived: false } }) : null }))
  return (
    <div className="mx-auto max-w-[860px] pb-24">
      <PageHeader title="الأرشيف" sub="المؤرشف بيضل محفوظ، وبترجعه بكبسة" />
      <div className="flex flex-wrap gap-2 border-b border-line px-4 pb-3.5 md:px-6">
        {TABS.map(([k, label]) => <Chip key={k} on={t === k} onClick={() => f.set('t', k === 'contacts' ? null : k)}>{label}</Chip>)}
      </div>
      <div className="px-4 py-4 md:px-6">
        {current.isLoading ? <Spinner /> : !rows?.length ? <Empty title="الأرشيف فاضي" /> : (
          <Card>{rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-line/80 px-4 py-2.5 transition-colors last:border-0 hover:bg-white/70">
              <Link to={r.to} className="min-w-0 flex-1 text-ink no-underline hover:text-primary">
                <span className="block truncate">{r.title}</span><span className="block truncate text-[12.5px] text-faint">{r.sub}</span>
              </Link>
              <span className="num hidden text-[12px] text-faint sm:inline">{shortDate(r.at)}</span>
              {r.restore && <Button size="sm" onClick={r.restore}>استرجاع</Button>}
            </div>))}</Card>
        )}
        {current.data && <Pager page={f.page} count={current.data.count} onChange={f.setPage} />}
      </div>
    </div>
  )
}
