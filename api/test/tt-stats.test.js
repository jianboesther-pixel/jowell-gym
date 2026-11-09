import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, statsView, muscleBalance, topStrength } from '../tt-stats.js';

const W = (d, sets = 3, w = 60, r = 10) => ({
  id: 'w' + d + sets,
  d,
  start: 0,
  end: 0,
  name: '训练',
  entries: [{ id: '0025', sets: Array.from({ length: sets }, () => ({ w, r, done: true })) }]
});

test('mondayOf: 周一到周日本周都是同一个周一', () => {
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');   // 周一
  assert.equal(mondayOf('2026-11-05'), '2026-11-02');   // 周四
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');   // 周日
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');   // 下周一
});

test('mondayOf: 非法日期返回 null', () => {
  assert.equal(mondayOf(''), null);
  assert.equal(mondayOf('2026-1-1'), null);
  assert.equal(mondayOf(null), null);
});

test('statsView: 本周次数和总量', () => {
  const v = statsView({ workouts: [W('2026-11-03'), W('2026-11-04')] }, { today: '2026-11-05' });
  assert.equal(v.thisWeek.count, 2);
  assert.equal(v.thisWeek.volume, 2 * 3 * 60 * 10);
  assert.equal(v.weeks.length, 12);
});

test('statsView: 空场次不算，也不影响周数', () => {
  const empty = { id: 'e', d: '2026-11-03', entries: [] };
  const v = statsView({ workouts: [empty] }, { today: '2026-11-05' });
  assert.equal(v.thisWeek.count, 0);
  assert.equal(v.streak, 0);
});

test('statsView: 连续周数从本周往前数，遇到空周停', () => {
  const v = statsView({
    workouts: [W('2026-11-03'), W('2026-10-28'), W('2026-10-21'), W('2026-10-07')]
  }, { today: '2026-11-05' });
  // 本周、上周、上上周有，10-14 那周没有 → 3
  assert.equal(v.streak, 3);
});

test('statsView: 本周还没练不算断，连续数从上周起算', () => {
  const v = statsView({ workouts: [W('2026-10-28'), W('2026-10-21')] }, { today: '2026-11-05' });
  assert.equal(v.thisWeek.count, 0);
  assert.equal(v.streak, 2);
});

test('statsView: 柱状图的峰值是最大周容量', () => {
  const v = statsView({ workouts: [W('2026-11-03', 3), W('2026-10-28', 6)] }, { today: '2026-11-05' });
  assert.equal(v.peak, 6 * 60 * 10);
  assert.equal(v.weeks[0].count, 1);
});

test('statsView: weeks 被夹在 4..53（一年）', () => {
  assert.equal(statsView({}, { weeks: 1 }).weeks.length, 4);
  assert.equal(statsView({}, { weeks: 99 }).weeks.length, 53);
});

test('muscleBalance: 按肌群数正式组，多的在前', () => {
  const list = [{ id: 'a', d: '2026-11-05', entries: [
    { id: '0025', sets: [{ w: 60, r: 8, done: true }, { w: 65, r: 6, done: true }] },
    { id: '0027', sets: [{ w: 50, r: 10, done: true }] }
  ] }];
  const m = muscleBalance(list, '2026-11-06');
  assert.equal(m[0].sets, 2);
  assert.ok(m[0].zh);
});

test('muscleBalance: 自重（无重量）的组不算', () => {
  const list = [{ id: 'a', d: '2026-11-05', entries: [{ id: '0025', sets: [{ w: 0, r: 10, done: true }] }] }];
  assert.deepEqual(muscleBalance(list, '2026-11-06'), []);
});

test('topStrength: Epley 估算，取最大的一组', () => {
  const list = [{ id: 'a', d: '2026-11-05', entries: [{ id: '0025', sets: [
    { w: 60, r: 8, done: true }, { w: 70, r: 5, done: true }
  ] }] }];
  const top = topStrength(list);
  assert.equal(top[0].e1rm, 81.7);
  assert.ok(top[0].name);
});
