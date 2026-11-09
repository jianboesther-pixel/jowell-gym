/* 历史：搜索 + 按周分组 + 展开看每组数据（对齐网页 History 的分组与详情）。 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

Page({
  data: {
    items: [],
    groups: [],
    q: '',
    open: '',
    err: '',
    count: 0,
    volume: 0
  },

  onLoad() { this.load(); },
  onShow() { if (this.data.items.length) this.load(); },

  load() {
    this.setData({ err: '' });
    api.call('/api/tt/history?limit=100')
      .then(out => {
        const items = (out && out.items) || [];
        this.all = items;
        this.apply();
      })
      .catch(e => this.setData({ err: (e && e.status) || '网络错误' }));
  },

  onInput(e) {
    this.setData({ q: (e.detail && e.detail.value) || '' });
    this.apply();
  },

  /** 过滤 + 按周分组（周一为一周开始）。 */
  apply() {
    const q = this.data.q.trim().toLowerCase();
    const items = (this.all || []).filter(w =>
      !q || String(w.name || '').toLowerCase().includes(q) || String(w.d || '').includes(q));

    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 12);
    const groups = [];
    for (const w of items) {
      const d = new Date(String(w.d) + 'T12:00:00');
      const diffWeeks = Math.floor((thisMonday - new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12)) / (7 * 86400000));
      const label = diffWeeks === 0 ? '本周' : diffWeeks === 1 ? '上周' : (d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate()) + ' 那周';
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(w);
      else groups.push({ label, items: [w] });
    }

    this.setData({
      items,
      groups,
      count: items.length,
      volume: Math.round(items.reduce((n, w) => n + (Number(w.volume) || 0), 0))
    });
  },

  onLog() { tt.navigateTo({ url: '/pages/log/index' }); },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.showModal({
      title: '删掉这场？',
      content: '只删小程序里的记录，删了就找不回来。',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/workout/delete', { method: 'POST', data: { id } })
          .then(() => {
            this.all = (this.all || []).filter(x => x.id !== id);
            this.apply();
            tt.showToast({ title: '已删除', icon: 'none' });
          })
          .catch(() => tt.showToast({ title: '没删掉', icon: 'none' }));
      }
    });
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ open: this.data.open === id ? '' : id });
  }
});
