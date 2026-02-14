"""ComboDetector — анализ tableau и руки для поиска комбо и синергий."""

import re

from .card_parser import CardEffectParser


class ComboDetector:
    """Анализирует tableau и руку игрока для поиска комбо и синергий."""

    def __init__(self, parser: CardEffectParser, db):
        self.parser = parser
        self.db = db

        # Предварительно построим индексы
        self._resource_targets: dict[str, list[str]] = {}  # res_type -> [card names that hold it]
        self._resource_adders: dict[str, list[str]] = {}   # res_type -> [card names that add it]
        self._trigger_cards: dict[str, list[str]] = {}     # trigger_key -> [card names]
        self._discount_cards: list[str] = []
        self._tag_scalers: dict[str, list[str]] = {}       # tag -> [card names with tag_scaling]

        for name, eff in parser.effects.items():
            if eff.name != name:
                continue  # skip normalized duplicates

            # Resource targets (cards that hold resources)
            if eff.resource_holds and eff.resource_type:
                rt = eff.resource_type
                self._resource_targets.setdefault(rt, []).append(name)

            # Resource adders (normalize multi-type like "Microbe Or 1 Animal" → both)
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    # Check for "X or Y" multi-resource adders
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            self._resource_adders.setdefault(res, []).append(name)
                    else:
                        self._resource_adders.setdefault(raw_type, []).append(name)

            # Trigger cards
            for trig in eff.triggers:
                key = trig["on"][:40]
                self._trigger_cards.setdefault(key, []).append(name)

            # Discount cards
            if eff.discount:
                self._discount_cards.append(name)

            # Tag scalers
            for ts in eff.tag_scaling:
                self._tag_scalers.setdefault(ts["tag"], []).append(name)

    def find_resource_targets(self, resource_type: str) -> list[str]:
        """Найти все карты, которые могут держать данный тип ресурса."""
        return self._resource_targets.get(resource_type, [])

    def find_resource_adders(self, resource_type: str) -> list[str]:
        """Найти все карты, которые кладут ресурс на другие карты."""
        return self._resource_adders.get(resource_type, [])

    def analyze_tableau_combos(self, tableau_names: list[str], hand_names: list[str],
                                tags: dict[str, int]) -> list[dict]:
        """
        Анализирует комбо между сыгранными картами и рукой.
        Returns list of {type, cards, description, value_bonus}
        """
        combos = []
        tableau_set = set(tableau_names)
        hand_set = set(hand_names)
        all_cards = tableau_set | hand_set

        # 1. Resource placement combos: adder in tableau + target in tableau/hand
        tableau_targets = {}  # res_type -> [card names on tableau that hold it]
        tableau_adders = {}   # res_type -> [card names on tableau that add to other cards]

        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.resource_holds and eff.resource_type:
                tableau_targets.setdefault(eff.resource_type, []).append(name)
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            tableau_adders.setdefault(res, []).append(name)
                    else:
                        tableau_adders.setdefault(raw_type, []).append(name)

        # Hand cards that are targets — combo with existing adders
        for name in hand_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.resource_holds and eff.resource_type:
                adders = tableau_adders.get(eff.resource_type, [])
                if adders:
                    vp_info = ""
                    if eff.vp_per and eff.vp_per.get("per") in ("resource", "1 resource"):
                        vp_info = " (1 VP/ресурс!)"
                    elif eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                        vp_info = f" ({eff.vp_per['amount']} VP/{eff.vp_per['per']})"
                    combos.append({
                        "type": "resource_target",
                        "cards": [name] + adders[:2],
                        "description": f"{name} принимает {eff.resource_type} ← {', '.join(adders[:2])}{vp_info}",
                        "value_bonus": 8 if "1 VP" in vp_info else 5,
                    })

            # Hand cards that add resources — combo with existing targets
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    # Normalize multi-type
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            targets = tableau_targets.get(res, [])
                            if targets:
                                combos.append({
                                    "type": "resource_adder",
                                    "cards": [name] + targets[:2],
                                    "description": f"{name} кладёт {res} → {', '.join(targets[:2])}",
                                    "value_bonus": 5,
                                })
                    else:
                        targets = tableau_targets.get(raw_type, [])
                        if targets:
                            combos.append({
                                "type": "resource_adder",
                                "cards": [name] + targets[:2],
                                "description": f"{name} кладёт {raw_type} → {', '.join(targets[:2])}",
                                "value_bonus": 5,
                            })

        # 2. Tag scaling combos: card in hand scales by tag count
        for name in hand_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            for ts in eff.tag_scaling:
                tag = ts["tag"]
                count = tags.get(tag, 0)
                if count >= 3:
                    combos.append({
                        "type": "tag_scaling",
                        "cards": [name],
                        "description": f"{name}: {ts['gives']} × {count} {tag} тегов",
                        "value_bonus": min(count * 2, 12),
                    })

            # Per-tag resource placement
            for add in eff.adds_resources:
                if add.get("per_tag"):
                    tag = add["per_tag"]
                    count = tags.get(tag, 0)
                    if count >= 2:
                        total = add["amount"] * count
                        targets = tableau_targets.get(add["type"], [])
                        target_str = f" → {targets[0]}" if targets else ""
                        combos.append({
                            "type": "scaling_placement",
                            "cards": [name] + (targets[:1] if targets else []),
                            "description": f"{name}: {total} {add['type']} ({add['amount']}×{count} {tag}){target_str}",
                            "value_bonus": min(total * 2, 10),
                        })

        # 3. Trigger combos: triggered effect in tableau + matching card in hand
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            for trig in eff.triggers:
                trigger_text = trig["on"].lower()
                for hname in hand_names:
                    heff = self.parser.get(hname)
                    hinfo = self.db.get_info(hname)
                    if not hinfo:
                        continue
                    htags = [t.lower() for t in hinfo.get("tags", [])]

                    # "play X tag" triggers
                    for tag in htags:
                        if f"play" in trigger_text and tag in trigger_text:
                            combos.append({
                                "type": "trigger",
                                "cards": [hname, name],
                                "description": f"{hname} ({tag}) → триггерит {name}: {trig['effect'][:50]}",
                                "value_bonus": 3,
                            })
                            break

        # 4. Discount combos: discount in tableau + matching cards in hand
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.discount:
                for hname in hand_names:
                    hinfo = self.db.get_info(hname)
                    if not hinfo:
                        continue
                    htags = hinfo.get("tags", [])
                    for tag, amount in eff.discount.items():
                        if tag == "all" or tag.lower() in [t.lower() for t in htags]:
                            combos.append({
                                "type": "discount",
                                "cards": [hname, name],
                                "description": f"{hname} дешевле на {amount} MC ({name})",
                                "value_bonus": min(amount, 4),
                            })
                            break

        # 5. Intra-tableau combos (existing synergies already in play)
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            # Existing resource engines
            if eff.resource_holds and eff.resource_type:
                adders = tableau_adders.get(eff.resource_type, [])
                if adders and name not in adders:
                    vp_info = ""
                    if eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                        vp_info = f" → VP"
                    if vp_info:  # only report active VP engines
                        combos.append({
                            "type": "active_engine",
                            "cards": [name] + [a for a in adders if a != name][:2],
                            "description": f"ENGINE: {', '.join(adders[:2])} → {name}{vp_info}",
                            "value_bonus": 0,  # already in play, just informational
                        })

        # Deduplicate by main card
        seen = set()
        unique = []
        for c in combos:
            key = (c["type"], c["cards"][0])
            if key not in seen:
                seen.add(key)
                unique.append(c)

        # Sort by value bonus
        unique.sort(key=lambda x: x["value_bonus"], reverse=True)
        return unique

    def get_hand_synergy_bonus(self, card_name: str, tableau_names: list[str],
                                tags: dict[str, int]) -> int:
        """Рассчитать бонус синергии конкретной карты с текущим tableau."""
        bonus = 0
        eff = self.parser.get(card_name)
        if not eff:
            return 0

        # Resource target bonus: card holds resources and we have adders
        if eff.resource_holds and eff.resource_type:
            for tname in tableau_names:
                teff = self.parser.get(tname)
                if not teff:
                    continue
                for add in teff.adds_resources:
                    if add["target"] not in ("any", "another"):
                        continue
                    # Normalize multi-type adders
                    add_types = set()
                    raw = add["type"]
                    if " or " in raw.lower():
                        for part in re.split(r'\s+or\s+', raw.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            add_types.add(CardEffectParser._RES_ALIASES.get(clean, clean.title()))
                    else:
                        add_types.add(raw)
                    if eff.resource_type in add_types:
                        bonus += 5
                        if eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                            bonus += 3
                        break

        # Resource adder bonus: card adds resources and we have targets
        for add in eff.adds_resources:
            if add["target"] in ("any", "another"):
                add_types = set()
                raw = add["type"]
                if " or " in raw.lower():
                    for part in re.split(r'\s+or\s+', raw.lower()):
                        clean = re.sub(r'^\d+\s*', '', part).strip()
                        add_types.add(CardEffectParser._RES_ALIASES.get(clean, clean.title()))
                else:
                    add_types.add(raw)
                for tname in tableau_names:
                    teff = self.parser.get(tname)
                    if not teff:
                        continue
                    if teff.resource_holds and teff.resource_type in add_types:
                        bonus += 4
                        if teff.vp_per and "resource" in str(teff.vp_per.get("per", "")):
                            bonus += 3
                        break

        # Tag scaling bonus
        for ts in eff.tag_scaling:
            count = tags.get(ts["tag"], 0)
            if count >= 3:
                bonus += min(count, 6)

        # Per-tag resource placement bonus
        for add in eff.adds_resources:
            if add.get("per_tag"):
                count = tags.get(add["per_tag"], 0)
                if count >= 3:
                    bonus += min(count, 6)

        # Trigger bonus: this card triggers something in tableau
        card_info = self.db.get_info(card_name)
        card_tags = [t.lower() for t in card_info.get("tags", [])] if card_info else []
        for tname in tableau_names:
            teff = self.parser.get(tname)
            if not teff:
                continue
            for trig in teff.triggers:
                trigger_text = trig["on"].lower()
                for tag in card_tags:
                    if "play" in trigger_text and tag in trigger_text:
                        bonus += 3
                        break

        return min(bonus, 15)  # cap
