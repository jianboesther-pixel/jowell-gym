/* 「器械被占了」——同部位里换一个能做、器械不同的动作。
 *
 * 单靠库里的 目标肌/部位/器械 三个字段，排序会推荐出「战绳替卧推」这种怪东西。
 * 所以常见主项先走人工清单（CURATED），没收录的动作再退回算法：
 *   同目标肌 +4 · 同部位 +2 · 器械不同 +3
 *
 * exclude 用来排掉「今天计划里还要练的」和「已经练过的」，免得替代动作和后面的安排撞车。
 */
import { EXERCISES } from './coach/core/library-data.js';
import { NAMES_ZH } from './tt-names-zh.js';
import fs from 'node:fs';
import { PARTS, GEAR } from './tt-library.js';
import INSTR_ZH from './tt-instr-zh.js';
import { notesFor } from './tt-notes.js';

const eqOf = e => (e && typeof e.eq === 'string' && e.eq ? [e.eq] : []);

/**
 * 常见主项的人工替代清单（左：被占的动作；右：按优先级排的替代）。
 * 只写动作 id，名字从库里取；库里没有的会在加载时被跳过。
 */
const CURATED = {
  // 卧推
  '0025': ['0289', '0662', '0151', '0576', '0251'],   // 杠铃卧推 → 哑铃卧推 / 俯卧撑 / 绳索卧推 / 器械推胸 / 双杠
  '0047': ['0314', '0289', '0662', '0576'],           // 上斜卧推 → 哑铃上斜 / 哑铃卧推 / 俯卧撑 / 器械推胸
  '0289': ['0025', '0662', '0151', '0576'],
  '0251': ['0025', '0289', '0662'],
  '0662': ['0025', '0289', '0251'],
  '0576': ['0025', '0289', '0151'],
  // 深蹲 / 腿
  '0043': ['0739', '3593'],
  '3593': ['0739', '0043'],
  '0739': ['0043', '3593'],
  '0586': ['0085', '1060'],
  // 硬拉 / 铰链
  '0032': ['0085', '1459', '1060'],
  '0085': ['0032', '1459', '0586'],
  '1459': ['0085', '0032'],
  '1060': ['0586', '0085'],
  // 拉
  '0027': ['0861', '0652'],
  '0861': ['0027', '2330'],
  '0652': ['2330', '0861'],
  '2330': ['0652', '0861'],
  // 推 / 肩
  '0091': ['0405'],
  '0405': ['0091'],
  '0334': ['0178'],
  '0178': ['0334'],
  '0215': ['5609'],
  '5609': ['0215'],
  // 手臂 / 小腿
  '0241': ['0030', '0251'],
  '1372': ['0594'],
  '0594': ['1372']
};

const byId = id => EXERCISES.find(e => e && e.id === id) || null;

// 示范图的 jpg 副本（服务器上批量转过），放在 DATA_DIR/media-jpg 下。
// inline 请求会把这张图读成 data URI：抖音里 <image> 拉外链不稳，data URI 不经过网络。
const MEDIA_DIR = (process.env.DATA_DIR || '/data') + '/media-jpg';
const CLIP_DIR = (process.env.DATA_DIR || '/data') + '/media-clip';

/** 示范短片（mp4，20–30KB）读成 data URI：抖音里 <video> 拉外链不稳，内嵌最保险。 */
export function exerciseClipData(id) {
  const key = String(id || '');
  if (!/^[0-9A-Za-z_-]{1,20}$/.test(key)) return null;
  try {
    const buf = fs.readFileSync(CLIP_DIR + '/' + key + '.mp4');
    if (!buf.length || buf.length > 2000000) return null;
    return 'data:video/mp4;base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
}

export function exerciseImageData(id) {
  const key = String(id || '');
  if (!/^[0-9A-Za-z_-]{1,20}$/.test(key)) return null;
  try {
    const buf = fs.readFileSync(MEDIA_DIR + '/' + key + '.jpg');
    if (!buf.length || buf.length > 400000) return null;
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
}

const toItem = e => ({
  id: e.id,
  name: NAMES_ZH[e.id] || e.n,
  en: e.n,
  eq: e.eq || '',
  bp: e.bp || '',
  tg: e.tg || ''
});

/**
 * 能替代 id 的动作，最好的在前。
 * @param {string} id 被占的动作
 * @param {{limit?:number, exclude?:string[]}|number} opts 数量 / 要排掉的动作 id
 */
export function alternativesFor(id, opts = {}) {
  const key = String(id || '');
  const o = typeof opts === 'number' ? { limit: opts } : (opts || {});
  const raw = Number(o.limit);
  const n = Math.max(1, Math.min(12, Number.isFinite(raw) ? Math.round(raw) : 6));
  const skip = new Set([key, ...(Array.isArray(o.exclude) ? o.exclude.map(String) : [])]);

  const out = [];
  const push = e => {
    if (!e || skip.has(e.id) || out.some(x => x.id === e.id)) return;
    out.push(toItem(e));
  };

  // 1) 人工清单
  const curated = CURATED[key] || [];
  for (const cid of curated) push(byId(cid));

  // 2) 没有人工清单的动作，退回算法（有清单时不再凑数：短而准好过凑满 6 条）
  if (!curated.length) {
    const current = byId(key);
    if (current) {
      const curEq = eqOf(current);
      const scored = [];
      for (const e of EXERCISES) {
        if (!e || !e.id || skip.has(e.id)) continue;
        const sameTarget = !!current.tg && e.tg === current.tg;
        const samePart = !!current.bp && e.bp === current.bp;
        if (!sameTarget && !samePart) continue;
        const eq = eqOf(e);
        const shares = eq.some(x => curEq.includes(x));
        const score =
          (sameTarget ? 4 : 0) +
          (samePart ? 2 : 0) +
          // 器械不同才是重点：这就是"被占了"的意思；自重通常是最现实的替代。
          (shares ? 1 : 3);
        scored.push({ e, score });
      }
      scored.sort((a, b) => b.score - a.score
        || String(NAMES_ZH[a.e.id] || a.e.n || '').length - String(NAMES_ZH[b.e.id] || b.e.n || '').length
        || (a.e.n < b.e.n ? -1 : a.e.n > b.e.n ? 1 : 0));
      for (const s of scored) push(s.e);
    }
  }

  return out.slice(0, n);
}

/** 动作详情：名字、部位、器械——小程序里点动作名看一眼用。 */
const PART_ZH = new Map(PARTS.map(p => [p.key, p.zh]));
const GEAR_ZH = new Map(GEAR.map(g => [g.key, g.zh]));

/** 动作详情。bpZh/eqZh 是中文，客户端直接用。 */
export function exerciseInfo(id) {
  const e = byId(String(id || ''));
  if (!e) return null;
  return {
    id: e.id,
    name: NAMES_ZH[e.id] || e.n,
    en: e.n,
    eq: e.eq || '',
    bp: e.bp || '',
    bpZh: PART_ZH.get(e.bp) || e.bp || '',
    tg: e.tg || '',
    eqZh: GEAR_ZH.get(e.eq) || e.eq || '',
    steps: Array.isArray(INSTR_ZH[e.id]) ? INSTR_ZH[e.id] : [],
    notes: notesFor(e.id),
    // 示范素材（网页端同一份 media）：still 是静图 webp，clip 是动图 mp4。
    img: `/exercise-media/still/${e.id}.webp`,
    // 同一张图的 jpg 版：抖音的 <image> 对 webp 不稳，优先用这个
    imgJpg: `/exercise-media/still-jpg/${e.id}.jpg`,
    clip: `/exercise-media/clip/${e.id}.mp4`
  };
}
