export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 30) / 34} viewBox="0 0 34 30" aria-hidden="true">
      <circle cx="21.5" cy="9" r="8.5" fill="#7CC9BC" fillOpacity=".9" />
      <circle cx="9" cy="13" r="8.5" fill="#F26B1D" fillOpacity=".92" />
      <circle cx="18" cy="20.5" r="9" fill="#0A5A9C" fillOpacity=".95" />
    </svg>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2 pt-1 pb-4">
      <LogoMark />
      <div dir="ltr" className="text-start">
        <div className="text-[18px] leading-tight font-semibold tracking-wide text-navy">BGI</div>
        <div className="text-[10.5px] tracking-[0.14em] text-faint">REAL ESTATE</div>
      </div>
    </div>
  )
}
