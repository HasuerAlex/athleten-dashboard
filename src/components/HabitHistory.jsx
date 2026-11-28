import { useEffect, useMemo, useRef, useState } from 'react'
import { Table2, BarChart3, ChevronRight, X } from 'lucide-react'
import { addDays, mondayOf, toKey } from '../lib/utils'

/*
 * Habit-Verlauf: Kalender-Heatmap (ein Feld pro Tag, Spalten = Wochen, Zeilen = Mo–So)
 * plus Säulen mit der Quote pro Woche/Monat. Farbe = eine neutrale Stufenskala (--color-heat-0…4).
 * „Alle“: Anteil erledigter Habits am Tag; einzelnes Habit: erledigt / nicht erledigt.
 */

const PERIODS = {
  month: { label: 'Monat', weeks: 5, bucket: 'week' },
  half: { label: '6 Monate', weeks: 26, bucket: 'month' },
  year: { label: 'Jahr', weeks: 53, bucket: 'month' },
}
const DAY_LABELS = ['Mo', '', 'Mi', '', 'Fr', '', 'So']
const HEAT = ['var(--color-heat-0)', 'var(--color-heat-1)', 'var(--color-heat-2)', 'var(--color-heat-3)', 'var(--color-heat-4)']
const pct = (v) => `${Math.round(v * 100)} %`
const fmtDay = (d) => d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtMonth = (d, long) => d.toLocaleDateString('de-AT', { month: long ? 'long' : 'short' })

function HabitHistory({ today, habits, log }) {
  const [period, setPeriod] = useState('month')
  const [habitId, setHabitId] = useState('all')
  const [showTable, setShowTable] = useState(false)
  const selected = habits.filter((h) => habitId === 'all' || h.id === habitId)
  const single = habitId !== 'all'

  const data = useMemo(() => {
    const { weeks, bucket } = PERIODS[period]
    const todayKey = toKey(today)
    const start = addDays(mondayOf(today), -(weeks - 1) * 7)
    const days = []
    for (let i = 0; i < weeks * 7; i++) {
      const date = addDays(start, i)
      const key = toKey(date)
      const future = key > todayKey
      const done = future ? 0 : selected.filter((h) => log[h.id]?.[key]).length
      days.push({ date, key, future, done, total: selected.length, share: selected.length ? done / selected.length : 0 })
    }
    const past = days.filter((d) => !d.future)

    // Säulen: pro Woche (Monat) oder pro Kalendermonat (6 Monate / Jahr)
    const buckets = []
    for (const d of past) {
      const id = bucket === 'week' ? toKey(mondayOf(d.date)) : `${d.date.getFullYear()}-${d.date.getMonth()}`
      let b = buckets.at(-1)
      if (!b || b.id !== id) buckets.push((b = { id, first: d.date, last: d.date, done: 0, total: 0, days: 0 }))
      b.done += d.done
      b.total += d.total
      b.days += 1
      b.last = d.date
    }

    // Kennzahlen: Tage „geschafft“ = alle gewählten Habits erledigt
    const isFull = (d) => d.total > 0 && d.done === d.total
    let longest = 0
    let run = 0
    for (const d of past) {
      run = isFull(d) ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    let current = 0
    for (let i = past.length - 1; i >= 0; i--) {
      if (isFull(past[i])) current++
      else if (i === past.length - 1) continue // heute noch offen → Serie zählt ab gestern
      else break
    }
    const done = past.reduce((a, d) => a + d.done, 0)
    const total = past.reduce((a, d) => a + d.total, 0)
    return { days, buckets, weeks, done, total, fullDays: past.filter(isFull).length, pastDays: past.length, longest, current }
  }, [period, today, log, habits, habitId]) // eslint-disable-line react-hooks/exhaustive-deps

  const level = (d) => (d.future || d.total === 0 ? null : single ? (d.done ? 4 : 0) : d.done === 0 ? 0 : Math.max(1, Math.ceil(d.share * 4)))
  const habitName = single ? selected[0]?.name : 'alle Habits'

  if (habits.length === 0) return null

  return (
    <div className="space-y-4">

      {/* Filter in einer Zeile über dem Diagramm */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Zeitraum" className="inline-flex gap-1 rounded-2xl bg-fill p-1">
          {Object.entries(PERIODS).map(([key, p]) => (
            <button
              key={key}
              role="radio"
              aria-checked={period === key}
              onClick={() => setPeriod(key)}
              className={`h-9 rounded-xl px-3 text-footnote font-semibold ${period === key ? 'bg-surface text-label shadow-sm' : 'text-label-2 hover:text-label'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-footnote text-label-2">
          <span className="sr-only">Habit</span>
          <select
            value={habitId}
            onChange={(e) => setHabitId(e.target.value)}
            className="h-11 max-w-56 rounded-2xl bg-fill px-3 text-subhead font-semibold text-label outline-none focus:ring-2 focus:ring-label"
          >
            <option value="all">Alle Habits</option>
            {habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-3xl bg-surface p-5">
        {/* Kennzahlen */}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={single ? 'Erledigt' : 'Alle geschafft'}>
            {data.fullDays} <span className="text-label-2">von {data.pastDays} Tagen</span>
          </Stat>
          <Stat label="Quote">{data.total ? pct(data.done / data.total) : '–'}</Stat>
          <Stat label="Aktuelle Serie">{data.current} {data.current === 1 ? 'Tag' : 'Tage'}</Stat>
          <Stat label="Längste Serie">{data.longest} {data.longest === 1 ? 'Tag' : 'Tage'}</Stat>
        </dl>

        <div className="mt-5 flex items-center justify-between gap-3">
          <h3 className="text-footnote font-semibold text-label-2">Pro Tag: {habitName}</h3>
          <button
            onClick={() => setShowTable(!showTable)}
            aria-pressed={showTable}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-label-2 hover:bg-fill hover:text-label"
          >
            {showTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
            {showTable ? 'Diagramm' : 'Tabelle'}
          </button>
        </div>

        {showTable ? (
          <BucketTable buckets={data.buckets} bucket={PERIODS[period].bucket} />
        ) : (
          <>
            <Heatmap days={data.days} weeks={data.weeks} level={level} single={single} period={period} />
            <Legend single={single} />
            <h3 className="mt-6 text-footnote font-semibold text-label-2">Quote pro {PERIODS[period].bucket === 'week' ? 'Woche' : 'Monat'}</h3>
            <Bars buckets={data.buckets} bucket={PERIODS[period].bucket} />
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, children }) {
  return (
    <div className="rounded-2xl bg-bg p-3">
      <dt className="text-footnote text-label-2">{label}</dt>
      <dd className="mt-0.5 text-headline font-bold tabular-nums">{children}</dd>
    </div>
  )
}

/* ---------- Tooltip (gemeinsam für Heatmap und Säulen) ---------- */

function useTooltip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null) // { x, y, value, label }
  const show = (e, value, label) => {
    const box = ref.current.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2 - box.left, y: r.top - box.top, value, label })
  }
  const node = tip && (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-label px-2.5 py-1.5 text-center whitespace-nowrap text-on-label shadow-lg"
      style={{ left: Math.max(60, Math.min(tip.x, (ref.current?.clientWidth ?? 0) - 60)), top: tip.y - 6 }}
    >
      <span className="block text-subhead font-semibold tabular-nums">{tip.value}</span>
      <span className="block text-caption opacity-80">{tip.label}</span>
    </div>
  )
  return { ref, show, hide: () => setTip(null), node }
}

/* ---------- Heatmap ---------- */

/** Breite eines Elements beobachten (für Zellgröße und Beschriftungsabstände) */
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function Heatmap({ days, weeks, level, single, period }) {
  const tt = useTooltip()
  const [boxRef, boxWidth] = useWidth()
  const labelCol = 24 // Breite der Wochentag-Spalte in px
  const gap = weeks > 30 ? 2 : 3
  // Zellgröße aus der verfügbaren Breite, in der Monatsansicht höchstens 32 px
  const maxCell = period === 'month' ? 32 : 18
  const cell = boxWidth ? Math.max(3, Math.min(maxCell, Math.floor((boxWidth - labelCol - weeks * gap) / weeks))) : 10
  const colWidth = cell + gap

  // Monatsname über der ersten Woche, die den 1. enthält – nur wenn genug Abstand zum vorigen ist
  const minLabelGap = 28
  const monthLabels = []
  for (let w = 0; w < weeks; w++) {
    const week = days.slice(w * 7, w * 7 + 7)
    const first = week.find((d) => d.date.getDate() === 1)
    const date = (first ?? (w === 0 ? week[0] : null))?.date
    if (!date) continue
    const prev = monthLabels.at(-1)
    if (prev && (w - prev.w) * colWidth < minLabelGap) {
      if (prev.w === 0) monthLabels.pop() // erste (angeschnittene) Spalte weicht dem echten Monatsanfang
      else continue
    }
    monthLabels.push({ w, date })
  }

  return (
    <div ref={boxRef} className="mt-2">
      <div ref={tt.ref} className="relative inline-block" onPointerLeave={tt.hide}>
        {/* Monatsnamen */}
        <div className="relative h-4" style={{ marginLeft: labelCol, width: weeks * colWidth }} aria-hidden>
          {monthLabels.map(({ w, date }) => (
            <span key={w} className="absolute top-0 text-caption leading-none whitespace-nowrap text-label-2" style={{ left: w * colWidth }}>
              {fmtMonth(date)}
            </span>
          ))}
        </div>
        <div className="flex">
          {/* Wochentage */}
          <div className="grid shrink-0" style={{ width: labelCol, gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: gap }} aria-hidden>
            {DAY_LABELS.map((l, i) => (
              <span key={i} className="flex items-center text-caption leading-none text-label-2">
                {cell >= 9 ? l : ''}
              </span>
            ))}
          </div>
          {/* Tage */}
          <div
            role="img"
            aria-label={`Kalender: jeder Tag als Feld, dunkler = ${single ? 'erledigt' : 'mehr Habits erledigt'}. Zahlen in der Tabellenansicht.`}
            className="grid grid-flow-col"
            style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoColumns: `${cell}px`, gap }}
          >
            {days.map((d) => {
              const lv = level(d)
              if (lv === null) return <span key={d.key} />
              const value = single ? (d.done ? 'Erledigt' : 'Nicht erledigt') : `${d.done} von ${d.total} erledigt`
              return (
                <span
                  key={d.key}
                  className="cursor-pointer transition-opacity hover:opacity-70"
                  style={{ background: HEAT[lv], borderRadius: Math.max(1.5, cell / 5) }}
                  onPointerEnter={(e) => tt.show(e, value, fmtDay(d.date))}
                  onPointerDown={(e) => tt.show(e, value, fmtDay(d.date))}
                />
              )
            })}
          </div>
        </div>
        {tt.node}
      </div>
    </div>
  )
}

function Legend({ single }) {
  return (
    <div className="mt-2 flex items-center gap-1.5 text-caption text-label-2" aria-hidden>
      {single ? (
        <>
          <span className="size-3 rounded-[3px]" style={{ background: HEAT[4] }} /> erledigt
          <span className="ml-3 size-3 rounded-[3px]" style={{ background: HEAT[0] }} /> nicht erledigt
        </>
      ) : (
        <>
          keine
          {HEAT.map((c, i) => (
            <span key={i} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          alle erledigt
        </>
      )}
    </div>
  )
}

/* ---------- Säulen: Quote pro Woche / Monat ---------- */

const bucketLabel = (b, bucket, long) =>
  bucket === 'week'
    ? `${b.first.toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric' })}${long ? `–${b.last.toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric' })}` : ''}`
    : `${fmtMonth(b.first, long)}${long ? ` ${b.first.getFullYear()}` : ''}`

function Bars({ buckets, bucket }) {
  const tt = useTooltip()
  const h = 96
  return (
    <div ref={tt.ref} className="relative mt-2" onPointerLeave={tt.hide}>
      <div className="relative flex h-[96px] items-end gap-[2px] border-b border-separator" style={{ height: h }}>
        {/* Hilfslinien 50 % / 100 % */}
        {[0.5, 1].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-separator" style={{ bottom: g * h }} aria-hidden>
            <span className="absolute -top-2 left-0 bg-surface pr-1 text-caption leading-none text-label-2">{g * 100} %</span>
          </div>
        ))}
        {buckets.map((b, i) => {
          const q = b.total ? b.done / b.total : 0
          const isLast = i === buckets.length - 1
          return (
            <button
              key={b.id}
              type="button"
              aria-label={`${bucketLabel(b, bucket, true)}: ${pct(q)}`}
              onPointerEnter={(e) => tt.show(e, pct(q), bucketLabel(b, bucket, true))}
              onFocus={(e) => tt.show(e, pct(q), bucketLabel(b, bucket, true))}
              onBlur={tt.hide}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
            >
              <span
                className="block w-full max-w-10 rounded-t-[4px] bg-heat-4 transition-opacity group-hover:opacity-70"
                style={{ height: `${Math.max(q * 100, q > 0 ? 2 : 0)}%` }}
              />
              {isLast && (
                <span className="absolute text-caption font-semibold whitespace-nowrap tabular-nums text-label" style={{ bottom: `calc(${q * 100}% + 4px)` }}>
                  {pct(q)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden>
        {buckets.map((b, i) => (
          <span key={b.id} className="flex min-w-0 flex-1 justify-center overflow-visible text-caption whitespace-nowrap text-label-2">
            {buckets.length > 8 && i % 2 ? '' : bucketLabel(b, bucket, false)}
          </span>
        ))}
      </div>
      {tt.node}
    </div>
  )
}

function BucketTable({ buckets, bucket }) {
  return (
    <table className="mt-2 w-full text-subhead">
      <thead>
        <tr className="text-left text-footnote text-label-2">
          <th className="py-1.5 font-semibold">{bucket === 'week' ? 'Woche' : 'Monat'}</th>
          <th className="py-1.5 text-right font-semibold">Erledigt</th>
          <th className="py-1.5 text-right font-semibold">Quote</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-separator">
        {[...buckets].reverse().map((b) => (
          <tr key={b.id}>
            <td className="py-1.5">{bucketLabel(b, bucket, true)}</td>
            <td className="py-1.5 text-right tabular-nums">
              {b.done} / {b.total}
            </td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{b.total ? pct(b.done / b.total) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------- Kompakte Vorschau unter den Habits + Dialog mit dem vollen Diagramm ---------- */

const PREVIEW_WEEKS = 12

export default function HabitHistoryCard({ today, habits, log }) {
  const [open, setOpen] = useState(false)
  if (habits.length === 0) return null

  const todayKey = toKey(today)
  const start = addDays(mondayOf(today), -(PREVIEW_WEEKS - 1) * 7)
  const days = Array.from({ length: PREVIEW_WEEKS * 7 }, (_, i) => {
    const date = addDays(start, i)
    const key = toKey(date)
    if (key > todayKey) return { key, lv: null }
    const done = habits.filter((h) => log[h.id]?.[key]).length
    return { key, lv: done === 0 ? 0 : Math.max(1, Math.ceil((done / habits.length) * 4)), done }
  })
  // Quote der letzten 28 Tage bis heute
  let done = 0
  let total = 0
  for (let i = 0; i < 28; i++) {
    const key = toKey(addDays(today, -i))
    done += habits.filter((h) => log[h.id]?.[key]).length
    total += habits.length
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-4 rounded-3xl bg-surface p-4 text-left transition-colors hover:bg-fill/50 sm:p-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-headline font-semibold">Verlauf</span>
          <span className="block text-subhead text-label-2">
            Letzte 4 Wochen: <span className="font-semibold text-label tabular-nums">{total ? pct(done / total) : '–'}</span>
          </span>
          {/* Mini-Kalender: 12 Wochen */}
          <span
            className="mt-3 grid grid-flow-col gap-[3px]"
            style={{ gridTemplateRows: 'repeat(7, 8px)', gridAutoColumns: '8px' }}
            aria-hidden
          >
            {days.map((d) => (
              <span key={d.key} className="rounded-[2px]" style={{ background: d.lv === null ? 'transparent' : HEAT[d.lv] }} />
            ))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 self-start text-subhead text-label-2">
          Öffnen <ChevronRight className="size-5" aria-hidden />
        </span>
      </button>

      {open && <HistoryDialog onClose={() => setOpen(false)} today={today} habits={habits} log={log} />}
    </>
  )
}

function HistoryDialog({ onClose, ...props }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-bg shadow-2xl sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2">
          <h2 id="history-title" className="text-title-2 font-bold">
            Habit-Verlauf
          </h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            autoFocus
            className="grid size-11 place-items-center rounded-full text-label-2 hover:bg-fill hover:text-label"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5">
          <HabitHistory {...props} />
        </div>
      </div>
    </div>
  )
}
