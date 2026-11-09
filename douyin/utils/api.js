/* 与 openGym 后端说话的唯一入口。
 *
 * 登录是零输入的：tt.login 给一个 code，服务端拿 AppID/AppSecret 换 openid 并回一个令牌。
 * AppSecret 永远不在这份代码里 —— 小程序只经手 code 和令牌，两者泄露的后果差着量级。
 *
 * 令牌存在本地存储：小程序被关掉再打开，先用手上的令牌，过期了再走一次 tt.login。
 */
const BASE = 'https://gym.jowellpet.xin';
const TOKEN_KEY = 'gym_token';

let token = '';
try { token = tt.getStorageSync(TOKEN_KEY) || ''; } catch (e) { token = ''; }

/** 一个请求：带令牌，非 2xx 当成错误，错误里保留服务端的 code 方便上层区分。 */
function call(path, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    tt.request({
      url: BASE + path,
      method: o.method || 'GET',
      data: o.data,
      header: Object.assign(
        { 'content-type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        const err = new Error('http ' + res.statusCode);
        err.status = res.statusCode;
        err.data = res.data || null;
        reject(err);
      },
      fail(e) { reject(Object.assign(new Error(e && e.errMsg || 'network'), { status: 0 })); }
    });
  });
}

/** tt.login → 服务端换令牌。失败时 reject，调用方决定要不要退回本地 demo。 */
function login() {
  return new Promise((resolve, reject) => {
    tt.login({
      force: false,
      success(res) {
        call('/api/tt/login', { method: 'POST', data: { code: res.code } })
          .then(out => {
            save(out.token);
            resolve({ user: out.user, linked: !!out.linked });
          })
          .catch(reject);
      },
      fail(e) { reject(Object.assign(new Error(e && e.errMsg || 'tt.login failed'), { status: 0, errMsg: e && e.errMsg })); }
    });
  });
}

function save(t) {
  token = t;
  try { tt.setStorageSync(TOKEN_KEY, token); } catch (e) { /* 存储满了也不影响本次会话 */ }
}

/**
 * 把当前抖音身份绑到一个已有账号：名称 + 密码，只需要一次。
 * 成功后令牌换成那个账号的，后续请求就都是"本人"了。
 */
function bind(name, password) {
  return call('/api/tt/bind', { method: 'POST', data: { name, password } }).then(out => {
    save(out.token);
    return { user: out.user, linked: true };
  });
}

const loggedIn = () => !!token;

// 每组一条，离线也不能丢：发不出去就进本地队列，下次进前台补发。
// 服务端按 (动作, 组号) 去重，所以重发是安全的。
const OUTBOX = 'gym_outbox_v1';

function readOutbox() {
  try { return tt.getStorageSync(OUTBOX) || []; } catch (e) { return []; }
}
function writeOutbox(list) {
  try { tt.setStorageSync(OUTBOX, list.slice(-300)); } catch (e) { /* 满了就丢最旧的一批 */ }
}

function sendSet(payload) {
  return call('/api/tt/set', { method: 'POST', data: payload }).catch(e => {
    const list = readOutbox();
    list.push(payload);
    writeOutbox(list);
    throw e;
  });
}

function flush() {
  const list = readOutbox();
  if (!list.length) return Promise.resolve(0);
  return Promise.all(list.map(p => call('/api/tt/set', { method: 'POST', data: p }).catch(() => null)))
    .then(() => { writeOutbox([]); return list.length; });
}

const sendWarm = payload => call('/api/tt/warm', { method: 'POST', data: payload });
const sendNote = payload => call('/api/tt/note', { method: 'POST', data: payload });
const setToWarm = payload => call('/api/tt/set/towarm', { method: 'POST', data: payload });

/** 选一张图 → 读成 base64 → 上传，resolve 出可以直接给 <image> 的地址。 */
function pickAndUpload(source) {
  return new Promise((resolve, reject) => {
    tt.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: source || ['album', 'camera'],
      success(res) {
        const p = (res.tempFilePaths && res.tempFilePaths[0]) || '';
        if (!p) return reject(new Error('no file'));
        const read = filePath => {
          try {
            tt.getFileSystemManager().readFile({
              filePath,
              encoding: 'base64',
              success(f) {
                const ext = /\.png$/i.test(filePath) ? 'png' : 'jpg';
                call('/api/tt/upload', { method: 'POST', data: { data: f.data, ext } })
                  .then(v => resolve(BASE + v.url))
                  .catch(reject);
              },
              fail: e => reject(new Error((e && e.errMsg) || 'readFile failed'))
            });
          } catch (e) { reject(e); }
        };

        // 直传：tt.uploadFile 走 multipart，服务端解出文件后存盘
        if (typeof tt.uploadFile === 'function') {
          try {
            tt.uploadFile({
              url: BASE + '/api/tt/upload/file',
              filePath: p,
              name: 'file',
              header: token ? { Authorization: 'Bearer ' + token } : {},
              success(res) {
                let body = null;
                try { body = JSON.parse(res.data); } catch (e) { body = null; }
                if (res.statusCode >= 200 && res.statusCode < 300 && body && body.url) {
                  return resolve(BASE + body.url);
                }
                reject(Object.assign(new Error((body && body.error) || ('http ' + res.statusCode)), { status: res.statusCode }));
              },
              fail(e) { reject(Object.assign(new Error((e && e.errMsg) || 'uploadFile failed'), { status: 0 })); }
            });
          } catch (e) { reject(e); }
          return;
        }

        // 退回 base64：原图很容易超过服务端 5MB 的请求上限，先压一道
        if (typeof tt.compressImage === 'function') {
          tt.compressImage({
            src: p,
            quality: 60,
            success(c) { read((c && c.tempFilePath) || p); },
            fail() { read(p); }
          });
        } else {
          read(p);
        }
      },
      fail: reject
    });
  });
}

const finishSession = () => call('/api/tt/finish', { method: 'POST' });

/** 当前运行的项目 AppID（工具里如果还是 testappid，这里一眼能看出来）。 */
function runtimeAppId() {
  try {
    const info = tt.getAccountInfoSync && tt.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.appId) || '';
  } catch (e) { return ''; }
}

/** 撤销一组：本地队列里那条也一并删掉，不然下次补发又把它写回去。 */
function undo(exId, setNo) {
  const payload = { exId, setNo };
  writeOutbox(readOutbox().filter(p => !(p && p.exId === exId && p.setNo === setNo)));
  return call('/api/tt/undo', { method: 'POST', data: payload });
}

/** 当前账号（令牌有效时）。没有令牌就不用发请求。 */
const me = () => (token ? call('/api/me') : Promise.reject(Object.assign(new Error('no token'), { status: 0 })));

/**
 * 令牌可能过期，也可能这次启动时 tt.login 失败过（开发者工具模拟器里必然失败）。
 * 读接口遇到 401 就补一次登录再重试——真机上用户不需要知道这回事。
 */
function withAuth(fn) {
  return fn().catch(e => {
    if (!e || e.status !== 401) throw e;
    return login().then(() => fn());
  });
}

/** 「器械被占了」：同部位、换个能做的东西。exclude 是今天还要练的，别推荐重了。 */
const alternatives = (exId, exclude) => {
  const ex = Array.isArray(exclude) ? exclude.filter(Boolean).map(String) : [];
  const q = '/api/tt/alternatives?ex=' + encodeURIComponent(exId || '') + '&limit=6'
    + (ex.length ? '&exclude=' + encodeURIComponent(ex.join(',')) : '');
  return withAuth(() => call(q)).then(out => (out && out.items) || []);
};

/** 动作搜索：自由训练 / 加动作时找动作用。 */
const searchExercises = q => withAuth(() => call('/api/tt/exercises?q=' + encodeURIComponent(q || '')))
  .then(out => (out && out.items) || []);

/** 单个动作的详情：名字、器械、示范图。 */
const exerciseInfo = id => withAuth(() => call('/api/tt/exercise?id=' + encodeURIComponent(id || '') + '&inline=1'));

// 设置缓存：面板/详情需要在渲染前就知道"保持常亮""示范动画"，不能等网络
let settingsCache = null;
function cachedSettings() {
  if (settingsCache) return settingsCache;
  try { settingsCache = tt.getStorageSync('gym_settings') || null; } catch (e) { settingsCache = null; }
  return settingsCache;
}
function rememberSettings(s) {
  if (!s) return s;
  settingsCache = s;
  try { tt.setStorageSync('gym_settings', s); } catch (e) {}
  return s;
}
function loadSettings() {
  return call('/api/tt/settings').then(rememberSettings).catch(() => cachedSettings());
}

module.exports = { BASE, call, login, bind, sendSet, flush, finishSession, loggedIn, me, runtimeAppId, alternatives, exerciseInfo, undo, searchExercises, sendWarm, sendNote, setToWarm, pickAndUpload, cachedSettings, rememberSettings, loadSettings };
