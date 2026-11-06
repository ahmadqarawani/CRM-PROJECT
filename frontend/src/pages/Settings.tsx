import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Stage } from '../api/client'
import { useDeleteStage, useSaveStage, useStages } from '../api/hooks'
import { Badge, Button, Card, Dialog, Dot, Field, FormError, Input, PageHeader, Select, Spinner } from '../components/ui'
import { applyServerErrors } from '../lib/forms'

export function Settings() {
  const stages = useStages(true)
  const save = useSaveStage()
  const del = useDeleteStage()
  const [edit, setEdit] = useState<Stage | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const swap = async (a: Stage, b: Stage) => {
    await save.mutateAsync({ id: a.id, body: { order: b.order } })
    await save.mutateAsync({ id: b.id, body: { order: a.order } })
  }

  const list = stages.data ?? []
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="مراحل الطلبات" sub="المدة المسموحة بكل مرحلة هي اللي بتحدد إذا الطلب متأخر"
        actions={<Button variant="primary" onClick={() => setEdit('new')}>+ مرحلة</Button>} />
      <div className="px-6 py-2">
        {error && <FormError message={error} />}
        {stages.isLoading ? <Spinner /> : (
          <Card className="mt-2">
            {list.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => swap(s, list[i - 1])} className="text-faint hover:text-ink disabled:opacity-30">▲</button>
                  <button disabled={i === list.length - 1} onClick={() => swap(s, list[i + 1])} className="text-faint hover:text-ink disabled:opacity-30">▼</button>
                </div>
                <Dot color={s.color ?? '#999'} />
                <span className={s.is_active ? '' : 'text-faint line-through'}>{s.name}</span>
                {s.requires_follow_up && <Badge tone="primary">بدها موعد متابعة</Badge>}
                {s.closes_as === 'WON' && <Badge tone="mint">بتسكّر: تم</Badge>}
                {s.closes_as === 'LOST' && <Badge tone="danger">بتسكّر: ملغي</Badge>}
                <span className="ms-auto text-[13px] text-muted">{s.sla_days ? <><span className="num">{s.sla_days}</span> يوم مسموح</> : 'بلا حد'}</span>
                <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>تعديل</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  setError(null)
                  try { await del.mutateAsync(s.id) } catch (e) { setError(`${(e as Error).message} — فيك توقّفها بدل الحذف`) }
                }}>حذف</Button>
              </div>
            ))}
          </Card>
        )}
      </div>
      <StageDialog open={edit !== null} stage={edit && edit !== 'new' ? edit : undefined} nextOrder={(list.at(-1)?.order ?? 0) + 1}
        onClose={() => setEdit(null)} />
    </div>
  )
}

type F = { name: string; color: string; sla_days: string; requires_follow_up: boolean; closes_as: '' | 'WON' | 'LOST'; is_active: boolean; root?: string }

function StageDialog({ open, stage, nextOrder, onClose }: { open: boolean; stage?: Stage; nextOrder: number; onClose: () => void }) {
  const save = useSaveStage()
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<F>()
  useEffect(() => {
    if (open) reset({
      name: stage?.name ?? '', color: stage?.color ?? '#64748b', sla_days: stage?.sla_days?.toString() ?? '',
      requires_follow_up: stage?.requires_follow_up ?? false, closes_as: (stage?.closes_as ?? '') as F['closes_as'], is_active: stage?.is_active ?? true,
    })
  }, [open, stage, reset])
  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: stage?.id,
        body: { name: v.name, color: v.color, sla_days: v.sla_days ? Number(v.sla_days) : null, requires_follow_up: v.requires_follow_up,
          closes_as: v.closes_as, is_active: v.is_active, ...(stage ? {} : { order: nextOrder }) },
      })
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['name', 'color', 'sla_days', 'closes_as'])
    }
  })
  return (
    <Dialog open={open} onClose={onClose} title={stage ? 'تعديل المرحلة' : 'مرحلة جديدة'}
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="الاسم" error={errors.name?.message} className="col-span-2"><Input {...register('name', { required: 'مطلوب' })} /></Field>
        <Field label="اللون" error={errors.color?.message}><Input type="color" className="p-1" {...register('color')} /></Field>
        <Field label="الأيام المسموحة" hint="فاضي = بلا حد" error={errors.sla_days?.message}><Input dir="ltr" inputMode="numeric" {...register('sla_days')} /></Field>
        <Field label="بتسكّر الطلب؟" error={errors.closes_as?.message} className="col-span-2">
          <Select {...register('closes_as')}><option value="">لأ، مرحلة عادية</option><option value="WON">نعم: تم</option><option value="LOST">نعم: ملغي</option></Select>
        </Field>
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" {...register('requires_follow_up')} />ما بينقل الطلب لهون بدون موعد متابعة</label>
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" {...register('is_active')} />فعّالة (بتبيّن بالـ Kanban)</label>
        <div className="col-span-2"><FormError message={errors.root?.message} /></div>
      </form>
    </Dialog>
  )
}
