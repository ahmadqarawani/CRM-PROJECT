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

/** dd/mm/yyyy as agreed with the team */
export function shortDate(iso: string): string {
  return format(new Date(iso), 'dd/MM/yyyy')
}

/** For follow-ups: "اليوم 14:00", "بكرا 10:00", "من 3 أيام", "الأحد" */
export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = differenceInCalendarDays(d, new Date())
  if (isToday(d)) return `اليوم ${time(iso)}`
  if (isTomorrow(d)) return `بكرا ${time(iso)}`
  if (isYesterday(d)) return 'مبارح'
  if (diff < 0) return `من ${-diff} ${-diff <= 10 ? 'أيام' : 'يوم'}`
  if (diff < 7) return `${DAYS[d.getDay()]} ${time(iso)}`
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

export function money(v: string | null | undefined, currency = 'USD'): string {
  if (!v) return ''
  const n = Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
  return currency === 'USD' ? `${n}$` : `${n} ${currency}`
}

/** <input type="datetime-local"> <-> ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}
/** quick follow-up chips: tomorrow / 3 days / week / month at 10:00 */
export function inDays(days: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const ACTIVITY_LABEL: Record<string, string> = {
  CALL: 'مكالمة', WHATSAPP: 'واتساب', MEETING: 'جلسة / اجتماع', SITE_VISIT: 'معاينة', VIEWING: 'جولة على عقار',
  TASK: 'مهمة', NOTE: 'ملاحظة', SYSTEM: 'النظام',
}
export const CATEGORY_LABEL: Record<string, string> = {
  PHOTO: 'صور', PLAN: 'مخطط', QUOTE: 'دراسة / عرض سعر', CONTRACT: 'عقد', INVOICE: 'فاتورة / إيصال',
  OWNERSHIP: 'أوراق ملكية', OTHER: 'أخرى',
}
export const KIND_LABEL: Record<string, string> = {
  FINISHING: 'إكساء', BUY: 'يريد شراء', RENT: 'يريد استئجار', SELL: 'بيع عقار', LEASE: 'تأجير عقار',
}
export const TEMP_LABEL: Record<string, string> = { HOT: 'ساخن', WARM: 'دافئ', COLD: 'بارد' }
export const REASON_LABEL: Record<string, string> = {
  ACTIVITY_OVERDUE: 'متابعة فات وقتها', NO_NEXT_STEP: 'ما إلو خطوة جاية', STUCK: 'طوّل بمرحلته',
}
export const LISTING_LABEL: Record<string, string> = { SALE: 'للبيع', RENT: 'للإيجار', BOTH: 'بيع أو إيجار' }
export const PSTATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'متاح', RESERVED: 'محجوز', SOLD: 'مباع', RENTED: 'مؤجر', WITHDRAWN: 'مسحوب',
}
export const BUILDING_LABEL: Record<string, string> = { UNDER_CONSTRUCTION: 'قيد الإنشاء', NEW: 'جديد', USED: 'مستخدم' }
export const OWNER_ROLE_LABEL: Record<string, string> = { OWNER: 'مالك', AGENT: 'وكيل', BROKER: 'وسيط', RELATIVE: 'قريب المالك' }
export const QUOTE_LABEL: Record<string, string> = {
  DRAFT: 'مسودة', SENT: 'مُرسلة', ACCEPTED: 'مقبولة', REJECTED: 'مرفوضة', EXPIRED: 'منتهية', CANCELLED: 'ملغاة',
}
export const MATCH_LABEL: Record<string, string> = {
  SUGGESTED: 'مقترح', SENT: 'أُرسل', VIEWED: 'عاينه', INTERESTED: 'مهتم', REJECTED: 'رفض',
}
export const floorLabel = (f: number | null | undefined) =>
  f === null || f === undefined ? '' : f === -1 ? 'قبو' : f === 0 ? 'أرضي' : `ط${f}`

/** local Syrian display: +963933418288 -> 0933 418 288 */
export function phoneLabel(n: string): string {
  if (n.startsWith('+963') && n.length === 13) return `0${n.slice(4, 7)} ${n.slice(7, 10)} ${n.slice(10)}`
  return n
}
export function waLink(n: string): string {
  return `https://wa.me/${n.replace('+', '')}`
}
