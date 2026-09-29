// Вкладка «Налаштування» (SPEC §5.5): розклад, паузи, контрольні точки, про застосунок.
import { addDays, diffDays, fmtDay, isValidKey, plural, todayKey, WEEKDAYS, WEEKDAYS_CAP } from '../dates.js';
import { HABIT_IDS, HABITS, scheduledOn } from '../habits.js';
import { PROGRAM_DAYS } from '../modules.js';
import { daysFor, DEFAULT_DAYS, DEFAULT_WORKOUTS, missesInRange, PAUSE_LABEL_MAX, pauseOn } from '../schedule.js';
import { getPreview, SEASONS, seasonOf, setPreview, timeOfDay, TIMES } from '../seasons.js';
import { KEYS_MAX } from '../storage.js';
import { haptic } from '../tg.js';
import { backupText, buildBackup } from '../backup.js';
import { achievementsSummary, openAchievements } from './achievements.js';
import { cpRange, cpWhen, nextCheckpoint, openCheckpoints } from './checkpoints.js';
import { h, icon } from './dom.js';
import { openScreen } from './screen.js';
import { confirmDialog, openSheet, toast } from './sheet.js';

export const APP_VERSION = '0.4.2 · Етап 2б';

function scheduleSummary(settings) {
  const days = daysFor(settings, todayKey());
  return HABIT_IDS.map((hb) => {
    const on = days.map((d, i) => (scheduledOn(d, hb) ? WEEKDAYS_CAP[i] : null)).filter(Boolean);
    return on.length && `${on.join(', ')} — ${HABITS[hb].name.toLowerCase()}`;
  }).filter(Boolean).join(' · ') || 'порожній';
}

function pausesSummary(settings) {
  const now = pauseOn(settings, todayKey());
  if (now) return `зараз: ${now.label || 'пауза'}`;
  const n = settings.pauses.length;
  return n ? `${n} ${plural(n, ['пауза', 'паузи', 'пауз'])}` : 'немає';
}

function checkpointsSummary(store) {
  const c = nextCheckpoint(store.settings, store.entries);
  if (c) return `${c.label || 'наступна'}: ${cpRange(c)}, ${cpWhen(c, todayKey())}`;
  const n = store.settings.checkpoints.length;
  return n ? 'усі вже минули' : 'немає';
}

function achievementsLine(store) {
  const s = achievementsSummary(store);
  return `${s.got} з ${s.total}${s.last ? ` · останнє: ${s.last.name}` : ''}`;
}

function row({ icon: ic, title, sub, onClick, soon }) {
  return h('button', { type: 'button', class: 'row', disabled: !!soon, onclick: onClick },
    h('span', { class: 'row-ic' }, icon(ic)),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub && h('span', { class: 'row-sub' }, sub)),
    soon ? h('span', { class: 'tag' }, soon) : icon('chevronR', 'row-chev'));
}

export function renderSettings(view, ctx) {
  const { store } = ctx;
  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Налаштування')),
    h('div', { class: 'page-body' },
      h('div', { class: 'group' },
        row({ icon: 'calendar', title: 'Розклад', sub: scheduleSummary(store.settings), onClick: () => openSchedule(store) }),
        row({ icon: 'pause', title: 'Паузи', sub: pausesSummary(store.settings), onClick: () => openPauses(store) })),
      h('div', { class: 'group' },
        row({ icon: 'flag', title: 'Контрольні точки', sub: checkpointsSummary(store), onClick: () => openCheckpoints(store) }),
        row({ icon: 'medal', title: 'Досягнення', sub: achievementsLine(store), onClick: () => openAchievements(store) }),
        row({ icon: 'copy', title: 'Скопіювати дані (JSON)', sub: 'резервна копія всіх ключів у буфер обміну', onClick: () => openBackup(store) }),
        row({ icon: 'swap', title: 'Імпорт і експорт', sub: 'CSV, JSON, XLSX', soon: 'Етап 3' })),
      h('div', { class: 'group' },
        row({ icon: 'info', title: 'Про застосунок', sub: store.mode === 'cloud' ? 'дані в хмарі Telegram' : 'дані в цьому браузері', onClick: () => openAbout(ctx) }))),
  );
}

// ——— Резервна копія ———

/**
 * Скопіювати текст: Clipboard API → execCommand('copy') через прихований textarea → false (тоді — вручну).
 * Викликати прямо з обробника тапу: деякі WebView (iOS) дозволяють буфер лише в межах жесту.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* далі — запасний шлях */ }
  const ta = h('textarea', { readonly: '', 'aria-hidden': 'true', style: { position: 'fixed', top: '0', left: '-9999px', opacity: '0' } });
  ta.value = text;
  document.body.append(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch { ok = false; }
  ta.remove();
  return ok;
}

const kb = (n) => (n < 1024 ? `${n} Б` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',')} КБ`);

function openBackup(store) {
  openSheet({
    title: 'Резервна копія',
    subtitle: 'Усі ключі сховища одним JSON',
    render(body, sheet) {
      let text = null;
      const info = h('p', { class: 'small muted' }, 'Читаю дані…');
      const manual = h('div', { class: 'stack-s', hidden: true });
      const copy = h('button', {
        type: 'button',
        class: 'btn btn-primary btn-wide',
        disabled: true,
        onclick: async () => {
          if (!text) return;
          if (await copyText(text)) {
            haptic.success();
            toast('Скопійовано в буфер обміну');
            sheet.close();
            return;
          }
          // Буфер недоступний (WebView без дозволу): показуємо текст — виділити й скопіювати вручну.
          const ta = h('textarea', { class: 'input backup-text', readonly: '', rows: 8 });
          ta.value = text;
          ta.addEventListener('focus', () => ta.select());
          manual.replaceChildren(
            h('p', { class: 'small' }, 'Автоматично скопіювати не вдалося. Текст нижче вже виділено — натисни «Копіювати» в меню (або утримуй палець на тексті).'),
            ta,
            h('button', { type: 'button', class: 'btn btn-soft btn-wide', onclick: () => { ta.focus(); ta.select(); } }, 'Виділити все'));
          manual.hidden = false;
          ta.focus();
          ta.select();
        },
      }, icon('copy'), 'Скопіювати');

      body.append(
        info,
        h('p', { class: 'hint' }, 'Це лише копія: встав її в нотатки чи файл. Відновлення з копії зʼявиться разом з імпортом.'),
        h('div', { class: 'sheet-actions' }, copy),
        manual);

      store.snapshot().then((values) => {
        if (sheet.closed) return;
        const backup = buildBackup(values, { app: APP_VERSION, at: new Date().toISOString(), storage: store.mode });
        text = backupText(backup);
        info.textContent = `${backup.keys} ${plural(backup.keys, ['ключ', 'ключі', 'ключів'])} · ${kb(text.length)}`;
        copy.disabled = false;
      }).catch((err) => {
        info.textContent = `Не вдалося прочитати дані: ${err?.message || err}`;
      });
    },
  });
}

// ——— Розклад ———

function openSchedule(store) {
  openScreen({
    title: 'Розклад',
    render(body, screen) {
      const days = structuredClone(daysFor(store.settings, todayKey()));
      const workouts = { ...store.settings.workouts };

      const table = h('div', { class: 'card sched' });
      const paintTable = () => {
        table.replaceChildren(
          h('div', { class: 'sched-row sched-headrow' }, h('span'), h('span', null, 'Тренування · День'), h('span', null, 'Англ.')),
          ...days.map((d, i) => h('div', { class: `sched-row ${i > 4 ? 'we' : ''}` },
            h('span', { class: 'sched-day', title: WEEKDAYS[i] }, WEEKDAYS_CAP[i]),
            h('div', { class: 'mini-seg habit-train', role: 'radiogroup', 'aria-label': `${WEEKDAYS[i]}: тренування` },
              [0, ...PROGRAM_DAYS].map((n) => h('button', {
                type: 'button',
                role: 'radio',
                class: d.train === n ? 'on' : '',
                'aria-checked': String(d.train === n),
                'aria-label': n ? `День ${n}` : 'Без тренування',
                onclick: () => { d.train = n; haptic.select(); paintTable(); },
              }, n ? String(n) : '—'))),
            h('button', {
              type: 'button',
              class: `eng-toggle habit-eng ${d.eng ? 'on' : ''}`,
              'aria-pressed': String(d.eng),
              'aria-label': `${WEEKDAYS[i]}: англійська`,
              onclick: () => { d.eng = !d.eng; haptic.select(); paintTable(); },
            }, d.eng ? icon('check') : icon('plus')))),
        );
      };
      paintTable();

      const focus = h('div', { class: 'card stack-s' },
        PROGRAM_DAYS.map((n) => h('label', { class: 'field' },
          h('span', { class: 'field-label' }, `День ${n}`),
          h('input', {
            class: 'input',
            type: 'text',
            maxLength: 80,
            value: workouts[n],
            oninput: (e) => { workouts[n] = e.target.value; },
          }))));

      const save = h('button', {
        type: 'button',
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          const today = todayKey();
          try {
            store.updateSettings((s) => {
              const last = s.schedule.at(-1);
              const same = JSON.stringify(last.days) === JSON.stringify(days);
              if (last.from >= today) last.days = days;
              else if (!same) s.schedule.push({ from: today, days });
              for (const n of PROGRAM_DAYS) s.workouts[n] = workouts[n].trim() || DEFAULT_WORKOUTS[n];
              return s;
            });
            haptic.success();
            toast('Розклад збережено');
            screen.close();
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }, 'Зберегти');

      const reset = h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-wide',
        onclick: () => {
          days.splice(0, 7, ...structuredClone(DEFAULT_DAYS));
          paintTable();
          toast('Повернуто розклад за замовчуванням — не забудь зберегти');
        },
      }, 'Розклад за замовчуванням');

      body.append(
        h('p', { class: 'hint' }, 'Зміни діють із сьогодні. Минулі дні лишаються за старим розкладом, тож статистика не зʼїде.'),
        table,
        h('h2', { class: 'section-title' }, 'Фокус тренувань'),
        focus,
        h('div', { class: 'screen-actions' }, save, reset),
      );
    },
  });
}

// ——— Паузи ———

function openPauseForm(store) {
  const today = todayKey();
  const draft = { label: '', from: today, to: today, open: false };
  openSheet({
    title: 'Нова пауза',
    subtitle: 'Дні паузи не рахуються пропусками і не ламають серію',
    render(body, sheet) {
      const label = h('input', { class: 'input', type: 'text', maxLength: PAUSE_LABEL_MAX, placeholder: 'Мітка, напр. Хвороба', oninput: (e) => { draft.label = e.target.value; paintQuick(); } });
      const quick = h('div', { class: 'suggest' });
      const paintQuick = () => quick.replaceChildren(...['Хвороба', 'Поїздка', 'Відпочинок', 'Травма'].map((t) => h('button', {
        type: 'button',
        class: `suggest-chip ${draft.label === t ? 'on' : ''}`,
        onclick: () => { draft.label = t; label.value = t; haptic.select(); paintQuick(); },
      }, t)));
      paintQuick();
      const from = h('input', { class: 'input', type: 'date', value: draft.from, onchange: (e) => { draft.from = e.target.value; if (draft.to < draft.from) { draft.to = draft.from; to.value = draft.to; } } });
      const to = h('input', { class: 'input', type: 'date', value: draft.to, onchange: (e) => { draft.to = e.target.value; } });
      const toField = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'До (включно)'), to);
      const open = h('input', { type: 'checkbox', onchange: (e) => { draft.open = e.target.checked; toField.hidden = draft.open; } });

      body.append(h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Мітка'), label, quick),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'З'), from),
        toField,
        h('label', { class: 'check-row' }, open, 'Ще не знаю, коли закінчиться')),
      h('div', { class: 'sheet-actions' }, h('button', {
        type: 'button',
        class: 'btn btn-primary btn-wide',
        onclick: async () => {
          if (!isValidKey(draft.from) || (!draft.open && !isValidKey(draft.to))) { toast('Вкажи дати', { type: 'error' }); return; }
          if (!draft.open && draft.to < draft.from) { toast('Кінець раніше за початок', { type: 'error' }); return; }
          const until = draft.open ? null : draft.to;
          try {
            store.updateSettings((s) => {
              s.pauses.push({ id: `p${Date.now().toString(36)}`, from: draft.from, to: until, label: draft.label.trim() });
              return s;
            });
          } catch (err) {
            toast(err.message, { type: 'error' });
            return;
          }
          haptic.light();
          sheet.close();
          // Пауза має пріоритет над пропусками. Якщо в періоді вже є пропуски — питаємо, що з ними робити.
          const misses = missesInRange(store.entries, draft.from, until);
          if (!misses.length) { toast('Паузу додано'); return; }
          const n = misses.length;
          const list = misses.slice(0, 4).map((m) => `${fmtDay(m.date)} — ${HABITS[m.habit].name.toLowerCase()}`).join(', ') + (n > 4 ? '…' : '');
          const convert = await confirmDialog({
            title: 'Перетворити пропуски на паузу?',
            text: `У цьому періоді ${n} ${plural(n, ['пропуск', 'пропуски', 'пропусків'])}: ${list}. Якщо так — записи пропусків видаляться і ці дні стануть звичайними днями паузи. Якщо ні — записи залишаться, але поки діє пауза, не рахуються.`,
            ok: 'Перетворити',
            cancel: 'Залишити',
          });
          if (convert) {
            misses.forEach((m) => store.deleteEntry(m.date, m.habit));
            toast(`Паузу додано, ${n} ${plural(n, ['пропуск перетворено', 'пропуски перетворено', 'пропусків перетворено'])}`);
          } else {
            toast('Паузу додано, записи пропусків залишено');
          }
        },
      }, 'Додати паузу')));
    },
  });
}

function pauseRange(p) {
  if (!p.to) return `з ${fmtDay(p.from)} · триває`;
  const n = diffDays(p.from, p.to) + 1;
  return `${p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} — ${fmtDay(p.to)}`} · ${n} ${plural(n, ['день', 'дні', 'днів'])}`;
}

function openPauses(store) {
  openScreen({
    title: 'Паузи',
    render(body, screen) {
      const paint = () => {
        const today = todayKey();
        const active = pauseOn(store.settings, today);
        const parts = [h('p', { class: 'hint' }, 'Хвороба, поїздка, відпочинок. Дні паузи не є пропусками і не ламають серію.')];
        if (active) {
          parts.push(h('div', { class: 'card pause-active' },
            h('div', { class: 'pause-note' }, icon('pause'), h('div', null, h('strong', null, `Зараз пауза${active.label ? `: ${active.label}` : ''}`), h('span', { class: 'small muted' }, pauseRange(active)))),
            h('button', {
              type: 'button',
              class: 'btn btn-soft btn-wide',
              onclick: () => {
                store.updateSettings((s) => {
                  const p = s.pauses.find((x) => x.id === active.id);
                  if (p.from >= today) s.pauses = s.pauses.filter((x) => x.id !== active.id);
                  else p.to = addDays(today, -1);
                  return s;
                });
                haptic.success();
                toast('З поверненням! Сьогодні вже звичайний день 💪');
              },
            }, 'Я повернувся — завершити паузу')));
        }
        parts.push(h('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: () => openPauseForm(store) }, icon('plus'), 'Додати паузу'));
        if (store.settings.pauses.length) {
          parts.push(h('div', { class: 'card list-card' }, store.settings.pauses.map((p) => h('div', { class: 'list-row' },
            h('span', { class: 'pause-ic' }, icon('pause')),
            h('div', { class: 'list-main' }, h('strong', null, p.label || 'Пауза'), h('span', { class: 'small muted' }, pauseRange(p))),
            h('button', {
              type: 'button',
              class: 'icon-btn',
              'aria-label': `Видалити паузу ${p.label}`,
              onclick: async () => {
                const ok = await confirmDialog({ title: 'Видалити паузу?', text: `${p.label || 'Пауза'}, ${pauseRange(p)}. Ці дні знову рахуватимуться за розкладом.`, ok: 'Видалити', danger: true });
                if (!ok) return;
                store.updateSettings((s) => { s.pauses = s.pauses.filter((x) => x.id !== p.id); return s; });
                toast('Паузу видалено');
              },
            }, icon('trash'))))));
        } else {
          parts.push(h('p', { class: 'empty-line muted' }, 'Пауз ще не було.'));
        }
        body.replaceChildren(...parts);
      };
      paint();
      screen.onCleanup(store.subscribe(paint));
    },
  });
}

// ——— Про застосунок ———

function openAbout({ store }) {
  openScreen({
    title: 'Про застосунок',
    render(body) {
      const stats = store.stats();
      const cloud = store.mode === 'cloud';
      const info = (k, v) => h('div', { class: 'drow' }, h('dt', null, k), h('dd', null, v));

      const now = new Date();
      const seasonSeg = h('div', { class: 'choices choices-wrap' });
      const todSeg = h('div', { class: 'choices choices-wrap' });
      const garlandBtn = h('button', { type: 'button', class: 'choice choice-sm' }, '🎄 Гірлянда');
      const paintPreview = () => {
        const preview = getPreview();
        const update = (patch) => { setPreview({ ...getPreview(), ...patch }); haptic.select(); paintPreview(); };
        const mk = (dict, key, container) => container.replaceChildren(...[['', 'Авто'], ...Object.entries(dict).map(([k, v]) => [k, v.emoji ? `${v.emoji} ${v.name}` : v.name])].map(([k, text]) => h('button', {
          type: 'button',
          class: `choice choice-sm ${(preview[key] || '') === k ? 'on' : ''}`,
          onclick: () => update({ [key]: k || null }),
        }, text)));
        mk(SEASONS, 'season', seasonSeg);
        mk(TIMES, 'tod', todSeg);
        garlandBtn.classList.toggle('on', preview.garland);
        garlandBtn.onclick = () => update({ garland: !preview.garland });
      };
      paintPreview();

      body.append(
        h('div', { class: 'card about-hero' },
          h('div', { class: 'about-logo' }, h('img', { src: 'assets/icon.svg', alt: '', width: 56, height: 56 })),
          h('div', null, h('h2', null, 'Habit Tracker'), h('p', { class: 'small muted' }, `Тренування + англійська · версія ${APP_VERSION}`))),
        h('h2', { class: 'section-title' }, 'Дані'),
        h('dl', { class: 'card details' },
          info('Сховище', cloud ? 'Telegram CloudStorage — синхронізується між iPhone і Desktop' : store.mode === 'memory' ? 'тимчасове (сховище браузера недоступне)' : 'localStorage — лише цей браузер'),
          info('Записів', String(stats.entries)),
          info('Ключів', `${stats.keys} із ${KEYS_MAX}`),
          info('Відстеження з', fmtDay(store.settings.startDate, true)),
          stats.broken ? info('Пошкоджених записів', String(stats.broken)) : null),
        h('h2', { class: 'section-title' }, 'Превʼю дизайну'),
        h('div', { class: 'card stack-s' },
          h('p', { class: 'small muted' }, `Насправді зараз: ${SEASONS[seasonOf(now)].name.toLowerCase()}, ${TIMES[timeOfDay(now)].name.toLowerCase()}. Превʼю діє на «Сьогодні» й інші вкладки, крім календаря (він завжди в палітрі місяця, що переглядається). Нічого не зберігається: вийти можна кнопкою «Вийти» вгорі або перезапуском.`),
          h('span', { class: 'field-label' }, 'Сезон'), seasonSeg,
          h('span', { class: 'field-label' }, 'Час доби'), todSeg,
          h('span', { class: 'field-label' }, 'Гірлянда (зима, ніч; насправді 15.12–15.01)'), h('div', { class: 'choices choices-wrap' }, garlandBtn)),
      );

      if (!cloud) {
        body.append(
          h('h2', { class: 'section-title' }, 'Браузерний режим'),
          h('div', { class: 'card stack-s' },
            h('p', { class: 'small muted' }, 'Стерти всі дані в цьому браузері й почати з початкової історії. На дані в Telegram не впливає.'),
            h('button', {
              type: 'button',
              class: 'btn btn-danger-ghost btn-wide',
              onclick: async () => {
                const ok = await confirmDialog({ title: 'Стерти дані браузера?', text: 'Усі записи й налаштування в цьому браузері буде видалено.', ok: 'Стерти', danger: true });
                if (!ok) return;
                await store.wipe();
                toast('Дані стерто');
              },
            }, icon('trash'), 'Стерти дані браузера')),
        );
      }
    },
  });
}
