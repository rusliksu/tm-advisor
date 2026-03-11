#!/usr/bin/env node
// Test hand synergy scoring with sample hands
// Usage: node scripts/test-hand-synergy.js

var fs = require('fs');

// Load data files
var indirectEval = eval; // indirect eval → global scope
function loadGlobal(path) {
  var c = fs.readFileSync(path, 'utf8');
  c = c.replace(/^const /gm, 'var ');
  c = c.replace(/^if \(typeof module.*$/gm, '');
  indirectEval(c);
}

loadGlobal('extension/data/card_effects.json.js');
loadGlobal('extension/data/card_tags.js');
loadGlobal('extension/data/synergy_tables.json.js');
loadGlobal('extension/data/card_tag_reqs.js');

// Minimal scoreHandSynergy from content.js (extracted and adapted)
function getCardTagsLocal(n) {
  if (typeof TM_CARD_TAGS !== 'undefined' && TM_CARD_TAGS[n]) return TM_CARD_TAGS[n];
  return [];
}

// We'll eval the actual function from content.js
// First, extract it
var contentJs = fs.readFileSync('extension/content.js', 'utf8');
var fnStart = contentJs.indexOf('function scoreHandSynergy(cardName, myHand, ctx)');
var braceCount = 0;
var fnEnd = fnStart;
var started = false;
for (var i = fnStart; i < contentJs.length; i++) {
  if (contentJs[i] === '{') { braceCount++; started = true; }
  if (contentJs[i] === '}') { braceCount--; }
  if (started && braceCount === 0) { fnEnd = i + 1; break; }
}
var fnBody = contentJs.substring(fnStart, fnEnd);

// Create the function in global context
indirectEval(fnBody);

// Test hands
var testHands = [
  {
    name: 'Steel Engine',
    cards: ['Mining Operations', 'Open City', 'Underground City', 'Robotic Workforce', 'Asteroid'],
    expect: 'Mining Ops gets bld bonus, Robotic Workforce gets copy bonus, Asteroid standalone'
  },
  {
    name: 'Science Rush',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Nuclear Power', 'Invention Contest'],
    expect: 'Science chain stacking, Physics+Nuclear energy, no Physics double-count'
  },
  {
    name: 'Space Events + OptAero',
    cards: ['Optimal Aerobraking', 'Asteroid', 'Comet', 'Towing A Comet', 'Ice Asteroid', 'Media Group'],
    expect: 'OptAero gets rush bonus, each space event gets OptAero rebate + Media'
  },
  {
    name: 'Animal VP',
    cards: ['Birds', 'Large Convoy', 'Decomposers', 'Viral Enhancers', 'Ecological Zone'],
    expect: 'Large Convoy places animals, Decomposers gets bio tags, Viral feeds both'
  },
  {
    name: 'Venus Focus',
    cards: ['Spin-Inducing Asteroid', 'Giant Solar Shade', 'Dirigibles', 'Stratopolis', 'Venus Waystation'],
    expect: 'Venus stacking, floater engine, discount chain'
  },
  {
    name: 'City Mayor',
    cards: ['Open City', 'Capital', 'Immigrant City', 'Rover Construction', 'Pets'],
    expect: '3 cities → Mayor, Rover+cities, Pets+cities, ImmCity+cities'
  },
  {
    name: 'Heat Rush',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Asteroid', 'Deimos Down'],
    expect: 'Heat stacking, temp stacking, TR rush'
  },
  {
    name: 'Action Overload',
    cards: ['Physics Complex', 'Electro Catapult', 'Birds', 'Predators', 'Fish', 'Tardigrades'],
    expect: 'Action card diminishing returns penalty'
  },
  {
    name: 'Balanced Mid',
    cards: ['Earth Office', 'Luna Governor', 'Mining Colony', 'Trees', 'Shuttles'],
    expect: 'Earth discount, some space synergy, diverse'
  },
  {
    name: 'MC Prod Banker',
    cards: ['Acquired Company', 'Luna Governor', 'Corporate Stronghold', 'Immigration Shuttles', 'Rover Construction'],
    expect: 'MC prod stacking → Banker, city chain, Rover+cities'
  },
  {
    name: 'Herbivore Plant Engine',
    cards: ['Herbivores', 'Farming', 'Trees', 'Kelp Farming', 'Bushes'],
    expect: 'Herbivores gets big bonus from plant prod, plant stacking'
  },
  {
    name: 'Insulation Heat Convert',
    cards: ['Insulation', 'GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power'],
    expect: 'Insulation synergy with heat prod, heat stacking, energy chain'
  },
  {
    name: 'Double Tags Monster',
    cards: ['Research', 'Luna Governor', 'Venus Governor', 'Mining Guild', 'Olympus Conference'],
    expect: 'Research sci×2 + OC trigger, Luna earth×2, Venus venus×2, Mining building×2'
  },
  {
    name: 'Point Luna Earth Rush',
    cards: ['Luna Governor', 'Earth Office', 'Lunar Mining', 'Lunar Exports', 'Space Station'],
    expect: 'PtLuna earth compound draw, Earth Office discount stacking',
    corps: ['Point Luna']
  },
  {
    name: 'IC Event Burst',
    cards: ['Asteroid', 'Comet', 'Virus', 'Towing A Comet', 'Optimal Aerobraking'],
    expect: 'IC +2 MC per event compound, OptAero rebate',
    corps: ['Interplanetary Cinematics']
  },
  {
    name: 'Saturn Jovian Stack',
    cards: ['Io Mining Industries', 'Ganymede Colony', 'Colonizer Training Camp', 'Titan Floating Launch-pad', 'Water Import From Europa'],
    expect: 'Saturn +1 MC prod per jovian compound',
    corps: ['Saturn Systems']
  },
  {
    name: 'CrediCor Big Spender',
    cards: ['Deimos Down', 'Giant Ice Asteroid', 'Giant Solar Shade', 'Terraforming Ganymede', 'Magnetic Field Generators'],
    expect: 'CrediCor -4 MC refund per 20+ card compound',
    corps: ['CrediCor']
  },
  {
    name: 'Helion Heat Engine',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power', 'Asteroid'],
    expect: 'Helion heat=MC compound, heat prod stacking',
    corps: ['Helion']
  },
  {
    name: 'Milestone Builder Push',
    cards: ['Mining Operations', 'Underground City', 'Robotic Workforce', 'Open City', 'Steelworks'],
    expect: 'Builder milestone -2 building, compound milestone delta',
    milestoneNeeds: { building: 2 }
  },
  {
    name: 'Milestone Scientist Push',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Invention Contest', 'Olympus Conference'],
    expect: 'Scientist milestone -1, science compound milestone close',
    milestoneNeeds: { science: 1 }
  },
  {
    name: 'VP Burst Endgame',
    cards: ['Terraforming Ganymede', 'Giant Ice Asteroid', 'Deimos Down', 'Comet', 'Imported Hydrogen'],
    expect: 'VP burst at gensLeft=1, massive TR/VP dump',
    gensLeft: 1
  },
  {
    name: 'Colony Engine',
    cards: ['Mining Colony', 'Trade Envoys', 'Rim Freighters', 'Productive Outpost', 'Research Colony'],
    expect: 'Colony builders + fleet compound, colony density stacking'
  },
  {
    name: 'Scientists Rule - Science Rush',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Olympus Conference', 'Invention Contest'],
    expect: 'Scientists ruling + science chain = double compound',
    rulingParty: 'Scientists'
  },
  {
    name: 'Reds Tax - TR Rush',
    cards: ['Terraforming Ganymede', 'Giant Ice Asteroid', 'Deimos Down', 'Comet', 'Giant Solar Shade'],
    expect: 'Reds ruling penalty on TR stacking',
    rulingParty: 'Reds'
  },
  {
    name: 'Plant Prod + Birds Conflict',
    cards: ['Farming', 'Trees', 'Kelp Farming', 'Birds', 'Bushes'],
    expect: 'Birds targets opp pp (no self anti-synergy), plant stacking compound'
  },
  {
    name: 'Production Diversity Rush',
    cards: ['Mining Operations', 'Nuclear Power', 'Farming', 'GHG Factories', 'Acquired Company'],
    expect: 'Steel+energy+plant+heat+MC → 5 prod types Generalist'
  },
  {
    name: 'Opp Polaris Ocean Stack',
    cards: ['Ice Asteroid', 'Towing A Comet', 'Imported Hydrogen', 'Convoy From Europa', 'Comet'],
    expect: 'Ocean stacking penalized by opp Polaris',
    oppCorps: ['Polaris']
  },
  {
    name: 'Early Prod Cohesion',
    cards: ['Mining Operations', 'Farming', 'GHG Factories', 'Nuclear Power', 'Acquired Company'],
    expect: 'All production cards at gen2 = prod cohesion bonus',
    gensLeft: 7
  },
  {
    name: 'Late VP Cohesion',
    cards: ['Terraforming Ganymede', 'Giant Solar Shade', 'Immigration Shuttles', 'Birds', 'Noctis Farming'],
    expect: 'VP cards at gensLeft=2 = VP cohesion bonus',
    gensLeft: 2
  },
  {
    name: 'Wild Tag + Triggers',
    cards: ['Research Coordination', 'Mars University', 'Olympus Conference', 'Earth Office', 'Point Luna'],
    expect: 'Wild tag amplifies all triggers/discounts in hand'
  },
  {
    name: 'Draw Engine',
    cards: ['Research', 'Mars University', 'Invention Contest', 'Olympus Conference', 'Business Network'],
    expect: 'Multiple draw sources compound into card advantage engine'
  },
  {
    name: 'Double Earth Tag + Triggers',
    cards: ['Luna Governor', 'Earth Office', 'Point Luna', 'Lunar Mining', 'Mining Colony'],
    expect: 'Luna Gov earth×2 fires Point Luna + Earth Office + Lunar Mining double'
  },
  {
    name: 'Expanded Jovian VP',
    cards: ['Terraforming Ganymede', 'Water Import From Europa', 'Io Mining Industries', 'Colonizer Training Camp', 'Ganymede Colony'],
    expect: 'TG + WI now in jovianVPCards → massive cross-synergy with 5 jovian tags'
  },
  {
    name: 'Cheap Tempo Rush',
    cards: ['Virus', 'Red Ships', 'Energy Tapping', 'Rego Plastics', 'Colonizer Training Camp', 'Diversity Support'],
    expect: 'All ≤14 MC → tempo bonus, play all in one gen'
  },
  {
    name: 'Expanded Floater Engine',
    cards: ['Dirigibles', 'Local Shading', 'Stormcraft Incorporated', 'Cloud Tourism', 'Stratopolis'],
    expect: 'Stormcraft + Dirigibles generators, Local Shading + Cloud Tourism new consumers'
  },
  {
    name: 'No-Tag Penalty',
    cards: ['Supermarkets', 'Rego Plastics', 'Earth Office', 'Point Luna', 'Lunar Mining'],
    expect: 'Supermarkets + Rego miss all earth triggers/discounts in hand'
  },
  {
    name: 'VP Accumulator Engine',
    cards: ['Birds', 'Fish', 'Predators', 'Livestock', 'Large Convoy'],
    expect: 'Early VP accumulators compound + Large Convoy feeds them',
    gensLeft: 7
  },
  {
    name: 'Insulation + Max Heat',
    cards: ['Insulation', 'GHG Factories', 'Mohole Area', 'Soletta', 'Mining Operations'],
    expect: 'Insulation converts massive heat prod to MC, heat stacking, Mining steel cross'
  },
  {
    name: 'Cost Overload',
    cards: ['Terraforming Ganymede', 'Giant Ice Asteroid', 'Deimos Down', 'Giant Solar Shade', 'Magnetic Field Generators'],
    expect: 'All cards 30+ MC → cost overload penalty, can only play 1 per gen'
  },
  {
    name: 'Energy→Heat Pipeline',
    cards: ['Nuclear Power', 'Geothermal Power', 'GHG Factories', 'Mohole Area', 'Soletta'],
    expect: 'Energy prod → heat residual, heat stacking, no energy consumer → pipeline bonus'
  },
  {
    name: 'Power Infrastructure Engine',
    cards: ['Power Infrastructure', 'Nuclear Power', 'Geothermal Power', 'Fusion Power', 'Lightning Harvest'],
    expect: 'PwrInfra converts energy→MC, all energy producers feed it'
  },
  {
    name: 'Caretaker + Heat Prod',
    cards: ['Caretaker Contract', 'GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power'],
    expect: 'Caretaker heat→TR converter, heat prod compounds, NP ep→heat pipeline'
  },
  {
    name: 'Standard Technology + MC Prod',
    cards: ['Standard Technology', 'Acquired Company', 'Luna Governor', 'Corporate Stronghold', 'Immigration Shuttles'],
    expect: 'StdTech synergy with MC production (more budget for SPs), NOT plant/heat'
  },
  {
    name: 'Greenery Pipeline',
    cards: ['Farming', 'Trees', 'Kelp Farming', 'Bushes', 'Noctis Farming'],
    expect: '10+ total plant prod = greenery engine bonus, 1+ greenery per gen',
    gensLeft: 6
  },
  {
    name: 'Immediate Titanium + Space',
    cards: ['Asteroid Mining', 'Solar Wind Power', 'Ganymede Colony', 'Terraforming Ganymede', 'Titan Floating Launch-pad'],
    expect: 'Cards giving immediate ti + space cards = instant use synergy'
  },
  {
    name: 'Delegate Rush',
    cards: ['Cultural Metropolis', 'Sponsoring Nation', 'Event Analysts', 'PR Office', 'Recruitment'],
    expect: '8+ total delegates = chairman control, political engine'
  },
  {
    name: 'Late VP + Animals',
    cards: ['Terraforming Ganymede', 'Birds', 'Fish', 'Giant Solar Shade', 'Deimos Down'],
    expect: 'vpAcc cards now count in VP burst at endgame',
    gensLeft: 2
  },
  {
    name: 'Multi-Discount Compound',
    cards: ['Earth Office', 'Space Station', 'Luna Governor', 'Lunar Mining', 'Shuttles'],
    expect: 'Earth Office + Space Station discounts stack on Luna Gov/Lunar Mining'
  },
  {
    name: 'City + Greenery Adjacency',
    cards: ['Open City', 'Capital', 'Farming', 'Trees', 'Kelp Farming'],
    expect: 'Cities get adj bonus from plant prod, plant cards get city adj bonus',
    gensLeft: 6
  },
  {
    name: 'Prereq Enabler - Temp',
    cards: ['Asteroid', 'Deimos Down', 'Birds', 'Ants', 'Fish'],
    expect: 'Asteroid+Deimos raise temp → unlock Fish(2°C temp), enabler bonus on param raisers'
  },
  {
    name: 'Max-Req Anti-Synergy',
    cards: ['Asteroid', 'Deimos Down', 'ArchaeBacteria', 'Arctic Algae', 'Comet'],
    expect: 'ArchaeBacteria(max -18) and Arctic Algae(max -12) penalized by temp raisers'
  },
  {
    name: 'Late Prod Mismatch',
    cards: ['Mining Operations', 'Nuclear Power', 'GHG Factories', 'Farming', 'Acquired Company'],
    expect: 'All prod cards at gensLeft=2 = timing mismatch penalty',
    gensLeft: 2
  },
  {
    name: 'Animal Placement Competition',
    cards: ['Birds', 'Fish', 'Predators', 'Livestock', 'Tardigrades'],
    expect: '4 animal VP accumulators competing for limited placement slots',
    gensLeft: 5
  },
  {
    name: 'Delegate Chairman Lock',
    cards: ['Cultural Metropolis', 'Sponsoring Nation', 'Event Analysts', 'PR Office', 'Recruitment'],
    expect: '9 delegates = chairman lock, non-linear compound bonus'
  },
  {
    name: 'Tag Req Enabler - Science',
    cards: ['Research', 'Mars University', 'AI Central', 'Physics Complex', 'Lightning Harvest'],
    expect: 'Research(2sci)+Mars(1sci)+Physics(1sci)=4sci → AI Central(3sci) fully enabled, LH(3sci) enabled'
  },
  {
    name: 'Triple Resource Chain',
    cards: ['Nuclear Power', 'Geothermal Power', 'GHG Factories', 'Mohole Area', 'Insulation'],
    expect: 'Energy→heat residual + heat prod + Insulation MC converter = triple chain compound'
  },
  {
    name: 'Greens Ruling + Plant Prod',
    cards: ['Farming', 'Trees', 'Kelp Farming', 'Grass', 'Open City'],
    expect: 'Greens policy +4 MC/greenery: plant prod cards compound, Open City gets city bonus',
    rulingParty: 'Greens'
  },
  {
    name: 'Mars First Ruling + Building',
    cards: ['Mining Operations', 'Open City', 'Underground City', 'Robotic Workforce', 'Asteroid'],
    expect: 'Mars First policy -2 MC/building: building cards get stacked discount bonus',
    rulingParty: 'Mars First'
  },
  {
    name: 'Event Benefit Compound',
    cards: ['Media Group', 'Asteroid', 'Comet', 'Deimos Down', 'Virus'],
    expect: 'Media Group +3 MC per event, 4 events in hand = compound; events get benefiter bonus'
  },
  {
    name: 'Terraform Spread',
    cards: ['Asteroid', 'Aquifer Pumping', 'Mangrove', 'Giant Solar Shade', 'Aerosport Tournament'],
    expect: 'Asteroid(tmp), Aquifer(oc), Mangrove(o2), Giant Solar Shade(vn) = 4 params covered'
  },
  {
    name: 'Scientists Ruling + Science',
    cards: ['Research', 'Mars University', 'Physics Complex', 'AI Central', 'Lightning Harvest'],
    expect: 'Scientists policy: each science card draws a card (+3-4 MC), science compound amplified',
    rulingParty: 'Scientists'
  },
  {
    name: 'Unity Ruling + Space',
    cards: ['Io Mining Industries', 'Titan Shuttles', 'Space Station', 'Mining Colony', 'Asteroid'],
    expect: 'Unity policy: +2 MC per space tag, space cards compound discount',
    rulingParty: 'Unity'
  },
  {
    name: 'Conversion Flexibility',
    cards: ['Nuclear Power', 'Geothermal Power', 'Steelworks', 'Water Splitting Plant', 'Caretaker Contract'],
    expect: 'Energy prod + 3 different converters (steel, ocean, TR) = adaptive engine'
  },
  {
    name: 'Affordability Tension',
    cards: ['Deimos Down', 'Giant Ice Asteroid', 'Giant Solar Shade', 'AI Central', 'Capital'],
    expect: '5 cards costing 20+ MC = MC crunch penalty, cant play them all'
  },
  {
    name: 'Wild Tag in Science Hand',
    cards: ['Research Coordination', 'Research', 'Mars University', 'AI Central', 'Physics Complex'],
    expect: 'Research Coordination wild tag → counts as science for stacking, AI Central req satisfied by wild'
  },
  {
    name: 'Multi-Param Cards',
    cards: ['Comet', 'Giant Ice Asteroid', 'Towing A Comet', 'Asteroid', 'Ice Asteroid'],
    expect: 'Comet(tmp+oc), GIA(tmp+oc), Towing(oc+o2) = multi-param bonus + terraform spread'
  },
  {
    name: 'Heat→Temp Pipeline',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Asteroid', 'Deimos Down'],
    expect: 'Heat prod 15 + temp raisers 4 = heat→temp compound, Asteroid/Deimos boosted by heat'
  },
  {
    name: 'Plant→O2 Pipeline',
    cards: ['Farming', 'Trees', 'Kelp Farming', 'Mangrove', 'Towing A Comet'],
    expect: 'Plant prod 9 + greenery/o2 cards = plant→o2 compound, Mangrove/Towing boosted by pp'
  },
  {
    name: 'Pure Heat Prod (no converters)',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Mining Operations', 'Open City'],
    expect: '15 heat prod with NO temp raisers and NO converters = heat goes to temp standard project'
  },
  {
    name: 'Action Stall Compound',
    cards: ['Electro Catapult', 'Water Splitting Plant', 'Nuclear Power', 'Caretaker Contract', 'Asteroid'],
    expect: '3 action cards (Catapult, WSP, Caretaker) = stall value bonus, each gets +0.9'
  },
  {
    name: 'MC Prod Self-Funding',
    cards: ['Sponsors', 'Business Empire', 'Deimos Down', 'Giant Ice Asteroid', 'AI Central'],
    expect: 'Sponsors+Business give 8 mp total, funds 3 expensive cards (Deimos 31, GIA 36, AI 36)'
  },
  {
    name: 'VP Sprint Late',
    cards: ['Birds', 'Fish', 'Livestock', 'Ecological Zone', 'Protected Habitats'],
    expect: '4 VP cards at gensLeft 2 = VP sprint bonus, late game points rush',
    gensLeft: 2
  },
  {
    name: 'Discount Amplifier',
    cards: ['Earth Office', 'Research Outpost', 'Luna Governor', 'Io Mining Industries', 'Space Station'],
    expect: 'Earth Office + Research Outpost + Space Station = 3 discounters compound, Luna Gov + Io Mining benefit'
  },
  {
    name: 'Resource Generator + VP Accumulator',
    cards: ['Symbiotic Fungus', 'Decomposers', 'Tardigrades', 'Ants', 'Extreme-Cold Fungus'],
    expect: 'Symbiotic Fungus generates microbes → Decomposers/Tardigrades/Ants/ECF accumulate VP from microbes'
  },
  {
    name: 'Trigger Chain Amplifier',
    cards: ['Mars University', 'Olympus Conference', 'Research', 'Physics Complex', 'Lightning Harvest'],
    expect: '2 trigger cards (MarsUni + OlympusConf) + 3 science feeders = compound card draw engine'
  },
  {
    name: 'Late Prod Dampened',
    cards: ['Mining Operations', 'Nuclear Power', 'GHG Factories', 'Farming', 'Acquired Company'],
    expect: 'All prod at gensLeft=2: bonus dampened by 30%, late damp shows in reasons',
    gensLeft: 2
  },
  {
    name: 'City Adjacency Cluster',
    cards: ['Open City', 'Capital', 'Immigrant City', 'Underground City', 'Rover Construction'],
    expect: '4 city cards = adjacency VP compound (up to 6 VP from mutual adjacency)'
  },
  {
    name: 'Sole Converter Keystone - Caretaker',
    cards: ['Caretaker Contract', 'GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power'],
    expect: 'Caretaker is SOLE heat converter with 15hp → keystone bonus on top of heat→TR'
  },
  {
    name: 'Two Converters - Not Keystone',
    cards: ['Caretaker Contract', 'Insulation', 'GHG Factories', 'Mohole Area', 'Soletta'],
    expect: 'Both Caretaker and Insulation compete for heat → no keystone bonus for either'
  },
  {
    name: 'Award Racing Thermalist',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power', 'Asteroid'],
    expect: 'Racing for Thermalist (distance 2) → heat prod cards get award bonus',
    awardRacing: { 'Thermalist': 2 }
  },
  {
    name: 'Award Racing Scientist',
    cards: ['Research', 'Mars University', 'Physics Complex', 'AI Central', 'Lightning Harvest'],
    expect: 'Racing for Scientist (distance 1) → science cards get big award bonus',
    awardRacing: { 'Scientist': 1 }
  },
  {
    name: 'Colony Fleet Density (5 colonies)',
    cards: ['Mining Colony', 'Trade Envoys', 'Rim Freighters', 'Research Colony', 'Productive Outpost'],
    expect: '5 colony cards → fleet density amplifies Trade Envoys/Rim Freighters beyond base colony compound'
  },
  {
    name: 'Chairman Lock (9 delegates)',
    cards: ['Cultural Metropolis', 'Sponsoring Nation', 'Event Analysts', 'PR Office', 'Recruitment'],
    expect: '9 delegates = chairman lock premium on top of base delegate compound'
  },
  {
    name: 'Terraform Spread 4 Params',
    cards: ['Asteroid', 'Aquifer Pumping', 'Mangrove', 'Giant Solar Shade', 'Comet'],
    expect: 'tmp+oc+o2+vn = 4 params, Comet covers tmp+oc = multi-param extra bonus'
  },
  {
    name: 'Cheap Tempo Burst (6 cheap)',
    cards: ['Virus', 'Red Ships', 'Energy Tapping', 'Rego Plastics', 'Colonizer Training Camp', 'Diversity Support'],
    expect: '6 cards all ≤14 MC, tempo burst bonus +3.2 each'
  },
  {
    name: 'Multi-Param Intrinsic (2-param cards)',
    cards: ['Comet', 'Giant Ice Asteroid', 'Asteroid', 'Ice Asteroid', 'Towing A Comet'],
    expect: 'Comet(tmp+oc) and GIA(tmp+oc) get intrinsic 2-param bonus even without 3+ param spread'
  },
  {
    name: 'Tag Diversity (8 unique tags)',
    cards: ['Olympus Conference', 'Birds', 'Dirigibles', 'Mining Colony', 'Nuclear Power'],
    expect: 'building+science+earth+animal+venus+space+power = 7+ unique tags → Diversifier proximity'
  },
  {
    name: 'VP Accumulator Window',
    cards: ['Birds', 'Fish', 'Predators', 'Livestock', 'Ecological Zone'],
    expect: '5 vpAcc animal cards at gen 5 = accumulation engine compound',
    gensLeft: 5
  },
  {
    name: 'MC Prod Funder (high mp)',
    cards: ['Business Empire', 'Sponsors', 'Deimos Down', 'Giant Ice Asteroid', 'AI Central'],
    expect: 'Business Empire (6mp) + Sponsors (2mp) fund 3 expensive cards, Business Empire gets high-mp bonus'
  },
  {
    name: 'Energy Full Chain (ep→heat→MC)',
    cards: ['Nuclear Power', 'Geothermal Power', 'GHG Factories', 'Mohole Area', 'Insulation'],
    expect: 'NP+GP energy→heat (no consumer) + 8hp + Insulation converter = ep feeds heat chain'
  },
  {
    name: 'Tag Dense Hand (12+ tags)',
    cards: ['Olympus Conference', 'Stratopolis', 'Atmoscoop', 'Luna Governor', 'Colonizer Training Camp'],
    expect: 'OC(bld+earth+sci), Strato(city+venus), Atmo(jovian+space), Luna(earth×2), CT(bld+jov) = 12 tags, density bonus'
  },
  {
    name: 'Early Prod Rush (gen 1)',
    cards: ['Mining Operations', 'Nuclear Power', 'Farming', 'GHG Factories', 'Acquired Company'],
    expect: '5 prod cards at gensLeft=8 = early prod amplifier + prod cohesion',
    gensLeft: 8
  },
  {
    name: 'Stall + VP Accum Compound',
    cards: ['Birds', 'Fish', 'Predators', 'Ecological Zone', 'Symbiotic Fungus'],
    expect: 'vpAcc action cards + stall value = stall+VP compound while delaying round end',
    gensLeft: 6
  },
  {
    name: 'MC Crunch + Steel Relief',
    cards: ['Strip Mine', 'Open City', 'Capital', 'Domed Crater', 'Mohole Area'],
    expect: 'Strip Mine (sp:2+tp:1) + 4 other bld cards c>=20 = crunch relief for buildings'
  },
  {
    name: 'Venus Strategy Dense (5 venus tags)',
    cards: ['Dirigibles', 'Stratopolis', 'Aerial Mappers', 'Spin-Inducing Asteroid', 'Extractor Balloons'],
    expect: '5 venus tags + 2 venus raisers (Spin-Ind+Extractor) = venus strategy compound'
  },
  {
    name: 'Floater Placement Amplifier',
    cards: ['Floater Technology', 'Floating Habs', 'Local Shading', 'Extractor Balloons', 'Dirigibles'],
    expect: 'Floater Tech places:floater + 4 res:floater cards = placement cross-amplifier keystone'
  },
  {
    name: 'Action Revenue Diversity',
    cards: ['Dirigibles', 'Extractor Balloons', 'Aerial Mappers', 'Birds', 'Search For Life'],
    expect: 'actMC(Dirig) + actTR(Extractor+SFL) + actCD(Aerial) + vpAcc(Birds) = 4+ revenue types'
  }
];

var ctx = { gensLeft: 5 };

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          HAND SYNERGY TEST — scoreHandSynergy              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (var h = 0; h < testHands.length; h++) {
  var hand = testHands[h];
  console.log('━━━ ' + hand.name + ' ━━━');
  console.log('Cards: ' + hand.cards.join(', '));
  console.log('Expected: ' + hand.expect);
  console.log('');

  var handCtx = { gensLeft: hand.gensLeft || ctx.gensLeft };
  if (hand.corps) handCtx._myCorps = hand.corps;
  if (hand.milestoneNeeds) handCtx.milestoneNeeds = hand.milestoneNeeds;
  if (hand.awardRacing) handCtx.awardRacing = hand.awardRacing;
  if (hand.awardTags) handCtx.awardTags = hand.awardTags;
  if (hand.rulingParty) handCtx.rulingParty = hand.rulingParty;
  if (hand.dominantParty) handCtx.dominantParty = hand.dominantParty;
  if (hand.oppCorps) handCtx.oppCorps = hand.oppCorps;
  if (hand.oppHasAnimalAttack) handCtx.oppHasAnimalAttack = true;
  if (hand.oppHasPlantAttack) handCtx.oppHasPlantAttack = true;

  var results = [];
  for (var c = 0; c < hand.cards.length; c++) {
    var card = hand.cards[c];
    var result = scoreHandSynergy(card, hand.cards, handCtx);
    results.push({ name: card, bonus: result.bonus, reasons: result.reasons });
  }

  // Sort by bonus descending
  results.sort(function(a, b) { return b.bonus - a.bonus; });

  for (var r = 0; r < results.length; r++) {
    var res = results[r];
    var bonusStr = (res.bonus >= 0 ? '+' : '') + res.bonus;
    var reasonStr = res.reasons.length > 0 ? res.reasons[0] : '(no synergy)';
    var tags = getCardTagsLocal(res.name).join(',');
    console.log('  ' + bonusStr.padStart(6) + '  ' + res.name + ' [' + tags + ']');
    console.log('         ' + reasonStr);
  }
  console.log('');
}
