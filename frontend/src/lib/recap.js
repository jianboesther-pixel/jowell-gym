// Last week, in the four numbers a lifter actually reacts to: sessions done, tonnage against the
// week before, body weight, and how much of the food target was actually logged.
//
// One rule, shared with the Monday push (api/weekly.js computes the same week): a week runs
// Monday–Sunday. The app's own week can start on Sunday for the planner, but a recap that moved
// its own boundary would report a different "last week" to the phone and to the notification.
import { todayISO } from './format.js'
import { intakeSummary } from './nutrition.js'

const DAY = 86400000
const isoOf = ms => new Date(ms).toISOString().slice(0, 10)
const list = v => (Array.isArray(v) ? v : [])

/** The Monday of the week `iso` falls in, or null for a date that does not parse. */
export function mondayOf(iso) {
  const t = Date.parse(String(iso || '') + 'T00:00:00Z')
  if (!Number.isFinite(t)) return null
  const dow = new Date(t).getUTCDay()               // 0 Sunday … 6 Saturday
  return isoOf(t - ((dow + 6) % 7) * DAY)
}

/** The Monday–Sunday window before today, and the one before that (for the comparison). */
export function lastWeek(today = todayISO()) {
  const mon = mondayOf(today)
  if (!mon) return null
  const at = Date.parse(mon + 'T00:00:00Z')
  return {
    from: isoOf(at - 7 * DAY), to: isoOf(at - DAY),
    prevFrom: isoOf(at - 14 * DAY), prevTo: isoOf(at - 8 * DAY)
  }
}

const inRange = (S, from, to) => list(S?.workouts).filter(w => w && w.d >= from && w.d <= to)

/** Tonnage of the work sets in these sessions: weight × reps, the unit the profile uses. */
export function tonnage(workouts) {
  let total = 0
  for (const w of workouts) {
    for (const e of list(w.entries)) {
      for (const s of list(e.sets)) {
        if (!s || !s.done) continue
        const weight = Number(s.w) || 0
        const reps = Number(s.r) || 0
        if (weight > 0 && reps > 0) total += weight * reps
      }
    }
  }
  return Math.round(total)
}

/** Planned sessions in a fixed week; null under rotation, where "planned" is not a number. */
function plannedCount(S) {
  if (S?.scheduleMode === 'rotation') return null
  const week = S?.week && typeof S.week === 'object' ? S.week : {}
  return Object.values(week).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length
}

/**
 * The recap, or null when last week held no session: an empty card every Monday is a nag, not a
 * recap. `goal` rides along unread so the card can show the target the averages are measured on.
 */
export function recapOf(S, { today = todayISO() } = {}) {
  const range = lastWeek(today)
  if (!range) return null
  const sessions = inRange(S, range.from, range.to)
  if (!sessions.length) return null
  const before = inRange(S, range.prevFrom, range.prevTo)
  const volume = tonnage(sessions)
  const prevVolume = tonnage(before)

  const bw = list(S.bodyweight).filter(x => x && x.d).slice().sort((a, b) => (a.d < b.d ? -1 : 1))
  const inWeek = bw.filter(x => x.d >= range.from && x.d <= range.to)
  const last = inWeek[inWeek.length - 1] || null
  const base = last ? [...bw].filter(x => x.d < last.d).pop() || null : null
  const weightDelta = last && base ? Math.round((last.w - base.w) * 10) / 10 : null

  return {
    from: range.from,
    to: range.to,
    sessions: sessions.length,
    prevSessions: before.length,
    planned: plannedCount(S),
    volume,
    prevVolume,
    volumeDeltaPct: prevVolume > 0 ? Math.round(((volume - prevVolume) / prevVolume) * 100) : null,
    weightDelta,
    nutrition: intakeSummary(S, { days: 7, today: range.to }),
    goal: S?.nutritionGoal && typeof S.nutritionGoal === 'object' ? S.nutritionGoal : null
  }
}
