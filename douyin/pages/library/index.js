/* 动作库：对齐网页端 —— 教练讲解是「货架模式」，不是弹层；下面是专题；再下面是列表。
 * 数据：/api/tt/library（含缩略图）、/api/tt/notes、/api/tt/topics。
 */
const api = require('../../utils/api');

Page({
  data: {
    total: 0,
    parts: [], cats: [], gear: [],
    bp: '', cat: '', eq: '', q: '',
    items: [], offset: 0, hasMore: false, loading: false, err: '',
    onlyNotes: false,
    noteItems: [], noteGroups: [], notesCoaches: '', notesCount: 0,
    topics: [],
    topicList: [],
    showTopics: false,
    allGroups: [],
    animOff: false,
    noteSheetOpen: false,
    noteSheet: null,
    noteSheetLoading: false,
    topicGroups: [],
    openPart: '',
    similar: [],
    createOpen: false,
    customName: '',
    customParts: [],
    customBp: 'chest',
    saving: false,
    mineOpen: false,
    mine: null,
    equip: null,
    view: 'list',            // list | cards
    planOpen: false,
    planRoutines: [],
    planExId: '',
    infoOpen: false, info: null, infoLoading: false, imgErr: false, videoErr: false, useWebp: false,
    topicOpen: false, topic: null, topicLoading: false
  },

  onLoad() {
    try {
      const v = tt.getStorageSync('tt_lib_view');
      if (v === 'cards' || v === 'list') this.setData({ view: v });
    } catch (e) {}
    api.call('/api/tt/library/filters')
      .then(f => this.setData({ parts: f.parts || [], cats: f.cats || [], gear: f.gear || [] }))
      .catch(() => {});
    api.call('/api/tt/notes')
      .then(n => {
        const items = n.items || [];
        const coaches = [...new Set(items.flatMap(i => i.coaches || []))].join('、');
        this.setData({ noteItems: items, notesCount: n.count || items.length, notesCoaches: coaches });
      })
      .catch(() => {});
    api.call('/api/tt/topics?grouped=1')
      .then(t => this.setData({ allGroups: t.groups || [], topics: (t.groups || []).reduce((n, g) => n.concat(g.items), []) }))
      .catch(() => {});
    api.call('/api/tt/equipment')
      .then(e => this.setData({ equip: e }))
      .catch(() => {});
    api.call('/api/tt/custom')
      .then(c => this.setData({ customParts: c.parts || [] }))
      .catch(() => {});
    this.load(true);
  },

  /** 器械档案开关：只显示"我有的器械"能做的动作（网页端那条横幅）。 */
  onEquipToggle() {
    const e = this.data.equip;
    if (!e || !e.active) return;
    const on = !e.on;
    api.call('/api/tt/equipment/filter', { method: 'POST', data: { on, id: e.active.id } })
      .then(v => { this.setData({ equip: v }); this.load(true); })
      .catch(() => {});
  },

  onCreateOpen() { this.setData({ createOpen: true, customName: '', customBp: 'chest' }); },
  onCreateClose() { this.setData({ createOpen: false }); },
  onCreateInput(e) { this.setData({ customName: (e.detail && e.detail.value) || '' }); },
  onBpPick(e) { this.setData({ customBp: e.currentTarget.dataset.k || 'chest' }); },
  onCreateSave() {
    const name = this.data.customName.trim();
    if (!name) { tt.showToast({ title: '先起个名字', icon: 'none' }); return; }
    this.setData({ saving: true });
    api.call('/api/tt/custom', { method: 'POST', data: { name, bp: this.data.customBp } })
      .then(() => {
        this.setData({ saving: false, createOpen: false });
        tt.showToast({ title: '已创建', icon: 'none' });
        this.load(true);
      })
      .catch(() => { this.setData({ saving: false }); tt.showToast({ title: '没建成', icon: 'none' }); });
  },

  onMineOpen(e) {
    const id = e.currentTarget.dataset.id;
    const it = this.data.items.find(x => x.id === id);
    if (it) this.setData({ mineOpen: true, mine: it });
  },
  onMineClose() { this.setData({ mineOpen: false }); },
  onMineDelete() {
    const it = this.data.mine;
    if (!it) return;
    api.call('/api/tt/custom/delete', { method: 'POST', data: { id: it.id } })
      .then(() => {
        this.setData({ mineOpen: false, items: this.data.items.filter(x => x.id !== it.id) });
        tt.showToast({ title: '已删除', icon: 'none' });
      })
      .catch(() => {});
  },

  load(reset) {
    if (this.data.onlyNotes) return;
    const offset = reset ? 0 : this.data.offset;
    this.setData({ loading: true, err: '' });
    const url = '/api/tt/library?inline=1&limit=20&offset=' + offset
      + '&q=' + encodeURIComponent(this.data.q)
      + '&bp=' + encodeURIComponent(this.data.bp)
      + '&cat=' + encodeURIComponent(this.data.cat)
      + '&eq=' + encodeURIComponent(this.data.eq);
    api.call(url)
      .then(v => this.setData({
        loading: false,
        items: reset ? v.items : this.data.items.concat(v.items || []),
        total: v.total || 0,
        offset: offset + ((v.items && v.items.length) || 0),
        hasMore: !!v.hasMore
      }))
      .catch(e => this.setData({ loading: false, err: e && e.status === 401 ? '未登录' : '加载失败' }))
      .then(() => this.loadSimilar());
  },

  /** 专题：搜索命中才平铺；货架里按部位折叠（见 topicGroups）。 */
  refreshTopics() {
    const q = this.data.q.trim().toLowerCase();
    if (!q) {
      this.setData({ topicList: [], showTopics: false });
      return;
    }
    const list = this.data.topics.filter(tp =>
      String(tp.title || '').toLowerCase().includes(q) || String(tp.coach || '').toLowerCase().includes(q));
    this.setData({ topicList: list, showTopics: list.length > 0 });
  },

  onInput(e) {
    const q = (e.detail && e.detail.value) || '';
    this.setData({ q });
    if (this.data.onlyNotes) { this.groupNotes(q); return; }
    this.refreshTopics();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(true), 260);
  },

  /** 搜索没结果时给几条接近的动作（网页端也有这一块）。 */
  loadSimilar() {
    const q = this.data.q.trim();
    if (!q || this.data.items.length || this.data.onlyNotes) {
      if (this.data.similar.length) this.setData({ similar: [] });
      return;
    }
    api.call('/api/tt/library/similar?limit=8&q=' + encodeURIComponent(q))
      .then(v => this.setData({ similar: v.items || [] }))
      .catch(() => {});
  },

  onToggleNotes() {
    const onlyNotes = !this.data.onlyNotes;
    this.setData({ onlyNotes, bp: '', cat: '', eq: '', q: '' });
    if (onlyNotes) {
      this.groupNotes('');
      // 货架里专题按部位折叠（网页端也是：点开哪块看哪块）
      api.call('/api/tt/topics?grouped=1')
        .then(v => this.setData({ topicGroups: v.groups || [] }))
        .catch(() => {});
    }
    else this.load(true);
  },

  groupNotes(q) {
    const needle = String(q || '').trim().toLowerCase();
    const list = this.data.noteItems.filter(it => !needle
      || String(it.name || '').toLowerCase().includes(needle)
      || String(it.coaches || '').toLowerCase().includes(needle));
    const groups = [];
    for (const it of list) {
      const coach = (it.coaches && it.coaches[0]) || '其他';
      let g = groups.find(x => x.coach === coach);
      if (!g) { g = { coach, items: [] }; groups.push(g); }
      g.items.push(it);
    }
    this.setData({ noteGroups: groups });
  },

  onPartToggle(e) {
    const part = e.currentTarget.dataset.part || '';
    this.setData({ openPart: this.data.openPart === part ? '' : part });
  },

  onPick(e) {
    const d = e.currentTarget.dataset;
    this.setData({ [d.f]: this.data[d.f] === d.k ? '' : d.k }, () => this.load(true));
  },
  onAll(e) {
    this.setData({ [e.currentTarget.dataset.f]: '' }, () => this.load(true));
  },
  onToggleView() {
    const view = this.data.view === 'list' ? 'cards' : 'list';
    this.setData({ view });
    try { tt.setStorageSync('tt_lib_view', view); } catch (e) {}
  },

  onStar(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const item = this.data.items.find(x => x.id === id);
    const on = !(item && item.fav);
    api.call('/api/tt/fav', { method: 'POST', data: { id, on } })
      .then(() => {
        const items = this.data.items.map(x => (x.id === id ? { ...x, fav: on } : x));
        items.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
        this.setData({ items });
      })
      .catch(() => {});
  },

  onPlanOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ planOpen: true, planExId: id, planRoutines: [] });
    api.call('/api/tt/plan/edit')
      .then(v => this.setData({ planRoutines: v.routines || [] }))
      .catch(() => {});
  },
  onPlanClose() { this.setData({ planOpen: false }); },
  onPlanPick(e) {
    const routineId = e.currentTarget.dataset.id || '';
    const exId = this.data.planExId;
    if (!exId) return;
    this.setData({ planOpen: false });
    api.call('/api/tt/plan/append', { method: 'POST', data: { exId, routineId } })
      .then(r => { tt.showToast({ title: r.added ? '已加入计划' : '计划里已经有了', icon: 'none' }); })
      .catch(() => tt.showToast({ title: '没加上', icon: 'none' }));
  },

  onMore() { if (this.data.hasMore && !this.data.loading) this.load(false); },

  onTopic(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ topicOpen: true, topic: null, topicLoading: true });
    api.call('/api/tt/topics?id=' + encodeURIComponent(id))
      .then(tp => this.setData({ topic: tp, topicLoading: false }))
      .catch(() => this.setData({ topicLoading: false }));
  },
  onTopicClose() { this.setData({ topicOpen: false }); },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (String(id).startsWith('cu')) { this.onMineOpen(e); return; }
    // 示范动画关掉就只显示静图：先读缓存，没有就拉一次再决定
    this.currentId = id;
    const open = st => this.setData({
      infoOpen: true, info: null, infoLoading: true,
      imgErr: false, useWebp: false,
      animOff: !!(st && st.animations === false),
      videoErr: !!(st && st.animations === false)
    });
    const cached = api.cachedSettings();
    if (cached) open(cached);
    else api.loadSettings().then(open);
    api.exerciseInfo(id)
      .then(info => this.setData({
        info: Object.assign({}, info, {
          jpgUrl: api.BASE + info.imgJpg,
          webpUrl: api.BASE + info.img,
          clipUrl: api.BASE + info.clip,
          videoSrc: api.BASE + info.clip,
          clipData: info.clipData || ''
        }),
        infoLoading: false
      }))
      .catch(() => this.setData({ infoLoading: false }));
  },
  /** 货架里点一条：普通动作进详情，'不是动作'的讲解（20001…）直接展开讲解内容。 */
  onNoteRow(e) {
    const d = e.currentTarget.dataset;
    if (d.note) this.openNote(d.id);
    else this.onOpen(e);
  },
  openNote(id) {
    if (!id) return;
    this.setData({ noteSheetOpen: true, noteSheet: null, noteSheetLoading: true });
    api.call('/api/tt/notes?id=' + encodeURIComponent(id))
      .then(v => this.setData({ noteSheet: (v.notes && v.notes[0]) || null, noteSheetLoading: false }))
      .catch(() => this.setData({ noteSheetLoading: false }));
  },
  onNoteSheetClose() { this.setData({ noteSheetOpen: false }); },
  /** 打开讲解的原视频：抖音有 aweme 接口就用接口，没有就复制链接。 */
  openSource(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const m = /\/video\/(\d+)/.exec(String(url));
    const copy = () => {
      try {
        tt.setClipboardData({ data: url, success() { tt.showToast({ title: '链接已复制，去抖音打开', icon: 'none' }); } });
      } catch (err) { /* 忽略 */ }
    };
    try {
      if (m && typeof tt.openAwemeDetail === 'function') {
        tt.openAwemeDetail({
          awemeId: m[1],
          fail: copy            // 接口在但跳不过去：退回复制，别让按钮点了没反应
        });
        return;
      }
    } catch (err) { /* 走复制 */ }
    copy();
  },
  /** 详情里发现示范动画被设置关掉了：点一下就地打开，再重新加载这一条。 */
  onEnableAnim() {
    api.call('/api/tt/settings', { method: 'POST', data: { animations: true } })
      .then(s => { api.rememberSettings(s); this.setData({ animOff: false, videoErr: false }); })
      .catch(() => tt.showToast({ title: '没打开，去设置里看', icon: 'none' }));
  },
  onClose() { this.setData({ infoOpen: false }); },
  onImgErr() {
    if (!this.data.useWebp) this.setData({ useWebp: true });
    else this.setData({ imgErr: true });
  },
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
  onFree() {
    const it = this.data.info;
    if (!it) return;
    tt.navigateTo({ url: '/pages/workout/index?free=1&ex=' + encodeURIComponent(it.id) });
  },
  onMuscles() { tt.navigateTo({ url: '/pages/muscles/index' }); },
  noop() {}
});
