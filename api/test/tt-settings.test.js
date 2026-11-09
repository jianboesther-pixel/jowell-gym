import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySettings, settingsView, convertWeight, convertBody } from '../tt-settings.js';

const state = () => ({
  unit: 'kg',
  restSec: 90,
  targetW: 70,
  bodyweight: [{ d: '2026-11-01', w: 70 }],
  workouts: [{ id: 'w1', entries: [{ id: '0025', topW: 60, sets: [{ w: 60, r: 8, done: true }] }] }],
  active: { entries: [{ id: '0025', sets: [{ w: 55, r: 8, done: true }] }] },
  routines: [{ id: 'r1', ex: [{ id: '0025', weight: 60, sets: 4, reps: 8 }] }]
});

test('convertWeight: kg↔lb 取整规则', () => {
  assert.equal(convertWeight(60, 'kg', 'lb'), 132.5);
  assert.equal(convertWeight(135, 'lb', 'kg'), 61.25);
  assert.equal(convertWeight(60, 'kg', 'kg'), 60);
  assert.equal(convertWeight(null, 'kg', 'lb'), null);
});

test('convertBody: 体重取到 0.1', () => {
  assert.equal(convertBody(70, 'kg', 'lb'), 154.3);
  assert.equal(convertBody(154.3, 'lb', 'kg'), 70);
});

test('settingsView: 默认值是 kg / 90 秒，开关给默认值', () => {
  const v = settingsView({});
  assert.equal(v.unit, 'kg');
  assert.equal(v.restSec, 90);
  assert.equal(v.restPauseSec, 15);
  assert.equal(v.keepAwake, true);
  assert.equal(v.animations, true);
  assert.equal(v.weekStart, 0);
  assert.equal(v.effort, false);
  const lb = settingsView({ unit: 'lb', restSec: 60 });
  assert.equal(lb.unit, 'lb');
  assert.equal(lb.restSec, 60);
});

test('applySettings: 开关类字段按传入值保存', () => {
  const next = applySettings(state(), { keepAwake: false, animations: false, wdec: 1, weekStart: 1, effort: true, restPauseSec: 20 });
  assert.equal(next.keepAwake, false);
  assert.equal(next.animations, false);
  assert.equal(next.wdec, 1);
  assert.equal(next.weekStart, 1);
  assert.equal(next.effort, true);
  assert.equal(next.restPauseSec, 20);
});

test('applySettings: 换到 lb 会把所有重量换算过去', () => {
  const next = applySettings(state(), { unit: 'lb' });
  assert.equal(next.unit, 'lb');
  assert.equal(next.workouts[0].entries[0].sets[0].w, 132.5);
  assert.equal(next.workouts[0].entries[0].topW, 132.5);
  assert.equal(next.active.entries[0].sets[0].w, 121.5);
  assert.equal(next.routines[0].ex[0].weight, 132.5);
  assert.equal(next.bodyweight[0].w, 154.3);
  assert.equal(next.targetW, 154.3);
});

test('applySettings: 换回 kg 近似还原', () => {
  const back = applySettings(applySettings(state(), { unit: 'lb' }), { unit: 'kg' });
  assert.equal(back.workouts[0].entries[0].sets[0].w, 60);
  assert.equal(back.routines[0].ex[0].weight, 60);
});

test('applySettings: 同单位不换算', () => {
  const s = state();
  const next = applySettings(s, { unit: 'kg' });
  assert.equal(next.unit, 'kg');
  assert.equal(next.workouts[0].entries[0].sets[0].w, 60);
});

test('applySettings: 休息时长夹在 0..600', () => {
  assert.equal(applySettings(state(), { restSec: -5 }).restSec, 0);
  assert.equal(applySettings(state(), { restSec: 9999 }).restSec, 600);
  assert.equal(applySettings(state(), { restSec: 120 }).restSec, 120);
});

test('applySettings: 不认识的单位忽略，不动数据', () => {
  const next = applySettings(state(), { unit: 'stone' });
  assert.equal(next.unit, 'kg');
  assert.equal(next.workouts[0].entries[0].sets[0].w, 60);
});

test('applySettings: 不修改传入的 state', () => {
  const s = state();
  applySettings(s, { unit: 'lb', restSec: 30 });
  assert.equal(s.unit, 'kg');
  assert.equal(s.workouts[0].entries[0].sets[0].w, 60);
});
