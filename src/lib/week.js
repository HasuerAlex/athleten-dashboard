/*
 * Wochen-Berechnungen ohne React-Abhängigkeiten – genutzt von der App (Trainingsplan, Wochenrückblick)
 * und vom Erinnerungs-Skript (scripts/send-reminders.mjs).
 * Datumsangaben sind Schlüssel 'YYYY-MM-DD'; eine Woche wird über ihren Montag identifiziert.
 */
import { DEFAULT_HABITS } from './defaults.js'

const pad = (n) => String(n).padStart(2, '0')

/** Schlüssel + n Tage (rein kalendarisch, unabhängig von Zeitzonen) */
export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Wiederkehrende Einheit gilt in Woche `weekKey`, wenn sie seit dann läuft und nicht beendet wurde */
export const activeIn = (weekKey) => (r) => r.since <= weekKey && (!r.until || weekKey < r.until)

/** Alle Einheiten einer Woche: wiederkehrende (ohne übersprungene) + einmalige, jeweils mit `done` */
export function weekSessions({ plans = {}, recurring = [], recurringState = {} }, weekKey) {
  const state = recurringState[weekKey] ?? {}
  const rec = recurring
    .filter(activeIn(weekKey))
    .filter((r) => state[r.id] !== 'skipped')
    .map((r) => ({ ...r, done: state[r.id] === 'done', recurring: true }))
  return [...rec, ...(plans[weekKey] ?? [])]
}

const SPORT_ORDER = ['swim', 'bike', 'run', 'strength', 'other']

/**
 * Zusammenfassung einer Woche.
 * `todayKey`: Tage danach zählen bei den Habits nicht mit (laufende Woche).
 */
export function weekSummary(data, weekKey, todayKey) {
  const { habits = DEFAULT_HABITS, habitLog = {}, dayNotes = {} } = data
  const sessions = weekSessions(data, weekKey)
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysKey(weekKey, i))
  const minutes = (list) => list.reduce((a, s) => a + (Number(s.duration) || 0), 0)
  const done = sessions.filter((s) => s.done)

  const bySport = SPORT_ORDER.map((sport) => {
    const list = sessions.filter((s) => s.sport === sport)
    const doneList = list.filter((s) => s.done)
    return {
      sport,
      planned: minutes(list),
      done: minutes(doneList),
      km: doneList.reduce((a, s) => a + (Number(s.distance) || 0), 0),
    }
  }).filter((s) => s.planned > 0)

  // Bewertungen (nur Tage mit Sternen)
  const rated = dayKeys
    .map((key, dayIdx) => ({ key, dayIdx, ...(dayNotes[key] ?? {}) }))
    .filter((d) => d.rating > 0)
  const best = rated.length ? rated.reduce((a, d) => (d.rating > a.rating ? d : a)) : null

  // Habits: nur Tage bis heute
  const possibleDays = dayKeys.filter((k) => !todayKey || k <= todayKey)
  const per = habits.map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    done: possibleDays.filter((k) => habitLog[h.id]?.[k]).length,
    possible: possibleDays.length,
  }))
  const habitsDone = per.reduce((a, h) => a + h.done, 0)
  const habitsTotal = habits.length * possibleDays.length
  const perfectDays = habits.length ? possibleDays.filter((k) => habits.every((h) => habitLog[h.id]?.[k])).length : 0

  return {
    weekKey,
    planned: minutes(sessions),
    done: minutes(done),
    sessionsTotal: sessions.length,
    sessionsDone: done.length,
    bySport,
    rating: { avg: rated.length ? rated.reduce((a, d) => a + d.rating, 0) / rated.length : 0, count: rated.length, best },
    habits: { done: habitsDone, total: habitsTotal, pct: habitsTotal ? habitsDone / habitsTotal : 0, perfectDays, per },
    notes: dayKeys.filter((k) => dayNotes[k]?.note).length,
    isEmpty: sessions.length === 0 && habitsDone === 0 && rated.length === 0,
  }
}
