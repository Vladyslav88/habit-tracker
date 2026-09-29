// Характеризаційні тести сховища записів (етап 0 плану «власні звички»): формат ключів і записів,
// похідні поля (бонус, День програми), пакети старих місяців, автопідказки тем, відкрита домашка.
// Формат даних у хмарі не має змінитися від рефакторингу — еталони в tests/golden/store.json.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEntry } from '../js/entry.js';
import { createStorage } from '../js/storage.js';
import { createStore } from '../js/store.js';
import { cloudValues } from './fixtures/history.mjs';
import { freezeTime, useGolden } from './helpers/golden.mjs';

const golden = useGolden(new URL('./golden/store.json', import.meta.url));
freezeTime(Date.UTC(2027, 0, 20, 9, 0, 0)); // «сьогодні» — 20 січня 2027

function memoryCloud(initial = {}) {
  const map = new Map(Object.entries(initial));
  const backend = {
    mode: 'cloud',
    getKeys: async () => [...map.keys()],
    getItems: async (keys) => Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ''])),
    setItem: async (k, v) => { map.set(k, v); return true; },
    removeItems: async (keys) => { keys.forEach((k) => map.delete(k)); return true; },
  };
  return { map, backend };
}

async function open(initial) {
  const cloud = memoryCloud(initial);
  const storage = createStorage(null, cloud.backend);
  const store = createStore(storage);
  await store.load();
  const settle = async () => { for (let i = 0; i < 500 && !storage.idle; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return { cloud, storage, store, settle };
}

const snapshot = (map) => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1)));
const entriesOf = (store) => Object.fromEntries([...store.entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, e]) => [id, JSON.stringify(e)]));

test('normalizeEntry: крайні випадки й порядок полів', () => {
  const cases = {
    trainDone: ['train', { s: 'done', day: 2, dur: '60-70', back: true, energy: 4, reasons: ['tired'], comment: '  ок  ', ts: '2026-10-01T10:00:00.000Z', topic: 'зайве' }],
    trainMiss: ['train', { s: 'miss', day: 3, dur: 'gt70', back: false, energy: 9, reasons: ['back', 'nope', 'tired'], ts: '2026-10-01T10:00:00.000Z' }],
    trainJunk: ['train', { s: 'done', bonus: 'так', day: 4, dur: '90', back: 'ні', energy: 2.5, reasons: 'tired', comment: 5, ts: 'вчора' }],
    engDone: ['eng', { s: 'done', bonus: true, topic: ` ${'т'.repeat(200)} `, hw: { text: 'Впр. 5', done: true }, energy: 5, ts: '2026-10-01T10:00:00.000Z', dur: 'lt60' }],
    engHwEmpty: ['eng', { s: 'done', hw: { text: '  ', done: null }, ts: '2026-10-01T10:00:00.000Z' }],
    engHwOnlyState: ['eng', { s: 'done', hw: { done: false }, ts: '2026-10-01T10:00:00.000Z' }],
    engMiss: ['eng', { s: 'miss', topic: 'Тема', hw: { text: 'x', done: true }, reasons: ['sick', 'sick', 'other'], comment: 'к'.repeat(900), ts: '2026-10-01T10:00:00.000Z' }],
  };
  const out = {};
  for (const [name, [habit, raw]] of Object.entries(cases)) out[name] = JSON.stringify(normalizeEntry(habit, raw));
  golden('normalizeEntry', out);
  assert.throws(() => normalizeEntry('read', { s: 'done' }), /Невідома звичка/);
  assert.throws(() => normalizeEntry('train', { s: 'maybe' }), /Статус/);
  assert.throws(() => normalizeEntry('eng', null), /Статус/);
});

test('завантаження: пакети, окремі ключі поверх пакетів, зіпсовані й невідомі ключі', async () => {
  const values = cloudValues();
  // Пакет за серпень: один запис перекривається окремим ключем, один — зіпсований, один — невідомої звички.
  values['m_2026-08_0'] = JSON.stringify({
    '2026-08-24_train': { s: 'miss', reasons: ['tired'], ts: '2026-08-24T18:00:00.000Z' },
    '2026-08-20_eng': { s: 'done', topic: 'З пакета', ts: '2026-08-20T18:00:00.000Z' },
    '2026-08-21_read': { s: 'done', ts: '2026-08-21T18:00:00.000Z' },
    '2026-08-22_eng': { s: 'broken' },
  });
  values['e_2026-08-30_read'] = JSON.stringify({ s: 'done' });
  values['e_2026-08-31_train'] = 'не json';
  values.garbage_key = 'x';
  const { store, cloud } = await open(values);
  golden('load/entries', entriesOf(store));
  golden('load/stats', store.stats());
  // Етап 4.2: записи звички `read` (пакет і окремий ключ) — невідомої звички, не зіпсовані: не показуються, не губляться.
  assert.equal(store.orphanCount, 2);
  assert.equal(store.getEntry('2026-08-21', 'read'), null);
  golden('load/settings', store.settings);
  assert.equal(cloud.map.size, Object.keys(values).length, 'завантаження нічого не пише');
});

test('seed: порожнє сховище отримує налаштування й початкову історію', async () => {
  const { cloud, store } = await open({});
  const values = snapshot(cloud.map);
  // ts початкової історії — опівдні за місцевим часом (залежить від часового поясу машини), тому без нього.
  for (const k of Object.keys(values)) if (k.startsWith('e_')) values[k] = { ...JSON.parse(values[k]), ts: '<noon>' };
  golden('seed/cloud', values);
  golden('seed/stats', store.stats());
});

test('saveEntry: похідні поля, очищення, ключі', async () => {
  const { cloud, store, settle } = await open(cloudValues());
  const out = {};
  const save = (name, date, habit, patch) => { out[name] = store.saveEntry(date, habit, patch); };
  save('plannedTrain', '2027-01-18', 'train', { s: 'done' }); // пн, День 1 з розкладу
  save('plannedTrainKeepsDay', '2027-01-20', 'train', { s: 'done', day: 3 });
  save('bonusTrainSunday', '2027-01-17', 'train', { s: 'done' }); // неділя — бонус, День не підставляється
  save('missUnplanned', '2027-01-16', 'train', { s: 'miss' }); // пропуск поза планом — не бонус
  save('engInPause', '2027-03-02', 'eng', { s: 'done', topic: 'Pause topic' }); // відкрита пауза → бонус
  save('trainToMiss', '2027-01-11', 'train', { s: 'miss', reasons: ['tired'] }); // було done з тривалістю
  save('engToMiss', '2027-01-12', 'eng', { s: 'miss' }); // була тема й домашка
  save('mergePatch', '2027-01-19', 'eng', { comment: 'Дописав коментар' });
  assert.throws(() => store.saveEntry('2027-01-20', 'read', { s: 'done' }), /Невідома звичка/);
  golden('saveEntry/results', out);
  await settle();
  const keys = ['e_2027-01-18_train', 'e_2027-01-17_train', 'e_2027-01-11_train', 'e_2027-01-12_eng', 'e_2027-03-02_eng', 'e_2027-01-19_eng'];
  golden('saveEntry/cloud', Object.fromEntries(keys.map((k) => [k, cloud.map.get(k)])));
  golden('saveEntry/stats', store.stats());

  store.deleteEntry('2027-01-18', 'train');
  store.deleteEntry('2027-01-18', 'train'); // повторно — нічого
  await settle();
  assert.equal(cloud.map.has('e_2027-01-18_train'), false);
  assert.equal(store.getEntry('2027-01-18', 'train'), null);
  golden('deleteEntry/stats', store.stats());
});

test('topics і openHomework', async () => {
  const { store } = await open(cloudValues());
  golden('topics', store.topics());
  const hw = {};
  for (const upTo of ['2026-09-10', '2026-10-09', '2026-12-11', '2027-01-20', '2027-03-03']) {
    const r = store.openHomework(upTo);
    hw[upTo] = r && { date: r.date, entry: r.entry };
  }
  golden('openHomework', hw);
  store.saveEntry('2027-03-02', 'eng', { s: 'done', hw: { text: 'Нова', done: true } });
  const r = store.openHomework('2027-03-03');
  golden('openHomework/after-done', r && { date: r.date, entry: r.entry });
});

test('packOldMonths: пакування, перечитування, розпакування при редагуванні', async () => {
  const { cloud, store, settle } = await open(cloudValues());
  const before = entriesOf(store);
  const saved = store.packOldMonths(true);
  await settle();
  golden('pack/saved', saved);
  golden('pack/keys', [...cloud.map.keys()].sort());
  golden('pack/2026-10', Object.fromEntries([...cloud.map].filter(([k]) => k.startsWith('m_2026-10'))));
  golden('pack/stats', store.stats());

  const again = await open(snapshot(cloud.map));
  assert.deepEqual(entriesOf(again.store), before, 'після пакування записи ті самі');

  again.store.saveEntry('2026-10-06', 'eng', { comment: 'Редагування запакованого' });
  again.store.deleteEntry('2026-10-08', 'eng');
  await again.settle();
  golden('pack/after-edit/keys', [...again.cloud.map.keys()].filter((k) => k.includes('2026-10')).sort());
  golden('pack/after-edit/stats', again.store.stats());
  const third = await open(snapshot(again.cloud.map));
  assert.deepEqual(entriesOf(third.store), entriesOf(again.store));
});
