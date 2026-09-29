// Шторка дня з календаря: усі деталі, редагування/видалення заднім числом. Майбутнє — лише перегляд.
import { fmtDay, fmtLong, parseKey, relDays, todayKey } from '../dates.js';
import { HABITS, HABIT_IDS } from '../habits.js';
import { dayInfo } from '../schedule.js';
import { seasonOf } from '../seasons.js';
import { h, icon } from './dom.js';
import { entryDetails, habitSubtitle, habitTitle, markAndAsk, openEntryEditor } from './entry-form.js';
import { openSheet } from './sheet.js';

function block(store, date, habit, { entry, planned, future, host, muted = false }) {
  const done = entry?.s === 'done';
  let pill;
  if (muted) pill = h('span', { class: 'pill pill-open', title: 'Пропуск у день паузи не рахується' }, 'Не рахується');
  else if (entry) pill = h('span', { class: `pill ${done ? 'pill-done' : 'pill-miss'}` }, icon(done ? 'check' : 'x'), done ? (entry.bonus ? 'Бонус' : 'Виконано') : 'Пропуск');
  else if (future) pill = h('span', { class: 'pill pill-plan' }, 'Заплановано');
  else pill = h('span', { class: 'pill pill-open' }, 'Не відмічено');

  const el = h('section', { class: `day-block habit-${habit} ${muted ? 'is-muted' : ''}`.trim() },
    h('div', { class: 'day-block-head' },
      h('span', { class: 'hicon hicon-sm' }, icon(HABITS[habit].icon)),
      h('div', { class: 'htitles' },
        h('h3', null, habitTitle(store, habit, date, entry)),
        h('p', null, habitSubtitle(store, habit, date, entry))),
      pill));

  if (entry) {
    el.append(entryDetails(habit, entry),
      h('div', { class: 'day-block-actions' },
        h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => openEntryEditor(store, date, habit, host) }, icon('edit'), 'Редагувати')));
  } else if (planned && !future) {
    el.append(h('div', { class: 'hcard-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-mark', onclick: () => markAndAsk(store, date, habit, 'done', {}, host) }, icon('check'), 'Виконав'),
      h('button', { type: 'button', class: 'btn btn-outline btn-mark', onclick: () => markAndAsk(store, date, habit, 'miss', {}, host) }, icon('x'), 'Не виконав')));
  }
  return el;
}

export function openDaySheet(store, date) {
  const today = todayKey();
  const future = date > today;

  return openSheet({
    title: fmtLong(date),
    subtitle: relDays(date, today),
    className: 'sheet-day',
    pal: seasonOf(parseKey(date)), // палітра сезону цієї дати
    render(body, sheet) {
      const paint = () => {
        const info = dayInfo(store.settings, store.entries, date, today);
        const { plan } = info;
        const parts = [];
        if (plan.pause) {
          const p = plan.pause;
          parts.push(h('div', { class: 'pause-note' }, icon('pause'),
            h('div', null,
              h('strong', null, p.label || 'Пауза'),
              h('span', { class: 'small muted' }, `${fmtDay(p.from)} — ${p.to ? fmtDay(p.to) : 'триває'}${plan.planned.length ? ` · за розкладом: ${plan.planned.map((hb) => HABITS[hb].name.toLowerCase()).join(', ')}` : ''}`))));
        }
        const shown = info.items.map((it) => it.habit);
        info.items.forEach((it) => parts.push(block(store, date, it.habit, { entry: it.entry, planned: plan.habits.includes(it.habit), future, host: sheet })));
        // Пауза має пріоритет: пропуски в її дні не рахуються, але запис можна переглянути чи видалити.
        info.hidden.forEach((it) => parts.push(block(store, date, it.habit, { entry: it.entry, future, host: sheet, muted: true })));

        if (!shown.length && !plan.pause) {
          parts.push(h('p', { class: 'day-empty muted' }, date < store.settings.startDate && !future
            ? 'До початку відстеження.' : 'Вихідний — нічого не заплановано.'));
        }
        if (future) {
          parts.push(h('p', { class: 'small muted day-note' }, 'Майбутні дні — лише перегляд.'));
        } else {
          const extra = HABIT_IDS.filter((hb) => !shown.includes(hb) && !info.hidden.some((it) => it.habit === hb));
          if (extra.length) {
            parts.push(h('div', { class: 'day-bonus' },
              extra.map((hb) => h('button', {
                type: 'button',
                class: `btn btn-outline btn-sm habit-${hb}`,
                onclick: () => markAndAsk(store, date, hb, 'done', {}, sheet),
              }, icon('plus'), `бонус: ${HABITS[hb].name.toLowerCase()}`))));
          }
        }
        body.replaceChildren(...parts);
      };
      paint();
      sheet.onCleanup(store.subscribe(paint));
    },
  });
}
