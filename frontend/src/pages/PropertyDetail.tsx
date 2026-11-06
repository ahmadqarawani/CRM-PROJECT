import { Fragment, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useDeals, useDocuments, useProperty, usePropertyDemands, useRemove, useSaveProperty } from '../api/hooks'
import { accessOf, useAccess } from '../lib/access'
import { AuditList, DealCard, DocumentList, Tabs, Timeline } from '../components/bits'
import { DealDialog, LogDialog, PropertyDialog, UploadDialog } from '../components/forms'
import { Badge, Button, Card, Empty, Spinner } from '../components/ui'
import { BUILDING_LABEL, KIND_LABEL, LISTING_LABEL, OWNER_ROLE_LABEL, PSTATUS_LABEL, floorLabel, money, shortDate } from '../lib/format'

type Tab = 'photos' | 'details' | 'demands' | 'activity' | 'audit'

export function PropertyDetail() {
  const id = Number(useParams().id)
  const { can } = useAccess()
  const prop = useProperty(id)
  const docs = useDocuments({ property: id })
  const demands = usePropertyDemands(id)
  const deals = useDeals({ property: id, page_size: 50 })
  const save = useSaveProperty()
  const remove = useRemove()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('photos')
  const [dialog, setDialog] = useState<null | 'edit' | 'upload' | 'log' | 'sell'>(null)
  if (prop.isLoading) return <Spinner />
  if (!prop.data) return <div className="p-6"><Empty title="العقار مش موجود" /></div>
  const p = prop.data
  const a = accessOf(p)
  const photos = docs.data?.results.filter((d) => d.content_type.startsWith('image/')) ?? []
  const facts: [string, React.ReactNode][] = [
    ['النوع', p.property_type?.name], ['العرض', LISTING_LABEL[p.listing ?? 'SALE']], ['المنطقة', p.location?.name], ['العنوان', p.address],
    ['المساحة', p.area_m2 && `${Number(p.area_m2)} م²${p.area_note ? ` (${p.area_note})` : ''}`], ['الغرف', p.rooms ?? p.layout_note], ['الحمامات', p.bathrooms],
    ['الطابق', floorLabel(p.floor) || p.floor_note], ['حالة البناء', p.building_state && BUILDING_LABEL[p.building_state]], ['الإكساء', p.finish_level?.name],
    ['الإضافات', p.features.map((f) => f.name).join('، ')], ['الملكية', p.ownership_type?.name], ['سعر البيع', money(p.price)],
    ['الإيجار الشهري', money(p.rent_monthly)], ['ملاحظة السعر', p.price_note], ['العمولة', p.commission_pct && `${Number(p.commission_pct)}%`],
    ['تاريخ العرض', p.listed_at && shortDate(p.listed_at)], ['المسؤول', p.assignee?.name],
  ]
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 pb-24 md:px-6" data-section="realestate">
      <div className="mb-1 text-[12.5px] text-faint"><Link to="/properties" className="text-faint">العقارات</Link> / <span className="num">{p.code}</span>{p.legacy_code && <span className="num"> ({p.legacy_code})</span>}</div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold text-navy">{p.property_type?.name ?? 'عقار'} {p.location && `— ${p.location.name}`}
            <Badge tone={p.status === 'AVAILABLE' ? 'mint' : 'neutral'}>{PSTATUS_LABEL[p.status ?? 'AVAILABLE']}</Badge></h1>
          <div className="mt-1 text-muted">{OWNER_ROLE_LABEL[p.owner_role ?? 'OWNER']}: <Link to={`/contacts/${p.owner.id}`}>{p.owner.name}</Link>
            {p.price && <span className="num ms-3 font-medium text-ink">{money(p.price)}</span>}</div>
          {!!p.tags.length && <div className="mt-2 flex flex-wrap gap-1.5">{p.tags.map((t) => <Badge key={t.id} tone="accent">{t.name}</Badge>)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {can('documents.upload') && <Button variant="primary" onClick={() => setDialog('upload')}>رفع صور / مخططات</Button>}
          {can('activities.create') && <Button onClick={() => setDialog('log')}>سجّل تواصل مع المالك</Button>}
          {can('deals.create') && <Button onClick={() => setDialog('sell')}>+ صفقة بيع</Button>}
          {a.edit && <Button variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>}
          {a.edit && <Button variant="ghost" onClick={() => save.mutate({ id: p.id, body: { is_archived: !p.is_archived } })}>{p.is_archived ? 'استرجاع' : 'أرشفة'}</Button>}
          {a.delete && <Button variant="danger" onClick={async () => { if (confirm('حذف العقار نهائياً؟')) { await remove.mutateAsync(`/api/v1/properties/${p.id}/`); navigate('/properties') } }}>حذف</Button>}
        </div>
      </div>

      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} items={[['photos', 'الصور والملفات', docs.data?.count], ['details', 'التفاصيل'], ['demands', 'زبائن مناسبين', demands.data?.length], ['activity', 'النشاط'], ['audit', 'سجل التعديلات']].filter(([k]) => k !== 'audit' || can('audit.view')) as never} />
        {tab === 'photos' && (<>
          {photos.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((ph) => <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer"><img src={ph.url} alt={ph.original_name} loading="lazy" className="aspect-[4/3] w-full rounded-card object-cover" /></a>)}
            </div>
          )}
          <DocumentList docs={docs.data?.results ?? []} />
        </>)}
        {tab === 'details' && (
          <Card className="p-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[14px] [overflow-wrap:anywhere] sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              {facts.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => <Fragment key={k}><span className="text-faint">{k}</span><span>{v}</span></Fragment>)}
            </div>
            {p.description && <p className="mt-4 mb-0 whitespace-pre-wrap text-muted">{p.description}</p>}
          </Card>
        )}
        {tab === 'demands' && (<>
          {!demands.data?.length ? <Empty title="ما في طلب شراء/إيجار مفتوح بيناسب هالعقار" /> : (
            <Card>{demands.data.map((d) => (
              <Link key={d.deal_id} to={`/real-estate?open=${d.deal_id}`} className="flex flex-wrap gap-x-2 gap-y-0.5 border-b border-line px-3.5 py-2.5 text-ink no-underline last:border-0 hover:bg-bg">
                <b className="font-medium">{d.contact}</b><span className="text-muted">{d.title}</span><Badge className="ms-auto">{KIND_LABEL[d.kind]}</Badge>
              </Link>))}</Card>
          )}
          {!!deals.data?.results.length && (<>
            <h3 className="mt-5 mb-2 text-[13px] font-medium text-muted">صفقات على هالعقار</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-2.5">
              {deals.data.results.map((d) => <DealCard key={d.id} d={d} showStage onClick={() => navigate(`/real-estate?open=${d.id}`)} />)}
            </div>
          </>)}
        </>)}
        {tab === 'activity' && <Timeline scope={{ property: id }} />}
        {tab === 'audit' && <AuditList model="property" id={id} />}
      </div>

      <PropertyDialog open={dialog === 'edit'} onClose={() => setDialog(null)} property={p} />
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} propertyId={p.id} />
      <LogDialog open={dialog === 'log'} onClose={() => setDialog(null)} contactId={p.owner.id} propertyId={p.id} />
      <DealDialog open={dialog === 'sell'} onClose={() => setDialog(null)} kind={p.listing === 'RENT' ? 'LEASE' : 'SELL'}
        contact={{ id: p.owner.id, name: p.owner.name }} onSaved={(d) => navigate(`/real-estate?open=${d.id}`)} />
    </div>
  )
}
