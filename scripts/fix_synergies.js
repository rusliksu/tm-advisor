#!/usr/bin/env node
// Замена абстрактных синергий на конкретные имена карт/корпораций для scoring engine
const fs = require('fs');
const path = require('path');

const RATINGS_FILE = path.join(__dirname, '..', 'extension', 'data', 'ratings.json.js');
const PREFIX = 'const TM_RATINGS=';

let src = fs.readFileSync(RATINGS_FILE, 'utf8');
let json = src.slice(PREFIX.length).trim();
if (json.endsWith(';')) json = json.slice(0, -1);
const data = JSON.parse(json);

// Все синергии = точные имена из TM_RATINGS (проверены)
const fixes = {

  // ═══════════════════════════════ ПРЕЛЮДИИ ═══════════════════════════════

  'Great Aquifer': {
    y: ["Lakefront Resorts", "Arctic Algae", "Kelp Farming", "Aquifer Pumping", "Convoy From Europa"]
  },

  'Eccentric Sponsor': {
    y: ["Cutting Edge Technology", "Anti-Gravity Technology", "Earth Catapult", "PhoboLog"]
  },

  'Supply Drop': {
    y: ["PhoboLog", "Interplanetary Cinematics", "Advanced Alloys", "Mining Rights"]
  },

  'Huge Asteroid': {
    y: ["Helion", "Caretaker Contract", "GHG Factories", "Heat Trappers"]
  },

  'Power Generation': {
    y: ["Thorgate", "Fuel Factory", "Water Splitting Plant"]
  },

  'Ecology Experts': {
    y: ["EcoLine", "Farming", "Kelp Farming", "Nitrophilic Moss"]
  },

  'Early Settlement': {
    y: ["Tharsis Republic", "Immigrant City", "Open City"]
  },

  'Acquired Space Agency': {
    y: ["PhoboLog", "Saturn Systems", "Io Mining Industries", "Terraforming Ganymede"]
  },

  'Supplier': {
    y: ["Thorgate", "Fuel Factory", "Electro Catapult"]
  },

  // Mohole уже ок: ["Helion", "Robotic Workforce"]

  'Biofuels': {
    y: ["EcoLine", "Farming", "Nitrophilic Moss"]
  },

  // ═══════════════════════════════ PROJECT CARDS ═══════════════════════════════

  'Open City': {
    y: ["Tharsis Republic", "Immigrant City", "Corporate Stronghold", "Rover Construction", "Capital"]
  },

  'Fish': {
    y: ["Large Convoy", "Imported Nitrogen", "Ants", "Predators", "Ecological Zone"]
  },

  'Ecology Research': {
    y: ["Decomposers", "Fish", "Ants", "Small Animals", "Research"]
  },

  'Diversity Support': {
    y: ["Advanced Ecosystems", "Imported Nitrogen", "Imported Hydrogen", "Adaptation Technology"]
  },

  'Hi-Tech Lab': {
    y: ["AI Central", "Mars University", "Olympus Conference", "Research"]
  },

  'Immigrant City': {
    y: ["Tharsis Republic", "Open City", "Capital", "Corporate Stronghold"]
  },

  'Corporate Stronghold': {
    y: ["Tharsis Republic", "Immigrant City", "Open City", "Robotic Workforce"]
  },

  'Floating Refinery': {
    y: ["Morning Star Inc.", "Dirigibles", "Stratospheric Birds", "Floater Technology"]
  },

  'Virus': {
    y: ["Decomposers", "Media Group", "Viral Enhancers", "Insects"]
  },

  'Solar Reflectors': {
    y: ["Helion", "Caretaker Contract", "GHG Factories", "Heat Trappers"],
    w: "10% WR (1/10) в логах. Energy production trap в обычной игре. Но в heat rush с Helion/Caretaker Contract — рабочая карта. No-tag penalty всё равно давит."
  },

  'Sponsoring Nation': {
    y: ["Teractor", "Point Luna", "Earth Office", "Luna Governor"]
  },

  'Static Harvesting': {
    y: ["Thorgate", "Fuel Factory", "Electro Catapult", "Robotic Workforce"]
  },

  'Noctis City': {
    y: ["Tharsis Republic", "Rover Construction", "Capital"]
  },

  'Robotic Workforce': {
    y: ["Strip Mine", "Great Dam", "Fuel Factory", "Building Industries"]
  },

  'Advertising': {
    y: ["Media Group", "Sabotage", "Hired Raiders", "Virus"]
  }
};

// Применяем + валидируем
let applied = 0;
let warnings = [];

for (const [name, fix] of Object.entries(fixes)) {
  if (!data[name]) {
    console.error('NOT FOUND:', name);
    continue;
  }

  if (fix.y) {
    // Валидация: каждая синергия должна быть точным именем в TM_RATINGS
    const invalid = fix.y.filter(syn => !data[syn]);
    if (invalid.length > 0) {
      warnings.push(`${name}: synergies not in TM_RATINGS: ${invalid.join(', ')}`);
    }
    data[name].y = fix.y;
  }
  if (fix.w) data[name].w = fix.w;

  const synCount = fix.y ? fix.y.length : 0;
  const validCount = fix.y ? fix.y.filter(s => data[s]).length : 0;
  console.log(`✓ ${name}: ${validCount}/${synCount} synergies valid`);
  applied++;
}

if (warnings.length > 0) {
  console.log('\n⚠ WARNINGS:');
  warnings.forEach(w => console.log('  ' + w));
}

const output = PREFIX + JSON.stringify(data);
fs.writeFileSync(RATINGS_FILE, output, 'utf8');
console.log(`\n✓ Fixed synergies for ${applied} cards`);
