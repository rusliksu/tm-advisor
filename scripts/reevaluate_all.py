"""
Re-evaluate all 543 cards with correct priority order:
1. Desktop/Mars manual tier lists (gold standard)
2. COTD comments (expert opinions)
3. Math formulas (base calculations)
4. TFMStats (sanity check only)

Group 1: 189 cards with Desktop data -> apply Desktop tier directly
Group 2: 341 cards with COTD but no Desktop -> need agent re-evaluation
Group 3: 13 cards with neither -> keep current
"""
import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

# Tier -> score range mapping
TIER_SCORE_RANGES = {
    "S": (90, 100),
    "A": (80, 89),
    "B": (70, 79),
    "C": (55, 69),
    "D": (35, 54),
    "F": (0, 34),
}

def get_score_for_tier_and_position(tier, relative_pos, total_in_tier):
    """Calculate score based on tier and relative position within tier.
    relative_pos is 0-based index within the tier group (0 = best in tier).
    """
    low, high = TIER_SCORE_RANGES[tier]
    if total_in_tier <= 1:
        return (low + high) // 2
    # First card in tier = highest score, last = lowest
    fraction = 1.0 - (relative_pos / max(total_in_tier - 1, 1))
    return round(low + fraction * (high - low))


def apply_desktop_corrections():
    """Apply Desktop tier evaluations as the gold standard."""
    with open(os.path.join(DATA_DIR, "evaluations.json"), "r", encoding="utf-8") as f:
        evals = json.load(f)

    with open(os.path.join(DATA_DIR, "desktop_evaluations.json"), "r", encoding="utf-8") as f:
        desktop = json.load(f)

    # Group desktop by tier to calculate positions
    by_tier_type = {}
    for d in desktop:
        key = (d["type"], d["tier"])
        if key not in by_tier_type:
            by_tier_type[key] = []
        by_tier_type[key].append(d)

    changes = 0
    tier_changes = 0

    for d in desktop:
        name = d["name"]
        if name not in evals:
            continue

        current = evals[name]
        desktop_tier = d["tier"]
        current_tier = current.get("tier", "C")

        # Calculate score based on RELATIVE position within tier
        key = (d["type"], d["tier"])
        tier_group = by_tier_type[key]
        total_in_tier = len(tier_group)

        # Find relative position (0-based) within this tier group
        relative_pos = 0
        for idx, card in enumerate(tier_group):
            if card["name"] == name:
                relative_pos = idx
                break

        new_score = get_score_for_tier_and_position(desktop_tier, relative_pos, total_in_tier)

        # If Desktop reasoning exists, note it
        desktop_note = ""
        if d.get("reasoning"):
            desktop_note = d["reasoning"][:200]

        # Update
        old_score = current.get("score", 0)
        old_tier = current_tier

        current["tier"] = desktop_tier
        current["score"] = new_score

        if old_tier != desktop_tier:
            tier_changes += 1

        if old_score != new_score or old_tier != desktop_tier:
            changes += 1

    print(f"Desktop corrections: {changes} score changes, {tier_changes} tier changes")
    print(f"Desktop cards: {len(desktop)}")

    # Save
    with open(os.path.join(DATA_DIR, "evaluations.json"), "w", encoding="utf-8") as f:
        json.dump(evals, f, ensure_ascii=False, indent=2)

    return evals


def prepare_cotd_batches():
    """Prepare batches of cards that need COTD-based re-evaluation."""
    with open(os.path.join(DATA_DIR, "evaluations.json"), "r", encoding="utf-8") as f:
        evals = json.load(f)

    with open(os.path.join(DATA_DIR, "desktop_evaluations.json"), "r", encoding="utf-8") as f:
        desktop = json.load(f)
    desktop_names = {d["name"] for d in desktop}

    with open(os.path.join(DATA_DIR, "cards_for_evaluation.json"), "r", encoding="utf-8") as f:
        cards_data = json.load(f)

    # Build COTD lookup
    cotd_lookup = {}
    card_info = {}
    for cat in ["corporations", "preludes", "project_cards"]:
        for c in cards_data.get(cat, []):
            card_info[c["name"]] = c
            cotd = c.get("cotd")
            if cotd and cotd.get("num_posts", 0) > 0:
                cotd_lookup[c["name"]] = cotd

    # Load tfmstats for sanity check
    with open(os.path.join(DATA_DIR, "tfmstats_card_option_stats.json"), "r", encoding="utf-8") as f:
        option_stats = json.load(f)
    tfm_lookup = {s.get("cardName", s.get("card", "")): s for s in option_stats}

    with open(os.path.join(DATA_DIR, "tfmstats_corp_rankings_3p.json"), "r", encoding="utf-8") as f:
        corp_stats = json.load(f)
    corp_stat_lookup = {s["corporation"]: s for s in corp_stats}

    with open(os.path.join(DATA_DIR, "tfmstats_prelude_rankings_3p.json"), "r", encoding="utf-8") as f:
        prelude_stats = json.load(f)
    prelude_stat_lookup = {s["prelude"]: s for s in prelude_stats}

    # Find cards that need COTD re-evaluation (no Desktop, has COTD)
    needs_eval = []
    for name in evals:
        if name in desktop_names:
            continue  # Already handled by Desktop
        if name in cotd_lookup:
            # Get card info
            info = card_info.get(name, {})
            cotd = cotd_lookup[name]

            # Get tfmstats if available
            tfm = tfm_lookup.get(name) or corp_stat_lookup.get(name) or prelude_stat_lookup.get(name)

            needs_eval.append({
                "name": name,
                "current_score": evals[name].get("score", 50),
                "current_tier": evals[name].get("tier", "C"),
                "type": info.get("type", "unknown"),
                "cost": info.get("cost", 0),
                "tags": info.get("tags", []),
                "description": info.get("description", ""),
                "expansion": info.get("expansion", ""),
                "cotd_comments": cotd.get("top_comments", [])[:8],
                "cotd_num_posts": cotd.get("num_posts", 0),
                "cotd_total_comments": cotd.get("total_comments", 0),
                "tfm_stats": tfm,
                "current_reasoning": evals[name].get("reasoning", ""),
            })

    print(f"Cards needing COTD re-evaluation: {len(needs_eval)}")

    # Split into batches of ~25
    batch_size = 25
    batches = []
    for i in range(0, len(needs_eval), batch_size):
        batch = needs_eval[i:i+batch_size]
        batches.append(batch)

    # Save batches
    for idx, batch in enumerate(batches):
        batch_path = os.path.join(DATA_DIR, f"reevaluation_batch_{idx}.json")
        with open(batch_path, "w", encoding="utf-8") as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(batches)} batches to data/reevaluation_batch_*.json")

    return batches


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "desktop":
        apply_desktop_corrections()
    elif len(sys.argv) > 1 and sys.argv[1] == "prepare":
        prepare_cotd_batches()
    else:
        print("Usage:")
        print("  python reevaluate_all.py desktop   - Apply Desktop corrections")
        print("  python reevaluate_all.py prepare    - Prepare COTD re-evaluation batches")
