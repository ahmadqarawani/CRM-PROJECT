import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import realEstateLogo from '../assets/brand/bgi-real-estate.webp'
import unlockedLogo from '../assets/brand/bgi-unlocked.webp'

/** Which part of the company a page belongs to: BGI Unlocked (finishing), BGI Real Estate, or the group. */
export type Section = 'brand' | 'unlocked' | 'estate'

export function sectionOf(pathname: string): Section {
  if (pathname.startsWith('/finishing')) return 'unlocked'
  if (pathname.startsWith('/real-estate') || pathname.startsWith('/properties')) return 'estate'
  return 'brand'
}

/** Puts the section on <html data-theme> (colours, light, corners live in themes.css) and draws its light. */
export function useSectionTheme(): Section {
  const { pathname } = useLocation()
  const section = sectionOf(pathname)
  useEffect(() => {
    document.documentElement.dataset.theme = section
  }, [section])
  return section
}

export function SectionBackdrop() {
  return (
    <div className="app-bg" aria-hidden="true">
      <span className="bg-brand" />
      <span className="bg-unlocked" />
      <span className="bg-estate" />
    </div>
  )
}

const LOGO = {
  unlocked: { src: unlockedLogo, alt: 'BGI Unlocked — Bahri Group Investment', to: '/finishing' },
  estate: { src: realEstateLogo, alt: 'BGI Real Estate — Bahri Group Investment', to: '/real-estate' },
}

/** Sidebar brand: the section's own logo, or both logos in a square split by its diagonal. */
export function BrandMark({ section }: { section: Section }) {
  if (section === 'brand') return <BrandSquare className="w-[136px]" />
  const logo = LOGO[section]
  return (
    // keyed by section so the logo fades in when you switch
    <div key={section} className="brand-single w-full px-3 py-3.5">
      <img src={logo.src} alt={logo.alt} className="block h-auto w-full" draggable={false} />
    </div>
  )
}

export function BrandSquare({ className }: { className?: string }) {
  return (
    <div className={['brand-square', className].filter(Boolean).join(' ')} role="group" aria-label="BGI">
      <Link to={LOGO.unlocked.to} className="top" title="الإكساء — BGI Unlocked">
        <img src={LOGO.unlocked.src} alt={LOGO.unlocked.alt} draggable={false} />
      </Link>
      <Link to={LOGO.estate.to} className="bottom" title="العقارات — BGI Real Estate">
        <img src={LOGO.estate.src} alt={LOGO.estate.alt} draggable={false} />
      </Link>
    </div>
  )
}
