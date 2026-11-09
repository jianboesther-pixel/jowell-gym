/* 首页：和网页 Home.jsx 逐块对齐 ——
 * 抬头（JOWELL + 名字 + 日期 + 齿轮）、
 * 今日（印章 + 动作数 + 开始；右边竖排「本周 N 次 / 连续 N 周」+ 最近训练）、
 * 周条（‹ 本周 › + 一..日 + 练过红点）、上周 / 总量。
 * 半屏（视频挂载）没有首页的意义：窗口矮就直接跳面板。
 */
const api = require('../../utils/api');

const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => iso(new Date());

Page({
  data: {
    loading: true,
    name: '',
    dateLine: '',
    stamp: '',
    exCount: 0,
    setCount: 0,
    hasPlan: false,
    inProgress: 0,
    doneToday: false,
    days: [],
    weekOffset: 0,
    weekLabel: '本周',
    doneThisWeek: 0,
    streak: 0,
    lastWorkout: null,
    lastVol: 0,
    recap: null,
    err: ''
  },

  onLoad() {
    const now = new Date();
    this.setData({ dateLine: now.getMonth() + 1 + '月' + now.getDate() + '日 周' + '日一二三四五六'[now.getDay()] });
    this.bounceHalfScreen();
    this.load();
  },
  onShow() { if (!this.data.loading) this.load(); },

  bounceHalfScreen() {
    try {
      const sys = tt.getSystemInfoSync() || {};
      const ratio = (sys.windowHeight || 0) / (sys.screenHeight || 1);
      if (ratio > 0 && ratio < 0.78) { tt.redirectTo({ url: '/pages/workout/index' }); return true; }
    } catch (e) {}
    return false;
  },

  load() {
    this.setData({ err: '' });
    const today = api.call('/api/tt/today?lang=zh').catch(() => null);
    const hist = api.call('/api/tt/history?limit=50').catch(() => null);
    const draft = api.call('/api/tt/draft').catch(() => null);
    const stats = api.call('/api/tt/stats?weeks=2&today=' + todayISO()).catch(() => null);

    api.me().then(u => this.setData({ name: (u && u.name) || '' })).catch(() => {});

    Promise.all([today, hist, draft, stats]).then(([t, h, d, st]) => {
      const r = t && t.training && t.routines && t.routines[0];
      const exs = (r && r.exercises) || [];
      const items = (h && h.items) || [];
      const last = items[0] || null;
      const inProgress = d && d.draft ? d.draft.exercises.reduce((n, e) => n + (e.sets || []).length, 0) : 0;
      this.history = items;
    const fromStats = (st && Array.isArray(st.doneDays)) ? st.doneDays : [];
    const fromHist = items.map(x => x.d);
    this.doneDays = [...new Set(fromStats.concat(fromHist))];
    console.log('[home] doneDays', JSON.stringify(this.doneDays));
      this.setData({
        loading: false,
        hasPlan: !!r,
        stamp: r ? String(r.name || '').split(' + ')[0] : '休',
        exCount: exs.length,
        setCount: exs.reduce((n, e) => n + (e.sets || 0), 0),
        inProgress,
        doneToday: !!(last && last.d === todayISO() && !inProgress),
        doneThisWeek: (st && st.thisWeek && st.thisWeek.count) || 0,
        streak: (st && st.streak) || 0,
        lastWorkout: last,
        lastVol: last ? Math.round((last.volume || 0)) : 0,
        recap: st && st.weeks && st.weeks[1]
          ? { sessions: st.weeks[1].count, volume: Math.round(st.weeks[1].volume) }
          : null,
        days: this.weekDays(this.doneDays, this.data.weekOffset),
        err: t ? '' : '计划没加载出来'
      });
    });
  },

  /** 周条：以「本周一」为基准，按偏移量取七天；练过的日子从历史里标红点。 */
  weekDays(doneDays, offset) {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + offset * 7, 12);
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const trained = new Set(doneDays || []);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12);
      const day = iso(d);
      out.push({
        label: labels[i],
        day: d.getDate(),
        done: trained.has(day),
        today: offset === 0 && day === todayISO()
      });
    }
    return out;
  },

  onPrevWeek() { this.shiftWeek(-1); },
  onNextWeek() { this.shiftWeek(1); },
  shiftWeek(delta) {
    const weekOffset = this.data.weekOffset + delta;
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + weekOffset * 7, 12);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12);
    const label = weekOffset === 0
      ? '本周'
      : (monday.getMonth() + 1) + '.' + monday.getDate() + ' – ' + (sunday.getMonth() + 1) + '.' + sunday.getDate();
    this.setData({
      weekOffset,
      weekLabel: label,
      days: this.weekDays(this.doneDays || [], weekOffset)
    });
  },

  onHero() {
    if (this.data.hasPlan) this.onStart();
    else tt.navigateTo({ url: '/pages/workout/index?free=1' });
  },
  onStart() { tt.navigateTo({ url: '/pages/workout/index' }); },
  onCheckin() { tt.navigateTo({ url: '/pages/checkin/index' }); },
  onPhotos() { tt.navigateTo({ url: '/pages/photos/index' }); },
  onMeasure() { tt.navigateTo({ url: '/pages/measure/index' }); },
  onSettings() { tt.navigateTo({ url: '/pages/settings/index' }); },
  onPlans() { tt.navigateTo({ url: '/pages/plans/index' }); },
  onFree() { tt.navigateTo({ url: '/pages/workout/index?free=1' }); },
  onLibrary() { tt.navigateTo({ url: '/pages/library/index' }); },
  onHistory() { tt.navigateTo({ url: '/pages/history/index' }); },
  onStats() { tt.navigateTo({ url: '/pages/stats/index' }); },
  onWeight() { tt.navigateTo({ url: '/pages/weight/index' }); },
  onNutrition() { tt.navigateTo({ url: '/pages/nutrition/index' }); }
});
