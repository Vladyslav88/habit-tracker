// Дані застосунку поверх адаптера сховища: налаштування, записи, упаковка старих місяців.
import { isValidKey, keyOf, monthKey, parseKey, todayKey } from './dates.js';
import { HABIT_IDS, normalizeEntry } from './entry.js';
import { defaultSettings, entryId, normalizeSettings, planFor } from './schedule.js';
import { VALUE_MAX } from './storage.js';

export const SETTINGS_KEY = 'settings';
export const ACH_KEY = 'ach';
export const PACK_THRESHOLD = 900;

const ENTRY_KEY_RE = /^e_(\d{4}-\d{2}-\d{2})_(train|eng)$/;
const PACK_KEY_RE = /^m_(\d{4}-\d{2})_(\d+)$/;
const PACK_BUDGET = VALUE_MAX - 96;

/** Початкова історія (SPEC §4) — імпортується, якщо сховище порожнє. */
export const INITIAL_HISTORY = [
  { date: '2026-09-25', habit: 'train', data: { s: 'done' } },
  { date: '2026-09-28', habit: 'train', data: { s: 'done', dur: 'lt60', back: false } },
];

export const entryKey = (date, habit) => `e_${date}_${habit}`;
const packKey = (month, n) => `m_${month}_${n}`;
const noonIso = (date) => parseKey(date).toISOString();
const ACH_ID_RE = /^[a-z0-9_]{1,40}$/;

/**
 * Отримані досягнення: { id: 'YYYY-MM-DD' }. Сміття відкидається, невідомі id лишаються
 * (їх могла записати новіша версія на іншому пристрої). Відсутній ключ — порожньо.
 */
export function normalizeAch(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, date] of Object.entries(raw)) {
    if (ACH_ID_RE.test(id) && isValidKey(date)) out[id] = date;
  }
  return out;
}

/**
 * Злиття двох наборів досягнень за id (SPEC §8): обʼєднання, при конфлікті — найраніша дата.
 * Чиста: входи не змінюються. Порядок аргументів і повторне застосування результату не змінюють.
 */
export function mergeAch(a, b) {
  const out = { ...a };
  for (const [id, date] of Object.entries(b)) {
    if (!out[id] || date < out[id]) out[id] = date;
  }
  return out;
}

const sameAch = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, d]) => b[id] === d);

function parseJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function createStore(storage) {
  let settings = null;
  let entries = new Map(); // 'YYYY-MM-DD:habit' → запис
  let packOf = new Map(); // id → ключ пакета
  let packs = new Map(); // ключ пакета → Set(id)
  let ach = {};
  let keyCount = 0;
  let broken = 0;
  let loadedAt = 0;
  let refreshing = null;
  const subs = new Set();

  const emit = () => subs.forEach((fn) => fn());

  async function readAll() {
    const keys = await storage.getKeys();
    const values = keys.length ? await storage.getItems(keys) : {};
    // Незбережені зміни важливіші за те, що зараз у хмарі (злиття — поверх хмарного значення).
    for (const [k, item] of storage.pendingOps()) {
      if (item.op === 'set') values[k] = item.value;
      else if (item.op === 'update') values[k] = item.fn(values[k] ?? '');
      else delete values[k];
    }
    return values;
  }

  function ingest(values) {
    const next = { entries: new Map(), packOf: new Map(), packs: new Map(), broken: 0 };
    const put = (id, habit, raw) => {
      try { next.entries.set(id, normalizeEntry(habit, raw)); } catch { next.broken++; }
    };
    const keys = Object.keys(values).filter((k) => values[k] !== '' && values[k] != null);
    for (const k of keys) {
      if (!PACK_KEY_RE.test(k)) continue;
      const obj = parseJson(values[k]);
      if (!obj || typeof obj !== 'object') { next.broken++; continue; }
      const ids = new Set();
      for (const [inner, raw] of Object.entries(obj)) {
        const m = /^(\d{4}-\d{2}-\d{2})_(train|eng)$/.exec(inner);
        if (!m) { next.broken++; continue; }
        const id = entryId(m[1], m[2]);
        put(id, m[2], raw);
        ids.add(id);
        next.packOf.set(id, k);
      }
      next.packs.set(k, ids);
    }
    // Окремі ключі перекривають пакети.
    for (const k of keys) {
      const m = ENTRY_KEY_RE.exec(k);
      if (!m) continue;
      const raw = parseJson(values[k]);
      if (raw) put(entryId(m[1], m[2]), m[2], raw);
      else next.broken++;
    }
    return { ...next, keyCount: keys.length, settingsRaw: parseJson(values[SETTINGS_KEY]), achRaw: parseJson(values[ACH_KEY]) };
  }

  function earliestDate(map) {
    let min = null;
    for (const id of map.keys()) {
      const d = id.slice(0, 10);
      if (!min || d < min) min = d;
    }
    return min;
  }

  function seed() {
    const today = todayKey();
    const start = INITIAL_HISTORY.reduce((m, r) => (r.date < m ? r.date : m), today);
    settings = defaultSettings(start);
    storage.set(SETTINGS_KEY, JSON.stringify(settings));
    for (const { date, habit, data } of INITIAL_HISTORY) {
      const entry = withDerived(date, habit, { ...data, ts: noonIso(date) });
      entries.set(entryId(date, habit), entry);
      storage.set(entryKey(date, habit), JSON.stringify(entry));
    }
    keyCount = 1 + INITIAL_HISTORY.length;
  }

  /** Бонус і День програми виводяться з розкладу на дату. */
  function withDerived(date, habit, data) {
    const plan = planFor(settings, date);
    const planned = plan.habits.includes(habit);
    // Бонус — лише виконана позапланова звичка; «пропуск бонусу» не має сенсу.
    const raw = { ...data, bonus: data.s === 'done' && !planned };
    if (habit === 'train' && raw.day == null && planned) raw.day = plan.trainDay;
    return normalizeEntry(habit, raw);
  }

  function writePack(key) {
    const ids = packs.get(key);
    if (!ids || !ids.size) {
      packs.delete(key);
      storage.remove(key);
      return;
    }
    const obj = {};
    for (const id of ids) obj[id.replace(':', '_')] = entries.get(id);
    storage.set(key, JSON.stringify(obj));
  }

  function unpack(id) {
    const key = packOf.get(id);
    if (!key) return;
    packOf.delete(id);
    packs.get(key)?.delete(id);
    writePack(key);
  }

  /**
   * Пакує записи старих місяців (старших за попередній) у ключі m_YYYY-MM_N,
   * щоб не впертися в ліміт 1024 ключі. Запускається лише коли ключів > PACK_THRESHOLD.
   */
  function packOldMonths(force = false) {
    if (!force && keyCount <= PACK_THRESHOLD) return 0;
    const now = parseKey(todayKey());
    const limit = monthKey(keyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    const byMonth = new Map();
    for (const id of entries.keys()) {
      const m = monthKey(id);
      if (m >= limit) continue;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(id);
    }
    let saved = 0;
    for (const [month, ids] of byMonth) {
      const loose = ids.filter((id) => !packOf.has(id));
      if (!loose.length) continue;
      ids.sort();
      // Жадібно розкладаємо записи місяця по пакетах до ~4 КБ.
      const chunks = [[]];
      let size = 2;
      for (const id of ids) {
        const len = JSON.stringify(entries.get(id)).length + id.length + 4;
        if (size + len > PACK_BUDGET && chunks.at(-1).length) {
          chunks.push([]);
          size = 2;
        }
        chunks.at(-1).push(id);
        size += len;
      }
      const oldKeys = [...packs.keys()].filter((k) => k.startsWith(`m_${month}_`));
      chunks.forEach((chunk, n) => {
        const key = packKey(month, n);
        packs.set(key, new Set(chunk));
        chunk.forEach((id) => packOf.set(id, key));
        writePack(key);
      });
      for (const k of oldKeys) {
        const n = Number(k.split('_')[2]);
        if (n >= chunks.length) { packs.delete(k); storage.remove(k); }
      }
      // Окремі ключі видаляються лише після запису пакетів — черга зберігає порядок.
      for (const id of loose) storage.remove(entryKey(id.slice(0, 10), id.slice(11)));
      saved += loose.length - chunks.length;
    }
    keyCount -= Math.max(0, saved);
    return saved;
  }

  async function pull() {
    const gen = storage.writes;
    const values = await readAll();
    if (!storage.idle || storage.writes !== gen) return false;
    const parsed = ingest(values);
    if (parsed.keyCount === 0) return false;
    entries = parsed.entries;
    packOf = parsed.packOf;
    packs = parsed.packs;
    broken = parsed.broken;
    keyCount = parsed.keyCount;
    settings = normalizeSettings(parsed.settingsRaw, settings.startDate);
    // Досягнення не замінюються, а зливаються: застарілий запис з іншого пристрою не забирає отримане тут.
    const cloudAch = normalizeAch(parsed.achRaw);
    ach = mergeAch(ach, cloudAch);
    if (!sameAch(ach, cloudAch)) writeAch();
    loadedAt = Date.now();
    emit();
    return true;
  }

  /**
   * Записати ach злиттям: прямо перед записом читається те, що в сховищі, і обʼєднується з локальним
   * (mergeAch). Потім локальний набір підтягує дати, що прийшли зі сховища. Проміс — { before } зі storage.update.
   */
  function writeAch() {
    return storage.update(ACH_KEY, (raw) => JSON.stringify(mergeAch(normalizeAch(parseJson(raw)), ach))).then((res) => {
      if (res.before !== null) {
        const next = mergeAch(ach, normalizeAch(parseJson(res.before)));
        if (!sameAch(next, ach)) { ach = next; emit(); }
      }
      return res;
    });
  }

  const api = {
    get settings() { return settings; },
    get entries() { return entries; },
    get ach() { return ach; },
    get mode() { return storage.mode; },
    stats: () => ({ keys: keyCount, entries: entries.size, packs: packs.size, broken }),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    async load() {
      const values = await readAll();
      const parsed = ingest(values);
      const empty = parsed.keyCount === 0;
      entries = parsed.entries;
      packOf = parsed.packOf;
      packs = parsed.packs;
      broken = parsed.broken;
      keyCount = parsed.keyCount;
      ach = normalizeAch(parsed.achRaw);
      if (empty) {
        seed();
      } else {
        const fallbackStart = earliestDate(entries) || todayKey();
        settings = normalizeSettings(parsed.settingsRaw, fallbackStart);
        if (!parsed.settingsRaw) storage.set(SETTINGS_KEY, JSON.stringify(settings));
      }
      loadedAt = Date.now();
      packOldMonths();
      emit();
    },

    /**
     * Підтягнути зміни з іншого пристрою (якщо немає незбережених записів). Не частіше ніж раз на minAgeMs;
     * одночасні виклики (focus + visibilitychange) — один запит. Якщо під час читання щось записали
     * (навіть уже встигли зберегти) — прочитане могло застаріти, тож нічого не застосовуємо.
     */
    refresh(minAgeMs = 20000) {
      if (refreshing) return refreshing;
      if (!settings || Date.now() - loadedAt < minAgeMs || !storage.idle) return Promise.resolve(false);
      refreshing = pull().finally(() => { refreshing = null; });
      return refreshing;
    },

    getEntry: (date, habit) => entries.get(entryId(date, habit)) || null,

    /** Створює або оновлює запис. `patch` зливається з наявним записом. */
    saveEntry(date, habit, patch) {
      if (!HABIT_IDS.includes(habit)) throw new Error('Невідома звичка');
      const id = entryId(date, habit);
      const prev = entries.get(id);
      const entry = withDerived(date, habit, { ...(prev || { ts: new Date().toISOString() }), ...patch });
      const key = entryKey(date, habit);
      storage.set(key, JSON.stringify(entry));
      if (!prev) keyCount++;
      entries.set(id, entry);
      if (packOf.has(id)) unpack(id);
      else packOldMonths();
      emit();
      return entry;
    },

    deleteEntry(date, habit) {
      const id = entryId(date, habit);
      if (!entries.has(id)) return;
      const wasPacked = packOf.has(id);
      entries.delete(id);
      if (wasPacked) unpack(id);
      storage.remove(entryKey(date, habit));
      if (!wasPacked) keyCount--;
      emit();
    },

    /** mutator отримує копію налаштувань і повертає нову версію. */
    updateSettings(mutator) {
      const draft = structuredClone(settings);
      const next = normalizeSettings(mutator(draft) || draft, settings.startDate);
      storage.set(SETTINGS_KEY, JSON.stringify(next));
      settings = next;
      emit();
      return next;
    },

    /**
     * Позначити досягнення отриманими (дата — сьогодні). Уже отримані не перезаписуються.
     * Пишеться одним ключем `ach` через ту саму чергу, що й записи, злиттям з тим, що зараз у сховищі
     * (див. writeAch). Повертає { added, fresh }: added — id, нові для цього пристрою (одразу в ach);
     * fresh — проміс зі списком тих із них, яких не було й у сховищі, тобто справді нових (їх і святкувати).
     * Решту вже отримав інший пристрій: беремо його дату, шторку не показуємо.
     */
    grantAchievements(ids, date = todayKey()) {
      const add = ids.filter((id) => ACH_ID_RE.test(id) && !ach[id]);
      if (!add.length) return { added: [], fresh: Promise.resolve([]) };
      const next = { ...ach };
      for (const id of add) next[id] = date;
      if (!Object.keys(ach).length) keyCount++;
      ach = next;
      emit();
      const fresh = writeAch().then(({ before }) => {
        if (before === null) return add.filter((id) => ach[id]);
        const cloud = normalizeAch(parseJson(before));
        return add.filter((id) => ach[id] && !cloud[id]);
      });
      return { added: add, fresh };
    },

    /** Попередні теми англійської — для автопідказок (новіші першими, без повторів). */
    topics() {
      const seen = new Map();
      const list = [...entries.entries()]
        .filter(([id, e]) => id.endsWith(':eng') && e.topic)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (const [, e] of list) {
        const k = e.topic.toLowerCase();
        if (!seen.has(k)) seen.set(k, e.topic);
      }
      return [...seen.values()];
    },

    /** Остання невиконана домашка (з дати не пізніше за `upTo`). */
    openHomework(upTo = todayKey()) {
      const ids = [...entries.keys()].filter((id) => id.endsWith(':eng') && id.slice(0, 10) <= upTo).sort().reverse();
      for (const id of ids) {
        const e = entries.get(id);
        if (e.s !== 'done') continue;
        if (e.hw?.text && e.hw.done !== true) return { date: id.slice(0, 10), entry: e };
        if (e.hw?.text) return null; // остання домашка вже виконана
      }
      return null;
    },

    /** Лише для браузерного режиму: стерти все і почати з нуля. */
    async wipe() {
      const keys = await storage.getKeys();
      keys.forEach((k) => storage.remove(k));
      entries = new Map();
      packOf = new Map();
      packs = new Map();
      ach = {};
      keyCount = 0;
      seed();
      emit();
    },

    packOldMonths,
  };
  return api;
}
