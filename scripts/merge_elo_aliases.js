#!/usr/bin/env node
/**
 * Merge duplicate player names in elo_import.json
 * Aliases map: primary_name → [alias1, alias2, ...]
 * All games played under aliases get reassigned to primary.
 * Elo is recalculated from scratch after merge.
 */

const fs = require('fs');
const path = require('path');

const ELO_PATH = path.join(__dirname, '..', 'data', 'elo_import.json');
const data = JSON.parse(fs.readFileSync(ELO_PATH, 'utf8'));

// ── ALIAS MAP ──
// Edit this to add/remove aliases. Key = primary name, value = aliases to merge into it.
const ALIASES = {
  'wdkymyms':       ['wdk', 'wdkym', 'wdkmysms', 'wdkumums', 'wdkymymd', 'wd', 'w'],
  'panda':          ['pa', 'pandaboi', 'pa2016'],
  'mrfahrenheit':   ['mrfahrenheit7', 'mrf'],
  'bmacg':          ['bmacg.', 'bmac'],
  'death':          ['death8killer', 'deathkiller'],
  'eket':           ['eket678'],
  'giasa':          ['giasa_'],
  'hoyla':          ['höylä'],
  'iropikc':        ['iropic', 'iropick'],
  'kaera':          ['kaera02'],
  'langfjes':       ['lang'],
  'low615':         ['low'],
  'masterkeys':     ['mstrkeys'],
  'mortaum':        ['moratum', 'mortarum', 'mort'],
  'mu6ra7a':        ['mu6rata'],
  'nagumi':         ['nagimi'],
  'plazma':         ['plazmica', 'plaz'],
  'popsickle':      ['pop', 'popi', 'poppy', 'popsicle'],
  'preparationfit': ['prepartionfit'],
  'reinforcement':  ['reinforcement-'],
  's29jin':         ['jin'],
  'shmondar':       ['shm'],
  'tarun':          ['taruntheo13', 'taru'],
  'utg':            ['underthegun'],
  'vitalyvit':      ['vitaly', 'vit'],
  'vvbminsk':       ['vvb', 'minsk'],
  'amzo':           ['amzo4'],
  'cucumber':       ['cuc'],
  'duc nguyen':     ['duc', 'dukz', 'dukz01'],
  'zalo':           ['zalobolivia'],
  'ita':            ['italian', 'italianood'],
};

// Build reverse map: alias → primary
const aliasToMain = {};
for (const [primary, alts] of Object.entries(ALIASES)) {
  for (const alt of alts) {
    aliasToMain[alt] = primary;
  }
}

function resolve(name) {
  return aliasToMain[name] || name;
}

// ── Step 1: Rename players in all games ──
let renameCount = 0;
for (const game of data.games) {
  for (const r of game.results) {
    const resolved = resolve(r.name);
    if (resolved !== r.name) {
      renameCount++;
      r.name = resolved;
    }
  }
}
console.log('Renamed', renameCount, 'player entries in games');

// ── Step 2: Recalculate Elo from scratch ──
const K = 32;
const DEFAULT = 1500;

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

const players = {};
function getPlayer(name, displayName) {
  if (!players[name]) {
    players[name] = {
      elo: DEFAULT,
      elo_vp: DEFAULT,
      displayName: displayName || name,
      games: 0,
      wins: 0,
      top3: 0,
      totalVP: 0,
      corps: {},
    };
  }
  return players[name];
}

for (const game of data.games) {
  const results = game.results;
  const n = results.length;

  // Placement Elo (pairwise)
  for (let i = 0; i < n; i++) {
    const pi = getPlayer(results[i].name, results[i].displayName);
    pi.games++;
    if (results[i].place === 1) pi.wins++;
    if (results[i].place <= 3) pi.top3++;
    if (results[i].corp) pi.corps[results[i].corp] = (pi.corps[results[i].corp] || 0) + 1;

    for (let j = i + 1; j < n; j++) {
      const pj = getPlayer(results[j].name, results[j].displayName);
      const ea = expectedScore(pi.elo, pj.elo);
      const sa = results[i].place < results[j].place ? 1 : (results[i].place === results[j].place ? 0.5 : 0);
      const kAdj = K / (n - 1);
      pi.elo += kAdj * (sa - ea);
      pj.elo += kAdj * ((1 - sa) - (1 - ea));
    }
  }
}

// Round Elo
for (const name in players) {
  players[name].elo = Math.round(players[name].elo);
}

// Fix displayNames — use the most common capitalization
for (const [primary, alts] of Object.entries(ALIASES)) {
  const p = players[primary];
  if (p) {
    // Capitalize first letter
    p.displayName = primary.charAt(0).toUpperCase() + primary.slice(1);
  }
}

// Sort leaderboard
const sorted = Object.entries(players)
  .sort((a, b) => b[1].elo - a[1].elo);

console.log('\n=== LEADERBOARD (top 30) ===');
console.log('#   Player               Elo   Games  Wins  Win%');
sorted.slice(0, 30).forEach(([name, p], i) => {
  const winPct = p.games > 0 ? Math.round(p.wins / p.games * 100) : 0;
  console.log(`${(i+1+'').padStart(3)}  ${(p.displayName || name).padEnd(20)} ${(p.elo+'').padStart(5)}  ${(p.games+'').padStart(5)}  ${(p.wins+'').padStart(4)}  ${(winPct+'%').padStart(4)}`);
});

console.log('\nTotal players:', Object.keys(players).length, '(was', Object.keys(data.players).length + ')');
console.log('Total games:', data.games.length);

// ── Step 3: Save ──
data.players = players;
fs.writeFileSync(ELO_PATH, JSON.stringify(data, null, 2));
console.log('\nSaved to', ELO_PATH);
