import { useCallback, useEffect, useState } from 'react'
import { ACTIVITY_LEVELS, SEXES, bmr, profileComplete } from '../lib/nutrition'
import { Bell, CalendarCheck, Dumbbell, ListChecks, Share, X } from 'lucide-react'
import {
  disablePush,
  enablePush,
  localDeviceId,
  pushConfigured,
  pushSupport,
  saveReminder,
  showTestNotification,
  useReminders,
} from '../lib/push'

export default function SettingsSheet({ user, profile, setProfile, onClose }) {
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
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center bg-bg px-2 py-1">
          <span />
          <h2 id="settings-title" className="text-headline font-semibold">
            Einstellungen
          </h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="grid size-11 place-items-center justify-self-end rounded-full text-label-2 hover:bg-fill hover:text-label"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 px-4 pt-2">
          <Profile profile={profile} setProfile={setProfile} loggedIn={Boolean(user)} />
          {user ? <Notifications uid={user.uid} /> : <p className="rounded-2xl bg-surface p-4 text-subhead text-label-2">Melde dich an, um Erinnerungen zu nutzen.</p>}
        </div>
      </div>
    </div>
  )
}

function Notifications({ uid }) {
  const [support, setSupport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const onError = useCallback((e) => setMessage(`Fehler: ${e?.code || e?.message}`), [])
  const reminders = useReminders(uid, onError)

  const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))

  useEffect(() => {
    pushSupport().then(setSupport)
    // Berechtigung über die Permissions-API verfolgen (merkt auch spätere Änderungen in den Browser-Einstellungen)
    let status
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((st) => {
        status = st
        const update = () => setPermission(st.state === 'prompt' ? 'default' : st.state)
        update()
        st.onchange = update
      })
      .catch(() => {})
    return () => {
      if (status) status.onchange = null
    }
  }, [])

  const deviceId = localDeviceId()
  const enabledHere = Boolean(reminders && deviceId && reminders.tokens[deviceId] && permission === 'granted')
  const deviceCount = reminders ? Object.keys(reminders.tokens).length : 0

  const toggleDevice = async () => {
    setBusy(true)
    setMessage(null)
    try {
      if (enabledHere) await disablePush(uid)
      else {
        await enablePush(uid)
        setPermission('granted')
        // Beim ersten Einschalten beide Erinnerungen mit Standardzeit aktivieren
        if (reminders && !reminders.training.enabled && !reminders.habits.enabled && !reminders.weekly.enabled) {
          await saveReminder(uid, 'training', { ...reminders.training, enabled: true })
          await saveReminder(uid, 'habits', { ...reminders.habits, enabled: true })
          await saveReminder(uid, 'weekly', { ...reminders.weekly, enabled: true })
        }
      }
    } catch (e) {
      setMessage(
        e.code === 'denied'
          ? 'Dein Browser blockiert Benachrichtigungen für LockedIn. Erlaub sie in den Browser- oder Systemeinstellungen und versuch es dann noch einmal.'
          : e.code === 'dismissed'
            ? 'Du hast die Anfrage geschlossen. Tippe noch einmal und wähle „Erlauben“.'
            : `Das hat nicht geklappt (${e.code || e.message}).`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="notif-title" className="space-y-2">
      <h3 id="notif-title" className="px-4 text-footnote font-semibold text-label-2">
        Erinnerungen
      </h3>

      <div className="overflow-hidden rounded-2xl bg-surface">
        {!pushConfigured ? (
          <p className="p-4 text-subhead text-label-2">Für Push-Benachrichtigungen fehlt noch die Einrichtung in Firebase.</p>
        ) : support === 'ios-install' ? (
          <div className="flex gap-3 p-4 text-subhead">
            <Share className="mt-0.5 size-5 shrink-0 text-label-2" aria-hidden />
            <p>
              Am iPhone gehen Benachrichtigungen nur, wenn LockedIn als App installiert ist: in Safari auf <b>Teilen</b> tippen, dann{' '}
              <b>„Zum Home-Bildschirm“</b>. Danach LockedIn über das neue Symbol öffnen.
            </p>
          </div>
        ) : support === 'unsupported' ? (
          <p className="p-4 text-subhead text-label-2">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
        ) : (
          <>
            <Row
              icon={Bell}
              title="Auf diesem Gerät"
              subtitle={
                enabledHere
                  ? `Aktiv${deviceCount > 1 ? ` · insgesamt ${deviceCount} Geräte` : ''}`
                  : deviceCount > 0
                    ? `Aus · aktiv auf ${deviceCount} ${deviceCount === 1 ? 'anderem Gerät' : 'anderen Geräten'}`
                    : 'Aus'
              }
            >
              <Switch label="Benachrichtigungen auf diesem Gerät" checked={enabledHere} disabled={busy || support === null || !reminders} onChange={toggleDevice} />
            </Row>

            {reminders && deviceCount > 0 && (
              <>
                <ReminderRow
                  icon={Dumbbell}
                  title="Training"
                  subtitle="Die Einheiten des Tages, nur an Trainingstagen"
                  value={reminders.training}
                  onChange={(v) => saveReminder(uid, 'training', v).catch(onError)}
                />
                <ReminderRow
                  icon={ListChecks}
                  title="Habits"
                  subtitle="Kommt nur, wenn abends noch etwas offen ist"
                  value={reminders.habits}
                  onChange={(v) => saveReminder(uid, 'habits', v).catch(onError)}
                />
                <ReminderRow
                  icon={CalendarCheck}
                  title="Wochenrückblick"
                  subtitle="Sonntags mit Stunden, Quote und Vergleich zur Vorwoche"
                  value={reminders.weekly}
                  onChange={(v) => saveReminder(uid, 'weekly', v).catch(onError)}
                />
              </>
            )}
          </>
        )}
      </div>

      {message && (
        <p role="alert" className="px-4 text-footnote text-label-2">
          {message}
        </p>
      )}

      {enabledHere && (
        <button
          onClick={() =>
            showTestNotification().catch(() =>
              setMessage('Dein Gerät hat die Test-Benachrichtigung nicht angezeigt. Schau in den Systemeinstellungen nach, ob LockedIn Benachrichtigungen schicken darf.'),
            )
          }
          className="h-11 w-full rounded-2xl bg-surface text-body font-semibold hover:bg-fill"
        >
          Test-Benachrichtigung zeigen
        </button>
      )}

      {pushConfigured && support === 'ok' && (
        <p className="px-4 text-footnote text-label-2">
          Erinnerungen kommen auf allen Geräten, auf denen du sie eingeschaltet hast. Sie können ein paar Minuten nach der
          eingestellten Uhrzeit eintreffen.
        </p>
      )}
    </section>
  )
}

function Row({ icon: Icon, title, subtitle, children, extra }) {
  return (
    <div className="border-separator px-4 py-2.5 [&:not(:first-child)]:border-t">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fill text-label" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body">{title}</p>
          {subtitle && <p className="text-footnote text-label-2">{subtitle}</p>}
        </div>
        {children}
      </div>
      {extra && <div className="mt-2 pl-12">{extra}</div>}
    </div>
  )
}

function ReminderRow({ icon, title, subtitle, value, onChange }) {
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      extra={
        value.enabled && (
          <label className="flex items-center justify-between gap-3 text-subhead text-label-2">
            Uhrzeit
            <input
              type="time"
              value={value.time}
              onChange={(e) => e.target.value && onChange({ ...value, time: e.target.value })}
              className="h-9 rounded-lg bg-fill px-2 text-body text-label tabular-nums outline-none focus:ring-2 focus:ring-label"
            />
          </label>
        )
      }
    >
      <Switch label={`${title}-Erinnerung`} checked={value.enabled} onChange={() => onChange({ ...value, enabled: !value.enabled })} />
    </Row>
  )
}

function Switch({ label, checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-label' : 'bg-fill ring-1 ring-separator'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function Profile({ profile, setProfile, loggedIn }) {
  const p = profile ?? {}
  // Zahlen erst beim Verlassen des Felds speichern (spart Schreibvorgänge)
  const [draft, setDraft] = useState({ weight: p.weight ?? '', height: p.height ?? '', age: p.age ?? '' })
  useEffect(() => setDraft({ weight: p.weight ?? '', height: p.height ?? '', age: p.age ?? '' }), [p.weight, p.height, p.age])
  const commit = (key) => {
    const v = Number(String(draft[key]).replace(',', '.'))
    const value = v > 0 ? Math.round(v * 10) / 10 : null
    if (value !== (p[key] ?? null)) setProfile({ ...p, [key]: value })
  }
  const field = 'h-11 w-24 rounded-xl border border-separator bg-bg px-3 text-right text-body text-label tabular-nums outline-none focus:border-label'
  const row = 'flex items-center justify-between gap-3 border-separator px-4 py-2 [&:not(:first-child)]:border-t'

  const Num = ({ k, label, unit, max }) => (
    <label className={row}>
      <span className="text-body">{label}</span>
      <span className="flex items-center gap-2 text-subhead text-label-2">
        <input
          inputMode="decimal"
          value={draft[k]}
          onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d.,]/g, '').slice(0, 5) })}
          onBlur={() => commit(k)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label={`${label} in ${unit}`}
          placeholder="–"
          max={max}
          className={field}
        />
        <span className="w-10">{unit}</span>
      </span>
    </label>
  )

  const Segments = ({ k, options, label }) => (
    <div className={row}>
      <span className="text-body">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-fill p-1">
        {Object.entries(options).map(([key, o]) => {
          const active = (p[k] ?? (k === 'activity' ? 'low' : 'x')) === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setProfile({ ...p, [k]: key })}
              title={o.hint}
              className={`h-9 rounded-lg px-2.5 text-footnote font-semibold ${active ? 'bg-surface text-label shadow-sm' : 'text-label-2 hover:text-label'}`}
            >
              {o.label ?? o}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <section aria-labelledby="profile-title" className="space-y-2">
      <h3 id="profile-title" className="px-4 text-footnote font-semibold text-label-2">
        Profil
      </h3>
      <div className="overflow-hidden rounded-2xl bg-surface">
        {Num({ k: 'weight', label: 'Gewicht', unit: 'kg' })}
        {Num({ k: 'height', label: 'Größe', unit: 'cm' })}
        {Num({ k: 'age', label: 'Alter', unit: 'Jahre' })}
        {Segments({ k: 'sex', options: { m: 'M', f: 'W', x: '–' }, label: 'Geschlecht' })}
        {Segments({ k: 'activity', options: ACTIVITY_LEVELS, label: 'Alltag' })}
      </div>
      <p className="px-4 text-footnote text-label-2">
        {profileComplete(p)
          ? `Grundumsatz ≈ ${Math.round(bmr(p)).toLocaleString('de-AT')} kcal. Dazu kommen Alltag und Training.`
          : 'Für Kalorienziel und Verpflegungsplan im Bereich Ernährung.'}
        {SEXES[p.sex] && p.sex === 'x' && ' Ohne Angabe zum Geschlecht wird ein Mittelwert verwendet.'}
        {!loggedIn && ' Ohne Anmeldung wird nichts gespeichert.'}
      </p>
    </section>
  )
}
