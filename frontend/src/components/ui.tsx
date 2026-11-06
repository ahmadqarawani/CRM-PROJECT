import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
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
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'md' ? 'h-[34px] px-3.5 text-sm' : 'h-7 px-2.5 text-[13px]',
        variant === 'primary' && 'bg-primary border-primary text-white hover:bg-primary-hover',
        variant === 'default' && 'bg-surface border-line text-ink hover:border-line-strong',
        variant === 'ghost' && 'border-transparent text-muted hover:bg-subtle hover:text-ink',
        variant === 'danger' && 'bg-surface border-line text-danger hover:bg-danger-soft',
        className,
      )}
    />
  )
})

/* ---------- Inputs ---------- */
const field = 'w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-faint hover:border-line-strong focus:border-primary focus:outline-none'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(field, 'h-[34px]', className)} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...p }, ref,
) {
  return <textarea ref={ref} rows={3} {...p} className={cx(field, 'py-2 leading-relaxed', className)} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...p }, ref,
) {
  return <select ref={ref} {...p} className={cx(field, 'h-[34px]', className)} />
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
      className={cx('m-auto rounded-[10px] border border-line bg-surface p-0 text-ink shadow-[0_12px_40px_rgb(11_46_74/0.18)]',
        wide ? 'w-[min(720px,94vw)]' : 'w-[min(480px,94vw)]')}
    >
      {open && (
        <div className="flex max-h-[86dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="m-0 text-[16px] font-semibold text-navy">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-faint hover:bg-subtle hover:text-ink" aria-label="إغلاق">✕</button>
          </div>
          <div className="overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-start gap-2 border-t border-line px-5 py-3">{footer}</div>}
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
      className="inline-grid flex-none place-items-center rounded-full bg-primary-soft font-semibold text-navy"
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
    <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-[12px]',
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
  return <div className={cx('rounded-card border border-line bg-surface', className)}>{children}</div>
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
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
    <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-3">
      <div>
        <h1 className="m-0 text-[20px] font-semibold text-navy">{title}</h1>
        {sub && <div className="text-muted">{sub}</div>}
      </div>
      <div className="ms-auto flex items-center gap-2">{actions}</div>
    </div>
  )
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px]',
        on ? 'border-[#bfd3e6] bg-[#eef4fa] text-primary' : 'border-line bg-surface text-muted hover:border-line-strong')}
    >
      {children}
    </button>
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
            className={cx('num h-7 min-w-7 rounded-md px-1.5', p === page ? 'bg-primary text-white' : 'text-muted hover:bg-subtle')}>{p}</button>)}
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
