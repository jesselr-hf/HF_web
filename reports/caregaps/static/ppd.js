/* ==========================================================================
   Postpartum Grant / Edinburgh Screens dashboard
   Fetches ppd_data.json via the same /caregaps/data/<domain>/latest route
   every other Care Gap detail page uses (see app.py's caregaps_data_latest
   route) -- NOT a static file path. That route globs
   snapshots/{domain}_*.json and serves the lexicographically-last match;
   for domain="ppd" that glob is ppd_*.json, which matches ppd_data.json
   (confirmed the only file in snapshots/ starting with "ppd_", so this is
   safe -- no dated-suffix collision to worry about).

   ppd_data.json has two top-level arrays, "ppd" and "wcc" -- two entirely
   different ways of capturing Edinburgh screening data (confirmed: not a
   duplicate/rollup of each other). This page merges both into one
   by-quarter table (ppd count + wcc count as side-by-side columns) and
   sums each array's current-calendar-year quarters into YTD stat cards --
   same YTD logic as EdinburghScreens.py's build(), just computed
   client-side against the same source file instead of reading its output
   snapshot (which only carries the combined total, not the quarterly
   breakdown this page needs).

   No provider scoping -- confirmed design, same as Fluoride/CHW: this
   page has no provider/employee dropdown, just a column-filterable
   Tabulator table.
   ========================================================================== */

const DATA_URL = '/caregaps/data/ppd/latest'; // resolves to snapshots/ppd_data.json via the shared {domain}_*.json "latest" route

let REPORT = null;
let QUARTER_ROWS = []; // merged ppd+wcc rows, one per quarter
let quarterTable = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Edinburgh Screens dashboard: failed to load', DATA_URL, err);
    renderLoadError(err);
    return;
  }

  if (!REPORT.ppd && !REPORT.wcc) {
    renderLoadError(new Error('ppd_data.json has neither a "ppd" nor a "wcc" array'));
    return;
  }

  QUARTER_ROWS = mergeByQuarter(REPORT.ppd || [], REPORT.wcc || []);

  renderGeneratedAt();
  renderSummary();
  buildQuarterTable();
}

function renderLoadError(err) {
  document.getElementById('generatedAt').textContent = 'Failed to load data';
  const main = document.querySelector('main');
  const banner = document.createElement('div');
  banner.className = 'stat-card stat-card--warn';
  banner.style.marginBottom = '16px';
  banner.innerHTML = `<span class="stat-label">Could not load ${DATA_URL}: ${err.message}. ` +
    `Check that ppd_data.json exists in snapshots/ and that /caregaps/data/ppd/latest resolves to it.</span>`;
  main.insertBefore(banner, main.firstChild);
}

// --------------------------------------------------------------------------
// Header meta
// --------------------------------------------------------------------------

function renderGeneratedAt() {
  const el = document.getElementById('generatedAt');
  if (!REPORT.run_date) { el.textContent = '—'; return; }
  el.textContent = `Generated ${REPORT.run_date}`;
}

// --------------------------------------------------------------------------
// Merge ppd + wcc arrays into one row per quarter
// --------------------------------------------------------------------------

function mergeByQuarter(ppdRows, wccRows) {
  const byQuarter = new Map();

  for (const row of ppdRows) {
    byQuarter.set(row.Quarter, { quarter: row.Quarter, ppd_total: row['Total Screenings'] ?? 0, wcc_total: 0 });
  }
  for (const row of wccRows) {
    const existing = byQuarter.get(row.Quarter);
    if (existing) {
      existing.wcc_total = row['Total Screenings'] ?? 0;
    } else {
      byQuarter.set(row.Quarter, { quarter: row.Quarter, ppd_total: 0, wcc_total: row['Total Screenings'] ?? 0 });
    }
  }

  return Array.from(byQuarter.values())
    .map((r) => ({ ...r, combined_total: r.ppd_total + r.wcc_total }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

// --------------------------------------------------------------------------
// Summary stat row (YTD, current calendar year, both arrays)
// --------------------------------------------------------------------------

function currentYearQuarterPrefix() {
  return String(new Date().getFullYear());
}

function renderSummary() {
  const yearPrefix = currentYearQuarterPrefix();
  const ytdRows = QUARTER_ROWS.filter((r) => r.quarter.startsWith(yearPrefix));

  const ppdYtd = ytdRows.reduce((sum, r) => sum + r.ppd_total, 0);
  const wccYtd = ytdRows.reduce((sum, r) => sum + r.wcc_total, 0);

  document.getElementById('statTotal').textContent = ppdYtd + wccYtd;
  document.getElementById('statPpdTotal').textContent = ppdYtd;
  document.getElementById('statWccTotal').textContent = wccYtd;
}

// --------------------------------------------------------------------------
// By-quarter table
// --------------------------------------------------------------------------

function buildQuarterTable() {
  quarterTable = new Tabulator('#quarterTable', {
    data: QUARTER_ROWS,
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: 'No quarters match the current filter',
    initialSort: [{ column: 'quarter', dir: 'desc' }],
    columns: [
      { title: 'Quarter', field: 'quarter', minWidth: 140, headerFilter: 'input' },
      { title: 'PPD Screenings', field: 'ppd_total', width: 160, sorter: 'number' },
      { title: 'WCC Screenings', field: 'wcc_total', width: 160, sorter: 'number' },
      { title: 'Combined', field: 'combined_total', width: 140, sorter: 'number' },
    ],
  });
}

// --------------------------------------------------------------------------
// Detail section controls (quick filter, CSV export)
// --------------------------------------------------------------------------

function wireDetailControls() {
  document.getElementById('quickFilter').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (!quarterTable) return;
    if (!value) { quarterTable.clearFilter(); return; }
    quarterTable.setFilter('quarter', 'like', value);
  });

  document.getElementById('downloadCsv').addEventListener('click', () => {
    if (!quarterTable) return;
    quarterTable.download('csv', 'edinburgh_screens_by_quarter.csv');
  });
}