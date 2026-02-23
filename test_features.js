// Test harness for new features added in Priority 1-4
// Mocks browser environment and validates logic

// === Minimal DOM mock ===
global.document = {
  createElement: () => ({ className: '', style: {}, appendChild: () => {}, innerHTML: '' }),
  body: { appendChild: () => {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
};
global.window = { getComputedStyle: () => ({}) };
global.MutationObserver = class { observe() {} };
global.setInterval = () => {};
global.setTimeout = () => {};
global.localStorage = { getItem: () => null, setItem: () => {} };

// === Load data files ===
const fs = require('fs');
const path = require('path');

// Load ratings (const → global)
const ratingsCode = fs.readFileSync(path.join(__dirname, 'extension/data/ratings.json.js'), 'utf8')
  .replace('const TM_RATINGS=', 'global.TM_RATINGS=');
eval(ratingsCode);

// Load card effects (const → global)
const effectsCode = fs.readFileSync(path.join(__dirname, 'extension/data/card_effects.json.js'), 'utf8')
  .replace('const TM_CARD_EFFECTS=', 'global.TM_CARD_EFFECTS=');
eval(effectsCode);

// Load combos if exists
try {
  const combosCode = fs.readFileSync(path.join(__dirname, 'extension/data/combos.json.js'), 'utf8')
    .replace(/const TM_COMBOS\s*=/, 'global.TM_COMBOS=');
  eval(combosCode);
} catch(e) { global.TM_COMBOS = []; }

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}

// === Test 1: Floater trap detector data ===
console.log('\n=== Test 1: Floater Trap Cards in Ratings ===');
const knownTraps = ['Titan Air-scrapping', 'Aerosport Tournament', 'Rotator Impacts'];
for (const trap of knownTraps) {
  const d = TM_RATINGS[trap];
  assert(d !== undefined, trap + ' exists in TM_RATINGS');
  if (d) assert(d.s <= 55, trap + ' score=' + d.s + ' (expected ≤55 for trap)');
}

// === Test 2: Negative VP cards in card effects ===
console.log('\n=== Test 2: Negative VP Cards ===');
let negVPCount = 0;
const negVPCards = [];
for (const [name, fx] of Object.entries(TM_CARD_EFFECTS)) {
  if (fx.vp && fx.vp < 0) { negVPCount++; negVPCards.push(name + '(' + fx.vp + ')'); }
}
assert(negVPCount > 0, 'Found ' + negVPCount + ' negative VP cards: ' + negVPCards.join(', '));

// === Test 3: Corp Ability Synergy coverage ===
console.log('\n=== Test 3: Corp Synergy Data ===');
// Extract CORP_ABILITY_SYNERGY from content.js
const contentCode = fs.readFileSync(path.join(__dirname, 'extension/content.js'), 'utf8');
const corpSynMatch = contentCode.match(/const CORP_ABILITY_SYNERGY = \{[\s\S]*?\n  \};/);
assert(corpSynMatch !== null, 'CORP_ABILITY_SYNERGY found in content.js');

// Count corps with synergy data
const corpCount = (contentCode.match(/'[A-Z][^']+': \{ tags:/g) || []).length;
assert(corpCount >= 20, 'At least 20 corps have synergy data (found ' + corpCount + ')');

// === Test 4: Deny-draft logic - check it exists ===
console.log('\n=== Test 4: Deny-Draft Advisor ===');
assert(contentCode.includes('Deny-draft advisor'), 'Deny-draft advisor code block found');
assert(contentCode.includes('✂ Deny от'), 'Deny hint text found');

// === Test 5: MC→VP conversion table ===
console.log('\n=== Test 5: MC→VP Conversion Table ===');
assert(contentCode.includes('MC → VP конвертация'), 'MC→VP table title found');
assert(contentCode.includes('Озеленение SP'), 'Greenery SP route found');
assert(contentCode.includes('Астероид SP'), 'Asteroid SP route found');
assert(contentCode.includes('Венера SP'), 'Venus SP route found');

// === Test 6: O₂ Bottleneck Detector ===
console.log('\n=== Test 6: O₂ Bottleneck ===');
assert(contentCode.includes('O₂ Bottleneck'), 'O₂ Bottleneck detector found');
assert(contentCode.includes('Темп. Bottleneck'), 'Temperature bottleneck variant found');

// === Test 7: Award Lock Confidence ===
console.log('\n=== Test 7: Award Lock Confidence ===');
assert(contentCode.includes('Award Lock Confidence Score'), 'Award confidence code found');
assert(contentCode.includes('confPct'), 'Confidence percentage variable found');
assert(contentCode.includes('confIcon'), 'Confidence icon variable found');

// === Test 8: Multi-Front Defense Gauge ===
console.log('\n=== Test 8: Multi-Front Defense ===');
assert(contentCode.includes('Multi-Front Defense Gauge'), 'Multi-front defense code found');
assert(contentCode.includes('losingFronts'), 'losingFronts variable found');
assert(contentCode.includes('Распылён по'), 'Warning text found');

// === Test 9: Rush→Engine Pivot Trigger ===
console.log('\n=== Test 9: Rush→Engine Pivot ===');
assert(contentCode.includes('Rush→Engine Pivot Trigger'), 'Pivot trigger code found');
assert(contentCode.includes('maxedParams'), 'maxedParams variable found');

// === Test 10: VP Lane Counter ===
console.log('\n=== Test 10: VP Lane Counter ===');
assert(contentCode.includes('VP Lane Counter'), 'VP Lane Counter code found');
assert(contentCode.includes('vpLanes'), 'vpLanes variable found');

// === Test 11: Endgame Conversion Checklist ===
console.log('\n=== Test 11: Endgame Conversion Checklist ===');
assert(contentCode.includes('Чеклист конвертации'), 'Endgame checklist found');

// === Test 12: Resource Stranding Warnings ===
console.log('\n=== Test 12: Resource Stranding ===');
assert(contentCode.includes('Resource stranding warnings'), 'Stranding warning code found');

// === Test 13: Decision Gate Reminder ===
console.log('\n=== Test 13: Decision Gate ===');
assert(contentCode.includes('Decision gate reminders'), 'Decision gate code found');
assert(contentCode.includes('Точки решения'), 'Decision gate UI text found');

// === Test 14: Production break-even ===
console.log('\n=== Test 14: Production Break-Even ===');
assert(contentCode.includes('Production break-even timer'), 'Break-even code found');
assert(contentCode.includes('breakEvenGens'), 'breakEvenGens variable found');

// === Test 15: Opponent VP Ceiling ===
console.log('\n=== Test 15: Opponent VP Ceiling ===');
assert(contentCode.includes('VP Ceiling estimate'), 'VP ceiling code found');
assert(contentCode.includes('ceilDiff'), 'ceilDiff variable found');

// === Test 16: Award volatility in opp tracker ===
console.log('\n=== Test 16: Award Lock Discipline in Opp Tracker ===');
assert(contentCode.includes('award lock discipline'), 'Award lock discipline comment found');
assert(contentCode.includes('хрупкий перевес'), 'Fragile lead warning found');

// === Test 17: Variable scoping — no redeclaration conflicts ===
console.log('\n=== Test 17: Variable Scoping ===');
// Check that our new blocks use var (not let/const which could conflict in same scope)
const newBlocks = [
  'var dgGates', 'var cvP', 'var futPlants', 'var ceilGensLeft',
  'var confPct', 'var losingFronts', 'var maxedParams'
];
for (const vb of newBlocks) {
  assert(contentCode.includes(vb), 'Variable declaration: ' + vb);
}

// === Summary ===
console.log('\n========================================');
console.log('  PASSED: ' + passed + '  |  FAILED: ' + failed);
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
