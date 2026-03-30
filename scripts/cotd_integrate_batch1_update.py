"""
COTD Integration Batch 1: Update evaluations.json with COTD insights for cards 0-52.
"""
import json
import os
import copy

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load data
with open('data/cotd_update_needed.json', 'r', encoding='utf-8') as f:
    needed = json.load(f)
with open('data/evaluations.json', 'r', encoding='utf-8') as f:
    evals = json.load(f)
with open('data/cotd_lookup.json', 'r', encoding='utf-8') as f:
    cotd = json.load(f)

# Build case-insensitive lookup for evals
evals_lower = {k.lower(): k for k in evals.keys()}

def find_eval_key(name):
    if name in evals:
        return name
    lower = name.lower()
    if lower in evals_lower:
        return evals_lower[lower]
    return None

# ============================================================
# COTD-enriched reasoning updates for each card
# ============================================================
# Format: { "card_name_in_cotd_update_needed": "new_reasoning" }
# We'll manually craft each reasoning based on COTD data + existing reasoning

updates = {}

# [0] Lake Marineris (score=63, tier=C)
updates["Lake Marineris"] = (
    "When played for full value (both oceans), it's one of the best cards in the game — per COTD community, "
    "'what's not to like?' at 21 MC for 4 VP + 2 ocean bonuses. But the 0C requirement + needing 2 ocean "
    "spots makes full value uncommon in 3P where oceans fill fast. Experienced players note even 1 ocean + 2 VP "
    "for 21 MC is acceptable, especially with Lakefront. Steel-payable helps."
)

# [1] Experimental Forest (score=82, tier=A)
updates["Experimental Forest"] = (
    "Отличная прелюдия для ground game. Greenery gen 1 — мощный tempo: 1 TR + oxygen + placement bonus + board presence. "
    "Per COTD community: 'unbelievable prelude', tile placement часто даёт большой rebate на expansion maps. "
    "Tag enables ранний NRA. Опытные игроки отмечают: plant cards из draw часто с requirements, но это milling — "
    "знание что не вытянешь их в драфте тоже ценно. Ecoline + NRA combo особенно силён."
)

# [2] Asteroid Mining Consortium (score=67, tier=C)
updates["Asteroid Mining Consortium"] = (
    "Strong take-that + Jovian tag + VP за 6 MC. Per COTD: 'one of the best cards if you want to make enemies'. "
    "Опытные игроки отмечают: stall titanium mine gen 1 если видишь оппонента с ti-prod, чтобы не попасть. "
    "В 3P take-that penalty остаётся, но карта дешёвая и Jovian тег + VP компенсируют. "
    "Community считает карту сильнее нашей оценки — возможен пересмотр вверх."
)

# [3] Commercial District (score=52, tier=D)
updates["Commercial District"] = (
    "Too expensive for most situations. Per COTD community: 'expensive but fun to play, average in practical value'. "
    "Опытные игроки отмечают: VP trap — лучше использовать как placement disruption. Tile можно ставить рядом с "
    "чужими городами для помехи. На Tharsis с Mayor milestone и 5+ городами ceiling высокий но редкий. "
    "Building + Energy теги помогают. В 3P с WGT игры короткие — не окупается."
)

# [4] PhoboLog (score=74, tier=B)
updates["PhoboLog"] = (
    "Одна из лучших корпораций в игре по ceiling. +1 ti value = 4 MC/ti, 10 ti на старте = 2-3 Space карты gen 1. "
    "Per COTD: 'one trick pony — does one thing really well but lacks general power'. Опытные игроки отмечают: "
    "очень зависима от ti-prod карт в стартовой руке — без Io Mining/Advanced Alloys/ti-prod preludes может быть слабой. "
    "Community consensus: сильный B-tier, не A — зависимость от рук делает floor низким."
)

# [5] ThorGate (score=65, tier=C)
updates["ThorGate"] = (
    "Energy-discount корпорация. -3 MC на power plant SP (8 MC вместо 11). Per COTD: 'pathetic to viable only "
    "with Standard Technologies combo'. Опытные игроки отмечают: с Colonies Thorgate тратит 16 MC на 3 energy-prod "
    "и торгует gen 2 consistently. Без энергетических синергий — одна из слабых корпораций. Community consensus: "
    "очень ситуативная, C-tier справедлив."
)

# [6] Colonizer Training Camp (score=73, tier=B)
updates["Colonizer Training Camp"] = (
    "Cheap VP card с премиальным Jovian тегом. 2 VP for ~7 MC (with steel) — отличный рейт. Per COTD: "
    "'awesome on Hellas where it hits Diversifier, Rim Settler, Tactician, Magnate and Contractor'. "
    "Опытные игроки отмечают: играть нужно рано из-за O2 cap, opportunity cost высок gen 1. "
    "Community считает карту чуть сильнее — milestone enabler на нескольких картах."
)

# [7] Heat Trappers (score=45, tier=D)
updates["Heat Trappers"] = (
    "Classic take-that в 3P. Per COTD: 'most brutal attack card in the game, wipes ~12 MC of value'. "
    "Опытные игроки отмечают Robotic Workforce combo — повторный steal devastating. "
    "В 2P сильная карта (good early), но в 3P take-that penalty убивает ценность. "
    "Community consensus: 'good 2p early, otherwise bad'. D-tier для 3P корректен."
)

# [8] Diversity Support (score=55, tier=C)
updates["Diversity Support"] = (
    "1 TR за 4 MC — outstanding rate если condition met. 9 resource types тяжёлое условие. Per COTD: "
    "'the TM equivalent of last season of GoT — so much preparation then the moment comes and you mess up order'. "
    "Опытные игроки: берут если не хватает максимум 2 ресурсов, один из которых стандартный. "
    "Проще всего: produce все 6 + animals + microbes + floaters. Execution risk высокий."
)

# [9] Bushes (score=69, tier=C)
updates["Bushes"] = (
    "Solid plant production. Per COTD community: 'one of the best plant cards, sweet spot of good production "
    "without astronomical requirements'. -10C обычно достижим рано. Опытные игроки отмечают: "
    "сама по себе слабовата, но с Insects, Eco Zone, NRA становится значительно лучше. "
    "Community sentiment заметно позитивнее нашей оценки — возможен пересмотр вверх на 3-5 points."
)

# [10] Large Convoy (score=82, tier=A)
updates["Large Convoy"] = (
    "Premier late-game point bomb. Per COTD: 'one of the top 5 scoring cards in base game'. С 1VP animal "
    "card = 7 VP + 2 карты + ocean bonus. Earth+Space+Event теги = максимум дискаунтов. "
    "Опытные игроки отмечают Meat Industry combo, Optimal Aerobraking cashback. "
    "В lower player counts лучше (ocean spot доступнее). Community unanimous: must-buy с animal target."
)

# [11] Business Contacts (score=67, tier=C)
updates["Business Contacts"] = (
    "Look at 4, keep 2 за 10 MC. Per COTD: 'excellent card, you'll most likely find something useful'. "
    "Опытные игроки отмечают: не всегда играть — 10-2=8 MC effective cost может hurt если tight on money. "
    "Лучше mid-game когда economy стабильна. Earth + Event теги дают синергии. "
    "Community sentiment позитивнее нашей оценки — возможен пересмотр вверх."
)

# [12] Birds (score=78, tier=B)
updates["Birds"] = (
    "One of the strongest VP engines. Per COTD: must-play когда oxygen первый/второй параметр к заполнению. "
    "С animal placement (Large Convoy, Imported Nitrogen) ceiling 6-8+ VP. "
    "Опытные игроки: 'on the weaker side of 1VP animals without placement cards'. "
    "Ecological Experts prelude combo devastating (обходит O2 req). B-tier справедлив — "
    "сильна но зависит от animal placers и timing."
)

# [13] Inventrix (score=70, tier=B)
updates["Inventrix"] = (
    "Per COTD: 'interesting idea but in practice usually not very good'. Опытные игроки отмечают: "
    "science tag + 3 карты — уже average corp, но ability используется реже чем кажется. "
    "Community разделена: одни считают trap ('gets picked for science tag but avg cash hurts'), "
    "другие — 'slightly above average'. ±2 requirements ценнее на Hellas. "
    "Несколько COTD голосов за снижение — возможен пересмотр вниз."
)

# [14] Industrial Center (score=59, tier=C)
updates["Industrial Center"] = (
    "Per COTD: 'foremost use is teleporting/blocking opponents'. Cheap tile placement с ocean discounts. "
    "Опытные игроки: steel prod action почти никогда не основная ценность, но placement disruption "
    "может быть значительной. Лучше early когда города ещё ставятся. Community считает "
    "карту чуть сильнее — building tag + teleport за дёшево."
)

# [15] Lagrange Observatory (score=68, tier=C)
updates["Lagrange Observatory"] = (
    "Per COTD: 'love this card for design — early want science tag, mid want card draw, late want VP'. "
    "Опытные игроки: отличный ti dump за 1 VP late game. С space discounts и science triggers "
    "ценность растёт. Community sentiment заметно позитивнее нашей оценки — "
    "'one of my favorite cards', 'always feel bad if I don't take it'. Возможен пересмотр вверх."
)

# [16] Herbivores (score=58, tier=C)
updates["Herbivores"] = (
    "Per COTD: 'underestimated card, even late if you have plants should be better than 1VP animals'. "
    "Опытные игроки: combo с Meat Industry + Excentric, Viral Enhancers, Eco Zone. "
    "Oxygen 8% — mid-game, может не дождаться если O2 не первый параметр. "
    "Community разделена: half people love it, half find it too late. C-tier справедлив — "
    "ceiling выше чем кажется, но timing ограничивает."
)

# [17] Cloud Seeding (score=50, tier=D)
updates["Cloud Seeding"] = (
    "Per COTD: 'awful card — expensive, reduces MC prod, missing plant tag, annoying requirement'. "
    "Опытные игроки: ocean req gen 1 тяжёл на многих картах. -1 MC-prod + -1 heat-prod = double penalty. "
    "Некоторые отмечают: 'used to underrate it, 2 plant-prod for aggressive plant strategy can work'. "
    "Community consensus в основном негативный. D-tier справедлив."
)

# [18] Kelp Farming (score=87, tier=A)
updates["Kelp Farming"] = (
    "Per COTD: 'arguably the best plant production card in the game, insane value for money'. "
    "'Game defining card that can carry a plant strategy single-handedly'. "
    "Опытные игроки: 6 oceans достижимы рано, best target для Ecology Experts prelude. "
    "Community unanimous: top-tier plant card, A-tier абсолютно заслужен. "
    "20 MC за ~41 MC value — одна из лучших efficiency rates в игре."
)

# [19] Robinson Industries (score=72, tier=B)
updates["Robinson Industries"] = (
    "Per COTD: 'weakest of prelude corps but that doesn't mean bad'. Action: 4 MC за любой production — "
    "best deal для ti-prod gen 1. Опытные игроки: лучше в длинных играх и lower player counts. "
    "Community отмечает: 'same problem as UNMI — ability makes corp alright but not great'. "
    "Generalist milestone — best milestone case. B-tier на грани C — floor низкий."
)

# [20] Io Mining Industries (score=69, tier=C)
updates["Io Mining Industries"] = (
    "Per COTD: 'godly amount of production' но 'so damn expensive!' — 44 MC = almost full gen income. "
    "Опытные игроки: с Phobolog combo отличный, иначе нужны preludes/discounts для gen 1 play. "
    "Community отмечает forcing effect: 'value in forcing people to make sub-par draft picks'. "
    "Одна из самых fun карт. C-tier — ceiling A-tier, но floor D-tier из-за цены."
)

# [21] Bribed Committee (score=64, tier=C)
updates["Bribed Committee"] = (
    "Per COTD: 'Mum can we have Sponsors? We have Sponsors at home.' — downgrade от Sponsors. "
    "2 TR за 10 MC минус 2 VP. Опытные игроки: 'think of it as 2 MC-prod, pays back soon'. "
    "Earth tag + event synergies добавляют ценности. Лучше early game для production snowball. "
    "C-tier справедлив — ниже Sponsors но всё ещё decent economy builder."
)

# [22] Aridor (score=61, tier=C)
updates["Aridor"] = (
    "Сильный потенциал MC-prod, но низкий старт делает gen 1-2 болезненными. Per COTD: "
    "'money production ability can be very good with right preludes, 4-6 MC-prod in first 2 gens'. "
    "Опытные игроки: colony choice (Pluto, Luna) критична. Меняет поведение в драфте — "
    "tags приоритетнее. В 3P WGT игры короче — production value снижается. C-tier справедлив."
)

# [23] Interstellar Colony Ship (score=73, tier=B)
updates["Interstellar Colony Ship"] = (
    "Per COTD: 'the last turn titanium dump' и 'payoff for all those discounts and rebates'. "
    "Raw = 24+3 MC за 4 VP = overpriced. Но science engine players имеют Earth Office, space discounts, "
    "rebates — effective cost падает до 10-15 MC. Опытные игроки разделены: "
    "'overrated in practice, 6+ MC per VP even with discounts' vs 'reward for discount engine'. B-tier."
)

# [24] Hired Raiders (score=55, tier=C)
updates["Hired Raiders"] = (
    "Per COTD: 'good in 2p, less good with more players'. Breaks even while hurting opponent. "
    "Опытные игроки: 'attack cards good in 3P too — matter of identifying closest competition'. "
    "Event synergies добавляют. Steal steel + use it = free card + -2 steel for opponent. "
    "Community позитивнее чем D-tier но C55 может быть низковато — 'supremely strong early 2P'."
)

# [25] Titan Air-scrapping (score=42, tier=D)
updates["Titan Air-scrapping"] = (
    "Per COTD: 'by itself horrible — expensive points card needing 2 gens to trigger'. "
    "Опытные игроки: без space tag (!) карта с ti requirement — design miss. "
    "С floater placement cards ceiling выше, но standalone = 21+3 MC за медленные VP. "
    "Community consensus: D-tier заслужен. Некоторые защищают с synergies но majority negative."
)

# [26] Invention Contest (score=68, tier=C)
updates["Invention Contest"] = (
    "Per COTD: 'great little card — cheap, great with discounts/rebates, choice of what to draw'. "
    "Curated draw (look 3 pick 1) лучше random. Science tag ценный. "
    "Опытные игроки: с Mars University combo (2 draws), хорош как cheap science tag dump. "
    "Community sentiment позитивнее — 'solid card at any stage'. Возможен пересмотр вверх."
)

# [27] Wave Power (score=57, tier=C)
updates["Wave Power"] = (
    "Per COTD: 'its a card' — community underwhelmed. 'Not particularly cheap early or impactful later'. "
    "Опытные игроки: Power tag + 1 VP спасают, но 1 energy-prod за 11 MC total — посредственно. "
    "3 ocean req обычно gen 3-4. 'Under the right circumstances hits the sweet spot'. "
    "Community consensus: mediocre. C-tier справедлив."
)

# [28] Acquired Space Agency (score=74, tier=B)
updates["Acquired Space Agency"] = (
    "Per COTD: community разделена — 'gambling is fun' vs 'pretty bad, don't spend money on space cards early'. "
    "Опытные игроки: reveal cards = mind games + info advantage. Лучше с Phobolog (ti value +1). "
    "5 ti сразу = 15-20 MC в space cards. 2 revealed space cards — quality varies wildly. "
    "Community мнение смешанное — некоторые считают B-tier высоковат."
)

# [29] Virus (score=76, tier=B)
updates["Virus"] = (
    "Per COTD: 'very strong attack card, only 1 MC + 3 MC card cost'. С free draw — можно сыграть бесплатно. "
    "Опытные игроки: 'good in 2P, less so in higher players' — но removing 2 animals = denying ~10 VP. "
    "Protected Habitats — единственный counter. Event synergies (Media Group) добавляют value. "
    "Community consensus: strong attack, B-tier заслужен."
)

# [30] Convoy from Europa (score=66, tier=C)
updates["Convoy from Europa"] = (
    "Per COTD: 'costs same as SP ocean but you get a card, can pay with ti, and get event cashbacks'. "
    "'Definition of a decent card.' Опытные игроки: с discounts/rebates/ti payment = excellent. "
    "Drop on 2-card ocean spot = extra cards. Saturn Systems synergy. "
    "Community consensus: solid C-tier, чуть выше average. Возможен пересмотр на 68-70."
)

# [31] Advanced Ecosystems (score=78, tier=B)
updates["Advanced Ecosystems"] = (
    "Per COTD: 'probably the cheapest 3 points in the game' если можешь сыграть. "
    "С Decomposers + Eco Zone = 5+ VP за 14 MC. Triple bio-tag triggers massive combos. "
    "Опытные игроки: 'worst case 3 VP for 14 MC = pretty bloody good'. Не speculate early "
    "если не идёшь в eco tags. Community unanimous: сильная B-tier карта."
)

# [32] Impactor Swarm (score=38, tier=D)
updates["Impactor Swarm"] = (
    "Per COTD: 'weird card — Jovian player doesn't want heat, TR rush player rarely has 2 Jovian'. "
    "Опытные игроки: единственный реальный use case — украсть Thermalist award. "
    "1.5 temp steps за 11-14 MC compares okay с Asteroid, но Jovian req ограничивает. "
    "С Optimal Aerobraking = 12 heat, что может catapult Thermalist. D-tier справедлив."
)

# [33] Magnetic Field Generators (score=42, tier=D)
updates["Magnetic Field Generators"] = (
    "Per COTD: 'real expensive but ok for endgame points if you have energy with no other use'. "
    "Опытные игроки: 'good last-gen steel and power sink, and not much else'. "
    "4 energy req почти невозможен без science engine. Community consensus: "
    "'gets played last gen almost always' — steel dump + excess energy sink. D-tier справедлив — "
    "ceiling повыше (last-gen play), но standalone terrible."
)

# [34] Insects (score=86, tier=A)
updates["Insects"] = (
    "Per COTD: 'one of the best cards in the game, especially base+preludes'. Community unanimous. "
    "Опытные игроки: 'people severely underestimate this card, in base game biological tags = plants'. "
    "Приоритетный pick даже чтобы не дать plant player. Plant tag scaling = 3+ plant-prod easily. "
    "С NRA, Eco Zone, Decomposers — engine defining. A-tier абсолютно заслужен."
)

# [35] Lichen (score=61, tier=C)
updates["Lichen"] = (
    "Per COTD: 'pretty good, starts making plants around the time you'd want to'. "
    "Baseline для plant tags — unremarkable alone но с Insects, Eco Zone, NRA = good. "
    "Опытные игроки: 'any single plant production is weak by itself, becomes more useful as combo piece'. "
    "-24C req обычно gen 1-2 — timing хороший. Разница с Adapted Lichen = 1 MC + Plant tag vs нет. "
    "C-tier справедлив."
)

# [36] Biomass Combustors (score=48, tier=D)
updates["Biomass Combustors"] = (
    "Per COTD: 'O2 requirement very prohibitive — by that stage not looking for this type of card'. "
    "6% O2 = mid-game когда energy-prod менее нужна. -1 VP + take-that в 3P = double penalty. "
    "Опытные игроки: 'awful card design, 1 plant-prod attack annoying but not crippling'. "
    "Building + Power теги хороши но req + downsides убивают. D-tier справедлив."
)

# [37] Livestock (score=73, tier=B)
updates["Livestock"] = (
    "Per COTD: 'it's a 1VP/animal card, value mostly determined by extra animals you can place'. "
    "-1 plant-prod self-attack — хуже Birds' opponent attack. 2 MC-prod компенсирует. "
    "Опытные игроки: 'enables playing animal event cards earlier for additional VP'. "
    "'Probably the one I want to see least among 1VP animal cards'. Lowers plant strategy ceiling. "
    "B-tier на нижней границе."
)

# [38] Rover Construction (score=67, tier=C)
updates["Rover Construction"] = (
    "Per COTD: 'if playing with notorious city spammer, might be worth — usually not'. "
    "+2 MC per city от всех игроков. В 3P с 5-8 cities = 10-16 MC. "
    "Опытные игроки: окупается после 3 городов. Зависит от meta — с engine players и 15+ cities отличная. "
    "Building tag + VP + steel-payable. Community считает чуть сильнее — возможен пересмотр вверх."
)

# [39] Artificial Lake (score=63, tier=C)
updates["Artificial Lake"] = (
    "Per COTD: 'biggest asset is building tag — one of few cards that terraform with steel'. "
    "SP ocean price + 1 VP + flexible placement. -20C req tricky. "
    "Опытные игроки: placement на non-ocean area для disruption/blocking — ситуативно но ценно. "
    "С steel payment effective cost падает значительно. C-tier справедлив."
)

# [40] Luna Governor (score=67, tier=C)
updates["Luna Governor"] = (
    "2 MC-prod за 7 MC = 3.5 MC/prod — best rate в игре. Double Earth tag premium. "
    "Per COTD: 'synergy so hard it feels dirty with Point Luna or Martian Zoo'. "
    "Опытные игроки: 'optimistically drafted and never met req to play' — 3 Earth tag req бывает miss. "
    "Req check важен — с Point Luna/Teractor auto-buy, без Earth engine рискованный pick. "
    "Community позитивнее — возможен пересмотр вверх."
)

# [41] Asteroid Rights (score=72, tier=B)
updates["Asteroid Rights"] = (
    "Per COTD: 'insanely good, pays off in 2 gens even without synergy — should have had a requirement'. "
    "2 immediate asteroids = 6 MC, action gives MC-prod or ti-prod. "
    "Опытные игроки: best part — using asteroids для other asteroid cards (1 MC oceans!). "
    "Community consensus заметно позитивнее нашей оценки. Возможен пересмотр вверх."
)

# [42] Luna Metropolis (score=71, tier=B)
updates["Luna Metropolis"] = (
    "Per COTD: 'the third Cartel' — с Earth tag strategy даёт massive MC-prod + city + VP. "
    "Нужно минимум 4 Earth tags для хорошей ценности. Ti-payable через Space tag. "
    "Опытные игроки: 'incredibly good economy card that also gives points'. "
    "С Teractor/Point Luna — must-buy. Community consensus: solid B-tier."
)

# [43] Industrial Microbes (score=66, tier=C)
updates["Industrial Microbes"] = (
    "Per COTD: 'perfect card in combination with Electro Catapult!' Mine + Power Plant в одной карте "
    "с bonus Microbe tag. 12 MC vs 14 MC (раздельно) = 2 MC savings + 1 card slot + microbe tag. "
    "Опытные игроки: 'love this card in beginning of game'. Building tag потерян vs раздельная покупка. "
    "Нормально если нужны оба — energy + steel. C-tier справедлив."
)

# [44] Research (score=80, tier=A)
updates["Research"] = (
    "Per COTD: 'the purest form of 2-for-1, would be good with one science tag but two? Insta-pick.' "
    "Double Science tag = AI Central, Mass Converter, AGT enabler. "
    "Опытные игроки: Mars University, Olympus Conference, Venusian Animals triggers. "
    "'Worse than I think it is, but still very good' — 14 MC total за 2 cards + 2 science tags. "
    "Community unanimous: strong A-tier."
)

# [45] CEO's Favorite Project (score=67, tier=C)
updates["CEO's Favorite Project"] = (
    "Per COTD: 'no-brainer with Physics Complex (2 VP), pretty good with high-value animals'. "
    "4 MC за 1 VP (animal) или 2 VP (science resource) — excellent rate. "
    "Опытные игроки: не работает для Search For Life (extra token doesn't count). "
    "Event synergies: Media Group, Legend milestone. No-tag penalty, но extreme cheapness компенсирует. "
    "Community позитивнее — возможен пересмотр вверх."
)

# [46] Archaebacteria (score=57, tier=C)
updates["Archaebacteria"] = (
    "Cheapest plant production в игре (9 MC total). Per COTD: 'good benchmark for early plant production'. "
    "Microbe tag вместо Plant — 'big difference for plant synergies' (no Insects, NRA trigger). "
    "Опытные игроки: с expansions early plant-prod менее valuable — больше конкуренции за greeneries. "
    "-18C req = almost always gen 1. C-tier справедлив — дёшево но tag mismatch hurt."
)

# [47] Community Services (score=62, tier=C)
updates["Community Services"] = (
    "Per COTD: 'at 16 cost, no tag, requires 4-5 MC-prod to justify' (played as Manutech once). "
    "Опытные игроки: 'often useless — production too little, too expensive, or too late'. "
    "Работает с tagless Preludes (3 preludes = 3 MC-prod сразу). "
    "Community consensus: нишевая — combos with Dust Seals, Micro Mills ироничны. C-tier справедлив."
)

# [48] Caretaker Contract (score=74, tier=B)
updates["Caretaker Contract"] = (
    "Per COTD: 'situational but great if leaning into heat production'. 8 heat → 1 TR = 4 MC за 7 MC. "
    "Опытные игроки: 'best case 2-3 TR, only works well when heat is first parameter to max'. "
    "0C requirement = mid-late game. На Tharsis с Thermalist — careful с timing. "
    "Community consensus: strong но situational. B-tier справедлив — ceiling высокий."
)

# [49] Imported Nitrogen (score=80, tier=A)
updates["Imported Nitrogen"] = (
    "Per COTD: 'the grand finale to plant/animal strategy, could be worth 6 points'. "
    "Earth+Space+Event tags = maximum discounts. С 1VP animal = 23+3 MC за 5+ VP. "
    "Опытные игроки: 'tricky to get full value, need targets for microbes and animals'. "
    "Без targets — 1 TR + 3 plants + 3 microbes nowhere = mediocre. A-tier с animal target."
)

# [50] Insulation (score=40, tier=D)
updates["Insulation"] = (
    "Per COTD: 'pretty plain card — useful to swing Banker but rarely used'. Два use cases: "
    "1) swing Banker award, 2) heat maxed early + excess heat-prod. "
    "Опытные игроки: с Manutech — play last turn для profit (6+ heat-prod → 6 MC-prod + 6 MC immediate). "
    "No tags = zero synergy. Community consensus: very niche. D-tier справедлив."
)

# [51] Martian Survey (score=62, tier=C)
updates["Martian Survey"] = (
    "Per COTD: 'touch expensive for what it gives unless you have discounts or are Vitor/IC'. "
    "12 MC за 2 cards + 1 VP. Max 4% O2 = early-only window. 'Not a space card — can't use titanium.' "
    "Опытные игроки: 'draw two always great, but want card draw mid/late, not early when this is playable'. "
    "Science tag ценный. Community мнение смешанное — C-tier справедлив."
)

# [52] Cutting Edge Technology (score=84, tier=A)
updates["Cutting Edge Technology"] = (
    "Per COTD: 'one of the better science cards — cheap, VP, science tag, no requirement'. "
    "-2 MC на каждую карту с requirements (~40% всех карт). Community: 'absurd card, "
    "compare to Adaptation Technology — same tag, same cost, hundred times better'. "
    "Опытные игроки: 'changes negative restriction into a lovely bonus'. "
    "A-tier unanimous — one of the best engine cards."
)

# ============================================================
# Apply updates to evaluations.json
# ============================================================
cards_updated = []
score_review_needed = []

# Score review thresholds based on COTD sentiment analysis
score_reviews = {
    "Asteroid Mining Consortium": {"current": 67, "suggested": 72, "reason": "COTD consensus: strong despite take-that, cheap Jovian+VP, community rates higher"},
    "Bushes": {"current": 69, "suggested": 74, "reason": "COTD strongly positive: 'one of the best plant cards', sentiment much higher than C69"},
    "Business Contacts": {"current": 67, "suggested": 72, "reason": "COTD: 'excellent card', community sentiment notably positive"},
    "Lagrange Observatory": {"current": 68, "suggested": 73, "reason": "COTD very positive: 'one of my favorites', strong multi-use card"},
    "Io Mining Industries": {"current": 69, "suggested": 74, "reason": "COTD: 'godly production', community loves it despite cost concerns"},
    "Invention Contest": {"current": 68, "suggested": 72, "reason": "COTD: 'great little card', curated draw undervalued"},
    "Convoy from Europa": {"current": 66, "suggested": 70, "reason": "COTD: 'better than SP ocean with card+ti+rebates', community rates B-tier"},
    "Colonizer Training Camp": {"current": 73, "suggested": 76, "reason": "COTD: 'awesome on Hellas', milestone enabler undervalued"},
    "Luna Governor": {"current": 67, "suggested": 72, "reason": "COTD: 'synergy so hard it feels dirty', best MC/prod rate in game"},
    "Asteroid Rights": {"current": 72, "suggested": 77, "reason": "COTD: 'insanely good, pays off in 2 gens', community rates notably higher"},
    "CEO's Favorite Project": {"current": 67, "suggested": 72, "reason": "COTD: 'no-brainer with Physics Complex', cheap VP very efficient"},
    "Rover Construction": {"current": 67, "suggested": 71, "reason": "COTD: positive with city-heavy meta, steel-payable undervalued"},
    "Inventrix": {"current": 70, "suggested": 65, "reason": "COTD: 'trap corp, gets picked for science tag but avg cash hurts', multiple downvotes"},
    "Magnetic Field Generators": {"current": 42, "suggested": 48, "reason": "COTD: 'gets played last gen almost always', steel+energy dump has value"},
    "Industrial Center": {"current": 59, "suggested": 64, "reason": "COTD: 'foremost use is teleporting/blocking', community rates higher"},
    "Martian Survey": {"current": 62, "suggested": 67, "reason": "COTD: mixed but science tag + draw valued, some community members rate higher"},
    "Hired Raiders": {"current": 55, "suggested": 60, "reason": "COTD: 'breaks even while hurting opponent', event synergies add value"},
    "Virus": {"current": 76, "suggested": 72, "reason": "COTD: 'good in 2P, less so in higher players', 3P penalty may be underweighted"},
}

for card_info in needed['cards'][:53]:
    card_name = card_info['name']
    eval_key = find_eval_key(card_name)

    if eval_key is None:
        print(f"[SKIP] {card_name} - not found in evaluations")
        continue

    if card_name not in updates:
        print(f"[SKIP] {card_name} - no update prepared")
        continue

    new_reasoning = updates[card_name]

    # Validate length
    if len(new_reasoning) > 400:
        print(f"[WARN] {card_name}: reasoning too long ({len(new_reasoning)} chars), truncating")
        new_reasoning = new_reasoning[:397] + "..."

    old_reasoning = evals[eval_key]['reasoning']
    evals[eval_key]['reasoning'] = new_reasoning
    cards_updated.append(card_name)
    print(f"[OK] {card_name}: updated reasoning ({len(new_reasoning)} chars)")

    # Check for score review
    if card_name in score_reviews:
        sr = score_reviews[card_name]
        score_review_needed.append({
            "name": card_name,
            "current": sr["current"],
            "suggested": sr["suggested"],
            "reason": sr["reason"]
        })

# Save evaluations
with open('data/evaluations.json', 'w', encoding='utf-8') as f:
    json.dump(evals, f, ensure_ascii=False, indent=2)
print(f"\nSaved evaluations.json with {len(cards_updated)} updates")

# Save checkpoint
checkpoint = {
    "processed": len(cards_updated),
    "cards_updated": cards_updated,
    "score_review_needed": score_review_needed
}
with open('data/cotd_batch1_done.json', 'w', encoding='utf-8') as f:
    json.dump(checkpoint, f, ensure_ascii=False, indent=2)
print(f"Saved checkpoint: {len(cards_updated)} cards, {len(score_review_needed)} for score review")
