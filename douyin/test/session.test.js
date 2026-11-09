// 状态机是纯函数，和 UI、tt.* 无关：这一份跑在 Node 里，真机上跑的是同一份。
const test = require('node:test');
const assert = require('node:assert');
const S = require('../utils/session');

const T0 = 1000000;

test('开局是待完成，第一个动作，第 1 组', () => {
  const s = S.createSession(T0);
  assert.equal(S.viewState(s, T0), 'set');
  assert.equal(S.current(s).name, '杠铃卧推');
  assert.equal(S.remainingSets(s), 4);
  assert.equal(S.isResting(s), false);
});

test('完成一组就进入休息，按动作自己的休息时长计时', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  assert.equal(S.current(s).done, 1);
  assert.equal(S.viewState(s, T0), 'rest');
  assert.equal(S.restLeft(s, T0 + 30000), 60000);
  assert.equal(S.mmss(S.restLeft(s, T0 + 30000)), '1:00');
});

test('到点即视为下一组，不用点按钮；清掉休息后回到待完成', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  assert.equal(S.restOver(s, T0 + 90000), true);
  assert.equal(S.viewState(s, T0 + 90000), 'set');
  S.endRest(s);
  assert.equal(S.isResting(s), false);
  assert.equal(S.viewState(s, T0 + 90000), 'set');
});

test('中途被挂起：回来时按时间差校正，而不是从头数', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  // 用户切去刷了 5 分钟视频
  assert.equal(S.restLeft(s, T0 + 300000), 0);
  assert.equal(S.restOver(s, T0 + 300000), true);
  assert.equal(S.viewState(s, T0 + 300000), 'set');
});

test('休息中再点"完成"：记一组并重置休息（先练完、再一条条补记）', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);                       // 第 1 组
  assert.equal(S.current(s).done, 1);
  assert.equal(S.restLeft(s, T0 + 60000), 30000);

  S.finishSet(s, T0 + 60000);               // 第 2 组，休息重新计时
  assert.equal(S.current(s).done, 2);
  assert.equal(S.restLeft(s, T0 + 60000), 90000);

  S.finishSet(s, T0 + 61000);
  S.finishSet(s, T0 + 62000);               // 第 4 组：做完，不休息
  assert.equal(S.current(s).done, 4);
  assert.equal(S.isResting(s), false);
  assert.equal(S.viewState(s, T0 + 62000), 'exerciseDone');
});

test('本动作做完后加一组，回到待完成', () => {
  const s = S.createSession(T0);
  for (let i = 0; i < 4; i++) S.finishSet(s, T0 + i);
  assert.equal(S.viewState(s, T0 + 10), 'exerciseDone');
  S.addSet(s);
  assert.equal(S.current(s).sets, 5);
  assert.equal(S.viewState(s, T0 + 10), 'set');
});

test('跳过休息立刻开始下一组', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  S.skipRest(s);
  assert.equal(S.viewState(s, T0 + 1000), 'set');
  assert.equal(S.current(s).done, 1);
});

test('加一组只加目标组数，不改变已完成数', () => {
  const s = S.createSession(T0);
  S.addSet(s);
  assert.equal(S.current(s).sets, 5);
  assert.equal(S.current(s).done, 0);
  assert.equal(S.remainingSets(s), 5);
});

test('最后一组做完不休息，停在"本动作完成"', () => {
  const s = S.createSession(T0);
  for (let i = 0; i < 4; i++) { S.finishSet(s, T0 + i); S.skipRest(s); }
  assert.equal(S.current(s).done, 4);
  assert.equal(S.viewState(s, T0), 'exerciseDone');
  assert.equal(S.isResting(s), false);
});

test('下一个动作：没有下一个就整场结束', () => {
  const s = S.createSession(T0);
  S.nextExercise(s);
  assert.equal(S.current(s).name, '杠铃划船');
  S.nextExercise(s);
  assert.equal(s.finished, true);
  assert.equal(S.viewState(s, T0), 'finished');
});

test('重量和次数有边界，不会点成负数', () => {
  const s = S.createSession(T0);
  S.adjustWeight(s, -1000);
  assert.equal(S.current(s).weight, 0);
  S.adjustReps(s, -1000);
  assert.equal(S.current(s).reps, 1);
  S.adjustWeight(s, 1000);
  assert.equal(S.current(s).weight, 500);
});

test('下一个动作的名字，最后一个时为空', () => {
  const s = S.createSession(T0);
  assert.equal(S.nextName(s), '杠铃划船');
  S.nextExercise(s);
  assert.equal(S.nextName(s), '');
});

test('休息中可以 ±30 秒，减到 0 就直接结束', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  assert.equal(S.restLeft(s, T0), 90000);
  S.adjustRest(s, 30, T0);
  assert.equal(S.restLeft(s, T0), 120000);
  S.adjustRest(s, -30, T0);
  assert.equal(S.restLeft(s, T0), 90000);
  S.adjustRest(s, -300, T0 + 5000);
  assert.equal(S.isResting(s), false, '−30s 减穿到 0 就是结束休息');
  S.adjustRest(s, 30, T0 + 6000);
  assert.equal(S.isResting(s), false, '不在休息时调时间无效');
});

test('换成本周计划：动作、组数、重量、休息都听后端的', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  S.withPlan(s, {
    training: true,
    routines: [{ name: '推日', exercises: [
      { id: '0025', name: 'barbell bench press', sets: 5, reps: 5, weight: 80, restSec: 150 },
      { id: '0032', name: 'barbell row', sets: 3, reps: 10, weight: 55, restSec: 90 }
    ] }]
  });
  assert.equal(s.planName, '推日');
  assert.equal(s.exercises.length, 2);
  assert.equal(S.current(s).weight, 80);
  assert.equal(S.current(s).restSec, 150);
  assert.equal(s.exIdx, 0);
  assert.equal(s.finished, false);
  assert.equal(s.restEndsAt, null, '换计划要清掉上一场残留的休息');
});

test('休息日 / 空计划不动 demo', () => {
  const s = S.createSession(T0);
  S.withPlan(s, { training: false, routines: [] });
  assert.equal(s.exercises.length, 2);
  assert.equal(S.current(s).name, '杠铃卧推');
  S.withPlan(s, null);
  assert.equal(S.current(s).name, '杠铃卧推');
});

test('主动结束整场：直接收工，休息也清掉', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  assert.equal(S.viewState(s, T0 + 1000), 'rest');
  S.endSession(s);
  assert.equal(S.isResting(s), false);
  assert.equal(S.viewState(s, T0 + 1000), 'finished');
});

test('草稿并回：按动作对齐、标已完成、跳到第一个没做完的动作', () => {
  const s = S.createSession(T0);
  S.resumeFromDraft(s, {
    exercises: [
      { id: '0025', sets: [{ n: 1, w: 65, r: 10, at: T0 }, { n: 2, w: 70, r: 8, at: T0 }] },
      { id: '0032', sets: [{ n: 1, w: 55, r: 12, at: T0 }] }
    ]
  });
  assert.equal(s.exercises[0].done, 2);
  assert.equal(s.exercises[0].weight, 70, '重量取最后一组');
  assert.equal(s.exercises[1].done, 1);
  assert.equal(s.exIdx, 0, '第一个动作还没做完，停在它上面');
});

test('草稿里做的组比计划多时，目标组数跟着涨', () => {
  const s = S.createSession(T0);
  S.resumeFromDraft(s, {
    exercises: [{ id: '0025', sets: [1, 2, 3, 4, 5, 6].map(n => ({ n, w: 60, r: 10, at: T0 })) }]
  });
  assert.equal(s.exercises[0].sets, 6);
  assert.equal(s.exercises[0].done, 6);
  assert.equal(s.exIdx, 1, '第一个动作做完了，跳到第二个');
});

test('空草稿不动 session', () => {
  const s = S.createSession(T0);
  const before = s.exIdx;
  S.resumeFromDraft(s, { exercises: [] });
  assert.equal(s.exIdx, before);
  assert.equal(s.exercises[0].done, 0);
});

test('整场进度累计每组', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  S.skipRest(s);
  S.finishSet(s, T0 + 10);
  assert.deepEqual(S.totals(s), { total: 7, done: 2 });
});

test('换动作：换掉当前动作、从第 1 组开始、休息清掉', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  assert.equal(S.isResting(s), true);
  S.swapExercise(s, { id: 'x1', name: '哑铃卧推', weight: 20, reps: 10, sets: 3 });
  const ex = S.current(s);
  assert.equal(ex.id, 'x1');
  assert.equal(ex.name, '哑铃卧推');
  assert.equal(ex.done, 0);
  assert.equal(ex.sets, 3);
  assert.equal(ex.weight, 20);
  assert.equal(S.isResting(s), false);
  assert.equal(S.viewState(s, T0), 'set');
});

test('换动作：没给的字段沿用原动作', () => {
  const s = S.createSession(T0);
  const before = S.current(s);
  S.swapExercise(s, { id: 'x2', name: '器械推胸' });
  const ex = S.current(s);
  assert.equal(ex.weight, before.weight);
  assert.equal(ex.reps, before.reps);
  assert.equal(ex.sets, before.sets);
});

test('换动作：空参数原样返回，不会把动作弄丢', () => {
  const s = S.createSession(T0);
  const id = S.current(s).id;
  S.swapExercise(s, null);
  S.swapExercise(s, {});
  assert.equal(S.current(s).id, id);
});

test('撤销上一组：组数减一，休息清掉，返回组号', () => {
  const s = S.createSession(T0);
  S.finishSet(s, T0);
  S.skipRest(s);
  S.finishSet(s, T0 + 10);
  assert.equal(S.current(s).done, 2);
  assert.equal(S.undoSet(s), 2);
  assert.equal(S.current(s).done, 1);
  assert.equal(S.isResting(s), false);
});

test('撤销：一组都没做时返回 0，不动状态', () => {
  const s = S.createSession(T0);
  assert.equal(S.undoSet(s), 0);
  assert.equal(S.current(s).done, 0);
});

test('自由训练：从零开始一场，只有一个动作、默认 3 组', () => {
  const s = S.createSession(T0);
  S.startFree(s, { id: 'x9', name: '哑铃弯举' });
  assert.equal(s.exercises.length, 1);
  assert.equal(S.current(s).name, '哑铃弯举');
  assert.equal(S.current(s).sets, 3);
  assert.equal(S.viewState(s, T0), 'set');
  assert.equal(s.finished, false);
});

test('自由训练：再加一个动作排在后面', () => {
  const s = S.createSession(T0);
  S.startFree(s, { id: 'x9', name: '哑铃弯举' });
  S.addExercise(s, { id: 'x10', name: '绳索下压' });
  assert.equal(s.exercises.length, 2);
  assert.equal(s.exercises[1].name, '绳索下压');
  S.nextExercise(s);
  assert.equal(S.current(s).name, '绳索下压');
});

test('自由训练：空动作不会清掉原计划', () => {
  const s = S.createSession(T0);
  const before = s.exercises.length;
  S.startFree(s, null);
  assert.equal(s.exercises.length, before);
});

test('dropSet：重量掉 10%，并立刻记一组（不休息）', () => {
  const st = S.createSession();
  st.exercises = [{ id: 'x', name: '卧推', sets: 3, done: 0, weight: 100, reps: 8, restSec: 90 }];
  st.exIdx = 0;
  S.dropSet(st, 1000);
  assert.equal(st.exercises[0].done, 1);
  assert.equal(st.exercises[0].weight, 90);
  assert.equal(st.restEndsAt, null);
});

test('dropSet：最后一次做了也可以，但不会超组数', () => {
  const st = S.createSession();
  st.exercises = [{ id: 'x', name: '卧推', sets: 1, done: 0, weight: 60, reps: 8, restSec: 90 }];
  st.exIdx = 0;
  S.dropSet(st, 1000);
  S.dropSet(st, 2000);
  assert.equal(st.exercises[0].done, 1);
});

test('restPause：记一组后只歇 15 秒', () => {
  const st = S.createSession();
  st.exercises = [{ id: 'x', name: '卧推', sets: 3, done: 0, weight: 60, reps: 8, restSec: 90 }];
  st.exIdx = 0;
  S.restPause(st, 5000);
  assert.equal(st.exercises[0].done, 1);
  assert.equal(st.restEndsAt, 5000 + 15 * 1000);
});

function twoEx() {
  const st = S.createSession();
  st.exercises = [
    { id: 'a', name: '卧推', sets: 2, done: 0, weight: 60, reps: 8, restSec: 90 },
    { id: 'b', name: '划船', sets: 2, done: 0, weight: 50, reps: 10, restSec: 90 }
  ];
  st.exIdx = 0;
  return st;
}

test('linkSuperset：当前动作和下一个绑成同一组', () => {
  const st = twoEx();
  S.linkSuperset(st);
  assert.equal(st.exercises[0].group, st.exercises[1].group);
  S.unlinkSuperset(st);
  assert.equal(st.exercises[0].group, null);
  assert.equal(st.exercises[1].group, null);
});

test('超集：做完 A 的一组直接切到 B，不休息', () => {
  const st = twoEx();
  S.linkSuperset(st);
  S.finishSet(st, 1000);
  assert.equal(st.exercises[0].done, 1);
  assert.equal(st.exIdx, 1);
  assert.equal(st.restEndsAt, null);
});

test('超集：B 做完一组回到 A（都还没做满）', () => {
  const st = twoEx();
  S.linkSuperset(st);
  S.finishSet(st, 1000);   // A 第 1 组 → 切到 B
  S.finishSet(st, 2000);   // B 第 1 组 → 回 A
  assert.equal(st.exIdx, 0);
  assert.equal(st.exercises[0].done, 1);
  assert.equal(st.exercises[1].done, 1);
});

test('超集：两个都做满后开始休息 / 结束', () => {
  const st = twoEx();
  S.linkSuperset(st);
  S.finishSet(st, 1000);
  S.finishSet(st, 2000);
  S.finishSet(st, 3000);
  S.finishSet(st, 4000);
  assert.equal(st.exercises[0].done, 2);
  assert.equal(st.exercises[1].done, 2);
  assert.equal(st.restEndsAt, null);
});

test('repsForSet：金字塔组按组取次数，普通组用固定值', () => {
  assert.equal(S.repsForSet({ reps: 10, done: 0, repsList: [12, 10, 8] }), 12);
  assert.equal(S.repsForSet({ reps: 10, done: 1, repsList: [12, 10, 8] }), 10);
  assert.equal(S.repsForSet({ reps: 10, done: 2, repsList: [12, 10, 8] }), 8);
  assert.equal(S.repsForSet({ reps: 10, done: 5, repsList: [12, 10, 8] }), 8);
  assert.equal(S.repsForSet({ reps: 10, done: 1 }), 10);
});
