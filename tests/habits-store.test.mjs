// Сховище власних звичок (етап 4.2): ключ h_<id> на звичку, злиття за новішим `upd`, записи невідомих звичок,
// пакети n_, стеля активних. Кілька «пристроїв» нової версії на спільній імітованій хмарі.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { entryDef, HABIT_COLORS, MAX_ACTIVE, newerHabit, newHabitId, nextUpd, normalizeHabit } from '../js/habits.js';
import { habitPlanned, normalizeSettings } from '../js/schedule.js';
import { cloudValues, SETTINGS } from './fixtures/history.mjs';
import { createCloud, device, dump, mockClock } from './helpers/cloud.mjs';

const clock = mockClock('2027-01-20T09:00:00.000Z'); // середа, 20 січня 2027
after(() => clock.restore());

const MWF = [true, false, true, false, true, false, false];
const DEF = { id: 'ab12cd', name: 'Читання', emoji: '📖', color: 'teal', modules: ['topic'], order: 0, created: '2027-01-04', archived: null, upd: '2027-01-04T10:00:00.000Z', sched: [{ from: '2027-01-04', days: MWF }] };
const smallCloud = (extra = {}) => createCloud({ settings: JSON.stringify(SETTINGS), 'e_2027-01-18_train': JSON.stringify({ s: 'done', day: 1, ts: '2027-01-18T18:00:00.000Z' }), ...extra });

// ——— Чисті функції ———

test('normalizeHabit: схема, сміття, невідомі поля зберігаються', () => {
  assert.deepEqual(normalizeHabit(DEF), { ...DEF, v: 1 });
  assert.equal(normalizeHabit({ ...DEF, id: 'train' }), null, 'id — рівно 6 символів [a-z0-9]');
  assert.equal(normalizeHabit({ ...DEF, id: 'AB12CD' }), null);
  assert.equal(normalizeHabit({ ...DEF, created: 'вчора' }), null);
  assert.equal(normalizeHabit(null), null);
  const junk = normalizeHabit({
    id: 'zz99zz', created: '2027-01-05', name: `  ${'я'.repeat(60)} `, emoji: '', color: 'чорний', modules: ['hw', 'program', 'x', 'dur', 'hw'],
    order: -3, archived: '2027-01-01', upd: 'колись', sched: [{ from: '2027-02-01', days: [1, 0] }, { from: '2027-01-05', days: [true, 'так', 0, 0, 0, 0, true] }, null],
    future: { reminder: '08:00' },
  });
  assert.equal(junk.name.length, 40);
  assert.equal(junk.emoji, '⭐');
  assert.equal(junk.color, HABIT_COLORS[0]);
  assert.deepEqual(junk.modules, ['dur', 'hw'], 'лише модулі власних звичок, без повторів, у порядку модулів');
  assert.equal(junk.order, 0);
  assert.equal(junk.archived, null, 'архів раніше за створення — відкинуто');
  assert.equal(junk.upd, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(junk.sched, [{ from: '2027-01-05', days: [true, false, false, false, false, false, true] }]);
  assert.deepEqual(junk.future, { reminder: '08:00' }, 'поле новішої версії не губиться');
  assert.equal(normalizeHabit({ ...DEF, name: '   ' }).name, 'Звичка');
});

test('newerHabit: новіший upd, нічия детермінована, симетрично й ідемпотентно', () => {
  const a = normalizeHabit(DEF);
  const b = normalizeHabit({ ...DEF, name: 'Книжки', upd: '2027-01-05T10:00:00.000Z' });
  const c = normalizeHabit({ ...DEF, name: 'Аудіокниги' }); // той самий upd, що в a
  assert.equal(newerHabit(a, b), b);
  assert.equal(newerHabit(b, a), b);
  assert.equal(newerHabit(a, c), newerHabit(c, a));
  assert.equal(newerHabit(newerHabit(a, b), b), b);
  assert.equal(newerHabit(null, a), a);
  assert.equal(newerHabit(a, null), a);
  assert.equal(newerHabit(null, null), null);
  assert.equal(nextUpd('2027-01-20T09:00:00.000Z'), '2027-01-20T09:00:00.001Z', 'правка строго пізніша за версію, від якої походить');
  assert.equal(nextUpd('2027-01-19T00:00:00.000Z'), '2027-01-20T09:00:00.000Z');
});

test('newHabitId: 6 символів, не збігається з наявними й вбудованими, повтор при колізії', () => {
  for (let i = 0; i < 200; i++) assert.match(newHabitId(new Set()), /^[a-z0-9]{6}$/);
  const seq = [0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
  let i = 0;
  assert.equal(newHabitId(new Set(['aaaaaa']), () => seq[i++]), '999999');
});

test('habitPlanned: з дати створення, до архіву, за версією розкладу, пауза — ні', () => {
  const settings = normalizeSettings(structuredClone(SETTINGS), SETTINGS.startDate);
  const def = normalizeHabit({ ...DEF, archived: '2027-03-01', sched: [...DEF.sched, { from: '2027-02-01', days: [false, true, false, true, false, false, false] }] });
  const plan = (d) => habitPlanned(settings, def, d);
  assert.equal(plan('2027-01-01'), false, 'до створення');
  assert.equal(plan('2027-01-04'), true, 'пн');
  assert.equal(plan('2027-01-05'), false, 'вт — не за розкладом; і пауза');
  assert.equal(plan('2027-01-06'), false, 'ср у паузу 5–7 січня');
  assert.equal(plan('2027-01-08'), true, 'пт');
  assert.equal(plan('2027-02-01'), false, 'нова версія: пн уже ні');
  assert.equal(plan('2027-02-02'), true, 'нова версія: вт');
  assert.equal(plan('2027-03-02'), false, 'після архіву');
});

test('entryDef: вимкнений модуль не стирає поля, що вже є в записі', () => {
  const def = normalizeHabit({ ...DEF, modules: [] });
  assert.deepEqual(entryDef(def, { s: 'done', topic: 'Гаррі Поттер' }).modules, ['topic']);
  assert.deepEqual(entryDef(def, { s: 'done' }).modules, []);
});

// ——— Сховище ———

test('завантаження нічого не пише: без звичок, з визначеннями, з записами невідомих звичок', async () => {
  for (const extra of [{}, { h_ab12cd: JSON.stringify(DEF), 'e_2027-01-18_ab12cd': JSON.stringify({ s: 'done' }) }, { 'e_2027-01-18_zz99zz': JSON.stringify({ s: 'done' }) }]) {
    const cloud = smallCloud(extra);
    const d = await device(cloud);
    await d.refresh();
    assert.deepEqual(cloud.writes, [], JSON.stringify(Object.keys(extra)));
  }
});

test('createHabit: один ключ h_<id>, поля, розклад із сьогодні; стеля активних', async () => {
  const cloud = smallCloud();
  const d = await device(cloud);
  const keysBefore = d.store.stats().keys;
  const def = d.store.createHabit({ name: 'Вода', emoji: '💧', color: 'blue', days: MWF });
  await d.settle();
  assert.match(def.id, /^[a-z0-9]{6}$/);
  assert.deepEqual(cloud.writes, [['set', `h_${def.id}`]], 'пишеться лише визначення, settings не змінюється');
  assert.deepEqual(cloud.json(`h_${def.id}`), def);
  assert.equal(def.created, '2027-01-20');
  assert.deepEqual(def.sched, [{ from: '2027-01-20', days: MWF }]);
  assert.equal(d.store.stats().keys, keysBefore + 1);

  for (let i = 1; i < MAX_ACTIVE; i++) d.store.createHabit({ name: `Звичка ${i}`, days: MWF });
  assert.throws(() => d.store.createHabit({ name: 'Одинадцята' }), /Не більше 10/);
  d.store.archiveHabit(def.id);
  const eleventh = d.store.createHabit({ name: 'Одинадцята', days: MWF });
  assert.equal(eleventh.order, MAX_ACTIVE, 'нова — в кінці списку');
  assert.throws(() => d.store.restoreHabit(def.id), /Не більше 10/, 'повернення з архіву теж рахується');
  await d.settle();
  assert.equal(cloud.keys(/^h_/).length, MAX_ACTIVE + 1);
  assert.equal(new Set(d.store.habits.map((h) => h.id)).size, MAX_ACTIVE + 1, 'id не повторюються');
});

test('два пристрої одночасно створюють звички — після refresh обидві на обох', async () => {
  const cloud = smallCloud();
  const a = await device(cloud);
  const b = await device(cloud);
  const ha = a.store.createHabit({ name: 'Вода', days: MWF });
  const hb = b.store.createHabit({ name: 'Читання', days: MWF });
  await Promise.all([a.settle(), b.settle()]);
  await a.refresh();
  await b.refresh();
  for (const d of [a, b]) assert.deepEqual(d.store.habits.map((h) => h.id).sort(), [ha.id, hb.id].sort());
  assert.deepEqual(a.store.habits, b.store.habits);
});

test('застарілий пристрій не затирає новішу правку, навіть якщо записав пізніше', async () => {
  const cloud = smallCloud({ h_ab12cd: JSON.stringify(DEF) });
  const a = await device(cloud);
  const b = await device(cloud);
  b.offline();
  clock.set('2027-01-20T10:00:00.000Z');
  b.store.updateHabit('ab12cd', { name: 'Книжки' }); // стара правка, застрягла в офлайн-черзі
  clock.set('2027-01-20T11:00:00.000Z');
  a.store.archiveHabit('ab12cd'); // новіша правка на іншому пристрої
  await a.settle();
  await b.online(); // черга B пише злиттям: у хмарі новіша — лишається вона
  assert.equal(cloud.json('h_ab12cd').archived, '2027-01-20');
  assert.equal(cloud.json('h_ab12cd').name, 'Читання');
  assert.deepEqual(b.store.getHabit('ab12cd'), cloud.json('h_ab12cd'), 'B одразу бере новішу версію');

  // Навпаки: новіша правка пише пізніше — перемагає вона.
  clock.set('2027-01-20T12:00:00.000Z');
  b.store.restoreHabit('ab12cd');
  await b.settle();
  await a.refresh();
  assert.equal(a.store.getHabit('ab12cd').archived, null);
});

test('запис раніше за визначення: не зіпсований, не показується, не губиться, потім зʼявляється', async () => {
  const entry = JSON.stringify({ s: 'done', bonus: false, topic: 'Дюна', energy: 4, reasons: [], comment: '', ts: '2027-01-18T20:00:00.000Z' });
  const cloud = smallCloud({ 'e_2027-01-18_ab12cd': entry });
  const d = await device(cloud);
  assert.equal(d.store.orphanCount, 1);
  assert.equal(d.store.stats().broken, 0);
  assert.equal(d.store.customEntries.size, 0);
  assert.equal(d.store.getEntry('2027-01-18', 'ab12cd'), null);
  d.store.saveEntry('2027-01-19', 'eng', { s: 'done' });
  d.store.packOldMonths(true);
  await d.settle();
  assert.equal(cloud.map.get('e_2027-01-18_ab12cd'), entry, 'запис на місці, без змін');

  cloud.map.set('h_ab12cd', JSON.stringify(DEF)); // визначення приїхало з іншого пристрою
  await d.refresh();
  assert.equal(d.store.orphanCount, 0);
  assert.equal(d.store.getEntry('2027-01-18', 'ab12cd').topic, 'Дюна');
});

test('saveEntry для власної звички: бонус за її розкладом, ключ e_…_<id>, невідома — помилка', async () => {
  const cloud = smallCloud({ h_ab12cd: JSON.stringify(DEF) });
  const d = await device(cloud);
  const planned = d.store.saveEntry('2027-01-18', 'ab12cd', { s: 'done', topic: 'Дюна', day: 2, future: 1 });
  const bonus = d.store.saveEntry('2027-01-19', 'ab12cd', { s: 'done' });
  const inPause = d.store.saveEntry('2027-01-06', 'ab12cd', { s: 'done' });
  assert.equal(planned.bonus, false);
  assert.equal(bonus.bonus, true, 'вівторок — поза розкладом');
  assert.equal(inPause.bonus, true, 'пауза');
  assert.equal('day' in planned, false, 'День програми власним звичкам недоступний — відкидається');
  assert.equal('future' in planned, false, 'невідомі поля запису відкидаються, як і в train/eng');
  assert.throws(() => d.store.saveEntry('2027-01-18', 'zz99zz', { s: 'done' }), /Невідома звичка/);
  await d.settle();
  assert.deepEqual(JSON.parse(cloud.map.get('e_2027-01-18_ab12cd')), planned);
  assert.equal(d.store.entries.size, 1, 'записи власних звичок не змішуються з train/eng');

  // Вимкнули модуль «Тема» — поле в наявному записі не стирається ні при читанні, ні при редагуванні.
  d.store.updateHabit('ab12cd', { modules: [] });
  d.store.saveEntry('2027-01-18', 'ab12cd', { comment: 'Дочитав' });
  await d.settle();
  const again = await device(cloud);
  assert.equal(again.store.getEntry('2027-01-18', 'ab12cd').topic, 'Дюна');
  assert.equal(again.store.getEntry('2027-01-18', 'ab12cd').comment, 'Дочитав');
  d.store.deleteEntry('2027-01-19', 'ab12cd');
  await d.settle();
  assert.equal(cloud.map.has('e_2027-01-19_ab12cd'), false);
});

test('пакування: власні й невідомі — у n_, train/eng — у m_; нічого не губиться', async () => {
  const values = cloudValues();
  values.h_ab12cd = JSON.stringify({ ...DEF, created: '2026-09-01', sched: [{ from: '2026-09-01', days: MWF }] });
  for (const d of ['2026-09-07', '2026-09-09', '2026-10-05', '2026-11-02']) values[`e_${d}_ab12cd`] = JSON.stringify({ s: 'done', topic: `Книга ${d}`, ts: `${d}T20:00:00.000Z` });
  values['e_2026-10-06_zz99zz'] = JSON.stringify({ s: 'miss', future: 'поле новішої версії' }); // невідома звичка
  // Старе сміття: невідома звичка в пакеті m_ — має переїхати в n_, не загубившись.
  values['m_2026-08_0'] = JSON.stringify({ '2026-08-26_train': JSON.parse(values['e_2026-08-26_train']), '2026-08-20_qq11qq': { s: 'done' } });
  delete values['e_2026-08-26_train'];
  const cloud = createCloud(values);
  const d = await device(cloud);
  const before = { entries: dump(d.store.entries), custom: dump(d.store.customEntries), orphans: d.store.orphanCount };
  assert.equal(before.orphans, 2);
  d.store.packOldMonths(true);
  await d.settle();

  for (const k of cloud.keys(/^m_/)) for (const inner of Object.keys(cloud.json(k))) assert.match(inner, /_(train|eng)$/, `${k}: ${inner}`);
  const nKeys = cloud.keys(/^n_/);
  assert.deepEqual(nKeys, ['n_2026-08_0', 'n_2026-09_0', 'n_2026-10_0', 'n_2026-11_0']);
  assert.deepEqual(cloud.json('n_2026-10_0')['2026-10-06_zz99zz'], { s: 'miss', future: 'поле новішої версії' }, 'невідомий запис — як є');
  assert.equal(cloud.keys(/_(ab12cd|zz99zz|qq11qq)$/).filter((k) => k.startsWith('e_')).length, 0, 'окремі ключі прибрано після пакування');

  const again = await device(cloud);
  assert.deepEqual({ entries: dump(again.store.entries), custom: dump(again.store.customEntries), orphans: again.store.orphanCount }, before);

  again.store.saveEntry('2026-10-05', 'ab12cd', { comment: 'Редагування запакованого' });
  await again.settle();
  assert.ok(cloud.map.has('e_2026-10-05_ab12cd'));
  assert.equal('2026-10-05_ab12cd' in cloud.json('n_2026-10_0'), false);
  const third = await device(cloud);
  assert.deepEqual(dump(third.store.customEntries), dump(again.store.customEntries));
  assert.equal(third.store.orphanCount, 2);
});

test('refresh повертає в хмару звичку, яку там загубили (інша вкладка/стара копія)', async () => {
  const cloud = smallCloud();
  const d = await device(cloud);
  const def = d.store.createHabit({ name: 'Вода', days: MWF });
  await d.settle();
  cloud.map.delete(`h_${def.id}`);
  await d.refresh();
  await d.settle();
  assert.deepEqual(cloud.json(`h_${def.id}`), def);
});

test('завелике визначення не йде в чергу', async () => {
  const d = await device(smallCloud({ h_ab12cd: JSON.stringify(DEF) }));
  const sched = Array.from({ length: 120 }, (_, i) => ({ from: `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}`, days: MWF }));
  assert.throws(() => d.store.updateHabit('ab12cd', { sched }), /завелика/);
  assert.equal(d.store.getHabit('ab12cd').name, 'Читання');
  assert.ok(d.storage.idle);
});
