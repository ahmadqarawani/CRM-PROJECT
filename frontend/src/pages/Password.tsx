import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import { call, ensureCsrf } from '../api/client'
import { BrandSquare, SectionBackdrop } from '../components/Brand'
import { Button, Dialog, Field, FormError, Input, Spinner } from '../components/ui'
import { applyServerErrors } from '../lib/forms'

const RULES = 'على الأقل 8 أحرف، ومش أرقام بس، ومش شي سهل متل اسمك أو 12345678'

/** Login-like shell for the public pages (forgot / reset). */
function AuthCard({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    ensureCsrf()
    document.documentElement.dataset.theme = 'brand'
  }, [])
  return (
    <div className="grid min-h-full place-items-center px-4 py-8">
      <SectionBackdrop />
      <div className="glass w-full max-w-[400px] rounded-[var(--r-lg)] p-8">
        <BrandSquare className="mx-auto mb-5 w-28" />
        <div className="mb-5 text-center">
          <h1 className="m-0 text-[17px] font-semibold text-navy">{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- 1. forgot password: ask for a link ---------- */
export function ForgotPassword() {
  const { register, handleSubmit, setError, formState } = useForm<{ login: string; root?: string }>()
  const [done, setDone] = useState<{ emailEnabled: boolean } | null>(null)
  const submit = handleSubmit(async (v) => {
    try {
      await ensureCsrf()
      const r = await call<{ email_enabled: boolean }>('POST', '/api/v1/auth/password-reset/', { login: v.login })
      setDone({ emailEnabled: r.email_enabled })
    } catch (e) { applyServerErrors(e, setError, ['login']) }
  })

  if (done) {
    return (
      <AuthCard title="شوف إيميلك">
        {done.emailEnabled ? (
          <p className="m-0 text-center text-[13.5px] leading-relaxed text-muted">
            إذا في حساب بهالاسم وإله إيميل، بعتنالو رابط لتحط كلمة سر جديدة. الرابط بيشتغل مرة وحدة ولمدة 24 ساعة.
          </p>
        ) : (
          <p className="m-0 rounded-[var(--r-ctl)] bg-accent-soft p-3 text-[13.5px] leading-relaxed text-accent-ink">
            إرسال الإيميلات مش مفعّل بالنظام لسا، فما رح يوصل شي. اطلب من مدير النظام «رابط إعادة تعيين» من الإعدادات ← المستخدمين.
          </p>
        )}
        <p className="mt-4 mb-0 text-center text-[12.5px] text-faint">ما وصلك شي؟ شوف البريد غير المرغوب، أو اطلب رابط من مدير النظام.</p>
        <Link to="/login" className="mt-5 block text-center text-[13.5px]">← رجوع لتسجيل الدخول</Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="نسيت كلمة السر؟" sub="اكتب اسم المستخدم أو الإيميل، ومنبعتلك رابط لتحط كلمة سر جديدة">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="اسم المستخدم أو الإيميل" error={formState.errors.login?.message}>
          <Input autoFocus dir="ltr" autoComplete="username" {...register('login', { required: 'مطلوب' })} />
        </Field>
        <FormError message={formState.errors.root?.message} />
        <Button variant="primary" type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'عم يبعت…' : 'ابعتلي رابط'}</Button>
        <Link to="/login" className="text-center text-[13.5px]">← رجوع لتسجيل الدخول</Link>
      </form>
    </AuthCard>
  )
}

/* ---------- 2. the link: set a new password ---------- */
type NewPw = { password: string; confirm: string; token?: string; root?: string }

export function ResetPassword() {
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const [account, setAccount] = useState<{ username: string; name: string } | null | 'bad'>(null)
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, setError, watch, formState } = useForm<NewPw>()

  useEffect(() => {
    ensureCsrf()
      .then(() => call<{ username: string; name: string }>('POST', '/api/v1/auth/password-reset/check/', { uid, token }))
      .then(setAccount, () => setAccount('bad'))
  }, [uid, token])

  const submit = handleSubmit(async (v) => {
    try {
      await call('POST', '/api/v1/auth/password-reset/confirm/', { uid, token, password: v.password })
      setSaved(true)
    } catch (e) { applyServerErrors(e, setError, ['password', 'token']) }
  })

  if (account === null) return <AuthCard title="إعادة تعيين كلمة السر"><Spinner /></AuthCard>
  if (account === 'bad') {
    return (
      <AuthCard title="الرابط ما بيشتغل">
        <p className="m-0 text-center text-[13.5px] text-muted">الرابط منتهي أو مستعمل قبل. كل رابط بيشتغل مرة وحدة ولمدة محدودة.</p>
        <Link to="/forgot-password" className="mt-5 block text-center text-[13.5px] font-medium">اطلب رابط جديد</Link>
      </AuthCard>
    )
  }
  if (saved) {
    return (
      <AuthCard title="تغيّرت كلمة السر ✓">
        <p className="m-0 text-center text-[13.5px] text-muted">صار فيك تفوت بكلمة السر الجديدة.</p>
        <Link to="/login" className="mt-5 block"><Button variant="primary" className="w-full">تسجيل الدخول</Button></Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="كلمة سر جديدة" sub={<>للحساب <b dir="ltr" className="text-ink">{account.username}</b></>}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {/* the username helps password managers save the new password against the right account */}
        <input type="text" autoComplete="username" value={account.username} readOnly hidden />
        <Field label="كلمة السر الجديدة" hint={RULES} error={formState.errors.password?.message}>
          <Input autoFocus type="password" dir="ltr" autoComplete="new-password" {...register('password', { required: 'مطلوب', minLength: { value: 8, message: '8 أحرف على الأقل' } })} />
        </Field>
        <Field label="أعد كتابتها" error={formState.errors.confirm?.message}>
          <Input type="password" dir="ltr" autoComplete="new-password"
            {...register('confirm', { required: 'مطلوب', validate: (v) => v === watch('password') || 'مش متطابقتين' })} />
        </Field>
        <FormError message={formState.errors.token?.message ?? formState.errors.root?.message} />
        <Button variant="primary" type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'عم يحفظ…' : 'حفظ كلمة السر'}</Button>
      </form>
    </AuthCard>
  )
}

/* ---------- 3. logged in: change my own password ---------- */
type ChangePw = { current_password: string; new_password: string; confirm: string; root?: string }

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { register, handleSubmit, setError, watch, reset, formState } = useForm<ChangePw>()
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (open) { reset(); setSaved(false) } }, [open, reset])
  const submit = handleSubmit(async (v) => {
    try {
      await call('POST', '/api/v1/auth/password/change/', { current_password: v.current_password, new_password: v.new_password })
      setSaved(true)
    } catch (e) { applyServerErrors(e, setError, ['current_password', 'new_password']) }
  })
  return (
    <Dialog open={open} onClose={onClose} title="تغيير كلمة السر"
      footer={saved
        ? <Button variant="primary" onClick={onClose}>تمام</Button>
        : <><Button variant="primary" onClick={submit} disabled={formState.isSubmitting}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      {saved ? <p className="m-0 text-mint-ink">تغيّرت كلمة السر ✓ — الأجهزة التانية المسجّلة بحسابك رح تطلب تسجيل دخول من جديد.</p> : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="كلمة السر الحالية" error={formState.errors.current_password?.message}>
            <Input data-autofocus type="password" dir="ltr" autoComplete="current-password" {...register('current_password', { required: 'مطلوب' })} />
          </Field>
          <Field label="كلمة السر الجديدة" hint={RULES} error={formState.errors.new_password?.message}>
            <Input type="password" dir="ltr" autoComplete="new-password" {...register('new_password', { required: 'مطلوب', minLength: { value: 8, message: '8 أحرف على الأقل' } })} />
          </Field>
          <Field label="أعد كتابتها" error={formState.errors.confirm?.message}>
            <Input type="password" dir="ltr" autoComplete="new-password"
              {...register('confirm', { required: 'مطلوب', validate: (v) => v === watch('new_password') || 'مش متطابقتين' })} />
          </Field>
          <FormError message={formState.errors.root?.message} />
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}
