/* 计划管理（小程序）：多套 routine + 周安排。
 *
 * 网页端的计划编辑器功能很多（超集、金字塔、递减组、备注…），这里只保留
 * 小程序真正会改的：动作、组数、次数、重量；外加"哪天练哪套"。
 * 纯函数，返回新的 state，便于测试。
 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';

const KNOWN = new Set(EXERCISES.map(e => e.id));
const NAMES = new Map(EXERCISES.map(e => [e.id, e.n]));
const MAX_EX = 20;
const MAX_PER_DAY = 3;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

const nameOf = id => NAMES_ZH[id] || NAMES.get(id) || id;

/** 编辑器要的形状：每套计划 + 周安排（统一成数组）+ 今天周几。 */
export function planView(state, { weekday } = {}) {
  const s = state || {};
  const routines = (Array.isArray(s.routines) ? s.routines : []).map(r => ({
    id: String(r.id || ''),
    name: String(r.name || '训练'),
    note: String(r.note || ''),
    ex: (Array.isArray(r.ex) ? r.ex : []).map(e => ({
      id: String(e.id || ''),
      name: nameOf(e.id),
      sets: Math.max(1, Math.round(num(e.sets) || 3)),
      reps: Math.max(1, Math.round(num(e.reps) || 8)),
      weight: num(e.weight),
      group: e.group ? String(e.group) : null,
      repsList: Array.isArray(e.repsList) ? e.repsList.slice(0, 20) : null,
      mode: e.mode === 'time' ? 'time' : 'reps',
      prog: e.prog === 'linear' || e.prog === 'double' ? e.prog : 'off',
      inc: num(e.inc) || 0,
      target: num(e.target) || 0,
      base: num(e.base) || 0,
      perSide: e.perSide === true,
      weightList: Array.isArray(e.weightList) ? e.weightList.slice(0, 20) : null
    }))
  }));
  const week = {};
  const raw = s.week && typeof s.week === 'object' ? s.week : {};
  for (let d = 0; d < 7; d++) {
    const ids = [].concat(raw[d] || []).filter(id => routines.some(r => r.id === id));
    if (ids.length) week[d] = ids;
  }
  return { routines, week, weekday: Number.isInteger(weekday) ? weekday : new Date().getDay() };
}

/** 校验并规范化一套计划；不合法返回 null。 */
function normalizeRoutine(routine) {
  if (!routine || typeof routine !== 'object') return null;
  const name = String(routine.name || '').trim().slice(0, 40);
  if (!name) return null;
  const list = Array.isArray(routine.ex) ? routine.ex.slice(0, MAX_EX) : [];
  const ex = [];
  for (const e of list) {
    const id = String(e && e.id || '');
    if (!KNOWN.has(id)) continue;                 // 不认识的 id 直接丢，不让脏数据进 state
    if (ex.some(x => x.id === id)) continue;      // 同一套里去重
    const row = { id, sets: clamp(e.sets, 1, 20), reps: clamp(e.reps, 1, 100) };
    // 金字塔：每组次数可以不同（12-10-8）。长度跟组数对齐，短了用最后一个补齐。
    if (Array.isArray(e.repsList) && e.repsList.length) {
      const list = e.repsList.slice(0, row.sets).map(v => clamp(v, 1, 100));
      while (list.length < row.sets) list.push(list[list.length - 1] || row.reps);
      if (list.some(v => v !== row.reps)) row.repsList = list;
    }
    // 每组不同重量（递增/递减金字塔），长度跟组数对齐
    if (Array.isArray(e.weightList) && e.weightList.length) {
      const wl = e.weightList.slice(0, row.sets).map(v => Math.max(0, Math.min(1000, num(v))));
      while (wl.length < row.sets) wl.push(wl[wl.length - 1] || num(e.weight));
      if (wl.some(v => v > 0 && v !== num(e.weight))) row.weightList = wl;
    }
    if (e.prog === 'linear' || e.prog === 'double') {
      row.prog = e.prog;
      if (num(e.inc) > 0) row.inc = Math.min(20, num(e.inc));
      if (num(e.target) > 0) row.target = Math.min(100, Math.round(num(e.target)));
      if (num(e.base) > 0) row.base = Math.min(100, Math.round(num(e.base)));
    }
    if (e.mode === 'time') row.mode = 'time';
    if (e.perSide === true) row.perSide = true;
    const g = e.group ? String(e.group).slice(0, 12) : '';
    if (g) row.group = g;
    const w = num(e.weight);
    if (w > 0) row.weight = Math.min(1000, w);
    ex.push(row);
  }
  // 落单的超集标记去掉：必须有另一个同组动作才算数
  const counts = new Map();
  ex.forEach(r => { if (r.group) counts.set(r.group, (counts.get(r.group) || 0) + 1); });
  ex.forEach(r => { if (r.group && counts.get(r.group) < 2) delete r.group; });
  const note = String(routine.note || '').trim().slice(0, 80);
  return { name, note, ex };
}

/**
 * 新建或更新一套计划。
 * @param {object} state
 * @param {{id?:string, name?:string, ex?:Array}} routine
 * @param {number} now 用来生成 id
 */
export function upsertRoutine(state, routine, now = Date.now()) {
  const next = { ...(state || {}) };
  const norm = normalizeRoutine(routine);
  if (!norm) return next;
  next.routines = Array.isArray(next.routines) ? next.routines.slice() : [];
  const id = String((routine && routine.id) || '');
  const at = next.routines.findIndex(r => r && r.id === id);
  if (at >= 0) {
    next.routines[at] = { ...next.routines[at], name: norm.name, note: norm.note, ex: norm.ex };
  } else {
    const newId = 'tt' + now.toString(36) + Math.floor(Math.random() * 1000).toString(36);
    next.routines.push({ id: newId, name: norm.name, note: norm.note, ex: norm.ex });
  }
  return next;
}

/** 删一套计划，同时从周安排里摘掉。 */
export function removeRoutine(state, id) {
  const next = { ...(state || {}) };
  const key = String(id || '');
  next.routines = (Array.isArray(next.routines) ? next.routines : []).filter(r => r && r.id !== key);
  const week = {};
  const raw = next.week && typeof next.week === 'object' ? next.week : {};
  for (const [d, v] of Object.entries(raw)) {
    const ids = [].concat(v || []).filter(x => x !== key);
    if (ids.length) week[d] = ids;
  }
  next.week = week;
  return next;
}

/** 改周安排：`{0..6: [routineId]}`，最多 3 套/天，引用不存在的 id 会被丢掉。 */
export function setWeek(state, week) {
  const next = { ...(state || {}) };
  const known = new Set((Array.isArray(next.routines) ? next.routines : []).map(r => r && r.id));
  const out = {};
  const src = week && typeof week === 'object' ? week : {};
  for (let d = 0; d < 7; d++) {
    const ids = [].concat(src[d] || [])
      .map(String)
      .filter(id => known.has(id))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, MAX_PER_DAY);
    if (ids.length) out[d] = ids;
  }
  next.week = out;
  return next;
}

/** 复制一套计划：新的 id，名字后面加「副本」。 */
export function duplicateRoutine(state, id, now = Date.now()) {
  const next = { ...(state || {}) };
  const list = Array.isArray(next.routines) ? next.routines.slice() : [];
  const src = list.find(r => r && r.id === String(id));
  if (!src) return next;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = 'ttr' + now.toString(36) + Math.floor(Math.random() * 100);
  copy.name = String(src.name || '计划').slice(0, 24) + ' 副本';
  list.push(copy);
  next.routines = list;
  return next;
}

/** 计划里把一个动作上移 / 下移一位（delta = -1 / 1）。 */
export function moveRoutineExercise(state, id, index, delta) {
  const next = { ...(state || {}) };
  const list = Array.isArray(next.routines) ? next.routines.slice() : [];
  const at = list.findIndex(r => r && r.id === String(id));
  if (at < 0) return next;
  const routine = { ...list[at] };
  const exs = (Array.isArray(routine.exercises) ? routine.exercises : []).slice();
  const from = Number(index);
  const to = from + Number(delta);
  if (!Number.isInteger(from) || from < 0 || from >= exs.length) return next;
  if (to < 0 || to >= exs.length) return next;
  const t = exs[from];
  exs[from] = exs[to];
  exs[to] = t;
  routine.exercises = exs;
  list[at] = routine;
  next.routines = list;
  return next;
}

/** 把第 index 个动作和下一个动作设成超集（再点一次拆掉）。 */
export function toggleRoutineSuperset(state, id, index) {
  const next = { ...(state || {}) };
  const list = Array.isArray(next.routines) ? next.routines.slice() : [];
  const at = list.findIndex(r => r && r.id === String(id));
  if (at < 0) return next;
  const routine = { ...list[at] };
  const exs = (Array.isArray(routine.exercises) ? routine.exercises : []).map(e => ({ ...e }));
  const i = Number(index);
  const j = i + 1;
  if (!Number.isInteger(i) || i < 0 || j >= exs.length) return next;
  if (exs[i].group && exs[i].group === exs[j].group) {
    exs[i].group = null;
    exs[j].group = null;
  } else {
    const g = 'g' + i;
    exs[i].group = g;
    exs[j].group = g;
  }
  routine.exercises = exs;
  list[at] = routine;
  next.routines = list;
  return next;
}

/** 在动作库里按英文名片段找第一个匹配的 id。 */
function findEx(...patterns) {
  for (const p of patterns) {
    const s = String(p).toLowerCase();
    const hit = EXERCISES.find(e => {
      const n = String(e.n || '').toLowerCase();
      return n === s || n.includes(s);
    });
    if (hit && KNOWN.has(hit.id)) return hit.id;
  }
  return '';
}

/** 新手三套（推 / 拉 / 腿），只保留动作库里真有的动作。 */
export function starterRoutines() {
  const mk = (name, picks) => {
    const ex = [];
    for (const p of picks) {
      const id = findEx(...p.names);
      if (!id || ex.some(x => x.id === id)) continue;
      ex.push({ id, sets: p.sets || 3, reps: p.reps || 8 });
    }
    return ex.length ? { name, ex } : null;
  };

  const push = mk('推', [
    { names: ['barbell bench press', 'bench press'], sets: 4, reps: 6 },
    { names: ['incline dumbbell press', 'dumbbell bench press'], sets: 3, reps: 10 },
    { names: ['dumbbell lateral raise', 'lateral raise'], sets: 3, reps: 15 },
    { names: ['triceps pushdown', 'cable pushdown', 'triceps extension'], sets: 3, reps: 12 }
  ]);
  const pull = mk('拉', [
    { names: ['pull-up', 'chin-up'], sets: 4, reps: 8 },
    { names: ['barbell row', 'bent over row'], sets: 4, reps: 8 },
    { names: ['lat pulldown', 'seated cable row'], sets: 3, reps: 10 },
    { names: ['barbell curl', 'dumbbell curl'], sets: 3, reps: 12 }
  ]);
  const legs = mk('腿', [
    { names: ['barbell squat', 'squat'], sets: 4, reps: 6 },
    { names: ['romanian deadlift', 'deadlift'], sets: 3, reps: 8 },
    { names: ['leg press'], sets: 3, reps: 12 },
    { names: ['standing calf raise', 'calf raise'], sets: 4, reps: 15 }
  ]);
  return [push, pull, legs].filter(Boolean);
}

/** 载入新手计划：追加到现有计划后面，并把 周一/三/五 排上。 */
export function loadStarterPlan(state, now = Date.now()) {
  const next = { ...(state || {}) };
  const list = Array.isArray(next.routines) ? next.routines.slice() : [];
  const created = [];
  for (const r of starterRoutines()) {
    const id = 'tt' + now.toString(36) + Math.floor(Math.random() * 1000).toString(36) + created.length;
    created.push({ id, name: r.name, ex: r.ex });
  }
  if (!created.length) return next;
  next.routines = list.concat(created);
  // 周一 / 周三 / 周五：推 / 拉 / 腿（下标 1 / 3 / 5）
  const week = next.week && typeof next.week === 'object' ? { ...next.week } : {};
  const plan = [[1, created[0] && created[0].id], [3, created[1] && created[1].id], [5, created[2] && created[2].id]];
  for (const [d, id] of plan) if (id) week[d] = [id];
  next.week = week;
  return next;
}
