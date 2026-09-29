// Досягнення (SPEC §8): екран з отриманими й ще закритими, показ нового після отримання.
// Умови — evaluateAchievements() в achievements.js; отримані зберігаються через store (ключ `ach`, та сама черга).
import { ACHIEVEMENTS, achievementById, achievementsView, newlyEarned } from '../achievements.js';
import { fmtDay, plural, todayKey } from '../dates.js';
import { haptic } from '../tg.js';
import { h } from './dom.js';
import { depth, onStackEmpty } from './nav.js';
import { openScreen } from './screen.js';
import { openSheet, toast } from './sheet.js';

/** Медаль: emoji у фігурі кольору звички / сезону / акценту. Закрита — сіра. */
export function medal(a, { big = false } = {}) {
  return h('span', {
    class: ['medal', a.habit && `habit-${a.habit}`, a.earned ? 'is-earned' : 'is-locked', big && 'medal-big'],
    'data-pal': a.season || null,
    'aria-hidden': 'true',
  }, h('span', { class: 'medal-emoji' }, a.emoji), a.tier ? h('span', { class: 'medal-tier' }, a.tier) : null);
}

function achRow(a) {
  let status;
  if (a.earned) {
    status = h('span', { class: 'small ach-got' }, a.got ? `отримано ${fmtDay(a.got)}` : 'отримано');
  } else {
    const pct = a.need ? Math.round((a.have / a.need) * 100) : 0;
    status = h('div', { class: 'ach-progress' },
      a.need > 1 ? h('div', { class: 'ach-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': a.need, 'aria-valuenow': a.have },
        h('i', { style: { width: `${pct}%` } })) : null,
      h('span', { class: 'small muted' }, [a.need > 1 ? `${a.have} з ${a.need}` : '', a.note || ''].filter(Boolean).join(' · ') || 'ще попереду'));
  }
  return h('div', { class: `ach-row ${a.earned ? 'is-earned' : 'is-locked'}` },
    medal(a),
    h('div', { class: 'ach-main' },
      h('strong', null, a.name),
      h('span', { class: 'small muted' }, a.cond),
      status));
}

/** Короткий підсумок для рядків-посилань: «3 з 14». Лише зі збережених (нові зберігає watchAchievements). */
export function achievementsSummary(store) {
  const got = Object.entries(store.ach).filter(([id]) => achievementById(id)).sort((x, y) => (x[1] < y[1] ? 1 : -1));
  return { total: ACHIEVEMENTS.length, got: got.length, last: got.length ? achievementById(got[0][0]) : null };
}

export function openAchievements(store) {
  openScreen({
    title: 'Досягнення',
    render(body, screen) {
      const paint = () => {
        const list = achievementsView(store.settings, store.entries, store.ach, todayKey());
        const got = list.filter((a) => a.earned).sort((x, y) => ((x.got || '') < (y.got || '') ? 1 : -1));
        const locked = list.filter((a) => !a.earned).sort((x, y) => (y.have / y.need) - (x.have / x.need));
        const pct = Math.round((got.length / list.length) * 100);
        body.replaceChildren(
          h('section', { class: 'card ach-sum' },
            h('div', { class: 'ach-sum-medals', 'aria-hidden': 'true' }, got.slice(0, 5).map((a) => medal(a))),
            h('div', null,
              h('strong', { class: 'ach-sum-num' }, `${got.length} з ${list.length}`),
              h('span', { class: 'small muted' }, got.length ? `${plural(got.length, ['досягнення отримано', 'досягнення отримано', 'досягнень отримано'])}` : 'Поки жодного — перше вже близько')),
            h('div', { class: 'ach-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('i', { style: { width: `${pct}%` } }))),
          h('p', { class: 'hint' }, 'Умови перевіряються за твоїми відмітками. Паузи не є пропусками, бонуси продовжують серію. Отримане досягнення лишається назавжди.'),
          got.length ? h('h2', { class: 'section-title' }, 'Отримані') : null,
          got.length ? h('div', { class: 'card list-card ach-list' }, got.map(achRow)) : null,
          locked.length ? h('h2', { class: 'section-title' }, 'Ще закриті') : null,
          locked.length ? h('div', { class: 'card list-card ach-list' }, locked.map(achRow)) : null,
        );
      };
      paint();
      screen.onCleanup(store.subscribe(paint));
    },
  });
}

// ——— Нове досягнення ———

const CONFETTI = 16;

function burst() {
  const colors = ['var(--train)', 'var(--eng)', 'var(--accent)'];
  return h('div', { class: 'ach-burst', 'aria-hidden': 'true' }, Array.from({ length: CONFETTI }, (_, i) => h('i', {
    style: {
      '--a': `${(360 / CONFETTI) * i + (i % 2 ? 8 : -6)}deg`,
      '--r': `${58 + (i % 3) * 18}px`,
      '--c': colors[i % 3],
      '--delay': `${(i % 4) * 40}ms`,
    },
  })));
}

function celebrate(store, list) {
  haptic.success();
  const many = list.length > 1;
  openSheet({
    title: many ? 'Нові досягнення!' : 'Нове досягнення!',
    subtitle: `Отримано ${fmtDay(todayKey())}`,
    className: 'ach-sheet',
    render(body, sheet) {
      body.append(
        h('div', { class: 'ach-hero' },
          burst(),
          h('div', { class: 'ach-hero-medals' }, list.slice(0, 3).map((a) => medal({ ...a, earned: true }, { big: true })))),
        h('div', { class: 'ach-new' }, list.map((a) => h('div', { class: 'ach-new-item' },
          h('strong', null, `${a.emoji} ${a.name}`),
          h('span', { class: 'small muted' }, a.cond)))),
        h('div', { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { sheet.close(); setTimeout(() => openAchievements(store), 300); } }, 'Усі досягнення'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => sheet.close() }, 'Круто!')),
      );
    },
  });
}

/**
 * Стежить за змінами даних: нове досягнення одразу зберігається, а показується,
 * коли закрито всі шторки й екрани (щоб не перебивати форму відмітки).
 */
export function watchAchievements(store) {
  const queue = [];
  let checkTimer = null;
  let showTimer = null;

  const show = () => {
    if (!queue.length || depth()) return;
    clearTimeout(showTimer);
    // Пауза — щоб попередня шторка встигла закритися.
    showTimer = setTimeout(() => {
      if (!queue.length || depth()) return;
      celebrate(store, queue.splice(0));
    }, 420);
  };

  const check = () => {
    checkTimer = null;
    if (!store.settings) return;
    const fresh = newlyEarned(store.settings, store.entries, store.ach, todayKey());
    if (!fresh.length) return;
    try {
      store.grantAchievements(fresh.map((a) => a.id));
    } catch (err) {
      toast(err.message, { type: 'error' });
      return;
    }
    const order = ACHIEVEMENTS.map((a) => a.id);
    queue.push(...fresh.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)));
    show();
  };

  // Відкладено: запис і відкриття форми відбуваються в одному обробнику тапу.
  const schedule = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 0);
  };
  store.subscribe(schedule);
  onStackEmpty(show);
  schedule();
}
