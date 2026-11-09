import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternativesFor, exerciseInfo } from '../tt-alternatives.js';

test('alternatives: 收录的动作走人工清单，第一替代要对', () => {
  const items = alternativesFor('0025', { limit: 5 });   // 杠铃卧推
  assert.equal(items[0].id, '0289');                      // 哑铃卧推
  assert.ok(items.some(x => x.id === '0662'));            // 俯卧撑
  assert.ok(items.every(x => x.id !== '0025'));
});

test('alternatives: 排掉今天还要练的动作', () => {
  const items = alternativesFor('0025', { limit: 5, exclude: ['0289', '0662'] });
  assert.ok(items.every(x => x.id !== '0289' && x.id !== '0662'));
  assert.ok(items.length > 0);
});

test('alternatives: 硬拉给铰链类替代', () => {
  const ids = alternativesFor('0032', { limit: 3 }).map(x => x.id);
  assert.equal(ids[0], '0085');                            // 罗马尼亚硬拉
});

test('alternatives: 没收录的动作退回算法，不抛错', () => {
  const items = alternativesFor('3294', { limit: 4 });
  assert.ok(Array.isArray(items));
  assert.ok(items.length <= 4);
});

test('alternatives: 未知 id 返回空', () => {
  assert.deepEqual(alternativesFor('nope', { limit: 6 }), []);
  assert.deepEqual(alternativesFor('', { limit: 6 }), []);
  assert.deepEqual(alternativesFor(null, { limit: 6 }), []);
});

test('alternatives: limit 被夹在 1..12', () => {
  assert.equal(alternativesFor('0025', { limit: 0 }).length, 1);
  assert.ok(alternativesFor('0025', { limit: 999 }).length <= 12);
});

test('exerciseInfo: 名称、器械和示范图路径', () => {
  const it = exerciseInfo('0025');
  assert.equal(it.id, '0025');
  assert.ok(it.name);
  assert.equal(it.img, '/exercise-media/still/0025.webp');
  assert.equal(it.clip, '/exercise-media/clip/0025.mp4');
  assert.equal(it.imgJpg, '/exercise-media/still-jpg/0025.jpg');
  assert.equal(it.bpZh, '胸部');
  assert.equal(it.eqZh, '杠铃');
  assert.equal(exerciseInfo('nope'), null);
});
