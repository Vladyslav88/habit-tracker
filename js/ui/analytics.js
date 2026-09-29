// Вкладка «Аналітика» (SPEC §8). Графіки — простий SVG/CSS, кольори лише з токенів палітри.
import { analyze, checkpointTimeline, MIN, PERIODS, periodRange, reportMonths, streaks } from '../analytics.js';
import { fmtDay, fmtShort, MONTHS, plural, todayKey } from '../dates.js';
import { DUR, ENERGY, HABITS, HABIT_IDS, reasonLabel } from '../entry.js';
import { haptic } from '../tg.js';
import { checkpointCard, cpRange, cpWhen, openCheckpoints } from './checkpoints.js';
import { h, icon } from './dom.js';
import { openMonthCard } from './month.js';

let period = '4w';
try { period = sessionStorage.getItem('ht_period') || period; } catch { /* ignore */ }
if (!PERIODS.some((p) => p.id === period)) period = '4w';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  kids.forEach((k) => el.append(k));
  return el;
};

const pctText = (x) => `${Math.round(x * 100)}%`;
const num1 = (x) => x.toFixed(1).replace('.', ',');
const days = (n) => `${n} ${plural(n, ['день', 'дні', 'днів'])}`;
const evals = (n) => `${n} ${plural(n, ['оцінка', 'оцінки', 'оцінок'])}`;
const marks = (n) => `${n} ${plural(n, ['відмітка', 'відмітки', 'відміток'])}`;

/** Порожній стан картки: що потрібно, щоб зʼявився графік. */
function empty(text, have, need) {
  return h('div', { class: 'an-empty' },
    h('p', { class: 'small muted' }, text),
    need ? h('div', { class: 'an-need', role: 'img', 'aria-label': `${have} з ${need}` },
      Array.from({ length: need }, (_, i) => h('i', { class: i < have ? 'on' : '' }))) : null);
}

function card(title, sub, ...body) {
  return h('section', { class: 'card an-card' },
    h('header', { class: 'an-card-head' }, h('h3', null, title), sub && h('span', { class: 'small muted' }, sub)),
    ...body);
}

// ——— Виконання ———

/** Кільце виконання: тренування — коло, англійська — заокруглений квадрат (як у календарі). */
export function ring(habit, pct) {
  const shape = (cls) => (habit === 'train'
    ? svg('circle', { class: cls, cx: 28, cy: 28, r: 23, pathLength: 100 })
    : svg('rect', { class: cls, x: 5, y: 5, width: 46, height: 46, rx: 14, pathLength: 100 }));
  const val = shape('ring-val');
  const p = pct === null ? 0 : Math.round(pct * 100);
  val.setAttribute('stroke-dasharray', `${p} 100`);
  if (!p) val.setAttribute('visibility', 'hidden');
  const el = svg('svg', { viewBox: '0 0 56 56', class: 'ring-svg', 'aria-hidden': 'true' }, shape('ring-track'), val);
  return h('div', { class: `ring habit-${habit}` }, el, h('b', { class: 'ring-num' }, pct === null ? '—' : pctText(pct)));
}

function habitRow(store, habit, r, today) {
  const st = streaks(store.settings, store.entries, habit, today);
  const extra = [
    r.miss && `пропущено ${r.miss}`,
    r.unmarked && `не відмічено ${r.unmarked}`,
    r.pending && r.planned && 'сьогодні ще попереду',
    r.bonus && `+${r.bonus} бонус`,
  ].filter(Boolean);
  const label = r.planned
    ? `${r.done} з ${r.planned} ${plural(r.planned, HABITS[habit].ofForms)}`
    : r.pending ? 'перше заняття періоду — сьогодні' : 'ще не було запланованих';
  return h('div', { class: `an-habit habit-${habit}`, 'aria-label': `${HABITS[habit].name}: ${r.pct === null ? 'немає даних' : pctText(r.pct)}` },
    ring(habit, r.pct),
    h('div', { class: 'an-habit-main' },
      h('strong', null, HABITS[habit].name),
      h('span', { class: 'small' }, label),
      extra.length ? h('span', { class: 'small muted' }, extra.join(' · ')) : null,
      h('span', { class: 'an-streak small' },
        icon('flag'), 'серія ', h('b', null, String(st.current)), ` · рекорд ${st.best}`)));
}

// ——— Тривалість ———

function durationCard(a) {
  const { dur } = a;
  const sub = dur.total ? `${dur.total} ${plural(dur.total, HABITS.train.forms)} за період` : '';
  if (dur.known < MIN.dur) {
    return card('Тривалість тренувань', sub,
      empty(dur.total
        ? `Тривалість указано для ${dur.known} з ${dur.total}. Розподіл зʼявиться, коли їх буде ${MIN.dur}.`
        : 'За цей період тренувань ще не було.', dur.known, MIN.dur));
  }
  const max = Math.max(...Object.values(dur.by));
  return card('Тривалість тренувань', sub,
    h('div', { class: 'hbars habit-train' }, DUR.map((d) => {
      const n = dur.by[d.v];
      return h('div', { class: 'hbar', 'aria-label': `${d.label}: ${n}` },
        h('span', { class: 'hbar-label' }, d.label),
        h('span', { class: 'hbar-track' }, h('i', { style: { width: `${max ? (n / max) * 100 : 0}%` } })),
        h('b', { class: 'hbar-val' }, String(n)));
    })),
    dur.unknown ? h('p', { class: 'small muted' }, `Ще ${dur.unknown} без указаної тривалості.`) : null);
}

// ——— Спина після Дня N ———

function backCard(a) {
  const { back } = a;
  if (back.known < MIN.back) {
    return card('Спина після Дня 1 / 2 / 3', null,
      empty(`Відповідь про спину є в ${back.known} ${plural(back.known, ['тренуванні', 'тренуваннях', 'тренуваннях'])}. Порівняння Днів зʼявиться після ${MIN.back}.`, back.known, MIN.back));
  }
  const rows = [1, 2, 3].map((d) => ({ d, ...back.by[d], rate: back.by[d].n ? back.by[d].back / back.by[d].n : null }));
  const worst = rows.filter((r) => r.back).sort((x, y) => y.rate - x.rate || y.back - x.back)[0];
  const tie = worst && rows.filter((r) => r.back && r.rate === worst.rate).length > 1;
  let verdict;
  if (!worst) verdict = 'Дискомфорту в спині не було 👍';
  else if (tie) verdict = 'Дискомфорт після кількох Днів однаково часто';
  else verdict = `Найчастіше — після Дня ${worst.d}`;
  return card('Спина після Дня 1 / 2 / 3', null,
    h('p', { class: 'an-verdict' }, verdict),
    h('div', { class: 'hbars hbars-back' }, rows.map((r) => h('div', { class: `hbar ${worst && !tie && r.d === worst.d ? 'is-top' : ''}`, 'aria-label': `День ${r.d}: ${r.n ? `${r.back} з ${r.n}` : 'немає даних'}` },
      h('span', { class: 'hbar-label' }, `День ${r.d}`),
      h('span', { class: 'hbar-track' }, h('i', { style: { width: `${r.rate ? r.rate * 100 : 0}%` } })),
      h('b', { class: 'hbar-val' }, r.n ? `${r.back} з ${r.n}` : '—')))),
    h('p', { class: 'small muted' }, 'Частка тренувань із дискомфортом серед тих, де відповідь про спину є.'));
}

// ——— Пропуски ———

function missesCard(a) {
  const total = a.misses;
  if (!total) {
    return card('Причини пропусків', null,
      empty(a.marks ? 'За цей період пропусків не було 🎉' : 'Пропусків немає, але й відміток поки немає.', 0, 0));
  }
  const max = Math.max(...a.reasons.map((r) => r.total), 1);
  const legend = h('div', { class: 'an-legend small muted' },
    HABIT_IDS.map((hb) => h('span', { class: `habit-${hb}` }, h('i', { class: 'dot' }), HABITS[hb].name.toLowerCase())));
  const bars = a.reasons.length ? h('div', { class: 'hbars' }, a.reasons.map((r) => h('div', { class: 'hbar', 'aria-label': `${reasonLabel(r.v)}: ${r.total}` },
    h('span', { class: 'hbar-label' }, reasonLabel(r.v)),
    h('span', { class: 'hbar-track hbar-stack' },
      r.train ? h('i', { class: 'habit-train', style: { width: `${(r.train / max) * 100}%` } }) : null,
      r.eng ? h('i', { class: 'habit-eng', style: { width: `${(r.eng / max) * 100}%` } }) : null),
    h('b', { class: 'hbar-val' }, String(r.total))))) : null;
  const comments = a.comments.length ? h('div', { class: 'an-comments' },
    h('span', { class: 'field-label' }, 'Останні коментарі'),
    a.comments.map((c) => h('blockquote', { class: `an-quote habit-${c.habit}` },
      h('span', { class: 'small muted' }, h('i', { class: 'dot', 'aria-hidden': 'true' }), `${fmtShort(c.date)} · ${HABITS[c.habit].name.toLowerCase()}`),
      h('p', null, c.entry.comment)))) : null;
  return card('Причини пропусків', `${total} ${plural(total, ['пропуск', 'пропуски', 'пропусків'])}`,
    a.reasons.length ? legend : null,
    bars,
    a.noReason ? h('p', { class: 'small muted' }, `${a.noReason} без указаної причини.`) : null,
    comments);
}

// ——— Енергія ———

function tile(label, value, sub) {
  return h('div', { class: 'an-tile' }, h('span', { class: 'small muted' }, label), h('b', null, value), sub && h('span', { class: 'small muted' }, sub));
}

export function energyValue(x) {
  if (x === null) return '—';
  const e = ENERGY[Math.min(4, Math.max(0, Math.round(x) - 1))];
  return `${e.emoji} ${num1(x)}`;
}

function energyCard(a) {
  const { energy: en } = a;
  if (en.n < MIN.energy) {
    return card('Енергія', null,
      empty(en.n
        ? `Енергію оцінено ${en.n} ${plural(en.n, ['раз', 'рази', 'разів'])}. Середня зʼявиться після ${MIN.energy}.`
        : `Енергію за цей період ще не оцінювали. Середня зʼявиться після ${MIN.energy} оцінок.`, en.n, MIN.energy));
  }
  const split = en.done.n >= MIN.energySplit && en.miss.n >= MIN.energySplit;
  let note = null;
  if (split) {
    const diff = en.done.avg - en.miss.avg;
    note = Math.abs(diff) < 0.25
      ? 'У дні виконання і пропуску енергія майже однакова.'
      : `У дні пропуску енергія ${diff > 0 ? 'нижча' : 'вища'} в середньому на ${num1(Math.abs(diff))}.`;
  } else {
    note = `Порівняння зʼявиться, коли буде хоча б по ${MIN.energySplit} оцінки в дні виконання і в дні пропуску.`;
  }
  const max = Math.max(...en.hist, 1);
  return card('Енергія', evals(en.n),
    h('div', { class: 'an-tiles' },
      tile('Середня', energyValue(en.avg)),
      tile('Виконав', en.done.n ? energyValue(en.done.avg) : '—', evals(en.done.n)),
      tile('Пропуск', en.miss.n ? energyValue(en.miss.avg) : '—', evals(en.miss.n))),
    h('div', { class: 'an-hist', role: 'img', 'aria-label': ENERGY.map((e, i) => `${e.label}: ${en.hist[i]}`).join(', ') },
      ENERGY.map((e, i) => h('div', { class: 'an-hist-col' },
        h('span', { class: 'an-hist-val small' }, en.hist[i] ? String(en.hist[i]) : ''),
        h('span', { class: 'an-hist-bar' }, h('i', { style: { height: `${(en.hist[i] / max) * 100}%` } })),
        h('span', { class: 'an-hist-emoji', title: e.label }, e.emoji)))),
    h('p', { class: 'small muted' }, note));
}

// ——— Сторінка ———

function periodPicker(rerender) {
  return h('div', { class: 'segmented an-period', role: 'radiogroup', 'aria-label': 'Період' }, PERIODS.map((p) => h('button', {
    type: 'button',
    role: 'radio',
    class: `seg ${p.id === period ? 'on' : ''}`,
    'aria-checked': String(p.id === period),
    onclick: () => {
      if (p.id === period) return;
      period = p.id;
      try { sessionStorage.setItem('ht_period', period); } catch { /* ignore */ }
      haptic.select();
      rerender();
    },
  }, p.label)));
}

function nextCheckpointBar(store, list, today) {
  const c = list.find((x) => x.status !== 'past');
  if (!c) return null;
  return h('button', { type: 'button', class: 'an-next-cp', onclick: () => openCheckpoints(store) },
    icon('flag'),
    h('span', { class: 'an-next-main' },
      h('b', null, c.label || 'Контрольна точка'),
      h('span', { class: 'small muted' }, `${cpRange(c)} · ${cpWhen(c, today)}`)),
    c.status === 'upcoming' ? h('span', { class: 'an-next-days' }, h('b', null, String(c.days)), plural(c.days, ['день', 'дні', 'днів'])) : h('span', { class: 'tag' }, 'сьогодні'));
}

export function renderAnalytics(view, ctx) {
  const { store } = ctx;
  const today = todayKey();
  const { settings, entries } = store;
  const range = periodRange(settings, period, today);
  const a = analyze(settings, entries, range.from, range.to, today);
  const cps = checkpointTimeline(settings, entries, today);
  const rerender = () => renderAnalytics(view, ctx);

  const rangeText = range.from === range.to
    ? `${fmtDay(range.from)} · 1 день`
    : `${fmtDay(range.from)} — ${fmtDay(range.to)} · ${days(a.days)}`;
  const parts = [
    nextCheckpointBar(store, cps, today),
    periodPicker(rerender),
    h('p', { class: 'hint an-range' }, rangeText, range.clipped ? ` (відстеження з ${fmtDay(settings.startDate)})` : ''),
  ];

  const planned = HABIT_IDS.reduce((n, hb) => n + a.habits[hb].planned + a.habits[hb].pending, 0);
  if (!a.marks && !planned) {
    parts.push(h('section', { class: 'card soon' },
      h('div', { class: 'soon-emoji', 'aria-hidden': 'true' }, '🌱'),
      h('h2', null, 'Поки порожньо'),
      h('p', { class: 'muted' }, 'За цей період ще немає ні відміток, ні запланованих занять. Відмічай звички на вкладці «Сьогодні» — і тут зʼявляться цифри.')));
  } else {
    if (a.marks < MIN.marks) {
      parts.push(h('div', { class: 'an-notice' }, icon('info'),
        h('p', { class: 'small' }, h('b', null, 'Даних поки мало: '),
          `${marks(a.marks)} за ${days(a.days)}. Цифри нижче чесні, але висновки робити рано — картина стане надійнішою після ${MIN.marks} відміток.`)));
    }
    parts.push(
      h('h2', { class: 'section-title' }, 'Виконання'),
      h('section', { class: 'card an-card an-done' },
        HABIT_IDS.map((hb) => habitRow(store, hb, a.habits[hb], today)),
        h('p', { class: 'small muted' }, 'Відсоток — від запланованих днів, що вже минули. Паузи й вихідні не рахуються, бонуси — окремо. Серії — за весь час.')),
      h('h2', { class: 'section-title' }, 'Тренування'),
      durationCard(a),
      backCard(a),
      h('h2', { class: 'section-title' }, 'Пропуски'),
      missesCard(a),
      h('h2', { class: 'section-title' }, 'Самопочуття'),
      energyCard(a),
    );
  }

  // Посилання на місячну картку: поточний (в процесі) і минулий місяць; решта — стрілками на екрані картки.
  const months = reportMonths(settings, today).slice(-2).reverse();
  parts.push(
    h('h2', { class: 'section-title' }, 'Місячний підсумок'),
    h('div', { class: 'group mc-links' }, months.map((mo, i) => h('button', { type: 'button', class: 'row mc-link', onclick: () => openMonthCard(store, mo) },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `${MONTHS[mo.m]} ${mo.y}`)),
      i === 0 ? h('span', { class: 'tag' }, 'в процесі') : null,
      icon('chevronR', 'row-chev')))),
  );

  parts.push(
    h('div', { class: 'an-section-head' },
      h('h2', { class: 'section-title' }, 'Контрольні точки'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => openCheckpoints(store) }, 'Керувати')),
    cps.length
      ? h('div', { class: 'stack' }, cps.map((c) => checkpointCard(c, today)))
      : h('p', { class: 'empty-line muted' }, 'Контрольних точок немає. Додати можна в «Керувати».'),
  );

  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Аналітика')),
    h('div', { class: 'page-body an-page' }, parts));
}
