const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let DATA = null;
let currentMetric = "calls"; // "calls" | "minutes" — drives the Outsourced/In-House/Combined tables

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

async function loadData() {
  const res = await fetch("data/latest");
  if (!res.ok) throw new Error(`Failed to load language report data (${res.status})`);
  return res.json();
}

function renderHeader(data) {
  document.getElementById("report-title").textContent = data.report + " — " + data.year;
  document.getElementById("report-subtitle").textContent =
    "Updated " + new Date(data.generated_at).toLocaleString("en-US", {
      dateStyle: "medium", timeStyle: "short"
    });
}

// --- Encounters table (Primary Language Count by Encounter) -----------

function renderEncountersTable(records) {
  const table = document.getElementById("table-encounters");
  const monthsWithData = MONTHS.filter(m => records.some(r => r.months[m] > 0));
  const cols = monthsWithData.length ? monthsWithData : MONTHS;

  const thead = `<thead><tr>
      <th>Pref Language</th>
      ${cols.map(m => `<th>${m}</th>`).join("")}
      <th>Total</th>
    </tr></thead>`;

  const totals = {};
  cols.forEach(m => totals[m] = 0);
  let grandTotal = 0;

  const rows = records.map(r => {
    cols.forEach(m => totals[m] += r.months[m] || 0);
    grandTotal += r.total;
    return `<tr>
      <td>${r.language}</td>
      ${cols.map(m => `<td>${fmt(r.months[m])}</td>`).join("")}
      <td><strong>${fmt(r.total)}</strong></td>
    </tr>`;
  }).join("");

  const tfoot = `<tfoot><tr>
      <td>Total</td>
      ${cols.map(m => `<td>${fmt(totals[m])}</td>`).join("")}
      <td>${fmt(grandTotal)}</td>
    </tr></tfoot>`;

  table.innerHTML = thead + `<tbody>${rows}</tbody>` + tfoot;
}

function populateDepartmentSelect(data) {
  const select = document.getElementById("department-select");
  select.innerHTML = `<option value="__all__">All Departments</option>` +
    data.encounters.departments.map(d => `<option value="${d}">${d}</option>`).join("");
  select.addEventListener("change", () => {
    const val = select.value;
    const records = val === "__all__"
      ? data.encounters.overall
      : data.encounters.by_department[val] || [];
    renderEncountersTable(records);
  });
}

// --- Calls/Minutes tables (Outsourced / In House / Combined) ----------

function renderMetricTable(elementId, records, metric) {
  const table = document.getElementById(elementId);
  const monthsWithData = MONTHS.filter(m => records.some(r => r.months[m][metric] > 0));
  const cols = monthsWithData.length ? monthsWithData : MONTHS;
  const totalKey = metric === "calls" ? "total_calls" : "total_minutes";

  const thead = `<thead><tr>
      <th>Language</th>
      ${cols.map(m => `<th>${m}</th>`).join("")}
      <th>Total</th>
    </tr></thead>`;

  const totals = {};
  cols.forEach(m => totals[m] = 0);
  let grandTotal = 0;

  const rows = records.map(r => {
    cols.forEach(m => totals[m] += r.months[m][metric] || 0);
    grandTotal += r[totalKey];
    return `<tr>
      <td>${r.language}</td>
      ${cols.map(m => `<td>${fmt(r.months[m][metric])}</td>`).join("")}
      <td><strong>${fmt(r[totalKey])}</strong></td>
    </tr>`;
  }).join("");

  const tfoot = `<tfoot><tr>
      <td>Total</td>
      ${cols.map(m => `<td>${fmt(totals[m])}</td>`).join("")}
      <td>${fmt(grandTotal)}</td>
    </tr></tfoot>`;

  table.innerHTML = thead + `<tbody>${rows}</tbody>` + tfoot;
}

function renderAllMetricTables() {
  renderMetricTable("table-outsourced", DATA.outsourced, currentMetric);
  renderMetricTable("table-inhouse", DATA.in_house, currentMetric);
  renderMetricTable("table-combined", DATA.combined, currentMetric);
  renderChart(DATA.combined, currentMetric);
}

// --- Simple horizontal bar chart (top languages by total) -------------

function renderChart(records, metric) {
  const totalKey = metric === "calls" ? "total_calls" : "total_minutes";
  const top = [...records].sort((a, b) => b[totalKey] - a[totalKey]).slice(0, 10);
  const max = top.length ? top[0][totalKey] : 1;

  const container = document.getElementById("chart-combined");
  container.innerHTML = top.map(r => {
    const pct = max > 0 ? Math.round((r[totalKey] / max) * 100) : 0;
    return `<div class="bar-row">
        <div>${r.language}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-value">${fmt(r[totalKey])}</div>
      </div>`;
  }).join("");
}

// --- Toggle wiring ------------------------------------------------------

function wireToggle() {
  const buttons = document.querySelectorAll("#metric-toggle .toggle-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMetric = btn.dataset.metric;
      renderAllMetricTables();
    });
  });
}

// --- Init -----------------------------------------------------------

async function init() {
  try {
    DATA = await loadData();
  } catch (err) {
    document.querySelector(".page").innerHTML =
      `<p style="padding:40px;color:#b3261e;">Could not load language report data. ${err.message}</p>`;
    return;
  }
  renderHeader(DATA);
  populateDepartmentSelect(DATA);
  renderEncountersTable(DATA.encounters.overall);
  wireToggle();
  renderAllMetricTables();
}

document.addEventListener("DOMContentLoaded", init);