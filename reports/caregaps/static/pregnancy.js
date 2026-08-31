/* ==========================================================================
   Pregnancy Care Gaps dashboard
   Fetches the monthly snapshot JSON (produced by PregnancyList.py) and
   renders:
     - Clinic-wide summary (single "Total active pregnant patients" card --
       confirmed design, no secondary breakdown cards like Asthma's
       Adult/Pediatric split)
     - Provider-scoped summary (same layout, filtered)
     - Patient-level detail via Tabulator, filterable by provider AND by
       trimester (1st/2nd/3rd/All) simultaneously, showing every column
       from the source Excel plus the Clarity-derived PCP field

   Data source: change DATA_URL to wherever the Flask route serves the
   current snapshot.
   ========================================================================== */

const DATA_URL = '/caregaps/data/pregnancy/latest'; // Flask route resolves this to the newest dated pregnancy snapshot

let REPORT = null;
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name
let currentTrimester = 'all';       // 'all' | '1st' | '2nd' | '3rd'
let table = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireProviderSelect();
  wireTrimesterToggle();
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Pregnancy dashboard: failed to load', DATA_URL, err);
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
    `Check that the snapshot file exists and the path in Pregnancy.js is correct.</span>`;
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
// Trimester toggle (patient-detail-only filter -- does NOT affect the
// clinic summary stat card above, matching Asthma's age-toggle convention)
// --------------------------------------------------------------------------

function wireTrimesterToggle() {
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTrimester = btn.dataset.trimester;
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
// Summary rendering (single stat card only -- confirmed design, no
// secondary breakdown cards). Shared between clinic and provider views --
// just points at a different summary object depending on currentProvider.
// Trimester does NOT affect this section at all, matching Asthma's
// age-bucket convention (patient-detail-only dimension).
// --------------------------------------------------------------------------

function activeSummary() {
  if (currentProvider !== '__clinic__') {
    return REPORT.provider_breakdown[currentProvider] || emptySummary();
  }
  return REPORT.clinic_summary;
}

function emptySummary() {
  return {
    total_pregnant_patients: 0,
  };
}

function renderSummary() {
  const summary = activeSummary();
  document.getElementById('statTotal').textContent = summary.total_pregnant_patients ?? 0;
}

// --------------------------------------------------------------------------
// Tabulator patient detail
// Shows every column from the source Excel (per confirmed design: "all"
// columns visible) plus the Clarity-derived PCP field. Field names here
// match PregnancyList.py's EXPECTED_COLUMNS / build_patient_detail() keys
// exactly, since patient_detail rows are serialized straight from that
// column list -- if a column is renamed there, it must be renamed here too.
// --------------------------------------------------------------------------

function buildTable() {
  table = new Tabulator('#patientTable', {
    data: REPORT.patient_detail || [],
    layout: 'fitDataFill',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: 'No patients match the current view',
    initialSort: [{ column: 'Name', dir: 'asc' }],
    columns: [
      { title: 'Patient', field: 'Name', minWidth: 160, headerFilter: 'input' },
      { title: 'MRN', field: 'MRN', width: 110 },
      { title: 'Date of Birth', field: 'Date of Birth', width: 120, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Age at Test', field: 'Age at Test', width: 100, sorter: 'number' },
      { title: 'Ethnicity', field: 'Ethnicity', width: 130 },
      { title: 'Race', field: 'Race', width: 130 },
      { title: 'Test', field: 'Test', width: 110 },
      { title: 'Order Date', field: 'Order Date', width: 120, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Result Date', field: 'Result Date', width: 120, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Result', field: 'Result', width: 100 },
      { title: 'Outcome', field: 'Outcome', width: 110 },
      { title: 'OBGYN Care', field: 'OBGYN Care', width: 120 },
      { title: 'Initial Visit', field: 'Initial Visit', width: 120 },
      { title: 'Trimester', field: 'Trimester', width: 100 },
      { title: 'Delivery Date', field: 'Delivery Date', width: 120, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Weight', field: 'Weight', width: 100 },
      { title: 'Weight B', field: 'Weight B', width: 100 },
      { title: 'PPFU Date', field: 'ppfu date', width: 120, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'PCP', field: 'PCP', width: 160 },
    ],
  });

  // Tabulator initializes asynchronously -- the constructor returns before
  // the table is ready, so calling filter methods immediately can hit it
  // mid-setup. Wait for tableBuilt before touching filters.
  table.on('tableBuilt', () => {
    applyTableFilter();
  });
}

// --------------------------------------------------------------------------
// Combined filtering: provider (dropdown) AND trimester (toggle) apply
// together, plus the quick-filter text search -- all three compose as a
// single filter array so none of them silently overwrite each other.
//
// Trimester values in the source Excel are manually entered (confirmed:
// "1st"/"2nd"/"3rd") -- normalize with a case-insensitive/trimmed compare
// so a stray typo in casing or whitespace doesn't silently exclude a
// patient from the filtered view.
// --------------------------------------------------------------------------

function buildActiveFilters(quickFilterValue) {
  const filters = [];

  if (currentProvider !== '__clinic__') {
    filters.push({ field: 'PCP', type: '=', value: currentProvider });
  }
  if (currentTrimester !== 'all') {
    filters.push({
      field: 'Trimester',
      type: (value) => String(value ?? '').trim().toLowerCase() === currentTrimester.toLowerCase(),
    });
  }
  if (quickFilterValue) {
    // OR-group across name/MRN, ANDed with the filters above
    filters.push([
      { field: 'Name', type: 'like', value: quickFilterValue },
      { field: 'MRN', type: 'like', value: quickFilterValue },
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
    const trimesterScope = currentTrimester !== 'all' ? `_${currentTrimester}` : '';
    table.download('csv', `pregnancy_care_gaps${providerScope}${trimesterScope}.csv`);
  });
}