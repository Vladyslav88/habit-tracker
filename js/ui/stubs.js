// Вкладки, що зʼявляться в Етапі 2. Поки — акуратні заглушки з кількома цифрами.
import { plural } from '../dates.js';
import { HABITS } from '../entry.js';
import { h } from './dom.js';

function countDone(store, habit) {
  let n = 0;
  for (const [id, e] of store.entries) if (id.endsWith(`:${habit}`) && e.s === 'done') n++;
  return n;
}

function soon({ emoji, title, text, facts }) {
  return h('section', { class: 'card soon' },
    h('div', { class: 'soon-emoji', 'aria-hidden': 'true' }, emoji),
    h('h2', null, title),
    h('p', { class: 'muted' }, text),
    facts.length ? h('div', { class: 'soon-facts' }, facts.map(([v, k]) => h('div', null, h('b', null, v), h('span', null, k)))) : null,
    h('span', { class: 'tag' }, 'Етап 2'));
}

export function renderAnalytics(view, { store }) {
  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Аналітика')),
    h('div', { class: 'page-body' }, soon({
      emoji: '📈',
      title: 'Тут буде аналітика',
      text: 'Відсоток виконання, серії, енергія, спина після різних Днів, контрольні точки і місячна картка-підсумок.',
      facts: ['train', 'eng'].map((hb) => {
        const n = countDone(store, hb);
        return [String(n), plural(n, HABITS[hb].forms)];
      }),
    })));
}

export function renderEnglish(view, { store }) {
  const topics = store.topics().length;
  let openHw = 0;
  for (const [id, e] of store.entries) if (id.endsWith(':eng') && e.hw?.text && e.hw.done !== true) openHw++;
  view.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, 'Англійська')),
    h('div', { class: 'page-body' }, soon({
      emoji: '📚',
      title: 'Пройдені теми',
      text: 'Список тем і домашок із пошуком і фільтрами. Поки що теми й домашки записуються у формі заняття на вкладці «Сьогодні».',
      facts: [
        [String(topics), plural(topics, ['тема', 'теми', 'тем'])],
        [String(openHw), plural(openHw, ['невиконана домашка', 'невиконані домашки', 'невиконаних домашок'])],
      ],
    })));
}
