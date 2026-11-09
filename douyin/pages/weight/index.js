/* 体重：顶部输入 + 概览（最新/7 天/30 天变化）+ 曲线 + 列表（可删）。 */
const api = require('../../utils/api');

const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

const pad = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

Page({
  data: {
    loading: true,
    err: '',
    items: [],
    bars: [],
    unit: 'kg',
    w: '',
    saving: false,
    savedMsg: '',
    latest: null,
    d7: null,
    d30: null,
    lo: 0,
    hi: 0,
    target: 0,
    goalInput: '',
    toGoal: null
  },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/weight')
      .then(out => {
        const items = (out && out.items) || [];
        this.setData({
          loading: false,
          unit: (out && out.unit) || 'kg',
          target: Number(out && out.target) || 0,
          goalInput: Number(out && out.target) ? String(out.target) : '',
          w: this.data.w || ((items[0] && String(items[0].w)) || '')
        });
        this.shape(items);
      })
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  /** 概览 + 曲线：最近 14 条按最小/最大值归一。 */
  shape(list) {
    const items = (list || []).slice();
    if (!items.length) {
      this.setData({ items: [], bars: [], latest: null, d7: null, d30: null });
      return;
    }
    const asc = items.slice().reverse();            // 旧 → 新
    const vals = asc.map(x => Number(x.w) || 0);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(0.1, hi - lo);
    const bars = asc.slice(-14).map(x => ({
      d: x.d.slice(5),
      w: x.w,
      h: Math.round(20 + ((Number(x.w) - lo) / span) * 80)
    }));

    const latest = asc[asc.length - 1];
    const at = days => {
      const target = new Date();
      target.setDate(target.getDate() - days);
      const iso = target.getFullYear() + '-' + pad(target.getMonth() + 1) + '-' + pad(target.getDate());
      const pick = asc.filter(x => x.d <= iso);
      return pick.length ? (Math.round((latest.w - pick[pick.length - 1].w) * 10) / 10) : null;
    };

    const target = Number(this.data.target) || 0;
    this.setData({
      items,
      bars,
      toGoal: target > 0 ? Math.round((latest.w - target) * 10) / 10 : null,
      latest,
      d7: at(7),
      d30: at(30),
      lo: Math.round(lo * 10) / 10,
      hi: Math.round(hi * 10) / 10
    });
  },

  onInput(e) { this.setData({ w: (e.detail && e.detail.value) || '' }); },

  onSave() {
    const w = Number(this.data.w);
    if (!Number.isFinite(w) || w <= 0) { toast('先填一个体重'); return; }
    this.setData({ saving: true, savedMsg: '' });
    api.call('/api/tt/weight', { method: 'POST', data: { w, d: todayISO() } })
      .then(() => {
        this.setData({ saving: false, savedMsg: '已记录 ' + w + ' ' + this.data.unit });
        this.load();
      })
      .catch(e => {
        this.setData({ saving: false });
        toast(e && e.status === 401 ? '未登录' : '没记上');
      });
  },

  onMeasure() { tt.navigateTo({ url: '/pages/measure/index' }); },
  onGoalInput(e) { this.setData({ goalInput: (e.detail && e.detail.value) || '' }); },
  onSaveGoal() {
    const target = Number(this.data.goalInput);
    api.call('/api/tt/weight/goal', { method: 'POST', data: { target } })
      .then(() => { toast(target > 0 ? '目标 ' + target + ' ' + this.data.unit : '已清掉目标'); this.load(); })
      .catch(() => toast('没保存上'));
  },

  onDelete(e) {
    const d = e.currentTarget.dataset.d;
    if (!d) return;
    tt.showModal({
      title: '删掉 ' + d + ' 的记录？',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/weight/delete', { method: 'POST', data: { d } })
          .then(() => { toast('已删除'); this.load(); })
          .catch(() => toast('没删掉'));
      }
    });
  }
});
