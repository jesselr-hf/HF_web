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

For domains that don't have a real module yet, a hardcoded fallback entry
in CARD_FALLBACKS is used so the card renders (dimmed, "View Details"
disabled) rather than being omitted from the page entirely. As each domain
module ships, add a reader function like _read_obesity_snapshot() below
and register it in DOMAIN_READERS -- CARD_ORDER/CARD_FALLBACKS don't need
to change, since _build_cards_for() automatically prefers the real reader
over the fallback once one is registered.

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


def _read_asthma_snapshot(payload, summary=None):
    """
    Maps an Asthma.py summary dict (either payload['clinic_summary'] or one
    entry from payload['provider_breakdown']) into a single overview card.
    Like Diabetes.py, Asthma.py's SQL already guarantees exactly one row
    per patient -- there is no exclusion/unclassifiable count to subtract
    here, total_asthma_patients is the full headline number. Unlike
    Diabetes, Asthma.py has no by-type breakdown (confirmed design: total +
    age bucket only), but the aggregator card doesn't need one either.
    """
    if summary is None:
        summary = payload['clinic_summary']

    return {
        'id': 'asthma_patients',
        'label': 'Asthma Patients',
        'value': summary['total_asthma_patients'],
        'value_type': 'count',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pct': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'asthma.html',
        'placeholder': False,
    }


def _overdue_and_complete_counts(payload, status_field, provider=None):
    """
    Shared helper for EyeExam.py/FootExam.py-shaped snapshots: counts
    overdue and complete rows out of payload['patient_detail'], optionally
    scoped to one provider's pcp_name. clinic_summary/provider_breakdown
    in these snapshots only ever carry overdue_count -- there is no
    complete count or total anywhere else -- so patient_detail is the only
    place a percent-overdue denominator can come from. Mirrors the same
    approach used client-side in eyeexam.js/footexam.js so the aggregator's
    percent can never drift from the detail page's own percent.
    """
    rows = payload.get('patient_detail', [])
    overdue = 0
    complete = 0
    for row in rows:
        if provider is not None and row.get('pcp_name') != provider:
            continue
        status = row.get(status_field)
        if status == 'OVERDUE':
            overdue += 1
        elif status == 'Complete':
            complete += 1
    return overdue, complete


def _read_diabetes_eye_exam_snapshot(payload, summary=None, provider=None):
    """
    Maps an EyeExam.py snapshot into a single overview card showing percent
    overdue (overdue / (overdue + complete)), matching eyeexam.js's own
    stat card. clinic_summary/provider_breakdown only carry overdue_count,
    so both overdue and complete counts are derived here from
    patient_detail via _overdue_and_complete_counts -- see that docstring.
    """
    overdue, complete = _overdue_and_complete_counts(payload, 'eye_exam_status', provider=provider)
    denominator = overdue + complete
    pct = (overdue / denominator * 100) if denominator > 0 else 0.0

    return {
        'id': 'diabetes_eye_exam',
        'label': 'Diabetes Eye Exam\n(Overdue)',
        'value': pct,
        'value_type': 'percent',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pts': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'eyeexam.html',
        'placeholder': False,
    }


def _read_diabetes_foot_exam_snapshot(payload, summary=None, provider=None):
    """
    Maps an FootExam.py snapshot into a single overview card showing
    percent overdue (overdue / (overdue + complete)), matching
    footexam.js's own stat card. clinic_summary/provider_breakdown only
    carry overdue_count, so both overdue and complete counts are derived
    here from patient_detail via _overdue_and_complete_counts -- see that
    docstring.
    """
    overdue, complete = _overdue_and_complete_counts(payload, 'foot_exam_status', provider=provider)
    denominator = overdue + complete
    pct = (overdue / denominator * 100) if denominator > 0 else 0.0

    return {
        'id': 'diabetes_foot_exam',
        'label': 'Diabetes Foot Exam\n(Overdue)',
        'value': pct,
        'value_type': 'percent',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pts': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'footexam.html',
        'placeholder': False,
    }



def _read_under24mos_snapshot(payload, summary=None):
    """
    Maps an Under24Mos.py summary dict (either payload['clinic_summary'] or
    one entry from payload['provider_breakdown']) into a single overview
    card.

    Per Under24Mos.py's confirmed design, the summary is gap-count-only --
    patients WITH a scheduled visit are excluded from both the clinic
    summary and provider_breakdown (they still appear in patient_detail,
    which this aggregator doesn't touch). So same shape as EyeExam/FootExam:
    'total_gap_patients' is already the full headline number, no exclusion
    arithmetic needed here.
    """
    if summary is None:
        summary = payload['clinic_summary']

    return {
        'id': 'under2_no_visit',
        'label': 'Under Age 2 Without\nScheduled Visit',
        'value': summary['total_gap_patients'],
        'value_type': 'count',
        'trend_direction': 'up',   # TODO: compute from prior-month/year snapshot diff once history exists
        'trend_pct': None,
        'trend_note': 'prior-period trend not yet available',
        'detail_url': 'under2.html',
        'placeholder': False,
    }


DOMAIN_READERS = {
    'obesity': _read_obesity_snapshot,
    'diabetes': _read_diabetes_snapshot,
    'diabetes_eye_exam': _read_diabetes_eye_exam_snapshot,
    'diabetes_foot_exam': _read_diabetes_foot_exam_snapshot,
    'under2_no_visit': _read_under24mos_snapshot,
    'asthma_patients': _read_asthma_snapshot,
    # ... add as each domain module ships
}

# Asthma.py writes asthma_YYYY_MM.json, but its DOMAIN_READERS key is
# 'asthma_patients' (matching the placeholder id already in use on the
# overview page) -- same filename/key mismatch pattern as the eye/foot
# exam and under2 domains above, so it needs the same override treatment.
SNAPSHOT_FILENAME_OVERRIDES = {
    'diabetes_eye_exam': 'eyeexam',
    'diabetes_foot_exam': 'footexam',
    'under2_no_visit': 'under24mos',
    'asthma_patients': 'asthma',
}

# --------------------------------------------------------------------------
# Operational activity placeholders (Fluoride, CHW visits) -- separate from
# the domain card grid above; no real module exists for either yet.
# --------------------------------------------------------------------------

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

    Most domain modules name their snapshot file after their DOMAIN_READERS
    key (e.g. 'diabetes' -> diabetes_*.json). A few don't -- see
    SNAPSHOT_FILENAME_OVERRIDES -- so check there first.
    """
    filename_prefix = SNAPSHOT_FILENAME_OVERRIDES.get(domain, domain)
    matches = sorted(Path(snapshot_dir).glob(f"{filename_prefix}_*.json"))
    return matches[-1] if matches else None


def _load_domain_card(domain_id, snapshot_dir, provider=None):
    """
    Returns a real card dict if a snapshot exists and a reader is
    registered for this domain, or None if either is missing (caller
    falls back to the placeholder for that domain).

    provider: if given, builds the card scoped to that provider. For the
    eye/foot exam readers (which now derive their percent directly from
    patient_detail rather than provider_breakdown), the provider filter is
    passed straight through to the reader. For every other domain reader,
    which still keys off provider_breakdown, if the domain's snapshot has
    no data for that provider (they have zero patients there), returns
    None so the caller can fall back to a zeroed-out version of the card
    rather than crash.
    """
    reader = DOMAIN_READERS.get(domain_id)
    if reader is None:
        return None

    snapshot_path = _latest_snapshot_path(domain_id, snapshot_dir)
    if snapshot_path is None:
        print(f"WARNING: no snapshot found for domain '{domain_id}' "
              f"(expected {SNAPSHOT_FILENAME_OVERRIDES.get(domain_id, domain_id)}_*.json in {snapshot_dir}) -- falling back to placeholder")
        return None

    with open(snapshot_path) as f:
        payload = json.load(f)

    if domain_id in ('diabetes_eye_exam', 'diabetes_foot_exam'):
        # These readers derive everything from patient_detail themselves
        # (see _overdue_and_complete_counts) rather than provider_breakdown,
        # so just pass the provider filter straight through. A provider
        # with zero rows in patient_detail naturally gets 0/0 -> 0.0%
        # rather than None, so no separate "no data for this provider"
        # fallback is needed here.
        return reader(payload, provider=provider)

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


# --------------------------------------------------------------------------
# Fixed display order
# Explicit list of every card id, in the exact order they should render.
# Grouped by related domain rather than strictly real-first/placeholder-
# last: DM cluster (Diabetes, Foot Exam, Eye Exam) stays together, Pregnancy
# cluster (Pregnancy, Edinburgh) stays together, BH cluster stays together.
# This replaces the old insert()-at-fixed-index approach, which was fragile
# -- each insert shifted every card after it, so adding/removing a card
# silently reordered unrelated cards elsewhere in the list.
# --------------------------------------------------------------------------

CARD_ORDER = [
    'under2_no_visit',
    'diabetes',
    'diabetes_foot_exam',
    'diabetes_eye_exam',
    'obesity',
    'asthma_patients',
    'pregnancy_active',
    'edinburgh_screens',
    'bh_referrals_ppd',
    'bh_kept_first_appt',
]

# Fallback card shape for each id, used when no real snapshot/reader is
# available for it (a true placeholder domain, or a real domain with no
# snapshot found yet). `placeholder: provider is None` on real domains
# means: clinic-wide with no snapshot yet -> shown dimmed as a placeholder;
# scoped to a provider with zero patients in a real domain -> shown as a
# real zero, not dimmed. True placeholder domains (no module built yet)
# are always dimmed regardless of provider.
CARD_FALLBACKS = {
    'under2_no_visit': lambda provider: {
        'id': 'under2_no_visit', 'label': 'Under Age 2 Without\nScheduled Visit', 'value': 0,
        'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'under2.html',
        'placeholder': provider is None,
    },
    'diabetes': lambda provider: {
        'id': 'diabetes', 'label': 'Diabetes Patients', 'value': 0,
        'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'diabetes.html',
        'placeholder': provider is None,
    },
    'diabetes_foot_exam': lambda provider: {
        'id': 'diabetes_foot_exam', 'label': 'Diabetes Foot Exam\n(Overdue)',
        'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'diabetes_foot_exam.html', 'placeholder': True,
    },
    'diabetes_eye_exam': lambda provider: {
        'id': 'diabetes_eye_exam', 'label': 'Diabetes Eye Exam\n(Overdue)',
        'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'eyeexam.html', 'placeholder': True,
    },
    'obesity': lambda provider: {
        'id': 'obesity', 'label': 'Obesity Patients', 'value': 0,
        'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'obesity.html',
        'placeholder': provider is None,
    },
    'asthma_patients': lambda provider: {
        'id': 'asthma_patients', 'label': 'Asthma Patients', 'value': 0,
        'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'asthma.html',
        'placeholder': provider is None,
    },
    'pregnancy_active': lambda provider: {
        'id': 'pregnancy_active', 'label': 'Pregnancy (Active)',
        'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'pregnancy.html', 'placeholder': True,
    },
    'edinburgh_screens': lambda provider: {
        'id': 'edinburgh_screens', 'label': 'Postpartum Grant\nEdinburgh Screens',
        'value': 0.0, 'value_type': 'percent', 'trend_direction': 'up', 'trend_pts': 0,
        'trend_note': 'not yet available', 'detail_url': 'edinburgh.html', 'placeholder': True,
    },
    'bh_referrals_ppd': lambda provider: {
        'id': 'bh_referrals_ppd', 'label': 'BH Referrals for PPD/Anxiety/\nMood Disorder',
        'value': 0, 'value_type': 'count', 'trend_direction': 'up', 'trend_pct': 0,
        'trend_note': 'not yet available', 'detail_url': 'bh_referrals.html', 'placeholder': True,
    },
    'bh_kept_first_appt': lambda provider: {
        'id': 'bh_kept_first_appt', 'label': 'BH Referrals Kept First\nAppointment',
        'value': 0.0, 'value_type': 'percent', 'trend_direction': 'up', 'trend_pts': 0,
        'trend_note': 'not yet available', 'detail_url': 'bh_kept_appt.html', 'placeholder': True,
    },
}


def _build_cards_for(snapshot_dir, provider=None):
    """
    Builds the full card list (all 10 domain cards, in CARD_ORDER) either
    clinic-wide (provider=None) or scoped to one provider. For a provider
    view, any domain with zero patients for that provider still gets a
    card -- just showing 0 -- rather than being omitted, so the grid
    layout stays stable when switching providers.
    """
    cards = []
    for card_id in CARD_ORDER:
        real_card = _load_domain_card(card_id, snapshot_dir, provider=provider)
        if real_card is not None:
            cards.append(real_card)
        else:
            cards.append(CARD_FALLBACKS[card_id](provider))
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