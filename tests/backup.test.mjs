// Резервна копія (етап 4.1.5): усі ключі сховища одним JSON, разом із незбереженими змінами.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_FORMAT, backupText, buildBackup } from '../js/backup.js';
import { createStorage } from '../js/storage.js';
import { createStore } from '../js/store.js';
import { cloudValues } from './fixtures/history.mjs';

const META = { app: 'test', at: '2027-01-20T09:00:00.000Z', storage: 'cloud' };

test('buildBackup: усі ключі, JSON розібрано, зіпсоване — в raw, порожні пропущено', () => {
  const values = { ...cloudValues({ ach: { first_step: '2026-09-05' } }), 'e_2026-08-31_train': 'не json', h_abc123: '{"id":"abc123"}', empty: '' };
  const b = buildBackup(values, META);
  assert.equal(b.format, BACKUP_FORMAT);
  assert.equal(b.keys, Object.keys(values).length - 1);
  assert.deepEqual(Object.keys(b.data).concat(Object.keys(b.raw)).sort(), Object.keys(values).filter((k) => k !== 'empty').sort());
  assert.deepEqual(b.raw, { 'e_2026-08-31_train': 'не json' });
  assert.deepEqual(b.data.ach, { first_step: '2026-09-05' });
  assert.deepEqual(b.data.h_abc123, { id: 'abc123' }, 'невідомі ключі (новіші версії) теж у копії');
  // Кожне розібране значення відтворюється з копії без втрат.
  for (const [k, v] of Object.entries(b.data)) assert.deepEqual(v, JSON.parse(values[k]));
  const again = JSON.parse(backupText(b));
  assert.deepEqual(again, b);
  assert.equal(buildBackup({ settings: '{}' }, META).raw, undefined, 'без зіпсованих — без поля raw');
});

test('store.snapshot: хмара + незбережені записи з черги', async () => {
  const map = new Map(Object.entries(cloudValues()));
  let online = true;
  const backend = {
    mode: 'cloud',
    getKeys: async () => [...map.keys()],
    getItems: async (keys) => Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ''])),
    setItem: async (k, v) => { if (!online) throw new Error('offline'); map.set(k, v); return true; },
    removeItems: async (keys) => { if (!online) throw new Error('offline'); keys.forEach((k) => map.delete(k)); return true; },
  };
  const storage = createStorage(null, backend);
  const store = createStore(storage);
  await store.load();
  online = false; // запис застрягне в черзі
  store.saveEntry('2027-03-03', 'eng', { s: 'done', topic: 'Офлайн' });
  store.deleteEntry('2027-03-01', 'train');
  const values = await store.snapshot();
  assert.equal(JSON.parse(values['e_2027-03-03_eng']).topic, 'Офлайн');
  assert.equal('e_2027-03-01_train' in values, false);
  assert.equal(map.has('e_2027-03-03_eng'), false, 'у хмарі ще немає — копія бере з черги');
  online = true; // доганяємо чергу, щоб не лишати таймерів автоповтору
  storage.retry();
  for (let i = 0; i < 200 && !storage.idle; i++) await new Promise((r) => setTimeout(r, 0));
  assert.ok(storage.idle);
  assert.equal(JSON.parse(map.get('e_2027-03-03_eng')).topic, 'Офлайн');
});
