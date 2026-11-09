import { NUDGE_COPY } from './nudge-copy.js';
import { lineIndex } from './nudge.js';

const COPY = {
  en: {
    restTitle: 'Rest over 💪',
    restBody: 'Time for your next set.',
    testBody: 'Test notification ✅ This is what alerts look like.',
    dayFallbackTitle: 'Workout planned today',
    dayRoutineSuffix: 'today',
    dayBody: "It's on your plan. Let's go 💪",
  },
  'pt-BR': {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora da próxima série.',
    testBody: 'Notificação de teste ✅ É assim que os alertas aparecem.',
    dayFallbackTitle: 'Treino planejado para hoje',
    dayRoutineSuffix: 'hoje',
    dayBody: 'Está no seu plano. Bora treinar 💪',
  },
  // Chinese is the other language this instance's people actually use. The rest of the packs
  // still fall back to English here (frontend strings are translated; these predate that).
  zh: {
    restTitle: '休息结束 💪',
    restBody: '该下一组了。',
    testBody: '测试通知 ✅ 提醒就长这样。',
    dayFallbackTitle: '今天有训练安排',
    dayRoutineSuffix: '今天',
    dayBody: '计划上有它，走起 💪',
    weekly: {
      title: '上周回顾',
      body: (n, delta) => `练了 ${n} 次${delta ? `，比前一周${delta > 0 ? '多' : '少'} ${Math.abs(delta)} 次` : ''}。点开看看这周怎么安排。`,
    },
  },
};

// The Monday recap (api/weekly.js): a doorbell for the Home card, so it carries the two numbers
// that make someone open it and nothing else. Languages without a block get English, like the
// other pushes here.
COPY.en.weekly = {
  title: 'Last week',
  body: (n, delta) => `${n} session${n === 1 ? '' : 's'}${delta ? `, ${delta > 0 ? '+' : ''}${delta} vs the week before` : ''}. Tap for the recap.`,
}

const copyFor = lang => COPY[lang] || COPY.en;

export function restTimerPush(lang) {
  const copy = copyFor(lang);
  return { title: copy.restTitle, body: copy.restBody, tag: 'rest-timer' };
}

export function testPush(lang) {
  return { title: 'openGym', body: copyFor(lang).testBody, tag: 'test' };
}

export function dayReminderPush(lang, routine) {  const copy = copyFor(lang);
  return {
    title: routine
      ? `${routine.emoji || '🏋️'} ${routine.name} ${copy.dayRoutineSuffix}`
      : copy.dayFallbackTitle,
    body: copy.dayBody,
    tag: 'day-reminder',
  };
}

// The Monday-morning recap (api/weekly.js). The body is built here because it carries numbers,
// and the two languages with a block are the two this instance's people read.
export function weeklyRecapPush(lang, { sessions, prevSessions } = {}) {
  const copy = copyFor(lang).weekly || COPY.en.weekly;
  const n = Number(sessions) || 0;
  const delta = prevSessions == null ? 0 : n - (Number(prevSessions) || 0);
  return { title: copy.title, body: copy.body(n, delta), tag: 'weekly-recap', url: '#/home' };
}

// The missed-workout nudge (nudge.js). Its copy is translated in the frontend packs and generated
// into nudge-copy.js, so every language the app speaks has it — unlike the strings above, which
// predate that and fall back to English. de-CH is de with ß written ss, as in the frontend
// (lib/i18n-core.js DERIVED_LOCALES).
const nudgeCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return Object.fromEntries(Object.entries(NUDGE_COPY.de).map(([k, c]) => [k, { title: ch(c.title), lines: c.lines.map(ch) }]));
  }
  return NUDGE_COPY[lang] || NUDGE_COPY.en;
};
export function nudgePush(lang, tone, routine, iso) {
  const copy = nudgeCopyFor(lang)[NUDGE_COPY.en[tone] ? tone : 'friendly'];
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  const name = routine?.name || 'openGym';
  return { title: copy.title, body: line.replace('{0}', () => name), tag: 'nudge' };
}
