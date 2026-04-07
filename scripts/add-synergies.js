#!/usr/bin/env node
/**
 * add-synergies.js — Массовое добавление синергий к картам/CEO
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

function setSynergies(name, synergies) {
  if (!R[name]) {
    console.log(`  [!] ${name} — не найден`);
    return;
  }
  const old = R[name].y;
  if (old && old[0] !== 'None significant' && Array.isArray(old[0])) {
    // Already has real synergies, skip
    return;
  }
  R[name].y = synergies;
  changes++;
  console.log(`  ✓ ${name} (${R[name].t}${R[name].s}): ${synergies.map(s => s[0]).join(', ')}`);
}

// ═══════════════════════════════════════
// CEOs
// ═══════════════════════════════════════
console.log('\n── CEOs ──');

setSynergies('Greta', [['Nitrogen-Rich Asteroid', 4], ['Terraforming Ganymede', 4], ['Bribed Committee', 3], ['Giant Ice Asteroid', 3]]);
setSynergies('Asimov', [['Business Empire', 3], ['Rim Freighters', 3], ['Productive Outpost', 3]]);
setSynergies('Zan', [['Nitrogen-Rich Asteroid', 4], ['Terraforming Ganymede', 3], ['Bribed Committee', 3], ['Asteroid', 3]]);
setSynergies('Gordon', [['Immigrant City', 4], ['Lava Flows', 3], ['Capital', 3], ['Urbanized Area', 3], ['Industrial Center', 3]]);
setSynergies('Huan', [['Productive Outpost', 4], ['Mining Colony', 3], ['Research Colony', 3], ['Poseidon', 3]]);
setSynergies('Karen', [['Merger', 3], ['Double Down', 3]]);
setSynergies('Stefan', [['Point Luna', 4], ['Research', 3], ['Development Center', 3], ['Spin-off Department', 3]]);
setSynergies('Xavier', [['GMO Contract', 3], ['Diversifier', 2]]);
setSynergies('Faraday', [['Point Luna', 3], ['Interplanetary Cinematics', 3], ['Teractor', 3]]);
setSynergies('Floyd', [['Giant Ice Asteroid', 4], ['Terraforming Ganymede', 4], ['Large Convoy', 3], ['Nitrogen-Rich Asteroid', 3]]);
setSynergies('Ingrid', [['Lava Flows', 3], ['Nuclear Zone', 3], ['Immigrant City', 3], ['Capital', 3]]);
setSynergies('Clarke', [['Nitrophilic Moss', 3], ['Farming', 3], ['Kelp Farming', 3], ['EcoLine', 3]]);
setSynergies('Jansson', [['Lava Flows', 3], ['Nuclear Zone', 2]]);
setSynergies('Petra', [['Corridors of Power', 4], ['Cultural Metropolis', 3], ['GMO Contract', 3]]);
setSynergies('HAL9000', [['Caretaker Contract', 3], ['Space Elevator', 3], ['Electro Catapult', 3]]);
setSynergies('Tate', [['Point Luna', 3], ['Decomposers', 2]]);
setSynergies('Xu', [['Venus Governor', 4], ['Morning Star Inc.', 4], ['Stratospheric Birds', 3], ['Sulphur Exports', 3]]);
setSynergies('Bjorn', [['Hackers', 2]]);
setSynergies('Neil', [['Luna Trade Hub', 3]]);
setSynergies('Lowell', [['Merger', 2]]);
setSynergies('Apollo', [['Luna Trade Hub', 2]]);

// ═══════════════════════════════════════
// S-tier cards
// ═══════════════════════════════════════
console.log('\n── S-tier cards ──');

setSynergies('Space Port Colony', [['Productive Outpost', 3], ['Mining Colony', 3], ['Poseidon', 3]]);
setSynergies('Research Colony', [['AI Central', 3], ['Olympus Conference', 3], ['Poseidon', 3]]);
setSynergies('Van Allen', [['Zan', 4], ['Nitrogen-Rich Asteroid', 3], ['Terraforming Ganymede', 3]]);
setSynergies('Sky Docks', [['Productive Outpost', 3], ['Space Port Colony', 3], ['Poseidon', 3]]);
setSynergies('Project Eden', [['Philares', 3], ['Gordon', 3], ['Arctic Algae', 3]]);

// ═══════════════════════════════════════
// A-tier cards
// ═══════════════════════════════════════
console.log('\n── A-tier cards ──');

setSynergies('Earth Catapult', [['Teractor', 4], ['Point Luna', 3], ['Luna Governor', 3]]);
setSynergies('Solar Logistics', [['Point Luna', 4], ['Odyssey', 3], ['Io Mining Industries', 3]]);
setSynergies('Research Outpost', [['AI Central', 3], ['Development Center', 3]]);
setSynergies('Spin-off Department', [['Research', 3], ['AI Central', 3], ['Olympus Conference', 3]]);
setSynergies('Ringcom', [['Productive Outpost', 3], ['Mining Colony', 3]]);
setSynergies('Dyson Screens', [['Standard Technology', 3], ['Soletta', 3]]);
setSynergies('Protected Habitats', [['Fish', 4], ['Predators', -3], ['Ants', -3]]);
setSynergies('Huge Asteroid', [['Asteroid Mining Consortium', 3], ['CrediCor', 3]]);
setSynergies('UNMI Contractor', [['Bribed Committee', 3], ['Terraforming Ganymede', 3]]);
setSynergies('AI Central', [['Viron', 5], ['Research', 3], ['Development Center', 3]]);
setSynergies('Psychrophiles', [['Ants', 3], ['Decomposers', 3], ['GHG Producing Bacteria', 3]]);
setSynergies('Indentured Workers', [['Giant Ice Asteroid', 3], ['Large Convoy', 3]]);
setSynergies('Lunar Embassy', [['Miranda Resort', 3], ['Point Luna', 3]]);
setSynergies('Metal-Rich Asteroid', [['Strip Mine', 3], ['Space Elevator', 3]]);
setSynergies('Conscription', [['Large Convoy', 3], ['Giant Ice Asteroid', 3]]);
setSynergies('Imported Nitrogen', [['Fish', 3], ['Predators', 3], ['Decomposers', 3], ['Advanced Ecosystems', 3]]);
setSynergies('Research', [['AI Central', 3], ['Olympus Conference', 3], ['Mars University', 3]]);
setSynergies('Space Port', [['Productive Outpost', 3], ['Poseidon', 3], ['Mining Colony', 3]]);
setSynergies('Imported Hydrogen', [['Fish', 3], ['Predators', 3], ['Decomposers', 3]]);
setSynergies('SolBank', [['Productive Outpost', 3], ['Mining Colony', 3]]);
setSynergies('Hydrogen Bombardment', [['CrediCor', 3], ['Lakefront Resorts', 3]]);

// ═══════════════════════════════════════
// B-tier important cards with None significant
// ═══════════════════════════════════════
console.log('\n── B-tier important cards ──');

setSynergies('Business Empire', [['Asimov', 3]]);
setSynergies('Large Convoy', [['Fish', 4], ['Predators', 4], ['Birds', 3], ['Arklight', 4]]);
setSynergies('Mining Colony', [['Poseidon', 3], ['Productive Outpost', 3]]);
setSynergies('Nuclear Zone', [['CrediCor', 3], ['Gordon', 3]]);
setSynergies('Red Spot Observatory', [['Physics Complex', 3], ['Olympus Conference', 3]]);
setSynergies('Valuable Gases', [['Morning Star Inc.', 3], ['Dirigibles', 3]]);
setSynergies('Venera Base', [['Morning Star Inc.', 3], ['Dirigibles', 3]]);
setSynergies('Quantum Communications', [['Productive Outpost', 3], ['Poseidon', 3]]);
setSynergies('Red Ships', [['Standard Technology', 3]]);
setSynergies('GMO Contract', [['Splice', 3], ['Decomposers', 3], ['Advanced Ecosystems', 3]]);
setSynergies('Sulphur-Eating Bacteria', [['Decomposers', 3], ['Ants', 3], ['GHG Producing Bacteria', 3]]);
setSynergies('Open City', [['Immigrant City', 3], ['Gordon', 3]]);
setSynergies('Business Network', [['AI Central', 3]]);
setSynergies('Design Company', [['Cutting Edge Technology', 3], ['Anti-Gravity Technology', 3]]);
setSynergies('Corporate Archives', [['Research', 3], ['AI Central', 3]]);
setSynergies('Electro Catapult', [['Rego Plastics', 4], ['Advanced Alloys', 4], ['Space Elevator', 3]]);
setSynergies('Caretaker Contract', [['Helion', 5], ['Soletta', 4], ['GHG Factories', 3]]);
setSynergies('Ants', [['Decomposers', 3], ['Symbiotic Fungus', 3], ['Protected Habitats', -4]]);
setSynergies('Merger', [['Karen', 3], ['Double Down', 3]]);
setSynergies('Space Elevator', [['Advanced Alloys', 4], ['Rego Plastics', 3], ['Interplanetary Cinematics', 3]]);
setSynergies('Development Center', [['Stefan', 3], ['AI Central', 3]]);
setSynergies('Martian Rails', [['Immigrant City', 3], ['Gordon', 3]]);
setSynergies('Invention Contest', [['Mars University', 3]]);
setSynergies('Natural Preserve', [['Ecological Zone', 3]]);
setSynergies('Restricted Area', [['Development Center', 3]]);

setSynergies('Solar Reflectors', [['Helion', 4], ['Caretaker Contract', 4]]);

// ═══════════════════════════════════════
// Also fix some underrated cards based on meta-analysis context
// ═══════════════════════════════════════
console.log('\n── Misc fixes ──');

// Sabotage — add synergies
setSynergies('Sabotage', [['Odyssey', 3]]);
// Black Polar Dust — add synergies
setSynergies('Black Polar Dust', [['Helion', 3], ['Caretaker Contract', 3]]);

// ═══════════════════════════════════════
// Remaining B+ cards
// ═══════════════════════════════════════
console.log('\n── Remaining B+ cards ──');

// A-tier
setSynergies('Deimos Down:promo', [['CrediCor', 3], ['Asteroid Mining Consortium', 3]]);

// B-tier colony cards
setSynergies('Vital Colony', [['Poseidon', 3], ['Productive Outpost', 3]]);
setSynergies('Early Colonization', [['Poseidon', 3], ['Mining Colony', 3]]);
setSynergies('Interplanetary Colony Ship', [['Poseidon', 3], ['Productive Outpost', 3]]);
setSynergies('Huygens Observatory', [['Poseidon', 3], ['Titan Floating Launch-Pad', 3]]);

// B-tier corps/preludes
setSynergies('Habitat Marte', [['Lava Flows', 3], ['Nuclear Zone', 3]]);
setSynergies('Metals Company', [['Strip Mine', 3], ['Space Elevator', 3]]);
setSynergies('Double Down', [['Karen', 3], ['Project Eden', 4], ['Merger', 3]]);
setSynergies('Survey Mission', [['Gordon', 3], ['Philares', 3]]);
setSynergies('Terraforming Control Station', [['Greta', 3], ['Van Allen', 3]]);
setSynergies('Strategic Base Planning', [['Poseidon', 3], ['Gordon', 3]]);
setSynergies('Prefabrication of Human Habitats', [['Interplanetary Cinematics', 3], ['Cheung Shing MARS', 3]]);
setSynergies('Space Lanes', [['Poseidon', 3], ['Io Mining Industries', 3]]);
setSynergies('Co-leadership', [['Corridors of Power', 3], ['Septem Tribus', 3]]);
setSynergies('Personal Agenda', [['Odyssey', 3], ['Media Group', 3]]);
setSynergies('WG Project', [['Karen', 3]]);
setSynergies('New Partner', [['Karen', 3], ['Double Down', 3]]);
setSynergies('World Government Advisor', [['Greta', 3], ['Zan', 3]]);
setSynergies('Steelaris', [['Strip Mine', 3], ['Space Elevator', 3], ['Electro Catapult', 3]]);
setSynergies('The New Space Race', [['Earth Catapult', 3]]);

// B-tier Venus
setSynergies('Venus First', [['Morning Star Inc.', 4], ['Dirigibles', 3]]);
setSynergies('Atmoscoop', [['Morning Star Inc.', 3], ['Dirigibles', 3]]);
setSynergies('Stratospheric Expedition', [['Morning Star Inc.', 3], ['Celestic', 3]]);
setSynergies('Ishtar Expedition', [['Morning Star Inc.', 3], ['Celestic', 3]]);
setSynergies('Expedition to the Surface - Venus', [['Morning Star Inc.', 3], ['Dirigibles', 3]]);

// B-tier project cards
setSynergies('Martian Dust Processing Plant', [['Helion', 3], ['EcoLine', 3]]);
setSynergies('Field-Capped City', [['Gordon', 3], ['Immigrant City', 3]]);
setSynergies('Flat Mars Theory', [['Cheung Shing MARS', 3]]);
setSynergies('Frontier Town', [['Gordon', 3], ['Standard Technology', 3]]);
setSynergies('Specialized Settlement', [['Gordon', 3], ['Immigrant City', 3]]);
setSynergies('Terraforming Contract', [['Teractor', 3], ['Point Luna', 3]]);
setSynergies('Ceres Tech Market', [['Poseidon', 3], ['Research Colony', 3]]);
setSynergies('Carbon Nanosystems', [['Physics Complex', 3], ['Mars University', 3]]);
setSynergies('Event Analysts', [['Odyssey', 4], ['Media Group', 3]]);
setSynergies('Kaguya Tech', [['Research', 3]]);
setSynergies('Lunar Mining', [['Teractor', 4], ['Point Luna', 3]]);
setSynergies('Hermetic Order of Mars', [['Immigrant City', 3]]);
setSynergies('Colonial Representation', [['Corridors of Power', 3], ['Septem Tribus', 3]]);
setSynergies('Static Harvesting', [['Standard Technology', 3], ['Cheung Shing MARS', 3]]);
setSynergies('Pollinators', [['EcoLine', 3], ['Nitrophilic Moss', 3]]);
setSynergies('Gene Repair', [['Physics Complex', 3], ['Mars University', 3]]);
setSynergies('New Venice', [['Gordon', 3], ['Immigrant City', 3]]);
setSynergies('Business Contacts', [['Research', 3]]);
setSynergies('Martian Zoo', [['Teractor', 3], ['Point Luna', 3]]);
setSynergies('Rim Freighters', [['Poseidon', 3], ['Productive Outpost', 3]]);
setSynergies('Sister Planet Support', [['Teractor', 3], ['Morning Star Inc.', 3]]);
setSynergies('Technology Demonstration', [['Odyssey', 3], ['Mars University', 3]]);
setSynergies('Wildlife Dome', [['Ecological Zone', 3], ['Advanced Ecosystems', 3]]);
setSynergies('Small Open Pit Mine', [['Strip Mine', 3], ['Cheung Shing MARS', 3]]);
setSynergies('Supply Drop', [['Space Elevator', 3], ['Strip Mine', 3]]);

// ═══════════════════════════════════════
// Save
// ═══════════════════════════════════════
const header = raw.match(/^.*?=\s*/)?.[0] || 'const TM_RATINGS = ';

// Compact format: one entry per line
let lines = [header.trimEnd() + '{'];
const entries = Object.entries(R);
entries.forEach(function(kv, idx) {
  const comma = idx < entries.length - 1 ? ',' : '';
  lines.push(JSON.stringify(kv[0]) + ':' + JSON.stringify(kv[1]) + comma);
});
lines.push('};');
const newContent = lines.join('\n') + '\n';
const out = writeGeneratedExtensionFile('ratings.json.js', newContent);

console.log(`\nГотово! ${changes} карт обновлено.`);
console.log(`Всего записей: ${entries.length}`);
console.log(`Canonical: ${out.canonicalPath}`);
console.log(`Legacy mirror: ${out.legacyPath}`);
