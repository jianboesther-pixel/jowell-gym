/* 体测数据（围度 / 体脂）：网页 measurements.js 的字段表 + 每天一条。
 * state 字段：measurements = [{ d, values: { key: number } }]，和网页端同一份。
 * 单位统一厘米（体脂是百分比），换 kg/lb 不影响历史数值。
 */
export const MEASURE_FIELDS = [
  { key: 'neck', zh: '颈围', group: '躯干' },
  { key: 'shoulders', zh: '肩围', group: '躯干' },
  { key: 'chest', zh: '胸围', group: '躯干' },
  { key: 'waist', zh: '腰围', group: '躯干' },
  { key: 'hips', zh: '臀围', group: '躯干' },
  { key: 'abdomen', zh: '腹围', group: '躯干' },
  { key: 'upperArmLeft', zh: '左上臂', group: '手臂' },
  { key: 'upperArmRight', zh: '右上臂', group: '手臂' },
  { key: 'forearmLeft', zh: '左前臂', group: '手臂' },
  { key: 'forearmRight', zh: '右前臂', group: '手臂' },
  { key: 'wristLeft', zh: '左腕', group: '手臂' },
  { key: 'wristRight', zh: '右腕', group: '手臂' },
  { key: 'thighLeft', zh: '左大腿', group: '腿' },
  { key: 'thighRight', zh: '右大腿', group: '腿' },
  { key: 'calfLeft', zh: '左小腿', group: '腿' },
  { key: 'calfRight', zh: '右小腿', group: '腿' },
  { key: 'ankleLeft', zh: '左踝', group: '腿' },
  { key: 'ankleRight', zh: '右踝', group: '腿' },
  { key: 'bodyFat', zh: '体脂率', group: '其他', percent: true }
];

const KEYS = new Set(MEASURE_FIELDS.map(f => f.key));
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};
const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** 编辑用的视图：字段分组 + 最近记录 + 每天一条的历史。 */
export function measureView(state, { limit = 30 } = {}) {
  const s = state || {};
  const list = (Array.isArray(s.measurements) ? s.measurements : [])
    .filter(x => x && validDay(x.d))
    .map(x => ({ d: x.d, values: Object.fromEntries(Object.entries(x.values || {}).filter(([k, v]) => KEYS.has(k) && num(v) > 0).map(([k, v]) => [k, num(v)])) }))
    .filter(x => Object.keys(x.values).length)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  const latest = list[0] || null;
  const prev = list[1] || null;
  const history = list.slice(0, Math.max(1, Math.min(60, limit)));
  return {
    fields: MEASURE_FIELDS,
    latest,
    prev,
    history,
    count: list.length
  };
}

/** 存一天：同一天只留一条（和网页端一致）。 */
export function saveMeasurement(state, body) {
  const next = { ...(state || {}) };
  const b = body || {};
  const d = validDay(b.d) ? b.d : '';
  if (!d) return next;
  const values = {};
  for (const [k, v] of Object.entries(b.values || {})) {
    if (!KEYS.has(k)) continue;
    const n = num(v);
    if (n > 0) values[k] = n;
  }
  const list = (Array.isArray(next.measurements) ? next.measurements : []).filter(x => x && x.d !== d);
  if (Object.keys(values).length) list.push({ d, values });
  next.measurements = list.sort((a, b2) => (a.d < b2.d ? -1 : a.d > b2.d ? 1 : 0));
  return next;
}

export function removeMeasurement(state, d) {
  const next = { ...(state || {}) };
  next.measurements = (Array.isArray(next.measurements) ? next.measurements : []).filter(x => x && x.d !== String(d || ''));
  return next;
}

/** 每个字段的变化（最近一次 vs 上一次），给页面显示"比上次 −1.2"。 */
export function measureDeltas(view) {
  const out = {};
  if (!view || !view.latest || !view.prev) return out;
  for (const f of MEASURE_FIELDS) {
    const a = view.latest.values[f.key];
    const b = view.prev.values[f.key];
    if (a && b) out[f.key] = Math.round((a - b) * 10) / 10;
  }
  return out;
}
