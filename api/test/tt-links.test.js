/* openid ↔ 账号：绑定优先于自动建号，绑定失效时回退，重复绑定不产生副作用。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { userForOpenId, linkOpenId } from '../tt-links.js';

const db = () => ({
  users: [
    { id: 'auto1', name: '训练者', ttOpenId: 'open-1' },
    { id: 'real1', name: '老王' }
  ],
  ttLinks: {}
});

test('没绑定时按 auto 账号认人', () => {
  assert.equal(userForOpenId(db(), 'open-1').id, 'auto1');
});

test('绑定后按绑定走，哪怕 auto 账号还在', () => {
  const d = db();
  linkOpenId(d, 'open-1', 'real1');
  assert.equal(userForOpenId(d, 'open-1').id, 'real1');
});

test('绑定的账号被删掉：不返回幽灵，回退到 auto 账号', () => {
  const d = db();
  linkOpenId(d, 'open-1', 'gone');
  assert.equal(userForOpenId(d, 'open-1').id, 'auto1');
});

test('完全陌生的 openid 返回 null（调用方据此建号）', () => {
  assert.equal(userForOpenId(db(), 'never-seen'), null);
  assert.equal(userForOpenId(null, 'open-1'), null);
});

test('重复绑定同一个是幂等的', () => {
  const d = db();
  assert.equal(linkOpenId(d, 'open-1', 'real1'), true);
  assert.equal(linkOpenId(d, 'open-1', 'real1'), false);
  assert.equal(d.ttLinks['open-1'], 'real1');
});

test('换绑：同一个 openid 指向另一个账号', () => {
  const d = db();
  linkOpenId(d, 'open-1', 'real1');
  assert.equal(linkOpenId(d, 'open-1', 'auto1'), true);
  assert.equal(userForOpenId(d, 'open-1').id, 'auto1');
});
