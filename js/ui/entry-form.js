// Форми записів: покрокова (одразу після відмітки), повний редактор і перегляд деталей.
import { fmtShort } from '../dates.js';
import { DUR, ENERGY, HABITS, LIMITS, REASONS, durLabel, energyOf, reasonLabel } from '../entry.js';
import { planFor } from '../schedule.js';
import { haptic } from '../tg.js';
import { h, icon } from './dom.js';
import { confirmDialog, openSheet, toast } from './sheet.js';

// ——— Підписи ———

export function trainDayOf(store, date, entry) {
  return entry?.day ?? planFor(store.settings, date).trainDay;
}

export function habitTitle(store, habit, date, entry) {
  if (habit !== 'train') return HABITS.eng.name;
  const day = trainDayOf(store, date, entry);
  return day ? `Тренування · День ${day}` : 'Тренування';
}

export function habitSubtitle(store, habit, date, entry) {
  if (habit !== 'train') return 'Заняття з тютором';
  const day = trainDayOf(store, date, entry);
  return day ? store.settings.workouts[day] : 'Позапланове тренування';
}

/** Короткі чипи-підсумки запису для карток. */
export function entryChips(habit, e) {
  const out = [];
  if (e.s === 'miss') {
    e.reasons.forEach((r) => out.push({ text: reasonLabel(r) }));
  } else if (habit === 'train') {
    if (e.dur) out.push({ text: durLabel(e.dur), icon: 'clock' });
    if (e.back === true) out.push({ text: 'Спина', cls: 'chip-back' });
    if (e.back === false) out.push({ text: 'Спина ок' });
  } else {
    if (e.topic) out.push({ text: e.topic, cls: 'chip-topic' });
    if (e.hw?.text) out.push({ text: e.hw.done ? 'Домашка ✓' : 'Домашка', cls: e.hw.done ? '' : 'chip-hw' });
  }
  const en = energyOf(e.energy);
  if (en) out.push({ text: `${en.emoji} ${en.label}` });
  if (e.bonus) out.push({ text: '+ бонус', cls: 'chip-bonus' });
  return out;
}

export function chipRow(chips) {
  if (!chips.length) return null;
  return h('div', { class: 'mini-chips' }, chips.map((c) => h('span', { class: `mini-chip ${c.cls || ''}` }, c.icon && icon(c.icon), c.text)));
}

/** Повний перелік полів запису (для шторки дня). */
export function entryDetails(habit, e) {
  const rows = [];
  const row = (label, value, cls = '') => rows.push(h('div', { class: `drow ${cls}` }, h('dt', null, label), h('dd', null, value)));
  if (e.s === 'miss') {
    row('Причини', e.reasons.length ? e.reasons.map(reasonLabel).join(', ') : '—');
  } else if (habit === 'train') {
    row('Тривалість', durLabel(e.dur) || '—');
    row('Спина', e.back === true ? 'був дискомфорт' : e.back === false ? 'все добре' : '—', e.back ? 'is-back' : '');
  } else {
    row('Тема', e.topic || '—');
    if (e.hw) {
      row('Домашка', h('span', null, e.hw.text || '—',
        h('span', { class: `hw-state ${e.hw.done ? 'ok' : ''}` }, e.hw.done === true ? ' · виконав' : e.hw.done === false ? ' · ще ні' : '')));
    } else {
      row('Домашка', '—');
    }
  }
  const en = energyOf(e.energy);
  row('Енергія', en ? `${en.emoji} ${en.label}` : '—');
  if (e.comment) row('Коментар', e.comment, 'is-comment');
  return h('dl', { class: 'details' }, rows);
}

// ——— Поля ———

function choice({ options, value, multi = false, onChange, className = '' }) {
  let cur = multi ? new Set(value || []) : value ?? null;
  const wrap = h('div', { class: `choices ${className}`.trim(), role: multi ? 'group' : 'radiogroup' });
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', class: 'choice', 'aria-label': o.aria || null, title: o.aria || null }, o.content ?? o.label);
    b.addEventListener('click', () => {
      haptic.select();
      if (multi) {
        if (cur.has(o.v)) cur.delete(o.v);
        else cur.add(o.v);
        paint();
        onChange([...cur]);
      } else {
        cur = cur === o.v ? null : o.v;
        paint();
        onChange(cur);
      }
    });
    return b;
  });
  function paint() {
    options.forEach((o, i) => {
      const on = multi ? cur.has(o.v) : cur === o.v;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute(multi ? 'aria-pressed' : 'aria-checked', String(on));
      if (!multi) btns[i].setAttribute('role', 'radio');
    });
  }
  paint();
  wrap.append(...btns);
  return wrap;
}

function textArea({ value, max, placeholder, onInput, rows = 4 }) {
  const counter = h('span', { class: 'counter' });
  const ta = h('textarea', { class: 'input', rows, maxLength: max, placeholder, value: value || '' });
  const paint = () => { counter.textContent = `${ta.value.length}/${max}`; };
  ta.addEventListener('input', () => { paint(); onInput(ta.value); });
  ta.addEventListener('focus', () => setTimeout(() => ta.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300));
  paint();
  return h('div', { class: 'field' }, ta, counter);
}

const FIELDS = {
  day: {
    q: 'Який День програми?',
    auto: true,
    render: (ctx) => choice({
      options: [1, 2, 3].map((n) => ({ v: n, label: `День ${n}` })),
      value: ctx.draft.day,
      onChange: (v) => ctx.set({ day: v }, true),
    }),
  },
  dur: {
    q: 'Скільки тривало?',
    auto: true,
    render: (ctx) => choice({ options: DUR, value: ctx.draft.dur, onChange: (v) => ctx.set({ dur: v }, true) }),
  },
  back: {
    q: 'Був дискомфорт у спині?',
    auto: true,
    render: (ctx) => choice({
      options: [{ v: false, label: 'Ні, все добре' }, { v: true, label: 'Так, був' }],
      value: ctx.draft.back,
      className: 'choices-back',
      onChange: (v) => ctx.set({ back: v }, true),
    }),
  },
  energy: {
    q: 'Як з енергією?',
    auto: true,
    render: (ctx) => choice({
      options: ENERGY.map((e) => ({ v: e.v, aria: e.label, content: [h('span', { class: 'emoji' }, e.emoji), h('small', null, e.label)] })),
      value: ctx.draft.energy,
      className: 'choices-energy',
      onChange: (v) => ctx.set({ energy: v }, true),
    }),
  },
  reasons: {
    q: 'Що завадило?',
    hint: 'Можна кілька',
    render: (ctx) => choice({ options: REASONS, value: ctx.draft.reasons, multi: true, onChange: (v) => ctx.set({ reasons: v }) }),
  },
  topic: {
    q: 'Тема заняття',
    render(ctx) {
      const input = h('input', { class: 'input', type: 'text', maxLength: LIMITS.topic, placeholder: 'напр. Present Perfect', value: ctx.draft.topic || '', enterkeyhint: 'next' });
      const sugg = h('div', { class: 'suggest' });
      const all = ctx.store.topics();
      const paint = () => {
        const q = input.value.trim().toLowerCase();
        const list = all.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q))).slice(0, 6);
        sugg.replaceChildren(...list.map((t) => h('button', {
          type: 'button',
          class: 'suggest-chip',
          onclick: () => { input.value = t; ctx.set({ topic: t }); paint(); haptic.select(); },
        }, t)));
      };
      input.addEventListener('input', () => { ctx.set({ topic: input.value }); paint(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.next?.(); } });
      paint();
      return h('div', { class: 'field' }, input, sugg);
    },
  },
  hw: {
    q: 'Домашнє завдання',
    render(ctx) {
      const hw = ctx.draft.hw || { text: '', done: null };
      const update = (patch) => { Object.assign(hw, patch); ctx.set({ hw: { ...hw } }); };
      return h('div', { class: 'stack-s' },
        textArea({ value: hw.text, max: LIMITS.hw, rows: 3, placeholder: 'Що задав тютор', onInput: (v) => update({ text: v }) }),
        h('div', { class: 'field-label' }, 'Виконав?'),
        choice({
          options: [{ v: false, label: 'Ще ні' }, { v: true, label: 'Виконав' }],
          value: hw.done,
          onChange: (v) => update({ done: v }),
        }));
    },
  },
  comment: {
    q: 'Коментар',
    render: (ctx) => textArea({
      value: ctx.draft.comment,
      max: LIMITS.comment,
      placeholder: ctx.draft.s === 'miss' ? 'Що сталося? (необовʼязково)' : 'Як пройшло? (необовʼязково)',
      onInput: (v) => ctx.set({ comment: v }),
    }),
  },
};

function stepsFor(habit, s, bonus) {
  if (s === 'miss') return ['reasons', 'energy', 'comment'];
  if (habit === 'train') return [...(bonus ? ['day'] : []), 'dur', 'back', 'energy', 'comment'];
  return ['topic', 'hw', 'energy', 'comment'];
}

// ——— Відмітка + покрокова форма ———

/**
 * Показати сторінку форми: у новій шторці або (якщо є host — ctx сторінки чи шторка)
 * замість поточного вмісту тієї ж шторки.
 */
function showPage(page, host, { replace = false } = {}) {
  if (!host) return openSheet(page);
  if (replace) host.replace(page);
  else host.push(page);
  return host;
}

/** Ставить статус (обовʼязкове поле) і відкриває покрокову форму опційних полів. */
export function markAndAsk(store, date, habit, s, extra = {}, host = null, opts = {}) {
  let entry;
  try {
    entry = store.saveEntry(date, habit, { s, ...extra, ts: new Date().toISOString() });
  } catch (err) {
    toast(err.message, { type: 'error' });
    return;
  }
  haptic.light();
  openStepForm(store, date, habit, entry, host, opts);
}

export function openStepForm(store, date, habit, entry, host = null, opts = {}) {
  const steps = stepsFor(habit, entry.s, entry.bonus);
  const draft = structuredClone(entry);
  let i = 0;
  let saveTimer = null;
  let pendingPatch = {};

  const flush = () => {
    clearTimeout(saveTimer);
    if (!Object.keys(pendingPatch).length) return;
    const patch = pendingPatch;
    pendingPatch = {};
    if (!store.getEntry(date, habit)) return; // запис видалили — нічого не відновлюємо
    try { store.saveEntry(date, habit, patch); } catch (err) { toast(err.message, { type: 'error' }); }
  };

  const statusText = entry.s === 'done' ? (entry.bonus ? 'бонус ✓' : 'виконано ✓') : 'пропуск';
  return showPage({
    title: habitTitle(store, habit, date, entry),
    subtitle: `${fmtShort(date)} · ${statusText}`,
    className: `sheet-steps habit-${habit}`,
    onLeave: flush,
    render(body, sheet) {
      const progress = h('div', { class: 'progress', 'aria-hidden': 'true' }, steps.map(() => h('i')));
      const stage = h('div', { class: 'step-stage' });
      const skipBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Пропустити');
      const nextBtn = h('button', { type: 'button', class: 'btn btn-primary' });
      body.append(progress, stage, h('div', { class: 'sheet-actions' }, skipBtn, nextBtn));

      const ctx = {
        store,
        draft,
        set(patch, auto = false) {
          Object.assign(draft, patch);
          Object.assign(pendingPatch, patch);
          clearTimeout(saveTimer);
          if (auto) {
            flush();
            const at = i;
            if (Object.values(patch)[0] !== null) setTimeout(() => { if (i === at && !sheet.closed) go(i + 1); }, 240);
          } else {
            saveTimer = setTimeout(flush, 500);
          }
          paintButtons();
        },
        next: () => go(i + 1),
      };

      function paintButtons() {
        const last = i === steps.length - 1;
        nextBtn.textContent = last ? 'Готово' : 'Далі';
        skipBtn.textContent = last ? 'Закрити' : 'Пропустити';
      }

      function go(n) {
        flush();
        if (n >= steps.length) {
          sheet.close();
          toast(entry.s === 'done' ? 'Записано. Так тримати! 💪' : 'Записано. Наступного разу вийде 🙌');
          return;
        }
        i = n;
        const f = FIELDS[steps[i]];
        [...progress.children].forEach((el, j) => el.classList.toggle('on', j <= i));
        stage.replaceChildren(h('div', { class: 'step step-in' },
          h('h3', { class: 'step-q' }, f.q),
          f.hint && h('p', { class: 'step-hint' }, f.hint),
          f.render(ctx)));
        paintButtons();
      }

      skipBtn.addEventListener('click', () => {
        if (i === steps.length - 1) { sheet.close(); return; }
        go(i + 1);
      });
      nextBtn.addEventListener('click', () => go(i + 1));
      go(0);
    },
  }, host, opts);
}

// ——— Повний редактор ———

export function openEntryEditor(store, date, habit, host = null) {
  const existing = store.getEntry(date, habit);
  if (!existing) return null;
  const draft = structuredClone(existing);

  return showPage({
    title: habitTitle(store, habit, date, existing),
    subtitle: fmtShort(date) + (existing.bonus ? ' · бонус' : ''),
    className: `sheet-editor habit-${habit}`,
    render(body, sheet) {
      const fieldsBox = h('div', { class: 'editor-fields' });
      const ctx = { store, draft, set: (patch) => Object.assign(draft, patch) };

      // Для бонусу «не виконав» не має сенсу — перемикач статусу ховаємо.
      const statusSwitch = existing.bonus && existing.s === 'done' ? null : h('div', { class: 'segmented' },
        ['done', 'miss'].map((s) => h('button', {
          type: 'button',
          class: 'seg',
          'data-s': s,
          onclick: () => { draft.s = s; haptic.select(); paint(); },
        }, s === 'done' ? 'Виконав' : 'Не виконав')));

      function paint() {
        statusSwitch?.querySelectorAll('.seg').forEach((b) => b.classList.toggle('on', b.dataset.s === draft.s));
        const keys = stepsFor(habit, draft.s, habit === 'train' && existing.bonus);
        fieldsBox.replaceChildren(...keys.map((k) => h('section', { class: 'editor-field' },
          h('h3', { class: 'field-title' }, FIELDS[k].q),
          FIELDS[k].render(ctx))));
      }
      paint();

      const save = h('button', {
        type: 'button',
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          try {
            store.saveEntry(date, habit, draft);
            haptic.light();
            toast('Зміни збережено');
            sheet.close();
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }, 'Зберегти');
      const del = h('button', {
        type: 'button',
        class: 'btn btn-danger-ghost btn-wide',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Видалити запис?',
            text: `${HABITS[habit].name}, ${fmtShort(date)}. Цю дію не можна скасувати.`,
            ok: 'Видалити',
            danger: true,
          });
          if (!ok) return;
          store.deleteEntry(date, habit);
          haptic.warning();
          toast('Запис видалено');
          sheet.close();
        },
      }, icon('trash'), 'Видалити запис');

      body.append(statusSwitch || '', fieldsBox, h('div', { class: 'sheet-actions stacked' }, save, del));
    },
  }, host);
}
