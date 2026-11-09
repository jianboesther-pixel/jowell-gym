/* 健身房签到卡：存一张会员码图片，到店全屏给前台扫。 */
const api = require('../../utils/api');

const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

Page({
  data: { loading: true, err: '', card: null, label: '', busy: false },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/card')
      .then(v => this.setData({
        loading: false,
        card: (v && v.card) || null,
        label: (v && v.card && v.card.label) || ''
      }))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  onLabel(e) { this.setData({ label: (e.detail && e.detail.value) || '' }); },

  onPick() {
    this.setData({ busy: true });
    api.pickAndUpload(['album', 'camera'])
      .then(url => {
        const file = url.split('/api/tt/media/')[1] || '';
        return api.call('/api/tt/card', { method: 'POST', data: { file, label: this.data.label } })
          .then(v => { this.setData({ busy: false, card: v.card }); toast('已保存卡片'); });
      })
      .catch(err => {
        this.setData({ busy: false });
        const msg = (err && (err.error || err.errMsg || err.message)) || '未知错误';
        toast('没上传成功：' + String(msg).slice(0, 30));
      });
  },

  onRemove() {
    tt.showModal({
      title: '删掉这张卡？',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/card', { method: 'POST', data: { clear: true } })
          .then(() => { this.setData({ card: null }); toast('已删除'); })
          .catch(() => toast('没删掉'));
      }
    });
  }
});
