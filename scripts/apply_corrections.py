#!/usr/bin/env python3
"""
Apply manual corrections to evaluations.json based on:
- Desktop manual tier lists
- tfmstats 3P win rates and elo data
- Combined analysis

Updates scores, tiers, and adds correction notes to reasoning.
"""

import json
import os
import sys
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
EVAL_FILE = os.path.join(DATA_DIR, "evaluations.json")


def get_tier(score):
    """Determine tier from score."""
    if score >= 90:
        return "S"
    elif score >= 80:
        return "A"
    elif score >= 70:
        return "B"
    elif score >= 55:
        return "C"
    elif score >= 35:
        return "D"
    else:
        return "F"


# All corrections: name -> (new_score, new_tier, reason)
# new_tier is explicit to match user's specification (may differ from get_tier in edge cases)
CORPORATION_CORRECTIONS = {
    "Vitor": (90, "S", "Desktop S #3, 38.9% WR in 3P (top 5), free award + 3 MC per VP card"),
    "Tharsis Republic": (68, "C", "Desktop C #15, only 39.5% WR despite popularity, WGT devalues city income"),
    "CrediCor": (78, "B", "Desktop B #10, 39.8% WR solid but not elite, 57MC start good but ability narrow"),
    "Interplanetary Cinematics": (80, "A", "Desktop B but 40.9% WR highest in 3P, steel discount strong"),
    "Aridor": (82, "A", "Desktop A #5, 52.4% WR massive outlier, colony placement insane value"),
    "EcoLine": (82, "A", "Keep A, Desktop A #7, 35.8% WR mediocre but strong with green cards"),
    "Helion": (65, "C", "Desktop C #16, 25.3% WR terrible, heat-as-MC worse than it seems"),
    "PhoboLog": (65, "C", "Desktop B #12 but only 24.6% WR, titanium narrow"),
    "Mining Guild": (62, "C", "31.8% WR confirms C-tier"),
    "Robinson Industries": (52, "D", "Desktop D #25, 26.8% WR, 4MC per action terrible efficiency"),
    "Valley Trust": (76, "B", "Desktop B #9, 34.9% WR ok, 3rd prelude very strong"),
    "Saturn Systems": (68, "C", "Desktop C #17 but 37.2% WR decent, Jovian synergy"),
    "Polyphemos": (55, "C", "Desktop D but 58.3% WR insane outlier, small sample but cards cost 5 is less bad than thought"),
    "Arklight": (52, "D", "Desktop D #27, 18.8% WR abysmal"),
    "United Nations Mars Initiative": (40, "D", "Desktop D #24, 18.6% WR confirms trash"),
    "Inventrix": (56, "C", "26.1% WR very poor"),
    "Poseidon": (72, "B", "Desktop not mentioned but 32.0% WR terrible for A-tier, downgrade"),
    "Stormcraft Incorporated": (58, "C", "Desktop C #18, 28.6% WR below average"),
}

PRELUDE_CORRECTIONS = {
    "Business Empire": (88, "S", "Desktop S, 39.4% WR strong, +6 MC prod is best pure economy prelude"),
    "Metals Company": (86, "A", "Desktop S ~30MC value, 40.1% WR good"),
    "Supply Drop": (84, "A", "Desktop A, 45.0% WR top 2 prelude! Immediate resources extremely valuable"),
    "Allied Bank": (82, "A", "Desktop A, 39.9% WR strong, 3MC + 4 MC prod + Earth tag"),
    "Biolab": (72, "B", "36.4% WR decent"),
    "Power Generation": (68, "C", "Desktop A but 27.7% WR terrible! Energy production overvalued in stats"),
    "Eccentric Sponsor": (70, "B", "Desktop C but 40.9% WR top 6! Playing free card gen1 = massive tempo"),
    "Supplier": (72, "B", "Desktop A, 32.7% WR ok"),
    "Mining Operations": (72, "B", "Desktop A, 38.6% WR strong, +2 steel prod + 4 steel"),
    "Dome Farming": (68, "C", "Desktop B, 34.3% WR ok"),
    "Loan": (55, "C", "Desktop B ~18.6MC but 20.6% WR terrible - compromise at C"),
    "Mohole Excavation": (52, "D", "Desktop C, 29.6% WR poor"),
    "Biofuels": (45, "D", "Desktop B but 24.9% WR bad"),
    "Society Support": (28, "F", "Desktop D, 14.9% WR worst prelude confirms F"),
    "Ecology Experts": (68, "C", "33.2% WR barely average"),
    "Orbital Construction Yard": (58, "C", "33.5% WR average"),
    "Great Aquifer": (88, "S", "45.4% WR #1 prelude in 3P! 2 oceans instant value, instant TR"),
}

PROJECT_CARD_CORRECTIONS = {
    "Earth Office": (90, "S", "Desktop S, +1.43 elo top-5, -3 MC on all Earth cards game-changing"),
    "Advanced Alloys": (85, "A", "Desktop S, +1.03 elo, steel+ti both +1 MC is huge"),
    "Ecological Zone": (88, "A", "Desktop S, +0.80 elo, self-triggering animal engine"),
    "Space Elevator": (80, "A", "+0.85 elo, 3P ti prod + card draw"),
    "Atmo Collectors": (70, "B", "+1.17 elo massive underrate, flexible resource conversion"),
    "Urban Decomposers": (75, "B", "+1.15 elo, strong with cities"),
    "Floater Technology": (72, "B", "+1.03 elo"),
    "Titan Shuttles": (76, "B", "+1.01 elo"),
    "Mining Rights": (76, "B", "+0.82 elo, cheap building tag + production"),
    "Development Center": (72, "B", "+0.80 elo, card draw engine"),
    "Space Port": (85, "A", "+1.66 elo highest in game!"),
    "Ice Moon Colony": (82, "A", "+1.54 elo, top 2"),
    "Lunar Exports": (80, "A", "+1.44 elo"),
    "Rim Freighters": (78, "B", "+1.42 elo"),
    "Quantum Communications": (80, "A", "+1.38 elo"),
    "Mass Converter": (80, "A", "+0.88 elo"),
    "Media Group": (80, "A", "+0.88 elo, Desktop A"),
    "Interplanetary Colony Ship": (78, "B", "+0.81 elo"),
    "Arctic Algae": (83, "A", "+0.80 elo, Desktop A"),
    "Conscription": (72, "B", "+0.36 elo low, Desktop A but stats say B"),
    "Trade Envoys": (70, "B", "+0.27 elo low for B-tier"),
    "Luna Governor": (68, "C", "+0.12 elo very low"),
    "Research Coordination": (68, "C", "+0.34 elo low"),
    "Martian Zoo": (64, "C", "-0.07 elo negative"),
    "Lunar Mining": (65, "C", "-0.39 elo negative"),
    "Standard Technology": (82, "A", "Desktop A, strong with standard projects"),
    "Penguins": (80, "A", "Desktop A, no plant-prod penalty unlike Birds"),
    "Predators": (78, "B", "Desktop A, animal theft"),
    "Cartel": (78, "B", "Desktop A, self-counting Earth tag"),
    "Mohole Area": (75, "B", "Desktop A, 4 heat prod + building tag"),
    "Optimal Aerobraking": (82, "A", "+0.83 elo, Desktop A confirms"),
    "Deimos Down": (84, "A", "+1.03 elo, Desktop A confirms strong"),
    "Corporate Stronghold": (48, "D", "Desktop D, worst city in game"),
    "Aquifer Pumping": (45, "D", "Desktop D, worse than standard project"),
    "Security Fleet": (40, "D", "Desktop D confirms"),
    "Carbonate Processing": (48, "D", "Desktop D, energy loss kills value"),
    "Black Polar Dust": (48, "D", "Desktop D, -2 MC prod devastating"),
    "Dust Seals": (38, "D", "Desktop D, terrible VP per MC"),
    "Underground Detonations": (38, "D", "Desktop D, one of worst cards"),
    "Biomass Combustors": (42, "D", "Desktop D"),
    "Equatorial Magnetizer": (42, "D", "Desktop D"),
    "Asteroid Hollowing": (42, "D", "Desktop D"),
    "Public Plans": (75, "B", "Desktop A! Showing hand = 1 MC/card + 1 VP, very cheap"),
    "Kaguya Tech": (80, "A", "Desktop A, greenery->city conversion + 2MC prod"),
    "Ganymede Colony": (78, "B", "Desktop A, VP per Jovian"),
    "Phobos Space Haven": (48, "D", "Desktop D"),
    "Forced Precipitation": (42, "D", "Desktop D"),
    "Colonizer Training Camp": (62, "C", "Desktop C, early VP bad"),
    "Diversity Support": (55, "C", "Desktop C confirms"),
    "Magnetic Field Dome": (42, "D", "Desktop D"),
    "Topsoil Contract": (76, "B", "Desktop A"),
    "Sulphur-Eating Bacteria": (76, "B", "Desktop A"),
    "Power Supply Consortium": (65, "C", "Desktop A but stats only +0.46 elo"),
    "Adapted Lichen": (58, "C", "Desktop C confirms"),
    "Caretaker Contract": (58, "C", "Desktop C"),
}


def apply_corrections():
    """Load evaluations, apply all corrections, save back."""

    # Load current evaluations
    print(f"Loading evaluations from {EVAL_FILE}...")
    with open(EVAL_FILE, "r", encoding="utf-8") as f:
        evaluations = json.load(f)

    total_cards = len(evaluations)
    print(f"Loaded {total_cards} card evaluations.\n")

    # Combine all corrections
    all_corrections = {}
    all_corrections.update(CORPORATION_CORRECTIONS)
    all_corrections.update(PRELUDE_CORRECTIONS)
    all_corrections.update(PROJECT_CARD_CORRECTIONS)

    print(f"Total corrections to apply: {len(all_corrections)}")
    print(f"  Corporations: {len(CORPORATION_CORRECTIONS)}")
    print(f"  Preludes: {len(PRELUDE_CORRECTIONS)}")
    print(f"  Project cards: {len(PROJECT_CARD_CORRECTIONS)}")
    print()

    # Track changes
    applied = []
    not_found = []
    no_change = []

    for name, (new_score, new_tier, reason) in all_corrections.items():
        if name not in evaluations:
            not_found.append(name)
            print(f"  WARNING: '{name}' not found in evaluations!")
            continue

        card = evaluations[name]
        old_score = card.get("score", "N/A")
        old_tier = card.get("tier", "N/A")

        if old_score == new_score and old_tier == new_tier:
            no_change.append(name)
            continue

        # Apply correction
        card["score"] = new_score
        card["tier"] = new_tier

        # Append correction note to reasoning
        correction_note = f" [CORRECTED: {old_score}/{old_tier} -> {new_score}/{new_tier}. {reason}]"
        if "reasoning" in card:
            card["reasoning"] += correction_note
        else:
            card["reasoning"] = correction_note.strip()

        applied.append({
            "name": name,
            "old_score": old_score,
            "old_tier": old_tier,
            "new_score": new_score,
            "new_tier": new_tier,
            "reason": reason,
        })

    # Print summary
    print("=" * 80)
    print("SUMMARY OF CORRECTIONS")
    print("=" * 80)

    if applied:
        print(f"\n--- APPLIED ({len(applied)} changes) ---\n")

        # Group by category
        corp_names = set(CORPORATION_CORRECTIONS.keys())
        prelude_names = set(PRELUDE_CORRECTIONS.keys())
        project_names = set(PROJECT_CARD_CORRECTIONS.keys())

        for category, names_set in [
            ("CORPORATIONS", corp_names),
            ("PRELUDES", prelude_names),
            ("PROJECT CARDS", project_names),
        ]:
            category_changes = [c for c in applied if c["name"] in names_set]
            if category_changes:
                print(f"  {category}:")
                for c in sorted(category_changes, key=lambda x: x["new_score"], reverse=True):
                    direction = ""
                    if c["new_score"] > c["old_score"]:
                        direction = f"+{c['new_score'] - c['old_score']}"
                    elif c["new_score"] < c["old_score"]:
                        direction = f"{c['new_score'] - c['old_score']}"
                    else:
                        direction = "0 (tier change only)"

                    print(f"    {c['name']:40s} {c['old_score']:>3}/{c['old_tier']} -> {c['new_score']:>3}/{c['new_tier']}  ({direction:>4})  {c['reason']}")
                print()

    if no_change:
        print(f"\n--- NO CHANGE NEEDED ({len(no_change)} cards) ---")
        for name in sorted(no_change):
            print(f"    {name}")
        print()

    if not_found:
        print(f"\n--- NOT FOUND ({len(not_found)} cards) ---")
        for name in sorted(not_found):
            print(f"    WARNING: {name}")
        print()

    # Save
    print("=" * 80)

    if not applied:
        print("No changes to save.")
        return

    # Backup
    backup_file = EVAL_FILE + ".backup"
    print(f"Creating backup at {backup_file}...")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(evaluations, f, indent=2, ensure_ascii=False)

    # Save updated evaluations
    print(f"Saving {len(applied)} corrections to {EVAL_FILE}...")
    with open(EVAL_FILE, "w", encoding="utf-8") as f:
        json.dump(evaluations, f, indent=2, ensure_ascii=False)

    print(f"\nDone! {len(applied)} cards updated, {len(no_change)} unchanged, {len(not_found)} not found.")

    # Stats summary
    tier_counts = {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for card in evaluations.values():
        tier = card.get("tier", "?")
        if tier in tier_counts:
            tier_counts[tier] += 1

    print(f"\nFinal tier distribution ({total_cards} cards):")
    for tier in ["S", "A", "B", "C", "D", "F"]:
        print(f"  {tier}: {tier_counts[tier]} cards")


if __name__ == "__main__":
    apply_corrections()
