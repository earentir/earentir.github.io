import { t, onLangChange } from '../i18n.js';
import { ApiError } from '../config.js';
import {
  fetchWatchlist,
  importCSV,
  compareLists,
  formatProgress,
  foldHeader,
  bindFolds,
  escapeHtml,
  titleRowHtml,
} from './wl-api.js';

const FOLDS_KEY = 'tools-wl-compare-folds';
const DEFAULT_FOLDS = {
  lists: true,
  result: true,
};

let rootEl = null;
let cleanup = [];
let folds = { ...DEFAULT_FOLDS };
let unsubLang = null;

/** @type {{ id: string, owner: string, input: string, watchlist: any|null }[]} */
let slots = [];
let compareResult = null;
let compareId = null;
let activeView = 'common';
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
  rootEl?.querySelectorAll('button, input').forEach((el) => {
    el.disabled = next;
  });
}

function errMessage(err) {
  if (err instanceof ApiError) {
    return err.hint ? `${err.message} — ${err.hint}` : err.message;
  }
  return err?.message || String(err);
}

function ensureSlots() {
  while (slots.length < 2) {
    slots.push({
      id: `slot-${slots.length + 1}`,
      owner: '',
      input: '',
      watchlist: null,
    });
  }
}

function renderLists() {
  const host = $('wl-lists');
  if (!host) {
    return;
  }
  host.innerHTML = slots.map((slot, index) => `
    <div class="wl-slot" data-slot="${index}">
      <div class="wl-slot-head">
        <strong>${t('wlListN', { n: index + 1 })}</strong>
        ${slots.length > 2 ? `<button type="button" class="tiles-remove-btn wl-slot-remove" data-remove="${index}" aria-label="${t('wlRemoveList')}">×</button>` : ''}
      </div>
      <div class="dmt-row">
        <div class="dmt-field">
          <label for="wl-owner-${index}">${t('wlOwner')}</label>
          <input type="text" id="wl-owner-${index}" data-owner="${index}" value="${escapeHtml(slot.owner)}" placeholder="${t('wlOwnerPlaceholder')}">
        </div>
        <div class="dmt-field dmt-field-wide">
          <label for="wl-input-${index}">${t('wlInput')}</label>
          <input type="text" id="wl-input-${index}" data-input="${index}" value="${escapeHtml(slot.input)}" placeholder="${t('wlInputPlaceholder')}" spellcheck="false">
        </div>
      </div>
      <div class="dmt-actions">
        <button type="button" class="dmt-btn" data-fetch="${index}">${t('wlFetch')}</button>
        <label class="dmt-btn dmt-btn-secondary wl-file-btn">
          ${t('wlImportCsv')}
          <input type="file" data-csv="${index}" accept=".csv,text/csv" hidden>
        </label>
      </div>
      <p class="dmt-hint">${slot.watchlist
        ? t('wlSlotLoaded', {
          name: slot.watchlist.name || slot.watchlist.source?.label || slot.owner || '—',
          count: slot.watchlist.count ?? slot.watchlist.titles?.length ?? 0,
        })
        : t('wlSlotEmpty')}</p>
    </div>
  `).join('');
}

function viewTitles() {
  if (!compareResult) {
    return [];
  }
  switch (activeView) {
    case 'common':
      return compareResult.common || [];
    case 'partial':
      return (compareResult.partial || []).map((e) => e.title);
    case 'all':
      return (compareResult.all || []).map((e) => e.title);
    default:
      if (activeView.startsWith('unique:')) {
        const owner = activeView.slice('unique:'.length);
        return (compareResult.unique?.[owner] || []).map((e) => e.title);
      }
      return [];
  }
}

function renderResult() {
  const box = $('wl-result');
  if (!box) {
    return;
  }
  if (!compareResult) {
    box.innerHTML = `<p class="dmt-hint" style="margin:0">${t('wlCompareEmpty')}</p>`;
    return;
  }

  const stats = compareResult.stats || {};
  const owners = compareResult.owners || [];
  const views = [
    { id: 'common', label: t('wlViewCommon', { n: stats.common_count ?? 0 }) },
    { id: 'partial', label: t('wlViewPartial', { n: stats.partial_count ?? 0 }) },
    { id: 'all', label: t('wlViewAll', { n: stats.union_count ?? 0 }) },
    ...owners.map((owner) => ({
      id: `unique:${owner}`,
      label: t('wlViewUnique', { owner, n: stats.unique_count?.[owner] ?? 0 }),
    })),
  ];

  const titles = viewTitles().slice(0, 80);
  box.innerHTML = `
    <div class="wl-summary-grid">
      <div><span class="wl-meta">${t('wlLists')}</span><strong>${stats.list_count ?? owners.length}</strong></div>
      <div><span class="wl-meta">${t('wlCommonCount')}</span><strong>${stats.common_count ?? 0}</strong></div>
      <div><span class="wl-meta">${t('wlUnion')}</span><strong>${stats.union_count ?? 0}</strong></div>
    </div>
    <div class="wl-view-tabs" role="tablist">
      ${views.map((view) => `
        <button type="button" class="dmt-btn dmt-btn-secondary${activeView === view.id ? ' wl-tab-active' : ''}" data-view="${escapeHtml(view.id)}">${escapeHtml(view.label)}</button>
      `).join('')}
    </div>
    <p class="dmt-hint">${t('wlShowing', { n: titles.length, total: viewTitles().length })}</p>
    <div class="wl-title-list">
      ${titles.length ? titles.map((title) => titleRowHtml(title)).join('') : `<p class="dmt-hint">${t('wlNoTitles')}</p>`}
    </div>
  `;

  box.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeView = btn.getAttribute('data-view') || 'common';
      renderResult();
    });
  });
}

function render() {
  ensureSlots();
  const foldOpen = (id) => Boolean(folds[id]);
  rootEl.innerHTML = `
    <div class="dmt-app">
      <header class="dmt-header">
        <h1>${t('wlCompareTitle')}</h1>
        <p>${t('wlCompareBody')}</p>
      </header>

      <section class="dmt-panel tiles-fold${foldOpen('lists') ? ' open' : ''}" data-fold="lists">
        ${foldHeader(t('wlListsFold'), foldOpen('lists'))}
        <div class="tiles-fold-body"${foldOpen('lists') ? '' : ' hidden'}>
          <div id="wl-lists" class="wl-slots"></div>
          <div class="dmt-actions">
            <button type="button" class="dmt-btn dmt-btn-secondary" id="wl-add-list">${t('wlAddList')}</button>
            <button type="button" class="dmt-btn" id="wl-compare">${t('wlRunCompare')}</button>
          </div>
        </div>
      </section>

      <p class="dmt-hint" id="wl-status"></p>

      <section class="dmt-panel tiles-fold${foldOpen('result') ? ' open' : ''}" data-fold="result">
        ${foldHeader(t('wlResultFold'), foldOpen('result'))}
        <div class="tiles-fold-body"${foldOpen('result') ? '' : ' hidden'}>
          <div id="wl-result"></div>
        </div>
      </section>
    </div>
  `;

  bindFolds(rootEl, folds, persistFolds);
  renderLists();
  renderResult();
  wire();
}

function readSlotFields() {
  slots.forEach((slot, index) => {
    const owner = rootEl.querySelector(`[data-owner="${index}"]`);
    const input = rootEl.querySelector(`[data-input="${index}"]`);
    if (owner) {
      slot.owner = owner.value;
    }
    if (input) {
      slot.input = input.value;
    }
  });
}

function wire() {
  const on = (sel, event, fn) => {
    const els = typeof sel === 'string' && sel.startsWith('#')
      ? [$(sel.slice(1))].filter(Boolean)
      : [...rootEl.querySelectorAll(sel)];
    els.forEach((el) => {
      el.addEventListener(event, fn);
      cleanup.push(() => el.removeEventListener(event, fn));
    });
  };

  on('#wl-add-list', 'click', () => {
    readSlotFields();
    slots.push({
      id: `slot-${Date.now()}`,
      owner: '',
      input: '',
      watchlist: null,
    });
    cleanup.forEach((fn) => fn());
    cleanup = [];
    render();
  });

  on('[data-remove]', 'click', (event) => {
    const index = Number(event.currentTarget.getAttribute('data-remove'));
    readSlotFields();
    if (slots.length <= 2) {
      return;
    }
    slots.splice(index, 1);
    cleanup.forEach((fn) => fn());
    cleanup = [];
    render();
  });

  on('[data-fetch]', 'click', async (event) => {
    if (busy) {
      return;
    }
    const index = Number(event.currentTarget.getAttribute('data-fetch'));
    readSlotFields();
    const slot = slots[index];
    if (!slot?.input?.trim()) {
      setStatus(t('wlNeedInput'), true);
      return;
    }
    setBusy(true);
    setStatus(t('wlFetching'));
    try {
      const result = await fetchWatchlist({
        input: slot.input.trim(),
        owner: slot.owner.trim() || t('wlListN', { n: index + 1 }),
        refresh: false,
      }, (update) => setStatus(formatProgress(update) || t('wlFetching')));
      slot.watchlist = result.watchlist;
      slot.owner = slot.watchlist.owner || slot.owner;
      cleanup.forEach((fn) => fn());
      cleanup = [];
      render();
      setStatus(t('wlFetched', { count: slot.watchlist.count ?? 0 }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('[data-csv]', 'change', async (event) => {
    const index = Number(event.currentTarget.getAttribute('data-csv'));
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) {
      return;
    }
    readSlotFields();
    const slot = slots[index];
    setBusy(true);
    setStatus(t('wlImporting'));
    try {
      const result = await importCSV({
        file,
        owner: slot.owner.trim() || t('wlListN', { n: index + 1 }),
      });
      slot.watchlist = result.watchlist;
      slot.owner = slot.watchlist.owner || slot.owner;
      cleanup.forEach((fn) => fn());
      cleanup = [];
      render();
      setStatus(t('wlFetched', { count: slot.watchlist.count ?? 0 }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });

  on('#wl-compare', 'click', async () => {
    if (busy) {
      return;
    }
    readSlotFields();
    const ready = slots.filter((slot) => slot.watchlist?.id);
    if (ready.length < 2) {
      setStatus(t('wlNeedTwoLists'), true);
      return;
    }
    setBusy(true);
    setStatus(t('wlComparing'));
    try {
      const result = await compareLists(ready.map((slot) => slot.watchlist.id));
      compareId = result.compare_id;
      compareResult = result.result;
      activeView = 'common';
      renderResult();
      setStatus(t('wlCompareDone', { id: compareId || '' }));
    } catch (err) {
      setStatus(errMessage(err), true);
    } finally {
      setBusy(false);
    }
  });
}

export function mount(root) {
  rootEl = root;
  folds = loadFolds();
  slots = [];
  compareResult = null;
  compareId = null;
  activeView = 'common';
  cleanup = [];
  ensureSlots();
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
  slots = [];
  compareResult = null;
}
