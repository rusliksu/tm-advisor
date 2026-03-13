/**
 * patch-smartbot-v39b.js — Corp-aware hate-draft + better endgame buying
 *
 * Fix 106: Corp-aware hate-drafting
 *   Add deny bonus (+3 per opponent) for cards whose tags match opponent corp's
 *   bonus tag (e.g. earth cards vs Point Luna, venus vs Aphrodite)
 *   Impact: ~8-12 hate-draft picks per game improved
 *
 * Fix 105: Better endgame card buying
 *   Remove VP-only filter — buy ANY card with EV >= 8 in endgame
 *   (high-EV events/TR cards are worth 3 MC buy cost even without VP)
 *
 * Usage: node patch-smartbot-v39b.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 106: Corp-aware hate-drafting =====
// Add deny bonus for cards matching opponent corp tags.
// If opponent plays Point Luna and I draft an earth card I don't need,
// the deny bonus ensures I take it to starve their engine.

const draftOld = `      const scored = [...cards].map(c => {
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
        return { name: c.name, score: myEV + denyBonus };`;

const draftNew = `      // Fix 106: Corp-aware hate-draft — deny cards matching opponent corp bonus tags
      const _CORP_TAG_DENY = {
        'Point Luna': 'earth', 'Teractor': 'earth', 'Lakefront Resorts': 'earth',
        'Saturn Systems': 'jovian', 'Celestic': 'venus',
        'Morning Star Inc.': 'venus', 'Aphrodite': 'venus',
        'Splice': 'microbe', 'Arklight': 'animal',
        'Interplanetary Cinematics': 'event',
        'PhoboLog': 'space', 'Crescent Research Association': 'science',
      };
      const _oppCorpTags = [];
      const _draftPlayers = state?.players || [];
      const _draftMyColor = state?.thisPlayer?.color;
      for (const _dp of _draftPlayers) {
        if (_dp.color === _draftMyColor) continue;
        const _corpName = (_dp.tableau || [])[0]?.name || '';
        const _tag = _CORP_TAG_DENY[_corpName];
        if (_tag) _oppCorpTags.push(_tag);
      }
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
        // Corp-tag deny: cards opponents' corps want (+3 per opponent with matching corp)
        const cTags = CARD_TAGS[c.name] || [];
        for (const _ot of _oppCorpTags) {
          if (cTags.includes(_ot)) denyBonus += 3;
        }
        return { name: c.name, score: myEV + denyBonus };`;

if (code.includes(draftOld)) {
  code = code.replace(draftOld, draftNew);
  fixes++;
  console.log('Fix 106 applied: corp-aware hate-drafting');
} else {
  console.log('Fix 106 SKIPPED: draft pattern not found');
}


// ===== Fix 105: Better endgame card buying =====
// Current: only buy VP cards with EV >= 8 in endgame
// New: buy ANY card with EV >= 8 (high-EV events/TR cards worth 3 MC buy)

const buyOld = `        const vpBuys = cards.filter(c => {
          const ev = scoreCard(c, state);
          return ev >= 8 && (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name));
        }).sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
        if (vpBuys.length > 0 && mc >= (state?.thisPlayer?.cardCost ?? 3) + 10) {
          console.log(\`    → Endgame VP buy: \${vpBuys[0].name} (EV=\${scoreCard(vpBuys[0], state).toFixed(1)})\`);
          return { type: 'card', cards: [vpBuys[0].name] };
        }`;

const buyNew = `        // Fix 105: buy ANY high-EV card in endgame, not just VP cards
        const goodBuys = cards.filter(c => {
          const ev = scoreCard(c, state);
          return ev >= 8;
        }).sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
        if (goodBuys.length > 0 && mc >= (state?.thisPlayer?.cardCost ?? 3) + 10) {
          console.log(\`    → Endgame buy: \${goodBuys[0].name} (EV=\${scoreCard(goodBuys[0], state).toFixed(1)})\`);
          return { type: 'card', cards: [goodBuys[0].name] };
        }`;

if (code.includes(buyOld)) {
  code = code.replace(buyOld, buyNew);
  fixes++;
  console.log('Fix 105 applied: endgame buy any high-EV card');
} else {
  console.log('Fix 105 SKIPPED: endgame buy pattern not found');
}


if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/2 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
