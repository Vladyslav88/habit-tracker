// Імітація Telegram CloudStorage: одна «хмара» на кілька пристроїв (нової і старої версій), керований годинник.
import assert from 'node:assert/strict';
import { createStorage } from '../../js/storage.js';
import { createStore } from '../../js/store.js';

export function createCloud(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = []; // [op, key] — щоб перевіряти, що завантаження нічого не пише
  return {
    map,
    writes,
    json: (k) => JSON.parse(map.get(k)),
    keys: (re) => [...map.keys()].filter((k) => re.test(k)).sort(),
    snapshot: () => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1))),
    /** Бекенд одного пристрою: можна вимкнути мережу. */
    backend() {
      const dev = { online: true };
      const wait = async () => { await null; if (!dev.online) throw new Error('offline'); };
      dev.backend = {
        mode: 'cloud',
        async getKeys() { await wait(); return [...map.keys()]; },
        async getItems(keys) { await wait(); return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ''])); },
        async setItem(k, v) { await wait(); writes.push(['set', k]); map.set(k, v); return true; },
        async removeItems(keys) { await wait(); keys.forEach((k) => { writes.push(['remove', k]); map.delete(k); }); return true; },
      };
      return dev;
    },
  };
}

export const tick = () => new Promise((r) => setTimeout(r, 0));

export async function settle(storage, limit = 500) {
  for (let i = 0; i < limit && !storage.idle; i++) await tick();
  assert.ok(storage.idle, 'черга записів не спорожніла');
}

/** Пристрій: impl — модулі нової (за замовчуванням) або старої версії { createStorage, createStore }. */
export async function device(cloud, impl = { createStorage, createStore }) {
  const dev = cloud.backend();
  const storage = impl.createStorage(null, dev.backend);
  const store = impl.createStore(storage);
  await store.load();
  await settle(storage);
  return {
    dev,
    storage,
    store,
    settle: () => settle(storage),
    /** refresh без тротлінгу 20 с. */
    refresh: () => store.refresh(0),
    offline() { dev.online = false; },
    async online() { dev.online = true; storage.retry(); await settle(storage); },
  };
}

/** Керований годинник: new Date() / Date.now() повертають встановлений момент. */
export function mockClock(start) {
  const Real = globalThis.Date;
  let now = typeof start === 'number' ? start : Real.parse(start);
  class Clock extends Real {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
  }
  globalThis.Date = Clock;
  return {
    set(t) { now = typeof t === 'number' ? t : Real.parse(t); },
    advance(ms) { now += ms; },
    restore() { globalThis.Date = Real; },
  };
}

/** Мапа записів як { id: JSON } — для порівняння станів між пристроями й версіями. */
export const dump = (map) => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, e]) => [id, JSON.stringify(e)]));
