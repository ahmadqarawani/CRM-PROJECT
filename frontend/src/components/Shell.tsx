import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { api, unwrap, type Me } from '../api/client'
import { useDashboard, useMarkNotification, useNotifications, useReadAll, useSearch } from '../api/hooks'
import { ago } from '../lib/format'
import { useLiveEvents } from '../lib/live'
import { Logo } from './Logo'
import { Avatar, cx } from './ui'

const I = {
  today: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>,
  clients: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.5.6 2.5 2 3 4.4" /></>,
  board: <><rect x="3.5" y="4.5" width="5" height="15" rx="1.2" /><rect x="10" y="4.5" width="5" height="10" rx="1.2" /><rect x="16.5" y="4.5" width="4" height="7" rx="1.2" /></>,
  home: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9.5 20v-6h5v6" /></>,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.4 2.4 4.6-4.8" /></>,
  archive: <><rect x="3.5" y="5" width="17" height="4" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
}
export function Icon({ d, size = 17 }: { d: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
}

function NavItem({ to, icon, label, count, hot }: { to: string; icon: ReactNode; label: string; count?: number; hot?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2.5 py-[7px] no-underline',
        isActive ? 'bg-primary-soft font-medium text-navy' : 'text-muted hover:bg-subtle hover:text-ink')}
    >
      <Icon d={icon} />
      {label}
      {count !== undefined && count > 0 && (
        <span className={cx('num ms-auto text-[11.5px]', hot ? 'text-accent' : 'text-faint')}>{count}</span>
      )}
    </NavLink>
  )
}

export function Shell({ me }: { me: Me }) {
  const [toast, setToast] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const dash = useDashboard()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const onNotification = useCallback(() => setToast('وصلك إشعار جديد'), [])
  useLiveEvents(onNotification)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const logout = async () => {
    await unwrap(api.POST('/api/v1/auth/logout/'))
    qc.clear()
    navigate('/login')
    location.reload()
  }

  return (
    <div className="grid h-full grid-cols-[232px_1fr]">
      <aside className="flex flex-col border-e border-line bg-surface px-3 py-4">
        <Logo />
        <button
          onClick={() => setSearchOpen(true)}
          className="mb-3 flex h-[34px] items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-[13px] text-faint hover:border-line-strong"
        >
          <Icon d={I.search} size={15} />بحث
          <span className="num ms-auto rounded border border-line px-1 text-[10.5px]">Ctrl K</span>
        </button>
        <nav className="flex flex-col gap-0.5">
          <NavItem to="/" icon={I.today} label="اليوم" count={dash.data?.overdue_count} hot />
          <NavItem to="/requests" icon={I.board} label="الطلبات" count={dash.data?.open_requests} />
          <NavItem to="/clients" icon={I.clients} label="العملاء" />
          <NavItem to="/apartments" icon={I.home} label="الشقق" />
          <NavItem to="/tasks" icon={I.tasks} label="المهام" count={dash.data?.my_tasks_today} />
          <div className="px-2.5 pt-5 pb-1.5 text-[11.5px] text-faint">أخرى</div>
          <NavItem to="/archive" icon={I.archive} label="الأرشيف" />
          {me.is_admin && <NavItem to="/settings" icon={I.settings} label="الإعدادات" />}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2 pt-3">
          <Avatar name={me.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate">{me.name}</div>
            <button onClick={logout} className="text-[12px] text-faint hover:text-ink">تسجيل خروج</button>
          </div>
          <Bell unread={dash.data?.unread_notifications ?? 0} />
        </div>
      </aside>

      <main className="min-w-0 overflow-auto">
        <Outlet />
      </main>

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 rounded-md border border-line bg-navy px-4 py-2.5 text-[13px] text-white shadow-lg">{toast}</div>
      )}
    </div>
  )
}

function Bell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false)
  const list = useNotifications()
  const mark = useMarkNotification()
  const readAll = useReadAll()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="الإشعارات">
        <Icon d={I.bell} size={18} />
        {unread > 0 && <span className="num absolute -top-0.5 -left-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute bottom-10 right-0 z-40 w-[340px] rounded-[10px] border border-line bg-surface shadow-[0_12px_40px_rgb(11_46_74/0.16)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <b className="font-medium">الإشعارات</b>
            <button onClick={() => readAll.mutate()} className="text-[12.5px] text-primary hover:underline">اعتبرها كلها مقروءة</button>
          </div>
          <div className="max-h-[360px] overflow-auto">
            {list.data?.results.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-faint">ما في إشعارات</div>}
            {list.data?.results.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  mark.mutate(n.id)
                  setOpen(false)
                  navigate(n.request ? `/requests?open=${n.request.id}` : '/tasks')
                }}
                className={cx('flex w-full items-start gap-2.5 border-b border-line px-4 py-2.5 text-start last:border-0 hover:bg-bg', !n.is_read && 'bg-accent-soft/40')}
              >
                <span className={cx('mt-1.5 size-2 flex-none rounded-full', n.is_read ? 'bg-line-strong' : n.kind === 'REQUEST_OVERDUE' ? 'bg-accent' : 'bg-primary')} />
                <span className="flex-1">
                  <span className="block text-[13.5px]">{n.message}</span>
                  <span className="text-[12px] text-faint">{ago(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const res = useSearch(q)
  const navigate = useNavigate()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = res.data && q.trim().length >= 2
    ? [
        { label: 'عملاء', items: res.data.clients.map((c) => ({ key: `c${c.id}`, text: c.name, sub: c.phone, to: `/clients/${c.id}` })) },
        { label: 'شقق', items: res.data.apartments.map((a) => ({ key: `a${a.id}`, text: a.title, sub: null, to: `/apartments/${a.id}` })) },
        { label: 'طلبات', items: res.data.requests.map((r) => ({ key: `r${r.id}`, text: r.title, sub: `#${r.id}`, to: `/requests?open=${r.id}` })) },
        { label: 'ملفات', items: res.data.documents.map((d) => ({ key: `d${d.id}`, text: d.original_name, sub: null, to: `/clients/${d.client_id}?tab=files` })) },
      ].filter((g) => g.items.length)
    : []

  return (
    <div className="fixed inset-0 z-50 bg-navy/25 pt-[12vh]" onMouseDown={onClose}>
      <div className="mx-auto w-[min(560px,92vw)] overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_12px_40px_rgb(11_46_74/0.2)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span className="text-faint"><Icon d={I.search} /></span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن عميل، رقم هاتف، شقة، طلب، ملف…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto py-1.5">
          {q.trim().length < 2 && <div className="px-4 py-5 text-center text-[13px] text-faint">اكتب حرفين على الأقل</div>}
          {q.trim().length >= 2 && groups.length === 0 && !res.isFetching && (
            <div className="px-4 py-5 text-center text-[13px] text-faint">ما لقينا شي</div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pt-2 pb-1 text-[11.5px] text-faint">{g.label}</div>
              {g.items.map((it) => (
                <button key={it.key} onClick={() => go(it.to)} className="flex w-full items-center gap-2 px-4 py-2 text-start hover:bg-bg">
                  <span>{it.text}</span>
                  {it.sub && <span className="num ms-auto text-faint">{it.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 py-2 text-[12px] text-faint">
          <Link to="/clients" onClick={onClose} className="text-primary">كل العملاء</Link>
        </div>
      </div>
    </div>
  )
}
