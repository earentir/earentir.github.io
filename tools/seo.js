/** Static share / Open Graph metadata per tools route (English for crawlers). */

export const SITE_ORIGIN = 'https://earentir.dev';

export const seoById = {
  home: {
    id: 'home',
    path: '/tools/',
    title: 'Earentir Tools',
    description: 'Turbo Pascal-style utilities: Discord time, tile calculator, watchlist sync, and more.',
    image: '/tools/og-default.png',
  },
  dmt: {
    id: 'dmt',
    path: '/tools/dmt',
    title: 'Discord Magic Time',
    description: 'Convert dates and times into Discord timestamp codes for chat messages.',
    image: '/tools/og-dmt.png',
  },
  tiles: {
    id: 'tiles',
    path: '/tools/tiles',
    title: 'Tiles Calculator',
    description: 'Calculate tile coverage, orientations, cuts, joint gap, skirting, and pricing for a space.',
    image: '/tools/og-tiles.png',
  },
  'wl-sync': {
    id: 'wl-sync',
    path: '/tools/wl-sync',
    title: 'IMDb → Jellyfin sync',
    description: 'Fetch a public IMDb watchlist or list, match titles in Jellyfin, and write a playlist.',
    image: '/tools/og-wl-sync.png',
  },
  'wl-compare': {
    id: 'wl-compare',
    path: '/tools/wl-compare',
    title: 'Compare watchlists',
    description: 'Compare two or more public IMDb lists: shared titles, unique items, and the full union.',
    image: '/tools/og-wl-compare.png',
  },
  api: {
    id: 'api',
    path: '/tools/api',
    title: 'earapi docs',
    description: 'API documentation for earentir services (tilecalc, DMT, watchlist, and more).',
    image: '/tools/og-api.png',
  },
};

function absoluteUrl(path) {
  if (!path) {
    return SITE_ORIGIN;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
  });
  return el;
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return el;
}

export function getSeo(toolId) {
  return seoById[toolId] || seoById.home;
}

/** Update document title + Open Graph / Twitter tags for the active tool. */
export function applySeo(toolId) {
  const seo = getSeo(toolId);
  const pageTitle = toolId === 'home' ? seo.title : `${seo.title} — Earentir Tools`;
  const url = absoluteUrl(seo.path);
  const image = absoluteUrl(seo.image);

  document.title = pageTitle;

  upsertMeta('meta[name="description"]', { name: 'description', content: seo.description });

  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Earentir Tools' });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });

  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: seo.title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: seo.description });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });

  upsertLink('canonical', url);
}
