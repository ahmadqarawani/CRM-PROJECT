import { useState } from 'react'
import { Link } from 'react-router'
import type { Contact, Deal, Doc } from '../api/client'
import { useAudit, usePatchDocument, useRemove, useTimeline, type TimelineItem } from '../api/hooks'
import { ACTIVITY_LABEL, CATEGORY_LABEL, KIND_LABEL, REASON_LABEL, TEMP_LABEL, bytes, phoneLabel, shortDate, when,
  waLink } from '../lib/format'
import { Avatar, Badge, Dialog, Empty, Select, Spinner, cx } from './ui'

/* ---------- next step footer: the heart of "who needs attention" ---------- */
export function NextStep({ d }: { d: Deal }) {
  if (d.status !== 'OPEN') {
    return (
      <div className={cx('flex items-center gap-1.5 border-t border-line px-3 py-[7px] text-[12.5px]',
        d.status === 'WON' ? 'bg-mint-soft text-mint-ink' : 'bg-subtle text-muted')}>
        {d.status === 'WON' ? 'تمت' : `خسارة${d.lost_reason ? `: ${d.lost_reason.name}` : ''}`}
      </div>
    )
  }
  const late = d.attention_reasons.includes('ACTIVITY_OVERDUE')
  const none = d.attention_reasons.includes('NO_NEXT_STEP')
  const today = d.next_step_at && new Date(d.next_step_at).toDateString() === new Date().toDateString()
  return (
    <div className={cx('flex items-center gap-1.5 border-t px-3 py-[7px] text-[12.5px]',
      late ? 'border-accent-line bg-accent-soft text-accent-ink'
        : none ? 'border-line bg-[#fafbfc] text-accent-ink'
          : today ? 'border-line bg-[#fafbfc] text-primary' : 'border-line bg-[#fafbfc] text-muted')}>
      <span className={cx('size-[7px] flex-none rounded-full', late ? 'bg-accent' : none ? 'bg-accent/60' : today ? 'bg-primary' : 'bg-faint')} />
      {late ? 'متابعة متأخرة' : none ? 'حدد الخطوة الجاية' : 'الخطوة الجاية'}
      <span className="ms-auto text-[11.5px]">{d.next_step_at ? when(d.next_step_at) : d.attention_reasons.includes('STUCK') ? `${d.days_in_stage} يوم بالمرحلة` : ''}</span>
    </div>
  )
}

export function DealCard({ d, selected, onClick, showStage }: { d: Deal; selected?: boolean; onClick?: () => void; showStage?: boolean }) {
  return (
    <article onClick={onClick}
      className={cx('cursor-pointer overflow-hidden rounded-card border bg-surface transition-colors',
        selected ? 'border-primary shadow-[0_0_0_3px_rgb(10_90_156/0.1)]' : 'border-line hover:border-line-strong')}>
      <div className="px-3 pt-2.5 pb-2.5">
        <h3 className="m-0 truncate text-[14px] font-medium">{d.contact.name}</h3>
        <div className="truncate text-[13px] text-muted">{d.title || KIND_LABEL[d.kind]}</div>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
          {d.pipeline === 'BROKERAGE' && <Badge>{KIND_LABEL[d.kind]}</Badge>}
          {d.temperature === 'HOT' && <Badge tone="accent">{TEMP_LABEL.HOT}</Badge>}
          {showStage && <Badge tone="primary">{d.stage.name}</Badge>}
          <span className="num">#{d.id}</span>
          {d.assignee && <span className="ms-auto"><Avatar name={d.assignee.name} size={22} /></span>}
        </div>
      </div>
      <NextStep d={d} />
    </article>
  )
}

export function AttentionBadges({ d }: { d: Deal }) {
  if (!d.needs_attention) return null
  return <div className="flex flex-wrap gap-1.5">{d.attention_reasons.map((r) => <Badge key={r} tone="accent">{REASON_LABEL[r]}</Badge>)}</div>
}

/* ---------- call / WhatsApp on every card ---------- */
export function PhoneActions({ c, onAfterContact }: { c: Pick<Contact, 'phones'>; onAfterContact?: (type: 'CALL' | 'WHATSAPP') => void }) {
  const p = c.phones?.[0]
  if (!p) return null
  return (
    <span className="inline-flex gap-1.5">
      <a href={`tel:${p.number}`} onClick={() => onAfterContact?.('CALL')}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink no-underline hover:border-line-strong">
        ☎ <span className="num">{phoneLabel(p.number)}</span>
      </a>
      {p.has_whatsapp && (
        <a href={waLink(p.number)} target="_blank" rel="noreferrer" onClick={() => onAfterContact?.('WHATSAPP')}
          className="inline-flex h-8 items-center rounded-md border border-[#bfe5d6] bg-mint-soft px-2.5 text-[13px] text-mint-ink no-underline">
          واتساب
        </a>
      )}
    </span>
  )
}

/* ---------- timeline ---------- */
export function Timeline({ scope }: { scope: { contact?: number; deal?: number; property?: number } }) {
  const tl = useTimeline(scope)
  if (tl.isLoading) return <Spinner />
  if (!tl.data?.length) return <Empty title="ما في نشاط لسا" hint="سجّل أول تواصل" />
  return (
    <ol className="relative m-0 list-none p-0 before:absolute before:inset-y-1.5 before:start-[7px] before:w-px before:bg-line">
      {tl.data.map((it) => <TimelineRow key={`${it.kind}${it.id}`} it={it} />)}
    </ol>
  )
}

function TimelineRow({ it }: { it: TimelineItem }) {
  if (it.kind === 'document') {
    return (
      <li className="relative ps-[26px] pb-4">
        <span className="absolute start-0 top-[3px] size-[15px] rounded-full border-[1.5px] border-navy bg-surface" />
        <div className="flex items-baseline gap-2"><b className="font-medium">رفع {CATEGORY_LABEL[it.category]}</b>
          <span className="num ms-auto text-faint">{shortDate(it.at)}</span></div>
        <a href={it.url} target="_blank" rel="noreferrer" className="text-[13px] text-primary">{it.name}</a>
      </li>
    )
  }
  const planned = !it.done_at && it.due_at
  const late = planned && new Date(it.due_at!) < new Date()
  const ring = it.type === 'SYSTEM' ? 'border-mint bg-mint-soft' : planned ? 'border-dashed border-accent' : 'border-primary'
  return (
    <li className="relative ps-[26px] pb-4">
      <span className={cx('absolute start-0 top-[3px] size-[15px] rounded-full border-[1.5px] bg-surface', ring)} />
      <div className="flex items-baseline gap-2">
        <b className="font-medium">{it.type === 'SYSTEM' ? it.subject : `${ACTIVITY_LABEL[it.type]}${it.subject ? ` · ${it.subject}` : ''}`}</b>
        {planned && <Badge tone={late ? 'accent' : 'primary'}>{late ? 'متأخرة' : 'مخطط'} {when(it.due_at)}</Badge>}
        <span className="num ms-auto text-faint">{shortDate(it.at)}</span>
      </div>
      {it.notes && <p className="m-0 mt-0.5 whitespace-pre-wrap text-muted">{it.notes}</p>}
      {it.outcome && <p className="m-0 mt-0.5 text-[13px] text-ink">النتيجة: {it.outcome}</p>}
      <div className="mt-0.5 text-[12px] text-faint">{it.created_by?.name}{it.deal && ` · ${it.deal.title || KIND_LABEL[it.deal.kind]}`}</div>
    </li>
  )
}

/* ---------- audit log ---------- */
export function AuditList({ model, id }: { model: 'contact' | 'deal' | 'property'; id: number }) {
  const q = useAudit(model, id)
  if (q.isLoading) return <Spinner />
  if (!q.data?.length) return <Empty title="ما في تعديلات مسجّلة" />
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {q.data.map((e, i) => (
        <li key={i} className="border-b border-line py-2 last:border-0">
          <div className="flex gap-2"><b className="font-medium">{e.by}</b><span className="text-faint">{e.action}</span>
            <span className="num ms-auto text-faint">{shortDate(e.at)} {new Date(e.at).toTimeString().slice(0, 5)}</span></div>
          <div className="mt-0.5 text-muted">
            {(e.changes ?? []).map((c) => (
              <div key={c.field}>
                <span className="text-ink">{c.field}</span>:{' '}
                {c.old && <><span className="line-through">{c.old}</span> ← </>}{c.new}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- documents ---------- */
export function DocumentList({ docs, canDelete }: { docs: Doc[]; canDelete?: boolean }) {
  const [preview, setPreview] = useState<Doc | null>(null)
  const patch = usePatchDocument()
  const remove = useRemove()
  if (!docs.length) return <Empty title="ما في ملفات" hint="ارفع الصور والمخططات والعقود والدراسات" />
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-2.5">
        {docs.map((d) => (
          <div key={d.id} className="group flex items-center gap-2.5 rounded-md border border-line bg-surface p-2.5 hover:border-line-strong">
            <button onClick={() => setPreview(d)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
              {d.content_type.startsWith('image/')
                ? <img src={d.url} alt="" className="size-[34px] flex-none rounded object-cover" loading="lazy" />
                : <span className="grid h-[34px] w-[28px] flex-none place-items-end justify-center rounded-[3px] border border-line-strong pb-[3px] font-mono text-[9px] text-danger">PDF</span>}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{d.original_name}</span>
                <span className="text-[12px] text-faint">{CATEGORY_LABEL[d.category ?? 'OTHER']} · <span className="num">{bytes(d.size_bytes)}</span></span>
              </span>
            </button>
            <button title="أرشفة" onClick={() => patch.mutate({ id: d.id, body: { is_archived: true } })}
              className="rounded p-1 text-faint hover:bg-subtle hover:text-ink [@media(hover:hover)]:invisible [@media(hover:hover)]:group-hover:visible [@media(hover:hover)]:group-focus-within:visible">⌫</button>
            {canDelete && (
              <button title="حذف نهائي" onClick={() => confirm(`حذف "${d.original_name}" نهائياً؟`) && remove.mutate(`/api/v1/documents/${d.id}/`)}
                className="rounded p-1 text-faint hover:text-danger [@media(hover:hover)]:invisible [@media(hover:hover)]:group-hover:visible [@media(hover:hover)]:group-focus-within:visible">✕</button>
            )}
          </div>
        ))}
      </div>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.original_name ?? ''} wide>
        {preview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Select className="w-48!" value={preview.category}
                onChange={(e) => {
                  const category = e.target.value as Doc['category']
                  patch.mutate({ id: preview.id, body: { category } })
                  setPreview({ ...preview, category })
                }}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <a href={preview.url} target="_blank" rel="noreferrer" className="ms-auto text-[13px] text-primary">فتح بتاب جديد</a>
            </div>
            {preview.content_type === 'application/pdf'
              ? <iframe src={preview.url} title={preview.original_name} className="h-[68vh] w-full rounded border border-line" />
              : <img src={preview.url} alt={preview.original_name} className="max-h-[68vh] w-full rounded border border-line object-contain" />}
          </div>
        )}
      </Dialog>
    </>
  )
}

export function ContactLink({ id, name }: { id: number; name: string }) {
  return <Link to={`/contacts/${id}`} className="text-primary no-underline hover:underline">{name}</Link>
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, number?][] }) {
  return (
    <div className="mb-4 flex gap-4 overflow-x-auto border-b border-line [scrollbar-width:thin] sm:gap-5">
      {items.map(([k, label, n]) => (
        <button key={k} onClick={() => onChange(k)}
          className={cx('-mb-px flex-none border-b-2 pb-2', value === k ? 'border-navy font-medium text-navy' : 'border-transparent text-muted hover:text-ink')}>
          {label} {n !== undefined && <span className="num text-faint">{n}</span>}
        </button>
      ))}
    </div>
  )
}
