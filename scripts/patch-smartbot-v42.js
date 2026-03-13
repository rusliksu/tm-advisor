/**
 * patch-smartbot-v42.js — Draft self-synergy + smarter sell timing
 *
 * Fix 112: Draft self-corp synergy + tag concentration
 *   Draft scoring was missing self-corp bonus (Point Luna → earth +3)
 *   and tag concentration bonus (3+ tags → +2 per matching tag).
 *   Buy-phase sort had these bonuses but draft didn't — ~48 draft picks/game improved.
 *
 * Fix 111: Gen-dependent sell threshold
 *   Gen 5-7: EV < -8, 2+ cards (unchanged)
 *   Gen 8+: EV < -5, 1+ cards (cards this bad will never be played with 4-5 gens left)
 *   v37 used gen 6+ EV < -3 min 1 (too aggressive). This is more conservative.
 *
 * Usage: node patch-smartbot-v42.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 112: Draft self-corp synergy + tag concentration =====
const draftOld = `        for (const _ot of _oppCorpTags) {
          if (cTags.includes(_ot)) denyBonus += 3;
        }
        return { name: c.name, score: myEV + denyBonus };`;

const draftNew = `        for (const _ot of _oppCorpTags) {
          if (cTags.includes(_ot)) denyBonus += 3;
        }
        // Fix 112: Self-corp synergy + tag concentration in draft
        let selfBonus = 0;
        const _myCorp = (state?.thisPlayer?.tableau || [])[0]?.name || '';
        const _SELF_TAG = {
          'Point Luna': 'earth', 'Teractor': 'earth', 'Saturn Systems': 'jovian',
          'Celestic': 'venus', 'Morning Star Inc.': 'venus', 'Aphrodite': 'venus',
          'Splice': 'microbe', 'Arklight': 'animal', 'Interplanetary Cinematics': 'event',
          'PhoboLog': 'space', 'Crescent Research Association': 'science',
        };
        const _myCorpTag = _SELF_TAG[_myCorp];
        if (_myCorpTag && cTags.includes(_myCorpTag)) selfBonus += 3;
        const _draftMyTags = state?.thisPlayer?.tags || {};
        for (const _t of cTags) { if ((_draftMyTags[_t] || 0) >= 3) selfBonus += 2; }
        return { name: c.name, score: myEV + denyBonus + selfBonus };`;

if (code.includes(draftOld)) {
  code = code.replace(draftOld, draftNew);
  fixes++;
  console.log('Fix 112 applied: draft self-corp synergy + tag concentration');
} else {
  console.log('Fix 112 SKIPPED: draft pattern not found');
}


// ===== Fix 111: Gen-dependent sell threshold =====
const sellOld = `          const ev = scoreCard(c, state);
          // Sell if net EV is very negative (card will never be worth playing)
          return ev < -8;
        });
        if (deadCards.length >= 2) {
          console.log('    \\u2192 SELL ' + deadCards.length + ' dead cards (EV<-8)');`;

const sellNew = `          const ev = scoreCard(c, state);
          // Fix 111: gen-dependent sell — more aggressive in gen 8+
          return ev < (sellGen >= 8 ? -5 : -8);
        });
        const _sellMin = sellGen >= 8 ? 1 : 2;
        if (deadCards.length >= _sellMin) {
          console.log('    \\u2192 SELL ' + deadCards.length + ' dead cards (EV<' + (sellGen >= 8 ? -5 : -8) + ' gen=' + sellGen + ')');`;

if (code.includes(sellOld)) {
  code = code.replace(sellOld, sellNew);
  fixes++;
  console.log('Fix 111 applied: gen-dependent sell threshold (gen 8+: EV<-5, min 1)');
} else {
  console.log('Fix 111 SKIPPED: sell pattern not found');
}


if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/2 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
