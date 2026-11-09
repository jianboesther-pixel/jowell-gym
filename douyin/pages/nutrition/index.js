/* 饮食：今天吃了几卡、多少蛋白质 + 目标。数据 /api/tt/nutrition。 */
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
    today: { d: todayISO(), kcal: 0, protein: 0 },
    goal: null,
    days: [],
    kcal: '',
    protein: '',
    goalKcal: '',
    goalProtein: '',
    saving: false,
    pctKcal: 0,
    pctProtein: 0,
    avgKcal: 0,
    avgProtein: 0,
    bars: [],
    maxKcal: 1
  },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/nutrition?today=' + todayISO() + '&days=7')
      .then(v => this.setData({
        loading: false,
        today: v.today,
        goal: v.goal,
        days: (v.days || []).slice(1),          // 今天在上面单独编辑
        pctKcal: v.goal && v.goal.kcal ? Math.min(100, Math.round((v.today.kcal / v.goal.kcal) * 100)) : 0,
        pctProtein: v.goal && v.goal.protein ? Math.min(100, Math.round((v.today.protein / v.goal.protein) * 100)) : 0,
        ...this.weekly(v.days || []),
        kcal: v.today.kcal ? String(v.today.kcal) : '',
        protein: v.today.protein ? String(v.today.protein) : '',
        goalKcal: v.goal && v.goal.kcal ? String(v.goal.kcal) : '',
        goalProtein: v.goal && v.goal.protein ? String(v.goal.protein) : ''
      }))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  onKcal(e) { this.setData({ kcal: (e.detail && e.detail.value) || '' }); },
  onProtein(e) { this.setData({ protein: (e.detail && e.detail.value) || '' }); },
  onGoalKcal(e) { this.setData({ goalKcal: (e.detail && e.detail.value) || '' }); },
  onGoalProtein(e) { this.setData({ goalProtein: (e.detail && e.detail.value) || '' }); },

  onSave() {
    const d = todayISO();
    this.setData({ saving: true });
    api.call('/api/tt/nutrition', {
      method: 'POST',
      data: { d, kcal: Number(this.data.kcal) || 0, protein: Number(this.data.protein) || 0 }
    })
      .then(v => {
        this.setData({ saving: false, today: v.today, days: (v.days || []).slice(1), goal: v.goal });
        toast('今天的饮食已记');
      })
      .catch(e => { this.setData({ saving: false }); toast(e && e.status === 401 ? '未登录' : '没记上'); });
  },

  onSaveGoal() {
    this.setData({ saving: true });
    api.call('/api/tt/nutrition/goal', {
      method: 'POST',
      data: { kcal: Number(this.data.goalKcal) || 0, protein: Number(this.data.goalProtein) || 0 }
    })
      .then(v => { this.setData({ saving: false, goal: v.goal }); toast('目标已更新'); })
      .catch(() => { this.setData({ saving: false }); toast('没保存上'); });
  }
});
