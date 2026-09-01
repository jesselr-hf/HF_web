/* ==========================================================================
   Care Gaps Dashboard -- Overview page
   Fetches the clinic-level overview JSON and renders the metric card grid,
   operational activity cards, and trend summary table. Placeholder cards
   (domains not yet built) are visually de-emphasized and their "View
   Details" link is disabled rather than linking to a page that doesn't
   exist yet.
   ========================================================================== */

const DATA_URL = '/caregaps/data/overview/latest'; // Flask route resolves this to the newest dated overview snapshot

// Icon + color chip assignment per card id. Edit here as real domains are
// wired up -- this is the single place mapping metric -> visual identity.
const CARD_VISUALS = {
  under2_no_visit:     { icon: 'baby',            chip: 'chip-purple' },
  diabetes_foot_exam:  { icon: 'footprints',       chip: 'chip-green'  },
  diabetes_eye_exam:   { icon: 'eye',              chip: 'chip-blue'   },
  obesity:             { icon: 'scale',            chip: 'chip-orange' },
  diabetes:            { icon: 'droplet',          chip: 'chip-red'    },
  asthma_patients:     { icon: 'wind',             chip: 'chip-teal'   },
  pregnancy_active:    { icon: 'heart',            chip: 'chip-pink'   },
  edinburgh_screens:   { icon: 'heart-pulse',      chip: 'chip-violet' },
  bh_referrals_ppd:    { icon: 'brain',            chip: 'chip-amber'  },
  bh_kept_first_appt:  { icon: 'calendar-check',   chip: 'chip-emerald'},
  fluoride:            { icon: 'circle-dot',       chip: 'chip-blue'   },
  chw_visits:          { icon: 'users',            chip: 'chip-green'  },
};

let REPORT = null;
let currentProvider = '__clinic__'; // '__clinic__' = clinic-wide, or a real provider name

document.addEventListener('DOMContentLoaded', () => {
  wireControls();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REPORT = await res.json();
  } catch (err) {
    console.error('Dashboard: failed to load', DATA_URL, err);
    renderLoadError(err);
    return;
  }

  document.getElementById('dataAsOf').textContent =
    'Data as of ' + formatDate(REPORT.generated_at);
  // Username is injected server-side (see app.py's caregaps() route, which
  // replaces the placeholder below with the authenticated user -- same
  // pattern as pophealth/budget). This is just a fallback for local dev.
  const nameEl = document.getElementById('userName');
  if (nameEl.textContent.trim() === '__USERNAME__') {
    nameEl.textContent = 'dev-user';
  }

  populateProviderFilter();
  renderAll();

  if (window.lucide) lucide.createIcons();
}

function populateProviderFilter() {
  const select = document.getElementById('providerFilter');
  select.innerHTML = '';

  const clinicOpt = document.createElement('option');
  clinicOpt.value = '__clinic__';
  clinicOpt.textContent = 'All PCPs';
  select.appendChild(clinicOpt);

  const providers = REPORT.providers || [];
  providers.forEach(prov => {
    const opt = document.createElement('option');
    opt.value = prov;
    opt.textContent = prov;
    select.appendChild(opt);
  });

  select.value = currentProvider;
}

function activeCards() {
  if (currentProvider !== '__clinic__') {
    return (REPORT.provider_cards && REPORT.provider_cards[currentProvider]) || REPORT.cards || [];
  }
  return REPORT.cards || [];
}

function renderAll() {
  const cards = activeCards();
  renderCardGrid(cards);
  renderOperationalCards(REPORT.operational_activity || []); // clinic-wide only -- see OverviewAggregator.py note
  renderTrendTable(cards);
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
  banner.textContent = `Could not load ${DATA_URL}: ${err.message}. Check that the overview snapshot file exists and the path in script.js is correct.`;
  content.insertBefore(banner, content.firstChild);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// --------------------------------------------------------------------------
// Metric card grid
// --------------------------------------------------------------------------

function renderCardGrid(cards) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';

  cards.forEach(card => {
    grid.appendChild(buildMetricCard(card));
  });
}

function buildMetricCard(card) {
  const visuals = CARD_VISUALS[card.id] || { icon: 'circle', chip: 'chip-blue' };
  const isPlaceholder = !!card.placeholder;

  const el = document.createElement('div');
  el.className = 'metric-card' + (isPlaceholder ? ' is-placeholder' : '');

  const valueDisplay = card.value_type === 'percent'
    ? `${card.value.toFixed(1)}%`
    : formatCount(card.value);

  const trendUp = card.trend_direction === 'up';
  const trendIcon = trendUp ? 'arrow-up' : 'arrow-down';
  const trendClass = trendUp ? 'trend-up' : 'trend-down';
  const trendText = card.trend_pts != null
    ? `${trendUp ? '+' : ''}${card.trend_pts} pts`
    : `${trendUp ? '+' : ''}${card.trend_pct}%`;

  el.innerHTML = `
    <div class="card-top">
      <div class="card-icon ${visuals.chip}"><i data-lucide="${visuals.icon}"></i></div>
      <div class="card-label">${escapeHtml(card.label)}</div>
    </div>
    <div class="card-value">${valueDisplay}</div>
    <div class="card-trend ${trendClass}">
      <i data-lucide="${trendIcon}"></i>
      <span>${trendText}</span>
      <span class="card-trend-note">(${escapeHtml(card.trend_note || '')})</span>
    </div>
    <div class="card-sparkline">${buildSparkline(card.id, trendUp, card.trend_series)}</div>
    ${isPlaceholder
      ? `<span class="card-link is-disabled">View Details <i data-lucide="arrow-right"></i></span>`
      : `<a class="card-link" href="${card.detail_url}" target="_blank" rel="noopener">View Details <i data-lucide="arrow-right"></i></a>`
    }
  `;
  return el;
}

function formatCount(n) {
  return Number(n).toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --------------------------------------------------------------------------
// Sparklines
// Real per-domain modules supply a `trend_series` array of raw values
// across every snapshot on disk (oldest -> newest, from
// OverviewAggregator.py's _domain_value_history/_trend_from_series). When
// present -- even with as few as 2 points -- that real history is drawn
// instead of a fabricated curve. Only cards with no trend_series at all
// (true placeholders: no domain module built yet) fall back to the old
// seeded-random placeholder curve, so it's visually obvious which cards
// are real vs. still pending.
// --------------------------------------------------------------------------

function buildSparkline(seed, trendUp, trendSeries) {
  const points = (trendSeries && trendSeries.length >= 2)
    ? trendSeries
    : seededSeries(seed, 12, trendUp);
  const w = 260, h = 34, pad = 3;
  const min = Math.min(...points), max = Math.max(...points);
  const range = (max - min) || 1;

  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return [x, y];
  });

  const path = coords.map((c, i) => (i === 0 ? `M${c[0]},${c[1]}` : `L${c[0]},${c[1]}`)).join(' ');
  const color = trendUp ? '#c0392b' : '#1e7a3c';
  const last = coords[coords.length - 1];

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/>
  </svg>`;
}

function seededSeries(seed, count, trendUp) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return (h % 1000) / 1000;
  };
  const series = [];
  let v = 50 + rand() * 20;
  for (let i = 0; i < count; i++) {
    const drift = trendUp ? 1.2 : -1.2;
    v += drift + (rand() - 0.5) * 8;
    series.push(v);
  }
  return series;
}

// --------------------------------------------------------------------------
// Operational activity cards
// --------------------------------------------------------------------------

function renderOperationalCards(items) {
  const container = document.getElementById('opCards');
  container.innerHTML = '';

  items.forEach(item => {
    const visuals = CARD_VISUALS[item.id] || { icon: 'circle', chip: 'chip-blue' };
    const trendUp = item.trend_direction === 'up';
    const trendClass = trendUp ? 'trend-up' : 'trend-down';
    const trendIcon = trendUp ? 'arrow-up' : 'arrow-down';

    const el = document.createElement('div');
    el.className = 'op-card';
    el.innerHTML = `
      <div class="card-icon ${visuals.chip}"><i data-lucide="${visuals.icon}"></i></div>
      <div class="card-label">${escapeHtml(item.label)}</div>
      <div class="op-card-value">${formatCount(item.value)}</div>
      <div class="card-trend ${trendClass}">
        <i data-lucide="${trendIcon}"></i>
        <span>${trendUp ? '+' : ''}${item.trend_pct}%</span>
        <span class="card-trend-note">(${escapeHtml(item.trend_note || '')})</span>
      </div>
      <a class="card-link" href="${item.detail_url}" target="_blank" rel="noopener">View Monthly Breakdown <i data-lucide="arrow-right"></i></a>
    `;
    container.appendChild(el);
  });
}

// --------------------------------------------------------------------------
// Trend summary table
// --------------------------------------------------------------------------

function renderTrendTable(cards) {
  const tbody = document.querySelector('#trendTable tbody');
  tbody.innerHTML = '';

  cards.forEach(card => {
    const trendUp = card.trend_direction === 'up';
    const changeClass = trendUp ? 'change-positive' : 'change-negative';
    const changeVal = card.trend_pts != null
      ? `${trendUp ? '+' : ''}${card.trend_pts} pts`
      : `${trendUp ? '+' : ''}${card.trend_delta != null ? card.trend_delta : Math.round((card.value * card.trend_pct) / 100)}`;
    const changePct = card.trend_pts != null
      ? `${trendUp ? '+' : ''}${card.trend_pct}%`
      : `${trendUp ? '+' : ''}${card.trend_pct}%`;
    const currentVal = card.value_type === 'percent' ? `${card.value.toFixed(1)}%` : formatCount(card.value);

    const isPlaceholder = !!card.placeholder;
    const rowNameContent = isPlaceholder
      ? `${escapeHtml(card.label.replace(/\n/g, ' '))}${card.id === 'edinburgh_screens' ? '*' : ''}`
      : `<a href="${card.detail_url}" target="_blank" rel="noopener">${escapeHtml(card.label.replace(/\n/g, ' '))}${card.id === 'edinburgh_screens' ? '*' : ''}</a>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="row-name">${rowNameContent}</td>
      <td>${currentVal}</td>
      <td class="${changeClass}">${changeVal}</td>
      <td class="${changeClass}">${changePct}</td>
      <td class="sparkline-cell">${buildSparkline(card.id + '_table', trendUp, card.trend_series)}</td>
      <td class="direction-cell"><i data-lucide="${trendUp ? 'trending-up' : 'trending-down'}" class="${trendUp ? 'direction-up' : 'direction-down'}"></i></td>
    `;
    tbody.appendChild(tr);
  });
}

// --------------------------------------------------------------------------
// Filter controls (Apply button)
// --------------------------------------------------------------------------

function wireControls() {
  document.getElementById('applyFilters').addEventListener('click', () => {
    currentProvider = document.getElementById('providerFilter').value;
    const range = document.getElementById('dateRangeFilter').value;
    // TODO: date-range filtering needs its own backend support (the
    // snapshot only covers one period today) -- provider filtering is
    // fully wired via REPORT.provider_cards, computed entirely client-side
    // from data already present in the snapshot, no re-fetch needed.
    if (range !== '12m') {
      console.log('Date range filtering not yet implemented on the backend:', range);
    }
    if (REPORT) renderAll();
  });
}