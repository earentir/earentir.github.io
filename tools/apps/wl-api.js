import { getJson, postJson, postForm, watchJob } from '../config.js';

export async function resolveRef(input) {
  return postJson('/imdb/v1/resolve', { input });
}

export async function fetchWatchlist({ input, owner, refresh }, onProgress) {
  const { job_id: jobId } = await postJson('/imdb/v1/fetch', {
    input,
    owner: owner || '',
    refresh: !!refresh,
  });
  return watchJob(jobId, onProgress);
}

export async function importCSV({ file, owner, hydrate = true }) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('owner', owner || '');
  fd.append('hydrate', hydrate ? 'true' : 'false');
  return postForm('/imdb/v1/import-csv', fd);
}

export function compareLists(watchlistIds) {
  return postJson('/compare/v1', { watchlist_ids: watchlistIds });
}

export function jellyfinStatus() {
  return getJson('/jellyfin/v1/status');
}

export function jellyfinConnect({ url, apiKey }) {
  return postJson('/jellyfin/v1/connect', { url, api_key: apiKey });
}

export function jellyfinDisconnect() {
  return postJson('/jellyfin/v1/disconnect', {});
}

export async function jellyfinScan(onProgress) {
  const { job_id: jobId } = await postJson('/jellyfin/v1/scan', {});
  return watchJob(jobId, onProgress);
}

export function jellyfinMatch(body) {
  return postJson('/jellyfin/v1/match', body);
}

export function jellyfinSync(body) {
  return postJson('/jellyfin/v1/sync', body);
}

export function formatProgress(update) {
  if (!update) {
    return '';
  }
  const phase = update.phase || '';
  if (update.total > 0) {
    return `${phase} (${update.current}/${update.total})`;
  }
  return phase || update.message || '';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function foldHeader(title, open) {
  return `
    <button type="button" class="tiles-fold-toggle" aria-expanded="${open ? 'true' : 'false'}">
      <span class="tiles-fold-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
      <span class="dmt-panel-title">${title}</span>
    </button>
  `;
}

export function bindFolds(root, folds, persist) {
  root.querySelectorAll('.tiles-fold[data-fold]').forEach((section) => {
    const toggle = section.querySelector('.tiles-fold-toggle');
    const body = section.querySelector('.tiles-fold-body');
    if (!toggle || !body) {
      return;
    }
    toggle.addEventListener('click', () => {
      const open = !section.classList.contains('open');
      section.classList.toggle('open', open);
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      const icon = toggle.querySelector('.tiles-fold-icon');
      if (icon) {
        icon.textContent = open ? '▼' : '▶';
      }
      const id = section.dataset.fold;
      if (id) {
        folds[id] = open;
        persist?.(folds);
      }
    });
  });
}

const JF_KEY = 'tools-wl-jellyfin';

export function loadJellyfinCreds() {
  try {
    const raw = localStorage.getItem(JF_KEY);
    if (!raw) {
      return { url: '', apiKey: '', remember: false };
    }
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url || '',
      apiKey: parsed.apiKey || '',
      remember: Boolean(parsed.remember),
    };
  } catch {
    return { url: '', apiKey: '', remember: false };
  }
}

export function saveJellyfinCreds({ url, apiKey, remember }) {
  try {
    if (!remember) {
      localStorage.removeItem(JF_KEY);
      return;
    }
    localStorage.setItem(JF_KEY, JSON.stringify({
      url: url || '',
      apiKey: apiKey || '',
      remember: true,
    }));
  } catch {
    /* ignore */
  }
}

export function titleRowHtml(title) {
  const year = title.year ? ` (${title.year})` : '';
  const type = title.type ? `<span class="wl-meta">${escapeHtml(title.type)}</span>` : '';
  const rating = title.rating
    ? `<span class="wl-meta">★ ${Number(title.rating).toFixed(1)}</span>`
    : '';
  return `
    <div class="wl-title-row">
      <span class="wl-title-name">${escapeHtml(title.title || title.imdb_id)}${escapeHtml(year)}</span>
      ${type}${rating}
    </div>
  `;
}
