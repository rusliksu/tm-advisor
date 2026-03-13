#!/usr/bin/env node
// patch-smartbot-v28.js
// Fix 78: Endgame colony trade — bot currently has NO trade in endgame block
// When endgameMode=true, or-handler enters endgame block and returns without trading.
// Fix: add trade after blue actions + delegate, before card play attempts.
//
// Fix 79: Colony bonus in trade scoring — scoreColonyTrade ignores colony bonus
// When bot has colonies on a planet, trading there gives ADDITIONAL resources.
// Fix: add colony bonus MC value to scoreColonyTrade in tm-brain.js

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 78: Endgame colony trade =====
// Insert trade logic after delegate and before card play in endgame block
{
  const old = `      if (delegateIdx >= 0 && mc >= 5) return pick(delegateIdx);
      if (playCardIdx >= 0) {
        const subWf = opts[playCardIdx] || {};
        const hand = subWf.cards?.length > 0 ? subWf.cards : cardsInHand;
        const payOpts = subWf.paymentOptions || {};
        const extraMC = (payOpts.heat ? heat : 0) + (payOpts.lunaTradeFederationTitanium ? titanium * (state?.thisPlayer?.titaniumValue || 3) : 0);
        const totalBudget = mc + extraMC;
        // In endgame: prioritize VP cards, play anything affordable with VP
        const affordable = hand`;

  const replacement = `      if (delegateIdx >= 0 && mc >= 5) return pick(delegateIdx);
      // Endgame trade — don't waste trade fleets
      if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {
        const egTradeOpt = opts[tradeIdx];
        const egColonies = egTradeOpt?.coloniesModel || egTradeOpt?.colonies || [];
        if (egColonies.length > 0) {
          const egScored = egColonies.map(c => ({ name: c.name, val: scoreColonyTrade(c, state) })).sort((a, b) => b.val - a.val);
          const egTradeCost = (energy >= 3 || titanium >= 3) ? 0 : 9;
          if (egScored[0]?.val - egTradeCost >= 3) {
            state._preferredTradeColony = egScored[0]?.name;
            console.log('    → ENDGAME trade: ' + egScored[0]?.name + ' (val=' + egScored[0]?.val + ' cost=' + egTradeCost + ')');
            return pick(tradeIdx);
          }
        }
      }
      if (playCardIdx >= 0) {
        const subWf = opts[playCardIdx] || {};
        const hand = subWf.cards?.length > 0 ? subWf.cards : cardsInHand;
        const payOpts = subWf.paymentOptions || {};
        const extraMC = (payOpts.heat ? heat : 0) + (payOpts.lunaTradeFederationTitanium ? titanium * (state?.thisPlayer?.titaniumValue || 3) : 0);
        const totalBudget = mc + extraMC;
        // In endgame: prioritize VP cards, play anything affordable with VP
        const affordable = hand`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 78 — endgame colony trade');
    applied++;
  } else {
    console.log('SKIP: Fix 78 (pattern not found)');
  }
}

// ===== Fix 79: Colony bonus in scoreColonyTrade (tm-brain.js) =====
// This fix patches tm-brain.js separately
{
  const brainFile = process.argv[3] || 'tm-brain.js';
  let brain = fs.readFileSync(brainFile, 'utf8');

  const old = `  function scoreColonyTrade(colony, state) {
    var name = colony.name || colony;
    var pos = colony.trackPosition != null ? colony.trackPosition : 3;
    var tp = (state && state.thisPlayer) || {};
    var tableau = tp.tableau || [];
    var tableauNames = new Set(tableau.map(function(c) { return c.name || c; }));

    var data = COLONY_TRADE[name];
    if (!data) return pos;

    var qty = data.qty[Math.min(pos, data.qty.length - 1)];

    var mcPerUnit;
    switch (data.res) {
      case 'mc':         mcPerUnit = 1; break;
      case 'steel':      mcPerUnit = tp.steelValue || 2; break;
      case 'titanium':   mcPerUnit = tp.titaniumValue || 3; break;
      case 'cards':      mcPerUnit = tp.cardCost || 3; break;
      case 'plants':     mcPerUnit = 1.5; break;
      case 'energy':     mcPerUnit = 0.6; break;
      case 'heat':       mcPerUnit = 0.4; break;
      case 'production': mcPerUnit = 8; break;
      case 'animals':
        mcPerUnit = hasVPCard(tableauNames, ANIMAL_VP_CARDS) ? 5 : 1; break;
      case 'microbes':
        mcPerUnit = hasVPCard(tableauNames, MICROBE_VP_CARDS) ? 2.5 : 0.5; break;
      case 'floaters':
        mcPerUnit = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 3 : 0.5; break;
      default: mcPerUnit = 1;
    }

    return qty * mcPerUnit;
  }`;

  const replacement = `  function scoreColonyTrade(colony, state) {
    var name = colony.name || colony;
    var pos = colony.trackPosition != null ? colony.trackPosition : 3;
    var tp = (state && state.thisPlayer) || {};
    var tableau = tp.tableau || [];
    var tableauNames = new Set(tableau.map(function(c) { return c.name || c; }));

    var data = COLONY_TRADE[name];
    if (!data) return pos;

    var qty = data.qty[Math.min(pos, data.qty.length - 1)];

    var mcPerUnit;
    switch (data.res) {
      case 'mc':         mcPerUnit = 1; break;
      case 'steel':      mcPerUnit = tp.steelValue || 2; break;
      case 'titanium':   mcPerUnit = tp.titaniumValue || 3; break;
      case 'cards':      mcPerUnit = tp.cardCost || 3; break;
      case 'plants':     mcPerUnit = 1.5; break;
      case 'energy':     mcPerUnit = 0.6; break;
      case 'heat':       mcPerUnit = 0.4; break;
      case 'production': mcPerUnit = 8; break;
      case 'animals':
        mcPerUnit = hasVPCard(tableauNames, ANIMAL_VP_CARDS) ? 5 : 1; break;
      case 'microbes':
        mcPerUnit = hasVPCard(tableauNames, MICROBE_VP_CARDS) ? 2.5 : 0.5; break;
      case 'floaters':
        mcPerUnit = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 3 : 0.5; break;
      default: mcPerUnit = 1;
    }

    var tradeValue = qty * mcPerUnit;

    // Colony bonus: each of our colonies on this planet gives bonus resources when trading
    var myColor = tp.color;
    var colonyColors = colony.colonies || [];
    if (myColor && colonyColors.length > 0) {
      var myColonies = 0;
      for (var ci = 0; ci < colonyColors.length; ci++) {
        if (colonyColors[ci] === myColor) myColonies++;
      }
      if (myColonies > 0) {
        // Colony bonus MC values (base, without VP card synergy)
        // Energy ~1.7/MC, steel ~1.8/MC, titanium ~2.5/MC, card ~4 MC, heat ~0.8/MC
        var COLONY_BONUS_MC = {
          Luna: 2, Callisto: 5.1, Ceres: 3.6, Io: 1.6,
          Ganymede: 1.5, Europa: 1, Triton: 2.5, Pluto: 3,
          Miranda: 4, Titan: 2.5, Enceladus: 2
        };
        // Boost for VP-relevant resources on colonies (floaters/microbes/animals worth more)
        if (name === 'Miranda' && hasVPCard(tableauNames, ANIMAL_VP_CARDS)) COLONY_BONUS_MC.Miranda = 5;
        if (name === 'Titan' && hasVPCard(tableauNames, FLOATER_VP_CARDS)) COLONY_BONUS_MC.Titan = 3;
        if (name === 'Enceladus' && hasVPCard(tableauNames, MICROBE_VP_CARDS)) COLONY_BONUS_MC.Enceladus = 2.5;
        tradeValue += myColonies * (COLONY_BONUS_MC[name] || 1);
      }
    }

    return tradeValue;
  }`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    fs.writeFileSync(brainFile, brain);
    console.log('OK: Fix 79 — colony bonus in scoreColonyTrade (tm-brain.js)');
    applied++;
  } else {
    console.log('SKIP: Fix 79 (pattern not found in tm-brain.js)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied');
