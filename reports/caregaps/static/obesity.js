/* ==========================================================================
   Obesity / BMI Care Gaps dashboard
   Fetches the monthly snapshot JSON (produced by Obesity.py) and renders:
     - Clinic-wide summary + category breakdown
     - Provider-scoped summary + category breakdown (same layout, filtered)
     - Patient-level detail via Tabulator

   Data source: change DATA_URL to wherever the Flask route serves the
   current snapshot (e.g. /api/caregaps/obesity or a static JSON path).
   ========================================================================== */

const DATA_URL = '/caregaps/data/obesity/latest'; // Flask route resolves this to the newest dated obesity snapshot

const ADULT_CATEGORIES = ['Obese Class I', 'Obese Class II', 'Obese Class III'];
const PEDIATRIC_CATEGORIES = ['Obese', 'Severe Obesity'];

const CATEGORY_BADGE_CLASS = {
  'Obese Class I': 'badge-class1',
  'Obese Class II': 'badge-class2',
  'Obese Class III': 'badge-class3',
  'Obese': 'badge-obese',
  'Severe Obesity': 'badge-severe',
};

const CATEGORY_BAR_COLOR = {
  'Obese Class I': 'var(--sev1)',
  'Obese Class II': 'var(--sev2)',
  'Obese Class III': 'var(--sev3)',
  'Obese': 'var(--sev1)',
  'Severe Obesity': 'var(--sev3)',
};

let REPORT = null;       // full payload as fetched
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name
let table = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireProviderSelect();
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Obesity dashboard: failed to load', DATA_URL, err);
    renderLoadError(err);
    return;
  }
  populateProviderSelect();
  renderGeneratedAt();
  renderSummary();
  buildTable();
}

function renderLoadError(err) {
  document.getElementById('generatedAt').textContent = 'Failed to load data';
  const main = document.querySelector('main');
  const banner = document.createElement('div');
  banner.className = 'stat-card stat-card--warn';
  banner.style.marginBottom = '16px';
  banner.innerHTML = `<span class="stat-label">Could not load ${DATA_URL}: ${err.message}. ` +
    `Check that the snapshot file exists and the path in obesity.js is correct.</span>`;
  main.insertBefore(banner, main.firstChild);
}

// --------------------------------------------------------------------------
// Provider select (single dropdown: "Clinic" + every real provider name,
// matching the pophealth pattern -- no separate toggle control)
// --------------------------------------------------------------------------

function wireProviderSelect() {
  document.getElementById('providerSelect').addEventListener('change', (e) => {
    currentProvider = e.target.value;
    if (REPORT) {
      renderSummary();
      applyTableFilter();
    }
  });
}

function populateProviderSelect() {
  const select = document.getElementById('providerSelect');
  select.innerHTML = '';

  const clinicOpt = document.createElement('option');
  clinicOpt.value = '__clinic__';
  clinicOpt.textContent = 'Clinic (All Providers)';
  select.appendChild(clinicOpt);

  const providers = Object.keys(REPORT.provider_breakdown || {}).sort();
  providers.forEach(prov => {
    const opt = document.createElement('option');
    opt.value = prov;
    opt.textContent = prov;
    select.appendChild(opt);
  });

  select.value = currentProvider;
}

// --------------------------------------------------------------------------
// Header meta
// --------------------------------------------------------------------------

function renderGeneratedAt() {
  const el = document.getElementById('generatedAt');
  if (!REPORT.generated_at) { el.textContent = '—'; return; }
  const d = new Date(REPORT.generated_at);
  el.textContent = `Generated ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

// --------------------------------------------------------------------------
// Summary rendering (stat cards + category bars)
// Shared between clinic and provider views -- just points at a different
// summary object depending on currentProvider.
// --------------------------------------------------------------------------

function activeSummary() {
  if (currentProvider !== '__clinic__') {
    return REPORT.provider_breakdown[currentProvider] || emptySummary();
  }
  return REPORT.clinic_summary;
}

function emptySummary() {
  return {
    total_obese_patients: 0,
    adult: Object.fromEntries(ADULT_CATEGORIES.map(c => [c, 0])),
    pediatric: Object.fromEntries(PEDIATRIC_CATEGORIES.map(c => [c, 0])),
    unclassifiable_sex_count: 0,
  };
}

function renderSummary() {
  const summary = activeSummary();

  const adultTotal = ADULT_CATEGORIES.reduce((sum, c) => sum + (summary.adult[c] || 0), 0);
  const pedTotal = PEDIATRIC_CATEGORIES.reduce((sum, c) => sum + (summary.pediatric[c] || 0), 0);

  document.getElementById('statTotal').textContent = summary.total_obese_patients ?? 0;
  document.getElementById('statAdultTotal').textContent = adultTotal;
  document.getElementById('statPedTotal').textContent = pedTotal;

  renderCategoryBars('adultBars', ADULT_CATEGORIES, summary.adult, adultTotal);
  renderCategoryBars('pedBars', PEDIATRIC_CATEGORIES, summary.pediatric, pedTotal);
}

function renderCategoryBars(containerId, categories, counts, groupTotal) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  categories.forEach(cat => {
    const count = counts[cat] || 0;
    const pct = groupTotal > 0 ? (count / groupTotal) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'cat-row' + (count === 0 ? ' empty' : '');
    row.innerHTML = `
      <span class="cat-name">${cat}</span>
      <span class="cat-track"><span class="cat-fill" style="width:${pct}%; background:${CATEGORY_BAR_COLOR[cat]}"></span></span>
      <span class="cat-count">${count}</span>
    `;
    container.appendChild(row);
  });
}

// --------------------------------------------------------------------------
// Tabulator patient detail
// --------------------------------------------------------------------------

function buildTable() {
  table = new Tabulator('#patientTable', {
    data: REPORT.patient_detail || [],
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: 'No patients match the current view',
    initialSort: [{ column: 'category', dir: 'desc' }],
    columns: [
      { title: 'Patient', field: 'pat_name', minWidth: 160, headerFilter: 'input' },
      { title: 'MRN', field: 'mrn', width: 110 },
      { title: 'Population', field: 'population', width: 100,
        formatter: cell => (cell.getValue() === 'adult' ? 'Adult' : cell.getValue() === 'pediatric' ? 'Pediatric' : '—') },
      { title: 'Age', field: 'age_years', width: 70, sorter: 'number',
        formatter: cell => cell.getValue() != null ? cell.getValue().toFixed(1) : '—' },
      { title: 'BMI', field: 'bmi', width: 70, sorter: 'number',
        formatter: cell => cell.getValue() != null ? cell.getValue().toFixed(1) : '—' },
      { title: 'Percentile', field: 'percentile', width: 100, sorter: 'number',
        formatter: cell => cell.getValue() != null ? cell.getValue().toFixed(1) + '%' : '—' },
      { title: 'Category', field: 'category', width: 150, formatter: categoryFormatter },
      { title: 'Vitals date', field: 'vitals_date', width: 110, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'PCP', field: 'pcp_name', width: 160 },
    ],
    rowFormatter: row => {
      const data = row.getData();
      if (data.sex_unclassifiable) {
        row.getElement().style.background = 'var(--warn-soft)';
      }
    },
  });

  // Tabulator initializes asynchronously -- the constructor returns before
  // the table is ready, so calling filter methods immediately can hit it
  // mid-setup. Wait for tableBuilt before touching filters.
  table.on('tableBuilt', () => {
    applyTableFilter();
  });
}

function categoryFormatter(cell) {
  const data = cell.getRow().getData();
  if (data.sex_unclassifiable) {
    return `<span class="badge badge-unclassifiable">Sex code unclassifiable</span>`;
  }
  const val = cell.getValue();
  if (!val) return '—';
  const cls = CATEGORY_BADGE_CLASS[val] || '';
  return `<span class="badge ${cls}">${val}</span>`;
}

function applyTableFilter() {
  if (!table || !table.initialized) return;
  table.clearFilter();
  if (currentProvider !== '__clinic__') {
    table.setFilter('pcp_name', '=', currentProvider);
  }
}

// --------------------------------------------------------------------------
// Detail section controls (quick filter, CSV export)
// --------------------------------------------------------------------------

function wireDetailControls() {
  document.getElementById('quickFilter').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!table) return;
    if (!val) {
      applyTableFilter();
      return;
    }
    table.setFilter([
      [
        { field: 'pat_name', type: 'like', value: val },
        { field: 'mrn', type: 'like', value: val },
      ],
    ]);
    if (currentProvider !== '__clinic__') {
      table.addFilter('pcp_name', '=', currentProvider);
    }
  });

  document.getElementById('downloadCsv').addEventListener('click', () => {
    if (!table) return;
    const scope = currentProvider !== '__clinic__' ? `_${currentProvider}` : '_clinic';
    table.download('csv', `obesity_care_gaps${scope}.csv`);
  });
}