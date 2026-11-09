/* 抖音登录的服务端一半：配置缺失、成功、被拒、网络不通，四种各自的答案。
 * 这里不碰网络：fetch 是传进来的，所以测试里没有任何真实请求。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ttConfigured, exchangeCode } from '../tt-auth.js';

const env = { DOUYIN_APPID: 'tt-app', DOUYIN_SECRET: 'shh' };
const answer = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('without AppID/AppSecret it says so instead of guessing', async () => {
  assert.equal(ttConfigured({}), false);
  assert.equal(ttConfigured({ DOUYIN_APPID: 'a' }), false);
  assert.equal(ttConfigured(env), true);
  assert.deepEqual(await exchangeCode('c', { env: {} }), { ok: false, error: 'not-configured' });
});

test('an empty or oversized code never reaches Douyin', async () => {
  let called = 0;
  const fetch = async () => { called++; return answer(200, { data: { openid: 'o' } })(); };
  assert.deepEqual(await exchangeCode('  ', { env, fetch }), { ok: false, error: 'no-code' });
  assert.deepEqual(await exchangeCode('x'.repeat(600), { env, fetch }), { ok: false, error: 'no-code' });
  assert.equal(called, 0);
});

test('a good code comes back as an openid', async () => {
  const seen = {};
  const fetch = async (url, opts) => {
    seen.url = url;
    seen.body = JSON.parse(opts.body);
    return answer(200, { err_no: 0, data: { openid: 'open-1', session_key: 'never-used' } })();
  };
  const out = await exchangeCode('code-1', { env, fetch });
  assert.deepEqual(out, { ok: true, openid: 'open-1' });
  assert.match(seen.url, /jscode2session/);
  assert.deepEqual(seen.body, { appid: 'tt-app', secret: 'shh', code: 'code-1' });
});

test('a refusal keeps the code, not the secret, and reports the code', async () => {
  const fetch = async () => answer(200, { err_no: 40001, data: {} })();
  assert.deepEqual(await exchangeCode('bad', { env, fetch }), { ok: false, error: 'refused', status: 200, detail: '40001' });
});

test('an HTTP failure is a refusal, not a crash', async () => {
  const fetch = async () => answer(500, {})();
  const out = await exchangeCode('c', { env, fetch });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'refused');
  assert.equal(out.status, 500);
});

test('a dead network is its own error', async () => {
  const fetch = async () => { throw new Error('ECONNREFUSED'); };
  assert.deepEqual(await exchangeCode('c', { env, fetch }), { ok: false, error: 'unreachable' });
});
