/* ==========================================================================
   Diabetic Foot Exam Care Gaps dashboard
   Fetches the monthly snapshot JSON (produced by FootExam.py) and renders:
     - Clinic-wide / provider-scoped OVERDUE count and percent (overdue /
       (overdue + complete), Open Referral excluded from both), derived
       from patient_detail
     - Patient-level detail via Tabulator, showing ALL statuses (Complete,
       Open Referral, OVERDUE), filterable by provider AND by status
       simultaneously

   Data source: change DATA_URL to wherever the Flask route serves the
   current snapshot.
   ========================================================================== */

const DATA_URL = '/caregaps/data/footexam/latest'; // Flask route resolves this to the newest dated footexam snapshot

const STATUS_BADGE_CLASS = {
  'OVERDUE': 'badge-overdue',
  'Open Referral': 'badge-open-referral',
  'Complete': 'badge-complete',
};

let REPORT = null;
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name
let currentStatus = 'all';          // 'all' | 'OVERDUE' | 'Open Referral' | 'Complete'
let table = null;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireProviderSelect();
  wireStatusToggle();
  wireDetailControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Foot exam dashboard: failed to load', DATA_URL, err);
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
    `Check that the snapshot file exists and the path in footexam.js is correct.</span>`;
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
// Foot exam status toggle (patient-detail-only filter -- does NOT affect
// the clinic summary overdue-count stat card, per confirmed design: the
// card is always overdue-only regardless of which status tab is selected
// in the detail table below)
// --------------------------------------------------------------------------

function wireStatusToggle() {
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatus = btn.dataset.status;
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
// Summary rendering (overdue count + percent overdue of overdue+complete)
// Shared between clinic and provider views -- overdueAndCompleteCounts()
// filters patient_detail by currentProvider internally.
// --------------------------------------------------------------------------

// Percent = overdue / (overdue + complete), scoped to the current provider
// (or clinic-wide). Both the overdue count and the percent are derived
// from patient_detail so they can never disagree with each other --
// clinic_summary / provider_breakdown are not used here. Open Referral
// patients are excluded from both numerator and denominator per the
// requested formula.
function overdueAndCompleteCounts() {
  const rows = REPORT.patient_detail || [];
  let overdue = 0;
  let complete = 0;
  rows.forEach(row => {
    if (currentProvider !== '__clinic__' && row.pcp_name !== currentProvider) return;
    if (row.foot_exam_status === 'OVERDUE') overdue++;
    else if (row.foot_exam_status === 'Complete') complete++;
  });
  return { overdue, complete };
}

function renderSummary() {
  const { overdue, complete } = overdueAndCompleteCounts();
  const denominator = overdue + complete;
  const pct = denominator > 0 ? (overdue / denominator) * 100 : 0;

  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statOverduePct').textContent = denominator > 0 ? `${pct.toFixed(1)}%` : '—';
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
    initialSort: [{ column: 'foot_exam_status', dir: 'asc' }],
    columns: [
      { title: 'Patient', field: 'pat_name', minWidth: 160, headerFilter: 'input' },
      { title: 'MRN', field: 'mrn', width: 110 },
      { title: 'DM Type', field: 'dm_type', width: 110 },
      { title: 'Status', field: 'foot_exam_status', width: 130, formatter: statusFormatter },
      { title: 'Last exam/referral date', field: 'last_exam_date', width: 160, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
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

function statusFormatter(cell) {
  const val = cell.getValue();
  if (!val) return '—';
  const cls = STATUS_BADGE_CLASS[val] || '';
  return `<span class="badge ${cls}">${val}</span>`;
}

// --------------------------------------------------------------------------
// Combined filtering: provider (dropdown) AND status (toggle) apply
// together, plus the quick-filter text search -- all three compose as a
// single filter array so none of them silently overwrite each other.
// --------------------------------------------------------------------------

function buildActiveFilters(quickFilterValue) {
  const filters = [];

  if (currentProvider !== '__clinic__') {
    filters.push({ field: 'pcp_name', type: '=', value: currentProvider });
  }
  if (currentStatus !== 'all') {
    filters.push({ field: 'foot_exam_status', type: '=', value: currentStatus });
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
    const statusScope = currentStatus !== 'all' ? `_${currentStatus.replace(/\s+/g, '')}` : '';
    table.download('csv', `footexam_care_gaps${providerScope}${statusScope}.csv`);
  });
}