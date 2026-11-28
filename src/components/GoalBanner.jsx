import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { SPORTS, daysBetween, fmtDate, fromKey, toKey } from '../lib/utils'
import { DEFAULT_RACE, RACE_TYPES, fmtKm, isValidRace, legsOf, raceLabel, raceOf } from '../lib/races'

/*
 * Signatur-Element: Die Vorbereitung als Rennstrecke.
 * Triathlon: Breiten grob nach der typischen Zeitverteilung (Schwimmen ≈ 1/6, Rad ≈ 1/2, Laufen ≈ 1/3),
 * damit auch das Schwimm-Segment auf dem Handy lesbar bleibt. Lauf und Radrennen: eine Strecke.
 */
const TRI_SHARES = { swim: 18, bike: 46, run: 36 }
const PHASE = { swim: 'im Wasser', bike: 'auf der Radstrecke', run: 'auf der Laufstrecke' }

function courseOf(race) {
  const legs = legsOf(race)
  return legs.map((leg) => ({ ...leg, share: legs.length === 1 ? 100 : TRI_SHARES[leg.sport] }))
}

export default function GoalBanner({ goal, setGoal, today }) {
  const [editing, setEditing] = useState(false)

  if (!goal) {
    return (
      <section aria-labelledby="goal-title" className="rounded-3xl bg-surface p-5 sm:p-8">
        {editing ? (
          <GoalForm
            goal={{ title: '', race: DEFAULT_RACE, startDate: toKey(today), targetDate: '' }}
            onCancel={() => setEditing(false)}
            onSave={(g) => (setGoal(g), setEditing(false))}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 id="goal-title" className="text-title-2 font-bold">
                Noch kein Ziel
              </h1>
              <p className="mt-1 text-subhead text-label-2">Leg deinen Wettkampf fest, dann zählt die App die Tage bis zum Start.</p>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="h-11 rounded-full bg-label px-5 text-headline font-semibold text-on-label hover:opacity-85 active:opacity-70"
            >
              Ziel festlegen
            </button>
          </div>
        )}
      </section>
    )
  }

  const start = fromKey(goal.startDate)
  const target = fromKey(goal.targetDate)
  const total = Math.max(1, daysBetween(start, target))
  const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)))
  const daysLeft = Math.max(0, daysBetween(today, target))
  const progress = (elapsed / total) * 100

  const race = raceOf(goal)
  const course = courseOf(race)
  let offset = 0
  const segments = course.map((c) => {
    const from = offset
    offset += c.share
    const filled = Math.min(100, Math.max(0, ((progress - from) / c.share) * 100))
    return { ...c, from, filled }
  })
  const current = segments.find((s) => progress < s.from + s.share)
  const totalKm = course.reduce((a, c) => a + c.km, 0)
  let position
  if (!current) position = '. Die Vorbereitung ist durch.'
  else if (course.length === 1)
    position = `. Als Rennen gedacht wärst du jetzt bei km ${(totalKm * progress / 100).toLocaleString('de-AT', { maximumFractionDigits: 1 })} von ${fmtKm(totalKm).replace(' km', '')}.`
  else position = `. Als Rennen gedacht wärst du jetzt ${PHASE[current.sport]}.`

  return (
    <section aria-labelledby="goal-title" className="rounded-3xl bg-surface p-5 sm:p-8">
      {editing ? (
        <GoalForm goal={goal} onCancel={() => setEditing(false)} onSave={(g) => (setGoal(g), setEditing(false))} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-subhead text-label-2">Hauptziel</p>
            <div className="flex items-start gap-1">
              <h1 id="goal-title" className="text-large-title font-bold tracking-tight text-balance">
                {goal.title}
              </h1>
              <button
                onClick={() => setEditing(true)}
                aria-label="Ziel bearbeiten"
                className="-mt-0.5 grid size-11 shrink-0 place-items-center rounded-full text-label-2 hover:bg-fill hover:text-label active:bg-fill"
              >
                <Pencil className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-subhead font-semibold">{raceLabel(race)}</p>
            <p className="text-subhead text-label-2">
              Race Day {fmtDate(target, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <p className="sm:text-right" aria-live="polite">
            {daysLeft > 0 ? (
              <>
                <span className="block text-large-title font-bold tabular-nums tracking-tight">{daysLeft} Tage</span>
                <span className="text-subhead text-label-2">bis zum Start</span>
              </>
            ) : (
              <span className="text-title-2 font-bold">
                {daysBetween(today, target) === 0 ? 'Heute ist Race Day' : 'Ziel erreicht 🏅'}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Rennstrecke */}
      <div className="mt-8">
        <div
          role="progressbar"
          aria-label="Fortschritt der Vorbereitung"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={elapsed}
          aria-valuetext={`Tag ${elapsed} von ${total}, ${Math.round(progress)} Prozent`}
          className="relative flex gap-1"
        >
          {segments.map((s) => (
            <div key={s.sport} className="h-2.5 overflow-hidden rounded-full bg-fill" style={{ width: `${s.share}%` }}>
              <div
                className={`h-full rounded-full ${SPORTS[s.sport].bg} transition-[width] duration-700 ease-out`}
                style={{ width: `${s.filled}%` }}
              />
            </div>
          ))}
          {/* Positionsmarke */}
          {progress > 0 && progress < 100 && (
            <span
              aria-hidden
              className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-label shadow transition-[left] duration-700 ease-out"
              style={{ left: `${progress}%` }}
            />
          )}
        </div>

        <div className="mt-2 flex gap-1" aria-hidden>
          {segments.map((s) => {
            const Icon = SPORTS[s.sport].icon
            return (
              <div key={s.sport} className="flex min-w-0 items-center gap-0.5 whitespace-nowrap text-caption text-label-2" style={{ width: `${s.share}%` }}>
                <Icon className={`size-3 shrink-0 ${SPORTS[s.sport].text}`} />
                <span>{fmtKm(s.km)}</span>
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-subhead text-label-2">
          <span className="font-semibold text-label">
            Tag {elapsed} von {total} · {Math.round(progress)} %
          </span>
          {position}
        </p>
      </div>
    </section>
  )
}

function GoalForm({ goal, onCancel, onSave }) {
  const [draft, setDraft] = useState({ ...goal, race: raceOf(goal) })
  const race = draft.race
  const setRace = (r) => setDraft({ ...draft, race: r })
  const invalid =
    !draft.title.trim() || !isValidRace(race) || !draft.startDate || !draft.targetDate || draft.targetDate <= draft.startDate
  const field =
    'mt-1 block w-full rounded-xl border border-separator bg-bg px-3 py-2.5 text-body text-label outline-none focus:border-label'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (invalid) return
        const cleanRace = race.type === 'bike' ? { type: 'bike', distance: Number(race.distance) } : { type: race.type, variant: race.variant }
        onSave({ ...draft, title: draft.title.trim(), race: cleanRace })
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      className="space-y-4"
    >
      <label className="block text-subhead text-label-2">
        Ziel
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder={race.type === 'run' ? 'z. B. Vienna City Marathon' : race.type === 'bike' ? 'z. B. Dreiländergiro' : 'z. B. Ironman Klagenfurt'}
          className={`${field} text-title-3 font-semibold`}
        />
      </label>

      <fieldset>
        <legend className="text-subhead text-label-2">Wettkampf</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-2xl bg-fill p-1">
          {Object.entries(RACE_TYPES).map(([key, type]) => {
            const Icon = SPORTS[type.sport].icon
            const active = race.type === key
            return (
              <button
                type="button"
                key={key}
                aria-pressed={active}
                onClick={() => !active && setRace(key === 'bike' ? { type: 'bike', distance: '' } : { type: key, variant: type.defaultVariant })}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-footnote font-semibold transition-colors ${
                  active ? 'bg-surface text-label shadow-sm' : 'text-label-2 hover:text-label'
                }`}
              >
                <Icon className={`size-5 ${active ? SPORTS[type.sport].text : ''}`} aria-hidden />
                {type.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      {race.type === 'bike' ? (
        <label className="block text-subhead text-label-2">
          Distanz in km
          <input
            inputMode="decimal"
            value={race.distance ?? ''}
            onChange={(e) => setRace({ ...race, distance: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
            placeholder="z. B. 120"
            className={field}
          />
        </label>
      ) : (
        <fieldset>
          <legend className="text-subhead text-label-2">Distanz</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-fill p-1 sm:grid-cols-4">
            {Object.entries(RACE_TYPES[race.type].variants).map(([key, v]) => {
              const active = race.variant === key
              return (
                <button
                  type="button"
                  key={key}
                  aria-pressed={active}
                  onClick={() => setRace({ ...race, variant: key })}
                  className={`min-h-14 rounded-xl px-2 py-1.5 text-center transition-colors ${
                    active ? 'bg-surface text-label shadow-sm' : 'text-label-2 hover:text-label'
                  }`}
                >
                  <span className="block text-footnote font-semibold">{v.label}</span>
                  {!v.label.endsWith('km') && (
                    <span className="block text-caption">{Object.values(v.legs).map((km) => fmtKm(km).replace(' km', '')).join(' / ')} km</span>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-subhead text-label-2">
          Vorbereitung ab
          <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={field} />
        </label>
        <label className="block text-subhead text-label-2">
          Race Day
          <input type="date" value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} className={field} />
        </label>
      </div>
      {draft.targetDate && draft.startDate && draft.targetDate <= draft.startDate && (
        <p className="text-subhead text-label-2" role="alert">
          Der Race Day muss nach dem Start der Vorbereitung liegen.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-5 text-headline font-semibold hover:bg-fill">
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={invalid}
          className="h-11 rounded-full bg-label px-5 text-headline font-semibold text-on-label hover:opacity-85 active:opacity-70 disabled:opacity-30"
        >
          Speichern
        </button>
      </div>
    </form>
  )
}
