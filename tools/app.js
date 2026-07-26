import { initI18n, setLang, getLang, onLangChange, t } from './i18n.js?v=33';
import { initTheme, toggleTheme, getTheme, onThemeChange } from './theme.js';
import { initFont, cycleFont, getFont, FONTS, onFontChange } from './font.js';
import { initDesktop, onDesktopChange } from './desktop.js';
import { initMenu } from './menu.js';
import { initRouter, remountCurrent } from './router.js?v=34';

const SHADE = '\u2591'; // ░ light shade

function paintDesktop() {
  const desktop = document.getElementById('tp-desktop');
  if (!desktop || document.documentElement.getAttribute('data-desktop') !== 'shadow') {
    if (desktop) {
      desktop.textContent = '';
    }
    return;
  }

  // Match title size (32 / 30); VGA glyphs are half as wide as tall
  const fontSize = document.documentElement.getAttribute('data-font') === 'tiny5' ? 30 : 32;
  const lineHeight = fontSize;
  const charWidth = fontSize / 2;
  const cols = Math.ceil(window.innerWidth / charWidth) + 2;
  const rows = Math.ceil(window.innerHeight / lineHeight) + 2;
  const line = SHADE.repeat(Math.max(cols, 1));
  desktop.textContent = Array.from({ length: Math.max(rows, 1) }, () => line).join('\n');
}

function syncThemeFooterButton() {
  const btn = document.getElementById('theme-footer-btn');
  if (!btn) {
    return;
  }
  const theme = getTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  const label = t('menuTheme');
  btn.title = `${label} (${next})`;
  btn.setAttribute('aria-label', `${label} (${next})`);
}

function syncFontFooterButton() {
  const btn = document.getElementById('font-footer-btn');
  if (!btn) {
    return;
  }
  const current = getFont();
  const nextId = current === 'vga' ? 'tiny5' : 'vga';
  const currentLabel = t(FONTS[current].labelKey);
  const nextLabel = t(FONTS[nextId].labelKey);
  const label = `${t('menuFont')}: ${currentLabel} → ${nextLabel}`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.dataset.font = current;
}

function syncLangButtons() {
  const lang = getLang();
  document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');
  document.getElementById('lang-el')?.classList.toggle('active', lang === 'el');
}

function initLangButtons() {
  document.getElementById('lang-en')?.addEventListener('click', () => setLang('en'));
  document.getElementById('lang-el')?.addEventListener('click', () => setLang('el'));
  syncLangButtons();
  onLangChange(() => {
    syncLangButtons();
    syncThemeFooterButton();
    syncFontFooterButton();
    remountCurrent();
  });
}

function initThemeFooterButton() {
  document.getElementById('theme-footer-btn')?.addEventListener('click', () => toggleTheme());
  syncThemeFooterButton();
  onThemeChange(() => {
    syncThemeFooterButton();
    paintDesktop();
  });
}

function initFontFooterButton() {
  document.getElementById('font-footer-btn')?.addEventListener('click', () => cycleFont());
  syncFontFooterButton();
  onFontChange(() => {
    syncFontFooterButton();
    paintDesktop();
  });
}

function initDesktopPattern() {
  initDesktop();
  paintDesktop();
  onDesktopChange(paintDesktop);
  window.addEventListener('resize', paintDesktop);
}

initTheme();
initFont();
initDesktopPattern();
initI18n();
initLangButtons();
initThemeFooterButton();
initFontFooterButton();
initMenu();
initRouter();
