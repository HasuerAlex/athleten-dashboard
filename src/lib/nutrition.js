/*
 * Ernährungs-Berechnungen (Richtwerte, keine medizinische Beratung).
 *
 * Grundumsatz: Mifflin-St-Jeor-Formel.
 * Trainingsverbrauch: MET-Schätzung (kcal ≈ MET × kg × Stunden) je Sportart.
 * Makros und Verpflegung: gängige Richtwerte aus der Sporternährung für Ausdauersport
 * (Protein ~1,8 g/kg; Kohlenhydrate je nach Trainingslast; unterwegs 30–90 g KH/h, 400–800 ml/h).
 */

export const ACTIVITY_LEVELS = {
  low: { label: 'Wenig', hint: 'Sitzend, Büro, Schule', factor: 1.2 },
  medium: { label: 'Mittel', hint: 'Viel auf den Beinen', factor: 1.375 },
  high: { label: 'Viel', hint: 'Körperliche Arbeit', factor: 1.55 },
}

export const SEXES = { m: 'Männlich', f: 'Weiblich', x: 'Keine Angabe' }

// Durchschnittliche MET-Werte bei moderater Intensität
const MET = { swim: 7, bike: 8, run: 9.5, strength: 5, other: 6 } // other: Mittelwert für gemischte Sportarten

export const profileComplete = (p) => Boolean(p && p.weight > 0 && p.height > 0 && p.age > 0)

/** Grundumsatz (kcal/Tag) nach Mifflin-St Jeor */
export function bmr({ weight, height, age, sex }) {
  const base = 10 * weight + 6.25 * height - 5 * age
  return base + (sex === 'm' ? 5 : sex === 'f' ? -161 : -78)
}

/** Geschätzter Verbrauch einer Einheit in kcal */
export const sessionKcal = (session, weight) => Math.round((MET[session.sport] ?? 6) * weight * ((Number(session.duration) || 0) / 60))

const round = (v, step = 5) => Math.round(v / step) * step

/** Tagesziel aus Profil und den Einheiten des Tages */
export function dailyTargets(profile, sessions) {
  const w = Number(profile.weight)
  const base = bmr(profile) * (ACTIVITY_LEVELS[profile.activity]?.factor ?? 1.2)
  const trainingKcal = sessions.reduce((a, s) => a + sessionKcal(s, w), 0)
  const minutes = sessions.filter((s) => s.sport !== 'strength').reduce((a, s) => a + (Number(s.duration) || 0), 0)
  const kcal = Math.round(base + trainingKcal)

  // Kohlenhydrate in g/kg je nach Ausdauer-Trainingsdauer des Tages
  const carbsPerKg = minutes === 0 ? 3.5 : minutes < 60 ? 5 : minutes < 120 ? 6 : minutes < 240 ? 8 : 10
  const protein = round(1.8 * w)
  let carbs = round(carbsPerKg * w)
  let fat = round((kcal - protein * 4 - carbs * 4) / 9)
  // Fett nicht unter 0,8 g/kg – dann Kohlenhydrate etwas zurücknehmen
  const minFat = round(0.8 * w)
  if (fat < minFat) {
    fat = minFat
    carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4))
  }
  return { kcal, base: Math.round(base), trainingKcal, protein, carbs, fat, carbsPerKg }
}

/** kcal aus Makros, falls nicht angegeben */
export const kcalFromMacros = ({ protein = 0, carbs = 0, fat = 0 }) => Math.round(protein * 4 + carbs * 4 + fat * 9)

export function totals(entries) {
  return entries.reduce(
    (a, e) => ({
      kcal: a.kcal + (Number(e.kcal) || 0),
      protein: a.protein + (Number(e.protein) || 0),
      carbs: a.carbs + (Number(e.carbs) || 0),
      fat: a.fat + (Number(e.fat) || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export const GEL_CARBS = 25 // g Kohlenhydrate pro typischem Gel
export const ISO_CARBS_PER_500 = 30 // g Kohlenhydrate in 500 ml typischem Sportgetränk

/**
 * Verpflegungsplan für eine Einheit: { before, during, after } mit Mengen.
 * `during` ist null, wenn unterwegs nichts nötig ist.
 */
export function fuelPlan(session, weight) {
  const d = Number(session.duration) || 0
  const w = Number(weight)
  const hours = d / 60

  if (session.sport === 'strength') {
    return {
      before: { carbs: round(0.5 * w), fluid: 300, hint: 'Normale Mahlzeit 2–3 h vorher reicht' },
      during: null,
      after: { carbs: round(0.5 * w), protein: round(0.3 * w), hint: 'Protein für die Muskelreparatur' },
    }
  }

  const beforeCarbs = round((d < 60 ? 1 : d < 120 ? 1.5 : 2) * w)
  const before = { carbs: beforeCarbs, fluid: round(6 * w, 50), hint: 'Leicht verdaulich, wenig Fett und Ballaststoffe' }

  let during = null
  if (d >= 75) {
    const carbsPerHour = d > 150 ? 75 : 45
    const fluidPerHour = 600
    // Erste ~20 min brauchen noch nichts → Bedarf ab dann rechnen
    const fuelHours = Math.max(0, hours - 1 / 3)
    const carbs = round(carbsPerHour * fuelHours)
    during = {
      carbsPerHour,
      fluidPerHour,
      sodiumPerHour: 500,
      carbs,
      fluid: round(fluidPerHour * hours, 50),
      gels: Math.max(1, Math.round(carbs / GEL_CARBS)),
      hint: d > 150 ? 'Gels/Riegel + Sportgetränk mischen (Glukose + Fruktose), ab Minute 20 alle 20–30 min' : 'Ab Minute 20 alle 20–30 min etwas nehmen',
    }
  } else if (d >= 45) {
    during = { carbsPerHour: 0, fluidPerHour: 500, carbs: 0, fluid: round(500 * hours, 50), gels: 0, hint: 'Wasser reicht, bei Hitze mit etwas Salz' }
  }

  const after = {
    carbs: round((d >= 90 ? 1.2 : d >= 60 ? 1 : 0.6) * w),
    protein: round(0.3 * w),
    hint: d >= 90 ? 'Innerhalb von 1 h beginnen, Flüssigkeit nach Durst auffüllen' : 'Mit der nächsten Mahlzeit',
  }
  return { before, during, after }
}

/** Uhrzeit 'HH:MM' ± Minuten */
export function shiftTime(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export const MEALS = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snacks',
  training: 'Training (unterwegs)',
}

/** Passende Mahlzeit zur Uhrzeit */
export function mealForNow(date = new Date()) {
  const h = date.getHours()
  if (h < 10) return 'breakfast'
  if (h < 14) return 'lunch'
  if (h >= 17 && h < 22) return 'dinner'
  return 'snack'
}
