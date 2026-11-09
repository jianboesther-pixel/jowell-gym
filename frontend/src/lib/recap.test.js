// Last week, as the Monday push and the Home card both count it: Monday–Sunday, tonnage from the
// work sets only, weight from the last weigh-in inside the week against the last one before it.
import { describe, expect, it } from 'vitest'
import { mondayOf, lastWeek, tonnage, recapOf } from './recap.js'

const w = (d, sets, name = 'A') => ({ d, name, entries: [{ id: 'e1', sets }] })
const done = (wgt, r) => ({ w: wgt, r, done: true })

describe('the week boundary', () => {
  it('finds the Monday of any day, including across a month and a year', () => {
    expect(mondayOf('2026-10-29')).toBe('2026-10-26')   // Thursday
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')   // Monday itself
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')   // Sunday belongs to the week before
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
    expect(mondayOf('nope')).toBeNull()
  })

  it('names the two weeks before today', () => {
    expect(lastWeek('2026-10-29')).toEqual({
      from: '2026-10-19', to: '2026-10-25',
      prevFrom: '2026-10-12', prevTo: '2026-10-18'
    })
  })
})

describe('tonnage', () => {
  it('counts work sets only, and only where both numbers are there', () => {
    expect(tonnage([w('2026-10-20', [done(60, 8), done(60, 8), { w: 60, r: 8, done: false }])])).toBe(960)
    expect(tonnage([w('2026-10-20', [done(0, 12), { w: 60, done: true }, done(20, 0)])])).toBe(0)
  })
})

describe('the recap', () => {
  const state = (over = {}) => ({
    unit: 'kg',
    week: { 1: 'r1', 3: 'r1', 5: 'r1' },
    workouts: [
      w('2026-10-26', [done(60, 8)]),                       // this week, not last
      w('2026-10-20', [done(80, 8), done(80, 8)]),          // last week: 1280
      w('2026-10-22', [done(70, 8)]),                        // last week: 560 → 1840
      w('2026-10-14', [done(60, 8)])                         // the week before: 480
    ],
    bodyweight: [
      { d: '2026-10-13', w: 80.4 },
      { d: '2026-10-19', w: 80.1 },
      { d: '2026-10-24', w: 79.8 },
      { d: '2026-10-27', w: 79.9 }
    ],
    nutrition: {
      '2026-10-20': { kcal: 2400, protein: 150, _ts: 1 },
      '2026-10-22': { kcal: 2600, protein: 160, _ts: 2 }
    },
    nutritionGoal: { kcal: 2500, protein: 150 },
    ...over
  })

  it('counts last week’s sessions, tonnage and the comparison with the week before', () => {
    const r = recapOf(state(), { today: '2026-10-29' })
    expect(r.sessions).toBe(2)
    expect(r.prevSessions).toBe(1)
    expect(r.volume).toBe(1840)
    expect(r.prevVolume).toBe(480)
    expect(r.volumeDeltaPct).toBe(283)
    expect(r.planned).toBe(3)
  })

  it('measures the weigh-in inside the week against the last one before it', () => {
    const r = recapOf(state(), { today: '2026-10-29' })
    expect(r.weightDelta).toBe(-0.3)      // 79.8 against 80.1, ignoring the 27th (this week)
  })

  it('reads the food averages over the same seven days, with the target', () => {
    const r = recapOf(state(), { today: '2026-10-29' })
    expect(r.nutrition.daysLogged).toBe(2)
    expect(r.nutrition.kcalAvg).toBe(2500)
    expect(r.goal).toEqual({ kcal: 2500, protein: 150 })
  })

  it('has nothing to say for a week with no session', () => {
    expect(recapOf(state({ workouts: [w('2026-10-27', [done(60, 8)])] }), { today: '2026-10-29' })).toBeNull()
  })

  it('says planned: null under rotation, where the number would be a lie', () => {
    expect(recapOf(state({ scheduleMode: 'rotation' }), { today: '2026-10-29' }).planned).toBeNull()
  })

  it('has no percentage when the week before had no tonnage to compare against', () => {
    expect(recapOf(state({ workouts: [w('2026-10-20', [done(60, 8)])] }), { today: '2026-10-29' }).volumeDeltaPct).toBeNull()
  })
})
