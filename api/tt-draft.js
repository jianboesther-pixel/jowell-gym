/* 抖音里练的那一场：草稿 + 结束时并进 openGym 的 workout 记录。
 *
 * 草稿单独存（data/tt-draft-<uid>.json），不碰 state-<uid>.json：
 * 网页端可能在同时改计划/饮食，每组都整份写 state 会把那边的改动冲掉。
 * 只有"结束"时合并一次。
 *
 * 纯函数，时间由调用方给，便于测试。
 */

const MAX_SETS = 50;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function emptyDraft(uid, now = Date.now()) {
  return {
    id: 'tt-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    uid,
    startedAt: now,
    updatedAt: now,
    routineId: null,
    routineName: '',
    exercises: []
  };
}

/**
 * 记一组。以 (exId, setNo) 去重：客户端重发（网络重试）不会记成两组。
 * 返回是否真的新增了。
 */
export function addSet(draft, set, now = Date.now()) {
  const exId = String(set && set.exId || '');
  const setNo = Math.round(num(set && set.setNo));
  if (!exId || setNo < 1 || setNo > MAX_SETS) return false;

  let ex = draft.exercises.find(e => e.id === exId);
  if (!ex) {
    ex = { id: exId, name: String(set.name || ''), sets: [] };
    draft.exercises.push(ex);
  }
  if (ex.sets.some(s => s.n === setNo)) return false;       // 幂等

  ex.sets.push({
    n: setNo,
    w: Math.max(0, num(set.w)),
    r: Math.max(0, Math.round(num(set.r))),
    at: Math.max(0, Math.round(num(set.at))) || now
  });
  ex.sets.sort((a, b) => a.n - b.n);
  draft.updatedAt = now;
  return true;
}

/** 加一条热身组：单独存在 entry.warm 里，不计入组数/容量/PR。 */
export function addWarmSet(active, body, now = Date.now()) {
  const exId = String(body && body.exId || '');
  if (!exId) return false;
  active.entries = Array.isArray(active.entries) ? active.entries : [];
  let entry = active.entries.find(e => e.id === exId);
  if (!entry) {
    entry = { id: exId, name: String(body.name || ''), sets: [] };
    active.entries.push(entry);
  }
  entry.warm = Array.isArray(entry.warm) ? entry.warm : [];
  entry.warm.push({
    w: Math.max(0, num(body.w)),
    r: Math.max(0, Math.round(num(body.r))),
    at: Math.max(0, Math.round(num(body.at))) || now
  });
  return true;
}

/** 给某个动作写一句备注（存进这一场）。 */
export function setEntryNote(active, body) {
  const exId = String(body && body.exId || '');
  const note = String(body && body.note || '').trim().slice(0, 60);
  if (!exId) return false;
  active.entries = Array.isArray(active.entries) ? active.entries : [];
  let entry = active.entries.find(e => e.id === exId);
  if (!entry) {
    entry = { id: exId, name: String(body.name || ''), sets: [] };
    active.entries.push(entry);
  }
  if (note) entry.note = note; else delete entry.note;
  return true;
}

/**
 * 撤销一组（点错了 / 重量填错）。返回是否真的删掉了。
 * 删草稿里的那一条，同时把 active 里对应的那一格清空——网页端立刻跟着变。
 */
export function undoSet(draft, set, now = Date.now()) {
  const exId = String(set && set.exId || '');
  const setNo = Math.round(num(set && set.setNo));
  if (!exId || setNo < 1) return false;
  let removed = false;
  const ex = (draft.exercises || []).find(e => e.id === exId);
  if (ex) {
    const before = ex.sets.length;
    ex.sets = ex.sets.filter(s => s.n !== setNo);
    // 删掉中间那组后重排编号，后面的组不会留空档
    ex.sets.forEach((s, i) => { s.n = i + 1; });
    removed = ex.sets.length !== before;
    if (!ex.sets.length) draft.exercises = draft.exercises.filter(e => e !== ex);
  }
  draft.updatedAt = now;
  return removed;
}

/** 撤销时把 state.active 里那一格清掉（`setNo` 从 1 开始）。 */
export function undoActiveSet(active, set, now = Date.now()) {
  const exId = String(set && set.exId || '');
  const setNo = Math.round(num(set && set.setNo));
  if (!active || !exId || setNo < 1) return false;
  const entry = (active.entries || []).find(e => e.id === exId);
  if (!entry || !Array.isArray(entry.sets) || !entry.sets[setNo - 1]) return false;
  // 后面的组往前挪一格，和草稿一致
  entry.sets.splice(setNo - 1, 1);
  if (!entry.sets.length) active.entries = active.entries.filter(e => e !== entry);
  return true;
}

const dayOf = at => {
  const d = new Date(at);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/**
 * 抖音面板写进 state.active —— 和网页端"进行中的训练"是同一个东西。
 * 这样每点一次「完成这组」，网页端就已经能看到这场在练，不用等"结束"。
 */
export function emptyActive(now = Date.now(), name = '') {
  return {
    id: 'tt-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    d: dayOf(now),
    start: now,
    end: null,
    name,
    routineId: null,
    routineIds: [],
    entries: []
  };
}

/** `{w, r, done, at}` 是网页端的 set 形状；按组号放，重复的组号不重复记。 */
export function addActiveSet(active, set, now = Date.now()) {
  const exId = String(set && set.exId || '');
  const setNo = Math.round(num(set && set.setNo));
  if (!exId || setNo < 1 || setNo > MAX_SETS) return false;
  active.entries = Array.isArray(active.entries) ? active.entries : [];
  let entry = active.entries.find(e => e.id === exId);
  if (!entry) {
    entry = { id: exId, name: String(set.name || ''), sets: [] };
    active.entries.push(entry);
  }
  while (entry.sets.length < setNo) entry.sets.push({ w: 0, r: 0, done: false });
  const row = entry.sets[setNo - 1];
  if (row && row.done) return false;                       // 幂等：这组已经记过
  const secs = Math.max(0, Math.round(num(set && set.s)));
  const perSide = set && set.perSide === true;
  const rirRaw = set && set.rir;
  const rir = rirRaw === null || rirRaw === undefined ? null
    : Math.max(0, Math.min(5, Math.round(num(rirRaw))));
  entry.sets[setNo - 1] = {
    w: Math.max(0, num(set.w)),
    r: Math.max(0, Math.round(num(set.r))),
    ...(secs > 0 ? { s: secs } : {}),
    ...(perSide ? { perSide: true } : {}),
    done: true,
    at: Math.max(0, Math.round(num(set.at))) || now,
    ...(rir === null ? {} : { rir })
  };
  return true;
}

/** state.active → 面板续练用的草稿形状。 */
export function activeToDraft(active) {
  const a = active || {};
  return {
    id: a.id || '',
    startedAt: a.start || 0,
    routineId: a.routineId || null,
    routineName: a.name || '',
    exercises: (a.entries || []).map(e => ({
      id: e.id,
      name: e.name || '',
      sets: (e.sets || []).map((s, i) => ({ n: i + 1, w: num(s.w), r: num(s.r), at: num(s.at), rir: s.rir === undefined ? null : s.rir }))
        .filter(s => s.w || s.r)
    })).filter(e => e.sets.length)
  };
}

/** active → openGym 的 workout；没有一组完成时返回 null。 */
export function activeToWorkout(active, now = Date.now()) {
  const draft = { ...activeToDraft(active), startedAt: (active && active.start) || now };
  return toWorkout(draft, now);
}

/**
 * 草稿 → openGym 的 workout 记录。形状对齐 frontend/lib/finish-workout.js：
 * { id, d, start, end, routineIds, routineId, name, bw, entries: [{ id, sets: [{w,r,done,at}], topW }], prs }
 */
export function toWorkout(draft, now = Date.now()) {
  const entries = (draft.exercises || [])
    .map(ex => {
      const sets = (ex.sets || []).map(s => ({ w: s.w, r: s.r, done: true, at: s.at }));
      if (!sets.length) return null;
      return { id: ex.id, sets, topW: Math.max(...sets.map(s => s.w)) || null };
    })
    .filter(Boolean);
  if (!entries.length) return null;

  const all = draft.exercises.flatMap(e => e.sets || []);
  const start = draft.startedAt || now;
  // 结束时间取最后一组的时间，而不是"点结束"的时间：练完把手机收起来、过一会才点结束，
  // 不该把这段空闲算进训练时长。
  const end = Math.max(...all.map(s => s.at || 0), start);
  const routineId = draft.routineId || null;

  return {
    id: 'tt-' + String(draft.id || '').replace(/^tt-/, ''),
    d: dayOf(start),
    start,
    end,
    routineIds: routineId ? [routineId] : [],
    routineId,
    name: draft.routineName || '抖音训练',
    bw: null,
    entries,
    prs: []
  };
}
