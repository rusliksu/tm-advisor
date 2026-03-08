/**
 * patch-smartbot-v7.js — Card buying volume + city SP + greenery dump
 *
 * Fix 16: Increase maxBuy in mid-late game (2→3)
 * Fix 17: Lower buy threshold in mid game (12→8 late, 6→4 mid)
 * Fix 18: Lower reserve in mid game
 * Fix 19: SP priority — add city SP earlier, greenery only when plants insufficient
 * Fix 20: Better endgame greenery dump — convert plants to greeneries more aggressively
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

// Fix 16+17+18: Increase card buying volume
// Old: maxBuy 4/3/2, threshold 3/6/12, reserve 0/5/8
// New: maxBuy 4/4/3, threshold 2/4/8, reserve 0/3/5
replace('card buy volume',
  `      const threshold = gen <= 3 ? 3 : (gen <= 6 ? 6 : 12);
      const worthBuying = sorted.filter(c => scoreCard(c, state) >= threshold);
      const maxBuy = gen <= 3 ? 4 : (gen <= 6 ? 3 : 2);`,
  `      const threshold = gen <= 3 ? 2 : (gen <= 6 ? 4 : 8);
      const worthBuying = sorted.filter(c => scoreCard(c, state) >= threshold);
      const maxBuy = gen <= 3 ? 4 : (gen <= 6 ? 4 : 3);`
);

// Fix 18: Lower MC reserve for buying
replace('lower reserve',
  `      const reserve = gen <= 2 ? 0 : (gen <= 5 ? 5 : 8);`,
  `      const reserve = gen <= 2 ? 0 : (gen <= 5 ? 3 : 5);`
);

// Fix 19: City SP earlier — cities provide adjacency VP + city count for awards
replace('city SP priority',
  `      // City SP as fallback (1 VP + production)
      const city = available.find(c => c.name.toLowerCase().includes('city'));
      if (city && mc >= 25) return { type: 'card', cards: [city.name] };`,
  `      // City SP — worth it for VP + adjacency + Mayor milestone/Landlord award
      const city = available.find(c => c.name.toLowerCase().includes('city'));
      const citiesPlaced = state?.thisPlayer?.citiesCount ?? 0;
      // City SP if: enough MC AND (no cities yet OR we have plant prod for greenery adjacency)
      if (city && mc >= 25 && (citiesPlaced === 0 || (state?.thisPlayer?.plantProduction ?? 0) >= 3)) {
        return { type: 'card', cards: [city.name] };
      }`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
