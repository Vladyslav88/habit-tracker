// Схема записів (SPEC §4): ядро запису (статус, бонус, енергія, причини, коментар), довідники й нормалізація.
// Поля модулів (День програми, тривалість, спина, тема, домашка) — js/modules.js; які модулі в якої звички — js/habits.js.
import { HABITS } from './habits.js';
import { HW_MAX, MODULES, str, TOPIC_MAX } from './modules.js';

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

export const LIMITS = { comment: 800, topic: TOPIC_MAX, hw: HW_MAX };

export const reasonLabel = (v) => REASONS.find((r) => r.v === v)?.label ?? v;
export const energyOf = (v) => ENERGY.find((e) => e.v === v) ?? null;

/**
 * Приводить запис до схеми: відкидає невідомі поля, обрізає тексти,
 * очищує поля, що не стосуються статусу. Кидає помилку, якщо статус неправильний.
 * Порядок полів: s, bonus, поля модулів (у порядку модулів звички), energy, reasons, comment, ts.
 */
export function normalizeEntry(habit, raw) {
  // habit — id вбудованої звички або визначення власної (з полем modules).
  const def = typeof habit === 'string' ? HABITS[habit] : habit;
  if (!def || !Array.isArray(def.modules)) throw new Error(`Невідома звичка: ${typeof habit === 'string' ? habit : habit?.id}`);
  if (!raw || (raw.s !== 'done' && raw.s !== 'miss')) throw new Error('Статус має бути done або miss');
  const done = raw.s === 'done';
  const energy = Number.isInteger(raw.energy) && raw.energy >= 1 && raw.energy <= 5 ? raw.energy : null;
  const reasons = done || !Array.isArray(raw.reasons)
    ? []
    : REASONS.map((r) => r.v).filter((v) => raw.reasons.includes(v));
  const ts = typeof raw.ts === 'string' && !Number.isNaN(Date.parse(raw.ts)) ? raw.ts : new Date().toISOString();
  const out = { s: raw.s, bonus: raw.bonus === true };
  for (const m of def.modules) Object.assign(out, MODULES[m].normalize(raw, done));
  return { ...out, energy, reasons, comment: str(raw.comment, LIMITS.comment), ts };
}
