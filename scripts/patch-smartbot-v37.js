/**
 * patch-smartbot-v37.js — Three improvements for smartbot
 *
 * Fix 99: Earlier colony building (gen 1-5: before low-threshold trades)
 * Fix 100: Aggressive dead card selling (gen 6+, EV < -3, sell even 1 card)
 * Fix 101: Lower trade threshold in early game (tradeCost + 1 in gen 1-5)
 *
 * Usage: node patch-smartbot-v37.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 99: Earlier colony building =====
// Move colony build (gen <= 5) BEFORE the low-threshold trade fallback
// Current order: ...SP fallback → low trade → colony → delegate
// New order: ...SP fallback → colony (gen<=5) → low trade → colony (gen>5) → delegate

const colonyEarlyOld = `    // SP fallback when globals still far (only if timing allows)
    if (spAvailable && steps > 12 && pushGlobe) return pick(stdProjIdx);

    // Trade colonies (lower threshold)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) return pick(tradeIdx);

    // Build colony (production bonus + trade income ≈ 10-15 MC)
    // Build early for max trade value over remaining gens
    if (colonyIdx >= 0 && mc >= 17 && gen <= 10) return pick(colonyIdx);
    // Late game: only build if very affordable
    if (colonyIdx >= 0 && mc >= 25) return pick(colonyIdx);`;

const colonyEarlyNew = `    // SP fallback when globals still far (only if timing allows)
    if (spAvailable && steps > 12 && pushGlobe) return pick(stdProjIdx);

    // Fix 99: Early colony building — colonies compound, build before wasting MC on marginal trades
    if (colonyIdx >= 0 && mc >= 17 && gen <= 5) {
      console.log('    → EARLY colony build (gen=' + gen + ' mc=' + mc + ')');
      return pick(colonyIdx);
    }

    // Trade colonies (lower threshold)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) return pick(tradeIdx);

    // Build colony (mid-game: still worth it for trade income)
    if (colonyIdx >= 0 && mc >= 17 && gen <= 10) return pick(colonyIdx);
    // Late game: only build if very affordable
    if (colonyIdx >= 0 && mc >= 25) return pick(colonyIdx);`;

if (code.includes(colonyEarlyOld)) {
  code = code.replace(colonyEarlyOld, colonyEarlyNew);
  fixes++;
  console.log('Fix 99 applied: early colony building (gen <= 5)');
} else {
  console.log('Fix 99 SKIPPED: colony pattern not found');
}


// ===== Fix 100: Aggressive dead card selling =====
// Current: sell only if ev < -8 AND deadCards >= 2 AND gen >= 5
// New: gen 6+: sell if ev < -3 AND deadCards >= 1

const sellOld = `    // Proactive sell: dump dead-weight cards in mid/late game
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
          console.log('    → SELL ' + deadCards.length + ' dead cards (EV<-8)');
          state._preferredSellCards = deadCards.map(c => c.name);
          return pick(sellIdx);
        }
      }`;

const sellNew = `    // Proactive sell: dump dead-weight cards in mid/late game
    // Fix 100: more aggressive selling — gen 6+ sell EV<-3 cards (even 1)
    if (sellIdx >= 0) {
      const sellGen = state?.game?.generation ?? 5;
      const sellSteps = remainingSteps(state);
      if (sellGen >= 5 && sellSteps > 0) {
        const sellHand = cardsInHand || [];
        const sellThreshold = sellGen >= 6 ? -3 : -8;
        const sellMinCount = sellGen >= 6 ? 1 : 2;
        const deadCards = sellHand.filter(c => {
          if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) return false;
          if ((STATIC_VP[c.name] ?? 0) > 0) return false;
          const ev = scoreCard(c, state);
          return ev < sellThreshold;
        });
        if (deadCards.length >= sellMinCount) {
          console.log('    → SELL ' + deadCards.length + ' dead cards (EV<' + sellThreshold + ')');
          state._preferredSellCards = deadCards.map(c => c.name);
          return pick(sellIdx);
        }
      }`;

if (code.includes(sellOld)) {
  code = code.replace(sellOld, sellNew);
  fixes++;
  console.log('Fix 100 applied: aggressive dead card selling (gen 6+, EV<-3)');
} else {
  console.log('Fix 100 SKIPPED: sell pattern not found');
}


// ===== Fix 101: Lower trade threshold in early game =====
// Current: bestTradeVal >= tradeCost + 3 (net 3 MC minimum)
// New: gen 1-5: tradeCost + 1, gen 6+: tradeCost + 3 (unchanged)

const tradeOld = `        if (bestTradeVal >= tradeCost + 3) return pick(tradeIdx);`;

const tradeNew = `        const tradeMinProfit = gen <= 5 ? 1 : 3;
        if (bestTradeVal >= tradeCost + tradeMinProfit) return pick(tradeIdx);`;

if (code.includes(tradeOld)) {
  code = code.replace(tradeOld, tradeNew);
  fixes++;
  console.log('Fix 101 applied: lower trade threshold gen 1-5 (net >= 1 MC)');
} else {
  console.log('Fix 101 SKIPPED: trade threshold pattern not found');
}


if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/3 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
