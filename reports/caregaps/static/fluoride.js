/* ==========================================================================
   Fluoride Applications dashboard
   Fetches the monthly operational-activity snapshot JSON (produced by
   OperationalActivity.py) and renders the fluoride metric section:
     - Stat row: total applications this month + distinct employee count
     - Employee-level Tabulator table (one row per employee, summed count)
     - Daily-detail Tabulator table (one row per employee per day, as
       returned by FluorideApplications.sql / _run_and_rollup())

   Unlike Asthma.js, there is no provider/age-bucket scoping here --
   confirmed design: column-filterable Tabulator tables only, no dropdown.

   Data source: OperationalActivity.py writes ONE snapshot file
   (operational_activity_YYYY_MM.json) containing BOTH the fluoride and
   chw metrics nested under payload.metrics -- this page only reads
   payload.metrics.fluoride. See OperationalActivity.py's module
   docstring and chw_visits.js (same snapshot, payload.metrics.chw).
   ========================================================================== */

const DATA_URL = '/caregaps/data/operational_activity/latest'; // Flask route resolves this to the newest dated operational_activity snapshot

let REPORT = null;
let METRIC = null; // REPORT.metrics.fluoride
let employeeTable = null;
let detailTable = null;

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
    console.error('Fluoride dashboard: failed to load', DATA_URL, err);
    renderLoadError(err);
    return;
  }

  METRIC = (REPORT.metrics && REPORT.metrics.fluoride) || null;
  if (!METRIC) {
    renderLoadError(new Error('operational_activity snapshot has no metrics.fluoride section'));
    return;
  }

  renderGeneratedAt();
  renderSummary();
  buildEmployeeTable();
  buildDetailTable();
}

function renderLoadError(err) {
  document.getElementById('generatedAt').textContent = 'Failed to load data';
  const main = document.querySelector('main');
  const banner = document.createElement('div');
  banner.className = 'stat-card stat-card--warn';
  banner.style.marginBottom = '16px';
  banner.innerHTML = `<span class="stat-label">Could not load ${DATA_URL}: ${err.message}. ` +
    `Check that the snapshot file exists and the path in fluoride.js is correct.</span>`;
  main.insertBefore(banner, main.firstChild);
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
// Summary stat row
// --------------------------------------------------------------------------

function renderSummary() {
  document.getElementById('statTotal').textContent = METRIC.total_count ?? 0;
  const employeeCount = METRIC.by_employee ? Object.keys(METRIC.by_employee).length : 0;
  document.getElementById('statEmployees').textContent = employeeCount;
}

// --------------------------------------------------------------------------
// Employee-level table (one row per employee, from METRIC.by_employee)
// --------------------------------------------------------------------------

function buildEmployeeTable() {
  const rows = Object.entries(METRIC.by_employee || {}).map(([name, count]) => ({
    employee_name: name,
    count,
  }));

  employeeTable = new Tabulator('#employeeTable', {
    data: rows,
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: 'No employees match the current filter',
    initialSort: [{ column: 'count', dir: 'desc' }],
    columns: [
      { title: 'Employee', field: 'employee_name', minWidth: 200, headerFilter: 'input' },
      { title: 'Applications this month', field: 'count', width: 180, sorter: 'number' },
    ],
  });
}

// --------------------------------------------------------------------------
// Daily-detail table (one row per employee per day, from METRIC.detail)
// --------------------------------------------------------------------------

function buildDetailTable() {
  detailTable = new Tabulator('#detailTable', {
    data: METRIC.detail || [],
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: 'No detail rows match the current filter',
    initialSort: [{ column: 'contact_date', dir: 'desc' }],
    columns: [
      { title: 'Employee', field: 'employee_name', minWidth: 200, headerFilter: 'input' },
      { title: 'Date', field: 'contact_date', width: 130, sorter: 'date', sorterParams: { format: 'yyyy-MM-dd' } },
      { title: 'Count', field: 'count', width: 100, sorter: 'number' },
    ],
  });
}

// --------------------------------------------------------------------------
// Detail section controls (quick filters, CSV export)
// --------------------------------------------------------------------------

function wireDetailControls() {
  document.getElementById('quickFilter').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (!employeeTable) return;
    if (!value) { employeeTable.clearFilter(); return; }
    employeeTable.setFilter('employee_name', 'like', value);
  });

  document.getElementById('quickFilterDetail').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (!detailTable) return;
    if (!value) { detailTable.clearFilter(); return; }
    detailTable.setFilter('employee_name', 'like', value);
  });

  document.getElementById('downloadCsv').addEventListener('click', () => {
    if (!employeeTable) return;
    employeeTable.download('csv', 'fluoride_applications_by_employee.csv');
  });
}