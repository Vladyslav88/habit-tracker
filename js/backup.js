// Резервна копія (етап 4.1.5): усі ключі сховища одним JSON. Лише копія — відновлення зʼявиться з імпортом (етап 3).
// Чиста функція: значення, які є JSON, кладуться розібраними (читабельно); решта — як є в `raw`.

export const BACKUP_FORMAT = 'habit-tracker-backup';

/**
 * values — { ключ: рядок } (як їх віддає сховище, разом із незбереженими змінами з черги).
 * meta — { app, at (ISO), storage (cloud | local | memory) }.
 */
export function buildBackup(values, { app, at, storage }) {
  const keys = Object.keys(values).filter((k) => typeof values[k] === 'string' && values[k] !== '').sort();
  const data = {};
  const raw = {};
  for (const k of keys) {
    try { data[k] = JSON.parse(values[k]); } catch { raw[k] = values[k]; }
  }
  const out = { format: BACKUP_FORMAT, v: 1, app, exportedAt: at, storage, keys: keys.length, data };
  if (Object.keys(raw).length) out.raw = raw;
  return out;
}

export const backupText = (backup) => JSON.stringify(backup);
