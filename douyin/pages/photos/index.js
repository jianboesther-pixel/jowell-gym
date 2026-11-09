/* 进度照片：一天可以多张，带一句备注；列表按日期倒序。 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

Page({
  data: { loading: true, err: '', items: [], note: '', busy: false },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/photos')
      .then(v => this.setData({ loading: false, items: (v && v.items) || [] }))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  onNote(e) { this.setData({ note: (e.detail && e.detail.value) || '' }); },

  onAdd() {
    this.setData({ busy: true });
    api.pickAndUpload(['album', 'camera'])
      .then(url => {
        const file = url.split('/api/tt/media/')[1] || '';
        return api.call('/api/tt/photos', {
          method: 'POST',
          data: { file, d: todayISO(), note: this.data.note }
        }).then(() => {
          this.setData({ busy: false, note: '' });
          toast('已添加');
          this.load();
        });
      })
      .catch(err => {
        this.setData({ busy: false });
        const msg = (err && (err.error || err.errMsg || err.message)) || '未知错误';
        toast('没上传成功：' + String(msg).slice(0, 30));
        try { console.log('[photo] fail', JSON.stringify(err && (err.data || err.message || err))); } catch (e) {}
      });
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (url) tt.previewImage({ urls: [url], current: url });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.showModal({
      title: '删掉这张照片？',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/photos/delete', { method: 'POST', data: { id } })
          .then(() => { toast('已删除'); this.load(); })
          .catch(() => toast('没删掉'));
      }
    });
  }
});
