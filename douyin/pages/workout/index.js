const S = require('../../utils/session');
const api = require('../../utils/api');

// 震动：真机上用来提醒"休息结束"，开发者工具里没有就静默跳过。
/** 设置里的开关（没拉到设置时按默认：都开）。 */
function settingsOn(key) {
  try {
    const st = api.cachedSettings();
    if (!st) return true;
    return st[key] !== false;
  } catch (e) { return true; }
}

function buzz(heavy) {
  if (!settingsOn('vibrate')) return;
  try {
    if (typeof tt !== 'undefined' && tt.vibrateShort) tt.vibrateShort({ type: heavy ? 'heavy' : 'light' });
  } catch (e) { /* 工具里不支持震动，忽略 */ }
}

// 一次轻提示：±30 秒这种动作改了数字却没有手感，人也说不清到底点没点到。
function toast(title) {
  try {
    if (typeof tt !== 'undefined' && tt.showToast) tt.showToast({ title, icon: 'none', duration: 800 });
  } catch (e) { /* 忽略 */ }
}

// 到点的一声"叮"：面板在半屏里，用户可能正盯着上面的视频，光靠震动容易忽略。
let dingCtx = null;
function ding() {
  if (!settingsOn('sound')) return;
  try {
    if (typeof tt === 'undefined' || !tt.createInnerAudioContext) return;
    if (!dingCtx) {
      dingCtx = tt.createInnerAudioContext();
      dingCtx.src = '/assets/ding.wav';
    }
    dingCtx.stop();
    dingCtx.play();
  } catch (e) { /* 静音/播放器不可用就算了，震动还在 */ }
}

// 训练中别自动锁屏：人在看上面的视频，屏幕一黑就什么都提醒不到。
function keepScreen(on) {
  try {
    if (typeof tt !== 'undefined' && tt.setKeepScreenOn) tt.setKeepScreenOn({ keepScreenOn: !!on });
  } catch (e) { /* 不支持就算了 */ }
}


/** 把登录/网络错误翻成一句人话——tt.login 的原始 message 有 60 多字，弹层里放不下。 */
function errText(e, fallback) {
  const msg = String((e && e.message) || '');
  if (msg.includes('11008') || msg.includes('测试设备') || msg.includes('未加入应用测试设备')) {
    return '模拟器账号未加入测试设备，去开放平台「开发设置 → 测试设备管理」添加';
  }
  if (e && e.status === 401) return '未登录，点这里重试';
  if (e && e.status) return String(e.status);
  return fallback || '网络';
}

Page({
  data: {
    state: 'set',
    compact: false,
    userName: '',
    logged: false,
    linked: false,
    loginErr: '',
    loadErr: '',
    restEdit: false,
    mini: false,
    miniText: '',
    miniNext: '',
    planName: '今天',
    title: '',
    cue: '',
    nextName: '',
    exNo: 1,
    exCount: 2,
    setLine: '',
    setsDone: 0,
    weight: 0,
    reps: 0,
    left: '0:00',
    nextLine: '',
    progress: 0,
    totalLine: '',
    foot: '休息时切出去刷抖音，到点这里会提醒你回来',
    debugCompact: false,
    // 换动作的弹层
    pickOpen: false,
    pickList: [],
    pickLoading: false,
    pickErr: '',
    // 自由训练 / 加动作的动作搜索层
    exOpen: false,
    exMode: 'free',
    exQuery: '',
    exList: [],
    exLoading: false,
    exErr: '',
    rir: null,
    rirChoices: [0, 1, 2, 3, 5],
    effortOn: false,
    ssOn: false,
    ssWith: '',
    platesOpen: false,
    plateTarget: '',
    plateBar: '20',
    plateOut: null,
    menuOpen: false,
    moreOpen: false,
    photoBusy: false,
    focus: false,
    fTitle: '',
    fSetLine: '',
    fWeight: 0,
    fReps: 0,
    fIsTime: false,
    fPerSide: false,
    fNext: '',
    numOpen: false,
    numW: '',
    numR: '',
    lastLine: '',
    noteOpen: false,
    noteText: '',
    noteSaved: '',
    // 动作示范
    infoOpen: false,
    info: null,
    infoLoading: false,
    infoErr: ''
  },

  onLoad() {
    this.session = S.createSession();
    this.wasResting = false;
    this.planName = '示例';
    keepScreen(true);

    // 直播间挂载时小程序几乎占满屏幕，盖住了聊天/送礼区；从那里进来先收起，
    // 只留一条倒计时，用户想互动就关掉小程序。启动参数里认不出就按普通视频处理。
    let launch = {};
    // 首页的「随便练」带 free=1 进来：登录/计划就绪后直接开动作搜索层。
    this.freeOnBoot = false;
    try { launch = (tt.getLaunchOptionsSync && tt.getLaunchOptionsSync()) || {}; } catch (e) { launch = {}; }
    const q = launch.query || {};
    this.freeOnBoot = q.free === '1';
    this.freeExId = q.ex ? String(q.ex) : '';
    // 直播间挂载：小程序几乎占满屏幕，会盖住聊天/送礼区。现在决定不挂直播间，
    // 这里只在挂载链接显式带 from=live 时收起，普通视频入口不受影响。
    const fromLive = q.from === 'live' || q.scene === 'live';
    if (fromLive) this.setData({ mini: true });
    // 从视频挂载进来是半屏：窗口高度只有整屏的一半左右。这时候顶部的"今天 / 口令"
    // 会把面板挤出去，按钮落到屏幕外——所以半屏里直接不显示那块，只留面板。
    try {
      const info = typeof tt !== 'undefined' && tt.getSystemInfoSync ? tt.getSystemInfoSync() : null;
      this.compact = !!info && (info.windowHeight || 0) < 560;
    } catch (e) { this.compact = false; }

    // 先用本地存的令牌试一次计划：开发者工具里 app.onLaunch 偶尔不跑（热重载），
    // 只等 loginPromise 会永远等不到，面板就一直停在示例。
    try { console.log('[boot]', JSON.stringify({ token: api.loggedIn(), appid: api.runtimeAppId() })); } catch (e) {}
    this.bootPlan();

    // 登录在 App.onLaunch 里就开始了；这里等它，而不是再发一次 tt.login。
    const app = getApp();
    const wait = (app && app.globalData && app.globalData.loginPromise) || Promise.resolve(null);
    wait.then(res => {
      const user = res && res.user;
      if (!user) {
        const app2 = getApp();
        const err = (app2 && app2.globalData && app2.globalData.loginError) || 'login-failed';
        this.setData({ loginErr: errText(err) });
        // 登录没成，但如果本地令牌还有效，计划照样能拉到，就不必让用户对着示例干等。
        this.bootPlan();
        return null;
      }
      this.setData({ logged: true, linked: !!(res && res.linked), userName: user.name || '' });
      // 第一次登录给个明确的信号，之后不再打扰（登录是静默的，用户否则察觉不到）。
      try {
        if (!tt.getStorageSync('gym_welcomed')) {
          tt.setStorageSync('gym_welcomed', 1);
          toast('已登录 · ' + (user.name || ''));
        }
      } catch (e) { /* 存储不可用就算了 */ }
      // 先拿计划，再把上一次没结束的草稿并回来（进度不能从第 1 组重来）。
      return this.bootPlan().then(() => this.applyDraft());
    });

    this.render();
  },

  /** 启动时先试一次：有本地令牌就能拿到计划，不必等登录流程。 */
  bootPlan() {
    return this.loadPlan().catch(() => { /* loadPlan 自己会写 loadErr */ });
  },

  /** 把服务端上没结束的草稿并回来：进度、已记组数、底部入口。 */
  applyDraft() {
    return api.call('/api/tt/draft')
      .then(out => {
        const draft = out && out.draft;
        const n = draft
          ? draft.exercises.reduce((sum, e) => sum + (e.sets ? e.sets.length : 0), 0)
          : 0;
        if (!n) return;
        S.resumeFromDraft(this.session, draft);
        this.recorded = n;
        this.render();
        toast('继续上次的训练 · 已记 ' + n + ' 组');
      })
      .catch(() => { /* 没草稿或接口挂了：照常开始 */ });
  },

  /** 登录之后才谈得上"今天练什么"；拿不到（休息日 / 后端没计划）就继续用 demo。 */
  loadPlan() {
    // 明确要中文：账号里的 lang 可能是 en（网页端设过），但抖音里我们要中文动作名。
    return api.call('/api/tt/today?lang=zh')
      .then(view => {
        const training = !!(view && view.training && view.routines[0]);
        const name = training ? view.routines[0].name : '';
        // 没有计划时面板上还是 demo 动作，顶部标成"示例"，免得被当成真实数据。
        this.planName = name || '示例';
        this.routineId = training ? view.routines[0].id : null;
        // 只有真计划才允许写记录：demo 是演示，不能变成用户历史里的假数据。
        this.fromPlan = training;
        S.withPlan(this.session, view);
        try { console.log('[plan]', JSON.stringify({ training, ex: this.session.exercises.length, name: this.planName })); } catch (e) {}
        if (this.data.loadErr) this.setData({ loadErr: '' });
        this.render();
      })
      .catch(e => {
        this.fromPlan = false;
        try { console.log('[plan:err]', (e && e.status), JSON.stringify((e && e.data) || null)); } catch (err) {}
        this.setData({ loadErr: (e && e.status) || '网络' });
        this.render();
      });
  },

  onBind() {
    tt.navigateTo({ url: '/pages/bind/index' });
  },

  onHistory() {
    tt.navigateTo({ url: '/pages/history/index' });
  },

  onPlan() {
    tt.navigateTo({ url: '/pages/plan/index' });
  },

  /** 计划没加载出来时的手动重试（登录失败走 onRetry）。 */
  onReloadPlan() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.user) { this.onRetry(); return; }
    this.setData({ loadErr: '' });
    this.loadPlan();
  },

  /** 主动结束：不必做完整个计划，点了就把已记的并进 openGym。 */
  onEndSession() {
    if (!this.fromPlan) { toast('示例数据，不会保存'); return; }
    S.endSession(this.session);
    this.sentFinish = true;
    this.render();
    api.finishSession()
      .then(saved => toast(saved && saved.workout ? '已保存' : '没有可保存的记录'))
      .catch(e => toast('保存失败 · ' + ((e && e.status) || '网络')));
  },

  /** 登录失败时脚注上那句"点这里重试"——不让人只能杀进程重来。 */
  onRetry() {
    this.setData({ loginErr: '' });
    api.login()
      .then(res => {
        this.setData({ logged: true, linked: !!res.linked, userName: (res.user && res.user.name) || '' });
        return this.loadPlan();
      })
      .catch(e => this.setData({ loginErr: errText(e, 'login-failed') }));
  },

  // 从后台回来（用户去刷了全屏视频再回来）：用时间戳校正，而不是从头计时。
  onShow() {
    this.startTick();
    // 上次离线时没发出去的组，回到前台补上
    api.flush();
    // 计划没拿到（网络抖了一下）：回到前台再试一次，别让用户一直练示例
    if (!this.fromPlan) {
      const app0 = getApp();
      if (app0 && app0.globalData && app0.globalData.user) this.loadPlan();
    }
    // 绑定页/改计划页回来：账号或计划换了。
    const app = getApp();
    if (app && app.globalData && app.globalData.planDirty) {
      app.globalData.planDirty = false;
      if (app.globalData.user) {
        this.setData({ userName: app.globalData.user.name || '', linked: true });
        this.loadPlan();
      }
    }
    this.render();
  },

  onHide() { this.stopTick(); },
  onUnload() { this.stopTick(); keepScreen(false); },

  startTick() {
    this.stopTick();
    this.tick = setInterval(() => this.render(), 500);
  },
  stopTick() {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
  },

  render() {
    const s = this.session;
    const now = Date.now();
    const state = S.viewState(s, now);

    // 到点整块切成"下一组"：震动 + 叮一声（光震动容易错过）
    if (this.wasResting && state === 'set') {
      S.endRest(s);
      buzz(true);
      ding();
      this.restDone = true;
    }
    this.wasResting = state === 'rest';

    // 整场结束：把草稿并进 openGym 的 workouts（只发一次）。
    if (state === 'finished' && !this.sentFinish) {
      this.sentFinish = true;
      if (this.fromPlan) api.finishSession().catch(() => { /* 没结束也会留在草稿里，下次仍可手动结束 */ });
    }

    const ex = S.current(s);
    const t = S.totals(s);
    const left = S.restLeft(s, now);
    const foot = state === 'rest'
      ? '刷你的抖音，到点这里会震一下'
      : state === 'exerciseDone'
        ? '这个动作练完了'
        : state === 'finished'
          ? '示例数据，登录后同步你自己的计划'
          : '休息时切出去刷抖音，到点这里会提醒你回来';

    // 训练中常亮，结束后放开（只在这两个状态切换时调用一次）
    const st = api.cachedSettings() || {};
    const wantOn = state !== 'finished' && st.keepAwake !== false;
    if (this.screenOn !== wantOn) { this.screenOn = wantOn; keepScreen(wantOn); }

    const leftText = S.mmss(S.restLeft(s, now));
    const miniText = state === 'rest' ? leftText
      : state === 'set' ? (this.restDone ? '休息结束' : '待完成')
      : state === 'exerciseDone' ? '本动作完成' : '收工';
    const miniNext = ex && (state === 'rest' || state === 'set') ? ex.weight + ' kg × ' + ex.reps : '';

    this.setData({
      state,
      compact: !!(this.compact || this.data.debugCompact),
      miniText,
      miniNext,
      recorded: this.recorded || 0,
      planName: this.planName || '今天',
      title: ex ? ex.name : '',
      cue: ex ? ex.cue || '' : '',
      nextName: S.nextName(s),
      exNo: s.exIdx + 1,
      exCount: s.exercises.length,
      setLine: ex ? '第 ' + Math.min(ex.done + 1, ex.sets) + ' 组 / 共 ' + ex.sets + ' 组' : '',
      setsDone: ex ? ex.done : 0,
      weight: ex ? S.weightForSet(ex) : 0,
      reps: ex ? S.repsForSet(ex) : 0,
      isTime: !!(ex && ex.mode === 'time'),
      perSide: !!(ex && ex.perSide),
      left: S.mmss(left),
      nextLine: ex ? '下一组：' + S.weightForSet(ex) + ' kg × ' + S.repsForSet(ex) : '',
      progress: t.total ? Math.round((t.done / t.total) * 100) : 0,
      totalLine: t.done + ' / ' + t.total + ' 组',
      ssOn: !!(ex && ex.group),
      ssWith: (() => {
        if (!ex || !ex.group) return '';
        const other = s.exercises.find(x => x && x !== ex && x.group === ex.group);
        return other ? other.name : '';
      })(),
      foot
    });

    this.loadLast();
    if (this.data.focus) this.syncFocus();

    // 从首页点「随便练」进来的：登录已就绪就直接开动作搜索，省一次点击
    if (this.freeOnBoot && this.data.logged) {
      this.freeOnBoot = false;
      if (this.freeExId) {
        // 从动作库点「练这个」进来的：直接开这一场，不用再搜一次
        const id = this.freeExId; this.freeExId = '';
        S.startFree(this.session, { id, name: this.data.title || id });
        this.fromPlan = true;
        this.planName = '自由训练';
        this.render();
      } else {
        this.openExPick('free');
      }
    }
  },

  onFinish() {
    S.finishSet(this.session);
    buzz(false);
    this.recordSet();
    this.restDone = false;
    this.setData({ restEdit: false });

    // 专注模式：这个动作做完了就自动去下一个，少一次点击
    const focusAutoNext = this.data.focus && S.remainingSets(this.session) === 0 && !this.session.finished;
    if (focusAutoNext) {
      S.nextExercise(this.session);
      const nxt = S.current(this.session);
      if (nxt) toast('下一个：' + nxt.name);
    }
    this.render();
    const focusFinished = this.data.focus && this.session.finished;
    if (focusFinished) {
      // 整场练完了：专注层没东西可做了，直接退回普通面板
      this.setData({ focus: false });
      toast('今天练完了');
    } else if (this.data.focus) {
      this.syncFocus();
    }
  },

  /** 练完拍一张：直接进进度照片，备注带上今天练的什么。 */
  onFinishPhoto() {
    if (this.data.photoBusy) return;
    this.setData({ photoBusy: true });
    api.pickAndUpload(['camera', 'album'])
      .then(url => {
        const file = url.split('/api/tt/media/')[1] || '';
        const d0 = new Date();
        const pad = n => String(n).padStart(2, '0');
        const d = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
        return api.call('/api/tt/photos', {
          method: 'POST',
          data: { file, d, note: ('练完 · ' + (this.planName || '')).slice(0, 40) }
        });
      })
      .then(() => { this.setData({ photoBusy: false }); tt.showToast({ title: '已存进进度照片', icon: 'none' }); })
      .catch(err => {
        this.setData({ photoBusy: false });
        const msg = (err && (err.error || err.errMsg || err.message)) || '';
        tt.showToast({ title: '没拍成' + (msg ? '：' + String(msg).slice(0, 30) : ''), icon: 'none', duration: 2500 });
      });
  },

  /** 更多：低频动作都收在这里，面板上只留四个常用按钮。 */
  onMoreOpen() { this.setData({ moreOpen: true }); },
  onMoreClose() { this.setData({ moreOpen: false }); },

  /** 专注模式：只留一组的事，别的都藏起来。 */
  onFocusToggle() {
    this.setData({ moreOpen: false });
    const on = !this.data.focus;
    this.setData({ focus: on });
    if (on) this.syncFocus();
  },
  /** 把当前组的关键信息同步给专注层。 */
  syncFocus() {
    const ex = S.current(this.session);
    if (!ex) return;
    this.setData({
      fTitle: ex.name || '',
      fSetLine: '第 ' + Math.min(ex.done + 1, ex.sets) + ' / ' + ex.sets + ' 组',
      fWeight: S.weightForSet(ex),
      fReps: S.repsForSet(ex),
      fIsTime: ex.mode === 'time',
      fPerSide: ex.perSide === true,
      fNext: S.nextName(this.session) || '最后一个动作'
    });
  },

  /** 直接输入重量 / 次数（面板里 ± 调太慢时用）。 */
  onNumOpen() {
    const ex = S.current(this.session);
    if (!ex) return;
    this.setData({
      numOpen: true,
      numW: String(S.weightForSet(ex)),
      numR: String(S.repsForSet(ex))
    });
  },
  onNumClose() { this.setData({ numOpen: false }); },
  onNumW(e) { this.setData({ numW: (e.detail && e.detail.value) || '' }); },
  onNumR(e) { this.setData({ numR: (e.detail && e.detail.value) || '' }); },
  onNumSave() {
    const w = Number(this.data.numW);
    const r = Number(this.data.numR);
    if (Number.isFinite(w)) S.setWeight(this.session, w);
    if (Number.isFinite(r)) S.setReps(this.session, r);
    this.setData({ numOpen: false });
    buzz(false);
    this.render();
  },

  /** 把刚记的那一组改成热身（只影响这一组的统计口径）。 */
  onSetToWarm() {
    const ex = S.current(this.session);
    if (!ex || ex.done <= 0) { toast('还没有记下的组'); return; }
    const setNo = ex.done;
    api.setToWarm({ exId: ex.id, setNo })
      .then(() => {
        S.undoSet(this.session);
        this.render();
        toast('这组改成热身了');
      })
      .catch(() => toast('没改成'));
  },

  /** 动作菜单：上移 / 下移 / 删除（网页端在动作标题旁的菜单里）。 */
  onExMenu() { this.setData({ menuOpen: true }); },
  onExMenuClose() { this.setData({ menuOpen: false }); },
  onExUp() { S.moveExercise(this.session, -1); this.setData({ menuOpen: false }); this.render(); },
  onExDown() { S.moveExercise(this.session, 1); this.setData({ menuOpen: false }); this.render(); },
  onExRemove() {
    this.setData({ menuOpen: false });
    S.removeExercise(this.session);
    buzz(true);
    this.render();
  },

  /** 上次这个动作练了什么（"上次：60×8 60×8"）。 */
  loadLast() {
    const ex = S.current(this.session);
    if (!ex || !this.fromPlan) { this.setData({ lastLine: '' }); return; }
    if (this.lastFor === ex.id) return;
    this.lastFor = ex.id;
    api.call('/api/tt/last?exId=' + encodeURIComponent(ex.id))
      .then(v => {
        const rows = (v && v.rows) || [];
        this.setData({
          lastLine: rows.length
            ? '上次 ' + (v.d || '') + '：' + rows.map(r => (r.w ? r.w + '×' + r.r : r.r + ' 次')).join('  ')
            : ''
        });
      })
      .catch(() => this.setData({ lastLine: '' }));
  },

  /** 热身组：记一条不计入正式组的记录（不上报组数、容量、PR）。 */
  onWarm() {
    const ex = S.current(this.session);
    if (!ex || !this.fromPlan) { toast('演示里不记热身'); return; }
    api.sendWarm({
      exId: ex.id,
      name: ex.name,
      w: S.weightForSet(ex),
      r: ex && ex.mode === 'time' ? 0 : S.repsForSet(ex),
      s: ex && ex.mode === 'time' ? S.repsForSet(ex) : 0,
      perSide: !!(ex && ex.perSide),
      at: Date.now()
    }).catch(() => {});
    buzz(false);
    toast('热身 ' + S.weightForSet(ex) + ' kg × ' + S.repsForSet(ex));
  },

  /** 动作备注：今天肩有点紧之类，存进这一场。 */
  onNoteOpen() { this.setData({ noteOpen: true, noteText: this.data.noteSaved || '' }); },
  onNoteClose() { this.setData({ noteOpen: false }); },
  onNoteInput(e) { this.setData({ noteText: (e.detail && e.detail.value) || '' }); },
  onNoteSave() {
    const ex = S.current(this.session);
    if (!ex) return;
    const note = this.data.noteText.trim();
    api.sendNote({ exId: ex.id, name: ex.name, note })
      .then(() => { this.setData({ noteSaved: note, noteOpen: false }); toast(note ? '备注已记' : '备注已清'); })
      .catch(() => toast('没存上'));
  },

  /** 杠铃片：按目标重量算出每边该挂哪些片。 */
  onPlatesOpen() {
    this.setData({ moreOpen: false });
    const ex = S.current(this.session);
    this.setData({
      platesOpen: true,
      plateTarget: String((ex && S.weightForSet(ex)) || ''),
      plateOut: this.plates(Number(this.data.plateBar) || 20, Number((ex && S.weightForSet(ex)) || 0))
    });
  },
  onPlatesClose() { this.setData({ platesOpen: false }); },
  onPlateTarget(e) {
    const v = (e.detail && e.detail.value) || '';
    this.setData({ plateTarget: v, plateOut: this.plates(Number(this.data.plateBar) || 20, Number(v) || 0) });
  },
  onPlateBar(e) {
    const v = (e.detail && e.detail.value) || '';
    this.setData({ plateBar: v, plateOut: this.plates(Number(v) || 20, Number(this.data.plateTarget) || 0) });
  },
  /** 每边挂片：从大到小贪心，凑不出来就把余量标出来。 */
  plates(bar, target) {
    const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
    if (!(target > bar)) return { list: [], rest: 0, perSide: 0 };
    let perSide = (target - bar) / 2;
    const list = [];
    for (const p of PLATES) {
      while (perSide >= p - 1e-9) { list.push(p); perSide = Math.round((perSide - p) * 100) / 100; }
    }
    return { list, rest: Math.round(perSide * 100) / 100, perSide: Math.round(((target - bar) / 2) * 100) / 100 };
  },

  /** 超集：把当前动作和下一个动作绑在一起，交替做完再休息。 */
  onSuperset() {
    this.setData({ moreOpen: false });
    const cur = S.current(this.session);
    if (!cur) return;
    if (cur.group) {
      S.unlinkSuperset(this.session);
      toast('已拆掉超集');
    } else {
      const next = this.session.exercises[this.session.exIdx + 1];
      if (!next) { toast('后面没有动作可搭配'); return; }
      S.linkSuperset(this.session);
      toast('超集：' + cur.name + ' + ' + next.name);
    }
    buzz(false);
    this.render();
  },

  /** 递减组：掉 10% 重量当场再来一组（不休息）。 */
  onDropSet() {
    S.dropSet(this.session);
    buzz(true);
    this.recordSet();
    this.restDone = false;
    this.setData({ restEdit: false });
    this.render();
    const ex = S.current(this.session);
    if (ex) toast('递减到 ' + ex.weight + ' kg');
  },

  /** 休息暂停：记一组后只歇 15 秒。 */
  onRestPause() {
    S.restPause(this.session);
    buzz(false);
    this.recordSet();
    this.restDone = false;
    this.setData({ restEdit: false });
    this.render();
  },

  /** 每完成一组就落一条：本地队列先兜底，离线也不丢。 */
  recordSet() {
    if (!this.fromPlan) return;   // 演示数据不写进账号
    const ex = S.current(this.session);
    if (!ex || !ex.done) return;
    this.recorded = (this.recorded || 0) + 1;
    api.sendSet({
      exId: ex.id,
      name: ex.name,
      setNo: ex.done,
      w: S.weightForSet(ex),
      r: S.repsForSet(ex),
      at: Date.now(),
      rir: this.data.rir,
      routineId: this.routineId || null,
      routineName: this.planName || ''
    }).catch(() => { /* 已进本地队列，下次进前台补发 */ });
  },
  /** 余力（RIR）：0 = 力竭，5 = 还能再做 5 次以上；不点就不记。 */
  onRir(e) {
    const v = Number(e.currentTarget.dataset.n);
    this.setData({ rir: this.data.rir === v ? null : v });
    buzz(false);
  },

  onAddSet() {
    S.addSet(this.session);
    buzz(false);
    toast('加了一组 · 共 ' + S.current(this.session).sets + ' 组');
    this.render();
  },

  /** 器械被占了：拉同部位的替代动作，弹出选择层。 */
  onSwap() {
    this.setData({ moreOpen: false });
    const ex = S.current(this.session);
    if (!ex || this.session.finished) return;
    this.setData({ pickOpen: true, pickLoading: true, pickErr: '', pickList: [] });
    // 今天计划里还没做的动作不进候选：替代它，不该等于把后面的动作提前做掉
    const rest = this.session.exercises.filter(e => e && e.id && e.id !== ex.id).map(e => e.id);
    api.alternatives(ex.id, rest)
      .then(list => this.setData({ pickList: list || [], pickLoading: false }))
      .catch(e => this.setData({ pickLoading: false, pickErr: errText(e) }));
  },
  onSwapClose() {
    this.setData({ pickOpen: false });
  },
  onSwapRetry() {
    this.onSwap();
  },
  onSwapPick(e) {
    const d = e.currentTarget.dataset || {};
    if (!d.id) return;
    S.swapExercise(this.session, { id: d.id, name: d.name });
    buzz(false);
    toast('换成 ' + (d.name || '新动作'));
    this.setData({ pickOpen: false });
    this.render();
  },
  /** 撤销上一组：本地状态 + 服务端那条一起撤。 */
  onUndo() {
    const ex = S.current(this.session);
    const no = S.undoSet(this.session);
    if (!no) { toast('还没记过这一组'); return; }
    buzz(false);
    if (this.fromPlan && ex) {
      this.recorded = Math.max(0, (this.recorded || 0) - 1);
      api.undo(ex.id, no).catch(() => { /* 下次进前台补发时也不会再发它 */ });
    }
    toast('撤销了第 ' + no + ' 组');
    this.setData({ restEdit: false });
    this.render();
  },

  noop() {},

  /** 自由训练 / 加动作：打开动作搜索层。 */
  onFree() { this.openExPick('free'); },
  onAddEx() { this.openExPick('add'); },
  openExPick(mode) {
    this.setData({ exOpen: true, exMode: mode, exQuery: '', exList: [], exErr: '', exLoading: false });
  },
  onExClose() { this.setData({ exOpen: false }); },

  /** 点动作名：看这个名字对应的示范。图走同一台服务器的 media，不额外搭 CDN。 */
  onInfo() {
    const ex = S.current(this.session);
    if (!ex || !ex.id) return;
    this.setData({ infoOpen: true, info: null, imgErr: false, infoLoading: true, infoErr: '' });
    api.exerciseInfo(ex.id)
      .then(info => this.setData({
        info: Object.assign({}, info, { jpgUrl: api.BASE + info.imgJpg, webpUrl: api.BASE + info.img, clipUrl: api.BASE + info.clip,
          videoSrc: api.BASE + info.clip,
          clipData: info.clipData || '' }), videoErr: false,
        imgErr: false, useWebp: false,
        infoLoading: false
      }))
      .catch(e => this.setData({ infoLoading: false, infoErr: errText(e) }));
  },
  onInfoClose() { this.setData({ infoOpen: false }); },
  onInfoSwap() {
    this.setData({ infoOpen: false });
    this.onSwap();
  },
  onExInput(e) {
    const q = (e && e.detail && e.detail.value) || '';
    this.setData({ exQuery: q });
    if (this.exTimer) clearTimeout(this.exTimer);
    const s = q.trim();
    if (!s) { this.setData({ exList: [], exLoading: false }); return; }
    this.setData({ exLoading: true, exErr: '' });
    this.exTimer = setTimeout(() => {
      api.searchExercises(s)
        .then(list => this.setData({ exList: list || [], exLoading: false }))
        .catch(err => this.setData({ exLoading: false, exErr: errText(err) }));
    }, 260);
  },
  onExPick(e) {
    const d = e.currentTarget.dataset || {};
    if (!d.id) return;
    const ex = { id: d.id, name: d.name };
    if (this.data.exMode === 'add') {
      S.addExercise(this.session, ex);
      toast('加了 ' + (d.name || '一个动作'));
    } else {
      S.startFree(this.session, ex);
      this.fromPlan = true;          // 自由训练也要记账：不是演示数据
      this.planName = '自由训练';
      toast('开始练 ' + (d.name || ''));
    }
    buzz(false);
    this.setData({ exOpen: false });
    this.render();
  },
  onToggleMini() {
    this.setData({ mini: !this.data.mini });
  },

  // 面板上往下拖 → 收起成一条；往上拖 → 展开。不依赖那个"收起"按钮。
  // 抖音也可能把这个手势当成"关闭半屏"，那就会直接回视频流——回来点挂载点，进度还在。
  onPanelTouchStart(e) {
    const t = e.touches && e.touches[0];
    this.touchY = t ? t.clientY : 0;
  },
  onPanelTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (!t || !this.touchY) return;
    const dy = t.clientY - this.touchY;
    if (dy > 50 && !this.data.mini) { this.touchY = 0; this.setData({ mini: true }); }
    else if (dy < -40 && this.data.mini) { this.touchY = 0; this.setData({ mini: false }); }
  },

  onSkip() {
    S.skipRest(this.session);
    buzz(false);
    this.restDone = false;
    this.setData({ restEdit: false });
    this.render();
  },
  onToggleEdit() {
    this.setData({ restEdit: !this.data.restEdit });
  },
  onRestMinus() {
    S.adjustRest(this.session, -30);
    buzz(false);
    toast(S.isResting(this.session) ? '休息 −30s' : '休息结束');
    this.render();
  },
  onRestPlus() {
    S.adjustRest(this.session, 30);
    buzz(false);
    toast('休息 +30s');
    this.render();
  },
  onNext() {
    const st = api.cachedSettings() || {};
    if (st.collapseDone === true) {
      // 往后找第一个还没做满的动作，跳过中间的"已完成"
      for (let i = this.session.exIdx + 1; i < this.session.ex.length; i++) {
        const ex = this.session.ex[i];
        if (ex && ex.done < ex.sets) { this.session.exIdx = i; S.endRest(this.session); buzz(false); this.render(); return; }
      }
    }
    return this.defaultNext();
  },

  defaultNext() {
    S.nextExercise(this.session);
    this.render();
  },
  onRestart() {
    this.session = S.createSession();
    this.wasResting = false;
    this.sentFinish = false;
    this.recorded = 0;
    this.render();
  },
  onWeightPlus() { S.adjustWeight(this.session, S.KG_STEP); this.render(); },
  onWeightMinus() { S.adjustWeight(this.session, -S.KG_STEP); this.render(); },
  onRepsPlus() { S.adjustReps(this.session, S.REPS_STEP); this.render(); },
  /** 减：秒数制减 5 秒，普通动作减 1 次。 */
  onMinus() {
    if (this.data.isTime) S.adjustSecs(this.session, -5); else S.adjustReps(this.session, -1);
    buzz(false);
    this.render();
  },
  /** 加：秒数制加 5 秒，普通动作加 1 次。 */
  onPlus() {
    if (this.data.isTime) S.adjustSecs(this.session, 5); else S.adjustReps(this.session, 1);
    buzz(false);
    this.render();
  },
  onSecsMinus() {
    S.adjustSecs(this.session, -5);
    buzz(false);
    this.render();
  },
  onSecsPlus() {
    S.adjustSecs(this.session, 5);
    buzz(false);
    this.render();
  },
  onRepsMinus() { S.adjustReps(this.session, -S.REPS_STEP); this.render(); },

  onVideoErr() {
      const info = this.data.info || {};
      if (info.clipData && info.videoSrc !== info.clipData) {
        // 网络视频拉不下来：改用内嵌的那份再试一次
        this.setData({ info: Object.assign({}, info, { videoSrc: info.clipData }) });
        return;
      }
      this.setData({ videoErr: true });
    },
  onImgRetry() { this.setData({ imgErr: false, useWebp: false }); },
  onImgErr() {
      // jpg 没出来就试 webp，都失败才显示占位
      if (!this.data.useWebp) this.setData({ useWebp: true });
      else this.setData({ imgErr: true });
    }
});
