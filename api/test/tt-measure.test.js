import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureView, saveMeasurement, removeMeasurement, measureDeltas, MEASURE_FIELDS } from '../tt-measure.js';

test('字段表：19 个字段，覆盖躯干/手臂/腿/其他', () => {
  assert.equal(MEASURE_FIELDS.length, 19);
  const groups = new Set(MEASURE_FIELDS.map(f => f.group));
  assert.deepEqual([...groups].sort(), ['其他', '手臂', '腿', '躯干'].sort());
});

test('saveMeasurement：同一天只留一条，非法值被丢掉', () => {
  let s = saveMeasurement({}, { d: '2026-11-01', values: { waist: 80, chest: 100, nope: 5 } });
  s = saveMeasurement(s, { d: '2026-11-01', values: { waist: 79 } });
  assert.equal(s.measurements.length, 1);
  assert.deepEqual(s.measurements[0].values, { waist: 79 });
});

test('saveMeasurement：没有有效值时等于删掉这一天', () => {
  let s = saveMeasurement({}, { d: '2026-11-01', values: { waist: 80 } });
  s = saveMeasurement(s, { d: '2026-11-01', values: {} });
  assert.equal(s.measurements.length, 0);
});

test('measureView：按日期倒序，latest/prev 正确', () => {
  let s = saveMeasurement({}, { d: '2026-11-01', values: { waist: 80 } });
  s = saveMeasurement(s, { d: '2026-11-05', values: { waist: 78 } });
  const v = measureView(s);
  assert.equal(v.latest.d, '2026-11-05');
  assert.equal(v.prev.d, '2026-11-01');
  assert.equal(v.count, 2);
});

test('measureDeltas：算出比上次的变化', () => {
  let s = saveMeasurement({}, { d: '2026-11-01', values: { waist: 80, chest: 100 } });
  s = saveMeasurement(s, { d: '2026-11-05', values: { waist: 78, chest: 101 } });
  const d = measureDeltas(measureView(s));
  assert.equal(d.waist, -2);
  assert.equal(d.chest, 1);
});

test('removeMeasurement：删掉某一天', () => {
  const s = removeMeasurement({ measurements: [{ d: '2026-11-01', values: { waist: 80 } }] }, '2026-11-01');
  assert.equal(s.measurements.length, 0);
});
