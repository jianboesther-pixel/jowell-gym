/* 自己建的动作：名字 + 部位（可选一张图）。
 * 存在 state.customEx（和网页端同一个字段）：[{ id, n, bp, _ts }]
 * 纯函数，返回新的 state。
 */
const BP = {
  chest: '胸部', back: '背部', shoulders: '肩部', 'upper arms': '手臂',
  'upper legs': '大腿', waist: '核心', 'lower legs': '小腿',
  'full body': '全身', cardio: '有氧', neck: '颈部', 'lower arms': '前臂'
};

export const customParts = () => Object.keys(BP).map(key => ({ key, zh: BP[key] }));

const clean = s => String(s || '').trim().slice(0, 40);

/** 补录一个自定义动作，返回新的 state；名字为空时不动。 */
export function addCustom(state, body, now = Date.now()) {
  const next = { ...(state || {}) };
  const b = body || {};
  const n = clean(b.name);
  if (!n) return next;
  const bp = BP[b.bp] ? b.bp : 'full body';
  const id = 'cu' + now.toString(36) + Math.floor(Math.random() * 1000).toString(36);
  next.customEx = (Array.isArray(next.customEx) ? next.customEx : []).concat([
    { id, n, bp, _ts: now }
  ]);
  return next;
}

/** 删掉一个自定义动作。 */
export function removeCustom(state, id) {
  const next = { ...(state || {}) };
  const key = String(id || '');
  next.customEx = (Array.isArray(next.customEx) ? next.customEx : []).filter(e => e && e.id !== key);
  return next;
}

/** 给动作库用：把自定义动作排到最前面（网页端 allExercises 也是这么做的）。 */
export function customForLibrary(state) {
  return (Array.isArray(state && state.customEx) ? state.customEx : [])
    .filter(e => e && e.id && e.n)
    .slice()
    .sort((a, b) => (Number(b._ts) || 0) - (Number(a._ts) || 0))
    .map(e => ({
      id: e.id,
      name: e.n,
      en: '',
      bp: e.bp || 'full body',
      bpZh: BP[e.bp] || BP['full body'],
      eq: '',
      eqZh: '自己加的',
      tg: '',
      tgZh: '',
      cat: '',
      catZh: '',
      custom: true
    }));
}
