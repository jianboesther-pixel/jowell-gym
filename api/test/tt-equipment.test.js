import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoriesOf, eqAvailable, profilesView, saveProfile, removeProfile, setProfileFilter, makeAvailability } from '../tt-equipment.js';

test('accessoriesOf: 名字里有 bench 就要椅子，机器类不用', () => {
  assert.deepEqual(accessoriesOf({ n: 'dumbbell bench press', eq: 'dumbbell' }), ['bench']);
  assert.deepEqual(accessoriesOf({ n: 'lever chest press', eq: 'leverage machine' }), []);
  assert.deepEqual(accessoriesOf({ n: 'pull-up', eq: 'body weight' }), ['pull-up bar']);
});

test('eqAvailable: 自重永远可做，缺器械不行', () => {
  assert.equal(eqAvailable(['dumbbell'], { eq: 'body weight', n: 'push-up' }), true);
  assert.equal(eqAvailable(['dumbbell'], { eq: 'barbell', n: 'barbell squat' }), false);
  assert.equal(eqAvailable(['dumbbell', 'bench'], { eq: 'dumbbell', n: 'dumbbell bench press' }), true);
  assert.equal(eqAvailable(['dumbbell'], { eq: 'dumbbell', n: 'dumbbell bench press' }), false);
});

test('saveProfile: 新建一份，自动成为当前', () => {
  const next = saveProfile({}, { name: '家里', equipment: ['dumbbell', 'bench'] }, 100);
  assert.equal(next.equipProfiles.length, 1);
  assert.equal(next.activeEquipId, next.equipProfiles[0].id);
  assert.deepEqual(next.equipProfiles[0].equipment, ['dumbbell', 'bench']);
});

test('saveProfile: 按 id 更新已有档案', () => {
  let s = saveProfile({}, { name: 'A', equipment: ['dumbbell'] }, 1);
  const id = s.equipProfiles[0].id;
  s = saveProfile(s, { id, name: 'B', equipment: ['barbell'] }, 2);
  assert.equal(s.equipProfiles.length, 1);
  assert.equal(s.equipProfiles[0].name, 'B');
});

test('removeProfile: 删掉当前档案后自动切到下一份', () => {
  let s = saveProfile({}, { name: 'A', equipment: [] }, 1);
  s = saveProfile(s, { name: 'B', equipment: [] }, 2);
  const a = s.equipProfiles[0].id;
  s = removeProfile(s, a);
  assert.equal(s.equipProfiles.length, 1);
  assert.equal(s.activeEquipId, s.equipProfiles[0].id);
});

test('setProfileFilter / profilesView: 开关和当前档案', () => {
  let s = saveProfile({}, { name: 'A', equipment: ['dumbbell'] }, 1);
  s = setProfileFilter(s, { on: true });
  const v = profilesView(s);
  assert.equal(v.on, true);
  assert.ok(v.active);
});

test('makeAvailability: 过滤关掉时返回 null（全都可做）', () => {
  const s = saveProfile({}, { name: 'A', equipment: ['dumbbell'] }, 1);
  assert.equal(makeAvailability(s), null);
});

test('makeAvailability: 打开后按档案判断', () => {
  let s = saveProfile({}, { name: 'A', equipment: ['dumbbell', 'bench'] }, 1);
  s = setProfileFilter(s, { on: true });
  const ok = makeAvailability(s);
  assert.equal(ok('0025'), false);   // 杠铃卧推：没有杠铃
  assert.equal(ok('0289'), true);    // 哑铃卧推：有哑铃和椅子
});
