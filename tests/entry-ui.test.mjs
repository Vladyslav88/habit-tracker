// Характеризаційні тести підписів і чипів записів (ui/entry-form.js) — етап 0 плану «власні звички».
// Ці функції не торкаються DOM; tg.js читає window.Telegram під час імпорту, тож потрібна заглушка window.
import { test } from 'node:test';
import { normalizeEntry } from '../js/entry.js';
import { normalizeSettings } from '../js/schedule.js';
import { buildEntries, SETTINGS } from './fixtures/history.mjs';
import { useGolden } from './helpers/golden.mjs';

globalThis.window ??= {};
const { entryChips, habitSubtitle, habitTitle, trainDayOf } = await import('../js/ui/entry-form.js');

const golden = useGolden(new URL('./golden/entry-ui.json', import.meta.url));
const store = { settings: normalizeSettings(structuredClone(SETTINGS), SETTINGS.startDate) };
const list = buildEntries().map(({ date, habit, data }) => ({ date, habit, entry: normalizeEntry(habit, data) }));

test('entryChips для кожного запису фікстури', () => {
  golden('chips', Object.fromEntries(list.map(({ date, habit, entry }) => [`${date}:${habit}`, entryChips(habit, entry)])));
});

test('habitTitle, habitSubtitle, trainDayOf: з записом і без', () => {
  const out = {};
  // пн/ср/пт обох версій розкладу, вихідний, бонус із Днем, бонус без Дня, виконане в паузу
  for (const date of ['2026-09-07', '2026-09-09', '2026-09-11', '2026-11-04', '2026-11-06', '2026-09-06', '2026-10-14', '2026-09-08', '2026-11-07']) {
    for (const habit of ['train', 'eng']) {
      const e = list.find((x) => x.date === date && x.habit === habit)?.entry || null;
      out[`${date}:${habit}`] = {
        title: habitTitle(store, habit, date, e),
        subtitle: habitSubtitle(store, habit, date, e),
        titleNoEntry: habitTitle(store, habit, date, null),
        subtitleNoEntry: habitSubtitle(store, habit, date, null),
        day: trainDayOf(store, date, e),
      };
    }
  }
  golden('titles', out);
});
