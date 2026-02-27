#!/usr/bin/env node
/**
 * fix-feeder-synergies.js — Add missing feeder synergies to microbe/animal targets
 *
 * Microbe targets need: Symbiotic Fungus, Decomposers (tag synergy)
 * Animal targets need: Large Convoy, Imported Nitrogen, Imported Hydrogen
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RATINGS_PATH = path.join(ROOT, 'extension/data/ratings.json.js');

const raw = fs.readFileSync(RATINGS_PATH, 'utf8');
const fn = new Function(raw.replace(/^const /, 'var ') + '\nreturn TM_RATINGS;');
const R = fn();

let changes = 0;

function addSynergy(cardName, synergyName, score) {
  if (!R[cardName]) { console.log('  [!] ' + cardName + ' not found'); return; }
  if (!R[cardName].y) { R[cardName].y = []; }
  const syns = R[cardName].y;
  // Check if already exists
  for (let i = 0; i < syns.length; i++) {
    if (syns[i][0] === synergyName) return; // already has it
  }
  syns.push([synergyName, score]);
  changes++;
  console.log('  + ' + cardName + ' <- ' + synergyName + ' (' + score + ')');
}

// =============================================
// MICROBE TARGETS: add Symbiotic Fungus & Decomposers
// Symbiotic Fungus: "Action: Add a microbe to ANOTHER card" = direct feeder
// Decomposers: microbe tag synergy (playing microbe cards triggers Decomposers)
// =============================================
console.log('\n== Microbe targets: adding feeders ==');

// Cards that accumulate microbes and benefit from Symbiotic Fungus feeding them
addSynergy('Regolith Eaters', 'Symbiotic Fungus', 3);
addSynergy('Regolith Eaters', 'Decomposers', 2);

addSynergy('Tardigrades', 'Symbiotic Fungus', 3);
addSynergy('Tardigrades', 'Decomposers', 2);

addSynergy('GHG Producing Bacteria', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Extreme-Cold Fungus', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Nitrite Reducing Bacteria', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Thermophiles', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Sulphur-Eating Bacteria', 'Symbiotic Fungus', 2);
// already has Decomposers

addSynergy('Psychrophiles', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Anthozoa', 'Symbiotic Fungus', 3);
// already has Decomposers

addSynergy('Penguins', 'Symbiotic Fungus', 2);
addSynergy('Penguins', 'Decomposers', 2);

// Decomposers itself benefits from microbe-tag cards being played
addSynergy('Decomposers', 'Symbiotic Fungus', 3);
addSynergy('Decomposers', 'Ants', 3);

// Symbiotic Fungus benefits from having microbe targets
addSynergy('Symbiotic Fungus', 'Regolith Eaters', 2);
addSynergy('Symbiotic Fungus', 'GHG Producing Bacteria', 2);
addSynergy('Symbiotic Fungus', 'Psychrophiles', 2);
addSynergy('Symbiotic Fungus', 'Nitrite Reducing Bacteria', 2);

// Ants: feeds on OTHER microbe cards (removes from them) - anti-synergy for targets
// But Ants is already listed as synergy for some microbe cards

// =============================================
// ANIMAL TARGETS: add Large Convoy, Imported Nitrogen, Imported Hydrogen
// These cards place animals directly onto animal-accumulating cards
// =============================================
console.log('\n== Animal targets: adding feeders ==');

// Fish: 1 VP/animal, action: add animal
addSynergy('Fish', 'Large Convoy', 4);
addSynergy('Fish', 'Imported Nitrogen', 3);
addSynergy('Fish', 'Imported Hydrogen', 3);

// Predators: 1 VP/animal, action: remove animal from other
addSynergy('Predators', 'Large Convoy', 4);
addSynergy('Predators', 'Imported Nitrogen', 3);
addSynergy('Predators', 'Imported Hydrogen', 3);

// Birds: 1 VP/animal, action: add animal
addSynergy('Birds', 'Large Convoy', 4);
addSynergy('Birds', 'Imported Nitrogen', 3);
addSynergy('Birds', 'Imported Hydrogen', 3);

// Livestock: 1 VP/animal, action: add animal
addSynergy('Livestock', 'Large Convoy', 4);
addSynergy('Livestock', 'Imported Nitrogen', 3);
addSynergy('Livestock', 'Imported Hydrogen', 3);

// Ecological Zone: VP per animal, gains from greenery placement
addSynergy('Ecological Zone', 'Large Convoy', 3);
addSynergy('Ecological Zone', 'Imported Nitrogen', 3);

// Small Animals: 1 VP/2 animals, action: add animal
addSynergy('Small Animals', 'Large Convoy', 3);
addSynergy('Small Animals', 'Imported Nitrogen', 2);

// Pets: gains animal per city, but still benefits from placement
addSynergy('Pets', 'Large Convoy', 2);

// Venusian Animals: VP per animal, action: add per science
addSynergy('Venusian Animals', 'Large Convoy', 3);

// Stratospheric Birds: VP per animal, action: add/remove floater for animal
addSynergy('Stratospheric Birds', 'Large Convoy', 2);

// Wildlife Dome: VP per animal
addSynergy('Wildlife Dome', 'Large Convoy', 3);
addSynergy('Wildlife Dome', 'Imported Nitrogen', 2);

// Martian Zoo: VP per animal, gains per Earth tag
addSynergy('Martian Zoo', 'Large Convoy', 3);

// =============================================
// ANIMAL FEEDERS: add reverse synergies (targets they feed)
// Large Convoy already has Fish, Predators, Birds, Arklight
// Imported Nitrogen already has Fish, Predators, Decomposers, Advanced Ecosystems
// Imported Hydrogen already has Fish, Predators, Decomposers
// Add missing reverse links
// =============================================
console.log('\n== Animal feeders: adding target references ==');

addSynergy('Large Convoy', 'Livestock', 3);
addSynergy('Large Convoy', 'Ecological Zone', 3);
addSynergy('Large Convoy', 'Small Animals', 2);

addSynergy('Imported Nitrogen', 'Livestock', 2);
addSynergy('Imported Nitrogen', 'Birds', 2);
addSynergy('Imported Nitrogen', 'Ecological Zone', 2);

addSynergy('Imported Hydrogen', 'Livestock', 2);
addSynergy('Imported Hydrogen', 'Birds', 2);

// =============================================
// PROTECTED HABITATS: add animal targets it protects
// Already has Fish +4, Predators -3, Ants -3
// Should also protect other animal/plant/microbe resources
// =============================================
console.log('\n== Protected Habitats: animal targets ==');
addSynergy('Protected Habitats', 'Birds', 3);
addSynergy('Protected Habitats', 'Livestock', 3);
addSynergy('Protected Habitats', 'Decomposers', 3);

// =============================================
// Save
// =============================================
const header = raw.match(/^.*?=\s*/)?.[0] || 'const TM_RATINGS = ';

let lines = [header.trimEnd() + '{'];
const entries = Object.entries(R);
entries.forEach(function(kv, idx) {
  const comma = idx < entries.length - 1 ? ',' : '';
  lines.push(JSON.stringify(kv[0]) + ':' + JSON.stringify(kv[1]) + comma);
});
lines.push('};');
const newContent = lines.join('\n') + '\n';
fs.writeFileSync(RATINGS_PATH, newContent);

console.log('\nDone! ' + changes + ' synergies added.');
