import { t } from '../i18n.js';
import { API_BASE, fetchJson } from '../config.js';

const LIST_KEY = 'tools-tiles-list';
const FORM_KEY = 'tools-tiles-form';
const FOLDS_KEY = 'tools-tiles-folds';

const DEFAULT_FOLDS = {
  tiles: true,
  space: false,
  pricing: false,
  orientations: true,
  list: false,
};

const DEFAULT_FORM = {
  tileW: '35',
  tileH: '35',
  count: '32',
  spaceW: '300',
  spaceH: '130',
  price: '',
  per: '1',
  single: false,
  tileGap: false,
  name: '',
  selectedLayoutIndex: 0,
  folds: { ...DEFAULT_FOLDS },
};

let rootEl = null;
let cleanup = [];
let orientations = [];
let selectedLayoutIndex = 0;
let listRows = [];
let savedForm = {
  ...DEFAULT_FORM,
  folds: { ...DEFAULT_FOLDS },
};
let addSeq = 0;
let arrangeSeq = 0;
let coverageSeq = 0;
let listEnrichSeq = 0;
let lastArrange = null;
let lastCoverage = null;
let refreshTimer = null;
const coverageCache = new Map();

const REFRESH_DELAY_MS = 500;

function $(sel) {
  return rootEl.querySelector(sel);
}

function $all(sel) {
  return [...rootEl.querySelectorAll(sel)];
}

function normalizeFolds(raw) {
  return {
    ...DEFAULT_FOLDS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
}

function readFoldsFromDom() {
  const folds = normalizeFolds(savedForm.folds);
  if (!rootEl) {
    return folds;
  }
  $all('.tiles-fold[data-fold]').forEach((el) => {
    const id = el.dataset.fold;
    if (id) {
      folds[id] = el.classList.contains('open');
    }
  });
  return folds;
}

function persistFolds(folds) {
  const next = normalizeFolds(folds);
  savedForm = { ...savedForm, folds: next };
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function loadFoldsState(formFolds) {
  try {
    const raw = localStorage.getItem(FOLDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeFolds(parsed);
      }
    }
  } catch {
    /* fall through */
  }
  return normalizeFolds(formFolds);
}

function isFoldOpen(foldId) {
  const fold = rootEl?.querySelector(`.tiles-fold[data-fold="${foldId}"]`);
  if (fold) {
    return fold.classList.contains('open');
  }
  return Boolean(normalizeFolds(savedForm.folds)[foldId]);
}

function loadList() {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    listRows = Array.isArray(parsed) ? parsed : [];
  } catch {
    listRows = [];
  }
}

function saveList() {
  localStorage.setItem(LIST_KEY, JSON.stringify(listRows));
}

function loadFormState() {
  try {
    const raw = localStorage.getItem(FORM_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      savedForm = { ...DEFAULT_FORM, folds: loadFoldsState(null) };
      return;
    }
    savedForm = {
      ...DEFAULT_FORM,
      ...parsed,
      single: Boolean(parsed.single),
      tileGap: Boolean(parsed.tileGap),
      selectedLayoutIndex: Number(parsed.selectedLayoutIndex) || 0,
      folds: loadFoldsState(parsed.folds),
    };
    selectedLayoutIndex = savedForm.selectedLayoutIndex;
  } catch {
    savedForm = { ...DEFAULT_FORM, folds: loadFoldsState(null) };
  }
}

function saveFormState() {
  if (!rootEl) {
    return;
  }
  const folds = persistFolds(readFoldsFromDom());
  const next = {
    tileW: $('#tile-width')?.value ?? savedForm.tileW,
    tileH: $('#tile-height')?.value ?? savedForm.tileH,
    count: $('#tile-count')?.value ?? savedForm.count,
    spaceW: $('#space-width')?.value ?? savedForm.spaceW,
    spaceH: $('#space-height')?.value ?? savedForm.spaceH,
    price: $('#tile-price')?.value ?? savedForm.price,
    per: $('#tile-per')?.value ?? savedForm.per,
    single: Boolean($('#tiles-single')?.checked),
    tileGap: Boolean($('#tiles-gap')?.checked),
    name: ($('#tiles-name')?.value ?? savedForm.name).trim(),
    selectedLayoutIndex,
    folds,
  };
  savedForm = next;
  localStorage.setItem(FORM_KEY, JSON.stringify(next));
}

function attrValue(value) {
  return escapeHtml(value ?? '');
}

function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return t('tilesNone');
  }
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function euroSymbolN(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return `€${fmtNum(value, digits)}`;
}

function coverageM2(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return `${fmtNum(value, digits)} m²`;
}

function formatCuts(cuts) {
  if (!cuts?.length) {
    return t('tilesNone');
  }
  return cuts.map((cut) => `${cut.size}×${cut.count}`).join(', ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readForm() {
  const name = ($('#tiles-name')?.value || '').trim();
  const tileW = Number($('#tile-width')?.value);
  const tileH = Number($('#tile-height')?.value);
  const countRaw = ($('#tile-count')?.value || '').trim();
  const count = countRaw === '' ? null : Number(countRaw);
  const spaceW = Number($('#space-width')?.value);
  const spaceH = Number($('#space-height')?.value);
  const priceRaw = ($('#tile-price')?.value || '').trim();
  const perRaw = ($('#tile-per')?.value || '').trim();
  const single = Boolean($('#tiles-single')?.checked);
  const tileGap = Boolean($('#tiles-gap')?.checked);
  const pricingOpen = isFoldOpen('pricing');
  const spaceOpen = isFoldOpen('space');
  const tilesOpen = isFoldOpen('tiles');
  const orientationsOpen = isFoldOpen('orientations');
  const price = pricingOpen && priceRaw !== '' ? Number(priceRaw) : null;
  const per = perRaw === '' ? 1 : Number(perRaw);

  return {
    name,
    tileW,
    tileH,
    count,
    spaceW,
    spaceH,
    price,
    per,
    single,
    tileGap,
    pricingOpen,
    spaceOpen,
    tilesOpen,
    orientationsOpen,
  };
}

function validateTileSize(form) {
  if (!(form.tileW > 0) || !(form.tileH > 0)) {
    return t('tilesError') + ': tile size';
  }
  return null;
}

function validateCount(form) {
  if (!(form.count > 0) || !Number.isInteger(form.count)) {
    return t('tilesError') + ': count';
  }
  return null;
}

function validateSpace(form) {
  if (!(form.spaceW > 0) || !(form.spaceH > 0)) {
    return t('tilesError') + ': space size';
  }
  return null;
}

function validatePricing(form) {
  if (!form.pricingOpen || form.price === null) {
    return null;
  }
  if (Number.isNaN(form.price) || form.price < 0) {
    return t('tilesError') + ': price';
  }
  if (!(form.per >= 1) || !Number.isInteger(form.per)) {
    return t('tilesError') + ': per';
  }
  return null;
}

function compactedWarnings(form = readForm()) {
  const notes = [];
  if (!form.tilesOpen) {
    notes.push(t('tilesWarnTilesCompacted'));
  }
  if (!form.orientationsOpen) {
    notes.push(t('tilesWarnOrientationsCompacted'));
  }
  return notes;
}

function showCalcStatus(message = '', isError = false) {
  const notes = compactedWarnings();
  const blocking = !isFoldOpen('tiles') || !isFoldOpen('orientations');
  if (message) {
    notes.unshift(message);
  }
  setStatus(notes.join(' — '), Boolean(isError || blocking));
}

function refreshAllViews() {
  renderResults();
  enrichAndRenderTable();
  showCalcStatus();
}

function buildOrientations(tileW, tileH, single) {
  const list = [{ w: tileW, h: tileH }];
  if (!single && tileW !== tileH) {
    list.push({ w: tileH, h: tileW });
  }
  return list;
}

function tagLayouts(data) {
  return (data.layouts || []).map((layout) => ({
    ...layout,
    tileW: data.tile_width_cm,
    tileH: data.tile_height_cm,
  }));
}

function pricingActive(form = readForm()) {
  return Boolean(form.pricingOpen && form.price !== null && !Number.isNaN(form.price));
}

function parseOrientation(value) {
  const match = String(value || '').toLowerCase().match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  return { w: Number(match[1]), h: Number(match[2]) };
}

function calcRowPricing(tileW, tileH, tiles, price, per) {
  const pack = per >= 1 ? per : 1;
  const tileArea = (tileW * tileH) / 10000;
  const pricePerTile = price / pack;
  const costPerM2 = tileArea > 0 ? pricePerTile / tileArea : 0;
  const packsNeeded = Math.ceil(tiles / pack);
  return {
    costPerM2,
    totalCost: packsNeeded * price,
  };
}

function coverageCacheKey(form, orientation) {
  return [
    orientation.w,
    orientation.h,
    form.spaceW,
    form.spaceH,
    form.price ?? '',
    form.per || 1,
    form.single ? 1 : 0,
  ].join('|');
}

async function fetchCoverageCached(form, orientation) {
  const key = coverageCacheKey(form, orientation);
  if (coverageCache.has(key)) {
    return coverageCache.get(key);
  }
  const pending = fetchCoverage(form, orientation).then((data) => {
    coverageCache.set(key, data);
    return data;
  }).catch((err) => {
    coverageCache.delete(key);
    throw err;
  });
  coverageCache.set(key, pending);
  return pending;
}

function pickCoveragePattern(data, orientation) {
  const patterns = data?.patterns || [];
  return patterns.find((pattern) => (
    pattern.tile_width_cm === orientation.w
    && pattern.tile_height_cm === orientation.h
  )) || patterns[0] || null;
}

function mergeArrangeResults(results) {
  const first = results[0];
  return {
    count: first.count,
    total_area_m2: first.total_area_m2,
    pricing: pricingActive() ? first.pricing : null,
    layouts: results.flatMap(tagLayouts),
    multiOrientation: results.length > 1,
  };
}

function applyTilecalcOptions(params, form) {
  if (form.single) {
    params.set('singledimensionpattern', 'true');
  }
  if (form.price !== null) {
    params.set('price', String(form.price));
    params.set('per', String(form.per || 1));
  }
}

async function fetchArrange(form, orientation) {
  const params = new URLSearchParams({
    size: `${orientation.w}x${orientation.h}`,
    count: String(form.count),
  });
  applyTilecalcOptions(params, form);

  const payload = await fetchJson(`${API_BASE}/tilecalc/v1/arrange?${params.toString()}`);
  if (!payload?.success) {
    throw new Error(payload?.msg || t('tilesError'));
  }
  return payload.data;
}

async function fetchCoverage(form, orientation) {
  const params = new URLSearchParams({
    size: `${orientation.w}x${orientation.h}`,
    space: `${form.spaceW}x${form.spaceH}`,
  });
  applyTilecalcOptions(params, form);

  const payload = await fetchJson(`${API_BASE}/tilecalc/v1/coverage?${params.toString()}`);
  if (!payload?.success) {
    throw new Error(payload?.msg || t('tilesError'));
  }
  return payload.data;
}

function renderGraph(layout, { maxW = 280, maxH = 80, tileGap = false } = {}) {
  if (!layout?.rows || !layout?.cols || !layout?.tileW || !layout?.tileH) {
    return '';
  }

  const tileW = Number(layout.tileW);
  const tileH = Number(layout.tileH);
  const rows = Number(layout.rows);
  const cols = Number(layout.cols);
  if (!(tileW > 0) || !(tileH > 0) || !(rows > 0) || !(cols > 0)) {
    return '';
  }

  // Fit cm/10 into the cell, then snap to integers so every gap is identical.
  const idealW = tileW / 10;
  const idealH = tileH / 10;
  const gapCountX = Math.max(0, cols - 1);
  const gapCountY = Math.max(0, rows - 1);
  const gapBudget = tileGap ? 1 : 0;
  const scale = Math.min(
    1,
    (maxW - gapCountX * gapBudget) / (cols * idealW),
    (maxH - gapCountY * gapBudget) / (rows * idealH),
  );

  let cellW = Math.max(1, Math.round(idealW * scale));
  let cellH = Math.max(1, Math.round(cellW * (tileH / tileW)));
  let gap = tileGap ? 1 : 0;

  const fits = () => (
    cols * cellW + gapCountX * gap <= maxW
    && rows * cellH + gapCountY * gap <= maxH
  );
  let guard = 0;
  while (!fits() && (cellW > 1 || cellH > 1) && guard < 4096) {
    guard += 1;
    if (cellW >= cellH && cellW > 1) {
      cellW -= 1;
    } else if (cellH > 1) {
      cellH -= 1;
    } else {
      cellW = Math.max(1, cellW - 1);
    }
    const nextH = Math.round(cellW * (tileH / tileW));
    cellH = Number.isFinite(nextH) ? Math.max(1, nextH) : 1;
  }

  const rawW = cols * cellW + gapCountX * gap;
  const rawH = rows * cellH + gapCountY * gap;
  const count = rows * cols;
  const useDomCells = count <= 256;

  const cells = useDomCells
    ? Array.from({ length: count }, () => '<div class="tiles-graph-cell"></div>').join('')
    : '';

  const gridStyle = useDomCells
    ? `width:${rawW}px;height:${rawH}px;grid-template-columns:repeat(${cols},${cellW}px);grid-template-rows:repeat(${rows},${cellH}px);gap:${gap}px;`
    : `width:${rawW}px;height:${rawH}px;background-size:${cellW + gap}px ${cellH + gap}px;background-position:0 0;`;

  return `
    <div class="tiles-graph-wrap" style="width:${rawW}px;height:${rawH}px">
      <div class="tiles-graph${useDomCells ? '' : ' tiles-graph-fill'}${tileGap ? ' tiles-graph-spaced' : ''}" style="${gridStyle}">
        ${cells}
      </div>
    </div>
  `;
}

function buildCoverageCells(tileW, tileH, spaceW, spaceH) {
  const fullCols = Math.floor(spaceW / tileW);
  const remW = spaceW % tileW;
  const fullRows = Math.floor(spaceH / tileH);
  const remH = spaceH % tileH;
  const cols = fullCols + (remW > 0 ? 1 : 0);
  const rows = fullRows + (remH > 0 ? 1 : 0);
  const cells = [];
  let y = 0;
  for (let r = 0; r < rows; r += 1) {
    const h = (r === fullRows && remH > 0) ? remH : tileH;
    let x = 0;
    for (let c = 0; c < cols; c += 1) {
      const w = (c === fullCols && remW > 0) ? remW : tileW;
      cells.push({
        x,
        y,
        w,
        h,
        cut: w !== tileW || h !== tileH,
      });
      x += w;
    }
    y += h;
  }
  return cells;
}

function renderCoverageGraph(tileW, tileH, spaceW, spaceH, { maxW = 360, maxH = 180, tileGap = false } = {}) {
  if (!(tileW > 0) || !(tileH > 0) || !(spaceW > 0) || !(spaceH > 0)) {
    return '';
  }

  const cells = buildCoverageCells(tileW, tileH, spaceW, spaceH);
  const scale = Math.min(maxW / spaceW, maxH / spaceH, 1);
  const svgW = Math.max(1, Math.round(spaceW * scale));
  const svgH = Math.max(1, Math.round(spaceH * scale));
  const gap = tileGap ? Math.min(1.5, Math.max(0.5, scale)) : 0;
  // When gap is off, overlap neighbors a hair so AA seams don't show the panel background.
  const seamFix = tileGap ? 0 : 0.75;

  const rects = cells.map((cell) => {
    const x = cell.x * scale;
    const y = cell.y * scale;
    const rw = Math.max(0.75, cell.w * scale - gap + seamFix);
    const rh = Math.max(0.75, cell.h * scale - gap + seamFix);
    const cls = cell.cut ? 'tiles-cover-cut' : 'tiles-cover-full';
    return `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" />`;
  }).join('');

  return `
    <div class="tiles-cover-wrap" style="width:${svgW}px;height:${svgH}px" title="${attrValue(`${spaceW}×${spaceH}`)}">
      <svg class="tiles-cover-svg${tileGap ? '' : ' tiles-cover-svg-tight'}" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" aria-hidden="true" focusable="false">${rects}</svg>
    </div>
  `;
}

function spaceModeActive(form = readForm()) {
  return Boolean(form.spaceOpen && !validateSpace(form));
}

function renderCoverageLayouts() {
  if (!lastCoverage?.patterns?.length) {
    return '';
  }
  if (selectedLayoutIndex >= lastCoverage.patterns.length) {
    selectedLayoutIndex = 0;
  }

  const form = readForm();
  const pricing = pricingActive(form);
  const multi = lastCoverage.patterns.length > 1;
  const tileGap = Boolean(form.tileGap);
  const pattern = lastCoverage.patterns[selectedLayoutIndex];
  const patternPricing = pricing ? pattern?.pricing : null;

  const summaryCells = [
    { label: t('tilesTiles'), value: String(pattern.total_tiles) },
    { label: t('tilesFull'), value: String(pattern.full_tiles) },
    { label: t('tilesCuts'), value: formatCuts(pattern.cuts) },
    { label: t('tilesColArea'), value: coverageM2(lastCoverage.space_area_m2) },
  ];
  if (patternPricing) {
    summaryCells.push(
      { label: t('tilesCostPerM2'), value: euroSymbolN(patternPricing.cost_per_m2) },
      { label: t('tilesTotalCost'), value: euroSymbolN(patternPricing.total_cost) },
      { label: t('tilesPacks'), value: String(patternPricing.packs_needed) },
    );
  }

  return `
    <div class="tiles-layouts">
      <table class="tiles-summary-table">
        <thead>
          <tr>
            ${summaryCells.map((cell) => `<th>${cell.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            ${summaryCells.map((cell) => `<td>${cell.value}</td>`).join('')}
          </tr>
        </tbody>
      </table>
      <div class="tiles-cover-legend" aria-hidden="true">
        <span class="tiles-cover-legend-item"><span class="tiles-cover-swatch tiles-cover-swatch-full"></span>${t('tilesFull')}</span>
        <span class="tiles-cover-legend-item"><span class="tiles-cover-swatch tiles-cover-swatch-cut"></span>${t('tilesCuts')}</span>
      </div>
      <div class="tiles-orient-wrap">
        <table class="tiles-orient-table">
          <tbody>
            ${lastCoverage.patterns.map((item, index) => {
              const isSelected = index === selectedLayoutIndex ? ' selected' : '';
              return `
                <tr class="tiles-orient-row${isSelected}" data-layout-index="${index}" tabindex="0">
                  ${multi ? `<td class="tiles-orient-tile">${item.tile_width_cm}×${item.tile_height_cm}</td>` : ''}
                  <td class="tiles-orient-grid">
                    <span class="tiles-orient-grid-inner">
                      <span class="tiles-orient-rc">${item.full_tiles}+${Math.max(0, item.total_tiles - item.full_tiles)}</span>
                      <span class="tiles-orient-arrow" aria-hidden="true">→</span>
                    </span>
                  </td>
                  <td class="tiles-orient-size">${lastCoverage.space_width_cm}×${lastCoverage.space_height_cm}</td>
                  <td class="tiles-orient-graph">${renderCoverageGraph(
                    item.tile_width_cm,
                    item.tile_height_cm,
                    lastCoverage.space_width_cm,
                    lastCoverage.space_height_cm,
                    { tileGap },
                  )}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLayouts() {
  if (spaceModeActive() && lastCoverage?.patterns?.length) {
    return renderCoverageLayouts();
  }

  if (!lastArrange?.layouts?.length) {
    return '';
  }
  if (selectedLayoutIndex >= lastArrange.layouts.length) {
    selectedLayoutIndex = 0;
  }
  const pricing = pricingActive() ? lastArrange.pricing : null;
  const multi = lastArrange.multiOrientation;
  const tileGap = Boolean(readForm().tileGap);
  const summaryCells = [
    { label: t('tilesTiles'), value: String(lastArrange.count) },
    { label: t('tilesArea'), value: fmtNum(lastArrange.total_area_m2, 4) },
  ];
  if (pricing) {
    summaryCells.push(
      { label: t('tilesCostPerM2'), value: fmtNum(pricing.cost_per_m2) },
      { label: t('tilesTotalCost'), value: fmtNum(pricing.total_cost) },
      { label: t('tilesPacks'), value: String(pricing.packs_needed) },
    );
  }

  return `
    <div class="tiles-layouts">
      <table class="tiles-summary-table">
        <thead>
          <tr>
            ${summaryCells.map((cell) => `<th>${cell.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            ${summaryCells.map((cell) => `<td>${cell.value}</td>`).join('')}
          </tr>
        </tbody>
      </table>
      <div class="tiles-orient-wrap">
        <table class="tiles-orient-table">
          <tbody>
            ${lastArrange.layouts.slice(0, 48).map((layout, index) => {
              const isSelected = index === selectedLayoutIndex ? ' selected' : '';
              return `
                <tr class="tiles-orient-row${isSelected}" data-layout-index="${index}" tabindex="0">
                  ${multi ? `<td class="tiles-orient-tile">${layout.tileW}×${layout.tileH}</td>` : ''}
                  <td class="tiles-orient-grid">
                    <span class="tiles-orient-grid-inner">
                      <span class="tiles-orient-rc">${layout.rows}×${layout.cols}</span>
                      <span class="tiles-orient-arrow" aria-hidden="true">→</span>
                    </span>
                  </td>
                  <td class="tiles-orient-size">${layout.width}×${layout.height}</td>
                  <td class="tiles-orient-graph">${renderGraph(layout, { tileGap })}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResults() {
  const host = $('#tiles-results');
  if (!host) {
    return;
  }

  if (!orientations.length) {
    host.innerHTML = '';
    return;
  }

  host.innerHTML = `
    ${renderLayouts()}
    <div class="tiles-add-row">
      <div class="dmt-field tiles-add-name">
        <label for="tiles-name">${t('tilesName')}</label>
        <input type="text" id="tiles-name" placeholder="${t('tilesNamePlaceholder')}" autocomplete="off" value="${escapeHtml(readNameValue())}">
      </div>
      <button type="button" class="dmt-btn" id="tiles-add-btn">${t('tilesAddToList')}</button>
    </div>
  `;
}

function readNameValue() {
  return ($('#tiles-name')?.value || savedForm.name || '').trim();
}

function foldHeader(title, open) {
  return `
    <button type="button" class="tiles-fold-toggle" aria-expanded="${open ? 'true' : 'false'}">
      <span class="tiles-fold-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
      <span class="dmt-panel-title">${title}</span>
    </button>
  `;
}

async function enrichAndRenderTable() {
  const host = $('#tiles-table-host');
  if (!host) {
    return;
  }
  if (!listRows.length) {
    renderTable([], { spaceOk: false, priceOk: false });
    return;
  }

  const form = readForm();
  const seq = ++listEnrichSeq;
  const spaceOk = form.spaceOpen && !validateSpace(form);
  const priceOk = pricingActive(form);

  const displayRows = await Promise.all(listRows.map(async (row) => {
    const out = {
      ...row,
      costPerM2: null,
      totalCost: null,
    };
    const orientation = parseOrientation(row.orientation) || {
      w: form.tileW,
      h: form.tileH,
    };

    if (spaceOk) {
      try {
        const data = await fetchCoverageCached(form, orientation);
        const pattern = pickCoveragePattern(data, orientation);
        if (pattern) {
          out.kind = 'coverage';
          out.space = `${data.space_width_cm}×${data.space_height_cm}`;
          out.totalTiles = pattern.total_tiles;
          out.fullTiles = pattern.full_tiles;
          out.cutsLabel = formatCuts(pattern.cuts);
          out.areaM2 = data.space_area_m2;
          if (priceOk && pattern.pricing) {
            out.costPerM2 = pattern.pricing.cost_per_m2;
            out.totalCost = pattern.pricing.total_cost;
          }
        }
      } catch {
        /* keep base row */
      }
    }

    if (priceOk && out.costPerM2 == null) {
      const priced = calcRowPricing(
        orientation.w,
        orientation.h,
        out.totalTiles || 0,
        form.price,
        form.per || 1,
      );
      out.costPerM2 = priced.costPerM2;
      out.totalCost = priced.totalCost;
    }

    if (!spaceOk) {
      out.fullTiles = row.kind === 'coverage' ? row.fullTiles : null;
      out.cutsLabel = row.kind === 'coverage' ? row.cutsLabel : '';
      out.space = row.kind === 'coverage' ? row.space : null;
    }

    return out;
  }));

  if (seq !== listEnrichSeq) {
    return;
  }
  renderTable(displayRows, { spaceOk, priceOk });
}

function renderTable(displayRows = listRows, opts = {}) {
  const host = $('#tiles-table-host');
  if (!host) {
    return;
  }

  const form = readForm();
  const spaceOk = opts.spaceOk ?? (form.spaceOpen && !validateSpace(form));
  const priceOk = opts.priceOk ?? pricingActive(form);

  if (!displayRows.length) {
    host.innerHTML = `<p class="dmt-hint" style="margin:0">${t('tilesEmptyList')}</p>`;
    return;
  }

  const totals = displayRows.reduce((acc, row) => {
    acc.tiles += row.totalTiles || 0;
    acc.area += row.areaM2 || 0;
    acc.cost += row.totalCost || 0;
    return acc;
  }, { tiles: 0, area: 0, cost: 0 });

  const sizeLabel = spaceOk ? t('tilesColSpace') : t('tilesColLayout');

  const cell = (value, title = '', extraClass = '') => `
    <span class="tiles-list-cell${extraClass ? ` ${extraClass}` : ''}"${title ? ` title="${attrValue(title)}"` : ''}>${value}</span>
  `;

  const sizeValue = (row) => {
    if (spaceOk && row.space) {
      return escapeHtml(row.space);
    }
    if (!spaceOk && row.layoutSize) {
      return escapeHtml(row.layoutSize);
    }
    if (row.space) {
      return escapeHtml(row.space);
    }
    if (row.layoutSize) {
      return escapeHtml(row.layoutSize);
    }
    return t('tilesNone');
  };

  const line2Header = () => `
    ${cell(t('tilesColTiles'), t('tilesHelpTiles'), 'tiles-list-head')}
    ${cell(spaceOk ? t('tilesColFull') : '', spaceOk ? t('tilesHelpFull') : '', 'tiles-list-head')}
    ${cell(spaceOk ? t('tilesColCuts') : '', spaceOk ? t('tilesHelpCuts') : '', 'tiles-list-head')}
    ${cell(t('tilesColArea'), '', 'tiles-list-head')}
    ${cell(priceOk ? t('tilesColPerM2') : '', '', 'tiles-list-head')}
    ${cell(priceOk ? t('tilesColTotal') : '', '', 'tiles-list-head')}
  `;

  const line2Cells = (row) => `
    ${cell(row.totalTiles, t('tilesHelpTiles'))}
    ${cell(spaceOk && row.fullTiles != null ? row.fullTiles : '')}
    ${cell(spaceOk && row.cutsLabel ? escapeHtml(row.cutsLabel) : '')}
    ${cell(coverageM2(row.areaM2))}
    ${cell(priceOk && row.costPerM2 != null ? euroSymbolN(row.costPerM2) : '')}
    ${cell(priceOk && row.totalCost != null ? euroSymbolN(row.totalCost) : '')}
  `;

  host.innerHTML = `
    <div class="tiles-list">
      <div class="tiles-list-header">
        <div class="tiles-list-line1">
          ${cell(t('tilesColName'), '', 'tiles-list-head')}
          ${cell(t('tilesColOrientation'), '', 'tiles-list-head')}
          ${cell(sizeLabel, '', 'tiles-list-head')}
          <span class="tiles-list-actions"></span>
        </div>
        <div class="tiles-list-line2">
          ${line2Header()}
        </div>
      </div>
      ${displayRows.map((row, index) => `
        <article class="tiles-list-row">
          <div class="tiles-list-line1">
            ${cell(escapeHtml(row.name || t('tilesNone')), '', 'tiles-list-name')}
            ${cell(escapeHtml(row.orientation))}
            ${cell(sizeValue(row))}
            <span class="tiles-list-actions">
              <button type="button" class="tiles-remove-btn" data-index="${index}" title="${attrValue(t('tilesRemove'))}" aria-label="${attrValue(t('tilesRemove'))}">
                <svg class="tiles-remove-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-2 3.5h8l-.6 8.2A1.5 1.5 0 0 1 9.9 15H6.1a1.5 1.5 0 0 1-1.5-1.3L4 5.5zm2.2 1.5-.3 5h1.2l.3-5H6.2zm2.4 0-.3 5h1.2l.3-5H8.6z"/>
                </svg>
              </button>
            </span>
          </div>
          <div class="tiles-list-line2">
            ${line2Cells(row)}
          </div>
        </article>
      `).join('')}
      <div class="tiles-list-totals">
        <div class="tiles-list-line1">
          ${cell(t('tilesTotals'), '', 'tiles-list-name tiles-list-head')}
          ${cell('')}
          ${cell('')}
          <span class="tiles-list-actions"></span>
        </div>
        <div class="tiles-list-line2">
          ${cell(totals.tiles, t('tilesHelpTiles'))}
          ${cell('')}
          ${cell('')}
          ${cell(coverageM2(totals.area))}
          ${cell('')}
          ${cell(priceOk && totals.cost ? euroSymbolN(totals.cost) : '')}
        </div>
      </div>
    </div>
  `;
}


function setStatus(message, isError = false) {
  const el = $('#tiles-status');
  if (!el) {
    return;
  }
  el.textContent = message || '';
  el.classList.toggle('tiles-status-error', Boolean(isError));
}

function renderShell() {
  const form = savedForm;
  const folds = normalizeFolds(form.folds);
  const foldOpen = (id) => Boolean(folds[id]);

  rootEl.innerHTML = `
    <div class="dmt-app tiles-app">
      <header class="dmt-header">
        <h1>${t('tilesTitle')}</h1>
      </header>

      <div class="dmt-panel-row dmt-panel-row-3">
        <section class="dmt-panel tiles-fold${foldOpen('tiles') ? ' open' : ''}" data-fold="tiles">
          ${foldHeader(t('tilesTileSize'), foldOpen('tiles'))}
          <div class="tiles-fold-body"${foldOpen('tiles') ? '' : ' hidden'}>
            <div class="dmt-row tiles-size-row">
              <div class="dmt-field">
                <label for="tile-width">${t('tilesWidth')}</label>
                <input type="number" id="tile-width" min="1" step="1" value="${attrValue(form.tileW)}">
              </div>
              <div class="dmt-field">
                <label for="tile-height">${t('tilesHeight')}</label>
                <input type="number" id="tile-height" min="1" step="1" value="${attrValue(form.tileH)}">
              </div>
              <div class="dmt-field">
                <label for="tile-count">${t('tilesCount')}</label>
                <input type="number" id="tile-count" min="1" step="1" value="${attrValue(form.count)}">
              </div>
            </div>
          </div>
        </section>

        <section class="dmt-panel tiles-fold${foldOpen('space') ? ' open' : ''}" data-fold="space">
          ${foldHeader(t('tilesSpaceSize'), foldOpen('space'))}
          <div class="tiles-fold-body"${foldOpen('space') ? '' : ' hidden'}>
            <div class="dmt-row tiles-row-with-clear">
              <div class="dmt-field">
                <label for="space-width">${t('tilesWidth')}</label>
                <input type="number" id="space-width" min="1" step="1" value="${attrValue(form.spaceW)}">
              </div>
              <div class="dmt-field">
                <label for="space-height">${t('tilesHeight')}</label>
                <input type="number" id="space-height" min="1" step="1" value="${attrValue(form.spaceH)}">
              </div>
              <div class="dmt-field tiles-row-clear">
                <label class="tiles-clear-label" for="tiles-clear-space" aria-hidden="true">&nbsp;</label>
                <button type="button" class="tiles-remove-btn" id="tiles-clear-space" title="${attrValue(t('tilesClear'))}" aria-label="${attrValue(t('tilesClear'))}">
                  <svg class="tiles-remove-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-2 3.5h8l-.6 8.2A1.5 1.5 0 0 1 9.9 15H6.1a1.5 1.5 0 0 1-1.5-1.3L4 5.5zm2.2 1.5-.3 5h1.2l.3-5H6.2zm2.4 0-.3 5h1.2l.3-5H8.6z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="dmt-panel tiles-fold${foldOpen('pricing') ? ' open' : ''}" data-fold="pricing">
          ${foldHeader(t('tilesPricing'), foldOpen('pricing'))}
          <div class="tiles-fold-body"${foldOpen('pricing') ? '' : ' hidden'}>
            <div class="dmt-row tiles-row-with-clear">
              <div class="dmt-field">
                <label for="tile-price">${t('tilesPrice')}</label>
                <input type="number" id="tile-price" min="0" step="0.01" placeholder="0" value="${attrValue(form.price)}">
              </div>
              <div class="dmt-field">
                <label for="tile-per">${t('tilesPer')}</label>
                <input type="number" id="tile-per" min="1" step="1" value="${attrValue(form.per)}">
              </div>
              <div class="dmt-field tiles-row-clear">
                <label class="tiles-clear-label" for="tiles-clear-pricing" aria-hidden="true">&nbsp;</label>
                <button type="button" class="tiles-remove-btn" id="tiles-clear-pricing" title="${attrValue(t('tilesClear'))}" aria-label="${attrValue(t('tilesClear'))}">
                  <svg class="tiles-remove-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-2 3.5h8l-.6 8.2A1.5 1.5 0 0 1 9.9 15H6.1a1.5 1.5 0 0 1-1.5-1.3L4 5.5zm2.2 1.5-.3 5h1.2l.3-5H6.2zm2.4 0-.3 5h1.2l.3-5H8.6z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <p class="dmt-hint" id="tiles-status"></p>

      <section class="dmt-panel tiles-fold${foldOpen('orientations') ? ' open' : ''}" data-fold="orientations">
        ${foldHeader(t('tilesResults'), foldOpen('orientations'))}
        <div class="tiles-fold-body"${foldOpen('orientations') ? '' : ' hidden'}>
          <div class="tiles-switch-row">
            <label class="tiles-switch" title="${attrValue(t('tilesSingleOrientationHelp'))}">
              <span class="tiles-switch-label">${t('tilesSingleOrientation')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-single" role="switch" aria-label="${attrValue(t('tilesSingleOrientation'))}"${form.single ? ' checked' : ''}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
            <label class="tiles-switch" title="${attrValue(t('tilesGapHelp'))}">
              <span class="tiles-switch-label">${t('tilesGap')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-gap" role="switch" aria-label="${attrValue(t('tilesGap'))}"${form.tileGap ? ' checked' : ''}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
          </div>
          <div id="tiles-results"></div>
        </div>
      </section>

      <section class="dmt-panel tiles-fold${foldOpen('list') ? ' open' : ''}" data-fold="list" id="tiles-list-panel">
        ${foldHeader(t('tilesList'), foldOpen('list'))}
        <div class="tiles-fold-body"${foldOpen('list') ? '' : ' hidden'}>
          <div class="dmt-actions" style="margin-bottom:12px">
            <button type="button" class="dmt-btn dmt-btn-secondary" id="tiles-clear-btn">${t('tilesClearList')}</button>
          </div>
          <div id="tiles-table-host"></div>
        </div>
      </section>
    </div>
  `;
}

function refreshOrientations({ resetLayout = true } = {}) {
  saveFormState();
  const form = readForm();

  if (!form.tilesOpen || !form.orientationsOpen) {
    orientations = [];
    lastArrange = null;
    lastCoverage = null;
    refreshAllViews();
    showCalcStatus('', true);
    return;
  }

  const error = validateTileSize(form);
  if (error) {
    orientations = [];
    if (resetLayout) {
      selectedLayoutIndex = 0;
    }
    lastArrange = null;
    lastCoverage = null;
    refreshAllViews();
    showCalcStatus(error, true);
    return;
  }

  orientations = buildOrientations(form.tileW, form.tileH, form.single);
  if (resetLayout) {
    selectedLayoutIndex = 0;
  }
  coverageCache.clear();
  saveFormState();
  renderResults();
  enrichAndRenderTable();
  if (spaceModeActive(form)) {
    lastArrange = null;
    loadCoverage();
  } else {
    lastCoverage = null;
    loadArrange();
  }
}

function scheduleRefreshOrientations(opts = {}) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshOrientations(opts);
  }, REFRESH_DELAY_MS);
}

function flushRefreshOrientations(opts = {}) {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshOrientations(opts);
}

async function loadArrange() {
  const form = readForm();

  if (!form.tilesOpen || !form.orientationsOpen || spaceModeActive(form)) {
    lastArrange = null;
    if (!spaceModeActive(form)) {
      refreshAllViews();
      showCalcStatus('', true);
    }
    return;
  }

  if (!orientations.length) {
    lastArrange = null;
    refreshAllViews();
    return;
  }

  const tileError = validateTileSize(form);
  if (tileError) {
    showCalcStatus(tileError, true);
    return;
  }
  const countError = validateCount(form);
  if (countError) {
    lastArrange = null;
    refreshAllViews();
    showCalcStatus(countError, true);
    return;
  }
  const priceError = validatePricing(form);
  if (priceError) {
    lastArrange = null;
    refreshAllViews();
    showCalcStatus(priceError, true);
    return;
  }

  const seq = ++arrangeSeq;
  showCalcStatus('…');
  try {
    const results = await Promise.all(
      orientations.map((orientation) => fetchArrange(form, orientation)),
    );
    if (seq !== arrangeSeq) {
      return;
    }
    lastArrange = mergeArrangeResults(results);
    if (selectedLayoutIndex >= (lastArrange.layouts?.length || 0)) {
      selectedLayoutIndex = 0;
    }
    refreshAllViews();
  } catch (err) {
    if (seq !== arrangeSeq) {
      return;
    }
    lastArrange = null;
    selectedLayoutIndex = 0;
    refreshAllViews();
    showCalcStatus(`${t('tilesError')}: ${err.message || err}`, true);
  }
}

async function loadCoverage() {
  const form = readForm();

  if (!form.tilesOpen || !form.orientationsOpen || !spaceModeActive(form)) {
    lastCoverage = null;
    refreshAllViews();
    return;
  }

  const tileError = validateTileSize(form);
  if (tileError) {
    lastCoverage = null;
    refreshAllViews();
    showCalcStatus(tileError, true);
    return;
  }
  const priceError = validatePricing(form);
  if (priceError) {
    lastCoverage = null;
    refreshAllViews();
    showCalcStatus(priceError, true);
    return;
  }

  const orientation = orientations[0] || { w: form.tileW, h: form.tileH };
  const seq = ++coverageSeq;
  showCalcStatus('…');
  try {
    const data = await fetchCoverageCached(form, orientation);
    if (seq !== coverageSeq) {
      return;
    }
    lastCoverage = data;
    if (selectedLayoutIndex >= (lastCoverage.patterns?.length || 0)) {
      selectedLayoutIndex = 0;
    }
    refreshAllViews();
  } catch (err) {
    if (seq !== coverageSeq) {
      return;
    }
    lastCoverage = null;
    selectedLayoutIndex = 0;
    refreshAllViews();
    showCalcStatus(`${t('tilesError')}: ${err.message || err}`, true);
  }
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
  saveFormState();
  syncAfterFoldChange(foldId, open);
}

function syncAfterFoldChange(foldId, open) {
  if (foldId === 'pricing' && !open && lastArrange) {
    lastArrange = { ...lastArrange, pricing: null };
  }

  if (foldId === 'tiles' || foldId === 'pricing' || foldId === 'orientations' || foldId === 'space') {
    refreshAllViews();
    flushRefreshOrientations({ resetLayout: false });
    return;
  }

  if (foldId === 'list') {
    refreshAllViews();
    return;
  }

  showCalcStatus();
}

async function onAddToList() {
  const form = readForm();
  if (!form.tilesOpen) {
    setFoldOpen('tiles', true);
    showCalcStatus(t('tilesWarnTilesCompacted'), true);
    return;
  }
  const tileError = validateTileSize(form);
  if (tileError) {
    showCalcStatus(tileError, true);
    return;
  }
  const priceError = validatePricing(form);
  if (priceError) {
    setFoldOpen('pricing', true);
    showCalcStatus(priceError, true);
    return;
  }

  const withPrice = pricingActive(form);
  const useSpace = spaceModeActive(form);
  const layout = lastArrange?.layouts?.[selectedLayoutIndex];
  const coveragePattern = lastCoverage?.patterns?.[selectedLayoutIndex];

  if (useSpace) {
    const orientation = coveragePattern
      ? { w: coveragePattern.tile_width_cm, h: coveragePattern.tile_height_cm }
      : layout
        ? { w: layout.tileW, h: layout.tileH }
        : { w: form.tileW, h: form.tileH };

    const seq = ++addSeq;
    showCalcStatus('…');
    try {
      const data = lastCoverage && coveragePattern
        ? lastCoverage
        : await fetchCoverage(form, orientation);
      if (seq !== addSeq) {
        return;
      }
      const pattern = (lastCoverage && coveragePattern)
        ? coveragePattern
        : pickCoveragePattern(data, orientation) || data.patterns?.[0];
      if (!pattern) {
        showCalcStatus(t('tilesNoPatterns'), true);
        return;
      }

      listRows.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: 'coverage',
        name: form.name,
        orientation: `${pattern.tile_width_cm}×${pattern.tile_height_cm}`,
        layoutSize: null,
        space: `${data.space_width_cm}×${data.space_height_cm}`,
        totalTiles: pattern.total_tiles,
        fullTiles: pattern.full_tiles,
        cutsLabel: formatCuts(pattern.cuts),
        areaM2: data.space_area_m2,
        costPerM2: withPrice ? (pattern.pricing?.cost_per_m2 ?? null) : null,
        totalCost: withPrice ? (pattern.pricing?.total_cost ?? null) : null,
      });
      saveList();
      enrichAndRenderTable();
      setFoldOpen('list', true);
      showCalcStatus();
    } catch (err) {
      if (seq !== addSeq) {
        return;
      }
      showCalcStatus(`${t('tilesError')}: ${err.message || err}`, true);
    }
    return;
  }

  if (layout && lastArrange) {
    listRows.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: 'arrange',
      name: form.name,
      orientation: `${layout.tileW}×${layout.tileH}`,
      layoutSize: `${layout.width}×${layout.height}`,
      space: null,
      totalTiles: lastArrange.count,
      fullTiles: lastArrange.count,
      cutsLabel: t('tilesNone'),
      areaM2: lastArrange.total_area_m2,
      costPerM2: withPrice ? (lastArrange.pricing?.cost_per_m2 ?? null) : null,
      totalCost: withPrice ? (lastArrange.pricing?.total_cost ?? null) : null,
    });
    saveList();
    enrichAndRenderTable();
    setFoldOpen('list', true);
    showCalcStatus();
    return;
  }

  setFoldOpen('space', true);
  showCalcStatus(t('tilesWarnSpaceCompacted'), true);
}

function bindEvents() {
  const onOrientationInput = () => scheduleRefreshOrientations();
  const onOrientationChange = () => flushRefreshOrientations();
  const onGapChange = () => {
    saveFormState();
    renderResults();
  };
  const orientationInputs = $all('#tile-width, #tile-height, #tile-count, #tiles-single, #tile-price, #tile-per');
  orientationInputs.forEach((el) => {
    el.addEventListener('input', onOrientationInput);
    el.addEventListener('change', onOrientationChange);
  });
  cleanup.push(() => {
    orientationInputs.forEach((el) => {
      el.removeEventListener('input', onOrientationInput);
      el.removeEventListener('change', onOrientationChange);
    });
  });

  const gapInput = $('#tiles-gap');
  gapInput?.addEventListener('change', onGapChange);
  cleanup.push(() => gapInput?.removeEventListener('change', onGapChange));

  const onSpaceInput = () => {
    coverageCache.clear();
    saveFormState();
    scheduleRefreshOrientations({ resetLayout: false });
  };
  const spaceInputs = $all('#space-width, #space-height');
  spaceInputs.forEach((el) => {
    el.addEventListener('input', onSpaceInput);
    el.addEventListener('change', onSpaceInput);
  });
  cleanup.push(() => {
    spaceInputs.forEach((el) => {
      el.removeEventListener('input', onSpaceInput);
      el.removeEventListener('change', onSpaceInput);
    });
  });

  const clearSpaceBtn = $('#tiles-clear-space');
  const onClearSpace = () => {
    const spaceW = $('#space-width');
    const spaceH = $('#space-height');
    if (spaceW) spaceW.value = '';
    if (spaceH) spaceH.value = '';
    coverageCache.clear();
    saveFormState();
    scheduleRefreshOrientations({ resetLayout: false });
  };
  clearSpaceBtn?.addEventListener('click', onClearSpace);
  cleanup.push(() => clearSpaceBtn?.removeEventListener('click', onClearSpace));

  const clearPricingBtn = $('#tiles-clear-pricing');
  const onClearPricing = () => {
    const price = $('#tile-price');
    const per = $('#tile-per');
    if (price) price.value = '';
    if (per) per.value = '1';
    coverageCache.clear();
    saveFormState();
    flushRefreshOrientations({ resetLayout: false });
  };
  clearPricingBtn?.addEventListener('click', onClearPricing);
  cleanup.push(() => clearPricingBtn?.removeEventListener('click', onClearPricing));

  const onPersist = () => saveFormState();
  rootEl.addEventListener('input', onPersist);
  rootEl.addEventListener('change', onPersist);
  cleanup.push(() => {
    rootEl.removeEventListener('input', onPersist);
    rootEl.removeEventListener('change', onPersist);
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
    }
    saveFormState();
    syncAfterFoldChange(foldId, open);
  };
  rootEl.addEventListener('click', onFoldClick);
  cleanup.push(() => rootEl.removeEventListener('click', onFoldClick));

  const clearBtn = $('#tiles-clear-btn');
  const onClear = () => {
    listRows = [];
    saveList();
    enrichAndRenderTable();
  };
  clearBtn?.addEventListener('click', onClear);
  cleanup.push(() => clearBtn?.removeEventListener('click', onClear));

  const onRootClick = (event) => {
    const layoutBtn = event.target.closest('[data-layout-index]');
    if (layoutBtn && rootEl.contains(layoutBtn)) {
      selectedLayoutIndex = Number(layoutBtn.dataset.layoutIndex);
      saveFormState();
      renderResults();
      return;
    }

    if (event.target.id === 'tiles-add-btn') {
      onAddToList();
      return;
    }

    const removeBtn = event.target.closest('.tiles-remove-btn');
    if (removeBtn && rootEl.contains(removeBtn)) {
      const index = Number(removeBtn.dataset.index);
      listRows.splice(index, 1);
      saveList();
      enrichAndRenderTable();
    }
  };
  rootEl.addEventListener('click', onRootClick);
  cleanup.push(() => rootEl.removeEventListener('click', onRootClick));
}

export function mount(root) {
  rootEl = root;
  cleanup = [];
  orientations = [];
  lastArrange = null;
  lastCoverage = null;
  addSeq = 0;
  arrangeSeq = 0;
  coverageSeq = 0;
  listEnrichSeq = 0;
  coverageCache.clear();
  clearTimeout(refreshTimer);
  loadList();
  loadFormState();
  renderShell();
  renderResults();
  enrichAndRenderTable();
  bindEvents();
  refreshOrientations({ resetLayout: false });
}

export function unmount() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  addSeq += 1;
  arrangeSeq += 1;
  coverageSeq += 1;
  listEnrichSeq += 1;
  coverageCache.clear();
  cleanup.forEach((fn) => fn());
  cleanup = [];
  rootEl = null;
  orientations = [];
  lastArrange = null;
  lastCoverage = null;
}
