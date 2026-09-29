// Адаптер сховища (SPEC §1, §4): Telegram CloudStorage або localStorage + черга записів.
//
// Обмеження CloudStorage: ключ 1–128 символів лише з A-Z a-z 0-9 _ - ,
// значення до 4096 символів, до 1024 ключів на користувача.

export const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const VALUE_MAX = 4096;
export const KEYS_MAX = 1024;

const LOCAL_PREFIX = 'ht_';
const CALL_TIMEOUT = 12000;
const GET_CHUNK = 50;
const MAX_AUTO_RETRIES = 8;

export class StorageError extends Error {}

function cloudBackend(cs) {
  const call = (method, ...args) => new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new StorageError('Telegram не відповідає'));
    }, CALL_TIMEOUT);
    try {
      cs[method](...args, (err, res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(new StorageError(String(err)));
        else resolve(res);
      });
    } catch (e) {
      settled = true;
      clearTimeout(timer);
      reject(e);
    }
  });

  return {
    mode: 'cloud',
    getKeys: async () => (await call('getKeys')) || [],
    async getItems(keys) {
      const out = {};
      for (let i = 0; i < keys.length; i += GET_CHUNK) {
        Object.assign(out, await call('getItems', keys.slice(i, i + GET_CHUNK)));
      }
      return out;
    },
    setItem: (key, value) => call('setItem', key, value),
    removeItems: (keys) => call('removeItems', keys),
  };
}

function localBackend(ls) {
  return {
    mode: 'local',
    async getKeys() {
      const keys = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(LOCAL_PREFIX)) keys.push(k.slice(LOCAL_PREFIX.length));
      }
      return keys;
    },
    async getItems(keys) {
      return Object.fromEntries(keys.map((k) => [k, ls.getItem(LOCAL_PREFIX + k) ?? '']));
    },
    async setItem(key, value) {
      ls.setItem(LOCAL_PREFIX + key, value);
      return true;
    },
    async removeItems(keys) {
      keys.forEach((k) => ls.removeItem(LOCAL_PREFIX + k));
      return true;
    },
  };
}

function memoryBackend() {
  const map = new Map();
  return {
    mode: 'memory',
    getKeys: async () => [...map.keys()],
    getItems: async (keys) => Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ''])),
    setItem: async (k, v) => { map.set(k, v); return true; },
    removeItems: async (keys) => { keys.forEach((k) => map.delete(k)); return true; },
  };
}

function pickBackend(tg) {
  if (tg && tg.isVersionAtLeast('6.9') && tg.CloudStorage) return cloudBackend(tg.CloudStorage);
  try {
    const ls = window.localStorage;
    ls.setItem(`${LOCAL_PREFIX}probe`, '1');
    ls.removeItem(`${LOCAL_PREFIX}probe`);
    return localBackend(ls);
  } catch {
    return memoryBackend();
  }
}

export function validate(key, value) {
  if (!KEY_RE.test(key)) throw new StorageError(`Недопустимий ключ: ${key}`);
  if (value !== undefined && (typeof value !== 'string' || value.length > VALUE_MAX)) {
    throw new StorageError(`Запис завеликий (${value.length} із ${VALUE_MAX} символів)`);
  }
}

/**
 * Сховище з чергою записів. Записи в один ключ зливаються (перемагає останній),
 * порядок різних ключів зберігається, помилка блокує чергу до успішного повтору —
 * тож швидкі повторні тапи нічого не гублять і не перемішують.
 * update(key, fn) — запис зі злиттям: прямо перед записом читає поточне значення зі сховища
 * і пише fn(поточне). Так значення, яке пишуть кілька пристроїв (досягнення), не затирається.
 */
export function createStorage(tg, backend = pickBackend(tg)) {
  // key → { op: 'set' | 'remove' | 'update', value?, fn?, waiters: [resolve] }
  const pending = new Map();
  const listeners = new Set();
  let inflight = null; // операція, що саме зараз пишеться
  let writes = 0; // лічильник поставлених у чергу операцій — щоб refresh помітив запис під час читання
  let running = false;
  let retryTimer = null;
  let failures = 0;
  let status = 'saved';
  let lastError = null;

  const setStatus = (s) => {
    if (s === status) return;
    status = s;
    listeners.forEach((fn) => fn(s));
  };

  function kick() {
    if (running) return;
    if (retryTimer) {
      if (failures < MAX_AUTO_RETRIES) return; // уже чекаємо на повтор
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (failures >= MAX_AUTO_RETRIES) failures = 0;
    queueMicrotask(run);
  }

  async function run() {
    if (running || !pending.size) return;
    running = true;
    retryTimer = null;
    setStatus('saving');
    while (pending.size) {
      const [key, item] = pending.entries().next().value;
      inflight = item;
      try {
        let before = null;
        if (item.op === 'update') {
          before = (await backend.getItems([key]))[key] ?? '';
          const value = item.fn(before);
          validate(key, value);
          await backend.setItem(key, value);
        } else if (item.op === 'set') await backend.setItem(key, item.value);
        else await backend.removeItems([key]);
        inflight = null;
        if (pending.get(key) === item) pending.delete(key);
        item.waiters.forEach((w) => w({ before }));
        failures = 0;
        lastError = null;
      } catch (e) {
        inflight = null;
        failures++;
        lastError = e;
        running = false;
        setStatus('error');
        if (failures < MAX_AUTO_RETRIES) {
          retryTimer = setTimeout(run, Math.min(30000, 1000 * 2 ** (failures - 1)));
        } else {
          retryTimer = -1; // автоповтори вичерпано — чекаємо на користувача
        }
        return;
      }
    }
    running = false;
    setStatus('saved');
  }

  /** carry — забрати очікувачів непочатої операції; інакше вони дізнаються, що їхнє злиття скасовано. */
  function enqueue(key, item, carry = false) {
    const prev = pending.get(key);
    if (prev && prev !== inflight && prev.waiters.length) {
      if (carry) item.waiters.unshift(...prev.waiters);
      else prev.waiters.forEach((w) => w({ before: null }));
    }
    writes++;
    pending.set(key, item);
    kick();
  }

  return {
    mode: backend.mode,
    get status() { return status; },
    get lastError() { return lastError; },
    get idle() { return !pending.size && !running; },
    get writes() { return writes; },
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    getKeys: () => backend.getKeys(),
    getItems: (keys) => backend.getItems(keys),

    /** Незбережені операції — щоб накласти їх поверх свіжо завантажених даних. */
    pendingOps: () => new Map(pending),

    set(key, value) {
      validate(key, value);
      enqueue(key, { op: 'set', value, waiters: [] });
    },
    remove(key) {
      validate(key);
      enqueue(key, { op: 'remove', waiters: [] });
    },
    /**
     * Запис зі злиттям: fn(поточне значення в сховищі або '') → нове значення. Має бути чистою
     * й ідемпотентною (при помилці викликається ще раз). Проміс — { before } після успішного запису:
     * що лежало в сховищі перед ним (null — злиття не знадобилось: ключ перезаписали через set/remove).
     */
    update(key, fn) {
      validate(key);
      return new Promise((resolve) => {
        const prev = pending.get(key);
        const queued = prev && prev !== inflight ? prev : null;
        // Ще не почате злиття замінюємо новим (fn бере найсвіжіший стан); поверх set/remove у черзі —
        // зливаємо з тим, що мало записатися. Очікувачі попередньої операції переходять до нової.
        if (queued && queued.op !== 'update') {
          enqueue(key, { op: 'set', value: fn(queued.op === 'set' ? queued.value : ''), waiters: [resolve] }, true);
        } else {
          enqueue(key, { op: 'update', fn, waiters: [resolve] }, true);
        }
      });
    },
    retry() {
      if (running) return;
      if (retryTimer && retryTimer !== -1) clearTimeout(retryTimer);
      retryTimer = null;
      failures = 0;
      queueMicrotask(run);
    },
  };
}
