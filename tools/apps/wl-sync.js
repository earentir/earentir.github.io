import { t, onLangChange } from '../i18n.js';
import { ApiError } from '../config.js';
import {
  fetchWatchlist,
  importCSV,
  jellyfinConnect,
  jellyfinDisconnect,
  jellyfinStatus,
  jellyfinScan,
  jellyfinMatch,
  jellyfinSync,
  formatProgress,
  foldHeader,
  bindFolds,
  loadJellyfinCreds,
  saveJellyfinCreds,
  escapeHtml,
  titleRowHtml,
} from './wl-api.js';

const FOLDS_KEY = 'tools-wl-sync-folds';
const DEFAULT_FOLDS = {
  source: true,
  jellyfin: true,
  sync: true,
  result: true,
};

let rootEl = null;
let cleanup = [];
let folds = { ...DEFAULT_FOLDS };
let unsubLang = null;

let watchlist = null;
let matchResult = null;
let dryPlan = null;
let busy = false;

function $(id) {
  return rootEl.querySelector(`#${id}`);
}

function loadFolds() {
  try {
    const raw = localStorage.getItem(FOLDS_KEY);
    if (raw) {
      return { ...DEFAULT_FOLDS, ...JSON.parse(raw) };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FOLDS };
}

function persistFolds(next) {
  folds = { ...DEFAULT_FOLDS, ...next };
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch {
    /* ignore */
  }
}

function setStatus(msg, isError = false) {
  const el = $('wl-status');
  if (!el) {
    return;
  }
  el.textContent = msg || '';
  el.classList.toggle('dmt-hint-error', Boolean(isError && msg));
}

function setBusy(next) {
  busy = next;
  rootEl?.querySelectorAll('button, input, select').forEach((el) => {
    if (el.dataset.keepEnabled === 'true') {
      return;
    }
    el.disabled = next;
  });
}

function errMessage(err) {
  if (err instanceof ApiError) {
    return err.hint ? `${err.message} — ${err.hint}` : err.message;
  }
  return err?.message || String(err);
}

function renderSummary() {
  const box = $('wl-summary');
  if (!box) {
    return;
  }
  if (!watchlist) {
    box.innerHTML = `<p class="dmt-hint">${t('wlNoList')}</p>`;
    return;
  }
  box.innerHTML = `
    <div class="wl-summary-grid">
      <div><span class="wl-meta">${t('wlOwner')}</span><strong>${escapeHtml(watchlist.owner || '—')}</strong></div>
      <div><span class="wl-meta">${t('wlName')}</span><strong>${escapeHtml(watchlist.name || watchlist.source?.label || '—')}</strong></div>
      <div><span class="wl-meta">${t('wlCount')}</span><strong>${watchlist.count ?? watchlist.titles?.length ?? 0}</strong></div>
      <div><span class="wl-meta">${t('wlSource')}</span><strong>${escapeHtml(watchlist.source?.kind || '')} ${escapeHtml(watchlist.source?.id || '')}</strong></div>
    </div>
  `;
}

function renderMatch() {
  const box = $('wl-match');
  if (!box) {
    return;
  }
  if (!matchResult) {
    box.innerHTML = `<p class="dmt-hint" style="margin:0">${t('wlMatchEmpty')}</p>`;
    return;
  }
  const s = matchResult.stats || {};
  const unmatched = (matchResult.unmatched || []).slice(0, 12);
  box.innerHTML = `
    <div class="wl-summary-grid">
      <div><span class="wl-meta">${t('wlMatched')}</span><strong>${s.matched ?? 0}</strong></div>
      <div><span class="wl-meta">${t('wlUnmatched')}</span><strong>${s.unmatched ?? 0}</strong></div>
      <div><span class="wl-meta">${t('wlByImdb')}</span><strong>${s.by_imdb ?? 0}</strong></div>
      <div><span class="wl-meta">${t('wlByTitle')}</span><strong>${s.by_title_year ?? 0}</strong></div>
    </div>
    ${unmatched.length ? `
      <p class="dmt-hint">${t('wlUnmatchedSample')}</p>
      <div class="wl-title-list">
        ${unmatched.map((title) => titleRowHtml(title)).join('')}
      </div>
    ` : ''}
    ${dryPlan ? `
      <p class="dmt-hint" style="margin-top:12px">${t('wlPlanSummary', {
        add: dryPlan.to_add ?? 0,
        remove: dryPlan.to_remove ?? 0,
        final: dryPlan.final_count ?? 0,
        mode: dryPlan.mode || 'append',
      })}</p>
    ` : ''}
  `;
}

function render() {
  const foldOpen = (id) => Boolean(folds[id]);
  const creds = loadJellyfinCreds();
  rootEl.innerHTML = `
    <div class="dmt-app">
      <header class="dmt-header">
        <h1>${t('wlSyncTitle')}</h1>
      </header>

      <section class="dmt-panel tiles-fold${foldOpen('source') ? ' open' : ''}" data-fold="source">
        ${foldHeader(t('wlSourceFold'), foldOpen('source'))}
        <div class="tiles-fold-body"${foldOpen('source') ? '' : ' hidden'}>
          <div class="dmt-row">
            <div class="dmt-field dmt-field-wide">
              <label for="wl-owner">${t('wlOwner')}</label>
              <input type="text" id="wl-owner" placeholder="${t('wlOwnerPlaceholder')}" autocomplete="nickname">
            </div>
          </div>
          <div class="dmt-row">
            <div class="dmt-field dmt-field-wide">
              <label for="wl-input">${t('wlInput')}</label>
              <input type="text" id="wl-input" placeholder="${t('wlInputPlaceholder')}" spellcheck="false">
            </div>
          </div>
          <div class="dmt-actions">
            <button type="button" class="dmt-btn" id="wl-fetch">${t('wlFetch')}</button>
            <label class="dmt-btn dmt-btn-secondary wl-file-btn">
              ${t('wlImportCsv')}
              <input type="file" id="wl-csv" accept=".csv,text/csv" hidden>
            </label>
            <label class="wl-check">
              <input type="checkbox" id="wl-refresh">
              <span>${t('wlRefresh')}</span>
            </label>
          </div>
          <div id="wl-summary"></div>
        </div>
      </section>

      <section class="dmt-panel tiles-fold${foldOpen('jellyfin') ? ' open' : ''}" data-fold="jellyfin">
        ${foldHeader(t('wlJellyfinFold'), foldOpen('jellyfin'))}
        <div class="tiles-fold-body"${foldOpen('jellyfin') ? '' : ' hidden'}>
          <div class="dmt-row">
            <div class="dmt-field dmt-field-wide">
              <label for="wl-jf-url">${t('wlJfUrl')}</label>
              <input type="text" id="wl-jf-url" value="${escapeHtml(creds.url)}" placeholder="http://jellyfin.local:8096" spellcheck="false">
            </div>
          </div>
          <div class="dmt-row">
            <div class="dmt-field dmt-field-wide">
              <label for="wl-jf-key">${t('wlJfKey')}</label>
              <input type="password" id="wl-jf-key" value="${escapeHtml(creds.apiKey)}" placeholder="${t('wlJfKeyPlaceholder')}" autocomplete="off">
            </div>
          </div>
          <div class="dmt-actions">
            <button type="button" class="dmt-btn" id="wl-jf-connect">${t('wlJfConnect')}</button>
            <button type="button" class="dmt-btn dmt-btn-secondary" id="wl-jf-scan">${t('wlJfScan')}</button>
            <button type="button" class="dmt-btn dmt-btn-secondary" id="wl-jf-disconnect">${t('wlJfDisconnect')}</button>
            <label class="wl-check">
              <input type="checkbox" id="wl-jf-remember" ${creds.remember ? 'checked' : ''}>
              <span>${t('wlJfRemember')}</span>
            </label>
          </div>
          <p class="dmt-hint" id="wl-jf-status"></p>
        </div>
      </section>

      <section class="dmt-panel tiles-fold${foldOpen('sync') ? ' open' : ''}" data-fold="sync">
        ${foldHeader(t('wlSyncFold'), foldOpen('sync'))}
        <div class="tiles-fold-body"${foldOpen('sync') ? '' : ' hidden'}>
          <div class="dmt-row">
            <div class="dmt-field dmt-field-wide">
              <label for="wl-playlist">${t('wlPlaylist')}</label>
              <input type="text" id="wl-playlist" value="IMDb Watchlist" spellcheck="false">
            </div>
          </div>
          <div class="dmt-row">
            <div class="dmt-field">
              <label for="wl-mode">${t('wlMode')}</label>
              <select id="wl-mode">
                <option value="append">${t('wlModeAppend')}</option>
                <option value="replace">${t('wlModeReplace')}</option>
                <option value="create">${t('wlModeCreate')}</option>
              </select>
            </div>
            <div class="dmt-field">
              <label class="wl-check wl-check-block">
                <input type="checkbox" id="wl-movies-only">
                <span>${t('wlMoviesOnly')}</span>
              </label>
              <label class="wl-check wl-check-block">
                <input type="checkbox" id="wl-public">
                <span>${t('wlPublic')}</span>
              </label>
              <label class="wl-check wl-check-block">
                <input type="checkbox" id="wl-exact-only" checked>
                <span>${t('wlExactOnly')}</span>
              </label>
            </div>
          </div>
          <div class="dmt-actions">
            <button type="button" class="dmt-btn" id="wl-dry">${t('wlDryRun')}</button>
            <button type="button" class="dmt-btn dmt-btn-secondary" id="wl-confirm">${t('wlConfirmSync')}</button>
          </div>
        </div>
      </section>

      <p class="dmt-hint" id="wl-status"></p>

      <section class="dmt-panel tiles-fold${foldOpen('result') ? ' open' : ''}" data-fold="result">
        ${foldHeader(t('wlResultFold'), foldOpen('result'))}
        <div class="tiles-fold-body"${foldOpen('result') ? '' : ' hidden'}>
          <div id="wl-match"></div>
        </div>
      </section>
    </div>
  `;

  bindFolds(rootEl, folds, persistFolds);
  renderSummary();
  renderMatch();
  wire();
  refreshJfStatus().catch(() => {});
}

async function refreshJfStatus() {
  const el = $('wl-jf-status');
  if (!el) {
    return;
  }
  try {
    const status = await jellyfinStatus();
    if (!status.connected) {
      el.textContent = t('wlJfNotConnected');
      return;
    }
    const lib = status.library
      ? ` · ${t('wlLibraryStats', { total: status.library.total, imdb: status.library.with_imdb })}`
      : '';
    el.textContent = `${t('wlJfConnected', {
      server: status.server?.ServerName || status.url || '',
      user: status.user?.Name || '',
    })}${lib}`;
  } catch {
    el.textContent = t('wlJfNotConnected');
  }
}

function wire() {
  const on = (id, event, fn) => {
    const el = $(id);
    if (!el) {
      return;
    }
    el.addEventListener(event, fn);
    cleanup.push(() => el.removeEventListener(event, fn));
  };

  on('wl-fetch', 'click', async () => {
    if (busy) {
      return;
    }
    const input = $('wl-input')?.value?.trim();
    if (!input) {
      setStatus(t('wlNeedInput'), true);
      return;
    }
    setBusy(true);
    setStatus(t('wlFetching'));
    try {
      const result = await fetchWatchlist({
        input,
        owner: $('wl-owner')?.value?.trim() || '',
        refresh: Boolean($('wl-refresh')?.checked),
      }, (update) => setStatus(formatProgress(update) || t('wlFetching')));
      watchlist = result.watchlist;
      matchResult = null;
      dryPlan = null;
      renderSummary();
      renderMatch();
      setStatus(t('wlFetched', { count: watchlist.count ?? watchlist.titles?.length ?? 0 }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('wl-csv', 'change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) {
      return;
    }
    setBusy(true);
    setStatus(t('wlImporting'));
    try {
      const result = await importCSV({
        file,
        owner: $('wl-owner')?.value?.trim() || '',
      });
      watchlist = result.watchlist;
      matchResult = null;
      dryPlan = null;
      renderSummary();
      renderMatch();
      setStatus(t('wlFetched', { count: watchlist.count ?? watchlist.titles?.length ?? 0 }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('wl-jf-connect', 'click', async () => {
    if (busy) {
      return;
    }
    const url = $('wl-jf-url')?.value?.trim();
    const apiKey = $('wl-jf-key')?.value?.trim();
    const remember = Boolean($('wl-jf-remember')?.checked);
    if (!url || !apiKey) {
      setStatus(t('wlNeedJf'), true);
      return;
    }
    setBusy(true);
    setStatus(t('wlConnecting'));
    try {
      await jellyfinConnect({ url, apiKey });
      saveJellyfinCreds({ url, apiKey, remember });
      await refreshJfStatus();
      setStatus(t('wlConnectedOk'));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('wl-jf-disconnect', 'click', async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await jellyfinDisconnect();
      await refreshJfStatus();
      setStatus(t('wlDisconnected'));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('wl-jf-scan', 'click', async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus(t('wlScanning'));
    try {
      const result = await jellyfinScan((update) => setStatus(formatProgress(update) || t('wlScanning')));
      await refreshJfStatus();
      setStatus(t('wlScanned', { total: result.total, imdb: result.with_imdb }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('wl-dry', 'click', () => runSync(false));
  on('wl-confirm', 'click', () => runSync(true));
}

async function runSync(confirm) {
  if (busy) {
    return;
  }
  if (!watchlist?.id) {
    setStatus(t('wlNeedList'), true);
    return;
  }
  const playlist = $('wl-playlist')?.value?.trim();
  if (!playlist) {
    setStatus(t('wlNeedPlaylist'), true);
    return;
  }

  setBusy(true);
  setStatus(confirm ? t('wlSyncing') : t('wlMatching'));
  try {
    const moviesOnly = Boolean($('wl-movies-only')?.checked);
    const exactOnly = Boolean($('wl-exact-only')?.checked);
    matchResult = await jellyfinMatch({
      watchlist_id: watchlist.id,
      movies_only: moviesOnly,
    });

    let itemIds = (matchResult.matched || []).map((m) => m.item_id);
    if (exactOnly) {
      itemIds = (matchResult.matched || [])
        .filter((m) => m.confidence === 'exact' || m.method === 'imdb')
        .map((m) => m.item_id);
    }

    const payload = {
      watchlist_id: watchlist.id,
      playlist_name: playlist,
      mode: $('wl-mode')?.value || 'append',
      public: Boolean($('wl-public')?.checked),
      movies_only: moviesOnly,
      confirm,
      item_ids: itemIds,
    };
    const result = await jellyfinSync(payload);
    if (result.dry_run) {
      dryPlan = result.plan;
      if (result.match) {
        matchResult = result.match;
      }
      renderMatch();
      setStatus(t('wlDryDone'));
    } else {
      dryPlan = result.result?.plan || dryPlan;
      renderMatch();
      setStatus(t('wlSyncDone', {
        added: result.result?.added ?? 0,
        playlist: playlist,
      }));
    }
  } catch (err) {
    setStatus(errMessage(err), true);
  } finally {
    setBusy(false);
  }
}

export function mount(root) {
  rootEl = root;
  folds = loadFolds();
  watchlist = null;
  matchResult = null;
  dryPlan = null;
  cleanup = [];
  render();
  unsubLang = onLangChange(() => {
    cleanup.forEach((fn) => fn());
    cleanup = [];
    render();
  });
}

export function unmount() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  unsubLang?.();
  unsubLang = null;
  rootEl = null;
  watchlist = null;
  matchResult = null;
  dryPlan = null;
}
