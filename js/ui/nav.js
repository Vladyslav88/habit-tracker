// Стек «назад»: вкладені екрани і шторки. Керує Telegram BackButton (у браузері — Esc).
import { backButton } from '../tg.js';

const stack = [];

function sync() {
  if (stack.length) backButton.show();
  else backButton.hide();
}

/** Реєструє обробник «назад». Повертає функцію, що знімає його зі стеку. */
export function pushBack(fn) {
  const item = { fn };
  stack.push(item);
  sync();
  return () => {
    const i = stack.indexOf(item);
    if (i >= 0) {
      stack.splice(i, 1);
      sync();
    }
  };
}

export function goBack() {
  const item = stack.pop();
  sync();
  item?.fn();
  return !!item;
}

export const depth = () => stack.length;

export function initNav() {
  backButton.onClick(goBack);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) {
      e.preventDefault();
      goBack();
    }
  });
}
