// Сезонні досягнення (SPEC §8). Лише чисті функції: умови перевіряються за наявними даними
// і тими самими правилами, що й аналітика (analytics.js): пауза не є пропуском, бонус продовжує серію,
// до дати старту нічого не рахується. Що вже отримано — зберігається окремо (ключ `ach`, store.js).
import { countedRecords, distinctTopics, habitStats, streaks } from './analytics.js';
import { daysInMonth, keyOf, parseKey } from './dates.js';
import { HABIT_IDS } from './entry.js';
import { pauseOn } from './schedule.js';

/**
 * Перелік. season — палітра бейджа (сезонні досягнення показуються в кольорах свого сезону),
 * habit — колір звички; без обох — акцент поточного сезону.
 */
export const ACHIEVEMENTS = [
  { id: 'first_step', emoji: '👣', name: 'Перший крок', habit: 'train', cond: 'Перше виконане тренування.' },
  { id: 'streak_5', emoji: '🔥', tier: '5', name: 'Серія 5', cond: '5 виконань поспіль однієї звички.' },
  { id: 'streak_10', emoji: '🔥', tier: '10', name: 'Серія 10', cond: '10 виконань поспіль однієї звички.' },
  { id: 'streak_25', emoji: '🔥', tier: '25', name: 'Серія 25', cond: '25 виконань поспіль однієї звички.' },
  { id: 'streak_50', emoji: '🔥', tier: '50', name: 'Серія 50', cond: '50 виконань поспіль однієї звички.' },
  { id: 'golden_autumn', emoji: '🍁', name: 'Золота осінь', season: 'autumn', cond: 'Вересень–листопад без жодного пропущеного тренування. Паузи не рахуються.' },
  { id: 'first_snow', emoji: '❄️', name: 'Перший сніг', season: 'winter', cond: 'Перше тренування взимку (грудень–лютий).' },
  { id: 'winter_grit', emoji: '🧊', name: 'Зимовий гарт', season: 'winter', cond: '12 тренувань поспіль протягом однієї зими.' },
  { id: 'spring_awakening', emoji: '🌱', name: 'Весняне пробудження', season: 'spring', cond: 'Тренування після завершеної паузи.' },
  { id: 'no_excuses', emoji: '🛡️', name: 'Без відмовок', cond: 'Повний календарний місяць без пропусків обох звичок.' },
  { id: 'polyglot_25', emoji: '🗣️', tier: '25', name: 'Поліглот 25', habit: 'eng', cond: '25 різних тем англійської.' },
  { id: 'polyglot_50', emoji: '🗣️', tier: '50', name: 'Поліглот 50', habit: 'eng', cond: '50 різних тем англійської.' },
  { id: 'polyglot_100', emoji: '🗣️', tier: '100', name: 'Поліглот 100', habit: 'eng', cond: '100 різних тем англійської.' },
  { id: 'homework_10', emoji: '📚', name: 'Домашка — святе', habit: 'eng', cond: '10 домашок поспіль позначено виконаними.' },
];

export const ACH_IDS = ACHIEVEMENTS.map((a) => a.id);
export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

/** Пороги (SPEC §8, рішення Етапу 2б). */
export const ACH_RULES = { winterRun: 12, homeworkRun: 10 };

const monthOf = (key) => Number(key.slice(5, 7));
const isWinter = (key) => [12, 1, 2].includes(monthOf(key));

/**
 * Відрізки сезону, що перетинають [from, to]: осінь — 1.09–30.11, зима — 1.12–кінець лютого.
 * { from, to } обрізані межами, end — справжній кінець сезону (щоб знати, чи він уже минув).
 */
function seasonSpans(season, from, to) {
  const out = [];
  for (let y = parseKey(from).getFullYear() - 1; y <= parseKey(to).getFullYear(); y++) {
    const s = season === 'autumn' ? `${y}-09-01` : `${y}-12-01`;
    const e = season === 'autumn' ? `${y}-11-30` : keyOf(new Date(y + 1, 1, daysInMonth(y + 1, 1), 12));
    if (e < from || s > to) continue;
    out.push({ from: s < from ? from : s, to: e > to ? to : e, start: s, end: e });
  }
  return out;
}

/** Календарні місяці від дати старту до сьогодні: { first, last }. */
function monthSpans(from, to) {
  const out = [];
  const d = parseKey(from);
  d.setDate(1);
  while (keyOf(d) <= to) {
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({ first: keyOf(d), last: keyOf(new Date(y, m, daysInMonth(y, m), 12)) });
    d.setMonth(m + 1);
  }
  return out;
}

const bad = (r) => r.miss + r.unmarked;

/**
 * Стан кожного досягнення за даними.
 * Повертає [{ ...опис, earned, have, need, note }]: have/need — прогрес, note — підказка (що далі) або null.
 */
export function evaluateAchievements(settings, entries, today) {
  const start = settings.startDate;
  const out = new Map();
  const put = (id, earned, have, need, note = null) => out.set(id, { earned, have: Math.min(have, need), need, note });
  if (start > today) {
    ACHIEVEMENTS.forEach((a) => put(a.id, false, 0, 1));
    return ACHIEVEMENTS.map((a) => ({ ...a, ...out.get(a.id) }));
  }

  const records = countedRecords(settings, entries, start, today, today);
  const trainsDone = records.filter((r) => r.habit === 'train' && r.kind !== 'miss');

  // Перший крок
  put('first_step', trainsDone.length > 0, trainsDone.length ? 1 : 0, 1);

  // Серії: найкраща серія будь-якої звички за весь час
  const best = Math.max(...HABIT_IDS.map((hb) => streaks(settings, entries, hb, today).best));
  for (const n of [5, 10, 25, 50]) put(`streak_${n}`, best >= n, best, n);

  // Золота осінь: осінь, що вже закінчилась, без пропусків і невідмічених тренувань; хоча б одне заплановане
  const autumns = seasonSpans('autumn', start, today);
  const goldenDone = autumns.some((sp) => {
    if (sp.end >= today) return false;
    const r = habitStats(settings, entries, sp.from, sp.to, today).train;
    return r.planned > 0 && !bad(r);
  });
  const nowAutumn = autumns.find((sp) => sp.end >= today);
  if (goldenDone) {
    put('golden_autumn', true, 1, 1);
  } else if (nowAutumn) {
    const r = habitStats(settings, entries, nowAutumn.from, nowAutumn.end, today).train;
    const need = r.planned + r.pending;
    put('golden_autumn', false, bad(r) ? 0 : r.done, Math.max(need, 1), bad(r)
      ? 'Цієї осені вже є пропуск — наступна спроба з 1 вересня.'
      : `Поки без пропусків: ${r.done} з ${need} тренувань до 30 листопада.`);
  } else {
    put('golden_autumn', false, 0, 1, 'Спроба — з 1 вересня до 30 листопада.');
  }

  // Перший сніг
  const snow = trainsDone.some((r) => isWinter(r.date));
  put('first_snow', snow, snow ? 1 : 0, 1, snow ? null : 'Будь-яке виконане тренування з 1 грудня до кінця лютого.');

  // Зимовий гарт: найкраща серія тренувань у межах однієї зими
  const winters = seasonSpans('winter', start, today);
  const winterBest = Math.max(0, ...winters.map((sp) => streaks(settings, entries, 'train', today, sp.from, sp.to).best));
  put('winter_grit', winterBest >= ACH_RULES.winterRun, winterBest, ACH_RULES.winterRun,
    winters.length ? null : 'Серія рахується з 1 грудня до кінця лютого.');

  // Весняне пробудження: виконане тренування після паузи, що вже завершилась
  const ended = settings.pauses.filter((p) => p.to !== null && p.to >= start && p.to < today);
  const back = trainsDone.some((r) => ended.some((p) => r.date > p.to));
  const pausedNow = pauseOn(settings, today);
  put('spring_awakening', back, back ? 1 : 0, 1, back ? null : pausedNow
    ? 'Пауза триває — перше тренування після неї принесе цей бейдж.'
    : ended.length ? 'Потрібне тренування після завершеної паузи.' : 'Зʼявиться після першого повернення з паузи.');

  // Без відмовок: повний місяць (починається не раніше дати старту), що вже минув
  const months = monthSpans(start, today);
  const clean = (sp, to) => {
    const st = habitStats(settings, entries, sp.first, to, today);
    return { ok: HABIT_IDS.every((hb) => !bad(st[hb])), st };
  };
  const noExcuses = months.some((sp) => {
    if (sp.first < start || sp.last >= today) return false;
    const { ok, st } = clean(sp, sp.last);
    return ok && HABIT_IDS.some((hb) => st[hb].planned > 0);
  });
  const cur = months.at(-1);
  if (noExcuses) {
    put('no_excuses', true, 1, 1);
  } else if (cur && cur.first >= start) {
    const { ok, st } = clean(cur, cur.last);
    const need = HABIT_IDS.reduce((n, hb) => n + st[hb].planned + st[hb].pending, 0);
    const done = HABIT_IDS.reduce((n, hb) => n + st[hb].done, 0);
    put('no_excuses', false, ok ? done : 0, Math.max(need, 1), ok
      ? `Цього місяця поки без пропусків: ${done} з ${need}.`
      : 'Цього місяця вже є пропуск — наступна спроба з 1 числа.');
  } else {
    put('no_excuses', false, 0, 1, 'Рахуються повні місяці від початку відстеження — перший з 1 числа наступного.');
  }

  // Поліглот: різні теми англійської за весь час
  const topics = distinctTopics(records);
  for (const n of [25, 50, 100]) put(`polyglot_${n}`, topics >= n, topics, n);

  // Домашка — святе: домашки поспіль (у порядку дат) позначені виконаними.
  // «Не виконав» обриває серію; остання ще не позначена домашка — ні (її час ще не настав).
  const hws = records.filter((r) => r.habit === 'eng' && r.kind !== 'miss' && r.entry.hw?.text);
  let run = 0;
  let hwBest = 0;
  hws.forEach((r, i) => {
    if (r.entry.hw.done === true) hwBest = Math.max(hwBest, ++run);
    else if (!(i === hws.length - 1 && r.entry.hw.done === null)) run = 0;
  });
  put('homework_10', hwBest >= ACH_RULES.homeworkRun, hwBest >= ACH_RULES.homeworkRun ? hwBest : run, ACH_RULES.homeworkRun);

  return ACHIEVEMENTS.map((a) => ({ ...a, ...out.get(a.id) }));
}

/**
 * Злиття з уже отриманими: отримане не забирається, навіть якщо запис потім змінили.
 * got — дата отримання (зі сховища) або null.
 */
export function achievementsView(settings, entries, stored, today) {
  return evaluateAchievements(settings, entries, today).map((a) => {
    const got = stored[a.id] || null;
    return { ...a, got, earned: !!got || a.earned };
  });
}

/** Нові досягнення: умову виконано, а в збережених їх ще немає. */
export function newlyEarned(settings, entries, stored, today) {
  return evaluateAchievements(settings, entries, today).filter((a) => a.earned && !stored[a.id]);
}
