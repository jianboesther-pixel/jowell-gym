/* The Monday-morning recap: one push, in the profile's own language, saying what last week held.
 *
 * Nothing here calls a model. The numbers are the same ones the Home card shows (the app's
 * lib/recap.js), computed from the state file the API already owns: sessions, and the delta
 * against the week before. The push is a doorbell for the card, not a report.
 *
 * Who gets it: a profile with a push subscription, that has not switched it off
 * (`S.reminder.weeklyRecap === false`), on its local Monday between 08:00 and 09:00. The hour is
 * a window rather than a moment because the tick is every five minutes and a restart must not
 * swallow the send; `weekly.json` remembers which Monday each profile was told about, so the
 * window can be re-entered safely.
 */
import fs from 'node:fs'
import path from 'node:path'
import { weeklyRecapPush } from './push-messages.js';

const DATA = process.env.DATA_DIR || '/data';
const FILE = path.join(DATA, 'weekly.json');
const DAY = 86400000;
const HOUR_FROM = '08:00';
const HOUR_TO = '09:00';

const isoOf = ms => new Date(ms).toISOString().slice(0, 10);

/** The Monday of the week `date` (YYYY-MM-DD) falls in, or null. */
export function mondayOf(date) {
  const t = Date.parse(String(date || '') + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  const dow = new Date(t).getUTCDay();
  return isoOf(t - ((dow + 6) % 7) * DAY);
}

/** The Monday–Sunday window before `today`, and the one before that. */
export function lastWeekRange(today) {
  const mon = mondayOf(today);
  if (!mon) return null;
  const at = Date.parse(mon + 'T00:00:00Z');
  return { from: isoOf(at - 7 * DAY), to: isoOf(at - DAY), prevFrom: isoOf(at - 14 * DAY), prevTo: isoOf(at - 8 * DAY) };
}

const list = v => (Array.isArray(v) ? v : []);

/** Sessions logged in [from, to], counted the way the app dates a workout. */
export const countSessions = (S, from, to) => list(S?.workouts).filter(w => w && w.d >= from && w.d <= to).length;

/**
 * What the push needs: last week's sessions and the week before's, or null when this profile has
 * no week to talk about. An empty week is not sent — the card stays silent, and so does the phone.
 */
export function recapFor(S, today) {
  const range = lastWeekRange(today);
  if (!range) return null;
  const sessions = countSessions(S, range.from, range.to);
  if (!sessions) return null;
  return { sessions, prevSessions: countSessions(S, range.prevFrom, range.prevTo), from: range.from, to: range.to };
}

/** Is this the send window, on a Monday this profile has not been told about yet? */
export function isDue(local, sentWeek, monday) {
  if (!local || !monday) return false;
  if (local.weekday !== 1) return false;                       // Monday, the start of the recap week
  if (local.hhmm < HOUR_FROM || local.hhmm >= HOUR_TO) return false;
  return sentWeek !== monday;
}

function loadSent() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { return {}; }
}

function saveSent(map) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map));
  fs.renameSync(tmp, FILE);
}

/**
 * One pass over every profile. Split out of the timer so a test can run exactly one Monday
 * without waiting for wall-clock time to agree with it.
 */
export function runWeeklyTick({ users, hasPush, readState, userNow, sendPush, log = console }) {
  const sent = loadSent();
  let dirty = false;
  for (const user of users()) {
    try {
      if (typeof hasPush === 'function' && !hasPush(user.id)) continue;
      const S = readState(user.id);
      if (!S) continue;
      if (S.reminder?.weeklyRecap === false) continue;
      // The stored timezone is the one the reminder rows write; a profile that never opened them
      // falls back to UTC rather than to the server's own clock, which is not the app's.
      const local = userNow(S.reminder?.tz || 'UTC');
      const monday = mondayOf(local?.date);
      if (!isDue(local, sent[user.id], monday)) continue;
      const recap = recapFor(S, local.date);
      // Marked whether or not there was something to say: a profile with an empty week should
      // not be re-examined on every tick until nine o'clock.
      sent[user.id] = monday;
      dirty = true;
      if (recap) sendPush(user.id, weeklyRecapPush(S.lang, recap));
    } catch (e) {
      // One unreadable state file is one profile's problem, never the tick's.
      if (log && log.error) log.error('weekly recap', user.id, e);
    }
  }
  if (dirty) saveSent(sent);
  return { checked: users().length, sent: Object.keys(sent).length };
}

/** Boot + every five minutes. */
export function startWeekly(deps) {
  const tick = () => { try { runWeeklyTick(deps); } catch (e) { /* the next tick tries again */ } };
  const timer = setInterval(tick, 5 * 60000);
  timer.unref?.();
  setTimeout(tick, 20000).unref?.();       // let the container settle first
  return timer;
}
