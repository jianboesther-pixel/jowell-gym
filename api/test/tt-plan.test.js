/* 新手模板：从零建计划，已有计划不覆盖。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { templates, applyTemplate } from '../tt-plan.js';

test('三个模板，都有 key 和中文名', () => {
  const list = templates();
  assert.equal(list.length, 3);
  for (const t of list) {
    assert.ok(t.key);
    assert.ok(t.label.includes('每周'));
  }
});

test('全身模板：一个 routine，周一三五都指向它', () => {
  const s = {};
  applyTemplate(s, 'full3', 1000);
  assert.equal(s.routines.length, 1);
  assert.deepEqual(s.week, { 1: s.routines[0].id, 3: s.routines[0].id, 5: s.routines[0].id });
  assert.ok(s.routines[0].ex.length >= 4);
});

test('上下肢：两个 routine，周一二四五交替', () => {
  const s = {};
  applyTemplate(s, 'upperlower4', 1000);
  assert.equal(s.routines.length, 2);
  assert.equal(s.week['1'], s.routines[0].id);
  assert.equal(s.week['2'], s.routines[1].id);
});

test('已经有计划时不动它', () => {
  const s = { routines: [{ id: 'mine', name: '我的', ex: [] }] };
  assert.equal(applyTemplate(s, 'ppl3', 1000), null);
  assert.equal(s.routines.length, 1);
  assert.equal(s.routines[0].id, 'mine');
});

test('未知模板返回 null，什么都不改', () => {
  const s = {};
  assert.equal(applyTemplate(s, 'nope', 1000), null);
  assert.equal(s.routines, undefined);
});
