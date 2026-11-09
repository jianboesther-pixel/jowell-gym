/* 动作搜索：给小程序配计划用。库里 5600 条英文名 + 中文表，按中文优先匹配。 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';

const INDEX = EXERCISES.map(e => ({
  id: e.id,
  en: e.n,
  zh: NAMES_ZH[e.id] || '',
  eq: e.eq || ''
}));

/** 子串匹配：中文名、英文名都查；短查询要求从头匹配，避免一个字母命中几千条。 */
export function searchExercises(q, limit = 20) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const n = Math.max(1, Math.min(50, limit));
  const out = [];
  for (const it of INDEX) {
    const zh = it.zh.toLowerCase();
    const en = it.en.toLowerCase();
    const hit = zh.includes(s) || en.includes(s);
    if (!hit) continue;
    // 中文名以查询开头 > 英文名开头 > 其余
    const rank = zh.startsWith(s) ? 0 : en.startsWith(s) ? 1 : 2;
    out.push({ ...it, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.zh.length - b.zh.length);
  return out.slice(0, n).map(({ id, zh, en, eq }) => ({ id, name: zh || en, en, eq }));
}
