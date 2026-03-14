/**
 * audit_beh_overrides.js — Find MANUAL_EV cards with parsed behavior
 * that are NOT in _behOverrides (potential double-count bugs)
 */
const fs = require('fs');

// Parse card_data.js
const cdSrc = fs.readFileSync('extension/data/card_data.js', 'utf8');
const cdMatch = cdSrc.match(/var TM_CARD_DATA\s*=\s*(\{[\s\S]*\});/);
let cardData = {};
if (cdMatch) {
  try { cardData = eval('(' + cdMatch[1] + ')'); } catch(e) { console.error('card_data parse error', e.message); }
}

// Read tm-brain.js
const brainSrc = fs.readFileSync('extension/tm-brain.js', 'utf8');

// Extract _behOverrides names
const behOvr = new Set();
const ovrMatch = brainSrc.match(/_behOverrides\s*=\s*\{([\s\S]*?)\};/);
if (ovrMatch) {
  for (const m of ovrMatch[1].matchAll(/'([^']+)'/g)) behOvr.add(m[1]);
}

// Extract MANUAL_EV names
const manualNames = new Set();
const mevMatch = brainSrc.match(/var MANUAL_EV\s*=\s*\{([\s\S]*?)\n  \};/);
if (mevMatch) {
  for (const m of mevMatch[1].matchAll(/'([^']+)'/g)) manualNames.add(m[1]);
}

// Check each MANUAL_EV card
const problems = [];
const intentional = []; // cards where parsed beh is intentionally kept

for (const name of manualNames) {
  if (behOvr.has(name)) continue;
  const cd = cardData[name];
  if (!cd) continue;
  const beh = cd.behavior || {};

  const issues = [];
  if (beh.production) {
    const prods = Object.entries(beh.production).filter(([k,v]) => v !== 0);
    if (prods.length) issues.push('prod:' + JSON.stringify(Object.fromEntries(prods)));
  }
  if (beh.stock) {
    const stocks = Object.entries(beh.stock).filter(([k,v]) => v !== 0);
    if (stocks.length) issues.push('stock:' + JSON.stringify(Object.fromEntries(stocks)));
  }
  if (beh.global) issues.push('global:' + JSON.stringify(beh.global));
  if (beh.tr) issues.push('tr:' + beh.tr);
  if (beh.ocean) issues.push('ocean:' + beh.ocean);
  if (beh.greenery) issues.push('greenery');
  if (beh.city) issues.push('city');
  if (beh.colony) issues.push('colony');
  if (beh.tradeFleet) issues.push('tradeFleet');
  if (beh.drawCard) issues.push('drawCard:' + beh.drawCard);
  if (beh.decreaseAnyProduction) issues.push('decreaseAny:' + JSON.stringify(beh.decreaseAnyProduction));

  if (issues.length > 0) {
    problems.push({ name, issues: issues.join(' | ') });
  }
}

console.log('=== AUDIT: MANUAL_EV cards with parsed beh NOT in _behOverrides ===');
console.log('MANUAL_EV count:', manualNames.size);
console.log('_behOverrides count:', behOvr.size);
console.log('Double-count risk:', problems.length);
console.log('');
problems.forEach(p => console.log('  ' + p.name.padEnd(40) + p.issues));
