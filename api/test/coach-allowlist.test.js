/* Who may use the Coach.
 *
 * The list is one array in coach.json, and what this file pins is that it is enforced on both
 * sides: /api/config stops the feature rendering for a profile it leaves out, and the user routes
 * refuse that profile anyway â€?a hidden button is not an access control. The other half is what
 * an instance that never touched the feature must keep getting: everybody in, exactly as before
 * the key existed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempData } from './helpers.mjs';

const DIR = tempData();
const cfg = await import('../coach/config.js');
const { coachRoutes } = await import('../coach/routes.js');

// Every test starts from an empty coach.json: reset() only forgets the cache, and save() merges
// over what is on disk, so a key filed by the previous test would otherwise still be there.
const fresh = (patch = {}) => {
  cfg.reset();
  // `allowlist: null` is part of the baseline, not a preset: save() merges over what is on disk,
  // so without it one test's list would leak into the next.
  cfg.save({ enabled: true, provider: 'fixture', auth: {}, models: {}, providerOptions: {}, boundUid: {}, allowlist: null, ...patch });
};

/** server.js's helpers, as fakes. `user` is who the request is from; `admin` is whether this
 *  profile may open the admin routes (server.js's requireAdmin, which answers 403 itself). */
function harness({ user = { id: 'admin-1', admin: true }, admin = true, users = ['admin-1', 'u1', 'u2'] } = {}) {
  const json = (res, status, body) => { res.status = status; res.body = body; };
  const routes = coachRoutes({
    json,
    readBody: async req => req.body || {},
    readSession: () => user,
    requireAdmin: (req, res) => { if (admin) return true; json(res, 403, { error: 'forbidden' }); return false; },
    isAdmin: u => !!u && u.admin === true,
    knownUserIds: () => users
  });
  const call = async (key, body) => { const res = {}; await routes[key]({ body }, res); return res; };
  return { call, routes };
}

test('an instance that never opened the page lets every signed-in profile in', async () => {
  fresh();
  assert.equal(cfg.load().allowlist, null);
  assert.ok(cfg.publicConfig({ id: 'u2' }), 'the Coach block reaches a signed-in profile');
  assert.ok(cfg.publicConfig(), 'and the instance-level answer is unchanged');
  assert.equal((await harness({ user: { id: 'u2' } }).call('GET /api/coach/disclosure')).status, 200);
});

test('the list is enforced on the config and on the user routes alike', async () => {
  fresh({ allowlist: ['u1'] });
  assert.ok(cfg.publicConfig({ id: 'u1' }), 'a listed profile gets the Coach block');
  assert.equal(cfg.publicConfig({ id: 'u2' }), null, 'an unlisted one gets the instance-without-a-Coach answer');
  assert.ok(cfg.publicConfig({ id: 'boss' }, true), 'an admin always may, listed or not');

  const listed = await harness({ user: { id: 'u1' } }).call('GET /api/coach/disclosure');
  assert.equal(listed.status, 200);

  const blocked = await harness({ user: { id: 'u2' } }).call('GET /api/coach/disclosure');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'no-access');
  assert.match(blocked.body.error, /ask its admin/);

  // The status route goes through the shared guard, so it must refuse the same profile.
  const status = await harness({ user: { id: 'u2' } }).call('GET /api/coach/status');
  assert.equal(status.status, 403);
  assert.equal(status.body.code, 'no-access');
});

test('an empty list means admins only, which is a state an admin may want mid-setup', async () => {
  fresh({ allowlist: [] });
  assert.equal(cfg.publicConfig({ id: 'u1' }), null);
  assert.ok(cfg.publicConfig({ id: 'boss' }, true));
  assert.equal(cfg.load().allowlist.length, 0);
});

test('the admin routes store what the page sends, dropping ids that do not exist', async () => {
  fresh();
  const { call } = harness();
  const saved = await call('POST /api/admin/coach/allowlist', { allowedUids: ['u1', 'ghost', 'u1', 'u2'] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.allowedUids, ['u1', 'u2']);
  assert.equal(saved.body.restricted, true);

  const read = await call('GET /api/admin/coach/allowlist');
  assert.deepEqual(read.body, { restricted: true, allowedUids: ['u1', 'u2'] });
  assert.equal(cfg.publicConfig({ id: 'ghost' }), null, 'an id that was dropped grants nothing');
});

test('restricted:false opens the Coach to everyone again', async () => {
  fresh({ allowlist: ['u1'] });
  const { call } = harness();
  const opened = await call('POST /api/admin/coach/allowlist', { restricted: false });
  assert.equal(opened.status, 200);
  assert.deepEqual(opened.body, { restricted: false, allowedUids: null });
  assert.deepEqual((await call('GET /api/admin/coach/allowlist')).body, { restricted: false, allowedUids: null });
  assert.ok(cfg.publicConfig({ id: 'u2' }));
});

test('a write that is neither shape is refused rather than guessed at', async () => {
  fresh({ allowlist: ['u1'] });
  const { call } = harness();
  assert.equal((await call('POST /api/admin/coach/allowlist', {})).status, 400);
  assert.equal((await call('POST /api/admin/coach/allowlist', { allowedUids: 'u1' })).status, 400);
  assert.equal((await call('POST /api/admin/coach/allowlist', { allowedUids: [1, null, 'u1'] })).status, 200);
  assert.deepEqual(cfg.load().allowlist, ['u1'], 'the bad entries in a mixed list are dropped, not the write');
});

test('a profile that is not an admin can neither read nor write the list', async () => {
  fresh();
  const { call } = harness({ user: { id: 'u2' }, admin: false });
  assert.equal((await call('GET /api/admin/coach/allowlist')).status, 403);
  assert.equal((await call('POST /api/admin/coach/allowlist', { allowedUids: ['u2'] })).status, 403);
  assert.equal(cfg.load().allowlist, null, 'a refused write changes nothing');
});

test('a list filed by the standalone admin page as allowedUids is read, then written back as allowlist', () => {
  fs.writeFileSync(path.join(DIR, 'coach.json'), JSON.stringify({
    enabled: true, provider: 'fixture', allowedUids: ['u2', 'u2', 7]
  }), { mode: 0o600 });
  cfg.reset();

  assert.deepEqual(cfg.load().allowlist, ['u2'], 'read once, cleaned');
  assert.equal(cfg.publicConfig({ id: 'u1' }), null, 'and already in force');

  cfg.save({ community: true });
  const onDisk = JSON.parse(fs.readFileSync(path.join(DIR, 'coach.json'), 'utf8'));
  assert.deepEqual(onDisk.allowlist, ['u2'], 'the next write is in the new shape');
  assert.equal('allowedUids' in onDisk, false);
});
