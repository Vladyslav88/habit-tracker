// Дати — лише локальний час, формат ключа YYYY-MM-DD. Тиждень починається з понеділка.

const pad = (n) => String(n).padStart(2, '0');

export const WEEKDAYS = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];
export const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
export const WEEKDAYS_CAP = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
export const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
export const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function keyOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey() {
  return keyOf(new Date());
}

/** Опівдні — щоб перехід на літній/зимовий час не зсував дату. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function isValidKey(key) {
  if (typeof key !== 'string' || !DATE_RE.test(key)) return false;
  return keyOf(parseKey(key)) === key;
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/** Різниця в днях b − a. */
export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** 0 = понеділок … 6 = неділя */
export function weekdayIdx(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

/** «вівторок, 29 вересня» */
export function fmtLong(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[weekdayIdx(key)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «вт, 29 вересня» */
export function fmtShort(key) {
  const d = parseKey(key);
  return `${WEEKDAYS_SHORT[weekdayIdx(key)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «29 вересня» (+ рік, якщо не поточний) */
export function fmtDay(key, withYear = false) {
  const d = parseKey(key);
  const y = withYear || d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${y}`;
}

export function fmtTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** plural(5, ['день', 'дні', 'днів']) → 'днів' */
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

/** «сьогодні» / «завтра» / «через 3 дні» / «вчора» / «5 днів тому» */
export function relDays(key, from = todayKey()) {
  const n = diffDays(from, key);
  if (n === 0) return 'сьогодні';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчора';
  if (n > 1) return `через ${n} ${plural(n, ['день', 'дні', 'днів'])}`;
  return `${-n} ${plural(-n, ['день', 'дні', 'днів'])} тому`;
}
