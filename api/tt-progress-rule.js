/* 进阶规则：线性 / 双重进阶。
 * 输入是"上次这个动作做了什么"，输出是"今天该用多重、做几次"。
 * 纯函数，便于测试；服务端在生成今天的计划时调用。
 */
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 上次这一场的表现：最大重量、最多次数、是否全部达到目标。 */
export function lastPerformance(sets, target) {
  const done = (Array.isArray(sets) ? sets : []).filter(x => x && x.done);
  if (!done.length) return null;
  let topW = 0, topR = 0;
  for (const s of done) {
    topW = Math.max(topW, num(s.w));
    topR = Math.max(topR, num(s.r));
  }
  const allHit = done.every(s => num(s.r) >= target);
  return { topW, topR, allHit, sets: done.length };
}

/**
 * 算今天的建议重量 / 次数。
 * rule = { prog: 'off'|'linear'|'double', inc, target, base }
 *  - linear：上次每组都到目标次数 → 加 inc
 *  - double：先加次数，次数到目标再加重量并把次数降回 base
 */
export function nextTarget({ last, rule, fallbackWeight = 0, fallbackReps = 8 }) {
  const r = rule || {};
  const prog = r.prog === 'linear' || r.prog === 'double' ? r.prog : 'off';
  const inc = num(r.inc) > 0 ? num(r.inc) : 2.5;
  const target = num(r.target) > 0 ? num(r.target) : fallbackReps;
  const base = num(r.base) > 0 ? num(r.base) : Math.max(1, Math.min(target, 8));

  if (prog === 'off' || !last) {
    return { weight: num(fallbackWeight), reps: target, changed: false };
  }

  if (prog === 'linear') {
    const w = last.allHit ? Math.round((last.topW + inc) * 10) / 10 : last.topW;
    return { weight: w || num(fallbackWeight), reps: target, changed: Boolean(last.allHit && last.topW) };
  }

  // double：次数先加，到目标再加重量
  if (last.topR >= target) {
    return { weight: Math.round((last.topW + inc) * 10) / 10, reps: base, changed: true };
  }
  return { weight: last.topW || num(fallbackWeight), reps: Math.max(base, last.topR + 1), changed: false };
}

/** 减载：整周重量 ×0.6、组数 −1（最少 1 组）。 */
export function deloadRoutine(routine) {
  if (!routine || typeof routine !== 'object') return null;
  const ex = (Array.isArray(routine.ex) ? routine.ex : []).map(e => {
    const row = { ...e };
    const w = num(e.weight);
    if (w > 0) row.weight = Math.max(2.5, Math.round((w * 0.6) / 2.5) * 2.5);
    row.sets = Math.max(1, Math.round(num(e.sets) || 3) - 1);
    row.deload = true;
    if (Array.isArray(e.weightList)) row.weightList = e.weightList.map(v => Math.max(2.5, Math.round((num(v) * 0.6) / 2.5) * 2.5));
    return row;
  });
  return {
    ...routine,
    id: routine.id,
    name: (String(routine.name || '计划') + ' · 减载').slice(0, 40),
    ex
  };
}

/**
 * 把进阶规则套到今天这套计划上（原地改 view.routines[].exercises[]）。
 * 每个动作找最近一场里它的记录，按规则算今天的重量 / 次数。
 */
export function applyProgression(state, view) {
  const workouts = (Array.isArray(state && state.workouts) ? state.workouts : [])
    .filter(w => w && !w.ttLive)
    .slice()
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  const rows = (view && view.routines) || [];
  for (const r of rows) {
    for (const ex of r.exercises || []) {
      if (!ex.prog || ex.prog === 'off') continue;
      let last = null;
      for (const w of workouts) {
        const e = (w.entries || []).find(x => x && x.id === ex.id);
        const perf = e && lastPerformance(e.sets, ex.target || ex.reps || 8);
        if (perf) { last = perf; break; }
      }
      const t = nextTarget({
        last,
        rule: { prog: ex.prog, inc: ex.inc, target: ex.target || ex.reps, base: ex.base },
        fallbackWeight: ex.weight,
        fallbackReps: ex.reps || 8
      });
      if (t.weight > 0) ex.weight = t.weight;
      if (t.reps > 0) ex.reps = t.reps;
    }
  }
  return view;
}
