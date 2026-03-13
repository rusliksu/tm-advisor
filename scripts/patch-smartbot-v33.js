#!/usr/bin/env node
// patch-smartbot-v33.js
// Fix 88: EV-based blue action sort (replace categorical)
// Currently: VP accum > Dynamic VP > VP > Prod/Engine > resources
// Better: use MANUAL_EV perGen as primary sort, fall back to VP category
//
// Fix 89: Proactive card selling in mid-game (gen 6-10)
// Currently: bot only sells when forced (discard phase)
// Fix: after card play, if hand has cards with EV < -5, sell them (1 MC each)
// This frees MC for better buys and reduces dead weight

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
const brainFile = process.argv[3] || 'tm-brain.js';
let code = fs.readFileSync(file, 'utf8');
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 88: EV-based blue action sort =====
{
  const old = `    // Blue card action: VP accumulators first, then economy, then by resources
    if (wf.selectBlueCardAction) {
      const active = cards.filter(c => !c.isDisabled);
      const pool = active.length > 0 ? active : cards;
      const sorted = [...pool].sort((a, b) => {
        // Priority 1: per_resource VP accumulators (each action = VP)
        const aPerRes = CARD_VP[a.name]?.type === 'per_resource' ? 1 : 0;
        const bPerRes = CARD_VP[b.name]?.type === 'per_resource' ? 1 : 0;
        if (aPerRes !== bPerRes) return bPerRes - aPerRes;
        // Priority 2: Dynamic VP cards (Ants, Birds, etc.)
        const aDyn = DYNAMIC_VP_CARDS.has(a.name) ? 1 : 0;
        const bDyn = DYNAMIC_VP_CARDS.has(b.name) ? 1 : 0;
        if (aDyn !== bDyn) return bDyn - aDyn;
        // Priority 3: VP cards
        const aVP = VP_CARDS.has(a.name) ? 1 : 0;
        const bVP = VP_CARDS.has(b.name) ? 1 : 0;
        if (aVP !== bVP) return bVP - aVP;
        // Priority 4: production/engine cards
        const aProd = (PROD_CARDS.has(a.name) || ENGINE_CARDS.has(a.name)) ? 1 : 0;
        const bProd = (PROD_CARDS.has(b.name) || ENGINE_CARDS.has(b.name)) ? 1 : 0;
        if (aProd !== bProd) return bProd - aProd;
        // Tiebreaker: resources on card
        return (b.resources || 0) - (a.resources || 0);
      });
      return { type: 'card', cards: [sorted[0].name] };
    }`;

  const replacement = `    // Blue card action: EV-based sort using MANUAL_EV + VP category
    if (wf.selectBlueCardAction) {
      const active = cards.filter(c => !c.isDisabled);
      const pool = active.length > 0 ? active : cards;
      const stepsNow = remainingSteps(state);
      const vpMCNow = stepsNow <= 12 ? 7 : (stepsNow <= 24 ? 5 : 3);
      const sorted = [...pool].sort((a, b) => {
        let aEV = 0, bEV = 0;
        // VP accumulators: each activation = fractional VP (e.g. 1/2 VP for 2:1 ratio)
        const aVPInfo = CARD_VP[a.name];
        const bVPInfo = CARD_VP[b.name];
        if (aVPInfo?.type === 'per_resource') aEV += vpMCNow / (aVPInfo.per || 1);
        if (bVPInfo?.type === 'per_resource') bEV += vpMCNow / (bVPInfo.per || 1);
        // MANUAL_EV perGen as action value estimate
        const aManual = MANUAL_EV[a.name];
        const bManual = MANUAL_EV[b.name];
        if (aManual?.perGen) aEV += aManual.perGen;
        if (bManual?.perGen) bEV += bManual.perGen;
        // Dynamic VP bonus
        if (DYNAMIC_VP_CARDS.has(a.name)) aEV += 3;
        if (DYNAMIC_VP_CARDS.has(b.name)) bEV += 3;
        // Fallback for cards not in MANUAL_EV: small base value
        if (aEV === 0) aEV = (PROD_CARDS.has(a.name) || ENGINE_CARDS.has(a.name)) ? 1.5 : 0.5;
        if (bEV === 0) bEV = (PROD_CARDS.has(b.name) || ENGINE_CARDS.has(b.name)) ? 1.5 : 0.5;
        return bEV - aEV;
      });
      return { type: 'card', cards: [sorted[0].name] };
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 88 — EV-based blue action sort (MANUAL_EV + VP accum value)');
    applied++;
  } else {
    console.log('SKIP: Fix 88 (pattern not found)');
  }
}

// ===== Fix 89: Proactive mid-game sell =====
// After card play decision, if sell option is available and hand has dead cards, sell them
// Insert after the blue actions block and before trade
{
  const old = `    // Trade colonies (high-value trades first)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {`;

  const replacement = `    // Proactive sell: dump dead-weight cards in mid/late game
    if (sellIdx >= 0) {
      const sellGen = state?.game?.generation ?? 5;
      const sellSteps = remainingSteps(state);
      if (sellGen >= 5 && sellSteps > 0) {
        const sellHand = cardsInHand || [];
        const deadCards = sellHand.filter(c => {
          if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) return false;
          if ((STATIC_VP[c.name] ?? 0) > 0) return false;
          const ev = scoreCard(c, state);
          // Sell if net EV is very negative (card will never be worth playing)
          return ev < -8;
        });
        if (deadCards.length >= 2) {
          console.log('    \\u2192 SELL ' + deadCards.length + ' dead cards (EV<-8)');
          state._preferredSellCards = deadCards.map(c => c.name);
          return pick(sellIdx);
        }
      }
    }

    // Trade colonies (high-value trades first)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 89 — proactive mid-game sell of dead-weight cards (EV < -8)');
    applied++;
  } else {
    console.log('SKIP: Fix 89 (pattern not found)');
  }
}

// ===== Fix 88b: Export MANUAL_EV from tm-brain.js =====
{
  const old = `    STATIC_VP: STATIC_VP,
    PAY_ZERO: PAY_ZERO,`;
  const replacement = `    STATIC_VP: STATIC_VP,
    PAY_ZERO: PAY_ZERO,
    MANUAL_EV: MANUAL_EV,`;
  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 88b — export MANUAL_EV from TM_BRAIN');
    applied++;
  } else {
    console.log('SKIP: Fix 88b (pattern not found)');
  }
}

// ===== Fix 88c: Import MANUAL_EV in smartbot.js =====
{
  const old = `  STATIC_VP, PAY_ZERO,`;
  const replacement = `  STATIC_VP, PAY_ZERO, MANUAL_EV,`;
  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 88c — import MANUAL_EV in smartbot.js');
    applied++;
  } else {
    console.log('SKIP: Fix 88c (pattern not found)');
  }
}

fs.writeFileSync(file, code);
fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied');
