import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotationView, setRotation, clearRotation, advanceRotation, rotationPick } from '../tt-rotation.js';

const base = () => ({
  routines: [
    { id: 'a', name: '推', ex: [] },
    { id: 'b', name: '拉', ex: [] },
    { id: 'c', name: '腿', ex: [] }
  ],
  week: {}
});

test('setRotation：按顺序记下来，指针从 0 开始', () => {
  const s = setRotation(base(), ['a', 'b', 'c']);
  const v = rotationView(s);
  assert.equal(v.on, true);
  assert.equal(v.idx, 0);
  assert.equal(v.currentName, '推');
  assert.deepEqual(v.names, ['推', '拉', '腿']);
});

test('rotationView：过滤掉不存在的计划，一个计划不算轮换', () => {
  const s = setRotation(base(), ['a', 'zzz']);
  const v = rotationView(s);
  assert.deepEqual(v.ids, ['a']);
  assert.equal(v.on, false);
});

test('advanceRotation：练完一场前进一格，到末尾回到开头', () => {
  let s = setRotation(base(), ['a', 'b', 'c']);
  s = advanceRotation(s);
  assert.equal(rotationView(s).idx, 1);
  s = advanceRotation(s);
  s = advanceRotation(s);
  assert.equal(rotationView(s).idx, 0);
});

test('advanceRotation：没开轮换时不动', () => {
  const s = advanceRotation(base());
  assert.equal(s.ttRotation, undefined);
});

test('clearRotation：清掉', () => {
  const s = clearRotation(setRotation(base(), ['a', 'b']));
  assert.equal(s.ttRotation, undefined);
});

test('rotationPick：周安排优先于轮换', () => {
  let s = setRotation(base(), ['a', 'b']);
  s.week = { 1: ['c'] };
  assert.deepEqual(rotationPick(s, 1), { ids: ['c'], from: 'week' });
  assert.deepEqual(rotationPick(s, 2), { ids: ['a'], from: 'rotation' });
});

test('rotationPick：都没有就空', () => {
  assert.deepEqual(rotationPick(base(), 3), { ids: [], from: 'none' });
});
