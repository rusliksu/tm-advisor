/**
 * patch-smartbot-v8.js — Endgame greenery + plant production priority + hand sell + MANUAL_EV
 *
 * Fix 21: Plant production card bonus — buy plant prod cards more aggressively for greenery bomb
 * Fix 22: Endgame plant SP — buy greenery SP even when expensive if plants insufficient
 * Fix 23: Sell excess cards earlier (>6 instead of >8) to fund SPs/greeneries
 * Fix 24: In endgame, play cards sorted by VP not just EV
 */
const fs = require('fs');
const file = process.argv[2] || '/home/openclaw/terraforming-mars/smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(label, old, neu) {
  if (code.includes(old)) {
    code = code.replace(old, neu);
    changes++;
    console.log('OK: ' + label);
  } else {
    console.log('SKIP: ' + label + ' (pattern not found)');
  }
}

// Fix 21: Plant production bonus when buying cards
// In the buy phase sorting, add bonus for plant production cards in mid-game
// This helps build toward endgame greenery bombs
replace('plant prod buy bonus',
  `        if (gen <= 4 && ENGINE_CARDS.has(a.name)) sa += 6;
        if (gen <= 4 && ENGINE_CARDS.has(b.name)) sb += 6;`,
  `        if (gen <= 4 && ENGINE_CARDS.has(a.name)) sa += 6;
        if (gen <= 4 && ENGINE_CARDS.has(b.name)) sb += 6;
        // Plant production cards → greenery bombs in endgame
        const aData = CARD_DATA[a.name] || {};
        const bData = CARD_DATA[b.name] || {};
        const aPP = aData.behavior?.production?.plants;
        const bPP = bData.behavior?.production?.plants;
        if (aPP > 0 && gen <= 6) sa += aPP * 3;
        if (bPP > 0 && gen <= 6) sb += bPP * 3;`
);

// Fix 22: In endgame, greenery SP should be tried even when cards are available
// Currently endgame tries SP first but only for globals — add explicit greenery SP
// when we have MC but not enough plants
replace('endgame greenery SP',
  `      if (sellIdx >= 0 && cardsInHand.length > 0) return pick(sellIdx);
      if (passIdx >= 0) return pick(passIdx);
      return pick(0);
    }`,
  `      // Greenery SP as last resort — 23 MC for 1 VP + adjacency is better than pass
      if (stdProjIdx >= 0 && mc >= 23 && plants < plantsNeeded) {
        const gm2 = state?.game || {};
        if ((gm2.oxygenLevel ?? 0) < 14) return pick(stdProjIdx);
      }
      if (sellIdx >= 0 && cardsInHand.length > 0) return pick(sellIdx);
      if (passIdx >= 0) return pick(passIdx);
      return pick(0);
    }`
);

// Fix 23: Sell excess cards at >6 hand size (was >8)
// Smaller hand → more MC available for SPs and greeneries
replace('sell hand threshold',
  `    if (sellIdx >= 0 && cardsInHand.length > 8) return pick(sellIdx);`,
  `    if (sellIdx >= 0 && cardsInHand.length > 6) return pick(sellIdx);`
);

// Fix 24: In endgame card play, factor in VP directly
// Cards with static VP should be prioritized over pure production
replace('endgame card VP priority',
  `        if (affordable.length > 0) {
          const card = affordable[0];
          return { type: 'or', index: playCardIdx, response: { type: 'projectCard', card: card.name, payment: smartPay(card.calculatedCost || 0, state, subWf, CARD_TAGS[card.name]) } };
        }
      }
      if (sellIdx >= 0 && cardsInHand.length > 0) return pick(sellIdx);`,
  `        if (affordable.length > 0) {
          // Re-sort with VP bonus for endgame
          affordable.sort((a, b) => {
            let sa = scoreCard(a, state), sb = scoreCard(b, state);
            const aVP = CARD_VP[a.name], bVP = CARD_VP[b.name];
            if (aVP) sa += 8;
            if (bVP) sb += 8;
            if (CITY_CARDS.has(a.name)) sa += 6;
            if (CITY_CARDS.has(b.name)) sb += 6;
            return sb - sa;
          });
          const card = affordable[0];
          return { type: 'or', index: playCardIdx, response: { type: 'projectCard', card: card.name, payment: smartPay(card.calculatedCost || 0, state, subWf, CARD_TAGS[card.name]) } };
        }
      }
      if (sellIdx >= 0 && cardsInHand.length > 0) return pick(sellIdx);`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
