/* The Monday recap push: the week it counts, who it goes to, and — the part that bites — that it
 * goes out once per Monday even though the send is a one-hour window re-entered every five
 * minutes (a restart inside that hour must not double-notify, and must not swallow the send).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempData } from './helpers.mjs';

const DIR = tempData();
const { mondayOf, lastWeekRange, recapFor, isDue, runWeeklyTick } = await import('../weekly.js');
const { weeklyRecapPush } = await import('../push-messages.js');

const w = (d, sets = [{ w: 60, r: 8, done: true }]) => ({ d, entries: [{ id: 'e', sets }] });

test('a week is Monday to Sunday, and last week is the one before today', () => {
  assert.equal(mondayOf('2026-10-29'), '2026-10-26');
  assert.equal(mondayOf('2026-10-26'), '2026-10-26');
  assert.equal(mondayOf('2026-11-01'), '2026-10-26');     // Sunday closes its week
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.deepEqual(lastWeekRange('2026-10-29'), {
    from: '2026-10-19', to: '2026-10-25', prevFrom: '2026-10-12', prevTo: '2026-10-18'
  });
});

test('the recap counts sessions only from the previous week, and says nothing for an empty one', () => {
  const S = { workouts: [w('2026-10-20'), w('2026-10-22'), w('2026-10-14'), w('2026-10-27')] };
  assert.deepEqual(recapFor(S, '2026-10-29'), {
    sessions: 2, prevSessions: 1, from: '2026-10-19', to: '2026-10-25'
  });
  assert.equal(recapFor({ workouts: [w('2026-10-27')] }, '2026-10-29'), null);
  assert.equal(recapFor({ workouts: [] }, '2026-10-29'), null);
});

test('it is due on a Monday in the 08:00 hour, once per Monday', () => {
  const mon = { weekday: 1, hhmm: '08:30', date: '2026-10-26' };
  assert.equal(isDue(mon, undefined, '2026-10-26'), true);
  assert.equal(isDue(mon, '2026-10-26', '2026-10-26'), false, 'already told this week');
  assert.equal(isDue({ ...mon, weekday: 2 }, undefined, '2026-10-26'), false, 'Tuesday');
  assert.equal(isDue({ ...mon, hhmm: '07:59' }, undefined, '2026-10-26'), false);
  assert.equal(isDue({ ...mon, hhmm: '09:00' }, undefined, '2026-10-26'), false);
});

/** One profile with a pushed subscription, as server.js hands them in. */
function harness({ S, local = { weekday: 1, hhmm: '08:30', date: '2026-10-26' } } = {}) {
  const pushed = [];
  const tick = () => runWeeklyTick({
    users: () => [{ id: 'u1' }],
    hasPush: () => true,
    readState: () => S,
    userNow: () => local,
    sendPush: (uid, msg) => pushed.push({ uid, msg }),
    log: { error: () => {} }
  });
  return { pushed, tick };
}

test('a Monday tick pushes once, and a second tick in the same hour sends nothing', () => {
  fs.rmSync(path.join(DIR, 'weekly.json'), { force: true });
  const S = { lang: 'zh', workouts: [w('2026-10-20'), w('2026-10-22')] };
  const { pushed, tick } = harness({ S });
  tick();
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].msg.tag, 'weekly-recap');
  assert.match(pushed[0].msg.body, /2 次/);
  tick();
  assert.equal(pushed.length, 1, 'the week is remembered');
});

test('an empty week is remembered and sends nothing', () => {
  fs.rmSync(path.join(DIR, 'weekly.json'), { force: true });
  const { pushed, tick } = harness({ S: { lang: 'en', workouts: [] } });
  tick();
  assert.equal(pushed.length, 0);
  const sent = JSON.parse(fs.readFileSync(path.join(DIR, 'weekly.json'), 'utf8'));
  assert.equal(sent.u1, '2026-10-26');
});

test('the switch in Reminders and a missing subscription both keep it quiet', () => {
  fs.rmSync(path.join(DIR, 'weekly.json'), { force: true });
  const off = harness({ S: { lang: 'en', reminder: { weeklyRecap: false }, workouts: [w('2026-10-20')] } });
  off.tick();
  assert.equal(off.pushed.length, 0);

  const pushed = [];
  runWeeklyTick({
    users: () => [{ id: 'u2' }],
    hasPush: () => false,
    readState: () => ({ lang: 'en', workouts: [w('2026-10-20')] }),
    userNow: () => ({ weekday: 1, hhmm: '08:30', date: '2026-10-26' }),
    sendPush: (uid, msg) => pushed.push({ uid, msg })
  });
  assert.equal(pushed.length, 0);
});

test('the push body speaks the profile language and carries the delta', () => {
  assert.equal(weeklyRecapPush('zh', { sessions: 3, prevSessions: 1 }).body, '练了 3 次，比前一周多 2 次。点开看看这周怎么安排。');
  assert.equal(weeklyRecapPush('en', { sessions: 1, prevSessions: 1 }).body, '1 session. Tap for the recap.');
  assert.equal(weeklyRecapPush('de', { sessions: 2, prevSessions: 3 }).body, '2 sessions, -1 vs the week before. Tap for the recap.');
  assert.equal(weeklyRecapPush('zh', { sessions: 2, prevSessions: 2 }).body, '练了 2 次。点开看看这周怎么安排。');
});
