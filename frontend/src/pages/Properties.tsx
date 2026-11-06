import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Property } from '../api/client'
import { useCatalog, useProperties } from '../api/hooks'
import { PropertyDialog } from '../components/forms'
import { Badge, Button, Chip, Empty, Input, PAGE_SIZE, PageHeader, Pager, Select, Spinner } from '../components/ui'
import { LISTING_LABEL, PSTATUS_LABEL, floorLabel, money } from '../lib/format'
import { useAccess } from '../lib/access'
import { useUrlFilters } from '../lib/url'

const STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD', 'all'] as const

export function Properties() {
  const f = useUrlFilters()
  const [search, setSearch] = useState(f.get('q') ?? '')
  const status = f.get('status') ?? 'AVAILABLE'
  const ptype = f.num('type')
  const loc = f.num('location')
  const types = useCatalog('property-types')
  const { can } = useAccess()
  const locations = useCatalog('locations')
  const props = useProperties({
    search: f.get('q') || undefined, status: status === 'all' ? undefined : status, property_type: ptype, location: loc,
    page: f.page, page_size: PAGE_SIZE,
  })
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const rows = props.data?.results ?? []
  return (
    <div className="pb-24 md:pb-6" data-section="realestate">
      <PageHeader title="العقارات المعروضة" sub={props.data && <><span className="num">{props.data.count}</span> عقار</>}
        actions={can('properties.create') && <Button variant="primary" onClick={() => setAdding(true)}>+ عقار</Button>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3.5 md:px-6">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); f.set('q', e.target.value) }} placeholder="كود أو عنوان…" className="w-full sm:w-52" />
        <Select className="w-auto min-w-32 flex-1 sm:flex-none" value={ptype ?? ''} onChange={(e) => f.set('type', e.target.value)}>
          <option value="">كل الأنواع</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select className="w-auto min-w-32 flex-1 sm:flex-none" value={loc ?? ''} onChange={(e) => f.set('location', e.target.value)}>
          <option value="">كل المناطق</option>{locations.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {STATUSES.map((s) => (
          <Chip key={s} on={status === s} onClick={() => f.set('status', s === 'AVAILABLE' ? null : s)}>{s === 'all' ? 'الكل' : PSTATUS_LABEL[s]}</Chip>
        ))}
      </div>
      <div className="px-4 py-4 md:px-6">
        {props.isLoading ? <Spinner /> : !rows.length ? <Empty title="ما في عقارات" /> : (<>
          {/* phones: cards; wider screens: the table */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((p) => <PropertyCard key={p.id} p={p} />)}
          </div>
          <div className="card hidden overflow-hidden rounded-[12px] md:block">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[15%]" /><col className="w-[9%]" />
                <col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[15%]" /><col className="w-[10%]" />
              </colgroup>
              <thead><tr className="border-b border-line bg-bg/70 text-[12.5px] text-muted">
                {['الكود', 'النوع', 'المنطقة', 'المساحة', 'الغرف / الطابق', 'السعر', 'المالك', 'الحالة'].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/properties/${p.id}`)} className="cursor-pointer border-b border-line/80 transition-colors last:border-0 hover:bg-primary-soft/50">
                    <td className="truncate px-3 py-2.5"><Link to={`/properties/${p.id}`} className="num font-medium">{p.code}</Link>{p.legacy_code && <div className="num truncate text-[11.5px] text-faint">{p.legacy_code}</div>}</td>
                    <td className="truncate px-3 py-2.5">{p.property_type?.name ?? '—'}<div className="text-[12px] text-faint">{LISTING_LABEL[p.listing ?? 'SALE']}</div></td>
                    <td className="truncate px-3 py-2.5">{p.location?.name ?? '—'}</td>
                    <td className="truncate px-3 py-2.5">{p.area_m2 ? <><span className="num">{Number(p.area_m2)}</span> م²</> : '—'}</td>
                    <td className="truncate px-3 py-2.5 text-muted">{roomsFloor(p)}</td>
                    <td className="truncate px-3 py-2.5"><span className="num">{money(p.price) || money(p.rent_monthly)}</span>{!p.price && p.price_note && <div className="truncate text-[12px] text-faint">{p.price_note}</div>}</td>
                    <td className="truncate px-3 py-2.5"><Link to={`/contacts/${p.owner.id}`} onClick={(e) => e.stopPropagation()} className="text-muted no-underline hover:text-primary">{p.owner.name}</Link></td>
                    <td className="px-3 py-2.5"><Badge tone={p.status === 'AVAILABLE' ? 'mint' : 'neutral'}>{PSTATUS_LABEL[p.status ?? 'AVAILABLE']}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
        {props.data && <Pager page={f.page} count={props.data.count} onChange={f.setPage} />}
      </div>
      <PropertyDialog open={adding} onClose={() => setAdding(false)} onSaved={(p) => navigate(`/properties/${p.id}`)} />
    </div>
  )
}

const roomsFloor = (p: Property) => [p.rooms && `${p.rooms} غرف`, floorLabel(p.floor)].filter(Boolean).join(' · ') || '—'

function PropertyCard({ p }: { p: Property }) {
  return (
    <Link to={`/properties/${p.id}`} className="card lift block rounded-[12px] p-3 text-ink no-underline">
      <div className="flex items-center gap-2">
        <b className="num font-medium text-primary">{p.code}</b>
        <span className="min-w-0 flex-1 truncate">{[p.property_type?.name, p.location?.name].filter(Boolean).join(' — ')}</span>
        <Badge tone={p.status === 'AVAILABLE' ? 'mint' : 'neutral'}>{PSTATUS_LABEL[p.status ?? 'AVAILABLE']}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-muted">
        <span>{LISTING_LABEL[p.listing ?? 'SALE']}</span>
        {p.area_m2 && <span><span className="num">{Number(p.area_m2)}</span> م²</span>}
        {roomsFloor(p) !== '—' && <span>{roomsFloor(p)}</span>}
        <span className="num ms-auto font-medium text-ink">{money(p.price) || money(p.rent_monthly) || p.price_note}</span>
      </div>
      <div className="mt-1 truncate text-[12.5px] text-faint">المالك: {p.owner.name}</div>
    </Link>
  )
}
