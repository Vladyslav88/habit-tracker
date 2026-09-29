// Нижні шторки (bottom sheet), діалог підтвердження і тости.
import { h, icon } from './dom.js';
import { pushBack } from './nav.js';

const layers = () => document.getElementById('layers');
let openCount = 0;

function lockScroll(on) {
  openCount += on ? 1 : -1;
  document.documentElement.classList.toggle('modal-open', openCount > 0);
}

/**
 * Відкриває шторку. render(body, api) наповнює вміст.
 * api: close(), setTitle(), setSubtitle(), onCleanup(fn), body.
 */
export function openSheet({ title = '', subtitle = '', className = '', render, onClose }) {
  const titleEl = h('h2', { class: 'sheet-title' }, title);
  const subEl = h('p', { class: 'sheet-sub' }, subtitle);
  const closeBtn = h('button', { class: 'icon-btn sheet-x', type: 'button', 'aria-label': 'Закрити' }, icon('x'));
  const head = h('header', { class: 'sheet-head' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-titles' }, titleEl, subEl),
    closeBtn);
  const body = h('div', { class: 'sheet-body' });
  const panel = h('section', { class: `sheet ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, head, body);
  const overlay = h('div', { class: 'overlay' });
  const wrap = h('div', { class: 'sheet-wrap' }, overlay, panel);

  const cleanups = [];
  let closed = false;
  let release = () => {};

  const api = {
    body,
    panel,
    close(fromBack = false) {
      if (closed) return;
      closed = true;
      if (!fromBack) release();
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 280);
      lockScroll(false);
      cleanups.forEach((fn) => fn());
      onClose?.();
    },
    setTitle(t) { titleEl.textContent = t; panel.setAttribute('aria-label', t); },
    setSubtitle(t) { subEl.textContent = t || ''; subEl.hidden = !t; },
    onCleanup(fn) { cleanups.push(fn); },
    get closed() { return closed; },
  };
  api.setSubtitle(subtitle);

  overlay.addEventListener('click', () => api.close());
  closeBtn.addEventListener('click', () => api.close());
  enableDragToClose(head, panel, () => api.close());

  layers().append(wrap);
  lockScroll(true);
  release = pushBack(() => api.close(true));
  render(body, api);
  // Подвійний rAF — щоб анімація появи спрацювала після першого layout.
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

function enableDragToClose(handle, panel, close) {
  let startY = null;
  let dy = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    startY = e.clientY;
    dy = 0;
    handle.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) close();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/** Діалог підтвердження. Повертає Promise<boolean>. */
export function confirmDialog({ title, text = '', ok = 'Так', cancel = 'Скасувати', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const wrap = h('div', { class: 'dialog-wrap' });
    const finish = (v, fromBack = false) => {
      if (done) return;
      done = true;
      if (!fromBack) release();
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 200);
      lockScroll(false);
      resolve(v);
    };
    const okBtn = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => finish(true) }, ok);
    wrap.append(
      h('div', { class: 'overlay', onclick: () => finish(false) }),
      h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', null, title),
        text && h('p', null, text),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => finish(false) }, cancel),
          okBtn)),
    );
    layers().append(wrap);
    lockScroll(true);
    const release = pushBack(() => finish(false, true));
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('open'); okBtn.focus({ preventScroll: true }); }));
  });
}

let toastEl = null;
let toastTimer = null;

export function toast(message, { type = 'info', ms = 2600 } = {}) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    layers().append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.type = type;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
