// Місячний підсумок-картка (SPEC §8): верстка «під скріншот», за будь-який місяць від початку відстеження.
// Обчислення — monthReport() в analytics.js; тут лише відображення. Палітра — сезону місяця (як у календарі).
import { achievementById } from '../achievements.js';
import { MIN, monthReport, reportMonths } from '../analytics.js';
import { fmtDay, MONTHS, MONTHS_GEN, plural, todayKey } from '../dates.js';
import { HABITS, HABIT_IDS, reasonLabel } from '../entry.js';
import { SEASONS, seasonOf } from '../seasons.js';
import { haptic } from '../tg.js';
import { openAchievements } from './achievements.js';
import { energyValue, ring } from './analytics.js';
import { h, icon } from './dom.js';
import { openScreen } from './screen.js';

const pctText = (x) => `${Math.round(x * 100)}%`;

/** Легка сезонна ілюстрація: лише токени палітри (--train, --eng, --accent), без картинок. */
const ART = {
  autumn: `<g class="mc-leaf"><path d="M0-14C-8-7-9 2-4 9L0 14 4 9C9 2 8-7 0-14z" fill="var(--train)"/><path d="M0-10V14" stroke="var(--accent)" stroke-width="1.4"/></g>`,
  winter: `<g fill="none" stroke="var(--train)" stroke-width="2.2" stroke-linecap="round"><path d="M0-13V13M-11.3-6.5 11.3 6.5M-11.3 6.5 11.3-6.5"/><path d="M-3-10 0-7 3-10M-3 10 0 7 3 10" stroke-width="1.6"/></g>`,
  spring: `<g><circle r="5" fill="var(--accent)"/><g fill="var(--train)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(${a})"/>`).join('')}</g><circle r="3.6" fill="var(--eng)"/></g>`,
  summer: `<g><circle r="8" fill="var(--eng)"/><g stroke="var(--eng)" stroke-width="2.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0-12V-16" transform="rotate(${a})"/>`).join('')}</g></g>`,
};

function monthArt(season) {
  const spots = [[298, 40, 1.5, -18], [336, 84, 1, 24], [346, 18, 0.6, -40]];
  const el = h('div', { class: 'mc-art', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 360 110" preserveAspectRatio="xMaxYMid slice">${spots
    .map(([x, y, s, r], i) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})" opacity="${i < 2 ? 1 : 0.55}">${ART[season]}</g>`).join('')}</svg>`;
  return el;
}

function tile(label, value, sub, cls = '') {
  return h('div', { class: `mc-tile ${cls}`.trim() },
    h('span', { class: 'mc-tile-label' }, label),
    h('b', null, value),
    sub ? h('span', { class: 'small muted' }, sub) : null);
}

function habitBlock(r, habit, best, current) {
  const extra = [
    r.miss && `пропущено ${r.miss}`,
    r.unmarked && `не відмічено ${r.unmarked}`,
    r.bonus && `+${r.bonus} бонус`,
  ].filter(Boolean);
  let label;
  if (r.planned) label = `${r.done} з ${r.planned} ${plural(r.planned, HABITS[habit].ofForms)}`;
  else if (r.pending) label = 'перше заняття ще попереду';
  else label = r.bonus ? 'не було в розкладі' : 'не було запланованих';
  return h('div', { class: `mc-habit habit-${habit}` },
    ring(habit, r.pct),
    h('div', { class: 'mc-habit-main' },
      h('strong', null, HABITS[habit].name),
      h('span', { class: 'small' }, label),
      extra.length ? h('span', { class: 'small muted' }, extra.join(' · ')) : null,
      current && r.planned && r.pending ? h('span', { class: 'small muted' }, `ще попереду ${r.pending}`) : null,
      h('span', { class: 'an-streak small' }, icon('flag'), 'найкраща серія ', h('b', null, String(best)))));
}

function reasonTile(rep) {
  if (!rep.misses) {
    return tile('Головна причина', '—', rep.unmarked ? 'пропусків немає, є невідмічені дні' : 'пропусків не було 🎉');
  }
  if (!rep.topReasons.length) return tile('Головна причина', '—', 'причини не вказано');
  const names = rep.topReasons.map((r) => reasonLabel(r.v));
  const n = rep.topReasons[0].total;
  return tile('Головна причина', names.join(' і '),
    `${n} з ${rep.misses} ${plural(rep.misses, ['пропуску', 'пропусків', 'пропусків'])}${names.length > 1 ? ' кожна' : ''}`, 'mc-tile-text');
}

function energyTile(rep) {
  const en = rep.energy;
  if (en.n < MIN.energy) {
    return tile('Середня енергія', '—', en.n ? `оцінок ${en.n} з ${MIN.energy} потрібних` : 'енергію не оцінювали');
  }
  return tile('Середня енергія', energyValue(en.avg), `${en.n} ${plural(en.n, ['оцінка', 'оцінки', 'оцінок'])}`);
}

function backTile(rep) {
  const b = rep.back;
  if (!b.known) return tile('Спина', '—', rep.trainsDone ? 'відповідей про спину немає' : 'тренувань не було');
  return tile('Спина', b.hurt ? `${b.hurt} з ${b.known}` : 'без болю 👍',
    b.hurt ? 'тренувань із дискомфортом' : `${b.known} ${plural(b.known, ['відповідь', 'відповіді', 'відповідей'])}`, b.hurt ? 'mc-tile-back' : '');
}

function rangeLine(rep) {
  const d1 = Number(rep.from.slice(8));
  const d2 = Number(rep.last.slice(8));
  const extra = [rep.clipped && 'з початку відстеження', rep.status === 'current' && `станом на ${fmtDay(rep.to)}`].filter(Boolean);
  return [`${d1}–${d2} ${MONTHS_GEN[rep.m]} ${rep.y}`, ...extra].join(' · ');
}

function missTile(rep) {
  const sub = [
    rep.unmarked && `ще не відмічено ${rep.unmarked}`,
    rep.pauseDays && `пауза ${rep.pauseDays} ${plural(rep.pauseDays, ['день', 'дні', 'днів'])} — не рахується`,
  ].filter(Boolean);
  return tile('Пропуски', String(rep.misses), sub.join(' · ') || (rep.misses ? null : 'чисто'));
}

/** Сама картка. store потрібен лише для досягнень місяця. */
export function monthCard(store, rep) {
  const season = seasonOf(new Date(rep.y, rep.m, 15));
  const s = SEASONS[season];
  const head = h('header', { class: 'mc-head' },
    monthArt(season),
    h('div', { class: 'mc-chips' },
      h('span', { class: 'mc-season' }, `${s.emoji} ${s.name}`),
      rep.status === 'current' ? h('span', { class: 'tag mc-tag' }, 'в процесі') : null),
    h('h2', { class: 'mc-month' }, MONTHS[rep.m], h('span', null, ` ${rep.y}`)),
    h('p', { class: 'small muted' }, rangeLine(rep)));

  const parts = [head];
  if (rep.empty) {
    parts.push(h('div', { class: 'mc-empty' },
      h('div', { class: 'soon-emoji', 'aria-hidden': 'true' }, rep.status === 'before' ? '🕰️' : '🌱'),
      h('p', { class: 'muted' }, rep.status === 'before'
        ? `Відстеження почалося ${fmtDay(store.settings.startDate, true)} — за цей місяць даних немає.`
        : 'У цьому місяці не було ні відміток, ні запланованих занять (вихідні або пауза).')));
  } else {
    parts.push(
      h('div', { class: 'mc-habits' }, HABIT_IDS.map((hb) => habitBlock(rep.habits[hb], hb, rep.streaks[hb], rep.status === 'current'))),
      h('div', { class: 'mc-tiles' },
        tile('Бонуси', rep.bonus ? `+${rep.bonus}` : '0', rep.bonus ? 'поза розкладом, % не псують' : 'позапланових не було'),
        missTile(rep),
        reasonTile(rep),
        energyTile(rep),
        backTile(rep),
        tile('Теми англійської', String(rep.topics), rep.topics ? plural(rep.topics, ['різна тема', 'різні теми', 'різних тем']) : 'тем не записано')));
    const got = Object.entries(store.ach)
      .filter(([id, d]) => d >= rep.first && d <= rep.last && achievementById(id))
      .map(([id]) => achievementById(id));
    if (got.length) {
      parts.push(h('div', { class: 'mc-ach' },
        h('span', { class: 'mc-tile-label' }, 'Досягнення місяця'),
        h('div', { class: 'mini-chips' }, got.map((a) => h('span', { class: 'mini-chip' }, `${a.emoji} ${a.name}`)))));
    }
  }
  parts.push(h('footer', { class: 'mc-foot small' }, 'Habit Tracker'));
  return h('section', { class: 'card mc', 'data-pal': season, 'aria-label': `Підсумок: ${MONTHS[rep.m]} ${rep.y}` }, ...parts);
}

/** Назва місяця в родовому/називному для посилань: «Підсумок вересня». */
export const monthLinkLabel = ({ y, m }) => `Підсумок ${MONTHS_GEN[m]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;

/** Екран картки з перемиканням місяців (від місяця старту до поточного). */
export function openMonthCard(store, start) {
  let cur = start || (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
  openScreen({
    title: 'Підсумок',
    render(body, screen) {
      const paint = () => {
        const today = todayKey();
        const months = reportMonths(store.settings, today);
        let i = months.findIndex((x) => x.y === cur.y && x.m === cur.m);
        if (i < 0) { i = months.length - 1; cur = months[i]; }
        const go = (n) => { cur = months[i + n]; haptic.select(); paint(); };
        const rep = monthReport(store.settings, store.entries, cur.y, cur.m, today);
        body.replaceChildren(
          h('div', { class: 'mc-nav' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Попередній місяць', disabled: i <= 0, onclick: () => go(-1) }, icon('chevronL')),
            h('span', { class: 'mc-nav-title' }, `${MONTHS[cur.m]} ${cur.y}`),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Наступний місяць', disabled: i >= months.length - 1, onclick: () => go(1) }, icon('chevronR'))),
          monthCard(store, rep),
          h('p', { class: 'hint' }, 'Відсоток — від запланованих днів, що вже минули. Паузи й вихідні не рахуються, бонуси — окремо й відсоток не псують. Серія — найкраща в межах місяця.'),
          h('button', { type: 'button', class: 'btn btn-soft btn-wide', onclick: () => openAchievements(store) }, '🏅 Усі досягнення'),
        );
      };
      paint();
      screen.onCleanup(store.subscribe(paint));
    },
  });
}
