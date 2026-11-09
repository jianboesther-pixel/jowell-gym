/* 抖音面板的"今天练什么"：把一份 openGym state 压成面板需要的最小形状。
 *
 * 纯函数：不读文件、不看时钟（weekday 由调用方给）。面板只认 id / 名字 / 组数 / 次数 /
 * 重量 / 休息，把 routine 里那些 UI 用的字段（superset、drop set、备注）全部丢掉，
 * 免得小程序跟着网页的结构一起变。
 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';

const NAMES = new Map(EXERCISES.map(e => [e.id, e.n]));
const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MAX_EX = 12;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const posInt = (v, d) => Math.max(1, Math.round(num(v, d)));

/**
 * @param {object} state  一份 state-<uid>.json（可能是 null/旧版本）
 * @param {{weekday:number, maxExercises?:number}} opts  weekday 用 Date#getDay 的约定（0=周日）
 */
export function todayView(state, opts = {}) {
  const s = state || {};
  const weekday = Number.isInteger(opts.weekday) ? opts.weekday : new Date().getDay();
  const max = posInt(opts.maxExercises, MAX_EX);

  const routines = Array.isArray(s.routines) ? s.routines : [];
  const week = s.week && typeof s.week === 'object' ? s.week : {};
  const ids = [].concat(week[weekday] || []);
  const picked = ids.map(id => routines.find(r => r && r.id === id)).filter(Boolean);

  const dow = DOW[weekday] || '';
  const hasPlan = Array.isArray(s.routines) && s.routines.length > 0;
  if (!picked.length) return { dow, training: false, hasPlan, routines: [] };

  const custom = Array.isArray(s.customEx) ? s.customEx : [];
  // 名字跟着账号的语言走：中文账号看中文，英文账号看英文（目录本身只有英文名）。
  const lang = String(opts.lang || s.lang || 'zh').toLowerCase();
  const zh = lang.startsWith('zh');
  const nameOf = id => (zh && NAMES_ZH[id]) || NAMES.get(id) || (custom.find(e => e && e.id === id) || {}).n || id;

  const out = picked.map(r => ({
    id: r.id,
    name: r.name || '训练',
    exercises: (Array.isArray(r.ex) ? r.ex : []).slice(0, max).map(ex => {
      const logged = s.exWeights && s.exWeights[ex.id];
      return {
        id: ex.id,
        name: nameOf(ex.id),
        sets: posInt(ex.sets, 3),
        reps: posInt(ex.reps, 8),
        weight: num(logged && logged.w, num(ex.weight, 0)),
        restSec: Math.max(15, Math.round(num(ex.rest, num(ex.restSec, 90)))),
        // 组型与进阶规则原样带出去，面板和 today 的建议重量都靠这几个字段
        mode: ex.mode === 'time' ? 'time' : 'reps',
        perSide: ex.perSide === true,
        repsList: Array.isArray(ex.repsList) ? ex.repsList : null,
        weightList: Array.isArray(ex.weightList) ? ex.weightList : null,
        group: ex.group || null,
        prog: ex.prog === 'linear' || ex.prog === 'double' ? ex.prog : 'off',
        inc: num(ex.inc, 0),
        target: num(ex.target, 0),
        base: num(ex.base, 0)
      };
    })
  }));

  return { dow, training: true, hasPlan, routines: out };
}
