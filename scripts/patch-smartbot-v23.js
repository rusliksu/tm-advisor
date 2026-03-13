#!/usr/bin/env node
// patch-smartbot-v23.js — Fix 68: Corp tier adjustments based on v22b data
// Fix 69: REMOVED (corp-aware budget killed all VP by -3.6)

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 68: Corp tier adjustments =====
// v22b data (99 games):
//   IC 73→66 (avg 60.9/22g — bot can't play events well)
//   Poseidon 68→72 (avg 68.9/18g — bot plays colonies better than expected)
//   Point Luna 72→74 (avg 70.5/24g — stable performer)
//   CrediCor 62→66 (avg 68.0/11g — underrated)
//   Arklight 72→66 (avg 63.0/9g — overrated)
{
  const old = `          // v21b = best config (avg 68.4). v21c overtweaked tiers → avg 66.8 (reverted)
          'Manutech': 78, 'Saturn Systems': 78, 'Teractor': 76, 'Tharsis Republic': 74,
          'Utopia Invest': 74, 'Interplanetary Cinematics': 73, 'Point Luna': 72,
          'Arklight': 72, 'Lakefront Resorts': 72, 'Mining Guild': 70,
          'EcoLine': 68, 'Aphrodite': 68, 'Poseidon': 68, 'Helion': 68,
          'Kuiper Cooperative': 66, 'PolderTECH': 66, 'Mons Insurance': 66,
          'Vitor': 65, 'Cheung Shing MARS': 65, 'PhoboLog': 64, 'Recyclon': 65,
          'Philares': 64, 'Factorum': 62, 'CrediCor': 62, 'Celestic': 62,
          'Stormcraft Incorporated': 60, 'Pharmacy Union': 60,
          'Inventrix': 58, 'Morning Star Inc.': 55,
          'United Nations Mars Initiative': 50, 'Viron': 48,
          'Polyphemos': 38, 'Thorgate': 48,`;

  const replacement = `          // v23 tiers — v21b + v22b adjustments (99 games)
          // IC 73→66 (avg 60.9/22g), Poseidon 68→72 (avg 68.9/18g)
          // Point Luna 72→74 (avg 70.5/24g), CrediCor 62→66 (avg 68.0/11g)
          // Arklight 72→66 (avg 63.0/9g)
          'Manutech': 78, 'Saturn Systems': 78, 'Teractor': 76, 'Tharsis Republic': 74,
          'Utopia Invest': 74, 'Point Luna': 74, 'Mining Guild': 70,
          'Lakefront Resorts': 72, 'Poseidon': 72, 'Helion': 68,
          'EcoLine': 68, 'Aphrodite': 68,
          'Kuiper Cooperative': 66, 'PolderTECH': 66, 'Mons Insurance': 66,
          'Interplanetary Cinematics': 66, 'Arklight': 66, 'CrediCor': 66,
          'Vitor': 65, 'Cheung Shing MARS': 65, 'PhoboLog': 64, 'Recyclon': 65,
          'Philares': 64, 'Factorum': 62, 'Celestic': 62,
          'Stormcraft Incorporated': 60, 'Pharmacy Union': 60,
          'Inventrix': 58, 'Morning Star Inc.': 55,
          'United Nations Mars Initiative': 50, 'Viron': 48,
          'Polyphemos': 38, 'Thorgate': 48,`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 68 — corp tier adjustments (v22b data)');
    applied++;
  } else {
    console.log('SKIP: Fix 68 (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
