import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { call } from '../api/client'
import { Avatar, Badge, Button, Card, Dialog, Field, FormError, Input, Segmented, Select, Spinner, Switch, cx } from '../components/ui'
import { useAccess } from '../lib/access'

type RoleRef = { id: number; slug: string; name: string }
type UserRow = { id: number; username: string; name: string; email: string; is_active: boolean; is_superuser: boolean; role: RoleRef | null; last_login: string | null }
type Perms = Record<string, string | boolean>
type Role = RoleRef & { description: string; permissions: Perms; is_system: boolean; order: number; members: number }
type PermDef = { key: string; group: string; label: string; kind: 'scope' | 'bool' }

const SCOPE_OPTIONS: [string, string][] = [['none', 'ما في'], ['own', 'تبعه بس'], ['all', 'الكل']]

const useRoles = () => useQuery({ queryKey: ['admin-roles'], queryFn: () => call<Role[]>('GET', '/api/v1/admin/roles/') })

function useRefresh() {
  const qc = useQueryClient()
  return () => ['admin-users', 'users', 'admin-roles', 'me'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

/* ---------- users: one role each ---------- */
export function Users() {
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => call<UserRow[]>('GET', '/api/v1/admin/users/') })
  const roles = useRoles()
  const { me } = useAccess()
  const refresh = useRefresh()
  const [form, setForm] = useState({ username: '', name: '', email: '', password: '', role_id: '' })
  const [err, setErr] = useState<string>()
  const patch = (id: number, body: object) =>
    call('PATCH', `/api/v1/admin/users/${id}/`, body).then(refresh).catch((e) => alert((e as Error).message))
  const [editFor, setEditFor] = useState<UserRow | null>(null)
  const [pwFor, setPwFor] = useState<UserRow | null>(null)
  const [linkFor, setLinkFor] = useState<UserRow | null>(null)
  const iAmSuper = !!users.data?.find((x) => x.id === me?.id)?.is_superuser

  return (
    <div>
      <Card className="mb-5 overflow-hidden">
        {users.data?.map((u) => (
          <div key={u.id} className={cx('flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-bg/60', !u.is_active && 'opacity-55')}>
            <Avatar name={u.name || u.username} size={34} />
            <div className="min-w-32 flex-1">
              <b className="font-medium">{u.name || u.username}</b>{u.id === me?.id && <span className="text-[12px] text-faint"> · أنت</span>}
              <div className="text-[12px] text-faint" dir="ltr">
                {u.username} · {u.email || <span className="text-accent-ink" dir="rtl">بلا إيميل (ما بيوصله رابط «نسيت كلمة السر»)</span>}
              </div>
            </div>
            {u.is_superuser
              ? <Badge tone="primary">مدير أعلى · كل الصلاحيات</Badge>
              : (
                <Select className="w-44" value={u.role?.id ?? ''} aria-label="الدور" onChange={(e) => patch(u.id, { role_id: Number(e.target.value) })}>
                  {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              )}
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <Switch on={u.is_active} disabled={u.id === me?.id} onChange={(v) => patch(u.id, { is_active: v })} label="فعّال" />فعّال
            </label>
            {/* a superuser's account is only for another superuser (the server refuses too) */}
            {(!u.is_superuser || iAmSuper) && <>
              <Button size="sm" variant="ghost" onClick={() => setEditFor(u)}>تعديل</Button>
              <Button size="sm" variant="ghost" onClick={() => setPwFor(u)}>كلمة سر جديدة</Button>
              <Button size="sm" variant="ghost" onClick={() => setLinkFor(u)}>رابط إعادة تعيين</Button>
            </>}
          </div>
        ))}
      </Card>
      <EditUserDialog user={editFor} onClose={() => setEditFor(null)} onSaved={refresh} />
      <SetPasswordDialog user={pwFor} onClose={() => setPwFor(null)} />
      <ResetLinkDialog user={linkFor} onClose={() => setLinkFor(null)} />

      <h3 className="mb-2 text-[14px] font-semibold text-navy">مستخدم جديد</h3>
      <Card className="p-4">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault()
          setErr(undefined)
          try {
            await call('POST', '/api/v1/admin/users/', { ...form, role_id: form.role_id ? Number(form.role_id) : undefined })
            setForm({ username: '', name: '', email: '', password: '', role_id: '' })
            refresh()
          } catch (x) { setErr((x as Error).message) }
        }}>
          <Field label="اسم المستخدم"><Input dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="الاسم الظاهر"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="الإيميل" hint="لرابط «نسيت كلمة السر» والإشعارات"><Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="كلمة السر" hint="8 أحرف على الأقل"><Input type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="الدور" hint="شو بيقدر يشوف ويعمل">
            <Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              <option value="">موظف مبيعات (الافتراضي)</option>
              {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><FormError message={err} /></div>
          <div><Button variant="primary" type="submit">إنشاء</Button></div>
        </form>
      </Card>
    </div>
  )
}

/* ---------- roles: a permission matrix (HubSpot / Pipedrive style) ---------- */
export function Roles() {
  const roles = useRoles()
  const catalog = useQuery({ queryKey: ['admin-perms'], queryFn: () => call<PermDef[]>('GET', '/api/v1/admin/permissions/'), staleTime: Infinity })
  const refresh = useRefresh()
  const [selected, setSelected] = useState<number | null>(null)
  const role = roles.data?.find((r) => r.id === selected) ?? roles.data?.[0]
  const [draft, setDraft] = useState<{ name: string; description: string; permissions: Perms } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (role) {
      setDraft({ name: role.name, description: role.description, permissions: { ...role.permissions } })
      setMsg(null)
    }
  }, [role])

  if (!roles.data || !catalog.data || !role || !draft) return <Spinner />
  const groups = [...new Set(catalog.data.map((p) => p.group))]
  const original = { name: role.name, description: role.description, permissions: role.permissions }
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const set = (key: string, v: string | boolean) => setDraft({ ...draft, permissions: { ...draft.permissions, [key]: v } })

  const save = async () => {
    try {
      await call('PATCH', `/api/v1/admin/roles/${role.id}/`, draft)
      refresh()
      setMsg({ ok: true, text: 'انحفظ ✓' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const add = async () => {
    const name = prompt('اسم الدور الجديد (مثلاً: كول سنتر)')
    if (!name) return
    try {
      const r = await call<Role>('POST', '/api/v1/admin/roles/', {
        name, slug: `role-${Date.now().toString(36)}`, permissions: role.permissions, description: `منسوخ من «${role.name}»`,
      })
      refresh()
      setSelected(r.id)
    } catch (e) { alert((e as Error).message) }
  }
  const remove = async () => {
    if (!confirm(`حذف دور «${role.name}»؟`)) return
    try {
      await call('DELETE', `/api/v1/admin/roles/${role.id}/`)
      setSelected(null)
      refresh()
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        {roles.data.map((r) => (
          <button key={r.id} onClick={() => setSelected(r.id)}
            className={cx('lift rounded-card border px-3 py-2.5 text-start',
              r.id === role.id ? 'border-primary/35 bg-primary-soft shadow-[0_0_0_3px_rgb(var(--brand-rgb)/0.08)]' : 'glass border-transparent')}>
            <div className="flex items-center gap-2">
              <b className="font-medium text-navy">{r.name}</b>
              <span className="num ms-auto rounded-full bg-surface/80 px-1.5 text-[11.5px] text-faint" title="عدد المستخدمين">{r.members}</span>
            </div>
            <div className="line-clamp-2 text-[12px] text-muted">{r.description}</div>
          </button>
        ))}
        <Button variant="ghost" onClick={add} className="justify-start">+ دور جديد (نسخة من المحدد)</Button>
      </div>

      <div className="min-w-0">
        <Card className="mb-3 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="اسم الدور"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="وصف"><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <p className="m-0 text-[12.5px] text-faint sm:col-span-2">
            «تبعه بس» = السجلات يلي هو مسؤول عنها، أو مهندسها، أو هو يلي أنشأها. المدير الأعلى بيتجاوز كل القيود.
          </p>
        </Card>
        {groups.map((g) => (
          <Card key={g} className="mb-3 overflow-hidden">
            <div className="border-b border-line bg-bg/70 px-4 py-2 text-[13px] font-semibold text-navy">{g}</div>
            {catalog.data.filter((p) => p.group === g).map((p) => {
              const v = draft.permissions[p.key]
              const locked = role.slug === 'admin' && p.key === 'admin.roles'
              return (
                <div key={p.key} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 transition-colors last:border-0 hover:bg-bg/60">
                  <span className="min-w-0 flex-1 text-[13.5px]">{p.label}</span>
                  {p.kind === 'scope'
                    ? <Segmented value={String(v ?? 'none')} options={SCOPE_OPTIONS} onChange={(x) => set(p.key, x)} label={p.label} />
                    : <Switch on={!!v} disabled={locked} onChange={(x) => set(p.key, x)} label={p.label} />}
                </div>
              )
            })}
          </Card>
        ))}
        <div className="glass sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] px-3 py-2.5 md:bottom-3">
          <Button variant="primary" disabled={!dirty} onClick={save}>حفظ الدور</Button>
          {dirty && <Button variant="ghost" onClick={() => setDraft({ ...original, permissions: { ...role.permissions } })}>تراجع</Button>}
          {msg && <span className={msg.ok ? 'text-mint-ink' : 'text-danger'}>{msg.text}</span>}
          <span className="ms-auto text-[12.5px] text-faint">{role.is_system ? 'دور أساسي: بيتعدّل وما بينحذف' : ''}</span>
          {!role.is_system && <Button variant="danger" size="sm" onClick={remove}>حذف الدور</Button>}
        </div>
      </div>
    </div>
  )
}

/* ---------- admin: set a password, or hand over a one-time link ---------- */
function SetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPw(''); setErr(undefined) }, [user])
  const save = async () => {
    if (!user) return
    setBusy(true)
    setErr(undefined)
    try {
      await call('PATCH', `/api/v1/admin/users/${user.id}/`, { password: pw })
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!user} onClose={onClose} title={`كلمة سر جديدة لـ ${user?.name || user?.username || ''}`}
      footer={<><Button variant="primary" onClick={save} disabled={busy || pw.length < 8}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="كلمة السر الجديدة" hint="8 أحرف على الأقل. بلّغها للموظف بطريقة آمنة، أو استعمل «رابط إعادة تعيين» ليختارها هو">
          <Input data-autofocus type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && pw.length >= 8) save() }} />
        </Field>
        <FormError message={err} />
      </div>
    </Dialog>
  )
}

function ResetLinkDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; hours: number } | null>(null)
  const [err, setErr] = useState<string>()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    setLink(null)
    setErr(undefined)
    setCopied(false)
    if (user) {
      call<{ url: string; hours: number }>('POST', `/api/v1/admin/users/${user.id}/reset-link/`)
        .then(setLink, (e) => setErr((e as Error).message))
    }
  }, [user])
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch { setCopied(false) }
  }
  return (
    <Dialog open={!!user} onClose={onClose} title={`رابط إعادة تعيين لـ ${user?.name || user?.username || ''}`}
      footer={<Button variant="ghost" onClick={onClose}>إغلاق</Button>}>
      {err ? <FormError message={err} /> : !link ? <Spinner /> : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            ابعته للموظف (واتساب مثلاً). بيفتحه وبيختار كلمة سر جديدة بنفسه. بيشتغل <b>مرة وحدة</b> ولمدة{' '}
            <span className="num">{link.hours}</span> ساعة، وبيبطل إذا تغيّرت كلمة السر.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly dir="ltr" value={link.url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 font-mono text-[12px]" />
            <Button variant="primary" onClick={copy}>{copied ? 'انتسخ ✓' : 'نسخ'}</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/* ---------- admin: name & email (the email is where "forgot password" links go) ---------- */
function EditUserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: '', email: '' })
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { setV({ name: user?.name ?? '', email: user?.email ?? '' }); setErr(undefined) }, [user])
  const save = async () => {
    if (!user) return
    setBusy(true)
    setErr(undefined)
    try {
      await call('PATCH', `/api/v1/admin/users/${user.id}/`, { name: v.name, email: v.email.trim() })
      onSaved()
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!user} onClose={onClose} title={`تعديل ${user?.name || user?.username || ''}`}
      footer={<><Button variant="primary" onClick={save} disabled={busy}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="الاسم الظاهر"><Input data-autofocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="الإيميل" hint="هون بيوصل رابط «نسيت كلمة السر». بدونه، الرابط بيعطيه المدير من «رابط إعادة تعيين»">
          <Input type="email" dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
        </Field>
        <FormError message={err} />
      </div>
    </Dialog>
  )
}
