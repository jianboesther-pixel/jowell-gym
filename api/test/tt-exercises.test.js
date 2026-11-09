/* 动作搜索：中文优先、短查询不炸库。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchExercises } from '../tt-exercises.js';

test('中文名能搜到，返回中文名', () => {
  const r = searchExercises('卧推', 5);
  assert.ok(r.length > 0);
  assert.ok(r[0].name.includes('卧推'));
  assert.ok(r[0].id);
});

test('英文名也能搜', () => {
  const r = searchExercises('bench press', 5);
  assert.ok(r.some(x => x.en === 'barbell bench press'));
});

test('空查询返回空，不会把整库吐出来', () => {
  assert.deepEqual(searchExercises('', 10), []);
  assert.deepEqual(searchExercises('   ', 10), []);
});

test('limit 生效，且有上限', () => {
  assert.ok(searchExercises('a', 3).length <= 3);
  assert.ok(searchExercises('squat', 999).length <= 50);
});

test('结果里带英文名和器械，方便区分同名动作', () => {
  const r = searchExercises('深蹲', 3);
  assert.ok(r.every(x => typeof x.en === 'string'));
});
