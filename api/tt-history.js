/* 抖音里的历史列表：把 state.workouts 压成列表要的样子。
 *
 * 纯函数：不读文件、不看时钟。名字按中文取（tt-names-zh），和面板一致。
 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';

const NAMES = new Map(EXERCISES.map(e => [e.id, e.n]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const nameOf = (id, lang) =>
  (String(lang || 'zh').startsWith('zh') && NAMES_ZH[id]) || NAMES.get(id) || id;

/** 一场训练的组数 / 容量 / 时长。只算 done 的组。 */
export function summarize(w, lang = 'zh') {
  const entries = Array.isArray(w && w.entries) ? w.entries : [];
  let sets = 0, volume = 0, topW = 0;
  const exercises = [];
  for (const e of entries) {
    const done = (Array.isArray(e.sets) ? e.sets : []).filter(s => s && s.done);
    if (!done.length) continue;
    const vol = done.reduce((n, s) => n + num(s.w) * num(s.r) * (s.perSide ? 2 : 1), 0);
    sets += done.length;
    volume += vol;
    for (const s of done) topW = Math.max(topW, num(s.w));
    const warmCount = (Array.isArray(e.warm) ? e.warm : []).length;
    exercises.push({
      id: e.id,
      name: nameOf(e.id, lang),
      sets: done.map(s => ({ w: num(s.w), r: num(s.r), s: num(s.s) || 0 })),
      // 自重/热身组没有重量，写成 "12 次" 比 "0×12" 好看
      line: done.map(s => (num(s.s) ? (num(s.w) ? num(s.w) + 'kg ' : '') + num(s.s) + ' 秒'
        : (num(s.w) ? num(s.w) + '×' + num(s.r) : num(s.r) + ' 次'))
        + (s.perSide ? '（每边）' : '')).join('  '),
      note: String(e.note || ''),
      warm: warmCount
    });
  }
  const start = num(w && w.start), end = num(w && w.end);
  return {
    id: String((w && w.id) || ''),
    d: String((w && w.d) || ''),
    name: String((w && w.name) || '训练'),
    minutes: start && end && end > start ? Math.round((end - start) / 60000) : 0,
    sets,
    volume,
    topW,
    live: w && w.ttLive === true,
    exercises
  };
}

/** 最近 limit 场，新的在前。没有组数的（空场）直接跳过。 */
export function historyView(state, { limit = 20, lang = 'zh' } = {}) {
  const list = Array.isArray(state && state.workouts) ? state.workouts : [];
  const rows = list
    .map(w => summarize(w, lang))
    .filter(w => w.sets > 0)
    .sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? 1 : -1))
    .slice(0, Math.max(1, Math.min(50, limit)));

  // 破纪录：按时间从旧到新走一遍，每个动作的最好估算 1RM 被超过就标 pr
  const best = new Map();
  const ordered = list
    .map(w => summarize(w, lang))
    .filter(w => w.sets > 0)
    .sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1));
  for (const w of ordered) {
    let prs = 0;
    for (const ex of w.exercises) {
      let top = 0;
      for (const s of ex.sets) {
        const w2 = Number(s.w) || 0, r = Number(s.r) || 0;
        if (w2 > 0 && r > 0) top = Math.max(top, Math.round(w2 * (1 + r / 30) * 10) / 10);
      }
      const prev = best.get(ex.id) || 0;
      if (top > prev && prev > 0) { ex.pr = true; prs += 1; }
      if (top > prev) best.set(ex.id, top);
    }
    w.prs = prs;
  }
  const byId = new Map(ordered.map(w => [w.id, w]));
  return rows.map(r => {
    const full = byId.get(r.id);
    return full ? { ...r, prs: full.prs || 0, exercises: full.exercises } : r;
  });
}
