#!/usr/bin/env python3
"""
What's That Bug — Image Quality Flagging Script

Analyzes round_complete event data to identify observations with bad/misleading
photos that cause unfair misses.

Usage: python3 scripts/flag-images.py <path-to-csv>

The CSV should have either:
  - Flat columns: type, observation_id, score, time_taken_ms, user_answer, correct_answer
  - Nested format: type, data_json (JSON containing those fields)
"""

import csv
import json
import sys
import statistics
import collections
from datetime import datetime


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_ATTEMPTS = 3
FLAG_THRESHOLD = 0.6
TOP_CONFUSION_PAIRS = 50
OUTPUT_JSON_PATH = "scripts/flagged-observations.json"


# ---------------------------------------------------------------------------
# CSV loading (supports flat columns and data_json nested format)
# ---------------------------------------------------------------------------

def load_csv(path):
    rows = []
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            # Try to parse data_json if present
            data_json_raw = r.get('data_json', '')
            try:
                r['_data'] = json.loads(data_json_raw) if data_json_raw else {}
            except Exception:
                r['_data'] = {}
            rows.append(r)
    return rows


def get_field(row, field):
    """
    Get a field value from a row, checking flat columns first then _data (nested).
    Returns None if not found.
    """
    # Flat column takes precedence if it has a non-empty value
    flat_val = row.get(field, '')
    if flat_val != '' and flat_val is not None:
        return flat_val
    # Fall back to nested data_json
    return row['_data'].get(field)


def load_round_complete_events(rows):
    """Extract round_complete events and normalize their fields."""
    events = []
    for row in rows:
        if row.get('type') != 'round_complete':
            continue

        obs_id = get_field(row, 'observation_id')
        score_raw = get_field(row, 'score')
        time_raw = get_field(row, 'time_taken_ms')
        user_answer = get_field(row, 'user_answer')
        correct_answer = get_field(row, 'correct_answer')

        # Skip rows missing essential fields
        if obs_id is None or score_raw is None:
            continue

        try:
            score = float(score_raw)
        except (TypeError, ValueError):
            continue

        try:
            time_ms = float(time_raw) if time_raw is not None else None
        except (TypeError, ValueError):
            time_ms = None

        events.append({
            'observation_id': str(obs_id).strip(),
            'score': score,
            'time_ms': time_ms,
            'user_answer': str(user_answer).strip() if user_answer else '',
            'correct_answer': str(correct_answer).strip() if correct_answer else '',
        })

    return events


# ---------------------------------------------------------------------------
# Confusion pair analysis
# ---------------------------------------------------------------------------

def compute_confusion_pairs(events):
    """
    Count (correct_answer, user_answer) pairs for wrong answers.
    Returns a Counter sorted by frequency descending.
    """
    confusion = collections.Counter()
    for e in events:
        if e['score'] == 0 and e['user_answer'] and e['correct_answer']:
            if e['user_answer'] != e['correct_answer']:
                confusion[(e['correct_answer'], e['user_answer'])] += 1
    return confusion


def build_confused_species_set(confusion, top_n=TOP_CONFUSION_PAIRS):
    """
    Returns a set of species names that appear in any of the top N confusion pairs.
    A species is included if it appears as either the correct answer OR wrong answer
    in a top pair — meaning its observations are confusable.
    """
    confused = set()
    for (correct, wrong), _ in confusion.most_common(top_n):
        confused.add(correct)
        # We only care about the correct_answer side for the observation's confusion_density
        # (an observation shows one species; we flag if that species is often confused)
    return confused


# ---------------------------------------------------------------------------
# Per-observation quality scoring
# ---------------------------------------------------------------------------

def compute_observation_stats(events):
    """
    Aggregate per-observation stats from events.
    Returns dict: obs_id -> {species, total, wrong_count, times, miss_rate}
    """
    obs = collections.defaultdict(lambda: {
        'species': '',
        'total': 0,
        'wrong_count': 0,
        'times': [],
    })

    for e in events:
        oid = e['observation_id']
        obs[oid]['total'] += 1
        obs[oid]['species'] = e['correct_answer']  # last value wins (should be consistent)
        if e['score'] == 0:
            obs[oid]['wrong_count'] += 1
        if e['time_ms'] is not None:
            obs[oid]['times'].append(e['time_ms'])

    return obs


def compute_time_anomaly(avg_time_ms, global_median_ms):
    """
    Normalize avg time vs global median.
    At median = 0.0, at 2x median = 1.0. Capped at 1.0.
    """
    if global_median_ms is None or global_median_ms == 0:
        return 0.0
    ratio = avg_time_ms / global_median_ms  # 1.0 at median
    # Linear: 0.0 at ratio=1.0, 1.0 at ratio=2.0
    anomaly = (ratio - 1.0)
    return max(0.0, min(1.0, anomaly))


def score_observations(obs_stats, confused_species, global_median_ms):
    """
    Compute quality score for each observation. Returns list of dicts sorted by
    quality_score descending, only including observations with >= MIN_ATTEMPTS.
    """
    results = []

    for oid, s in obs_stats.items():
        if s['total'] < MIN_ATTEMPTS:
            continue

        miss_rate = s['wrong_count'] / s['total']

        confusion_density = 1.0 if s['species'] in confused_species else 0.0

        avg_time = statistics.mean(s['times']) if s['times'] else None
        time_anomaly = compute_time_anomaly(avg_time, global_median_ms) if avg_time is not None else 0.0

        bad_reports = 0.0  # placeholder per spec

        quality_score = (
            (miss_rate * 0.4) +
            (confusion_density * 0.3) +
            (time_anomaly * 0.2) +
            (bad_reports * 0.1)
        )

        results.append({
            'observation_id': oid,
            'species': s['species'],
            'total': s['total'],
            'wrong_count': s['wrong_count'],
            'miss_rate': miss_rate,
            'confusion_density': confusion_density,
            'time_anomaly': time_anomaly,
            'quality_score': quality_score,
            'flagged': quality_score > FLAG_THRESHOLD,
        })

    results.sort(key=lambda x: x['quality_score'], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def print_summary(total_events, total_obs_analyzed, flagged_count):
    print(f"\nWhat's That Bug — Image Quality Report")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"\n{'=' * 60}")
    print(f"  SUMMARY")
    print(f"{'=' * 60}")
    print(f"  round_complete events loaded : {total_events}")
    print(f"  Observations analyzed        : {total_obs_analyzed}  (min {MIN_ATTEMPTS} attempts)")
    print(f"  Flagged for review           : {flagged_count}  (quality_score > {FLAG_THRESHOLD})")


def print_flagged_table(scored):
    flagged = [r for r in scored if r['flagged']]
    top = flagged[:50]

    print(f"\n{'=' * 60}")
    print(f"  TOP FLAGGED OBSERVATIONS (showing {len(top)} of {len(flagged)})")
    print(f"{'=' * 60}")

    if not top:
        print("  No observations flagged.")
        return

    header = f"  {'#':>3}  {'Obs ID':>12}  {'Species':<35}  {'Miss%':>6}  {'Confuse':>7}  {'TimeAnom':>8}  {'Score':>6}  {'N':>4}"
    print(header)
    print(f"  {'-' * (len(header) - 2)}")

    for i, r in enumerate(top, 1):
        miss_pct = f"{r['miss_rate'] * 100:.0f}%"
        confuse = f"{r['confusion_density']:.1f}"
        time_anom = f"{r['time_anomaly']:.2f}"
        score = f"{r['quality_score']:.3f}"
        species_short = r['species'][:35] if r['species'] else '(unknown)'
        obs_id_short = r['observation_id'][:12]
        print(f"  {i:>3}  {obs_id_short:>12}  {species_short:<35}  {miss_pct:>6}  {confuse:>7}  {time_anom:>8}  {score:>6}  {r['total']:>4}")


def print_confusion_pairs(confusion):
    print(f"\n{'=' * 60}")
    print(f"  TOP 20 CONFUSION PAIRS  (correct → picked)")
    print(f"{'=' * 60}")

    top20 = confusion.most_common(20)
    if not top20:
        print("  No confusion pairs found.")
        return

    for i, ((correct, wrong), count) in enumerate(top20, 1):
        print(f"  {i:>2}. {correct:<35} → {wrong:<35}  ({count}x)")


def save_json(scored, path):
    top100 = scored[:100]
    with open(path, 'w') as f:
        json.dump(top100, f, indent=2)
    print(f"\n  Saved top {len(top100)} observations to: {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(f"Usage: python3 {sys.argv[0]} <path-to-csv>")
        print(f"")
        print(f"  Analyzes round_complete events to identify observations with")
        print(f"  bad or misleading photos. Flags observations with quality_score > {FLAG_THRESHOLD}.")
        print(f"")
        print(f"  Input CSV should have a 'type' column with round_complete rows.")
        print(f"  Fields can be flat columns or nested in a 'data_json' column.")
        sys.exit(1)

    csv_path = sys.argv[1]

    # Load and filter
    rows = load_csv(csv_path)
    events = load_round_complete_events(rows)

    if not events:
        print(f"No round_complete events found in {csv_path}.")
        sys.exit(1)

    # Confusion pairs (before filtering by MIN_ATTEMPTS)
    confusion = compute_confusion_pairs(events)
    confused_species = build_confused_species_set(confusion, TOP_CONFUSION_PAIRS)

    # Global median time (across all events that have a time)
    all_times = [e['time_ms'] for e in events if e['time_ms'] is not None]
    global_median_ms = statistics.median(all_times) if all_times else None

    # Per-observation scoring
    obs_stats = compute_observation_stats(events)
    scored = score_observations(obs_stats, confused_species, global_median_ms)

    flagged = [r for r in scored if r['flagged']]

    # Output
    print_summary(
        total_events=len(events),
        total_obs_analyzed=len(scored),
        flagged_count=len(flagged),
    )
    print_flagged_table(scored)
    print_confusion_pairs(confusion)
    save_json(scored, OUTPUT_JSON_PATH)


if __name__ == '__main__':
    main()
