import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastPerformance, nextTarget, deloadRoutine, applyProgression } from '../tt-progress-rule.js';

const sets = (rows) => rows.map(([w, r]) => ({ w, r, done: true }));

test('lastPerformance：最大重量/次数，是否全部达标', () => {
  const l = lastPerformance(sets([[60, 8], [60, 9]]), 8);
  assert.equal(l.topW, 60);
  assert.equal(l.topR, 9);
  assert.equal(l.allHit, true);
  assert.equal(lastPerformance(sets([[60, 6]]), 8).allHit, false);
  assert.equal(lastPerformance([], 8), null);
});

test('nextTarget：规则关掉时原样返回', () => {
  const r = nextTarget({ last: { topW: 60, topR: 10, allHit: true }, rule: { prog: 'off' }, fallbackWeight: 50, fallbackReps: 8 });
  assert.equal(r.weight, 50);
  assert.equal(r.changed, false);
});

test('nextTarget：线性，达标就加 inc', () => {
  const r = nextTarget({ last: { topW: 60, topR: 8, allHit: true }, rule: { prog: 'linear', inc: 2.5, target: 8 } });
  assert.equal(r.weight, 62.5);
  assert.equal(r.reps, 8);
  assert.equal(r.changed, true);
});

test('nextTarget：线性，没达标保持重量', () => {
  const r = nextTarget({ last: { topW: 60, topR: 6, allHit: false }, rule: { prog: 'linear', inc: 2.5, target: 8 } });
  assert.equal(r.weight, 60);
  assert.equal(r.changed, false);
});

test('nextTarget：双重进阶，次数没到目标就加次数', () => {
  const r = nextTarget({ last: { topW: 60, topR: 8, allHit: false }, rule: { prog: 'double', inc: 2.5, target: 12, base: 8 } });
  assert.equal(r.weight, 60);
  assert.equal(r.reps, 9);
});

test('nextTarget：双重进阶，次数到目标就加重量并降回 base', () => {
  const r = nextTarget({ last: { topW: 60, topR: 12, allHit: true }, rule: { prog: 'double', inc: 2.5, target: 12, base: 8 } });
  assert.equal(r.weight, 62.5);
  assert.equal(r.reps, 8);
});

test('deloadRoutine：重量 ×0.6，组数 −1', () => {
  const d = deloadRoutine({ id: 'a', name: '胸', ex: [{ id: 'x', sets: 4, reps: 8, weight: 100 }] });
  assert.equal(d.name, '胸 · 减载');
  assert.equal(d.ex[0].weight, 60);
  assert.equal(d.ex[0].sets, 3);
  assert.equal(d.ex[0].deload, true);
});

test('applyProgression：按最近一场的表现给出今天的重量', () => {
  const state = {
    workouts: [
      { d: '2026-11-01', entries: [{ id: 'x', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }] }] },
      { d: '2026-11-05', entries: [{ id: 'x', sets: [{ w: 62.5, r: 8, done: true }] }] }
    ]
  };
  const view = { routines: [{ exercises: [{ id: 'x', weight: 60, reps: 8, prog: 'linear', inc: 2.5, target: 8 }] }] };
  applyProgression(state, view);
  assert.equal(view.routines[0].exercises[0].weight, 65);   // 最近一次达标 → +2.5
});

test('applyProgression：没开规则就不动', () => {
  const state = { workouts: [] };
  const view = { routines: [{ exercises: [{ id: 'x', weight: 60, reps: 8, prog: 'off' }] }] };
  applyProgression(state, view);
  assert.equal(view.routines[0].exercises[0].weight, 60);
});

test('applyProgression：只看非进行中的场次（ttLive 跳过）', () => {
  const state = {
    workouts: [
      { d: '2026-11-08', ttLive: true, entries: [{ id: 'x', sets: [{ w: 80, r: 8, done: true }] }] },
      { d: '2026-11-05', entries: [{ id: 'x', sets: [{ w: 60, r: 8, done: true }] }] }
    ]
  };
  const view = { routines: [{ exercises: [{ id: 'x', weight: 60, reps: 8, prog: 'linear', inc: 2.5, target: 8 }] }] };
  applyProgression(state, view);
  assert.equal(view.routines[0].exercises[0].weight, 62.5);
});
