import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { call, type Lookup, type Stage } from '../api/client'
import { useCatalog, useSaveCatalog, useSaveStage, useStages, useUsers, type CatalogSlug } from '../api/hooks'
import { Tabs } from '../components/bits'
import { Button, Card, Dot, Empty, Field, Input, PageHeader, Select } from '../components/ui'
import { useAccess } from '../lib/access'
import { Roles, Users } from './SettingsAccess'

type Tab = 'stages' | 'lists' | 'users' | 'roles' | 'email' | 'handover'
const TABS: [Tab, string, string][] = [
  ['users', 'المستخدمين', 'admin.users'], ['roles', 'الأدوار والصلاحيات', 'admin.roles'],
  ['stages', 'المراحل', 'admin.settings'], ['lists', 'القوائم', 'admin.settings'],
  ['email', 'الإيميل والإشعارات', 'admin.settings'], ['handover', 'تسليم الشغل', 'admin.handover'],
]

export function Settings() {
  const { can } = useAccess()
  const tabs = TABS.filter(([, , perm]) => can(perm))
  const [picked, setPicked] = useState<Tab | null>(null)
  const tab = picked && tabs.some(([k]) => k === picked) ? picked : tabs[0]?.[0]
  if (!tab) return <div className="p-6"><Empty title="ما عندك صلاحية على الإعدادات" /></div>
  return (
    <div className="mx-auto max-w-[1000px] pb-24">
      <PageHeader title="الإعدادات" sub="المستخدمين والصلاحيات والقوائم والمراحل والإيميل — كلها بتتعدّل من هون" />
      <div className="px-4 md:px-6">
        <Tabs value={tab} onChange={setPicked} items={tabs.map(([k, label]) => [k, label] as [Tab, string])} />
        {tab === 'users' && <Users />}
        {tab === 'roles' && <Roles />}
        {tab === 'stages' && <Stages />}
        {tab === 'lists' && <Lists />}
        {tab === 'email' && <Email />}
        {tab === 'handover' && <HandOver />}
      </div>
    </div>
  )
}

function Stages() {
  return <>{(['FINISHING', 'BROKERAGE'] as const).map((p) => <PipelineStages key={p} pipeline={p} />)}</>
}

function PipelineStages({ pipeline }: { pipeline: 'FINISHING' | 'BROKERAGE' }) {
  const stages = useStages(pipeline, true)
  const save = useSaveStage()
  const list = stages.data ?? []
  const swap = async (a: Stage, b: Stage) => {
    await save.mutateAsync({ id: a.id, body: { order: b.order } })
    await save.mutateAsync({ id: b.id, body: { order: a.order } })
  }
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center"><h3 className="m-0 text-[14px] font-semibold text-navy">{pipeline === 'FINISHING' ? 'خط الإكساء' : 'خط الوساطة العقارية'}</h3>
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => save.mutate({ body: { pipeline, name: 'مرحلة جديدة', order: (list.at(-1)?.order ?? 0) + 1 } })}>+ مرحلة</Button></div>
      <Card>
        {list.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-0">
            <div className="flex flex-col leading-none">
              <button disabled={i === 0} onClick={() => swap(s, list[i - 1])} className="text-faint disabled:opacity-30">▲</button>
              <button disabled={i === list.length - 1} onClick={() => swap(s, list[i + 1])} className="text-faint disabled:opacity-30">▼</button>
            </div>
            <input type="color" value={s.color ?? '#64748b'} onChange={(e) => save.mutate({ id: s.id, body: { color: e.target.value } })} className="h-6 w-7 border-0 bg-transparent p-0" />
            <Input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && save.mutate({ id: s.id, body: { name: e.target.value } })} className="w-44" />
            <Select className="w-28" value={s.type} onChange={(e) => save.mutate({ id: s.id, body: { type: e.target.value as never } })}>
              <option value="OPEN">مفتوحة</option><option value="WON">رابحة</option><option value="LOST">خاسرة</option>
            </Select>
            <span className="text-[12.5px] text-muted">بتعتبر واقفة بعد</span>
            <Input dir="ltr" className="w-16" defaultValue={s.rotting_days ?? ''} onBlur={(e) => save.mutate({ id: s.id, body: { rotting_days: e.target.value ? Number(e.target.value) : null } })} />
            <span className="text-[12.5px] text-muted">يوم</span>
            <label className="ms-auto flex items-center gap-1 text-[12.5px] text-muted"><input type="checkbox" checked={!!s.is_active} onChange={(e) => save.mutate({ id: s.id, body: { is_active: e.target.checked } })} />فعّالة</label>
          </div>
        ))}
      </Card>
    </section>
  )
}

const LISTS: [CatalogSlug, string, string?][] = [
  ['sources', 'مصادر العملاء', 'opens_whatsapp'], ['lost-reasons', 'أسباب الخسارة'], ['locations', 'المناطق'], ['property-types', 'أنواع العقارات'],
  ['finish-levels', 'مستويات الإكساء'], ['service-types', 'خدمات الإكساء'], ['ownership-types', 'أنواع الملكية'], ['features', 'إضافات العقار'], ['tags', 'الوسوم'],
]

function Lists() {
  const [slug, setSlug] = useState<CatalogSlug>('sources')
  const q = useCatalog(slug, true)
  const save = useSaveCatalog(slug)
  const [name, setName] = useState('')
  const extra = LISTS.find((l) => l[0] === slug)?.[2]
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
      <div className="flex flex-row flex-wrap gap-1 md:flex-col">
        {LISTS.map(([s, label]) => (
          <button key={s} onClick={() => setSlug(s)} className={`rounded-md px-2.5 py-1.5 text-start text-[13.5px] ${slug === s ? 'bg-primary-soft text-navy' : 'text-muted hover:bg-subtle'}`}>{label}</button>
        ))}
      </div>
      <div>
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ body: { name: name.trim() } }, { onSuccess: () => setName('') }) }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="إضافة قيمة جديدة…" />
          <Button variant="primary" type="submit">إضافة</Button>
        </form>
        <Card className="max-h-[60vh] overflow-auto">
          {q.data?.map((o: Lookup) => (
            <div key={o.id} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-0">
              <Input defaultValue={o.name} className="h-8" onBlur={(e) => e.target.value !== o.name && save.mutate({ id: o.id, body: { name: e.target.value } })} />
              {extra === 'opens_whatsapp' && (
                <label className="flex flex-none items-center gap-1 text-[12.5px] text-muted"><input type="checkbox" checked={!!o.opens_whatsapp} onChange={(e) => save.mutate({ id: o.id, body: { opens_whatsapp: e.target.checked } })} />زر واتساب</label>
              )}
              <label className="flex flex-none items-center gap-1 text-[12.5px] text-muted"><input type="checkbox" checked={!!o.is_active} onChange={(e) => save.mutate({ id: o.id, body: { is_active: e.target.checked } })} />فعّال</label>
            </div>
          ))}
        </Card>
        <p className="text-[12.5px] text-faint">القيمة المستعملة ما بتنحذف — بتوقّفها (فعّال) فبتختفي من الخيارات وبتضل بالسجلات القديمة.</p>
      </div>
    </div>
  )
}

type SiteSettings = { email_enabled: boolean; smtp_host: string; smtp_port: number; smtp_use_tls: boolean; smtp_username: string; smtp_password_set: boolean; from_email: string; digest_hour: number; quiet_start_hour: number; quiet_end_hour: number; weekly_report_recipients: string }

function Email() {
  const q = useQuery({ queryKey: ['site-settings'], queryFn: () => call<SiteSettings>('GET', '/api/v1/admin/settings/') })
  const [s, setS] = useState<SiteSettings | null>(null)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { if (q.data) setS(q.data) }, [q.data])
  if (!s) return null
  const save = async () => {
    setMsg(null)
    try { const r = await call<SiteSettings>('PATCH', '/api/v1/admin/settings/', { ...s, smtp_password: password }); setS(r); setPassword(''); setMsg({ ok: true, text: 'انحفظ' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const test = async () => {
    setMsg(null)
    try { await call('POST', '/api/v1/admin/settings/test-email/'); setMsg({ ok: true, text: 'وصل إيميل تجربة ✓' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const num = (k: keyof SiteSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) })
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 m-0 text-[13px] text-muted">Gmail: فعّل التحقق بخطوتين بحسابك، وبعدين اعمل <b>App Password</b> من إعدادات حساب Google وحطها هون (مش كلمة سر الحساب).</p>
      <label className="sm:col-span-2 flex items-center gap-2"><input type="checkbox" checked={s.email_enabled} onChange={(e) => setS({ ...s, email_enabled: e.target.checked })} />تفعيل إرسال الإيميلات</label>
      <Field label="الإيميل (اسم المستخدم)"><Input dir="ltr" value={s.smtp_username} onChange={(e) => setS({ ...s, smtp_username: e.target.value })} /></Field>
      <Field label="App Password" hint={s.smtp_password_set ? 'محفوظة — اتركها فاضية لتضل متل ما هي' : 'مش محفوظة لسا'}><Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Field label="SMTP host"><Input dir="ltr" value={s.smtp_host} onChange={(e) => setS({ ...s, smtp_host: e.target.value })} /></Field>
      <Field label="Port"><Input dir="ltr" value={s.smtp_port} onChange={num('smtp_port')} /></Field>
      <Field label="الإرسال باسم" hint="اختياري"><Input dir="ltr" value={s.from_email} onChange={(e) => setS({ ...s, from_email: e.target.value })} /></Field>
      <Field label="مستلمو التقرير الأسبوعي" hint="مفصولين بفاصلة"><Input dir="ltr" value={s.weekly_report_recipients} onChange={(e) => setS({ ...s, weekly_report_recipients: e.target.value })} /></Field>
      <Field label="ساعة ملخص الصبح"><Input dir="ltr" value={s.digest_hour} onChange={num('digest_hour')} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="هدوء من الساعة"><Input dir="ltr" value={s.quiet_start_hour} onChange={num('quiet_start_hour')} /></Field>
        <Field label="لغاية"><Input dir="ltr" value={s.quiet_end_hour} onChange={num('quiet_end_hour')} /></Field>
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <Button variant="primary" onClick={save}>حفظ</Button><Button onClick={test}>إرسال إيميل تجربة</Button>
        {msg && <span className={msg.ok ? 'text-mint-ink' : 'text-danger'}>{msg.text}</span>}
      </div>
    </div>
  )
}

function HandOver() {
  const users = useUsers()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [res, setRes] = useState<string>()
  return (
    <div className="max-w-lg">
      <p className="text-[13px] text-muted">بتنقل كل الشغل المفتوح (العملاء، الطلبات، المواعيد، العقارات) من موظف لموظف بخطوة وحدة. السجل القديم بيضل متل ما هو.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="من"><Select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">—</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="إلى"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </div>
      <Button className="mt-3" variant="primary" disabled={!from || !to || from === to} onClick={async () => {
        if (!confirm('متأكد؟')) return
        const r = await call<Record<string, number>>('POST', '/api/v1/admin/hand-over/', { from_user_id: Number(from), to_user_id: Number(to) })
        setRes(`انتقل: ${r.deals} طلب، ${r.activities} موعد، ${r.contacts} عميل، ${r.properties} عقار`)
      }}>تسليم</Button>
      {res && <p className="text-mint-ink">{res}</p>}
      <div className="mt-6"><Dot color="var(--color-faint)" /> <span className="text-[12.5px] text-faint">المستخدمين ما بينحذفوا أبداً — بتوقّف الحساب من تبويب المستخدمين.</span></div>
    </div>
  )
}
