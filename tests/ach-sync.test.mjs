// Синхронізація досягнень (`ach`) між двома пристроями (SPEC §8, v0.4.2).
// Запуск: node --test tests/*.test.mjs   (без npm; потрібен Node 22+)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStorage } from '../js/storage.js';
import { createStore, mergeAch, normalizeAch } from '../js/store.js';

// ——— Імітація Telegram CloudStorage: одна «хмара» на кілька пристроїв ———

function createCloud(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get: (k) => map.get(k),
    json: (k) => JSON.parse(map.get(k)),
    /** Бекенд одного пристрою: можна вимкнути мережу або притримати виклики (gate). */
    device() {
      const dev = {
        online: true,
        gate: null,
        calls: { getKeys: 0 },
        async wait() {
          if (dev.gate) await dev.gate.promise;
          await null; // виклик завжди асинхронний, як у Telegram
          if (!dev.online) throw new Error('offline');
        },
        hold() {
          let release;
          dev.gate = { promise: new Promise((r) => { release = r; }) };
          return () => { dev.gate = null; release(); };
        },
      };
      dev.backend = {
        mode: 'cloud',
        async getKeys() { dev.calls.getKeys++; await dev.wait(); return [...map.keys()]; },
        async getItems(keys) { await dev.wait(); return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ''])); },
        async setItem(k, v) { await dev.wait(); map.set(k, v); return true; },
        async removeItems(keys) { await dev.wait(); keys.forEach((k) => map.delete(k)); return true; },
      };
      return dev;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(storage, limit = 200) {
  for (let i = 0; i < limit && !storage.idle; i++) await tick();
  assert.ok(storage.idle, 'черга записів не спорожніла');
}

async function device(cloud) {
  const dev = cloud.device();
  const storage = createStorage(null, dev.backend);
  const store = createStore(storage);
  await store.load();
  await settle(storage);
  return { dev, storage, store };
}

const SETTINGS = JSON.stringify({ schemaVersion: 1, startDate: '2026-09-01', pauses: [] });
function cloudWith(ach) {
  const init = { settings: SETTINGS, 'e_2026-09-01_train': JSON.stringify({ s: 'done', ts: '2026-09-01T09:00:00.000Z' }) };
  if (ach !== undefined) init.ach = typeof ach === 'string' ? ach : JSON.stringify(ach);
  return createCloud(init);
}

// ——— mergeAch: чиста, найраніша дата, ідемпотентна ———

test('mergeAch: обʼєднання за id, при конфлікті — найраніша дата', () => {
  const a = Object.freeze({ first_step: '2026-09-10', streak_5: '2026-09-20' });
  const b = Object.freeze({ first_step: '2026-09-05', polyglot_25: '2026-10-01' });
  assert.deepEqual(mergeAch(a, b), { first_step: '2026-09-05', streak_5: '2026-09-20', polyglot_25: '2026-10-01' });
  assert.deepEqual(mergeAch(a, b), mergeAch(b, a), 'порядок аргументів не важить');
  // входи заморожені: будь-яка спроба їх змінити кинула б помилку в strict mode
  assert.deepEqual(a, { first_step: '2026-09-10', streak_5: '2026-09-20' });
});

test('mergeAch: повторне застосування не змінює результат (ідемпотентність)', () => {
  const a = { first_step: '2026-09-10', streak_5: '2026-09-20' };
  const b = { first_step: '2026-09-05', winter_grit: '2027-01-12' };
  const m = mergeAch(a, b);
  assert.deepEqual(mergeAch(m, m), m);
  assert.deepEqual(mergeAch(m, a), m);
  assert.deepEqual(mergeAch(m, b), m);
  assert.deepEqual(mergeAch(mergeAch(m, b), b), m);
  assert.deepEqual(mergeAch({}, m), m);
  assert.notEqual(mergeAch(m, {}), m, 'повертає новий обʼєкт, а не той самий');
});

// ——— Сценарії двох пристроїв ———

test('застарілий Desktop пише ach поверх новішого з iPhone — нічого не губиться', async () => {
  const cloud = cloudWith({ first_step: '2026-09-01' });
  const iphone = await device(cloud);
  const desktop = await device(cloud); // завантажився зараз і далі не оновлюється

  const r1 = iphone.store.grantAchievements(['streak_5'], '2026-09-10');
  assert.deepEqual(await r1.fresh, ['streak_5']);
  await settle(iphone.storage);

  // Desktop досі думає, що в хмарі лише first_step
  assert.equal(desktop.store.ach.streak_5, undefined);
  const r2 = desktop.store.grantAchievements(['first_snow'], '2026-12-02');
  assert.deepEqual(await r2.fresh, ['first_snow']);
  await settle(desktop.storage);

  assert.deepEqual(cloud.json('ach'), { first_step: '2026-09-01', streak_5: '2026-09-10', first_snow: '2026-12-02' });
  // Desktop заодно дізнався про streak_5 з датою iPhone — і не видасть його ще раз
  assert.equal(desktop.store.ach.streak_5, '2026-09-10');
});

test('пристрій старої версії (0.4.0/0.4.1) затер ach — refresh на 0.4.2 повертає втрачене з першою датою', async () => {
  const cloud = cloudWith({ first_step: '2026-09-01' });
  const iphone = await device(cloud);
  await iphone.store.grantAchievements(['streak_5'], '2026-09-10').fresh;
  await settle(iphone.storage);

  // Стара версія пише весь обʼєкт зі свого застарілого стану
  cloud.map.set('ach', JSON.stringify({ first_step: '2026-09-01', first_snow: '2026-12-02' }));

  assert.equal(await iphone.store.refresh(0), true);
  await settle(iphone.storage);
  assert.deepEqual(iphone.store.ach, { first_step: '2026-09-01', streak_5: '2026-09-10', first_snow: '2026-12-02' });
  assert.deepEqual(cloud.json('ach'), iphone.store.ach, 'злите записано назад у хмару');
  // Нічого не видається повторно: streak_5 уже є локально
  assert.deepEqual(iphone.store.grantAchievements(['streak_5']).added, []);
});

test('офлайн-черга з ach зливається з хмарою після повернення мережі', async () => {
  const cloud = cloudWith({ first_step: '2026-09-01' });
  const iphone = await device(cloud);
  const desktop = await device(cloud);

  iphone.dev.online = false;
  const a = iphone.store.grantAchievements(['streak_5'], '2026-09-10');
  const b = iphone.store.grantAchievements(['polyglot_25'], '2026-09-11'); // друге злиття в той самий ключ
  let celebrated = null;
  Promise.all([a.fresh, b.fresh]).then((x) => { celebrated = x; });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(iphone.storage.status, 'error');
  assert.equal(celebrated, null, 'поки запис не вдався — шторки немає');

  // Тим часом Desktop отримав інше і записав
  await desktop.store.grantAchievements(['first_snow'], '2026-12-02').fresh;
  await settle(desktop.storage);

  iphone.dev.online = true;
  iphone.storage.retry();
  await settle(iphone.storage);
  assert.deepEqual(cloud.json('ach'), { first_step: '2026-09-01', streak_5: '2026-09-10', polyglot_25: '2026-09-11', first_snow: '2026-12-02' });
  await tick();
  assert.deepEqual(celebrated, [['streak_5'], ['polyglot_25']], 'обидва очікувачі дочекались одного злитого запису');
  assert.equal(iphone.store.ach.first_snow, '2026-12-02', 'iPhone підхопив чуже з хмари');
});

test('гонка: обидва видають те саме досягнення — святкує лише той, чий запис був першим', async () => {
  // iPhone записав відмітку, а ach ще в дорозі (повільна мережа); Desktop тим часом теж побачив умову.
  const cloud = cloudWith({ first_step: '2026-09-01' });
  const iphone = await device(cloud);
  const desktop = await device(cloud);

  const release = iphone.dev.hold();
  const onIphone = iphone.store.grantAchievements(['streak_5'], '2026-09-10');
  const onDesktop = desktop.store.grantAchievements(['streak_5'], '2026-09-10');
  assert.deepEqual(await onDesktop.fresh, ['streak_5'], 'Desktop записав першим — святкує він');
  release();
  assert.deepEqual(await onIphone.fresh, [], 'iPhone бачить, що в хмарі вже є — шторки немає');
  await settle(iphone.storage);
  assert.deepEqual(cloud.json('ach'), { first_step: '2026-09-01', streak_5: '2026-09-10' });
});

test('гонка з різними датами (близько півночі): святкує перший, дата — найраніша', async () => {
  const cloud = cloudWith({});
  const iphone = await device(cloud);
  const desktop = await device(cloud);
  assert.deepEqual(await iphone.store.grantAchievements(['first_step'], '2026-09-30').fresh, ['first_step']);
  await settle(iphone.storage);
  assert.deepEqual(await desktop.store.grantAchievements(['first_step'], '2026-10-01').fresh, []);
  await settle(desktop.storage);
  assert.equal(cloud.json('ach').first_step, '2026-09-30');
  assert.equal(desktop.store.ach.first_step, '2026-09-30', 'Desktop узяв дату iPhone');
});

test('межа без CAS: читання обох до запису будь-кого — дані все одно не губляться', async () => {
  // Обидва прочитали хмару, поки жоден не записав. Атомарного «порівняти й записати» в CloudStorage
  // немає, тож тут шторку побачать обидва (вікно — один мережевий запит). Головне: нічого не втрачено.
  const cloud = cloudWith({});
  const iphone = await device(cloud);
  const desktop = await device(cloud);
  const read = { n: 0 };
  for (const d of [iphone, desktop]) {
    const orig = d.dev.backend.setItem;
    d.dev.backend.setItem = async (...args) => {
      read.n++;
      while (read.n < 2) await tick(); // обидва вже прочитали
      return orig(...args);
    };
  }
  const [a, b] = [iphone.store.grantAchievements(['streak_5'], '2026-09-10'), desktop.store.grantAchievements(['polyglot_25'], '2026-09-10')];
  await Promise.all([a.fresh, b.fresh]);
  // Кожен записав свій знімок; наступний refresh (або запис) зливає і повертає втрачене.
  await iphone.store.refresh(0);
  await desktop.store.refresh(0);
  await settle(iphone.storage);
  await settle(desktop.storage);
  assert.deepEqual(normalizeAch(cloud.json('ach')), { streak_5: '2026-09-10', polyglot_25: '2026-09-10' });
});

// ——— Сумісність зі старими даними ———

test('дані 0.4.0: ach читається як є, невідомі id не губляться, запис лише додає', async () => {
  const cloud = cloudWith({ first_step: '2026-09-29', future_badge: '2027-01-01', 'bad id!': 'x', streak_5: 'не дата' });
  const d = await device(cloud);
  assert.deepEqual(d.store.ach, { first_step: '2026-09-29', future_badge: '2027-01-01' });
  assert.deepEqual(await d.store.grantAchievements(['first_step', 'streak_5'], '2026-10-02').fresh, ['streak_5']);
  await settle(d.storage);
  assert.deepEqual(cloud.json('ach'), { first_step: '2026-09-29', future_badge: '2027-01-01', streak_5: '2026-10-02' });
});

test('дані до 0.4.0 (ключа ach немає) і зіпсований ach: працює з порожнього', async () => {
  for (const raw of [undefined, '{не json', '[1,2]']) {
    const cloud = cloudWith(raw);
    const d = await device(cloud);
    assert.deepEqual(d.store.ach, {});
    const keysBefore = d.store.stats().keys;
    assert.deepEqual(await d.store.grantAchievements(['first_step'], '2026-09-01').fresh, ['first_step']);
    await settle(d.storage);
    assert.deepEqual(cloud.json('ach'), { first_step: '2026-09-01' });
    if (raw === undefined) assert.equal(d.store.stats().keys, keysBefore + 1, 'новий ключ врахований у ліміті');
  }
});

// ——— refresh і черга записів ———

test('refresh не працює, поки в черзі є записи, і не застосовує прочитане, якщо під час читання був запис', async () => {
  const cloud = cloudWith({ first_step: '2026-09-01' });
  const d = await device(cloud);

  d.dev.online = false;
  d.store.saveEntry('2026-09-02', 'train', { s: 'done' });
  assert.equal(await d.store.refresh(0), false, 'черга не порожня — refresh пропускається');
  d.dev.online = true;
  d.storage.retry();
  await settle(d.storage);

  // Хмара змінилась ззовні, а під час читання користувач відмітив ще день (і він уже встиг записатись)
  cloud.map.set('e_2026-09-03_eng', JSON.stringify({ s: 'done', ts: '2026-09-03T09:00:00.000Z' }));
  const release = d.dev.hold();
  const pending = d.store.refresh(0);
  d.store.saveEntry('2026-09-04', 'train', { s: 'done' });
  release();
  assert.equal(await pending, false, 'прочитане могло застаріти — не застосовуємо');
  await settle(d.storage);
  assert.ok(d.store.getEntry('2026-09-04', 'train'), 'локальна відмітка не зникла');
  assert.equal(await d.store.refresh(0), true, 'наступний refresh підтягує зовнішні зміни');
  assert.ok(d.store.getEntry('2026-09-03', 'eng'));
  assert.ok(d.store.getEntry('2026-09-04', 'train'));
});

test('focus + visibilitychange одночасно — один запит; тротлінг 20 с', async () => {
  const cloud = cloudWith({});
  const d = await device(cloud);
  const before = d.dev.calls.getKeys;
  assert.equal(await d.store.refresh(), false, 'щойно завантажено — тротлінг');
  assert.equal(d.dev.calls.getKeys, before);
  const [a, b] = [d.store.refresh(0), d.store.refresh(0)];
  assert.equal(a, b, 'другий виклик отримує той самий проміс');
  await a;
  assert.equal(d.dev.calls.getKeys, before + 1);
});
