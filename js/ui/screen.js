// Вкладений екран поверх вкладки (з кнопкою «назад» Telegram або власною в браузері).
import { isTelegram } from '../tg.js';
import { h, icon } from './dom.js';
import { pushBack } from './nav.js';

export function openScreen({ title, render }) {
  const body = h('div', { class: 'page-body' });
  const back = !isTelegram && h('button', { type: 'button', class: 'icon-btn screen-back', 'aria-label': 'Назад', onclick: () => api.close() }, icon('chevronL'));
  const el = h('div', { class: 'screen', role: 'dialog', 'aria-label': title },
    h('div', { class: 'screen-inner' },
      h('header', { class: 'page-head screen-head' }, back, h('h1', null, title)),
      body));
  const cleanups = [];
  let closed = false;
  const api = {
    body,
    close(fromBack = false) {
      if (closed) return;
      closed = true;
      if (!fromBack) release();
      el.classList.remove('open');
      setTimeout(() => el.remove(), 300);
      cleanups.forEach((fn) => fn());
    },
    onCleanup(fn) { cleanups.push(fn); },
  };
  document.getElementById('layers').append(el);
  const release = pushBack(() => api.close(true));
  render(body, api);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return api;
}
