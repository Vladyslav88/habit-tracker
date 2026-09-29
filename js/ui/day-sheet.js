// Шторка дня з календаря: усі деталі, редагування/видалення заднім числом. Майбутнє — лише перегляд.
import { fmtDay, fmtLong, relDays, todayKey } from '../dates.js';
import { HABITS, HABIT_IDS } from '../entry.js';
import { planFor } from '../schedule.js';
import { h, icon } from './dom.js';
import { entryDetails, habitSubtitle, habitTitle, markAndAsk, openEntryEditor } from './entry-form.js';
import { openSheet } from './sheet.js';

function block(store, date, habit, { entry, planned, future }) {
  const done = entry?.s === 'done';
  let pill;
  if (entry) pill = h('span', { class: `pill ${done ? 'pill-done' : 'pill-miss'}` }, icon(done ? 'check' : 'x'), done ? (entry.bonus ? 'Бонус' : 'Виконано') : 'Пропуск');
  else if (future) pill = h('span', { class: 'pill pill-plan' }, 'Заплановано');
  else pill = h('span', { class: 'pill pill-open' }, 'Не відмічено');

  const el = h('section', { class: `day-block habit-${habit}` },
    h('div', { class: 'day-block-head' },
      h('span', { class: 'hicon hicon-sm' }, icon(HABITS[habit].icon)),
      h('div', { class: 'htitles' },
        h('h3', null, habitTitle(store, habit, date, entry)),
        h('p', null, habitSubtitle(store, habit, date, entry))),
      pill));

  if (entry) {
    el.append(entryDetails(habit, entry),
      h('div', { class: 'day-block-actions' },
        h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => openEntryEditor(store, date, habit) }, icon('edit'), 'Редагувати')));
  } else if (planned && !future) {
    el.append(h('div', { class: 'hcard-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-mark', onclick: () => markAndAsk(store, date, habit, 'done') }, icon('check'), 'Виконав'),
      h('button', { type: 'button', class: 'btn btn-outline btn-mark', onclick: () => markAndAsk(store, date, habit, 'miss') }, icon('x'), 'Не виконав')));
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
    render(body, sheet) {
      const paint = () => {
        const plan = planFor(store.settings, date);
        const parts = [];
        if (plan.pause) {
          const p = plan.pause;
          parts.push(h('div', { class: 'pause-note' }, icon('pause'),
            h('div', null,
              h('strong', null, p.label || 'Пауза'),
              h('span', { class: 'small muted' }, `${fmtDay(p.from)} — ${p.to ? fmtDay(p.to) : 'триває'}${plan.planned.length ? ` · за розкладом: ${plan.planned.map((hb) => HABITS[hb].name.toLowerCase()).join(', ')}` : ''}`))));
        }
        const shown = HABIT_IDS.filter((hb) => store.getEntry(date, hb) || plan.habits.includes(hb));
        shown.forEach((hb) => parts.push(block(store, date, hb, { entry: store.getEntry(date, hb), planned: plan.habits.includes(hb), future })));

        if (!shown.length && !plan.pause) {
          parts.push(h('p', { class: 'day-empty muted' }, date < store.settings.startDate && !future
            ? 'До початку відстеження.' : 'Вихідний — нічого не заплановано.'));
        }
        if (future) {
          parts.push(h('p', { class: 'small muted day-note' }, 'Майбутні дні — лише перегляд.'));
        } else {
          const extra = HABIT_IDS.filter((hb) => !shown.includes(hb));
          if (extra.length) {
            parts.push(h('div', { class: 'day-bonus' },
              extra.map((hb) => h('button', {
                type: 'button',
                class: `btn btn-outline btn-sm habit-${hb}`,
                onclick: () => markAndAsk(store, date, hb, 'done'),
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
