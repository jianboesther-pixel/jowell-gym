/* 饮食：一天两个数（热量、蛋白质）+ 一个目标。和网页端同一份 state：
 *   nutrition:     { '2026-11-05': { kcal, protein, _ts } }
 *   nutritionGoal: { kcal, protein }
 * 刻意不做食物条目——只用两个数，隐私和审核都更省事（网页端也是这样）。
 * 纯函数，返回新的 state。
 */
const KCAL_MAX = 8000;
const PROTEIN_MAX = 400;

const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const addDays = (iso, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n, 12);
  return isoOf(d);
};

/** 最近 `days` 天（含今天），新的在前；没记的那天也留一行，方便点回去补。 */
export function nutritionView(state, { today, days = 14 } = {}) {
  const s = state || {};
  const t = validDay(today) ? today : isoOf(new Date());
  const log = s.nutrition && typeof s.nutrition === 'object' ? s.nutrition : {};
  const goal = s.nutritionGoal && typeof s.nutritionGoal === 'object' ? s.nutritionGoal : null;
  const n = Math.max(1, Math.min(60, Number(days) || 14));
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(t, -i);
    const row = log[d];
    out.push({
      d,
      kcal: row ? num(row.kcal) : 0,
      protein: row ? num(row.protein) : 0,
      has: !!(row && (num(row.kcal) || num(row.protein)))
    });
  }
  return {
    today: out[0],
    days: out,
    goal: goal ? { kcal: num(goal.kcal), protein: num(goal.protein) } : null
  };
}

/** 记一天。两个数都是 0 时删掉这一天（等于"没记"）。 */
export function setIntake(state, body, now = Date.now()) {
  const next = { ...(state || {}) };
  const b = body || {};
  const d = validDay(b.d) ? b.d : null;
  if (!d) return next;
  const kcal = Math.min(KCAL_MAX, num(b.kcal));
  const protein = Math.min(PROTEIN_MAX, num(b.protein));
  const log = { ...(next.nutrition && typeof next.nutrition === 'object' ? next.nutrition : {}) };
  if (!kcal && !protein) delete log[d];
  else log[d] = { kcal, protein, _ts: now };
  next.nutrition = log;
  return next;
}

/** 设目标。两个数都是 0 等于清掉目标。 */
export function setGoal(state, body) {
  const next = { ...(state || {}) };
  const b = body || {};
  const kcal = Math.min(KCAL_MAX, num(b.kcal));
  const protein = Math.min(PROTEIN_MAX, num(b.protein));
  next.nutritionGoal = kcal || protein ? { kcal, protein } : null;
  return next;
}
