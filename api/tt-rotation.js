/* 计划轮换：把几套计划排成一个循环（A → B → C → A …）。
 * state 字段：ttRotation = { ids: ['r1','r2'], idx: 0 }
 * 练完一场就前进一格；周安排里有今天时以周安排为准。
 */
const MAX = 12;

/** 轮换视图：参与的计划、当前是第几套、下一套是什么。 */
export function rotationView(state) {
  const s = state || {};
  const routines = Array.isArray(s.routines) ? s.routines : [];
  const rot = s.ttRotation && typeof s.ttRotation === 'object' ? s.ttRotation : {};
  const ids = (Array.isArray(rot.ids) ? rot.ids : []).filter(id => routines.some(r => r && r.id === id)).slice(0, MAX);
  const idx = ids.length ? Math.max(0, Math.min(ids.length - 1, Math.round(Number(rot.idx) || 0))) : 0;
  const current = ids.length ? routines.find(r => r && r.id === ids[idx]) || null : null;
  return {
    ids,
    idx,
    on: ids.length > 1,
    currentId: current ? current.id : '',
    currentName: current ? current.name : '',
    names: ids.map(id => (routines.find(r => r && r.id === id) || {}).name || id)
  };
}

/** 设置参与轮换的计划（按传入顺序）。 */
export function setRotation(state, ids) {
  const next = { ...(state || {}) };
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, MAX);
  next.ttRotation = { ids: list, idx: 0 };
  return next;
}

/** 清掉轮换。 */
export function clearRotation(state) {
  const next = { ...(state || {}) };
  delete next.ttRotation;
  return next;
}

/** 练完一场前进一格（只有开启轮换时有效）。 */
export function advanceRotation(state) {
  const next = { ...(state || {}) };
  const v = rotationView(next);
  if (!v.on) return next;
  next.ttRotation = { ids: v.ids, idx: (v.idx + 1) % v.ids.length };
  return next;
}

/** 今天该练哪套：周安排优先，其次是轮换指针。 */
export function rotationPick(state, weekday) {
  const s = state || {};
  const week = s.week && typeof s.week === 'object' ? s.week : {};
  const todayIds = [].concat(week[weekday] || []);
  if (todayIds.length) return { ids: todayIds, from: 'week' };
  const v = rotationView(s);
  if (!v.on) return { ids: [], from: 'none' };
  return { ids: [v.currentId], from: 'rotation' };
}
