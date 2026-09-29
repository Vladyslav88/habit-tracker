// Контрольні точки (SPEC §8): відлік днів, підсумок відрізку, власні точки.
import { checkpointTimeline } from '../analytics.js';
import { diffDays, fmtDay, isValidKey, plural, relDays, todayKey } from '../dates.js';
import { HABITS, HABIT_IDS } from '../habits.js';
import { haptic } from '../tg.js';
import { h, icon } from './dom.js';
import { openScreen } from './screen.js';
import { confirmDialog, openSheet, toast } from './sheet.js';

export const CHECKPOINT_LABEL_MAX = 60;

export function cpRange(c) {
  if (c.end === c.date) return fmtDay(c.date);
  const [d1, m1] = fmtDay(c.date).split(' ');
  const [, m2] = fmtDay(c.end).split(' ');
  return m1 === m2 ? `${d1}–${fmtDay(c.end)}` : `${fmtDay(c.date)} — ${fmtDay(c.end)}`;
}

/** «через 11 днів» / «сьогодні» / «триває, до 8 листопада» / «5 днів тому» */
export function cpWhen(c, today) {
  if (c.status === 'now') return c.end === c.date || c.end === today ? 'сьогодні' : `сьогодні, до ${fmtDay(c.end)}`;
  if (c.status === 'past') return relDays(c.end, today);
  return relDays(c.date, today);
}

/** Найближча точка, що ще не минула. */
export function nextCheckpoint(settings, entries, today = todayKey()) {
  return checkpointTimeline(settings, entries, today).find((c) => c.status !== 'past') || null;
}

function segmentLine(c) {
  if (!c.stats) {
    return h('p', { class: 'small muted' }, c.beforeStart
      ? 'До початку відстеження.'
      : `Підсумок рахуватиметься з ${fmtDay(c.from)} — після попередньої точки.`);
  }
  const span = diffDays(c.from, c.to) + 1;
  const head = c.status === 'upcoming' ? `Поки що (${fmtDay(c.from)} — сьогодні)` : `${fmtDay(c.from)} — ${fmtDay(c.to)}`;
  return h('div', { class: 'cp-seg' },
    h('span', { class: 'small muted' }, `${head} · ${span} ${plural(span, ['день', 'дні', 'днів'])}`),
    h('div', { class: 'cp-stats' }, HABIT_IDS.map((hb) => {
      const r = c.stats[hb];
      return h('span', { class: `cp-stat habit-${hb}` },
        h('i', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', null, HABITS[hb].name),
        h('b', null, r.planned ? `${r.done}/${r.planned}` : '—'),
        r.bonus ? h('span', { class: 'muted' }, `+${r.bonus}`) : null);
    })));
}

/** Картка однієї точки (для аналітики й екрана налаштувань). */
export function checkpointCard(c, today, { onDelete } = {}) {
  const mark = { upcoming: h('b', null, String(c.days)), now: icon('flag'), past: icon('check') }[c.status];
  return h('article', { class: `card cp cp-${c.status}` },
    h('div', { class: 'cp-head' },
      h('div', { class: 'cp-count', 'aria-hidden': 'true' },
        mark,
        c.status === 'upcoming' ? h('span', null, plural(c.days, ['день', 'дні', 'днів'])) : null),
      h('div', { class: 'cp-titles' },
        h('h3', null, c.label || 'Контрольна точка'),
        h('p', { class: 'small muted' }, `${cpRange(c)} · ${cpWhen(c, today)}`)),
      onDelete && h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Видалити «${c.label || 'точку'}»`, onclick: () => onDelete(c) }, icon('trash'))),
    segmentLine(c));
}

function openCheckpointForm(store) {
  const today = todayKey();
  const draft = { label: '', date: today, to: today, multi: false };
  openSheet({
    title: 'Нова контрольна точка',
    subtitle: 'Дата, коли хочеш озирнутися й підбити підсумок',
    render(body, sheet) {
      const label = h('input', { class: 'input', type: 'text', maxLength: CHECKPOINT_LABEL_MAX, placeholder: 'Назва, напр. Кінець місяця', oninput: (e) => { draft.label = e.target.value; } });
      const to = h('input', { class: 'input', type: 'date', value: draft.to, onchange: (e) => { draft.to = e.target.value; } });
      const date = h('input', { class: 'input', type: 'date', value: draft.date, onchange: (e) => { draft.date = e.target.value; if (draft.to < draft.date) { draft.to = draft.date; to.value = draft.to; } } });
      const toField = h('label', { class: 'field', hidden: true }, h('span', { class: 'field-label' }, 'До (включно)'), to);
      const multi = h('input', { type: 'checkbox', onchange: (e) => { draft.multi = e.target.checked; toField.hidden = !draft.multi; } });

      body.append(h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Назва'), label),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Дата'), date),
        h('label', { class: 'check-row' }, multi, 'Кілька днів'),
        toField),
      h('div', { class: 'sheet-actions' }, h('button', {
        type: 'button',
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          const end = draft.multi ? draft.to : null;
          if (!isValidKey(draft.date) || (end !== null && !isValidKey(end))) { toast('Вкажи дату', { type: 'error' }); return; }
          if (end !== null && end < draft.date) { toast('Кінець раніше за початок', { type: 'error' }); return; }
          try {
            store.updateSettings((s) => {
              s.checkpoints.push({
                id: `c${Date.now().toString(36)}`,
                date: draft.date,
                to: end && end > draft.date ? end : null,
                label: draft.label.trim().slice(0, CHECKPOINT_LABEL_MAX),
              });
              return s;
            });
          } catch (err) {
            toast(err.message, { type: 'error' });
            return;
          }
          haptic.light();
          sheet.close();
          toast('Контрольну точку додано');
        },
      }, 'Додати')));
    },
  });
}

export function openCheckpoints(store) {
  openScreen({
    title: 'Контрольні точки',
    render(body, screen) {
      const paint = () => {
        const today = todayKey();
        const list = checkpointTimeline(store.settings, store.entries, today);
        const del = async (c) => {
          const ok = await confirmDialog({ title: 'Видалити точку?', text: `${c.label || 'Контрольна точка'}, ${cpRange(c)}. Записи не зміняться.`, ok: 'Видалити', danger: true });
          if (!ok) return;
          store.updateSettings((s) => { s.checkpoints = s.checkpoints.filter((x) => x.id !== c.id); return s; });
          toast('Точку видалено');
        };
        body.replaceChildren(
          h('p', { class: 'hint' }, 'Дати, коли варто зупинитися й подивитися на прогрес. Підсумок рахується від попередньої точки (або від початку відстеження).'),
          h('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: () => openCheckpointForm(store) }, icon('plus'), 'Додати точку'),
          list.length
            ? h('div', { class: 'stack' }, list.map((c) => checkpointCard(c, today, { onDelete: del })))
            : h('p', { class: 'empty-line muted' }, 'Контрольних точок немає.'),
        );
      };
      paint();
      screen.onCleanup(store.subscribe(paint));
    },
  });
}
