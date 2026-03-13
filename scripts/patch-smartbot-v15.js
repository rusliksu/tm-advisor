/**
 * patch-smartbot-v15.js — VP accumulator priority + card play threshold
 *
 * Fix 51: VP accumulator actions in normal mode — activate VP accumulators
 *         (Birds, Fish, Livestock, etc.) before playing weak cards (EV < 8)
 * Fix 52: Minimum card play threshold — don't play cards with very low EV
 *         when better actions exist (blue cards, trade)
 * Fix 53: Trade before weak cards — trade with good colonies before playing EV<5 cards
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

// Fix 51: VP accumulator priority in normal mode
// Before the card vs SP competition, check if we have VP accumulators
// Each Birds/Fish/Livestock activation ≈ 2.5 VP = ~8-12 MC value
// This should beat playing a marginal card with EV < 8
replace('VP accum before weak cards',
  `    // === CARD vs SP COMPETITION ===
    // Cards and Standard Projects compete on EV. Best action wins.`,
  `    // VP accumulator actions: each activation ≈ 2.5 VP (free!)
    // Priority: activate VP accumulators before playing marginal cards
    if (cardActionIdx >= 0) {
      const actOpt0 = opts[cardActionIdx];
      const actCards0 = actOpt0?.cards || [];
      const vpAccumCards = actCards0.filter(c => !c.isDisabled && CARD_VP[c.name]?.type === 'per_resource');
      if (vpAccumCards.length > 0) {
        // VP accum value ≈ 2.5 VP ≈ 8-12 MC depending on game stage
        const vpAccumEV = steps > 20 ? 8 : (steps > 10 ? 10 : 12);
        // Only skip if we have a clearly better card or SP
        // Peek at best card EV to decide
        const subWfPeek = opts[playCardIdx] || {};
        const handPeek = subWfPeek.cards?.length > 0 ? subWfPeek.cards : cardsInHand;
        const bestHandEV = handPeek.length > 0
          ? Math.max(...handPeek.filter(c => !c.isDisabled).map(c => scoreCard(c, state) + (VP_CARDS.has(c.name) ? 8 : 0) + (CITY_CARDS.has(c.name) ? 7 : 0)))
          : -999;
        if (bestHandEV < vpAccumEV) {
          console.log('    → VP accum priority (accum=' + vpAccumEV + ' bestCard=' + bestHandEV.toFixed(0) + ')');
          return pick(cardActionIdx);
        }
      }
    }

    // === CARD vs SP COMPETITION ===
    // Cards and Standard Projects compete on EV. Best action wins.`
);

// Fix 52: Raise minimum card play EV threshold
// Currently cards with EV >= 0 get played. But EV=1 card wastes an action
// when blue card activations or trades are available.
replace('card play minimum EV',
  `    // Card is only option (SP not available/affordable)
    if (bestCard && bestCardEV >= 0) {`,
  `    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    if (bestCard && bestCardEV >= 3) {`
);

// Fix 53: Trade after card play but before low-EV fallback
// Move colony trade to higher priority (before SP fallback and colony build)
// Already exists at line ~457, but with high threshold. Add another check
// with lower threshold after card play fails.
// Actually, let's just lower the bar for "Card is only option" and let trade
// naturally get priority. Fix 52 already handles this by raising threshold to 3.

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
