const THEME_KEY = 'tools-theme';
const LEGACY_THEME_KEY = 'dmt-theme';

const listeners = new Set();

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  listeners.forEach((fn) => fn(theme));
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(LEGACY_THEME_KEY, theme);
  applyTheme(theme);
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme() {
  applyTheme(getStoredTheme() ?? getSystemTheme());

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
    if (!getStoredTheme()) {
      applyTheme(event.matches ? 'light' : 'dark');
    }
  });
}
