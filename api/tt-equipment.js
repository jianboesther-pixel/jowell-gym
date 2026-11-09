/* 器械档案：你手上有什么（含器械/器械架/单杠），用来把动作库收窄到"今天能做的"。
 *
 * state 字段和网页端一致：
 *   equipProfiles: [{ id, name, equipment: ['dumbbell','body weight',…], accV }]
 *   activeEquipId / equipFilterOn
 * 纯函数，返回新的 state。
 */
import { EXERCISES } from './coach/core/library-data.js';

const ACCESSORIES = ['bench', 'pull-up bar'];
const SELF_CONTAINED = new Set(['leverage machine', 'sled machine', 'assisted']);
const ALWAYS = 'body weight';

const idOf = e => (e && e.id ? String(e.id) : '');

/** 从动作名读它需要的附件（椅子/单杠），和网页端同一套规则。 */
export function accessoriesOf(ex) {
  const n = String((ex && ex.n) || '').toLowerCase();
  if (!n || SELF_CONTAINED.has(ex.eq)) return [];
  const need = [];
  if (/\bbench\b|\bincline\b|\bdecline\b/.test(n)) need.push('bench');
  if (/pull-up|pull up|chin-up|\bchin\b|hanging|muscle-up|muscle up/.test(n)) need.push('pull-up bar');
  return need;
}

/** 档案里勾了的器械（旧档案没有 accV，按"都勾了"读）。 */
export function profileEquipment(p) {
  const have = Array.isArray(p && p.equipment) ? p.equipment : [];
  return p && p.accV !== 1 ? [...new Set([...have, ...ACCESSORIES])] : have;
}

/** 这个动作在这份档案下能不能做。 */
export function eqAvailable(equipment, ex) {
  const have = equipment || [];
  const eq = (ex && ex.eq) || '';
  if (eq && eq !== ALWAYS && !have.includes(eq)) return false;
  return accessoriesOf(ex).every(a => have.includes(a));
}

export function profilesView(state) {
  const s = state || {};
  const profiles = (Array.isArray(s.equipProfiles) ? s.equipProfiles : []).map(p => ({
    id: String(p.id || ''),
    name: String(p.name || '我的器械'),
    equipment: profileEquipment(p)
  }));
  return {
    profiles,
    activeId: String(s.activeEquipId || ''),
    on: s.equipFilterOn === true,
    active: profiles.find(p => p.id === s.activeEquipId) || null
  };
}

/** 新建或更新一份档案。 */
export function saveProfile(state, body, now = Date.now()) {
  const next = { ...(state || {}) };
  const b = body || {};
  const name = String(b.name || '').trim().slice(0, 30) || '我的器械';
  const equipment = (Array.isArray(b.equipment) ? b.equipment : []).map(String).slice(0, 60);
  const list = Array.isArray(next.equipProfiles) ? next.equipProfiles.slice() : [];
  const id = String(b.id || '');
  const at = list.findIndex(p => p && p.id === id);
  if (at >= 0) list[at] = { ...list[at], name, equipment, accV: 1 };
  else list.push({ id: 'eq' + now.toString(36) + Math.floor(Math.random() * 100), name, equipment, accV: 1 });
  next.equipProfiles = list;
  if (!next.activeEquipId) next.activeEquipId = list[list.length - 1].id;
  return next;
}

export function removeProfile(state, id) {
  const next = { ...(state || {}) };
  const key = String(id || '');
  next.equipProfiles = (Array.isArray(next.equipProfiles) ? next.equipProfiles : []).filter(p => p && p.id !== key);
  if (next.activeEquipId === key) next.activeEquipId = (next.equipProfiles[0] || {}).id || '';
  return next;
}

/** 开关"只显示我有的器械"，以及选哪一份。 */
export function setProfileFilter(state, body) {
  const next = { ...(state || {}) };
  const b = body || {};
  if (b.on !== undefined) next.equipFilterOn = b.on === true;
  if (b.id !== undefined) next.activeEquipId = String(b.id || '');
  return next;
}

/** 动作库要用的过滤：过滤关掉就全都可做。 */
export function makeAvailability(state) {
  const v = profilesView(state);
  if (!v.on || !v.active) return null;
  const have = v.active.equipment;
  return id => {
    const ex = EXERCISES.find(e => e && e.id === id);
    if (!ex) return true;
    return eqAvailable(have, ex);
  };
}
