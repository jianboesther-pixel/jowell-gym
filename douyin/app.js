const api = require('./utils/api');

// 印章用的毛笔字体：和网页同一份文件（子集 woff2）。加载失败就让字体栈回退到楷体。
function loadBrushFont() {
  try {
    if (!tt.loadFontFace) return;
    tt.loadFontFace({
      family: 'JoWell Brush',
      source: 'url("https://gym.jowellpet.xin/fonts/stamp-brush.woff2")',
      global: true,
      fail() {}
    });
  } catch (e) {}
}

App({
  globalData: {
    user: null,
    linked: false,
    planDirty: false,
    loginError: null,
    // 页面加载可能比登录快，所以这里留一个 promise 让人等，而不是让页面自己再登录一次
    // （每次 tt.login 都会给新 code，重复登录不会报错，只是白花一次往返）。
    loginPromise: null,
    settings: null
  },

  onLaunch() {
    loadBrushFont();
    this.globalData.loginPromise = api.login()
      .then(res => {
        // 设置只拉一次，面板和详情页共用（保持常亮、示范动画等）
        api.loadSettings().then(s => { this.globalData.settings = s; });
        return res;
      })
      .then(res => {
        this.globalData.user = res.user;
        this.globalData.linked = !!res.linked;
        return res;
      })
      .catch(e => {
        // 503 = 服务端还没配 AppID/AppSecret；0 = 网络。两种都安静地退回本地 demo。
        this.globalData.loginError = (e && e.data && e.data.error) || (e && e.message) || 'login-failed';
        return null;
      });
  }
});
