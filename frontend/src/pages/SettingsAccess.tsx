import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { call } from '../api/client'
import { Avatar, Badge, Button, Card, Field, FormError, Input, Segmented, Select, Spinner, Switch, cx } from '../components/ui'
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
  const [form, setForm] = useState({ username: '', name: '', password: '', role_id: '' })
  const [err, setErr] = useState<string>()
  const patch = (id: number, body: object) =>
    call('PATCH', `/api/v1/admin/users/${id}/`, body).then(refresh).catch((e) => alert((e as Error).message))

  return (
    <div>
      <Card className="mb-5 overflow-hidden">
        {users.data?.map((u) => (
          <div key={u.id} className={cx('flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-bg/60', !u.is_active && 'opacity-55')}>
            <Avatar name={u.name || u.username} size={34} />
            <div className="min-w-32 flex-1">
              <b className="font-medium">{u.name || u.username}</b>{u.id === me?.id && <span className="text-[12px] text-faint"> · أنت</span>}
              <div className="text-[12px] text-faint" dir="ltr">{u.username}</div>
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
            <Button size="sm" variant="ghost" onClick={() => { const pw = prompt('كلمة سر جديدة (8 أحرف على الأقل)'); if (pw) patch(u.id, { password: pw }) }}>
              تغيير كلمة السر
            </Button>
          </div>
        ))}
      </Card>

      <h3 className="mb-2 text-[14px] font-semibold text-navy">مستخدم جديد</h3>
      <Card className="p-4">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault()
          setErr(undefined)
          try {
            await call('POST', '/api/v1/admin/users/', { ...form, role_id: form.role_id ? Number(form.role_id) : undefined })
            setForm({ username: '', name: '', password: '', role_id: '' })
            refresh()
          } catch (x) { setErr((x as Error).message) }
        }}>
          <Field label="اسم المستخدم"><Input dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="الاسم الظاهر"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
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
