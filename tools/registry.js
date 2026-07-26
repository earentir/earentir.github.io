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
    load: () => import('./apps/dmt.js?v=37'),
    titleKey: 'menuDmt',
  },
  tiles: {
    id: 'tiles',
    path: '/tools/tiles',
    load: () => import('./apps/tiles.js?v=37'),
    titleKey: 'tilesTitle',
  },
};

export function getToolById(id) {
  return tools[id] || null;
}

export function getToolTitle(id) {
  const tool = getToolById(id);
  return tool ? t(tool.titleKey) : id;
}
