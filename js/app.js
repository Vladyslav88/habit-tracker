// Точка входу: Telegram, тема, сховище, вкладки, годинник.
import { fmtTime, todayKey } from './dates.js';
import { currentLook, renderParticles } from './seasons.js';
import { createStorage } from './storage.js';
import { createStore } from './store.js';
import {
  cloudAvailable, colorScheme, initTelegram, isTelegram, onColorSchemeChange, onResume,
  setChromeColors, setClosingConfirmation, tg,
} from './tg.js';
import { calendarArrow, renderCalendar, resetCalendar } from './ui/calendar.js';
import { $, h, icon } from './ui/dom.js';
import { depth, initNav } from './ui/nav.js';
import { renderSettings } from './ui/settings.js';
import { toast } from './ui/sheet.js';
import { renderAnalytics, renderEnglish } from './ui/stubs.js';
import { renderToday } from './ui/today.js';

const root = document.documentElement;
const view = $('#view');

const TABS = [
  { id: 'today', label: 'Сьогодні', icon: 'today', render: renderToday },
  { id: 'calendar', label: 'Календар', icon: 'calendar', render: renderCalendar },
  { id: 'analytics', label: 'Аналітика', icon: 'chart', render: renderAnalytics },
  { id: 'english', label: 'Англійська', icon: 'book', render: renderEnglish },
  { id: 'settings', label: 'Налаштування', icon: 'settings', render: renderSettings },
];

const SYNC_TEXT = { saved: 'збережено', saving: 'зберігаю…', error: 'помилка' };

let current = 'today';
try { current = sessionStorage.getItem('ht_tab') || 'today'; } catch { /* ignore */ }
if (!TABS.some((t) => t.id === current)) current = 'today';

let look = currentLook();
let lastDay = todayKey();

// ——— Оформлення ———

function cssVar(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function applyTheme() {
  root.dataset.theme = colorScheme();
  syncChrome();
}

function syncChrome() {
  setChromeColors(cssVar('--sky1'), cssVar('--bg'));
}

function applyLook() {
  look = currentLook();
  root.dataset.season = look.season;
  root.dataset.tod = look.tod;
  renderParticles($('#particles'), look.season, look.tod);
  syncChrome();
  if (store.settings) render();
}

function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb', `${Math.round(kb)}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

// ——— Сховище ———

const storage = createStorage(cloudAvailable ? tg : null);
const store = createStore(storage);

function showBanner() {
  const banner = $('#banner');
  let text = '';
  if (storage.mode === 'local') text = isTelegram ? 'Стара версія Telegram — дані лише на цьому пристрої' : 'Режим браузера, дані лише на цьому пристрої';
  if (storage.mode === 'memory') text = 'Сховище браузера недоступне — дані зникнуть після закриття';
  banner.hidden = !text;
  banner.replaceChildren(text ? icon('info') : '', text);
  root.classList.toggle('has-banner', !!text);
}

let confirmOn = null;

function paintSync(status) {
  const on = status !== 'saved';
  if (on !== confirmOn) {
    confirmOn = on;
    setClosingConfirmation(on);
  }
  const btn = $('#sync');
  btn.dataset.status = status;
  btn.textContent = SYNC_TEXT[status];
  btn.setAttribute('aria-label', `Синхронізація: ${SYNC_TEXT[status]}${status === 'error' ? '. Натисни, щоб повторити' : ''}`);
}

$('#sync').addEventListener('click', () => {
  if (storage.status === 'error') {
    toast(`Не вдалося зберегти: ${storage.lastError?.message || 'невідома помилка'}. Повторюю…`, { type: 'error' });
    storage.retry();
  } else {
    toast(storage.status === 'saving' ? 'Зберігаю зміни…' : store.mode === 'cloud' ? 'Усе збережено в хмарі Telegram' : 'Усе збережено в цьому браузері');
  }
});

// ——— Вкладки ———

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map((t) => h('button', {
    type: 'button',
    class: `tab ${t.id === current ? 'on' : ''}`,
    'aria-current': t.id === current ? 'page' : null,
    onclick: () => select(t.id),
  }, icon(t.icon), t.label)));
  nav.hidden = false;
}

function select(id) {
  if (id === current) {
    if (id === 'calendar') resetCalendar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    current = id;
    try { sessionStorage.setItem('ht_tab', id); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }
  renderTabs();
  render();
}

function render() {
  const tab = TABS.find((t) => t.id === current);
  view.dataset.tab = current;
  tab.render(view, { store, look, applyLook });
}

// ——— Годинник і зміна дня ———

function tick() {
  const now = new Date();
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = fmtTime(now); });
  const next = currentLook(now);
  const day = todayKey();
  if (day !== lastDay) {
    lastDay = day;
    applyLook(); // також перемальовує вкладку
  } else if (next.season !== look.season || next.tod !== look.tod) {
    applyLook();
  }
  setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

document.addEventListener('keydown', (e) => {
  if (current !== 'calendar' || depth() || e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowLeft') calendarArrow(-1);
  if (e.key === 'ArrowRight') calendarArrow(1);
});

// ——— Старт ———

async function boot() {
  try {
    await store.load();
  } catch (err) {
    view.replaceChildren(h('div', { class: 'boot' }, h('div', { class: 'boot-error' },
      h('p', null, h('strong', null, 'Не вдалося завантажити дані')),
      h('p', { class: 'small muted' }, err?.message || String(err)),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { view.replaceChildren(h('div', { class: 'boot' }, h('div', { class: 'boot-dot' }))); boot(); } }, 'Спробувати ще'))));
    return;
  }
  $('#sync').hidden = false;
  renderTabs();
  render();
  store.subscribe(render);
}

initTelegram();
initNav();
root.dataset.theme = colorScheme();
onColorSchemeChange(applyTheme);
trackViewport();
showBanner();
paintSync(storage.status);
storage.onStatus(paintSync);
applyLook();
tick();
onResume(() => { store.refresh().catch(() => {}); });
boot();
