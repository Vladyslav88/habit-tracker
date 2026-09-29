// Реєстр звичок (SPEC §4, етап 4). Поки лише дві вбудовані — тренування й англійська;
// власні звички зʼявляться на наступних етапах і прийдуть сюди ж. Решта коду не порівнює id
// зі 'train' / 'eng', а питає реєстр: які звички є, яка в них форма, які модулі (js/modules.js).
import { isValidKey } from './dates.js';
import { MODULE_IDS, MODULES } from './modules.js';

/**
 * Опис звички:
 * - shape — форма в календарі, легенді, кільцях (коло / заокруглений квадрат);
 * - forms / ofForms — відмінки для «3 тренування» / «2 з 5 тренувань»;
 * - modules — додаткові поля запису (порядок = порядок полів у записі й кроків форми);
 * - subtitle — підпис картки; offPlan — підпис, коли День програми невідомий (бонус).
 * Розклад вбудованих звичок — у settings.schedule: days[i][id] (train — номер Дня 0–3, eng — true/false).
 */
export const HABITS = {
  train: {
    id: 'train',
    name: 'Тренування',
    icon: 'dumbbell',
    shape: 'circle',
    forms: ['тренування', 'тренування', 'тренувань'],
    ofForms: ['тренування', 'тренувань', 'тренувань'],
    modules: ['program', 'dur', 'back'],
    offPlan: 'Позапланове тренування',
  },
  eng: {
    id: 'eng',
    name: 'Англійська',
    icon: 'chat',
    shape: 'square',
    forms: ['заняття', 'заняття', 'занять'],
    ofForms: ['заняття', 'занять', 'занять'],
    modules: ['topic', 'hw'],
    subtitle: 'Заняття з тютором',
  },
};

/** Порядок звичок: у дні, легенді, аналітиці, картці. */
export const HABIT_IDS = ['train', 'eng'];

/** Вбудована звичка (train / eng). Власні звички — у сховищі (ключі h_<id>, js/store.js). */
export const isHabit = (id) => HABIT_IDS.includes(id);
export const hasModule = (habit, mod) => !!HABITS[habit]?.modules.includes(mod);
/** Звички з модулем (у порядку реєстру). */
export const habitsWith = (mod) => HABIT_IDS.filter((id) => hasModule(id, mod));

/** Чи стоїть звичка в розкладі дня (день однієї версії розкладу з settings.schedule). */
export const scheduledOn = (day, habit) => !!day[habit];

/** День програми з розкладу дня (звичка з модулем «Програма») або null. */
export function programDayOn(day) {
  const habit = habitsWith('program')[0];
  return (habit && day[habit]) || null;
}

/** Кроки покрокової форми після відмітки (і поля повного редактора). */
export function entrySteps(habit, s, bonus) {
  if (s === 'miss') return ['reasons', 'energy', 'comment'];
  const steps = HABITS[habit].modules.map((m) => MODULES[m].step(bonus)).filter(Boolean);
  return [...steps, 'energy', 'comment'];
}

/** Чи є в записі щось, крім статусу (тоді на картці «Змінити», інакше «Додати деталі»). */
export function hasDetails(habit, e) {
  return !!(e.energy || e.comment || e.reasons.length || HABITS[habit].modules.some((m) => MODULES[m].filled(e)));
}

/** Чипи модулів для виконаного запису (у порядку модулів звички). */
export const moduleChips = (habit, e) => HABITS[habit].modules.flatMap((m) => MODULES[m].chips(e));

// ——— Власні звички (етап 4.2): визначення в ключах h_<id> ———

/** id власної звички: випадкові 6 символів [a-z0-9], ніколи не використовуються повторно. */
export const HABIT_ID_RE = /^[a-z0-9]{6}$/;
/** id звички в ключі запису: будь-яка звичка, зокрема ще невідома (визначення могло не приїхати). */
export const ENTRY_HABIT_RE = /^[a-z0-9]{1,12}$/;
/** Стеля активних (не архівних) власних звичок. */
export const MAX_ACTIVE = 10;
export const HABIT_NAME_MAX = 40;
/** Палітра власних звичок (не сезонна; кольори — етап 3). */
export const HABIT_COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];
/** Модулі, доступні власним звичкам («Програма» — лише тренування). */
export const CUSTOM_MODULES = ['dur', 'back', 'topic', 'hw'];

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';
const KNOWN_FIELDS = new Set(['v', 'id', 'name', 'emoji', 'color', 'modules', 'order', 'created', 'archived', 'upd', 'sched']);
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Новий id, якого ще немає серед `taken` (визначення, записи невідомих звичок, вбудовані). */
export function newHabitId(taken, rand = Math.random) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = '';
    for (let i = 0; i < 6; i++) id += abc[Math.floor(rand() * abc.length) % abc.length];
    if (!taken.has(id) && !isHabit(id)) return id;
  }
  throw new Error('Не вдалося створити id звички');
}

function normSched(raw) {
  if (!Array.isArray(raw)) return [];
  const byFrom = new Map();
  for (const v of raw) {
    if (!v || !isValidKey(v.from) || !Array.isArray(v.days) || v.days.length !== 7) continue;
    byFrom.set(v.from, { from: v.from, days: v.days.map((d) => d === true) });
  }
  return [...byFrom.values()].sort((a, b) => (a.from < b.from ? -1 : 1));
}

/**
 * Визначення власної звички → актуальна схема; null, якщо id чи дата створення неправильні.
 * Невідомі поля зберігаються (їх могла записати новіша версія — інакше ця версія стерла б їх при збереженні).
 */
export function normalizeHabit(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !HABIT_ID_RE.test(raw.id) || !isValidKey(raw.created)) return null;
  const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !KNOWN_FIELDS.has(k)));
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, HABIT_NAME_MAX) : '';
  const emoji = typeof raw.emoji === 'string' ? Array.from(raw.emoji.trim()).slice(0, 8).join('').slice(0, 16) : '';
  const modules = Array.isArray(raw.modules) ? MODULE_IDS.filter((m) => CUSTOM_MODULES.includes(m) && raw.modules.includes(m)) : [];
  return {
    ...extra,
    v: 1,
    id: raw.id,
    name: name || 'Звичка',
    emoji: emoji || '⭐',
    color: HABIT_COLORS.includes(raw.color) ? raw.color : HABIT_COLORS[0],
    modules,
    order: Number.isInteger(raw.order) && raw.order >= 0 ? raw.order : 0,
    created: raw.created,
    archived: isValidKey(raw.archived) && raw.archived >= raw.created ? raw.archived : null,
    upd: isIso(raw.upd) ? raw.upd : EPOCH_ISO,
    sched: normSched(raw.sched),
  };
}

/**
 * Злиття двох версій однієї звички: перемагає новіший `upd` (час зміни), а не той, хто записав пізніше.
 * Нічия — детерміновано за JSON. Чиста: порядок аргументів і повторне застосування не змінюють результат.
 */
export function newerHabit(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (a.upd !== b.upd) return a.upd > b.upd ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/** Час зміни: зараз, але строго пізніше за попередній (правка має перемогти версію, від якої походить). */
export function nextUpd(prev, now = new Date()) {
  const iso = now.toISOString();
  return prev && prev >= iso ? new Date(Date.parse(prev) + 1).toISOString() : iso;
}

/**
 * Опис для нормалізації запису власної звички: модулі звички + модулі, чиї поля вже є в записі
 * (вимкнений модуль ховає поле у формі, але не стирає дані).
 */
export function entryDef(def, raw) {
  const has = (m) => def.modules.includes(m) || MODULES[m].fields.some((f) => raw && raw[f] != null);
  return { ...def, modules: CUSTOM_MODULES.filter(has) };
}
