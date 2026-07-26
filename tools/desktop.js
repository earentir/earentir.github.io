const DESKTOP_KEY = 'tools-desktop';

const listeners = new Set();

export function isDesktopPatternEnabled() {
  const stored = localStorage.getItem(DESKTOP_KEY);
  if (stored === null) {
    return false;
  }
  return stored === 'on';
}

export function applyDesktopPattern(enabled) {
  document.documentElement.setAttribute('data-desktop', enabled ? 'shadow' : 'plain');
  listeners.forEach((fn) => fn(enabled));
}

export function setDesktopPattern(enabled) {
  localStorage.setItem(DESKTOP_KEY, enabled ? 'on' : 'off');
  applyDesktopPattern(enabled);
}

export function toggleDesktopPattern() {
  setDesktopPattern(!isDesktopPatternEnabled());
}

export function onDesktopChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initDesktop() {
  applyDesktopPattern(isDesktopPatternEnabled());
}
