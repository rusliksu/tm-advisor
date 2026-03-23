"""Утилиты анализа: стратегия, алерты, VP-оценки, прогнозы, цепочки действий."""

import re

from .constants import TILE_GREENERY, TILE_CITY, TILE_OCEAN, TABLEAU_REBATES, GLOBAL_EVENTS, PARTY_POLICIES, PARTY_STRATEGY, GLOBAL_EVENT_ADVICE, COLONY_TIERS
from .economy import resource_values, game_phase
from .map_advisor import _get_neighbors


def _detect_strategy(player) -> str:
    """Определить стратегию игрока по тегам, корпорации и production."""
    tags = player.tags
    parts = []

    # Dominant tags
    tag_counts = sorted(tags.items(), key=lambda x: x[1], reverse=True)
    top_tags = [(t, n) for t, n in tag_counts if n >= 3 and t not in ("event", "wild")]

    # Corp-based strategy
    corp = player.corp.lower() if player.corp else ""
    if "thorgate" in corp:
        parts.append("Energy engine")
    elif "ecoline" in corp or "arklight" in corp:
        parts.append("Bio engine")
    elif "point luna" in corp or "teractor" in corp:
        parts.append("Earth cards")
    elif "phobolog" in corp:
        parts.append("Space/Ti")
    elif "credicor" in corp:
        parts.append("Big cards")
    elif "pharmacy" in corp:
        parts.append("Science/cards")
    elif "tharsis" in corp:
        parts.append("Cities/MC")
    elif "morning star" in corp:
        parts.append("Venus")
    elif "splice" in corp:
        parts.append("Microbe")
    elif "interplanetary" in corp:
        parts.append("Events")
    elif "mining guild" in corp:
        parts.append("Building/Steel")
    elif "inventrix" in corp:
        parts.append("Flexible/req-free")
    elif "robinson" in corp:
        parts.append("Production engine")
    elif "helion" in corp:
        parts.append("Heat→MC")

    # Production-based
    if player.plant_prod >= 4:
        parts.append(f"Plant machine ({player.plant_prod}/gen)")
    if player.energy_prod >= 5:
        parts.append(f"Energy {player.energy_prod}/gen")
    if player.heat_prod >= 4:
        parts.append(f"Heat→TR ({player.heat_prod}/gen)")
    if player.ti_prod >= 3:
        parts.append(f"Ti prod {player.ti_prod}")

    # Tag specialization
    for t, n in top_tags[:2]:
        if t not in ("building",):  # building is generic
            parts.append(f"{t}×{n}")

    # Card accumulator
    if player.cards_in_hand_n >= 15:
        parts.append(f"Hoarding {player.cards_in_hand_n} cards")

    # Threats
    if player.tr >= 30:
        parts.append(f"TR lead ({player.tr})")

    return " │ ".join(parts[:4]) if parts else "Непонятная стратегия"


def _generate_alerts(state) -> list[str]:
    """Генерирует контекстные алерты — самые важные действия прямо сейчас."""
    alerts = []
    me = state.me
    mc = me.mc

    # === Milestones ===
    for m in state.milestones:
        if m["claimed_by"]:
            continue
        my_score = m["scores"].get(me.color, {})
        if isinstance(my_score, dict) and my_score.get("claimable", False):
            claimed_count = sum(1 for mi in state.milestones if mi["claimed_by"])
            if claimed_count < 3 and mc >= 8:
                alerts.append(f"🏆 ЗАЯВИ {m['name']}! (8 MC = 5 VP)")

    # === Opponent milestone warnings ===
    cn = state.color_names
    claimed_total = sum(1 for mi in state.milestones if mi["claimed_by"])
    if claimed_total < 3:
        for m in state.milestones:
            if m["claimed_by"]:
                continue
            my_score = m["scores"].get(me.color, {})
            my_claimable = isinstance(my_score, dict) and my_score.get("claimable", False)
            for color, score_info in m["scores"].items():
                if color == me.color:
                    continue
                if isinstance(score_info, dict) and score_info.get("claimable"):
                    opp_name = cn.get(color, color)
                    if my_claimable and mc >= 8:
                        alerts.append(
                            f"⚠️ {opp_name} тоже может заявить {m['name']}! Успей первым!")
                    elif not my_claimable:
                        alerts.append(
                            f"⚠️ {opp_name} может заявить {m['name']}!")
                    break

    # === Awards ===
    funded_count = sum(1 for a in state.awards if a["funded_by"])
    gens_left_aw = _estimate_remaining_gens(state)
    phase_aw = game_phase(gens_left_aw, state.generation)
    if funded_count < 3:
        cost = [8, 14, 20][funded_count]
        if mc >= cost:
            best_award = None
            best_lead = 0
            for a in state.awards:
                if a["funded_by"]:
                    continue
                my_val = a["scores"].get(me.color, 0)
                opp_max = max((v for c, v in a["scores"].items() if c != me.color), default=0)
                lead = my_val - opp_max
                if lead > best_lead:
                    best_lead = lead
                    best_award = a
            # Award timing: early = risky (opponents catch up), late = safe lock
            min_lead = {"early": 8, "mid": 5, "late": 3, "endgame": 1}.get(phase_aw, 5)
            if best_award and best_lead >= min_lead:
                timing_note = {
                    "early": f"Рано! Лид +{best_lead} может растаять. Фондируй только если уверен.",
                    "mid": f"Хороший момент — лид +{best_lead}, оппоненты ещё могут догнать.",
                    "late": f"Фондируй сейчас — лид +{best_lead} уже надёжный.",
                    "endgame": f"ПОСЛЕДНИЙ ШАНС фондировать! +{best_lead} лид.",
                }.get(phase_aw, "")
                # Check if opponent could block by funding same award
                opp_can_fund = False
                for opp in state.opponents:
                    if opp.mc >= cost:
                        for a2 in state.awards:
                            if a2["funded_by"]:
                                continue
                            opp_val = a2["scores"].get(opp.color, 0)
                            my_val2 = a2["scores"].get(me.color, 0)
                            if opp_val > my_val2 and a2["name"] == best_award["name"]:
                                pass  # they wouldn't fund an award I lead
                            elif opp_val > my_val2:
                                opp_can_fund = True
                block_note = " Оппонент может фондировать свой award!" if opp_can_fund else ""
                alerts.append(
                    f"💰 ФОНДИРУЙ {best_award['name']}! "
                    f"({cost} MC, лид +{best_lead}) {timing_note}{block_note}")
            elif best_award and best_lead > 0 and phase_aw == "endgame":
                # Endgame: even small lead worth funding
                alerts.append(
                    f"💰 {best_award['name']}: лид +{best_lead}. "
                    f"Endgame — фондируй за {cost} MC, 5 VP почти гарантированы.")

    # === Turmoil look-ahead ===
    reds_now = (state.turmoil and "Reds" in str(state.turmoil.get("ruling", "")))
    reds_coming = False
    if state.turmoil:
        dominant = str(state.turmoil.get("dominant", ""))
        reds_coming = "Reds" in dominant and not reds_now

    gens_left_conv = _estimate_remaining_gens(state)

    # === Award opponent threat ===
    if funded_count < 3:
        cost = [8, 14, 20][funded_count]
        for a in state.awards:
            if a["funded_by"]:
                continue
            my_val = a["scores"].get(me.color, 0)
            opp_scores = [(c, v) for c, v in a["scores"].items() if c != me.color]
            for opp_color, opp_val in opp_scores:
                opp_name = cn.get(opp_color, opp_color)
                opp_mc = 0
                for o in state.opponents:
                    if o.color == opp_color:
                        opp_mc = o.mc
                        break
                # Opponent leads AND has MC to fund
                if opp_val > my_val and opp_val > 0 and opp_mc >= cost:
                    lead = opp_val - my_val
                    alerts.append(
                        f"⚠️ {opp_name} лидирует в {a['name']} (+{lead}) "
                        f"и может фондить ({opp_mc} MC >= {cost})!")
                    break
            # I funded this award but opponent is catching up
            if a.get("funded_by") == me.color:
                for opp_color, opp_val in opp_scores:
                    if opp_val >= my_val and opp_val > 0:
                        opp_name = cn.get(opp_color, opp_color)
                        alerts.append(
                            f"⚠️ {opp_name} догнал тебя в {a['name']}! ({opp_val} vs {my_val})")
                        break

    # === Plants → Greenery ===
    if me.plants >= 8:
        if reds_now:
            if gens_left_conv <= 1:
                alerts.append(f"🌿 Plants {me.plants} — КОНВЕРТИРУЙ! Последний gen, VP > TR penalty")
            else:
                alerts.append(f"🌿 Plants {me.plants} — greenery = +1 VP но 0 net TR (Reds). Ок если VP нужнее")
        else:
            extra = ""
            if reds_coming:
                extra = " ⚡ СЕЙЧАС! Reds доминируют — след. gen будет -1 TR!"
            elif me.plant_prod >= 5 and me.plants < 16 and gens_left_conv >= 3:
                extra = f" (plant-prod {me.plant_prod} — можно копить на 2 greenery)"
            alerts.append(f"🌿 Greenery из {me.plants} plants (+1 O₂, +1 TR, +1 VP){extra}")

    # === Heat → Temperature ===
    if me.heat >= 8 and state.temperature < 8:
        heat_rebate = 0
        if me.tableau:
            tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in me.tableau}
            for card_name, card_rebates in TABLEAU_REBATES.items():
                if card_name in tableau_names:
                    heat_rebate += card_rebates.get("any_temp", 0)
        if reds_now:
            if gens_left_conv <= 1:
                alerts.append(f"🔥 Heat {me.heat} — КОНВЕРТИРУЙ! Последний gen, TR не важнее")
            else:
                alerts.append(f"🔥 Heat {me.heat} — НЕ трать, Reds = 0 net TR. Копи на след. gen")
        else:
            rebate_str = f" +{heat_rebate} MC rebate" if heat_rebate else ""
            extra = ""
            if reds_coming:
                extra = " ⚡ СЕЙЧАС! Reds доминируют — след. gen -1 TR!"
            alerts.append(f"🔥 TR из {me.heat} heat (+1 temp, +1 TR{rebate_str}){extra}")
    elif me.heat >= 6 and me.heat < 8 and state.temperature < 8 and me.heat_prod >= 2:
        gens_to_8 = max(1, (8 - me.heat + me.heat_prod - 1) // me.heat_prod)
        if gens_to_8 == 1:
            alerts.append(f"🔥 Heat {me.heat} (+{me.heat_prod}/gen) — хватит след. gen для temp raise")

    # === Action cards in tableau ===
    action_cards = {
        "Development Center": "energy → draw card",
        "Penguins": "+1 animal (+1 VP)",
        "Local Shading": "+1 floater",
        "Red Ships": "trade action",
        "Electro Catapult": "plant/steel → +7 MC",
        "Inventors' Guild": "look at top card",
        "Rover Construction": "+2 MC per city",
        "Ceres Tech Market": "science → cards",
        "Self-Replicating Robots": "install card cheaper",
        "Decomposers": "+1 microbe (+½ VP)",
        "Birds": "+1 animal (+1 VP)",
        "Fish": "+1 animal (+1 VP)",
        "Livestock": "+1 animal (+1 VP)",
        "Predators": "+1 animal (+1 VP)",
        "GHG Producing Bacteria": "+1 microbe (or 3→TR)",
        "Sulphur-Eating Bacteria": "+1 microbe (or 3→TR)",
        "Extremophiles": "+1 microbe (+½ VP)",
        "Regolith Eaters": "+1 microbe (or 2→O₂)",
        "Nitrite Reducing Bacteria": "+1 microbe (or 3→TR)",
        "Tardigrades": "+1 microbe (+⅓ VP)",
        "Directed Impactors": "6 MC → +1 asteroid",
        "Atmo Collectors": "+1 floater (or 2→energy/plant/heat)",
        "Stratopolis": "+2 floaters (+⅓ VP)",
        "Titan Floating Launch-Pad": "+1 floater (or 1→trade)",
        "Titan Air-scrapping": "+1 floater (or 2→TR)",
        "Jupiter Floating Station": "+1 floater (+⅓ VP)",
        "Rotator Impacts": "6 MC → +1 asteroid (or 1→Venus)",
        "Venus Orbital Survey": "free Venus card",
        "Viron": "reuse action card",
        "Orbital Cleanup": "draw per science tag",
    }
    active_actions = []
    for c in me.tableau:
        name = c["name"]
        if name in action_cards and not c.get("isDisabled"):
            active_actions.append(f"{name}: {action_cards[name]}")
    if active_actions:
        alerts.append("🔵 Actions (" + str(len(active_actions)) + "): " +
                      " │ ".join(active_actions[:5]))

    # === Colony trade ===
    if state.colonies_data and (me.energy >= 3 or me.mc >= 9):
        from .colony_advisor import analyze_trade_options
        trade_result = analyze_trade_options(state)
        if trade_result["trades"] and trade_result["trades"][0]["net_profit"] > 3:
            best = trade_result["trades"][0]
            hint = f"🚀 Trade {best['name']} (+{best['net_profit']} MC net)"
            # Quick priority hint
            if best["net_profit"] > 10:
                hint += " — TOP PRIORITY"
            elif best["net_profit"] > 6:
                hint += " — высокий приоритет"
            alerts.append(hint)

    # === TR gap warning ===
    max_opp_tr = max((o.tr for o in state.opponents), default=0)
    tr_gap = max_opp_tr - me.tr
    if tr_gap >= 8:
        alerts.append(f"⚠️ TR отставание: -{tr_gap} от лидера ({max_opp_tr})")

    # === Turmoil alerts (enhanced) ===
    if state.turmoil:
        t = state.turmoil
        ruling = t.get("ruling", "")
        dominant = t.get("dominant", "")

        # Reds ruling penalty
        if ruling and "Reds" in str(ruling):
            alerts.append("⛔ REDS RULING: -1 TR/шаг при подъёме параметров!")

        # Reds incoming warning
        if dominant and "Reds" in str(dominant):
            alerts.append("⚠️ REDS DOMINANT → станут ruling! Блокируй делегатами или придержи terraform")

        # Party strategy for dominant party
        if dominant and dominant in PARTY_STRATEGY:
            ps = PARTY_STRATEGY[dominant]
            alerts.append(f"🏛️ Dominant: {dominant} — {ps['ruling_tip']}")

        # Global event preparation
        coming = t.get("coming")
        if coming and coming in GLOBAL_EVENT_ADVICE:
            ev = GLOBAL_EVENTS.get(coming, {})
            icon = "🟢" if ev.get("good", True) else "🔴"
            alerts.append(f"{icon} Событие (след. gen): {coming}")
            alerts.append(f"   → {GLOBAL_EVENT_ADVICE[coming]}")

        distant = t.get("distant")
        if distant and distant in GLOBAL_EVENT_ADVICE:
            ev = GLOBAL_EVENTS.get(distant, {})
            if not ev.get("good", True):
                alerts.append(f"⚠️ Через 2 gen: {distant} — начинай готовиться")

        current = t.get("current")
        if current:
            ev = GLOBAL_EVENTS.get(current, {})
            if not ev.get("good", True):
                alerts.append(f"🔴 Global Event СЕЙЧАС: {current} — {ev.get('desc', '?')}")

        # Delegate advice
        my_in_lobby = me.color in t.get("lobby", [])
        if my_in_lobby and mc >= 0:
            if dominant and "Reds" in str(dominant):
                # Find best non-Reds party to push
                parties = t.get("parties", {})
                non_reds = [(p, len(dels)) for p, dels in parties.items()
                           if "Reds" not in p and isinstance(dels, list)]
                if non_reds:
                    best_party = max(non_reds, key=lambda x: x[1])[0]
                    alerts.append(f"📋 Делегат в lobby — БЛОКИРУЙ Reds! Ставь в {best_party}")
                else:
                    alerts.append("📋 Делегат в lobby — блокируй Reds!")
            else:
                alerts.append("📋 Делегат в lobby — можно разместить бесплатно")

    # === Opponent threat detection ===
    for opp in state.opponents:
        threats = []

        # Milestone dominance
        opp_milestones = sum(1 for m in state.milestones
                           if m.get("owner_color") == opp.color or m.get("claimed_by") == opp.color)
        my_milestones = sum(1 for m in state.milestones
                          if m.get("owner_color") == me.color or m.get("claimed_by") == me.color)
        if opp_milestones >= 2 and opp_milestones > my_milestones:
            threats.append(f"{opp_milestones} milestones ({opp_milestones * 5} VP)")

        # High MC production (engine player)
        if opp.mc_prod >= 20 and opp.mc_prod > me.mc_prod + 5:
            threats.append(f"MC-prod {opp.mc_prod} (greedy engine)")

        # Large hand (card strategy)
        opp_hand = getattr(opp, 'cards_in_hand_n', 0) or getattr(opp, 'cards_in_hand_count', 0)
        my_hand = len(state.cards_in_hand or [])
        if opp_hand >= 15 and opp_hand > my_hand + 5:
            threats.append(f"{opp_hand} карт в руке (card strategy)")

        # TR lead
        if opp.tr > me.tr + 5:
            threats.append(f"TR {opp.tr} (+{opp.tr - me.tr} над тобой)")

        # Resource VP on cards (floater engines, animal VP, microbe VP)
        opp_resource_vp = 0
        if opp.tableau:
            for card in opp.tableau:
                res = card.get("resources", 0) if isinstance(card, dict) else 0
                if res and res >= 3:
                    opp_resource_vp += res // 2  # ~1 VP per 2 resources (conservative)
        if opp_resource_vp >= 8:
            threats.append(f"~{opp_resource_vp} VP на картах (ресурсы — floater/animal engine!)")

        # Combine threats into one alert
        if threats:
            action = ""
            if opp.mc_prod >= 20 or opp_hand >= 15:
                action = " → ЗАКРЫВАЙ ИГРУ (greedy player набирает обороты)"
            elif opp_milestones >= 3:
                action = " → компенсируй awards + VP карты"
            elif opp_resource_vp >= 10:
                action = " → ЗАКРЫВАЙ ИГРУ (VP engine набирает ресурсы каждый gen!)"
            elif opp.tr > me.tr + 8:
                action = " → догоняй по TR"

            alerts.append(f"🎯 {opp.name}: {'; '.join(threats)}{action}")

    # === Dead cards in hand (impossible requirements) ===
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        reqs = card.get("play_requirements", [])
        if not reqs:
            continue
        # Check for Inventrix in tableau
        has_inventrix = any(
            (c.get("name") == "Inventrix" if isinstance(c, dict) else False)
            for c in (me.tableau or [])
        )
        inv_bonus = 2 if has_inventrix else 0

        for req in reqs:
            if not isinstance(req, dict):
                continue
            # Max temperature (e.g. ArchaeBacteria: -18 max)
            temp_val = req.get("temperature") or req.get("count")
            if req.get("max") and temp_val is not None and isinstance(temp_val, (int, float)):
                if state.temperature > temp_val + inv_bonus * 2:
                    alerts.append(
                        f"💀 {cname} — МЁРТВАЯ КАРТА (req {temp_val}°C max, "
                        f"сейчас {state.temperature}°C). ПРОДАЙ!")
                    break
            # Max oxygen
            oxy_val = req.get("oxygen") or req.get("count")
            if req.get("max") and "oxygen" in str(req).lower() and oxy_val is not None:
                if state.oxygen > int(oxy_val) + inv_bonus:
                    alerts.append(
                        f"💀 {cname} — МЁРТВАЯ КАРТА (req {oxy_val}% O2 max, "
                        f"сейчас {state.oxygen}%). ПРОДАЙ!")
                    break

    # === Ongoing effect cards held too long ===
    ONGOING_EFFECT_CARDS = {
        "Viral Enhancers": "When you play plant/microbe/animal tag → +1 plant or resource",
        "Decomposers": "When you play plant/microbe/animal tag → +1 microbe",
        "Ecological Zone": "When you play plant/animal tag → +1 animal (VP!)",
        "Mars University": "When you play science tag → discard+draw",
        "Olympus Conference": "When you play science tag → science resource or card",
        "Spin-off Department": "When you play 20+ MC card → draw card",
        "Media Group": "When you play event → +3 MC",
        "Pets": "When any city placed → +1 animal (VP!)",
        "Immigrant City": "When any city placed → +1 MC-prod",
        "Rover Construction": "When any city placed → +2 MC",
        "Arctic Algae": "When anyone places ocean → +2 plants",
        "Optimal Aerobraking": "When you play space event → +3 MC +3 heat",
    }
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        if cname in ONGOING_EFFECT_CARDS and state.generation >= 5:
            alerts.append(
                f"⚠️ {cname} В РУКЕ gen {state.generation}! Ongoing эффект теряет value "
                f"каждый gen. ИГРАЙ СЕЙЧАС или ПРОДАЙ")

    # === Late-play timing cards ===
    PLAY_LAST_ACTION = {
        "Media Archives": "gain 1 MC per event EVER PLAYED by all players — играй ПОСЛЕДНИМ действием!",
        "Molecular Printing": "gain 1 MC per city + colony — играй ПОСЛЕДНИМ действием!",
        "Greenhouses": "gain plants per city on Mars — играй ПОСЛЕДНИМ действием (больше городов = больше plants)!",
        "Toll Station": "gain MC per opponent Space tag — играй ПОСЛЕДНИМ действием!",
        "Galilean Waystation": "gain MC per opponent Jovian tag — играй ПОСЛЕДНИМ действием!",
    }
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        if cname in PLAY_LAST_ACTION:
            alerts.append(f"⏰ {cname}: {PLAY_LAST_ACTION[cname]}")

    # === Game timing alert ===
    gens_est = _estimate_remaining_gens(state)
    if gens_est <= 2 and state.generation >= 5:
        alerts.append(f"⏰ ~{gens_est} gen до конца! Переключайся на VP/TR")

    # === Card timing advice ===
    if gens_est >= 3:
        LAST_GEN_CARDS = {
            "Ganymede Colony": "Jovian amplifier — pure VP",
            "Water Import From Europa": "Jovian amplifier — pure VP",
            "Terraforming Ganymede": "Jovian amplifier — pure VP (исключение: 6+ Jovian mid-game = 6 TR engine)",
            "Noctis City": "reserved spot на Tharsis, играй в last gen (5+ VP)",
            "Noctis Farming": "NRA enabler + VP, но играй ПОЗДНО (plants уязвимы, синергии с bio появятся позже)",
            "Advanced Ecosystems": "3→5 VP с bio chain (Decomposers+Eco Zone), строго last gen",
            "Colonizer Training Camp": "дешёвый Jovian + 2 VP, играй при O2 ~4-5, не раньше",
        }
        for card in (state.cards_in_hand or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            if cname in LAST_GEN_CARDS:
                alerts.append(f"⏳ {cname} — {LAST_GEN_CARDS[cname]}")

        # Amplifier timing: play AFTER accumulating matching tags
        AMPLIFIER_TIMING = {
            "Insects": ("Plant", 3, "играй ПОСЛЕ максимума Plant тегов (держи в руке → slam)"),
            "Cartel": ("Earth", 3, "играй когда Earth тегов достаточно, но не слишком поздно (prod раньше = больше total)"),
            "Satellites": ("Space", 4, "играй после накопления Space тегов"),
            "Miranda Resort": ("Earth", 3, "VP scaling — играй после Earth тегов"),
            "Toll Station": (None, 0, "играй ПОСЛЕДНИМ действием в поколении (X от opponents)"),
            "Galilean Waystation": (None, 0, "играй ПОСЛЕДНИМ действием в поколении (X от opponents)"),
            "Greenhouses": (None, 0, "играй ПОСЛЕДНИМ действием — X от cities на карте"),
        }
        tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in (me.tableau or [])}
        player_tags = {}
        for c in (me.tableau or []):
            for t in (c.get("tags", []) if isinstance(c, dict) else []):
                player_tags[t] = player_tags.get(t, 0) + 1

        for card in (state.cards_in_hand or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            if cname in AMPLIFIER_TIMING:
                tag, threshold, advice = AMPLIFIER_TIMING[cname]
                if tag and player_tags.get(tag, 0) < threshold:
                    alerts.append(
                        f"📊 {cname}: {advice} (сейчас {player_tags.get(tag, 0)} {tag} тегов, "
                        f"подожди до {threshold}+)")

    # === CEO OPG timing reminder ===
    try:
        from .constants import CEO_STRATEGY
        for card in (me.tableau or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            ceo_data = CEO_STRATEGY.get(cname)
            if not ceo_data or not ceo_data.get("opg"):
                continue
            # Check if OPG already used (isDisabled = true after OPG)
            is_disabled = card.get("isDisabled", False) if isinstance(card, dict) else False
            if is_disabled:
                continue
            timing = ceo_data.get("opg_timing", "")
            gen = state.generation
            hint = None

            if timing == "gen_1_2" and gen >= 3:
                hint = f"⚡ {cname} OPG: оптимально было gen 1-2! Используй СЕЙЧАС (value падает)"
            elif timing == "gen_2_3" and gen >= 4:
                hint = f"⚡ {cname} OPG: оптимально gen 2-3. Используй скоро!"
            elif timing == "gen_3_4" and gen >= 3 and gen <= 5:
                hint = f"⚡ {cname} OPG: сейчас оптимальное окно (gen 3-5)!"
            elif timing == "gen_3_5" and gen >= 3 and gen <= 5:
                hint = f"⚡ {cname} OPG: сейчас оптимальное окно! ({ceo_data['strategy'][:60]})"
            elif timing == "mid_game" and gen >= 4 and gen <= 6:
                hint = f"⚡ {cname} OPG: mid-game — хорошее время"
            elif timing == "last_gen" and gens_est <= 2:
                hint = f"⚡ {cname} OPG: ИСПОЛЬЗУЙ СЕЙЧАС (last gen = max value)!"
            elif timing == "before_trade" and state.colonies_data:
                hint = f"⚡ {cname} OPG: используй ПЕРЕД trade (все треки на max → trade = max value)"
            elif timing == "when_oceans_maxed" and state.oceans >= 9:
                hint = f"⚡ {cname} OPG: океаны заполнены — используй для 15 MC бонус!"
            elif timing == "when_reds_can_become_ruling" and state.turmoil:
                dominant = state.turmoil.get("dominant", "")
                if "Reds" in str(dominant):
                    hint = f"⚡ {cname} OPG: Reds dominant — идеальный момент!"
            elif timing and gen >= 6 and gens_est <= 3:
                hint = f"⚡ {cname} OPG не использован! Осталось ~{gens_est} gen"

            if hint:
                alerts.append(hint)
    except ImportError:
        pass

    # === "Don't help close" advisory for greedy strategy ===
    if gens_est >= 3 and me.mc_prod >= 6:
        # Player has decent engine — check if they should avoid helping close
        params_near_max = 0
        if state.temperature >= 6:
            params_near_max += 1
        if state.oxygen >= 12:
            params_near_max += 1
        if state.oceans >= 7:
            params_near_max += 1
        if state.venus >= 26:
            params_near_max += 1

        if params_near_max >= 2:
            alerts.append(
                "🛑 Параметры близко к закрытию — не помогай закрывать! "
                "Каждый SP Greenery/Aquifer/Asteroid приближает конец (невыгодно при сильном engine)")

    return alerts


def _estimate_vp(state, player=None) -> dict:
    """Estimate VP for a player based on current state."""
    p = player or state.me
    vp = {"tr": p.tr, "greenery": 0, "city": 0, "cards": 0, "milestones": 0, "awards": 0}

    # Use victoryPointsBreakdown if available (most accurate)
    vp_breakdown = p.raw.get("victoryPointsBreakdown", {})
    if vp_breakdown:
        vp["cards"] = vp_breakdown.get("victoryPoints", 0)
        vp["greenery"] = vp_breakdown.get("greenery", 0)
        vp["city"] = vp_breakdown.get("city", 0)
        vp["awards"] = vp_breakdown.get("awards", 0)
        vp["milestones"] = vp_breakdown.get("milestones", 0)
        vp["total"] = sum(vp.values())
        return vp

    # Build a map for adjacency calculation
    space_map = {}  # (x, y) -> space
    my_cities = []
    for s in state.spaces:
        x, y = s.get("x", -1), s.get("y", -1)
        if x >= 0:
            space_map[(x, y)] = s
        if s.get("color") != p.color:
            continue
        tile = s.get("tileType")
        if tile == TILE_GREENERY:
            vp["greenery"] += 1
        elif tile == TILE_CITY:
            my_cities.append(s)

    # City VP = count adjacent greeneries (from any player)
    for city in my_cities:
        cx, cy = city.get("x", -1), city.get("y", -1)
        if cx < 0:
            continue
        adj_greenery = 0
        for nx, ny in _get_neighbors(cx, cy):
            neighbor = space_map.get((nx, ny))
            if neighbor and neighbor.get("tileType") == TILE_GREENERY:
                adj_greenery += 1
        vp["city"] += adj_greenery

    # Milestone VP
    for m in state.milestones:
        if m.get("claimed_by") == p.name:
            vp["milestones"] += 5

    # Estimate card VP from tableau resources (for our player)
    if p.is_me and p.tableau:
        for c in p.tableau:
            res = c.get("resources", 0)
            name = c.get("name", "")
            if not res:
                continue
            if name in ("Birds", "Fish", "Livestock", "Small Animals", "Penguins",
                        "Stratospheric Birds", "Predators", "Venusian Animals",
                        "Herbivores"):
                vp["cards"] += res  # 1 VP per animal
            elif name in ("Decomposers", "Symbiotic Fungus", "Tardigrades"):
                vp["cards"] += res // 3  # 1 VP per 3 microbes
            elif name in ("Ecological Zone",):
                vp["cards"] += res // 2  # 1 VP per 2 animals
            elif name in ("Physics Complex",):
                vp["cards"] += res * 2  # 2 VP per science
            elif name in ("Security Fleet",):
                vp["cards"] += res  # 1 VP per fighter
            elif name in ("Ants",):
                vp["cards"] += res // 2  # 1 VP per 2 microbes
            elif name in ("Extremophiles",):
                vp["cards"] += res // 3
            elif name in ("Saturn Surfing", "Aerial Mappers"):
                vp["cards"] += res  # 1 VP per floater
            elif name in ("Refugee Camps",):
                vp["cards"] += res  # 1 VP per camp

        # Also add flat VP from known cards in tableau
        for c in p.tableau:
            name = c.get("name", "")
            if name in ("Search For Life",) and c.get("resources", 0) > 0:
                vp["cards"] += 3

    vp["total"] = sum(vp.values())
    return vp


def _estimate_remaining_gens(state) -> int:
    """Estimate remaining generations based on global parameters progress.

    Venus не влияет на конец игры напрямую, но WGT иногда поднимает Venus
    вместо основных параметров, что замедляет игру на ~1-2 gen.
    """
    temp_remaining = max(0, (8 - state.temperature) // 2)
    o2_remaining = max(0, 14 - state.oxygen)
    ocean_remaining = max(0, 9 - state.oceans)

    total_remaining = temp_remaining + o2_remaining + ocean_remaining

    steps_per_gen = 6 if state.is_wgt else 4
    if state.generation <= 3:
        steps_per_gen = 4
    elif state.generation >= 7:
        steps_per_gen = 7

    # Venus+WGT: WGT иногда поднимает Venus вместо main, замедляя ~0.5-1 step/gen
    if state.has_venus and state.is_wgt and state.venus < 30:
        steps_per_gen = max(3, steps_per_gen - 1)

    gens = max(1, (total_remaining + steps_per_gen - 1) // steps_per_gen)
    return gens


def strategy_advice(state) -> list[str]:
    """Высокоуровневые стратегические советы на основе фазы игры."""
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    me = state.me
    tips = []

    if phase == "early":
        tips.append("🔧 ФАЗА: Engine. Приоритет: production, дискаунты, теги.")
        tips.append(f"   1 MC-prod сейчас = ~{gens_left} MC за игру.")
        if me.mc_prod < 5:
            tips.append("   ⚠️ MC-prod < 5 — ищи production карты!")
    elif phase == "mid":
        tips.append("⚖️ ФАЗА: Баланс. Production ещё ок, начинай TR.")
        tips.append(f"   1 MC-prod = ~{gens_left} MC. 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        if sum(1 for m in state.milestones if m.get("claimed_by")) < 3:
            tips.append("   Milestones ещё открыты — гони к ним!")
    elif phase == "late":
        tips.append("🎯 ФАЗА: Поздняя. VP важнее новой production.")
        tips.append(f"   1 MC-prod = ~{gens_left} MC. 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        tips.append("   Приоритет: VP-карты, greenery, awards, города. Дорогая production — скип.")
    elif phase == "endgame":
        tips.append("🏁 ФАЗА: Финал! Только VP/TR. Production = 0.")
        tips.append("   Greenery из plants, temp из heat, awards, VP-карты.")
        tips.append("   Не покупай карт на драфте если не сыграешь в этом gen!")

    # Rush vs Engine detection
    total_prod = me.mc_prod + me.steel_prod * 1.6 + me.ti_prod * 2.5
    opp_max_tr = max((o.tr for o in state.opponents), default=20)
    tr_lead = me.tr - opp_max_tr

    opp_max_prod = 0
    for opp in state.opponents:
        opp_prod = opp.mc_prod + opp.steel_prod * 1.6 + opp.ti_prod * 2.5
        opp_max_prod = max(opp_max_prod, opp_prod)
    engine_gap = total_prod - opp_max_prod

    my_vp_est = _estimate_vp(state)
    opp_vp_max = max((_estimate_vp(state, o)["total"] for o in state.opponents), default=0)
    vp_lead = my_vp_est["total"] - opp_vp_max

    if vp_lead >= 5 and engine_gap <= -3 and phase in ("mid", "late"):
        tips.append(f"   🏃 РАШ! VP лид +{vp_lead}, но engine слабее ({total_prod:.0f} vs {opp_max_prod:.0f}). Рашь конец!")
    elif vp_lead >= 5 and tr_lead >= 5 and phase in ("mid", "late"):
        tips.append(f"   🏃 VP+TR лид (+{vp_lead} VP, +{tr_lead} TR). Рашь конец — поднимай параметры.")
    elif tr_lead >= 8 and phase in ("mid", "late"):
        tips.append(f"   🏃 TR лид +{tr_lead}. Можно рашить если engine не отстаёт.")
    elif tr_lead <= -8:
        tips.append(f"   🐢 TR отставание {tr_lead}. Компенсируй VP (milestones/awards/cards).")

    if engine_gap >= 5 and phase == "mid":
        tips.append(f"   💰 Сильный engine ({total_prod:.0f} vs {opp_max_prod:.0f} MC-eq/gen). Замедляй игру!")
    elif engine_gap <= -8 and phase in ("early", "mid"):
        tips.append(f"   ⚠️ Engine слабее оппонентов ({total_prod:.0f} vs {opp_max_prod:.0f}). Не затягивай!")

    my_greenery = sum(1 for s in state.spaces
                      if s.get("tileType") == 0 and s.get("color") == me.color)
    my_cities = sum(1 for s in state.spaces
                    if s.get("tileType") == 2 and s.get("color") == me.color)
    if my_greenery >= 3 and my_cities == 0 and phase in ("mid", "late", "endgame"):
        tips.append(f"   🏙️ {my_greenery} greenery но 0 cities! City даст adjacency VP + MC-prod.")
    elif my_greenery >= 5 and my_cities <= 1 and phase in ("late", "endgame"):
        tips.append(f"   🏙️ {my_greenery} greenery, {my_cities} city — рассмотри ещё city для adjacency VP.")

    my_vp = _estimate_vp(state)
    opp_vps = []
    for opp in state.opponents:
        ovp = _estimate_vp(state, opp)
        opp_vps.append((opp.name, ovp["total"]))
    if opp_vps:
        leader_name, leader_vp = max(opp_vps, key=lambda x: x[1])
        gap = my_vp["total"] - leader_vp
        if gap > 5:
            tips.append(f"   🟢 VP лидер: +{gap} над {leader_name} (~{my_vp['total']} VP)")
        elif gap > 0:
            tips.append(f"   🟢 Впереди +{gap} VP ({my_vp['total']} vs {leader_name} {leader_vp})")
        elif gap >= -3:
            tips.append(f"   🟡 Почти вровень с {leader_name} ({my_vp['total']} vs {leader_vp})")
        else:
            vp_needed = abs(gap) / max(1, gens_left)
            tips.append(f"   🔴 Отставание {gap} VP от {leader_name} ({my_vp['total']} vs {leader_vp})")
            if gens_left >= 2:
                tips.append(f"      Нужно +{vp_needed:.1f} VP/gen: greenery, awards, VP-карты")

    if phase == "endgame" and opp_vps:
        closest_gap = min(abs(my_vp["total"] - vp) for _, vp in opp_vps)
        if closest_gap <= 5:
            tips.append(f"   💰 Гонка плотная (±{closest_gap} VP)! MC = тайбрейк. Не трать всё в ноль.")

    # === Endgame VP Action Ranker ===
    if phase == "endgame":
        vp_actions = []  # (vp, cost_mc, description, priority)

        # 1. Greenery from plants (8 plants = 1 greenery = 1 VP + maybe 1 TR)
        plant_greeneries = me.plants // 8
        if plant_greeneries > 0:
            tr_bonus = 1 if state.oxygen < 14 else 0
            vp_per = 1 + tr_bonus
            vp_actions.append((vp_per, 0, f"Greenery из plants ({me.plants} plants → {plant_greeneries} greenery)", 1))

        # 2. Temperature from heat (8 heat = +1 temp = +1 TR)
        if state.temperature < 8:
            heat_raises = me.heat // 8
            if heat_raises > 0:
                temp_steps_left = (8 - state.temperature) // 2
                actual = min(heat_raises, temp_steps_left)
                if actual > 0:
                    vp_actions.append((actual, 0, f"Temp из heat ({me.heat} heat → {actual} TR)", 1))

        # 3. Standard project: Greenery (23 MC)
        if me.mc >= 23 and state.oxygen < 14:
            mc_greeneries = me.mc // 23
            vp_actions.append((2, 23, f"SP Greenery (23 MC → 1 VP + 1 TR)", 3))
        elif me.mc >= 23:
            vp_actions.append((1, 23, f"SP Greenery (23 MC → 1 VP, O₂ maxed)", 4))

        # 4. Standard project: Asteroid/Temperature (14 MC)
        if state.temperature < 8 and me.mc >= 14:
            vp_actions.append((1, 14, f"SP Asteroid (14 MC → 1 TR)", 3))

        # 5. Award funding
        funded_count = sum(1 for a in state.awards if a["funded_by"])
        if funded_count < 3:
            cost = [8, 14, 20][funded_count]
            if me.mc >= cost:
                # Check if we'd win any unfunded award
                for a in state.awards:
                    if a["funded_by"]:
                        continue
                    my_score = a["scores"].get(me.color, 0)
                    if isinstance(my_score, dict):
                        my_score = my_score.get("score", 0)
                    opp_scores = [v if isinstance(v, (int, float)) else v.get("score", 0)
                                  for c, v in a["scores"].items() if c != me.color]
                    opp_max = max(opp_scores) if opp_scores else 0
                    if my_score > opp_max:
                        vp_actions.append((5, cost, f"Fund {a['name']} award ({cost} MC → 5 VP, ты лидер)", 2))
                    elif my_score == opp_max and my_score > 0:
                        vp_actions.append((2, cost, f"Fund {a['name']} award ({cost} MC → 2 VP, tied)", 4))

        # 6. Venus raise (if < 30 and we have standard project)
        if state.venus < 30 and state.has_venus and me.mc >= 15:
            vp_actions.append((1, 15, f"SP Venus (15 MC → 1 TR)", 3))

        if vp_actions:
            # Sort: priority first, then VP/MC ratio
            vp_actions.sort(key=lambda x: (x[3], -x[0] / max(x[1], 1)))
            tips.append("   📊 VP ACTIONS (ранжирование):")
            for vp, cost, desc, _ in vp_actions[:6]:
                cost_str = f"{cost} MC" if cost > 0 else "FREE"
                ratio = f"{vp/cost:.2f} VP/MC" if cost > 0 else "∞"
                tips.append(f"      {vp} VP | {cost_str} | {ratio} | {desc}")

    # === Opponent rush detection ===
    if phase in ("mid", "late", "endgame") and gens_left <= 5:
        temp_steps = max(0, (8 - state.temperature) // 2)
        o2_steps = max(0, 14 - state.oxygen)
        ocean_steps = max(0, 9 - state.oceans)
        total_steps = temp_steps + o2_steps + ocean_steps

        for opp in state.opponents:
            opp_heat_raises = opp.heat // 8
            opp_plant_greens = opp.plants // 8
            opp_mc_avail = opp.mc + opp.steel * 2 + opp.titanium * 3
            # How many steps opponent can close this gen with resources
            opp_free_steps = min(opp_heat_raises, temp_steps) + min(opp_plant_greens, o2_steps)
            remaining_after_free = total_steps - opp_free_steps
            # SP costs: temp=14, ocean=18, greenery=23 (avg ~18)
            opp_sp_steps = opp_mc_avail // 18
            opp_total_closes = opp_free_steps + opp_sp_steps
            if opp_total_closes >= total_steps and total_steps <= 6:
                tips.append(
                    f"   🚨 {opp.name} может ЗАРАШИТЬ! "
                    f"(heat:{opp.heat}, plants:{opp.plants}, MC:{opp.mc}) "
                    f"= ~{opp_total_closes} шагов vs {total_steps} нужно")
            elif opp_free_steps >= 3 and total_steps <= 8:
                tips.append(
                    f"   ⚠️ {opp.name} закроет ~{opp_free_steps} шагов бесплатно "
                    f"(heat→temp, plants→O₂). Игра ускоряется!")

    # Card VP gap detection
    if phase in ("mid", "late") and me.mc_prod >= 12:
        my_card_vp = my_vp.get("cards", 0)
        best_opp_card_vp = 0
        for opp in state.opponents:
            opp_card_vp = _estimate_vp(state, opp).get("cards", 0)
            best_opp_card_vp = max(best_opp_card_vp, opp_card_vp)
        card_gap = best_opp_card_vp - my_card_vp
        if card_gap >= 10:
            tips.append(f"   ⚠️ CARD VP: {my_card_vp} vs {best_opp_card_vp} у оппонента (−{card_gap})!")
            tips.append(f"      VP-action карты = 0.3-0.5 VP/MC. Greenery SP = 0.13 VP/MC.")
        elif card_gap >= 5 and gens_left >= 3:
            tips.append(f"   ⚠️ Card VP отставание −{card_gap}. Приоритет VP-карты!")

    # Low hand warning: high income but few cards to play
    if me.mc_prod >= 20 and phase in ("mid", "late"):
        hand_n = len(state.cards_in_hand or []) if hasattr(state, 'cards_in_hand') else 0
        if hand_n < 3:
            tips.append(f"   ⚠️ Income {me.mc_prod + me.tr}/gen но {hand_n} карт! Покупай ВСЕ 4 на драфте.")

    return tips


def _rush_calculator(state) -> list[str]:
    """Calculate if VP leader can rush end by closing parameters."""
    hints = []
    me = state.me

    temp_steps = max(0, (8 - state.temperature) // 2)
    o2_steps = max(0, 14 - state.oxygen)
    ocean_steps = max(0, 9 - state.oceans)
    total_steps = temp_steps + o2_steps + ocean_steps

    if total_steps == 0:
        return ["🏁 Параметры закрыты! Последний gen."]

    my_vp = _estimate_vp(state)
    opp_vps = [(o.name, _estimate_vp(state, o)) for o in state.opponents]
    am_leader = all(my_vp["total"] >= ov["total"] for _, ov in opp_vps)

    if not am_leader:
        return []

    lead = my_vp["total"] - max(ov["total"] for _, ov in opp_vps)

    heat_raises = me.heat // 8
    plant_greeneries = me.plants // 8
    mc_avail = me.mc + me.steel * 2 + me.titanium * 3

    my_temp_closes = heat_raises
    remaining_temp = max(0, temp_steps - my_temp_closes)
    my_o2_closes = plant_greeneries
    remaining_o2 = max(0, o2_steps - my_o2_closes)
    remaining_ocean = ocean_steps

    sp_cost = remaining_temp * 14 + remaining_ocean * 18 + remaining_o2 * 23
    wgt_discount = 1 if state.is_wgt else 0
    total_need = remaining_temp + remaining_ocean + remaining_o2 - wgt_discount

    can_rush = sp_cost <= mc_avail and total_need >= 0

    hints.append(f"🏁 До закрытия: Temp {temp_steps}↑ O₂ {o2_steps}↑ Ocean {ocean_steps}↑ = {total_steps} шагов")

    if total_steps <= 3:
        resources = []
        if heat_raises:
            resources.append(f"heat→temp ×{min(heat_raises, temp_steps)}")
        if plant_greeneries:
            resources.append(f"plants→green ×{min(plant_greeneries, o2_steps)}")
        if resources:
            hints.append(f"   Бесплатно: {', '.join(resources)}")
        if sp_cost > 0:
            hints.append(f"   SP: ~{sp_cost} MC за остаток")
        if can_rush:
            hints.append(f"   ✅ МОЖНО ЗАРАШИТЬ! Лид +{lead} VP, ресурсов хватает")
        else:
            hints.append(f"   ❌ Не хватает ресурсов ({mc_avail} MC vs {sp_cost} MC нужно)")
    elif total_steps <= 8:
        my_closes_per_gen = heat_raises + plant_greeneries + max(0, mc_avail // 18)
        gens_to_close = max(1, (total_steps - wgt_discount) // max(1, my_closes_per_gen + wgt_discount))
        hints.append(f"   ~{gens_to_close} gen чтобы закрыть (при текущих ресурсах)")

    return hints


def _vp_projection(state) -> list[str]:
    """Project final VP for each player based on remaining resources + future actions."""
    hints = []
    gens_left = _estimate_remaining_gens(state)

    for p in [state.me] + state.opponents:
        current_vp = _estimate_vp(state, p)
        bonus_vp = 0
        details = []

        total_plants = p.plants + p.plant_prod * gens_left
        future_greeneries = total_plants // 8
        if future_greeneries:
            bonus_vp += future_greeneries * 2
            details.append(f"+{future_greeneries} green")

        if state.temperature < 8:
            # Energy converts to heat at end of each gen
            total_heat = p.heat + (p.heat_prod + p.energy_prod) * gens_left + p.energy
            heat_raises = min(total_heat // 8, max(0, (8 - state.temperature) // 2))
            if heat_raises:
                bonus_vp += heat_raises
                details.append(f"+{heat_raises} temp")

        # (card_name -> (resource_type, vp_rate_per_resource))
        VP_PER_RES = {
            # 1 VP per resource (action: +1 resource/gen)
            "Penguins": ("animal", 1), "Fish": ("animal", 1),
            "Birds": ("animal", 1), "Livestock": ("animal", 1),
            "Predators": ("animal", 1), "Small Animals": ("animal", 1),
            "Herbivores": ("animal", 1), "Venusian Animals": ("animal", 1),
            "Security Fleet": ("fighter", 1), "Refugee Camps": ("camp", 1),
            "Physics Complex": ("science", 1),
            # 1 VP per 2 resources
            "Venusian Insects": ("microbe", 0.5), "Atmo Collectors": ("floater", 0.5),
            "Stratopolis": ("floater", 0.5), "Ants": ("microbe", 0.5),
            # 1 VP per 3 resources
            "Decomposers": ("microbe", 0.33), "Extremophiles": ("microbe", 0.33),
            "GHG Producing Bacteria": ("microbe", 0.33),
            "Nitrite Reducing Bacteria": ("microbe", 0.33),
            "Sulphur-Eating Bacteria": ("microbe", 0.33),
            "Tardigrades": ("microbe", 0.25),
        }
        # Cards that add extra resources of a type each gen
        RESOURCE_ADDERS = {
            "animal": {"Symbiotic Fungus", "Ecological Zone"},
            "microbe": {"Symbiotic Fungus", "Decomposers", "Ants"},
        }
        tableau_names_set = {c.get("name", "") for c in p.tableau}
        action_vp = 0
        for c in p.tableau:
            cname = c.get("name", "")
            entry = VP_PER_RES.get(cname)
            if entry:
                res_type, vp_rate = entry
                # Boost rate if tableau has adders for this resource type
                adders = RESOURCE_ADDERS.get(res_type, set())
                if adders & tableau_names_set:
                    vp_rate *= 1.5
                action_vp += round(vp_rate * gens_left)
        if action_vp:
            bonus_vp += action_vp
            details.append(f"+{action_vp} actions")

        future_mc = (p.mc + p.mc_prod * gens_left
                     + p.steel_prod * gens_left * 2
                     + p.ti_prod * gens_left * 3)
        # Colony trade income: energy trade (free-ish) or MC trade (9 MC cost)
        if state.has_colonies:
            if p.energy_prod >= 3:
                future_mc += gens_left * 12  # energy trade: ~12 MC value net
            elif p.mc_prod >= 5:
                future_mc += gens_left * 5   # MC trade: ~14 MC value - 9 MC cost

        # Cards: playing cards is more efficient than SP (~12 MC per VP-eq)
        tr_from_income = min(gens_left * 2, future_mc // 12)
        if tr_from_income and gens_left >= 2:
            bonus_vp += tr_from_income
            details.append(f"+~{tr_from_income} TR")

        # Cards in hand: each played card ≈ 1.2 VP (mix of TR, VP, production value)
        cards_count = p.cards_in_hand_n
        if p.is_me and hasattr(state, 'cards_in_hand') and state.cards_in_hand:
            cards_count = max(cards_count, len(state.cards_in_hand))
        playable = min(cards_count, gens_left * 3)
        card_vp = round(playable * 1.2)
        if card_vp:
            bonus_vp += card_vp
            details.append(f"+~{card_vp} cards")

        projected = current_vp["total"] + bonus_vp
        is_me = p.name == state.me.name
        marker = "🔴" if is_me else "  "
        detail_str = f" ({', '.join(details)})" if details else ""
        hints.append(f"{marker} {p.name}: ~{projected} VP (сейчас {current_vp['total']}{detail_str})")

    return hints


def _card_play_impact(db, card_name: str, state) -> str:
    """Показать что даст розыгрыш карты: production, VP, TR, tags, ресурсы."""
    info = db.get_info(card_name)
    if not info:
        return ""
    desc_raw = info.get("description", "")
    desc = desc_raw if isinstance(desc_raw, str) else str(desc_raw.get("text", desc_raw.get("message", ""))) if isinstance(desc_raw, dict) else str(desc_raw)
    tags = info.get("tags", [])
    vp_raw = info.get("victoryPoints", "")
    vp = str(vp_raw) if vp_raw else ""
    cost = info.get("cost", 0)
    has_action = info.get("hasAction", False)
    card_type = info.get("type", "")

    parts = []

    if tags:
        tag_str = "+".join(t[:3] for t in tags)
        parts.append(f"[{tag_str}]")

    prod_pattern = re.findall(
        r'(?:increase|raise)\s+your\s+(\w+)\s+production\s+(\d+)\s+step',
        desc, re.IGNORECASE)
    for res, amount in prod_pattern:
        parts.append(f"+{amount} {res[:4]}-prod")

    dec_pattern = re.findall(
        r'decrease\s+your\s+(\w+)\s+production\s+(\d+)\s+step',
        desc, re.IGNORECASE)
    for res, amount in dec_pattern:
        parts.append(f"-{amount} {res[:4]}-prod")

    tr_match = re.search(r'raise\s+(?:your\s+)?(?:terraform(?:ing)?\s+rating|TR)\s+(\d+)', desc, re.IGNORECASE)
    if tr_match:
        parts.append(f"+{tr_match.group(1)} TR")
    temp_match = re.search(r'raise\s+temperature\s+(\d+)', desc, re.IGNORECASE)
    if temp_match:
        parts.append(f"+{temp_match.group(1)} temp")
    o2_match = re.search(r'raise\s+oxygen\s+(\d+)', desc, re.IGNORECASE)
    if o2_match:
        parts.append(f"+{o2_match.group(1)} O₂")
    venus_match = re.search(r'raise\s+venus\s+(\d+)', desc, re.IGNORECASE)
    if venus_match:
        parts.append(f"+{venus_match.group(1)} Venus")
    if re.search(r'place\s+(?:1\s+|an?\s+)?ocean', desc, re.IGNORECASE):
        parts.append("+ocean")
    if re.search(r'place\s+(?:1\s+|a\s+)?(?:greenery|forest)', desc, re.IGNORECASE):
        parts.append("+greenery")
    if re.search(r'place\s+(?:1\s+|a\s+)?city', desc, re.IGNORECASE):
        parts.append("+city")

    gain_pattern = re.findall(
        r'gain\s+(\d+)\s+(\w+)', desc, re.IGNORECASE)
    for amount, res in gain_pattern:
        if res.lower() not in ('step', 'steps', 'tile', 'tiles', 'tag', 'tags'):
            parts.append(f"+{amount} {res[:5]}")

    draw_match = re.search(r'draw\s+(\d+)\s+card', desc, re.IGNORECASE)
    if draw_match:
        parts.append(f"+{draw_match.group(1)} cards")

    if vp:
        parts.append(f"VP:{vp}")

    if has_action:
        parts.append("(action)")

    return " ".join(parts)


def _build_action_chains(db, req_checker, hand: list[dict], state) -> list[str]:
    """Построить цепочки действий: сыграй X → разблокирует Y → можно Z."""
    chains = []
    hand_names = [c["name"] for c in hand]

    for card in hand:
        name = card["name"]
        ok, reason = req_checker.check(name, state)
        if ok:
            continue
        if not reason:
            continue

        for provider in hand:
            pname = provider["name"]
            if pname == name:
                continue
            pok, _ = req_checker.check(pname, state)
            if not pok:
                continue
            pcost = provider.get("cost", 0)
            if pcost > state.me.mc:
                continue

            pinfo = db.get_info(pname)
            if not pinfo:
                continue
            ptags = [t.lower() for t in pinfo.get("tags", [])]

            m = re.match(r"Нужно (\d+) (\w+) tag", reason)
            if m:
                needed_tag = m.group(2).lower()
                if needed_tag in ptags:
                    chains.append(
                        f"▶ {pname} ({pcost} MC) → разблокирует {name}")
                    break

            pdesc = pinfo.get("description", "")
            if "temp" in reason.lower() and re.search(r'raise\s+temperature', pdesc, re.IGNORECASE):
                chains.append(f"▶ {pname} ({pcost} MC) → +temp → может разблокировать {name}")
                break

    me = state.me
    tableau_names = [c["name"] for c in me.tableau]
    for card in hand:
        name = card["name"]
        ok, _ = req_checker.check(name, state)
        cost = card.get("cost", 0)
        if not ok or cost > me.mc:
            continue
        info = db.get_info(name)
        if not info:
            continue
        card_tags = [t.lower() for t in info.get("tags", [])]

        triggers = []
        for tc in me.tableau:
            tname = tc.get("name", "")
            if tname == "Decomposers" and ("microbe" in card_tags or "animal" in card_tags or "plant" in card_tags):
                triggers.append("Decomposers +microbe")
            elif tname == "Viral Enhancers" and ("plant" in card_tags or "microbe" in card_tags or "animal" in card_tags):
                triggers.append("Viral Enhancers trigger")
            elif tname == "Symbiotic Fungus" and "microbe" in card_tags:
                triggers.append("Symbiotic Fungus +microbe")
            elif tname == "Media Group" and info.get("type") == "event":
                triggers.append("Media Group +3 MC")
            elif tname == "Mars University" and "science" in card_tags:
                triggers.append("Mars Uni: swap card")
            elif tname == "Orbital Cleanup" and "space" in card_tags:
                triggers.append(f"Orbital Cleanup +MC")

        if triggers:
            chains.append(f"⚡ {name} → {', '.join(triggers)}")

    return chains[:8]


def _forecast_requirements(state, req_checker, hand: list[dict]) -> list[str]:
    """Прогноз когда карты из руке станут играбельными."""
    hints = []
    gens_left = _estimate_remaining_gens(state)
    steps_per_gen = 6 if state.is_wgt else 4

    for card in hand:
        name = card["name"]
        ok, reason = req_checker.check(name, state)
        if ok:
            continue

        req = req_checker.get_req(name)
        if not req:
            continue

        r = req.lower().strip()
        gens_needed = None

        m = re.search(r'(-?\d+)\s*[°c]', r)
        if m and "warmer" in r:
            needed_temp = int(m.group(1))
            temp_gap = needed_temp - state.temperature
            if temp_gap > 0:
                gens_needed = max(1, temp_gap // (2 * steps_per_gen // 3 + 1))

        m = re.search(r'(\d+)%', r)
        if m and "oxygen" in r:
            needed_o2 = int(m.group(1))
            o2_gap = needed_o2 - state.oxygen
            if o2_gap > 0:
                gens_needed = max(1, o2_gap // max(1, steps_per_gen // 3))

        m = re.search(r'(\d+)\s+ocean', r)
        if m:
            needed_oceans = int(m.group(1))
            ocean_gap = needed_oceans - state.oceans
            if ocean_gap > 0:
                gens_needed = max(1, ocean_gap // max(1, steps_per_gen // 4))

        m = re.search(r'(\d+)%?\s*venus', r)
        if m:
            needed_venus = int(m.group(1))
            venus_gap = needed_venus - state.venus
            if venus_gap > 0:
                gens_needed = max(1, venus_gap // 3)

        if gens_needed and gens_needed <= gens_left:
            if gens_needed <= 1:
                hints.append(f"⏳ {name}: req скоро ({reason}) — ~этот gen")
            elif gens_needed <= 2:
                hints.append(f"⏳ {name}: req через ~{gens_needed} gen ({reason})")
            else:
                hints.append(f"⌛ {name}: req через ~{gens_needed} gen ({reason})")
        elif gens_needed and gens_needed > gens_left:
            hints.append(f"❌ {name}: req НЕ успеет ({reason}, ~{gens_needed} gen)")

    return hints


def _trade_optimizer(state) -> list[str]:
    """Оптимальный выбор колонии для торговли (делегирует colony_advisor)."""
    from .colony_advisor import format_trade_hints
    return format_trade_hints(state)


def _mc_flow_projection(state) -> list[str]:
    """Прогноз MC flow на следующие 1-2 gen."""
    me = state.me
    hints = []
    gens_left = _estimate_remaining_gens(state)

    income = me.mc_prod + me.tr
    steel_mc = me.steel_prod * me.steel_value
    ti_mc = me.ti_prod * me.ti_value
    total_income = income + steel_mc + ti_mc

    current_mc = me.mc + me.steel * me.steel_value + me.titanium * me.ti_value

    next_gen_mc = current_mc + income

    if gens_left >= 2:
        gen2_mc = next_gen_mc + income
        hints.append(f"💰 MC прогноз: сейчас ~{current_mc} → "
                     f"Gen+1: ~{next_gen_mc} → Gen+2: ~{gen2_mc}"
                     f" (income: {income}/gen, +{steel_mc}st +{ti_mc}ti)")

        avg_card_cost = 15
        cards_affordable = next_gen_mc // avg_card_cost
        if cards_affordable >= 3:
            hints.append(f"   Можешь сыграть ~{cards_affordable} карт (avg {avg_card_cost} MC)")
    else:
        hints.append(f"💰 MC: {current_mc} (+{income}/gen) — LAST GEN, трать всё!")

    return hints


def _safe_title(wf: dict) -> str:
    """Get title from waitingFor safely — title can be str or dict."""
    t = wf.get("title", "")
    return t if isinstance(t, str) else str(t.get("message", t.get("text", "")))


def _extract_wf_card_names(wf: dict) -> str:
    """Extract card names from waitingFor for state deduplication."""
    names = []
    for card in wf.get("cards", []):
        if isinstance(card, dict):
            names.append(card.get("name", ""))
        elif isinstance(card, str):
            names.append(card)
    if not names:
        for opt in wf.get("options", []):
            if isinstance(opt, dict):
                for card in opt.get("cards", []):
                    if isinstance(card, dict):
                        names.append(card.get("name", ""))
                    elif isinstance(card, str):
                        names.append(card)
    return ",".join(sorted(names))


def _should_pass(state, playable, gens_left, phase) -> list[str]:
    """Определить, когда лучше НЕ играть карту (pass/sell patents)."""
    reasons = []
    me = state.me
    mc = me.mc

    if not playable:
        return reasons

    best_score = playable[0][1]
    best_cost = playable[0][3]

    unclaimed = [m for m in state.milestones if not m.get("claimed_by")]
    claimed_count = len(state.milestones) - len(unclaimed)
    if claimed_count < 3:
        for m in unclaimed:
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict) and my_sc.get("near", False):
                mc_after = mc - best_cost
                if mc_after < 8 and mc >= 8:
                    reasons.append(
                        f"MILESTONE: {m['name']} почти — не трать ниже 8 MC!")
                    break
            elif isinstance(my_sc, dict) and my_sc.get("claimable", False):
                reasons.append(
                    f"MILESTONE: заяви {m['name']} (8 MC = 5 VP) вместо карты!")
                break

    funded_count = sum(1 for a in state.awards if a.get("funded_by"))
    if funded_count < 3:
        cost_award = [8, 14, 20][funded_count]
        for a in state.awards:
            if a.get("funded_by"):
                continue
            my_val = a.get("scores", {}).get(me.color, 0)
            opp_max = max((v for c, v in a.get("scores", {}).items()
                           if c != me.color), default=0)
            if my_val > opp_max and mc >= cost_award:
                mc_after = mc - best_cost
                if mc_after < cost_award:
                    reasons.append(
                        f"AWARD: фондируй {a['name']} ({cost_award} MC) — "
                        f"ты лидер (+{my_val - opp_max})!")
                    break

    if state.colonies_data and me.energy >= 3:
        best_col = max(state.colonies_data, key=lambda c: c.get("track", 0))
        if best_col.get("track", 0) >= 4 and me.mc - best_cost < 9:
            reasons.append(
                f"TRADE: {best_col['name']} (track={best_col['track']}) — "
                f"сохрани 9 MC на трейд!")

    if phase == "endgame" and best_score < 70:
        card_data = None
        for cd in (state.cards_in_hand or []):
            if cd.get("name") == playable[0][2]:
                card_data = cd
                break
        if card_data:
            tags = card_data.get("tags", [])
            if "Building" in tags and best_score < 65:
                reasons.append(
                    "TIMING: endgame — production карты уже не отобьются!")

    if best_score < 55 and len(state.cards_in_hand or []) >= 3:
        # Count weak cards by checking each playable card's score
        weak_count = sum(1 for _, sc, _, _ in playable if _score_to_tier(sc) in ("D", "F"))
        if weak_count >= 2:
            reasons.append(
                f"SELL PATENTS: {weak_count} слабых карт в руке — продай за MC!")

    if me.mc_prod >= 8 and mc - best_cost < 3 and phase != "endgame":
        reasons.append(
            f"CASH: MC-prod={me.mc_prod}, не уходи в 0 — "
            f"оставь запас на следующий gen!")

    # Colony trade opportunity cost (detailed)
    if state.colonies_data and me.energy >= 3:
        from .colony_advisor import analyze_trade_options
        trade_result = analyze_trade_options(state)
        if trade_result["trades"]:
            best_trade = trade_result["trades"][0]
            net = best_trade.get("net_profit", 0)
            if net > 5 and best_score < 70:
                mc_after_card = mc - best_cost
                trade_cost = 9
                for method in trade_result.get("methods", []):
                    if method.get("cost_mc", 99) < trade_cost:
                        trade_cost = method["cost_mc"]
                if mc_after_card < trade_cost:
                    reasons.append(
                        f"TRADE: {best_trade['name']} net +{net} MC > "
                        f"карта {playable[0][2]} ({_score_to_tier(best_score)}-{best_score}). "
                        f"Trade выгоднее!")

    # MC reserve for next gen (low income)
    gens_left_check = _estimate_remaining_gens(state)
    income = me.mc_prod + me.tr
    if income < 15 and gens_left_check >= 2 and mc - best_cost < 5:
        reasons.append(
            f"RESERVE: income {income}/gen — оставь 5+ MC запаса!")

    return reasons


def _score_to_tier(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 35: return "D"
    return "F"


def _parse_wf_card(card_data) -> dict:
    if isinstance(card_data, str):
        return {"name": card_data, "tags": [], "cost": 0}
    if isinstance(card_data, dict):
        return {
            "name": card_data.get("name", "???"),
            "tags": card_data.get("tags", []),
            "cost": card_data.get("calculatedCost", card_data.get("cost", 0)),
        }
    return {"name": str(card_data), "tags": [], "cost": 0}
