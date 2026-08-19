"""
OverviewAggregator.py
---------------------------------------------------------------------------
Reads each care-gap domain's latest dated snapshot from snapshots/ (i.e.
reports/caregaps/snapshots/, a sibling of static/, NOT under data/) and
assembles the combined clinic-level overview JSON consumed by
caregaps.html / script.js (the summary card grid, operational activity
cards, and trend table).

This module has NO database connection of its own -- it is purely a
reader/aggregator over snapshot files already written by each domain's own
build() function (e.g. Obesity.py). Run this AFTER the domain modules have
run for the current period, not instead of them.

For domains that don't have a real module yet, a hardcoded placeholder
entry is used so the card renders (dimmed, "View Details" disabled) rather
than being omitted from the page entirely. As each domain module ships,
move its id out of PLACEHOLDER_CARDS and into a real reader function like
_read_obesity_snapshot() below.

Output: snapshots/overview_{YYYY}_{MM}.json, following the exact same
naming convention as every other domain snapshot, so the existing
/caregaps/data/<domain>/latest Flask route serves it with no extra code.
"""

import json
from datetime import datetime
from pathlib import Path


# --------------------------------------------------------------------------
# Domain-specific readers
# Each takes a domain's snapshot payload and a summary dict (either
# clinic_summary for the clinic-wide view, or one provider's entry from
# provider_breakdown for a provider-scoped view) and maps it into a card.
# Add one function per domain as it goes live, and register it in
# DOMAIN_READERS.
# --------------------------------------------------------------------------

def _read_obesity_snapshot(payload, summary=None):
    """
    Maps an Obesity.py summary dict (either payload['clinic_summary'] or one
    entry from payload['provider_breakdown']) into a single overview card.
    Excludes the sex-unclassifiable count from the headline number, matching
    the convention that this report tracks confirmed obesity by category --
    the unclassifiable count is visible elsewhere (patient detail) but isn't
    a confirmed obesity case.
    """
    if summary is None:
        summary = payload['clinic_summary']
    total = summary['total_obese_patients'] - summary.get('unclassifiable_sex_count', 0)

    return {
        'id': 'obesity',
        'label': 'Obesity Patients',
        'value': total,
        'value_type': 'count',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pct': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'obesity.html',
        'placeholder': False,
    }


def _read_diabetes_snapshot(payload, summary=None):
    """
    Maps a Diabetes.py summary dict (either payload['clinic_summary'] or one
    entry from payload['provider_breakdown']) into a single overview card.
    Unlike Obesity, Diabetes.py's SQL already guarantees exactly one row
    per patient with a real DM type -- there is no exclusion/unclassifiable
    count to subtract here, total_dm_patients is the full headline number.
    """
    if summary is None:
        summary = payload['clinic_summary']

    return {
        'id': 'diabetes',
        'label': 'Diabetes Patients',
        'value': summary['total_dm_patients'],
        'value_type': 'count',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pct': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'diabetes.html',
        'placeholder': False,
    }


DOMAIN_READERS = {
    'obesity': _read_obesity_snapshot,
    'diabetes': _read_diabetes_snapshot,
    # 'diabetes_foot_exam': _read_diabetes_foot_exam_snapshot,
    # 'diabetes_eye_exam': _read_diabetes_eye_exam_snapshot,
    # ... add as each domain module ships
}


# --------------------------------------------------------------------------
# Placeholder cards for domains without a real module yet
# Mirrors the shape script.js expects; "placeholder": True dims the card
# and disables its "View Details" link client-side.
# --------------------------------------------------------------------------

PLACEHOLDER_CARDS = [
    {'id': 'under2_no_visit', 'label': 'Under Age 2 Without\nScheduled Visit',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'under2.html', 'placeholder': True},
    {'id': 'diabetes_foot_exam', 'label': 'Diabetes Foot Exam\n(Overdue)',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'diabetes_foot_exam.html', 'placeholder': True},
    {'id': 'diabetes_eye_exam', 'label': 'Diabetes Eye Exam\n(Overdue)',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'diabetes_eye_exam.html', 'placeholder': True},
    {'id': 'asthma_patients', 'label': 'Asthma Patients',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'asthma.html', 'placeholder': True},
    {'id': 'pregnancy_active', 'label': 'Pregnancy (Active)',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'pregnancy.html', 'placeholder': True},
    {'id': 'edinburgh_screens', 'label': 'Postpartum Grant\nEdinburgh Screens',
     'value': 0.0, 'value_type': 'percent', 'trend_direction': 'up', 'trend_pts': 0,
     'trend_note': 'not yet available', 'detail_url': 'edinburgh.html', 'placeholder': True},
    {'id': 'bh_referrals_ppd', 'label': 'BH Referrals for PPD/Anxiety/\nMood Disorder',
     'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'bh_referrals.html', 'placeholder': True},
    {'id': 'bh_kept_first_appt', 'label': 'BH Referrals Kept First\nAppointment',
     'value': 0.0, 'value_type': 'percent', 'trend_direction': 'up', 'trend_pts': 0,
     'trend_note': 'not yet available', 'detail_url': 'bh_kept_appt.html', 'placeholder': True},
]

OPERATIONAL_PLACEHOLDER = [
    {'id': 'fluoride', 'label': 'Fluoride Applications\n(by M.A./LPN)',
     'value': 0, 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'fluoride.html'},
    {'id': 'chw_visits', 'label': 'CHW Visits Completed\n(by CHW)',
     'value': 0, 'trend_direction': 'up', 'trend_pct': 0,
     'trend_note': 'not yet available', 'detail_url': 'chw_visits.html'},
]


# --------------------------------------------------------------------------
# Snapshot reading
# --------------------------------------------------------------------------

def _latest_snapshot_path(domain, snapshot_dir):
    """
    Finds the most recent dated snapshot for a domain, e.g. the newest
    obesity_*.json under snapshot_dir. Relies on the same zero-padded
    YYYY_MM naming convention as Obesity.py's build(), which sorts
    correctly as a plain string.
    """
    matches = sorted(Path(snapshot_dir).glob(f"{domain}_*.json"))
    return matches[-1] if matches else None


def _load_domain_card(domain_id, snapshot_dir, provider=None):
    """
    Returns a real card dict if a snapshot exists and a reader is
    registered for this domain, or None if either is missing (caller
    falls back to the placeholder for that domain).

    provider: if given, builds the card from that provider's entry in the
    snapshot's provider_breakdown instead of the clinic-wide summary. If
    the domain's snapshot has no data for that provider (they have zero
    patients there), returns None so the caller can fall back to a
    zeroed-out version of the card rather than crash.
    """
    reader = DOMAIN_READERS.get(domain_id)
    if reader is None:
        return None

    snapshot_path = _latest_snapshot_path(domain_id, snapshot_dir)
    if snapshot_path is None:
        print(f"WARNING: no snapshot found for domain '{domain_id}' "
              f"(expected {domain_id}_*.json in {snapshot_dir}) -- falling back to placeholder")
        return None

    with open(snapshot_path) as f:
        payload = json.load(f)

    if provider is None:
        return reader(payload)

    provider_summary = payload.get('provider_breakdown', {}).get(provider)
    if provider_summary is None:
        return None

    return reader(payload, summary=provider_summary)


def _all_providers(snapshot_dir):
    """
    Union of every provider name appearing in any domain's
    provider_breakdown, across all domains with a real reader registered.
    Sorted for a stable, predictable dropdown order.
    """
    providers = set()
    for domain_id in DOMAIN_READERS:
        snapshot_path = _latest_snapshot_path(domain_id, snapshot_dir)
        if snapshot_path is None:
            continue
        with open(snapshot_path) as f:
            payload = json.load(f)
        providers.update(payload.get('provider_breakdown', {}).keys())
    return sorted(providers)


def _build_cards_for(snapshot_dir, provider=None):
    """
    Builds the full card list (all 10 domain cards, in the same fixed
    order) either clinic-wide (provider=None) or scoped to one provider.
    For a provider view, any domain with zero patients for that provider
    still gets a card -- just showing 0 -- rather than being omitted, so
    the grid layout stays stable when switching providers.
    """
    cards = []

    for placeholder in PLACEHOLDER_CARDS:
        real_card = _load_domain_card(placeholder['id'], snapshot_dir, provider=provider)
        if real_card is not None:
            cards.append(real_card)
        elif provider is not None and placeholder['id'] in DOMAIN_READERS:
            # Real domain, but this provider has zero patients in it --
            # zero out the placeholder's value rather than show stale
            # clinic-wide placeholder data.
            cards.append({**placeholder, 'placeholder': False, 'value': 0})
        else:
            cards.append(placeholder)

    obesity_card = _load_domain_card('obesity', snapshot_dir, provider=provider)
    if obesity_card is None:
        obesity_card = {
            'id': 'obesity', 'label': 'Obesity Patients', 'value': 0,
            'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
            'trend_note': 'not yet available', 'detail_url': 'obesity.html',
            'placeholder': provider is None,  # zero-but-real for a provider with no obese patients
        }
    cards.insert(3, obesity_card)

    diabetes_card = _load_domain_card('diabetes', snapshot_dir, provider=provider)
    if diabetes_card is None:
        diabetes_card = {
            'id': 'diabetes', 'label': 'Diabetes Patients', 'value': 0,
            'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
            'trend_note': 'not yet available', 'detail_url': 'diabetes.html',
            'placeholder': provider is None,  # zero-but-real for a provider with no DM patients
        }
    cards.insert(4, diabetes_card)

    return cards


# --------------------------------------------------------------------------
# Main build entrypoint
# --------------------------------------------------------------------------

def build(snapshot_dir='snapshots'):
    """
    Assembles the combined overview payload and writes it to
    {snapshot_dir}/overview_{YYYY}_{MM}.json, following the same dated
    naming convention as every domain snapshot.

    Includes both the clinic-wide card list (`cards`) and a per-provider
    version of the same list (`provider_cards`, keyed by provider name),
    so the frontend's provider dropdown can re-render every card without
    an extra network round trip. `providers` is the sorted list used to
    populate that dropdown.

    NOTE: `operational_activity` (Fluoride, CHW visits) is currently
    clinic-wide only in every case -- those two modules don't exist yet
    and have no per-provider breakdown to read. When they're built, this
    function will need a provider-scoped version of that section too.
    """
    cards = _build_cards_for(snapshot_dir, provider=None)

    providers = _all_providers(snapshot_dir)
    provider_cards = {
        provider: _build_cards_for(snapshot_dir, provider=provider)
        for provider in providers
    }

    payload = {
        'generated_at': datetime.now().isoformat(),
        'date_range_label': 'Last 12 Months',
        'cards': cards,
        'providers': providers,
        'provider_cards': provider_cards,
        'operational_activity': OPERATIONAL_PLACEHOLDER,
    }

    snapshot_dir_path = Path(snapshot_dir)
    snapshot_dir_path.mkdir(parents=True, exist_ok=True)
    snapshot_name = f"overview_{datetime.now().strftime('%Y_%m')}.json"
    snapshot_path = snapshot_dir_path / snapshot_name

    with open(snapshot_path, 'w') as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"Overview snapshot written: {snapshot_path}")
    return payload


if __name__ == '__main__':
    build()