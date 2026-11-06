import { useState } from 'react'
import { Link } from 'react-router'
import type { Doc, Request } from '../api/client'
import { usePatchDocument, useTimeline, type TimelineItem } from '../api/hooks'
import { ACTIVITY_LABEL, CATEGORY_LABEL, bytes, shortDate, when } from '../lib/format'
import { Avatar, Badge, Dialog, Empty, Select, Spinner, cx } from './ui'

/* ---------- the "next step" footer — the core of "who is late" ---------- */
export function NextStep({ r }: { r: Request }) {
  const today = r.next_follow_up_at && new Date(r.next_follow_up_at).toDateString() === new Date().toDateString()
  const label = r.is_overdue
    ? r.overdue_reasons.includes('FOLLOWUP_DUE') ? 'المتابعة متأخرة'
      : r.overdue_reasons.includes('NO_CONTACT') ? 'ما في تواصل من فترة' : 'طوّل بهالمرحلة'
    : r.next_follow_up_at ? 'متابعة' : 'ما في موعد متابعة'
  return (
    <div className={cx('flex items-center gap-1.5 border-t px-3 py-[7px] text-[12.5px]',
      r.is_overdue ? 'border-accent-line bg-accent-soft text-accent-ink'
        : today ? 'border-line bg-[#fafbfc] text-primary' : 'border-line bg-[#fafbfc] text-muted')}>
      <span className={cx('size-[7px] flex-none rounded-full', r.is_overdue ? 'bg-accent' : today ? 'bg-primary' : 'bg-faint')} />
      {label}
      <span className="ms-auto text-[11.5px]">{when(r.next_follow_up_at) || (r.is_overdue ? `${r.days_in_stage} يوم بالمرحلة` : '')}</span>
    </div>
  )
}

export function RequestCard({ r, selected, onClick, showStage }: { r: Request; selected?: boolean; onClick?: () => void; showStage?: boolean }) {
  return (
    <article
      onClick={onClick}
      className={cx('cursor-pointer overflow-hidden rounded-card border bg-surface transition-colors',
        selected ? 'border-primary shadow-[0_0_0_3px_rgb(10_90_156/0.1)]' : 'border-line hover:border-line-strong')}
    >
      <div className="px-3 pt-2.5 pb-2.5">
        <h3 className="m-0 text-[14px] font-medium">{r.title}</h3>
        <div className="text-[13px] text-muted">{r.client.name}{r.apartment ? ` · ${r.apartment.title}` : ''}</div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-faint">
          {r.priority === 'HIGH' && <Badge tone="accent">عاجل</Badge>}
          {showStage && <Badge>{r.stage.name}</Badge>}
          <span className="num">#{r.id}</span>
          {r.assignee && <span className="ms-auto"><Avatar name={r.assignee.name} size={22} /></span>}
        </div>
      </div>
      <NextStep r={r} />
    </article>
  )
}

/* ---------- timeline ---------- */
export function Timeline({ client, request }: { client?: number; request?: number }) {
  const tl = useTimeline(client ? { client } : { request })
  if (tl.isLoading) return <Spinner />
  if (!tl.data?.length) return <Empty title="ما في نشاط لسا" hint="سجّل أول تواصل مع العميل" />
  return (
    <ol className="relative m-0 list-none p-0 before:absolute before:inset-y-1.5 before:start-[7px] before:w-px before:bg-line">
      {tl.data.map((it) => <TimelineRow key={`${it.kind}${it.id}`} it={it} />)}
    </ol>
  )
}

function TimelineRow({ it }: { it: TimelineItem }) {
  const ring = it.kind === 'stage_change' ? 'border-mint bg-mint-soft' : it.kind === 'document' ? 'border-navy' : it.type === 'NOTE' ? 'border-line-strong' : 'border-primary'
  return (
    <li className="relative ps-[26px] pb-4">
      <span className={cx('absolute start-0 top-[3px] size-[15px] rounded-full border-[1.5px] bg-surface', ring)} />
      <div className="flex items-baseline gap-2">
        <b className="font-medium">
          {it.kind === 'activity' && ACTIVITY_LABEL[it.type]}
          {it.kind === 'stage_change' && (it.from_stage ? 'انتقل لمرحلة' : 'طلب جديد')}
          {it.kind === 'document' && `رفع ${CATEGORY_LABEL[it.category]}`}
        </b>
        {it.kind === 'stage_change' && <Badge tone="mint">{it.to_stage}</Badge>}
        <span className="num ms-auto text-faint">{shortDate(it.at)}</span>
      </div>
      {it.kind === 'activity' && it.body && <p className="m-0 mt-0.5 whitespace-pre-wrap text-muted">{it.body}</p>}
      {it.kind === 'document' && <div className="mt-0.5 text-[13px] text-muted">{it.name}</div>}
      {it.by && <div className="mt-0.5 text-[12px] text-faint">{it.by.name}</div>}
    </li>
  )
}

/* ---------- documents ---------- */
export function DocumentList({ docs }: { docs: Doc[] }) {
  const [preview, setPreview] = useState<Doc | null>(null)
  const patch = usePatchDocument()
  if (!docs.length) return <Empty title="ما في ملفات" hint="ارفع العقد، عرض السعر، المخطط أو الصور" />
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        {docs.map((d) => (
          <div key={d.id} className="group flex items-center gap-2.5 rounded-md border border-line bg-surface p-2.5 hover:border-line-strong">
            <button onClick={() => setPreview(d)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
              <FileIcon type={d.content_type} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{d.original_name}</span>
                <span className="text-[12px] text-faint">{CATEGORY_LABEL[d.category ?? 'OTHER']} · <span className="num">{bytes(d.size_bytes)}</span> · <span className="num">{shortDate(d.created_at)}</span></span>
              </span>
            </button>
            <button
              title="أرشفة"
              onClick={() => confirm(`أرشفة "${d.original_name}"؟`) && patch.mutate({ id: d.id, body: { is_archived: true } })}
              className="invisible rounded p-1 text-faint group-hover:visible hover:bg-subtle hover:text-ink"
            >⌫</button>
          </div>
        ))}
      </div>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.original_name ?? ''} wide>
        {preview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Select
                className="w-44!"
                value={preview.category}
                onChange={(e) => {
                  const category = e.target.value as Doc['category']
                  patch.mutate({ id: preview.id, body: { category } })
                  setPreview({ ...preview, category })
                }}
              >
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

function FileIcon({ type }: { type: string }) {
  const pdf = type === 'application/pdf'
  return (
    <span className={cx('grid h-[34px] w-[28px] flex-none place-items-end justify-center rounded-[3px] border pb-[3px] font-mono text-[9px]',
      pdf ? 'border-line-strong text-danger' : 'border-line-strong text-primary')}>
      {pdf ? 'PDF' : 'IMG'}
    </span>
  )
}

export function ClientLink({ id, name }: { id: number; name: string }) {
  return <Link to={`/clients/${id}`} className="text-ink no-underline hover:text-primary hover:underline">{name}</Link>
}
