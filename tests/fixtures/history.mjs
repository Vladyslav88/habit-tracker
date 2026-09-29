// Фікстура для характеризаційних тестів: ~6 місяців історії двох звичок.
// Навмисно не використовує код застосунку (розклад розписано вручну), щоб тести ловили зміни поведінки.
// Покриває: дату старту, записи до неї, дві версії розкладу, паузи (завершені й відкриту), пропуск і виконане
// в паузу, бонуси, пропуск поза планом, невідмічені дні, причини, енергію, коментарі, теми з повторами
// в різному регістрі, домашки (виконані / ні / непозначена), зимову серію, чистий місяць.

export const START = '2026-09-03';
export const FROM = '2026-08-24';
export const TO = '2027-03-03';

/** Версії розкладу (індекс 0 = понеділок). train: номер Дня програми, eng: true/false. */
export const SCHEDULE = [
  {
    from: '2000-01-01',
    days: [
      { train: 1, eng: false }, { train: 0, eng: true }, { train: 3, eng: false }, { train: 0, eng: true },
      { train: 2, eng: false }, { train: 0, eng: false }, { train: 0, eng: false },
    ],
  },
  {
    from: '2026-11-02',
    days: [
      { train: 1, eng: false }, { train: 0, eng: true }, { train: 2, eng: false }, { train: 0, eng: true },
      { train: 3, eng: false }, { train: 0, eng: true }, { train: 0, eng: false },
    ],
  },
];

export const PAUSES = [
  { id: 'p-open', from: '2027-03-02', to: null, label: 'Відпустка' },
  { id: 'p-trip', from: '2027-01-05', to: '2027-01-07', label: 'Поїздка' },
  { id: 'p-sick', from: '2026-10-12', to: '2026-10-18', label: 'Хвороба' },
];

export const CHECKPOINTS = [
  { id: 'cp-mini', date: '2026-10-10', to: null, label: 'Міні-чек' },
  { id: 'cp-review', date: '2026-11-07', to: '2026-11-08', label: 'Ревʼю' },
  { id: 'cp-ny', date: '2027-01-01', to: null, label: 'Новий рік' },
];

export const SETTINGS = {
  schemaVersion: 1,
  startDate: START,
  schedule: SCHEDULE,
  workouts: { 1: 'горизонтальні тяги', 2: 'вертикальні вектори', 3: 'комплексні тяги' },
  pauses: PAUSES,
  checkpoints: CHECKPOINTS,
};

/** Дні, на які фікстура дивиться як на «сьогодні». */
export const TODAYS = ['2026-09-29', '2026-10-15', '2026-11-30', '2026-12-01', '2027-01-20', '2027-03-03'];

// ——— Дати без коду застосунку ———

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export function* days(from, to) {
  for (let d = parse(from); key(d) <= to; d.setDate(d.getDate() + 1)) yield key(d);
}
const weekday = (k) => (parse(k).getDay() + 6) % 7;
const inPause = (k) => PAUSES.some((p) => p.from <= k && (p.to === null || k <= p.to));
const scheduleOn = (k) => (k >= SCHEDULE[1].from ? SCHEDULE[1] : SCHEDULE[0]).days[weekday(k)];

/** Детермінований «випадок» від рядка. */
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619) >>> 0;
  return x;
}

const TOPICS = [
  'Present Perfect', 'Phrasal verbs', 'Conditionals', 'Travel vocabulary', 'present perfect', 'Past Simple',
  'Modal verbs', 'Small talk', 'Job interview', 'Passive voice', 'Articles', 'Reported speech',
  'Phrasal Verbs', 'Food idioms', 'Gerund vs infinitive', 'Business email', 'Linking words', 'Future forms',
  'Relative clauses', 'Comparatives', 'Used to', 'Question tags', 'Collocations', 'Prepositions of time',
  'Wish clauses', 'Mixed conditionals', 'Narrative tenses', 'Emphasis', 'Inversion', 'Ellipsis', 'Cleft sentences',
];

const TRAIN_MISS = { '2027-02-26': ['tired'], '2027-03-01': ['back', 'no_time'] };
const TRAIN_UNMARKED = new Set(['2027-02-24']);
const ENG_MISS = {
  '2026-09-17': { reasons: ['no_time'], comment: 'Перенесли заняття' },
  '2026-10-06': { reasons: ['tired', 'other'], energy: 2 },
  '2026-10-22': { reasons: [], comment: 'Тютор захворів' },
  '2026-12-15': { reasons: ['sick'], energy: 1 },
  '2027-01-14': { reasons: ['sick', 'tired'] },
};
const ENG_UNMARKED = new Set(['2026-10-01', '2027-02-18']);
const HW_NOT_DONE = new Set(['2026-12-10', '2026-10-08']);

/**
 * Записи у форматі сховища (як їх зберігає store.saveEntry): { date, habit, data }.
 * bonus і day виставлені так, як їх вивів би застосунок на момент відмітки.
 */
export function buildEntries() {
  const out = [];
  const add = (date, habit, data) => out.push({ date, habit, data: { ts: `${date}T18:30:00.000Z`, ...data } });
  let topicN = 0;
  const engDone = [];

  for (const d of days(FROM, TO)) {
    const plan = scheduleOn(d);
    const r = hash(d);
    const energy = r % 7 < 5 ? (r % 5) + 1 : null;
    if (inPause(d)) continue;

    if (plan.train && d !== '2026-09-01' && !TRAIN_UNMARKED.has(d)) {
      if (TRAIN_MISS[d]) {
        add(d, 'train', { s: 'miss', bonus: false, day: plan.train, reasons: TRAIN_MISS[d], energy, comment: d === '2027-03-01' ? 'Прихопило спину' : '' });
      } else {
        const dur = ['lt60', '60-70', 'gt70', null][r % 4];
        const back = [false, false, true, null, false][r % 5];
        add(d, 'train', { s: 'done', bonus: false, day: plan.train, dur, back, energy, comment: r % 9 === 0 ? 'Легко пішло' : '' });
      }
    }

    if (plan.eng && !ENG_UNMARKED.has(d)) {
      if (ENG_MISS[d]) {
        add(d, 'eng', { s: 'miss', bonus: false, energy: null, ...ENG_MISS[d] });
      } else {
        const topic = r % 11 === 0 ? '' : TOPICS[topicN++ % TOPICS.length];
        engDone.push(d);
        add(d, 'eng', { s: 'done', bonus: false, topic, energy, comment: r % 6 === 0 ? 'Багато говорили' : '' });
      }
    }
  }

  // Домашки: до листопада — через одну, далі — на кожному занятті; «не виконав» двічі, остання ще не позначена.
  const last = engDone.at(-1);
  for (const item of out) {
    if (item.habit !== 'eng' || item.data.s !== 'done') continue;
    const d = item.date;
    if (d < '2026-11-01' && hash(`hw${d}`) % 2) continue;
    item.data.hw = { text: `Вправи до ${d}`, done: d === last ? null : !HW_NOT_DONE.has(d) };
  }

  // Особливі випадки
  add('2026-09-01', 'train', { s: 'done', bonus: false, day: 2 }); // до дати старту
  add('2026-09-05', 'eng', { s: 'done', bonus: true, topic: 'Phrasal verbs', energy: 5 }); // бонус у суботу
  add('2026-09-06', 'train', { s: 'done', bonus: true, day: 2, dur: 'gt70', back: true }); // бонус у неділю
  add('2026-09-12', 'eng', { s: 'miss', bonus: false, reasons: ['other'] }); // пропуск поза планом
  add('2026-10-13', 'eng', { s: 'miss', bonus: false, reasons: ['sick'], energy: 1, comment: 'Температура' }); // пропуск у паузу
  add('2026-10-14', 'train', { s: 'done', bonus: true, day: null, dur: 'lt60', back: false, energy: 3 }); // виконав у паузу
  add('2027-01-05', 'eng', { s: 'miss', bonus: false, reasons: ['other'] }); // пропуск у паузу
  add('2027-01-06', 'train', { s: 'done', bonus: true, day: 1, dur: '60-70', back: null }); // виконав у паузу
  add('2027-03-02', 'train', { s: 'done', bonus: true, day: null, energy: 4 }); // виконав у відкриту паузу
  return out.sort((a, b) => (a.date + a.habit < b.date + b.habit ? -1 : 1));
}

/** Значення «хмари» (ключ → рядок), як їх зберігає застосунок. */
export function cloudValues({ ach } = {}) {
  const values = { settings: JSON.stringify(SETTINGS) };
  for (const { date, habit, data } of buildEntries()) values[`e_${date}_${habit}`] = JSON.stringify(data);
  if (ach) values.ach = JSON.stringify(ach);
  return values;
}
