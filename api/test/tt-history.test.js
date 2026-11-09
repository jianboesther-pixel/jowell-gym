/* 历史列表：组数/容量/时长，只算完成的组；名字跟着语言走。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, historyView } from '../tt-history.js';

const w = (id, d, entries, extra = {}) => ({
  id, d, name: '胸', start: 1000, end: 1000 + 42 * 60000, entries, ...extra
});

const state = {
  workouts: [
    w('a', '2026-11-01', [{ id: '0025', sets: [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }] }]),
    w('b', '2026-10-30', [{ id: '0032', sets: [{ w: 50, r: 12, done: true }, { w: 55, r: 10, done: false }] }]),
    w('c', '2026-10-29', [])
  ]
};

test('一场：组数/容量/时长/最大重量都对', () => {
  const s = summarize(state.workouts[0]);
  assert.equal(s.sets, 2);
  assert.equal(s.volume, 1200);
  assert.equal(s.minutes, 42);
  assert.equal(s.topW, 60);
  assert.equal(s.exercises[0].name, '杠铃卧推');
});

test('未完成的组不算，也不出现在明细里', () => {
  const s = summarize(state.workouts[1]);
  assert.equal(s.sets, 1);
  assert.equal(s.volume, 600);
  assert.equal(s.exercises[0].sets.length, 1);
});

test('空场不进列表，按日期倒序', () => {
  const list = historyView(state);
  assert.deepEqual(list.map(x => x.id), ['a', 'b']);
});

test('limit 生效，且有上限', () => {
  assert.equal(historyView(state, { limit: 1 }).length, 1);
  assert.ok(historyView(state, { limit: 999 }).length <= 50);
});

test('英文账号拿英文动作名', () => {
  assert.equal(summarize(state.workouts[0], 'en').exercises[0].name, 'barbell bench press');
});

test('正在练的那场带 live 标记', () => {
  const s = summarize(w('live1', '2026-11-02', [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }], { ttLive: true }));
  assert.equal(s.live, true);
});
