/* ==========================================================================
   Provider Productivity Dashboard -- script.js
   ==========================================================================
   Fetches the latest productivity_YYYY_MM.json snapshot (server resolves
   the exact filename via /productivity/data/latest, mirroring Care Gaps'
   /caregaps/data/<domain>/latest pattern) and renders:
     - department tabs (Medical / Dental / BH)
     - a rate-basis switch (Adjusted / Aspirational) that re-renders the
       already-fetched data in place -- no re-fetch, since the JSON already
       carries both adjusted_pct and aspirational_pct for every period
     - a period switch (Monthly / Quarterly)
     - a department summary card row + a provider detail table

   All percentages come pre-computed from ProviderProductivity.py; this
   file only selects which precomputed field to display and formats it.
   ========================================================================== */

(function () {
  "use strict";

  let productivityData = null;
  let activeDept = "Medical";
  let activeRate = "adjusted"; // "adjusted" | "aspirational"
  let activePeriod = "monthly"; // "monthly" | "quarterly"

  const DEPT_LABELS = {
    Medical: "Medical Productivity",
    Dental: "Dental Productivity",
    BH: "Behavioral Health Productivity",
  };

  function fmtPct(value) {
    if (value === null || value === undefined) return "&mdash;";
    return (value * 100).toFixed(1) + "%";
  }

  function pctClass(value) {
    if (value === null || value === undefined) return "";
    if (value >= 1.0) return "pct-met";
    if (value >= 0.85) return "pct-close";
    return "pct-behind";
  }

  function fmtNum(value) {
    if (value === null || value === undefined) return "&mdash;";
    return Math.round(value).toLocaleString();
  }

  async function loadData() {
    const res = await fetch("data/latest");
    if (!res.ok) {
      throw new Error(`Failed to load productivity data (${res.status})`);
    }
    return res.json();
  }

  function setDataAsOf(payload) {
    const el = document.getElementById("dataAsOf");
    if (el && payload.generated_at) {
      const d = new Date(payload.generated_at);
      el.textContent = "Data as of " + d.toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      });
    }
    const fyEl = document.getElementById("fyLabel");
    if (fyEl && payload.fiscal_year) {
      fyEl.textContent = `Fiscal Year: ${payload.fiscal_year.label} (${payload.fiscal_year.start} to ${payload.fiscal_year.end})`;
    }
  }

  function renderRateModeCaption() {
    const el = document.getElementById("rateModeCaption");
    if (!el) return;
    el.textContent = activeRate === "adjusted"
      ? "Showing productivity vs. adjusted goal"
      : "Showing productivity vs. aspirational goal";
  }

  function renderDeptHeading() {
    const el = document.getElementById("deptHeading");
    if (el) el.textContent = DEPT_LABELS[activeDept] || activeDept;
  }

  function pctField() {
    return activeRate === "adjusted" ? "adjusted_pct" : "aspirational_pct";
  }

  function goalField(provider) {
    return activeRate === "adjusted" ? provider.yearly_goal : provider.aspirational_goal;
  }

  function periodsFor(provider) {
    return activePeriod === "monthly" ? provider.monthly : provider.quarterly;
  }

  function periodLabel(period) {
    return activePeriod === "monthly" ? period.label : period.quarter;
  }

  function renderSummaryCards() {
    const grid = document.getElementById("deptSummaryCards");
    if (!grid || !productivityData) return;

    const dept = productivityData.departments[activeDept];
    if (!dept) {
      grid.innerHTML = "";
      return;
    }

    const summary = dept.monthly_summary || [];
    const latest = summary.length ? summary[summary.length - 1] : null;
    const field = pctField();
    const latestPct = latest ? latest[field] : null;

    const totalProviders = dept.providers.length;
    const activeProviders = dept.providers.filter((p) => p.total_encounters > 0).length;

    const cardClass = latestPct === null
      ? ""
      : latestPct >= 1.0 ? "stat-card--met" : latestPct < 0.85 ? "stat-card--behind" : "";

    grid.innerHTML = `
      <div class="stat-card ${cardClass}">
        <span class="stat-label">Latest Month % of Goal</span>
        <span class="stat-value">${fmtPct(latestPct)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Latest Month Encounters</span>
        <span class="stat-value">${latest ? fmtNum(latest.encounters) : "&mdash;"}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Providers with Activity</span>
        <span class="stat-value">${activeProviders} / ${totalProviders}</span>
      </div>
    `;
  }

  function renderProviderTable() {
    const thead = document.querySelector("#providerTable thead tr");
    const tbody = document.querySelector("#providerTable tbody");
    if (!thead || !tbody || !productivityData) return;

    const dept = productivityData.departments[activeDept];
    if (!dept || !dept.providers.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty-note">No providers found for this department.</td></tr>`;
      return;
    }

    // Build period columns from the first provider that actually has data,
    // falling back to an empty period list if nobody has any yet.
    const sampleProvider = dept.providers.find((p) => periodsFor(p).length > 0);
    const periods = sampleProvider ? periodsFor(sampleProvider) : [];
    const periodKeys = periods.map((p) => (activePeriod === "monthly" ? p.month : p.quarter));

    thead.innerHTML =
      `<th>Provider</th>` +
      periodKeys.map((k, i) => `<th>${periodLabel(periods[i])}</th>`).join("") +
      `<th>Total</th><th>Goal</th><th>% of Goal</th>`;

    const field = pctField();

    tbody.innerHTML = dept.providers.map((provider) => {
      const provPeriods = periodsFor(provider);
      const byKey = {};
      provPeriods.forEach((p) => {
        const key = activePeriod === "monthly" ? p.month : p.quarter;
        byKey[key] = p;
      });

      const periodCells = periodKeys.map((key) => {
        const p = byKey[key];
        const pct = p ? p[field] : null;
        return `<td class="pct-cell ${pctClass(pct)}">${p ? fmtNum(p.encounters) : "&mdash;"}</td>`;
      }).join("");

      // Overall % of goal is total encounters over total goal across all
      // periods shown (not just the latest period), so it reads as
      // cumulative progress rather than a snapshot of the most recent
      // month/quarter alone. Each period's own goal is backed out from its
      // precomputed pct (encounters / pct = that period's goal) rather than
      // recomputing monthly/quarterly goal math client-side, so this stays
      // consistent with whatever proration Python already applied.
      const totalEnc = provPeriods.reduce((s, p) => s + p.encounters, 0);
      const impliedGoal = provPeriods.reduce((s, p) => {
        const pct = p[field];
        return pct ? s + (p.encounters / pct) : s;
      }, 0);
      const overallPct = impliedGoal ? totalEnc / impliedGoal : null;

      return `
        <tr>
          <td class="row-name">${provider.provider}</td>
          ${periodCells}
          <td class="provider-total">${fmtNum(provider.total_encounters)}</td>
          <td class="provider-goal">${fmtNum(goalField(provider))}</td>
          <td class="pct-cell ${pctClass(overallPct)}">${fmtPct(overallPct)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderAll() {
    renderDeptHeading();
    renderRateModeCaption();
    renderSummaryCards();
    renderProviderTable();
  }

  function wireDeptTabs() {
    const tabs = document.querySelectorAll("#deptTabStrip .tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        activeDept = tab.dataset.dept;
        renderAll();
      });
    });
  }

  function wireRateSwitch() {
    const btns = document.querySelectorAll("#rateSwitch .rate-switch-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeRate = btn.dataset.rate;
        renderAll();
      });
    });
  }

  function wirePeriodFilter() {
    const select = document.getElementById("periodFilter");
    if (!select) return;
    select.addEventListener("change", () => {
      activePeriod = select.value;
      renderAll();
    });
  }

  async function init() {
    if (window.lucide) window.lucide.createIcons();

    wireDeptTabs();
    wireRateSwitch();
    wirePeriodFilter();

    try {
      productivityData = await loadData();
      setDataAsOf(productivityData);
      renderAll();
    } catch (err) {
      const tbody = document.querySelector("#providerTable tbody");
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty-note">Could not load productivity data. ${err.message}</td></tr>`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();