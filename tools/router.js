import { getToolById, getToolTitle } from './registry.js?v=59';
import { t } from './i18n.js';

const BASE = '/tools';

let currentId = null;
let currentModule = null;
let statusEl = null;

function normalizePath(pathname) {
  let path = pathname || '/';
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  if (path === BASE || path === `${BASE}/index.html`) {
    return 'home';
  }
  if (path.startsWith(`${BASE}/`)) {
    const slug = path.slice(BASE.length + 1).split('/')[0];
    return slug || 'home';
  }
  return 'home';
}

export function getCurrentToolId() {
  return currentId;
}

export function navigate(toolId, { replace = false } = {}) {
  const tool = getToolById(toolId) || getToolById('home');
  const url = tool.path;
  if (replace) {
    history.replaceState({ tool: tool.id }, '', url);
  } else if (location.pathname !== url && !(tool.id === 'home' && (location.pathname === BASE || location.pathname === `${BASE}/`))) {
    history.pushState({ tool: tool.id }, '', url);
  }
  return loadTool(tool.id);
}

async function loadTool(toolId) {
  const tool = getToolById(toolId) || getToolById('home');
  const root = document.getElementById('tool-root');
  if (!root) {
    return;
  }

  if (currentModule?.unmount) {
    try {
      currentModule.unmount();
    } catch {
      /* ignore unmount errors */
    }
  }
  root.replaceChildren();
  currentId = tool.id;

  try {
    const mod = await tool.load();
    currentModule = mod;
    if (mod.mount) {
      mod.mount(root);
    }
  } catch (err) {
    currentModule = null;
    root.innerHTML = `
      <div class="dmt-app">
        <header class="dmt-header">
          <h1>${t('appTitle')}</h1>
          <p class="dmt-hint dmt-hint-error">${t('tilesError')}: ${String(err?.message || err)}</p>
        </header>
      </div>
    `;
    console.error(err);
  }

  document.title = tool.id === 'home'
    ? t('appTitle')
    : `${getToolTitle(tool.id)} — ${t('appTitle')}`;
  if (statusEl) {
    statusEl.textContent = tool.id === 'home'
      ? t('statusReady')
      : t('statusTool', { name: getToolTitle(tool.id) });
  }
}

export function initRouter() {
  statusEl = document.getElementById('tp-status');

  window.addEventListener('popstate', () => {
    loadTool(normalizePath(location.pathname));
  });

  const initial = normalizePath(location.pathname);
  if (!getToolById(initial) && initial !== 'home') {
    return navigate('home', { replace: true });
  }
  return loadTool(initial);
}

export function remountCurrent() {
  const id = normalizePath(location.pathname);
  return loadTool(getToolById(id) ? id : (currentId || 'home'));
}
