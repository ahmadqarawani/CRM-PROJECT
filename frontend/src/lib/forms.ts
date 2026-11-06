import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '../api/client'

/** The backend validates (single source of truth); put its messages on the form fields.
 *  API field "client_id" maps to form field "client_id"; unknown fields go to root. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: string[]) {
  if (!(err instanceof ApiError)) {
    setError('root' as Path<T>, { message: 'صار خطأ بالاتصال، جرّب مرة تانية' })
    return
  }
  const entries = Object.entries(err.errors)
  if (entries.length === 0) {
    setError('root' as Path<T>, { message: err.message })
    return
  }
  for (const [field, msgs] of entries) {
    const target = fields.includes(field) ? field : 'root'
    setError(target as Path<T>, { message: msgs[0] })
  }
}
