"""Action Ordering Engine — prioritize actions within a generation.

Based on BonelessDota's TM Masterclass (Tip 13-15):
- EARLY: contested resources, milestones, attacks, plants→greenery
- LATE: MC-per-opponent-state cards, heat→temp, VP cards, stall actions
- Context-aware: opponent pass state, parameter thresholds, hand hiding

Each action gets a priority score (lower = do first).
"""

# ── Priority tiers ──
# 1-20: URGENT (contested, races)
# 21-40: HIGH (attacks, protection)
# 41-60: NORMAL (engine cards, production)
# 61-80: LOW (stall-beneficial, VP actions)
# 81-99: LAST (MC-per-opponent, heat→temp)

# Cards whose action value increases if done LAST in generation
LATE_ACTION_CARDS = {
    # MC based on opponent state — wait for opponents to play more
    "Toll Station",           # 1 MC per opponent Space tag
    "Galilean Waystation",    # 1 MC per opponent Jovian tag
    "Martian Rails",          # 1 MC per city on mars
    "Media Archives",         # 1 MC per opponent event
    "Aerosport Tournament",   # 2 MC per city (if 7+ floaters)
}

# Cards that should be HELD until last generation for maximum value
LAST_GEN_CARDS = {
    "Greenhouses",      # 1 plant per city (ALL incl. space) — 8-10 plants late = 1-2 greenery for 6 MC
    "Noctis City",      # City + 2 MC-prod. VP from city placement > slow MC-prod. Hold for late.
    "Insulation",       # Convert heat-prod to MC-prod. Play ONLY when temp maxed.
}

LAST_GEN_CARD_ADVICE = {
    "Greenhouses": {
        "play": "🌿 PLAY Greenhouses NOW: последний gen, max городов на карте!",
        "late": "⏳ Greenhouses: держи до последнего gen — каждый новый город = +1 plant. Сейчас рано.",
        "hold": "⏳ Greenhouses: HOLD — играй в последнем gen (8-10 plants от всех городов вкл. space)",
    },
    "Noctis City": {
        "play": "🏙️ PLAY Noctis City NOW: последний gen, city VP важнее будущего MC-prod!",
        "late": "⏳ Noctis City: держи до late game — поздний city placement обычно сильнее раннего +2 MC-prod.",
        "hold": "⏳ Noctis City: HOLD — city placement и adjacency VP обычно сильнее ближе к концу.",
    },
}

# Cards that are ALWAYS good to buy on draft (BonelessDota)
ALWAYS_BUY_CARDS = {
    "Indentured Workers",   # Makes expensive cards playable 1 gen earlier. ~5 MC effective discount.
    "Earth Catapult",       # -2 MC all cards. GODMODE enabler.
    "Anti-Gravity Technology",  # -2 MC all cards with req. GODMODE.
    "AI Central",           # Draw 2 cards/gen action. Best blue card.
    "Mars University",      # Card rotation per science tag.
}

# Broken combos to detect and boost
COMBO_PAIRS = {
    ("Viron", "AI Central"): 10,           # 4 cards/gen (activate AI Central twice)
    ("Earth Catapult", "Anti-Gravity Technology"): 8,  # -4 MC all cards = GODMODE
    ("Extreme-Cold Fungus", "Regolith Eaters"): 4,    # 1 free TR per 2 actions (weak but free)
    ("Extreme-Cold Fungus", "GHG Producing Bacteria"): 4,
}

# Cards/actions that should be done EARLY (contested or time-sensitive)
EARLY_ACTION_CARDS = {
    # Effect cards that trigger on opponent actions — play ASAP to accumulate
    "Pets",                   # +1 animal per opponent city
    "Immigrant City",         # +1 MC-prod per city placed
    "Rover Construction",     # +2 MC per city placed
    "Ecological Zone",        # +1 animal per green tag played
    "Decomposers",            # +1 microbe per animal/plant/microbe tag
    "Herbivores",             # +1 animal per greenery placed
    "Viral Enhancers",        # +1 plant/microbe/animal per tag played
}

# Attack cards — do early before opponents spend their resources
ATTACK_CARDS = {
    "Virus", "Predators", "Ants", "Birds", "Fish",
    "Energy Tapping", "Power Supply Consortium",
    "Hackers", "Great Escarpment Consortium",
    "Biomass Combustors", "Flooding",
    "Comet", "Giant Ice Asteroid", "Ice Asteroid",
    "Asteroid", "Big Asteroid", "Impactor Swarm",
}


def _reds_heat_context(state) -> tuple[bool, bool, bool]:
    turmoil = getattr(state, "turmoil", None) or {}
    if not isinstance(turmoil, dict):
        return False, False, False

    ruling = str(turmoil.get("ruling", "") or "")
    dominant = str(turmoil.get("dominant", "") or "")
    policy_ids = turmoil.get("policy_ids") or {}
    if not isinstance(policy_ids, dict):
        policy_ids = {}

    reds_now = "Reds" in ruling
    reds_coming = "Reds" in dominant and not reds_now
    reds_tax_policy = str(policy_ids.get("Reds", "") or "") == "rp01"
    return reds_now, reds_coming, reds_tax_policy


def prioritize_actions(state, available_actions: list[dict]) -> list[dict]:
    """Sort available actions by priority (lower = do first).

    Args:
        state: GameState
        available_actions: list of dicts with at least {type, name, ...}
            type: "play_card", "action_card", "trade", "standard_project",
                  "milestone", "award", "convert_plants", "convert_heat",
                  "sell_patents", "pass"

    Returns: same list sorted by priority, with added "priority" and "reason" fields.
    """
    me = state.me
    opponents_passed = _count_passed(state)
    all_passed = opponents_passed == len(state.opponents)

    results = []
    for action in available_actions:
        a_type = action.get("type", "")
        a_name = action.get("name", "")
        priority, reason = _score_action(a_type, a_name, state, me, opponents_passed, all_passed)
        results.append({**action, "priority": priority, "reason": reason})

    results.sort(key=lambda x: x["priority"])
    return results


def get_action_advice(state) -> list[str]:
    """Generate action ordering advice lines for current state."""
    me = state.me
    advice = []
    opponents_passed = _count_passed(state)

    # 1. Colony trade contested check
    if state.colonies_data and me.fleet_size > me.trades_this_gen:
        contested_colonies = []
        for col in state.colonies_data:
            # Colony with high track = valuable = contested
            if col.get("track", 0) >= 4:
                contested_colonies.append(col["name"])
        if contested_colonies and opponents_passed == 0:
            advice.append(
                f"⚡ Trade FIRST: {', '.join(contested_colonies[:2])} "
                f"(contested — opponents haven't passed)")

    # 2. Plants → greenery before asteroids
    if me.plants >= (7 if "EcoLine" in (me.corp or "") else 8):
        # Check if opponents have asteroid/comet cards
        opp_could_attack = False
        for opp in state.opponents:
            if hasattr(opp, 'cards_in_hand_n') and opp.cards_in_hand_n > 3:
                opp_could_attack = True  # rough heuristic
        if opp_could_attack:
            advice.append("🌿 Greenery EARLY: трать plants до потенциальных астероидов")

    # 3. Milestone/Award race
    if state.milestones:
        for m in state.milestones:
            scores = m.get("scores", {})
            my_score = scores.get(me.color, 0)
            if isinstance(my_score, dict):
                claimable = my_score.get("claimable", False)
            else:
                claimable = False
            if claimable and me.mc >= 8:
                advice.append(f"🏆 Milestone {m['name']} FIRST: заяви пока не забрали!")

    # 4. Late actions
    late_in_tableau = []
    for tc in me.tableau:
        tc_name = tc["name"] if isinstance(tc, dict) else str(tc)
        if tc_name in LATE_ACTION_CARDS:
            disabled = tc.get("isDisabled", False) if isinstance(tc, dict) else False
            if not disabled:
                late_in_tableau.append(tc_name)
    if late_in_tableau:
        advice.append(
            f"⏳ STALL: {', '.join(late_in_tableau)} — "
            f"делай последними (MC растёт пока оппоненты играют)")

    # 5. Heat → temperature with threshold awareness
    if me.heat >= 8 and state.temperature < 8:
        temp = state.temperature
        next_temp = temp + 2
        bonus_at_next = next_temp in (-24, -20, 0)
        reds_now, reds_coming, reds_tax_policy = _reds_heat_context(state)

        if reds_now:
            if reds_tax_policy:
                advice.append(
                    "🌡️ Heat→temp: Reds tax active (+3 MC/TR). "
                    "Не автоконверти; делай только если VP/темп/threshold окупают налог")
            else:
                advice.append(
                    "🌡️ Heat→temp: Reds ruling — проверь policy перед temp raise")
        elif bonus_at_next:
            bonus_type = 'ocean' if next_temp in (-24, 0) else 'heat-prod'
            advice.append(
                f"🌡️ Heat→temp FIRST! Бонус на {next_temp}°C ({bonus_type}). "
                f"Забери до оппонента!")
        elif reds_coming:
            if reds_tax_policy:
                advice.append(
                    "🌡️ Heat→temp BEFORE Reds tax: Reds будут ruling, "
                    "лучше конвертировать до +3 MC/TR налога")
            else:
                advice.append(
                    "🌡️ Heat→temp: Reds будут ruling — не затягивай без причины; "
                    "проверь следующую policy")
        elif opponents_passed == 0:
            advice.append(
                "🌡️ Heat→temp: затягивай (может помочь оппонентам с requirements). "
                "Делай после других действий или после pass оппонентов")
        else:
            advice.append("🌡️ Heat→temp: оппоненты спасовали — безопасно поднимать")

    # 6. Last-gen cards — hold in hand until final generation
    gens_left = getattr(state, "_gens_left", None)
    if gens_left is None:
        try:
            from .analysis import _estimate_remaining_gens
            gens_left = _estimate_remaining_gens(state)
        except Exception:
            gens_left = max(1, 9 - getattr(state, "generation", 8))
    state._gens_left = gens_left

    if state.cards_in_hand:
        for card in state.cards_in_hand:
            if card["name"] in LAST_GEN_CARDS:
                if card["name"] == "Insulation":
                    continue
                card_advice = LAST_GEN_CARD_ADVICE.get(card["name"])
                if not card_advice:
                    continue
                if gens_left <= 1:
                    advice.append(card_advice["play"])
                elif gens_left <= 2:
                    advice.append(card_advice["late"])
                else:
                    advice.append(card_advice["hold"])

    # 7b. Insulation timing — convert heat-prod to MC-prod when temp maxed
    if state.cards_in_hand:
        for card in state.cards_in_hand:
            if card["name"] == "Insulation":
                temp = getattr(state, 'temperature', -30)
                heat_prod = getattr(me, 'heat_prod', 0)
                if temp >= 8 and heat_prod >= 2:
                    advice.append(
                        f"🔥 PLAY Insulation NOW! Temp maxed, heat-prod {heat_prod} → MC-prod. "
                        f"Каждый heat-prod = бесполезен, конвертируй!")
                elif temp < 8:
                    advice.append(
                        f"⏳ Insulation: HOLD — temp ещё не maxed ({temp}°C). "
                        f"Heat-prod ещё полезен для temp raises.")

    # 7c. Combo alerts
    if state.cards_in_hand and state.me and state.me.tableau:
        tab_names = {c["name"] if isinstance(c, dict) else str(c) for c in state.me.tableau}
        hand_names = {c["name"] for c in state.cards_in_hand}
        for (a, b), bonus in COMBO_PAIRS.items():
            if a in tab_names and b in hand_names:
                advice.append(f"🔗 COMBO: {b} + {a} в tableau! Играй {b} ASAP (+{bonus} value)")
            elif b in tab_names and a in hand_names:
                advice.append(f"🔗 COMBO: {a} + {b} в tableau! Играй {a} ASAP (+{bonus} value)")

    # 7. Effect cards — play early to accumulate triggers
    if state.cards_in_hand:
        for card in state.cards_in_hand:
            if card["name"] in EARLY_ACTION_CARDS:
                cost = card.get("cost", card.get("calculatedCost", 0))
                if cost <= me.mc:
                    advice.append(
                        f"🎯 Play {card['name']} EARLY: "
                        f"trigger-карта, каждый ход оппонентов = бонус")

    # 8. Rover Construction before cities — play trigger before placing cities
    if state.cards_in_hand:
        rover_in_hand = any(c["name"] == "Rover Construction" for c in state.cards_in_hand)
        if rover_in_hand:
            city_cards = [c["name"] for c in state.cards_in_hand
                          if c["name"] != "Rover Construction"
                          and _card_places_city(c)]
            if city_cards:
                advice.append(
                    f"🏗️ Rover Construction ПЕРЕД городами! "
                    f"Сначала Rover, потом {', '.join(city_cards[:2])} (+2 MC за каждый город)")

    # 13. City SP before Greenery SP mid-game
    gens_left_sp = max(1, 9 - state.generation) if hasattr(state, 'generation') else 3
    if gens_left_sp >= 2 and me.mc >= 41:  # 25 city + 23 greenery or 18 aquifer + 23 greenery
        my_greeneries = sum(1 for s in state.spaces
                            if s.get("tileType") == 0 and s.get("color") == me.color)
        my_cities = sum(1 for s in state.spaces
                        if s.get("tileType") == 2 and s.get("color") == me.color)
        if my_greeneries >= 2 and my_cities <= 1:
            advice.append(
                "🏙️ SP City ПЕРЕД SP Greenery: город рядом с greeneries даёт adjacency VP. "
                "Greenery next to city = 2-3 VP.")

    return advice


def _score_action(a_type, a_name, state, me, opponents_passed, all_passed):
    """Score a single action. Lower = higher priority."""

    # Milestones — always first
    if a_type == "milestone":
        return 5, "contested — claim before opponents"

    # Award funding — early-mid
    if a_type == "award":
        return 15, "lock VP before price increase"

    # Colony trade — contested resource
    if a_type == "trade":
        if opponents_passed == 0:
            return 10, "contested — trade before opponents"
        else:
            return 45, "opponents passed, trade anytime"

    # Plants → greenery — protect from asteroids
    if a_type == "convert_plants":
        if opponents_passed == 0:
            return 20, "greenery before potential asteroids"
        else:
            return 50, "safe to greenery (opponents passed)"

    # Play card
    if a_type == "play_card":
        # Attack cards — early
        if a_name in ATTACK_CARDS:
            # Energy steal: if opponent has 1 prod, steal now. If 3+, wait for pass.
            if a_name in ("Energy Tapping", "Power Supply Consortium"):
                # Check if any opponent has exactly 1 energy prod
                min_opp_en = min((o.energy_prod for o in state.opponents), default=0)
                if min_opp_en <= 1:
                    return 25, "steal energy NOW (opponent has only 1)"
                else:
                    return 70, "energy steal — wait for opponent to pass"
            return 25, "attack card — use before opponents spend resources"

        # Effect/trigger cards — early to accumulate
        if a_name in EARLY_ACTION_CARDS:
            return 30, "trigger card — play early to accumulate bonuses"

        # Last-gen cards — hold or play depending on timing
        if a_name in LAST_GEN_CARDS:
            return 90, "HOLD for last gen — value scales with total cities"

        # Normal cards
        return 50, "standard play"

    # Action cards on tableau
    if a_type == "action_card":
        if a_name in LATE_ACTION_CARDS:
            return 85, "MC scales with opponent state — do last"
        return 55, "standard action"

    # Heat → temperature — stall
    if a_type == "convert_heat":
        if opponents_passed == 0:
            return 80, "stall — may help opponents with requirements"
        else:
            return 40, "opponents passed — safe to raise temp"

    # Standard projects — City SP before Greenery SP (rule 13)
    if a_type == "standard_project":
        if "city" in a_name.lower():
            return 55, "city SP before greenery SP — adjacency VP"
        if "greenery" in a_name.lower():
            return 62, "greenery SP — place after cities for adjacency"
        if "aquifer" in a_name.lower() or "ocean" in a_name.lower():
            return 63, "aquifer SP — expensive, cards that give oceans are cheaper"
        return 60, "standard project"

    # Sell patents
    if a_type == "sell_patents":
        return 90, "sell last"

    # Pass
    if a_type == "pass":
        return 99, "pass"

    return 50, ""


def _card_places_city(card: dict) -> bool:
    """Check if a card places a city (by name or description heuristic)."""
    CITY_CARDS = {
        "Noctis City", "Open City", "Capital", "Immigrant City",
        "Corporate Stronghold", "Urbanized Area", "Dome Farming",
        "Rad-Chem Factory", "Space Station", "Ganymede Colony",
        "Maxwell Base", "Stratopolis", "Domed Crater",
        "Self-Sufficient Settlement", "Refugee Camps",
    }
    name = card.get("name", "")
    if name in CITY_CARDS:
        return True
    desc = card.get("description", "")
    if isinstance(desc, dict):
        desc = desc.get("text", "")
    return bool(desc and "place a city" in str(desc).lower())


def _count_passed(state) -> int:
    """Count how many opponents have passed this generation."""
    passed = 0
    if hasattr(state, 'passed_players'):
        passed = len(state.passed_players or [])
    return passed
