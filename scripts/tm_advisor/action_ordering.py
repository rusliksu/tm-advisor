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
    "Greenhouses",            # 1 MC per greenery on mars (inc. opponents')
    "Media Archives",         # 1 MC per opponent event
    "Aerosport Tournament",   # 2 MC per city (if 7+ floaters)
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

    # 5. Heat → temperature stalling
    if me.heat >= 8 and state.temperature < 8:
        # Check if raising temp helps opponents
        temp_helps_opp = False
        for opp in state.opponents:
            # Rough: if opponent has cards with temp requirements
            # We can't check their hand, but if they have plant prod
            # and we'd raise temp to unlock plant requirements...
            pass  # Complex to check without opponent hand data
        if opponents_passed == 0:
            advice.append(
                "🌡️ Heat→temp: затягивай (может помочь оппонентам с requirements). "
                "Делай после других действий или после pass оппонентов")

    # 6. Effect cards — play early to accumulate triggers
    if state.cards_in_hand:
        for card in state.cards_in_hand:
            if card["name"] in EARLY_ACTION_CARDS:
                cost = card.get("cost", card.get("calculatedCost", 0))
                if cost <= me.mc:
                    advice.append(
                        f"🎯 Play {card['name']} EARLY: "
                        f"trigger-карта, каждый ход оппонентов = бонус")

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

    # Standard projects
    if a_type == "standard_project":
        return 60, "standard project"

    # Sell patents
    if a_type == "sell_patents":
        return 90, "sell last"

    # Pass
    if a_type == "pass":
        return 99, "pass"

    return 50, ""


def _count_passed(state) -> int:
    """Count how many opponents have passed this generation."""
    passed = 0
    if hasattr(state, 'passed_players'):
        passed = len(state.passed_players or [])
    return passed
