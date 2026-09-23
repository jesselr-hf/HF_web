/* ==========================================================================
   Flu Tracker
   Fetches the flutracker JSON snapshot and renders:
     - a multi-line chart, one line per flu season, aligned by week number
       since Aug 1 (so seasons on different calendar dates compare directly)
     - current-season stat cards (total, peak week, provider count, season label)
     - current-season weekly and provider detail tables beneath the chart
   ========================================================================== */

const DATA_URL = '/flutracker/data/latest';

// One color per season slot (oldest -> newest). If a 4th prior season is
// ever added to the SQL trend window, extend this list.
const SEASON_COLORS = ['#94a3b8', '#2563eb', '#c0392b'];

let REPORT = null;
let chartInstance = null;
let massDphChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Flu Tracker: failed to load', DATA_URL, err);
    renderLoadError(err);
    return;
  }

  document.getElementById('dataAsOf').textContent =
    'Data as of ' + formatDateTime(REPORT.generated_at);

  const nameEl = document.getElementById('userName');
  if (nameEl.textContent.trim() === '__USERNAME__') {
    nameEl.textContent = 'Guest';
  }

  // Each render function runs independently — if the chart library fails
  // to load (e.g. CDN blocked or slow on a restrictive network) or the
  // chart itself throws, the stat cards and tables still render from the
  // same JSON. A dashboard that goes fully blank because of one optional
  // visual is worse than one that degrades gracefully.
  try {
    renderChart(REPORT.trend);
  } catch (err) {
    console.error('Flu Tracker: chart failed to render', err);
    renderChartError();
  }

  try {
    renderMassDphChart(REPORT.mass_dph);
  } catch (err) {
    console.error('Flu Tracker: Mass DPH chart failed to render', err);
    renderMassDphChartError();
  }

  try { renderStatCards(REPORT.current_season); } catch (err) { console.error('Flu Tracker: stat cards failed', err); }
  try { renderMassDphStatus(REPORT.mass_dph); } catch (err) { console.error('Flu Tracker: Mass DPH status failed', err); }
  try { renderVaccinePanel(REPORT.employee_vaccine); } catch (err) { console.error('Flu Tracker: vaccine panel failed', err); }
  try { renderWeeklyTable(REPORT.current_season); } catch (err) { console.error('Flu Tracker: weekly table failed', err); }
  try { renderProviderTable(REPORT.current_season); } catch (err) { console.error('Flu Tracker: provider table failed', err); }

  if (window.lucide) lucide.createIcons();
}

function renderLoadError(err) {
  const content = document.querySelector('.content');
  const banner = document.createElement('div');
  banner.style.background = '#fde3e3';
  banner.style.border = '1px solid #c0392b';
  banner.style.borderRadius = '8px';
  banner.style.padding = '14px 18px';
  banner.style.marginBottom = '18px';
  banner.style.color = '#c0392b';
  banner.style.fontSize = '13px';
  banner.textContent = `Could not load ${DATA_URL}: ${err.message}. Check that a flutracker_*.json snapshot exists in the Data directory.`;
  content.insertBefore(banner, content.firstChild);
}

function formatDateTime(ts) {
  if (!ts) return '—';
  // generated_at from FluTracker.py is "YYYY-MM-DD HH:MM:SS", not ISO —
  // replace the space with "T" so Date() parses it reliably cross-browser.
  const d = new Date(ts.replace(' ', 'T'));
  if (isNaN(d)) return ts;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// --------------------------------------------------------------------------
// Trend chart
// --------------------------------------------------------------------------

function renderChartError() {
  const wrap = document.querySelector('.chart-wrap');
  if (wrap) {
    wrap.innerHTML = '<p style="color:#64748a; font-size:13px; padding:20px 0;">' +
      'Chart could not be displayed. The rest of the page is still showing current data.</p>';
  }
}

function renderChart(trend) {
  if (typeof Chart === 'undefined') {
    throw new Error('Chart.js did not load');
  }

  const seasons = (trend && trend.seasons) || [];
  const canvas = document.getElementById('trendChart');
  if (!canvas || seasons.length === 0) return;

  // Chart is restricted to Sep 1 - May 31 (the meaningful flu-activity
  // window) even though the underlying season data runs the full Aug 1 -
  // Jul 31 year. Jun/Jul/Aug are consistently near-zero across all three
  // seasons and were flattening the whole chart, making the actual winter
  // peaks unreadable. This ONLY affects what the chart displays — the
  // weekly/provider tables and vaccine panel still use the full data as
  // returned by the JSON.
  //
  // Filtering is done by each week's actual week_ending month/day (not by
  // a hardcoded week-number range) so this stays correct even if the
  // week-alignment logic in FluTracker.py's build_season_weekly_trend()
  // ever changes.
  function inChartWindow(weekEndingStr) {
    const d = new Date(weekEndingStr + 'T00:00:00');
    const month = d.getMonth() + 1; // 1-12
    // Sep(9) through Dec(12), or Jan(1) through May(5)
    return month >= 9 || month <= 5;
  }

  const filteredSeasons = seasons.map(season => ({
    ...season,
    weeks: season.weeks.filter(w => inChartWindow(w.week_ending)),
  }));

  // x-axis labels come from the actual week_ending dates of whichever
  // season has the most in-window weeks, so labels read as real dates
  // rather than a Wk-N count that no longer starts at week 1.
  const referenceSeason = filteredSeasons.reduce(
    (longest, s) => (s.weeks.length > (longest ? longest.weeks.length : -1) ? s : longest),
    null
  );
  const labels = referenceSeason
    ? referenceSeason.weeks.map(w => formatDate(w.week_ending))
    : [];

  const datasets = filteredSeasons.map((season, idx) => ({
    label: season.label,
    data: season.weeks.map(w => w.count),
    borderColor: SEASON_COLORS[idx % SEASON_COLORS.length],
    backgroundColor: SEASON_COLORS[idx % SEASON_COLORS.length],
    borderWidth: idx === filteredSeasons.length - 1 ? 3 : 2, // emphasize current season
    pointRadius: 2,
    tension: 0.25,
    spanGaps: false,
  }));

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const i = items[0].dataIndex;
              const dsIndex = items[0].datasetIndex;
              const week = filteredSeasons[dsIndex] && filteredSeasons[dsIndex].weeks[i];
              return week ? `Week ending ${formatDate(week.week_ending)}` : items[0].label;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Week Ending (Sep \u2013 May)' },
          ticks: { maxRotation: 60, minRotation: 45, autoSkip: true, maxTicksLimit: 20 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'New Flu Diagnoses' },
          ticks: { precision: 0 },
        },
      },
    },
  });
}

// --------------------------------------------------------------------------
// Mass DPH statewide ILI% trend chart
// --------------------------------------------------------------------------
// Kept as its own chart, not merged onto the diagnosis-count chart above:
// different units (percent vs. count) and a different underlying weekly
// grid (MDPH's weeks run Sunday-start/Saturday-end; the SQL-derived trend
// uses Monday-start/Sunday-end via pandas' W-SUN resample — see
// MassFluData.py's docstring). Forcing both onto one set of week-number
// x-axis labels would silently misalign the two lines by up to several
// days each week. Each chart uses its own real week_ending dates instead.

function renderMassDphChartError() {
  const wrap = document.querySelector('.mass-dph-chart-wrap');
  if (wrap) {
    wrap.innerHTML = '<p style="color:#64748a; font-size:13px; padding:20px 0;">' +
      'Chart could not be displayed. The rest of the page is still showing current data.</p>';
  }
}

function renderMassDphChart(massDph) {
  if (typeof Chart === 'undefined') {
    throw new Error('Chart.js did not load');
  }

  const trend = massDph && massDph.statewide_ili_trend;
  const panel = document.getElementById('massDphChartPanel');
  const canvas = document.getElementById('massDphChart');

  if (!trend || !trend.available || !trend.seasons || trend.seasons.length === 0) {
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';
  if (!canvas) return;

  // Same Sep 1 - May 31 display window as the diagnosis chart, filtered
  // by each week's actual week_ending month (see renderChart() above for
  // the same reasoning — Jun/Jul/Aug ILI% is consistently low and was
  // flattening the chart).
  function inChartWindow(weekEndingStr) {
    const d = new Date(weekEndingStr + 'T00:00:00');
    const month = d.getMonth() + 1;
    return month >= 9 || month <= 5;
  }

  const seasons = trend.seasons;
  const filteredSeasons = seasons.map(season => ({
    ...season,
    weeks: season.weeks.filter(w => inChartWindow(w.week_ending)),
  }));

  const referenceSeason = filteredSeasons.reduce(
    (longest, s) => (s.weeks.length > (longest ? longest.weeks.length : -1) ? s : longest),
    null
  );
  const labels = referenceSeason
    ? referenceSeason.weeks.map(w => formatDate(w.week_ending))
    : [];

  const datasets = filteredSeasons.map((season, idx) => ({
    label: season.label,
    data: season.weeks.map(w => w.value),
    borderColor: SEASON_COLORS[idx % SEASON_COLORS.length],
    backgroundColor: SEASON_COLORS[idx % SEASON_COLORS.length],
    borderWidth: idx === filteredSeasons.length - 1 ? 3 : 2,
    pointRadius: 2,
    tension: 0.25,
    spanGaps: false,
  }));

  if (massDphChartInstance) massDphChartInstance.destroy();

  massDphChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const i = items[0].dataIndex;
              const dsIndex = items[0].datasetIndex;
              const week = filteredSeasons[dsIndex] && filteredSeasons[dsIndex].weeks[i];
              return week ? `Week ending ${formatDate(week.week_ending)}` : items[0].label;
            },
            label: (item) => `${item.dataset.label}: ${item.formattedValue}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Week Ending (Sep \u2013 May)' },
          ticks: { maxRotation: 60, minRotation: 45, autoSkip: true, maxTicksLimit: 20 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: '% of Outpatient Visits (ILI)' },
        },
      },
    },
  });
}

function renderMassDphStatus(massDph) {
  const el = document.getElementById('massDphRegionalStatus');
  if (!el) return;

  const status = massDph && massDph.regional_status;
  if (!status || !status.available) {
    el.textContent = '';
    return;
  }

  el.innerHTML = `Southeast region (MA DPH) activity level: <strong>${escapeHtml(status.activity_level)}</strong> ` +
    `<span class="card-sub">as of week ending ${formatDate(status.week_ending)}</span>`;
}

// --------------------------------------------------------------------------
// Stat cards
// --------------------------------------------------------------------------

function renderStatCards(currentSeason) {
  const grid = document.getElementById('statCards');
  grid.innerHTML = '';

  const weekly = (currentSeason && currentSeason.weekly) || [];
  const daily = (currentSeason && currentSeason.daily) || [];
  const providers = (currentSeason && currentSeason.provider_summary) || [];

  const totalDiagnoses = daily.reduce((sum, d) => sum + d.count, 0);
  const peakWeek = weekly.reduce((max, w) => (w.count > (max ? max.count : -1) ? w : max), null);

  document.getElementById('chartTitle').textContent =
    `HealthFirst Weekly New Flu Diagnoses by Season`;
  document.getElementById('weeklyTableTitle').textContent =
    `Weekly Counts (${(currentSeason && currentSeason.label) || 'Current Season'})`;

  const cards = [
    { label: 'Season', value: (currentSeason && currentSeason.label) || '—' },
    { label: 'Total New Flu Diagnoses (Season to Date)', value: totalDiagnoses.toLocaleString() },
    {
      label: 'Peak Week',
      value: peakWeek ? peakWeek.count.toLocaleString() : '—',
      sub: peakWeek ? `Week ending ${formatDate(peakWeek.week_ending)}` : null,
    },
    { label: 'Providers with Flu Diagnoses', value: providers.length.toLocaleString() },
  ];

  cards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'metric-card';
    el.innerHTML = `
      <div class="card-label">${escapeHtml(c.label)}</div>
      <div class="card-value">${c.value}</div>
      ${c.sub ? `<div class="card-sub">${escapeHtml(c.sub)}</div>` : ''}
    `;
    grid.appendChild(el);
  });
}

// --------------------------------------------------------------------------
// Employee vaccine panel
// --------------------------------------------------------------------------
// TODO: 70% is a placeholder threshold for "low rate" red styling, not an
// HFFCC-specific target — confirm the actual internal goal (if one exists)
// and adjust VACCINE_RATE_LOW_THRESHOLD accordingly, or remove the
// color-coding entirely if no target rate is defined.
const VACCINE_RATE_LOW_THRESHOLD = 70;

function renderVaccinePanel(vaccine) {
  const container = document.getElementById('vaccineContent');
  if (!vaccine || !vaccine.available) {
    container.innerHTML = `<p class="vaccine-unavailable">Employee vaccination data is not currently available.</p>`;
    return;
  }

  const rate = vaccine.vaccination_rate_pct;
  const rateDisplay = rate == null ? '—' : `${rate}%`;
  const rateClass = (rate != null && rate < VACCINE_RATE_LOW_THRESHOLD) ? 'vaccine-rate rate-low' : 'vaccine-rate';

  container.innerHTML = `
    <div class="vaccine-row">
      <div class="${rateClass}">${rateDisplay}</div>
      <div class="vaccine-breakdown">
        <span><strong>${vaccine.vaccinated_count.toLocaleString()}</strong> vaccinated</span>
        
        <span><strong>${vaccine.total_recorded.toLocaleString()}</strong> total recorded</span>
      </div>
    </div>
    <p class="vaccine-unavailable" style="margin-top:10px;">
      Rate reflects employees with a recorded vaccination / total recorded for the vaccination period; employees with no record for the vaccination period are not included.
    </p>
  `;
}

// --------------------------------------------------------------------------
// Weekly / provider tables (current season)
// --------------------------------------------------------------------------

function renderWeeklyTable(currentSeason) {
  const tbody = document.querySelector('#weeklyTable tbody');
  tbody.innerHTML = '';

  const weekly = (currentSeason && currentSeason.weekly) || [];
  // Most recent week first, easier to scan for a manager checking in weekly.
  [...weekly].reverse().forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(w.week_starting)}</td>
      <td>${formatDate(w.week_ending)}</td>
      <td>${w.count.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });

  if (weekly.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">No data for the current season yet.</td></tr>`;
  }
}

function renderProviderTable(currentSeason) {
  const tbody = document.querySelector('#providerTable tbody');
  tbody.innerHTML = '';

  const providers = (currentSeason && currentSeason.provider_summary) || [];
  providers.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.provider)}</td>
      <td>${p.count.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });

  if (providers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2">No data for the current season yet.</td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}