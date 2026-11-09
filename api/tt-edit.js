/* 补录和删除训练。
 *
 * 补录只写 workouts（和网页端的记录同形），不动 active/草稿：
 * 那两样是"正在练"的东西，补录的是已经练完的。
 * 纯函数，返回新的 state。
 */
const pad = n => String(n).padStart(2, '0');

const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const posInt = (v, d) => Math.max(1, Math.min(50, Math.round(num(v) || d)));

/** 中午 12 点落时间戳：和网页端"没有开始时间就用当天正午"的规则一致。 */
const noonOf = day => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
};

/**
 * 补录一场。
 * @param {object} state
 * @param {{d?:string, name?:string, ex?:Array<{id:string, sets?:number, reps?:number, weight?:number}>}} body
 * @param {number} now
 */
export function addPastWorkout(state, body, now = Date.now()) {
  const next = { ...(state || {}) };
  const b = body || {};
  const d = validDay(b.d) ? b.d : null;
  if (!d) return next;

  const list = Array.isArray(b.ex) ? b.ex.slice(0, 20) : [];
  const entries = [];
  for (const e of list) {
    const id = String(e && e.id || '');
    if (!id) continue;
    const sets = posInt(e.sets, 1);
    const reps = posInt(e.reps, 8);
    const w = Math.max(0, Math.min(1000, num(e.weight)));
    entries.push({
      id,
      sets: Array.from({ length: sets }, (_, i) => ({ w, r: reps, done: true, at: noonOf(d) + i * 60000 })),
      topW: w || null
    });
  }
  if (!entries.length) return next;

  const start = noonOf(d);
  const workout = {
    id: 'ttlog-' + now.toString(36) + Math.floor(Math.random() * 1000).toString(36),
    d,
    start,
    end: start + entries.reduce((n, e) => n + e.sets.length, 0) * 60000,
    name: String(b.name || '补录训练').slice(0, 40),
    routineId: null,
    routineIds: [],
    bw: null,
    entries,
    prs: [],
    logged: true            // 标记"补的"，网页端可以据此区分
  };
  next.workouts = (Array.isArray(next.workouts) ? next.workouts : []).concat([workout]);
  return next;
}

/** 删一场。顺手清掉 ttLiveId，免得它指向一条已经不在的记录。 */
export function removeWorkout(state, id) {
  const next = { ...(state || {}) };
  const key = String(id || '');
  next.workouts = (Array.isArray(next.workouts) ? next.workouts : []).filter(w => w && w.id !== key);
  if (next.ttLiveId === key) next.ttLiveId = null;
  return next;
}
