/* 计划管理：多套 plan + 周安排。数据 /api/tt/plan/edit。 */
const api = require('../../utils/api');

const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };
const todayDow = () => new Date().getDay();

Page({
  data: {
    loading: true,
    err: '',
    routines: [],
    week: {},
    days: [],
    // 周安排弹层
    dayOpen: false,
    dayIndex: 0,
    dayTitle: '',
    dayPick: [],
    // 编辑一套
    editOpen: false,
    editId: '',
    editName: '',
    editEx: [],
    editNote: '',
    rotIds: [],
    rotNames: [],
    rotIdx: 0,
    rotOn: false,
    // 加动作
    addOpen: false,
    addQ: '',
    addList: [],
    addLoading: false
  },

  onLoad() { this.load(); this.loadRotation(); },
  onShow() { if (!this.data.loading) this.load(); },

  loadRotation() {
    api.call('/api/tt/rotation')
      .then(v => this.setData({ rotIds: v.ids || [], rotNames: v.names || [], rotIdx: v.idx || 0, rotOn: !!v.on }))
      .catch(() => {});
  },

  /** 轮换：点一下把这套计划加进循环 / 移出循环。 */
  onRotPick(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const ids = this.data.rotIds.includes(id)
      ? this.data.rotIds.filter(x => x !== id)
      : this.data.rotIds.concat([id]);
    api.call('/api/tt/rotation', { method: 'POST', data: { ids } })
      .then(v => {
        this.setData({ rotIds: v.ids || [], rotNames: v.names || [], rotIdx: v.idx || 0, rotOn: !!v.on });
        toast(ids.length ? '轮换：' + (v.names || []).join(' → ') : '已关闭轮换');
      })
      .catch(() => toast('没设置成'));
  },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/plan/edit?weekday=' + todayDow())
      .then(v => this.apply(v))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
  },

  apply(v) {
    const week = v.week || {};
    const days = [];
    for (let d = 1; d <= 7; d++) {
      const dow = d % 7;                       // 周一..周日
      const ids = week[dow] || [];
      days.push({
        dow,
        label: DOW[dow],
        names: ids.map(id => (v.routines.find(r => r.id === id) || {}).name).filter(Boolean).join(' + '),
        ids
      });
    }
    this.setData({
      loading: false,
      routines: v.routines || [],
      week,
      days,
      err: ''
    });
  },

  /* ---------------- 周安排 ---------------- */
  onDay(e) {
    const dow = Number(e.currentTarget.dataset.dow);
    const day = this.data.days.find(d => d.dow === dow);
    const pick = this.data.routines.map(r => ({ id: r.id, name: r.name, on: !!(day && day.ids.includes(r.id)) }));
    this.setData({ dayOpen: true, dayIndex: dow, dayTitle: DOW[dow], dayPick: pick });
  },
  onPick(e) {
    const id = e.currentTarget.dataset.id;
    const dayPick = this.data.dayPick.map(p => (p.id === id ? { ...p, on: !p.on } : p));
    this.setData({ dayPick });
  },
  onDaySave() {
    const ids = this.data.dayPick.filter(p => p.on).map(p => p.id);
    const week = { ...this.data.week, [this.data.dayIndex]: ids };
    if (!ids.length) delete week[this.data.dayIndex];
    this.setData({ dayOpen: false });
    this.saveWeek(week);
  },
  onDayClose() { this.setData({ dayOpen: false }); },

  saveWeek(week) {
    api.call('/api/tt/plan/week', { method: 'POST', data: { week } })
      .then(v => { this.apply(v); toast('周安排已保存'); })
      .catch(() => toast('没保存上'));
  },

  /* ---------------- 编辑一套 ---------------- */
  /** 载入新手三套（推 / 拉 / 腿），并排到周一三五。 */
  onStarter() {
    tt.showModal({
      title: '载入新手计划？',
      content: '会追加「推 / 拉 / 腿」三套，并把周一、三、五排上。已有的计划不会删。',
      confirmText: '载入',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/plan/starter', { method: 'POST' })
          .then(() => { toast('已载入三套'); this.load(); })
          .catch(() => toast('没载入成'));
      }
    });
  },

  /** 复制一套计划（网页端也有）。 */
  onDup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    api.call('/api/tt/plan/routine/duplicate', { method: 'POST', data: { id } })
      .then(() => { toast('已复制一套'); this.load(); })
      .catch(() => toast('没复制成'));
  },

  /** 进阶规则：关 → 线性（达标就加重量）→ 双重（先加次数，次数满了再加重量）。 */
  onProg(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.editEx.map((x, k) => {
      if (k !== i) return x;
      const next = x.prog === 'linear' ? 'double' : x.prog === 'double' ? 'off' : 'linear';
      if (next === 'off') return { ...x, prog: 'off', inc: 0, target: 0, base: 0 };
      return { ...x, prog: next, inc: x.inc || 2.5, target: x.target || x.reps || 8, base: x.base || Math.min(8, x.target || x.reps || 8) };
    });
    this.setData({ editEx: list });
    const p = list[i].prog;
    toast(p === 'off' ? '不自动进阶' : p === 'linear' ? '线性：达标 +2.5kg' : '双重：先加次数再加重量');
  },

  /** 减载副本：重量 ×0.6、组数 −1。 */
  onDeload(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.showModal({
      title: '生成减载副本？',
      content: '会复制这套计划：重量 ×0.6、组数 −1，名字加「· 减载」。原计划不动。',
      confirmText: '生成',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/plan/deload', { method: 'POST', data: { id } })
          .then(() => { toast('已生成减载副本'); this.load(); })
          .catch(() => toast('没生成'));
      }
    });
  },

  /** 次数制 <-> 秒数制（平板支撑这类按秒记）。 */
  onMode(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.editEx.map((x, k) => (k === i ? { ...x, mode: x.mode === 'time' ? 'reps' : 'time' } : x));
    this.setData({ editEx: list });
    toast(list[i].mode === 'time' ? '改成按秒记' : '改成按次数记');
  },

  /** 双边 <-> 每边（哑铃单侧动作，容量按两倍算）。 */
  onPerSide(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.editEx.map((x, k) => (k === i ? { ...x, perSide: !x.perSide } : x));
    this.setData({ editEx: list });
    toast(list[i].perSide ? '每边各记' : '按总重量记');
  },

  /** 计划备注：一句话说明（列表和面板都会显示）。 */
  onNote(e) {
    this.setData({ editNote: (e.detail && e.detail.value) || '' });
  },

  /** 每组不同重量：按当前重量 +2.5 kg 递增铺开。 */
  onWeightLadder(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.editEx.map((x, k) => {
      if (k !== i) return x;
      if (x.weightList && x.weightList.length) return { ...x, weightList: null };
      const base = Number(x.weight) || 0;
      const weightList = [];
      for (let s2 = 0; s2 < x.sets; s2++) weightList.push(Math.round((base + s2 * 2.5) * 10) / 10);
      return { ...x, weightList };
    });
    this.setData({ editEx: list });
    const row = list[i] || {};
    toast(row.weightList ? '重量递增：' + row.weightList.join(' / ') : '改回固定重量');
  },

  /** 金字塔组：每组次数不同（默认 12-10-8，按组数铺开）。 */
  onPyramid(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.editEx.map((x, k) => {
      if (k !== i) return x;
      if (x.repsList && x.repsList.length) return { ...x, repsList: null };
      const base = [12, 10, 8, 6];
      const repsList = [];
      for (let s = 0; s < x.sets; s++) repsList.push(base[Math.min(s, base.length - 1)]);
      return { ...x, repsList };
    });
    this.setData({ editEx: list });
    toast(list[i] && list[i].repsList ? '金字塔：' + list[i].repsList.join('-') : '改回固定次数');
  },

  /** 计划里把这一行和下一行设成 / 拆掉超集。 */
  onSupersetRow(e) {
    const index = Number(e.currentTarget.dataset.i);
    const id = this.data.editId;
    if (!id) { toast('先保存这套计划'); return; }
    api.call('/api/tt/plan/routine/superset', { method: 'POST', data: { id, index } })
      .then(v => {
        const r = v && v.routine;
        if (r && Array.isArray(r.ex)) {
          this.setData({ editEx: r.ex.map(x => ({ ...x })) });
        }
        toast('已更新超集');
      })
      .catch(() => toast('没改成功'));
  },

  /** 计划里动作上移 / 下移。 */
  onMove(e) {
    const { id, index, delta } = e.currentTarget.dataset;
    api.call('/api/tt/plan/routine/move', { method: 'POST', data: { id, index: Number(index), delta: Number(delta) } })
      .then(v => {
        const r = v && v.routine;
        if (r && Array.isArray(r.exercises)) {
          this.setData({ editEx: r.exercises.map(x => ({ ...x })) });
        }
      })
      .catch(() => toast('没移动'));
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const r = this.data.routines.find(x => x.id === id);
    if (!r) return;
    this.setData({
      editOpen: true, editId: r.id, editName: r.name,
      editEx: r.ex.map(x => ({ ...x }))
    });
  },
  onNew() {
    this.setData({ editOpen: true, editId: '', editName: '', editEx: [] });
  },
  onName(e) { this.setData({ editName: (e && e.detail && e.detail.value) || '' }); },
  onSets(e) {
    const i = Number(e.currentTarget.dataset.i);
    const d = Number(e.currentTarget.dataset.d);
    const editEx = this.data.editEx.map((x, k) => (k === i ? { ...x, sets: Math.max(1, Math.min(20, x.sets + d)) } : x));
    this.setData({ editEx });
  },
  onReps(e) {
    const i = Number(e.currentTarget.dataset.i);
    const d = Number(e.currentTarget.dataset.d);
    const editEx = this.data.editEx.map((x, k) => (k === i ? { ...x, reps: Math.max(1, Math.min(100, x.reps + d)) } : x));
    this.setData({ editEx });
  },
  onRemoveEx(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ editEx: this.data.editEx.filter((_, k) => k !== i) });
  },
  onSaveRoutine() {
    const name = (this.data.editName || '').trim();
    if (!name) { toast('先起个名字'); return; }
    api.call('/api/tt/plan/routine', {
      method: 'POST',
      data: { id: this.data.editId || undefined, name, note: this.data.editNote || '', ex: this.data.editEx }
    })
      .then(v => { this.apply(v); this.setData({ editOpen: false }); toast('已保存'); })
      .catch(() => toast('没保存上'));
  },
  onEditClose() { this.setData({ editOpen: false }); },
  onDelete() {
    if (!this.data.editId) { this.setData({ editOpen: false }); return; }
    tt.showModal({
      title: '删掉这套？',
      content: '只会删计划，训练记录不受影响。',
      success: res => {
        if (!res.confirm) return;
        api.call('/api/tt/plan/routine/delete', { method: 'POST', data: { id: this.data.editId } })
          .then(v => { this.apply(v); this.setData({ editOpen: false }); toast('已删除'); })
          .catch(() => toast('没删掉'));
      }
    });
  },

  /* ---------------- 加动作 ---------------- */
  onAddOpen() { this.setData({ addOpen: true, addQ: '', addList: [] }); },
  onAddClose() { this.setData({ addOpen: false }); },
  onAddInput(e) {
    const q = (e && e.detail && e.detail.value) || '';
    this.setData({ addQ: q });
    if (this.timer) clearTimeout(this.timer);
    if (!q.trim()) { this.setData({ addList: [] }); return; }
    this.timer = setTimeout(() => {
      this.setData({ addLoading: true });
      api.call('/api/tt/library?limit=20&q=' + encodeURIComponent(q))
        .then(v => this.setData({ addLoading: false, addList: v.items || [] }))
        .catch(() => this.setData({ addLoading: false }));
    }, 260);
  },
  onAddPick(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (!id) return;
    if (this.data.editEx.some(x => x.id === id)) { toast('已经在里面了'); return; }
    this.setData({
      addOpen: false,
      editEx: this.data.editEx.concat([{ id, name, sets: 3, reps: 8 }])
    });
  },

  noop() {}
});
