/* 小程序里的「统计」：最近 12 周的训练量 + 本周进度 + 连续周数。
 *
 * 只读 state 里的 workouts / bodyweight，纯函数，时间由调用方给，便于测试。
 * 一周从周一算起，和网页端一致。
 */
import { summarize } from './tt-history.js';
import { EXERCISES } from './coach/core/library-data.js';
import { TG_ZH } from './tt-labels-zh.js';
import { NAMES_ZH } from './tt-names-zh.js';

const BY_ID = new Map(EXERCISES.map(e => [e.id, e]));
const TG_ZH_BY = id => {
  const ex = BY_ID.get(id);
  return (ex && (TG_ZH[ex.tg] || ex.tg)) || '';
};

const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseDay = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/** 那一天所在周的周一（本地时间，中午执行避免夏令时边界）。 */
export function mondayOf(iso) {
  const d = parseDay(iso);
  if (!d) return null;
  const dow = (d.getDay() + 6) % 7;           // 周一=0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow, 12);
  return isoOf(monday);
}

const addDays = (iso, n) => {
  const d = parseDay(iso);
  if (!d) return iso;
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  return isoOf(x);
};

/**
 * @param {{workouts?:Array, bodyweight?:Array}} state
 * @param {{weeks?:number, today?:string}} opts today 是 'YYYY-MM-DD'
 */
/** 最近 30 天每个肌群做了多少组（只算有重量的正式组）。 */
export function muscleBalance(workouts, todayIso, days = 30) {
  const from = addDays(todayIso, -(days - 1));
  const count = new Map();
  for (const w of workouts || []) {
    const s = summarize(w, 'zh');
    if (!s.sets) continue;
    if (s.d && s.d < from) continue;
    for (const e of w.entries || []) {
      const tg = TG_ZH_BY(e.id);
      if (!tg) continue;
      const sets = (Array.isArray(e.sets) ? e.sets : []).filter(x => x && x.done && Number(x.w) > 0);
      if (!sets.length) continue;
      count.set(tg, (count.get(tg) || 0) + sets.length);
    }
  }
  return [...count.entries()]
    .map(([zh, sets]) => ({ zh, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 12);
}

/** 每个动作最好的一组估算 1RM（Epley：w × (1 + r/30)），取前 6 个。 */
export function topStrength(workouts, limit = 6) {
  const best = new Map();
  for (const w of workouts || []) {
    for (const e of w.entries || []) {
      for (const x of (Array.isArray(e.sets) ? e.sets : [])) {
        if (!x || !x.done) continue;
        const wt = Number(x.w) || 0;
        const reps = Number(x.r) || 0;
        if (wt <= 0 || reps <= 0) continue;
        const e1 = Math.round(wt * (1 + reps / 30) * 10) / 10;
        const cur = best.get(e.id);
        if (!cur || e1 > cur.e1rm) best.set(e.id, { id: e.id, e1rm: e1, w: wt, r: reps });
      }
    }
  }
  return [...best.values()]
    .map(x => ({ ...x, name: NAMES_ZH[x.id] || (BY_ID.get(x.id) || {}).n || x.id }))
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, limit);
}

/** 最近几周，每周各肌群做了多少组（堆叠柱用的就是它）。 */
export function weeklyMuscles(workouts, weeks, todayIso) {
  const out = [];
  const monday = mondayOf(todayIso);
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(monday, -7 * i);
    const to = addDays(from, 6);
    const count = new Map();
    for (const w of workouts || []) {
      const s = summarize(w, 'zh');
      if (!s.sets || !s.d || s.d < from || s.d > to) continue;
      for (const e of w.entries || []) {
        const tg = TG_ZH_BY(e.id);
        if (!tg) continue;
        const sets = (Array.isArray(e.sets) ? e.sets : []).filter(x => x && x.done && Number(x.w) > 0);
        if (sets.length) count.set(tg, (count.get(tg) || 0) + sets.length);
      }
    }
    const rows = [...count.entries()].map(([zh, sets]) => ({ zh, sets })).sort((a, b) => b.sets - a.sets);
    out.push({ from, rows, total: rows.reduce((n, r) => n + r.sets, 0) });
  }
  return out;
}

/** 有足够数据画进步曲线的动作（至少 2 次训练）。 */
export function progressList(workouts) {
  const seen = new Map();
  for (const w of workouts || []) {
    for (const e of w.entries || []) {
      const done = (Array.isArray(e.sets) ? e.sets : []).filter(x => x && x.done && Number(x.w) > 0);
      if (!done.length) continue;
      seen.set(e.id, (seen.get(e.id) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({ id, name: NAMES_ZH[id] || (BY_ID.get(id) || {}).n || id, sessions: n }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 30);
}

/** 某个动作的历史：每次训练的最好估算 1RM 和最大重量。 */
export function exerciseProgress(workouts, id, todayIso) {
  const key = String(id || '');
  const rows = [];
  for (const w of workouts || []) {
    let bestE = 0, bestW = 0, reps = 0;
    for (const e of w.entries || []) {
      if (e.id !== key) continue;
      for (const x of (Array.isArray(e.sets) ? e.sets : [])) {
        if (!x || !x.done) continue;
        const wt = Number(x.w) || 0, r = Number(x.r) || 0;
        if (wt <= 0 || r <= 0) continue;
        const e1 = Math.round(wt * (1 + r / 30) * 10) / 10;
        if (e1 > bestE) { bestE = e1; bestW = wt; reps = r; }
      }
    }
    if (bestE > 0 && w.d) rows.push({ d: w.d, e1rm: bestE, w: bestW, r: reps });
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return rows.slice(-12);
}

/** 推 / 拉 / 腿 / 核心 各做了多少组（结构平衡用）。 */
const GROUP_OF = {
  pectorals: 'push', delts: 'push', triceps: 'push', 'serratus anterior': 'push',
  lats: 'pull', 'upper back': 'pull', traps: 'pull', biceps: 'pull', forearms: 'pull',
  'levator scapulae': 'pull',
  quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
  adductors: 'legs', abductors: 'legs',
  abs: 'core', obliques: 'core', spine: 'core'
};
const GROUP_ZH = { push: '推', pull: '拉', legs: '腿', core: '核心' };

export function structureBalance(workouts, todayIso, days = 84) {
  const from = addDays(todayIso, -(days - 1));
  const out = { push: 0, pull: 0, legs: 0, core: 0 };
  for (const w of workouts || []) {
    const sm = summarize(w, 'zh');
    if (!sm.sets || !sm.d || sm.d < from) continue;
    for (const e of w.entries || []) {
      const ex = BY_ID.get(e.id);
      const g = ex && GROUP_OF[ex.tg];
      if (!g) continue;
      const sets = (Array.isArray(e.sets) ? e.sets : []).filter(x => x && x.done && Number(x.w) > 0);
      out[g] += sets.length;
    }
  }
  const rows = Object.keys(out).map(k => ({ key: k, zh: GROUP_ZH[k], sets: out[k] })).filter(r => r.sets > 0);
  const total = rows.reduce((n, r) => n + r.sets, 0);
  return { rows: rows.map(r => ({ ...r, pct: total ? Math.round((r.sets / total) * 100) : 0 })), total };
}

/**
 * 疲劳度（简化版）：每个肌群上次练是多久前、按刺激量估一个恢复窗口，给出恢复百分比。
 * 网页端那套模型很细（肌群权重、RIR、1RM），这里先用可解释的近似：
 *   恢复窗口 = 48h + 24h × min(该场组数, 12) / 12     → 48～72 小时
 */
export function fatigueView(workouts, nowIso) {
  const byMuscle = new Map();
  for (const w of workouts || []) {
    const sm = summarize(w, 'zh');
    if (!sm.sets || !sm.d) continue;
    for (const e of w.entries || []) {
      const ex = BY_ID.get(e.id);
      const zh = ex && (TG_ZH[ex.tg] || ex.tg);
      if (!zh) continue;
      const sets = (Array.isArray(e.sets) ? e.sets : []).filter(x => x && x.done && Number(x.w) > 0).length;
      if (!sets) continue;
      const cur = byMuscle.get(zh) || { zh, lastD: '', sets: 0, at: 0 };
      if (sm.d > cur.lastD) { cur.lastD = sm.d; cur.sets = sets; cur.at = Number(w.end || w.start || 0); }
      else if (sm.d === cur.lastD) cur.sets += sets;
      byMuscle.set(zh, cur);
    }
  }

  const now = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nowIso || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : Date.now();
  })();

  const rows = [];
  for (const m of byMuscle.values()) {
    const at = m.at || new Date(m.lastD + 'T12:00:00').getTime();
    const hours = Math.max(0, (now - at) / 3600000);
    const window = 48 + 24 * Math.min(12, Math.max(1, m.sets)) / 12;
    const pct = Math.max(0, Math.min(100, Math.round((hours / window) * 100)));
    rows.push({
      zh: m.zh,
      lastD: m.lastD,
      sets: m.sets,
      hours: Math.round(hours),
      pct,
      status: pct >= 95 ? '已恢复' : pct >= 60 ? '恢复中' : '需要休息'
    });
  }
  return rows.sort((a, b) => a.pct - b.pct).slice(0, 8);
}

/** 力竭感分布：每组记的余力（0 = 力竭）落在哪一档，最近 90 天。 */
export function effortView(workouts, todayIso, days = 90) {
  const from = addDays(todayIso, -(days - 1));
  const bins = [0, 0, 0, 0, 0, 0];   // 0,1,2,3,4,5+
  let total = 0;
  for (const w of workouts || []) {
    const sm = summarize(w, 'zh');
    if (!sm.d || sm.d < from) continue;
    for (const e of w.entries || []) {
      for (const x of (Array.isArray(e.sets) ? e.sets : [])) {
        if (!x || !x.done || x.rir === undefined || x.rir === null) continue;
        const b = Math.max(0, Math.min(5, Math.round(Number(x.rir))));
        bins[b] += 1;
        total += 1;
      }
    }
  }
  const max = Math.max(1, ...bins);
  return {
    total,
    bins: bins.map((n, i) => ({ rir: i, label: i === 5 ? '5+' : String(i), sets: n, pct: Math.round((n / max) * 100) }))
  };
}

export function statsView(state, { weeks = 12, today } = {}) {
  const list = Array.isArray(state && state.workouts) ? state.workouts : [];
  const n = Math.max(4, Math.min(53, Number(weeks) || 12));
  const todayIso = String(today || isoOf(new Date()));
  const thisMonday = mondayOf(todayIso);

  // 哪些天练过（周条的红点用它，免得依赖历史列表的条数）
  const doneDays = [];

  // 按周汇总（只算有组数的场次）
  const byWeek = new Map();
  let totalVolume = 0;
  let totalSets = 0;
  let totalSessions = 0;
  for (const w of list) {
    const s = summarize(w, 'zh');
    if (!s.sets) continue;
    const monday = mondayOf(s.d || '');
    if (!monday) continue;
    if (s.d && !doneDays.includes(s.d)) doneDays.push(s.d);
    const row = byWeek.get(monday) || { from: monday, count: 0, volume: 0, sets: 0 };
    row.count += 1;
    row.volume += s.volume;
    row.sets += s.sets;
    byWeek.set(monday, row);
    totalVolume += s.volume;
    totalSets += s.sets;
    totalSessions += 1;
  }

  // 最近 n 周，新的在前
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = addDays(thisMonday, -7 * i);
    const row = byWeek.get(from) || { from, count: 0, volume: 0, sets: 0 };
    out.push({ from, to: addDays(from, 6), ...row });
  }

  // 连续周数：从本周往前数，遇到空周就停（本周还没练不算断）
  let streak = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i].count > 0) streak += 1;
    else if (i === 0) continue;
    else break;
  }

  const thisWeek = out[0];
  return {
    weeks: out,
    streak,
    thisWeek: { count: thisWeek.count, volume: thisWeek.volume, sets: thisWeek.sets, from: thisWeek.from, to: thisWeek.to },
    totals: { sessions: totalSessions, sets: totalSets, volume: totalVolume },
    // 柱状图用：0..1 的相对高度（这几个月最重的一周当作 1）
    peak: out.reduce((m, r) => Math.max(m, r.volume), 0),
    doneDays: doneDays.sort(),
    muscles: muscleBalance(list, todayIso, Math.max(7, n * 7)),
    strength: topStrength(list),
    weeklyMuscles: weeklyMuscles(list, Math.min(12, n), todayIso),
    structure: structureBalance(list, todayIso, Math.max(7, n * 7)),
    fatigue: fatigueView(list, todayIso),
    effort: effortView(list, todayIso),
    progressList: progressList(list)
  };
}
