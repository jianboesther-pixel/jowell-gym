import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCustom, removeCustom, customForLibrary, customParts } from '../tt-custom.js';

const base = () => ({ customEx: [{ id: 'cu1', n: '我的推胸', bp: 'chest', _ts: 1 }] });

test('addCustom: 加一条，带 id 和时间', () => {
  const next = addCustom(base(), { name: ' 自创划船 ', bp: 'back' }, 99);
  assert.equal(next.customEx.length, 2);
  assert.equal(next.customEx[1].n, '自创划船');
  assert.equal(next.customEx[1].bp, 'back');
  assert.equal(next.customEx[1]._ts, 99);
  assert.ok(next.customEx[1].id);
});

test('addCustom: 名字为空不新增', () => {
  assert.equal(addCustom(base(), { name: '   ' }, 99).customEx.length, 1);
  assert.equal(addCustom(base(), {}, 99).customEx.length, 1);
});

test('addCustom: 不认识的部位落到全身', () => {
  const next = addCustom(base(), { name: 'X', bp: 'nope' }, 99);
  assert.equal(next.customEx[1].bp, 'full body');
});

test('removeCustom: 删掉指定的那条', () => {
  assert.equal(removeCustom(base(), 'cu1').customEx.length, 0);
  assert.equal(removeCustom(base(), 'zzz').customEx.length, 1);
});

test('customForLibrary: 新的在前，带中文部位', () => {
  const list = customForLibrary({
    customEx: [
      { id: 'a', n: 'A', bp: 'chest', _ts: 1 },
      { id: 'b', n: 'B', bp: 'back', _ts: 5 }
    ]
  });
  assert.equal(list[0].id, 'b');
  assert.equal(list[0].bpZh, '背部');
  assert.equal(list[1].custom, true);
});

test('customParts: 11 个部位，都有中文名', () => {
  const parts = customParts();
  assert.equal(parts.length, 11);
  assert.ok(parts.every(p => p.key && p.zh));
});
