const TM_MA_DATA = {
  // Tharsis milestones
  'Terraformer': { type: 'milestone', map: 'Tharsis', desc: 'TR >= 35', check: 'tr', target: 35, reddit: 'One of the better milestones. Contested as 3rd on Tharsis after Builder/Gardener. 5 VP over 35 TR is a lot in a short game' },
  'Mayor': { type: 'milestone', map: 'Tharsis', desc: '3 cities', check: 'cities', target: 3 },
  'Gardener': { type: 'milestone', map: 'Tharsis', desc: '3 greeneries', check: 'greeneries', target: 3 },
  'Builder': { type: 'milestone', map: 'Tharsis', desc: '8 building tags', check: 'tags', tag: 'building', target: 8, reddit: 'Go for it naturally, not from the start, unless 3+ building tags in preludes. Usually the first claimed milestone' },
  'Planner': { type: 'milestone', map: 'Tharsis', desc: '16 cards in hand', check: 'hand', target: 16 },
  // Hellas milestones
  'Diversifier': { type: 'milestone', map: 'Hellas', desc: '8 different tags', check: 'uniqueTags', target: 8 },
  'Tactician': { type: 'milestone', map: 'Hellas', desc: '5 cards with requirements', check: 'reqCards', target: 5 },
  'Energizer': { type: 'milestone', map: 'Hellas', desc: '6 energy production', check: 'prod', resource: 'energy', target: 6 },
  'Rim Settler': { type: 'milestone', map: 'Hellas', desc: '3 Jovian tags', check: 'tags', tag: 'jovian', target: 3 },
  // Elysium milestones
  'Generalist': { type: 'milestone', map: 'Elysium', desc: 'All 6 productions +1', check: 'generalist' },
  'Specialist': { type: 'milestone', map: 'Elysium', desc: '10 in any production', check: 'maxProd', target: 10, reddit: 'Common in 2P with money or heat production. Harder in 3-4P' },
  'Ecologist': { type: 'milestone', map: 'Elysium', desc: '4 bio tags', check: 'bioTags', target: 4 },
  'Tycoon': { type: 'milestone', map: 'Elysium', desc: '15 project cards', check: 'tableau', target: 15 },
  'Legend': { type: 'milestone', map: 'Elysium', desc: '5 events', check: 'events', target: 5 },
  // M&A expansion milestones
  'Terran': { type: 'milestone', map: 'M&A', desc: '5 Earth tags', check: 'tags', tag: 'earth', target: 5, reddit: 'Hard to reach 5 Earth tags without dedicated strategy. Point Luna makes it much easier' },
  'Forester': { type: 'milestone', map: 'M&A', desc: '3 greenery tiles', check: 'greeneries', target: 3, reddit: '3 feels low, but greeneries are expensive early. Often contested' },
  'Manager': { type: 'milestone', map: 'M&A', desc: '4 productions at 2+', check: 'manager' },
  'Geologist': { type: 'milestone', map: 'M&A', desc: '5 same non-Earth tags', check: 'maxTag', target: 5 },
  'Polar Explorer': { type: 'milestone', map: 'M&A', desc: '3 tiles on bottom rows', check: 'polar', target: 3, reddit: 'Always try for the ocean spot. Pairs well with city placement strategy' },
  // Tharsis awards
  'Landlord': { type: 'award', map: 'Tharsis', desc: 'Most tiles', check: 'tiles' },
  'Scientist': { type: 'award', map: 'Tharsis', desc: 'Most science tags', check: 'tags', tag: 'science' },
  'Banker': { type: 'award', map: 'Tharsis', desc: 'Most MC production', check: 'prod', resource: 'megacredits' },
  'Thermalist': { type: 'award', map: 'Tharsis', desc: 'Most heat', check: 'resource', resource: 'heat', reddit: 'Better for engine (Mass Converter/Quantum) than terraforming. NOT good for Helion contrary to popular belief' },
  'Miner': { type: 'award', map: 'Tharsis', desc: 'Most steel + titanium', check: 'steelTi', reddit: 'Very competitive. Best with steel/ti production corps. Fund early before opponents accumulate resources' },
  // Hellas awards
  'Cultivator': { type: 'award', map: 'Hellas', desc: 'Most greeneries', check: 'greeneries' },
  'Magnate': { type: 'award', map: 'Hellas', desc: 'Most green cards', check: 'greenCards' },
  'Space Baron': { type: 'award', map: 'Hellas', desc: 'Most space tags', check: 'tags', tag: 'space' },
  'Contractor': { type: 'award', map: 'Hellas', desc: 'Most building tags', check: 'tags', tag: 'building', reddit: 'Better online than in-person — avoids constant tag counting. Pairs well with Builder milestone' },
  // Elysium awards
  'Celebrity': { type: 'award', map: 'Elysium', desc: 'Most cards costing 20+', check: 'expensiveCards', reddit: 'Best when someone else funds it. Good for Space/Jovian heavy strategies with expensive cards' },
  'Industrialist': { type: 'award', map: 'Elysium', desc: 'Most steel + energy', check: 'steelEnergy' },
  'Benefactor': { type: 'award', map: 'Elysium', desc: 'Highest TR', check: 'tr' },
  // M&A expansion awards
  'Collector': { type: 'award', map: 'M&A', desc: 'Most resources on cards', check: 'cardResources', reddit: 'Not particularly swingy. Fun with Decomposers, animal cards, floater engines' },
  'Electrician': { type: 'award', map: 'M&A', desc: 'Most Power tags', check: 'tags', tag: 'power', reddit: 'Finally a reason to play Thorgate! Power tags become valuable' },
  'Suburbian': { type: 'award', map: 'M&A', desc: 'Most city tiles', check: 'cities', reddit: 'Less swingy, empowers ground game. Pairs well with Mayor milestone and city-heavy strategy' },
  'Landscaper': { type: 'award', map: 'M&A', desc: 'Most greenery tiles', check: 'greeneries', reddit: 'Many ways to fight and block it. Risky to fund — opponents can steal with late greeneries' },
  // Amazonis Planitia milestones
  'Colonizer': { type: 'milestone', map: 'Amazonis', desc: '3 colonies', check: 'colonies', target: 3 },
  'Minimalist': { type: 'milestone', map: 'Amazonis', desc: '≤3 cards in hand', check: 'hand', target: 3, thresholdDirection: 'atMost' },
  'Terran': { type: 'milestone', map: 'Amazonis', desc: '5 Earth tags', check: 'tags', tag: 'earth', target: 5 },
  'Tropicalist': { type: 'milestone', map: 'Amazonis', desc: '3 tiles in southern 2 rows', check: 'tropics', target: 3 },
  // Terra Cimmeria milestones
  'Firestarter': { type: 'milestone', map: 'TerraCimmeria', desc: '20+ heat', check: 'resource', resource: 'heat', target: 20 },
  'Architect': { type: 'milestone', map: 'TerraCimmeria', desc: '6 building tags', check: 'tags', tag: 'building', target: 6 },
  // Amazonis Planitia awards
  'Curator': { type: 'award', map: 'Amazonis', desc: 'Most diverse resources', check: 'uniqueResources' },
  'Tourist': { type: 'award', map: 'Amazonis', desc: 'Most VP-cards played', check: 'vpCards' },
  // Terra Cimmeria awards
  'Biologist': { type: 'award', map: 'TerraCimmeria', desc: 'Most plant/microbe/animal tags', check: 'bioTags' },
  'Warmonger': { type: 'award', map: 'TerraCimmeria', desc: 'Most take-that actions', check: 'warmonger' },
  'Urbanist': { type: 'award', map: 'TerraCimmeria', desc: 'Most city tiles', check: 'cities' },
  // Venus
  'Venuphile': { type: 'award', map: 'Venus', desc: 'Most Venus tags', check: 'tags', tag: 'venus' },
  // Hellas
  'Excentric': { type: 'award', map: 'Hellas', desc: 'Most resources on cards', check: 'cardResources' },
  'Estate Dealer': { type: 'award', map: 'Hellas', desc: 'Most tiles adjacent to oceans', check: 'oceanAdjacency' },
  'Desert Settler': { type: 'award', map: 'Elysium', desc: 'Most tiles not on reserved areas', check: 'desertTiles' },
  'Naturalist': { type: 'award', map: 'TerraCimmeria', desc: 'Most production steps >0', check: 'prodTypes' },
  // Arabia Terra milestones
  'Martian': { type: 'milestone', map: 'ArabiaTerra', desc: '4 Mars tags', check: 'tags', tag: 'mars', target: 4 },
  'Land Specialist': { type: 'milestone', map: 'ArabiaTerra', desc: '3 special tiles', check: 'specialTiles', target: 3 },
  'Pioneer': { type: 'milestone', map: 'ArabiaTerra', desc: '3 colonies', check: 'colonies', target: 3 },
  // Arabia Terra awards
  'Botanist': { type: 'award', map: 'ArabiaTerra', desc: 'Most plant production', check: 'prod', resource: 'plants' },
  'Cosmic Settler': { type: 'award', map: 'ArabiaTerra', desc: 'Most cities not on Mars', check: 'offworldCities' },
  'Manufacturer': { type: 'award', map: 'ArabiaTerra', desc: 'Most active (blue) cards', check: 'blueCards' },
  'Promoter': { type: 'award', map: 'ArabiaTerra', desc: 'Most event cards played', check: 'events' },
  'Zoologist': { type: 'award', map: 'ArabiaTerra', desc: 'Most animal resources', check: 'resource', resource: 'animal' },
};
