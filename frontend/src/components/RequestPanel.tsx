import { useState } from 'react'
import { Link } from 'react-router'
import { useDocuments, useRequest, useSaveRequest, useStages } from '../api/hooks'
import { REASON_LABEL, ago, money, when } from '../lib/format'
import { DocumentList, Timeline } from './bits'
import { ActivityDialog, FollowUpDialog, RequestDialog, TaskDialog, UploadDialog } from './forms'
import { Badge, Button, Select, Spinner, cx } from './ui'

/** Right-hand detail panel for one request (used on the board and from notifications). */
export function RequestPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const req = useRequest(id)
  const stages = useStages()
  const save = useSaveRequest()
  const docs = useDocuments({ request: id })
  const [tab, setTab] = useState<'activity' | 'files'>('activity')
  const [dialog, setDialog] = useState<null | 'activity' | 'edit' | 'task' | 'upload'>(null)
  const [pendingStage, setPendingStage] = useState<number | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  if (req.isLoading || !req.data) return <aside className="w-[400px] flex-none border-s border-line bg-surface"><Spinner /></aside>
  const r = req.data

  const moveTo = async (stageId: number) => {
    setMoveError(null)
    const target = stages.data?.find((s) => s.id === stageId)
    if (target?.requires_follow_up) return setPendingStage(stageId) // ask for the date first
    try {
      await save.mutateAsync({ id: r.id, body: { stage_id: stageId } })
    } catch (e) {
      setMoveError((e as Error).message)
    }
  }

  return (
    <aside className="flex w-[400px] flex-none flex-col border-s border-line bg-surface">
      <div className="border-b border-line px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[12px] text-faint">
          <span>طلب</span><span className="num">#{r.id}</span>
          <button onClick={onClose} className="ms-auto rounded p-1 hover:bg-subtle hover:text-ink" aria-label="إغلاق">✕</button>
        </div>
        <h2 className="m-0 mt-0.5 text-[18px] font-semibold text-navy">{r.title}</h2>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-muted">
          <Link to={`/clients/${r.client.id}`} className="text-primary no-underline hover:underline">{r.client.name}</Link>
          {r.apartment && <Link to={`/apartments/${r.apartment.id}`} className="text-muted no-underline hover:underline">{r.apartment.title}</Link>}
          {r.budget && <span className="num">{money(r.budget)}</span>}
        </div>

        <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
          <span className="text-faint">المرحلة</span>
          <Select value={r.stage.id} onChange={(e) => moveTo(Number(e.target.value))} className="h-8">
            {stages.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <span className="text-faint">المتابعة</span>
          <span className={cx(r.is_overdue && r.overdue_reasons.includes('FOLLOWUP_DUE') && 'text-accent-ink')}>
            {r.next_follow_up_at ? when(r.next_follow_up_at) : 'ما في موعد'}
            <button onClick={() => setDialog('edit')} className="ms-2 text-primary hover:underline">تغيير</button>
          </span>
          <span className="text-faint">آخر تواصل</span>
          <span>{ago(r.last_contact_at)}</span>
          <span className="text-faint">بالمرحلة</span>
          <span><span className="num">{r.days_in_stage}</span> يوم</span>
        </div>
        {r.is_overdue && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.overdue_reasons.map((x) => <Badge key={x} tone="accent">{REASON_LABEL[x]}</Badge>)}
          </div>
        )}
        {moveError && <div className="mt-2 text-[12.5px] text-danger">{moveError}</div>}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setDialog('activity')}>سجّل تواصل</Button>
          <Button size="sm" onClick={() => setDialog('task')}>مهمة</Button>
          <Button size="sm" onClick={() => setDialog('upload')}>رفع ملف</Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>
        </div>
      </div>

      <div className="flex gap-5 border-b border-line px-5">
        {(['activity', 'files'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cx('-mb-px border-b-2 pt-2.5 pb-2', tab === t ? 'border-navy font-medium text-navy' : 'border-transparent text-muted')}>
            {t === 'activity' ? 'النشاط' : <>الملفات <span className="num text-faint">{docs.data?.count ?? ''}</span></>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto px-5 py-4">
        {r.description && <p className="m-0 mb-4 whitespace-pre-wrap rounded-md bg-bg p-3 text-[13px] text-muted">{r.description}</p>}
        {tab === 'activity' ? <Timeline request={r.id} /> : <DocumentList docs={docs.data?.results ?? []} />}
      </div>

      <ActivityDialog open={dialog === 'activity'} onClose={() => setDialog(null)} clientId={r.client.id} requestId={r.id} />
      <RequestDialog open={dialog === 'edit'} onClose={() => setDialog(null)} request={r} />
      <TaskDialog open={dialog === 'task'} onClose={() => setDialog(null)} clientId={r.client.id} requestId={r.id} />
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} requestId={r.id} apartmentId={r.apartment?.id} />
      <FollowUpDialog
        open={pendingStage !== null}
        stageName={stages.data?.find((s) => s.id === pendingStage)?.name}
        onClose={() => setPendingStage(null)}
        onSubmit={async (iso) => { await save.mutateAsync({ id: r.id, body: { stage_id: pendingStage!, next_follow_up_at: iso } }) }}
      />
    </aside>
  )
}
