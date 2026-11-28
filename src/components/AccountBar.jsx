import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LogOut, Settings } from 'lucide-react'
import { signIn, signOutUser, syncAvailable } from '../lib/sync'

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const ERRORS = {
  'permission-denied': 'Die Cloud hat den Zugriff verweigert. Prüfe die Firestore-Regeln.',
  'auth/unauthorized-domain': 'Firebase hat diese Adresse noch nicht freigegeben (Authentication → Einstellungen → Autorisierte Domains).',
  'auth/network-request-failed': 'Keine Verbindung zu Google. Versuch es gleich noch einmal.',
}

export default function AccountBar({ brand, user, ready, error, clearError, onOpenSettings }) {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [loginError, setLoginError] = useState(null)

  if (!syncAvailable || !ready) return <header>{brand}</header>

  const login = async () => {
    setBusy(true)
    setLoginError(null)
    try {
      await signIn()
    } catch (e) {
      setLoginError(e?.code || 'unbekannt')
    } finally {
      setBusy(false)
    }
  }

  const problem = loginError || error
  const pill = 'inline-flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-subhead font-semibold hover:bg-fill disabled:opacity-50'

  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {brand}
          {user ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote text-label-2" aria-live="polite">
              {online ? <Cloud className="size-3.5 shrink-0" aria-hidden /> : <CloudOff className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">
                {online ? 'Synchronisiert' : 'Offline, Änderungen gehen später raus'}
                {user.email && <span className="hidden sm:inline"> · {user.email}</span>}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-footnote text-label-2">Nicht angemeldet, daher speichert LockedIn nichts</p>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Einstellungen"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface hover:bg-fill"
        >
          <Settings className="size-5" />
        </button>
        {user ? (
          <button onClick={() => signOutUser()} className={`${pill} shrink-0`}>
            <LogOut className="size-4" aria-hidden /> Abmelden
          </button>
        ) : (
          <button onClick={login} disabled={busy} className={`${pill} shrink-0`}>
            <GoogleMark /> <span className="sm:hidden">Anmelden</span><span className="hidden sm:inline">Mit Google anmelden</span>
          </button>
        )}
      </div>

      {problem && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-subhead">
          <p className="flex-1">
            <span className="font-semibold">Synchronisierung fehlgeschlagen.</span>{' '}
            {ERRORS[problem] ?? `Fehler: ${problem}`}
          </p>
          <button
            onClick={() => {
              setLoginError(null)
              clearError()
            }}
            className="-my-2 h-11 rounded-full px-3 font-semibold hover:bg-fill"
          >
            OK
          </button>
        </div>
      )}

    </header>
  )
}

/** Googles „G“ für den Anmelde-Button */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  )
}
