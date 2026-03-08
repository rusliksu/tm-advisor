/**
 * patch-smartbot-v6.js — Hate-draft + endgame VP buying + Venus SP fix
 *
 * Fix 12: Hate-draft — deny strong cards to opponents based on TM_RATINGS
 * Fix 13: Endgame VP buying — still buy high-value VP cards in endgame
 * Fix 14: Venus SP check — don't air scrapping when Venus maxed
 * Fix 15: Better initial card buying — lower threshold for gen 1
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

// Fix 12: Hate-draft — consider opponent value when drafting
// Current: pure greedy scoreCard
// New: combined score = myEV + denyBonus (from TM_RATINGS)
replace('hate-draft',
  `    // Draft/keep: pick highest-scored card(s)
    if (title.includes('select a card') || title.includes('keep')) {
      const count = Math.max(1, min);
      const scored = [...cards].sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
      return { type: 'card', cards: scored.slice(0, count).map(c => c.name) };
    }`,
  `    // Draft/keep: pick highest-scored card(s) with hate-draft
    if (title.includes('select a card') || title.includes('keep')) {
      const count = Math.max(1, min);
      const scored = [...cards].map(c => {
        const myEV = scoreCard(c, state);
        // Hate-draft: deny strong cards to opponents
        // If card is highly rated (S/A tier) but mediocre for me, still take it
        const rating = TM_BRAIN.getRating ? TM_BRAIN.getRating(c.name) : null;
        const rScore = rating ? rating.s : 50;
        let denyBonus = 0;
        // Strong deny: card is S-tier (90+) and weak for me
        if (rScore >= 90 && myEV < 15) denyBonus = (rScore - 75) * 0.4;
        // Moderate deny: card is A-tier (80+) and weak for me
        else if (rScore >= 80 && myEV < 10) denyBonus = (rScore - 70) * 0.25;
        // Mild deny: card is B-tier (70+) and bad for me
        else if (rScore >= 70 && myEV < 5) denyBonus = (rScore - 65) * 0.15;
        return { name: c.name, score: myEV + denyBonus };
      }).sort((a, b) => b.score - a.score);
      if (scored[0] && scored.length > 1) {
        const best = scored[0];
        const rating = TM_BRAIN.getRating ? TM_BRAIN.getRating(best.name) : null;
        if (best.score !== scoreCard({ name: best.name }, state)) {
          console.log(\`    → Hate-draft: \${best.name} (myEV=\${scoreCard({name:best.name}, state).toFixed(1)}, deny bonus, rating=\${rating ? rating.s : '?'})\`);
        }
      }
      return { type: 'card', cards: scored.slice(0, count).map(c => c.name) };
    }`
);

// Fix 13: Endgame VP buying — buy VP cards even in endgame
replace('endgame VP buying',
  `      const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
      // In endgame: stop buying — save MC for SPs and terraforming
      if (isEndgame) return { type: 'card', cards: [] };`,
  `      const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
      // In endgame: only buy high-value VP cards (they score directly)
      if (isEndgame) {
        const vpBuys = cards.filter(c => {
          const ev = scoreCard(c, state);
          return ev >= 8 && (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name));
        }).sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
        if (vpBuys.length > 0 && mc >= (state?.thisPlayer?.cardCost ?? 3) + 10) {
          console.log(\`    → Endgame VP buy: \${vpBuys[0].name} (EV=\${scoreCard(vpBuys[0], state).toFixed(1)})\`);
          return { type: 'card', cards: [vpBuys[0].name] };
        }
        return { type: 'card', cards: [] };
      }`
);

// Fix 14: Venus SP — check if Venus is done before air scrapping
replace('venus SP check',
  `      bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 15); // air scrapping (Venus)`,
  `      const venusDone = (gm.venusScaleLevel ?? 0) >= 30;
      if (!venusDone) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 15); // air scrapping (Venus)`
);

// Fix 15: VP bonus in buy phase — dynamic instead of flat +8
replace('dynamic VP bonus in buy',
  `        if (VP_CARDS.has(a.name) || DYNAMIC_VP_CARDS.has(a.name)) sa += 8;
        if (VP_CARDS.has(b.name) || DYNAMIC_VP_CARDS.has(b.name)) sb += 8;
        if (CITY_CARDS.has(a.name)) sa += 7;
        if (CITY_CARDS.has(b.name)) sb += 7;`,
  `        // Dynamic VP bonus: VP cards more valuable early (time to accumulate)
        if (DYNAMIC_VP_CARDS.has(a.name)) sa += Math.max(2, (12 - gen)) * 1.5;
        else if (VP_CARDS.has(a.name)) sa += gen <= 5 ? 8 : (gen <= 8 ? 5 : 3);
        if (DYNAMIC_VP_CARDS.has(b.name)) sb += Math.max(2, (12 - gen)) * 1.5;
        else if (VP_CARDS.has(b.name)) sb += gen <= 5 ? 8 : (gen <= 8 ? 5 : 3);
        if (CITY_CARDS.has(a.name)) sa += 5;
        if (CITY_CARDS.has(b.name)) sb += 5;`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
