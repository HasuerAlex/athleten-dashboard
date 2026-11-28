# LockedIn

LockedIn ist ein Trainingsplan mit Habit-Tracker und Ernährungsteil, gebaut für die Vorbereitung auf Triathlon, Lauf- oder Radrennen. Live läuft die App auf **https://lockedin-habit.web.app**; eine zweite Kopie liegt auf https://hasueralex.github.io/LockedIn/.

Technik: React 19, Tailwind CSS 4, Lucide-Icons und Vite. Daten speichert die App erst nach einer Google-Anmeldung, und zwar in Firebase Firestore. Wer nicht angemeldet ist, sieht eine leere App, die nichts behält.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # fertige Seite in dist/
```

## Was wo liegt

| Datei | Inhalt |
| --- | --- |
| `src/App.jsx` | Tabs (Training, Ernährung, PainLab), Wochenwahl, Widerrufen |
| `src/components/GoalBanner.jsx` | Hauptziel mit Wettkampfart, Countdown und Rennstrecke als Fortschritt |
| `src/components/WeeklyPlan.jsx` | Wochenplan, wiederkehrende Einheiten, Sterne und Notizen pro Tag |
| `src/components/HabitTracker.jsx`, `HabitHistory.jsx` | Habits mit Serien; Verlauf als Kalender und Quote pro Woche oder Monat |
| `src/components/WeekSummary.jsx` | Wochenrückblick ab Sonntag |
| `src/components/FoodTracker.jsx` | Mahlzeiten, Lebensmittelsuche, Tagesziel, Verpflegung fürs Training |
| `src/components/SettingsSheet.jsx` | Profil (Gewicht, Größe, Alter) und Push-Erinnerungen |
| `src/lib/sync.js` | Google-Anmeldung und Abgleich mit Firestore |
| `src/lib/nutrition.js`, `week.js` | Rechenlogik für Kalorien, Verpflegung und Wochenzahlen |
| `scripts/send-reminders.mjs` | Verschickt fällige Push-Erinnerungen |

## Firebase

Jede Person liest und schreibt nur ihre eigenen Dokumente: `users/{uid}/data/{schlüssel}` für App-Daten und `reminders/{uid}` für Erinnerungen samt Geräten. Die Regeln dazu stehen in `firestore.rules`; der Deploy-Workflow veröffentlicht sie bei jedem Push mit.

Ein neues Projekt richtest du so ein: In der Firebase-Konsole ein Projekt anlegen, unter Authentication die Google-Anmeldung einschalten und die eigene Domain bei den autorisierten Domains eintragen, dann unter „Datenbanken und Speicher“ eine Firestore-Datenbank im Produktionsmodus erstellen (wir nutzen `europe-west3`). Das `firebaseConfig`-Objekt der Web-App gehört nach `src/lib/firebase-config.js`. Diese Werte sind öffentlich; geschützt sind die Daten allein durch die Regeln.

Zum Testen ohne echte Cloud gibt es den Emulator: `VITE_FIREBASE_EMULATOR=1 npm run dev`, während Auth- und Firestore-Emulator laufen.

## Push-Erinnerungen

Im Zahnrad-Menü schaltet man Benachrichtigungen pro Gerät ein und wählt Uhrzeiten für Training, Habits und den Wochenrückblick am Sonntag. GitHub Actions startet alle 15 Minuten `scripts/send-reminders.mjs` (`.github/workflows/reminders.yml`), das fällige Einträge über Firebase Cloud Messaging verschickt. GitHub hält sich dabei nicht minutengenau an den Plan, Erinnerungen kommen deshalb oft ein paar Minuten zu spät.

Am iPhone klappt das nur, wenn LockedIn über „Teilen“ und „Zum Home-Bildschirm“ installiert ist (ab iOS 16.4). Der öffentliche Web-Push-Schlüssel steht als `vapidKey` in `src/lib/firebase-config.js`.

## Lebensmittel-Datenbank

Die Suche liest `public/foods-de.json`: rund 7.150 Lebensmittel mit Werten pro 100 g, die erst beim Öffnen der Suche geladen werden. Die Daten stammen aus dem **Bundeslebensmittelschlüssel (BLS) 4.0** des Max Rubner-Instituts (CC BY 4.0) und weiteren offenen Tabellen (CoFID, USDA, Livsmedelsverket), zusammengestellt im npm-Paket `@thereforejs/foods` 0.0.3. Das ist keine offizielle Veröffentlichung des Instituts. Die kcal hat LockedIn selbst aus den Nährstoffen berechnet, nach EU-Verordnung 1169/2011; die Werte sind nur stichprobenartig geprüft.

## Veröffentlichen

Jeder Push auf `main` baut die App und stellt sie auf Firebase Hosting und GitHub Pages. Dafür braucht das Repo das Secret `FIREBASE_SERVICE_ACCOUNT`, den privaten Schlüssel eines Dienstkontos aus den Firebase-Projekteinstellungen. Der Stand vom 28.11.2026 liegt zusätzlich im Branch `backup/2026-11-28`.
