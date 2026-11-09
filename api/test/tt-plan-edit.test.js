import { test } from 'node:test';
import assert from 'node:assert/strict';
import {planView, upsertRoutine, removeRoutine, setWeek, starterRoutines, loadStarterPlan } from '../tt-plan-edit.js';

const base = () => ({
  routines: [
    { id: 'r1', name: '推', ex: [{ id: '0025', sets: 4, reps: 6 }, { id: '0091', sets: 3, reps: 8 }] },
    { id: 'r2', name: '腿', ex: [{ id: '3593', sets: 4, reps: 6 }] }
  ],
  week: { 1: 'r1', 4: ['r2'] }
});

test('planView: 每套计划带动作名，周安排统一成数组', () => {
  const v = planView(base(), { weekday: 1 });
  assert.equal(v.routines.length, 2);
  assert.equal(v.routines[0].ex[0].id, '0025');
  assert.ok(v.routines[0].ex[0].name);
  assert.deepEqual(v.week[1], ['r1']);
  assert.deepEqual(v.week[4], ['r2']);
  assert.equal(v.weekday, 1);
});

test('planView: 周安排里指向不存在计划的 id 被丢掉', () => {
  const s = base();
  s.week[2] = 'gone';
  assert.equal(planView(s).week[2], undefined);
});

test('upsertRoutine: 新建一套，id 自动生成', () => {
  const next = upsertRoutine(base(), { name: '拉', ex: [{ id: '0032', sets: 3, reps: 5 }] }, 1000);
  assert.equal(next.routines.length, 3);
  assert.equal(next.routines[2].name, '拉');
  assert.ok(next.routines[2].id);
});

test('upsertRoutine: 按 id 更新已有的一套，不动别的', () => {
  const next = upsertRoutine(base(), { id: 'r1', name: '推 A', ex: [{ id: '0025', sets: 5, reps: 5 }] }, 1000);
  assert.equal(next.routines.length, 2);
  assert.equal(next.routines[0].name, '推 A');
  assert.equal(next.routines[0].ex[0].sets, 5);
  assert.equal(next.routines[1].name, '腿');
});

test('upsertRoutine: 参数被夹住，未知 id 被丢掉', () => {
  const next = upsertRoutine(base(), { name: 'X', ex: [
    { id: '0025', sets: 999, reps: -3 },
    { id: 'nope', sets: 3, reps: 8 }
  ] }, 1000);
  const r = next.routines[next.routines.length - 1];
  assert.equal(r.ex.length, 1);
  assert.equal(r.ex[0].sets, 20);
  assert.equal(r.ex[0].reps, 1);
});

test('upsertRoutine: 没有名字返回原样（不新建）', () => {
  const s = base();
  const next = upsertRoutine(s, { ex: [{ id: '0025', sets: 3, reps: 8 }] }, 1000);
  assert.equal(next.routines.length, 2);
});

test('removeRoutine: 删掉那套并从周安排摘掉', () => {
  const next = removeRoutine(base(), 'r1');
  assert.equal(next.routines.length, 1);
  assert.equal(next.week[1], undefined);
  assert.deepEqual(next.week[4], ['r2']);
});

test('setWeek: 最多 3 套/天，重复和未知 id 被去掉', () => {
  const next = setWeek(base(), { 1: ['r1', 'r1', 'r2', 'r1', 'r2', 'x'] });
  assert.deepEqual(next.week[1], ['r1', 'r2']);
});

test('setWeek: 空的整天不写进 week', () => {
  const next = setWeek(base(), { 1: [], 2: ['r1'] });
  assert.equal(next.week[1], undefined);
  assert.deepEqual(next.week[2], ['r1']);
});

test('setWeek: 不改传入的 state', () => {
  const s = base();
  setWeek(s, { 1: ['r2'] });
  assert.equal(s.week[1], 'r1');
});

test('starterRoutines: 推/拉/腿三套，每套都有动作且 id 在库里', () => {
  const r = starterRoutines();
  assert.equal(r.length, 3);
  assert.deepEqual(r.map(x => x.name), ['推', '拉', '腿']);
  for (const one of r) assert.ok(one.ex.length >= 2);
});

test('loadStarterPlan: 追加计划，并把周一三五排上', () => {
  const st = loadStarterPlan({ week: {} }, 1);
  assert.equal(st.routines.length, 3);
  assert.equal(st.week[1].length, 1);
  assert.equal(st.week[3].length, 1);
  assert.equal(st.week[5].length, 1);
  assert.equal(st.week[0], undefined);
});

test('loadStarterPlan: 不覆盖已有计划', () => {
  const st = loadStarterPlan({ routines: [{ id: 'a', name: '我的', ex: [] }] }, 1);
  assert.equal(st.routines.length, 4);
  assert.equal(st.routines[0].id, 'a');
});
