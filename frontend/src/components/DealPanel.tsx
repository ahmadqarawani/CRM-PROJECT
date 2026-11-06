import { useState } from 'react'
import { Link } from 'react-router'
import { useContact, useConvertToFinishing, useDeal, useDocuments, useMatches, useMe, usePayments, useQuotes, useRemove,
  useSaveDeal, useSetMatch, useStages } from '../api/hooks'
import { KIND_LABEL, MATCH_LABEL, QUOTE_LABEL, TEMP_LABEL, ago, money, shortDate, when } from '../lib/format'
import { AttentionBadges, AuditList, DocumentList, PhoneActions, Tabs, Timeline } from './bits'
import { DealDialog, LogDialog, LostDialog, PaymentDialog, PlanDialog, QuoteDialog, UploadDialog } from './forms'
import { Badge, Button, Card, Empty, Select, Spinner, cx } from './ui'

type Tab = 'activity' | 'details' | 'money' | 'files' | 'audit'

/** Phone: full screen. Tablet & laptop: a drawer over the board (a fixed 420px column would squeeze the board to a
 *  couple of columns). Wide screens (≥1536px): a column beside the board. */
const PANEL = cx('panel fixed inset-0 z-30 flex flex-col bg-surface',
  'md:start-auto md:w-[420px] md:border-s md:border-line md:shadow-[0_0_40px_rgb(11_46_74/0.18)]',
  '2xl:static 2xl:z-auto 2xl:flex-none 2xl:shadow-none')

export function DealPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const deal = useDeal(id)
  const me = useMe()
  const d = deal.data
  const contact = useContact(d?.contact.id ?? 0)
  const stages = useStages(d?.pipeline)
  const save = useSaveDeal()
  const convert = useConvertToFinishing()
  const remove = useRemove()
  const docs = useDocuments({ deal: id })
  const [tab, setTab] = useState<Tab>('activity')
  const [dialog, setDialog] = useState<null | 'log' | 'plan' | 'edit' | 'lost' | 'upload' | 'quote' | 'payment'>(null)
  const [logType, setLogType] = useState('CALL')

  if (deal.isError) {
    return (
      <aside className={PANEL}>
        <div className="flex justify-end px-5 pt-4"><button onClick={onClose} className="rounded p-1 text-faint hover:bg-subtle hover:text-ink" aria-label="إغلاق">✕</button></div>
        <div className="p-5"><Empty title="هالطلب مش موجود" hint="يمكن انحذف أو انأرشف. دوّر عليه بالأرشيف." /></div>
      </aside>
    )
  }
  if (deal.isLoading || !d) return <aside className={PANEL}><Spinner /></aside>
  const lost = stages.data?.find((s) => s.type === 'LOST')
  const isDemand = d.kind === 'BUY' || d.kind === 'RENT'
  const tabs: [Tab, string, number?][] = [['activity', 'النشاط'], ['details', isDemand ? 'المواصفات والمطابقة' : 'التفاصيل'],
    ...(d.kind === 'FINISHING' ? [['money', 'الدراسة والدفعات'] as [Tab, string]] : []), ['files', 'الملفات', docs.data?.count], ['audit', 'سجل التعديلات']]

  return (
    <aside className={PANEL}>
      <div className="border-b border-line px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[12px] text-faint">
          <span>{KIND_LABEL[d.kind]}</span><span className="num">#{d.id}</span>
          {d.temperature && <Badge tone={d.temperature === 'HOT' ? 'accent' : 'neutral'}>{TEMP_LABEL[d.temperature]}</Badge>}
          <button onClick={onClose} className="ms-auto rounded p-1 hover:bg-subtle hover:text-ink" aria-label="إغلاق">✕</button>
        </div>
        <h2 className="m-0 mt-0.5 text-[18px] font-semibold text-navy">
          <Link to={`/contacts/${d.contact.id}`} className="text-navy no-underline hover:underline">{d.contact.name}</Link>
        </h2>
        <div className="text-muted">{d.title}{d.location && ` · ${d.location.name}`}</div>
        {contact.data && <div className="mt-2"><PhoneActions c={contact.data} onAfterContact={(t) => { setLogType(t); setTimeout(() => setDialog('log'), 400) }} /></div>}

        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] [overflow-wrap:anywhere] items-center gap-x-3 gap-y-2 text-[13px]">
          <span className="text-faint">المرحلة</span>
          <Select value={d.stage.id} className="h-8" onChange={(e) => {
            const st = stages.data?.find((s) => s.id === Number(e.target.value))
            if (st?.type === 'LOST') setDialog('lost')
            else if (st) save.mutate({ id: d.id, body: { stage_id: st.id } })
          }}>
            {stages.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <span className="text-faint">الخطوة الجاية</span>
          <span className={cx(d.attention_reasons.includes('ACTIVITY_OVERDUE') && 'text-accent-ink')}>
            {d.next_step_at ? when(d.next_step_at) : <span className="text-accent-ink">ما في — حددها</span>}
          </span>
          <span className="text-faint">آخر تواصل</span><span>{ago(d.last_contact_at)}</span>
          <span className="text-faint">المسؤول</span><span>{d.assignee?.name ?? '—'}{d.engineer && ` · المهندس: ${d.engineer.name}`}</span>
          {d.status === 'LOST' && <><span className="text-faint">سبب الخسارة</span><span>{d.lost_reason?.name}{d.lost_notes && ` — ${d.lost_notes}`}</span></>}
        </div>
        <div className="mt-2"><AttentionBadges d={d} /></div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => { setLogType('CALL'); setDialog('log') }}>سجّل تواصل</Button>
          <Button size="sm" onClick={() => setDialog('plan')}>موعد / مهمة</Button>
          <Button size="sm" onClick={() => setDialog('upload')}>رفع ملف</Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>
          {isDemand && d.property && <Button size="sm" variant="ghost" onClick={() => convert.mutate(d.id)}>حوّل لطلب إكساء</Button>}
          {d.status === 'OPEN' && lost && <Button size="sm" variant="ghost" onClick={() => setDialog('lost')}>خسارة</Button>}
          <Button size="sm" variant="ghost" onClick={() => save.mutate({ id: d.id, body: { is_archived: !d.is_archived } })}>{d.is_archived ? 'استرجاع' : 'أرشفة'}</Button>
          {me.data?.can_delete && <Button size="sm" variant="danger" onClick={async () => { if (confirm('حذف الطلب نهائياً؟')) { await remove.mutateAsync(`/api/v1/deals/${d.id}/`); onClose() } }}>حذف</Button>}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 pt-3 pb-6">
        <Tabs value={tab} onChange={setTab} items={tabs} />
        {tab === 'activity' && <Timeline scope={{ deal: d.id }} />}
        {tab === 'details' && <Details id={d.id} />}
        {tab === 'money' && <Money id={d.id} contract={d.contract_amount} paid={d.paid_amount} onQuote={() => setDialog('quote')} onPay={() => setDialog('payment')} />}
        {tab === 'files' && <DocumentList docs={docs.data?.results ?? []} canDelete={me.data?.can_delete} />}
        {tab === 'audit' && <AuditList model="deal" id={d.id} />}
      </div>

      <LogDialog open={dialog === 'log'} onClose={() => setDialog(null)} contactId={d.contact.id} dealId={d.id} initialType={logType} />
      <PlanDialog open={dialog === 'plan'} onClose={() => setDialog(null)} contactId={d.contact.id} dealId={d.id}
        defaultType={d.kind === 'FINISHING' ? 'SITE_VISIT' : 'VIEWING'} />
      <DealDialog open={dialog === 'edit'} onClose={() => setDialog(null)} deal={d} />
      {lost && <LostDialog open={dialog === 'lost'} onClose={() => setDialog(null)} deal={d} lostStageId={lost.id} />}
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} dealId={d.id} />
      <QuoteDialog open={dialog === 'quote'} onClose={() => setDialog(null)} dealId={d.id} />
      <PaymentDialog open={dialog === 'payment'} onClose={() => setDialog(null)} dealId={d.id} />
    </aside>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === '') return null
  return <><span className="text-faint">{k}</span><span>{v}</span></>
}

function Details({ id }: { id: number }) {
  const d = useDeal(id).data!
  const isDemand = d.kind === 'BUY' || d.kind === 'RENT'
  const matches = useMatches(id, isDemand)
  const setMatch = useSetMatch(id)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] [overflow-wrap:anywhere] gap-x-4 gap-y-1.5 text-[13.5px]">
        <Row k="المصدر" v={d.source?.name} />
        <Row k="العنوان" v={d.address} />
        <Row k="القيمة المتوقعة" v={money(d.expected_amount)} />
        <Row k="قيمة العقد" v={money(d.contract_amount)} />
        <Row k="العقار" v={d.property && <Link to={`/properties/${d.property.id}`}>{d.property.code}</Link>} />
        {d.finishing && (<>
          <Row k="الخدمة" v={d.finishing.service_type?.name} />
          <Row k="نوع العقار" v={d.finishing.property_type?.name} />
          <Row k="المساحة" v={d.finishing.area_m2 && `${Number(d.finishing.area_m2)} م²`} />
          <Row k="الحالة الحالية" v={d.finishing.current_level?.name} />
          <Row k="المستوى المطلوب" v={d.finishing.target_level?.name} />
          <Row k="الميزانية" v={[money(d.finishing.budget_min), money(d.finishing.budget_max)].filter(Boolean).join(' – ')} />
          <Row k="الوصف" v={d.finishing.property_note} />
        </>)}
        {d.demand && (<>
          <Row k="الأنواع" v={d.demand.property_types.map((x) => x.name).join('، ')} />
          <Row k="المناطق" v={d.demand.locations.map((x) => x.name).join('، ')} />
          <Row k="الميزانية" v={[money(d.demand.budget_min), money(d.demand.budget_max)].filter(Boolean).join(' – ')} />
          <Row k="المساحة" v={[d.demand.area_min, d.demand.area_max].filter(Boolean).map((x) => Number(x)).join(' – ')} />
          <Row k="الغرف" v={d.demand.rooms_min && `${d.demand.rooms_min}+`} />
          <Row k="الإكساء" v={d.demand.finish_levels.map((x) => x.name).join('، ')} />
          <Row k="ملاحظات" v={d.demand.notes} />
        </>)}
      </div>
      {isDemand && (
        <div>
          <h3 className="m-0 mb-2 text-[13px] font-medium text-muted">عقارات مناسبة ({matches.data?.length ?? 0})</h3>
          {!matches.data?.length ? <Empty title="ما في عقار مطابق حالياً" hint="بس ينضاف عقار مناسب بيبيّن هون" /> : (
            <Card>
              {matches.data.map((m) => {
                const p = m.property as { id: number; code: string; type: string; location: string; area_m2: string; rooms: number; price: string; rent_monthly: string }
                return (
                  <div key={p.id} className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-0">
                    <Link to={`/properties/${p.id}`} className="font-medium">{p.code}</Link>
                    <span className="flex-1 truncate text-muted">{[p.type, p.location, p.area_m2 && `${Number(p.area_m2)}م`, money(p.price || p.rent_monthly)].filter(Boolean).join(' · ')}</span>
                    <Select className="h-7 w-24! text-[12px]" value={m.status ?? ''} onChange={(e) => setMatch.mutate({ property_id: p.id, status: e.target.value as never })}>
                      <option value="">—</option>{Object.entries(MATCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </div>
                )
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Money({ id, contract, paid, onQuote, onPay }: { id: number; contract?: string | null; paid?: string | null; onQuote: () => void; onPay: () => void }) {
  const quotes = useQuotes(id)
  const payments = usePayments(id)
  const remaining = contract ? Number(contract) - Number(paid ?? 0) : null
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center"><h3 className="m-0 text-[13px] font-medium text-muted">الدراسات / عروض الأسعار</h3>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={onQuote}>+ دراسة</Button></div>
        {!quotes.data?.length ? <Empty title="ما في دراسة لسا" /> : (
          <Card>{quotes.data.map((q) => (
            <div key={q.id} className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-0">
              <span className="num">v{q.version}</span><Badge tone={q.status === 'ACCEPTED' ? 'mint' : q.status === 'SENT' ? 'primary' : 'neutral'}>{QUOTE_LABEL[q.status ?? 'DRAFT']}</Badge>
              <span className="num">{money(q.amount)}</span>
              <span className="ms-auto text-faint">{q.sent_at ? `أُرسلت ${shortDate(q.sent_at)}` : ''}</span>
            </div>))}</Card>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-center"><h3 className="m-0 text-[13px] font-medium text-muted">الدفعات</h3>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={onPay}>+ دفعة</Button></div>
        {contract && (
          <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[13px]">
            <Card className="p-2"><div className="text-faint">العقد</div><div className="num">{money(contract)}</div></Card>
            <Card className="p-2"><div className="text-faint">مدفوع</div><div className="num text-mint-ink">{money(paid ?? '0') || '0$'}</div></Card>
            <Card className="p-2"><div className="text-faint">باقي</div><div className={cx('num', remaining && remaining > 0 ? 'text-accent-ink' : '')}>{money(String(remaining ?? 0)) || '0$'}</div></Card>
          </div>
        )}
        {!payments.data?.length ? <Empty title="ما في دفعات" hint={contract ? undefined : 'حط قيمة العقد من "تعديل" لتنحسب الباقي'} /> : (
          <Card>{payments.data.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-x-2 border-b border-line px-3 py-2 text-[13px] last:border-0">
              <span className="num">{money(p.amount)}</span><span className="text-muted">{p.note}</span><span className="num ms-auto text-faint">{shortDate(p.paid_at)}</span>
            </div>))}</Card>
        )}
      </div>
    </div>
  )
}
