"""
EdinburghScreens.py

Postpartum Grant / Edinburgh Screens Care Gap card.

Unlike the other Care Gap domain modules (Asthma, Diabetes, Obesity, Pregnancy),
this module does NOT query Clarity/CDW directly. The Edinburgh screening data
already exists as the output of the separate ppd.py / ppd_shared.py pipeline,
which writes ppd_data.json into the SAME snapshots/ directory that
OverviewAggregator.py reads from. This module reads that file directly out of
snapshots/, computes a combined YTD screening count, and writes a dated
snapshot (snapshots/edinburgh_screens_YYYY_MM.json) containing just
{'clinic_summary': {'total_edinburgh_screens_ytd': N}} -- no provider_breakdown,
since the grant doesn't need a provider split and ppd_data.json isn't split by
provider.

ppd_data.json has two top-level arrays, "ppd" and "wcc" -- two entirely
different ways of capturing Edinburgh screening data (confirmed: not a
duplicate/rollup of each other). The card's headline number combines both:
YTD("ppd") + YTD("wcc"), summed together into one total.

No Distribution.py / distribute() involved -- ppd_data.json and this module's
own output both live directly in snapshots/, the same directory
OverviewAggregator.py already reads every other domain's snapshot from, so
this module just reads and writes there directly like OverviewAggregator.py
itself does (Path(snapshot_dir) / filename), not like the SQL-backed domain
modules (Obesity.py etc.) which distribute() their output elsewhere first.

Run this AFTER ppd.py has produced a fresh ppd_data.json for the period, and
BEFORE OverviewAggregator.py runs for that period (same ordering constraint
as every other domain module).

Wiring required in OverviewAggregator.py (not done by this file):
  - DOMAIN_READERS['edinburgh_screens'] = _read_edinburgh_screens_snapshot
  - VALUE_EXTRACTORS['edinburgh_screens'] = (_extract_edinburgh_screens_value, True)
  - CARD_FALLBACKS['edinburgh_screens'] value_type changed from 'percent' to 'count'
No SNAPSHOT_FILENAME_OVERRIDES entry needed: 'edinburgh_screens' already
matches this module's own filename prefix.
"""

import json
from datetime import datetime
from pathlib import Path

# Filename ppd.py writes inside snapshots/. Confirm this matches -- if
# ppd.py names it differently, update here.
PPD_DATA_FILENAME = "ppd_data.json"

DOMAIN = "edinburgh_screens"


def _current_year_quarters(as_of: datetime) -> list[str]:
    """Return the quarter labels (e.g. '2026Q1', '2026Q2', '2026Q3') that fall
    in the current calendar year up to and including as_of's quarter."""
    year = as_of.year
    current_q = (as_of.month - 1) // 3 + 1
    return [f"{year}Q{q}" for q in range(1, current_q + 1)]


def _ytd_screening_count(rows: list[dict], as_of: datetime) -> int:
    """Sum 'Total Screenings' across quarters in the current YTD window."""
    ytd_quarters = set(_current_year_quarters(as_of))
    return sum(
        row.get("Total Screenings", 0) or 0
        for row in rows
        if row.get("Quarter") in ytd_quarters
    )


def build(snapshot_dir: str = "snapshots", as_of: datetime | None = None) -> dict:
    """Read ppd_data.json out of snapshot_dir and compute the clinic_summary
    for the Edinburgh Screens card.

    Combines YTD screening counts from BOTH the "ppd" and "wcc" arrays --
    two entirely different ways of capturing Edinburgh screening data, per
    confirmed requirement -- into one total.

    Returns: {'total_edinburgh_screens_ytd': N}

    No provider_breakdown — not needed for the grant and ppd_data.json
    isn't split by provider.
    """
    as_of = as_of or datetime.now()
    ppd_data_path = Path(snapshot_dir) / PPD_DATA_FILENAME

    with open(ppd_data_path, "r") as f:
        data = json.load(f)

    ppd_ytd = _ytd_screening_count(data.get("ppd", []), as_of)
    wcc_ytd = _ytd_screening_count(data.get("wcc", []), as_of)
    combined_ytd = ppd_ytd + wcc_ytd

    return {"total_edinburgh_screens_ytd": combined_ytd}


def _write_snapshot(clinic_summary: dict, snapshot_dir: str, as_of: datetime) -> Path:
    """Writes edinburgh_screens_YYYY_MM.json directly into snapshot_dir,
    same directory ppd_data.json was read from and OverviewAggregator.py
    reads every other domain's snapshot from. No distribute() -- this
    directory IS the shared destination already."""
    snapshot = {
        "run_date": as_of.strftime("%B %d, %Y  %I:%M %p"),
        "clinic_summary": clinic_summary,
    }

    snapshot_dir_path = Path(snapshot_dir)
    snapshot_dir_path.mkdir(parents=True, exist_ok=True)
    filename = f"{DOMAIN}_{as_of.strftime('%Y_%m')}.json"
    out_path = snapshot_dir_path / filename

    with open(out_path, "w") as f:
        json.dump(snapshot, f, indent=2)

    return out_path


def main(snapshot_dir: str = "snapshots"):
    as_of = datetime.now()
    clinic_summary = build(snapshot_dir=snapshot_dir, as_of=as_of)
    out_path = _write_snapshot(clinic_summary, snapshot_dir, as_of)
    print(f"Edinburgh Screens snapshot written: {out_path}")


if __name__ == "__main__":
    main()