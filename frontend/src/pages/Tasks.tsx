import { useState } from 'react'
import type { Task } from '../api/client'
import { useDeleteTask, useSaveTask, useTasks } from '../api/hooks'
import { TaskDialog } from '../components/forms'
import { Avatar, Button, Card, Chip, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { when } from '../lib/format'

type View = 'mine' | 'all' | 'done'

export function Tasks() {
  const [view, setView] = useState<View>('mine')
  const tasks = useTasks(view === 'done' ? { done: true, ordering: '-due_at' } : { done: false, ...(view === 'mine' ? { assignee: 'me' } : {}) })
  const save = useSaveTask()
  const del = useDeleteTask()
  const [edit, setEdit] = useState<Task | 'new' | null>(null)
  const now = new Date()

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="المهام" actions={<Button variant="primary" onClick={() => setEdit('new')}>+ مهمة</Button>} />
      <div className="flex gap-2 border-b border-line px-6 pb-3.5">
        <Chip on={view === 'mine'} onClick={() => setView('mine')}>مهامي</Chip>
        <Chip on={view === 'all'} onClick={() => setView('all')}>كل الفريق</Chip>
        <Chip on={view === 'done'} onClick={() => setView('done')}>المنتهية</Chip>
      </div>
      <div className="px-6 py-4">
        {tasks.isLoading ? <Spinner /> : !tasks.data?.results.length ? <Empty title="ما في مهام" /> : (
          <Card>
            {tasks.data.results.map((t) => {
              const late = !t.is_done && new Date(t.due_at) < now
              return (
                <div key={t.id} className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <input type="checkbox" checked={!!t.is_done} className="accent-[var(--color-primary)]"
                    onChange={() => save.mutate({ id: t.id, body: { is_done: !t.is_done } })} />
                  <button onClick={() => setEdit(t)} className="flex-1 text-start">
                    <span className={cx('block', t.is_done && 'text-faint line-through')}>{t.title}</span>
                    <span className={cx('text-[12.5px]', late ? 'text-accent-ink' : 'text-faint')}>{when(t.due_at)}</span>
                  </button>
                  {t.assignee && <Avatar name={t.assignee.name} size={24} />}
                  <button onClick={() => confirm('حذف المهمة؟') && del.mutate(t.id)}
                    className="invisible rounded p-1 text-faint group-hover:visible hover:text-danger">✕</button>
                </div>
              )
            })}
          </Card>
        )}
      </div>
      <TaskDialog open={edit !== null} onClose={() => setEdit(null)} task={edit && edit !== 'new' ? edit : undefined} />
    </div>
  )
}
