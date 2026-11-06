import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns'
import { arSA } from 'date-fns/locale'

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول',
  'تشرين الأول', 'تشرين الثاني', 'كانون الأول']

/** "الخميس 6 تشرين الثاني" */
export function longDate(d: Date = new Date()): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function time(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

export function shortDate(iso: string): string {
  return format(new Date(iso), 'dd/MM')
}

/** For follow-ups: "اليوم 14:00", "بكرا", "من 3 أيام", "الأحد" */
export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = differenceInCalendarDays(d, new Date())
  if (isToday(d)) return `اليوم ${time(iso)}`
  if (isTomorrow(d)) return 'بكرا'
  if (isYesterday(d)) return 'مبارح'
  if (diff < 0) return `من ${-diff} ${-diff <= 10 ? 'أيام' : 'يوم'}`
  if (diff < 7) return DAYS[d.getDay()]
  return shortDate(iso)
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'ما في'
  if (Date.now() - new Date(iso).getTime() < 60_000) return 'هلق'
  return formatDistanceToNowStrict(new Date(iso), { locale: arSA, addSuffix: true })
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return differenceInCalendarDays(new Date(), new Date(iso))
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function money(v: string | null | undefined): string {
  if (!v) return ''
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** <input type="datetime-local"> <-> ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}

export const ACTIVITY_LABEL: Record<string, string> = {
  CALL: 'مكالمة', WHATSAPP: 'واتساب', VISIT: 'زيارة', NOTE: 'ملاحظة',
}
export const CATEGORY_LABEL: Record<string, string> = {
  CONTRACT: 'عقد', QUOTE: 'عرض سعر', PLAN: 'مخطط', INVOICE: 'فاتورة', PHOTO: 'صور', OTHER: 'أخرى',
}
export const PRIORITY_LABEL: Record<string, string> = { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عاجل' }
export const REASON_LABEL: Record<string, string> = {
  FOLLOWUP_DUE: 'موعد المتابعة فات', STAGE_SLA: 'طوّل بالمرحلة', NO_CONTACT: 'ما في تواصل من فترة',
}
