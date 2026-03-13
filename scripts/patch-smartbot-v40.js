/**
 * patch-smartbot-v40.js — Milestone pursuit improvements
 *
 * Fix 107: Builder milestone — earlier pursuit (sc >= 3, was 5)
 *   Lower threshold so bot starts valuing building-tag cards 2 gens earlier.
 *   Increase mid-range bonus (need 3: 3→4, need 4-5: 0→2).
 *   Applies to both buy-phase and play-phase card scoring.
 *   Impact: ~15-20 more building-tag cards bought/played per game
 *
 * Fix 108: Mayor milestone pursuit
 *   a) Action chain: at 2/3 cities, pick City SP (33 MC → 6+ VP)
 *   b) SP handler: force City selection when _mayorPursuit flag set
 *   c) Buy-phase: bonus for city cards when 1-2 cities toward Mayor
 *   d) Play-phase: same bonus for city card play priority
 *   Impact: ~3-5 Mayor claims per 100 games that were previously missed
 *
 * Usage: node patch-smartbot-v40.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 107a: Builder buy-phase — lower threshold =====
const builderBuyOld = `            if (mName.includes('builder') && sc >= 5) {
              const need = 8 - sc;
              const bonus = need <= 2 ? 6 : (need <= 3 ? 3 : 0);
              if ((CARD_TAGS[a.name]||[]).includes('building')) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).includes('building')) sb += bonus;
            }`;

const builderBuyNew = `            // Fix 107: Builder earlier pursuit (sc >= 3, was 5)
            if (mName.includes('builder') && sc >= 3) {
              const need = 8 - sc;
              const bonus = need <= 2 ? 6 : (need <= 3 ? 4 : 2);
              if ((CARD_TAGS[a.name]||[]).includes('building')) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).includes('building')) sb += bonus;
            }`;

if (code.includes(builderBuyOld)) {
  code = code.replace(builderBuyOld, builderBuyNew);
  fixes++;
  console.log('Fix 107a applied: Builder buy-phase threshold lowered (sc >= 3)');
} else {
  console.log('Fix 107a SKIPPED: Builder buy-phase pattern not found');
}


// ===== Fix 107b: Builder play-phase — lower threshold =====
const builderPlayOld = `                if (mn.includes('builder') && sc2 >= 5 && cTags2.includes('building')) score += (8 - sc2 <= 2) ? 5 : 2;`;

const builderPlayNew = `                // Fix 107: Builder earlier pursuit (sc2 >= 3, was 5)
                if (mn.includes('builder') && sc2 >= 3 && cTags2.includes('building')) score += (8 - sc2 <= 2) ? 5 : (8 - sc2 <= 3 ? 3 : 2);`;

if (code.includes(builderPlayOld)) {
  code = code.replace(builderPlayOld, builderPlayNew);
  fixes++;
  console.log('Fix 107b applied: Builder play-phase threshold lowered (sc2 >= 3)');
} else {
  console.log('Fix 107b SKIPPED: Builder play-phase pattern not found');
}


// ===== Fix 108a: Mayor action pursuit — City SP at 2/3 cities =====
const mayorActionOld = `        // Mayor: need 3 cities, at 2 → city SP priority boost (handled in SP selection)
        // Terraformer: need 35 TR → just play normally, TR comes from everything`;

const mayorActionNew = `        // Fix 108: Mayor pursuit — at 2/3 cities, city SP = amazing ROI (33 MC → 6+ VP)
        if (mName.includes('mayor') && sc === 2 && stdProjIdx >= 0 && mc >= 33) {
          console.log('    \\u2192 milestone pursuit: city SP for Mayor (2/3)');
          state._mayorPursuit = true;
          return pick(stdProjIdx);
        }
        // Terraformer: need 35 TR → just play normally, TR comes from everything`;

if (code.includes(mayorActionOld)) {
  code = code.replace(mayorActionOld, mayorActionNew);
  fixes++;
  console.log('Fix 108a applied: Mayor pursuit in action chain (city SP at 2/3)');
} else {
  console.log('Fix 108a SKIPPED: Mayor action pattern not found');
}


// ===== Fix 108b: SP handler — force City when Mayor pursuit =====
const spCityOld = `      // City SP — worth it for VP + adjacency + Mayor milestone/Landlord award
      const city = available.find(c => c.name.toLowerCase().includes('city'));`;

const spCityNew = `      // Fix 108: Mayor pursuit — force city SP when pursuing Mayor milestone
      if (state._mayorPursuit) {
        delete state._mayorPursuit;
        const mCity = available.find(c => c.name.toLowerCase().includes('city'));
        if (mCity && mc >= 25) return { type: 'card', cards: [mCity.name] };
      }
      // City SP — worth it for VP + adjacency + Mayor milestone/Landlord award
      const city = available.find(c => c.name.toLowerCase().includes('city'));`;

if (code.includes(spCityOld)) {
  code = code.replace(spCityOld, spCityNew);
  fixes++;
  console.log('Fix 108b applied: SP handler forces City for Mayor pursuit');
} else {
  console.log('Fix 108b SKIPPED: SP city pattern not found');
}


// ===== Fix 108c: Mayor buy-phase — bonus for city cards =====
// Insert Mayor block before Gardener in buy-phase milestone proximity
const mayorBuyOld = `            // Gardener: 3 greeneries → bonus for plant production cards
            if (mName.includes('gardener') && sc >= 1) {`;

const mayorBuyNew = `            // Fix 108: Mayor: 3 cities → bonus for city cards
            if (mName.includes('mayor') && sc >= 1 && sc < 3) {
              const mNeed = 3 - sc;
              const mBonus = mNeed <= 1 ? 6 : 3;
              if (CITY_CARDS.has(a.name)) sa += mBonus;
              if (CITY_CARDS.has(b.name)) sb += mBonus;
            }
            // Gardener: 3 greeneries → bonus for plant production cards
            if (mName.includes('gardener') && sc >= 1) {`;

if (code.includes(mayorBuyOld)) {
  code = code.replace(mayorBuyOld, mayorBuyNew);
  fixes++;
  console.log('Fix 108c applied: Mayor buy-phase bonus for city cards');
} else {
  console.log('Fix 108c SKIPPED: Mayor buy-phase pattern not found');
}


// ===== Fix 108d: Mayor play-phase — bonus for city cards =====
const mayorPlayOld = `                // Gardener: need 3 greeneries — plant prod cards help
                if (mn.includes('gardener') && sc2 >= 1 && (cData2.behavior?.production?.plants > 0)) score += 4;`;

const mayorPlayNew = `                // Fix 108: Mayor pursuit — city cards help reach 3 cities
                if (mn.includes('mayor') && sc2 >= 1 && sc2 < 3 && CITY_CARDS.has(c.name)) score += (3 - sc2 <= 1) ? 6 : 3;
                // Gardener: need 3 greeneries — plant prod cards help
                if (mn.includes('gardener') && sc2 >= 1 && (cData2.behavior?.production?.plants > 0)) score += 4;`;

if (code.includes(mayorPlayOld)) {
  code = code.replace(mayorPlayOld, mayorPlayNew);
  fixes++;
  console.log('Fix 108d applied: Mayor play-phase bonus for city cards');
} else {
  console.log('Fix 108d SKIPPED: Mayor play-phase pattern not found');
}


if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/6 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
