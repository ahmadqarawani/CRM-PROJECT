import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'default' | 'ghost' | 'danger'; size?: 'sm' | 'md' }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'default', size = 'md', className, ...p }, ref,
) {
  return (
    <button
      ref={ref}
      {...p}
      className={cx(
        'btn inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-9 rounded-[var(--r-ctl)] px-4 text-sm' : 'h-7.5 rounded-[calc(var(--r-ctl)-3px)] px-2.5 text-[13px]',
        variant === 'primary' && 'btn-primary border-transparent text-white',
        variant === 'default' && 'btn-glass border-white/70 text-ink',
        variant === 'ghost' && 'border-transparent text-muted hover:bg-white/60 hover:text-ink',
        variant === 'danger' && 'btn-glass border-white/70 text-danger hover:bg-danger-soft/80',
        className,
      )}
    />
  )
})

/* ---------- Inputs ---------- */
/** full width unless the caller sets a width (w-44, sm:w-56, w-auto…): two width classes would fight */
const width = (className?: string) => (/(^|\s)([a-z0-9]+:)*(w-|flex-1)/.test(className ?? '') ? false : 'w-full')
const field = 'field rounded-[var(--r-ctl)] border border-line bg-white/75 px-3 text-sm text-ink placeholder:text-faint hover:border-line-strong focus:border-primary/60 focus:outline-none disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(field, width(className), 'h-9', className)} />
})

/** password field with a show/hide eye; always ltr (passwords are latin) */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function PasswordInput(
  { className, ...p }, ref,
) {
  const [shown, setShown] = useState(false)
  return (
    <div dir="ltr" className={cx('relative', width(className), className)}>
      <input ref={ref} {...p} type={shown ? 'text' : 'password'} className={cx(field, 'h-9 w-full pe-9')} />
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} aria-pressed={shown}
        className="absolute inset-y-0 end-0 grid w-9 place-items-center text-faint hover:text-ink">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...p }, ref,
) {
  return <textarea ref={ref} rows={3} {...p} className={cx(field, width(className), 'py-2 leading-relaxed', className)} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...p }, ref,
) {
  return <select ref={ref} {...p} className={cx(field, width(className), 'h-9 pe-2', className)} />
})

export function Field({ label, error, hint, children, className }: {
  label: string; error?: string; hint?: string; children: ReactNode; className?: string
}) {
  return (
    <label className={cx('flex flex-col gap-1', className)}>
      <span className="text-[13px] text-muted">{label}</span>
      {children}
      {error ? <span className="text-[12.5px] text-danger">{error}</span> : hint ? <span className="text-[12px] text-faint">{hint}</span> : null}
    </label>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{message}</div>
}

/* ---------- Dialog (native <dialog>: focus trap + Esc for free) ---------- */
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // showModal() moves focus to the first focusable (the close button); put it on the first real field
      const target = d.querySelector<HTMLElement>('[data-autofocus]') ??
        d.querySelector<HTMLElement>('input:not([type=hidden]):not([type=radio]):not([disabled]), textarea, select:not([disabled])')
      target?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('dialog-glass m-auto rounded-[var(--r-lg)] border border-white/70 p-0 text-ink',
        wide ? 'w-[min(720px,94vw)]' : 'w-[min(480px,94vw)]')}
    >
      {open && (
        <div className="flex max-h-[86dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-3.5">
            <h2 className="m-0 text-[16px] font-semibold text-navy">{title}</h2>
            <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-faint transition hover:bg-white/80 hover:text-ink" aria-label="إغلاق">✕</button>
          </div>
          <div className="overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-start gap-2 border-t border-line/70 bg-white/40 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

/* ---------- small pieces ---------- */
export function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const ch = (name ?? '؟').trim().charAt(0)
  return (
    <span
      title={name ?? undefined}
      className="avatar inline-grid flex-none place-items-center rounded-full font-semibold text-navy"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {ch}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: {
  children: ReactNode; tone?: 'neutral' | 'accent' | 'mint' | 'primary' | 'danger'; className?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-[6px] px-1.5 py-px text-[12px]',
      tone === 'neutral' && 'bg-subtle text-muted',
      tone === 'accent' && 'bg-accent-soft text-accent-ink',
      tone === 'mint' && 'bg-mint-soft text-mint-ink',
      tone === 'primary' && 'bg-primary-soft text-primary',
      tone === 'danger' && 'bg-danger-soft text-danger',
      className)}>
      {children}
    </span>
  )
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cx('inline-block size-2 flex-none rounded-full', className)} style={{ background: color }} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card rounded-card', className)}>{children}</div>
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-white/40 px-6 py-10 text-center backdrop-blur-sm">
      <div className="font-medium text-ink">{title}</div>
      {hint && <div className="max-w-sm text-[13px] text-muted">{hint}</div>}
      {action}
    </div>
  )
}

export function Spinner() {
  return <div className="py-10 text-center text-[13px] text-faint">عم يحمّل…</div>
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    // sticky glass bar: the page title stays while the list scrolls under it
    <div className="topbar sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-6">
      <div className="min-w-0">
        <h1 className="m-0 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-navy">{title}</h1>
        {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx('chip inline-flex h-7.5 items-center gap-1.5 rounded-full border px-3 text-[13px]',
        on ? 'chip-on border-primary/30 text-primary' : 'border-white/70 text-muted hover:text-ink')}
    >
      {children}
    </button>
  )
}

/* ---------- Switch (on/off) and Segmented (one of a few) ---------- */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cx('relative inline-flex h-5.5 w-10 flex-none items-center rounded-full border transition-colors disabled:opacity-50',
        on ? 'border-primary bg-primary' : 'border-line-strong bg-subtle')}>
      <span className={cx('absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(11_46_74/0.3)] transition-[inset-inline-start]',
        on ? 'start-[calc(100%-18px)]' : 'start-0.5')} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--r-ctl)] border border-line bg-subtle/80 p-0.5">
      {options.map(([k, text]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cx('h-7 rounded-[calc(var(--r-ctl)-3px)] px-2.5 text-[12.5px] transition',
            value === k ? (k === 'none' ? 'bg-white text-muted shadow-sm' : 'bg-white font-medium text-primary shadow-[0_1px_4px_rgb(11_46_74/0.12)]')
              : 'text-faint hover:text-ink')}>
          {text}
        </button>
      ))}
    </div>
  )
}

/* ---------- Pager: "31–60 من 461" + السابق / page numbers / التالي ---------- */
export const PAGE_SIZE = 30

function pageWindow(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const out: (number | '…')[] = []
  ;[...keep].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i > 0 && p - arr[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export function Pager({ page, count, pageSize = PAGE_SIZE, onChange, className }: {
  page: number; count: number; pageSize?: number; onChange: (page: number) => void; className?: string
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (pages <= 1) return null
  const go = (p: number) => {
    onChange(Math.min(Math.max(1, p), pages))
    ;(document.querySelector('[data-scroll]') ?? document.querySelector('main'))?.scrollTo({ top: 0 })
  }
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, count)
  return (
    <nav aria-label="الصفحات" className={cx('mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[13px]', className)}>
      <span className="me-1 w-full text-center text-faint sm:w-auto"><span className="num">{from}–{to}</span> من <span className="num">{count}</span></span>
      <Button size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>السابق</Button>
      {pageWindow(page, pages).map((p, i) => p === '…'
        ? <span key={`gap${i}`} className="px-1 text-faint">…</span>
        : <button key={p} onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}
            className={cx('num h-7.5 min-w-7.5 rounded-[calc(var(--r-ctl)-3px)] px-1.5 transition', p === page ? 'btn-primary text-white' : 'text-muted hover:bg-white/80 hover:text-ink')}>{p}</button>)}
      <Button size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>التالي</Button>
    </nav>
  )
}

/** Freshness of the last contact: full & mint when recent, short & orange when stale. */
export function Freshness({ days, staleAfter = 5 }: { days: number | null; staleAfter?: number }) {
  const ratio = days === null ? 1 : Math.min(days / (staleAfter * 2), 1)
  const stale = days === null || days > staleAfter
  return (
    <span className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-subtle" title={days === null ? 'ما في تواصل' : `قبل ${days} يوم`}>
      <span className={cx('h-full rounded-full', stale ? 'bg-accent' : 'bg-mint')} style={{ width: `${Math.max(8, (1 - ratio) * 100)}%` }} />
    </span>
  )
}
