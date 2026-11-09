/* 一场训练的状态机 —— 这个 demo 里唯一有逻辑的东西。
 *
 * 抖音半屏面板只做一件事：告诉用户"现在该练哪一组"和"休息还剩几秒"。所以模型刻意小：
 * 一份训练（几个动作，每个几组）＋ 一个休息截止时间。没有账号、没有同步、没有历史。
 *
 * 计时只用 `restEndsAt` 时间戳，不累加 interval：用户把面板划走、去刷全屏视频，小程序会被
 * 挂起，回来时用时间差校正（`restLeft` / `restOver`），而不是从头再数。
 *
 * CommonJS：抖音小程序用 require，Node 的测试用同一份文件，纯函数，没有 tt.* 依赖。
 */

const DEFAULT_REST_SEC = 90;
const KG_STEP = 2.5;
const REPS_STEP = 1;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function createSession(now = Date.now()) {
  return {
    startedAt: now,
    exIdx: 0,
    finished: false,
    restFrom: null,
    restEndsAt: null,
    // 今天的训练：先写死两份，接后端之后由 openGym 的计划生成。
    exercises: [
      // `cue` 是教练那句最要紧的口令：全屏进来看得见，半屏里被裁掉，不占面板地方。
      { id: '0025', name: '杠铃卧推', cue: '肩胛后缩下沉，杠下到胸线，别让肩先走', weight: 60, reps: 8, sets: 4, done: 0, restSec: 90 },
      { id: '0032', name: '杠铃划船', cue: '髋铰链固定，肘往髋拉，别用腰起', weight: 50, reps: 10, sets: 3, done: 0, restSec: 90 }
    ]
  };
}

const current = s => (s.exercises[s.exIdx] || null);

/** 这一动作还有几组没做，0 表示做完了。 */
function remainingSets(s) {
  const ex = current(s);
  return ex ? Math.max(0, ex.sets - ex.done) : 0;
}

const isResting = s => s.restEndsAt != null;

/** 剩余休息毫秒；不在休息时为 0。 */
function restLeft(s, now = Date.now()) {
  if (!isResting(s)) return 0;
  return Math.max(0, s.restEndsAt - now);
}

/** 时间到了没有 —— 面板据此把"休息"整块切成"下一组"。 */
function restOver(s, now = Date.now()) {
  return isResting(s) && now >= s.restEndsAt;
}

/** 计时结束、用户已经看到"下一组"之后调用：清掉休息，回到待完成。 */
/** 递减组：掉 10% 重量（按 2.5 取整），马上再记一组，不休息。 */
function dropSet(s, now = Date.now()) {
  const ex = current(s);
  if (!ex || s.finished) return s;
  if (remainingSets(s) === 0) return s;
  const next = Math.max(2.5, Math.round((ex.weight * 0.9) / 2.5) * 2.5);
  ex.weight = clamp(next, 0, 500);
  finishSet(s, now);
  endRest(s);   // 递减组不休息：记完立刻清掉倒计时
  return s;
}

/** 休息暂停：记一组后只歇 restPauseSec 秒，然后再来一组同样的重量。 */
function restPause(s, now = Date.now()) {
  const ex = current(s);
  if (!ex || s.finished) return s;
  if (remainingSets(s) === 0) return s;
  finishSet(s, now);
  if (remainingSets(s) > 0) {
    const short = clamp(Number(ex.restPauseSec) || 15, 5, 60);
    s.restFrom = now;
    s.restEndsAt = now + short * 1000;
  }
  return s;
}

/** 下一个同组动作的下标；不在超集里返回 -1。 */
function nextInGroup(s, fromIdx) {
  const base = s.exercises[fromIdx];
  if (!base || !base.group) return -1;
  for (let i = fromIdx + 1; i < s.exercises.length; i++) {
    const ex = s.exercises[i];
    if (ex && ex.group === base.group && ex.done < ex.sets) return i;
  }
  for (let i = 0; i < fromIdx; i++) {
    const ex = s.exercises[i];
    if (ex && ex.group === base.group && ex.done < ex.sets) return i;
  }
  return -1;
}

/** 把当前动作和下一个动作绑成超集（互为一组）。 */
/** 从这一场里删掉某个动作（当前那个），后面的往前挪。删光了就结束。 */
function removeExercise(s, index = s.exIdx) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= s.exercises.length) return s;
  s.exercises.splice(i, 1);
  if (!s.exercises.length) { s.finished = true; return s; }
  s.exIdx = Math.min(i, s.exercises.length - 1);
  endRest(s);
  return s;
}

/** 当前动作上移（-1）/ 下移（+1）。 */
function moveExercise(s, delta) {
  const i = s.exIdx;
  const j = i + Number(delta);
  if (!Number.isInteger(j) || j < 0 || j >= s.exercises.length) return s;
  const t = s.exercises[i];
  s.exercises[i] = s.exercises[j];
  s.exercises[j] = t;
  s.exIdx = j;
  return s;
}

function linkSuperset(s) {
  const i = s.exIdx;
  const a = s.exercises[i];
  const b = s.exercises[i + 1];
  if (!a || !b) return s;
  const g = 'g' + i;
  a.group = g;
  b.group = g;
  return s;
}

/** 拆掉当前动作所在的超集。 */
function unlinkSuperset(s) {
  const a = s.exercises[s.exIdx];
  if (!a || !a.group) return s;
  const g = a.group;
  s.exercises.forEach(ex => { if (ex && ex.group === g) ex.group = null; });
  return s;
}

function endRest(s) {
  s.restEndsAt = null;
  s.restFrom = null;
  return s;
}

/**
 * 完成一组。
 * - 待完成时：记一组，然后进入休息（最后一组不休息）。
 * - 休息中再点：说明是"先练完、再一条条补记"，照样记一组，并把休息倒计时重置——
 *   刚做完的一组之后，本来就该重新开始休息。
 * 最后一组做完直接停在"本动作完成"。
 */
/** 这一组该做几次：金字塔组按 repsList 取，普通组用固定次数。 */
function repsForSet(ex) {
  if (!ex) return 0;
  if (ex.mode === 'time') {
    const list = Array.isArray(ex.secsList) ? ex.secsList : null;
    if (list && list.length) return list[Math.min(ex.done, list.length - 1)] || ex.secs || 30;
    return ex.secs || 30;
  }
  const list = Array.isArray(ex.repsList) ? ex.repsList : null;
  if (list && list.length) {
    const i = Math.min(ex.done, list.length - 1);
    return list[i] || ex.reps || 8;
  }
  return ex.reps || 8;
}

/** 这一组该用多重：每组不同重量时按表取，否则用固定重量。 */
function weightForSet(ex) {
  if (!ex) return 0;
  const list = Array.isArray(ex.weightList) ? ex.weightList : null;
  if (list && list.length) {
    const i = Math.min(ex.done, list.length - 1);
    const w = Number(list[i]);
    if (Number.isFinite(w) && w > 0) return w;
  }
  return ex.weight || 0;
}

function finishSet(s, now = Date.now()) {
  if (s.finished) return s;
  const ex = current(s);
  if (!ex || remainingSets(s) === 0) return s;
  ex.done = clamp(ex.done + 1, 0, ex.sets);
  if (ex.group) {
    // 超集：这一组做完先去找同组的下一个动作，两个都做完才休息
    const partner = nextInGroup(s, s.exIdx);
    if (partner >= 0) {
      s.exIdx = partner;
      const p = s.exercises[partner];
      s.restFrom = null;
      s.restEndsAt = null;
      // 重量沿用搭档自己的重量，次数也是
      void p;
      return s;
    }
    if (ex.done < ex.sets) {
      s.restFrom = now;
      s.restEndsAt = now + ex.restSec * 1000;
      return s;
    }
    endRest(s);
    return s;
  }
  if (remainingSets(s) > 0) {
    s.restFrom = now;
    s.restEndsAt = now + ex.restSec * 1000;
  } else {
    endRest(s);
  }
  return s;
}

/**
 * 撤销上一组：点错了或重量填错。返回被撤掉的组号（0 表示没有可撤的）。
 * 调用方拿这个组号去撤服务端那条记录。
 */
function undoSet(s) {
  const ex = current(s);
  if (!ex || ex.done <= 0) return 0;
  const no = ex.done;
  ex.done = clamp(ex.done - 1, 0, ex.sets);
  endRest(s);
  return no;
}
/** 加一组：不改变已经完成的组数，只把目标 +1。 */
function addSet(s) {
  const ex = current(s);
  if (ex) ex.sets = clamp(ex.sets + 1, 1, 20);
  return s;
}

/** 跳过休息，马上开始下一组。 */
function skipRest(s) {
  return endRest(s);
}

/**
 * 休息中加/减时间。少到 0 或更少就直接结束休息——按了"−30s"却还剩 0:00 卡在那里没有意义。
 * 不在休息时无效。
 */
function adjustRest(s, deltaSec, now = Date.now()) {
  if (!isResting(s)) return s;
  const next = s.restEndsAt + deltaSec * 1000;
  if (next <= now) return endRest(s);
  s.restEndsAt = next;
  return s;
}

/** 重量 / 次数的手动微调，边界防止把 demo 点成负数。 */
function adjustWeight(s, delta) {
  const ex = current(s);
  if (!ex) return s;
  const list = Array.isArray(ex.weightList) ? ex.weightList : null;
  if (list && list.length) {
    const i = Math.min(ex.done, list.length - 1);
    const next = clamp((Number(list[i]) || 0) + delta, 0, 500);
    list[i] = next;
    ex.weight = next;          // 固定重量也跟着走，去掉表时不会跳回旧值
    return s;
  }
  ex.weight = clamp(ex.weight + delta, 0, 500);
  return s;
}

/** 秒数制动作加减秒数（平板支撑这类）。 */
function adjustSecs(s, delta) {
  const ex = current(s);
  if (ex) ex.secs = clamp((Number(ex.secs) || 30) + delta, 5, 600);
  return s;
}

/** 直接设重量（面板里点数值输入用）。 */
function setWeight(s, value) {
  const ex = current(s);
  if (!ex) return s;
  const w = clamp(value, 0, 500);
  const list = Array.isArray(ex.weightList) ? ex.weightList : null;
  if (list && list.length) list[Math.min(ex.done, list.length - 1)] = w;
  ex.weight = w;
  return s;
}

/** 直接设次数 / 秒数。 */
function setReps(s, value) {
  const ex = current(s);
  if (!ex) return s;
  if (ex.mode === 'time') ex.secs = clamp(value, 5, 600);
  else ex.reps = clamp(value, 1, 100);
  return s;
}

function adjustReps(s, delta) {
  const ex = current(s);
  if (ex) ex.reps = clamp(ex.reps + delta, 1, 100);
  return s;
}

/** 下一个动作的名字，最后一个时为空 —— 上面那块用来告诉用户"后面还有什么"。 */
function nextName(s) {
  const ex = s.exercises[s.exIdx + 1];
  return ex ? ex.name : '';
}

/**
 * 换动作：器械被占、或者今天不想练这个。
 * 已经记过的组留在"原来那个动作"上（草稿按 exId 存），新的这个从第 1 组开始，
 * 所以补记的历史不会被算到替代动作头上。重量默认沿用当前动作，用户再自己调。
 */
function swapExercise(s, next) {
  if (!next || !next.id) return s;
  const ex = current(s);
  if (!ex) return s;
  s.exercises[s.exIdx] = {
    id: String(next.id),
    name: String(next.name || next.id),
    cue: '',
    weight: typeof next.weight === 'number' ? clamp(next.weight, 0, 500) : ex.weight,
    reps: typeof next.reps === 'number' ? clamp(next.reps, 1, 100) : ex.reps,
    sets: typeof next.sets === 'number' ? clamp(next.sets, 1, 20) : ex.sets,
    done: 0,
    restSec: typeof next.restSec === 'number' ? clamp(next.restSec, 10, 600) : ex.restSec
  };
  endRest(s);
  return s;
}

/**
 * 换成后端给的今日计划。休息日 / 空计划就把 demo 原样留着——面板上有个能点的东西，
 * 好过一片空白。计划里的重量是上次的重量，不是这次必须做的重量。
 */
function withPlan(s, plan) {
  const r = plan && plan.training && Array.isArray(plan.routines) ? plan.routines[0] : null;
  const list = r && Array.isArray(r.exercises) ? r.exercises : [];
  if (!list.length) return s;
  s.planName = r.name || '';
  s.exercises = list.map(e => ({
    id: e.id,
    name: e.name,
    cue: '',
    weight: e.weight || 0,
    reps: e.reps || 8,
    sets: e.sets || 3,
    done: 0,
    group: e.group || null,
    mode: e.mode === 'time' ? 'time' : 'reps',
    perSide: e.perSide === true,
    repsList: Array.isArray(e.repsList) && e.repsList.length ? e.repsList.slice(0, 20) : null,
    weightList: Array.isArray(e.weightList) && e.weightList.length ? e.weightList.slice(0, 20) : null,
    restSec: e.restSec || DEFAULT_REST_SEC
  }));
  s.exIdx = 0;
  s.finished = false;
  s.restEndsAt = null;
  s.restFrom = null;
  return s;
}

/** 本动作做完 / 主动跳过时，切到下一个；没有下一个就结束整场。 */
/**
 * 把服务端草稿并回 session：按动作 id 对齐，已经记过的组标成 done。
 * 关掉小程序再进来，不会从第 1 组重来，也不会把已记的组算两遍。
 */
function resumeFromDraft(s, draft) {
  const list = (draft && draft.exercises) || [];
  if (!list.length) return s;
  for (const d of list) {
    const ex = s.exercises.find(e => e.id === d.id);
    if (!ex) continue;
    const n = Array.isArray(d.sets) ? d.sets.length : 0;
    if (n > ex.sets) ex.sets = n;              // 实际比计划多做了几组
    ex.done = Math.min(ex.sets, n);
    const last = n ? d.sets[n - 1] : null;
    if (last && last.w) ex.weight = last.w;
    if (last && last.r) ex.reps = last.r;
  }
  const next = s.exercises.findIndex(e => e.done < e.sets);
  s.exIdx = next < 0 ? s.exercises.length - 1 : next;
  s.restEndsAt = null;
  s.restFrom = null;
  return s;
}

/** 自由训练里的一个新动作：没有计划，就用最普通的默认值。 */
const freeExercise = e => ({
  id: String(e && e.id || ''),
  name: String(e && (e.name || e.id) || ''),
  cue: '',
  weight: 0,
  reps: 8,
  sets: 3,
  done: 0,
  restSec: DEFAULT_REST_SEC
});

/** 从零开始一场自由训练：今天没计划、或者想加练。 */
function startFree(s, ex) {
  if (!ex || !ex.id) return s;
  s.exercises = [freeExercise(ex)];
  s.exIdx = 0;
  s.finished = false;
  s.free = true;
  s.planName = '自由训练';
  endRest(s);
  return s;
}

/** 自由训练中再添一个动作。 */
function addExercise(s, ex) {
  if (!ex || !ex.id) return s;
  s.exercises.push(freeExercise(ex));
  return s;
}

/** 主动结束整场（不等做完最后一个动作）：面板上的「结束训练」。 */
function endSession(s) {
  s.finished = true;
  endRest(s);
  return s;
}

function nextExercise(s) {
  if (s.exIdx >= s.exercises.length - 1) {
    s.finished = true;
    endRest(s);
    return s;
  }
  s.exIdx += 1;
  endRest(s);
  return s;
}

/** 整场进度，给结束时那张卡用。 */
function totals(s) {
  const total = s.exercises.reduce((n, e) => n + e.sets, 0);
  const done = s.exercises.reduce((n, e) => n + e.done, 0);
  return { total, done };
}

/** 面板此刻该长什么样 —— 一个纯函数，UI 只负责画。 */
function viewState(s, now = Date.now()) {
  if (s.finished) return 'finished';
  const ex = current(s);
  if (!ex) return 'finished';
  if (restOver(s, now)) return 'set';         // 到点即视为可以开始下一组
  if (isResting(s)) return 'rest';
  if (remainingSets(s) === 0) return 'exerciseDone';
  return 'set';
}

/** 30000 → "0:30"，给倒计时用。 */
function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

module.exports = {
  DEFAULT_REST_SEC, KG_STEP, REPS_STEP,
  createSession, current, remainingSets, isResting, restLeft, restOver, endRest,
  repsForSet, weightForSet, setWeight, setReps, adjustSecs, removeExercise, moveExercise, finishSet, dropSet, restPause, linkSuperset, unlinkSuperset, nextInGroup, addSet, skipRest, adjustRest, adjustWeight, adjustReps, nextExercise, endSession, resumeFromDraft, nextName, withPlan, totals, viewState, mmss, swapExercise, undoSet, startFree, addExercise
};
