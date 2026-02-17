const fs = require('fs');
const path = 'C:/Users/Ruslan/tm-tierlist/extension/data/ratings.json.js';
const raw = fs.readFileSync(path, 'utf8');

// File starts with: const TM_RATINGS={...};
const idx = raw.indexOf('{');
const prefix = raw.slice(0, idx);
const jsonStr = raw.slice(idx).replace(/;\s*$/, '');
const data = JSON.parse(jsonStr);

function tierOf(s) {
  if (s >= 90) return 'S';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 55) return 'C';
  if (s >= 35) return 'D';
  return 'F';
}

// 49 games, ~138 players, base WR ~35.5%
// Strong signal: >=15 plays. Moderate: 8-14. Weak: <8.
const changes = [
  // === STRONG SIGNAL (>=15 plays) — common AND winning/losing ===
  // Venusian Animals: 25 plays, 60% WR, avg +13 VP — best VP generator
  { name: 'Venusian Animals', s: 85, reason: '25 plays, 60% WR, +13 VP ср. — лучший VP-генератор в игре' },
  // Imported Nutrients: 20 plays, 70% WR — consistent win marker
  { name: 'Imported Nutrients', s: 78, reason: '20 plays, 70% WR — стабильный win-маркер' },
  // Rad-Chem Factory: 17 plays, 71% WR — reliable
  { name: 'Rad-Chem Factory', s: 72, reason: '17 plays, 71% WR — надёжный TR boost' },
  // CEO's Fav Project: 16 plays, 6% WR — confirmed trap, very popular but terrible
  { name: "CEO's Favorite Project", s: 45, reason: '16 plays, 6% WR — популярная но проигрышная, trap' },
  // Trade Envoys: 19 plays, 16% WR — popular but bad
  { name: 'Trade Envoys', s: 62, reason: '19 plays, 16% WR — colony engine без payoff' },
  // Standard Technology: 25 plays, 24% WR — very popular but underperforms
  { name: 'Standard Technology', s: 60, reason: '25 plays, 24% WR — популярна но не конвертируется в победу' },
  // Mining Rights: 18 plays, 17% WR — popular but bad
  { name: 'Mining Rights', s: 58, reason: '18 plays, 17% WR — стоимость не окупается' },

  // === MODERATE SIGNAL (8-14 plays) ===
  // Thermophiles: 12 plays, 75% WR — selective but strong. D38 is too low.
  { name: 'Thermophiles', s: 65, reason: '12 plays, 75% WR — работает в Venus engine, селективно но сильно' },
  // Interplanetary Trade: 12 plays, 67% WR
  { name: 'Interplanetary Trade', s: 58, reason: '12 plays, 67% WR — engine карта, играется селективно' },
  // Venusian Plants: 20 plays, 55% WR — large sample!
  { name: 'Venusian Plants', s: 60, reason: '20 plays, 55% WR — большая выборка, стабильный Venus TR' },
  // Search For Life: 12 plays, 8% WR — moderate sample, confirmed trap
  { name: 'Search For Life', s: 42, reason: '12 plays, 8% WR — gambling не окупается' },
  // Microgravity Nutrition: 10 plays, 60% WR
  { name: 'Microgravity Nutrition', s: 56, reason: '10 plays, 60% WR — лучше чем думалось' },
  // Titan Air-scrapping: 8 plays, 62% WR — selective
  { name: 'Titan Air-scrapping', s: 50, reason: '8 plays, 62% WR — селективно, но лучше чем D42' },
  // Release of Inert Gases: 9 plays, 78% WR — selective
  { name: 'Release of Inert Gases', s: 60, reason: '9 plays, 78% WR — селективно, хорош в нужных условиях' },
  // Impactor Swarm: 9 plays, 56% WR
  { name: 'Impactor Swarm', s: 46, reason: '9 plays, 56% WR — скромный рост' },

  // === WEAK SIGNAL (<8 plays) — small bumps only ===
  // Fish: 7 plays, 100% WR — very selective, small sample
  { name: 'Fish', s: 78, reason: '7 plays, 100% WR — селективно но идеальный результат, малая выборка' },
  // UNMI Contractor: 4 plays, 0% WR — too small to demolish A rating
  { name: 'UNMI Contractor', s: 78, reason: '4 plays, 0% WR — малая выборка, осторожное понижение' },
  // Ice Cap Melting: 6 plays, 67% WR
  { name: 'Ice Cap Melting', s: 42, reason: '6 plays, 67% WR — малая выборка, небольшой рост' },
  // Special Design: 7 plays, 57% WR
  { name: 'Special Design', s: 54, reason: '7 plays, 57% WR — малая выборка' },
  // Rad-Suits: 7 plays, 57% WR
  { name: 'Rad-Suits', s: 50, reason: '7 plays, 57% WR — малая выборка' },
  // Equatorial Magnetizer: 5 plays, 60% WR — too small
  { name: 'Equatorial Magnetizer', s: 50, reason: '5 plays, 60% WR — мини-выборка, скромный рост' },
];

const log = [];
for (const ch of changes) {
  if (data[ch.name]) {
    const old = data[ch.name];
    const oldS = old.s, oldT = old.t;
    old.s = ch.s;
    old.t = tierOf(ch.s);
    const arrow = ch.s > oldS ? '↑' : ch.s < oldS ? '↓' : '=';
    log.push(`${arrow} ${ch.name}: ${oldT}${oldS} -> ${old.t}${old.s} (${ch.reason})`);
  } else {
    log.push(`? ${ch.name}: NOT FOUND`);
  }
}

// Write back
fs.writeFileSync(path, prefix + JSON.stringify(data) + ';\n');
console.log(`Updated ${changes.length} cards:`);
log.forEach(l => console.log('  ' + l));
console.log(`Total cards: ${Object.keys(data).length}`);
