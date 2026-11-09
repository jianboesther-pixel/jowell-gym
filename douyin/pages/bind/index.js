const api = require('../../utils/api');

// 绑定失败的错误码 → 人话。服务端 401 只给一个 wrong，不带原因（不告诉攻击者"账号存在"）。
const SAY = {
  401: '名字或密码不对',
  403: '这个账号被停用了',
  400: '先把名字和密码填上'
};

Page({
  data: { name: '', password: '', err: '', busy: false },

  onName(e) { this.setData({ name: e.detail.value, err: '' }); },
  onPassword(e) { this.setData({ password: e.detail.value, err: '' }); },

  onSubmit() {
    if (this.data.busy) return;
    const name = (this.data.name || '').trim();
    const password = this.data.password || '';
    if (!name || !password) { this.setData({ err: '先把名字和密码填上' }); return; }

    this.setData({ busy: true, err: '' });
    api.bind(name, password)
      .then(res => {
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.user = res.user;
          app.globalData.linked = true;
          app.globalData.planDirty = true;   // 回到训练页时重新拉"今天练什么"
        }
        try { tt.showToast({ title: '已绑定', icon: 'success' }); } catch (e) { /* 忽略 */ }
        setTimeout(() => { tt.navigateBack({ delta: 1 }); }, 600);
      })
      .catch(e => {
        const code = e && e.status;
        this.setData({ busy: false, err: SAY[code] || '绑定失败，稍后再试' });
      });
  }
});
