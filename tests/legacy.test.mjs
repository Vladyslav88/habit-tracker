// Сумісність зі старою версією 0.4.2 (етап 4.2): на одній «хмарі» працюють нова версія з власними звичками
// і стара (дослівні копії модулів у tests/legacy/0.4.2/). Стара нічого не має губити й не має ламатися:
// додає паузу, редагує й видаляє записи, пакує старі місяці — а звички, їхні записи й пакети n_ лишаються цілими.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import * as oldStorage from './legacy/0.4.2/storage.js';
import * as oldStore from './legacy/0.4.2/store.js';
import { cloudValues } from './fixtures/history.mjs';
import { createCloud, device, dump, mockClock } from './helpers/cloud.mjs';

const clock = mockClock('2027-01-20T09:00:00.000Z');
after(() => clock.restore());

const OLD = { createStorage: oldStorage.createStorage, createStore: oldStore.createStore };
const MWF = [true, false, true, false, true, false, false];

/** Хмара з історією train/eng + дві власні звички нової версії (з записами, зокрема в старих місяцях). */
async function setup({ pack = false } = {}) {
  const cloud = createCloud(cloudValues({ ach: { first_step: '2026-09-05' } }));
  const n = await device(cloud);
  clock.set('2026-09-01T09:00:00.000Z');
  const read = n.store.createHabit({ name: 'Читання', emoji: '📖', color: 'teal', modules: ['topic'], days: MWF });
  const water = n.store.createHabit({ name: 'Вода', emoji: '💧', color: 'blue', days: [true, true, true, true, true, true, true] });
  clock.set('2027-01-20T09:00:00.000Z');
  for (const d of ['2026-09-07', '2026-09-09', '2026-10-05', '2026-12-02', '2027-01-18']) n.store.saveEntry(d, read.id, { s: 'done', topic: `Книга ${d}` });
  for (const d of ['2026-09-08', '2026-11-11', '2027-01-19']) n.store.saveEntry(d, water.id, { s: d === '2026-11-11' ? 'miss' : 'done', reasons: ['no_time'] });
  cloud.map.set('e_2026-10-06_zz99zz', JSON.stringify({ s: 'done', note: 'звичка з майбутньої версії' })); // невідома й для нової
  if (pack) n.store.packOldMonths(true);
  await n.settle();
  await n.refresh();
  return { cloud, n, read, water };
}

/** Що має лишитися цілим після дій старої версії. */
function newState(store) {
  return { habits: store.habits, custom: dump(store.customEntries), orphans: store.orphanCount };
}

test('стара версія завантажує хмару нової: без помилок, бачить ті самі train/eng, нічого зіпсованого', async () => {
  for (const pack of [false, true]) {
    const { cloud, n } = await setup({ pack });
    const writesBefore = cloud.writes.length;
    const o = await device(cloud, OLD);
    assert.deepEqual(dump(o.store.entries), dump(n.store.entries), `pack=${pack}`);
    assert.equal(o.store.stats().broken, 0, 'ключі h_, e_…_<id>, n_ стара версія пропускає, а не вважає зіпсованими');
    assert.deepEqual(o.store.settings, n.store.settings);
    assert.equal(cloud.writes.length, writesBefore, 'стара версія при завантаженні нічого не переписує');
  }
});

test('стара версія додає паузу — звички, їхні записи й налаштування нової версії цілі', async () => {
  const { cloud, n } = await setup({ pack: true });
  const before = newState(n.store);
  const o = await device(cloud, OLD);
  o.store.updateSettings((s) => { s.pauses.push({ id: 'p-old', from: '2027-01-21', to: '2027-01-24', label: 'Зі старого Desktop' }); return s; });
  await o.settle();
  await n.refresh();
  assert.ok(n.store.settings.pauses.some((p) => p.id === 'p-old'), 'нова бачить паузу');
  assert.deepEqual(newState(n.store), before);
  assert.equal(n.store.stats().broken, 0);
});

test('стара версія редагує й видаляє записи (зокрема запаковані в m_) — записи звичок і n_ цілі', async () => {
  const { cloud, n } = await setup({ pack: true });
  const before = newState(n.store);
  const nPacks = cloud.snapshot();
  const o = await device(cloud, OLD);
  o.store.saveEntry('2026-10-05', 'train', { comment: 'Правка зі старої версії' }); // запакований місяць → розпакування m_
  o.store.saveEntry('2027-01-19', 'eng', { s: 'miss', reasons: ['tired'] });
  o.store.deleteEntry('2026-11-05', 'eng');
  await o.settle();
  for (const k of Object.keys(nPacks).filter((key) => /^[hn]_/.test(key))) assert.equal(cloud.map.get(k), nPacks[k], `${k} не змінено`);
  await n.refresh();
  assert.equal(n.store.getEntry('2026-10-05', 'train').comment, 'Правка зі старої версії');
  assert.equal(n.store.getEntry('2027-01-19', 'eng').s, 'miss');
  assert.equal(n.store.getEntry('2026-11-05', 'eng'), null);
  assert.deepEqual(newState(n.store), before);
  const fresh = await device(cloud);
  assert.deepEqual(newState(fresh.store), before, 'і з нуля — те саме');
});

test('стара версія пакує старі місяці, поки записи звичок ще окремими ключами — нічого не губиться', async () => {
  const { cloud, n } = await setup({ pack: false });
  const before = newState(n.store);
  const builtin = dump(n.store.entries);
  const o = await device(cloud, OLD);
  o.store.packOldMonths(true);
  await o.settle();
  for (const k of cloud.keys(/^m_/)) for (const inner of Object.keys(cloud.json(k))) assert.match(inner, /_(train|eng)$/);
  const fresh = await device(cloud);
  assert.deepEqual(newState(fresh.store), before);
  assert.deepEqual(dump(fresh.store.entries), builtin);
  // І навпаки: нова версія пакує після старої — записи звичок ідуть у n_, стара далі бачить свої m_.
  fresh.store.packOldMonths(true);
  await fresh.settle();
  const again = await device(cloud, OLD);
  assert.deepEqual(dump(again.store.entries), builtin);
  assert.equal(again.store.stats().broken, 0);
  assert.deepEqual(newState((await device(cloud)).store), before);
});

test('стара версія отримує досягнення і робить refresh — `ach` зливається, звички цілі', async () => {
  const { cloud, n } = await setup({ pack: true });
  const before = newState(n.store);
  const o = await device(cloud, OLD);
  await o.store.grantAchievements(['streak_5']).fresh;
  await o.store.refresh(0);
  await o.settle();
  await n.refresh();
  assert.equal(n.store.ach.streak_5, '2027-01-20');
  assert.equal(n.store.ach.first_step, '2026-09-05');
  assert.deepEqual(newState(n.store), before);
});
