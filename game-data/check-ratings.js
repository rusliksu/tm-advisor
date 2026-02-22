const fs = require('fs');
const text = fs.readFileSync('C:/Users/Ruslan/tm-tierlist/extension/data/ratings.json.js', 'utf8');
const match = text.match(/const TM_RATINGS = (\{[\s\S]+\});/);
if (!match) { console.log('NO MATCH'); process.exit(1); }
const ratings = eval('(' + match[1] + ')');

const check = [
  'Venusian Animals', 'Stratospheric Birds', 'Ganymede Colony', 'Bactoviral Research',
  'Water Import From Europa', 'Giant Ice Asteroid', 'Stratospheric Expedition',
  'Huygens Observatory', 'Breathing Filters', 'Market Manipulation',
  'Insects', 'Venus Orbital Survey', 'Development Center', 'Atalanta Planitia Lab',
  'Algae', 'Penguins', 'Jovian Lanterns', 'Medical Lab', 'Martian Zoo',
  'Soil Studies', 'Breeding Farms', 'Sub-zero Salt Fish', 'Botanical Experience',
  'Greenhouses', 'Topsoil Contract', 'Tectonic Stress Power',
  'Io Mining Industries', 'Cultivation of Venus', 'Space Port Colony',
  'Decomposers', 'Predators', 'Fish', 'Earth Elevator',
  'Valley Trust', 'Morning Star Inc.', 'Poseidon', 'EcoLine', 'Viron',
  'Spire', 'Teractor', 'CrediCor', 'Tharsis Republic', 'PhoboLog',
  'Interplanetary Cinematics', 'Pharmacy Union',
  'Space Station', "Inventors' Guild", 'Power Plant', 'Satellites', 'Windmills',
  'Cassini Station', 'Cyanobacteria', 'Farming', 'Artificial Lake',
  'Giant Solar Shade', 'Venus Magnetizer', 'Lunar Mining',
  'Immigration Shuttles', 'Cloud Tourism', 'Herbivores'
];

console.log('CURRENT RATINGS vs GAME DATA:');
console.log('');
check.forEach(name => {
  const r = ratings[name];
  if (r) console.log(r.t.toUpperCase() + String(r.s).padStart(4) + ' | ' + name);
  else console.log('  --   | ' + name + ' (NOT RATED)');
});
