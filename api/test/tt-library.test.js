import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryView, PARTS, GEAR } from '../tt-library.js';

test('library: 默认返回一页，带 total 和 hasMore', () => {
  const v = libraryView({ limit: 10 });
  assert.equal(v.items.length, 10);
  assert.ok(v.total > 1000);
  assert.equal(v.hasMore, true);
  assert.ok(v.items.every(x => x.id && x.name));
});

test('library: 按部位筛，全是这个部位', () => {
  const v = libraryView({ bp: 'chest', limit: 20 });
  assert.ok(v.items.length > 0);
  assert.ok(v.items.every(x => x.bp === 'chest'));
  assert.equal(v.items[0].bpZh, '胸部');
});

test('library: 按器械筛', () => {
  const v = libraryView({ eq: 'dumbbell', limit: 20 });
  assert.ok(v.items.every(x => x.eq === 'dumbbell'));
  assert.equal(v.items[0].eqZh, '哑铃');
});

test('library: 搜索中英文都命中，中文开头优先', () => {
  const v = libraryView({ q: '卧推', limit: 20 });
  assert.ok(v.items.length > 0);
  assert.ok(v.items[0].name.includes('卧推'));
  const en = libraryView({ q: 'bench press', limit: 20 });
  assert.ok(en.items.length > 0);
});

test('library: 搜索 + 部位一起生效', () => {
  const v = libraryView({ q: '卧推', bp: 'chest', limit: 20 });
  assert.ok(v.items.every(x => x.bp === 'chest' && (x.name.includes('卧推') || x.en.includes('卧推'))));
});

test('library: 翻页不重复', () => {
  const a = libraryView({ limit: 10, offset: 0 });
  const b = libraryView({ limit: 10, offset: 10 });
  const ids = new Set(a.items.map(x => x.id).concat(b.items.map(x => x.id)));
  assert.equal(ids.size, 20);
});

test('library: 超出范围返回空页', () => {
  const v = libraryView({ q: 'zzzz-no-such', limit: 10 });
  assert.equal(v.items.length, 0);
  assert.equal(v.total, 0);
  assert.equal(v.hasMore, false);
});

test('library: 部位和器械的筛选项有中文名', () => {
  assert.ok(PARTS.length >= 8 && GEAR.length >= 6);
  assert.ok(PARTS.every(p => p.key && p.zh));
  assert.ok(GEAR.every(g => g.key && g.zh));
});
