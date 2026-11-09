/* Retrieval over the app's own coaching notes: the words a question is made of, and the two notes
 * that share most of them. No model, no embeddings — and nothing retrieved when nothing matches.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { termsOf, scoreOf, retrieveKnowledge } from '../coach/core/knowledge.js';
import { KNOWLEDGE } from '../coach/core/knowledge-data.js';

test('the question is broken into latin words and Chinese bigrams', () => {
  const terms = termsOf('减脂怎么吃 protein intake');
  assert.ok(terms.includes('减脂'));
  assert.ok(terms.includes('脂怎'));
  assert.ok(terms.includes('protein'));
  assert.ok(terms.includes('intake'));
  assert.equal(terms.includes('减脂怎么吃'), false);
  assert.deepEqual(termsOf(''), []);
});

test('a title hit outweighs body mentions, and an unrelated question retrieves nothing', () => {
  const fat = KNOWLEDGE.find(k => /减脂/.test(k.title)) || KNOWLEDGE[0];
  assert.ok(scoreOf(fat, termsOf('减脂')) >= 3);
  assert.equal(retrieveKnowledge('量子计算与吉他调音').length, 0);
});

test('a real question gets at most two notes, each bounded, with id/title/coach/text', () => {
  const got = retrieveKnowledge('减脂期一天该吃多少热量，蛋白要多少');
  assert.ok(got.length >= 1 && got.length <= 2);
  for (const k of got) {
    assert.equal(typeof k.id, 'string');
    assert.equal(typeof k.title, 'string');
    assert.equal(typeof k.coach, 'string');
    assert.ok(k.text.length > 0 && k.text.length <= 1400, 'note text is cut to the budget');
  }
});

test('the same question twice gives the same notes, in the same order', () => {
  const q = '肩峰撞击还能练推举吗';
  assert.deepEqual(retrieveKnowledge(q).map(k => k.id), retrieveKnowledge(q).map(k => k.id));
});
