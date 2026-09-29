// Обгортка над Telegram.WebApp. Поза Telegram усі виклики — тихі no-op
// (SDK сам пише попередження в консоль, якщо метод не підтримується версією).

const W = window.Telegram?.WebApp;

/** WebApp, лише якщо застосунок справді відкрито в Telegram. */
export const tg = W && W.platform && W.platform !== 'unknown' ? W : null;
export const isTelegram = !!tg;
export const atLeast = (v) => !!tg && tg.isVersionAtLeast(v);
export const cloudAvailable = atLeast('6.9');
export const firstName = tg?.initDataUnsafe?.user?.first_name || '';

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (atLeast('7.7')) tg.disableVerticalSwipes();
}

export const haptic = {
  light() { if (atLeast('6.1')) tg.HapticFeedback.impactOccurred('light'); },
  select() { if (atLeast('6.1')) tg.HapticFeedback.selectionChanged(); },
  success() { if (atLeast('6.1')) tg.HapticFeedback.notificationOccurred('success'); },
  warning() { if (atLeast('6.1')) tg.HapticFeedback.notificationOccurred('warning'); },
};

export function colorScheme() {
  if (tg) return tg.colorScheme === 'dark' ? 'dark' : 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function onColorSchemeChange(fn) {
  if (tg) tg.onEvent('themeChanged', fn);
  else window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', fn);
}

/** Колір шапки і фону Telegram під небо/фон застосунку. */
export function setChromeColors(header, bg) {
  if (!atLeast('6.9')) return;
  try {
    if (header) tg.setHeaderColor(header);
    if (bg) tg.setBackgroundColor(bg);
    if (bg && atLeast('7.10')) tg.setBottomBarColor(bg);
  } catch { /* неправильний колір — не критично */ }
}

export function setClosingConfirmation(on) {
  if (!atLeast('6.2')) return;
  if (on) tg.enableClosingConfirmation();
  else tg.disableClosingConfirmation();
}

export const backButton = {
  show() { if (atLeast('6.1')) tg.BackButton.show(); },
  hide() { if (atLeast('6.1')) tg.BackButton.hide(); },
  onClick(fn) { if (atLeast('6.1')) tg.BackButton.onClick(fn); },
};

/**
 * Повернення в застосунок (Bot API 8.0+), зміна видимості вкладки або фокус вікна
 * (Telegram Desktop: вікно лишається «видимим», коли просто перемикаєшся на нього).
 * Може спрацювати кілька разів поспіль — тротлінг на боці fn (store.refresh).
 */
export function onResume(fn) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fn();
  });
  window.addEventListener('focus', fn);
  if (atLeast('8.0')) tg.onEvent('activated', fn);
}
