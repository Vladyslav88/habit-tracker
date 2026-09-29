// Характеризаційні тести (етап 0 плану «власні звички»): фіксують ПОТОЧНУ поведінку чистих функцій
// розкладу, аналітики, місячної картки й досягнень на фікстурі tests/fixtures/history.mjs.
// Рефакторинг (етап 1) не має змінити жодного еталону. Запуск: node --test tests/*.test.mjs
import { test } from 'node:test';
import { achievementsView, evaluateAchievements, newlyEarned } from '../js/achievements.js';
import {
  analyze, checkpointTimeline, countedRecords, distinctTopics, habitStats, monthReport, PERIODS, periodRange,
  reportMonths, slot, streaks,
} from '../js/analytics.js';
import { normalizeEntry } from '../js/entry.js';
import {
  daysFor, dayInfo, isPlanned, missesInRange, monthSummary, normalizeSettings, pauseOn, planFor, unmarked, upcoming,
} from '../js/schedule.js';
import { buildEntries, days, FROM, SETTINGS, TO, TODAYS } from './fixtures/history.mjs';
import { useGolden } from './helpers/golden.mjs';

const golden = useGolden(new URL('./golden/characterization.json', import.meta.url));
const HABITS = ['train', 'eng'];

const settings = normalizeSettings(structuredClone(SETTINGS), SETTINGS.startDate);
const entries = new Map();
for (const { date, habit, data } of buildEntries()) entries.set(`${date}:${habit}`, normalizeEntry(habit, data));

// Записи в еталонах — посиланням на id (їхній вміст перевіряє окремий еталон «entries»).
const idOf = new Map([...entries].map(([id, e]) => [e, id]));
const ref = (k, v) => (v && typeof v === 'object' && idOf.has(v) ? `@${idOf.get(v)}` : v);

const months = [];
for (let y = 2026, m = 7; y * 12 + m <= 2027 * 12 + 2; m === 11 ? (y++, m = 0) : m++) months.push({ y, m });

test('нормалізовані записи фікстури (вміст і порядок полів у JSON)', () => {
  golden('entries', [...entries].map(([id, e]) => [id, JSON.stringify(e)]));
});

test('налаштування: normalizeSettings', () => {
  golden('settings/normalized', settings);
  golden('settings/empty', normalizeSettings(null, '2026-09-25'));
  golden('settings/junk', normalizeSettings({
    startDate: 'вчора',
    schedule: [{ from: '2026-10-01', days: [{ train: 7, eng: 'так' }] }, { from: 'bad' }, null],
    workouts: { 1: '  Спина й ноги  ', 2: '', 3: 42, 4: 'зайвий' },
    pauses: [{ from: '2026-10-05', to: '2026-10-01', label: 'x'.repeat(60), id: 'p1' }, { from: 'bad' }],
    checkpoints: [{ date: '2026-12-01', to: 'bad', label: 5 }, { date: 'bad' }],
    extra: 'невідоме поле',
  }, '2026-09-25'));
});

test('розклад: daysFor, planFor, pauseOn, isPlanned по кожному дню', () => {
  const out = {};
  for (const d of days(FROM, TO)) {
    const p = planFor(settings, d);
    out[d] = {
      plan: p,
      pause: pauseOn(settings, d)?.id ?? null,
      isPlanned: HABITS.filter((hb) => isPlanned(settings, d, hb)),
    };
  }
  golden('schedule/days', out);
  golden('schedule/daysFor', ['1999-12-31', '2000-01-01', '2026-11-01', '2026-11-02', '2027-03-03'].map((d) => daysFor(settings, d)));
});

test('розклад: upcoming, unmarked, missesInRange', () => {
  for (const today of TODAYS) {
    golden(`schedule/upcoming/${today}`, upcoming(settings, today, 3));
    golden(`schedule/unmarked/${today}`, unmarked(settings, entries, today, 14));
    golden(`schedule/unmarked-all/${today}`, unmarked(settings, entries, today, 400));
  }
  golden('schedule/missesInRange/p-sick', missesInRange(entries, '2026-10-12', '2026-10-18'));
  golden('schedule/missesInRange/open', missesInRange(entries, '2027-01-01', null));
});

test('календар: dayInfo по кожному дню, monthSummary по кожному місяцю', () => {
  for (const today of ['2026-10-15', '2027-01-20']) {
    const out = {};
    for (const d of days(FROM, TO)) out[d] = dayInfo(settings, entries, d, today);
    golden(`calendar/dayInfo/${today}`, out, ref);
  }
  golden('calendar/monthSummary', months.map(({ y, m }) => ({ y, m, s: monthSummary(settings, entries, y, m) })));
});

test('аналітика: slot по кожному дню і звичці', () => {
  const out = {};
  for (const d of days(FROM, TO)) out[d] = Object.fromEntries(HABITS.map((hb) => [hb, slot(settings, entries, d, hb, '2027-01-20')]));
  golden('analytics/slot/2027-01-20', out, ref);
});

test('аналітика: періоди, analyze, habitStats, серії, countedRecords', () => {
  for (const today of TODAYS) {
    for (const p of PERIODS) {
      const r = periodRange(settings, p.id, today);
      golden(`analytics/${today}/${p.id}/range`, r);
      golden(`analytics/${today}/${p.id}/analyze`, analyze(settings, entries, r.from, r.to, today), ref);
    }
    golden(`analytics/${today}/habitStats-all`, habitStats(settings, entries, settings.startDate, today, today));
    golden(`analytics/${today}/streaks`, Object.fromEntries(HABITS.map((hb) => [hb, streaks(settings, entries, hb, today)])));
    const recs = countedRecords(settings, entries, settings.startDate, today, today);
    golden(`analytics/${today}/records`, recs, ref);
    golden(`analytics/${today}/topics`, distinctTopics(recs));
  }
  golden('analytics/streaks/winter', streaks(settings, entries, 'train', '2027-03-03', '2026-12-01', '2027-02-28'));
  golden('analytics/habitStats/empty', habitStats(settings, entries, '2026-10-02', '2026-10-01', '2026-10-15'));
});

test('контрольні точки: checkpointTimeline', () => {
  for (const today of TODAYS) golden(`checkpoints/${today}`, checkpointTimeline(settings, entries, today));
});

test('місячна картка: reportMonths, monthReport за кожен місяць', () => {
  for (const today of TODAYS) {
    golden(`month/${today}/months`, reportMonths(settings, today));
    for (const { y, m } of months) golden(`month/${today}/${y}-${m + 1}`, monthReport(settings, entries, y, m, today), ref);
  }
});

test('досягнення: evaluateAchievements, achievementsView, newlyEarned', () => {
  const stored = { first_step: '2026-09-05', streak_5: '2026-10-02', future_badge: '2026-12-01' };
  for (const today of TODAYS) {
    golden(`ach/${today}/evaluate`, evaluateAchievements(settings, entries, today));
    golden(`ach/${today}/view`, achievementsView(settings, entries, stored, today));
    golden(`ach/${today}/new`, newlyEarned(settings, entries, stored, today).map((a) => a.id));
  }
  golden('ach/before-start', evaluateAchievements({ ...settings, startDate: '2027-06-01' }, entries, '2027-03-03'));
  golden('ach/empty', evaluateAchievements(settings, new Map(), '2027-03-03'));
});
