/* The scheduled review is the one Coach job nobody asks for, so it is also the one that spends an
 * instance's provider budget without a user on the other end of the request. The allowlist has to
 * gate it before it enqueues, not only when the result is read: a profile that cannot open the
 * Coach must not cost anything while nobody is looking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const cfg = await import('../coach/config.js');
const { mayReview } = await import('../coach/cadence.js');

const fresh = (patch = {}) => {
  cfg.reset();
  cfg.save({ enabled: true, provider: 'fixture', allowlist: null, ...patch });
};

test('with no list, the tick asks about everybody — the behaviour every instance already had', () => {
  fresh();
  assert.equal(mayReview({ id: 'u1' }), true);
});

test('a list keeps a profile out of the scheduled review, and never keeps an admin out', () => {
  fresh({ allowlist: ['u1'] });
  assert.equal(mayReview({ id: 'u1' }), true, 'listed');
  assert.equal(mayReview({ id: 'u2' }), false, 'unlisted');
  assert.equal(mayReview({ id: 'u2' }, true), true, 'admin');
  assert.equal(mayReview({ id: 'u2' }, false), false, 'admin flag is the only way in');
});

test('an empty list means admins only, here as on the user routes', () => {
  fresh({ allowlist: [] });
  assert.equal(mayReview({ id: 'u1' }), false);
  assert.equal(mayReview({ id: 'boss' }, true), true);
});
