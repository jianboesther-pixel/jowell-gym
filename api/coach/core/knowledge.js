/* Retrieval over the app's own coaching notes (frontend/src/coach-notes/topics.js, compiled into
 * knowledge-data.js). No embeddings, no model: a question is matched against the notes by the
 * words it is made of, and at most two notes ride along in the payload.
 *
 * Chinese has no spaces to split on, so the terms are character bigrams. That is crude and it is
 * enough: the notes are short, the titles are specific ("减脂思路", "肩峰撞击"), and the prompt is
 * told to ignore any note that does not actually answer the question. The alternative — shipping
 * 167 notes into every request — costs a hundred times the tokens for no more recall.
 */
import { KNOWLEDGE } from './knowledge-data.js';

const norm = s => String(s || '').toLowerCase();
const CJK = /[\u4e00-\u9fff]+/g;

// Chinese has no spaces, so the terms are bigrams — and bigrams of the words every question
// contains ("怎么", "什么", "我的") say nothing about which note is meant. They are dropped before
// scoring; the list is deliberately short and about grammar, not about training vocabulary.
const STOP = new Set([
  '怎么', '么办', '什么', '多少', '可以', '我的', '我们', '你的', '应该', '需要', '时候', '一下',
  '一天', '今天', '明天', '现在', '还是', '就是', '这个', '那个', '如果', '因为', '所以', '但是',
  '然后', '问题', '感觉', '有点', '多久', '几次', '不能', '不好', '没有', '还是', '不是', '这样',
  '那样', '一个', '两个', '比较', '非常', '真的', '可能', '比如', '以及', '还有', '而且'
]);

/** The words a question is matched on: latin words as they are, Chinese as overlapping bigrams. */
export function termsOf(question) {
  const q = norm(question);
  const out = new Set();
  for (const w of q.match(/[a-z0-9][a-z0-9'_-]+/g) || []) out.add(w);
  for (const run of q.match(CJK) || []) {
    if (run.length === 1) { out.add(run); continue; }
    for (let i = 0; i < run.length - 1; i++) {
      const bigram = run.slice(i, i + 2);
      if (!STOP.has(bigram)) out.add(bigram);
    }
  }
  return [...out];
}

const TITLE = new Map(KNOWLEDGE.map(k => [k.id, norm(k.title)]));
const BODY = new Map(KNOWLEDGE.map(k => [k.id, norm(`${k.title} ${k.text}`)]));

// How many notes a term appears in, cached: a term in every note ("训练") says almost nothing
// about which note a question is about, a term in three ("肩峰") says almost everything.
const DF = new Map();
function docsWith(term) {
  if (DF.has(term)) return DF.get(term);
  let n = 0;
  for (const body of BODY.values()) if (body.includes(term)) n++;
  if (DF.size < 5000) DF.set(term, n);
  return n;
}

/** A term's weight: rare across the notes, high. */
export function weightOf(term) {
  return Math.log(1 + KNOWLEDGE.length / (1 + docsWith(term)));
}

/** How much of `terms` a note carries. A title hit is worth six body hits, and only the three
 *  heaviest body terms count: a pile of common words ("怎么办", "一天") is not a topic, while one
 *  rare word in the title is. */
export function scoreOf(topic, terms) {
  const title = TITLE.get(topic.id) || '';
  const body = BODY.get(topic.id) || '';
  let score = 0;
  const inBody = [];
  for (const t of terms) {
    const w = weightOf(t);
    if (title.includes(t)) score += 6 * w;
    else if (body.includes(t)) inBody.push(w);
  }
  inBody.sort((a, b) => b - a);
  for (const w of inBody.slice(0, 3)) score += w;
  return score;
}

/**
 * The notes worth sending with this question: at most `limit`, each cut to `maxChars`, and only
 * ones that share enough rare words with it to be about the same thing. Both the floor and the
 * cut are absolute as well as relative, so a question with no matching note (the app's own
 * features, a workout lookup) retrieves nothing at all rather than the least-bad note.
 */
export function retrieveKnowledge(question, { limit = 2, maxChars = 1400, floor = 8 } = {}) {
  const terms = termsOf(question);
  if (!terms.length) return [];
  const scored = [];
  for (const k of KNOWLEDGE) {
    const score = scoreOf(k, terms);
    if (score > 0) scored.push({ k, score });
  }
  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score || (a.k.id < b.k.id ? -1 : 1));
  const top = scored[0].score;
  const cut = Math.max(floor, top * 0.55);
  return scored
    .filter(s => s.score >= cut)
    .slice(0, limit)
    .map(({ k }) => ({
      id: k.id,
      title: k.title,
      coach: k.coach,
      text: k.text.slice(0, maxChars)
    }));
}
