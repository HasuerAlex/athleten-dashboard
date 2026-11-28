import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Undo2, X } from 'lucide-react'
import GoalBanner from './components/GoalBanner'
import WeeklyPlan from './components/WeeklyPlan'
import HabitTracker, { DEFAULT_HABITS, isOldDefaultHabits, needsRename, renameDefaults } from './components/HabitTracker'
import AccountBar from './components/AccountBar'
import Brand from './components/Brand'
import PainLabCard from './components/PainLabCard'
import WeekSummary from './components/WeekSummary'
import HabitHistory from './components/HabitHistory'
import TabBar, { TABS } from './components/TabBar'
import FoodTracker from './components/FoodTracker'
import SettingsSheet from './components/SettingsSheet'
import { weekSessions, weekSummary } from './lib/week'
import { useAuth, useSyncedState } from './lib/sync'
import { mondayOf, addDays, toKey, fmtDate, isoWeek, startOfDay } from './lib/utils'

function useToday() {
  const [today, setToday] = useState(() => startOfDay(new Date()))
  useEffect(() => {
    // Um Mitternacht (bzw. beim Zurückkehren in den Tab) aktualisieren
    const tick = () => {
      const now = startOfDay(new Date())
      setToday((t) => (t.getTime() === now.getTime() ? t : now))
    }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

/** Aktiver Bereich steht im URL-Hash (#training, #ernaehrung, #painlab) → Neuladen und Zurück-Taste funktionieren */
function useTab() {
  const read = () => {
    const id = window.location.hash.slice(1)
    return TABS.some((t) => t.id === id) ? id : 'training'
  }
  const [tab, setTabState] = useState(read)
  useEffect(() => {
    const onHash = () => setTabState(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const setTab = (id) => {
    if (id === tab) return
    window.location.hash = id
    window.scrollTo({ top: 0 })
  }
  return [tab, setTab]
}

export default function App() {
  const today = useToday()
  const [tab, setTab] = useTab()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const currentMonday = mondayOf(today)
  const [weekStart, setWeekStart] = useState(currentMonday)

  const { user, ready: authReady } = useAuth()
  const [syncError, setSyncError] = useState(null)
  const onSyncError = useCallback((e) => setSyncError(e?.code || e?.message || 'unbekannt'), [])
  const [goal, setGoal] = useSyncedState('goal', null, user, onSyncError)
  const [plans, setPlans] = useSyncedState('plans', {}, user, onSyncError)
  const [habits, setHabits] = useSyncedState('habits', DEFAULT_HABITS, user, onSyncError)
  const [habitLog, setHabitLog] = useSyncedState('habitLog', {}, user, onSyncError)
  const [recurring, setRecurring] = useSyncedState('recurring', [], user, onSyncError)
  const [recurringState, setRecurringState] = useSyncedState('recurringState', {}, user, onSyncError)
  const [dayNotes, setDayNotes] = useSyncedState('dayNotes', {}, user, onSyncError)
  const [profile, setProfile] = useSyncedState('profile', {}, user, onSyncError)
  const [food, setFood] = useSyncedState('food', {}, user, onSyncError)
  const [foodFavorites, setFoodFavorites] = useSyncedState('foodFavorites', [], user, onSyncError)

  /** Einheiten eines bestimmten Tages (für Ernährung) */
  const sessionsFor = (date) => {
    const dayIdx = (date.getDay() + 6) % 7
    return weekSessions({ plans, recurring, recurringState }, toKey(mondayOf(date))).filter((s) => s.day === dayIdx)
  }

  // Einmalige Umstellung: unveränderte alte Standard-Habits durch die neuen Grundpunkte ersetzen
  // (gleiche IDs für Wasser und Schlaf → deren Verlauf bleibt erhalten)
  useEffect(() => {
    if (!user) return
    if (isOldDefaultHabits(habits)) setHabits(DEFAULT_HABITS)
    else if (needsRename(habits)) setHabits(renameDefaults(habits)) // „Wasser getrunken“ → „3L Wasser getrunken“ usw.
  }, [user, habits, setHabits])

  // Widerrufen-Stapel: Löschen fragt nicht nach, lässt sich aber rückgängig machen.
  // Bleibt sichtbar, bis man ihn schließt (kein Timer).
  const [undoStack, setUndoStack] = useState([])
  const onDeleted = useCallback((message, restore) => setUndoStack((s) => [...s, { message, restore }]), [])
  const undo = () => {
    const last = undoStack.at(-1)
    if (!last) return
    last.restore()
    setUndoStack((s) => s.slice(0, -1))
  }
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
        e.preventDefault()
        undo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const isCurrentWeek = toKey(weekStart) === toKey(currentMonday)
  const weekEnd = addDays(weekStart, 6)

  // Wochenrückblick: vergangene Wochen immer, die laufende Woche ab Sonntag
  const weekKey = toKey(weekStart)
  const todayKey = toKey(today)
  const showSummary = weekKey < toKey(currentMonday) || (isCurrentWeek && today.getDay() === 0)
  const summaryData = { plans, recurring, recurringState, habits, habitLog, dayNotes }
  const summary = showSummary ? weekSummary(summaryData, weekKey, todayKey) : null
  const previousSummary = summary ? weekSummary(summaryData, toKey(addDays(weekStart, -7)), todayKey) : null
  const lastUndo = undoStack.at(-1)

  if (!authReady) return <div className="min-h-dvh" aria-busy="true" />

  return (
    <div className="min-h-dvh pb-28">
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:pt-6">
        <AccountBar
          brand={<Brand />}
          user={user}
          ready={authReady}
          error={syncError}
          clearError={() => setSyncError(null)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <TabBar tab={tab} setTab={setTab} />

        {tab === 'ernaehrung' && (
          <FoodTracker
            today={today}
            profile={profile}
            food={food}
            setFood={setFood}
            favorites={foodFavorites}
            setFavorites={setFoodFavorites}
            sessionsFor={sessionsFor}
            onDeleted={onDeleted}
            openSettings={() => setSettingsOpen(true)}
          />
        )}

        {tab === 'painlab' && (
          <div className="max-w-xl">
            <PainLabCard />
          </div>
        )}

        {tab === 'training' && (
        <>
        <GoalBanner goal={goal} setGoal={setGoal} today={today} />

        {/* Woche – gilt für Training und Habits */}
        <nav aria-label="Woche wählen" className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Vorherige Woche"
              className="grid size-11 place-items-center rounded-full bg-surface hover:bg-fill"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Nächste Woche"
              className="grid size-11 place-items-center rounded-full bg-surface hover:bg-fill"
            >
              <ChevronRight className="size-5" />
            </button>
            <p className="ml-2" aria-live="polite">
              <span className="block text-headline font-semibold">
                {isCurrentWeek ? 'Diese Woche' : `KW ${isoWeek(weekStart)}`}
              </span>
              <span className="block text-footnote text-label-2">
                {fmtDate(weekStart)} – {fmtDate(weekEnd, { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </p>
          </div>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(currentMonday)}
              className="h-11 rounded-full bg-surface px-4 text-subhead font-semibold hover:bg-fill"
            >
              Heute
            </button>
          )}
        </nav>

        {summary && !summary.isEmpty && (
          <WeekSummary
            summary={summary}
            previous={previousSummary}
            isCurrent={isCurrentWeek}
            weekLabel={`KW ${isoWeek(weekStart)} · ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`}
          />
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <WeeklyPlan
            weekStart={weekStart}
            today={today}
            plans={plans}
            setPlans={setPlans}
            recurring={recurring}
            setRecurring={setRecurring}
            recurringState={recurringState}
            setRecurringState={setRecurringState}
            dayNotes={dayNotes}
            setDayNotes={setDayNotes}
            onDeleted={onDeleted}
          />
          <div className="space-y-4">
            <HabitTracker
              weekStart={weekStart}
              today={today}
              habits={habits}
              setHabits={setHabits}
              log={habitLog}
              setLog={setHabitLog}
              onDeleted={onDeleted}
            />
            <HabitHistory today={today} habits={habits} log={habitLog} />
          </div>
        </div>

        </>
        )}

              </main>

      {lastUndo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 lg:bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto flex max-w-md items-center gap-1 rounded-2xl bg-label py-1.5 pr-1.5 pl-4 text-on-label shadow-2xl"
        >
          <p className="min-w-0 flex-1 truncate text-subhead">{lastUndo.message}</p>
          <button onClick={undo} className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-subhead font-semibold hover:bg-on-label/15">
            <Undo2 className="size-4" /> Widerrufen
          </button>
          <button
            onClick={() => setUndoStack([])}
            aria-label="Hinweis schließen"
            className="grid size-11 place-items-center rounded-full hover:bg-on-label/15"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
      {settingsOpen && <SettingsSheet user={user} profile={profile} setProfile={setProfile} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
