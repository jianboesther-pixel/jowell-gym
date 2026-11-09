/* HTTP surface for the Coach — user routes and admin routes.
 *
 * Written as a factory taking server.js's own helpers rather than importing them: the helpers
 * are closures over the db and the session secret, and passing them in keeps this module free
 * of a cycle (and trivially testable against fakes).
 */
import * as cfgStore from './config.js';
import * as jobs from './jobs.js';
import { computeCohort } from './cohort.js';
import { adapterFor } from './adapters/index.js';
import { canDropPrivileges } from './adapters/spawn.js';
import { DATA_CATEGORIES } from './core/payload.js';
import { validateBaseUrl, validateHeaders, baseUrlFor } from './core/providers.js';

// Job failures the user sees, in the app's own voice. The raw provider detail never reaches
// them — it goes to the admin card, which is where someone can act on it (FR-47).
const USER_ERROR = {
  off: 'the Coach is not set up on this instance',
  busy: 'the Coach is already thinking about your training',
  cap: 'the Coach is taking a rest day, try again tomorrow',
  consent: 'the Coach needs your go-ahead first',
  // Verbatim, because it tells the user the one thing that resolves it and names who resolves
  // it. A vaguer message here turns into a support question for the person running the box.
  shared: cfgStore.SHARED_ACCOUNT_REFUSAL,
  unprivileged: 'the Coach is switched off on this instance for safety reasons',
  // Same posture as `shared`: name the one thing that resolves it, since the person who can is
  // someone else. The client shows its own translated line for the class.
  'no-access': 'this profile has not been given the Coach on this instance — ask its admin'
};
const HTTP_FOR = { off: 503, busy: 409, cap: 429, consent: 403, shared: 409, unprivileged: 503, 'no-access': 403 };

export function coachRoutes({ json, readBody, readSession, requireAdmin, isAdmin = () => false, knownUserIds = () => [] }) {
  /** Every user route starts the same way: signed in, feature on, feature reachable, and — when
   *  the instance restricts it — allowed. The class goes beside the words, as enqueue's refusal
   *  sends it: the app shows its own translated line for the class, and these English words only
   *  where it has none. */
  const guard = (req, res) => {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    if (!cfgStore.isEnabled() || !cfgStore.isConnected()) { json(res, 503, { error: USER_ERROR.off, code: 'off' }); return null; }
    // Enforced here and in publicConfig alike: the client never renders Coach UI for an unlisted
    // profile, so this is what stops one asking the server directly.
    if (!cfgStore.isAllowed(user.id, isAdmin(user))) { json(res, 403, { error: USER_ERROR['no-access'], code: 'no-access' }); return null; }
    return user;
  };
  const failEnqueue = (res, e) => {
    if (e instanceof jobs.CoachError) return json(res, HTTP_FOR[e.code] || 400, { error: USER_ERROR[e.code] || e.message, code: e.code });
    throw e;
  };

  return {
    /* ------------------------------ user ------------------------------ */

    // What the consent screen has to disclose, straight from the module that builds payloads,
    // so the screen cannot drift from what actually leaves (FR-09). Signed in only: the screen
    // that reads it sits behind a session anyway, and on an invite-only instance which provider
    // this box is wired to is nobody's business who has not been let in.
    'GET /api/coach/disclosure': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      // Same answer an instance with the Coach off gives: a profile that cannot use the feature
      // has no business learning which provider this box is wired to.
      if (!cfgStore.isAllowed(user.id, isAdmin(user))) return json(res, 403, { error: USER_ERROR['no-access'], code: 'no-access' });
      const cfg = cfgStore.load();
      json(res, 200, {
        provider: cfg.provider,
        providerLabel: cfgStore.providerMeta(cfg).label,
        categories: DATA_CATEGORIES,
        version: 1
      });
    },

    'GET /api/coach/status': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      // The chat composer's maxLength rides on this poll rather than a one-off fetch, so an
      // admin raising or lowering the limit reaches an open chat within one poll cycle.
      json(res, 200, { ...jobs.status(user.id), maxMessageLen: cfgStore.load().maxMessageLen });
    },

    'POST /api/coach/plan': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        // The admin's configured length is the real limit; jobs.enqueue is where it is actually
        // enforced (it is the one place that already loads config for every job). This slice is
        // only a sanity ceiling so an oversized string is not carried further than it has to be.
        const job = jobs.enqueue(user.id, {
          kind: 'create',
          intake: body.intake || null,
          lang: body.lang,
          refine: body.refine ? String(body.refine).slice(0, cfgStore.MAX_MESSAGE_LEN_CEILING) : null
        });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    'POST /api/coach/review': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, {
          kind: 'review',
          lang: body.lang,
          note: body.note ? String(body.note).slice(0, cfgStore.MAX_MESSAGE_LEN_CEILING) : null
        });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    // One question, answered in prose: training, food, recovery. Nothing to apply — the reply is
    // a chat bubble, and the client clears the pending as soon as it has read it.
    'POST /api/coach/ask': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      const question = String(body.text || '').trim().slice(0, cfgStore.load().maxMessageLen);
      if (!question) return json(res, 400, { error: 'no question' });
      try {
        const job = jobs.enqueue(user.id, { kind: 'ask', lang: body.lang, text: question });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    // One workout, read closely. Nothing to apply — the card is kept in the user's log.
    'POST /api/coach/debrief': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, { kind: 'debrief', lang: body.lang, workoutId: body.workoutId ? String(body.workoutId).slice(0, 40) : null });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    /* How this profile sits against everyone else on the instance who opted in: medians only,
       at least three people, and nothing for a profile that does not share itself. */
    'GET /api/coach/cohort': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      if (!cfgStore.load().community) return json(res, 200, { ok: false, enabled: false });
      json(res, 200, computeCohort(user.id));
    },
    'POST /api/coach/cohort/share': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      json(res, 200, { ok: true, sharing: jobs.setShare(user.id, !!body.share) });
    },

    'POST /api/coach/pending/resolve': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      json(res, 200, jobs.resolvePending(user.id, {
        accepted: Array.isArray(body.accepted) ? body.accepted : [],
        rejected: Array.isArray(body.rejected) ? body.rejected : [],
        dismissed: !!body.dismissed,
        read: !!body.read
      }));
    },

    // Consent withdrawn, or the profile turned the Coach off: drop everything held server-side
    // for them at once, without waiting for a sync to carry the news (D5).
    'POST /api/coach/forget': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      jobs.clearUser(user.id);
      json(res, 200, { ok: true });
    },

    /* ------------------------------ admin ------------------------------ */

    'GET /api/admin/coach': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const cfg = cfgStore.load();
      const adapter = adapterFor(cfg.provider);
      // For the runtime-backed providers this asks "is the runtime there"; for an HTTPS one it
      // lists the models with the stored key, which is the round trip the card wants anyway.
      const cred = adapter?.spawns === false ? cfgStore.credentialFor(cfgStore.boundUidFor(cfg)) : undefined;
      const check = adapter ? await adapter.check(cfg, cfgStore.jobEnv(process.env.TMPDIR || '/tmp', cred?.ok ? cred : undefined)) : { ok: false, error: 'unknown provider' };
      const log = cfg.log || [];
      const today = new Date().toISOString().slice(0, 10);
      json(res, 200, {
        disabledByEnv: cfgStore.COACH_DISABLED,
        enabled: !!cfg.enabled,
        provider: cfg.provider,
        providers: Object.entries(cfgStore.PROVIDERS).map(([id, p]) => ({
          id, label: p.label, runtime: p.runtime,
          setupToken: !!p.setupToken, deviceLogin: !!p.deviceLogin, apiKey: !!p.apiKeyEnv,
          http: !!p.http, baseUrl: !!p.baseUrl, keyOptional: !!p.keyOptional, keyPlaceholder: p.keyPlaceholder || null,
          defaultModel: p.defaultModel || null,
          // Which providers already hold a key — so switching chips is visibly not a reset.
          connected: !!(cfgStore.authFor(cfg, id) && cfgStore.authFor(cfg, id).data)
        })),
        model: cfgStore.modelFor(cfg),
        models: cfg.models,
        baseUrl: cfgStore.providerMeta(cfg).http ? baseUrlFor(cfg.provider, cfg) : null,
        // Extra static headers this endpoint is called with (compatible endpoints only).
        // Values, not just names: the admin wrote them and needs to see them to edit them.
        // Plaintext next to baseUrl — routing aids, not credentials (the key stays encrypted).
        headers: cfgStore.providerMeta(cfg).http ? (cfgStore.optionsFor(cfg).headers || null) : null,
        knownModels: check.models || null,
        caps: cfg.caps,
        maxMessageLen: cfg.maxMessageLen,
        maxOutputTokens: cfg.maxOutputTokens,
        community: !!cfg.community,
        runtime: { ok: !!check.ok, version: check.version || null, error: check.error || null, needsKey: !!check.needsKey },
        authMode: cfg.authMode,
        boundUid: cfgStore.boundUidFor(cfg),
        /* Whether a credential is filed, and whose — never the credential. `unreadable` is its
           own state rather than "not connected" because it has a specific cause and a specific
           fix: ./data was restored without its `secret`, so the blob is intact and undecryptable,
           and connecting again is the way out. */
        auth: (() => {
          const meta = cfgStore.providerMeta(cfg);
          const rec = cfgStore.authFor(cfg);
          if (!meta.oauthEnv && !meta.apiKeyEnv) return { state: 'not-required' };
          if (!rec || !rec.data) return { state: meta.keyOptional ? 'optional' : 'none' };
          if (!cfgStore.decrypt(rec.data)) return { state: 'unreadable' };
          return { state: 'connected', type: rec.type || null, account: rec.account || null, connectedAt: rec.connectedAt || null };
        })(),
        // Whether the privilege drop can actually be performed. Surfaced because the control
        // now fails closed: if this reads false, no job runs, and the admin needs to know that
        // from the card rather than from a user reporting that nothing happens. An HTTPS
        // provider has no process to drop, and the card must not show a red banner for it.
        unprivileged: adapter?.spawns === false
          ? { ok: true, dropped: false, why: 'this provider runs no child process' }
          : canDropPrivileges(),
        // Counts and outcomes only — never intake answers, payloads or proposals (FR-12/A4).
        // The same counter the instance cap reads, so the card and the cap cannot disagree.
        jobsToday: cfg.daily?.date === today ? cfg.daily.count : 0,
        lastSuccess: cfgStore.lastSuccess(),
        lastError: cfgStore.lastError(),
        recent: log.slice(-20).reverse().map(e => ({ at: e.at, kind: e.kind, trigger: e.trigger, outcome: e.outcome, errorClass: e.errorClass, ms: e.ms }))
      });
    },

    'POST /api/admin/coach/config': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const patch = {};
      if (body.enabled !== undefined) patch.enabled = !!body.enabled;
      const current = cfgStore.load();
      if (body.provider !== undefined) {
        if (!cfgStore.PROVIDERS[body.provider]) return json(res, 400, { error: 'unknown provider' });
        // Credentials, model and endpoint are all keyed by provider — switching never drops them.
        patch.provider = body.provider;
      }
      const target = patch.provider || current.provider;
      if (body.model !== undefined) {
        patch.models = { ...current.models };
        if (body.model) patch.models[target] = String(body.model).slice(0, 80); else delete patch.models[target];
      }
      if (body.baseUrl !== undefined) {
        if (!cfgStore.PROVIDERS[target].baseUrl) return json(res, 400, { error: `${target} has a fixed endpoint` });
        const v = validateBaseUrl(body.baseUrl);
        if (!v.ok) return json(res, 400, { error: v.error });
        // An empty value passes the validator on purpose: for a provider with a default it means
        // "back to the default". A provider with none (compatible) would be saved pointing at ''
        // and baseUrlFor() would hand the adapter nothing to call. The phone's CoachSetup refuses
        // the same case; the admin route has to as well or the hole just moves.
        if (!v.value && !cfgStore.PROVIDERS[target].defaultBase) return json(res, 400, { error: `${target} has no default endpoint, enter one` });
        patch.providerOptions = { ...current.providerOptions, [target]: { ...(current.providerOptions[target] || {}), baseUrl: v.value } };
      }
      if (body.headers !== undefined) {
        if (!cfgStore.PROVIDERS[target].baseUrl) return json(res, 400, { error: `${target} has a fixed endpoint` });
        const h = validateHeaders(body.headers);
        if (!h.ok) return json(res, 400, { error: h.error });
        // Build on the patch, not on current: a body carrying baseUrl AND headers must keep both.
        const next = { ...((patch.providerOptions && patch.providerOptions[target]) || current.providerOptions[target] || {}) };
        if (h.value) next.headers = h.value; else delete next.headers;
        patch.providerOptions = { ...current.providerOptions, ...(patch.providerOptions || {}), [target]: next };
      }
      if (body.community !== undefined) patch.community = !!body.community;
      if (body.caps) {
        patch.caps = {
          perProfileDaily: Math.max(0, Math.min(200, +body.caps.perProfileDaily || 0)),
          instanceDaily: Math.max(0, Math.min(5000, +body.caps.instanceDaily || 0))
        };
      }
      if (body.maxMessageLen !== undefined) {
        patch.maxMessageLen = Math.max(
          cfgStore.MAX_MESSAGE_LEN_FLOOR,
          Math.min(cfgStore.MAX_MESSAGE_LEN_CEILING, +body.maxMessageLen || current.maxMessageLen)
        );
      }
      if (body.maxOutputTokens !== undefined) {
        patch.maxOutputTokens = Math.max(
          cfgStore.MAX_OUTPUT_TOKENS_FLOOR,
          Math.min(cfgStore.MAX_OUTPUT_TOKENS_CEILING, +body.maxOutputTokens || current.maxOutputTokens)
        );
      }
      cfgStore.save(patch);
      json(res, 200, { ok: true });
    },

    'POST /api/admin/coach/test': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const r = await jobs.testRun();
      json(res, 200, r);
    },

    /* The models the configured endpoint serves, so the card can offer a list rather than a
       text field that goes stale with every model release. HTTPS providers only. */
    'POST /api/admin/coach/models': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const cfg = cfgStore.load();
      const adapter = adapterFor(cfg.provider);
      if (!adapter || typeof adapter.models !== 'function') return json(res, 200, { ok: false, error: 'this provider does not list models', models: [] });
      const cred = cfgStore.credentialFor(cfgStore.boundUidFor(cfg));
      const env = cfgStore.jobEnv(process.env.TMPDIR || '/tmp', cred.ok ? cred : undefined);
      json(res, 200, await adapter.models(cfg, env));
    },

    /* Connect the instance credential. Deferred while the fixture was the only provider — it
       has none, so there was nothing to connect. The real providers give it something to hold,
       which is the condition this route was waiting on.

       The token is accepted once and never read back: it is encrypted here and leaves again
       only as an environment variable on a job's child process. `type` has to match a variable
       the configured provider actually declares, so a Codex key cannot be filed under Claude
       and then silently go nowhere at job time. */
    'POST /api/admin/coach/connect': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const cfg = cfgStore.load();
      // A key may be filed for a provider that is not the active one, so the chips can be
      // prepared ahead of switching; by default it is the active provider's.
      const provider = body.provider !== undefined ? String(body.provider) : cfg.provider;
      if (!cfgStore.PROVIDERS[provider]) return json(res, 400, { error: 'unknown provider' });
      const meta = cfgStore.PROVIDERS[provider];
      const type = String(body.type || '');
      const envVar = (type === 'cli-token' || type === 'oauth') ? meta.oauthEnv
        : type === 'apikey' ? meta.apiKeyEnv : null;
      if (!envVar) {
        return json(res, 400, { error: `${provider} does not take a credential of type "${type}"` });
      }
      const token = String(body.token || '').trim();
      if (!token) return json(res, 400, { error: 'no token supplied' });
      cfgStore.saveAuth(provider, {
        type, account: String(body.account || '').slice(0, 120), data: cfgStore.encrypt({ token }), connectedAt: new Date().toISOString()
      });
      json(res, 200, { ok: true });
    },

    'POST /api/admin/coach/disconnect': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const provider = body.provider !== undefined ? String(body.provider) : cfgStore.load().provider;
      if (!cfgStore.PROVIDERS[provider]) return json(res, 400, { error: 'unknown provider' });
      cfgStore.saveAuth(provider, null);
      json(res, 200, { ok: true });
    },

    /* Who may use the Coach, besides admins. One list and one switch: `null` means "everyone this
       instance lets in", which is what every instance had before this key existed. Ids that no
       longer exist are dropped on the way in, so a deleted profile cannot keep a seat on the list
       (and cannot silently hand it to whoever is created next with that id). The route is the one
       the standalone admin page used, so a bookmark to it keeps working. */
    'GET /api/admin/coach/allowlist': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const list = cfgStore.load().allowlist;
      json(res, 200, { restricted: Array.isArray(list), allowedUids: Array.isArray(list) ? list : null });
    },

    'POST /api/admin/coach/allowlist': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      // Two shapes rather than one: `{ restricted: false }` opens the Coach to everyone, and
      // `{ allowedUids: [...] }` restricts it to exactly that list — an empty array meaning
      // "admins only", which is a state an admin may legitimately want mid-setup.
      if (body.restricted === false) {
        cfgStore.setAllowlist(null);
        return json(res, 200, { restricted: false, allowedUids: null });
      }
      if (!Array.isArray(body.allowedUids)) return json(res, 400, { error: 'allowedUids must be an array, or restricted must be false' });
      const known = new Set(knownUserIds());
      const ids = known.size ? body.allowedUids.filter(id => known.has(id)) : body.allowedUids;
      const cfg = cfgStore.setAllowlist(ids);
      json(res, 200, { restricted: true, allowedUids: cfg.allowlist });
    },

    /* Still absent: `authMode`, and with it the per-profile credential routes. Instance mode is
       the whole of what these two routes serve, and per-profile needs its own connect/clear pair
       against saveProfileAuth/clearProfileAuth — a switch with nothing on the other side is worse
       than no switch, so it waits for the PR that builds that side. */

    /* Whose account this profile is about to spend. Its own route because both the Coach screen
       and the admin card must state it, and neither should be inferring it from settings. */
    'GET /api/coach/account': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (!cfgStore.isAllowed(user.id, isAdmin(user))) return json(res, 403, { error: USER_ERROR['no-access'], code: 'no-access' });
      json(res, 200, cfgStore.accountFor(user.id));
    }
  };
}
