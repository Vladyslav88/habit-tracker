// Вкладка «Сьогодні» (SPEC §5.1).
import { daysInMonth, fmtDay, fmtLong, fmtShort, fmtTime, keyOf, MONTHS_GEN, parseKey, relDays, todayKey } from '../dates.js';
import { HABITS, HABIT_IDS, hasDetails } from '../habits.js';
import { sceneMarkup } from '../scenes.js';
import { currentLook, greetingFor, SEASONS, seasonOf } from '../seasons.js';
import { entryId, planFor, unmarked, upcoming } from '../schedule.js';
import { firstName, haptic } from '../tg.js';
import { h, icon } from './dom.js';
import { achievementsSummary, openAchievements } from './achievements.js';
import { chipRow, entryChips, habitSubtitle, habitTitle, markAndAsk, openEntryEditor, openStepForm } from './entry-form.js';
import { openMonthCard } from './month.js';
import { openSheet, toast } from './sheet.js';

function habitCard(store, date, habit, entry) {
  const done = entry?.s === 'done';
  const head = h('div', { class: 'hcard-head' },
    h('span', { class: 'hicon' }, icon(HABITS[habit].icon)),
    h('div', { class: 'htitles' },
      h('h3', null, habitTitle(store, habit, date, entry)),
      h('p', null, habitSubtitle(store, habit, date, entry))),
    entry && h('span', { class: `pill ${done ? 'pill-done' : 'pill-miss'}` },
      icon(done ? 'check' : 'x'), done ? (entry.bonus ? 'Бонус' : 'Виконано') : 'Пропуск'));

  const card = h('article', { class: `card hcard habit-${habit} ${entry ? `is-${entry.s}` : 'is-open'}` }, head);

  if (!entry) {
    card.append(h('div', { class: 'hcard-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-mark', onclick: (e) => { e.currentTarget.disabled = true; markAndAsk(store, date, habit, 'done'); } },
        icon('check'), 'Виконав'),
      h('button', { type: 'button', class: 'btn btn-outline btn-mark', onclick: (e) => { e.currentTarget.disabled = true; markAndAsk(store, date, habit, 'miss'); } },
        icon('x'), 'Не виконав')));
    return card;
  }

  const chips = chipRow(entryChips(habit, entry).filter((c) => c.cls !== 'chip-bonus'));
  if (chips) card.append(chips);
  if (entry.comment) card.append(h('p', { class: 'hcard-comment' }, entry.comment));
  const more = hasDetails(habit, entry)
    ? h('button', { type: 'button', class: 'link-btn', onclick: () => openEntryEditor(store, date, habit) }, 'Змінити')
    : h('button', { type: 'button', class: 'link-btn', onclick: () => openStepForm(store, date, habit, entry) }, 'Додати деталі');
  card.append(h('div', { class: 'hcard-foot' }, more));
  return card;
}

function restCard(store, today, plan) {
  const next = upcoming(store.settings, today, 1)[0];
  const title = plan.pause ? 'Сьогодні пауза' : 'Сьогодні вихідний';
  const sub = plan.pause
    ? [plan.pause.label || 'Пауза', plan.pause.to ? `до ${fmtDay(plan.pause.to)}` : 'триває'].join(' · ')
    : 'Відпочинок — теж частина плану 🌿';
  return h('article', { class: 'card rest-card' },
    h('div', { class: 'rest-icon' }, plan.pause ? icon('pause') : '🌿'),
    h('h3', null, title),
    h('p', { class: 'muted' }, sub),
    next && h('div', { class: 'rest-next' },
      h('span', { class: 'small muted' }, 'Наступне за розкладом'),
      h('strong', null, next.habits.map((hb) => habitTitle(store, hb, next.date, null)).join(' + ')),
      h('span', { class: 'small' }, `${fmtShort(next.date)} · ${relDays(next.date, today)}`)));
}

function openBonusPicker(store, date, habits) {
  openSheet({
    title: 'Позаплановий бонус',
    subtitle: 'Зараховується окремо і не псує відсоток виконання',
    render(body, sheet) {
      body.append(h('div', { class: 'stack' }, habits.map((habit) => h('button', {
        type: 'button',
        class: `btn btn-soft btn-wide btn-bonus habit-${habit}`,
        // Форма запису замінює вміст цієї ж шторки.
        onclick: () => markAndAsk(store, date, habit, 'done', {}, sheet, { replace: true }),
      }, icon(HABITS[habit].icon), `+ ${HABITS[habit].name}`))));
    },
  });
}

function homeworkCard(store, hw) {
  return h('article', { class: `card hw-card habit-${hw.habit}` },
    h('div', { class: 'hw-head' },
      h('span', { class: 'small muted' }, `Домашка з ${fmtDay(hw.date)}`),
      hw.entry.topic && h('span', { class: 'small muted' }, `· ${hw.entry.topic}`)),
    h('p', { class: 'hw-text' }, hw.entry.hw.text),
    h('button', {
      type: 'button',
      class: 'btn btn-soft btn-sm',
      onclick: () => {
        store.saveEntry(hw.date, hw.habit, { hw: { ...hw.entry.hw, done: true } });
        haptic.light();
        toast('Домашку виконано ✓');
      },
    }, icon('check'), 'Виконав'));
}

function unmarkedList(store, items) {
  return h('div', { class: 'card list-card' }, items.map(({ date, habit }) => h('div', { class: `list-row habit-${habit}` },
    h('span', { class: 'dot' }),
    h('div', { class: 'list-main' },
      h('strong', null, habitTitle(store, habit, date, null)),
      h('span', { class: 'small muted' }, `${fmtShort(date)} · ${relDays(date)}`)),
    h('div', { class: 'list-actions' },
      h('button', { type: 'button', class: 'icon-btn icon-done', 'aria-label': `Виконав: ${fmtShort(date)}`, onclick: () => markAndAsk(store, date, habit, 'done') }, icon('check')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Не виконав: ${fmtShort(date)}`, onclick: () => markAndAsk(store, date, habit, 'miss') }, icon('x'))))));
}

function upcomingList(store, today) {
  const items = upcoming(store.settings, today, 3);
  if (!items.length) return null;
  return h('div', { class: 'card list-card' }, items.flatMap((d) => d.habits.map((habit) => h('div', { class: `list-row habit-${habit}` },
    h('span', { class: 'dot dot-soft' }),
    h('div', { class: 'list-main' },
      h('strong', null, habitTitle(store, habit, d.date, null)),
      h('span', { class: 'small muted' }, habitSubtitle(store, habit, d.date, null))),
    h('span', { class: 'list-when small' }, h('b', null, fmtShort(d.date).split(',')[0]), relDays(d.date, today))))));
}

/**
 * Місячна картка наприкінці місяця: з останніх 3 днів — поточний («майже завершено»),
 * з 1 до 7 числа — минулий (якщо відстеження тоді вже йшло).
 */
function monthCta(store, today) {
  const d = parseKey(today);
  const y = d.getFullYear();
  const m = d.getMonth();
  let target = null;
  let sub = '';
  if (d.getDate() > daysInMonth(y, m) - 3) {
    target = { y, m };
    sub = 'Місяць майже завершено — подивись, як він пройшов';
  } else if (d.getDate() <= 7) {
    const prev = new Date(y, m - 1, 1, 12);
    const last = keyOf(new Date(prev.getFullYear(), prev.getMonth(), daysInMonth(prev.getFullYear(), prev.getMonth()), 12));
    if (last >= store.settings.startDate) {
      target = { y: prev.getFullYear(), m: prev.getMonth() };
      sub = 'Місяць завершено — картка готова';
    }
  }
  if (!target) return null;
  const season = seasonOf(new Date(target.y, target.m, 15));
  return h('button', { type: 'button', class: 'month-cta', onclick: () => openMonthCard(store, target) },
    h('span', { class: 'month-cta-ic', 'aria-hidden': 'true' }, SEASONS[season].emoji),
    h('span', { class: 'month-cta-main' }, h('strong', null, `Підсумок ${MONTHS_GEN[target.m]}`), h('span', { class: 'small muted' }, sub)),
    icon('chevronR', 'row-chev'));
}

function achievementsLink(store) {
  const s = achievementsSummary(store);
  return h('button', { type: 'button', class: 'ach-link', onclick: () => openAchievements(store) },
    h('span', { class: 'ach-link-ic', 'aria-hidden': 'true' }, '🏅'),
    h('span', { class: 'month-cta-main' },
      h('strong', null, `Досягнення · ${s.got} з ${s.total}`),
      h('span', { class: 'small muted' }, s.last ? `останнє: ${s.last.emoji} ${s.last.name}` : 'перше вже близько')),
    icon('chevronR', 'row-chev'));
}

function renderHero(look, key, now = new Date()) {
  const s = SEASONS[look.season];
  const greet = greetingFor(now) + (firstName ? `, ${firstName}` : '');
  const hero = h('section', { class: 'hero', 'data-key': key },
    h('div', { class: 'hero-top' }, h('span', { class: 'season-chip' }, `${s.emoji} ${s.name}`)),
    h('p', { class: 'greeting' }, greet),
    h('div', { class: 'clock', 'data-clock': '' }, fmtTime(now)),
    h('p', { class: 'hero-date' }, fmtLong(todayKey())));
  hero.insertAdjacentHTML('beforeend', sceneMarkup(look.season));
  return hero;
}

/** Висота шапки — частинки падають лише в її межах. */
function syncFxHeight(hero) {
  requestAnimationFrame(() => {
    const r = hero.getBoundingClientRect();
    if (r.height) document.documentElement.style.setProperty('--fx-h', `${Math.round(r.bottom + window.scrollY - 40)}px`);
  });
}

export function renderToday(view, { store }) {
  const look = currentLook();
  const today = todayKey();
  const plan = planFor(store.settings, today);
  // Пауза має пріоритет: пропуск у день паузи не показуємо.
  const extra = HABIT_IDS.filter((hb) => {
    if (plan.habits.includes(hb)) return false;
    const e = store.entries.get(entryId(today, hb));
    return e && !(plan.pause && e.s === 'miss');
  });
  const todays = [...plan.habits, ...extra];
  const bonusable = HABIT_IDS.filter((hb) => !todays.includes(hb));

  const body = h('div', { class: 'today-body' });
  body.append(h('h2', { class: 'section-title' }, 'Сьогодні'));
  const list = h('div', { class: 'stack' });
  if (!plan.habits.length) list.append(restCard(store, today, plan));
  todays.forEach((hb) => list.append(habitCard(store, today, hb, store.getEntry(today, hb))));
  if (bonusable.length) {
    list.append(h('button', {
      type: 'button',
      class: 'bonus-btn',
      onclick: () => openBonusPicker(store, today, bonusable),
    }, icon('plus'), 'бонус', h('span', { class: 'small muted' }, 'позапланова звичка')));
  }
  body.append(list);

  const cta = monthCta(store, today);
  if (cta) body.append(h('div', { class: 'stack month-cta-wrap' }, cta));

  const hw = store.openHomework(today);
  if (hw) body.append(h('h2', { class: 'section-title' }, 'Домашка'), homeworkCard(store, hw));

  const missing = unmarked(store.settings, store.entries, today, 14);
  if (missing.length) {
    body.append(h('h2', { class: 'section-title' }, 'Не відмічено'), unmarkedList(store, missing.slice(-5).reverse()));
  }

  const next = upcomingList(store, today);
  if (next && plan.habits.length) body.append(h('h2', { class: 'section-title' }, 'Далі за розкладом'), next);

  body.append(h('div', { class: 'stack ach-link-wrap' }, achievementsLink(store)));

  // Шапку не перебудовуємо без потреби — інакше анімації сцени починалися б спочатку після кожного тапу.
  const key = [look.season, look.tod, greetingFor(), today, firstName].join('|');
  const oldHero = view.querySelector(':scope > .hero');
  const oldBody = view.querySelector(':scope > .today-body');
  if (oldHero && oldBody && oldHero.dataset.key === key) {
    oldBody.replaceWith(body);
  } else {
    const hero = renderHero(look, key);
    view.replaceChildren(hero, body);
    syncFxHeight(hero);
  }
}
