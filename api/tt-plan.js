/* 新手模板：账号里一个计划都没有时，点一下就能开始练。
 *
 * 模板写死在这里（id 来自 api/coach/core/library-data.js 的目录），不引入生成器：
 * 新用户要的是"现在能练什么"，不是一个可配置的计划编辑器——那个在网页端。
 */

const T = {
  full3: {
    label: '全身 · 每周 3 天',
    days: { 1: 0, 3: 0, 5: 0 },          // 周一/三/五 都练同一套
    routines: [
      {
        name: '全身 A',
        ex: [
          { id: '0025', sets: 3, reps: 8 },   // barbell bench press
          { id: '3593', sets: 3, reps: 5 },   // barbell squat
          { id: '0651', sets: 3, reps: 8 },   // pull up (neutral grip)
          { id: '0091', sets: 3, reps: 8 },   // barbell seated overhead press
          { id: '0201', sets: 3, reps: 12 }   // cable pushdown
        ]
      }
    ]
  },
  upperlower4: {
    label: '上下肢 · 每周 4 天',
    days: { 1: 0, 2: 1, 4: 0, 5: 1 },
    routines: [
      {
        name: '上肢',
        ex: [
          { id: '0025', sets: 3, reps: 8 },
          { id: '0651', sets: 3, reps: 8 },
          { id: '0426', sets: 3, reps: 10 },   // dumbbell standing overhead press
          { id: '0031', sets: 3, reps: 12 },   // barbell curl
          { id: '0201', sets: 3, reps: 12 }
        ]
      },
      {
        name: '下肢',
        ex: [
          { id: '3593', sets: 3, reps: 5 },
          { id: '0085', sets: 3, reps: 8 },    // barbell romanian deadlift
          { id: '0054', sets: 3, reps: 10 },   // barbell lunge
          { id: '0582', sets: 3, reps: 10 }    // lever kneeling leg curl
        ]
      }
    ]
  },
  ppl3: {
    label: '推拉腿 · 每周 3 天',
    days: { 1: 0, 3: 1, 5: 2 },
    routines: [
      {
        name: '推',
        ex: [
          { id: '0025', sets: 4, reps: 6 },
          { id: '0091', sets: 3, reps: 8 },
          { id: '0201', sets: 3, reps: 12 }
        ]
      },
      {
        name: '拉',
        ex: [
          { id: '0032', sets: 3, reps: 5 },    // barbell deadlift
          { id: '0651', sets: 3, reps: 8 },
          { id: '0031', sets: 3, reps: 12 }
        ]
      },
      {
        name: '腿',
        ex: [
          { id: '3593', sets: 4, reps: 6 },
          { id: '0085', sets: 3, reps: 8 },
          { id: '0054', sets: 3, reps: 10 }
        ]
      }
    ]
  }
};

/** 面板上给的三个选项。 */
export const templates = () => Object.entries(T).map(([key, t]) => ({ key, label: t.label }));

/**
 * 把模板写进 state（routines + week）。已经有 routines 时不动，返回 null——
 * 用户自己的计划优先，模板只负责"从零开始"。
 */
export function applyTemplate(state, key, now = Date.now()) {
  const t = T[key];
  if (!t) return null;
  if (Array.isArray(state.routines) && state.routines.length) return null;

  const stamp = now.toString(36);
  state.routines = t.routines.map((r, i) => ({
    id: 'tt' + stamp + i,
    name: r.name,
    ex: r.ex.map(e => ({ id: e.id, sets: e.sets, reps: e.reps }))
  }));

  const ids = state.routines.map(r => r.id);
  const week = {};
  for (const [day, idx] of Object.entries(t.days)) week[day] = ids[idx];
  state.week = week;
  return state;
}
