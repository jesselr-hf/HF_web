/* ==========================================================================
   Under Age 2 Without Scheduled Visit dashboard
   Fetches the monthly snapshot JSON (produced by Under24Mos.py) and renders:
     - Clinic-wide summary (gap-count only, no type/category breakdown)
     - Provider-scoped summary (same layout, filtered)
     - Patient-level detail via Tabulator, filterable by provider AND by
       scheduled-visit status (No Appointment / Has Appointment / All)
       simultaneously

   Unlike Diabetes.py, Under24Mos.py's patient_detail includes BOTH gap and
   scheduled patients (tagged has_scheduled_visit) -- clinic_summary and
   provider_breakdown only ever count the gap patients, per that module's
   design. So the visit-status toggle here is a real content filter on the
   Tabulator data, not just a display convenience.

   Data source: change DATA_URL to wherever the Flask route serves the
   current snapshot.
   ========================================================================== */

const DATA_URL = '/caregaps/data/under24mos/latest'; // Flask route resolves this to the newest dated under24mos snapshot

const VISIT_BADGE_CLASS = {
  gap: 'badge-gap',
  scheduled: 'badge-scheduled',
};

let REPORT = null;
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name
let currentVisitFilter = 'gap';     // 'gap' | 'scheduled' | 'all'
let table = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireProviderSelect();
  wireVisitToggle();
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Under2 dashboard: failed to load', DATA_URL, err);
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
    `Check that the snapshot file exists and the path in under2.js is correct.</span>`;
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
// Visit-status toggle (patient-detail-only filter -- clinic_summary and
// provider_breakdown are already gap-count-only from Under24Mos.py itself,
// so this toggle only changes which rows the Tabulator table shows, not
// the stat card above)
// --------------------------------------------------------------------------

function wireVisitToggle() {
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVisitFilter = btn.dataset.visit;
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
// Summary rendering (single stat card -- no category bars, this domain has
// no by-type/by-population breakdown the way Obesity/Diabetes do)
// --------------------------------------------------------------------------

function activeSummary() {
  if (currentProvider !== '__clinic__') {
    return REPORT.provider_breakdown[currentProvider] || emptySummary();
  }
  return REPORT.clinic_summary;
}

function emptySummary() {
  return { total_gap_patients: 0 };
}

function renderSummary() {
  const summary = activeSummary();
  document.getElementById('statGap').textContent = summary.total_gap_patients ?? 0;
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
    initialSort: [{ column: 'next_visit', dir: 'asc' }],
    columns: [
      { title: 'Patient', field: 'pat_name', minWidth: 160, headerFilter: 'input' },
      { title: 'MRN', field: 'mrn', width: 110 },
      { title: 'Status', field: 'has_scheduled_visit', width: 130, formatter: visitStatusFormatter },
      { title: 'DoB', field: 'dob', width: 110, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Age (months)', field: 'age_months', width: 110, sorter: 'number' },
      { title: 'Last visit', field: 'last_visit', width: 130, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Next visit', field: 'next_visit', width: 130, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
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

function visitStatusFormatter(cell) {
  const hasVisit = cell.getValue();
  const label = hasVisit ? 'Scheduled' : 'No Appointment';
  const cls = VISIT_BADGE_CLASS[hasVisit ? 'scheduled' : 'gap'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// --------------------------------------------------------------------------
// Combined filtering: provider (dropdown) AND visit status (toggle) apply
// together, plus the quick-filter text search -- all three compose as a
// single filter array so none of them silently overwrite each other.
// --------------------------------------------------------------------------

function buildActiveFilters(quickFilterValue) {
  const filters = [];

  if (currentProvider !== '__clinic__') {
    filters.push({ field: 'pcp_name', type: '=', value: currentProvider });
  }
  if (currentVisitFilter === 'gap') {
    filters.push({ field: 'has_scheduled_visit', type: '=', value: false });
  } else if (currentVisitFilter === 'scheduled') {
    filters.push({ field: 'has_scheduled_visit', type: '=', value: true });
  }
  // currentVisitFilter === 'all' adds no filter on has_scheduled_visit
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
    const visitScope = currentVisitFilter !== 'all' ? `_${currentVisitFilter}` : '';
    table.download('csv', `under2_care_gaps${providerScope}${visitScope}.csv`);
  });
}