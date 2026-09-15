"""
UDSFiscalYear.py
---------------------------------------------------------------------------
Reads the monthly uds_YYYY_MM.json snapshots (written alongside
uds_quality_measures.json by UDSQualityMeasures.py, in the sibling
data/ directory) and assembles a fiscal-year (7/1 - 6/30) provider-level
average per measure.

This is PROVIDER-ONLY. Clinic-wide numbers are not aggregated here.

For each provider and measure, the FY value is the mean of that
provider's monthly snapshot percentage across all qualifying months
in the fiscal year. A month is excluded from the average ("skipped")
if its value differs from the prior qualifying month's value by more
than a 25% relative change:

    abs(current - previous) / previous > 0.25

Rules (confirmed with Jesse):
  - July (the first month of the FY) is always included unconditionally
    - there is no prior month within the FY to compare against.
  - The variance chain compares each month against the last
    QUALIFYING month, not simply the immediately preceding calendar
    month, so a skipped month doesn't get used as the baseline for
    the next comparison.
  - A null percentage (0 denominator that month) is treated as 0 for
    both the variance check and, if it survives that check, the
    average itself.
  - A provider missing entirely from a given month's snapshot (e.g.
    not yet on staff) simply has no data point for that month; it is
    excluded from the average and does not participate in the
    variance chain.
  - Snapshot provider entries are NOT split by year (see
    UDSQualityMeasures.py build_json(): providers[name] = {"year":
    <int>, "measures": {...}}), so no cross-year renormalizing is
    needed - each month's provider percentage is used as-is,
    regardless of which side of the Jan 1 UDS reset it falls on.
"""

import json
import glob
import os
from pathlib import Path
from datetime import date

HERE = Path(__file__).parent.resolve()


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SNAPSHOT_DIR = HERE / "data"
SNAPSHOT_GLOB = str(SNAPSHOT_DIR / "uds_*_*.json")

OUTPUT_FILE = SNAPSHOT_DIR / "uds_fiscal_year.json"

VARIANCE_THRESHOLD = 0.25  # relative change; > this fraction skips the month


# ---------------------------------------------------------------------------
# Fiscal year helpers
# ---------------------------------------------------------------------------

def fiscal_year_for(year: int, month: int) -> int:
    """
    FY label = the calendar year in which the fiscal year ENDS.
    July 2026 - June 2027 = FY2027.
    """
    if month >= 7:
        return year + 1
    return year


def fiscal_year_months(fy: int):
    """
    Ordered list of (year, month) tuples for fiscal year `fy`,
    from July of fy-1 through June of fy, in chronological order.
    """
    months = []

    for month in range(7, 13):
        months.append((fy - 1, month))

    for month in range(1, 7):
        months.append((fy, month))

    return months


def parse_snapshot_filename(path: str):
    """
    Parse 'uds_YYYY_MM.json' -> (year, month), or None if it doesn't match.
    """
    name = os.path.basename(path)

    if not name.startswith("uds_") or not name.endswith(".json"):
        return None

    stem = name[len("uds_"):-len(".json")]
    parts = stem.split("_")

    if len(parts) != 2:
        return None

    try:
        year = int(parts[0])
        month = int(parts[1])
    except ValueError:
        return None

    return year, month


# ---------------------------------------------------------------------------
# Snapshot loading
# ---------------------------------------------------------------------------

def load_snapshots() -> dict:
    """
    Load every uds_YYYY_MM.json snapshot on disk.

    Returns { (year, month): snapshot_dict, ... }
    """
    snapshots = {}

    for path in glob.glob(SNAPSHOT_GLOB):
        parsed = parse_snapshot_filename(path)

        if parsed is None:
            continue

        year, month = parsed

        with open(path, "r", encoding="utf-8") as f:
            try:
                snapshots[(year, month)] = json.load(f)
            except json.JSONDecodeError:
                print(f"WARNING: could not parse snapshot {path}, skipping")
                continue

    return snapshots


# ---------------------------------------------------------------------------
# Variance-filtered averaging
# ---------------------------------------------------------------------------

def qualifying_values(monthly_values: list) -> list:
    """
    Given monthly_values as an ordered (chronological) list of raw
    percentages for one provider/measure across the fiscal year
    (None where the provider had no data that month), apply the
    variance skip rule and return the list of QUALIFYING values
    (nulls treated as 0, skipped months dropped entirely).

    - First available month in the FY: always included unconditionally.
    - Each subsequent month is compared against the last QUALIFYING
      value (not simply the prior calendar month). If
      abs(current - previous) / previous > VARIANCE_THRESHOLD, the
      month is skipped (excluded from the returned list and from the
      variance chain going forward).
    - None (missing/0-denominator) is treated as 0 for the variance
      check and, if it survives, as a 0 in the qualifying list.
    - A provider with NO snapshot entry that month (as opposed to an
      entry with a null Percentage) is not part of monthly_values at
      all - the caller only includes months where the provider
      appeared in that month's snapshot.
    """
    qualifying = []
    previous = None

    for raw_value in monthly_values:
        value = 0.0 if raw_value is None else float(raw_value)

        if previous is None:
            # First qualifying month in the FY - always included.
            qualifying.append(value)
            previous = value
            continue

        if previous == 0:
            # Avoid divide-by-zero; any move off of a true 0 baseline
            # is treated as qualifying rather than an undefined ratio.
            relative_change = 0.0 if value == 0 else float("inf")
        else:
            relative_change = abs(value - previous) / abs(previous)

        if relative_change > VARIANCE_THRESHOLD:
            # Skipped: excluded from the average, and does NOT become
            # the new baseline for the next comparison.
            continue

        qualifying.append(value)
        previous = value

    return qualifying


# ---------------------------------------------------------------------------
# Build FY data
# ---------------------------------------------------------------------------

def build_fiscal_year(fy: int, snapshots: dict) -> dict:
    """
    Build the provider-level FY average structure for fiscal year `fy`.

    Returns:
        {
            "<provider_name>": {
                "name": "<provider_name>",
                "fiscal_year": fy,
                "measures": {
                    "<measure_title>": {
                        "average": <float or None>,
                        "months_included": <int>,
                        "months_available": <int>
                    },
                    ...
                }
            },
            ...
        }
    """
    ordered_months = fiscal_year_months(fy)

    # Collect every provider name seen in any month of this FY.
    provider_names = set()

    for key in ordered_months:
        snapshot = snapshots.get(key)

        if not snapshot:
            continue

        provider_names.update(snapshot.get("providers", {}).keys())

    # Collect every measure name seen across those providers/months,
    # so a measure missing in some months still gets a consistent key.
    measure_names = set()

    for key in ordered_months:
        snapshot = snapshots.get(key)

        if not snapshot:
            continue

        for provider_entry in snapshot.get("providers", {}).values():
            measure_names.update(provider_entry.get("measures", {}).keys())

    providers_out = {}

    for provider_name in sorted(provider_names):

        measures_out = {}

        for measure_name in sorted(measure_names):

            # Build the chronological list of this provider's monthly
            # values for this measure, across months where the
            # provider actually appears in that month's snapshot.
            monthly_values = []

            for key in ordered_months:
                snapshot = snapshots.get(key)

                if not snapshot:
                    continue

                provider_entry = snapshot.get("providers", {}).get(provider_name)

                if provider_entry is None:
                    # Provider wasn't in this month's snapshot at all -
                    # no data point, not even a null one.
                    continue

                measures = provider_entry.get("measures", {})

                if measure_name not in measures:
                    continue

                monthly_values.append(measures[measure_name])

            qualifying = qualifying_values(monthly_values)

            if qualifying:
                average = round(sum(qualifying) / len(qualifying), 2)
            else:
                average = None

            measures_out[measure_name] = {
                "average": average,
                "months_included": len(qualifying),
                "months_available": len(monthly_values)
            }

        providers_out[provider_name] = {
            "name": provider_name,
            "fiscal_year": fy,
            "measures": measures_out
        }

    return providers_out


# ---------------------------------------------------------------------------
# Main build entrypoint
# ---------------------------------------------------------------------------

def build(snapshot_dir=None):
    """
    Assembles the FY payload and writes it to
    {snapshot_dir}/uds_fiscal_year.json.

    snapshot_dir defaults to this module's own data/ directory (the
    same folder uds_quality_measures.json and the monthly uds_YYYY_MM.json
    snapshots already live in), but can be overridden for standalone
    testing against a different directory.
    """
    global SNAPSHOT_DIR, SNAPSHOT_GLOB, OUTPUT_FILE

    if snapshot_dir is not None:
        SNAPSHOT_DIR = Path(snapshot_dir)
        SNAPSHOT_GLOB = str(SNAPSHOT_DIR / "uds_*_*.json")
        OUTPUT_FILE = SNAPSHOT_DIR / "uds_fiscal_year.json"

    today = date.today()
    current_fy = fiscal_year_for(today.year, today.month)

    snapshots = load_snapshots()

    print(f"Loaded {len(snapshots)} monthly snapshots")

    # Build every fiscal year for which we have at least one snapshot,
    # so re-running this later naturally picks up FY2028, FY2029, etc.
    # without code changes.
    fiscal_years = sorted({
        fiscal_year_for(year, month)
        for (year, month) in snapshots.keys()
    })

    if not fiscal_years:
        print("WARNING: no snapshots found; nothing to aggregate.")
        fiscal_years = [current_fy]

    payload = {
        "updated": today.isoformat(),
        "current_fiscal_year": current_fy,
        "variance_threshold": VARIANCE_THRESHOLD,
        "fiscal_years": {}
    }

    for fy in fiscal_years:
        providers = build_fiscal_year(fy, snapshots)
        payload["fiscal_years"][str(fy)] = providers

        print(f"FY{fy}: {len(providers)} providers")

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"FY snapshot written: {OUTPUT_FILE}")
    return payload


if __name__ == "__main__":
    build()