/* ==========================================================================
   Diabetes Care Gaps dashboard
   Fetches the monthly snapshot JSON (produced by Diabetes.py) and renders:
     - Clinic-wide summary + DM-type breakdown
     - Provider-scoped summary + DM-type breakdown (same layout, filtered)
     - Patient-level detail via Tabulator, filterable by provider AND by
       age bucket (Pediatric/Adult) simultaneously

   Data source: change DATA_URL to wherever the Flask route serves the
   current snapshot.
   ========================================================================== */

const DATA_URL = '/caregaps/data/diabetes/latest'; // Flask route resolves this to the newest dated diabetes snapshot

const DM_TYPES = ['Type 1', 'Type 2', 'Gestational', 'Prediabetes'];

const TYPE_BADGE_CLASS = {
  'Type 1': 'badge-type1',
  'Type 2': 'badge-type2',
  'Gestational': 'badge-gestational',
  'Prediabetes': 'badge-prediabetes',
};

const TYPE_BAR_COLOR = {
  'Type 1': 'var(--sev3)',
  'Type 2': 'var(--sev2)',
  'Gestational': 'var(--sev1)',
  'Prediabetes': 'var(--ink-muted)',
};

let REPORT = null;
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name
let currentAgeBucket = 'all';       // 'all' | 'Pediatric' | 'Adult'
let table = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireProviderSelect();
  wireAgeToggle();
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Diabetes dashboard: failed to load', DATA_URL, err);
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
    `Check that the snapshot file exists and the path in diabetes.js is correct.</span>`;
  main.insertBefore(banner, main.firstChild);
}

// --------------------------------------------------------------------------
// Provider select (single dropdown: "Clinic" + every real provider name)
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
// Age bucket toggle (patient-detail-only filter -- does NOT affect the
// clinic summary stat card / type bars above, per design)
// --------------------------------------------------------------------------

function wireAgeToggle() {
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAgeBucket = btn.dataset.age;
      applyTableFilter();
    });
  });
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
// Summary rendering (stat card + type bars)
// Shared between clinic and provider views -- just points at a different
// summary object depending on currentProvider. Age bucket does NOT affect
// this section at all, per confirmed design (patient-detail-only dimension).
// --------------------------------------------------------------------------

function activeSummary() {
  if (currentProvider !== '__clinic__') {
    return REPORT.provider_breakdown[currentProvider] || emptySummary();
  }
  return REPORT.clinic_summary;
}

function emptySummary() {
  return {
    total_dm_patients: 0,
    by_type: Object.fromEntries(DM_TYPES.map(t => [t, 0])),
    by_age_bucket: { Adult: 0, Pediatric: 0 },
  };
}

function renderSummary() {
  const summary = activeSummary();

  document.getElementById('statTotal').textContent = summary.total_dm_patients ?? 0;
  document.getElementById('statAdultTotal').textContent = summary.by_age_bucket?.Adult ?? 0;
  document.getElementById('statPedTotal').textContent = summary.by_age_bucket?.Pediatric ?? 0;

  renderCategoryBars('typeBars', DM_TYPES, summary.by_type, summary.total_dm_patients ?? 0);
}

function renderCategoryBars(containerId, categories, counts, groupTotal) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  categories.forEach(cat => {
    const count = (counts && counts[cat]) || 0;
    const pct = groupTotal > 0 ? (count / groupTotal) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'cat-row' + (count === 0 ? ' empty' : '');
    row.innerHTML = `
      <span class="cat-name">${cat}</span>
      <span class="cat-track"><span class="cat-fill" style="width:${pct}%; background:${TYPE_BAR_COLOR[cat]}"></span></span>
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
    initialSort: [{ column: 'dm_type', dir: 'asc' }],
    columns: [
      { title: 'Patient', field: 'pat_name', minWidth: 160, headerFilter: 'input' },
      { title: 'MRN', field: 'mrn', width: 110 },
      { title: 'Type', field: 'dm_type', width: 130, formatter: typeFormatter },
      { title: 'Age', field: 'age_years', width: 70, sorter: 'number',
        formatter: cell => cell.getValue() != null ? cell.getValue().toFixed(1) : '—' },
      { title: 'Age Bucket', field: 'age_bucket', width: 100 },
      { title: 'Dx encounter date', field: 'dx_encounter_date', width: 130, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'PCP', field: 'pcp_name', width: 160 },
    ],
  });

  // Tabulator initializes asynchronously -- the constructor returns before
  // the table is ready, so calling filter methods immediately can hit it
  // mid-setup. Wait for tableBuilt before touching filters.
  table.on('tableBuilt', () => {
    applyTableFilter();
  });
}

function typeFormatter(cell) {
  const val = cell.getValue();
  if (!val) return '—';
  const cls = TYPE_BADGE_CLASS[val] || '';
  return `<span class="badge ${cls}">${val}</span>`;
}

// --------------------------------------------------------------------------
// Combined filtering: provider (dropdown) AND age bucket (toggle) apply
// together, plus the quick-filter text search -- all three compose as a
// single filter array so none of them silently overwrite each other.
// --------------------------------------------------------------------------

function buildActiveFilters(quickFilterValue) {
  const filters = [];

  if (currentProvider !== '__clinic__') {
    filters.push({ field: 'pcp_name', type: '=', value: currentProvider });
  }
  if (currentAgeBucket !== 'all') {
    filters.push({ field: 'age_bucket', type: '=', value: currentAgeBucket });
  }
  if (quickFilterValue) {
    // OR-group across name/MRN, ANDed with the filters above
    filters.push([
      { field: 'pat_name', type: 'like', value: quickFilterValue },
      { field: 'mrn', type: 'like', value: quickFilterValue },
    ]);
  }

  return filters;
}

function applyTableFilter() {
  if (!table || !table.initialized) return;
  const quickFilterValue = document.getElementById('quickFilter').value.trim();
  table.setFilter(buildActiveFilters(quickFilterValue));
}

// --------------------------------------------------------------------------
// Detail section controls (quick filter, CSV export)
// --------------------------------------------------------------------------

function wireDetailControls() {
  document.getElementById('quickFilter').addEventListener('input', () => {
    applyTableFilter();
  });

  document.getElementById('downloadCsv').addEventListener('click', () => {
    if (!table) return;
    const providerScope = currentProvider !== '__clinic__' ? `_${currentProvider}` : '_clinic';
    const ageScope = currentAgeBucket !== 'all' ? `_${currentAgeBucket}` : '';
    table.download('csv', `diabetes_care_gaps${providerScope}${ageScope}.csv`);
  });
}