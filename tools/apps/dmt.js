import { t } from '../i18n.js';
import { API_BASE, fetchJson } from '../config.js';

const YEAR_MIN = 1970;
const YEAR_MAX = 2100;
const FOLDS_KEY = 'tools-dmt-folds';
const DATE_ONLY_FORMAT_INDEXES = new Set([2, 3]);

const DEFAULT_FOLDS = {
  date: true,
  time: true,
  output: true,
  result: true,
};

let rootEl = null;
let cleanup = [];
let folds = { ...DEFAULT_FOLDS };
let calcSeq = 0;
let refreshTimer = null;

function $(id) {
  return rootEl.querySelector(`#${id}`);
}

function $all(sel) {
  return [...rootEl.querySelectorAll(sel)];
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function addLZ(digit) {
  return digit.toString().padStart(2, '0');
}

function buildTHT(datetime, seconds = true) {
  const parts = datetime.toTimeString().split(' ')[0].split(':');
  const hours = parts[0];
  const minutes = parts[1];
  const secs = parts[2];
  return seconds ? `${hours}:${minutes}:${secs}` : `${hours}:${minutes}`;
}

function months() {
  return t('months');
}

function days() {
  return t('days');
}

function normalizeFolds(raw) {
  return {
    ...DEFAULT_FOLDS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
}

function loadFolds() {
  try {
    const raw = localStorage.getItem(FOLDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeFolds(parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FOLDS };
}

function persistFolds(next) {
  folds = normalizeFolds(next);
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch {
    /* ignore */
  }
  return folds;
}

function readFoldsFromDom() {
  const next = { ...folds };
  $all('.tiles-fold[data-fold]').forEach((el) => {
    const id = el.dataset.fold;
    if (id) {
      next[id] = el.classList.contains('open');
    }
  });
  return next;
}

function isFoldOpen(id) {
  const el = rootEl?.querySelector(`.tiles-fold[data-fold="${id}"]`);
  if (el) {
    return el.classList.contains('open');
  }
  return Boolean(folds[id]);
}

function foldHeader(title, open) {
  return `
    <button type="button" class="tiles-fold-toggle" aria-expanded="${open ? 'true' : 'false'}">
      <span class="tiles-fold-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
      <span class="dmt-panel-title">${title}</span>
    </button>
  `;
}

function formatOffsetMinutes(totalMins) {
  const sign = totalMins >= 0 ? '+' : '-';
  const abs = Math.abs(totalMins);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function render() {
  const foldOpen = (id) => Boolean(folds[id]);
  rootEl.innerHTML = `
    <div class="dmt-app">
      <header class="dmt-header">
        <h1>${t('dmtTitle')}</h1>
      </header>

      <div class="dmt-datetime-row">
        <section class="dmt-panel tiles-fold${foldOpen('date') ? ' open' : ''}" data-fold="date">
          ${foldHeader(t('dmtDate'), foldOpen('date'))}
          <div class="tiles-fold-body"${foldOpen('date') ? '' : ' hidden'}>
            <div class="dmt-row">
              <div class="dmt-field">
                <label for="date-year">${t('dmtYear')}</label>
                <select id="date-year" aria-label="${t('dmtYear')}"></select>
              </div>
              <div class="dmt-field">
                <label for="date-month">${t('dmtMonth')}</label>
                <select id="date-month" aria-label="${t('dmtMonth')}"></select>
              </div>
              <div class="dmt-field">
                <label for="date-day">${t('dmtDay')}</label>
                <select id="date-day" aria-label="${t('dmtDay')}"></select>
              </div>
            </div>
            <div class="dmt-time-display" id="date-preview" aria-live="polite"></div>
          </div>
        </section>

        <section class="dmt-panel tiles-fold${foldOpen('time') ? ' open' : ''}" data-fold="time">
          ${foldHeader(t('dmtTime'), foldOpen('time'))}
          <div class="tiles-fold-body"${foldOpen('time') ? '' : ' hidden'}>
            <div class="dmt-row">
              <div class="dmt-field">
                <label for="time-hour">${t('dmtHour')}</label>
                <select id="time-hour" aria-label="${t('dmtHour')}"></select>
              </div>
              <div class="dmt-field">
                <label for="time-minute">${t('dmtMinute')}</label>
                <select id="time-minute" aria-label="${t('dmtMinute')}"></select>
              </div>
              <div class="dmt-field dmt-field-with-btn">
                <label for="time-second">${t('dmtSecond')}</label>
                <div class="dmt-field-control">
                  <select id="time-second" aria-label="${t('dmtSecond')}"></select>
                  <button type="button" class="dmt-btn dmt-btn-secondary dmt-btn-inline" id="complete-btn">${t('dmtComplete')}</button>
                </div>
              </div>
            </div>
            <div class="dmt-time-display" id="time-preview" aria-live="polite"></div>
          </div>
        </section>
      </div>

      <p class="dmt-hint" id="dmt-status"></p>

      <section class="dmt-panel tiles-fold${foldOpen('output') ? ' open' : ''}" data-fold="output">
        ${foldHeader(t('dmtOutput'), foldOpen('output'))}
        <div class="tiles-fold-body"${foldOpen('output') ? '' : ' hidden'}>
          <div class="dmt-field dmt-field-wide">
            <label for="outputFormat">${t('dmtFormat')}</label>
            <select id="outputFormat" aria-label="${t('dmtFormat')}"></select>
          </div>
        </div>
      </section>

      <section class="dmt-panel tiles-fold${foldOpen('result') ? ' open' : ''}" data-fold="result">
        ${foldHeader(t('dmtResult'), foldOpen('result'))}
        <div class="tiles-fold-body"${foldOpen('result') ? '' : ' hidden'}>
          <div class="dmt-output-row">
            <button type="button" class="dmt-btn dmt-btn-secondary" id="now-btn">${t('dmtNow')}</button>
            <input type="text" id="discorttime" name="discorttime" readonly aria-label="${t('dmtResult')}">
            <button type="button" class="dmt-btn dmt-btn-secondary" id="copy-btn">${t('dmtCopy')}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function setStatus(message, isError = false) {
  const el = $('dmt-status');
  if (!el) {
    return;
  }
  el.textContent = message || '';
  el.classList.toggle('dmt-hint-error', Boolean(isError && message));
}

function populateDateSelectors() {
  const yearSelect = $('date-year');
  const monthSelect = $('date-month');

  for (let year = YEAR_MIN; year <= YEAR_MAX; year += 1) {
    yearSelect.append(createOption(String(year), String(year)));
  }

  months().forEach((name, index) => {
    const monthNum = String(index + 1).padStart(2, '0');
    monthSelect.append(createOption(monthNum, `${name} (${monthNum})`));
  });
}

function populateNumericSelect(id, min, max) {
  const select = $(id);
  for (let value = min; value <= max; value += 1) {
    const label = String(value).padStart(2, '0');
    select.append(createOption(label, label));
  }
}

function populateTimeSelectors() {
  populateNumericSelect('time-hour', 0, 23);
  populateNumericSelect('time-minute', 0, 59);
  populateNumericSelect('time-second', 0, 59);
}

function syncDayOptions() {
  const year = Number($('date-year').value);
  const month = Number($('date-month').value);
  const daySelect = $('date-day');
  const previousDay = Number(daySelect.value) || 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  daySelect.replaceChildren();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const label = String(day).padStart(2, '0');
    daySelect.append(createOption(label, label));
  }

  daySelect.value = String(Math.min(previousDay, daysInMonth)).padStart(2, '0');
}

function updateDatePreview() {
  const year = $('date-year').value;
  const month = Number($('date-month').value);
  const day = $('date-day').value;
  const date = new Date(Number(year), month - 1, Number(day));
  $('date-preview').textContent = `${days()[date.getDay()]}, ${months()[month - 1]} ${day}, ${year}`;
}

function updateTimePreview() {
  $('time-preview').textContent = `${$('time-hour').value}:${$('time-minute').value}:${$('time-second').value}`;
}

function setDateTimeValues(date) {
  $('date-year').value = String(date.getFullYear());
  $('date-month').value = String(date.getMonth() + 1).padStart(2, '0');
  syncDayOptions();
  $('date-day').value = String(date.getDate()).padStart(2, '0');
  $('time-hour').value = String(date.getHours()).padStart(2, '0');
  $('time-minute').value = String(date.getMinutes()).padStart(2, '0');
  $('time-second').value = String(date.getSeconds()).padStart(2, '0');
  updateDatePreview();
  updateTimePreview();
}

function formatPreviewLabels(sample) {
  const monthNames = months();
  const dayNames = days();
  return [
    `${monthNames[sample.getMonth()]} ${addLZ(sample.getDate())}, ${sample.getFullYear()} ${buildTHT(sample)}`,
    `${dayNames[sample.getDay()]}, ${monthNames[sample.getMonth()]} ${addLZ(sample.getDate())}, ${sample.getFullYear()} ${buildTHT(sample, false)}`,
    `${addLZ(sample.getDate())}/${addLZ(sample.getMonth() + 1)}/${sample.getFullYear()}`,
    `${monthNames[sample.getMonth()]} ${addLZ(sample.getDate())}, ${sample.getFullYear()}`,
    buildTHT(sample, false),
    buildTHT(sample, true),
    t('inNDays'),
  ];
}

function populateSelectOptions({ preserve = true } = {}) {
  const select = $('outputFormat');
  if (!select) {
    return;
  }
  const previous = preserve ? select.value : '';
  const timeOpen = isFoldOpen('time');
  const sample = new Date();
  const labels = formatPreviewLabels(sample);

  select.replaceChildren();
  labels.forEach((label, index) => {
    if (!timeOpen && !DATE_ONLY_FORMAT_INDEXES.has(index)) {
      return;
    }
    select.append(createOption(String(index), label));
  });

  if (previous && [...select.options].some((opt) => opt.value === previous)) {
    select.value = previous;
  } else {
    select.value = timeOpen ? '0' : '2';
  }
}

function readWallClock() {
  const year = Number($('date-year').value);
  const month = Number($('date-month').value);
  const day = Number($('date-day').value);
  const timeOpen = isFoldOpen('time');
  const hour = timeOpen ? Number($('time-hour').value) : 0;
  const minute = timeOpen ? Number($('time-minute').value) : 0;
  const second = timeOpen ? Number($('time-second').value) : 0;

  // Normalize like the browser Date constructor (DST gaps/overlaps).
  const local = new Date(year, month - 1, day, hour, minute, second);
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    minute: local.getMinutes(),
    second: local.getSeconds(),
    offset: formatOffsetMinutes(-local.getTimezoneOffset()),
  };
}

async function fetchTimestamp({ complete = false, formatIndex = null } = {}) {
  const wall = readWallClock();
  const format = formatIndex != null ? formatIndex : Number($('outputFormat')?.value || 0);
  const params = new URLSearchParams({
    year: String(wall.year),
    month: String(wall.month),
    day: String(wall.day),
    hour: String(wall.hour),
    minute: String(wall.minute),
    second: String(wall.second),
    offset: wall.offset,
    format: String(format),
  });
  if (complete) {
    params.set('complete', 'true');
  }

  const payload = await fetchJson(`${API_BASE}/dmt/v1/timestamp?${params.toString()}`);
  if (!payload?.success) {
    throw new Error(payload?.msg || t('dmtError'));
  }
  return payload.data;
}

function showFoldWarnings() {
  const notes = [];
  if (!isFoldOpen('date')) {
    notes.push(t('dmtWarnDateCompacted'));
  }
  if (!isFoldOpen('time')) {
    notes.push(t('dmtWarnTimeCompacted'));
  }
  setStatus(notes.join(' — '), notes.length > 0);
  return notes;
}

async function refreshResult({ complete = false } = {}) {
  clearTimeout(refreshTimer);
  refreshTimer = null;

  if (!isFoldOpen('date')) {
    const out = $('discorttime');
    if (out) {
      out.value = '';
    }
    showFoldWarnings();
    return;
  }

  showFoldWarnings();
  const seq = ++calcSeq;
  try {
    const data = await fetchTimestamp({ complete });
    if (seq !== calcSeq) {
      return;
    }
    if (complete) {
      setDateTimeValues(new Date(data.unix * 1000));
      populateSelectOptions({ preserve: true });
    }
    const out = $('discorttime');
    if (out && isFoldOpen('result')) {
      out.value = data.tag;
    } else if (out) {
      out.value = data.tag;
    }
    showFoldWarnings();
  } catch (err) {
    if (seq !== calcSeq) {
      return;
    }
    const out = $('discorttime');
    if (out) {
      out.value = '';
    }
    setStatus(`${t('dmtError')}: ${err.message || err}`, true);
  }
}

function scheduleRefreshResult() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshResult();
  }, 150);
}

async function setToNow() {
  setDateTimeValues(new Date());
  populateSelectOptions({ preserve: true });
  await refreshResult();
}

async function completeTime() {
  if (!isFoldOpen('time')) {
    setFoldOpen('time', true);
    showFoldWarnings();
    return;
  }
  await refreshResult({ complete: true });
}

async function copyResult() {
  const output = $('discorttime');
  const text = output?.value || '';
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    output.select();
    document.execCommand('copy');
  }

  const copyBtn = $('copy-btn');
  const original = t('dmtCopy');
  copyBtn.textContent = t('dmtCopied');
  setTimeout(() => {
    if (copyBtn.isConnected) {
      copyBtn.textContent = original;
    }
  }, 1200);
}

function onDateTimeChange(event) {
  if (event.target.id === 'date-year' || event.target.id === 'date-month') {
    syncDayOptions();
  }
  updateDatePreview();
  updateTimePreview();
  scheduleRefreshResult();
}

function setFoldOpen(foldId, open) {
  const fold = rootEl?.querySelector(`.tiles-fold[data-fold="${foldId}"]`);
  if (!fold) {
    return;
  }
  const toggle = fold.querySelector('.tiles-fold-toggle');
  const body = fold.querySelector('.tiles-fold-body');
  const icon = toggle?.querySelector('.tiles-fold-icon');
  fold.classList.toggle('open', open);
  if (body) {
    body.hidden = !open;
  }
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (icon) {
    icon.textContent = open ? '▼' : '▶';
  }
  persistFolds({ ...readFoldsFromDom(), [foldId]: open });
  syncAfterFoldChange(foldId);
}

function syncAfterFoldChange(foldId) {
  if (foldId === 'time' || foldId === 'date' || foldId === 'output') {
    populateSelectOptions({ preserve: true });
  }
  scheduleRefreshResult();
}

function bindEvents() {
  const recalcIds = ['date-year', 'date-month', 'date-day', 'time-hour', 'time-minute', 'time-second', 'outputFormat'];
  recalcIds.forEach((id) => {
    const el = $(id);
    const handler = onDateTimeChange;
    el.addEventListener('change', handler);
    cleanup.push(() => el.removeEventListener('change', handler));
  });

  const bindings = [
    ['now-btn', 'click', setToNow],
    ['copy-btn', 'click', copyResult],
    ['complete-btn', 'click', completeTime],
  ];

  bindings.forEach(([id, event, handler]) => {
    const el = $(id);
    el.addEventListener(event, handler);
    cleanup.push(() => el.removeEventListener(event, handler));
  });

  const onFoldClick = (event) => {
    const toggle = event.target.closest('.tiles-fold-toggle');
    if (!toggle || !rootEl.contains(toggle)) {
      return;
    }
    const fold = toggle.closest('.tiles-fold');
    const body = fold?.querySelector('.tiles-fold-body');
    const icon = toggle.querySelector('.tiles-fold-icon');
    if (!fold || !body) {
      return;
    }
    const open = !fold.classList.contains('open');
    const foldId = fold.dataset.fold;
    fold.classList.toggle('open', open);
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (icon) {
      icon.textContent = open ? '▼' : '▶';
    }
    if (foldId) {
      persistFolds({ ...readFoldsFromDom(), [foldId]: open });
      syncAfterFoldChange(foldId);
    }
  };
  rootEl.addEventListener('click', onFoldClick);
  cleanup.push(() => rootEl.removeEventListener('click', onFoldClick));
}

function boot() {
  populateDateSelectors();
  populateTimeSelectors();
  populateSelectOptions({ preserve: false });
  setDateTimeValues(new Date());
  bindEvents();
  refreshResult();
}

export function mount(root) {
  rootEl = root;
  cleanup = [];
  calcSeq = 0;
  folds = loadFolds();
  clearTimeout(refreshTimer);
  render();
  boot();
}

export function unmount() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  calcSeq += 1;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  rootEl = null;
}
