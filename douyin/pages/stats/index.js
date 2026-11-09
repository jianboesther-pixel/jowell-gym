/* 统计：本周、连续周、最近 12 周柱状图、总计。数据都在 /api/tt/stats。 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

Page({
  data: {
    loading: true,
    err: '',
    thisWeek: { count: 0, volume: 0 },
    streak: 0,
    totals: { sessions: 0, volume: 0 },
    bars: [],
    rangeWeeks: 12,
    weekRanges: [{ label: '4 周', n: 4 }, { label: '12 周', n: 12 }, { label: '一年', n: 52 }],
    weekly: [],
    progressList: [],
    progId: '',
    progName: '',
    progRows: [],
    muscles: [],
    structure: [],
    fatigue: [],
    effort: null,
    recent: [],
    weights: [],
    wmin: 0,
    wmax: 0,
    grid: [],
    strength: [],
    maxMuscleSets: 1,
    weeks: 12
  },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/weight')
      .then(w => this.setWeights((w && w.items) || []))
      .catch(() => {});
    api.call('/api/tt/history?limit=5')
      .then(h => this.setData({ recent: (h && h.items) || [] }))
      .catch(() => {});
    api.call('/api/tt/stats?weeks=' + this.data.rangeWeeks + '&today=' + todayISO())
      .then(v => {
        const peak = Math.max(1, v.peak || 0);
        const bars = (v.weeks || []).slice().reverse().map(w => ({
          from: w.from,
          label: w.from.slice(5, 7) + '/' + w.from.slice(8, 10),
          count: w.count,
          volume: w.volume,
          h: Math.round(Math.max(3, (w.volume / peak) * 100))
        }));
        console.log('[stats] loaded weeks', (v.weeks || []).length, 'weekly', (v.weeklyMuscles || []).length);
        const muscles = (v.muscles || []).map(m => ({ ...m, pct: 0 }));
        const maxMuscleSets = Math.max(1, ...muscles.map(m => m.sets));
        muscles.forEach(m => { m.pct = Math.round((m.sets / maxMuscleSets) * 100); });
        this.setGrid(v.doneDays || [], this.data.rangeWeeks);
        this.setData({
          loading: false,
          muscles,
          structure: (v.structure && v.structure.rows) || [],
          fatigue: v.fatigue || [],
          effort: v.effort || null,
          maxMuscleSets,
          strength: v.strength || [],
          weekly: this.withShares(v.weeklyMuscles || []),
          progressList: v.progressList || [],
          doneDays: v.doneDays || [],
          thisWeek: v.thisWeek || { count: 0, volume: 0 },
          streak: v.streak || 0,
          totals: v.totals || { sessions: 0, volume: 0 },
          bars
        });
      })
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  /** 每周肌群容量：每根横条按肌群切成段（深→浅），只画前 4 段。 */
  withShares(weeks) {
    return (weeks || []).map(w => {
      const rows = (w.rows || []).slice(0, 4);
      const total = Math.max(1, w.total || 0);
      const segs = rows.map((r, i) => ({
        zh: r.zh,
        sets: r.sets,
        pct: Math.round((r.sets / total) * 100),
        tone: i
      }));
      return { from: w.from, label: w.from.slice(5), total: w.total, segs };
    });
  },

  onRange(e) {
    const n = Number(e.currentTarget.dataset.n) || 12;
    console.log('[stats] range ->', n);
    this.setData({ rangeWeeks: n }, () => this.load());
  },

  onPickProgress(e) {
    const i = Number(e.detail.value);
    const it = this.data.progressList[i];
    if (!it) return;
    this.setData({ progId: it.id, progName: it.name });
    api.call('/api/tt/stats/progress?id=' + encodeURIComponent(it.id))
      .then(v => this.setData({ progRows: this.shapeProgress(v.rows || []) }))
      .catch(() => {});
  },
  shapeProgress(rows) {
    if (!rows.length) return [];
    const vals = rows.map(r => r.e1rm);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(1, max - min);
    return rows.map(r => ({ d: r.d.slice(5), e1rm: r.e1rm, h: Math.round(20 + ((r.e1rm - min) / span) * 80) }));
  },

  /** 体重曲线：取最近 12 条，按最小/最大值归一成柱高。 */
  setWeights(items) {
    const list = (items || []).slice(0, 12).reverse();
    if (!list.length) { this.setData({ weights: [] }); return; }
    const vals = list.map(x => Number(x.w) || 0);
    const wmin = Math.min(...vals);
    const wmax = Math.max(...vals);
    const span = Math.max(1, wmax - wmin);
    this.setData({
      weights: list.map(x => ({ d: x.d, w: x.w, h: Math.round(20 + ((Number(x.w) - wmin) / span) * 80) })),
      wmin, wmax
    });
  },

  /** 12 周活动：每列一周，每行一天，练过的点涂黑。 */
  setGrid(doneDays, weeks) {
    const set = new Set(doneDays || []);
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 12);
    const cols = [];
    const cols0 = Math.max(4, Math.min(52, Number(weeks) || 12));
    for (let w = cols0 - 1; w >= 0; w--) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - w * 7 + d, 12);
        const iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
        col.push({ iso, on: set.has(iso), future: day > now });
      }
      cols.push({ w: cols0 - w, cells: col });
    }
    this.setData({ grid: cols });
  },

  onWeightPage() { tt.navigateTo({ url: '/pages/weight/index' }); },
  onMeasurePage() { tt.navigateTo({ url: '/pages/measure/index' }); },
  onNutritionPage() { tt.navigateTo({ url: '/pages/nutrition/index' }); },

  onHistory() { tt.navigateTo({ url: '/pages/history/index' }); },

  onBack() { tt.navigateBack({ delta: 1 }); }
});
