const FONT_KEY = 'tools-font';

export const FONTS = {
  vga: {
    id: 'vga',
    family: 'PxPlus IBM VGA 8x16',
    labelKey: 'fontVga',
  },
  tiny5: {
    id: 'tiny5',
    family: 'Tiny5',
    labelKey: 'fontTiny5',
  },
};

const ORDER = ['vga', 'tiny5'];
const listeners = new Set();

function normalizeFontId(fontId) {
  if (fontId === 'fairfax') {
    return 'vga';
  }
  return FONTS[fontId] ? fontId : null;
}

export function getStoredFont() {
  const stored = localStorage.getItem(FONT_KEY);
  return normalizeFontId(stored);
}

export function getFont() {
  const current = document.documentElement.getAttribute('data-font');
  return normalizeFontId(current) ?? 'vga';
}

export function applyFont(fontId) {
  const id = normalizeFontId(fontId) ?? 'vga';
  document.documentElement.setAttribute('data-font', id);
  listeners.forEach((fn) => fn(id));
}

export function setFont(fontId) {
  const id = normalizeFontId(fontId) ?? 'vga';
  localStorage.setItem(FONT_KEY, id);
  applyFont(id);
}

export function cycleFont() {
  const current = getFont();
  const index = ORDER.indexOf(current);
  const next = ORDER[(index + 1) % ORDER.length];
  setFont(next);
  return next;
}

export function onFontChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initFont() {
  applyFont(getStoredFont() ?? 'vga');
}
