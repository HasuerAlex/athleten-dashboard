/*
 * Verschickt fällige LockedIn-Erinnerungen per Firebase Cloud Messaging.
 * Läuft alle 15 Minuten über GitHub Actions (.github/workflows/reminders.yml).
 *
 * Ablauf je Erinnerungsart (training, habits, weekly = Wochenrückblick am Sonntag):
 *   1. reminders/{uid} mit `<art>.next <= jetzt` suchen (nur fällige Einträge werden gelesen)
 *   2. Inhalt aus den Daten der Person bauen (users/{uid}/data/...)
 *   3. an alle Geräte schicken, ungültige Geräte entfernen
 *   4. `next` auf den nächsten Tag (gleiche Uhrzeit, Zeitzone der Person) setzen
 *
 * Umgebung:
 *   FIREBASE_SERVICE_ACCOUNT  JSON des Dienstkontos (GitHub-Secret)
 *   FIRESTORE_EMULATOR_HOST   für lokale Tests; dann wird nichts verschickt, nur ausgegeben
 *   DRY_RUN=1                 nichts verschicken und nichts ändern, nur ausgeben
 *   NOW=2026-11-22T18:05:00Z  (nur Tests) so tun, als wäre jetzt dieser Zeitpunkt
 */
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { DEFAULT_HABITS } from '../src/lib/defaults.js'
import { addDaysKey, weekSummary } from '../src/lib/week.js'

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const dryRun = process.env.DRY_RUN === '1'
const fakeSend = emulator || dryRun
const MAX_LATE_MS = 3 * 60 * 60 * 1000 // mehr als 3 h zu spät → auslassen statt mitten in der Nacht zu schicken

initializeApp(
  emulator
    ? { projectId: process.env.GCLOUD_PROJECT || 'demo-athlete' }
    : { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) },
)
const db = getFirestore()

/* ---------- Zeit & Zeitzone ---------- */

function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute }
}

/** Lokale Wandzeit in `tz` → UTC-Date (berücksichtigt Sommer-/Winterzeit) */
function zonedToUtc(y, m, d, h, min, tz) {
  const target = Date.UTC(y, m - 1, d, h, min)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(guess), tz)
    guess += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
  }
  return new Date(guess)
}

/** Nächstes Auftreten von 'HH:MM' in `tz` strikt nach `after`; mit `sundayOnly` nur sonntags */
export function nextInZone(time, tz, after, sundayOnly = false) {
  const [h, min] = time.split(':').map(Number)
  const p = partsIn(after, tz)
  for (let add = 0; add < 10; add++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + add))
    if (sundayOnly && day.getUTCDay() !== 0) continue
    const cand = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, min, tz)
    if (cand > after) return cand
  }
}

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/** Datum (YYYY-MM-DD), Wochentag-Index (Mo=0) und Montag der Woche in `tz` */
function localDay(date, tz) {
  const p = partsIn(date, tz)
  const utc = new Date(Date.UTC(p.y, p.m - 1, p.d))
  const dayIdx = (utc.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.d - dayIdx))
  return {
    dateKey: keyOf(p.y, p.m, p.d),
    dayIdx,
    weekKey: keyOf(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
  }
}

function fmtDuration(min) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${pad(m)}`
}

/* ---------- Inhalte ---------- */

async function userData(uid, keys) {
  const refs = keys.map((k) => db.doc(`users/${uid}/data/${k}`))
  const snaps = await db.getAll(...refs)
  return Object.fromEntries(keys.map((k, i) => [k, snaps[i].exists ? snaps[i].data().value : undefined]))
}

const SPORT_LABELS = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', other: 'Sonstiges' }

/** z. B. „Rad · ab 17:00 · 45 km“ */
const sessionDetails = (s) =>
  [SPORT_LABELS[s.sport], s.start && `ab ${s.start}`, Number(s.distance) > 0 && `${String(s.distance).replace('.', ',')} km`].filter(Boolean).join(' · ')

const listText = (items) => (items.length <= 3 ? items.join(' · ') : `${items.slice(0, 3).join(' · ')} und ${items.length - 3} weitere`)

async function trainingMessage(uid, day) {
  const { plans = {}, recurring = [], recurringState = {} } = await userData(uid, ['plans', 'recurring', 'recurringState'])
  const state = recurringState[day.weekKey] ?? {}
  const own = (plans[day.weekKey] ?? []).filter((s) => s.day === day.dayIdx && !s.done)
  const rec = recurring.filter(
    (r) => r.day === day.dayIdx && r.since <= day.weekKey && (!r.until || day.weekKey < r.until) && !state[r.id],
  )
  const open = [...rec, ...own]
  if (open.length === 0) return null
  const total = open.reduce((a, s) => a + (Number(s.duration) || 0), 0)
  return {
    title: `Heute: ${open.length === 1 ? open[0].title : `${open.length} Einheiten`} (${fmtDuration(total)})`,
    body: open.length === 1 ? sessionDetails(open[0]) : listText(open.map((s) => `${s.title} (${fmtDuration(s.duration)})`)),
    tag: 'training',
  }
}

async function habitsMessage(uid, day) {
  const { habits = DEFAULT_HABITS, habitLog = {} } = await userData(uid, ['habits', 'habitLog'])
  const open = habits.filter((h) => !habitLog[h.id]?.[day.dateKey])
  if (open.length === 0) return null
  return {
    title: open.length === 1 ? 'Noch 1 Habit offen' : `Noch ${open.length} Habits offen`,
    body: listText(open.map((h) => h.name)),
    tag: 'habits',
  }
}

const hours = (min) => (min / 60).toLocaleString('de-AT', { maximumFractionDigits: 1 })

async function weeklyMessage(uid, day) {
  const data = await userData(uid, ['plans', 'recurring', 'recurringState', 'habits', 'habitLog', 'dayNotes'])
  const s = weekSummary(data, day.weekKey, day.dateKey)
  if (s.isEmpty) return null
  const prev = weekSummary(data, addDaysKey(day.weekKey, -7), day.dateKey)
  const parts = []
  if (s.planned > 0) parts.push(`${hours(s.done)} von ${hours(s.planned)} h Training`)
  if (s.habits.total > 0) parts.push(`Habits ${Math.round(s.habits.pct * 100)} %`)
  if (s.rating.count) parts.push(`Ø ${s.rating.avg.toLocaleString('de-AT', { maximumFractionDigits: 1 })} ★`)
  const delta = !prev.isEmpty && s.planned > 0 ? s.done - prev.done : 0
  if (delta) parts.push(`${delta > 0 ? '+' : '−'}${hours(Math.abs(delta))} h zur Vorwoche`)
  return { title: 'Dein Wochenrückblick', body: parts.join(' · '), tag: 'weekly' }
}

const BUILDERS = { training: trainingMessage, habits: habitsMessage, weekly: weeklyMessage }

/* ---------- Versand ---------- */

async function send(tokens, msg) {
  const entries = Object.entries(tokens ?? {})
  if (entries.length === 0) return []
  if (fakeSend) {
    console.log(`  → würde an ${entries.length} Gerät(e) senden:`, JSON.stringify(msg))
    return []
  }
  const res = await getMessaging().sendEachForMulticast({
    tokens: entries.map(([, t]) => t.token),
    data: msg,
    webpush: { headers: { Urgency: 'high', TTL: String(6 * 60 * 60) } },
  })
  const invalid = []
  res.responses.forEach((r, i) => {
    const code = r.error?.code
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') {
      invalid.push(entries[i][0])
    } else if (r.error) console.warn(`  ! Gerät ${entries[i][0]}: ${code}`)
  })
  console.log(`  → gesendet: ${res.successCount}, fehlgeschlagen: ${res.failureCount}`)
  return invalid
}

async function run() {
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date() // NOW nur für Tests
  let count = 0
  for (const kind of Object.keys(BUILDERS)) {
    const due = await db.collection('reminders').where(`${kind}.next`, '<=', Timestamp.fromDate(now)).get()
    for (const snap of due.docs) {
      const r = snap.data()
      const tz = r.tz || 'Europe/Vienna'
      const cfg = r[kind]
      const scheduled = cfg.next.toDate()
      const update = { [`${kind}.next`]: cfg.enabled ? Timestamp.fromDate(nextInZone(cfg.time, tz, now, kind === 'weekly')) : null }
      console.log(`${snap.id} · ${kind} · geplant ${scheduled.toISOString()}`)

      if (!cfg.enabled) console.log('  ausgeschaltet')
      else if (now - scheduled > MAX_LATE_MS) console.log('  zu spät, ausgelassen')
      else {
        const msg = await BUILDERS[kind](snap.id, localDay(scheduled, tz))
        if (!msg) console.log('  nichts zu erinnern')
        else {
          const invalid = await send(r.tokens, msg)
          for (const id of invalid) update[`tokens.${id}`] = FieldValue.delete()
          count++
        }
      }
      if (!dryRun) await snap.ref.update(update)
    }
  }
  console.log(`Fertig: ${count} Erinnerung(en).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
