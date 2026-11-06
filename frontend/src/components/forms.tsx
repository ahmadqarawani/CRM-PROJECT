import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { uploadDocument, type Apartment, type Client, type Request, type Task } from '../api/client'
import { K, useApartments, useClients, useLogActivity, useRequests, useSaveApartment, useSaveClient, useSaveRequest,
  useSaveTask, useStages, useUsers } from '../api/hooks'
import { CATEGORY_LABEL, fromLocalInput, toLocalInput } from '../lib/format'
import { applyServerErrors } from '../lib/forms'
import { Button, Dialog, Field, FormError, Input, Select, Textarea } from './ui'

/* Only light UX checks here (required). All real validation is the backend's. */

/* ---------- Client ---------- */
type ClientF = { name: string; phone: string; whatsapp: string; email: string; city: string; source: string; tags: string; notes: string; root?: string }

export function ClientDialog({ open, onClose, client, onSaved }: {
  open: boolean; onClose: () => void; client?: Client; onSaved?: (c: Client) => void
}) {
  const save = useSaveClient()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ClientF>()
  useEffect(() => {
    if (open) reset({
      name: client?.name ?? '', phone: client?.phone ?? '', whatsapp: client?.whatsapp ?? '', email: client?.email ?? '',
      city: client?.city ?? '', source: client?.source ?? '', tags: (client?.tags ?? []).join('، '), notes: client?.notes ?? '',
    })
  }, [open, client, reset])

  const submit = handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        id: client?.id,
        body: {
          name: v.name, phone: v.phone || null, whatsapp: v.whatsapp, email: v.email, city: v.city, source: v.source,
          notes: v.notes, tags: v.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean),
        },
      })
      onSaved?.(saved as Client)
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['name', 'phone', 'whatsapp', 'email', 'city', 'source', 'tags', 'notes'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={client ? 'تعديل العميل' : 'عميل جديد'}
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="الاسم" error={errors.name?.message} className="col-span-2">
          <Input autoFocus {...register('name', { required: 'الاسم مطلوب' })} />
        </Field>
        <Field label="الهاتف" error={errors.phone?.message}><Input dir="ltr" {...register('phone')} /></Field>
        <Field label="واتساب" error={errors.whatsapp?.message}><Input dir="ltr" {...register('whatsapp')} /></Field>
        <Field label="الإيميل" error={errors.email?.message}><Input dir="ltr" type="email" {...register('email')} /></Field>
        <Field label="المدينة" error={errors.city?.message}><Input {...register('city')} /></Field>
        <Field label="المصدر" hint="إحالة، فيسبوك، معرفة…" error={errors.source?.message}><Input {...register('source')} /></Field>
        <Field label="وسوم" hint="مفصولة بفاصلة" error={errors.tags?.message}><Input {...register('tags')} /></Field>
        <Field label="ملاحظات" className="col-span-2" error={errors.notes?.message}><Textarea {...register('notes')} /></Field>
        <div className="col-span-2"><FormError message={errors.root?.message} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/* ---------- Apartment ---------- */
type AptF = { client_id: string; title: string; address: string; floor: string; area_m2: string; rooms: string; notes: string; root?: string }

export function ApartmentDialog({ open, onClose, apartment, clientId }: {
  open: boolean; onClose: () => void; apartment?: Apartment; clientId?: number
}) {
  const save = useSaveApartment()
  const clients = useClients({ page_size: 200 })
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<AptF>()
  useEffect(() => {
    if (open) reset({
      client_id: String(apartment?.client.id ?? clientId ?? ''), title: apartment?.title ?? '', address: apartment?.address ?? '',
      floor: apartment?.floor ?? '', area_m2: apartment?.area_m2 ?? '', rooms: apartment?.rooms?.toString() ?? '', notes: apartment?.notes ?? '',
    })
  }, [open, apartment, clientId, reset])

  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: apartment?.id,
        body: {
          ...(apartment ? {} : { client_id: Number(v.client_id) }),
          title: v.title, address: v.address, floor: v.floor, notes: v.notes,
          area_m2: v.area_m2 || null, rooms: v.rooms ? Number(v.rooms) : null,
        },
      })
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['client_id', 'title', 'address', 'floor', 'area_m2', 'rooms', 'notes'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={apartment ? 'تعديل الشقة' : 'شقة جديدة'}
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="العميل" error={errors.client_id?.message} className="col-span-2">
          <Select disabled={!!apartment || !!clientId} {...register('client_id', { required: 'اختار العميل' })}>
            <option value="">—</option>
            {clients.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="اسم الشقة" hint="مثلاً: المزة، بناء 4" error={errors.title?.message} className="col-span-2">
          <Input {...register('title', { required: 'مطلوب' })} />
        </Field>
        <Field label="العنوان" error={errors.address?.message} className="col-span-2"><Input {...register('address')} /></Field>
        <Field label="الطابق" error={errors.floor?.message}><Input {...register('floor')} /></Field>
        <Field label="المساحة م²" error={errors.area_m2?.message}><Input dir="ltr" inputMode="decimal" {...register('area_m2')} /></Field>
        <Field label="عدد الغرف" error={errors.rooms?.message}><Input dir="ltr" inputMode="numeric" {...register('rooms')} /></Field>
        <Field label="ملاحظات" className="col-span-2" error={errors.notes?.message}><Textarea {...register('notes')} /></Field>
        <div className="col-span-2"><FormError message={errors.root?.message} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/* ---------- Request ---------- */
type ReqF = { title: string; client_id: string; apartment_id: string; stage_id: string; priority: string; budget: string;
  next_follow_up_at: string; assignee_id: string; description: string; root?: string }

export function RequestDialog({ open, onClose, request, clientId, apartmentId, stageId, onSaved }: {
  open: boolean; onClose: () => void; request?: Request; clientId?: number; apartmentId?: number; stageId?: number
  onSaved?: (r: Request) => void
}) {
  const save = useSaveRequest()
  const stages = useStages()
  const users = useUsers()
  const clients = useClients({ page_size: 200 })
  const { register, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting } } = useForm<ReqF>()
  const selectedClient = Number(watch('client_id')) || 0
  const apartments = useApartments({ client: selectedClient, page_size: 100 }, !!selectedClient)

  useEffect(() => {
    if (open) reset({
      title: request?.title ?? '', client_id: String(request?.client.id ?? clientId ?? ''),
      apartment_id: String(request?.apartment?.id ?? apartmentId ?? ''), stage_id: String(request?.stage.id ?? stageId ?? ''),
      priority: request?.priority ?? 'NORMAL', budget: request?.budget ?? '',
      next_follow_up_at: toLocalInput(request?.next_follow_up_at), assignee_id: String(request?.assignee?.id ?? ''),
      description: request?.description ?? '',
    })
  }, [open, request, clientId, apartmentId, stageId, reset])

  const submit = handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        id: request?.id,
        body: {
          title: v.title,
          ...(request ? {} : { client_id: Number(v.client_id) }),
          apartment_id: v.apartment_id ? Number(v.apartment_id) : null,
          ...(v.stage_id ? { stage_id: Number(v.stage_id) } : {}),
          priority: v.priority as Request['priority'],
          budget: v.budget || null,
          next_follow_up_at: fromLocalInput(v.next_follow_up_at),
          assignee_id: v.assignee_id ? Number(v.assignee_id) : null,
          description: v.description,
        },
      })
      onSaved?.(saved as Request)
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['title', 'client_id', 'apartment_id', 'stage_id', 'priority', 'budget', 'next_follow_up_at', 'assignee_id', 'description'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={request ? 'تعديل الطلب' : 'طلب جديد'} wide
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="عنوان الطلب" error={errors.title?.message} className="col-span-2">
          <Input autoFocus {...register('title', { required: 'مطلوب' })} placeholder="مثلاً: إكساء شقة كاملة" />
        </Field>
        <Field label="العميل" error={errors.client_id?.message}>
          <Select disabled={!!request || !!clientId} {...register('client_id', { required: 'اختار العميل' })}>
            <option value="">—</option>
            {clients.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="الشقة" error={errors.apartment_id?.message}>
          <Select disabled={!selectedClient} {...register('apartment_id')}>
            <option value="">بدون</option>
            {apartments.data?.results.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </Select>
        </Field>
        <Field label="المرحلة" error={errors.stage_id?.message}>
          <Select {...register('stage_id')}>
            {!request && <option value="">أول مرحلة</option>}
            {stages.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="موعد المتابعة الجاية" error={errors.next_follow_up_at?.message}>
          <Input type="datetime-local" dir="ltr" {...register('next_follow_up_at')} />
        </Field>
        <Field label="الأولوية" error={errors.priority?.message}>
          <Select {...register('priority')}>
            <option value="LOW">منخفضة</option><option value="NORMAL">عادية</option><option value="HIGH">عاجل</option>
          </Select>
        </Field>
        <Field label="المسؤول" error={errors.assignee_id?.message}>
          <Select {...register('assignee_id')}>
            <option value="">بدون</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="الميزانية" error={errors.budget?.message}><Input dir="ltr" inputMode="decimal" {...register('budget')} /></Field>
        <Field label="التفاصيل" className="col-span-2" error={errors.description?.message}><Textarea {...register('description')} /></Field>
        <div className="col-span-2"><FormError message={errors.root?.message} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/* ---------- Activity (تسجيل تواصل) ---------- */
type ActF = { type: 'CALL' | 'WHATSAPP' | 'VISIT' | 'NOTE'; body: string; request_id: string; root?: string }

export function ActivityDialog({ open, onClose, clientId, requestId }: {
  open: boolean; onClose: () => void; clientId: number; requestId?: number
}) {
  const log = useLogActivity()
  const requests = useRequests({ client: clientId, status: 'OPEN', page_size: 100 }, open && !requestId)
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ActF>()
  useEffect(() => {
    if (open) reset({ type: 'CALL', body: '', request_id: String(requestId ?? '') })
  }, [open, requestId, reset])

  const submit = handleSubmit(async (v) => {
    try {
      await log.mutateAsync({ type: v.type, body: v.body, client_id: clientId, request_id: v.request_id ? Number(v.request_id) : null })
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['type', 'body', 'request_id'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title="سجّل تواصل"
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5">
          {(['CALL', 'WHATSAPP', 'VISIT', 'NOTE'] as const).map((t) => (
            <label key={t} className="cursor-pointer">
              <input type="radio" value={t} {...register('type')} className="peer sr-only" />
              <span className="block rounded-md border border-line py-1.5 text-center text-[13px] text-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary">
                {{ CALL: 'مكالمة', WHATSAPP: 'واتساب', VISIT: 'زيارة', NOTE: 'ملاحظة' }[t]}
              </span>
            </label>
          ))}
        </div>
        {!requestId && (
          <Field label="الطلب (اختياري)" error={errors.request_id?.message}>
            <Select {...register('request_id')}>
              <option value="">عام للعميل</option>
              {requests.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="شو صار؟" error={errors.body?.message}><Textarea data-autofocus rows={4} {...register("body")} /></Field>
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  )
}


/* ---------- Task ---------- */
type TaskF = { title: string; due_at: string; assignee_id: string; root?: string }

export function TaskDialog({ open, onClose, task, clientId, requestId }: {
  open: boolean; onClose: () => void; task?: Task; clientId?: number; requestId?: number
}) {
  const save = useSaveTask()
  const users = useUsers()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<TaskF>()
  useEffect(() => {
    if (open) reset({
      title: task?.title ?? '', due_at: toLocalInput(task?.due_at ?? new Date(Date.now() + 86400000).toISOString()),
      assignee_id: String(task?.assignee?.id ?? ''),
    })
  }, [open, task, reset])

  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: task?.id,
        body: {
          title: v.title, due_at: fromLocalInput(v.due_at)!,
          ...(v.assignee_id ? { assignee_id: Number(v.assignee_id) } : {}),
          ...(task ? {} : { client_id: clientId ?? null, request_id: requestId ?? null }),
        },
      })
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['title', 'due_at', 'assignee_id'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={task ? 'تعديل المهمة' : 'مهمة جديدة'}
      footer={<><Button variant="primary" onClick={submit} disabled={isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="المهمة" error={errors.title?.message}><Input autoFocus {...register('title', { required: 'مطلوب' })} /></Field>
        <Field label="الموعد" error={errors.due_at?.message}><Input type="datetime-local" dir="ltr" {...register('due_at', { required: 'مطلوب' })} /></Field>
        <Field label="لمين" hint="فاضي = إلك" error={errors.assignee_id?.message}>
          <Select {...register('assignee_id')}>
            <option value="">إلي</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  )
}

/* ---------- Upload ---------- */
export function UploadDialog({ open, onClose, clientId, apartmentId, requestId }: {
  open: boolean; onClose: () => void; clientId?: number; apartmentId?: number; requestId?: number
}) {
  const qc = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState('OTHER')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [drag, setDrag] = useState(false)
  useEffect(() => {
    if (open) { setFiles([]); setErrors([]); setCategory('OTHER') }
  }, [open])

  const send = async () => {
    setBusy(true)
    const failed: string[] = []
    for (const f of files) {
      const form = new FormData()
      form.append('file', f)
      form.append('category', category)
      if (apartmentId) form.append('apartment_id', String(apartmentId))
      if (requestId) form.append('request_id', String(requestId))
      if (clientId && !apartmentId && !requestId) form.append('client_id', String(clientId))
      try {
        await uploadDocument(form)
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setBusy(false)
    qc.invalidateQueries({ queryKey: K.documents })
    qc.invalidateQueries({ queryKey: K.timeline })
    if (failed.length) setErrors(failed)
    else onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="رفع ملفات"
      footer={<><Button variant="primary" onClick={send} disabled={busy || files.length === 0}>{busy ? 'عم يرفع…' : `رفع ${files.length || ''}`}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFiles([...files, ...Array.from(e.dataTransfer.files)]) }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed px-4 py-8 text-center ${drag ? 'border-primary bg-primary-soft' : 'border-line-strong bg-bg'}`}
        >
          <span className="font-medium">اسحب الملفات لهون أو اضغط لتختار</span>
          <span className="text-[12.5px] text-faint">PDF أو صور (JPG, PNG, WEBP)</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        {files.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5">
                <span className="truncate">{f.name}</span>
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ms-auto text-faint hover:text-danger">✕</button>
              </li>
            ))}
          </ul>
        )}
        <Field label="التصنيف">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {errors.length > 0 && <FormError message={errors.join(' — ')} />}
      </div>
    </Dialog>
  )
}

/* ---------- moving into a stage that needs a follow-up date ---------- */
export function FollowUpDialog({ open, stageName, onClose, onSubmit }: {
  open: boolean; stageName?: string; onClose: () => void; onSubmit: (iso: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) { setValue(toLocalInput(new Date(Date.now() + 2 * 86400000).toISOString())); setError(null) }
  }, [open])
  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit(fromLocalInput(value)!)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={`نقل لمرحلة "${stageName ?? ''}"`}
      footer={<><Button variant="primary" onClick={submit} disabled={busy || !value}>نقل</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-muted">هالمرحلة بدها موعد متابعة، لحتى النظام يذكّرك إذا ما رد العميل.</p>
        <Field label="موعد المتابعة"><Input type="datetime-local" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <FormError message={error ?? undefined} />
      </div>
    </Dialog>
  )
}
