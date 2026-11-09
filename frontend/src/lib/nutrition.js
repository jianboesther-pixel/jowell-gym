// Daily intake: the two numbers that turn "eat better" into an answer with figures in it.
//
//   S.nutrition = { '2026-10-08': { kcal: 2200, protein: 130, _ts }, … }
//
// One entry per date, exactly the shape of a day note (lib/day-notes.js): each day carries the
// time it was last written, so two devices that logged different days keep both, and the same
// day keeps the later numbers (lib/sync-merge.js mergeStampedMap, `nutrition` in STAMPED_MAPS).
// Clearing a day writes a stamped empty entry rather than deleting the key: a delete would come
// straight back from the other device's copy on the next sync.
//
// Deliberately two numbers, not a food diary. Nothing here says what was eaten, so nothing here
// can be mined for a brand, a photo or a habit — and the Coach only ever gets the averages.
import { todayISO } from './format.js'

/** A day cannot plausibly hold more than this; anything above is a typo, not a meal plan. */
export const KCAL_MAX = 20000
export const PROTEIN_MAX = 1000

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** A stored number read back: a positive whole number under `max`, or 0 for nothing usable. */
const amount = (v, max) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(max, n)) : 0
}

/** A stored entry read back: { kcal, protein } with junk dropped, or null for none/cleared. */
export function readIntake(entry) {
  if (!isMap(entry)) return null
  const kcal = amount(entry.kcal, KCAL_MAX)
  const protein = amount(entry.protein, PROTEIN_MAX)
  return kcal || protein ? { kcal, protein } : null
}

/** What was logged on `iso`, or null. */
export const intakeOn = (S, iso) => readIntake(isMap(S?.nutrition) ? S.nutrition[iso] : null)

/** Whether `iso` can take numbers at all: a real date, today or earlier. */
export const canLogIntake = (iso, today = todayISO()) => ISO.test(String(iso || '')) && iso <= today

/**
 * S.nutrition with `iso` set to `intake` ({ kcal, protein }), stamped `now`. An empty intake is
 * written as a cleared entry, so the removal syncs (see the top of this file).
 */
export function withIntake(map, iso, intake, now = Date.now()) {
  const clean = readIntake(intake)
  const entry = clean ? { ...clean, _ts: now } : { _ts: now }
  return { ...(isMap(map) ? map : {}), [iso]: entry }
}

/** The `days` dates ending at `today`, oldest first. */
export function intakeDates(today = todayISO(), days = 7) {
  const out = []
  const end = Date.parse(today + 'T00:00:00Z')
  if (!Number.isFinite(end)) return out
  for (let i = days - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10))
  return out
}

/**
 * What the Coach (and the card) reads: the averages over the days that actually carry numbers,
 * the number of such days so it can be read as a coverage rather than a full week, and the last
 * logged day. Averages are over logged days, not over the window: an unlogged Tuesday is not a
 * 0 kcal Tuesday, and averaging it in would invent a deficit nobody ate.
 */
export function intakeSummary(S, { days = 7, today = todayISO() } = {}) {
  const dates = intakeDates(today, days)
  const logged = []
  for (const d of dates) {
    const e = intakeOn(S, d)
    if (e) logged.push({ d, ...e })
  }
  const mean = k => {
    const vals = logged.map(e => e[k]).filter(v => v > 0)
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }
  return {
    days,
    daysLogged: logged.length,
    kcalAvg: mean('kcal'),
    proteinAvg: mean('protein'),
    latest: logged.length ? logged[logged.length - 1] : null
  }
}

/** The averages for the 7 and 28 days ending today, which is what a payload carries. */
export const intakePayload = (S, today = todayISO()) => ({
  last7: intakeSummary(S, { days: 7, today }),
  last28: intakeSummary(S, { days: 28, today })
})

/* ---------- a target to measure the numbers against ---------- */

// 32 kcal per kg of body weight is the middle of the range a recreational lifter actually eats,
// and the intake goal shifts it. Coarse on purpose: the screen calls it an estimate, and the
// person edits it. A precise-looking 2,487 kcal would be a lie in a number's clothing.
const GOAL_KCAL_PER_KG = 32
const GOAL_PROTEIN_PER_KG = { strength: 1.8, muscle: 1.8, general: 1.6, fatloss: 2, endurance: 1.6 }
export const PRESETS_MAX = 6

/** A stored target read back: { kcal, protein } within bounds, or null. */
export function readGoal(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const kcal = amount(v.kcal, KCAL_MAX)
  const protein = amount(v.protein, PROTEIN_MAX)
  return kcal || protein ? { kcal, protein } : null
}

/** The target this profile set, or null. */
export const goalOf = S => readGoal(S?.nutritionGoal)

/**
 * A starting target from body weight (kg) and the goal picked at intake. Both numbers are
 * rounded to the nearest 50 / 5 so nobody reads them as a measurement.
 */
export function estimateGoal({ weightKg, goal } = {}) {
  const kg = Number(weightKg)
  if (!Number.isFinite(kg) || kg <= 0) return null
  const g = String(goal || '')
  const shift = g === 'muscle' ? 1.1 : g === 'fatloss' ? 0.85 : 1
  const kcal = amount(Math.round(kg * GOAL_KCAL_PER_KG * shift / 50) * 50, KCAL_MAX)
  const protein = amount(Math.round(kg * (GOAL_PROTEIN_PER_KG[g] || 1.8) / 5) * 5, PROTEIN_MAX)
  return kcal || protein ? { kcal, protein } : null
}

/** The saved one-tap pairs, deduped by their two numbers, newest first, capped. */
export function readPresets(v) {
  const out = []
  for (const e of Array.isArray(v) ? v : []) {
    const clean = readIntake(e)
    if (!clean) continue
    if (out.some(x => x.kcal === clean.kcal && x.protein === clean.protein)) continue
    out.push({ kcal: clean.kcal, protein: clean.protein })
    if (out.length >= PRESETS_MAX) break
  }
  return out
}
export const presetsOf = S => readPresets(S?.nutritionPresets)

/** `list` with `intake` first. A pair already saved moves to the front rather than duplicating. */
export const addPreset = (list, intake) => readPresets([readIntake(intake), ...readPresets(list)].filter(Boolean))

/** `list` without the pair `intake` names. */
export const removePreset = (list, intake) => {
  const clean = readIntake(intake)
  if (!clean) return readPresets(list)
  return readPresets(list).filter(x => !(x.kcal === clean.kcal && x.protein === clean.protein))
}

/** Distinct pairs from the logged days before today, newest first: what one tap should offer. */
export function recentIntakes(S, { days = 14, today = todayISO(), max = 3 } = {}) {
  const out = []
  for (const d of intakeDates(today, days).reverse()) {
    if (d === today) continue
    const e = intakeOn(S, d)
    if (!e) continue
    if (out.some(x => x.kcal === e.kcal && x.protein === e.protein)) continue
    out.push(e)
    if (out.length >= max) break
  }
  return out
}
