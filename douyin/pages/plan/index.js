const api = require('../../utils/api');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

Page({
  data: { items: [], q: '', results: [], searching: false, busy: false },

  onLoad() {
    this.load();
  },

  load() {
    return api.call('/api/tt/today?lang=zh').then(v => {
      const r = v && v.training && v.routines[0];
      const items = (r ? r.exercises : []).map(e => ({ id: e.id, name: e.name, sets: e.sets, reps: e.reps }));
      this.setData({ items });
    }).catch(() => this.setData({ items: [] }));
  },

  onOpenSearch() {
    this.setData({ searching: true, results: [], q: '' });
  },
  onQ(e) {
    this.setData({ q: e.detail.value });
  },
  onSearch() {
    const q = (this.data.q || '').trim();
    if (!q) return;
    api.call('/api/tt/exercises?q=' + encodeURIComponent(q))
      .then(o => this.setData({ results: (o && o.items) || [] }))
      .catch(() => this.setData({ results: [] }));
  },
  onAdd(e) {
    const r = this.data.results[e.currentTarget.dataset.i];
    if (!r) return;
    const items = this.data.items.concat([{ id: r.id, name: r.name, sets: 3, reps: 8 }]);
    this.setData({ items, results: [], q: '', searching: false });
    try { tt.showToast({ title: '已加入 · 记得保存', icon: 'none', duration: 900 }); } catch (err) { /* 忽略 */ }
  },

  onDel(e) {
    const i = Number(e.currentTarget.dataset.i);
    const items = this.data.items.slice();
    items.splice(i, 1);
    this.setData({ items });
  },
  onSets(e) {
    const i = Number(e.currentTarget.dataset.i);
    const d = Number(e.currentTarget.dataset.d);
    const items = this.data.items.slice();
    const it = items[i];
    if (!it) return;
    items[i] = { id: it.id, name: it.name, sets: clamp(it.sets + d, 1, 20), reps: it.reps };
    this.setData({ items });
  },
  onReps(e) {
    const i = Number(e.currentTarget.dataset.i);
    const d = Number(e.currentTarget.dataset.d);
    const items = this.data.items.slice();
    const it = items[i];
    if (!it) return;
    items[i] = { id: it.id, name: it.name, sets: it.sets, reps: clamp(it.reps + d, 1, 100) };
    this.setData({ items });
  },

  onTemplate(e) {
    const key = e.currentTarget.dataset.k;
    api.call('/api/tt/plan/template', { method: 'POST', data: { template: key } })
      .then(() => this.load().then(() => toast('模板已套用')))
      .catch(() => toast('套用失败，稍后再试'));
  },

  onSave() {
    if (this.data.busy) return;
    if (!this.data.items.length) { toast('至少加一个动作'); return; }
    this.setData({ busy: true });
    const exercises = this.data.items.map(it => ({ id: it.id, sets: it.sets, reps: it.reps }));
    api.call('/api/tt/plan/day', { method: 'POST', data: { exercises } })
      .then(() => {
        const app = getApp();
        if (app && app.globalData) app.globalData.planDirty = true;
        toast('已保存');
        setTimeout(() => tt.navigateBack({ delta: 1 }), 600);
      })
      .catch(() => { this.setData({ busy: false }); toast('保存失败'); });
  }
});

function toast(title) {
  try { tt.showToast({ title, icon: 'none', duration: 900 }); } catch (e) { /* 忽略 */ }
}
