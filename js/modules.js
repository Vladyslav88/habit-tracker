// Модулі звички (SPEC §4, етап 4): додаткові поля запису поверх ядра (статус, бонус, енергія, причини, коментар).
// Шаблон тренування — «Програма», «Тривалість», «Спина»; шаблон англійської — «Тема», «Домашка».
// Лише дані й чисті функції: назви полів у записі не змінюються (формат сховища той самий).

export const PROGRAM_DAYS = [1, 2, 3];

export const DUR = [
  { v: 'lt60', label: 'до 60 хв' },
  { v: '60-70', label: '60–70 хв' },
  { v: 'gt70', label: 'понад 70 хв' },
];

export const TOPIC_MAX = 150;
export const HW_MAX = 400;

export const durLabel = (v) => DUR.find((d) => d.v === v)?.label ?? '';

export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const boolOrNull = (v) => (v === true || v === false ? v : null);
export const oneOf = (v, list) => (list.includes(v) ? v : null);

/**
 * Модуль:
 * - fields — назви полів модуля в записі;
 * - normalize(raw, done) → поля модуля в записі (для miss — очищені, як і раніше);
 * - step(bonus) → крок покрокової форми або null (після відмітки «виконав»);
 * - filled(e) → чи є що показати (кнопка «Змінити» замість «Додати деталі»);
 * - chips(e) → короткі чипи для карток виконаного запису.
 */
export const MODULES = {
  program: {
    name: 'Програма',
    fields: ['day'],
    // День програми зберігається і при пропуску (для аналітики «спина після Дня N»).
    normalize: (raw) => ({ day: oneOf(raw.day, PROGRAM_DAYS) }),
    // Для запланованого День береться з розкладу; питаємо лише для бонусного.
    step: (bonus) => (bonus ? 'day' : null),
    filled: () => false,
    chips: () => [],
  },
  dur: {
    name: 'Тривалість',
    fields: ['dur'],
    normalize: (raw, done) => ({ dur: done ? oneOf(raw.dur, DUR.map((d) => d.v)) : null }),
    step: () => 'dur',
    filled: (e) => !!e.dur,
    chips: (e) => (e.dur ? [{ text: durLabel(e.dur), icon: 'clock' }] : []),
  },
  back: {
    name: 'Спина',
    fields: ['back'],
    normalize: (raw, done) => ({ back: done ? boolOrNull(raw.back) : null }),
    step: () => 'back',
    filled: (e) => e.back !== null,
    chips: (e) => {
      if (e.back === true) return [{ text: 'Спина', cls: 'chip-back' }];
      if (e.back === false) return [{ text: 'Спина ок' }];
      return [];
    },
  },
  topic: {
    name: 'Тема',
    fields: ['topic'],
    normalize: (raw, done) => ({ topic: done ? str(raw.topic, TOPIC_MAX) : '' }),
    step: () => 'topic',
    filled: (e) => !!e.topic,
    chips: (e) => (e.topic ? [{ text: e.topic, cls: 'chip-topic' }] : []),
  },
  hw: {
    name: 'Домашка',
    fields: ['hw'],
    normalize(raw, done) {
      let hw = null;
      if (done && raw.hw && typeof raw.hw === 'object') {
        const text = str(raw.hw.text, HW_MAX);
        const hwDone = boolOrNull(raw.hw.done);
        if (text || hwDone !== null) hw = { text, done: hwDone };
      }
      return { hw };
    },
    step: () => 'hw',
    filled: (e) => !!e.hw,
    chips: (e) => (e.hw?.text ? [{ text: e.hw.done ? 'Домашка ✓' : 'Домашка', cls: e.hw.done ? '' : 'chip-hw' }] : []),
  },
};

export const MODULE_IDS = Object.keys(MODULES);
