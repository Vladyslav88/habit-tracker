// Розклад, паузи і похідні стани днів (SPEC §3, §7). Лише чисті функції.
import { addDays, daysInMonth, isValidKey, keyOf, weekdayIdx } from './dates.js';
import { HABIT_IDS } from './entry.js';

export const SCHEMA_VERSION = 1;
/** Дата «з початку часів» для першої версії розкладу. */
export const SCHEDULE_EPOCH = '2000-01-01';

export const DEFAULT_WORKOUTS = {
  1: 'горизонтальні тяги та стабілізація тазу',
  2: 'вертикальні вектори та передня поверхня стегна',
  3: 'функціональна стабілізація та комплексні тяги',
};

// Індекс 0 = понеділок. train: 0 — немає, 1/2/3 — номер Дня програми.
export const DEFAULT_DAYS = [
  { train: 1, eng: false },
  { train: 0, eng: true },
  { train: 3, eng: false },
  { train: 0, eng: true },
  { train: 2, eng: false },
  { train: 0, eng: false },
  { train: 0, eng: false },
];

export const DEFAULT_CHECKPOINTS = [
  { id: 'cp-mini', date: '2026-10-10', to: null, label: 'Міні-чек' },
  { id: 'cp-review', date: '2026-11-07', to: '2026-11-08', label: 'Ревʼю' },
];

export const PAUSE_LABEL_MAX = 40;

export const entryId = (date, habit) => `${date}:${habit}`;

export function defaultSettings(startDate) {
  return {
    schemaVersion: SCHEMA_VERSION,
    startDate,
    schedule: [{ from: SCHEDULE_EPOCH, days: structuredClone(DEFAULT_DAYS) }],
    workouts: { ...DEFAULT_WORKOUTS },
    pauses: [],
    checkpoints: structuredClone(DEFAULT_CHECKPOINTS),
  };
}

function normDays(days) {
  if (!Array.isArray(days) || days.length !== 7) return structuredClone(DEFAULT_DAYS);
  return days.map((d) => ({
    train: [0, 1, 2, 3].includes(d?.train) ? d.train : 0,
    eng: d?.eng === true,
  }));
}

/** Приводить налаштування до актуальної схеми, заповнюючи відсутнє значеннями за замовчуванням. */
export function normalizeSettings(raw, fallbackStart) {
  const base = defaultSettings(fallbackStart);
  if (!raw || typeof raw !== 'object') return base;
  const schedule = Array.isArray(raw.schedule)
    ? raw.schedule
      .filter((v) => v && isValidKey(v.from))
      .map((v) => ({ from: v.from, days: normDays(v.days) }))
      .sort((a, b) => (a.from < b.from ? -1 : 1))
    : [];
  const workouts = { ...DEFAULT_WORKOUTS };
  for (const n of [1, 2, 3]) {
    const w = raw.workouts?.[n];
    if (typeof w === 'string' && w.trim()) workouts[n] = w.trim().slice(0, 80);
  }
  const pauses = Array.isArray(raw.pauses)
    ? raw.pauses
      .filter((p) => p && isValidKey(p.from) && (p.to === null || isValidKey(p.to)))
      .map((p) => ({
        id: String(p.id || `p${Math.random().toString(36).slice(2, 8)}`),
        from: p.from,
        to: p.to && p.to < p.from ? p.from : p.to,
        label: typeof p.label === 'string' ? p.label.trim().slice(0, PAUSE_LABEL_MAX) : '',
      }))
      .sort((a, b) => (a.from < b.from ? 1 : -1))
    : [];
  const checkpoints = Array.isArray(raw.checkpoints)
    ? raw.checkpoints.filter((c) => c && isValidKey(c.date)).map((c) => ({
      id: String(c.id || c.date),
      date: c.date,
      to: isValidKey(c.to) ? c.to : null,
      label: typeof c.label === 'string' ? c.label.slice(0, 60) : '',
    }))
    : base.checkpoints;
  return {
    schemaVersion: SCHEMA_VERSION,
    startDate: isValidKey(raw.startDate) ? raw.startDate : fallbackStart,
    schedule: schedule.length ? schedule : base.schedule,
    workouts,
    pauses,
    checkpoints,
  };
}

/** Версія розкладу, що діяла на дату. */
export function daysFor(settings, date) {
  let days = settings.schedule[0].days;
  for (const v of settings.schedule) {
    if (v.from <= date) days = v.days;
    else break;
  }
  return days;
}

export function pauseOn(settings, date) {
  return settings.pauses.find((p) => p.from <= date && (p.to === null || date <= p.to)) || null;
}

/**
 * План на дату.
 * planned — що стоїть у розкладі; habits — що реально треба зробити (порожньо, якщо пауза).
 */
export function planFor(settings, date) {
  const day = daysFor(settings, date)[weekdayIdx(date)];
  const planned = [];
  if (day.train) planned.push('train');
  if (day.eng) planned.push('eng');
  const pause = pauseOn(settings, date);
  return { planned, habits: pause ? [] : planned, trainDay: day.train || null, pause };
}

export const isPlanned = (settings, date, habit) => planFor(settings, date).habits.includes(habit);

/** Наступні дні з запланованими звичками (після дати `from`). */
export function upcoming(settings, from, count = 1, horizon = 120) {
  const out = [];
  for (let i = 1; i <= horizon && out.length < count; i++) {
    const date = addDays(from, i);
    const plan = planFor(settings, date);
    if (plan.habits.length) out.push({ date, ...plan });
  }
  return out;
}

/** Заплановані дні в минулому без відмітки (з дати старту). */
export function unmarked(settings, entries, today, lookback = 14) {
  const out = [];
  let d = addDays(today, -lookback);
  if (d < settings.startDate) d = settings.startDate;
  for (; d < today; d = addDays(d, 1)) {
    for (const habit of planFor(settings, d).habits) {
      if (!entries.has(entryId(d, habit))) out.push({ date: d, habit });
    }
  }
  return out;
}

/**
 * Стан дня для календаря.
 * items: [{habit, state: done|miss|planned|unmarked, bonus, back}]
 */
export function dayInfo(settings, entries, date, today) {
  const plan = planFor(settings, date);
  const tracked = date >= settings.startDate;
  const items = [];
  const order = [...plan.habits, ...HABIT_IDS.filter((h) => !plan.habits.includes(h))];
  for (const habit of order) {
    const e = entries.get(entryId(date, habit));
    const isPlan = plan.habits.includes(habit);
    if (e) {
      items.push({
        habit,
        state: e.s,
        bonus: e.s === 'done' && !isPlan,
        back: habit === 'train' && e.back === true,
        entry: e,
      });
    } else if (isPlan && (date >= today || tracked)) {
      items.push({ habit, state: date >= today ? 'planned' : 'unmarked', bonus: false, back: false, entry: null });
    }
  }
  return { date, items, plan, isToday: date === today, isFuture: date > today };
}

/** Підсумок місяця: X виконано із Y запланованих (+ бонуси) по кожній звичці. */
export function monthSummary(settings, entries, year, month) {
  const res = {};
  for (const h of HABIT_IDS) res[h] = { done: 0, planned: 0, miss: 0, bonus: 0 };
  const n = daysInMonth(year, month);
  for (let day = 1; day <= n; day++) {
    const date = keyOf(new Date(year, month, day, 12));
    const plan = planFor(settings, date);
    for (const h of HABIT_IDS) {
      const e = entries.get(entryId(date, h));
      const isPlan = plan.habits.includes(h) && date >= settings.startDate;
      if (isPlan) res[h].planned++;
      if (!e) continue;
      if (e.s === 'done') {
        if (isPlan) res[h].done++;
        else res[h].bonus++;
      } else if (isPlan) {
        res[h].miss++;
      }
    }
  }
  return res;
}
