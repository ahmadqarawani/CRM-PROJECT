import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { uploadDocument, type Contact, type Deal, type DealKind, type Lookup, type Property } from '../api/client'
import { K, useCatalog, useContacts, usePhoneCheck, useProperties, useSaveActivity, useSaveContact, useSaveDeal,
  useSavePayment, useSaveProperty, useSaveQuote, useStages, useUsers, type CatalogSlug } from '../api/hooks'
import { ACTIVITY_LABEL, BUILDING_LABEL, CATEGORY_LABEL, KIND_LABEL, LISTING_LABEL, OWNER_ROLE_LABEL, PSTATUS_LABEL,
  QUOTE_LABEL, TEMP_LABEL, fromLocalInput, inDays, money, toLocalInput } from '../lib/format'
import { useAccess } from '../lib/access'
import { applyServerErrors } from '../lib/forms'
import { Button, Dialog, Field, FormError, Input, Select, Textarea, cx } from './ui'

const footer = (submit: () => void, busy: boolean, close: () => void, label = 'حفظ') => (
  <><Button variant="primary" onClick={submit} disabled={busy}>{label}</Button><Button variant="ghost" onClick={close}>إلغاء</Button></>
)
const num = (v: string | null | undefined) => (v === '' || v === undefined ? null : v)
type Errs = Record<string, string[]>
const errsOf = (e: unknown): Errs => (e as { errors?: Errs }).errors ?? { root: [(e as Error).message] }
const firstErr = (e: Errs) => e.root?.[0] ?? e.non_field_errors?.[0] ?? Object.values(e)[0]?.[0]

/* ---------- building blocks ---------- */
export function LookupSelect({ slug, value, onChange, placeholder = '—' }: {
  slug: CatalogSlug; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string
}) {
  const q = useCatalog(slug)
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {q.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </Select>
  )
}

export function ChipsMulti({ options, value, onChange }: { options: Lookup[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
      {options.map((o) => {
        const on = value.includes(o.id)
        return (
          <button type="button" key={o.id} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={cx('h-7 rounded-full border px-2.5 text-[13px]', on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:border-line-strong')}>
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

export function LookupMulti({ slug, value, onChange }: { slug: CatalogSlug; value: number[]; onChange: (v: number[]) => void }) {
  const q = useCatalog(slug)
  return <ChipsMulti options={q.data ?? []} value={value} onChange={onChange} />
}

export function UserSelect({ value, onChange, placeholder = 'بدون' }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string }) {
  const users = useUsers()
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </Select>
  )
}

/** Search-as-you-type contact picker (hundreds of contacts). */
export function ContactPicker({ value, onChange, disabled }: { value: { id: number; name: string } | null; onChange: (c: { id: number; name: string } | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const res = useContacts({ search: q, page_size: 8 })
  const looksLikePhone = /^[+\d\s()-]+$/.test(q.trim())
  if (value) {
    return (
      <div className="flex h-[34px] items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-sm">
        <span className="flex-1 truncate">{value.name}</span>
        {!disabled && <button type="button" onClick={() => onChange(null)} className="text-faint hover:text-ink">تغيير</button>}
      </div>
    )
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب الاسم أو الرقم…" />
      {q.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto glass rounded-card">
          {res.data?.results.map((c) => (
            <button type="button" key={c.id} onClick={() => onChange({ id: c.id, name: c.display_name })} className="block w-full px-3 py-2 text-start hover:bg-bg">
              {c.display_name} <span className="num text-[12px] text-faint">{c.phones?.[0]?.number}</span>
            </button>
          ))}
          {res.data?.results.length === 0 && <div className="px-3 py-2 text-[13px] text-faint">ما في نتائج</div>}
          {res.data && (
            <button type="button" onClick={() => setCreating(true)} className="block w-full border-t border-line px-3 py-2 text-start text-primary hover:bg-bg">
              + عميل جديد «{q.trim()}»
            </button>
          )}
        </div>
      )}
      {/* portal: the picker sits inside a <label>, which would hijack clicks inside a nested dialog */}
      {creating && createPortal(
        <ContactDialog open onClose={() => setCreating(false)}
          initial={looksLikePhone ? { phone: q.trim() } : { name: q.trim() }}
          onSaved={(c) => { setQ(''); onChange({ id: c.id, name: c.display_name }) }} />, document.body)}
    </div>
  )
}

/** Search-as-you-type property picker: there can be hundreds of listings. With an owner, lists theirs straight away. */
function PropertyPicker({ value, label, owner, onChange }: {
  value: number | null; label: string; owner?: number; onChange: (id: number | null, label: string) => void
}) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const show = focused && (q.trim().length >= 1 || !!owner)
  const res = useProperties({ search: q.trim() || undefined, owner, page_size: 8 }, show)
  if (value) {
    return (
      <div className="flex h-[34px] items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-sm">
        <span className="num flex-1 truncate">{label || `#${value}`}</span>
        <button type="button" onClick={() => onChange(null, '')} className="text-faint hover:text-ink">تغيير</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)} placeholder={owner ? 'اختار من عقاراته أو دوّر…' : 'كود أو عنوان…'} />
      {show && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto glass rounded-card">
          {res.data?.results.map((p) => (
            <button type="button" key={p.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQ(''); onChange(p.id, p.code ?? '') }} className="block w-full px-3 py-2 text-start hover:bg-bg">
              <span className="num font-medium">{p.code}</span>{' '}
              <span className="text-[12.5px] text-muted">{[p.property_type?.name, p.location?.name, money(p.price) || money(p.rent_monthly)].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          {res.data?.results.length === 0 && <div className="px-3 py-2 text-[13px] text-faint">ما في عقارات</div>}
          {!!res.data && res.data.count > res.data.results.length && (
            <div className="border-t border-line px-3 py-1.5 text-[12px] text-faint">في <span className="num">{res.data.count}</span> — كمّل كتابة لتضيّق</div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="sm:col-span-2 m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 border-0 border-t border-line p-0 pt-3">
      <legend className="pe-2 text-[12.5px] font-medium text-muted">{title}</legend>
      {children}
    </fieldset>
  )
}

/* ---------- Contact ---------- */
type PhoneRow = { number: string; has_whatsapp: boolean }

function PhoneInput({ row, onChange, onRemove, selfId }: { row: PhoneRow; onChange: (r: PhoneRow) => void; onRemove?: () => void; selfId?: number }) {
  const check = usePhoneCheck(row.number)
  const owner = check.data?.contact && Number(check.data.contact.id) !== selfId ? check.data.contact as { id: number; name: string } : null
  return (
    <div className="sm:col-span-2">
      <div className="flex items-center gap-2">
        <Input dir="ltr" value={row.number} onChange={(e) => onChange({ ...row, number: e.target.value })} placeholder="09xx xxx xxx" />
        <label className="flex flex-none items-center gap-1 text-[13px] text-muted">
          <input type="checkbox" checked={row.has_whatsapp} onChange={(e) => onChange({ ...row, has_whatsapp: e.target.checked })} />واتساب
        </label>
        {onRemove && <button type="button" onClick={onRemove} className="text-faint hover:text-danger">✕</button>}
      </div>
      {owner && (
        <div className="mt-1 rounded-md bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-accent-ink">
          هالرقم مسجّل للعميل «{owner.name}» — <Link to={`/contacts/${owner.id}`} className="font-medium text-accent-ink">افتح كرته</Link> بدل ما تفتح كرت جديد
        </div>
      )}
    </div>
  )
}

export function ContactDialog({ open, onClose, contact, initial, onSaved }: {
  open: boolean; onClose: () => void; contact?: Contact; initial?: { name?: string; phone?: string }; onSaved?: (c: Contact) => void
}) {
  const save = useSaveContact()
  const sources = useCatalog('sources')
  const tags = useCatalog('tags')
  const [phones, setPhones] = useState<PhoneRow[]>([])
  const [tagIds, setTagIds] = useState<number[]>([])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } =
    useForm<{ name: string; referred_by: string; email: string; notes: string; root?: string; phones?: string }>()
  useEffect(() => {
    if (!open) return
    reset({ name: contact?.name ?? initial?.name ?? '', referred_by: contact?.referred_by ?? '', email: contact?.email ?? '', notes: contact?.notes ?? '' })
    setPhones(contact?.phones?.length ? contact.phones.map((p) => ({ number: p.number, has_whatsapp: !!p.has_whatsapp })) : [{ number: initial?.phone ?? '', has_whatsapp: false }])
    setTagIds(contact?.tags.map((t) => t.id) ?? [])
    setSourceId(contact?.source?.id ?? null)
    setAssigneeId(contact?.assignee?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is read once when the dialog opens
  }, [open, contact, reset])

  const submit = handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        id: contact?.id,
        body: { name: v.name, referred_by: v.referred_by, email: v.email, notes: v.notes, source_id: sourceId,
          assignee_id: assigneeId, tag_ids: tagIds, phones: phones.filter((p) => p.number.trim()) },
      })
      onSaved?.(saved as Contact)
      onClose()
    } catch (e) {
      applyServerErrors(e, setError, ['name', 'email', 'notes', 'referred_by', 'phones'])
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={contact ? 'تعديل العميل' : 'عميل جديد'} footer={footer(submit, isSubmitting, onClose)}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="الاسم" hint="اختياري — إذا ما في اسم بيبيّن الرقم" error={errors.name?.message} className="sm:col-span-2">
          <Input data-autofocus {...register('name')} />
        </Field>
        <span className="sm:col-span-2 -mb-2 text-[13px] text-muted">أرقام الهاتف</span>
        {phones.map((p, i) => (
          <PhoneInput key={i} row={p} selfId={contact?.id}
            onChange={(r) => setPhones(phones.map((x, j) => (j === i ? r : x)))}
            onRemove={phones.length > 1 ? () => setPhones(phones.filter((_, j) => j !== i)) : undefined} />
        ))}
        {errors.phones && <div className="sm:col-span-2 text-[12.5px] text-danger">{errors.phones.message}</div>}
        <button type="button" onClick={() => setPhones([...phones, { number: '', has_whatsapp: false }])}
          className="sm:col-span-2 justify-self-start text-[13px] text-primary">+ رقم تاني</button>
        <Field label="المصدر (كيف عرف عنا)">
          <Select value={sourceId ?? ''} onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null
            setSourceId(id)
            const src = sources.data?.find((x) => x.id === id)
            if (src?.opens_whatsapp) setPhones(phones.map((p) => ({ ...p, has_whatsapp: true })))
          }}>
            <option value="">—</option>
            {sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="مين عرّفه علينا" hint="إذا جاي عن طريق شخص"><Input {...register('referred_by')} /></Field>
        <Field label="الموظف المسؤول"><UserSelect value={assigneeId} onChange={setAssigneeId} /></Field>
        <Field label="الإيميل" error={errors.email?.message}><Input dir="ltr" type="email" {...register('email')} /></Field>
        {!!tags.data?.length && <Field label="وسوم" className="sm:col-span-2"><ChipsMulti options={tags.data} value={tagIds} onChange={setTagIds} /></Field>}
        <Field label="ملاحظات" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
        <div className="sm:col-span-2"><FormError message={errors.root?.message} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/* ---------- Deal (request) ---------- */
type DealState = {
  kind: DealKind; contact: { id: number; name: string } | null; title: string; stage_id: number | null; temperature: string
  assignee_id: number | null; engineer_id: number | null; location_id: number | null; address: string; expected_amount: string
  contract_amount: string; property_id: number | null; property_label: string; source_id: number | null
  f: { service_type_id: number | null; target_level_id: number | null; current_level_id: number | null; property_type_id: number | null; area_m2: string; budget_min: string; budget_max: string; property_note: string }
  d: { property_type_ids: number[]; location_ids: number[]; finish_level_ids: number[]; budget_min: string; budget_max: string; area_min: string; area_max: string; rooms_min: string; notes: string }
}

function initialDeal(deal?: Deal, kind?: DealKind, contact?: { id: number; name: string } | null): DealState {
  return {
    kind: deal?.kind ?? kind ?? 'FINISHING', contact: deal ? { id: deal.contact.id, name: deal.contact.name } : contact ?? null,
    title: deal?.title ?? '', stage_id: deal?.stage.id ?? null, temperature: deal?.temperature ?? '',
    assignee_id: deal?.assignee?.id ?? null, engineer_id: deal?.engineer?.id ?? null, location_id: deal?.location?.id ?? null,
    address: deal?.address ?? '', expected_amount: deal?.expected_amount ?? '', contract_amount: deal?.contract_amount ?? '',
    property_id: deal?.property?.id ?? null, property_label: deal?.property?.code ?? '', source_id: deal?.source?.id ?? null,
    f: { service_type_id: deal?.finishing?.service_type?.id ?? null, target_level_id: deal?.finishing?.target_level?.id ?? null,
      current_level_id: deal?.finishing?.current_level?.id ?? null, property_type_id: deal?.finishing?.property_type?.id ?? null,
      area_m2: deal?.finishing?.area_m2 ?? '', budget_min: deal?.finishing?.budget_min ?? '', budget_max: deal?.finishing?.budget_max ?? '',
      property_note: deal?.finishing?.property_note ?? '' },
    d: { property_type_ids: deal?.demand?.property_types.map((x) => x.id) ?? [], location_ids: deal?.demand?.locations.map((x) => x.id) ?? [],
      finish_level_ids: deal?.demand?.finish_levels.map((x) => x.id) ?? [], budget_min: deal?.demand?.budget_min ?? '',
      budget_max: deal?.demand?.budget_max ?? '', area_min: deal?.demand?.area_min ?? '', area_max: deal?.demand?.area_max ?? '',
      rooms_min: deal?.demand?.rooms_min?.toString() ?? '', notes: deal?.demand?.notes ?? '' },
  }
}

export function DealDialog({ open, onClose, deal, kind, contact, onSaved }: {
  open: boolean; onClose: () => void; deal?: Deal; kind?: DealKind; contact?: { id: number; name: string } | null; onSaved?: (d: Deal) => void
}) {
  const save = useSaveDeal()
  const { can } = useAccess()
  const [s, setS] = useState<DealState>(() => initialDeal(deal, kind, contact))
  const [error, setError] = useState<Errs>({})
  const pipeline = s.kind === 'FINISHING' ? 'FINISHING' : 'BROKERAGE'
  const stages = useStages(pipeline)
  useEffect(() => { if (open) { setS(initialDeal(deal, kind, contact)); setError({}) } }, [open, deal, kind, contact])
  const set = (p: Partial<DealState>) => setS({ ...s, ...p })
  const setF = (p: Partial<DealState['f']>) => setS({ ...s, f: { ...s.f, ...p } })
  const setD = (p: Partial<DealState['d']>) => setS({ ...s, d: { ...s.d, ...p } })
  const openStages = stages.data?.filter((x) => x.type !== 'LOST') ?? []

  const submit = async () => {
    setError({})
    try {
      const body = {
        ...(deal ? {} : { kind: s.kind, contact_id: s.contact?.id }), title: s.title, temperature: s.temperature,
        assignee_id: s.assignee_id, location_id: s.location_id, address: s.address,
        ...(can('finance.view') ? { expected_amount: num(s.expected_amount) } : {}),
        ...(can('finance.manage') ? { contract_amount: num(s.contract_amount) } : {}), property_id: s.property_id, source_id: s.source_id, ...(s.stage_id ? { stage_id: s.stage_id } : {}),
        ...(s.kind === 'FINISHING' ? { engineer_id: s.engineer_id, finishing: { ...s.f, area_m2: num(s.f.area_m2), budget_min: num(s.f.budget_min), budget_max: num(s.f.budget_max) } } : {}),
        ...(s.kind === 'BUY' || s.kind === 'RENT' ? { demand: { ...s.d, budget_min: num(s.d.budget_min), budget_max: num(s.d.budget_max), area_min: num(s.d.area_min), area_max: num(s.d.area_max), rooms_min: s.d.rooms_min ? Number(s.d.rooms_min) : null } } : {}),
      }
      const saved = await save.mutateAsync({ id: deal?.id, body: body as never })
      onSaved?.(saved as Deal)
      onClose()
    } catch (e) {
      setError(errsOf(e))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={deal ? 'تعديل الطلب' : 'طلب جديد'} wide footer={footer(submit, save.isPending, onClose)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!deal && (
          <div className="sm:col-span-2 flex flex-wrap gap-1.5">
            {(['FINISHING', 'BUY', 'RENT', 'SELL', 'LEASE'] as DealKind[]).map((k) => (
              <button key={k} type="button" onClick={() => set({ kind: k, stage_id: null })}
                className={cx('h-8 rounded-md border px-3 text-[13px]', s.kind === k ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <Field label="العميل" error={error.contact_id?.[0]}><ContactPicker value={s.contact} onChange={(c) => set({ contact: c })} disabled={!!deal} /></Field>
        <Field label="عنوان مختصر" hint="مثلاً: شقة 120م المزة"><Input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="المرحلة" error={error.stage_id?.[0]}>
          <Select value={s.stage_id ?? ''} onChange={(e) => set({ stage_id: e.target.value ? Number(e.target.value) : null })}>
            {!deal && <option value="">أول مرحلة</option>}
            {openStages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </Select>
        </Field>
        <Field label="حرارة العميل">
          <Select value={s.temperature} onChange={(e) => set({ temperature: e.target.value })}>
            <option value="">—</option>{Object.entries(TEMP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="الموظف المسؤول"><UserSelect value={s.assignee_id} onChange={(v) => set({ assignee_id: v })} placeholder="أنا" /></Field>
        {s.kind === 'FINISHING'
          ? <Field label="مهندس المعاينة"><UserSelect value={s.engineer_id} onChange={(v) => set({ engineer_id: v })} /></Field>
          : <Field label="العقار المرتبط" hint={s.kind === 'BUY' || s.kind === 'RENT' ? 'إذا اتفقنا على عقار' : 'عقار العميل'}>
              <PropertyPicker value={s.property_id} label={s.property_label}
                owner={s.kind === 'SELL' || s.kind === 'LEASE' ? s.contact?.id : undefined}
                onChange={(id, label) => set({ property_id: id, property_label: label })} />
            </Field>}
        <Field label="المنطقة"><LookupSelect slug="locations" value={s.location_id} onChange={(v) => set({ location_id: v })} /></Field>
        <Field label="العنوان / تفاصيل المكان"><Input value={s.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        {can('finance.view') && <Field label="القيمة المتوقعة $" error={error.expected_amount?.[0]}><Input dir="ltr" inputMode="decimal" value={s.expected_amount} onChange={(e) => set({ expected_amount: e.target.value })} /></Field>}
        {can('finance.manage') && <Field label="قيمة العقد $" hint="بعد الاتفاق" error={error.contract_amount?.[0]}><Input dir="ltr" inputMode="decimal" value={s.contract_amount} onChange={(e) => set({ contract_amount: e.target.value })} /></Field>}

        {s.kind === 'FINISHING' && (
          <Section title="تفاصيل الإكساء">
            <Field label="نوع الخدمة"><LookupSelect slug="service-types" value={s.f.service_type_id} onChange={(v) => setF({ service_type_id: v })} /></Field>
            <Field label="نوع العقار"><LookupSelect slug="property-types" value={s.f.property_type_id} onChange={(v) => setF({ property_type_id: v })} /></Field>
            <Field label="الحالة الحالية"><LookupSelect slug="finish-levels" value={s.f.current_level_id} onChange={(v) => setF({ current_level_id: v })} /></Field>
            <Field label="المستوى المطلوب"><LookupSelect slug="finish-levels" value={s.f.target_level_id} onChange={(v) => setF({ target_level_id: v })} /></Field>
            <Field label="المساحة م²"><Input dir="ltr" inputMode="decimal" value={s.f.area_m2} onChange={(e) => setF({ area_m2: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ميزانية من $"><Input dir="ltr" value={s.f.budget_min} onChange={(e) => setF({ budget_min: e.target.value })} /></Field>
              <Field label="إلى $"><Input dir="ltr" value={s.f.budget_max} onChange={(e) => setF({ budget_max: e.target.value })} /></Field>
            </div>
            <Field label="وصف العقار" className="sm:col-span-2"><Input value={s.f.property_note} onChange={(e) => setF({ property_note: e.target.value })} /></Field>
          </Section>
        )}
        {(s.kind === 'BUY' || s.kind === 'RENT') && (
          <Section title="شو بدو بالضبط">
            <Field label="أنواع العقار" className="sm:col-span-2"><LookupMulti slug="property-types" value={s.d.property_type_ids} onChange={(v) => setD({ property_type_ids: v })} /></Field>
            <Field label="المناطق" className="sm:col-span-2"><LookupMulti slug="locations" value={s.d.location_ids} onChange={(v) => setD({ location_ids: v })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ميزانية من $"><Input dir="ltr" value={s.d.budget_min} onChange={(e) => setD({ budget_min: e.target.value })} /></Field>
              <Field label="إلى $"><Input dir="ltr" value={s.d.budget_max} onChange={(e) => setD({ budget_max: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="مساحة من"><Input dir="ltr" value={s.d.area_min} onChange={(e) => setD({ area_min: e.target.value })} /></Field>
              <Field label="إلى"><Input dir="ltr" value={s.d.area_max} onChange={(e) => setD({ area_max: e.target.value })} /></Field>
              <Field label="غرف على الأقل"><Input dir="ltr" value={s.d.rooms_min} onChange={(e) => setD({ rooms_min: e.target.value })} /></Field>
            </div>
            <Field label="مستويات الإكساء المقبولة" className="sm:col-span-2"><LookupMulti slug="finish-levels" value={s.d.finish_level_ids} onChange={(v) => setD({ finish_level_ids: v })} /></Field>
            <Field label="ملاحظات" className="sm:col-span-2"><Textarea value={s.d.notes} onChange={(e) => setD({ notes: e.target.value })} /></Field>
          </Section>
        )}
        <div className="sm:col-span-2"><FormError message={firstErr(error)} /></div>
      </div>
    </Dialog>
  )
}

/* ---------- Lost ---------- */
export function LostDialog({ open, onClose, deal, lostStageId }: { open: boolean; onClose: () => void; deal: Deal; lostStageId: number }) {
  const save = useSaveDeal()
  const reasons = useCatalog('lost-reasons')
  const [reason, setReason] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string>()
  useEffect(() => { if (open) { setReason(null); setNotes(''); setErr(undefined) } }, [open])
  const applies = reasons.data?.filter((r) => r.applies_to === 'ALL' || r.applies_to === deal.pipeline) ?? []
  const submit = async () => {
    try {
      await save.mutateAsync({ id: deal.id, body: { stage_id: lostStageId, lost_reason_id: reason, lost_notes: notes } })
      onClose()
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="تسكير الطلب كخسارة" footer={footer(submit, save.isPending || !reason, onClose, 'تسكير')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {applies.map((r) => (
            <button key={r.id} type="button" onClick={() => setReason(r.id)}
              className={cx('rounded-md border px-2.5 py-1.5 text-[13px]', reason === r.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}>{r.name}</button>
          ))}
        </div>
        <Field label="ملاحظة (اختياري)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormError message={err} />
      </div>
    </Dialog>
  )
}

/* ---------- quick log: what happened + next follow-up ---------- */
const CHIPS: [string, number | null][] = [['بكرا', 1], ['3 أيام', 3], ['أسبوع', 7], ['شهر', 30], ['بلا موعد', null]]

export function LogDialog({ open, onClose, contactId, dealId, propertyId, initialType = 'CALL' }: {
  open: boolean; onClose: () => void; contactId: number; dealId?: number; propertyId?: number; initialType?: string
}) {
  const save = useSaveActivity()
  const [type, setType] = useState(initialType)
  const [notes, setNotes] = useState('')
  const [next, setNext] = useState<string | null>(inDays(3))
  const [chip, setChip] = useState<number | null>(3)
  const [nextType, setNextType] = useState('CALL')
  const [err, setErr] = useState<string>()
  useEffect(() => { if (open) { setType(initialType); setNotes(''); setChip(3); setNext(inDays(3)); setNextType('CALL'); setErr(undefined) } }, [open, initialType])
  const submit = async () => {
    try {
      await save.mutateAsync({ body: { type: type as never, notes, contact_id: contactId, deal_id: dealId ?? null,
        property_id: propertyId ?? null, ...(next ? { next_due: next, next_type: nextType as never } : {}) } })
      onClose()
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="شو صار؟" footer={footer(submit, save.isPending, onClose)}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {['CALL', 'WHATSAPP', 'SITE_VISIT', 'MEETING', 'NOTE'].map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={cx('rounded-md border py-1.5 text-[12.5px]', type === t ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}>{ACTIVITY_LABEL[t]}</button>
          ))}
        </div>
        <Textarea data-autofocus rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="شو حكيتو؟ شو قرر؟" />
        <div>
          <div className="mb-1.5 text-[13px] text-muted">المتابعة الجاية</div>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map(([label, days]) => (
              <button key={label} type="button" onClick={() => { setChip(days); setNext(days === null ? null : inDays(days)) }}
                className={cx('h-8 rounded-full border px-3 text-[13px]', chip === days ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}>{label}</button>
            ))}
          </div>
          {next && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="datetime-local" dir="ltr" value={toLocalInput(next)} onChange={(e) => { setChip(-1); setNext(fromLocalInput(e.target.value)) }} />
              <Select value={nextType} onChange={(e) => setNextType(e.target.value)}>
                {['CALL', 'WHATSAPP', 'SITE_VISIT', 'MEETING', 'VIEWING', 'TASK'].map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
              </Select>
            </div>
          )}
        </div>
        <FormError message={err} />
      </div>
    </Dialog>
  )
}

/* ---------- plan an appointment / task ---------- */
export function PlanDialog({ open, onClose, contactId, dealId, propertyId, defaultType = 'SITE_VISIT' }: {
  open: boolean; onClose: () => void; contactId: number; dealId?: number; propertyId?: number; defaultType?: string
}) {
  const save = useSaveActivity()
  const [v, setV] = useState({ type: defaultType, subject: '', due: inDays(1), assignee: null as number | null, notes: '' })
  const [err, setErr] = useState<string>()
  useEffect(() => { if (open) { setV({ type: defaultType, subject: '', due: inDays(1), assignee: null, notes: '' }); setErr(undefined) } }, [open, defaultType])
  const submit = async () => {
    try {
      await save.mutateAsync({ body: { type: v.type as never, subject: v.subject, due_at: v.due, notes: v.notes, contact_id: contactId,
        deal_id: dealId ?? null, property_id: propertyId ?? null, ...(v.assignee ? { assignee_id: v.assignee } : {}) } })
      onClose()
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="موعد / مهمة جديدة" footer={footer(submit, save.isPending, onClose)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="النوع"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          {['SITE_VISIT', 'VIEWING', 'MEETING', 'CALL', 'WHATSAPP', 'TASK'].map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
        </Select></Field>
        <Field label="الموعد"><Input type="datetime-local" dir="ltr" value={toLocalInput(v.due)} onChange={(e) => setV({ ...v, due: fromLocalInput(e.target.value) ?? v.due })} /></Field>
        <Field label="العنوان" className="sm:col-span-2"><Input data-autofocus value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="مثلاً: معاينة مع المهندسة رند" /></Field>
        <Field label="لمين"><UserSelect value={v.assignee} onChange={(a) => setV({ ...v, assignee: a })} placeholder="إلي" /></Field>
        <Field label="ملاحظات"><Input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <div className="sm:col-span-2"><FormError message={err} /></div>
      </div>
    </Dialog>
  )
}

/* ---------- Property ---------- */
function initialProperty(property?: Property, owner?: { id: number; name: string } | null) {
  return {
    owner: property ? { id: property.owner.id, name: property.owner.name } : owner ?? null,
    owner_role: property?.owner_role ?? 'OWNER', property_type_id: property?.property_type?.id ?? null, listing: property?.listing ?? 'SALE',
    status: property?.status ?? 'AVAILABLE', location_id: property?.location?.id ?? null, address: property?.address ?? '',
    area_m2: property?.area_m2 ?? '', area_note: property?.area_note ?? '', rooms: property?.rooms?.toString() ?? '',
    bathrooms: property?.bathrooms?.toString() ?? '', floor: property?.floor?.toString() ?? '', building_state: property?.building_state ?? '',
    finish_level_id: property?.finish_level?.id ?? null, feature_ids: property?.features.map((f) => f.id) ?? [],
    ownership_type_id: property?.ownership_type?.id ?? null, price: property?.price ?? '', rent_monthly: property?.rent_monthly ?? '',
    price_note: property?.price_note ?? '', commission_pct: property?.commission_pct ?? '', description: property?.description ?? '',
    assignee_id: property?.assignee?.id ?? null, legacy_code: property?.legacy_code ?? '',
  }
}

export function PropertyDialog({ open, onClose, property, owner, onSaved }: {
  open: boolean; onClose: () => void; property?: Property; owner?: { id: number; name: string } | null; onSaved?: (p: Property) => void
}) {
  const save = useSaveProperty()
  const ptypes = useCatalog('property-types')
  const [s, setS] = useState(() => initialProperty(property, owner))
  const [error, setError] = useState<Errs>({})
  useEffect(() => { if (open) { setS(initialProperty(property, owner)); setError({}) } }, [open, property, owner])
  const set = (p: Partial<typeof s>) => setS({ ...s, ...p })
  const hasRooms = ptypes.data?.find((t) => t.id === s.property_type_id)?.has_rooms !== false
  const submit = async () => {
    try {
      const { owner: o, ...rest } = s
      const saved = await save.mutateAsync({ id: property?.id, body: {
        ...rest, ...(property ? {} : { owner_id: o?.id }), area_m2: num(s.area_m2), price: num(s.price), rent_monthly: num(s.rent_monthly),
        commission_pct: num(s.commission_pct), rooms: s.rooms ? Number(s.rooms) : null, bathrooms: s.bathrooms ? Number(s.bathrooms) : null,
        floor: s.floor === '' ? null : Number(s.floor) } as never })
      onSaved?.(saved as Property)
      onClose()
    } catch (e) { setError(errsOf(e)) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={property ? `تعديل العقار ${property.code}` : 'عقار جديد'} wide footer={footer(submit, save.isPending, onClose)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="المالك / صاحب العرض" error={error.owner_id?.[0]}><ContactPicker value={s.owner} onChange={(o) => set({ owner: o })} disabled={!!property} /></Field>
        <Field label="صفته"><Select value={s.owner_role} onChange={(e) => set({ owner_role: e.target.value as never })}>
          {Object.entries(OWNER_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="نوع العقار"><LookupSelect slug="property-types" value={s.property_type_id} onChange={(v) => set({ property_type_id: v })} /></Field>
        <Field label="العرض"><Select value={s.listing} onChange={(e) => set({ listing: e.target.value as never })}>
          {Object.entries(LISTING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="المنطقة"><LookupSelect slug="locations" value={s.location_id} onChange={(v) => set({ location_id: v })} /></Field>
        <Field label="العنوان التفصيلي"><Input value={s.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="المساحة م²"><Input dir="ltr" value={s.area_m2} onChange={(e) => set({ area_m2: e.target.value })} /></Field>
        <Field label="ملاحظة المساحة" hint="داخلي/تراس/حديقة"><Input value={s.area_note} onChange={(e) => set({ area_note: e.target.value })} /></Field>
        {hasRooms && (<>
          <div className="grid grid-cols-3 gap-2">
            <Field label="غرف"><Input dir="ltr" value={s.rooms} onChange={(e) => set({ rooms: e.target.value })} /></Field>
            <Field label="حمامات"><Input dir="ltr" value={s.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} /></Field>
            <Field label="الطابق" hint="-1 قبو، 0 أرضي"><Input dir="ltr" value={s.floor} onChange={(e) => set({ floor: e.target.value })} /></Field>
          </div>
          <Field label="حالة البناء"><Select value={s.building_state} onChange={(e) => set({ building_state: e.target.value as never })}>
            <option value="">—</option>{Object.entries(BUILDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="مستوى الإكساء"><LookupSelect slug="finish-levels" value={s.finish_level_id} onChange={(v) => set({ finish_level_id: v })} /></Field>
          <Field label="الإضافات" className="sm:col-span-2"><LookupMulti slug="features" value={s.feature_ids} onChange={(v) => set({ feature_ids: v })} /></Field>
        </>)}
        <Field label="نوع الملكية"><LookupSelect slug="ownership-types" value={s.ownership_type_id} onChange={(v) => set({ ownership_type_id: v })} /></Field>
        <Field label="الحالة"><Select value={s.status} onChange={(e) => set({ status: e.target.value as never })}>
          {Object.entries(PSTATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {s.listing !== 'RENT' && <Field label="سعر البيع $"><Input dir="ltr" value={s.price} onChange={(e) => set({ price: e.target.value })} /></Field>}
        {s.listing !== 'SALE' && <Field label="الإيجار الشهري $"><Input dir="ltr" value={s.rent_monthly} onChange={(e) => set({ rent_monthly: e.target.value })} /></Field>}
        <Field label="ملاحظة السعر" hint="أي سعر بغير الدولار أو للمتر"><Input value={s.price_note} onChange={(e) => set({ price_note: e.target.value })} /></Field>
        <Field label="العمولة %"><Input dir="ltr" value={s.commission_pct} onChange={(e) => set({ commission_pct: e.target.value })} /></Field>
        <Field label="الموظف المسؤول"><UserSelect value={s.assignee_id} onChange={(v) => set({ assignee_id: v })} placeholder="أنا" /></Field>
        <Field label="الكود القديم"><Input value={s.legacy_code} onChange={(e) => set({ legacy_code: e.target.value })} /></Field>
        <Field label="الوصف والمميزات" className="sm:col-span-2"><Textarea value={s.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="sm:col-span-2"><FormError message={firstErr(error)} /></div>
      </div>
    </Dialog>
  )
}

/* ---------- Quote / Payment ---------- */
export function QuoteDialog({ open, onClose, dealId }: { open: boolean; onClose: () => void; dealId: number }) {
  const save = useSaveQuote()
  const [v, setV] = useState({ amount: '', status: 'SENT', valid_until: '', notes: '' })
  useEffect(() => { if (open) setV({ amount: '', status: 'SENT', valid_until: '', notes: '' }) }, [open])
  const submit = async () => { await save.mutateAsync({ body: { deal_id: dealId, amount: num(v.amount), status: v.status as never, valid_until: v.valid_until || null, notes: v.notes } }); onClose() }
  return (
    <Dialog open={open} onClose={onClose} title="دراسة / عرض سعر جديد" footer={footer(submit, save.isPending, onClose)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="المبلغ $"><Input data-autofocus dir="ltr" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field label="الحالة"><Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
          {Object.entries(QUOTE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="صالح لغاية"><Input type="date" dir="ltr" value={v.valid_until} onChange={(e) => setV({ ...v, valid_until: e.target.value })} /></Field>
        <Field label="ملاحظات"><Input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <p className="sm:col-span-2 m-0 text-[12.5px] text-faint">ملف الدراسة (PDF/مخططات) بترفعه من "رفع ملف" بتصنيف "دراسة".</p>
      </div>
    </Dialog>
  )
}

export function PaymentDialog({ open, onClose, dealId }: { open: boolean; onClose: () => void; dealId: number }) {
  const save = useSavePayment()
  const [v, setV] = useState({ amount: '', paid_at: '', note: '' })
  useEffect(() => { if (open) setV({ amount: '', paid_at: new Date().toISOString().slice(0, 10), note: '' }) }, [open])
  const submit = async () => { await save.mutateAsync({ deal_id: dealId, amount: v.amount, paid_at: v.paid_at, note: v.note }); onClose() }
  return (
    <Dialog open={open} onClose={onClose} title="دفعة جديدة" footer={footer(submit, save.isPending || !v.amount, onClose)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="المبلغ $"><Input data-autofocus dir="ltr" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field label="التاريخ"><Input type="date" dir="ltr" value={v.paid_at} onChange={(e) => setV({ ...v, paid_at: e.target.value })} /></Field>
        <Field label="ملاحظة" className="sm:col-span-2"><Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  )
}

/* ---------- Upload ---------- */
export function UploadDialog({ open, onClose, contactId, dealId, propertyId }: { open: boolean; onClose: () => void; contactId?: number; dealId?: number; propertyId?: number }) {
  const qc = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState('OTHER')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [drag, setDrag] = useState(false)
  useEffect(() => { if (open) { setFiles([]); setErrors([]); setCategory(propertyId ? 'PHOTO' : 'OTHER') } }, [open, propertyId])
  const send = async () => {
    setBusy(true)
    const failed: string[] = []
    for (const f of files) {
      const form = new FormData()
      form.append('file', f)
      form.append('category', category)
      if (dealId) form.append('deal_id', String(dealId))
      if (propertyId) form.append('property_id', String(propertyId))
      if (contactId && !dealId && !propertyId) form.append('contact_id', String(contactId))
      try { await uploadDocument(form) } catch (e) { failed.push(`${f.name}: ${(e as Error).message}`) }
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
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFiles([...files, ...Array.from(e.dataTransfer.files)]) }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed px-4 py-8 text-center ${drag ? 'border-primary bg-primary-soft' : 'border-line-strong bg-bg'}`}>
          <span className="font-medium">اسحب الملفات لهون أو اضغط لتختار</span>
          <span className="text-[12.5px] text-faint">PDF أو صور — من الموبايل بتقدر تصوّر مباشرة</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,image/*" className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
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
        <Field label="التصنيف"><Select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {errors.length > 0 && <FormError message={errors.join(' — ')} />}
      </div>
    </Dialog>
  )
}
