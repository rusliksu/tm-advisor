#!/usr/bin/env python3
"""
Calibrate evaluations.json based on expert data from:
- BonelessDota (MARSterclass, 18 videos)
- ThreadPacifist (replays, 46 videos)

Format: 3P / WGT / All Expansions
Note: BonelessDota often evaluates for 2P, so 3P adjustments applied.
"""

import json
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "evaluations.json"

# --- Tier thresholds ---
def score_to_tier(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 35: return "D"
    return "F"


# --- Score adjustments ---
SCORE_ADJUSTMENTS = {
    # === UPGRADES ===
    "Spin-off Department": {
        "new_score": 92,
        "reasoning_append": " [BonelessDota] 'Literally broken, one of the best cards in the game.' Effect-based draw (triggers on 20+ MC cards) is strictly better than action-based draw. In GODMODE engine (card draw + discount), drew 30 cards over 7 generations. Card draw + discount = GODMODE pattern: the most powerful engine archetype.",
    },
    "Arctic Algae": {
        "new_score": 84,
        "reasoning_append": " [BonelessDota/ThreadPacifist] Both experts agree: 'too good even with 3 oceans already down', 'always take'. 2 plants per ocean placed by ANY player = massive value in 3P where ~9 oceans are placed. One of the best passive plant engines.",
    },
    "Indentured Workers": {
        "new_score": 82,
        "reasoning_append": " [BonelessDota] 'Literally always keep in opening hand.' The 8 MC discount with accumulated interest over the game = 5+ MC real value. The -1 VP is irrelevant early game (1 VP < 1 MC gen 1). One of the best opening hand cards.",
    },
    "Advanced Alloys": {
        "new_score": 74,
        "reasoning_append": " [ThreadPacifist] Pattern across multiple games: 'Advanced Alloys + mineral production = favorite to win.' Steel +1 and titanium +1 compound over entire game. Science tag adds engine value. Underrated enabler for building/space strategies.",
    },
    "Medical Lab": {
        "new_score": 72,
        "reasoning_append": " [BonelessDota] 'Magnificent with Robotic Workforce — one of the best combos in vanilla Mars.' Building tag synergy is the key. With 4+ building tags = 4+ VP for a cheap card. Strong in building-heavy engines.",
    },
    "Cartel": {
        "new_score": 75,
        "reasoning_append": " [BonelessDota] 'S-tier amplifier.' With 5+ Earth tags generates 5+ MC-prod for only 11 MC total cost. Resource amplifier that is cheaper than Jovian-based amplifiers. Excellent with Point Luna / Teractor / Earth Office ecosystem.",
    },
    "Mass Converter": {
        "new_score": 80,
        "reasoning_append": " [ThreadPacifist] 'Always take.' Enables Hi-Tech Lab (draw 6 cards), Physics Complex, and massive colony trading. Strong Science tag for engine. Key engine piece that transforms energy-poor games. Effect-based value (energy production) is permanent and game-changing.",
    },
    "Standard Technology": {
        "new_score": 77,
        "reasoning_append": " [BonelessDota] 'Maybe the best card for Colonies.' Colony SP = 14 MC (saves 3 MC), Greenery SP = 20 MC (saves 3 MC), City SP = 22 MC (saves 3 MC). Huge with Poseidon corporation. Consistent value that scales with standard project usage.",
    },
    "Penguins": {
        "new_score": 76,
        "reasoning_append": " [BonelessDota] 'Probably the best animal card' for Ecology Experts combo. Prelude timing advantage over Fish (available earlier in the draft cycle). Consistent VP generator with low requirement.",
    },
    "Meat Industry": {
        "new_score": 78,
        "reasoning_append": " [BonelessDota] S-tier in GODMODE engine. 'Can completely get out of control' with green tags generating animals. Each animal gained = 2 MC, compounding with Ecological Zone, Birds, Fish, Miranda colony.",
    },
    "Martian Rails": {
        "new_score": 72,
        "reasoning_append": " [BonelessDota] 'Slightly stronger than Immigrant City.' Key advantage: MC generated in the SAME generation (not next gen like production). No -1 MC-prod penalty unlike Immigrant City. With 4-5 cities generates 4-5 MC/action immediately. Reassessed upward — previous D-tier rating was based on slow meta, but in city-building games this is a solid action card.",
    },
    "Noctis City": {
        "new_score": 70,
        "reasoning_append": " [BonelessDota] 'Keep for LAST generation.' Power is in city placement + VP from adjacent greeneries, not the MC-prod. Even Anthracite (top player) agrees. On Tharsis: surprise city last gen with greenery adjacency = 3-5 VP swing.",
    },
    "Greenhouses": {
        "new_score": 68,
        "reasoning_append": " [BonelessDota] 'Deceptively strong. 8 cities = greenery for 6 MC. Perfect last gen play.' In 3P late game with 6-8 cities, this converts to a near-free greenery (1 TR + 1 VP). Steel payable makes it even cheaper.",
    },
    "Rover Construction": {
        "new_score": 72,
        "reasoning_append": " [BonelessDota] 'So cheap and so good, luxury card.' Passive 2 MC per any city placed. In 3P with 5-8 cities = 10-16 MC for an 11 MC steel-payable card. Excellent ROI when played gen 1-2.",
    },

    # === DOWNGRADES ===
    "GHG Producing Bacteria": {
        "new_score": 58,
        "reasoning_append": " [BonelessDota] 'Not very good' without combo pieces. Slow microbe accumulation (2 actions per TR). Only worthwhile with Extreme-Cold Fungus or Symbiotic Fungus feeding microbes. Standalone = trap. Previous B-tier rating was overgenerous.",
    },
    "Research Outpost": {
        "new_score": 87,
        "reasoning_append": " [ThreadPacifist] 'Not meaningfully better than Immigrant City' in late game. Still excellent but 90/S was overrated — Mars University (88) and Earth Catapult (88) provide comparable or better value. Adjusted to high A-tier.",
    },
}


# --- Player count notes (no score change, just reasoning update) ---
PLAYER_COUNT_NOTES = {
    "Toll Station": " [BonelessDota] Player count dependent: 'best card in 5P' where opponents play many space tags. In 3P = C-tier (fewer opponent tags), in 5P = A-tier. Current 3P score is appropriate.",
    "Satellites": " [BonelessDota] 'S-tier with goat (Saturn Systems).' In 3P with fewer space tags, value is lower. Score reflects 3P reality. Much stronger in 4-5P or with Saturn Systems/Phobolog.",
    "Miranda Resort": " [BonelessDota] 'S-tier with goat.' Cheap Jovian tag + MC-prod scaling. In 3P the Earth tag count is lower, keeping it in C-tier. In 4-5P with more Earth tags, jumps to B-tier.",
}


# --- GODMODE pattern notes (no score change, reasoning enrichment) ---
GODMODE_NOTES = {
    "Mars University": " [BonelessDota] Core GODMODE piece: 'never had a bad game with it.' Card draw + discount = the most powerful engine archetype. Effect-based draw > action-based draw.",
    "Olympus Conference": " [BonelessDota] 'Best card for card strategy.' Core GODMODE piece. Science tag draw accumulates over many plays. Effect-based draw > action-based draw.",
    "Earth Catapult": " [BonelessDota] S-tier GODMODE enabler. -2 MC on ALL cards is the strongest discount in the game. Card draw + discount = GODMODE pattern.",
    "Anti-Gravity Technology": " [BonelessDota] Top-tier greedy card. -2 MC on cards costing 15+ MC. Part of GODMODE engine when combined with card draw effects.",
    "AI Central": " [BonelessDota] A-S tier. Action-based draw (2 cards/gen) is powerful but strictly weaker than effect-based draw (Spin-off, Mars University) which triggers more often. Still a core engine card.",
    "Point Luna": " [BonelessDota] Effect-based draw on Earth tags. GODMODE piece with Earth Office discount. Triggers on every Earth tag played, not limited to once per generation.",
}


def main():
    # Load data
    if not DATA_FILE.exists():
        print(f"ERROR: {DATA_FILE} not found")
        sys.exit(1)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Loaded {len(data)} cards from {DATA_FILE.name}")
    print("=" * 70)

    changes = []
    not_found = []

    # --- Apply score adjustments ---
    for card_name, adj in SCORE_ADJUSTMENTS.items():
        if card_name not in data:
            not_found.append(card_name)
            continue

        card = data[card_name]
        old_score = card["score"]
        old_tier = card["tier"]
        new_score = adj["new_score"]
        new_tier = score_to_tier(new_score)

        card["score"] = new_score
        card["tier"] = new_tier
        card["reasoning"] += adj["reasoning_append"]

        direction = "UP" if new_score > old_score else "DOWN"
        changes.append({
            "name": card_name,
            "old_score": old_score,
            "old_tier": old_tier,
            "new_score": new_score,
            "new_tier": new_tier,
            "direction": direction,
        })

        print(f"  {direction:4s} | {card_name:30s} | {old_score}/{old_tier} -> {new_score}/{new_tier}")

    # --- Apply player count notes ---
    print("\n--- Player count notes (no score change) ---")
    for card_name, note in PLAYER_COUNT_NOTES.items():
        if card_name not in data:
            not_found.append(card_name)
            continue
        data[card_name]["reasoning"] += note
        print(f"  NOTE | {card_name:30s} | {data[card_name]['score']}/{data[card_name]['tier']} (reasoning updated)")

    # --- Apply GODMODE pattern notes ---
    print("\n--- GODMODE pattern notes (no score change) ---")
    for card_name, note in GODMODE_NOTES.items():
        if card_name not in data:
            not_found.append(card_name)
            continue
        data[card_name]["reasoning"] += note
        print(f"  NOTE | {card_name:30s} | {data[card_name]['score']}/{data[card_name]['tier']} (reasoning updated)")

    # --- Report not found ---
    if not_found:
        print(f"\n!!! Cards NOT FOUND in evaluations.json: {not_found}")

    # --- Save ---
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(data)} cards to {DATA_FILE.name}")

    # --- Summary ---
    print("\n" + "=" * 70)
    print(f"Score changes: {len(changes)}")
    upgrades = [c for c in changes if c["direction"] == "UP"]
    downgrades = [c for c in changes if c["direction"] == "DOWN"]
    print(f"  Upgrades:   {len(upgrades)}")
    print(f"  Downgrades: {len(downgrades)}")
    print(f"Player count notes: {len(PLAYER_COUNT_NOTES)}")
    print(f"GODMODE notes: {len(GODMODE_NOTES)}")

    # --- Tier distribution ---
    tier_counts = {}
    for card in data.values():
        t = card.get("tier", "?")
        tier_counts[t] = tier_counts.get(t, 0) + 1

    print(f"\nTier distribution (total {len(data)}):")
    for tier in ["S", "A", "B", "C", "D", "F"]:
        count = tier_counts.get(tier, 0)
        print(f"  {tier}: {count}")

    # --- Verify tier changes ---
    print("\nTier changes:")
    for c in changes:
        if c["old_tier"] != c["new_tier"]:
            print(f"  {c['name']:30s} | {c['old_tier']} -> {c['new_tier']}")


if __name__ == "__main__":
    main()
