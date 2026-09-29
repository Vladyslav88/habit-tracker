// Вкладка «Календар» (SPEC §7).
import { daysInMonth, fmtLong, keyOf, MONTHS, plural, todayKey, WEEKDAYS_CAP } from '../dates.js';
import { HABITS, HABIT_IDS } from '../entry.js';
import { dayInfo, monthSummary } from '../schedule.js';
import { haptic } from '../tg.js';
import { h, icon } from './dom.js';
import { openDaySheet } from './day-sheet.js';

let view = null; // { y, m } — який місяць відкрито
let slide = '';

const STATE_TEXT = { done: 'виконано', miss: 'пропущено', planned: 'заплановано', unmarked: 'не відмічено' };

function shift(n) {
  const d = new Date(view.y, view.m + n, 1);
  view = { y: d.getFullYear(), m: d.getMonth() };
  slide = n > 0 ? 'from-right' : 'from-left';
}

function dayCell(store, date, today) {
  const info = dayInfo(store.settings, store.entries, date, today);
  const [main, second] = info.items;
  const paused = info.plan.pause && !info.items.some((it) => it.entry);
  const cls = [
    'day',
    main ? `st-${main.state} habit-${main.habit}` : 'st-rest',
    info.isToday && 'is-today',
    paused && 'is-pause',
    info.isFuture && 'is-future',
  ].filter(Boolean).join(' ');
  const label = [fmtLong(date), paused ? `пауза${info.plan.pause.label ? ` (${info.plan.pause.label})` : ''}` : '',
    ...info.items.map((it) => `${HABITS[it.habit].name} — ${STATE_TEXT[it.state]}${it.bonus ? ', бонус' : ''}${it.back ? ', спина' : ''}`)]
    .filter(Boolean).join('; ');

  return h('button', { type: 'button', class: cls, 'aria-label': label, onclick: () => { haptic.select(); openDaySheet(store, date); } },
    h('span', { class: 'disc' }, h('span', { class: 'num' }, String(Number(date.slice(8))))),
    main?.bonus && h('span', { class: 'bonus-mark', 'aria-hidden': 'true' }, '+'),
    second && h('span', { class: `sat st-${second.state} habit-${second.habit}`, 'aria-hidden': 'true' }, second.bonus ? '+' : ''),
    info.items.some((it) => it.back) && h('span', { class: 'back-dot', 'aria-hidden': 'true' }));
}

function legend() {
  const item = (sample, text) => h('span', { class: 'lg' }, sample, text);
  const disc = (cls) => h('span', { class: `lg-disc ${cls}` });
  return h('section', { class: 'legend', 'aria-label': 'Легенда' },
    item(disc('st-done habit-train'), 'тренування'),
    item(disc('st-done habit-eng'), 'англійська'),
    item(disc('st-miss'), 'пропуск'),
    item(disc('st-planned habit-train'), 'заплановано'),
    item(disc('st-unmarked habit-train'), 'не відмічено'),
    item(disc('is-pause'), 'пауза'),
    item(h('span', { class: 'lg-disc habit-train lg-bonus' }, '+'), 'бонус'),
    item(h('span', { class: 'lg-dot' }), 'спина'),
    item(disc('is-today'), 'сьогодні'));
}

function summary(store) {
  const s = monthSummary(store.settings, store.entries, view.y, view.m);
  const now = new Date();
  const inProgress = view.y === now.getFullYear() && view.m === now.getMonth();
  return h('section', { class: 'card month-sum' },
    h('h3', { class: 'sum-title' }, `Підсумок місяця${inProgress ? ' · в процесі' : ''}`),
    HABIT_IDS.map((hb) => {
      const r = s[hb];
      const pct = r.planned ? Math.round((r.done / r.planned) * 100) : 0;
      return h('div', { class: `sum-row habit-${hb}` },
        h('div', { class: 'sum-line' },
          h('span', { class: 'sum-name' }, h('i', { class: 'dot' }), HABITS[hb].name),
          h('span', { class: 'sum-val' }, h('b', null, String(r.done)), ` з ${r.planned} ${plural(r.planned, HABITS[hb].ofForms)}`)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
          h('i', { style: { width: `${pct}%` } })),
        (r.bonus || r.miss) ? h('div', { class: 'sum-extra small muted' },
          [r.miss ? `пропущено ${r.miss}` : '', r.bonus ? `+${r.bonus} бонус` : ''].filter(Boolean).join(' · ')) : null);
    }));
}

export function renderCalendar(container, { store }) {
  const today = todayKey();
  const now = new Date();
  if (!view) view = { y: now.getFullYear(), m: now.getMonth() };
  const isCurrent = view.y === now.getFullYear() && view.m === now.getMonth();

  const rerender = () => renderCalendar(container, { store });
  const go = (n) => { shift(n); haptic.select(); rerender(); };

  const grid = h('div', { class: `cal-grid ${slide}`.trim(), role: 'grid' });
  slide = '';
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.append(h('span', { class: 'day-blank', 'aria-hidden': 'true' }));
  const n = daysInMonth(view.y, view.m);
  for (let d = 1; d <= n; d++) grid.append(dayCell(store, keyOf(new Date(view.y, view.m, d, 12)), today));

  // Свайп між місяцями
  let sx = null;
  let sy = null;
  grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  const card = h('section', { class: 'card cal' },
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Попередній місяць', onclick: () => go(-1) }, icon('chevronL')),
      h('div', { class: 'cal-title' },
        h('h2', null, `${MONTHS[view.m]} ${view.y}`),
        !isCurrent && h('button', { type: 'button', class: 'today-link', onclick: () => { view = null; rerender(); } }, 'до сьогодні')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Наступний місяць', onclick: () => go(1) }, icon('chevronR'))),
    h('div', { class: 'cal-week', 'aria-hidden': 'true' }, WEEKDAYS_CAP.map((w, i) => h('span', { class: i > 4 ? 'we' : '' }, w))),
    grid);

  container.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Календар')),
    h('div', { class: 'page-body' }, card, legend(), summary(store)),
  );
  arrow = go;
}

let arrow = null;

/** Стрілки ←/→ на клавіатурі (браузер, Telegram Desktop). */
export function calendarArrow(dir) {
  arrow?.(dir);
}

/** Повернутися до поточного місяця (повторний тап по вкладці). */
export function resetCalendar() {
  view = null;
}
