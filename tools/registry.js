import { t } from './i18n.js';

export const tools = {
  home: {
    id: 'home',
    path: '/tools/',
    load: () => import('./apps/home.js'),
    titleKey: 'homeTitle',
  },
  dmt: {
    id: 'dmt',
    path: '/tools/dmt',
    load: () => import('./apps/dmt.js?v=46'),
    titleKey: 'menuDmt',
  },
  tiles: {
    id: 'tiles',
    path: '/tools/tiles',
    load: () => import('./apps/tiles.js?v=52'),
    titleKey: 'tilesTitle',
  },
  'wl-sync': {
    id: 'wl-sync',
    path: '/tools/wl-sync',
    load: () => import('./apps/wl-sync.js?v=56'),
    titleKey: 'wlSyncTitle',
  },
  'wl-compare': {
    id: 'wl-compare',
    path: '/tools/wl-compare',
    load: () => import('./apps/wl-compare.js?v=52'),
    titleKey: 'wlCompareTitle',
  },
};

export function getToolById(id) {
  return tools[id] || null;
}

export function getToolTitle(id) {
  const tool = getToolById(id);
  return tool ? t(tool.titleKey) : id;
}
