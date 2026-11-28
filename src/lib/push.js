import { useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app, db, usingEmulator } from './sync'
import { vapidKey } from './firebase-config'
import { DEFAULT_REMINDERS } from './defaults'

/*
 * Erinnerungen per Push.
 * Firestore: reminders/{uid} = {
 *   uid, tz,
 *   training: { enabled, time: 'HH:MM', next: Timestamp | null },
 *   habits:   { enabled, time: 'HH:MM', next: Timestamp | null },
 *   tokens:   { [geräteId]: { token, device, updatedAt } }
 * }
 * Ein GitHub-Actions-Job (scripts/send-reminders.mjs) sucht alle 15 Minuten Einträge mit `next` ≤ jetzt,
 * verschickt die Nachricht an alle Geräte und setzt `next` auf den nächsten Tag.
 */

const DEVICE_KEY = 'lockedin:push-device'

export const pushConfigured = Boolean(vapidKey) || usingEmulator

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

/** Was dieses Gerät kann: 'ok' | 'ios-install' | 'unsupported' */
export async function pushSupport() {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  }
  if (usingEmulator) return 'ok'
  return (await isSupported().catch(() => false)) ? 'ok' : 'unsupported'
}

const reminderRef = (uid) => doc(db, 'reminders', uid)

const deviceName = () => {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Gerät'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return [os, browser].filter(Boolean).join(' · ')
}

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const localDeviceId = () => {
  try {
    return localStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

/** Nächster Zeitpunkt für 'HH:MM' in der Zeitzone dieses Geräts; mit `sundayOnly` nur sonntags */
export function nextOccurrence(time, from = new Date(), sundayOnly = false) {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(from)
  d.setHours(h, m, 0, 0)
  while (d <= from || (sundayOnly && d.getDay() !== 0)) {
    d.setDate(d.getDate() + 1)
    d.setHours(h, m, 0, 0)
  }
  return d
}

/** Push auf diesem Gerät einschalten: Erlaubnis holen, Token speichern */
export async function enablePush(uid) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw Object.assign(new Error('permission'), { code: permission === 'denied' ? 'denied' : 'dismissed' })
  const registration = await navigator.serviceWorker.ready
  // Im Emulator-Test gibt es keinen echten Push-Dienst → Platzhalter-Token
  const token = usingEmulator
    ? `emulator-${Math.random().toString(36).slice(2)}`
    : await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
  const id = await hash(token)
  await setDoc(
    reminderRef(uid),
    { uid, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, tokens: { [id]: { token, device: deviceName(), updatedAt: serverTimestamp() } } },
    { merge: true },
  )
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    /* egal */
  }
  return id
}

/** Push auf diesem Gerät ausschalten */
export async function disablePush(uid) {
  const id = localDeviceId()
  try {
    if (!usingEmulator) await deleteToken(getMessaging(app))
  } catch {
    /* Token war schon ungültig */
  }
  if (id) await updateDoc(reminderRef(uid), { [`tokens.${id}`]: deleteField() }).catch(() => {})
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    /* egal */
  }
}

/** Uhrzeit/Ein-Aus einer Erinnerung speichern ('training' | 'habits' | 'weekly') */
export function saveReminder(uid, kind, { enabled, time }) {
  return setDoc(
    reminderRef(uid),
    {
      uid,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      [kind]: { enabled, time, next: enabled ? nextOccurrence(time, new Date(), kind === 'weekly') : null },
    },
    { merge: true },
  )
}

/** Erinnerungs-Einstellungen live aus der Cloud */
export function useReminders(uid, onError) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!uid || !db) return setData(null)
    return onSnapshot(
      reminderRef(uid),
      (snap) => setData(snap.data() ?? {}),
      onError,
    )
  }, [uid, onError])
  if (!data) return null
  return {
    training: { ...DEFAULT_REMINDERS.training, ...data.training },
    habits: { ...DEFAULT_REMINDERS.habits, ...data.habits },
    weekly: { ...DEFAULT_REMINDERS.weekly, ...data.weekly },
    tokens: data.tokens ?? {},
  }
}

/** Probe-Benachrichtigung direkt auf diesem Gerät */
export async function showTestNotification() {
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('LockedIn', {
    body: 'So kommen deine Erinnerungen an.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'test',
  })
}
