import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesFor, notesIndex, notesCount } from '../tt-notes.js';

test('notes: 一共有 57 个动作带讲解', () => {
  assert.equal(notesCount(), 57);
  assert.equal(notesIndex().length, 57);
});

test('notes: 高位下拉有两条讲解，字段齐全', () => {
  const list = notesFor('1030');
  assert.ok(list.length >= 1);
  const n = list[0];
  assert.ok(n.title);
  assert.ok(n.coach);
  assert.ok(n.summary);
  assert.ok(Array.isArray(n.key));
});

test('notes: 没有讲解的动作返回空数组', () => {
  assert.deepEqual(notesFor('0001'), []);
  assert.deepEqual(notesFor('nope'), []);
  assert.deepEqual(notesFor(null), []);
});

test('notesIndex: 每条都有 id / 名字 / 讲解数', () => {
  for (const it of notesIndex()) {
    assert.ok(it.id);
    assert.ok(it.name);
    assert.ok(it.count >= 1);
  }
});
