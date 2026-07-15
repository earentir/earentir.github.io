const dateMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayofWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const YEAR_MIN = 1970;
const YEAR_MAX = 2100;
const THEME_STORAGE_KEY = 'dmt-theme';

document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
  initTheme();
  populateDateSelectors();
  populateTimeSelectors();
  populateSelectOptions();
  setToNow();
  bindEvents();
  calcUTC();
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getStoredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const themeSwitch = document.getElementById('theme-switch');
  if (themeSwitch) {
    themeSwitch.checked = theme === 'light';
  }

  document.getElementById('theme-label-dark')?.classList.toggle('dmt-theme-label-active', theme === 'dark');
  document.getElementById('theme-label-light')?.classList.toggle('dmt-theme-label-active', theme === 'light');
}

function initTheme() {
  const stored = getStoredTheme();
  applyTheme(stored ?? getSystemTheme());

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
    if (!getStoredTheme()) {
      applyTheme(event.matches ? 'light' : 'dark');
    }
  });
}

function onThemeSwitchChange() {
  const theme = document.getElementById('theme-switch').checked ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

function bindEvents() {
  const recalcIds = ['date-year', 'date-month', 'date-day', 'time-hour', 'time-minute', 'time-second', 'outputFormat'];

  recalcIds.forEach((id) => {
    document.getElementById(id).addEventListener('change', onDateTimeChange);
  });

  document.getElementById('calc-btn').addEventListener('click', calcUTC);
  document.getElementById('now-btn').addEventListener('click', setToNow);
  document.getElementById('copy-btn').addEventListener('click', copyResult);
  document.getElementById('complete-btn').addEventListener('click', completeTime);
  document.getElementById('theme-switch').addEventListener('change', onThemeSwitchChange);
}

function onDateTimeChange(event) {
  if (event.target.id === 'date-year' || event.target.id === 'date-month') {
    syncDayOptions();
  }
  updateDatePreview();
  updateTimePreview();
  calcUTC();
}

function populateDateSelectors() {
  const yearSelect = document.getElementById('date-year');
  const monthSelect = document.getElementById('date-month');

  for (let year = YEAR_MIN; year <= YEAR_MAX; year += 1) {
    yearSelect.append(createOption(String(year), String(year)));
  }

  dateMonths.forEach((name, index) => {
    const monthNum = String(index + 1).padStart(2, '0');
    monthSelect.append(createOption(monthNum, `${name} (${monthNum})`));
  });
}

function populateTimeSelectors() {
  populateNumericSelect('time-hour', 0, 23);
  populateNumericSelect('time-minute', 0, 59);
  populateNumericSelect('time-second', 0, 59);
}

function populateNumericSelect(id, min, max) {
  const select = document.getElementById(id);
  for (let value = min; value <= max; value += 1) {
    const label = String(value).padStart(2, '0');
    select.append(createOption(label, label));
  }
}

function syncDayOptions() {
  const year = Number(document.getElementById('date-year').value);
  const month = Number(document.getElementById('date-month').value);
  const daySelect = document.getElementById('date-day');
  const previousDay = Number(daySelect.value) || 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  daySelect.replaceChildren();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const label = String(day).padStart(2, '0');
    daySelect.append(createOption(label, label));
  }

  daySelect.value = String(Math.min(previousDay, daysInMonth)).padStart(2, '0');
}

function setDateTimeValues(date) {
  document.getElementById('date-year').value = String(date.getFullYear());
  document.getElementById('date-month').value = String(date.getMonth() + 1).padStart(2, '0');
  syncDayOptions();
  document.getElementById('date-day').value = String(date.getDate()).padStart(2, '0');
  document.getElementById('time-hour').value = String(date.getHours()).padStart(2, '0');
  document.getElementById('time-minute').value = String(date.getMinutes()).padStart(2, '0');
  document.getElementById('time-second').value = String(date.getSeconds()).padStart(2, '0');
  updateDatePreview();
  updateTimePreview();
}

function setToNow() {
  setDateTimeValues(new Date());
  calcUTC();
}

function completeTime() {
  const selected = getSelectedDateTime();
  const startOfDay = new Date(selected);
  startOfDay.setHours(0, 0, 0, 0);

  const intervalMs = 5 * 60 * 1000;
  const msFromMidnight = selected.getTime() - startOfDay.getTime();
  const roundedFromMidnight = msFromMidnight % intervalMs === 0
    ? msFromMidnight
    : Math.ceil(msFromMidnight / intervalMs) * intervalMs;

  setDateTimeValues(new Date(startOfDay.getTime() + roundedFromMidnight));
  calcUTC();
}

function getSelectedDateTime() {
  const year = document.getElementById('date-year').value;
  const month = document.getElementById('date-month').value;
  const day = document.getElementById('date-day').value;
  const hour = document.getElementById('time-hour').value;
  const minute = document.getElementById('time-minute').value;
  const second = document.getElementById('time-second').value;

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

function updateDatePreview() {
  const year = document.getElementById('date-year').value;
  const month = Number(document.getElementById('date-month').value);
  const day = document.getElementById('date-day').value;
  const date = new Date(Number(year), month - 1, Number(day));

  document.getElementById('date-preview').textContent =
    `${dayofWeek[date.getDay()]}, ${dateMonths[month - 1]} ${day}, ${year}`;
}

function updateTimePreview() {
  const hour = document.getElementById('time-hour').value;
  const minute = document.getElementById('time-minute').value;
  const second = document.getElementById('time-second').value;
  document.getElementById('time-preview').textContent = `${hour}:${minute}:${second}`;
}

function populateSelectOptions() {
  const curDateTime = new Date();
  const selectoptions = [
    `${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()} ${buildTHT(curDateTime)}`,
    `${dayofWeek[curDateTime.getDay()]}, ${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()} ${buildTHT(curDateTime, false)}`,
    `${addLZ(curDateTime.getDate())}/${addLZ(curDateTime.getMonth() + 1)}/${curDateTime.getFullYear()}`,
    `${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()}`,
    buildTHT(curDateTime, false),
    buildTHT(curDateTime, true),
    'in N days',
  ];

  const select = document.getElementById('outputFormat');
  selectoptions.forEach((optionText, i) => {
    select.append(createOption(String(i), optionText));
  });
}

function buildTHT(datetime, seconds = true) {
  const parts = datetime.toTimeString().split(' ')[0].split(':');
  const hours = parts[0];
  const minutes = parts[1];
  const secs = parts[2];

  return seconds ? `${hours}:${minutes}:${secs}` : `${hours}:${minutes}`;
}

function addLZ(digit) {
  return digit.toString().padStart(2, '0');
}

function calcUTC() {
  const selected = getSelectedDateTime();
  const epoch = String(Math.floor(selected.getTime() / 1000));
  const discorttimeforms = ['f', 'F', 'd', 'D', 't', 'T', 'R'];

  document.getElementById('discorttime').value =
    `<t:${epoch}:${discorttimeforms[document.getElementById('outputFormat').value]}>`;
}

async function copyResult() {
  const output = document.getElementById('discorttime');
  const text = output.value;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    output.select();
    document.execCommand('copy');
  }

  const copyBtn = document.getElementById('copy-btn');
  const original = copyBtn.textContent;
  copyBtn.textContent = 'Copied!';
  setTimeout(() => {
    copyBtn.textContent = original;
  }, 1200);
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
