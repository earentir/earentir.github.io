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
  flatEdge: false,
  groutGap: false,
  gapCm: '0.3',
  skirting: false,
  skirtingCm: '0.5',
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
      flatEdge: Boolean(parsed.flatEdge),
      groutGap: Boolean(parsed.groutGap),
      gapCm: parsed.gapCm != null && String(parsed.gapCm).trim() !== ''
        ? String(parsed.gapCm)
        : DEFAULT_FORM.gapCm,
      skirting: Boolean(parsed.skirting),
      skirtingCm: parsed.skirtingCm != null && String(parsed.skirtingCm).trim() !== ''
        ? String(parsed.skirtingCm)
        : DEFAULT_FORM.skirtingCm,
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
    flatEdge: Boolean($('#tiles-flat-edge')?.checked),
    groutGap: Boolean($('#tiles-grout-gap')?.checked),
    gapCm: ($('#tiles-gap-cm')?.value ?? savedForm.gapCm ?? DEFAULT_FORM.gapCm).trim() || DEFAULT_FORM.gapCm,
    skirting: Boolean($('#tiles-skirting')?.checked),
    skirtingCm: ($('#tiles-skirting-cm')?.value ?? savedForm.skirtingCm ?? DEFAULT_FORM.skirtingCm).trim() || DEFAULT_FORM.skirtingCm,
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
  return cuts.map((cut) => `${cut.size} x${cut.count}`).join(', ');
}

function parseCutSize(size) {
  const match = String(size || '').toLowerCase().match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  return { w: Number(match[1]), h: Number(match[2]) };
}

function fmtDim(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return String(value ?? '');
  }
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded);
}

/** How many WxH pieces fit in one parent tile (either rotation). */
function piecesPerParentTile(tileW, tileH, cutW, cutH) {
  if (!(tileW > 0) || !(tileH > 0) || !(cutW > 0) || !(cutH > 0)) {
    return 0;
  }
  const normal = Math.floor(tileW / cutW) * Math.floor(tileH / cutH);
  const rotated = Math.floor(tileW / cutH) * Math.floor(tileH / cutW);
  return Math.max(normal, rotated, 0);
}

/** Parent tiles needed to supply all cut pieces (packed leftovers). */
function packedCutParentTiles(tileW, tileH, cuts) {
  let parents = 0;
  for (const cut of cuts || []) {
    const dims = parseCutSize(cut.size);
    const count = Number(cut.count) || 0;
    if (!dims || count <= 0) {
      parents += count;
      continue;
    }
    const per = piecesPerParentTile(tileW, tileH, dims.w, dims.h);
    parents += per > 0 ? Math.ceil(count / per) : count;
  }
  return parents;
}

/**
 * When flat-edge packing is on, total_tiles becomes tiles to buy
 * (full tiles + packed parents for cuts), and pricing is recomputed.
 */
function applyFlatEdgePacking(pattern, form) {
  if (!pattern || !form?.flatEdge || !spaceModeActive(form)) {
    return pattern;
  }
  const tileW = pattern.tile_width_cm;
  const tileH = pattern.tile_height_cm;
  const cutParents = packedCutParentTiles(tileW, tileH, pattern.cuts);
  const buyTiles = (pattern.full_tiles || 0) + cutParents;
  const next = {
    ...pattern,
    piece_tiles: pattern.total_tiles,
    cut_parent_tiles: cutParents,
    total_tiles: buyTiles,
  };
  if (pricingActive(form) && form.price !== null) {
    const priced = calcRowPricing(tileW, tileH, buyTiles, form.price, form.per || 1);
    next.pricing = {
      ...(pattern.pricing || {}),
      tiles: buyTiles,
      packs_needed: Math.ceil(buyTiles / Math.max(1, form.per || 1)),
      cost_per_m2: priced.costPerM2,
      total_cost: priced.totalCost,
      price: form.price,
      per: form.per || 1,
    };
  }
  return next;
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
  const flatEdge = Boolean($('#tiles-flat-edge')?.checked);
  const groutGap = Boolean($('#tiles-grout-gap')?.checked);
  const gapCmRaw = ($('#tiles-gap-cm')?.value || '').trim();
  const gapCm = gapCmRaw === '' ? Number(DEFAULT_FORM.gapCm) : Number(gapCmRaw);
  const skirting = Boolean($('#tiles-skirting')?.checked);
  const skirtingCmRaw = ($('#tiles-skirting-cm')?.value || '').trim();
  const skirtingCm = skirtingCmRaw === '' ? Number(DEFAULT_FORM.skirtingCm) : Number(skirtingCmRaw);
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
    flatEdge,
    groutGap,
    gapCm,
    skirting,
    skirtingCm,
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
  syncSpaceOnlySwitches();
  renderResults();
  enrichAndRenderTable();
  showCalcStatus();
}

function syncSpaceOnlySwitches() {
  const spaceOk = spaceModeActive();
  const flatInput = $('#tiles-flat-edge');
  const flatLabel = flatInput?.closest('.tiles-switch');
  if (flatInput) {
    flatInput.disabled = !spaceOk;
    flatLabel?.classList.toggle('tiles-switch-disabled', !spaceOk);
  }

  const groutInput = $('#tiles-grout-gap');
  const groutLabel = groutInput?.closest('.tiles-switch');
  const gapField = $('#tiles-gap-cm');
  if (groutInput) {
    groutInput.disabled = !spaceOk;
    groutLabel?.classList.toggle('tiles-switch-disabled', !spaceOk);
  }
  if (gapField) {
    gapField.disabled = !spaceOk || !groutInput?.checked;
  }

  const skirtingInput = $('#tiles-skirting');
  const skirtingLabel = skirtingInput?.closest('.tiles-switch');
  const skirtingField = $('#tiles-skirting-cm');
  if (skirtingInput) {
    skirtingInput.disabled = !spaceOk;
    skirtingLabel?.classList.toggle('tiles-switch-disabled', !spaceOk);
  }
  if (skirtingField) {
    skirtingField.disabled = !spaceOk || !skirtingInput?.checked;
  }
}

function syncFlatEdgeSwitch() {
  syncSpaceOnlySwitches();
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

function buildCoverageCells(tileW, tileH, spaceW, spaceH, gapCm = 0) {
  const gap = gapCm > 0 ? gapCm : 0;
  const fitAxis = (space, tile) => {
    if (!(space > 0) || !(tile > 0)) {
      return { full: 0, rem: 0 };
    }
    if (!(gap > 0)) {
      const full = Math.floor(space / tile);
      return { full, rem: space - full * tile };
    }
    const full = Math.floor((space + gap) / (tile + gap));
    const used = full * tile + Math.max(0, full - 1) * gap;
    const rem = Math.round((space - used) * 1000) / 1000;
    return { full, rem: rem > 1e-9 ? rem : 0 };
  };

  const across = fitAxis(spaceW, tileW);
  const down = fitAxis(spaceH, tileH);
  const cols = across.full + (across.rem > 0 ? 1 : 0);
  const rows = down.full + (down.rem > 0 ? 1 : 0);
  const cells = [];
  let y = 0;
  for (let r = 0; r < rows; r += 1) {
    const rowH = (r >= down.full && down.rem > 0) ? down.rem : tileH;
    let x = 0;
    for (let c = 0; c < cols; c += 1) {
      const colW = (c >= across.full && across.rem > 0) ? across.rem : tileW;
      cells.push({
        x,
        y,
        w: colW,
        h: rowH,
        cut: colW !== tileW || rowH !== tileH,
      });
      x += colW + (c < cols - 1 ? gap : 0);
    }
    y += rowH + (r < rows - 1 ? gap : 0);
  }
  return cells;
}

function buildCoveragePattern(tileW, tileH, spaceW, spaceH, gapCm = 0, form = null) {
  const cells = buildCoverageCells(tileW, tileH, spaceW, spaceH, gapCm);
  let fullTiles = 0;
  const cutsMap = new Map();
  for (const cell of cells) {
    if (!cell.cut) {
      fullTiles += 1;
      continue;
    }
    const key = `${fmtDim(cell.w)}x${fmtDim(cell.h)}`;
    cutsMap.set(key, (cutsMap.get(key) || 0) + 1);
  }
  const cuts = [...cutsMap.entries()].map(([size, count]) => ({ size, count }));
  const totalTiles = cells.length;
  const pattern = {
    tile_width_cm: tileW,
    tile_height_cm: tileH,
    total_tiles: totalTiles,
    full_tiles: fullTiles,
    cuts,
  };
  if (form && pricingActive(form) && form.price !== null) {
    const priced = calcRowPricing(tileW, tileH, totalTiles, form.price, form.per || 1);
    pattern.pricing = {
      price: form.price,
      per: form.per || 1,
      tiles: totalTiles,
      packs_needed: Math.ceil(totalTiles / Math.max(1, form.per || 1)),
      cost_per_m2: priced.costPerM2,
      total_cost: priced.totalCost,
    };
  }
  return pattern;
}

function effectiveGroutGapCm(form = readForm()) {
  if (!form.groutGap || !spaceModeActive(form)) {
    return 0;
  }
  const gap = Number(form.gapCm);
  return gap > 0 ? gap : 0;
}

function effectiveSkirtingCm(form = readForm()) {
  if (!form.skirting || !spaceModeActive(form)) {
    return 0;
  }
  const inset = Number(form.skirtingCm);
  return inset > 0 ? inset : 0;
}

function coverageField(form = readForm()) {
  const inset = effectiveSkirtingCm(form);
  const width = Math.max(0, Number(form.spaceW) - 2 * inset);
  const height = Math.max(0, Number(form.spaceH) - 2 * inset);
  return {
    inset,
    width,
    height,
    fullWidth: Number(form.spaceW),
    fullHeight: Number(form.spaceH),
  };
}

function needsLocalCoverage(form = readForm()) {
  return effectiveGroutGapCm(form) > 0 || effectiveSkirtingCm(form) > 0;
}

function buildLocalCoverageData(form, orients) {
  const gap = effectiveGroutGapCm(form);
  const field = coverageField(form);
  const patterns = (orients?.length ? orients : [{ w: form.tileW, h: form.tileH }])
    .map((o) => buildCoveragePattern(o.w, o.h, field.width, field.height, gap, form));
  return {
    space_width_cm: field.fullWidth,
    space_height_cm: field.fullHeight,
    tiled_width_cm: field.width,
    tiled_height_cm: field.height,
    space_area_m2: (field.fullWidth * field.fullHeight) / 10000,
    patterns,
    gap_cm: gap,
    skirting_cm: field.inset,
  };
}

function renderCoverageGraph(tileW, tileH, spaceW, spaceH, {
  maxW = 360,
  maxH = 180,
  tileGap = false,
  gapCm = 0,
  skirtingCm = 0,
} = {}) {
  if (!(tileW > 0) || !(tileH > 0) || !(spaceW > 0) || !(spaceH > 0)) {
    return '';
  }

  const inset = skirtingCm > 0 ? skirtingCm : 0;
  const fieldW = Math.max(0, spaceW - 2 * inset);
  const fieldH = Math.max(0, spaceH - 2 * inset);
  const cells = buildCoverageCells(tileW, tileH, fieldW, fieldH, gapCm);
  const scale = Math.min(maxW / spaceW, maxH / spaceH, 1);
  const svgW = Math.max(1, Math.round(spaceW * scale));
  const svgH = Math.max(1, Math.round(spaceH * scale));
  const showGap = tileGap || gapCm > 0;
  const visualGap = showGap ? Math.min(1.5, Math.max(0.5, scale * (gapCm > 0 ? Math.max(gapCm, 0.3) : 1))) : 0;
  const seamFix = showGap ? 0 : 0.75;

  const skirtingRect = inset > 0
    ? `<rect class="tiles-cover-skirting" x="0" y="0" width="${svgW}" height="${svgH}" />
       <rect class="tiles-cover-field" x="${(inset * scale).toFixed(2)}" y="${(inset * scale).toFixed(2)}" width="${(fieldW * scale).toFixed(2)}" height="${(fieldH * scale).toFixed(2)}" />`
    : '';

  const rects = cells.map((cell) => {
    const x = (cell.x + inset) * scale;
    const y = (cell.y + inset) * scale;
    const rw = Math.max(0.75, cell.w * scale - visualGap + seamFix);
    const rh = Math.max(0.75, cell.h * scale - visualGap + seamFix);
    const cls = cell.cut ? 'tiles-cover-cut' : 'tiles-cover-full';
    return `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" />`;
  }).join('');

  return `
    <div class="tiles-cover-wrap" style="width:${svgW}px;height:${svgH}px" title="${attrValue(`${spaceW}×${spaceH}`)}">
      <svg class="tiles-cover-svg${showGap ? '' : ' tiles-cover-svg-tight'}" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" aria-hidden="true" focusable="false">${skirtingRect}${rects}</svg>
    </div>
  `;
}

function spaceModeActive(form = readForm()) {
  const spaceOpen = form.spaceOpen ?? Boolean(form.folds?.space);
  const spaceInvalid = !(form.spaceW > 0) || !(form.spaceH > 0);
  return Boolean(spaceOpen && !spaceInvalid);
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
  const gapCm = effectiveGroutGapCm(form);
  const skirtingCm = effectiveSkirtingCm(form);
  const pattern = applyFlatEdgePacking(lastCoverage.patterns[selectedLayoutIndex], form);
  const patternPricing = pricing ? pattern?.pricing : null;

  const summaryCells = [
    { label: t('tilesTiles'), value: String(pattern.total_tiles) },
    { label: t('tilesFull'), value: String(pattern.full_tiles) },
    { label: t('tilesCuts'), value: formatCuts(pattern.cuts), wrap: true },
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
            ${summaryCells.map((cell) => `<th${cell.wrap ? ' class="tiles-summary-cuts"' : ''}>${cell.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            ${summaryCells.map((cell) => `<td${cell.wrap ? ' class="tiles-summary-cuts"' : ''}>${cell.value}</td>`).join('')}
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
            ${lastCoverage.patterns.map((raw, index) => {
              const item = applyFlatEdgePacking(raw, form);
              const isSelected = index === selectedLayoutIndex ? ' selected' : '';
              const packedCuts = item.cut_parent_tiles
                ?? Math.max(0, item.total_tiles - item.full_tiles);
              return `
                <tr class="tiles-orient-row${isSelected}" data-layout-index="${index}" tabindex="0">
                  ${multi ? `<td class="tiles-orient-tile">${item.tile_width_cm}×${item.tile_height_cm}</td>` : ''}
                  <td class="tiles-orient-grid">
                    <span class="tiles-orient-grid-inner">
                      <span class="tiles-orient-rc">${item.full_tiles}+${packedCuts}</span>
                      <span class="tiles-orient-arrow" aria-hidden="true">→</span>
                    </span>
                  </td>
                  <td class="tiles-orient-size">${lastCoverage.space_width_cm}×${lastCoverage.space_height_cm}</td>
                  <td class="tiles-orient-graph">${renderCoverageGraph(
                    item.tile_width_cm,
                    item.tile_height_cm,
                    lastCoverage.space_width_cm,
                    lastCoverage.space_height_cm,
                    { tileGap, gapCm, skirtingCm },
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
        const data = needsLocalCoverage(form)
          ? buildLocalCoverageData(form, [orientation])
          : await fetchCoverageCached(form, orientation);
        const pattern = pickCoveragePattern(data, orientation);
        if (pattern) {
          const packed = applyFlatEdgePacking(pattern, form);
          out.kind = 'coverage';
          out.space = `${data.space_width_cm}×${data.space_height_cm}`;
          out.totalTiles = packed.total_tiles;
          out.fullTiles = packed.full_tiles;
          out.cutsLabel = formatCuts(packed.cuts);
          out.areaM2 = data.space_area_m2;
          if (priceOk && packed.pricing) {
            out.costPerM2 = packed.pricing.cost_per_m2;
            out.totalCost = packed.pricing.total_cost;
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
    ${cell(spaceOk && row.cutsLabel ? escapeHtml(row.cutsLabel) : '', '', 'tiles-list-cuts')}
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
            <label class="tiles-switch" title="${attrValue(t('tilesShowTilesHelp'))}">
              <span class="tiles-switch-label">${t('tilesShowTiles')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-gap" role="switch" aria-label="${attrValue(t('tilesShowTiles'))}"${form.tileGap ? ' checked' : ''}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
            <label class="tiles-switch${spaceModeActive(form) ? '' : ' tiles-switch-disabled'}" title="${attrValue(t('tilesFlatEdgeHelp'))}">
              <span class="tiles-switch-label">${t('tilesFlatEdge')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-flat-edge" role="switch" aria-label="${attrValue(t('tilesFlatEdge'))}"${form.flatEdge ? ' checked' : ''}${spaceModeActive(form) ? '' : ' disabled'}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
          </div>
          <div class="tiles-switch-row tiles-gap-calc-row">
            <label class="tiles-switch${spaceModeActive(form) ? '' : ' tiles-switch-disabled'}" title="${attrValue(t('tilesGroutGapHelp'))}">
              <span class="tiles-switch-label">${t('tilesGroutGap')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-grout-gap" role="switch" aria-label="${attrValue(t('tilesGroutGap'))}"${form.groutGap ? ' checked' : ''}${spaceModeActive(form) ? '' : ' disabled'}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
            <div class="dmt-field tiles-gap-cm-field">
              <label for="tiles-gap-cm">${t('tilesGapCm')}</label>
              <input type="number" id="tiles-gap-cm" min="0" step="0.1" value="${attrValue(form.gapCm ?? DEFAULT_FORM.gapCm)}"${spaceModeActive(form) && form.groutGap ? '' : ' disabled'}>
            </div>
            <label class="tiles-switch${spaceModeActive(form) ? '' : ' tiles-switch-disabled'}" title="${attrValue(t('tilesSkirtingHelp'))}">
              <span class="tiles-switch-label">${t('tilesSkirting')}</span>
              <span class="dmt-switch">
                <input type="checkbox" id="tiles-skirting" role="switch" aria-label="${attrValue(t('tilesSkirting'))}"${form.skirting ? ' checked' : ''}${spaceModeActive(form) ? '' : ' disabled'}>
                <span class="dmt-switch-slider"></span>
              </span>
            </label>
            <div class="dmt-field tiles-gap-cm-field">
              <label for="tiles-skirting-cm">${t('tilesSkirtingCm')}</label>
              <input type="number" id="tiles-skirting-cm" min="0" step="0.1" value="${attrValue(form.skirtingCm ?? DEFAULT_FORM.skirtingCm)}"${spaceModeActive(form) && form.skirting ? '' : ' disabled'}>
            </div>
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
    const data = needsLocalCoverage(form)
      ? buildLocalCoverageData(form, orientations)
      : await fetchCoverageCached(form, orientation);
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
      const gap = effectiveGroutGapCm(form);
      const skirting = effectiveSkirtingCm(form);
      const data = lastCoverage && coveragePattern
        && gap === (lastCoverage.gap_cm || 0)
        && skirting === (lastCoverage.skirting_cm || 0)
        ? lastCoverage
        : needsLocalCoverage(form)
          ? buildLocalCoverageData(form, [orientation])
          : await fetchCoverage(form, orientation);
      if (seq !== addSeq) {
        return;
      }
      const pattern = (lastCoverage && coveragePattern && data === lastCoverage)
        ? applyFlatEdgePacking(coveragePattern, form)
        : applyFlatEdgePacking(pickCoveragePattern(data, orientation) || data.patterns?.[0], form);
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
        flatEdge: Boolean(form.flatEdge),
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
  const onFlatEdgeChange = () => {
    saveFormState();
    renderResults();
    enrichAndRenderTable();
  };
  const enableShowIndividualTiles = () => {
    const show = $('#tiles-gap');
    if (show && !show.checked) {
      show.checked = true;
    }
  };
  const onGroutGapChange = () => {
    const groutOn = Boolean($('#tiles-grout-gap')?.checked);
    if (groutOn) {
      enableShowIndividualTiles();
    }
    const gapField = $('#tiles-gap-cm');
    if (gapField) {
      gapField.disabled = !spaceModeActive() || !groutOn;
    }
    saveFormState();
    flushRefreshOrientations({ resetLayout: false });
  };
  const onGapCmInput = () => {
    if ($('#tiles-grout-gap')?.checked) {
      enableShowIndividualTiles();
    }
    saveFormState();
    scheduleRefreshOrientations({ resetLayout: false });
  };
  const onSkirtingChange = () => {
    const on = Boolean($('#tiles-skirting')?.checked);
    const field = $('#tiles-skirting-cm');
    if (field) {
      field.disabled = !spaceModeActive() || !on;
    }
    saveFormState();
    flushRefreshOrientations({ resetLayout: false });
  };
  const onSkirtingCmInput = () => {
    saveFormState();
    scheduleRefreshOrientations({ resetLayout: false });
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

  const flatEdgeInput = $('#tiles-flat-edge');
  flatEdgeInput?.addEventListener('change', onFlatEdgeChange);
  cleanup.push(() => flatEdgeInput?.removeEventListener('change', onFlatEdgeChange));

  const groutGapInput = $('#tiles-grout-gap');
  groutGapInput?.addEventListener('change', onGroutGapChange);
  cleanup.push(() => groutGapInput?.removeEventListener('change', onGroutGapChange));

  const gapCmInput = $('#tiles-gap-cm');
  gapCmInput?.addEventListener('input', onGapCmInput);
  gapCmInput?.addEventListener('change', onGapCmInput);
  cleanup.push(() => {
    gapCmInput?.removeEventListener('input', onGapCmInput);
    gapCmInput?.removeEventListener('change', onGapCmInput);
  });

  const skirtingInput = $('#tiles-skirting');
  skirtingInput?.addEventListener('change', onSkirtingChange);
  cleanup.push(() => skirtingInput?.removeEventListener('change', onSkirtingChange));

  const skirtingCmInput = $('#tiles-skirting-cm');
  skirtingCmInput?.addEventListener('input', onSkirtingCmInput);
  skirtingCmInput?.addEventListener('change', onSkirtingCmInput);
  cleanup.push(() => {
    skirtingCmInput?.removeEventListener('input', onSkirtingCmInput);
    skirtingCmInput?.removeEventListener('change', onSkirtingCmInput);
  });

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
