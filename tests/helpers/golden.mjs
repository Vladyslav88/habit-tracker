// Еталони (golden) для характеризаційних тестів: результат порівнюється з JSON-файлом у tests/golden/.
// Оновити еталони (лише свідомо, коли поведінка має змінитися): UPDATE_GOLDEN=1 node --test tests/*.test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { after } from 'node:test';

const UPDATE = process.env.UPDATE_GOLDEN === '1';

/** Стабільний JSON: ключі обʼєктів відсортовані, щоб порядок полів не давав шуму в diff. */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/**
 * useGolden(url) → check(name, value, replacer?). replacer — як у JSON.stringify
 * (наприклад, щоб замінити запис посиланням на його id і не дублювати його в еталоні).
 */
export function useGolden(url) {
  const path = new URL(url).pathname;
  const stored = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const seen = {};
  if (UPDATE) {
    after(() => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(sortKeys(seen), null, 1)}\n`);
    });
  }
  return (name, value, replacer) => {
    assert.ok(!(name in seen), `еталон «${name}» перевіряється двічі`);
    const plain = JSON.parse(JSON.stringify(value, replacer) ?? 'null');
    seen[name] = plain;
    if (UPDATE) return;
    assert.ok(name in stored, `немає еталону «${name}» — див. tests/helpers/golden.mjs`);
    assert.deepEqual(plain, stored[name], `розбіжність з еталоном «${name}»`);
  };
}

/** Фіксований «зараз» для коду, що читає new Date() / Date.now(). Повертає функцію відновлення. */
export function freezeTime(epochMs) {
  const Real = globalThis.Date;
  class Fixed extends Real {
    constructor(...args) { if (args.length) super(...args); else super(epochMs); }
    static now() { return epochMs; }
  }
  globalThis.Date = Fixed;
  return () => { globalThis.Date = Real; };
}
