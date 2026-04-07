#!/usr/bin/env python3
"""
Compile all flagged/reported observations into a single JSON for the review HTML page.

Sources:
  1. bad_photo events from the Google Sheets CSV
  2. general_feedback mentioning image quality issues (manual species extraction)
  3. Statistically flagged observations from flag-images.py output
  4. High miss-rate observations (quality_score > 0.4, even if not formally flagged)

Output: scripts/review-candidates.json
"""

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS_CSV = ROOT / "analytics" / "output" / "sheets" / "events.csv"
OBSERVATIONS_JSON = ROOT / "public" / "data" / "observations.json"
FLAGGED_JSON = ROOT / "scripts" / "flagged-observations.json"
OUTPUT_JSON = ROOT / "scripts" / "review-candidates.json"

# Threshold: include observations with quality_score above this from flag-images output
QUALITY_SCORE_THRESHOLD = 0.35


def load_events_csv():
    rows = []
    with open(EVENTS_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                parsed = json.loads(r.get("data_json", "") or "{}")
                if isinstance(parsed, list):
                    parsed = parsed[0] if len(parsed) == 1 and isinstance(parsed[0], dict) else {}
                r["_data"] = parsed
            except Exception:
                r["_data"] = {}
            rows.append(r)
    return rows


def extract_bad_photo_reports(rows):
    """Extract observation IDs from bad_photo events, with report counts."""
    reports = Counter()
    species_map = {}
    sets_map = {}

    for r in rows:
        if r.get("type") != "bad_photo":
            continue
        obs_id = r.get("observation_id") or r["_data"].get("observation_id")
        species = r["_data"].get("species", "")
        game_set = r["_data"].get("set", "")
        if obs_id:
            obs_id = str(obs_id).replace(".0", "")
            reports[obs_id] += 1
            if species:
                species_map[obs_id] = species
            if game_set:
                sets_map.setdefault(obs_id, set()).add(game_set)

    return reports, species_map, sets_map


def extract_feedback_image_issues(rows):
    """Extract observation references from general_feedback and session_feedback about images."""
    image_keywords = re.compile(
        r"(photo|picture|image|blurry|zoomed|focus|can.t see|hard to see|bad|misleading|mesh|unclear)",
        re.IGNORECASE,
    )
    issues = []

    for r in rows:
        if r.get("type") not in ("general_feedback", "session_feedback"):
            continue
        text = r["_data"].get("free_text", "") or r["_data"].get("text", "")
        if text and image_keywords.search(text):
            issues.append({
                "type": r["type"],
                "text": text.strip(),
                "timestamp": r.get("timestamp", ""),
            })

    return issues


def load_observations():
    """Load observations.json into a dict keyed by ID (as string)."""
    with open(OBSERVATIONS_JSON) as f:
        obs_list = json.load(f)
    return {str(o["id"]): o for o in obs_list}


def load_flagged():
    """Load statistically flagged observations from flag-images.py output."""
    if not FLAGGED_JSON.exists():
        return []
    with open(FLAGGED_JSON) as f:
        return json.load(f)


def main():
    print("Loading events CSV...")
    rows = load_events_csv()

    print("Extracting bad_photo reports...")
    reports, species_from_reports, sets_from_reports = extract_bad_photo_reports(rows)
    print(f"  {len(reports)} unique observations from {sum(reports.values())} bad_photo events")

    print("Extracting feedback image issues...")
    feedback_issues = extract_feedback_image_issues(rows)
    print(f"  {len(feedback_issues)} feedback entries mentioning image quality")

    print("Loading statistically flagged observations...")
    flagged = load_flagged()
    flagged_above_threshold = [
        f for f in flagged if f.get("quality_score", 0) > QUALITY_SCORE_THRESHOLD
    ]
    print(f"  {len(flagged_above_threshold)} observations above quality_score {QUALITY_SCORE_THRESHOLD}")

    print("Loading observations.json...")
    observations = load_observations()

    # Compile all candidate observation IDs
    candidate_ids = set()

    # Source 1: bad_photo reports
    for obs_id in reports:
        candidate_ids.add(obs_id)

    # Source 2: statistically flagged
    for f in flagged_above_threshold:
        obs_id = str(f["observation_id"]).replace(".0", "")
        candidate_ids.add(obs_id)

    print(f"\nTotal unique candidates: {len(candidate_ids)}")

    # Build review entries
    candidates = []
    for obs_id in sorted(candidate_ids, key=lambda x: int(float(x))):
        obs = observations.get(obs_id)
        if not obs:
            # Observation not in current dataset (maybe already removed)
            print(f"  WARN: observation {obs_id} not found in observations.json — skipping")
            continue

        # Find this obs in the flagged list
        flag_entry = next(
            (f for f in flagged if str(f["observation_id"]).replace(".0", "") == obs_id),
            None,
        )

        report_count = reports.get(obs_id, 0)
        sources = []
        if report_count > 0:
            sources.append("user_report")
        if flag_entry and flag_entry.get("quality_score", 0) > QUALITY_SCORE_THRESHOLD:
            sources.append("statistical_flag")

        entry = {
            "observation_id": int(obs_id),
            "species": obs["taxon"].get("species", ""),
            "common_name": obs["taxon"].get("common_name", ""),
            "order": obs["taxon"].get("order", ""),
            "family": obs["taxon"].get("family", ""),
            "photo_url": obs.get("photo_url", ""),
            "location": obs.get("location", ""),
            "inat_url": obs.get("inat_url", f"https://www.inaturalist.org/observations/{obs_id}"),
            "attribution": obs.get("attribution", ""),
            "report_count": report_count,
            "reported_in_sets": sorted(sets_from_reports.get(obs_id, set())),
            "sources": sources,
        }

        if flag_entry:
            entry["miss_rate"] = flag_entry.get("miss_rate", 0)
            entry["quality_score"] = flag_entry.get("quality_score", 0)
            entry["total_attempts"] = flag_entry.get("total", 0)
            entry["wrong_count"] = flag_entry.get("wrong_count", 0)
            entry["confusion_density"] = flag_entry.get("confusion_density", 0)
        else:
            entry["miss_rate"] = None
            entry["quality_score"] = None
            entry["total_attempts"] = None
            entry["wrong_count"] = None
            entry["confusion_density"] = None

        candidates.append(entry)

    # Sort: most user reports first, then by quality_score descending
    candidates.sort(
        key=lambda c: (
            -(c["report_count"]),
            -(c["quality_score"] or 0),
        )
    )

    # Also include the feedback text issues for display context
    output = {
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "total_candidates": len(candidates),
        "feedback_issues": feedback_issues,
        "candidates": candidates,
    }

    with open(OUTPUT_JSON, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(candidates)} candidates to: {OUTPUT_JSON}")
    print("\nTop 10 by priority:")
    for i, c in enumerate(candidates[:10], 1):
        rpt = f"[{c['report_count']} reports]" if c["report_count"] else ""
        qs = f"QS={c['quality_score']:.3f}" if c["quality_score"] else ""
        print(f"  {i:>2}. {c['common_name'] or c['species']:<35} {rpt:<14} {qs}")


if __name__ == "__main__":
    main()
