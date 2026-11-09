import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPastWorkout, removeWorkout } from '../tt-edit.js';

const base = () => ({ workouts: [{ id: 'w1', d: '2026-11-01', entries: [] }], ttLiveId: 'w1' });

test('addPastWorkout: 写一条完整记录，组数按 sets 展开', () => {
  const next = addPastWorkout(base(), { d: '2026-11-04', name: '补的胸', ex: [{ id: '0025', sets: 3, reps: 10, weight: 60 }] }, 1000);
  const w = next.workouts[1];
  assert.equal(w.d, '2026-11-04');
  assert.equal(w.name, '补的胸');
  assert.equal(w.entries.length, 1);
  assert.equal(w.entries[0].sets.length, 3);
  assert.deepEqual(w.entries[0].sets[0], { w: 60, r: 10, done: true, at: w.start });
  assert.equal(w.entries[0].topW, 60);
  assert.equal(w.logged, true);
});

test('addPastWorkout: 日期不合法就原样返回', () => {
  const s = base();
  const next = addPastWorkout(s, { d: '2026-1-1', ex: [{ id: '0025', sets: 1 }] }, 1000);
  assert.equal(next.workouts.length, 1);
});

test('addPastWorkout: 没有动作就原样返回', () => {
  const next = addPastWorkout(base(), { d: '2026-11-04', ex: [] }, 1000);
  assert.equal(next.workouts.length, 1);
});

test('addPastWorkout: 组数/次数被夹住，重量为 0 时 topW 为 null', () => {
  const next = addPastWorkout(base(), { d: '2026-11-04', ex: [{ id: '0025', sets: 999, reps: -2, weight: 0 }] }, 1000);
  const w = next.workouts[1];
  assert.equal(w.entries[0].sets.length, 50);
  assert.equal(w.entries[0].sets[0].r, 1);
  assert.equal(w.entries[0].topW, null);
});

test('addPastWorkout: 不改传入的 state', () => {
  const s = base();
  addPastWorkout(s, { d: '2026-11-04', ex: [{ id: '0025', sets: 2 }] }, 1000);
  assert.equal(s.workouts.length, 1);
});

test('removeWorkout: 删掉那一条，并清掉 ttLiveId', () => {
  const next = removeWorkout(base(), 'w1');
  assert.equal(next.workouts.length, 0);
  assert.equal(next.ttLiveId, null);
});

test('removeWorkout: 不存在的 id 不影响别的记录', () => {
  const s = { workouts: [{ id: 'a' }, { id: 'b' }], ttLiveId: 'a' };
  const next = removeWorkout(s, 'zzz');
  assert.equal(next.workouts.length, 2);
  assert.equal(next.ttLiveId, 'a');
});
