import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { api, unwrap, type Me } from '../api/client'
import { useDashboard, useMarkNotification, useNotifications, useReadAll } from '../api/hooks'
import { ago } from '../lib/format'
import { useLiveEvents } from '../lib/live'
import { useAccess } from '../lib/access'
import { ErrorBoundary } from './ErrorBoundary'
import { BrandMark, SectionBackdrop, useSectionTheme } from './Brand'
import { SearchPalette } from './SearchPalette'
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
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
}
export function Icon({ d, size = 17 }: { d: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
}

function NavItem({ to, icon, label, count, hot }: { to: string; icon: ReactNode; label: string; count?: number; hot?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('nav-item flex items-center gap-2.5 rounded-[var(--r-ctl)] px-2.5 py-2 no-underline',
        isActive ? 'active font-medium text-navy' : 'text-muted hover:text-ink')}
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
  const [moreOpen, setMoreOpen] = useState(false)
  const dash = useDashboard()
  const unread = dash.data?.unread_notifications ?? 0
  const { can } = useAccess()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const section = useSectionTheme()

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
    <div className="grid h-full grid-cols-1 md:grid-cols-[244px_1fr]">
      <SectionBackdrop />
      <aside className="glass-strong z-10 hidden flex-col overflow-x-hidden overflow-y-auto border-e border-white/70 px-3 py-4 shadow-[1px_0_0_rgb(11_46_74/0.05),8px_0_30px_-20px_rgb(11_46_74/0.25)] md:flex">
        <div className="mb-4 flex justify-center"><BrandMark section={section} /></div>
        <button
          onClick={() => setSearchOpen(true)}
          className="btn btn-glass mb-4 flex h-9 items-center gap-2 rounded-[var(--r-ctl)] border border-white/80 px-2.5 text-[13px] text-faint hover:text-ink"
        >
          <Icon d={I.search} size={15} />بحث
          <span className="num ms-auto rounded border border-line px-1 text-[10.5px]">Ctrl K</span>
        </button>
        <nav className="flex flex-col gap-0.5">
          <NavItem to="/" icon={I.today} label="اليوم" count={dash.data?.overdue_count} hot />
          {can('deals.view') && <>
            <NavItem to="/finishing" icon={I.board} label="الإكساء" />
            <NavItem to="/real-estate" icon={I.board} label="طلبات العقارات" />
          </>}
          {can('properties.view') && <NavItem to="/properties" icon={I.home} label="العقارات المعروضة" />}
          {can('contacts.view') && <NavItem to="/contacts" icon={I.clients} label="العملاء" />}
          <div className="px-2.5 pt-5 pb-1.5 text-[11.5px] text-faint">أخرى</div>
          {can('contacts.merge') && <NavItem to="/contacts/duplicates" icon={I.clients} label="مكررات محتملة" />}
          <NavItem to="/archive" icon={I.archive} label="الأرشيف" />
          {me.is_admin && <NavItem to="/settings" icon={I.settings} label="الإعدادات" />}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 rounded-card border border-white/80 bg-white/60 px-2.5 py-2.5 shadow-[0_6px_18px_-12px_rgb(11_46_74/0.35)]">
          <Avatar name={me.name} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{me.name}</div>
            {me.role && <div className="truncate text-[11.5px] text-faint">{(me.role as { name: string }).name}</div>}
            <button onClick={logout} className="text-[12px] text-faint hover:text-ink">تسجيل خروج</button>
          </div>
          <Bell unread={unread} />
        </div>
      </aside>

      <main className="min-w-0 overflow-auto pb-16 md:pb-0">
        <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
      </main>

      <nav className="glass-strong fixed inset-x-0 bottom-0 z-20 flex border-t border-white/80 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgb(11_46_74/0.3)] md:hidden">
        {([['/', I.today, 'اليوم', true], ['/finishing', I.board, 'الإكساء', can('deals.view')], ['/real-estate', I.home, 'العقارات', can('deals.view')], ['/contacts', I.clients, 'العملاء', can('contacts.view')]] as const).filter((x) => x[3]).map(([to, icon, label]) => (
          <NavLink key={to as string} to={to as string} end={to === '/'} className={({ isActive }) => cx('my-1 flex flex-1 flex-col items-center gap-0.5 rounded-card py-1.5 text-[11.5px] no-underline transition', isActive ? 'bg-white font-medium text-primary shadow-[0_4px_14px_-8px_rgb(11_46_74/0.4)]' : 'text-muted')}>
            <Icon d={icon} size={20} />{label as string}
          </NavLink>
        ))}
        <button onClick={() => setSearchOpen(true)} className="my-1 flex flex-1 flex-col items-center gap-0.5 rounded-card py-1.5 text-[11.5px] text-muted"><Icon d={I.search} size={20} />بحث</button>
        <button onClick={() => setMoreOpen(true)} className="relative my-1 flex flex-1 flex-col items-center gap-0.5 rounded-card py-1.5 text-[11.5px] text-muted">
          <Icon d={I.more} size={20} />المزيد
          {unread > 0 && <span className="absolute top-1.5 left-[calc(50%-14px)] size-2 rounded-full bg-accent" />}
        </button>
      </nav>
      {moreOpen && <MoreSheet me={me} unread={unread} onLogout={logout} onClose={() => setMoreOpen(false)} />}
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {toast && (
        <div className="fixed bottom-20 left-4 z-50 rounded-card border border-white/20 bg-navy/90 px-4 py-2.5 text-[13px] text-white shadow-[0_14px_30px_-12px_rgb(11_46_74/0.6)] backdrop-blur-md md:bottom-5 md:left-5">{toast}</div>
      )}
    </div>
  )
}

/** Phones: everything the sidebar has that the bottom bar doesn't. */
function MoreSheet({ me, unread, onLogout, onClose }: { me: Me; unread: number; onLogout: () => void; onClose: () => void }) {
  const [view, setView] = useState<'menu' | 'notifications'>('menu')
  const { can } = useAccess()
  const { pathname } = useLocation()
  const first = useRef(pathname)
  useEffect(() => { if (pathname !== first.current) onClose() }, [pathname, onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const links: [string, ReactNode, string][] = [
    ...(can('properties.view') ? [['/properties', I.home, 'العقارات المعروضة'] as [string, ReactNode, string]] : []),
    ...(can('contacts.merge') ? [['/contacts/duplicates', I.clients, 'مكررات محتملة'] as [string, ReactNode, string]] : []),
    ['/archive', I.archive, 'الأرشيف'],
    ...(me.is_admin ? [['/settings', I.settings, 'الإعدادات'] as [string, ReactNode, string]] : []),
  ]
  return (
    <div className="fixed inset-0 z-40 bg-navy/20 backdrop-blur-[3px] md:hidden" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass-strong absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-auto rounded-t-[20px] border-t border-white/80 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-12px_40px_rgb(11_46_74/0.2)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {view === 'notifications'
            ? <button onClick={() => setView('menu')} className="text-[13px] text-primary">→ رجوع</button>
            : <><Avatar name={me.name} /><b className="min-w-0 flex-1 truncate font-medium">{me.name}</b></>}
          <button onClick={onClose} className="ms-auto rounded p-1 text-faint hover:bg-subtle" aria-label="إغلاق">✕</button>
        </div>
        {view === 'notifications' ? <NotificationList onPicked={onClose} /> : (
          <nav className="flex flex-col p-2">
            {links.map(([to, icon, label]) => (
              <NavLink key={to} to={to} onClick={onClose}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-md px-3 py-3 no-underline', isActive ? 'bg-primary-soft text-navy' : 'text-ink')}>
                <Icon d={icon} size={18} />{label}
              </NavLink>
            ))}
            <button onClick={() => setView('notifications')} className="flex items-center gap-3 rounded-md px-3 py-3 text-start">
              <Icon d={I.bell} size={18} />الإشعارات
              {unread > 0 && <span className="num ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] text-white">{unread}</span>}
            </button>
            <button onClick={onLogout} className="mt-1 flex items-center gap-3 rounded-md border-t border-line px-3 py-3 text-start text-muted">تسجيل خروج</button>
          </nav>
        )}
      </div>
    </div>
  )
}

function NotificationList({ onPicked }: { onPicked: () => void }) {
  const list = useNotifications()
  const mark = useMarkNotification()
  const readAll = useReadAll()
  const navigate = useNavigate()
  const unread = list.data?.results.filter((n) => !n.is_read).length ?? 0
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-3">
        <b className="font-semibold text-navy">الإشعارات</b>
        {unread > 0 && <span className="num rounded-full bg-accent-soft px-1.5 text-[11.5px] text-accent-ink">{unread} جديد</span>}
        {unread > 0 && (
          <button onClick={() => readAll.mutate()} className="ms-auto rounded-full px-2 py-0.5 text-[12.5px] text-primary transition hover:bg-primary-soft">
            اعتبرها كلها مقروءة
          </button>
        )}
      </div>
      <div className="max-h-[min(380px,60dvh)] overflow-y-auto">
        {list.isLoading && <div className="px-4 py-8 text-center text-[13px] text-faint">عم يحمّل…</div>}
        {list.data?.results.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-9 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary"><Icon d={I.bell} size={20} /></span>
            <div className="font-medium text-ink">ما في إشعارات</div>
            <div className="text-[12.5px] text-faint">رح نخبرك هون بالمواعيد يلي اقتربت والطلبات يلي انسندتلك</div>
          </div>
        )}
        {list.data?.results.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              mark.mutate(n.id)
              onPicked()
              navigate(n.deal_id ? `/finishing?open=${n.deal_id}` : '/')
            }}
            className={cx('flex w-full items-start gap-2.5 border-b border-line/70 px-4 py-3 text-start transition-colors last:border-0 hover:bg-primary-soft/50', !n.is_read && 'bg-accent-soft/35')}
          >
            <span className={cx('mt-1.5 size-2 flex-none rounded-full', n.is_read ? 'bg-line-strong' : n.kind === 'ACTIVITY_OVERDUE' ? 'bg-accent' : 'bg-primary')} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px]">{n.message}</span>
              <span className="text-[12px] text-faint">{ago(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

/** The bell lives in the (scrollable) sidebar, so its panel is portalled to <body> with a fixed position
 *  above the bell — inside the sidebar it would be clipped and add a sideways scrollbar. */
function Bell({ unread }: { unread: number }) {
  const [pos, setPos] = useState<{ bottom: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const open = pos !== null
  const toggle = () => {
    if (open) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    // open upwards, its right edge a little past the bell, so it spreads over the page (RTL: sidebar on the right)
    setPos({ bottom: window.innerHeight - r.top + 10, right: Math.max(8, window.innerWidth - r.right - 14) })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setPos(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null)
    const close = () => setPos(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button ref={btn} onClick={toggle} aria-expanded={open} aria-label="الإشعارات"
        className={cx('relative grid size-8 place-items-center rounded-full text-muted transition hover:bg-white hover:text-ink', open && 'bg-white text-primary shadow-sm')}>
        <Icon d={I.bell} size={18} />
        {unread > 0 && <span className="num absolute -top-0.5 -left-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-white ring-2 ring-white">{unread}</span>}
      </button>
      {pos && createPortal(
        <div ref={panel} role="dialog" aria-label="الإشعارات" style={{ bottom: pos.bottom, right: pos.right }}
          className="fixed z-50 w-[min(360px,calc(100vw-16px))] overflow-hidden rounded-[var(--r-lg)] border border-white bg-white/95 shadow-[0_0_0_1px_rgb(11_46_74/0.06),0_24px_60px_-20px_rgb(11_46_74/0.5)] backdrop-blur-xl [animation:pop_.16s_var(--ease)]">
          <NotificationList onPicked={() => setPos(null)} />
        </div>, document.body)}
    </>
  )
}
