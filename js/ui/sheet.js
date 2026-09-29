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
 * Відкриває шторку зі сторінкою `page`: { title, subtitle, className, pal, render(body, ctx), onLeave }.
 * Усередині шторки можна переходити на інші сторінки (ctx.push / ctx.replace) — вміст
 * замінюється, у шапці зʼявляється «назад», Telegram BackButton повертає на попередню сторінку.
 *
 * ctx сторінки: close() (для вкладеної — назад, для першої — закрити шторку), push(page), replace(page),
 * onCleanup(fn) (коли сторінку покидають), setTitle(), setSubtitle(), closed, sheet.
 */
export function openSheet(root) {
  const titleEl = h('h2', { class: 'sheet-title' });
  const subEl = h('p', { class: 'sheet-sub' });
  const closeBtn = h('button', { class: 'icon-btn sheet-x', type: 'button', 'aria-label': 'Закрити' }, icon('x'));
  const backBtn = h('button', { class: 'icon-btn sheet-back', type: 'button', 'aria-label': 'Назад', hidden: true }, icon('chevronL'));
  const head = h('header', { class: 'sheet-head' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    backBtn,
    h('div', { class: 'sheet-titles' }, titleEl, subEl),
    closeBtn);
  const body = h('div', { class: 'sheet-body' });
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, head, body);
  const overlay = h('div', { class: 'overlay' });
  const wrap = h('div', { class: 'sheet-wrap' }, overlay, panel);
  if (root.pal) wrap.dataset.pal = root.pal;

  const stack = []; // [{ page, ctx, cleanups, release, active }]
  let closed = false;

  const setTitle = (t) => { titleEl.textContent = t || ''; panel.setAttribute('aria-label', t || ''); };
  const setSubtitle = (t) => { subEl.textContent = t || ''; subEl.hidden = !t; };

  function leave(entry) {
    if (!entry?.active) return;
    entry.active = false;
    entry.cleanups.splice(0).forEach((fn) => fn());
    entry.page.onLeave?.();
  }

  function show(entry, dir = '') {
    entry.active = true;
    const { page } = entry;
    setTitle(page.title);
    setSubtitle(page.subtitle);
    panel.className = ['sheet', page.className].filter(Boolean).join(' ');
    head.classList.toggle('has-back', stack.length > 1);
    backBtn.hidden = stack.length < 2;
    const content = h('div', { class: `sheet-page ${dir && `page-${dir}`}`.trim() });
    body.replaceChildren(content);
    body.scrollTop = 0;
    page.render(content, entry.ctx);
  }

  function makeEntry(page) {
    const entry = { page, cleanups: [], active: false, release: () => {} };
    entry.ctx = {
      sheet: api,
      push: (p) => api.push(p),
      replace: (p) => api.replace(p),
      close() {
        if (!entry.active) return;
        if (stack.length > 1 && stack.at(-1) === entry) api.pop();
        else api.close();
      },
      onCleanup: (fn) => entry.cleanups.push(fn),
      setTitle,
      setSubtitle,
      get closed() { return !entry.active; },
    };
    return entry;
  }

  const api = {
    push(page) {
      if (closed) return;
      leave(stack.at(-1));
      const entry = makeEntry(page);
      stack.push(entry);
      entry.release = pushBack(() => api.pop(true));
      show(entry, 'fwd');
    },
    /** Замінити поточну сторінку (без кроку «назад»). */
    replace(page) {
      if (closed) return;
      const cur = stack.pop();
      leave(cur);
      const entry = makeEntry(page);
      entry.release = cur.release;
      stack.push(entry);
      show(entry, 'fwd');
    },
    pop(fromBack = false) {
      if (stack.length < 2) { api.close(fromBack); return; }
      const cur = stack.pop();
      if (!fromBack) cur.release();
      leave(cur);
      show(stack.at(-1), 'back');
    },
    close(fromBack = false) {
      if (closed) return;
      closed = true;
      stack.slice().reverse().forEach((entry, i) => {
        leave(entry);
        if (!(fromBack && i === 0)) entry.release();
      });
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 280);
      lockScroll(false);
      root.onClose?.();
    },
    get closed() { return closed; },
  };

  overlay.addEventListener('click', () => api.close());
  closeBtn.addEventListener('click', () => api.close());
  backBtn.addEventListener('click', () => api.pop());
  enableDragToClose(head, panel, () => api.close());

  layers().append(wrap);
  lockScroll(true);
  const first = makeEntry(root);
  stack.push(first);
  first.release = pushBack(() => api.close(true));
  show(first);
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
