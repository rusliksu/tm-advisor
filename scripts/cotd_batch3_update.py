"""
COTD Batch 3 Update: cards 106-157 (52 cards)
Updates reasoning field in evaluations.json with COTD community insights.
"""
import json

EVAL_PATH = "C:/Users/Ruslan/tm-tierlist/data/evaluations.json"
CHECKPOINT_PATH = "C:/Users/Ruslan/tm-tierlist/data/cotd_batch3_done.json"

with open(EVAL_PATH, "r", encoding="utf-8") as f:
    evals = json.load(f)

updates = {}
score_review = []

# 106: Io Sulphur Research (63/C)
updates["Io Sulphur Research"] = (
    "20+3 MC for 2 VP + 1-3 cards. Overpriced without 3 Venus tags. Not ti-payable. "
    "Per COTD: mostly a tag magnet — Science+Jovian combo feeds multipliers and engines. "
    "Experienced players say overpriced even at best, comparing unfavorably to Research. "
    "Late-game play when MC to spare."
)

# 107: Ice Cap Melting (35/D)
updates["Ice Cap Melting"] = (
    "Almost never playable. +2C req means temp near max, oceans usually gone by then. No tags. "
    "Per COTD: cheapest ocean when it works but playable maybe 5% of games. "
    "Only draft late when you confirm oceans remain. Heat rush games are best window. "
    "Some value as game-closer for terraform players."
)

# 108: Soil Bacteria (65/C)
updates["Soil Bacteria"] = (
    "~16 MC value (plants + cards + tag). 2 microbe cards from deck = guaranteed engine access. "
    "Per COTD: strong with Ecoline/Ecotec for plant blitz; deck-thinning of 50+ cards denies opponents. "
    "Microbe tag for Splice/Ecologist. High ceiling with good draws, low floor otherwise. "
    "Niche but powerful engine starter."
)

# 109: Recession (66/C)
updates["Recession"] = (
    "10 MC immediate is below avg. Per COTD: much more devastating than paper value — "
    "tight gen 1 plans get wrecked by -5 MC + -1 prod. Double Down combo is brutal. "
    "Mons Insurance backfires. Hate-card without engine building, but relative swing "
    "in 3P (~30 MC) is significant. Experienced players confirm it ruins opening sequences."
)

# 110: Solar Wind Power (68/C)
updates["Solar Wind Power"] = (
    "Triple-tag (Science+Space+Power) with no requirements. ~8 MC effective after ti refund. "
    "Per COTD: 'awesome for Aridor' (3 new tags). No-req science tag is premium. "
    "Compared to Power Plant (+4 MC for science tag), the premium is worth paying. "
    "Solid utility card, rarely a bad pick."
)

# 111: Focused Organization (55/C)
updates["Focused Organization"] = (
    "Low immediate value (~6 MC) but cycling action is deceptively strong. "
    "Per COTD: pay-1-draw-1 equals Mars University trigger value. Resource conversion "
    "(steel/titanium) adds flexibility. ~13 MC total value. Best with card draw engines. "
    "Weaker gen 1 impact but builds value over time."
)
score_review.append({"name": "Focused Organization", "current": 55, "suggested": 62, "reason": "COTD rates cycling action higher; ~13 MC total value per community analysis"})

# 112: Early Colonization (77/B)
updates["Early Colonization"] = (
    "Colony + 3 energy-prod + colony tracks 2 steps forward. "
    "Per COTD: track advancement is the hidden power. Securing best colony early is huge. "
    "Trading gen 1 isn't great alone, but colony lock-in matters. "
    "Needs 3 energy-prod path; without it much less attractive. Colony-dependent."
)

# 113: L1 Trade Terminal (84/A)
updates["L1 Trade Terminal"] = (
    "Powerful colony synergy. +2 track steps per trade worth 6-8 MC. "
    "Per COTD: 'extremely powerful in most games.' Resource placement on 3 cards is bonus. "
    "Originally had no resource restriction. One of strongest Prelude 2 additions. "
    "Space tag for ti payment. Must-pick when colonies are good."
)

# 114: Stratopolis (40/D)
updates["Stratopolis"] = (
    "Overpriced at 25 MC + 2 science req. 1/3 VP floater rate is terrible standalone. "
    "Per COTD: 'very expensive, cannot pay with steel/titanium.' Only combos with "
    "Dirigibles or Forced Precipitation. In solo/long games slightly better. "
    "Rarely sees competitive 3P play. Cheaper alternatives exist."
)

# 115: Vermin (63/C)
updates["Vermin"] = (
    "Microbe+Animal dual tag is premium. 10-animal VP attack takes 5+ gens, rarely fires. "
    "Per COTD: main value is tags for Advanced Ecosystems, Decomposers, Ecological Zone. "
    "Deterrence effect discourages city-heavy strategies even before threshold. "
    "Tags are the real draw, not the griefing mechanic."
)

# 116: Red Ships (75/B)
updates["Red Ships"] = (
    "5 MC total. Even 2-3 activations = profitable. "
    "Per COTD: ~90% draft rate. Scales in higher player counts. "
    "Synergizes with ocean-adjacent tiles (Capital, Mining Rights, Great Dam). "
    "Worthless as params max but already paid for itself. Stall value as bonus action. "
    "One of the best value-per-MC cards."
)

# 117: Martian Lumber Corp (50/D)
updates["Martian Lumber Corp"] = (
    "Building+Plant tags enable NRA. 1 plant-prod for 9 MC is below average. "
    "Per COTD: effect (plants as 3 MC for Building cards) is a trap — delays greeneries. "
    "Better as steel-dump NRA enabler than for printed effect. "
    "The 2-greenery req means mid-game. Effect is 'extremely niche' per community."
)

# 118: Sponsoring Nation (71/B)
updates["Sponsoring Nation"] = (
    "3 TR + 2 delegates in 1 party for 24 MC. Per COTD: 2 delegates is the standout — "
    "flip party leader, meet ruling party requirements, set up chairman grabs. "
    "Green card keeps Earth tag permanently. 4 Earth req is gate but achievable. "
    "Powerhouse in 3P/WGT Turmoil. Without Turmoil loses delegate value."
)

# 119: Atalanta Planitia Lab (74/B)
updates["Atalanta Planitia Lab"] = (
    "2 VP + 2 cards + Science/Venus tags for 16 MC — fantastic deal. "
    "Per COTD: 'good card at a very good price.' Most players reach 3 science tags. "
    "Great mid/late game as efficient VP dump. Better than Research with Venus tag bonus. "
    "Science+Venus dual tag helps Diversifier and Venus strategies."
)

# 120: GHG Producing Bacteria (70/B)
updates["GHG Producing Bacteria"] = (
    "4% O2 req is light. 11 MC cost, 2 temp raises over game breaks even. "
    "Per COTD: 'best microbe card in base game' alongside Psychrophiles. "
    "Temperature usually last (~90% games), plenty of time. With Extreme-Cold Fungus = "
    "consistent TR engine. Microbe+Science tags for Decomposers/Splice. "
    "Often played just for the 2 tags."
)

# 121: Hydrogen to Venus (48/D)
updates["Hydrogen to Venus"] = (
    "14 MC for 1 Venus TR — barely passable vs 15 MC standard project. "
    "Per COTD: 'these cards are why Venus bloats the deck.' Needs Jovian tags AND "
    "Venus floater card for good value. Floater restriction to Venus cards is frustrating. "
    "Ti-payable saves from F-tier. Only decent with Amazonis Planitia bonus or Jovian engine."
)

# 122: Ishtar Mining (50/D)
updates["Ishtar Mining"] = (
    "8 MC for ti-prod but Venus 4-step req delays to mid-game. "
    "Per COTD: 'slightly cheaper than Titanium Mine but hard to play early.' "
    "Low draft priority, rarely bought, played when legal. Phobolog/Advanced Alloys help. "
    "Venus tag has synergy value but requirement-to-payoff ratio is poor."
)

# 123: Jupiter Floating Station (64/C)
updates["Jupiter Floating Station"] = (
    "Cheap Jovian tag is primary value. Per COTD: 'high draft priority' — "
    "versatile with growing MC prod, floater engine boost, stall action. "
    "Best as floater holder for Jovian Lanterns, Titan. 3 Science req delays deployment. "
    "Cheap Jovian tag alone can justify pick for multiplier VP."
)
score_review.append({"name": "Jupiter Floating Station", "current": 64, "suggested": 70, "reason": "COTD rates cheap Jovian tag + versatility higher; 'high draft priority'"})

# 124: City Parks (55/C)
updates["City Parks"] = (
    "2 VP + 2 plants for 10 MC — good IF you have 3 cities. Steel-payable. "
    "Per COTD: 'incredibly cheap 2 VP' when met; even better if plants yield greenery. "
    "Cheaper than Luxury Foods (8 MC) and Breathing Filters (11 MC) for 2 VP. "
    "Never hand-keep — only draft late when 3 cities achievable. Conditional but high value."
)

# 125: Atmo Collectors (48/D)
updates["Atmo Collectors"] = (
    "18 MC, no tags. Flexible floater-to-resource conversion. "
    "Per COTD: 'very versatile if played early or with Titan colony.' "
    "Enables early trading (energy), provides ti/heat on demand. "
    "No-tag is main complaint. Much better with Colonies; without them significantly weaker. "
    "Useful multi-tool in right context, not always a trap."
)
score_review.append({"name": "Atmo Collectors", "current": 48, "suggested": 55, "reason": "COTD rates versatility with Colonies higher; 'very versatile and useful'"})

# 126: Supermarkets (42/D)
updates["Supermarkets"] = (
    "2 MC-prod + 1 VP for 15 MC effective, no tags. "
    "Per COTD: 'terrible — unfortunate combo of dev + VP, no tag, hard req.' "
    "Worse than Rad Suits for cheap VP. Community sarcastically calls it "
    "'one of the cards of all time.' Only playable with Vitor/Sagitta. "
    "D-tier rating matches community consensus."
)

# 127: Hospitals (48/D)
updates["Hospitals"] = (
    "Energy-prod cost + disease resource management = confusing and unreliable. "
    "Per COTD: 'good for a cheap point last gen, that's about it.' "
    "Decent mid-game if cities being placed AND you place one same gen. "
    "In 2P better (more cities); in 3P not frequent enough. "
    "Building tag + steel-payable for 1 VP is realistic use case."
)

# 128: Giant Solar Collector (66/C)
updates["Giant Solar Collector"] = (
    "2 energy-prod + Venus step = TR + production start. "
    "Per COTD: 'not the most impressive prelude.' With Colonies puts you 1 off trading. "
    "Supplier is generally better. Without Colonies, energy needs a destination. "
    "Power+Space tags occasionally useful. ~25 MC value — average prelude territory."
)

# 129: Aerial Mappers (67/C)
updates["Aerial Mappers"] = (
    "1 free card every 2 gens. Per COTD: 'one of the better Venus cards' for floater builds. "
    "Key feature: add floater to ANY card (not just Venus/Jovian) — core floater support. "
    "Breakpoint ~1 VP + 3 cards for standalone value. In 8-gen games get 3-4 cards. "
    "Venus tag for count-based payoffs. Best in longer engine games."
)

# 130: Building Industries (62/C)
updates["Building Industries"] = (
    "1 energy-prod -> 2 steel-prod for 9 MC base. Per COTD: 'deceptively expensive — "
    "true cost 9 + 7 (energy) = 16 MC for 2 steel-prod.' Fair only if played early "
    "with existing energy. Energy prod too valuable for colonies to spend here. "
    "Building tag for milestones. Only worth it with excess energy."
)

# 131: Interplanetary Trade (52/D)
updates["Interplanetary Trade"] = (
    "30 MC needs 6+ unique tags for decent ratio. Per COTD: 'looks much better than it is.' "
    "Made for Turmoil tag diversity but rarely worth MC investment. "
    "Needs 7+ tags to compete with Callisto Penal Mines. Playable gen 4-6 if game lasts 5+ gens. "
    "Banker award synergy is niche but real. Ti-payable helps."
)

# 132: Hi-Tech Lab (59/C)
updates["Hi-Tech Lab"] = (
    "Expensive draft machine. Per COTD: optimal at 4 energy — more is wasteful "
    "(keep only 1 card regardless). Science+Building tags good, 1 VP helps. "
    "20 MC upfront is steep for 8-gen games. Best with Callisto colony or excess energy. "
    "Fun fantasy (44 cards drawn!) but 'very expensive for another draft.'"
)

# 133: Static Harvesting (66/C)
updates["Static Harvesting"] = (
    "Power Plant +1 MC with Building-tag MC rebate. Per COTD: 'just a more complicated "
    "Power Plant — not too exciting.' 8 MC for energy-prod is slightly above PP (7 MC). "
    "Max 3 oceans means early-game only (ideal for energy-prod timing). "
    "Building tag bonus rarely exceeds 1-2 MC. Reliable but unexciting."
)

# 134: High Circles (85/A)
updates["High Circles"] = (
    "Top Turmoil prelude. Permanent +1 influence scales all game. 2 delegates in 1 party "
    "= immediate political control. Per COTD: drawn party req card is usually strong "
    "(18 such cards). ~23 MC quantified value. You can immediately play the drawn card "
    "thanks to delegates. Dominates chairman race. Turmoil-dependent."
)

# 135: Palladin Shipping (58/C)
updates["Palladin Shipping"] = (
    "36 MC + 5 ti start. Per COTD: 'need lots of space events but ti goes to those, "
    "while ability wants 2 ti/gen for temp.' Compared unfavorably to Phobolog "
    "(same space feel, much more flexible). 2 ti -> temp is too good to ignore but "
    "too expensive to sustain. Consistently below average."
)

# 136: Stratospheric Expedition (74/B)
updates["Stratospheric Expedition"] = (
    "Triple tag + 2 floaters + 2 free Venus cards + 1 VP for 15 MC. "
    "Per COTD: ~19 MC value for 15 MC cost. Floaters go to ANY card. "
    "Compared to Tech Demo: +7 MC for 1 VP + 2 floaters. "
    "Strong in late Venus engines with discounts. Floater value 3-5 MC each depending on target."
)

# 137: Atmoscoop (74/B)
updates["Atmoscoop"] = (
    "2 TR + floaters + VP, Jovian+Space tags, ti-payable. "
    "Per COTD: 'pretty good late game, can be worth 4 points before Jovian counters.' "
    "3 Science req is main barrier. Temp/Venus choice gives flexibility. "
    "Works as late-game VP dump with discounts. "
    "Many players never play it due to science tag bottleneck."
)

# 138: Atmospheric Enhancers (78/B)
updates["Atmospheric Enhancers"] = (
    "2 TR with parameter choice + 2 floater-icon cards. Per COTD: 'shines with "
    "Stratospheric Birds — combined with Venus L1 Shade can get Birds gen 1.' "
    "Choose Venus to unlock strong cards, or oxygen/temp for speed. "
    "Venus tag for Morning Star Inc. Rated B+ by community — good baseline, excellent with Venus."
)

# 139: Special Permit (56/C)
updates["Special Permit"] = (
    "Take-that plant steal in 3P. Greens req adds timing difficulty. "
    "Per COTD: 'table flipping card' — devastating gen 1 against plant-heavy starts. "
    "Need to go before plant player AND have 2 Greens delegates — hard to line up. "
    "Plant tag is nice. Very situational — brutal when stars align, but alignment is rare."
)

# 140: Heavy Taxation (73/B)
updates["Heavy Taxation"] = (
    "Breaks even in one generation — unheard of for production cards. "
    "Per COTD: '6 MC net cost, 2 MC-prod pays for itself gen 1.' "
    "-1 VP easily offset by tempo. Earth tag fits Point Luna/Earth Office snowball. "
    "Experienced players call it 'very efficient.' High draft priority with 2+ Earth tags."
)

# 141: Mining Colony (80/A)
updates["Mining Colony"] = (
    "Colony + ti-prod + Space tag. Per COTD: 'extremely strong starting hand — "
    "basically Titanium Mine for 6 MC if going to colony anyway.' Ti-payable. "
    "Power play: build Triton first, spend ti immediately for second colony. "
    "Colony value depends on available options (Luna/Pluto = premium). Best gen 1."
)

# 142: Floating Refinery (61/C)
updates["Floating Refinery"] = (
    "Cheap Venus floater generator scaling with Venus tag count. "
    "Per COTD: 'Prelude 2 tried to make Venus viable, somewhat successful.' "
    "Only from YOUR cards. Needs Venus engine already running — pure support piece. "
    "Without floater-to-value converters, floaters sit idle. Best early/mid Venus engines."
)

# 143: Corridors of Power (74/B)
updates["Corridors of Power"] = (
    "1 TR + 4 MC + card draw engine via party leader. "
    "Per COTD: 'strong prelude, A rated.' Very strong in 2P (card almost every gen), "
    "much worse in 4-5P. In 3P moderate — party leader competition is real. "
    "Earth tag is nice. If you consistently hold party leader, one of best card advantage preludes."
)

# 144: Applied Science (55/C)
updates["Applied Science"] = (
    "No immediate production — action engine only. Per COTD: 'Physics Complex's best friend.' "
    "With Mass Converter + Physics Complex becomes compelling. Viron doubles speed. "
    "'Don't take unless you have Physics Complex or 1-VP animals in opener.' "
    "Without specific synergy, doesn't generate advantage. Very build-dependent."
)

# 145: Rise To Power (66/C)
updates["Rise To Power"] = (
    "3 delegates in 3 parties + 3 MC-prod. Per COTD: 'delegate placement is really strong — "
    "grab party leader in 3 parties before anyone, making chairman control much easier.' "
    "Good all-purpose prelude, not strategy-dependent. No tags downside. "
    "In 3P the 3 party leaders give serious influence. Turmoil-dependent."
)
score_review.append({"name": "Rise To Power", "current": 66, "suggested": 72, "reason": "COTD rates 3-party leader control + chairman chances higher"})

# 146: Ice Moon Colony (76/B)
updates["Ice Moon Colony"] = (
    "Ocean + colony at 9 MC discount over standard projects. Space tag = ti-payable. "
    "Per COTD: '9 MC savings, good value if you planned both anyway.' "
    "Comparable to Ice Asteroid efficiency. Early colonies worth full 17 MC. "
    "Europa placement = 2 oceans effectively. Starts strong, colony value drops each gen."
)

# 147: Airliners (58/C)
updates["Airliners"] = (
    "2 MC-prod + 2 floaters + VP for 14 MC, but 3 floater req + no tags. "
    "Per COTD: 'IF good target, IF 3 floaters, IF early — worth 20-25 MC.' "
    "But circular dependency is the issue. 'Like most floater cards, generally not worth it.' "
    "Only for dedicated floater engines. Acquired Company gives similar prod for less."
)

# 148: Envoys from Venus (66/C)
updates["Envoys from Venus"] = (
    "2 delegates for 4 MC total (vs 10 MC standard). Venus req (3 tags) limits pool. "
    "Per COTD: 'action efficient for party control, cost efficient at 1+3 MC.' "
    "Can steal chair or flip party leader. Event tag for Legend. "
    "Solid when requirements met — Venus req is the barrier, not the card's value."
)

# 149: Hermetic Order of Mars (67/C)
updates["Hermetic Order of Mars"] = (
    "2 MC-prod + MC from empty adjacent areas. Max 4% O2 forces gen 1-2. "
    "Per COTD: 'even with 1 tile = 6 MC back, 2 MC-prod for 7 MC net — a steal.' "
    "With right preludes/corp can return several MC gen 1. No tags is main penalty. "
    "Tight O2 req is actually beneficial — gen 1-2 ideal for prod cards."
)
score_review.append({"name": "Hermetic Order of Mars", "current": 67, "suggested": 72, "reason": "COTD rates higher; '1 tile makes it a steal at 7MC for 2 MC-prod'"})

# 150: Recruitment (56/C)
updates["Recruitment"] = (
    "Same cost as delegate placement but removes a neutral one instead. "
    "Per COTD: 'solid B-tier, can cheat leader placement.' "
    "Strictly better than standard delegate in certain situations. "
    "Great end-of-gen surprise for stealing TR. At 5 MC fairly priced. "
    "No tags hurts. Turmoil board-state dependent."
)

# 151: Asteroid Mining (67/C)
updates["Asteroid Mining"] = (
    "33 MC for 2 ti-prod. ~5.5 gen payoff. Jovian+Space tags. "
    "Per COTD: 'expensive, stalls engine for a gen.' Phobolog loves it (ti=4 each). "
    "Jovian tag alone can justify drafting for multiplier VPs. "
    "Only grab with existing ti-prod or strong space/jovian opener. "
    "Too slow for most 8-gen 3P games."
)

# 152: Weather Balloons (61/C)
updates["Weather Balloons"] = (
    "Science tag + floater-based card draw/MC for 14 MC. "
    "Per COTD: 'good mid-range science tag' with load/spend decisions. "
    "Like Martian Rails every other turn, no steel dump, but with card draw + science tag. "
    "Board-state dependent (cities for MC). Load early, cash late. Science tag is main value."
)

# 153: Planetary Alliance (82/A)
updates["Planetary Alliance"] = (
    "3 tags (Earth+Jovian+Venus) + 2 TR + Jovian/Venus cards. "
    "Per COTD: compared to UNMI Contractor — 1 TR less but 2 more tags. "
    "High ceiling with Aridor, Saturn Systems, Point Luna, Planetologist milestone. "
    "'High ceiling but only good with synergies in hand or relevant milestones.' "
    "Many possible synergies. Venus module required."
)

# 154: Jovian Envoys (63/C)
updates["Jovian Envoys"] = (
    "2 delegates for 5 MC (vs 10 MC standard). 2 Jovian tag requirement. "
    "Per COTD: 'pretty good if playing Jovians — 5 MC in the pocket.' "
    "Can secure Chairman cheaply. Not draft priority but nice when playable. "
    "Event = no ongoing value. Only relevant in Jovian+Turmoil strategies."
)

# 155: Protected Growth (64/C)
updates["Protected Growth"] = (
    "5 MC total for plants per Power tag. Per COTD: 'nice to have use for Power tags.' "
    "3-4 plants near break-even with Plant tag. 5+ Power tags = cheap half-greenery. "
    "Max 7% O2 limits to gen 1-4. Bad floor (1-2 tags) but good ceiling. "
    "Useful for late greenery conversion. Very Power-engine dependent."
)

# 156: Soil Studies (72/B)
updates["Soil Studies"] = (
    "Scaling event: Venus+Plant+Colony tags = plants. Microbe+Plant dual tag. "
    "Per COTD: 'pretty strong, combos with unrelated stuff.' Aim 8+ plants = greenery. "
    "Need 6-7 plants for break-even. Doesn't change draft choices — play when tags align. "
    "Triple tag (Microbe+Plant+Event) triggers many combos. Max -4C limits window."
)

# 157: Venus Orbital Survey (82/A)
updates["Venus Orbital Survey"] = (
    "Free Venus cards every gen. No requirements, ti-payable. "
    "Per COTD: 'fantastic — weaker than AI Central (pay for cards, revealed) but no req, "
    "ti-payable, cheaper.' Experienced players call it 'top-tier active card' and 'bonkers.' "
    "Venus+Space dual tag. Best in longer games. One of strongest card-advantage engines."
)

# === Apply all updates ===
cards_updated = []
warnings = []
for name, new_reasoning in updates.items():
    key = name
    if key not in evals:
        for k in evals:
            if k.lower() == name.lower():
                key = k
                break

    if key in evals:
        if len(new_reasoning) > 400:
            warnings.append(f"WARNING: {name} = {len(new_reasoning)} chars")
        evals[key]["reasoning"] = new_reasoning
        cards_updated.append(name)
        print(f"OK: {name} ({len(new_reasoning)} chars)")
    else:
        print(f"NOT FOUND: {name}")

for w in warnings:
    print(w)

with open(EVAL_PATH, "w", encoding="utf-8") as f:
    json.dump(evals, f, indent=2, ensure_ascii=False)

checkpoint = {
    "processed": len(updates),
    "cards_updated": cards_updated,
    "score_review_needed": score_review
}

with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
    json.dump(checkpoint, f, indent=2, ensure_ascii=False)

print(f"\nDone! Updated {len(cards_updated)} cards. {len(score_review)} need score review.")
print(f"Warnings: {len(warnings)}")
