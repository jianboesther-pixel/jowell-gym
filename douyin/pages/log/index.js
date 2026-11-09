/* 补录：昨天/上周忘了记的那一场。数据 POST /api/tt/log。 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

Page({
  data: {
    d: todayISO(),
    name: '',
    ex: [],
    saving: false,
    // 搜动作
    addOpen: false,
    q: '',
    list: [],
    loading: false
  },

  onDate(e) { this.setData({ d: e.detail.value }); },
  onName(e) { this.setData({ name: (e.detail && e.detail.value) || '' }); },

  onAddOpen() { this.setData({ addOpen: true, q: '', list: [] }); },
  onAddClose() { this.setData({ addOpen: false }); },
  onInput(e) {
    const q = (e.detail && e.detail.value) || '';
    this.setData({ q });
    if (this.timer) clearTimeout(this.timer);
    if (!q.trim()) { this.setData({ list: [] }); return; }
    this.timer = setTimeout(() => {
      this.setData({ loading: true });
      api.call('/api/tt/library?limit=20&q=' + encodeURIComponent(q))
        .then(v => this.setData({ loading: false, list: v.items || [] }))
        .catch(() => this.setData({ loading: false }));
    }, 260);
  },
  onPick(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (!id) return;
    if (this.data.ex.some(x => x.id === id)) { toast('已经在里面了'); return; }
    this.setData({
      addOpen: false,
      ex: this.data.ex.concat([{ id, name, sets: 3, reps: 8, weight: 0 }])
    });
  },
  onStep(e) {
    const i = Number(e.currentTarget.dataset.i);
    const f = e.currentTarget.dataset.f;
    const d = Number(e.currentTarget.dataset.d);
    const ex = this.data.ex.map((x, k) => {
      if (k !== i) return x;
      if (f === 'sets') return { ...x, sets: Math.max(1, Math.min(20, x.sets + d)) };
      if (f === 'reps') return { ...x, reps: Math.max(1, Math.min(100, x.reps + d)) };
      return { ...x, weight: Math.max(0, Math.min(500, x.weight + d)) };
    });
    this.setData({ ex });
  },
  onRemove(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ ex: this.data.ex.filter((_, k) => k !== i) });
  },

  onSave() {
    if (!this.data.ex.length) { toast('先加一个动作'); return; }
    this.setData({ saving: true });
    api.call('/api/tt/log', {
      method: 'POST',
      data: { d: this.data.d, name: this.data.name || '补录训练', ex: this.data.ex }
    })
      .then(() => {
        toast('已补录');
        this.setData({ saving: false, ex: [], name: '' });
        setTimeout(() => tt.navigateBack({ delta: 1 }), 600);
      })
      .catch(e => { this.setData({ saving: false }); toast(e && e.status === 401 ? '未登录' : '没记上'); });
  },

  noop() {}
});
