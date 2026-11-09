/* The ask task: one question, answered in prose, grounded in what the app actually logs.
 *
 * What this file pins is the seam that makes that safe — the payload carries the question and the
 * intake averages and no library, the answer is prose rather than a change-set nothing could
 * apply, and an answer that tries to smuggle in plan changes is refused instead of ignored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const payloadLib = await import('../coach/core/payload.js');
const { validateAsk } = await import('../coach/core/validate.js');
const { attemptOnce } = await import('../coach/core/pipeline.js');

const state = (over = {}) => ({
  unit: 'kg',
  coach: { consent: { agreedAt: '2026-10-01T00:00:00Z' }, profile: { goal: 'muscle', daysPerWeek: 3, equipment: ['barbell'] } },
  routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 8 }] }],
  workouts: [{ id: 'w1', d: '2026-10-26', name: 'A', start: 1, entries: [{ id: '0001', sets: [{ w: 60, r: 8, done: true }] }] }],
  bodyweight: [{ d: '2026-10-26', w: 80 }],
  nutrition: {
    '2026-10-25': { kcal: 2400, protein: 150, _ts: 1 },
    '2026-10-26': { kcal: 2600, protein: 160, _ts: 2 },
    '2026-10-27': { kcal: 2300, protein: 140, _ts: 3 }
  },
  ...over
});

test('an ask payload carries the question, the food numbers and no library', () => {
  const p = payloadLib.build(state(), { handle: 'h-1', kind: 'ask', question: 'Am I eating enough to grow?' });
  assert.equal(p.task, 'ask');
  assert.equal(p.question, 'Am I eating enough to grow?');
  assert.equal(p.library, undefined, 'nothing is named by id in an answer');
  assert.equal(p.nutrition.last7.daysLogged, 3);
  assert.equal(p.nutrition.last7.kcalAvg, Math.round((2400 + 2600 + 2300) / 3));
  assert.equal(p.nutrition.last7.proteinAvg, Math.round((150 + 160 + 140) / 3));
  assert.equal(p.nutrition.asOf, '2026-10-27');
  assert.ok(p.window, 'the last four weeks of training ride along');
});

test('a profile that logs no food carries no nutrition block at all', () => {
  const p = payloadLib.build(state({ nutrition: {} }), { handle: 'h-1', kind: 'ask', question: 'What should I eat?' });
  assert.equal(p.nutrition, undefined);
});

test('a target the person set travels even before anything is logged', () => {
  const p = payloadLib.build(state({ nutrition: {}, nutritionGoal: { kcal: 2600, protein: 145 } }), { handle: 'h-1', kind: 'ask', question: 'What should I eat?' });
  assert.deepEqual(p.nutrition, { goal: { kcal: 2600, protein: 145 } });
});

test('the target rides along with the averages once there are any', () => {
  const p = payloadLib.build(state({ nutritionGoal: { kcal: 2600, protein: 145 } }), { handle: 'h-1', kind: 'ask', question: 'q' });
  assert.deepEqual(p.nutrition.goal, { kcal: 2600, protein: 145 });
  assert.equal(p.nutrition.last7.daysLogged, 3);
});

test('the nutrition block is bounded like every other field that leaves the instance', () => {
  const p = payloadLib.build(state({
    nutrition: { '2026-10-27': { kcal: 1e9, protein: -4, junk: 'x' } }
  }), { handle: 'h-1', kind: 'ask', question: 'q' });
  assert.equal(p.nutrition.last7.kcalAvg, 20000);
  assert.equal(p.nutrition.last7.proteinAvg, null, 'a negative protein is not a protein average');
});

test('an answer is prose: empty or plan-shaped answers are refused', () => {
  assert.equal(validateAsk({ coach_contract: 1 }).ok, false);
  assert.equal(validateAsk({ coach_contract: 1, answer: '   ' }).ok, false);
  assert.equal(validateAsk({ coach_contract: 1, answer: 'ok', changes: [{ type: 'sets' }] }).ok, false);
  const ok = validateAsk({ coach_contract: 1, answer: '  Around 2,500 kcal to hold.  ', followUp: 'How many days do you train?' });
  assert.equal(ok.ok, true);
  assert.equal(ok.proposal.answer, 'Around 2,500 kcal to hold.');
  assert.equal(ok.proposal.followUp, 'How many days do you train?');
  assert.ok(validateAsk({ coach_contract: 1, answer: 'x'.repeat(9000) }).proposal.answer.length <= 4000);
});

test('a Chinese question about food carries the app’s own coaching note', () => {
  const p = payloadLib.build(state(), { handle: 'h-1', kind: 'ask', question: '减脂期蛋白要吃多少' });
  assert.ok(Array.isArray(p.knowledge), 'a matching question brings notes along');
  assert.ok(p.knowledge.length >= 1 && p.knowledge.length <= 2);
  assert.ok(p.knowledge.every(k => k.id && k.coach && k.text));
});

test('an unrelated question carries no notes at all', () => {
  const p = payloadLib.build(state(), { handle: 'h-1', kind: 'ask', question: 'how do I export my data' });
  assert.equal(p.knowledge, undefined);
});

test('an answer may only cite notes it was actually given', () => {
  const ids = ['kai-fat-loss', 'shoulder-elbow-wrist'];
  const cited = validateAsk({ coach_contract: 1, answer: 'x', sources: ['kai-fat-loss', 'ghost', 'kai-fat-loss'] }, { ids });
  assert.equal(cited.ok, true);
  assert.deepEqual(cited.proposal.sources, ['kai-fat-loss']);
  const invented = validateAsk({ coach_contract: 1, answer: 'x', sources: ['ghost'] }, { ids });
  assert.equal(invented.proposal.sources, undefined, 'no chip for a note that was never sent');
  const noCtx = validateAsk({ coach_contract: 1, answer: 'x', sources: ['kai-fat-loss'] });
  assert.equal(noCtx.proposal.sources, undefined);
});

test('the pipeline hands the answer back as the result, not as a change-set', async () => {
  const adapter = {
    spawns: false,
    invoke: async () => ({ code: 0, text: JSON.stringify({ coach_contract: 1, answer: 'At 80 kg, 140 g of protein is about 1.75 g/kg. Hold around 2,500 kcal.' }) })
  };
  const payload = payloadLib.build(state(), { handle: 'h-1', kind: 'ask', question: 'Am I eating enough?' });
  const attempt = await attemptOnce({ adapter, cfg: {}, kind: 'ask', payload, model: null, timeoutMs: 1000 });
  assert.equal(attempt.ok, true);
  assert.match(attempt.result.answer, /1\.75 g\/kg/);
  assert.equal(attempt.result.changes, undefined);
});
