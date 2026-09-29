// Схема записів (SPEC §4): довідники, підписи і нормалізація.

export const HABIT_IDS = ['train', 'eng'];

export const HABITS = {
  train: { id: 'train', name: 'Тренування', icon: 'dumbbell', forms: ['тренування', 'тренування', 'тренувань'], ofForms: ['тренування', 'тренувань', 'тренувань'] },
  eng: { id: 'eng', name: 'Англійська', icon: 'chat', forms: ['заняття', 'заняття', 'занять'], ofForms: ['заняття', 'занять', 'занять'] },
};

export const DUR = [
  { v: 'lt60', label: 'до 60 хв' },
  { v: '60-70', label: '60–70 хв' },
  { v: 'gt70', label: 'понад 70 хв' },
];

export const REASONS = [
  { v: 'tired', label: 'Втома' },
  { v: 'no_time', label: 'Не було часу' },
  { v: 'back', label: 'Спина' },
  { v: 'sick', label: 'Хвороба' },
  { v: 'other', label: 'Інше' },
];

export const ENERGY = [
  { v: 1, emoji: '😫', label: 'Без сил' },
  { v: 2, emoji: '😕', label: 'Так собі' },
  { v: 3, emoji: '😐', label: 'Нормально' },
  { v: 4, emoji: '🙂', label: 'Добре' },
  { v: 5, emoji: '🤩', label: 'Супер' },
];

export const LIMITS = { comment: 800, topic: 150, hw: 400 };

export const durLabel = (v) => DUR.find((d) => d.v === v)?.label ?? '';
export const reasonLabel = (v) => REASONS.find((r) => r.v === v)?.label ?? v;
export const energyOf = (v) => ENERGY.find((e) => e.v === v) ?? null;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const boolOrNull = (v) => (v === true || v === false ? v : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);

/**
 * Приводить запис до схеми: відкидає невідомі поля, обрізає тексти,
 * очищує поля, що не стосуються статусу. Кидає помилку, якщо статус неправильний.
 */
export function normalizeEntry(habit, raw) {
  if (!HABIT_IDS.includes(habit)) throw new Error(`Невідома звичка: ${habit}`);
  if (!raw || (raw.s !== 'done' && raw.s !== 'miss')) throw new Error('Статус має бути done або miss');
  const done = raw.s === 'done';
  const energy = Number.isInteger(raw.energy) && raw.energy >= 1 && raw.energy <= 5 ? raw.energy : null;
  const reasons = done || !Array.isArray(raw.reasons)
    ? []
    : REASONS.map((r) => r.v).filter((v) => raw.reasons.includes(v));
  const ts = typeof raw.ts === 'string' && !Number.isNaN(Date.parse(raw.ts)) ? raw.ts : new Date().toISOString();
  const base = { s: raw.s, bonus: raw.bonus === true };

  if (habit === 'train') {
    return {
      ...base,
      day: oneOf(raw.day, [1, 2, 3]),
      dur: done ? oneOf(raw.dur, DUR.map((d) => d.v)) : null,
      back: done ? boolOrNull(raw.back) : null,
      energy,
      reasons,
      comment: str(raw.comment, LIMITS.comment),
      ts,
    };
  }

  let hw = null;
  if (done && raw.hw && typeof raw.hw === 'object') {
    const text = str(raw.hw.text, LIMITS.hw);
    const hwDone = boolOrNull(raw.hw.done);
    if (text || hwDone !== null) hw = { text, done: hwDone };
  }
  return {
    ...base,
    topic: done ? str(raw.topic, LIMITS.topic) : '',
    hw,
    energy,
    reasons,
    comment: str(raw.comment, LIMITS.comment),
    ts,
  };
}
