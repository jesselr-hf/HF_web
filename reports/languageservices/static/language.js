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
    renderChart(records);
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
  renderStackedChart(DATA.outsourced, DATA.in_house, currentMetric);
}

// --- Simple horizontal bar chart (top languages by encounter share) ---
// Uses Encounters data (same source as the Primary Language table above
// it), NOT interpreter usage -- English has no interpreter records at all
// (it's never routed to Outsourced/In-House), so this chart must stay on
// Encounters or English silently disappears despite being the largest
// language. Not driven by the Encounters/Minutes toggle, since encounter
// counts have no "minutes" equivalent; it follows the department filter
// instead, matching the table directly above it.

function renderChart(records) {
  const grandTotal = records.reduce((sum, r) => sum + r.total, 0);
  const top = [...records].sort((a, b) => b.total - a.total).slice(0, 10);
  const maxPct = top.length && grandTotal > 0 ? (top[0].total / grandTotal) * 100 : 0;

  const container = document.getElementById("chart-combined");
  container.innerHTML = top.map(r => {
    const pct = grandTotal > 0 ? (r.total / grandTotal) * 100 : 0;
    // Bar width is relative to the largest share shown, so the biggest bar
    // always fills the row -- the label carries the true percent of all
    // languages combined, not just these 10.
    const widthPct = maxPct > 0 ? (pct / maxPct) * 100 : 0;
    return `<div class="bar-row">
        <div>${r.language}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%"></div></div>
        <div class="bar-value">${pct.toFixed(1)}%<span class="bar-value-sub">${fmt(r.total)}</span></div>
      </div>`;
  }).join("");
}

// --- Stacked vertical bar chart: Outsourced vs In House per language --

function renderStackedChart(outsourced, inHouse, metric) {
  const totalKey = metric === "calls" ? "total_calls" : "total_minutes";
  const unit = metric === "calls" ? "" : " min";

  // Merge by language -- Outsourced and In House don't share an identical
  // language taxonomy (e.g. "Portuguese" vs "Brazilian Portuguese" are
  // tracked separately upstream), so this merges on exact name match only,
  // same as every other table on this page.
  const byLang = new Map();
  outsourced.forEach(r => {
    byLang.set(r.language, { language: r.language, out: r[totalKey], in: 0 });
  });
  inHouse.forEach(r => {
    const existing = byLang.get(r.language);
    if (existing) {
      existing.in = r[totalKey];
    } else {
      byLang.set(r.language, { language: r.language, out: 0, in: r[totalKey] });
    }
  });

  const merged = [...byLang.values()]
    .map(r => ({ ...r, total: r.out + r.in }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const container = document.getElementById("chart-stacked");
  if (!merged.length) {
    container.innerHTML = `<p class="chart-empty">No data available.</p>`;
    return;
  }

  const max = merged[0].total;
  // Round the axis ceiling up to a clean step above the tallest bar.
  const step = niceStep(max);
  const axisMax = Math.ceil(max / step) * step;
  const gridlines = [];
  for (let v = 0; v <= axisMax; v += step) gridlines.push(v);

  const barsHtml = merged.map(r => {
    const outPct = axisMax > 0 ? (r.out / axisMax) * 100 : 0;
    const inPct = axisMax > 0 ? (r.in / axisMax) * 100 : 0;
    return `<div class="stack-col" title="${r.language}: ${fmt(r.out)}${unit} outsourced, ${fmt(r.in)}${unit} in-house">
        <div class="stack-bar">
          <div class="stack-seg stack-seg--in" style="height:${inPct}%"></div>
          <div class="stack-seg stack-seg--out" style="height:${outPct}%"></div>
        </div>
        <div class="stack-label">${r.language}</div>
      </div>`;
  }).join("");

  const axisHtml = gridlines.slice().reverse().map(v => {
    const fromBottomPct = axisMax > 0 ? (v / axisMax) * 100 : 0;
    return `<div class="stack-axis-label" style="bottom:${fromBottomPct}%">${fmt(v)}</div>`;
  }).join("");

  const gridlinesHtml = gridlines.map(v => {
    const fromBottomPct = axisMax > 0 ? (v / axisMax) * 100 : 0;
    return `<div class="stack-gridline" style="bottom:${fromBottomPct}%"></div>`;
  }).join("");

  container.innerHTML = `
    <div class="stack-legend">
      <span class="legend-item"><span class="legend-swatch legend-swatch--out"></span>Outsourced</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch--in"></span>In House</span>
    </div>
    <div class="stack-chart-area">
      <div class="stack-axis">${axisHtml}</div>
      <div class="stack-bars">
        ${gridlinesHtml}
        ${barsHtml}
      </div>
    </div>`;
}

// Picks a round grid step (1/2/5 x a power of ten) for a given max value,
// e.g. max=87000 -> step=20000, so the axis reads 0/20K/40K/60K/80K/100K.
function niceStep(max) {
  if (max <= 0) return 1;
  const roughStep = max / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceNormalized;
  if (normalized < 1.5) niceNormalized = 1;
  else if (normalized < 3) niceNormalized = 2;
  else if (normalized < 7) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
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
  renderChart(DATA.encounters.overall);
  wireToggle();
  renderAllMetricTables();
}

document.addEventListener("DOMContentLoaded", init);