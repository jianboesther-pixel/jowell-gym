import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionView, setIntake, setGoal } from '../tt-nutrition.js';

const base = () => ({
  nutrition: { '2026-11-04': { kcal: 2200, protein: 130, _ts: 1 } },
  nutritionGoal: { kcal: 2400, protein: 150 }
});

test('nutritionView: 今天 + 最近几天，新的在前', () => {
  const v = nutritionView(base(), { today: '2026-11-05', days: 3 });
  assert.equal(v.days.length, 3);
  assert.equal(v.days[0].d, '2026-11-05');
  assert.equal(v.days[1].d, '2026-11-04');
  assert.equal(v.days[1].kcal, 2200);
  assert.equal(v.days[0].has, false);
});

test('nutritionView: 目标原样读出，没有目标时为 null', () => {
  assert.deepEqual(nutritionView(base(), { today: '2026-11-05' }).goal, { kcal: 2400, protein: 150 });
  assert.equal(nutritionView({}, { today: '2026-11-05' }).goal, null);
});

test('setIntake: 写入一天，带时间戳', () => {
  const next = setIntake(base(), { d: '2026-11-05', kcal: 2500, protein: 140 }, 99);
  assert.deepEqual(next.nutrition['2026-11-05'], { kcal: 2500, protein: 140, _ts: 99 });
  assert.equal(next.nutrition['2026-11-04'].kcal, 2200);
});

test('setIntake: 两个数都是 0 就删掉那天', () => {
  const next = setIntake(base(), { d: '2026-11-04', kcal: 0, protein: 0 }, 99);
  assert.equal(next.nutrition['2026-11-04'], undefined);
});

test('setIntake: 数字被夹住，日期不合法不动', () => {
  const clamped = setIntake(base(), { d: '2026-11-05', kcal: 99999, protein: 9999 }, 1);
  assert.equal(clamped.nutrition['2026-11-05'].kcal, 8000);
  assert.equal(clamped.nutrition['2026-11-05'].protein, 400);
  const s = base();
  const next = setIntake(s, { d: '2026-1-1', kcal: 100 }, 1);
  assert.deepEqual(Object.keys(next.nutrition), ['2026-11-04']);
});

test('setGoal: 写入目标，0/0 清掉', () => {
  assert.deepEqual(setGoal(base(), { kcal: 2600, protein: 160 }).nutritionGoal, { kcal: 2600, protein: 160 });
  assert.equal(setGoal(base(), { kcal: 0, protein: 0 }).nutritionGoal, null);
});

test('不改传入的 state', () => {
  const s = base();
  setIntake(s, { d: '2026-11-05', kcal: 100 }, 1);
  setGoal(s, { kcal: 1, protein: 1 });
  assert.equal(s.nutrition['2026-11-05'], undefined);
  assert.deepEqual(s.nutritionGoal, { kcal: 2400, protein: 150 });
});
