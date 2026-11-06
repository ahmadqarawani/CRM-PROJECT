import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { api, ensureCsrf, unwrap } from '../api/client'
import { K } from '../api/hooks'
import { LogoMark } from '../components/Logo'
import { Button, Field, FormError, Input } from '../components/ui'
import { applyServerErrors } from '../lib/forms'

type F = { username: string; password: string; root?: string }

export function Login() {
  const { register, handleSubmit, setError, formState } = useForm<F>()
  const qc = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    ensureCsrf()
  }, [])

  const onSubmit = handleSubmit(async (v) => {
    try {
      await ensureCsrf()
      const me = await unwrap(api.POST('/api/v1/auth/login/', { body: { username: v.username, password: v.password } }))
      qc.setQueryData(K.me, me)
      navigate('/')
    } catch (e) {
      applyServerErrors(e, setError, ['username', 'password'])
    }
  })

  return (
    <div className="grid min-h-full place-items-center px-4">
      <form onSubmit={onSubmit} className="glass w-full max-w-[380px] rounded-[20px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <div className="text-[17px] font-semibold text-navy">إدارة العملاء</div>
            <div className="text-[13px] text-faint" dir="ltr">BGI Real Estate</div>
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          <Field label="اسم المستخدم" error={formState.errors.username?.message}>
            <Input autoFocus autoComplete="username" dir="ltr" {...register('username', { required: 'مطلوب' })} />
          </Field>
          <Field label="كلمة السر" error={formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" dir="ltr" {...register('password', { required: 'مطلوب' })} />
          </Field>
          <FormError message={formState.errors.root?.message} />
          <Button variant="primary" type="submit" disabled={formState.isSubmitting} className="mt-1">
            {formState.isSubmitting ? 'عم يدخل…' : 'دخول'}
          </Button>
        </div>
      </form>
    </div>
  )
}
