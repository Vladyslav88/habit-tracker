// Сезони (календарні, Україна) і час доби (SPEC §6): визначення, превʼю, частинки.
import { isGarlandTime } from './scenes.js';

export const SEASONS = {
  winter: { name: 'Зима', emoji: '❄️' },
  spring: { name: 'Весна', emoji: '🌸' },
  summer: { name: 'Літо', emoji: '☀️' },
  autumn: { name: 'Осінь', emoji: '🍂' },
};

export const TIMES = {
  morning: { name: 'Ранок', greeting: 'Доброго ранку' },
  day: { name: 'День', greeting: 'Доброго дня' },
  evening: { name: 'Вечір', greeting: 'Доброго вечора' },
  night: { name: 'Ніч', greeting: 'Доброї ночі' },
};

export function seasonOf(date) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export function timeOfDay(date) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

// ——— Превʼю дизайну ———
// Вмикається посиланням ?season=…&time=…&garland=1 або в «Про застосунок».
// Живе лише в памʼяті: параметри одразу прибираються з адреси, тож перезавантаження
// чи кнопка «Вийти» повертають реальний сезон і час.
const preview = { season: null, tod: null, garland: false };
const PREVIEW_KEYS = ['season', 'time', 'garland'];

export function readPreviewFromUrl() {
  try {
    const url = new URL(location.href);
    const q = url.searchParams;
    if (!PREVIEW_KEYS.some((k) => q.has(k))) return false;
    setPreview({ season: q.get('season'), tod: q.get('time'), garland: q.get('garland') === '1' });
    PREVIEW_KEYS.forEach((k) => q.delete(k));
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
  return isPreview();
}

export const getPreview = () => ({ ...preview });
export const isPreview = () => !!(preview.season || preview.tod || preview.garland);
export function setPreview(p) {
  preview.season = SEASONS[p.season] ? p.season : null;
  preview.tod = TIMES[p.tod] ? p.tod : null;
  preview.garland = p.garland === true;
}
export const clearPreview = () => setPreview({});

/** Поточний вигляд: сезон і час доби (з урахуванням превʼю). */
export function currentLook(now = new Date()) {
  return {
    season: preview.season || seasonOf(now),
    tod: preview.tod || timeOfDay(now),
    garland: preview.garland || isGarlandTime(now),
  };
}

// ——— Частинки ———

const SVG = {
  maple: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l2.1 4.3 3.9-1.7-1 4.4 4.6 1-3.6 3.1 2 3.7-4.5-.7-.6 4.2-2.9-2.7-2.9 2.7-.6-4.2-4.5.7 2-3.7L2.4 9.5l4.6-1-1-4.4 3.9 1.7z"/><path d="M12 15.5V23" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  leaf: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 6.5 4.8 11 6 15.5 7 19 9.8 21 12 22c2.2-1 5-3 6-6.5C19.2 11 17.5 6.5 12 2z"/><path d="M12 5v17" stroke="rgba(0,0,0,.22)" stroke-width="1"/></svg>',
  flake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3.6 10.6l3.3-.9-.9-3.3M20.4 13.4l-3.3.9.9 3.3M3.6 13.4l3.3.9-.9 3.3M20.4 10.6l-3.3-.9.9-3.3"/></svg>',
  petal: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c4.5 4 5.5 9.5 0 20C6.5 11.5 7.5 6 12 2z"/></svg>',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fallers(rand, count, pick) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const { shape, size, color, opacity = 0.9 } = pick(i);
    const dur = 13 + rand() * 12;
    out.push({
      cls: 'p fall',
      html: shape ? SVG[shape] : '',
      dot: !shape,
      vars: {
        '--x': `${(rand() * 100).toFixed(1)}%`,
        '--y': `${(6 + rand() * 70).toFixed(1)}%`,
        '--s': `${size}px`,
        '--c': color,
        '--o': opacity,
        '--d': `${dur.toFixed(1)}s`,
        '--delay': `${(-rand() * dur).toFixed(1)}s`,
        '--dx': `${((rand() - 0.5) * 24).toFixed(1)}vw`,
        '--sd': `${(2.6 + rand() * 3).toFixed(1)}s`,
        '--r': `${Math.round(rand() * 360)}deg`,
      },
    });
  }
  return out;
}

/** Частинки для сезону/часу доби (≤ 20). */
export function particlesFor(season, tod) {
  const rand = rng([...(season + tod)].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
  const pickOf = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => Math.round(a + rand() * (b - a));

  if (season === 'autumn') {
    const colors = ['#D9682A', '#B8461E', '#E6A23C', '#9C4B27', '#CF8230'];
    return fallers(rand, 12, () => ({
      shape: rand() < 0.55 ? 'maple' : 'leaf', size: between(14, 24), color: pickOf(colors),
    }));
  }
  if (season === 'winter') {
    return fallers(rand, 18, () => (rand() < 0.3
      ? { shape: 'flake', size: between(10, 15), color: '#FFFFFF', opacity: 0.85 }
      : { size: between(3, 7), color: '#FFFFFF', opacity: 0.55 + rand() * 0.4 }));
  }
  if (season === 'spring') {
    const colors = ['#F6B3C6', '#F9CFDB', '#FFF4F7', '#F29DB6'];
    return fallers(rand, 12, (i) => (i % 6 === 5
      ? { shape: 'leaf', size: between(10, 14), color: '#8CC46B' }
      : { shape: 'petal', size: between(9, 15), color: pickOf(colors) }));
  }
  // Літо: удень — сонячні відблиски, увечері й уночі — світлячки.
  if (tod === 'evening' || tod === 'night') {
    return Array.from({ length: 14 }, () => {
      const dur = 7 + rand() * 7;
      return {
        cls: 'p firefly',
        vars: {
          '--x': `${(4 + rand() * 92).toFixed(1)}%`,
          '--y': `${(8 + rand() * 60).toFixed(1)}%`,
          '--d': `${dur.toFixed(1)}s`,
          '--delay': `${(-rand() * dur).toFixed(1)}s`,
          '--bd': `${(1.8 + rand() * 2.4).toFixed(1)}s`,
          '--mx': `${((rand() - 0.5) * 70).toFixed(0)}px`,
          '--my': `${((rand() - 0.5) * 50).toFixed(0)}px`,
        },
      };
    });
  }
  return Array.from({ length: 5 }, (_, i) => {
    const dur = 9 + rand() * 7;
    return {
      cls: 'p glare',
      vars: {
        '--x': `${(52 + i * 9 + rand() * 6).toFixed(1)}%`,
        '--y': `${(4 + i * 6 + rand() * 4).toFixed(1)}%`,
        '--s': `${between(26, 90)}px`,
        '--d': `${dur.toFixed(1)}s`,
        '--delay': `${(-rand() * dur).toFixed(1)}s`,
      },
    };
  });
}

export function renderParticles(container, season, tod) {
  const key = `${season}/${tod}`;
  if (container.dataset.look === key) return;
  container.dataset.look = key;
  container.replaceChildren(...particlesFor(season, tod).map((p) => {
    const el = document.createElement('span');
    el.className = p.cls;
    for (const [k, v] of Object.entries(p.vars)) el.style.setProperty(k, v);
    const inner = document.createElement('i');
    if (p.html) inner.innerHTML = p.html;
    if (p.dot) inner.className = 'dot';
    el.append(inner);
    return el;
  }));
}
