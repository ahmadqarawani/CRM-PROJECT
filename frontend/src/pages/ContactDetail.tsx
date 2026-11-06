import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { DealKind } from '../api/client'
import { useActivities, useContact, useDeals, useDocuments, useProperties, useRemove, useSaveContact } from '../api/hooks'
import { accessOf, useAccess } from '../lib/access'
import { AuditList, DealCard, DocumentList, PhoneActions, Tabs, Timeline } from '../components/bits'
import { DealPanel } from '../components/DealPanel'
import { ContactDialog, DealDialog, LogDialog, PlanDialog, PropertyDialog, UploadDialog } from '../components/forms'
import { Badge, Button, Card, Empty, Freshness, Spinner, cx } from '../components/ui'
import { ACTIVITY_LABEL, KIND_LABEL, LISTING_LABEL, PSTATUS_LABEL, ago, daysSince, money, phoneLabel, when } from '../lib/format'

type Tab = 'activity' | 'deals' | 'properties' | 'files' | 'audit'

export function ContactDetail() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'activity'
  const openDeal = Number(params.get('deal')) || null
  const { can } = useAccess()
  const contact = useContact(id)
  const deals = useDeals({ contact: id, page_size: 100, ordering: '-needs_attention,next_step_at' })
  const props = useProperties({ owner: id, page_size: 100 })
  const docs = useDocuments({ contact: id })
  const planned = useActivities({ contact: id, planned: true })
  const save = useSaveContact()
  const remove = useRemove()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<null | 'edit' | 'log' | 'plan' | 'deal' | 'property' | 'upload'>(null)
  const [dealKind, setDealKind] = useState<DealKind>('FINISHING')
  const [logType, setLogType] = useState('CALL')
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params)
    if (v === null) n.delete(k)
    else n.set(k, v)
    setParams(n, { replace: true })
  }

  if (contact.isLoading) return <Spinner />
  if (!contact.data) return <div className="p-6"><Empty title="العميل مش موجود" /></div>
  const c = contact.data
  const a = accessOf(c)
  if (c.merged_into) return <div className="p-6"><Empty title="هالعميل اندمج مع عميل تاني" action={<Link to={`/contacts/${c.merged_into}`}>افتح الكرت الأساسي</Link>} /></div>

  return (
    <div className="flex h-full" data-section="clients">
      <div className="mx-auto w-full max-w-[1180px] min-w-0 flex-1 overflow-auto px-4 py-5 pb-24 md:px-6">
        <div className="mb-1 text-[12.5px] text-faint"><Link to="/contacts" className="text-faint">العملاء</Link> / <span className="num">#{c.id}</span></div>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold text-navy">{c.name || <span className="num">{phoneLabel(c.display_name)}</span>}
              {c.is_archived && <Badge>مؤرشف</Badge>}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
              {c.phones?.slice(1).map((p) => <span key={p.number} className="num">{phoneLabel(p.number)}</span>)}
              {c.source && <span>المصدر: {c.source.name}</span>}
              {c.referred_by && <span>عن طريق: {c.referred_by}</span>}
              {c.assignee && <span>المسؤول: {c.assignee.name}</span>}
              {c.email && <span dir="ltr">{c.email}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PhoneActions c={c} onAfterContact={(t) => { setLogType(t); setTimeout(() => setDialog('log'), 400) }} />
              <span className="flex items-center gap-2 text-[13px] text-muted">آخر تواصل <Freshness days={daysSince(c.last_contact_at)} /> {ago(c.last_contact_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('activities.create') && <Button variant="primary" onClick={() => { setLogType('CALL'); setDialog('log') }}>سجّل تواصل</Button>}
            {can('deals.create') && <>
              <Button onClick={() => { setDealKind('FINISHING'); setDialog('deal') }}>+ طلب إكساء</Button>
              <Button onClick={() => { setDealKind('BUY'); setDialog('deal') }}>+ طلب عقار</Button>
            </>}
            {can('properties.create') && <Button onClick={() => setDialog('property')}>+ عقار يعرضه</Button>}
            {can('documents.upload') && <Button variant="ghost" onClick={() => setDialog('upload')}>رفع ملف</Button>}
            {a.edit && <Button variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>}
            {a.edit && <Button variant="ghost" onClick={() => save.mutate({ id: c.id, body: { is_archived: !c.is_archived } })}>{c.is_archived ? 'استرجاع' : 'أرشفة'}</Button>}
            {a.delete && <Button variant="danger" onClick={async () => {
              if (confirm('حذف العميل نهائياً؟ (ما بيصير إذا عنده طلبات أو عقارات)')) { await remove.mutateAsync(`/api/v1/contacts/${c.id}/`); navigate('/contacts') }
            }}>حذف</Button>}
          </div>
        </div>
        {!!c.tags.length && <div className="mt-2 flex flex-wrap gap-1.5">{c.tags.map((t) => <Badge key={t.id}>{t.name}</Badge>)}</div>}
        {c.notes && <p className="mt-3 mb-0 max-w-3xl whitespace-pre-wrap card rounded-[12px] p-3 text-[13px] text-muted">{c.notes}</p>}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Tabs value={tab} onChange={(t) => setParam('tab', t)} items={[['activity', 'النشاط'], ['deals', 'الطلبات', deals.data?.count],
              ['properties', 'عقاراته', props.data?.count], ['files', 'الملفات', docs.data?.count], ['audit', 'سجل التعديلات']].filter(([k]) => k !== 'audit' || can('audit.view')) as never} />
            {tab === 'activity' && <Timeline scope={{ contact: id }} />}
            {tab === 'deals' && (deals.data?.results.length
              ? <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-2.5">
                  {deals.data.results.map((d) => <DealCard key={d.id} d={d} showStage selected={openDeal === d.id} onClick={() => setParam('deal', String(d.id))} />)}
                </div>
              : <Empty title="ما في طلبات" />)}
            {tab === 'properties' && (props.data?.results.length
              ? <Card>{props.data.results.map((p) => (
                  <Link key={p.id} to={`/properties/${p.id}`} className="flex flex-wrap gap-x-2 gap-y-0.5 border-b border-line px-3.5 py-2.5 text-ink no-underline last:border-0 hover:bg-bg">
                    <b className="num font-medium">{p.code}</b><span className="text-muted">{[p.property_type?.name, p.location?.name, LISTING_LABEL[p.listing ?? 'SALE']].filter(Boolean).join(' · ')}</span>
                    <span className="ms-auto text-[12.5px]">{money(p.price)} · {PSTATUS_LABEL[p.status ?? 'AVAILABLE']}</span>
                  </Link>))}</Card>
              : <Empty title="ما عنده عقارات معروضة" />)}
            {tab === 'files' && <DocumentList docs={docs.data?.results ?? []} />}
            {tab === 'audit' && <AuditList model="contact" id={id} />}
          </div>
          <aside>
            <div className="mb-2.5 flex items-center"><h2 className="m-0 text-[13px] font-medium text-muted">المواعيد والمهام الجاية</h2>
              <button onClick={() => setDialog('plan')} className="ms-auto text-[12.5px] text-primary">+ موعد</button></div>
            <Card>
              {!planned.data?.results.length && <div className="px-4 py-5 text-center text-[13px] text-faint">ما في شي مخطط</div>}
              {planned.data?.results.map((a) => {
                const late = new Date(a.due_at!) < new Date()
                return (
                  <div key={a.id} className={cx('border-b border-line px-3.5 py-2.5 last:border-0', late && 'bg-accent-soft')}>
                    <div className="font-medium">{ACTIVITY_LABEL[a.type]}{a.subject && ` — ${a.subject}`}</div>
                    <div className={cx('text-[12.5px]', late ? 'text-accent-ink' : 'text-muted')}>{when(a.due_at)}{a.deal && ` · ${a.deal.title || KIND_LABEL[a.deal.kind]}`}</div>
                  </div>
                )
              })}
            </Card>
          </aside>
        </div>
      </div>
      {openDeal && <DealPanel id={openDeal} onClose={() => setParam('deal', null)} />}

      <ContactDialog open={dialog === 'edit'} onClose={() => setDialog(null)} contact={c} />
      <LogDialog open={dialog === 'log'} onClose={() => setDialog(null)} contactId={id} initialType={logType} />
      <PlanDialog open={dialog === 'plan'} onClose={() => setDialog(null)} contactId={id} />
      <DealDialog open={dialog === 'deal'} onClose={() => setDialog(null)} kind={dealKind} contact={{ id, name: c.display_name }}
        onSaved={(d) => { setParam('tab', 'deals'); setParam('deal', String(d.id)) }} />
      <PropertyDialog open={dialog === 'property'} onClose={() => setDialog(null)} owner={{ id, name: c.display_name }}
        onSaved={(p) => navigate(`/properties/${p.id}`)} />
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} contactId={id} />
    </div>
  )
}
