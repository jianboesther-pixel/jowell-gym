/* 今天练什么：面板只该看到它画得出来的东西。
 * 这里用 fixture，不碰真实用户的 state 文件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { todayView } from '../tt-today.js';

const routine = {
  id: 'r1',
  name: '推日',
  ex: [
    { id: '0025', sets: 4, reps: 8, weight: 60, rest: 120 },
    { id: 'nope-custom', sets: 3, reps: 12 }
  ]
};

const state = {
  routines: [routine],
  week: { 1: ['r1'] },
  customEx: [{ id: 'nope-custom', n: '沙袋走' }],
  exWeights: { '0025': { w: 65, reps: 6 } }
};

test('周一有计划：动作、组数、次数、重量、休息都取到', () => {
  const v = todayView(state, { weekday: 1 });
  assert.equal(v.training, true);
  assert.equal(v.dow, '周一');
  assert.equal(v.routines[0].name, '推日');
  assert.deepEqual(v.routines[0].exercises[0], {
    id: '0025', name: '杠铃卧推', sets: 4, reps: 8, weight: 65, restSec: 120
  ,
      mode: 'reps',
      perSide: false,
      repsList: null,
      weightList: null,
      group: null,
      prog: 'off',
      inc: 0,
      target: 0,
      base: 0
    });
});

test('英文账号拿英文动作名，中文账号拿中文', () => {
  assert.equal(todayView(state, { weekday: 1, lang: 'en' }).routines[0].exercises[0].name, 'barbell bench press');
  assert.equal(todayView({ ...state, lang: 'zh' }, { weekday: 1 }).routines[0].exercises[0].name, '杠铃卧推');
  assert.equal(todayView(state, { weekday: 1, lang: 'zh-TW' }).routines[0].exercises[0].name, '杠铃卧推');
});

test('重量优先用最近练过的 exWeights，没有就用计划里的', () => {
  const v = todayView({ ...state, exWeights: {} }, { weekday: 1 });
  assert.equal(v.routines[0].exercises[0].weight, 60);
});

test('自定义动作用 customEx 的名字', () => {
  const v = todayView(state, { weekday: 1 });
  assert.equal(v.routines[0].exercises[1].name, '沙袋走');
});

test('缺字段时给安全的默认值，而不是 undefined', () => {
  const bare = { routines: [{ id: 'r', ex: [{ id: '0025' }] }], week: { 1: ['r'] } };
  const v = todayView(bare, { weekday: 1 });
  assert.deepEqual(v.routines[0].exercises[0], {
    id: '0025', name: '杠铃卧推', sets: 3, reps: 8, weight: 0, restSec: 90
  ,
      mode: 'reps',
      perSide: false,
      repsList: null,
      weightList: null,
      group: null,
      prog: 'off',
      inc: 0,
      target: 0,
      base: 0
    });
});

test('休息日返回 training:false，面板据此保留 demo', () => {
  assert.deepEqual(todayView(state, { weekday: 2 }), { dow: '周二', training: false, hasPlan: true, routines: [] });
  assert.deepEqual(todayView(null, { weekday: 3 }), { dow: '周三', training: false, hasPlan: false, routines: [] });
});

test('week 里指向一个已被删掉的 routine 时，当作休息日', () => {
  const v = todayView({ routines: [], week: { 1: ['gone'] } }, { weekday: 1 });
  assert.equal(v.training, false);
});

test('动作数量有上限，避免有人把 30 个动作排进一天', () => {
  const many = { routines: [{ id: 'r', ex: Array.from({ length: 30 }, () => ({ id: '0025' })) }], week: { 1: ['r'] } };
  assert.equal(todayView(many, { weekday: 1 }).routines[0].exercises.length, 12);
});

test('一天排两个 routine 时都返回，顺序按 week 数组', () => {
  const s = { routines: [{ id: 'a', ex: [] }, { id: 'b', ex: [] }], week: { 1: ['b', 'a'] } };
  assert.deepEqual(todayView(s, { weekday: 1 }).routines.map(r => r.id), ['b', 'a']);
});
