/**
 * audit-corps-preludes.js — Audit corporations and preludes scoring
 * Checks: scoreCard EV vs TM_RATINGS, missing ratings, overvalued/undervalued
 */
var fs = require('fs'), path = require('path');

function load(f,v) {
  var r = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8').replace(/\bconst\b/g,'var');
  return (new Function(r + '\nreturn ' + v + ';'))();
}

var TM_CARD_DATA = load('extension/data/card_data.js', 'TM_CARD_DATA');
var TM_CARD_TAGS = load('extension/data/card_tags.js', 'TM_CARD_TAGS');
var TM_CARD_VP = load('extension/data/card_vp.js', 'TM_CARD_VP');
var TM_CARD_EFFECTS = load('extension/data/card_effects.json.js', 'TM_CARD_EFFECTS');
var TM_RATINGS = load('extension/data/ratings.json.js', 'TM_RATINGS');
var TM_RATINGS_RAW = TM_RATINGS;
TM_RATINGS = new Proxy(TM_RATINGS_RAW, {
  get: function(target, prop, receiver) {
    if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
    if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
    var base = prop.replace(/:u$|:Pathfinders$|:promo$|:ares$/, '').replace(/\\+$/, '');
    return Object.prototype.hasOwnProperty.call(target, base) ? target[base] : undefined;
  }
});
var reqs = load('extension/data/card_tag_reqs.js', '{ tagReqs: TM_CARD_TAG_REQS, globalReqs: TM_CARD_GLOBAL_REQS }');
var disc = load('extension/data/synergy_tables.json.js', 'typeof TM_CARD_DISCOUNTS!=="undefined"?TM_CARD_DISCOUNTS:{}');

// Load corps list
var corpsRaw = fs.readFileSync(path.resolve(__dirname, '..', 'extension/data/corps.json.js'), 'utf8');
// corps.json.js uses TM_UTILS — stub it
var TM_CORPS = {};
try {
  var corpsCode = corpsRaw.replace(/\bconst\b/g, 'var').replace(/TM_UTILS\.\w+\([^)]*\)/g, '{}');
  var corpsFn = new Function('var TM_UTILS = {deepMerge: function(){return {}}}; ' + corpsCode + '\nreturn TM_CORPS;');
  TM_CORPS = corpsFn();
} catch(e) {
  console.log('WARNING: Could not parse corps.json.js: ' + e.message);
}

var TM_BRAIN = require(path.resolve(__dirname, '..', 'extension/tm-brain.js'));
TM_BRAIN.setCardData(TM_CARD_TAGS, TM_CARD_VP, TM_CARD_DATA, disc, reqs.tagReqs, reqs.globalReqs);

// Early game state (gen 1 — corps/preludes are always picked at start)
var stateGen1 = {
  game: {generation: 1, temperature: -30, oxygen: 0, oceans: 0, venusScaleLevel: 0},
  thisPlayer: {megaCredits: 40, steel: 0, titanium: 0,
    tags: {building: 0, space: 0, science: 0, earth: 0, venus: 0},
    steelValue: 2, titaniumValue: 3},
  players: [{},{},{}]
};

// Collect all cost=0 cards
var corpNames = Object.keys(TM_CORPS);
var allZeroCost = [];
for (var name in TM_CARD_EFFECTS) {
  var fx = TM_CARD_EFFECTS[name];
  if (fx.c !== 0) continue;
  var isCorp = corpNames.indexOf(name) >= 0;
  var rating = TM_RATINGS[name];
  var score = TM_BRAIN.scoreCard({name: name, cost: 0}, stateGen1);
  allZeroCost.push({
    name: name,
    isCorp: isCorp,
    score: score,
    ratingS: rating ? rating.s : null,
    ratingT: rating ? rating.t : null,
    fx: fx
  });
}

// Separate corps and preludes
var corps = allZeroCost.filter(function(c) { return c.isCorp; });
var preludes = allZeroCost.filter(function(c) { return !c.isCorp; });

// Sort by scoreCard desc
corps.sort(function(a,b) { return b.score - a.score; });
preludes.sort(function(a,b) { return b.score - a.score; });

console.log('=== CORPORATIONS (' + corps.length + ') ===');
console.log('Name'.padEnd(40) + 'EV'.padStart(7) + 'Rating'.padStart(7) + 'Tier'.padStart(5) + '  Effects');
console.log('-'.repeat(100));
corps.forEach(function(c) {
  var fxStr = JSON.stringify(c.fx);
  if (fxStr.length > 40) fxStr = fxStr.substring(0, 37) + '...';
  console.log(
    c.name.padEnd(40) +
    (c.score !== null ? c.score.toFixed(1) : '?').padStart(7) +
    (c.ratingS !== null ? '' + c.ratingS : '-').padStart(7) +
    (c.ratingT || '-').padStart(5) +
    '  ' + fxStr
  );
});

console.log('');
console.log('=== PRELUDES (' + preludes.length + ') ===');
console.log('Name'.padEnd(40) + 'EV'.padStart(7) + 'Rating'.padStart(7) + 'Tier'.padStart(5) + '  Effects');
console.log('-'.repeat(100));
preludes.forEach(function(c) {
  var fxStr = JSON.stringify(c.fx);
  if (fxStr.length > 40) fxStr = fxStr.substring(0, 37) + '...';
  console.log(
    c.name.padEnd(40) +
    (c.score !== null ? c.score.toFixed(1) : '?').padStart(7) +
    (c.ratingS !== null ? '' + c.ratingS : '-').padStart(7) +
    (c.ratingT || '-').padStart(5) +
    '  ' + fxStr
  );
});

// === ISSUES ===
console.log('');
console.log('=== ISSUES ===');

// 1. Corps/preludes without ratings
var noRating = allZeroCost.filter(function(c) { return c.ratingS === null; });
if (noRating.length > 0) {
  console.log('');
  console.log('--- Missing ratings (' + noRating.length + ') ---');
  noRating.forEach(function(c) {
    console.log('  ' + (c.isCorp ? '[CORP]' : '[PREL]') + ' ' + c.name + '  EV=' + c.score.toFixed(1));
  });
}

// 2. Big discrepancy between EV and rating
console.log('');
console.log('--- EV vs Rating discrepancy (|EV - Rating| > 25) ---');
allZeroCost.forEach(function(c) {
  if (c.ratingS === null) return;
  var diff = c.score - c.ratingS;
  if (Math.abs(diff) > 25) {
    console.log('  ' + (c.isCorp ? '[CORP]' : '[PREL]') + ' ' + c.name.padEnd(35) +
      'EV=' + c.score.toFixed(1).padStart(6) + '  Rating=' + ('' + c.ratingS).padStart(3) +
      '  Diff=' + diff.toFixed(1).padStart(7));
  }
});

// 3. Corps without card_data (missing parsed behavior)
console.log('');
console.log('--- Corps/preludes NOT in card_data ---');
allZeroCost.forEach(function(c) {
  if (!TM_CARD_DATA[c.name]) {
    console.log('  ' + (c.isCorp ? '[CORP]' : '[PREL]') + ' ' + c.name.padEnd(35) +
      'EV=' + c.score.toFixed(1).padStart(6) + '  fx=' + JSON.stringify(c.fx));
  }
});

// 4. Corps with EV=0 (nothing scored)
console.log('');
console.log('--- EV = 0 (no parsed value) ---');
allZeroCost.forEach(function(c) {
  if (Math.abs(c.score) < 0.1) {
    console.log('  ' + (c.isCorp ? '[CORP]' : '[PREL]') + ' ' + c.name.padEnd(35) +
      'Rating=' + (c.ratingS !== null ? '' + c.ratingS : '-').padStart(3));
  }
});
