import { Waves, Bike, Footprints, Dumbbell, Shapes } from 'lucide-react'

/* ---------- Datum ---------- */

export const DAY = 24 * 60 * 60 * 1000
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** Lokales Datum als YYYY-MM-DD (keine UTC-Verschiebung). */
export function toKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** Montag der Woche, in der `date` liegt. */
export function mondayOf(date) {
  const d = startOfDay(date)
  const offset = (d.getDay() + 6) % 7 // Mo=0 … So=6
  return addDays(d, -offset)
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY)
}

/** ISO-Kalenderwoche */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / DAY + 1) / 7)
}

export const fmtDate = (date, opts = { day: '2-digit', month: '2-digit' }) =>
  date.toLocaleDateString('de-AT', opts)

/* ---------- Dauer ---------- */

export function fmtDuration(min) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${String(m).padStart(2, '0')}`
}

export const fmtHours = (min) => (min / 60).toLocaleString('de-AT', { maximumFractionDigits: 1 })

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/* ---------- Sportarten ---------- */
// Klassen stehen ausgeschrieben, damit Tailwind sie erkennt. Farben kommen aus den Tokens in index.css.
export const SPORTS = {
  swim: { label: 'Schwimmen', icon: Waves, text: 'text-swim', bg: 'bg-swim', tint: 'bg-swim/15', border: 'border-swim' },
  bike: { label: 'Rad', icon: Bike, text: 'text-bike', bg: 'bg-bike', tint: 'bg-bike/15', border: 'border-bike' },
  run: { label: 'Laufen', icon: Footprints, text: 'text-run', bg: 'bg-run', tint: 'bg-run/15', border: 'border-run' },
  strength: { label: 'Kraft', icon: Dumbbell, text: 'text-strength', bg: 'bg-strength', tint: 'bg-strength/15', border: 'border-strength' },
  other: { label: 'Sonstiges', icon: Shapes, text: 'text-other', bg: 'bg-other', tint: 'bg-other/15', border: 'border-other', defaultTitle: 'Training', example: 'z. B. Fußball, Klettern, Yoga' },
}
