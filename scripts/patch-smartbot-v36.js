#!/usr/bin/env node
// patch-smartbot-v36.js (applied to smartbot.js)
// Fix 96: Updated _CORP_TIERS from PvP9/PvP10 real data (199 games)
// Fix 97: Fund awards from gen 2 (was gen 3) — 8 MC = 5 VP is best ROI
// Fix 98: Smarter card buying — buy fewer cards late game, more early

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 96: Updated corp tiers =====
{
  const old = `          // v23 tiers — v21b + v22b adjustments (99 games)
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

  const replacement = `          // v36 tiers — PvP9+PvP10 data (199 games, patched bot)
          'EcoLine': 82, 'Cheung Shing MARS': 80, 'Vitor': 80,
          'Aphrodite': 78, 'Mining Guild': 78, 'Saturn Systems': 78,
          'Tharsis Republic': 78, 'Manutech': 76, 'Teractor': 76,
          'Helion': 76, 'Point Luna': 74, 'Lakefront Resorts': 74,
          'Utopia Invest': 74, 'Kuiper Cooperative': 72,
          'Stormcraft Incorporated': 70, 'Poseidon': 68,
          'PolderTECH': 68, 'Recyclon': 66, 'CrediCor': 66,
          'Arklight': 66, 'Interplanetary Cinematics': 64,
          'Mons Insurance': 62, 'Inventrix': 62, 'Factorum': 62,
          'PhoboLog': 64, 'Celestic': 62, 'Philares': 64,
          'Pharmacy Union': 60, 'Morning Star Inc.': 55,
          'United Nations Mars Initiative': 50, 'Viron': 48,
          'Polyphemos': 38, 'Thorgate': 48,`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 96 — updated _CORP_TIERS from PvP data (EcoLine 68→82, Vitor 65→80, etc.)');
    applied++;
  } else {
    console.log('SKIP: Fix 96 (corp tiers pattern not found)');
  }
}

// ===== Fix 97: Fund awards from gen 2 =====
{
  const old = `if (awardIdx >= 0 && mc >= awardCost && gen >= 3) {`;
  const replacement = `if (awardIdx >= 0 && mc >= awardCost && gen >= 2) {`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 97 — award funding from gen 2 (was gen 3)');
    applied++;
  } else {
    console.log('SKIP: Fix 97 (award gen pattern not found)');
  }
}

// ===== Fix 98: Adaptive card buy threshold =====
// Early game: buy more cards (engine building), late game: buy fewer (VP focus)
{
  const old = `      const reserve = gen <= 2 ? 0 : (gen <= 5 ? 3 : 5);`;
  const replacement = `      const reserve = gen <= 2 ? 0 : (gen <= 4 ? 2 : (gen <= 7 ? 5 : 8));`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 98 — adaptive card buy reserve (more aggressive early, conservative late)');
    applied++;
  } else {
    console.log('SKIP: Fix 98 (reserve pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
