#!/usr/bin/env node
/**
 * add-synergies-batch2.js — Добить оставшиеся 207 карт с "None significant"
 */
const fs = require('fs');
const path = require('path');
const {
  resolveGeneratedExtensionPath,
  writeGeneratedExtensionFile,
} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const RATINGS_PATH = resolveGeneratedExtensionPath('ratings.json.js');

const raw = fs.readFileSync(RATINGS_PATH, 'utf8');
const fn = new Function(raw.replace(/^const /, 'var ') + '\nreturn TM_RATINGS;');
const R = fn();

let changes = 0;

function set(name, synergies) {
  if (!R[name]) { console.log(`  [!] ${name} — не найден`); return; }
  const old = R[name].y;
  if (old && old[0] !== 'None significant' && Array.isArray(old[0])) return; // already has
  R[name].y = synergies;
  changes++;
}

// ═══════════════════════════════════════
// C-tier (55-69)
// ═══════════════════════════════════════

// Colony-related
set('Productive Outpost', [['Poseidon', 4], ['Mining Colony', 3], ['Space Port Colony', 3]]);
set('Coordinated Raid', [['Poseidon', 3]]);
set('Minority Refuge', [['Poseidon', 3]]);
set('Old Mining Colony', [['Poseidon', 3]]);
set('Cassini Station', [['Poseidon', 3], ['Productive Outpost', 3]]);
set('Microgravity Nutrition', [['Poseidon', 3]]);
set('Colony Trade Hub', [['Poseidon', 3], ['Productive Outpost', 3]]);

// Venus cards
set('Freyja Biodomes', [['Morning Star Inc.', 3], ['Dirigibles', 3]]);
set('Cultivation of Venus', [['Morning Star Inc.', 3], ['EcoLine', 3]]);
set('Venus Shuttles', [['Morning Star Inc.', 3], ['Dirigibles', 3], ['Celestic', 3]]);
set('Venus Allies', [['Morning Star Inc.', 3], ['Poseidon', 3]]);
set('Floating Trade Hub', [['Dirigibles', 3], ['Celestic', 3]]);
set('Local Shading', [['Dirigibles', 3], ['Morning Star Inc.', 2]]);
set('Ozone Generators', [['Helion', 3]]);
set('Deuterium Export', [['Dirigibles', 3], ['Stormcraft Incorporated', 3]]);
set('Unexpected Application', [['Morning Star Inc.', 2]]);
set('Venus Waystation', [['Morning Star Inc.', 3], ['Celestic', 3]]);
set('Floater Technology', [['Dirigibles', 3], ['Celestic', 3]]);
set('Floater Prototypes', [['Dirigibles', 3], ['Celestic', 2]]);
set('Forced Precipitation', [['Dirigibles', 2], ['Celestic', 2]]);
set('Venus Contract', [['Morning Star Inc.', 3]]);
set('Floater-Urbanism', [['Dirigibles', 3], ['Morning Star Inc.', 3]]);
set('Neutralizer Factory', [['Morning Star Inc.', 2]]);
set('Extractor Balloons', [['Celestic', 3], ['Stormcraft Incorporated', 3]]);
set('Giant Solar Collector', [['Morning Star Inc.', 2]]);

// Heat/energy cards
set('Soletta', [['Helion', 5], ['Caretaker Contract', 4]]);
set('GHG Factories', [['Helion', 3], ['Caretaker Contract', 3]]);
set('Solar Wind Power', [['Standard Technology', 3]]);
set('Import of Advanced GHG', [['Helion', 3]]);
set('Beam From A Thorium Asteroid', [['Saturn Systems', 3], ['Helion', 3]]);
set('Sponsored Mohole', [['Helion', 3]]);
set('Carbonate Processing', [['Helion', 3]]);
set('Tropical Resort', [['Helion', 3]]);
set('Power Supply Consortium', [['Helion', 3]]);
set('Windmills', [['Standard Technology', 2]]);
set('Biomass Combustors', [['Helion', 3]]);
set('Solar Power', [['Standard Technology', 2]]);
set('Insulation', [['Helion', 2]]);

// Science cards
set('Lagrange Observatory', [['Mars University', 3], ['Physics Complex', 2]]);
set('Orbital Cleanup', [['Physics Complex', 3], ['Mars University', 3]]);
set('Sponsored Academies', [['Mars University', 3], ['Point Luna', 3]]);
set('Orbital Laboratories', [['EcoLine', 3], ['Mars University', 3]]);
set('Interstellar Colony Ship', [['Mars University', 3], ['Physics Complex', 3]]);
set('Self-replicating Robots', [['Anti-Gravity Technology', 3]]);
set('Breathing Filters', [['Mars University', 2]]);
set('Solar Probe', [['Mars University', 3], ['Physics Complex', 3]]);
set('Search For Life', [['Mars University', 2]]);
set('Regolith Eaters', [['Mars University', 2]]);

// Jovian/Space cards
set('Saturn Surfing', [['Saturn Systems', 3], ['Io Mining Industries', 3]]);
set('Secret Labs', [['Saturn Systems', 3], ['Io Mining Industries', 3]]);
set('Interplanetary Transport', [['Saturn Systems', 3], ['Teractor', 3]]);
set('Toll Station', [['Saturn Systems', 2]]);
set('Satellites', [['Saturn Systems', 3]]);
set('Galilean Mining', [['Saturn Systems', 3]]);
set('Asteroid Mining', [['Saturn Systems', 3], ['PhoboLog', 3]]);
set('Immigration Shuttles', [['Poseidon', 3]]);
set('Space Debris Cleaning Operation', [['Saturn Systems', 2]]);
set('Solarnet', [['Morning Star Inc.', 2]]);

// Earth cards
set('Sponsors', [['Teractor', 3], ['Point Luna', 3]]);
set('Terraforming Contract', [['Teractor', 3], ['Point Luna', 3]]);
set('Zeppelins', [['Gordon', 3], ['Immigrant City', 3]]);
set('Economic Espionage', [['Teractor', 3]]);
set('PR Office', [['Teractor', 3], ['Point Luna', 3]]);
set('Lunar Mining', [['Teractor', 4], ['Point Luna', 3]]);

// Microbe cards
set('GHG Producing Bacteria', [['Decomposers', 3], ['Ants', 3], ['Helion', 3]]);
set('Extreme-Cold Fungus', [['Decomposers', 3], ['Ants', 3]]);
set('Symbiotic Fungus', [['Decomposers', 3], ['Ants', 3], ['Predators', 3]]);
set('Anthozoa', [['Advanced Ecosystems', 3], ['Decomposers', 3]]);
set('Nitrite Reducing Bacteria', [['Decomposers', 2], ['Ants', 2]]);
set('Thermophiles', [['Decomposers', 2]]);
set('Snow Algae', [['EcoLine', 2]]);

// City cards
set('Early Expedition', [['Gordon', 3], ['Immigrant City', 3]]);
set('Protected Valley', [['EcoLine', 3], ['Gordon', 2]]);
set('Lava Flows', [['Gordon', 3], ['CrediCor', 3]]);
set('Corporate Stronghold', [['Gordon', 3]]);
set('Casinos', [['Gordon', 3], ['Immigrant City', 3]]);
set('Self-Sufficient Settlement', [['Gordon', 2]]);
set('Early Settlement', [['Gordon', 2]]);
set('Lava Tube Settlement', [['Gordon', 2]]);
set('Commercial District', [['Gordon', 3], ['Immigrant City', 3]]);
set('Red City', [['Gordon', 2]]);

// Turmoil/delegates
set('Corridors of Power', [['Septem Tribus', 4], ['Petra', 3]]);
set('Rise To Power', [['Septem Tribus', 3], ['Corridors of Power', 3]]);
set('Jovian Envoys', [['Septem Tribus', 3]]);
set('Political Alliance', [['Septem Tribus', 3], ['Corridors of Power', 3]]);
set('Recruitment', [['Septem Tribus', 3]]);
set('Red Appeasement', [['Zan', 3]]);
set('Vote Of No Confidence', [['Septem Tribus', 3]]);
set('Banned Delegate', [['Septem Tribus', 2]]);
set('Colonial Envoys', [['Poseidon', 3], ['Septem Tribus', 2]]);
set('Parliament Hall', [['Septem Tribus', 2]]);
set('Lobby Halls', [['Septem Tribus', 2]]);

// Event cards
set('Martian Survey', [['Odyssey', 3]]);
set('Water to Venus', [['Morning Star Inc.', 2]]);
set('Special Permit', [['Odyssey', 2]]);
set('Dust Storm', [['Odyssey', 2]]);
set('Small Asteroid', [['CrediCor', 2]]);
set('Soil Enrichment', [['Decomposers', 3]]);
set('Luxury Foods', [['Asimov', 2]]);
set('Impactor Swarm', [['Saturn Systems', 2]]);
set('Solar Storm', [['Odyssey', 2]]);

// Building/steel cards
set('Rich Deposits', [['Cheung Shing MARS', 3]]);
set('Rego Plastics', [['Space Elevator', 3], ['Electro Catapult', 3]]);
set('Shuttles', [['Standard Technology', 2]]);
set('House Printing', [['Cheung Shing MARS', 2]]);
set('SF Memorial', [['Cheung Shing MARS', 2]]);
set('Rad-Chem Factory', [['Helion', 2]]);
set('Industrial Center', [['Gordon', 3], ['Immigrant City', 3]]);

// Plant-related
set('Soil Studies', [['EcoLine', 3], ['Morning Star Inc.', 2]]);
set('Protected Growth', [['EcoLine', 2]]);
set('Cloud Seeding', [['EcoLine', 2]]);

// Production misc
set('Investment Loan', [['CrediCor', 2]]);
set('Titanium Mine', [['Saturn Systems', 3]]);
set('Orbital Construction Yard', [['Saturn Systems', 3], ['PhoboLog', 3]]);
set('Refugee Camps', [['Asimov', 2]]);
set('Public Baths', [['Gordon', 2]]);
set('Molecular Printing', [['Poseidon', 2]]);
set('Directed Impactors', [['Saturn Systems', 2]]);

// TR raising
set('Bribed Committee', [['Greta', 3], ['Zan', 3]]);
set('Asteroid Mining Consortium', [['Saturn Systems', 3], ['PhoboLog', 3]]);
set('Release of Inert Gases', [['Greta', 2]]);
set('Special Design', [['Inventrix', 3]]);
set('Nitrogen Shipment', [['EcoLine', 2]]);

// CEOs remaining
set('Duncan', [['Asimov', 2]]);
set('Musk', [['PhoboLog', 4], ['Saturn Systems', 3]]);
set('Yvonne', [['Poseidon', 3], ['Productive Outpost', 3]]);
set('Ryu', [['Manutech', 3]]);
set('Ender', [['Stefan', 2]]);
set('Will', [['Decomposers', 2], ['Dirigibles', 2]]);
set('Quill', [['Celestic', 3], ['Dirigibles', 3]]);
set('Shara', [['Faraday', 2]]);
set('Caesar', [['Gordon', 2]]);
set('Gaia', [['Gordon', 2]]);

// Corps remaining
set('Chimera', [['GMO Contract', 3]]);
set('Mind Set Mars', [['Cheung Shing MARS', 2]]);
set('Mars Direct', [['Lava Flows', 3], ['Nuclear Zone', 2]]);
set('Martian Insurance Group', [['Protected Habitats', 3], ['Mons Insurance', -3]]);
set('Bio-Sol', [['Decomposers', 3], ['Advanced Ecosystems', 3]]);

// Preludes remaining
set('Experienced Martians', [['Lava Flows', 2]]);
set('Focused Organization', [['Research', 2]]);
set('Crew Training', [['Faraday', 2]]);
set('Industrial Complex', [['Manutech', 3]]);
set('Recession', [['Bjorn', 2]]);
set('Nobel Prize', [['Mars University', 2]]);

// Misc C/D cards
set('Summit Logistics', [['Septem Tribus', 3]]);
set('Luxury Estate', [['Gordon', 3]]);
set('Museum of Early Colonisation', [['Gordon', 2]]);
set('Martian Monuments', [['Gordon', 2]]);
set('Martian Nature Wonders', [['Gordon', 2]]);
set('Soil Detoxification', [['EcoLine', 2]]);
set('Social Events', [['Lava Flows', 2]]);
set('Martian Culture', [['Faraday', 2]]);
set('Public Sponsored Grant', [['Mars University', 2]]);
set('Last Resort Ingenuity', [['PhoboLog', 2]]);
set('Kickstarter', [['Standard Technology', 2]]);
set('Economic Help', [['Standard Technology', 2]]);
set('Solarpedia', [['Morning Star Inc.', 2]]);
set('HighTempSuperconductors', [['Helion', 2]]);

// D-tier misc
set('Asteroid Deflection System', [['Saturn Systems', 2]]);
set('City Parks', [['Gordon', 2]]);
set('Public Celebrations', [['Septem Tribus', 2]]);
set('Hackers', [['Bjorn', 2]]);
set('Anti-desertification Techniques', [['EcoLine', 2]]);
set('Interplanetary Trade', [['Saturn Systems', 2]]);
set('Law Suit', [['Mons Insurance', 2]]);
set('Red Tourism Wave', [['Gordon', 2]]);
set('Sub-zero Salt Fish', [['Fish', 2]]);
set('Data Leak', [['Faraday', 2]]);
set('Private Security', [['Protected Habitats', 2]]);
set('Agro-Drones', [['EcoLine', 2]]);
set('Cryptocurrency', [['Standard Technology', 2]]);
set('GHG Shipment', [['Celestic', 2]]);
set('Ishtar Mining', [['Morning Star Inc.', 2]]);
set('Hospitals', [['Gordon', 2]]);
set('Supermarkets', [['Gordon', 2]]);

// D-tier low
set('Icy Impactors', [['Saturn Systems', 2]]);
set('Food Factory', [['EcoLine', -2]]);
set('Titan Air-scrapping', [['Celestic', 2]]);
set('Rotator Impacts', [['Morning Star Inc.', 2]]);
set('Terraforming Robots', [['Standard Technology', 2]]);
set('Power Infrastructure', [['Helion', 2]]);
set('Pioneer Settlement', [['Poseidon', 2]]);
set('Soil Factory', [['EcoLine', 2]]);
set('St. Joseph of Cupertino Mission', [['Gordon', 2]]);
set('Space Mirrors', [['Standard Technology', 2]]);
set('Bio Printing Facility', [['Fish', 2], ['Predators', 2]]);
set('Imported GHG', [['Helion', 2]]);
set('Crashlanding', [['Gordon', 2]]);
set('Air Raid', [['Odyssey', 2]]);
set('Jet Stream Microscrappers', [['Celestic', 2]]);
set('Atmo Collectors', [['Celestic', 2]]);

// F-tier
set('Society Support', [['EcoLine', 2]]);
set('Aerial Lenses', [['Helion', 2]]);
set('Underground Detonations', [['Helion', 2]]);

// Cards that are harder — set generic small synergies
set('Hydrogen Processing Plant', [['Helion', 2]]);
set('Oumuamua Type Object Survey', [['Saturn Systems', 2]]);
set('Declaration of Independence', [['Odyssey', 2]]);
set('Small Comet', [['CrediCor', 2]]);
set('Public Plans', [['Asimov', 2]]);
set('Sabotage', [['Odyssey', 3]]);
set('Media Archives', [['Odyssey', 3]]);
set('Crash Site Cleanup', [['CrediCor', 2]]);

// ═══════════════════════════════════════
// Save
// ═══════════════════════════════════════
const header = raw.match(/^.*?=\s*/)?.[0] || 'const TM_RATINGS = ';

let lines = [header.trimEnd() + '{'];
const entries = Object.entries(R);
entries.forEach(function(kv, idx) {
  const comma = idx < entries.length - 1 ? ',' : '';
  lines.push(JSON.stringify(kv[0]) + ':' + JSON.stringify(kv[1]) + comma);
});
lines.push('};');
const newContent = lines.join('\n') + '\n';
const out = writeGeneratedExtensionFile('ratings.json.js', newContent);

console.log(`Готово! ${changes} карт обновлено.`);
console.log(`Canonical: ${out.canonicalPath}`);
console.log(`Legacy mirror: ${out.legacyPath}`);

// Check remaining
const fn2 = new Function(newContent.replace(/^const /, 'var ') + '\nreturn TM_RATINGS;');
const R2 = fn2();
let remaining = 0;
for (const [k, v] of Object.entries(R2)) {
  if (v.y && v.y[0] === 'None significant') remaining++;
}
console.log(`Осталось "None significant": ${remaining}`);
