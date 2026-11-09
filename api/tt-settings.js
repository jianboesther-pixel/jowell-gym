/* 设置：单位（kg/lb）+ 默认休息时长。
 *
 * 换单位要**换算数字**，不是只换标签——网页端也是这么做的（frontend/src/lib/units.js）：
 * kg→lb 取到 0.5，lb→kg 取到 0.25，体重取到 0.1，否则来回切换会越滚越偏。
 * 纯函数，返回新的 state，方便测试。
 */
const LB_PER_KG = 2.2046226218;

export const convertWeight = (v, from, to) => {
  if (v == null || v === '') return v;
  const n = Number(v);
  if (!Number.isFinite(n) || from === to) return v;
  return to === 'lb' ? Math.round(n * LB_PER_KG * 2) / 2 : Math.round((n / LB_PER_KG) * 4) / 4;
};

export const convertBody = (v, from, to) => {
  if (v == null || v === '') return v;
  const n = Number(v);
  if (!Number.isFinite(n) || from === to) return v;
  return Math.round((to === 'lb' ? n * LB_PER_KG : n / LB_PER_KG) * 10) / 10;
};

const clampRest = v => Math.max(0, Math.min(600, Math.round(Number(v) || 0)));

/** 设置页要展示的东西。 */
export function settingsView(state) {
  const s = state || {};
  return {
    unit: s.unit === 'lb' ? 'lb' : 'kg',
    restSec: Number.isFinite(s.restSec) ? s.restSec : 90,
    restPauseSec: Number.isFinite(s.restPauseSec) ? s.restPauseSec : 15,
    keepAwake: s.keepAwake !== false,
    animations: s.animations !== false,
    wdec: Number.isFinite(s.wdec) ? s.wdec : 0,
    weekStart: s.weekStart === 1 ? 1 : 0,
    effort: s.effort === true,
    sound: s.sound !== false,
    vibrate: s.vibrate !== false,
    collapseDone: s.collapseDone === true
  };
}

/** 把补丁应用到 state，返回新对象（不改原对象）。 */
export function applySettings(state, patch) {
  const next = { ...(state || {}) };
  const p = patch || {};
  const from = next.unit === 'lb' ? 'lb' : 'kg';

  if (p.unit === 'kg' || p.unit === 'lb') {
    if (p.unit !== from) {
      const to = p.unit;
      const cw = v => (v ? convertWeight(v, from, to) : v);
      // 训练记录
      next.workouts = (Array.isArray(next.workouts) ? next.workouts : []).map(w => {
        if (!w || !Array.isArray(w.entries)) return w;
        return {
          ...w,
          entries: w.entries.map(e => ({
            ...e,
            ...(e.topW != null ? { topW: cw(e.topW) } : {}),
            sets: (Array.isArray(e.sets) ? e.sets : []).map(s => (s && s.w ? { ...s, w: cw(s.w) } : s))
          }))
        };
      });
      // 进行中的训练
      if (next.active && Array.isArray(next.active.entries)) {
        next.active = {
          ...next.active,
          entries: next.active.entries.map(e => ({
            ...e,
            sets: (Array.isArray(e.sets) ? e.sets : []).map(s => (s && s.w ? { ...s, w: cw(s.w) } : s))
          }))
        };
      }
      // 计划里的目标重量
      next.routines = (Array.isArray(next.routines) ? next.routines : []).map(r => {
        if (!r || !Array.isArray(r.ex)) return r;
        return { ...r, ex: r.ex.map(e => (e && e.weight ? { ...e, weight: cw(e.weight) } : e)) };
      });
      // 体重
      next.bodyweight = (Array.isArray(next.bodyweight) ? next.bodyweight : [])
        .map(x => (x && Number.isFinite(Number(x.w)) ? { ...x, w: convertBody(x.w, from, to) } : x));
      if (next.targetW) next.targetW = convertBody(next.targetW, from, to);
      next.unit = to;
    } else {
      next.unit = from;
    }
  }

  if (p.restSec != null) next.restSec = clampRest(p.restSec);
  if (p.restPauseSec != null) next.restPauseSec = clampRest(p.restPauseSec);
  if (p.keepAwake != null) next.keepAwake = p.keepAwake !== false;
  if (p.animations != null) next.animations = p.animations !== false;
  if (p.wdec != null) next.wdec = Math.max(0, Math.min(2, Math.round(Number(p.wdec) || 0)));
  if (p.weekStart != null) next.weekStart = Number(p.weekStart) === 1 ? 1 : 0;
  if (p.effort != null) next.effort = p.effort === true;
  if (p.sound != null) next.sound = p.sound !== false;
  if (p.vibrate != null) next.vibrate = p.vibrate !== false;
  if (p.collapseDone != null) next.collapseDone = p.collapseDone === true;
  return next;
}
