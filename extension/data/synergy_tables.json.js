// TM Tier Overlay — Synergy & scoring data tables
// Extracted from content.js for maintainability

// For The Nerd value table (gensLeft → [tr, prod, vp] in MC)
const TM_FTN_TABLE = {
  0:  [8.0, 0.0, 8.0],
  1:  [8.0, 0.5, 7.5],
  2:  [8.0, 1.2, 6.8],
  3:  [8.0, 2.0, 6.0],
  4:  [7.9, 2.9, 5.0],
  5:  [7.8, 3.9, 3.9],
  6:  [7.6, 4.8, 2.8],
  7:  [7.4, 5.4, 2.0],
  8:  [7.2, 5.6, 1.6],
  9:  [7.1, 5.7, 1.4],
  10: [7.0, 5.8, 1.2],
  11: [7.0, 5.9, 1.1],
  12: [7.0, 6.0, 1.0],
  13: [7.0, 6.0, 1.0],
};

// Corporation tag discounts (corp name → { tag: discount })
// Only COST REDUCTIONS — triggers that give resources/production go to TM_TAG_TRIGGERS
const TM_CORP_DISCOUNTS = {
  'Teractor': { earth: 3 },
  'Cheung Shing MARS': { building: 2 },
  'Thorgate': { power: 3 },
  'Terralabs Research': { _all: 1 }, // 1 MC buy cost instead of 3 → ~1 MC effective discount
  'Polaris': { _ocean: 2 },       // -2 MC on cards that place oceans (niche)
  'Inventrix': { _req: 2 },       // +/-2 on global requirements → effectively cheaper cards
  'Morning Star Inc.': { venus: 2 },
  'Manutech': { _all: 0 },        // No discount, but prod=resource → placeholder for trigger
  'Stormcraft Incorporated': { jovian: 0 }, // Floater value, no direct discount
};

// Cards that provide tag discounts (card name → { tag: discount })
const TM_CARD_DISCOUNTS = {
  'Earth Office': { earth: 3 },
  'Mass Converter': { space: 2 },
  'Space Station': { space: 2 },
  'Research Outpost': { _all: 1 },
  'Cutting Edge Technology': { _req: 2 },
  'Anti-Gravity Technology': { _all: 2 },
  'Earth Catapult': { _all: 2 },
  'Quantum Extractor': { space: 2 },
  'Shuttles': { space: 2 },
  'Warp Drive': { space: 4 },
  'Sky Docks': { _all: 1 },
  'Mercurian Alloys': { _all: 2 },  // 2 Wild tags — approximated as general discount
  'Dirigibles': { venus: 2 },
  'Venus Waystation': { venus: 2 },
  'Luna Conference': { _all: 1 },       // -1 MC per science tag played (effect)
  'Media Archives': { event: 1 },       // +1 MC per event played (effect)
  'Science Fund': { science: 2 },       // Effective discount on science cards
  'Recruited Scientists': { _all: 1 },  // Prelude effect — ongoing discount
};

// Tag triggers: card/corp name → array of { tags: [...], value: N, desc: string }
// value = approximate MC value of the trigger firing once
const TM_TAG_TRIGGERS = {
  // ── Science triggers ──
  'Olympus Conference': [{ tags: ['science'], value: 4, desc: 'Olympus Conf → карта' }],
  'Mars University': [{ tags: ['science'], value: 3, desc: 'Mars Uni → обмен' }],
  // Hi-Tech Lab REMOVED: action (spend energy → draw), NOT a science tag trigger
  'Research Coordination': [{ tags: ['science'], value: 2, desc: 'Science → Res Coord +wild' }],
  'Science Fund': [{ tags: ['science'], value: 2, desc: 'Sci Fund → +2 MC' }],

  // ── Earth triggers ──
  'Point Luna': [{ tags: ['earth'], value: 4, desc: 'Point Luna → карта' }],
  'Lunar Mining': [{ tags: ['earth'], value: 4, desc: 'Lunar Mining → +1 ti-прод' }],
  'Teractor': [{ tags: ['earth'], value: 3, desc: 'Teractor → −3 MC' }],
  'Earth Office': [{ tags: ['earth'], value: 3, desc: 'Earth Office → −3 MC' }],
  'Lunar Exports': [{ tags: ['earth'], value: 2, desc: 'Lunar Exp → +1 MC-прод' }],

  // ── Event triggers ──
  'Media Group': [{ tags: ['event'], value: 3, desc: 'Media Group → +3 MC' }],
  'Interplanetary Cinematics': [{ tags: ['event'], value: 2, desc: 'IC → +2 MC' }],
  'Media Archives': [{ tags: ['event'], value: 1, desc: 'Media Arch → +1 MC' }],

  // ── Jovian triggers ──
  'Saturn Systems': [{ tags: ['jovian'], value: 4, desc: 'Saturn Sys → +1 MC-прод' }],
  'Titan Floating Launch-pad': [{ tags: ['jovian'], value: 2, desc: 'Titan FLP → флоатер' }],
  'Jovian Embassy': [{ tags: ['jovian'], value: 2, desc: 'Jov Emb → +1 MC-прод' }],

  // ── Microbe triggers ──
  'Splice': [{ tags: ['microbe'], value: 2, desc: 'Splice → +2 MC' }],
  'Topsoil Contract': [{ tags: ['microbe'], value: 1, desc: 'Topsoil → +1 MC' }],

  // ── Venus triggers ──
  'Morning Star Inc.': [{ tags: ['venus'], value: 2, desc: 'MSI → −2 req' }],
  'Dirigibles': [{ tags: ['venus'], value: 2, desc: 'Dirig → −2 MC' }],
  'Venus Waystation': [{ tags: ['venus'], value: 2, desc: 'Venus WS → −2 MC' }],
  'Celestic': [{ tags: ['venus'], value: 1, desc: 'Celestic → флоатер' }],
  'Stratospheric Birds': [{ tags: ['venus'], value: 1, desc: 'Strato Birds → +1 VP' }],

  // ── Animal/Plant/Bio triggers ──
  'Arklight': [
    { tags: ['animal'], value: 5, desc: 'Arklight → +1 MC-прод' },
    { tags: ['plant'], value: 5, desc: 'Arklight → +1 MC-прод' },
  ],
  'Decomposers': [
    { tags: ['animal'], value: 2, desc: 'Decomp → ресурс' },
    { tags: ['plant'], value: 2, desc: 'Decomp → ресурс' },
    { tags: ['microbe'], value: 2, desc: 'Decomp → ресурс' },
  ],
  'Meat Industry': [{ tags: ['animal'], value: 2, desc: 'Meat Ind → +2 MC' }],
  'Ecological Zone': [
    { tags: ['animal'], value: 1, desc: 'Eco Zone → VP' },
    { tags: ['plant'], value: 1, desc: 'Eco Zone → VP' },
  ],
  'Viral Enhancers': [
    { tags: ['animal'], value: 1, desc: 'Viral Enh → растение' },
    { tags: ['plant'], value: 1, desc: 'Viral Enh → растение' },
    { tags: ['microbe'], value: 1, desc: 'Viral Enh → растение' },
  ],
  'Ecology Experts': [
    { tags: ['plant'], value: 3, desc: 'Eco Exp → −5 req' },
  ],

  // ── Building triggers ──
  'Recyclon': [{ tags: ['building'], value: 1, desc: 'Recyclon → микроб' }],
  'Mining Guild': [{ tags: ['building'], value: 2, desc: 'Mining Guild → +1 steel-прод' }],
  'Philares': [{ tags: ['building'], value: 2, desc: 'Philares → +1 MC/тайл' }],

  // ── City triggers ──
  'Tharsis Republic': [{ tags: ['city'], value: 3, desc: 'Tharsis → +1 MC-прод' }],
  'Rover Construction': [{ tags: ['city'], value: 2, desc: 'Rover Constr → +2 MC' }],

  // ── Space triggers ──
  'Optimal Aerobraking': [{ tags: ['space'], value: 3, desc: 'Opt Aero → +3 MC/тепло', eventOnly: true }],
  'Warp Drive': [{ tags: ['space'], value: 4, desc: 'Warp Drive → −4 MC' }],
  'Mass Converter': [{ tags: ['space'], value: 3, desc: 'Mass Conv → −5 MC' }],
  'Space Station': [{ tags: ['space'], value: 2, desc: 'Space Stn → −2 MC' }],
  'Shuttles': [{ tags: ['space'], value: 2, desc: 'Shuttles → −2 MC' }],

  // ── Power triggers ──
  'Thorgate': [{ tags: ['power'], value: 3, desc: 'Thorgate → −3 MC' }],

  // ── Wild/Multi triggers ──
  'Earth Catapult': [
    { tags: ['building', 'space', 'science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars'], value: 2, desc: 'E-Catapult → −2 MC' },
  ],
  'Anti-Gravity Technology': [
    { tags: ['building', 'space', 'science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars'], value: 2, desc: 'Anti-Grav → −2 MC' },
  ],
};

// Take-that cards: 3P context warnings
const TM_TAKE_THAT_CARDS = {
  'Hackers': 'Отнимает MC-прод у оппонента — третий игрок выигрывает бесплатно',
  'Energy Tapping': 'Отнимает energy-прод + теряешь 1 VP',
  'Biomass Combustors': 'Отнимает plant-прод у оппонента',
  'Predators': 'Убирает animal у оппонента каждый ход',
  'Ants': 'Убирает microbe у оппонента каждый ход',
  'Virus': 'Убирает до 5 растений у оппонента',
  'Flooding': 'Занимает тайл оппонента',
  'Power Supply Consortium': 'Отнимает energy-прод у оппонента',
  'Great Escarpment Consortium': 'Отнимает steel-прод у оппонента',
  'Hired Raiders': 'Крадёт steel или MC у оппонента',
  'Sabotage': 'Отнимает titanium/steel/MC у оппонента',
  'Asteroid Mining Consortium': 'Отнимает ti-прод у оппонента',
  'Comet': 'Убирает до 3 растений у оппонента',
  'Asteroid': 'Убирает до 3 растений у оппонента',
  'Big Asteroid': 'Убирает до 4 растений у оппонента',
  'Giant Ice Asteroid': 'Убирает до 6 растений у оппонента',
  'Deimos Down': 'Убирает до 8 растений у оппонента',
  'Birds': 'Отнимает 2 plant-прод у оппонента',
  'Heat Trappers': 'Отнимает 1 heat-прод у оппонента',
  'Aerial Lenses': 'Отнимает 2 heat-прод у оппонента',
};

// Cards that hold animal resources (vulnerable to Predators/Ants)
const TM_ANIMAL_TARGETS = [
  'Birds', 'Fish', 'Livestock', 'Predators', 'Small Animals', 'Pets',
  'Ecological Zone', 'Penguins', 'Herbivores', 'Vermin',
  'Venusian Animals', 'Stratospheric Birds', 'Sub-zero Salt Fish',
  'Martian Zoo', 'Arklight',
];

// Cards that hold microbe resources (vulnerable to Ants)
const TM_MICROBE_TARGETS = [
  'Decomposers', 'Ants', 'Tardigrades', 'Extremophiles',
  'Nitrite Reducing Bacteria', 'GHG Producing Bacteria', 'Psychrophiles',
  'Sulphur-Eating Bacteria', 'Thermophiles', 'Regolith Eaters',
  'Venusian Insects', 'Recyclon',
];

// Cards that hold floater resources (for synergy/combo scoring, no opponent attack exists)
const TM_FLOATER_TARGETS = [
  'Dirigibles', 'Floating Habs', 'Aerial Mappers', 'Stratopolis',
  'Local Shading', 'Forced Precipitation', 'Extractor Balloons',
  'Jet Stream Microscrappers', 'Deuterium Export', 'Celestic',
  'Stormcraft Incorporated', 'Titan Shuttles', 'Atmo Collectors',
  'Jovian Lanterns', 'Titan Air-scrapping', 'Red Spot Observatory',
  'Jupiter Floating Station', 'Titan Floating Launch-pad',
  'Saturn Surfing', 'Floating Refinery', 'Cloud Tourism',
];

// Corp ability synergy: tag/keyword matching for initial draft scoring
// Works without game state — matches card DOM tags + data.e keywords (RU+EN) with corp abilities
const TM_CORP_ABILITY_SYNERGY = {
  'Helion': { tags: ['power'], kw: ['heat', 'тепл', 'temperature', 'температур', 'energy', 'энерг'], b: 5 },
  'Stormcraft Incorporated': { tags: ['jovian', 'venus'], kw: ['floater', 'флоатер'], b: 5 },
  'EcoLine': { tags: ['plant'], kw: ['greenery', 'озелен', 'plant', 'раст'], b: 5 },
  'PhoboLog': { tags: ['space'], kw: ['titanium', 'титан'], b: 4 },
  'Teractor': { tags: ['earth'], kw: [], b: 4 },
  'Point Luna': { tags: ['earth'], kw: [], b: 5 },
  'Arklight': { tags: ['animal', 'plant'], kw: ['animal', 'живот', 'plant', 'раст'], b: 4 },
  'Cheung Shing MARS': { tags: ['building'], kw: ['steel', 'сталь', 'city', 'город'], b: 4 },
  'Mining Guild': { tags: ['building'], kw: ['steel', 'сталь'], b: 4 },
  'Thorgate': { tags: ['power'], kw: ['energy', 'энерг'], b: 4 },
  'Interplanetary Cinematics': { tags: ['event'], kw: [], b: 3 },
  'Morning Star Inc.': { tags: ['venus'], kw: ['venus', 'венус', 'floater', 'флоатер'], b: 4 },
  'Aphrodite': { tags: ['venus'], kw: ['venus', 'венус'], b: 4 },
  'Nirgal Enterprises': { tags: [], kw: ['ocean', 'океан', 'temperature', 'температур', 'oxygen', 'кислород', 'greenery', 'озелен', 'terraform', 'терраформ', 'tr ', '+1 tr', '+2 tr'], b: 4 },
  'Poseidon': { tags: [], kw: ['colony', 'колон', 'trade', 'торгов', 'fleet', 'флот'], b: 5 },
  'Aridor': { tags: [], kw: ['colony', 'колон'], b: 2 },
  'Splice': { tags: ['microbe'], kw: ['microbe', 'микроб'], b: 4 },
  'Saturn Systems': { tags: ['jovian'], kw: [], b: 4 },
  'Septem Tribus': { tags: [], kw: ['delegate', 'делегат', 'influence', 'влияни'], b: 3 },
  'Tharsis Republic': { tags: ['city'], kw: ['city', 'город'], b: 4 },
  'Manutech': { tags: [], kw: ['production', 'прод'], b: 3 },
  'Robinson Industries': { tags: [], kw: ['production', 'прод'], b: 3 },
  'Celestic': { tags: ['venus'], kw: ['floater', 'флоатер'], b: 4 },
  'Recyclon': { tags: ['building'], kw: ['microbe', 'микроб'], b: 3 },
  'Vitor': { tags: [], kw: ['vp', 'VP', 'victory', 'побед'], b: 4 },
  'Inventrix': { tags: ['science'], kw: [], b: 3 },
  'Kuiper Cooperative': { tags: [], kw: ['colony', 'колон', 'trade', 'торгов', 'fleet', 'флот'], b: 4 },
  'Factorum': { tags: ['building'], kw: ['energy', 'энерг'], b: 3 },
  'Gagarin Mobile Base': { tags: ['space'], kw: ['colony', 'колон', 'trade', 'торгов'], b: 3 },
  'Lakefront Resorts': { tags: [], kw: ['ocean', 'океан', 'city', 'город'], b: 3 },
  'Valley Trust': { tags: ['science'], kw: [], b: 3 },
  'Pharmacy Union': { tags: ['science', 'microbe'], kw: [], b: 3 },
  'EcoTec': { tags: ['plant', 'microbe', 'animal'], kw: [], b: 3 },
  'Arcadian Communities': { tags: [], kw: ['city', 'город'], b: 4 },
  'Philares': { tags: [], kw: ['tile', 'тайл', 'city', 'город', 'greenery', 'озелен', 'ocean', 'океан'], b: 4 },
  'Polaris': { tags: [], kw: ['ocean', 'океан'], b: 4 },
  'Viron': { tags: [], kw: ['action', 'действи'], b: 4 },
  'Terralabs Research': { tags: ['science'], kw: [], b: 3 },
  'Palladin Shipping': { tags: ['space'], kw: ['colony', 'колон', 'trade', 'торгов'], b: 3 },
  'Spire': { tags: ['science', 'building'], kw: [], b: 3 },
  'CrediCor': { tags: [], kw: [], b: 0 },
  'Polyphemos': { tags: [], kw: [], b: 0 },
  'Utopia Invest': { tags: [], kw: ['production', 'прод'], b: 3 },
  'Mons Insurance': { tags: [], kw: ['production', 'прод'], b: 3 },
  'Astrodrill': { tags: [], kw: ['asteroid', 'астероид'], b: 3 },
  'Tycho Magnetics': { tags: ['animal'], kw: ['floater', 'флоатер', 'animal', 'живот'], b: 3 },
  'United Nations Mars Initiative': { tags: [], kw: ['terraform', 'терраформ', 'tr ', '+1 tr', '+2 tr'], b: 3 },
  'PolderTECH Dutch': { tags: ['plant'], kw: ['ocean', 'океан', 'plant', 'раст'], b: 4 },
  'Pristar': { tags: [], kw: [], b: 0 },
  'Mars Direct': { tags: [], kw: [], b: 0 },
  'Sagitta Frontier Services': { tags: [], kw: [], b: 0 },
};

// Corps considered "strong engines" — take-that more valuable against them
const TM_STRONG_ENGINE_CORPS = {
  'Point Luna':1, 'Tharsis Republic':1, 'EcoLine':1, 'Arklight':1, 'Mining Guild':1,
  'Poseidon':1, 'Teractor':1, 'Saturn Systems':1, 'Viron':1, 'Interplanetary Cinematics':1,
  'CrediCor':1, 'PhoboLog':1, 'Polaris':1, 'Manutech':1
};

// Opponent corp vulnerabilities — used to penalize cards that help opponents
// Global: opponent benefits when ANY player raises param (full penalty)
const TM_OPP_CORP_VULN_GLOBAL = {
  'Polaris': ['ocean', 'океан'],
  'Lakefront Resorts': ['ocean', 'океан'],
  'PolderTECH Dutch': ['ocean', 'океан'],
  'Aphrodite': ['venus', 'венус'],
  'Poseidon': ['colon', 'колон'],
};
// Indirect: opponent's corp engine keywords (half penalty)
const TM_OPP_CORP_VULN_INDIRECT = {
  'EcoLine': ['plant', 'green', 'раст', 'озелен'],
  'Point Luna': ['draw', 'card', 'earth'],
  'Arklight': ['animal', 'plant'],
  'Tharsis Republic': ['city', 'город'],
  'Splice': ['microbe', 'микроб'],
  'Celestic': ['floater', 'флоат'],
  'Helion': ['heat', 'тепл'],
  'Mining Guild': ['steel', 'стал'],
  'Teractor': ['earth'],
  'Saturn Systems': ['jovian'],
  'PhoboLog': ['space', 'titan'],
  'Manutech': ['prod', 'прод'],
};

// Turmoil ruling party hints for toast notifications
const TM_TURMOIL_PARTY_HINTS = {
  'Mars First': 'Бонус за карты с тегом Mars',
  'Scientists': 'Бонус за Science теги',
  'Unity': 'Бонус за Venus/Earth/Jovian теги',
  'Greens': 'Бонус за Plant/Microbe/Animal теги',
  'Reds': 'TR замедляется',
  'Kelvinists': 'Бонус за heat production'
};

// ── Hand synergy: shared card lists ──
// Animal VP accumulators (1 VP per animal resource)
const TM_ANIMAL_VP_CARDS = [
  'Birds', 'Fish', 'Predators', 'Livestock', 'Penguins', 'Venusian Animals',
  'Small Animals', 'Pets', 'Herbivores', 'Martian Zoo', 'Ecological Zone',
];
// Microbe VP accumulators
const TM_MICROBE_VP_CARDS = ['Ants', 'Decomposers', 'Tardigrades', 'Extreme-Cold Fungus', 'Extremophiles'];
// Animal placement cards: { name: count }
const TM_ANIMAL_PLACERS = {
  'Large Convoy': 4, 'Imported Nitrogen': 2, 'Imported Hydrogen': 1,
  "CEO's Favorite Project": 1, 'Wildlife Dome': 1, 'Penguins': 1,
};
// Microbe placement cards: { name: count }
const TM_MICROBE_PLACERS = {
  'Imported Nitrogen': 3, 'Symbiotic Fungus': 1, 'Extreme-Cold Fungus': 2,
  'Bactoviral Research': 1,
};
// Energy chain
const TM_ENERGY_PRODUCERS = [
  'Nuclear Power', 'Solar Power', 'Giant Space Mirror', 'Power Supply Consortium',
  'Geothermal Power', 'Quantum Extractor', 'Lightning Harvest', 'Corona Extractor',
  'Lunar Beam', 'Fusion Power', 'Tidal Power',
];
const TM_ENERGY_CONSUMERS = [
  'Electro Catapult', 'Physics Complex', 'Water Splitting Plant', 'Ironworks',
  'Steelworks', 'Ore Processor', 'Power Infrastructure', 'Spin-Off Department',
];
// Jovian VP multipliers (1+ VP per jovian tag at game end)
const TM_JOVIAN_VP_CARDS = [
  'Io Mining Industries', 'Ganymede Colony', 'Immigration Shuttles',
  'Terraforming Ganymede', 'Water Import From Europa',
];
// Floater engine
const TM_FLOATER_GENERATORS = [
  'Titan Floating Launch-pad', 'Floater Technology', 'Dirigibles',
  'Floater Prototypes', 'Celestic', 'Stormcraft Incorporated',
];
const TM_FLOATER_CONSUMERS = [
  'Stratopolis', 'Jupiter Floating Station', 'Aerial Mappers',
  'Titan Shuttles', 'Atmo Collectors', 'Dirigibles', 'Local Shading',
  'Forced Precipitation', 'Jet Stream Microscrappers', 'Cloud Tourism',
];
// Colony density
const TM_COLONY_BUILDERS = [
  'Interplanetary Colony Ship', 'Pioneer Settlement', 'Space Port Colony',
  'Trading Colony', 'Cryo-Sleep', 'Mining Colony', 'Research Colony',
];
const TM_COLONY_BENEFITS = [
  'Rim Freighters', 'Cryo-Sleep', 'Space Port Colony', 'Trading Colony',
  'Trade Envoys', 'Titan Shuttles', 'Productive Outpost',
];

// Known floater traps — expensive floater cards that rarely pay off in 3P
const TM_FLOATER_TRAPS = {
  'Titan Air-scrapping': 1, 'Aerosport Tournament': 1,
  'Rotator Impacts': 1, 'Titan Floating Launch-pad': 1
};

// ── Hand synergy: production/param stacking rules ──
// hrKey maps to runtime headroom: { plant: plantHR, temp: tempHR, venus: vnHR, ocean: ocHR }
const TM_STACKING_RULES = [
  { field: 'pp',  coeff: 0.8, cap: 4, hrKey: 'plant', desc: 'plant stack', hrLabel: '↓O₂' },
  { field: 'hp',  coeff: 0.6, cap: 4, hrKey: 'temp',  desc: 'heat stack',  hrLabel: '↓temp' },
  { field: 'vn',  coeff: 0.5, cap: 3, hrKey: 'venus', desc: 'venus stack', hrLabel: '↓venus' },
  { field: 'tmp', coeff: 0.5, cap: 3, hrKey: 'temp',  desc: 'temp stack',  hrLabel: '↓temp' },
  { field: 'oc',  coeff: 0.5, cap: 3, hrKey: 'ocean', desc: 'ocean stack', hrLabel: '↓ocean' },
  { field: 'mp',  coeff: 0.4, cap: 3, hrKey: null,    desc: 'MC stack',    hrLabel: '', minOther: 3, suffix: '→Banker' },
];

// ── Hand synergy: named effect-field combos ──
// n: card name, f: effect field to sum from others
// fc/fC/fM: forward coeff/cap/min, fd: forward desc
// rf: reverse flat bonus (>0 → flat), rc/rC: reverse coeff/cap, rd: reverse desc, rm: reverse desc multiplier
const TM_NAMED_EFF_COMBOS = [
  { n: 'Arctic Algae',     f: 'oc', fc: 2,   fC: 6, fM: 0, fd: 'ocean→plants',      rf: 0,   rc: 1.5, rC: 99, rd: 'ArcAlgae', rm: 2 },
  { n: 'Electro Catapult', f: 'sp', fc: 1.5, fC: 5, fM: 0, fd: 'sp→catapult',        rf: 0,   rc: 1,   rC: 3,  rd: 'Catapult fuel' },
  { n: 'Herbivores',       f: 'pp', fc: 0.8, fC: 4, fM: 2, fd: 'pp→greenery→animal', rf: 0.8, rc: 0,   rC: 0,  rd: 'Herbivores +animal' },
  { n: 'Insulation',       f: 'hp', fc: 0.6, fC: 3, fM: 2, fd: 'hp→MC via Insul',    rf: 0.5, rc: 0,   rC: 0,  rd: 'Insul convert' },
];

// ── Hand synergy: named tag combos ──
// n: card name, tags: which tags to match in other hand cards
// fc/fC: forward coeff/cap, fd: forward desc
// rb: reverse flat bonus, rd: reverse desc
const TM_NAMED_TAG_COMBOS = [
  { n: 'Pets',            tags: ['city'],            fc: 2,   fC: 6, rb: 1.5, fd: 'city→animal', rd: 'Pets +1a' },
  { n: 'Immigrant City',  tags: ['city'],            fc: 1.5, fC: 5, rb: 1,   fd: 'city→MC',     rd: 'ImmCity +MC' },
  { n: 'Ecological Zone', tags: ['plant', 'animal'], fc: 1.5, fC: 6, rb: 1,   fd: 'bio→animal',  rd: 'EcoZone +1a' },
];

// Delegate-placing cards (Turmoil): name → delegate count placed
const TM_DELEGATE_CARDS = {
  'Cultural Metropolis': 2, 'Sponsored Academies': 1, 'PR Office': 1,
  'Sponsoring Nation': 2, 'GMO Contract': 1, 'Vote of No Confidence': 1,
  'Event Analysts': 3, 'Recruitment': 1, 'Red Tourism Wave': 1,
  'Parliament Hall': 1, 'Banned Delegate': 1, 'Wildlife Dome': 1,
};
