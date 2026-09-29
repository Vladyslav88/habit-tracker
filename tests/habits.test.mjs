// Реєстр звичок і модулі (етап 4.1): нові функції дають те саме, що старі жорстко зашиті формули
// (перенесені сюди дослівно як еталон), на всіх записах фікстури.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEntry } from '../js/entry.js';
import { entrySteps, HABIT_IDS, HABITS, habitsWith, hasDetails, hasModule, moduleChips, programDayOn, scheduledOn } from '../js/habits.js';
import { MODULE_IDS, MODULES } from '../js/modules.js';
import { buildEntries, SCHEDULE } from './fixtures/history.mjs';

const list = buildEntries().map(({ date, habit, data }) => ({ date, habit, e: normalizeEntry(habit, data) }));

// ——— Старі формули (до етапу 4.1) ———
function oldStepsFor(habit, s, bonus) {
  if (s === 'miss') return ['reasons', 'energy', 'comment'];
  if (habit === 'train') return [...(bonus ? ['day'] : []), 'dur', 'back', 'energy', 'comment'];
  return ['topic', 'hw', 'energy', 'comment'];
}
const oldHasDetails = (habit, e) => !!(e.energy || e.comment || e.reasons.length
  || (habit === 'train' ? e.dur || e.back !== null : e.topic || e.hw));
function oldModuleChips(habit, e) {
  const out = [];
  if (habit === 'train') {
    if (e.dur) out.push({ text: { lt60: 'до 60 хв', '60-70': '60–70 хв', gt70: 'понад 70 хв' }[e.dur], icon: 'clock' });
    if (e.back === true) out.push({ text: 'Спина', cls: 'chip-back' });
    if (e.back === false) out.push({ text: 'Спина ок' });
  } else {
    if (e.topic) out.push({ text: e.topic, cls: 'chip-topic' });
    if (e.hw?.text) out.push({ text: e.hw.done ? 'Домашка ✓' : 'Домашка', cls: e.hw.done ? '' : 'chip-hw' });
  }
  return out;
}

test('реєстр: дві вбудовані звички, модулі шаблонів, форми', () => {
  assert.deepEqual(HABIT_IDS, ['train', 'eng']);
  assert.deepEqual(HABITS.train.modules, ['program', 'dur', 'back']);
  assert.deepEqual(HABITS.eng.modules, ['topic', 'hw']);
  assert.equal(HABITS.train.shape, 'circle');
  assert.equal(HABITS.eng.shape, 'square');
  for (const id of HABIT_IDS) for (const m of HABITS[id].modules) assert.ok(MODULE_IDS.includes(m), `${id}: невідомий модуль ${m}`);
  assert.deepEqual(habitsWith('topic'), ['eng']);
  assert.deepEqual(habitsWith('program'), ['train']);
  assert.equal(hasModule('eng', 'back'), false);
  assert.equal(hasModule('read', 'topic'), false, 'невідома звичка — без модулів');
});

test('entrySteps збігається зі старим stepsFor', () => {
  for (const habit of HABIT_IDS) {
    for (const s of ['done', 'miss']) {
      for (const bonus of [false, true]) assert.deepEqual(entrySteps(habit, s, bonus), oldStepsFor(habit, s, bonus), `${habit} ${s} bonus=${bonus}`);
    }
  }
});

test('hasDetails і чипи модулів збігаються зі старими формулами на всіх записах', () => {
  for (const { date, habit, e } of list) {
    assert.equal(hasDetails(habit, e), oldHasDetails(habit, e), `${date}:${habit}`);
    if (e.s === 'done') assert.deepEqual(moduleChips(habit, e), oldModuleChips(habit, e), `${date}:${habit}`);
  }
  const empty = normalizeEntry('train', { s: 'done', ts: '2026-10-01T10:00:00.000Z' });
  assert.equal(hasDetails('train', empty), false);
  assert.equal(hasDetails('train', { ...empty, back: false }), true, 'відповідь «спина ок» — теж деталь');
});

test('розклад дня: scheduledOn і День програми як у старому planFor', () => {
  for (const { days } of SCHEDULE) {
    for (const day of days) {
      assert.equal(scheduledOn(day, 'train'), !!day.train);
      assert.equal(scheduledOn(day, 'eng'), !!day.eng);
      assert.equal(programDayOn(day), day.train || null);
    }
  }
});

test('модулі: при пропуску поля очищуються, День програми лишається', () => {
  const raw = { day: 2, dur: 'gt70', back: true, topic: 'Тема', hw: { text: 'x', done: true } };
  const miss = Object.assign({}, ...MODULE_IDS.map((m) => MODULES[m].normalize(raw, false)));
  assert.deepEqual(miss, { day: 2, dur: null, back: null, topic: '', hw: null });
  const done = Object.assign({}, ...MODULE_IDS.map((m) => MODULES[m].normalize(raw, true)));
  assert.deepEqual(done, { day: 2, dur: 'gt70', back: true, topic: 'Тема', hw: { text: 'x', done: true } });
});
