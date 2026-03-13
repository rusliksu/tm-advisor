/**
 * patch-smartbot-v10.js — Tag synergy + milestone pursuit + better low VP floor
 *
 * Fix 29: Tag synergy bonus in card buying — cards matching existing tags get bonus
 * Fix 30: Corp synergy — bonus for cards that match corp's specialty tags
 * Fix 31: Late-game card buy threshold — don't skip good cards late
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

// Fix 29+30: Tag synergy + corp synergy in card buy sorting
// After the plant production bonus, add tag synergy and corp match
replace('tag synergy in buy',
  `        if (aPP > 0 && gen <= 6) sa += aPP * 3;
        if (bPP > 0 && gen <= 6) sb += bPP * 3;
        return sb - sa;
      });`,
  `        if (aPP > 0 && gen <= 6) sa += aPP * 3;
        if (bPP > 0 && gen <= 6) sb += bPP * 3;
        // Tag synergy: cards matching existing tags are more valuable
        // (discounts, milestones, awards, triggers all benefit from tag concentration)
        const myTags = state?.thisPlayer?.tags || {};
        const aTags = CARD_TAGS[a.name] || [];
        const bTags = CARD_TAGS[b.name] || [];
        for (const t of aTags) { if ((myTags[t] || 0) >= 2) sa += 2; }
        for (const t of bTags) { if ((myTags[t] || 0) >= 2) sb += 2; }
        // Corp synergy: some corps benefit hugely from specific tags
        const corpName = (state?.thisPlayer?.tableau || [])[0]?.name || '';
        const CORP_TAG_BONUS = {
          'Point Luna': 'earth', 'Teractor': 'earth', 'Lakefront Resorts': 'earth',
          'Saturn Systems': 'jovian', 'Celestic': 'venus',
          'Morning Star Inc.': 'venus', 'Aphrodite': 'venus',
          'Splice': 'microbe', 'Arklight': 'animal',
          'Interplanetary Cinematics': 'event',
          'PhoboLog': 'space', 'Crescent Research Association': 'science',
        };
        const corpTag = CORP_TAG_BONUS[corpName];
        if (corpTag) {
          if (aTags.includes(corpTag)) sa += 3;
          if (bTags.includes(corpTag)) sb += 3;
        }
        return sb - sa;
      });`
);

// Fix 31: Late-game card buy threshold too high
// Currently: gen <=4→2, gen<=8→3, else→5
// Problem: threshold 5 at gen 9+ rejects playable VP cards
// Better: gen<=4→2, gen<=8→3, else→4
replace('late buy threshold',
  `      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 5);`,
  `      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 4);`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
