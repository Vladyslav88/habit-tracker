// Аналітика (SPEC §8). Лише чисті функції над налаштуваннями й записами.
// Правила ті самі, що в календарі (schedule.js): заплановане — з розкладу, що діяв на дату;
// пауза має пріоритет (пропуск у день паузи не рахується, виконане — бонус); до дати старту нічого не рахується.
import { addDays, diffDays, keyOf, parseKey } from './dates.js';
import { DUR, HABIT_IDS, REASONS } from './entry.js';
import { entryId, planFor } from './schedule.js';

export const PERIODS = [
  { id: '4w', label: '4 тижні' },
  { id: 'month', label: 'Місяць' },
  { id: '3m', label: '3 місяці' },
  { id: 'all', label: 'Усе' },
];

/** Скільки відміток потрібно, щоб висновки були хоч трохи надійними. */
export const MIN = { marks: 10, dur: 3, back: 3, energy: 3, energySplit: 2 };

/**
 * Діапазон періоду [from, to] включно, обрізаний датою старту.
 * 4 тижні — останні 28 днів; місяць — з 1 числа поточного; 3 місяці — з 1 числа позаминулого; усе — з дати старту.
 */
export function periodRange(settings, id, today) {
  const d = parseKey(today);
  let from = settings.startDate;
  if (id === '4w') from = addDays(today, -27);
  else if (id === 'month') from = keyOf(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  else if (id === '3m') from = keyOf(new Date(d.getFullYear(), d.getMonth() - 2, 1, 12));
  const clipped = from < settings.startDate;
  return { from: clipped ? settings.startDate : from, to: today, clipped };
}

/**
 * Що сталося зі звичкою в цей день.
 * kind: done | miss | unmarked (минуле без відмітки) | pending (сьогодні, ще не відмічено)
 *       | bonus (виконано поза планом або в паузу) | none (нічого не рахується)
 */
export function slot(settings, entries, date, habit, today) {
  const plan = planFor(settings, date);
  const planned = plan.habits.includes(habit) && date >= settings.startDate;
  let entry = entries.get(entryId(date, habit)) || null;
  // Пауза має пріоритет: пропуск у день паузи не показується й не рахується.
  if (entry && plan.pause && entry.s === 'miss') entry = null;
  if (planned) {
    if (entry) return { kind: entry.s, entry };
    return { kind: date < today ? 'unmarked' : 'pending', entry: null };
  }
  if (entry?.s === 'done' && date >= settings.startDate) return { kind: 'bonus', entry };
  return { kind: 'none', entry: null };
}

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Виконання по звичках за [from, to]. pct — частка виконаних серед запланованих, що вже минули. */
export function habitStats(settings, entries, from, to, today) {
  const res = {};
  for (const hb of HABIT_IDS) res[hb] = { done: 0, miss: 0, unmarked: 0, pending: 0, bonus: 0, planned: 0, pct: null };
  if (from > to) return res;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const hb of HABIT_IDS) {
      const { kind } = slot(settings, entries, d, hb, today);
      if (kind !== 'none') res[hb][kind]++;
    }
  }
  for (const hb of HABIT_IDS) {
    const r = res[hb];
    // Сьогоднішнє невідмічене ще не пропуск — у відсоток не йде.
    r.planned = r.done + r.miss + r.unmarked;
    r.pct = r.planned ? r.done / r.planned : null;
  }
  return res;
}

/**
 * Серії за весь час (з дати старту). Серія — виконання поспіль: бонус її продовжує,
 * пропуск і невідмічений минулий день обривають; вихідні, паузи й сьогоднішнє невідмічене — ні.
 */
export function streaks(settings, entries, habit, today) {
  let run = 0;
  let best = 0;
  for (let d = settings.startDate; d <= today; d = addDays(d, 1)) {
    const { kind } = slot(settings, entries, d, habit, today);
    if (kind === 'done' || kind === 'bonus') {
      run++;
      if (run > best) best = run;
    } else if (kind === 'miss' || kind === 'unmarked') {
      run = 0;
    }
  }
  return { current: run, best };
}

/** Повна аналітика за період. */
export function analyze(settings, entries, from, to, today) {
  const habits = habitStats(settings, entries, from, to, today);
  const records = []; // відмітки, що рахуються: { date, habit, kind, entry }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const hb of HABIT_IDS) {
      const s = slot(settings, entries, d, hb, today);
      if (s.entry && (s.kind === 'done' || s.kind === 'miss' || s.kind === 'bonus')) records.push({ date: d, habit: hb, ...s });
    }
  }
  const trainsDone = records.filter((r) => r.habit === 'train' && r.kind !== 'miss');
  const misses = records.filter((r) => r.kind === 'miss');

  // Тривалість тренувань
  const dur = { total: trainsDone.length, known: 0, unknown: 0, by: Object.fromEntries(DUR.map((x) => [x.v, 0])) };
  for (const r of trainsDone) {
    if (r.entry.dur) { dur.by[r.entry.dur]++; dur.known++; } else dur.unknown++;
  }

  // Спина після Дня 1/2/3 (лише тренування, де відповідь про спину є)
  const back = { known: 0, noDay: 0, by: { 1: { n: 0, back: 0 }, 2: { n: 0, back: 0 }, 3: { n: 0, back: 0 } } };
  for (const r of trainsDone) {
    if (r.entry.back === null) continue;
    back.known++;
    const cell = back.by[r.entry.day];
    if (!cell) { back.noDay++; continue; }
    cell.n++;
    if (r.entry.back) cell.back++;
  }

  // Причини пропусків
  const reasonCount = Object.fromEntries(REASONS.map((x) => [x.v, { train: 0, eng: 0 }]));
  let noReason = 0;
  for (const r of misses) {
    if (!r.entry.reasons.length) noReason++;
    for (const v of r.entry.reasons) reasonCount[v][r.habit]++;
  }
  const reasons = REASONS
    .map((x) => ({ v: x.v, train: reasonCount[x.v].train, eng: reasonCount[x.v].eng, total: reasonCount[x.v].train + reasonCount[x.v].eng }))
    .filter((x) => x.total)
    .sort((a, b) => b.total - a.total);
  const comments = misses.filter((r) => r.entry.comment).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);

  // Енергія
  const withEnergy = records.filter((r) => r.entry.energy);
  const eDone = withEnergy.filter((r) => r.kind !== 'miss').map((r) => r.entry.energy);
  const eMiss = withEnergy.filter((r) => r.kind === 'miss').map((r) => r.entry.energy);
  const hist = [1, 2, 3, 4, 5].map((v) => withEnergy.filter((r) => r.entry.energy === v).length);
  const energy = {
    n: withEnergy.length,
    avg: avg(withEnergy.map((r) => r.entry.energy)),
    done: { n: eDone.length, avg: avg(eDone) },
    miss: { n: eMiss.length, avg: avg(eMiss) },
    hist,
  };

  return {
    from,
    to,
    days: diffDays(from, to) + 1,
    habits,
    marks: records.length,
    misses: misses.length,
    noReason,
    dur,
    back,
    reasons,
    comments,
    energy,
  };
}

/**
 * Контрольні точки з відліком і підсумком відрізку: від попередньої точки (або дати старту)
 * до цієї точки (для майбутніх — до сьогодні).
 * status: upcoming | now | past; days — скільки днів до початку (від’ємне — минула).
 * stats = null, якщо відрізок ще не почався (from > to) або точка раніша за дату старту (beforeStart).
 */
export function checkpointTimeline(settings, entries, today) {
  const list = [...settings.checkpoints].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let segStart = settings.startDate;
  return list.map((c) => {
    const end = c.to && c.to > c.date ? c.to : c.date;
    const status = today < c.date ? 'upcoming' : today <= end ? 'now' : 'past';
    const segTo = c.date < today ? c.date : today;
    const from = segStart;
    const stats = from <= segTo ? habitStats(settings, entries, from, segTo, today) : null;
    const next = addDays(end, 1);
    if (next > segStart) segStart = next;
    return { ...c, end, status, days: diffDays(today, c.date), from, to: segTo, stats, beforeStart: c.date < settings.startDate };
  });
}
