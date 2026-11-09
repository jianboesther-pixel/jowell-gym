/* 教练讲解：57 个动作的自写讲解（谭成义、凯圣王）。
 * 数据从 frontend/src/coach-notes/zh.js 复制过来，这里只做瘦身（去掉 source/prev/next 等页面用不到的）。
 */
import NOTES_ZH from './tt-notes-zh.js';
import { NAMES_ZH } from './tt-names-zh.js';
import { EXERCISES } from './coach/core/library-data.js';
import { BP_ZH, EQ_ZH, TG_ZH } from './tt-labels-zh.js';

const NAMES = new Map(EXERCISES.map(e => [e.id, e.n]));
const BY_ID = new Map(EXERCISES.map(e => [e.id, e]));
const asList = v => (Array.isArray(v) ? v : v ? [v] : []);

const trim = n => ({
  title: String(n.title || '').slice(0, 60),
  coach: String(n.coach || ''),
  summary: String(n.summary || ''),
  key: (Array.isArray(n.key) ? n.key : []).slice(0, 12).map(k => ({
    text: String(k && k.text || ''),
    at: String(k && k.at || '')
  })).filter(k => k.text),
  mistakes: (Array.isArray(n.mistakes) ? n.mistakes : []).slice(0, 6).map(m => ({
    mistake: String(m && m.mistake || ''),
    fix: String(m && m.fix || '')
  })).filter(m => m.mistake),
  source: n && n.source && n.source.url ? { title: String(n.source.title || ''), url: String(n.source.url) } : null
});

/** 这个动作的讲解（0..n 条）。 */
export function notesFor(id) {
  return asList(NOTES_ZH[String(id || '')]).map(trim);
}

/** 有讲解的动作清单，给动作库顶部那张卡用。 */
export function notesIndex() {
  return Object.keys(NOTES_ZH).map(id => {
    const list = notesFor(id);
    const first = list[0] || {};
    const ex = BY_ID.get(id) || {};
    const noteOnly = !BY_ID.has(id);
    return {
      id,
      name: NAMES_ZH[id] || NAMES.get(id)
        || String(first.title || (first.source && first.source.title) || String(first.summary || '').slice(0, 14) || id),
      noteOnly,
      count: list.length,
      coaches: [...new Set(list.map(n => n.coach).filter(Boolean))],
      bpZh: BP_ZH[ex.bp] || ex.bp || '',
      tgZh: TG_ZH[ex.tg] || ex.tg || '',
      eqZh: EQ_ZH[ex.eq] || ex.eq || '',
      imgJpg: '/exercise-media/still-jpg/' + id + '.jpg'
    };
  }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export const notesCount = () => Object.keys(NOTES_ZH).length;
