/**
 * patch-smartbot-v11.js — Safe endgame + SP fixes
 *
 * Fix 33: Venus completion check — don't try air scrapping when Venus maxed
 * Fix 35: City SP less conservative — allow in late game regardless of plant prod
 * Fix 38: Venus check in SP EV competition — don't count air scrapping if Venus done
 * Fix 39: Endgame card actions — VP accumulators BEFORE SP (only VP, not all actions)
 * Fix 40: Endgame Venus check — don't try air scrapping if Venus maxed
 *
 * REVERTED from original v11 (hurt performance):
 *   Fix 34: endgame threshold steps<=8 (caused early game end, -7 VP)
 *   Fix 36: delegate restriction (minor, no clear benefit)
 *   Fix 37: greenery reserve 23 MC (locked MC, prevented good card plays)
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

// Fix 33: Venus completion check in normal SP priority
replace('venus check in SP priority',
  `      const spPriority = [
        !tempDone && { kw: 'asteroid', cost: 14 + reds },
        !oceansDone && { kw: 'aquifer', cost: 18 + reds },
        { kw: 'air scrapping', cost: 15 + reds },
        !o2Done && { kw: 'greenery', cost: 23 + reds },
      ].filter(Boolean);`,
  `      const venusDone = (g.venusScaleLevel ?? 0) >= 30;
      const spPriority = [
        !tempDone && { kw: 'asteroid', cost: 14 + reds },
        !oceansDone && { kw: 'aquifer', cost: 18 + reds },
        !venusDone && { kw: 'air scrapping', cost: 15 + reds },
        !o2Done && { kw: 'greenery', cost: 23 + reds },
      ].filter(Boolean);`
);

// Fix 35: City SP less conservative in late game
replace('city SP endgame',
  `      if (city && mc >= 25 && (citiesPlaced === 0 || (state?.thisPlayer?.plantProduction ?? 0) >= 3)) {`,
  `      const spSteps = remainingSteps(state);
      const spRate = Math.max(4, Math.min(8, (state?.players?.length || 3) * 2));
      const spGensLeft = Math.max(1, Math.ceil(spSteps / spRate));
      if (city && mc >= 25 && (citiesPlaced === 0 || spGensLeft <= 3 || (state?.thisPlayer?.plantProduction ?? 0) >= 2)) {`
);

// Fix 38: Venus done check in SP EV competition (normal mode)
replace('venus done in SP EV',
  `      bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15); // air scrapping (Venus)`,
  `      const venusDone2 = (gm.venusScaleLevel ?? 0) >= 30;
      if (!venusDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15); // air scrapping (Venus)`
);

// Fix 39: In endgame, VP accumulators (per_resource VP) BEFORE SP
// Don't move ALL card actions before SP — only VP accumulators are worth it
replace('endgame VP accumulators first',
  `    if (endgameMode) {
      // SP for remaining globals + city
      if (stdProjIdx >= 0) {`,
  `    if (endgameMode) {
      // VP accumulators (Birds, Fish, Livestock, etc.) before SP — each activation = 1 VP
      if (cardActionIdx >= 0) {
        const actOpt = opts[cardActionIdx];
        const actCards = actOpt?.cards || [];
        const hasVPAccum = actCards.some(c => !c.isDisabled && CARD_VP[c.name]?.type === 'per_resource');
        if (hasVPAccum) return pick(cardActionIdx);
      }
      // SP for remaining globals + city
      if (stdProjIdx >= 0) {`
);

// Fix 40: Venus check in endgame SP
replace('endgame venus check',
  `        USEFUL.push('air scrapping', 'city');`,
  `        if ((gm.venusScaleLevel ?? 0) < 30) USEFUL.push('air scrapping');
        USEFUL.push('city');`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
