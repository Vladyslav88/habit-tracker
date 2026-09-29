// Реєстр звичок (SPEC §4, етап 4). Поки лише дві вбудовані — тренування й англійська;
// власні звички зʼявляться на наступних етапах і прийдуть сюди ж. Решта коду не порівнює id
// зі 'train' / 'eng', а питає реєстр: які звички є, яка в них форма, які модулі (js/modules.js).
import { MODULES } from './modules.js';

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
