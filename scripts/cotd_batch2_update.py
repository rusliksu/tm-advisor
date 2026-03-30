"""
COTD Batch 2 Update: Cards 54-106 (indices 53-105)
Updates reasoning field in evaluations.json with COTD community insights.
"""
import json
import copy

# Load data
with open('data/cotd_update_needed.json', 'r', encoding='utf-8') as f:
    needed = json.load(f)
with open('data/cotd_lookup.json', 'r', encoding='utf-8') as f:
    cotd = json.load(f)
with open('data/evaluations.json', 'r', encoding='utf-8') as f:
    evals = json.load(f)

batch_cards = needed['cards'][53:106]

# Updated reasoning for each card, incorporating COTD insights
# Format: card_name -> new_reasoning (max 400 chars)

updates = {
    "Martian Zoo": (
        "Strong when played early with many Earth tags incoming. The 2-city requirement can delay it significantly. "
        "Per COTD community, timing is tricky — best after cities but before Earth tags. Powerful with Miranda colony and Meat Industry combo. "
        "Animal+Building tag combo useful for Ecologist/Diversifier. Only 1 VP (not per animal), often misread."
    ),
    "Adapted Lichen": (
        "No-requirement plant production is convenient but expensive at 12 MC for 1 plant-prod. "
        "Per COTD community consensus, mainly justified when the Plant tag enables NRA or Ecologist milestone early. "
        "Experienced players note it's a 'target me' sign — attracts plant destruction events. Only worth gen 1-2 if tag enables a key combo."
    ),
    "Artificial Photosynthesis": (
        "Overpriced for production alone, but the Science tag adds value. 2 energy-prod for 15 MC is acceptable. "
        "Per COTD community, almost never used for plant production — the energy mode is the real value. "
        "Experienced players note it's a lifesaver when you need AI Central online. Science tag is a nice bonus, not the main draw."
    ),
    "Bio Printing Facility": (
        "Cheap card with flexible action requiring energy. Animal placement mode is strong with 1-VP-per-animal cards. "
        "Per COTD community, the plant mode (2 plants on demand) is underrated — safer than production against plant attacks, "
        "and allows double-greenery timing tricks. Energy requirement is the real bottleneck; worthless without it."
    ),
    "Air Raid": (
        "No-tag penalty and take-that pattern in 3P makes this weak. Net gain ~1-2 MC after floater cost. "
        "Per COTD community, experienced players agree it's mainly a 'free draw' card — never worth drafting, only play if drawn for free. "
        "The floater cost is the real killer since floaters are usually needed for VP or other actions."
    ),
    "Heather": (
        "Decent plant production card. -14C requirement means playable early-mid game. Plant tag valuable for NRA/Insects/Ecologist. "
        "Per COTD community, it's 'fine but underwhelming' — Bushes offers much more value for a similar slot. "
        "Experienced players note the heat requirement is just a tad too high for gen 1, making it a gen 2-3 play at best."
    ),
    # Hi-tech Lab: NOT IN EVALS — will skip
    "Crash Site Cleanup": (
        "Nearly free VP when requirement is met. Net cost ~3 MC for 1 VP after resource gain. "
        "Per COTD community, you can trigger it yourself (play plant removal then this), making it more reliable than it seems. "
        "Experienced players note the resource choice (steel or titanium) adds flexibility. Never more than a cheap point though."
    ),
    "Aquifer Turbines": (
        "Solid prelude with ocean + 2 energy-prod. Per COTD community, value is heavily colony-dependent: "
        "near-autopick with Colonies (energy for trading), mediocre without. Ocean placement bonus can be significant on Tharsis. "
        "Experienced players value it at ~28 MC total. Without Colonies, energy production is the most useless stat to get early."
    ),
    "Ice Asteroid": (
        "Solid space event placing 2 oceans. Ti-payable with good placement bonuses. "
        "Per COTD community, best use case is converting 4 plants to 8 via ocean adjacency, then greenery with second action. "
        "Arctic Algae synergy makes this potentially greenery-generating on its own. Upper-mid tier space event, not flashy but reliable."
    ),
    "Land Claim": (
        "Pays 4 MC to reserve a spot rather than just taking it. Per COTD community, nearly unanimous that it's not worth drafting. "
        "Only play if drawn for free. Blocking value exists but in 3P opponents can usually play elsewhere. "
        "Experienced players note the psychological bluff value — holding it can deter opponents even unplayed."
    ),
    "Double Down": (
        "Мультипликатор ценности — ceiling зависит целиком от парной прелюдии. Per COTD community, значительно лучше с Extended Start (pick 2 of 6). "
        "Не копирует теги и ongoing-эффекты — серьёзный минус. Лучшие цели: Project Eden, Great Aquifer, Huge Asteroid. "
        "Интересный combo с Preservation Program (5 TR бесплатно, т.к. effect не копируется). Нельзя копировать себя."
    ),
    "House Printing": (
        "1 steel-prod + 1 VP for 13 MC. Per COTD community, consensus is 'not great, not terrible' — a basic Mine with VP attached. "
        "The VP works against it as a production card (you want production early but pay extra for late-game VP). "
        "Experienced players only recommend as a last-gen steel dump for a point. ~3 steel back on a 10-cost card."
    ),
    "Rotator Impacts": (
        "Classic floater trap. Per COTD community, overwhelmingly negative — 'like Security Fleet, only more expensive, slower, fewer points.' "
        "Catches up with Neutral Gases only after 4 gens and 21 MC, missing 8 MC from TR in the meantime. "
        "Even with asteroid placement cards it's not great. Only niche use: mandatory Venus terraforming in solo."
    ),
    "Local Heat Trapping": (
        "Efficient conversion of surplus heat into plants or animal VP. Per COTD community, the animal mode (2 penguins!) is the main draw. "
        "Experienced players note it's a nice late-game surplus heat dump. No tags is a real penalty but the 1 MC cost makes it nearly free. "
        "Rarely used for plants; the animal placement on a 1VP card is the best case."
    ),
    "Productive Outpost": (
        "Zero cost makes this always playable. Per COTD community, essentially always worth the 3 MC drafting cost — "
        "pays off with 2+ colonies on decent locations. Experienced players note it helps snatch Tycoon/Magnate milestones. "
        "With 6-7 colonies it's a sweet payoff. Even with 1 colony on Pluto or Miranda it's arguably fine."
    ),
    "Conscription": (
        "Like Indentured Workers on steroids — net 8 MC for -1 VP. Per COTD community, 'better Indentured Workers, and Indentured Workers is already really good.' "
        "Playing economy cards a turn earlier can be game-defining. Earth tag adds Point Luna/Earth Office synergy. "
        "Requirement (2 Earth) is achievable with preludes. Scary tempo card in early-mid game."
    ),
    "Gyropolis": (
        "Expensive city requiring Earth/Venus tags. Per COTD community, not worth it under 4 MC-prod from tags. "
        "True cost is ~37 MC including energy production. Experienced players note it's a strong late-game city for engine builders "
        "whose energy production is cheap by then. Great with Robotic Workforce duplication. Has secured Banker unexpectedly."
    ),
    "Energy Tapping": (
        "Cheap Power tag with take-that energy steal. Per COTD community, significantly better with Colonies — "
        "hitting someone's energy when they need 3 energy to trade is devastating. Almost always played gen 1-3 with Colonies. "
        "Without Colonies, still a decent tempo card. The -1 VP is negligible early. Power tag for energy awards."
    ),
    "Law Suit": (
        "Conditional and unreliable reactive card. Per COTD community, the mind-game value is underrated — "
        "just knowing it was drafted can deter attacks. In 3P, experienced players note it feels bad to be targeted "
        "because 'they have Law Suit.' The 3 MC steal + VP penalty is modest but the deterrent effect has real value."
    ),
    "Imported GHG": (
        "Marginal value alone but excellent with discount infrastructure. Per COTD community, the triple-tag (Earth/Space/Event) "
        "is the real value — with even one discount it becomes good, with two it's great. "
        "Optimal Aerobraking combo makes it very strong. Useful for Legend milestone on Elysium. Without any discounts, skip it."
    ),
    "Algae": (
        "One of the best plant production cards. 2 plant-prod + 1 plant for 13 MC is great value. "
        "Per COTD community, especially strong with Prelude ocean-rushing (5 oceans before gen 3 possible). "
        "The end-of-game plant conversion phase means even 1 gen of production yields 5 usable plants. Plant tag enables NRA/Ecologist."
    ),
    "Capital": (
        "Most expensive city in the game. Per COTD community, widely considered a trap by experienced players. "
        "True cost ~43 MC including energy production. At 5 MC-prod it takes 9+ gens to recover. "
        "Experienced players note it can sometimes be the best available option late game as a steel dump. VP from ocean adjacency is variable."
    ),
    "Investment Loan": (
        "Strong tempo card. Per COTD community, 'gets passed far too often' — experienced players consider it near-autopick. "
        "The -1 MC-prod is a real cost but the 10 MC enables playing a good economy card a turn earlier, "
        "stealing a milestone, or surprise-ending the game. Almost always worth buying once drafted."
    ),
    "Indentured Workers": (
        "Excellent tempo card. Per COTD community, 'Indentured Workers are great! In Terraforming Mars.' "
        "Effective net gain of 5 MC for -1 VP, but real value is much higher from tempo — playing Earth Catapult a gen earlier "
        "is game-changing. Often underrated by inexperienced players. Best combo: IC + Media Group for event profit chain."
    ),
    "Big Asteroid": (
        "Strong space event for rushers. Per COTD community, 'nothing spectacular but usually a solid card.' "
        "The 4 ti cashback means effective cost ~15 MC for 2 temp TR. Combo with Deimos Down at -10C is devastating. "
        "Experienced players note stacking discounts (Advanced Alloys, Earth Catapult) can make you pay 3 ti and get 4 back."
    ),
    "Open City": (
        "Best base-game city card. 4 MC-prod + Building tag + 2 plants. Per COTD community, 'one of the best cities and best late-game steel dumps.' "
        "12% O2 requirement means gen 4-6 in 3P/WGT. Experienced players note it pairs with Immigrant City and pet bonuses. "
        "Late game it still works well as a steel dump."
    ),
    "Imported Hydrogen": (
        "Triple-function card with ocean + flexible resources. Ti-payable drops effective cost to ~13-15 MC. "
        "Per COTD community, 'the three tags are the most discounted/rebated — I've played this card for free.' "
        "Animal mode is best for 1VP cards. Rarely used for microbes except with Sulphur-Eating Bacteria. Solid upper-tier space event."
    ),
    "Astra Mechanica": (
        "Extremely powerful with good event targets. Per COTD community, 'do not sleep on this card, it is one of the best in the game.' "
        "Top targets: GHG Shipment, Solar Probe, Red Tourism Wave, Soil Studies, Bribed Committee. "
        "Also funny with Law Suit (retrieve and replay). Can return money events in most cases. High draft priority."
    ),
    "Imported Nutrients": (
        "Solid Earth+Space event with triple-tag discount potential. Per COTD community, 'worth buying even without microbes yet' — "
        "the space tag does heavy lifting for discounts. 4 instant plants is strong for greenery conversion. "
        "With Optimal Aerobraking + discounts, sometimes played for free. Great with Ants/Decomposers/Venusian Insects."
    ),
    "Corroder Suits": (
        "Essentially Sponsors +2 MC with Venus tag instead of Earth. Per COTD community, 'a bit bonkers — tag + resource for just 2 MC more than Sponsors.' "
        "Venus resource can represent 1 VP or half a TR on the right card. "
        "Experienced players note it's rarely sad to see this card — decent, cheap, flexible for requirements/milestones."
    ),
    "Arcadian Communities": (
        "Area denial corp, depends on tile placement cards. Per COTD community, area denial is brutal with city+greenery focus, "
        "but 'spamming cities is extremely bad unless you surround them with greeneries.' "
        "60 MC + 10 steel start is solid. Experienced players love it for securing milestones/awards and with Merger."
    ),
    "Advertising": (
        "Cheap Earth tag with conditional effect on 20+ MC cards. Per COTD community, 'do you have 2+ cards costing 20+? If yes, buy it.' "
        "Strong for Credicor. Experienced players warn: don't pass this to Point Luna player in draft. "
        "Only ~17% of cards cost 20+, so you need existing targets in hand. Not a speculative buy."
    ),
    "Magnetic Field Dome": (
        "Overcosted production card. Per COTD community, 'never a keep, sometimes playable last gen.' "
        "The 2 energy production cost is steep for just 1 TR + 1 plant-prod return. "
        "Experienced players unanimously rate it as a last-gen-only play with excess energy. Very weak overall."
    ),
    "Breathing Filters": (
        "Simple VP card: 2 VP + Science tag for 14 MC. Per COTD community, 'it's ok' — mainly useful late-game for Scientist award. "
        "Not a start hand keeper due to 7% O2 requirement. Experienced players note it's better with Mars University "
        "or Olympus Conference for the science tag. Otherwise expensive for what it offers."
    ),
    "Lunar Mining": (
        "Extremely powerful with Earth tag density but weak without. Per COTD community, 'win-more card — just pick it if you have 3+ Earth tags.' "
        "Some groups house-banned it due to how oppressive it is with Point Luna. "
        "At 2+ ti-prod it's excellent. Preludes with Earth tags help enormously. Rarely good without at least 3 Earth tags in engine."
    ),
    "Worms": (
        "Scaling plant production from microbe tags. Per COTD community, 'too few microbe tags in the game to make it really good.' "
        "Players note Insects gets 1:1 ratio but Worms only 1:2, which is unfair. "
        "Only viable with multiple expansions (especially Venus) adding microbe tags. Need 6+ microbe tags when played for decent value."
    ),
    "Mining Expedition": (
        "Take-that plant removal + O2 raise + steel gain. Per COTD community, it's a 'tempo card' — "
        "lets you increase oxygen when no one expects it, enabling oxygen track bonuses or preventing others from getting them. "
        "Plant removal is icing, not core value. Effective cost ~11 MC for 1 O2 TR after steel gain. Better with event rebates."
    ),
    "Lightning Harvest": (
        "Good value at 11 MC for ~18 MC with requirements met. Per COTD community, 'used to think it's good, now think it's usually not good enough.' "
        "The 3 Science tag requirement is heavy for what's essentially a vanilla production card. "
        "By the time you have 3 science tags, you often have better energy options. Rarely a priority during draft."
    ),
    "Banned Delegate": (
        "Narrow Turmoil interaction card. Per COTD community, 'nothing gamebreaking but fun for cheap.' "
        "Can easily provide 1 VP for 3 MC which is solid economy. The Chairman requirement is not as hard as it seems in 3P. "
        "Experienced players appreciate the political disruption potential. Best as a free draw, low draft priority."
    ),
    "Stratospheric Birds": (
        "Strong 1-VP animal card with dual requirements (12% Venus + spend floater). "
        "Per COTD community, 'scary card to pass in draft' when Venus is active. Comes online earlier than Venusian Animals. "
        "With Freyja Biodomes the Venus animals package is overpowered. Balanced by Venus often staying untouched in 3P."
    ),
    "Casinos": (
        "Strong MC-prod rate but two hard requirements (city + energy). Per COTD community, 'lazy card with lazy art' but solid effect. "
        "Experienced players want it out before gen 4 with cheap energy access. "
        "Comparable to Space Hotels but with worse tags. Efficient if conditions met, but the double requirement narrows the window."
    ),
    "Carbonate Processing": (
        "Converting energy to heat production. Per COTD community, 'good IF played gen 1, IF you don't need energy for something better.' "
        "Significantly worse with Colonies since energy is needed for trading (3 energy = trade action). "
        "Good for controlling heat track pace. Experienced players: 'C without Colonies, D with them.'"
    ),
    "Jovian Embassy": (
        "Efficient Jovian tag + VP as a last-gen steel dump. Per COTD community, 'always play with Jovian multipliers, usually if excess steel, probably never otherwise.' "
        "Better than Colonizer Training Camp since you don't waste early money on a do-nothing card. "
        "Building tag for steel payment. One of the few late-game steel cards outside cities."
    ),
    "Harvest": (
        "Essentially free money with a Plant tag. Per COTD community, 'requirement isn't hard, this is basically free money.' "
        "Not high draft priority but almost always playable by end of game. "
        "Synergizes with Arklight, Ecological Zone, Decomposers, Media Group, GMO Contract. Experienced players: 'use this to finance Gardener!'"
    ),
    "Anti-desertification Techniques": (
        "Below average prelude at ~22 MC total value. Per COTD community, 'acceptable but not too interesting.' "
        "The 2 tags (Microbe+Plant) can be useful for Ecologist or Splice. 1 plant-prod alone is weak in most strategies. "
        "Decent for Ecoline or Tharsis but rated below average by experienced players. Steel + 3 MC start capital helps a bit."
    ),
    "Lunar Beam": (
        "Fair-priced but painful due to -2 MC-prod. Per COTD community, 'much better than newer players think.' "
        "Heat and energy are both far more valuable than MC in many situations. "
        "Earth tag is a nice bonus. Experienced players note Earth Office makes it great and Thorgate synergy is strong. Play early or not at all."
    ),
    "Spin-inducing Asteroid": (
        "2 Venus TR for 19 MC. Ti-payable via Space tag. Per COTD community, mainly valued for snagging Venus track bonuses (cards, TR). "
        "Not much to say — works exactly as advertised. With discounts and rebates it's efficient scoring. "
        "Better if you have Venus payoffs (Venusian Animals, Stratospheric Birds). Otherwise a bit expensive."
    ),
    "Preservation Program": (
        "5 TR prelude that sounds impressive but math is ambiguous. Per COTD community, 'terrible — just 5 MC production until end of game.' "
        "Interesting combo with Double Down (5 TR free since effect isn't copied). "
        "Designed specifically for Pristar synergy. Without Pristar or Double Down, one of the weakest preludes."
    ),
    "Asteroid": (
        "Solid space event — basic but good. Per COTD community, 'slightly more expensive than standard project but ti-payable with event cashbacks.' "
        "Ti rebate brings effective cost to ~8 MC for 1 temp TR. Plant removal is icing on the cake. "
        "Space events are very good in TM; this is a reliable mid-tier one. High draft priority with ti infrastructure."
    ),
    "Kaguya Tech": (
        "Unique greenery-to-city conversion card. Per COTD community, 'fun card but stars need to line up.' "
        "You need adjacent opponent greeneries to flip yours optimally. Two colonies for 5 MC each is notable. "
        "MC production and card draw provide base value. Can create the 'fabled Atlantis' — a city on an ocean tile."
    ),
    "Business Network": (
        "Cheap Earth tag with ongoing card selection. Per COTD community, 'be careful not to play too early — get production first.' "
        "The -1 MC-prod hurts early but card draw is rarely bad once you have economy. "
        "Experienced players note it's best mid-game when you can afford to buy good draws. Earth tag provides ancillary synergy value."
    ),
    "Bactoviral Research": (
        "Highly situational science/microbe crossover. Per COTD community, 'great for science engine player who also has microbe dumps.' "
        "With 7-8 science tags + Ants or Decomposers, this is cheap VP (3-4 VP for 13 MC). "
        "Science tag helps Mars University/Olympus/Anti-Grav requirements. Need both science density AND a microbe target."
    ),
}

# Track results
cards_updated = []
score_review_needed = []
skipped = []

for card in batch_cards:
    name = card['name']

    if name not in evals:
        skipped.append(name)
        print(f"SKIP (not in evals): {name}")
        continue

    if name not in updates:
        skipped.append(name)
        print(f"SKIP (no update prepared): {name}")
        continue

    new_reasoning = updates[name]
    old_reasoning = evals[name]['reasoning']

    # Check length
    if len(new_reasoning) > 450:
        print(f"WARNING: {name} reasoning is {len(new_reasoning)} chars (max 400)")

    evals[name]['reasoning'] = new_reasoning
    cards_updated.append(name)
    print(f"UPDATED: {name} [{evals[name]['score']}/{evals[name]['tier']}] ({len(new_reasoning)} chars)")

# Score review suggestions based on COTD community consensus
score_review_needed = [
    {"name": "Investment Loan", "current": 67, "suggested": 73, "reason": "COTD consensus: 'gets passed far too often', near-autopick for experienced players. Current score underrates it."},
    {"name": "Corroder Suits", "current": 59, "suggested": 65, "reason": "COTD: 'a bit bonkers — tag + resource for just 2 MC more than Sponsors.' Consistently positive community opinion."},
    {"name": "Arcadian Communities", "current": 54, "suggested": 60, "reason": "COTD: area denial is brutal in the right hands, 60 MC + 10 steel is solid. Multiple experienced players rate it higher."},
    {"name": "Mining Expedition", "current": 48, "suggested": 55, "reason": "COTD: tempo card with oxygen track bonus potential. Effective cost ~11 MC for 1 O2 TR. Not as bad as D-tier."},
    {"name": "Banned Delegate", "current": 42, "suggested": 50, "reason": "COTD: easily gives 1 VP for 3 MC, plus political disruption. Not great but not D42 weak."},
    {"name": "Energy Tapping", "current": 67, "suggested": 72, "reason": "COTD: significantly better with Colonies. Almost always sees play gen 1-3 with Colonies. Current score doesn't reflect Colonies boost."},
    {"name": "Law Suit", "current": 52, "suggested": 58, "reason": "COTD: deterrent/mind-game value is underrated, affects opponent behavior even when not played."},
    {"name": "Magnetic Field Dome", "current": 45, "suggested": 38, "reason": "COTD: unanimous 'never a keep, sometimes playable last gen.' Current D45 may still be generous."},
    {"name": "Carbonate Processing", "current": 50, "suggested": 42, "reason": "COTD: significantly worse with Colonies. 'D with Colonies, C without.' With all expansions format, Colonies always present."},
    {"name": "Preservation Program", "current": 48, "suggested": 40, "reason": "COTD: 'terrible' without Pristar. Only interesting with Double Down combo. One of the weakest preludes."},
    {"name": "Capital", "current": 46, "suggested": 38, "reason": "COTD: widely considered a trap, ~43 MC true cost with 9+ gen payoff. Even experienced defenders admit it's rare to be good."},
]

# Save evaluations
with open('data/evaluations.json', 'w', encoding='utf-8') as f:
    json.dump(evals, f, ensure_ascii=False, indent=2)
print(f"\nSaved evaluations.json")

# Save checkpoint
checkpoint = {
    "processed": len(cards_updated) + len(skipped),
    "cards_updated": cards_updated,
    "skipped": skipped,
    "score_review_needed": score_review_needed
}
with open('data/cotd_batch2_done.json', 'w', encoding='utf-8') as f:
    json.dump(checkpoint, f, ensure_ascii=False, indent=2)
print(f"Saved cotd_batch2_done.json")
print(f"\nTotal updated: {len(cards_updated)}")
print(f"Skipped: {len(skipped)}")
print(f"Score reviews needed: {len(score_review_needed)}")
