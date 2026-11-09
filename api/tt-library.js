/* 动作库：搜索 + 按部位 / 类别 / 器械筛，和网页端的库一一对应。
 *
 * 字段来自两个地方：动作本身（id/n/bp/tg/eq）在 coach/core/library-data.js，
 * 类别（strength/cardio/…）网页端有、这里原本没有，从 EXDB 抽成了 tt-ex-cat.js。
 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';
import { CAT_OF } from './tt-ex-cat.js';
import { BP_ZH, CAT_ZH, EQ_ZH, TG_ZH } from './tt-labels-zh.js';

export const PARTS = Object.keys(BP_ZH).map(key => ({ key, zh: BP_ZH[key] }));
export const GEAR = Object.keys(EQ_ZH).map(key => ({ key, zh: EQ_ZH[key] }));
export const CATS = Object.keys(CAT_ZH).map(key => ({ key, zh: CAT_ZH[key] }));

const INDEX = EXERCISES.map(e => ({
  id: e.id,
  en: e.n,
  zh: NAMES_ZH[e.id] || '',
  eq: e.eq || '',
  bp: e.bp || '',
  tg: e.tg || '',
  cat: CAT_OF[e.id] || ''
}));

const norm = s => String(s || '').trim().toLowerCase();

const item = e => ({
  id: e.id,
  name: e.zh || e.en,
  en: e.en,
  bp: e.bp,
  bpZh: BP_ZH[e.bp] || e.bp,
  eq: e.eq,
  eqZh: EQ_ZH[e.eq] || e.eq,
  tg: e.tg,
  tgZh: TG_ZH[e.tg] || e.tg,
  cat: e.cat,
  catZh: CAT_ZH[e.cat] || e.cat,
  // 卡片缩略图（解剖图），和网页端同一张
  imgJpg: `/exercise-media/still-jpg/${e.id}.jpg`
});

/**
 * @param {{q?:string, bp?:string, cat?:string, eq?:string, offset?:number, limit?:number}} opts
 * @returns {{items:Array, total:number, offset:number, hasMore:boolean}}
 */
export function libraryView(opts = {}) {
  const q = norm(opts.q);
  const bp = norm(opts.bp);
  const cat = norm(opts.cat);
  const eq = norm(opts.eq);
  const tgKey = norm(opts.tg);
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 20));
  const offset = Math.max(0, Number(opts.offset) || 0);

  let list = INDEX;
  if (bp) list = list.filter(e => e.bp === bp);
  if (cat) list = list.filter(e => e.cat === cat);
  if (eq) list = list.filter(e => e.eq === eq);
  if (tgKey) list = list.filter(e => e.tg === tgKey);

  const usage = opts.usage && typeof opts.usage === 'object' ? opts.usage : null;
  if (q && usage) {
    // 先按原来的规则排，再把练过次数高的往前挪（同档内）
    list = list.filter(e => e.zh.toLowerCase().includes(q) || e.en.toLowerCase().includes(q));
    list = list.slice().sort((a, b) => {
      const ra = a.zh.startsWith(q) ? 0 : a.en.startsWith(q) ? 1 : 2;
      const rb = b.zh.startsWith(q) ? 0 : b.en.startsWith(q) ? 1 : 2;
      if (ra !== rb) return ra - rb;
      const ua = usage[a.id] || 0, ub = usage[b.id] || 0;
      if (ua !== ub) return ub - ua;
      return (a.zh || a.en).length - (b.zh || b.en).length;
    });
  } else if (q) {
    list = list.filter(e => e.zh.toLowerCase().includes(q) || e.en.toLowerCase().includes(q));
    list = list.slice().sort((a, b) => {
      const ra = a.zh.startsWith(q) ? 0 : a.en.startsWith(q) ? 1 : 2;
      const rb = b.zh.startsWith(q) ? 0 : b.en.startsWith(q) ? 1 : 2;
      return ra - rb || (a.zh || a.en).length - (b.zh || b.en).length;
    });
  } else {
    list = list.slice().sort((a, b) => {
      const x = a.zh || a.en;
      const y = b.zh || b.en;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  const total = list.length;
  const page = list.slice(offset, offset + limit).map(item);
  return { items: page, total, offset, hasMore: offset + page.length < total };
}

/** 「按肌肉」：每个目标肌有多少个动作，按数量排。 */
export function muscleOptions() {
  const counts = new Map();
  for (const e of INDEX) {
    if (!e.tg) continue;
    counts.set(e.tg, (counts.get(e.tg) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, zh: TG_ZH[key] || key, count }))
    .sort((a, b) => b.count - a.count);
}

/** 顶部筛选条的条目（部位/类别/器械），带中文名。 */
export function filterOptions() {
  return { parts: PARTS, cats: CATS, gear: GEAR };
}

/** 从一份 state 数出每个动作被练过的次数（workouts 的 entries + routines 的引用）。 */
export function usageMap(state) {
  const out = {};
  const st = state || {};
  for (const w of (Array.isArray(st.workouts) ? st.workouts : [])) {
    for (const e of (w && Array.isArray(w.entries) ? w.entries : [])) {
      if (e && e.id) out[e.id] = (out[e.id] || 0) + 1;
    }
  }
  for (const r of (Array.isArray(st.routines) ? st.routines : [])) {
    for (const e of (r && Array.isArray(r.ex) ? r.ex : [])) {
      if (e && e.id) out[e.id] = (out[e.id] || 0) + 0.5;
    }
  }
  return out;
}

/**
 * 搜索没结果时给的「接近的动作」：中文名按字拆开算重合，英文名按词算。
 * 返回最多 limit 条，按分数高到低。
 */
export function similarTo(q, { limit = 12 } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const chars = [...new Set(needle.replace(/\s+/g, '').split(''))].filter(Boolean);
  const words = needle.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of INDEX) {
    const zh = (e.zh || '').toLowerCase();
    const en = (e.en || '').toLowerCase();
    let score = 0;
    for (const c of chars) if (zh.includes(c)) score += 2;
    for (const w of words) if (w.length > 2 && en.includes(w)) score += 3;
    if (!score) continue;
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.e.zh || a.e.en).length - (b.e.zh || b.e.en).length);
  return scored.slice(0, Math.max(1, Math.min(30, limit))).map(x => x.e.id);
}
