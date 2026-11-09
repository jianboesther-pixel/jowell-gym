/* 设置：对齐网页的设置项（训练 / 单位与格式 / 器械档案 / 账号 / 关于）。
 * 只有小程序真能生效的项才显示；网页独有的（推送、导出、通行密钥）不出现。
 */
const api = require('../../utils/api');

const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180];
const PAUSE_CHOICES = [10, 15, 20, 30, 45];
const DEC_CHOICES = [0, 1, 2];
const toast = text => { try { tt.showToast({ title: text, icon: 'none' }); } catch (e) {} };

Page({
  data: {
    loading: true,
    err: '',
    unit: 'kg',
    restSec: 90,
    restPauseSec: 15,
    keepAwake: true,
    animations: true,
    wdec: 0,
    weekStart: 0,
    effort: false,
    sound: true,
    vibrate: true,
    collapseDone: false,
    restChoices: REST_CHOICES,
    pauseChoices: PAUSE_CHOICES,
    decChoices: DEC_CHOICES,
    name: '',
    appId: '',
    build: '2026-11-09 · 面板重建 · tt64',
    saving: false,
    // 器械档案
    equip: null,
    equipOptions: [],
    equipPick: [],
    equipName: ''
  },

  onLoad() {
    this.setData({ appId: api.runtimeAppId() });
    this.load();
    this.loadEquip();
  },

  load() {
    this.setData({ loading: true, err: '' });
    api.call('/api/tt/settings')
      .then(s => this.setData({
        loading: false,
        unit: s.unit,
        restSec: s.restSec,
        restPauseSec: s.restPauseSec,
        keepAwake: s.keepAwake,
        animations: s.animations,
        wdec: s.wdec,
        weekStart: s.weekStart,
        effort: s.effort,
        sound: s.sound,
        vibrate: s.vibrate,
        collapseDone: s.collapseDone
      }))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }));
    api.me().then(u => this.setData({ name: (u && u.name) || '' })).catch(() => {});
  },

  loadEquip() {
    api.call('/api/tt/equipment')
      .then(e => this.setData({
        equip: e,
        equipOptions: e.options || [],
        equipPick: (e.active && e.active.equipment) || [],
        equipName: (e.active && e.active.name) || '我的器械'
      }))
      .catch(() => {});
  },

  save(patch) {
    this.setData({ saving: true });
    api.call('/api/tt/settings', { method: 'POST', data: patch })
      .then(s => {
        api.rememberSettings(s);
        this.setData({
          saving: false,
          unit: s.unit, restSec: s.restSec, restPauseSec: s.restPauseSec,
          keepAwake: s.keepAwake, animations: s.animations, wdec: s.wdec,
          weekStart: s.weekStart, effort: s.effort,
          sound: s.sound, vibrate: s.vibrate, collapseDone: s.collapseDone
        });
        toast('已保存');
      })
      .catch(e => { this.setData({ saving: false }); toast(e && e.status === 401 ? '未登录' : '没保存上'); });
  },

  onUnit(e) {
    const unit = e.currentTarget.dataset.unit;
    if (!unit || unit === this.data.unit) return;
    const from = this.data.unit;
    tt.showModal({
      title: '换单位',
      content: '所有记录会从 ' + from + ' 换算成 ' + unit + '，数字会变。',
      confirmText: '换算',
      success: res => { if (res.confirm) this.save({ unit }); }
    });
  },
  onRest(e) { this.save({ restSec: Number(e.currentTarget.dataset.sec) }); },
  onPause(e) { this.save({ restPauseSec: Number(e.currentTarget.dataset.sec) }); },
  onDec(e) { this.save({ wdec: Number(e.currentTarget.dataset.n) }); },
  onToggle(e) {
    const f = e.currentTarget.dataset.f;
    if (!f) return;
    this.save({ [f]: !this.data[f] });
  },

  onEquipName(e) { this.setData({ equipName: (e.detail && e.detail.value) || '' }); },
  onEquipToggleItem(e) {
    const k = e.currentTarget.dataset.k;
    const pick = this.data.equipPick.includes(k)
      ? this.data.equipPick.filter(x => x !== k)
      : this.data.equipPick.concat([k]);
    this.setData({ equipPick: pick });
  },
  onEquipSave() {
    const id = (this.data.equip && this.data.equip.active && this.data.equip.active.id) || '';
    api.call('/api/tt/equipment/profile', {
      method: 'POST',
      data: { id, name: this.data.equipName, equipment: this.data.equipPick }
    })
      .then(v => { this.setData({ equip: v }); toast('器械档案已保存'); })
      .catch(() => toast('没保存上'));
  }
});
