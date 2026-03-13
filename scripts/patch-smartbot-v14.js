/**
 * patch-smartbot-v14.js — Endgame timing + award proximity + corp-specific ratings
 *
 * Fix 48: Endgame timing — use shouldPushGlobe() to gate heat/greenery conversions
 *         and SP terraforming. Don't close globals when behind in danger zone.
 * Fix 49: Award proximity in card buying — bonus for cards advancing award position
 * Fix 50: Suppress worst corps — boost rating penalty for consistently bad corps
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

// Fix 48: Endgame timing — gate greenery/heat by shouldPushGlobe
// In danger zone (steps <= 8) and behind, DON'T convert heat or place greenery
// (saves a generation of engine value). Greenery still gives 1 VP, but closing
// the game costs much more VP from lost production.
replace('endgame timing for greenery/heat',
  `    // Free conversions — always do (TR + VP for greenery, TR for heat)
    // Ecoline needs only 7 plants for greenery
    const corp = (state?.thisPlayer?.tableau || [])[0]?.name || '';
    const plantsNeeded = corp === 'EcoLine' ? 7 : 8;
    // Greenery: always convert — even under Reds (greenery VP is worth it)
    if (greeneryIdx >= 0 && plants >= plantsNeeded) return pick(greeneryIdx);
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) return pick(heatIdx);`,
  `    // Free conversions — gated by endgame timing
    const corp = (state?.thisPlayer?.tableau || [])[0]?.name || '';
    const plantsNeeded = corp === 'EcoLine' ? 7 : 8;
    const pushGlobe = shouldPushGlobe(state);
    const gm0 = state?.game || {};
    const o2Done = (gm0.oxygenLevel ?? 0) >= 14;
    const tempDone = (gm0.temperature ?? -30) >= 8;
    // Greenery: always gives 1 VP, but raises O2 (closes game)
    // In danger zone + behind: only place if O2 already maxed (free VP, no globe push)
    if (greeneryIdx >= 0 && plants >= plantsNeeded) {
      if (pushGlobe || o2Done) return pick(greeneryIdx);
      // Not pushing globe: skip greenery to extend game (save ~5-10 VP from extra gen)
      console.log('    → TIMING: skip greenery (steps=' + steps + ' lead=' + vpLead(state) + ')');
    }
    // Heat conversion: raises temperature (closes game)
    // In danger zone + behind: skip entirely (save temp steps for opponents to close)
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) {
      if (pushGlobe || tempDone) return pick(heatIdx);
      console.log('    → TIMING: skip heat (steps=' + steps + ' lead=' + vpLead(state) + ')');
    }`
);

// Fix 48b: Gate SP terraforming by shouldPushGlobe
// When behind in danger zone, prefer cards over SP
replace('endgame timing for SP',
  `    const spAvailable = stdProjIdx >= 0 && mc >= 14 + redsTax;
    if (spAvailable) {
      const tempDone = (gm.temperature ?? -30) >= 8;
      const o2Done = (gm.oxygenLevel ?? 0) >= 14;
      const oceansDone = (gm.oceans ?? 0) >= 9;`,
  `    const spAvailable = stdProjIdx >= 0 && mc >= 14 + redsTax;
    if (spAvailable && pushGlobe) {
      const tempDone = (gm.temperature ?? -30) >= 8;
      const o2Done = (gm.oxygenLevel ?? 0) >= 14;
      const oceansDone = (gm.oceans ?? 0) >= 9;`
);

// Fix 49: Award proximity in card buying
// After milestone proximity block, add award proximity
// Cards that boost award-relevant stats get buying bonus
replace('award proximity in buy',
  `        // Milestone proximity: bonus for cards advancing unclaimed milestones`,
  `        // Award proximity: bonus for cards advancing fundable awards
        const fundedAwards2 = state?.game?.fundedAwards || [];
        if (fundedAwards2.length < 3) {
          // Check my position in key award categories
          const tp2 = state?.thisPlayer || {};
          const players2 = state?.players || [];
          const myColor2 = tp2.color;
          const awardMetrics = {
            banker: p => p.megaCreditProduction ?? 0,
            thermalist: p => (p.heat ?? 0) + (p.energy ?? 0) + (p.heatProduction ?? 0),
            miner: p => (p.steel ?? 0) + (p.titanium ?? 0) + (p.steelProduction ?? 0) + (p.titaniumProduction ?? 0),
            scientist: p => p.tags?.science ?? 0,
            landlord: p => p.citiesCount ?? 0,
          };
          for (const [aw, metricFn] of Object.entries(awardMetrics)) {
            const myVal = metricFn(tp2);
            const maxOther = Math.max(0, ...players2.filter(p => p.color !== myColor2).map(p => metricFn(p)));
            if (myVal >= maxOther - 1) {
              // I'm competitive in this award — bonus for cards that extend my lead
              if (aw === 'banker') {
                const aProd = (CARD_DATA[a.name]?.behavior?.production?.megaCredits ?? 0);
                const bProd = (CARD_DATA[b.name]?.behavior?.production?.megaCredits ?? 0);
                if (aProd > 0) sa += 3;
                if (bProd > 0) sb += 3;
              }
              if (aw === 'scientist') {
                if ((CARD_TAGS[a.name]||[]).includes('science')) sa += 2;
                if ((CARD_TAGS[b.name]||[]).includes('science')) sb += 2;
              }
              if (aw === 'miner') {
                const aSP = (CARD_DATA[a.name]?.behavior?.production?.steel ?? 0) + (CARD_DATA[a.name]?.behavior?.production?.titanium ?? 0);
                const bSP = (CARD_DATA[b.name]?.behavior?.production?.steel ?? 0) + (CARD_DATA[b.name]?.behavior?.production?.titanium ?? 0);
                if (aSP > 0) sa += 3;
                if (bSP > 0) sb += 3;
              }
              if (aw === 'landlord') {
                if (CITY_CARDS.has(a.name)) sa += 3;
                if (CITY_CARDS.has(b.name)) sb += 3;
              }
              if (aw === 'thermalist') {
                const aHP = (CARD_DATA[a.name]?.behavior?.production?.heat ?? 0) + (CARD_DATA[a.name]?.behavior?.production?.energy ?? 0);
                const bHP = (CARD_DATA[b.name]?.behavior?.production?.heat ?? 0) + (CARD_DATA[b.name]?.behavior?.production?.energy ?? 0);
                if (aHP > 0) sa += 2;
                if (bHP > 0) sb += 2;
              }
            }
          }
        }

        // Milestone proximity: bonus for cards advancing unclaimed milestones`
);

// Fix 50: Suppress worst corps by boosting rating penalties
// Polyphemos (n=17, avg 57.6) gets picked too often despite low rating
// Utopia Invest (n=8, avg 55.0) similarly bad
// Solution: in scoreCorp, add floor penalty for known-bad corps
// Actually, let's just update ratings.json.js after this patch

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
