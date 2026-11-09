/* 抖音小程序登录（服务端那一半）：把 tt.login 的一次性 code 换成 openid。
 *
 * AppID / AppSecret 只存在服务器的环境变量里（部署目录的 .env），不进仓库、不进小程序包：
 * 小程序手里只有一个 code，用过即废，也换不出 secret。
 *
 * 端点用抖音开放平台的 jscode2session。返回里我们只认 openid —— session_key 不解密任何东西，
 * 收下只会多一份要保管的秘密，所以丢掉。
 */
const ENDPOINT = 'https://developer.toutiao.com/api/apps/v2/jscode2session';
const TIMEOUT_MS = 8000;

export function ttConfigured(env = process.env) {
  return !!(env.DOUYIN_APPID && env.DOUYIN_SECRET);
}

/**
 * 换 openid。永不抛：失败用 { ok:false, error } 表达，调用方按 error 决定 HTTP 状态。
 * error: 'not-configured' | 'no-code' | 'refused' | 'unreachable' | 'timeout'
 */
export async function exchangeCode(code, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetch || fetch;
  if (!ttConfigured(env)) return { ok: false, error: 'not-configured' };
  const c = String(code || '').trim();
  if (!c || c.length > 512) return { ok: false, error: 'no-code' };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appid: env.DOUYIN_APPID, secret: env.DOUYIN_SECRET, code: c }),
      signal: ctl.signal
    });
    let body = null;
    try { body = await r.json(); } catch { /* 不是 JSON 就当作拒绝 */ }
    const openid = body && body.data && body.data.openid;
    if (r.ok && typeof openid === 'string' && openid) return { ok: true, openid };
    return { ok: false, error: 'refused', status: r.status, detail: _detail(body) };
  } catch (e) {
    return { ok: false, error: ctl.signal.aborted ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// 只留错误码，方便看日志；绝不再带 secret 或 code 本身。
const _detail = body => {
  if (!body || typeof body !== 'object') return null;
  const n = body.err_no != null ? body.err_no : (body.data && body.data.err_no);
  return n == null ? null : String(n).slice(0, 40);
};
