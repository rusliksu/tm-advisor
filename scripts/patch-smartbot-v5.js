/**
 * patch-smartbot-v5.js — Card quality filter + SP aggression + 4 starting corps
 *
 * Fix 8: startingCorporations: 2 → 4
 * Fix 9: Card quality floor — don't play cards below EV threshold
 * Fix 10: SP bonus — cards must beat SP by margin to be preferred
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

// Fix 8: 4 starting corps (standard format)
replace('startingCorporations',
  "startingCorporations: 2,",
  "startingCorporations: 4,"
);

// Fix 9: DISABLED — card quality floor hurts VP more than it helps
// The bot needs cards for VP; filtering them reduces total score

// Fix 10: Use TM_BRAIN.scoreCorp instead of local scoreCorp (which uses PREF_CORPS index)
// The local scoreCorp gives -20 to corps not in PREF_CORPS — nearly useless
replace('use TM_BRAIN.scoreCorp',
  `      if (title.includes('corporation')) {
        // Score each corp by synergy with available project cards
        const scored = cards.map(c => scoreCorp(c.name)).sort((a, b) => b.score - a.score);
        const best = scored[0]?.name || cards[0].name;
        console.log(\`    → Corp pick: \${best} (scores: \${scored.map(s => \`\${s.name}=\${s.score}\`).join(', ')})\`);
        return { type: 'card', cards: [best] };
      }`,
  `      if (title.includes('corporation')) {
        // Score corps using TM_BRAIN ratings + synergy (much better than PREF_CORPS index)
        const cardNames = allProjectCards.map(pc => pc.name);
        const scored = cards.map(c => {
          const score = TM_BRAIN.scoreCorp ? TM_BRAIN.scoreCorp(c.name, cardNames, state) : scoreCorp(c.name).score;
          return { name: c.name, score };
        }).sort((a, b) => b.score - a.score);
        const best = scored[0]?.name || cards[0].name;
        console.log(\`    → Corp pick: \${best} (scores: \${scored.map(s => \`\${s.name}=\${s.score}\`).join(', ')})\`);
        return { type: 'card', cards: [best] };
      }`
);

// Fix 10b: Use TM_BRAIN.scorePrelude instead of PREF_PRELUDES index
replace('use TM_BRAIN.scorePrelude',
  `        const sorted = [...pool].sort((a, b) => {
          const ai = PREF_PRELUDES.indexOf(a.name), bi = PREF_PRELUDES.indexOf(b.name);
          const rankA = ai < 0 ? 999 : ai;
          const rankB = bi < 0 ? 999 : bi;
          // Use scoreCard as tiebreaker for unknown preludes`,
  `        const sorted = [...pool].sort((a, b) => {
          // Use TM_BRAIN.scorePrelude if available (ratings-based)
          if (TM_BRAIN.scorePrelude) {
            return TM_BRAIN.scorePrelude(b.name, state) - TM_BRAIN.scorePrelude(a.name, state);
          }
          const ai = PREF_PRELUDES.indexOf(a.name), bi = PREF_PRELUDES.indexOf(b.name);
          const rankA = ai < 0 ? 999 : ai;
          const rankB = bi < 0 ? 999 : bi;
          // Use scoreCard as tiebreaker for unknown preludes`
);

// Fix 10b: DISABLED — fallback threshold removed with Fix 9

// Fix 11: DISABLED — flat +8 VP bonus in draft is fine, dynamic version reduces card buying

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
