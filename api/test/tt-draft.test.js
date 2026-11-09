/* 草稿：每组去重、幂等重发、合并成 workout 的形状。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, addSet, toWorkout, emptyActive, addActiveSet, activeToDraft, activeToWorkout, undoSet, undoActiveSet } from '../tt-draft.js';

const T0 = Date.UTC(2026, 10, 2, 3, 0, 0);   // 2026-11-02 11:00 +08

test('空草稿是空的，没有 workout 可合并', () => {
  const d = emptyDraft('u1', T0);
  assert.equal(d.uid, 'u1');
  assert.deepEqual(d.exercises, []);
  assert.equal(toWorkout(d, T0), null);
});

test('记一组：动作名和 setNo 都留着', () => {
  const d = emptyDraft('u1', T0);
  assert.equal(addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12, at: T0 + 1000 }, T0 + 1000), true);
  assert.deepEqual(d.exercises[0].sets, [{ n: 1, w: 60, r: 12, at: T0 + 1000 }]);
});

test('同一个 (动作, 组号) 重发不会记两次', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 }, T0);
  assert.equal(addSet(d, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 }, T0), false);
  assert.equal(d.exercises[0].sets.length, 1);
});

test('组按编号排序，乱序补记也对', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', setNo: 3, w: 60, r: 10, at: T0 + 3000 }, T0);
  addSet(d, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 + 1000 }, T0);
  addSet(d, { exId: '0025', setNo: 2, w: 60, r: 11, at: T0 + 2000 }, T0);
  assert.deepEqual(d.exercises[0].sets.map(s => s.n), [1, 2, 3]);
});

test('非法输入直接拒绝', () => {
  const d = emptyDraft('u1', T0);
  assert.equal(addSet(d, { exId: '', setNo: 1 }, T0), false);
  assert.equal(addSet(d, { exId: '0025', setNo: 0 }, T0), false);
  assert.equal(addSet(d, { exId: '0025', setNo: 999 }, T0), false);
});

test('合并成 openGym 的形状：d/start/end/entries/topW', () => {
  const d = emptyDraft('u1', T0);
  d.routineId = 'r1';
  d.routineName = '胸';
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12, at: T0 + 60000 }, T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 2, w: 65, r: 10, at: T0 + 180000 }, T0);
  const w = toWorkout(d, T0 + 200000);
  assert.equal(w.d, '2026-11-02');
  assert.equal(w.start, T0);
  assert.equal(w.end, T0 + 180000);
  assert.equal(w.name, '胸');
  assert.deepEqual(w.routineIds, ['r1']);
  assert.equal(w.entries.length, 1);
  assert.equal(w.entries[0].id, '0025');
  assert.equal(w.entries[0].topW, 65);
  assert.deepEqual(w.entries[0].sets, [
    { w: 60, r: 12, done: true, at: T0 + 60000 },
    { w: 65, r: 10, done: true, at: T0 + 180000 }
  ]);
});

test('没有 routine 时名字兜底，routineIds 为空', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', setNo: 1, w: 20, r: 5, at: T0 }, T0);
  const w = toWorkout(d, T0);
  assert.equal(w.name, '抖音训练');
  assert.deepEqual(w.routineIds, []);
  assert.equal(w.routineId, null);
});

/* ---- state.active：和网页端"进行中的训练"同一份 ---- */

test('写进 active 的组就是网页端的 set 形状', () => {
  const a = emptyActive(T0, '背部');
  assert.equal(addActiveSet(a, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12, at: T0 + 1 }), true);
  assert.deepEqual(a.entries[0].sets, [{ w: 60, r: 12, done: true, at: T0 + 1 }]);
  assert.equal(a.entries[0].name, '杠铃卧推');
});

test('active 里同一组重发不会记两次', () => {
  const a = emptyActive(T0);
  addActiveSet(a, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 });
  assert.equal(addActiveSet(a, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 }), false);
  assert.equal(a.entries[0].sets.length, 1);
});

test('active 的空位保持 done:false，不伪造没做的组', () => {
  const a = emptyActive(T0);
  addActiveSet(a, { exId: '0025', setNo: 2, w: 60, r: 10, at: T0 });
  assert.deepEqual(a.entries[0].sets.map(s => s.done), [false, true]);
});

test('active → workout：只算已完成的组，名字/日期对', () => {
  const a = emptyActive(T0, '背部');
  addActiveSet(a, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 + 1000 });
  addActiveSet(a, { exId: '0025', setNo: 2, w: 65, r: 10, at: T0 + 60000 });
  const w = activeToWorkout(a, T0 + 70000);
  assert.equal(w.name, '背部');
  assert.equal(w.d, '2026-11-02');
  assert.deepEqual(w.entries[0].sets.map(s => s.w), [60, 65]);
});

test('active → draft：续练能看出第几组、多重', () => {
  const a = emptyActive(T0, '背部');
  addActiveSet(a, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 });
  addActiveSet(a, { exId: '0025', setNo: 2, w: 65, r: 10, at: T0 });
  const d = activeToDraft(a);
  assert.equal(d.routineName, '背部');
  assert.deepEqual(d.exercises[0].sets.map(s => [s.n, s.w, s.r]), [[1, 60, 12], [2, 65, 10]]);
});

/* ---- 撤销一组 ---- */

test('撤销：删掉那一组，后面的组号往前补', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12 }, T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 2, w: 60, r: 10 }, T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 3, w: 60, r: 8 }, T0);
  assert.equal(undoSet(d, { exId: '0025', setNo: 2 }, T0 + 1), true);
  assert.deepEqual(d.exercises[0].sets.map(s => [s.n, s.r]), [[1, 12], [2, 8]]);
});

test('撤销：组删光了，动作也一起删掉', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12 }, T0);
  undoSet(d, { exId: '0025', setNo: 1 }, T0 + 1);
  assert.deepEqual(d.exercises, []);
  assert.equal(toWorkout(d, T0 + 2), null);
});

test('撤销：不存在的组返回 false，不动草稿', () => {
  const d = emptyDraft('u1', T0);
  addSet(d, { exId: '0025', name: '杠铃卧推', setNo: 1, w: 60, r: 12 }, T0);
  assert.equal(undoSet(d, { exId: '0025', setNo: 9 }, T0), false);
  assert.equal(undoSet(d, { exId: 'nope', setNo: 1 }, T0), false);
  assert.equal(d.exercises[0].sets.length, 1);
});

test('撤销：active 里那格清掉，后面的组往前挪', () => {
  const a = emptyActive(T0, '胸部');
  addActiveSet(a, { exId: '0025', setNo: 1, w: 60, r: 12, at: T0 });
  addActiveSet(a, { exId: '0025', setNo: 2, w: 65, r: 10, at: T0 });
  addActiveSet(a, { exId: '0025', setNo: 3, w: 65, r: 8, at: T0 });
  assert.equal(undoActiveSet(a, { exId: '0025', setNo: 2 }, T0 + 1), true);
  assert.deepEqual(a.entries[0].sets.map(s => s.w), [60, 65]);
});
