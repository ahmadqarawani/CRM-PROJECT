import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Request, Stage } from '../api/client'
import { K, useRequests, useSaveRequest, useStages } from '../api/hooks'
import { RequestCard } from '../components/bits'
import { FollowUpDialog, RequestDialog } from '../components/forms'
import { RequestPanel } from '../components/RequestPanel'
import { Button, Chip, Dot, PageHeader, Spinner, cx } from '../components/ui'
import { longDate } from '../lib/format'

type Filter = 'all' | 'mine' | 'overdue'

export function Board() {
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('open')) || null
  const filter = (params.get('f') as Filter) ?? 'all'
  const stages = useStages()
  const query = useMemo(() => ({
    page_size: 200,
    ordering: '-is_overdue,next_follow_up_at',
    ...(filter === 'mine' ? { assignee: 'me' } : {}),
    ...(filter === 'overdue' ? { overdue: true } : {}),
  }), [filter])
  const requests = useRequests(query)
  const save = useSaveRequest()
  const qc = useQueryClient()
  const [newIn, setNewIn] = useState<number | 'any' | null>(null)
  const [pending, setPending] = useState<{ req: Request; stage: Stage } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const byStage = useMemo(() => {
    const m = new Map<number, Request[]>()
    for (const r of requests.data?.results ?? []) m.set(r.stage.id, [...(m.get(r.stage.id) ?? []), r])
    return m
  }, [requests.data])

  const listKey = [...K.requests, query]

  /** Optimistic move: card jumps now; on error it goes back and the message shows. */
  const move = async (req: Request, stage: Stage, followUp?: string) => {
    setError(null)
    const prev = qc.getQueryData(listKey)
    qc.setQueryData(listKey, (old: typeof requests.data) => old && {
      ...old,
      results: old.results.map((x) => (x.id === req.id ? { ...x, stage: { id: stage.id, name: stage.name, color: stage.color } } : x)),
    })
    try {
      await save.mutateAsync({ id: req.id, body: { stage_id: stage.id, ...(followUp ? { next_follow_up_at: followUp } : {}) } })
    } catch (e) {
      qc.setQueryData(listKey, prev)
      setError((e as Error).message)
      throw e
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    const req = e.active.data.current?.req as Request | undefined
    const stage = e.over?.data.current?.stage as Stage | undefined
    if (!req || !stage || req.stage.id === stage.id) return
    if (stage.requires_follow_up) setPending({ req, stage })
    else move(req, stage).catch(() => {})
  }

  const overdue = requests.data?.results.filter((r) => r.is_overdue).length ?? 0

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="الطلبات"
          sub={<>{longDate()}{overdue > 0 && <> · <span className="text-accent">{overdue} متابعات متأخرة</span></>}</>}
          actions={<Button variant="primary" onClick={() => setNewIn('any')}>+ طلب جديد</Button>}
        />
        <div className="flex items-center gap-2 border-b border-line px-6 pb-3.5">
          <Chip on={filter === 'all'} onClick={() => setParam('f', null)}>كل الطلبات</Chip>
          <Chip on={filter === 'mine'} onClick={() => setParam('f', 'mine')}>طلباتي</Chip>
          <Chip on={filter === 'overdue'} onClick={() => setParam('f', 'overdue')}><Dot color="var(--color-accent)" />المتأخر فقط</Chip>
          {error && <span className="ms-3 text-[13px] text-danger">{error}</span>}
          <span className="ms-auto text-[13px] text-faint">المتأخر أولاً، بعدين حسب موعد المتابعة · اسحب البطاقة لتنقلها</span>
        </div>

        {stages.isLoading || requests.isLoading ? <Spinner /> : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex flex-1 items-start gap-3.5 overflow-auto px-6 pt-4 pb-6">
              {stages.data?.map((s) => (
                <Column key={s.id} stage={s} items={byStage.get(s.id) ?? []} selected={openId}
                  onOpen={(id) => setParam('open', String(id))} onAdd={() => setNewIn(s.id)} />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {openId && <RequestPanel id={openId} onClose={() => setParam('open', null)} />}

      <RequestDialog
        open={newIn !== null}
        onClose={() => setNewIn(null)}
        stageId={typeof newIn === 'number' ? newIn : undefined}
        onSaved={(r) => setParam('open', String(r.id))}
      />
      <FollowUpDialog
        open={!!pending}
        stageName={pending?.stage.name}
        onClose={() => setPending(null)}
        onSubmit={(iso) => move(pending!.req, pending!.stage, iso)}
      />
    </div>
  )
}

function Column({ stage, items, selected, onOpen, onAdd }: {
  stage: Stage; items: Request[]; selected: number | null; onOpen: (id: number) => void; onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}`, data: { stage } })
  const late = items.filter((r) => r.is_overdue).length
  return (
    <section ref={setNodeRef} className={cx('flex w-[268px] flex-none flex-col rounded-[10px] p-1 transition-colors', isOver && 'bg-primary-soft')}>
      <div className="flex items-center gap-2 px-1 pt-0.5 pb-2.5">
        <Dot color={stage.color ?? '#9aa7b4'} />
        <b className="font-medium">{stage.name}</b>
        <span className="num text-[12px] text-faint">{items.length}</span>
        {late > 0 && <span className="ms-auto text-[12px] text-accent">{late} متأخر</span>}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((r) => <DraggableCard key={r.id} r={r} selected={selected === r.id} onOpen={() => onOpen(r.id)} />)}
        {!stage.closes_as && (
          <button onClick={onAdd} className="h-[34px] rounded-card border border-dashed border-line-strong text-faint hover:border-primary hover:text-primary">+ إضافة</button>
        )}
      </div>
    </section>
  )
}

function DraggableCard({ r, selected, onOpen }: { r: Request; selected: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `req-${r.id}`, data: { req: r } })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cx(isDragging && 'relative z-20 rotate-1 opacity-90 shadow-lg')}
    >
      <RequestCard r={r} selected={selected} onClick={onOpen} />
    </div>
  )
}
