"""ClaudeOutput — Markdown форматтер для Claude Code."""

from .constants import STANDARD_PROJECTS, PARTY_POLICIES, GLOBAL_EVENTS, COLONY_TRADE_DATA
from .economy import sp_efficiency
from .analysis import (
    _score_to_tier, _parse_wf_card, _safe_title,
    strategy_advice, _generate_alerts, _estimate_remaining_gens,
    _forecast_requirements, _mc_flow_projection,
)
from .colony_advisor import analyze_trade_options, analyze_settlement
from .draft_play_advisor import draft_buy_advice, play_hold_advice, mc_allocation_advice


class ClaudeOutput:
    """Форматирует snapshot как Markdown для анализа Claude."""

    def __init__(self, db, synergy, req_checker=None):
        self.db = db
        self.synergy = synergy
        self.req_checker = req_checker

    def format(self, state) -> str:
        lines = []
        a = lines.append

        # Header
        a(f"# TM Game Snapshot — Gen {state.generation}, Phase: {state.phase}")
        a("")

        # Game info
        mods = []
        if state.has_colonies: mods.append("Colonies")
        if state.has_turmoil: mods.append("Turmoil")
        if state.has_venus: mods.append("Venus")
        if state.has_pathfinders: mods.append("Pathfinders")
        if state.has_ceos: mods.append("CEOs")
        if state.is_merger: mods.append("Merger")
        if state.is_wgt: mods.append("WGT")
        a(f"**Board:** {state.board_name} │ **Mods:** {', '.join(mods) or 'base'}")
        a(f"**Global:** O₂ {state.oxygen}% │ T {state.temperature}°C"
          f" │ Oceans {state.oceans}/9"
          f"{f' │ Venus {state.venus}%' if state.has_venus else ''}"
          f" │ Deck {state.deck_size}")
        a("")

        # My state
        me = state.me
        a(f"## Мой игрок: {me.name} ({me.color})")
        a(f"**Corp:** {me.corp} │ **TR:** {me.tr}")
        a("")
        a("| Ресурс | Кол-во | Prod |")
        a("|--------|--------|------|")
        a(f"| MC | {me.mc} | +{me.mc_prod} |")
        a(f"| Steel | {me.steel} (val={me.steel_value}) | +{me.steel_prod} |")
        a(f"| Titanium | {me.titanium} (val={me.ti_value}) | +{me.ti_prod} |")
        a(f"| Plants | {me.plants} | +{me.plant_prod} |")
        a(f"| Energy | {me.energy} | +{me.energy_prod} |")
        a(f"| Heat | {me.heat} | +{me.heat_prod} |")
        a("")
        tags_str = ", ".join(f"{t}: {n}" for t, n in me.tags.items() if n > 0)
        a(f"**Tags:** {tags_str or 'нет'}")
        a("")

        # Tableau
        if me.tableau:
            a("**Tableau (сыгранные карты):**")
            for c in me.tableau:
                name = c['name']
                res_str = f" ({c['resources']} res)" if c.get("resources") else ""
                ceo = self.db.get_ceo(name)
                if ceo:
                    action_type = ceo.get("actionType", "")
                    a(f"- **CEO {name}** [{action_type}]{res_str}")
                else:
                    a(f"- {name}{res_str}")
            a("")

        # Hand
        if state.cards_in_hand:
            a("## Карты в руке")
            a("")
            a("| Карта | Cost | Score | Tier | Req | Заметка |")
            a("|-------|------|-------|------|-----|---------|")
            for card in state.cards_in_hand:
                name = card["name"]
                cost = card.get("cost", 0)
                score = self.synergy.adjusted_score(
                    name, card.get("tags", []), me.corp,
                    state.generation, me.tags, state)
                tier = _score_to_tier(score)
                note = self._get_note(name)
                if self.req_checker:
                    req_ok, req_reason = self.req_checker.check(name, state)
                else:
                    req_ok, req_reason = True, ""
                if not req_ok:
                    status = f"⛔ {req_reason}"
                elif cost <= me.mc:
                    status = f"✓ {cost} MC"
                else:
                    status = f"✗ {cost} MC"
                a(f"| {name} | {status} | {score} | {tier} | {req_reason if req_ok else '**НЕТ**'} | {note} |")
            a("")

        # Opponents
        if state.opponents:
            a("## Оппоненты")
            a("")
            for opp in state.opponents:
                a(f"### {opp.name} ({opp.color}) — {opp.corp}")
                a(f"TR: {opp.tr} │ MC: {opp.mc}(+{opp.mc_prod})"
                  f" │ Steel: {opp.steel}(+{opp.steel_prod})"
                  f" │ Ti: {opp.titanium}(+{opp.ti_prod})")
                a(f"Plants: {opp.plants}(+{opp.plant_prod})"
                  f" │ Energy: {opp.energy}(+{opp.energy_prod})"
                  f" │ Heat: {opp.heat}(+{opp.heat_prod})")
                a(f"Cards: {opp.cards_in_hand_n} │ Cities: {opp.cities}"
                  f" │ Colonies: {opp.colonies}")
                opp_tags = ", ".join(f"{t}: {n}" for t, n in opp.tags.items() if n > 0)
                a(f"Tags: {opp_tags}")
                if opp.tableau:
                    played = [c["name"] for c in opp.tableau]
                    a(f"Tableau: {', '.join(played)}")
                a("")

        # Map
        if state.spaces:
            a("## Карта")
            a("")
            a("```")
            for line in self._render_map(state.spaces):
                a(line)
            a("```")
            a("Легенда: Gr=greenery OC=ocean Ci=city Mi=mining Re=restricted NP=nat.preserve")
            a("Цвет: G=green R=red O=orange B=blue Y=yellow  ~~=свободный ocean  .=пусто")
            a("Бонусы: t=ti s=steel p=plant c=card h=heat e=energy $=MC a=animal m=microbe T=temp")
            a("")

        # Milestones
        if state.milestones:
            a("## Milestones")
            a("")
            for m in state.milestones:
                if m["claimed_by"]:
                    a(f"- **{m['name']}** — заявлен {m['claimed_by']}")
                else:
                    scores = []
                    for color, info in m["scores"].items():
                        s = info["score"] if isinstance(info, dict) else info
                        cl = info.get("claimable", False) if isinstance(info, dict) else False
                        mark = " ✓МОЖНО" if cl else ""
                        scores.append(f"{color}={s}{mark}")
                    a(f"- {m['name']}: {', '.join(scores)}")
            a("")

        # Awards
        if state.awards:
            a("## Awards")
            a("")
            for aw in state.awards:
                funded = f" (funded by {aw['funded_by']})" if aw["funded_by"] else ""
                scores = [f"{c}={v}" for c, v in aw["scores"].items()]
                a(f"- {aw['name']}: {', '.join(scores)}{funded}")
            a("")

        # Turmoil
        if state.turmoil:
            t = state.turmoil
            a("## Turmoil")
            a("")
            ruling = t.get("ruling", "?")
            dominant = t.get("dominant", "?")
            policy = PARTY_POLICIES.get(ruling, {})
            a(f"**Ruling:** {ruling} │ **Dominant:** {dominant} │ **Chairman:** {t.get('chairman', '?')}")
            a(f"**Policy:** {policy.get('policy', '?')}")
            a(f"**Мой influence:** {state.me.influence}")
            if "Reds" in str(ruling):
                a("**⚠️ REDS RULING — каждый подъём параметра = -1 TR!**")
            a("")
            for label, ev_name in [("Текущий", t.get("current")), ("Следующий", t.get("coming")), ("Далёкий", t.get("distant"))]:
                if ev_name:
                    ev = GLOBAL_EVENTS.get(ev_name, {})
                    good = "✅" if ev.get("good", True) else "❌"
                    a(f"- {label}: **{ev_name}** {good} — {ev.get('desc', '?')}")
            a("")

        # Colonies
        if state.colonies_data:
            trade_result = analyze_trade_options(state)
            a("## Колонии")
            a("")

            # Active modifiers
            mods = trade_result["modifiers"]
            if mods["descriptions"]:
                a(f"**Модификаторы:** {', '.join(mods['descriptions'])}")
                a("")

            a("| Колония | Track | Eff.Track | Trade | MC Value | Settlers | Net Profit |")
            a("|---------|-------|-----------|-------|----------|----------|------------|")
            for t in trade_result["trades"]:
                cdata = COLONY_TRADE_DATA.get(t["name"], {})
                settlers_raw = next((c["settlers"] for c in state.colonies_data if c["name"] == t["name"]), [])
                settler_str = ", ".join(settlers_raw) if settlers_raw else "-"
                trade_desc = f"{t['raw_amount']} {t['resource']}"
                net = f"+{t['net_profit']}" if t["net_profit"] > 0 else str(t["net_profit"])
                a(f"| {t['name']} | {t['original_track']} | {t['effective_track']} | "
                  f"{trade_desc} | {t['total_mc']} MC | {settler_str} | {net} MC |")

            # Colonies without trade data
            trade_names = {t["name"] for t in trade_result["trades"]}
            for col in state.colonies_data:
                if col["name"] not in trade_names:
                    settlers = col["settlers"]
                    settler_str = ", ".join(settlers) if settlers else "-"
                    a(f"| {col['name']} | {col['track']} | - | - | - | {settler_str} | - |")

            a("")

            # Trade methods
            if trade_result["methods"]:
                method_strs = [f"{m['cost_desc']} ({m['cost_mc']} MC)" for m in trade_result["methods"]]
                a(f"**Способы торговли:** {' │ '.join(method_strs)}")
                a("")

            if trade_result["best_hint"]:
                a(f"**Рекомендация:** {trade_result['best_hint']}")
                a("")

            # Settlement analysis
            settlements = analyze_settlement(state)
            if settlements:
                a("### Поселение (17 MC SP)")
                a("")
                for s in settlements[:3]:
                    worth = "✅" if s["worth_it"] else "❌"
                    a(f"- {worth} **{s['name']}**: {s['slots']} слота, "
                      f"build={s['build_bonus']} ({s['build_mc']} MC), "
                      f"future colony bonus ~{s['future_value']} MC → "
                      f"total {s['total_value']} MC (ROI gen {s['roi_gens']}+)")
                a("")

        # Timing estimate
        gens_left = _estimate_remaining_gens(state)
        a(f"**Оценка оставшихся поколений:** ~{gens_left}")
        if gens_left <= 2:
            a("**⏰ Финал близко! Приоритет: VP, TR, milestones/awards.**")
        a("")

        # WaitingFor
        wf = state.waiting_for
        if wf:
            a("## Текущее решение")
            a("")
            wf_type = wf.get("type", "?")
            wf_title = _safe_title(wf)
            a(f"**Type:** {wf_type} │ **Title:** {wf_title}")
            if wf_type == "or":
                a("**Опции:**")
                for i, opt in enumerate(wf.get("options", []), 1):
                    a(f"  {i}. {opt.get('buttonLabel', opt.get('title', opt.get('type', '?')))}")

            wf_cards = self._extract_all_wf_cards(wf)
            if wf_cards:
                a("")
                a("**Карты на выбор:**")
                headers = ["Карта", "Cost", "Score", "Tier", "Req", "Заметка"]
                rows = []
                for card in wf_cards:
                    name = card["name"]
                    cost = card.get("cost", 0)
                    score = self.synergy.adjusted_score(
                        name, card.get("tags", []), me.corp,
                        state.generation, me.tags)
                    tier = _score_to_tier(score)
                    note = self._get_note(name)
                    if self.req_checker:
                        req_ok, req_reason = self.req_checker.check(name, state)
                    else:
                        req_ok, req_reason = True, ""
                    req_col = f"⛔ {req_reason}" if not req_ok else "✓"
                    rows.append([name, f"{cost} MC", str(score), tier, req_col, note])
                col_w = [len(h) for h in headers]
                for row in rows:
                    for i, cell in enumerate(row):
                        col_w[i] = max(col_w[i], len(cell))
                hdr = "| " + " | ".join(h.ljust(col_w[i]) for i, h in enumerate(headers)) + " |"
                sep = "|" + "|".join("-" * (col_w[i] + 2) for i in range(len(headers))) + "|"
                a(hdr)
                a(sep)
                for row in rows:
                    a("| " + " | ".join(cell.ljust(col_w[i]) for i, cell in enumerate(row)) + " |")
            a("")

        # ── Draft Buy / Play-Hold Advice ──
        is_buy_phase = state.phase == "research"
        is_action_phase = state.phase in ("action", "")

        if is_buy_phase and wf:
            wf_cards = self._extract_all_wf_cards(wf)
            if wf_cards:
                advice = draft_buy_advice(wf_cards, state, self.synergy, self.req_checker)
                a("## Рекомендация по покупке")
                a("")
                pressure_icon = {"comfortable": "🟢", "tight": "🟡", "critical": "🔴"}.get(
                    advice["mc_pressure"], "⚪")
                a(f"{pressure_icon} MC: {me.mc} → после покупки "
                  f"{advice['buy_count']} карт: {advice['mc_after_buy']} MC "
                  f"(**{advice['mc_pressure']}**)")
                a(f"Рука: {advice['hand_size']} карт "
                  f"(~{advice['gens_to_play_all']} gen до розыгрыша всех) "
                  f"[{advice['hand_saturation']}]")
                a("")
                if advice["buy_list"]:
                    a("| Карта | Score | Cost | Решение | Причина |")
                    a("|-------|-------|------|---------|---------|")
                    for b in advice["buy_list"]:
                        a(f"| {b['name']} | {b['tier']}-{b['score']} | "
                          f"{b['cost_play']} MC | БЕРИ | {b['buy_reason']} |")
                    for s in advice["skip_list"]:
                        a(f"| {s['name']} | {s['tier']}-{s['score']} | "
                          f"- | СКИП | {s['skip_reason']} |")
                a("")
                a(f"→ {advice['hint']}")
                a("")

        if is_action_phase and state.cards_in_hand:
            ph = play_hold_advice(state.cards_in_hand, state, self.synergy, self.req_checker)
            if ph:
                a("## Play/Hold анализ")
                a("")
                a("| Карта | Действие | Причина | Value | Priority |")
                a("|-------|----------|---------|-------|----------|")
                for entry in ph:
                    icon = {"PLAY": "▶", "HOLD": "▷", "SELL": "📤"}.get(entry["action"], "?")
                    a(f"| {entry['name']} | {icon} {entry['action']} | "
                      f"{entry['reason']} | {entry['play_value_now']} | "
                      f"{entry['priority']} |")
                a("")
                # Combo play order hints
                order_hints = [e for e in ph if e.get("play_before")]
                if order_hints:
                    a("**Порядок розыгрыша (combo):**")
                    for entry in order_hints:
                        for pb in entry["play_before"]:
                            a(f"- 🔗 {entry['name']} {pb}")
                    a("")

            alloc = mc_allocation_advice(state, self.synergy, self.req_checker)
            if alloc["allocations"]:
                a("## MC Allocation")
                a(f"**Бюджет:** {alloc['budget']} MC")
                a("")
                a("| # | Действие | Cost | Value | Тип |")
                a("|---|----------|------|-------|-----|")
                for i, al in enumerate(alloc["allocations"][:8], 1):
                    cost_str = f"{al['cost']} MC" if al["cost"] > 0 else "free"
                    a(f"| {i} | {al['action']} | {cost_str} | "
                      f"~{al['value_mc']} MC | {al['type']} |")
                if alloc["mc_reserve"] > 0:
                    a(f"\n**Резерв:** {alloc['mc_reserve']} MC ({alloc['reserve_reason']})")
                for w in alloc.get("warnings", []):
                    a(f"\n> ⚠️ {w}")
                ng = alloc.get("next_gen")
                if ng:
                    a(f"\n📅 **Next gen:** income {ng['income']} MC, "
                      f"projected ~{ng['projected_mc']} MC ({ng['phase_next']})")
                a("")

        # ── Встроенная аналитика ──
        a("---")
        a("")

        tips = strategy_advice(state)
        if tips:
            a("## Стратегия")
            a("")
            for tip in tips:
                a(tip)
            a("")

        alerts = _generate_alerts(state)
        if alerts:
            a("## Рекомендации")
            a("")
            for alert in alerts:
                a(f"- {alert}")
            a("")

        gens_left_sp = _estimate_remaining_gens(state)
        sp_list = sp_efficiency(gens_left_sp, state.me.tableau if state.me else None)
        affordable_sps = [(n, r, g) for n, r, g in sp_list
                          if STANDARD_PROJECTS[n]["cost"] <= state.mc and r >= 0.45]
        if affordable_sps:
            a("## Стандартные проекты")
            a("")
            for name, ratio, gives in affordable_sps[:4]:
                cost = STANDARD_PROJECTS[name]["cost"]
                eff = "отлично" if ratio >= 0.6 else "ок" if ratio >= 0.5 else "слабо"
                a(f"- **{name}** {cost} MC → {gives} [{eff}]")
            a("")

        if state.cards_in_hand and self.req_checker:
            req_hints = _forecast_requirements(state, self.req_checker, state.cards_in_hand)
            if req_hints:
                a("## Прогноз requirements")
                a("")
                for h in req_hints[:5]:
                    a(f"- {h}")
                a("")

        if state.has_colonies:
            trade_result = analyze_trade_options(state)
            profitable = [t for t in trade_result["trades"] if t["net_profit"] > 0]
            if profitable:
                a("## Торговля (анализ)")
                a("")
                mods = trade_result["modifiers"]
                if mods["descriptions"]:
                    a(f"**Модификаторы:** {', '.join(mods['descriptions'])}")
                best = profitable[0]
                a(f"- **Best trade:** {best['name']} "
                  f"(track {best['original_track']}→{best['effective_track']}, "
                  f"{best['raw_amount']} {best['resource']} = {best['total_mc']} MC, "
                  f"net **+{best['net_profit']}**)")
                if len(profitable) > 1:
                    s = profitable[1]
                    a(f"- 2nd: {s['name']} ({s['total_mc']} MC, net +{s['net_profit']})")
                methods = trade_result["methods"]
                if methods:
                    a(f"- Способы: {' │ '.join(m['cost_desc'] for m in methods)}")
                a("")

        mc_hints = _mc_flow_projection(state)
        if mc_hints:
            a("## MC прогноз")
            a("")
            for h in mc_hints:
                a(f"- {h}")
            a("")

        combo = getattr(self.synergy, 'combo', None)
        if combo and state.me.tableau:
            tableau_names = [c["name"] for c in state.me.tableau]
            hand_names = [c["name"] for c in state.cards_in_hand] if state.cards_in_hand else []
            if tableau_names or hand_names:
                combo_tags = dict(state.tags)
                combo_tags["_colony_count"] = state.me.colonies
                combos = combo.analyze_tableau_combos(tableau_names, hand_names, combo_tags)
                if combos:
                    a("## Комбо и синергии")
                    a("")
                    for c in combos[:8]:
                        desc = c["description"] if isinstance(c, dict) else str(c)
                        a(f"- {desc}")
                    a("")

        return "\n".join(lines)

    @staticmethod
    def _render_map(spaces: list[dict]) -> list[str]:
        """Рендер гексагональной карты в ASCII."""
        TILE_CH = {
            0: "Gr", 1: "OC", 2: "Ci", 9: "Mi", 11: "Re",
            13: "NP", 8: "LA", 3: "In", 4: "Mo", 5: "Ca",
            6: "Nu", 7: "Ec", 10: "Co", 14: "Ma", 15: "Er",
        }
        BONUS_CH = {
            0: "t", 1: "s", 2: "p", 3: "c", 4: "h",
            5: "O", 6: "$", 7: "a", 8: "m", 9: "e",
            10: "d", 11: "S", 12: "E", 13: "T",
            15: "*", 16: "D", 17: "K", 18: "T",
        }
        COLOR_CH = {
            "green": "G", "red": "R", "orange": "O",
            "blue": "B", "yellow": "Y", "purple": "P",
        }

        grid: dict[tuple[int, int], str] = {}
        for s in spaces:
            y, x = s.get("y", -1), s.get("x", -1)
            if y < 0:
                continue
            tile = s.get("tileType")
            color = s.get("color", "")
            st = s.get("spaceType", "land")
            bonus = s.get("bonus", [])

            if tile is not None:
                tc = TILE_CH.get(tile, f"{tile:02d}")
                ci = COLOR_CH.get(color, " ")
                cell = f"{ci}{tc}"
            elif st == "ocean":
                cell = " ~~ "
            else:
                b_str = "".join(BONUS_CH.get(b, "?") for b in bonus)
                cell = f" {b_str:<3s}" if b_str else " .  "
            grid[(x, y)] = cell

        rows_by_y: dict[int, list[int]] = {}
        for (x, y) in grid:
            rows_by_y.setdefault(y, []).append(x)

        if not rows_by_y:
            return ["(карта пуста)"]

        max_row_size = max(len(xs) for xs in rows_by_y.values())

        output_lines = []
        for y in sorted(rows_by_y.keys()):
            xs = sorted(rows_by_y[y])
            row_size = len(xs)
            indent = "  " * (max_row_size - row_size)
            cells = [f"[{grid[(x, y)]}]" for x in xs]
            output_lines.append(f"{indent}{' '.join(cells)}")

        return output_lines

    def _get_note(self, name: str) -> str:
        card = self.db.get(name)
        if not card:
            return "нет данных"
        economy = card.get("economy", "")
        if economy:
            return economy.split(".")[0][:60]
        return ""

    @staticmethod
    def _extract_all_wf_cards(wf: dict) -> list[dict]:
        cards = []
        for c in wf.get("cards", []):
            cards.append(_parse_wf_card(c))
        for opt in wf.get("options", []):
            for c in opt.get("cards", []):
                cards.append(_parse_wf_card(c))
        return cards

    def format_postgame(self, state) -> str:
        """Markdown post-game report для --claude mode."""
        lines = []
        a = lines.append

        all_players = [state.me] + state.opponents
        vp_data = {}
        for p in all_players:
            bd = p.raw.get("victoryPointsBreakdown", {})
            vp_data[p.name] = {
                "total": bd.get("total", 0),
                "tr": bd.get("terraformRating", p.tr),
                "cards": bd.get("victoryPoints", 0),
                "greenery": bd.get("greenery", 0),
                "city": bd.get("city", 0),
                "milestones": bd.get("milestones", 0),
                "awards": bd.get("awards", 0),
                "details_cards": {d["cardName"]: d["victoryPoint"]
                                  for d in bd.get("detailsCards", [])},
            }

        ranked = sorted(all_players,
                        key=lambda p: (vp_data[p.name]["total"], p.mc),
                        reverse=True)
        winner = ranked[0]
        top_vp = vp_data[ranked[0].name]["total"]
        tied = [p for p in ranked if vp_data[p.name]["total"] == top_vp]
        is_tie = len(tied) > 1

        a(f"# Post-Game Report — Gen {state.generation}")
        a("")

        a("## Scoreboard")
        a("")
        if is_tie:
            a(f"**НИЧЬЯ {top_vp} VP! Tiebreaker по MC: {winner.name} ({winner.mc} MC)**")
            a("")
        a("| # | Player | Corp | Total | TR | Cards | Green | City | MS | AW |")
        a("|---|--------|------|-------|----|-------|-------|------|----|-----|")
        for i, p in enumerate(ranked, 1):
            v = vp_data[p.name]
            marker = "**" if p == winner else ""
            mc_str = f" [{p.mc} MC]" if is_tie and v["total"] == top_vp else ""
            a(f"| {i} | {marker}{p.name}{marker}{mc_str} | {p.corp} | "
              f"{v['total']} | {v['tr']} | {v['cards']} | "
              f"{v['greenery']} | {v['city']} | {v['milestones']} | {v['awards']} |")
        a("")

        my_vp = vp_data[state.me.name]
        card_vps = my_vp["details_cards"]
        if card_vps:
            positive = [(n, vp) for n, vp in sorted(card_vps.items(), key=lambda x: x[1], reverse=True) if vp > 0]
            if positive:
                a("## Мои лучшие карты")
                a("")
                a("| VP | Карта | Tier | Score |")
                a("|----|-------|------|-------|")
                for name, vp_val in positive:
                    score = self.db.get_score(name)
                    tier = self.db.get_tier(name)
                    a(f"| +{vp_val} | {name} | {tier} | {score} |")
                a("")

        a("## Вклад карт")
        a("")
        a("| Tier | Карта | Cost | Вклад |")
        a("|------|-------|------|-------|")
        for tc in state.me.tableau:
            name = tc["name"]
            card_info = self.db.get_info(name) or {}
            card_data = self.db.get(name) or {}
            cost = card_info.get("cost", 0)
            if cost == 0:
                continue
            vp_val = card_vps.get(name, 0)
            score = self.db.get_score(name)
            tier = self.db.get_tier(name)
            res = tc.get("resources", 0)

            contributions = []
            reasoning = card_data.get("reasoning", "").lower() if card_data else ""
            card_desc = str(card_info.get("description", "")).lower()
            card_text = reasoning + " " + card_desc

            if vp_val > 0:
                contributions.append(f"+{vp_val} VP")
            elif vp_val < 0:
                contributions.append(f"{vp_val} VP")
            if any(kw in card_text for kw in ["ocean", "temp", "oxygen", "venus", "tr", "terraform"]) and cost > 0:
                contributions.append("TR")
            if any(kw in card_text for kw in ["prod", "production"]):
                contributions.append("Production")
            if any(kw in card_text for kw in ["rebate", "discount", "cheaper", "save"]):
                contributions.append("Economy")
            if "action" in card_text:
                contributions.append("Action")

            contrib_str = ", ".join(contributions) if contributions else "Tags/Support"
            res_str = f" ({res}res)" if res else ""
            a(f"| {tier}-{score} | {name}{res_str} | {cost} MC | {contrib_str} |")
        a("")

        overrated = []
        underrated = []
        for tc in state.me.tableau:
            name = tc["name"]
            score = self.db.get_score(name)
            tier = self.db.get_tier(name)
            vp_val = card_vps.get(name, 0)
            card_info = self.db.get_info(name) or {}
            card_data = self.db.get(name) or {}
            cost = card_info.get("cost", 0)
            reasoning = (card_data.get("reasoning", "") + " " +
                         str(card_info.get("description", ""))).lower()
            has_indirect_value = any(kw in reasoning for kw in [
                "prod", "tr", "ocean", "temp", "oxygen", "venus", "terraform",
                "rebate", "discount", "action", "draw", "card"])
            if score >= 70 and vp_val == 0 and cost > 8 and not has_indirect_value:
                overrated.append((name, score, tier, cost))
            elif score <= 55 and vp_val >= 3:
                underrated.append((name, score, tier, vp_val))

        if overrated or underrated:
            a("## Оценка vs реальность")
            a("")
            for name, score, tier, cost in overrated:
                a(f"- **▼** {name} [{tier}-{score}] — 0 VP при cost {cost} MC (переоценена?)")
            for name, score, tier, vp_val in underrated:
                a(f"- **▲** {name} [{tier}-{score}] — {vp_val} VP (недооценена?)")
            a("")

        a("## Все игроки: анализ карт")
        a("")
        for p in ranked:
            v = vp_data[p.name]
            is_me = p.name == state.me.name
            marker = "🔴 " if is_me else ""
            a(f"### {marker}{p.name} ({p.corp}) — {v['total']} VP")
            a("")
            p_card_vps = v["details_cards"]
            p_tableau = p.raw.get("tableau", []) or []
            tableau_entries = []
            for tc_item in p_tableau:
                tc_name = tc_item if isinstance(tc_item, str) else tc_item.get("name", "?")
                card_vp = p_card_vps.get(tc_name, 0)
                sc = self.db.get_score(tc_name)
                ti = self.db.get_tier(tc_name)
                ci = self.db.get_info(tc_name)
                c_cost = ci.get("cost", 0) if ci else 0
                c_res = 0
                if isinstance(tc_item, dict):
                    c_res = tc_item.get("resources", 0)
                tableau_entries.append((tc_name, ti, sc, c_cost, card_vp, c_res))
            tableau_entries.sort(key=lambda x: (-x[4], -x[2]))

            a("| VP | Tier | Карта | Cost |")
            a("|----|------|-------|------|")
            for tc_name, ti, sc, c_cost, card_vp, c_res in tableau_entries:
                vp_str = f"+{card_vp}" if card_vp > 0 else str(card_vp) if card_vp < 0 else ""
                res_str = f" ({c_res}res)" if c_res else ""
                a(f"| {vp_str} | {ti}-{sc} | {tc_name}{res_str} | {c_cost} MC |")

            played_count = len(tableau_entries)
            total_card_vp = sum(e[4] for e in tableau_entries)
            avg_score = sum(e[2] for e in tableau_entries) / played_count if played_count else 0
            a(f"\n*{played_count} карт | VP от карт: {total_card_vp} | Avg score: {avg_score:.0f}*")
            a("")

        tableau_size = len(state.me.tableau)
        total_cards_vp = my_vp["cards"]
        vp_per_card = total_cards_vp / tableau_size if tableau_size > 0 else 0
        a("## Статистика")
        a("")
        a(f"- Сыграно карт: {tableau_size} | VP от карт: {total_cards_vp} | VP/card: {vp_per_card:.2f}")
        a(f"- Greenery: {my_vp['greenery']} VP | Cities: {my_vp['city']} VP | TR: {my_vp['tr']}")
        a(f"- Milestones: {my_vp['milestones']} VP | Awards: {my_vp['awards']} VP | Total: {my_vp['total']} VP")
        a("")

        return "\n".join(lines)
