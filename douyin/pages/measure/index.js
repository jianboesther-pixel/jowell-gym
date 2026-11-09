/* 体测数据：围度 / 体脂，每天一条，和网页端同一份 measurements 字段。 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

Page({
  data: {
    loading: true,
    err: '',
    d: todayISO(),
    groups: [],
    openGroup: '躯干',
    values: {},
    deltas: {},
    history: [],
    latest: null,
    saving: false
  },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/measurements')
      .then(v => this.apply(v))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  apply(v) {
    const fields = (v && v.fields) || [];
    const groups = [];
    for (const f of fields) {
      const g = groups.find(x => x.name === f.group);
      if (g) g.fields.push(f);
      else groups.push({ name: f.group, fields: [f] });
    }
    // 编辑今天这一条时，把已有值填回去
    const today = ((v && v.history) || []).find(x => x.d === this.data.d);
    this.setData({
      loading: false,
      groups,
      deltas: (v && v.deltas) || {},
      history: (v && v.history) || [],
      latest: (v && v.latest) || null,
      values: today ? { ...today.values } : (this.data.values || {})
    });
  },

  onGroup(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ openGroup: this.data.openGroup === name ? '' : name });
  },
  onVal(e) {
    const k = e.currentTarget.dataset.k;
    const raw = (e.detail && e.detail.value) || '';
    const values = { ...this.data.values };
    if (raw === '') delete values[k]; else values[k] = raw;
    this.setData({ values });
  },

  onSave() {
    const values = {};
    for (const [k, v] of Object.entries(this.data.values)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) values[k] = n;
    }
    if (!Object.keys(values).length) { toast('先填至少一项'); return; }
    this.setData({ saving: true });
    api.call('/api/tt/measurements', { method: 'POST', data: { d: this.data.d, values } })
      .then(v => { this.setData({ saving: false }); this.apply(v); toast('已保存'); })
      .catch(() => { this.setData({ saving: false }); toast('没保存上'); });
  },

  onDelete(e) {
    const d = e.currentTarget.dataset.d;
    if (!d) return;
    tt.showModal({
      title: '删掉 ' + d + ' 的记录？',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/measurements/delete', { method: 'POST', data: { d } })
          .then(v => { this.apply(v); toast('已删除'); })
          .catch(() => toast('没删掉'));
      }
    });
  }
});
