/* 专题：不属于单个动作的讲解（思路、安排、保护），和动作库放在一起。
 * 数据从 frontend/src/coach-notes/topics.js 复制过来，这里做瘦身。
 */
import TOPICS_ZH from './tt-topics-zh.js';
import { partOf, TOPIC_PARTS } from './tt-topic-parts.js';

const trim = tp => ({
  id: String(tp.id || ''),
  title: String(tp.title || ''),
  coach: String(tp.coach || ''),
  summary: String(tp.summary || ''),
  sections: (Array.isArray(tp.sections) ? tp.sections : []).slice(0, 20).map(s => ({
    title: String(s && s.title || ''),
    items: (Array.isArray(s && s.items) ? s.items : []).map(x => String(x || '')).filter(Boolean)
  })).filter(s => s.title || s.items.length)
});

export function topicsList() {
  return TOPICS_ZH.map(tp => ({ id: tp.id, title: tp.title, coach: tp.coach, part: partOf(tp) }));
}

/** 按部位分组（只保留有专题的部位，顺序固定）。 */
export function topicsByPart() {
  const list = topicsList();
  return TOPIC_PARTS
    .map(part => ({ part, items: list.filter(tp => tp.part === part) }))
    .filter(g => g.items.length);
}

export function topicGet(id) {
  const tp = TOPICS_ZH.find(x => x && x.id === String(id || ''));
  return tp ? trim(tp) : null;
}

export const topicsCount = () => TOPICS_ZH.length;
