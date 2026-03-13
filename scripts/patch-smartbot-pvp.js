#!/usr/bin/env node
// patch-smartbot-pvp.js
// Patched vs Unpatched test:
// Alpha = PATCHED (all improvements from v5-v30)
// Beta/Gamma = VANILLA (original scoreCard constants, no MANUAL_EV guard)
//
// Approach:
// 1. In smartbot.js: tag state with player name before handleInput
// 2. In tm-brain.js: check state._botName to branch scoring logic
//    - Alpha: use corrected STOCK_MC/PROD_MC + MANUAL_EV guard
//    - Beta/Gamma: use original STOCK_MC/PROD_MC + no guard

const fs = require('fs');
const smartFile = process.argv[2] || 'smartbot.js';
const brainFile = process.argv[3] || 'tm-brain.js';
let smart = fs.readFileSync(smartFile, 'utf8');
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Part 1: Tag state with bot name in smartbot.js =====
{
  const old = `    const state = await fetch(\`\${BASE}/api/player?id=\${p.id}\`);
    const wf = state.waitingFor;
    if (!wf) continue;`;

  const replacement = `    const state = await fetch(\`\${BASE}/api/player?id=\${p.id}\`);
    state._botName = p.name; // Tag for patched-vs-unpatched branching
    const wf = state.waitingFor;
    if (!wf) continue;`;

  if (smart.includes(old)) {
    smart = smart.replace(old, replacement);
    console.log('OK: PvP part 1 — tag state with bot name');
    applied++;
  } else {
    console.log('SKIP: PvP part 1 (pattern not found)');
  }
}

// ===== Part 2: Dual-mode constants in tm-brain.js =====
// After STOCK_MC/PROD_MC definitions, add original versions
{
  const old = `  var PROD_MC = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2,
    energy: 1.7, heat: 0.8
  };

  // MC value of 1 instant resource
  var STOCK_MC = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.5,
    energy: 1.5, heat: 0.8
  };`;

  const replacement = `  // PATCHED constants (v30 — corrected valuations)
  var PROD_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2,
    energy: 1.7, heat: 0.8
  };
  var STOCK_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.5,
    energy: 1.5, heat: 0.8
  };
  // VANILLA constants (original)
  var PROD_MC_VANILLA = {
    megacredits: 1, steel: 2, titanium: 3, plants: 2.2,
    energy: 1.3, heat: 0.8
  };
  var STOCK_MC_VANILLA = {
    megacredits: 1, steel: 2, titanium: 3, plants: 1.1,
    energy: 0.7, heat: 0.8
  };
  // Default to PATCHED (will be switched per-bot in scoreCard)
  var PROD_MC = PROD_MC_PATCHED;
  var STOCK_MC = STOCK_MC_PATCHED;`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: PvP part 2 — dual-mode STOCK_MC/PROD_MC');
    applied++;
  } else {
    console.log('SKIP: PvP part 2 (pattern not found — need v30 applied first)');
  }
}

// ===== Part 3: Branch scoreCard per bot =====
// At the start of scoreCard, switch constants based on _botName
{
  const old = `  function scoreCard(card, state) {
    var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
    var name = card.name || '';
    var gen = (state && state.game && state.game.generation) || 5;`;

  const replacement = `  function scoreCard(card, state) {
    // PvP test: Beta=PATCHED, Alpha/Gamma=VANILLA
    var _isPatched = state && state._botName === 'Beta';
    PROD_MC = _isPatched ? PROD_MC_PATCHED : PROD_MC_VANILLA;
    STOCK_MC = _isPatched ? STOCK_MC_PATCHED : STOCK_MC_VANILLA;
    var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
    var name = card.name || '';
    var gen = (state && state.game && state.game.generation) || 5;`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: PvP part 3 — branch scoreCard per bot');
    applied++;
  } else {
    console.log('SKIP: PvP part 3 (pattern not found)');
  }
}

// ===== Part 4: Branch MANUAL_EV guard per bot =====
// Only Alpha skips parsed actions when MANUAL_EV exists
{
  const old = `    // ── BLUE CARD ACTIONS (recurring) ──
    // Skip parsed actions if MANUAL_EV covers this card (manual is more accurate, avoids double-count)
    var hasManualEV = !!MANUAL_EV[name];
    if (!hasManualEV) {`;

  const replacement = `    // ── BLUE CARD ACTIONS (recurring) ──
    // PvP: only Alpha skips parsed actions when MANUAL_EV exists
    var hasManualEV = _isPatched && !!MANUAL_EV[name];
    if (!hasManualEV) {`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: PvP part 4 — MANUAL_EV guard only for Alpha');
    applied++;
  } else {
    console.log('SKIP: PvP part 4 (pattern not found — need v30 applied first)');
  }
}

// ===== Part 5: Compound production bonus only for patched bot (v32) =====
{
  const old = `    // Early production compounds: more resources → more cards → better engine
    var prodCompound = gensLeft >= 8 ? 1.3 : (gensLeft >= 5 ? 1.15 : 1.0);`;

  const replacement = `    // Early production compounds: more resources → more cards → better engine
    var prodCompound = _isPatched ? (gensLeft >= 8 ? 1.3 : (gensLeft >= 5 ? 1.15 : 1.0)) : 1.0;`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: PvP part 5 — compound production bonus only for patched bot');
    applied++;
  } else {
    console.log('SKIP: PvP part 5 (pattern not found — need v32 applied first)');
  }
}

fs.writeFileSync(smartFile, smart);
fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied');
