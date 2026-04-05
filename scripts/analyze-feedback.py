#!/usr/bin/env python3
"""
What's That Bug — Feedback Analytics Script

Produces a comprehensive report from the Google Sheets CSV export.
Usage: python3 scripts/analyze-feedback.py <path-to-csv>

The CSV should have columns: timestamp, type, session_id, set, round, observation_id, data_json
"""

import csv
import json
import sys
import statistics
import collections
from datetime import datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_csv(path):
    rows = []
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                r['_data'] = json.loads(r['data_json']) if r['data_json'] else {}
            except Exception:
                r['_data'] = {}
            rows.append(r)
    return rows


def classify_referrer(ref):
    if not ref:
        return '(direct)'
    if 'fbclid' in ref:
        return 'Facebook'
    if 'google.com' in ref:
        return 'Google'
    if 't.co' in ref or 'twitter.com' in ref or 'x.com' in ref:
        return 'Twitter/X'
    if 'reddit.com' in ref or 'android-app://com.reddit' in ref:
        return 'Reddit'
    if 'instagram.com' in ref or 'l.instagram.com' in ref:
        return 'Instagram'
    if 'linkedin.com' in ref:
        return 'LinkedIn'
    if 'dewanggogte.com' in ref:
        return 'Personal site'
    if 'whats-that-bug.vercel.app/play' in ref:
        return 'Internal (play page)'
    if 'whats-that-bug.vercel.app' in ref:
        return 'Internal (homepage)'
    return ref


def classify_mode(set_name):
    s = (set_name or '').lower()
    if 'streak' in s:
        return 'Streak'
    if 'time_trial' in s:
        return 'Time Trial'
    return 'Classic'


def normalize_set_name(set_name):
    """Map display names to keys for consistency."""
    mapping = {
        'Bugs 101': 'bugs_101',
        'All Bugs': 'all_bugs',
        'Backyard Basics': 'backyard_basics',
        'Beetles': 'beetles',
        'Butterflies & Moths': 'butterflies_moths',
        'Spiders & Friends': 'spiders',
        'Tiny Terrors': 'tiny_terrors',
        'Streaks': 'streak',
    }
    return mapping.get(set_name, set_name)


def pct(n, total):
    return f"{100 * n / total:.0f}%" if total else "—"


def heading(title):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def subheading(title):
    print(f"\n--- {title} ---")


# ---------------------------------------------------------------------------
# Report sections
# ---------------------------------------------------------------------------

def report_overview(rows, starts, sessions):
    heading("OVERVIEW")
    types = collections.Counter(r['type'] for r in rows)
    timestamps = [r['timestamp'] for r in rows if r['timestamp']]

    print(f"Total events: {len(rows)}")
    for t, c in types.most_common():
        print(f"  {t}: {c}")
    print(f"Date range: {min(timestamps)[:10]} to {max(timestamps)[:10]}")
    print(f"Unique sessions: {len(sessions)}")

    subheading("Device split")
    devices = collections.Counter(r['_data'].get('device', 'unknown') for r in starts)
    for d, c in devices.most_common():
        print(f"  {d}: {c} ({pct(c, len(starts))})")

    subheading("Sessions by day")
    day_sessions = collections.Counter()
    for r in starts:
        if r['timestamp']:
            day_sessions[r['timestamp'][:10]] += 1
    for d in sorted(day_sessions):
        print(f"  {d}: {day_sessions[d]}")


def report_traffic(starts, sessions):
    heading("TRAFFIC SOURCES")
    referrers = collections.Counter(classify_referrer(r['_data'].get('referrer', '')) for r in starts)
    for ref, c in referrers.most_common():
        print(f"  {ref}: {c} ({pct(c, len(starts))})")

    subheading("Source performance")
    source_sessions = collections.defaultdict(set)
    for r in starts:
        src = classify_referrer(r['_data'].get('referrer', ''))
        source_sessions[src].add(r['session_id'])

    print(f"  {'Source':25s} {'Sessions':>8s} {'Played':>10s} {'Completed':>12s}")
    for src in sorted(source_sessions, key=lambda s: len(source_sessions[s]), reverse=True):
        sids = source_sessions[src]
        if len(sids) < 2:
            continue
        played = sum(1 for s in sids if any(e['type'] == 'round_complete' for e in sessions[s]))
        comp = sum(1 for s in sids if any(e['type'] == 'session_end' and e['_data'].get('completed') for e in sessions[s]))
        print(f"  {src:25s} {len(sids):8d} {played:5d} ({pct(played, len(sids)):>4s}) {comp:5d} ({pct(comp, len(sids)):>4s})")


def report_funnel(sessions):
    heading("FUNNEL")
    total = len(sessions)
    played = sum(1 for evts in sessions.values() if any(e['type'] == 'round_complete' for e in evts))
    ended = sum(1 for evts in sessions.values() if any(e['type'] == 'session_end' for e in evts))
    completed = sum(1 for evts in sessions.values() if any(e['type'] == 'session_end' and e['_data'].get('completed') for e in evts))
    shared = sum(1 for evts in sessions.values() if any(e['type'] == 'session_end' and e['_data'].get('share_clicked') for e in evts))

    print(f"  {'Stage':25s} {'Count':>6s} {'Rate':>15s}")
    print(f"  {'Started':25s} {total:6d} {'—':>15s}")
    print(f"  {'Played >= 1 round':25s} {played:6d} {pct(played, total):>12s} of starts")
    print(f"  {'Reached session end':25s} {ended:6d} {pct(ended, total):>12s} of starts")
    print(f"  {'Completed all rounds':25s} {completed:6d} {pct(completed, total):>12s} of starts")
    print(f"  {'Shared':25s} {shared:6d} {pct(shared, total):>8s} starts, {pct(shared, completed):>4s} completed")

    subheading("Day-over-day funnel")
    day_data = collections.defaultdict(lambda: {'starts': 0, 'played': 0, 'completed': 0})
    starts_list = []
    for sid, evts in sessions.items():
        for e in evts:
            if e['type'] == 'session_start':
                starts_list.append(e)
    for r in starts_list:
        day = r['timestamp'][:10]
        sid = r['session_id']
        day_data[day]['starts'] += 1
        if any(e['type'] == 'round_complete' for e in sessions[sid]):
            day_data[day]['played'] += 1
        if any(e['type'] == 'session_end' and e['_data'].get('completed') for e in sessions[sid]):
            day_data[day]['completed'] += 1

    for day in sorted(day_data):
        d = day_data[day]
        print(f"  {day}: {d['starts']:3d} starts, {d['played']:3d} played ({pct(d['played'], d['starts'])}), {d['completed']:3d} completed ({pct(d['completed'], d['starts'])})")


def report_dropoff(rows):
    heading("DROP-OFF BY ROUND")
    rounds = [r for r in rows if r['type'] == 'round_complete']
    round_counts = collections.Counter(r['_data'].get('round', 0) for r in rounds)
    # Only show rounds 1-15 to avoid streak noise
    for rn in sorted(round_counts):
        if rn > 15:
            remaining = sum(c for r, c in round_counts.items() if r > 15)
            print(f"  Round 16+: {remaining} (streak/extended play)")
            break
        bar = '#' * (round_counts[rn] // 3)
        print(f"  Round {rn:2d}: {round_counts[rn]:3d} {bar}")


def report_scores(rows):
    heading("SCORES")
    rounds = [r for r in rows if r['type'] == 'round_complete']
    scores = [r['_data'].get('score', 0) for r in rounds if r['_data'].get('score') is not None]

    print(f"Total rounds played: {len(rounds)}")
    print(f"Mean: {statistics.mean(scores):.1f}, Median: {statistics.median(scores):.1f}")

    buckets = collections.Counter()
    for s in scores:
        if s == 0:
            buckets['0 (wrong)'] += 1
        elif s <= 50:
            buckets['1-50'] += 1
        elif s <= 80:
            buckets['51-80'] += 1
        else:
            buckets['81-100'] += 1
    for b in ['0 (wrong)', '1-50', '51-80', '81-100']:
        ct = buckets.get(b, 0)
        print(f"  {b}: {ct} ({pct(ct, len(scores))})")

    subheading("Avg score by round (1-10)")
    round_scores = collections.defaultdict(list)
    for r in rounds:
        rn = r['_data'].get('round', 0)
        round_scores[rn].append(r['_data'].get('score', 0))
    for rn in sorted(round_scores):
        if rn > 10:
            break
        print(f"  Round {rn}: {statistics.mean(round_scores[rn]):.0f} (n={len(round_scores[rn])})")

    times = [r['_data'].get('time_taken_ms', 0) for r in rounds if r['_data'].get('time_taken_ms')]
    if times:
        print(f"\nTime per round: mean={statistics.mean(times)/1000:.1f}s, median={statistics.median(times)/1000:.1f}s")

    subheading("Session end stats")
    ends = [r for r in rows if r['type'] == 'session_end']
    completed = sum(1 for r in ends if r['_data'].get('completed'))
    print(f"Session ends: {len(ends)} (completed: {completed}, abandoned: {len(ends) - completed})")

    final_scores = [r['_data'].get('total_score', 0) for r in ends if r['_data'].get('total_score') is not None]
    if final_scores:
        print(f"Final scores: mean={statistics.mean(final_scores):.0f}, median={statistics.median(final_scores):.0f}, max={max(final_scores)}")

    rounds_played = [r['_data'].get('rounds_played', 0) for r in ends if r['_data'].get('rounds_played')]
    if rounds_played:
        print(f"Rounds per session: mean={statistics.mean(rounds_played):.1f}, median={statistics.median(rounds_played):.1f}")


def report_observations(rows):
    heading("HARDEST / EASIEST OBSERVATIONS")
    rounds = [r for r in rows if r['type'] == 'round_complete']

    obs_stats = collections.defaultdict(lambda: {'correct': 0, 'wrong': 0, 'total': 0, 'species': ''})
    for r in rounds:
        oid = r['_data'].get('observation_id', '')
        score = r['_data'].get('score', 0)
        species = r['_data'].get('correct_answer', '')
        obs_stats[oid]['total'] += 1
        obs_stats[oid]['species'] = species
        if score == 0:
            obs_stats[oid]['wrong'] += 1
        elif score >= 80:
            obs_stats[oid]['correct'] += 1

    # Filter to observations with >= 4 appearances
    frequent = {k: v for k, v in obs_stats.items() if v['total'] >= 4}

    if frequent:
        subheading("Hardest (highest miss rate, min 4 appearances)")
        hardest = sorted(frequent.items(), key=lambda x: x[1]['wrong'] / x[1]['total'], reverse=True)
        for oid, s in hardest[:10]:
            miss_rate = 100 * s['wrong'] / s['total']
            print(f"  {s['species']:40s} {s['wrong']}/{s['total']} wrong ({miss_rate:.0f}%)")

        subheading("Easiest (highest perfect rate, min 4 appearances)")
        easiest = sorted(frequent.items(), key=lambda x: x[1]['correct'] / x[1]['total'], reverse=True)
        for oid, s in easiest[:10]:
            perfect_rate = 100 * s['correct'] / s['total']
            print(f"  {s['species']:40s} {s['correct']}/{s['total']} perfect ({perfect_rate:.0f}%)")

    subheading("Top confusion pairs (correct -> picked)")
    wrong = [r for r in rounds if r['_data'].get('score', 0) == 0]
    confusion = collections.Counter()
    for r in wrong:
        ua = r['_data'].get('user_answer', '')
        ca = r['_data'].get('correct_answer', '')
        confusion[(ca, ua)] += 1
    for (ca, ua), c in confusion.most_common(15):
        print(f"  {ca} -> {ua} ({c}x)")


def report_sets(starts, sessions):
    heading("SET PERFORMANCE")
    set_sessions = collections.defaultdict(set)
    for r in starts:
        s = normalize_set_name(r['set'] or r['_data'].get('set', ''))
        if s:
            set_sessions[s].add(r['session_id'])

    print(f"  {'Set':25s} {'Starts':>7s} {'Played':>10s} {'Completed':>12s}")
    for set_name in sorted(set_sessions, key=lambda s: len(set_sessions[s]), reverse=True):
        sids = set_sessions[set_name]
        played = sum(1 for s in sids if any(e['type'] == 'round_complete' for e in sessions[s]))
        comp = sum(1 for s in sids if any(e['type'] == 'session_end' and e['_data'].get('completed') for e in sessions[s]))
        print(f"  {set_name:25s} {len(sids):7d} {played:5d} ({pct(played, len(sids)):>4s}) {comp:5d} ({pct(comp, len(sids)):>4s})")


def report_modes(starts, sessions, rows):
    heading("GAME MODES")
    mode_sessions = collections.defaultdict(set)
    for r in starts:
        s = r['set'] or r['_data'].get('set', '')
        mode = classify_mode(s)
        mode_sessions[mode].add(r['session_id'])

    for mode in ['Classic', 'Streak', 'Time Trial']:
        sids = mode_sessions.get(mode, set())
        played = sum(1 for s in sids if any(e['type'] == 'round_complete' for e in sessions[s]))
        comp = sum(1 for s in sids if any(e['type'] == 'session_end' and e['_data'].get('completed') for e in sessions[s]))
        print(f"  {mode:15s} {len(sids):4d} sessions, {played} played ({pct(played, len(sids))}), {comp} completed ({pct(comp, len(sids))})")

    # Streak stats
    streak_sids = mode_sessions.get('Streak', set())
    if streak_sids:
        streak_max_rounds = []
        for sid in streak_sids:
            round_nums = [e['_data'].get('round', 0) for e in sessions[sid] if e['type'] == 'round_complete']
            if round_nums:
                streak_max_rounds.append(max(round_nums))
        if streak_max_rounds:
            print(f"\n  Streak mode: longest run = {max(streak_max_rounds)} rounds, avg = {statistics.mean(streak_max_rounds):.1f}")

    subheading("Sharing by mode")
    ends = [r for r in rows if r['type'] == 'session_end']
    mode_shares = collections.defaultdict(lambda: {'total': 0, 'shared': 0})
    for r in ends:
        s = r['_data'].get('set', '')
        mode = classify_mode(s)
        mode_shares[mode]['total'] += 1
        if r['_data'].get('share_clicked'):
            mode_shares[mode]['shared'] += 1
    for mode in ['Classic', 'Streak', 'Time Trial']:
        d = mode_shares[mode]
        print(f"  {mode:15s} {d['shared']}/{d['total']} shared ({pct(d['shared'], d['total'])})")

    subheading("Sharer profiles")
    sharers = [r for r in ends if r['_data'].get('share_clicked')]
    if sharers:
        sharer_scores = [r['_data'].get('total_score', 0) for r in sharers]
        print(f"  Count: {len(sharers)}, Scores: min={min(sharer_scores)}, max={max(sharer_scores)}, mean={statistics.mean(sharer_scores):.0f}")
        print(f"  All completed: {all(r['_data'].get('completed') for r in sharers)}")
    else:
        print("  No shares recorded.")


def report_feedback(rows):
    heading("PLAYER FEEDBACK")

    subheading(f"Round reactions")
    reactions = [r for r in rows if r['type'] == 'round_reaction']
    print(f"Total: {len(reactions)}")
    difficulties = collections.Counter(r['_data'].get('difficulty', '(missing)') for r in reactions)
    for d, c in difficulties.most_common():
        print(f"  {d}: {c}")

    subheading("Session feedback")
    feedbacks = [r for r in rows if r['type'] == 'session_feedback']
    print(f"Total: {len(feedbacks)}")

    diff_ratings = collections.Counter(r['_data'].get('difficulty_rating', '') for r in feedbacks)
    print(f"Difficulty ratings (1=easy, 5=hard):")
    for d in sorted(diff_ratings):
        print(f"  {d}: {diff_ratings[d]}")

    play_again = collections.Counter(r['_data'].get('play_again', '(blank)') for r in feedbacks)
    print(f"Play again:")
    for p, c in play_again.most_common():
        print(f"  {p}: {c}")

    free_texts = [
        (r['_data'].get('free_text', ''), r['_data'].get('difficulty_rating', ''), r['_data'].get('set', ''), r['timestamp'][:10])
        for r in feedbacks if r['_data'].get('free_text')
    ]
    if free_texts:
        print(f"\nFree-text feedback ({len(free_texts)} responses):")
        for txt, diff, s, date in free_texts:
            print(f"  [{date}, {s}, difficulty={diff}] \"{txt}\"")

    subheading("General feedback")
    gen_fb = [r for r in rows if r['type'] == 'general_feedback']
    print(f"Total: {len(gen_fb)}")
    for r in gen_fb:
        print(f"  [{r['_data'].get('category', '')}] \"{r['_data'].get('text', '')}\"")

    subheading("Bad photo reports")
    bad_photos = [r for r in rows if r['type'] == 'bad_photo']
    print(f"Total: {len(bad_photos)}")
    for r in bad_photos:
        has_reason = 'reason' in r['_data'] and r['_data']['reason'] not in ('', '?')
        reason_str = f" — reason: {r['_data']['reason']}" if has_reason else " (no reason captured)"
        print(f"  {r['_data'].get('species', '?')} (obs {r['_data'].get('observation_id', '?')}) in {r['_data'].get('set', '?')}{reason_str}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(f"Usage: python3 {sys.argv[0]} <path-to-csv>")
        sys.exit(1)

    csv_path = sys.argv[1]
    rows = load_csv(csv_path)

    starts = [r for r in rows if r['type'] == 'session_start']
    sessions = collections.defaultdict(list)
    for r in rows:
        sessions[r['session_id']].append(r)

    print(f"What's That Bug — Feedback Analysis")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    report_overview(rows, starts, sessions)
    report_traffic(starts, sessions)
    report_funnel(sessions)
    report_dropoff(rows)
    report_scores(rows)
    report_observations(rows)
    report_sets(starts, sessions)
    report_modes(starts, sessions, rows)
    report_feedback(rows)


if __name__ == '__main__':
    main()
