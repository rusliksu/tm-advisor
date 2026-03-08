/**
 * patch-smartbot-gameplay.js — Optimize smartbot gameplay
 *
 * Fixes:
 * 1. Endgame trigger too late (steps<=6 → steps<=12)
 * 2. SP EV undervalued (cards always win over standard projects)
 * 3. VP bonus +8 flat → dynamic based on gensLeft
 * 4. SP fallback only at steps>12 → always when affordable
 * 5. Draft threshold too low, maxBuy too high
 * 6. shouldPushGlobe integration for forced terraforming
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

// Fix 1: Earlier endgame detection (steps<=6 → steps<=12, gen>=16 → gen>=12)
replace('endgame trigger',
  "const endgameMode = steps > 0 && (steps <= 6 || gen >= 16);",
  "const endgameMode = steps > 0 && (steps <= 12 || gen >= 12);"
);

// Fix 2: SP EV formula — add full TR value (income + VP component)
replace('SP EV formula',
  `    const trMCNow = gensLeftNow + (gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7) - redsTax;
    const tempoNow = gensLeftNow >= 5 ? 7 : (gensLeftNow >= 3 ? 5 : 3);`,
  `    // TR value = remaining income + VP at end. 1 TR = gensLeft (income) + VP(gensLeft)
    const vpMCNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
    const trMCNow = gensLeftNow + vpMCNow - redsTax;
    const tempoNow = gensLeftNow >= 5 ? 8 : (gensLeftNow >= 3 ? 6 : 4);
    // Push bonus: if falling behind on terraforming, SP gets extra value
    const pushBonus = (shouldPushGlobe(state) && steps > 3) ? 5 : 0;`
);

// Fix 2b: Apply pushBonus to SP EV calculations
replace('SP asteroid EV',
  "if (!tempDone) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14); // asteroid",
  "if (!tempDone) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 14); // asteroid"
);
replace('SP aquifer EV',
  "if (!oceansDone && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18); // aquifer",
  "if (!oceansDone && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus + 2 - 18); // aquifer"
);
replace('SP air scrapping EV',
  "bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15); // air scrapping (Venus)",
  "bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 15); // air scrapping (Venus)"
);
replace('SP greenery EV',
  `        const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
        bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23); // greenery SP`,
  `        bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus + vpMCNow - 23); // greenery SP`
);

// Fix 3: VP bonus dynamic instead of flat +8
replace('VP bonus cards',
  `            if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) score += 8;
            if (CITY_CARDS.has(c.name)) score += 5;`,
  `            // Dynamic VP bonus: higher early, lower late (VP-cards need time to accumulate)
            if (DYNAMIC_VP_CARDS.has(c.name)) score += Math.max(1, gensLeftNow - 2) * 1.5;
            else if (VP_CARDS.has(c.name)) score += vpMCNow;
            if (CITY_CARDS.has(c.name)) score += 4;`
);

// Fix 4: SP fallback — remove steps>12 gate, always consider SP
replace('SP fallback gate',
  "    // SP fallback when globals still far\n    if (spAvailable && steps > 12) return pick(stdProjIdx);",
  "    // SP fallback — always do SP if affordable and globals remain\n    if (spAvailable && steps > 3) return pick(stdProjIdx);"
);

// Fix 5: Draft threshold higher, maxBuy lower late game
replace('draft threshold',
  "const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 5);",
  "const threshold = gen <= 3 ? 3 : (gen <= 6 ? 6 : 12);"
);
replace('draft maxBuy',
  "const maxBuy = gen <= 4 ? 4 : (gen <= 8 ? 4 : 3);",
  "const maxBuy = gen <= 3 ? 4 : (gen <= 6 ? 3 : 2);"
);

// Fix 5b: VP bonus in draft also dynamic
replace('draft VP bonus',
  `        if (VP_CARDS.has(a.name) || DYNAMIC_VP_CARDS.has(a.name)) sa += 8;
        if (CITY_CARDS.has(a.name)) sa += 8;`,
  `        if (DYNAMIC_VP_CARDS.has(a.name)) sa += Math.max(1, (10 - gen)) * 1.5;
        else if (VP_CARDS.has(a.name)) sa += gen <= 6 ? 5 : 3;
        if (CITY_CARDS.has(a.name)) sa += 4;`
);

// Fix 6: Heat conversion — convert even under Reds if heat >= 16
replace('heat conversion',
  "if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) return pick(heatIdx);",
  "if (heatIdx >= 0 && heat >= 8 && (mc >= redsTax || heat >= 16)) return pick(heatIdx);"
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
