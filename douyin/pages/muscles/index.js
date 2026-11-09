/* 按肌肉：19 个肌群 + 各自动作数；选一个，下面列出该肌群的动作。 */
const api = require('../../utils/api');

Page({
  data: { muscles: [], tg: '', tgZh: '', items: [], total: 0, loading: false },

  onLoad() {
    api.call('/api/tt/library/muscles')
      .then(m => this.setData({ muscles: m.muscles || [] }))
      .catch(() => {});
  },

  onPick(e) {
    const d = e.currentTarget.dataset;
    this.setData({ tg: d.k, tgZh: d.zh, loading: true });
    api.call('/api/tt/library?limit=50&tg=' + encodeURIComponent(d.k || ''))
      .then(v => this.setData({ items: v.items || [], total: v.total || 0, loading: false }))
      .catch(() => this.setData({ loading: false }));
  }
});
