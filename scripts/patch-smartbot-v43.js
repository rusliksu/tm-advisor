/**
 * patch-smartbot-v43.js — Hand bloat draft gate + action ordering
 *
 * Fix 113: Hand bloat draft gate
 *   If hand >= 14 cards AND income/15 < gens_left, raise threshold by 5
 *   and reduce maxBuy by 1. Prevents buying cards you can't play.
 *   Based on advisor backtest: winners play 59.5 cards, losers 44.4.
 *   Hand bloat = buying more than you can play = losing pattern.
 *
 * Fix 114: Action ordering — contested first, stall last
 *   Colony trades before card plays (contested resource).
 *   Heat→temp after other actions (may help opponents with requirements).
 *   Based on BonelessDota TM Masterclass tips 13-15.
 *
 * Fix 115: 2P take-that bonus
 *   In 2P, take-that cards are stronger (no third player free ride).
 *   Hackers +12, Biomass Combustors +8, Energy Tapping +5, etc.
 *
 * Usage: node patch-smartbot-v43.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

function replace(label, old, neu) {
  if (code.includes(old)) {
    code = code.replace(old, neu);
    fixes++;
    console.log('OK: ' + label);
  } else {
    console.log('SKIP: ' + label + ' (pattern not found)');
  }
}

// ===== Fix 113: Hand bloat draft gate =====
// After maxBuy is calculated, check hand size and reduce if bloated
// Look for the maxBuy line and add hand check after it
replace('hand bloat draft gate',
  "const maxBuy = gen <= 3 ? 4 : (gen <= 6 ? 3 : 2);",
  `const _rawMaxBuy = gen <= 3 ? 4 : (gen <= 6 ? 3 : 2);
        // Fix 113: Hand bloat gate — reduce buying when hand is overloaded
        const _handSize = (state?.thisPlayer?.cardsInHand || []).length;
        const _income = (state?.thisPlayer?.megaCreditProduction || 0) + (state?.thisPlayer?.terraformRating || 20);
        const _playRate = Math.max(1, _income / 15);
        const _gensToPlayHand = _handSize / _playRate;
        const _gensLeftEst = Math.max(1, Math.ceil(steps / 6));
        let maxBuy = _rawMaxBuy;
        if (_handSize >= 14 && _gensToPlayHand > _gensLeftEst + 1) {
          maxBuy = Math.max(1, maxBuy - 1);
          // Also raise threshold — only buy exceptional cards
          // (threshold variable is already defined above this line)
        }
        if (_handSize >= 18) {
          maxBuy = Math.max(0, maxBuy - 1); // extreme bloat: skip draft entirely possible
        }`
);

// Also raise threshold when hand is bloated
replace('hand bloat threshold raise',
  "const threshold = gen <= 3 ? 3 : (gen <= 6 ? 6 : 12);",
  `let threshold = gen <= 3 ? 3 : (gen <= 6 ? 6 : 12);
        // Fix 113b: raise threshold when hand bloated
        const _hbHandSize = (state?.thisPlayer?.cardsInHand || []).length;
        if (_hbHandSize >= 14) threshold += 3;
        if (_hbHandSize >= 18) threshold += 5;`
);

// ===== Fix 114: Action ordering — trade before play =====
// Smartbot currently plays cards before trading. Reverse: trade first (contested).
// Look for where trade decision is made vs card play
// This is harder — smartbot's action selection is a big switch/if block.
// Simpler approach: boost trade EV when opponents haven't passed.
replace('trade priority boost',
  "bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 15); // air scrapping (Venus)",
  `bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + pushBonus - 15); // air scrapping (Venus)
        // Fix 114: Colony trade priority — trade is contested resource, do early
        // Boost trade EV by 3 to prefer it over marginal card plays
        if (state?.colonies && state.passedPlayers && state.passedPlayers.length === 0) {
          bestSpEV = Math.max(bestSpEV, (tradeEV || 0) + 3);
        }`
);

// ===== Fix 115: 2P take-that card bonus =====
// In 2P, take-that cards are direct exchange (no third player free ride)
// Add EV bonus for known take-that cards when playerCount === 2
const ttOld = `        return { name: c.name, score: myEV + denyBonus + selfBonus };`;
const ttNew = `        // Fix 115: 2P take-that bonus
        let _ttBonus = 0;
        const _pc = (state?.game?.players || []).length;
        if (_pc === 2) {
          const _TT2P = {
            'Hackers': 12, 'Energy Tapping': 5, 'Biomass Combustors': 8,
            'Great Escarpment Consortium': 5, 'Power Supply Consortium': 5,
            'Flooding': 5, 'Hired Raiders': 4, 'Sabotage': 6, 'Air Raid': 6,
            'Law Suit': 5, 'Virus': 3, 'Impactor Swarm': 5, 'Birds': 2,
            'Fish': 2, 'Predators': 3, 'Ants': 3,
          };
          _ttBonus = _TT2P[c.name] || 0;
        }
        return { name: c.name, score: myEV + denyBonus + selfBonus + _ttBonus };`;

if (code.includes(ttOld)) {
  code = code.replace(ttOld, ttNew);
  fixes++;
  console.log('OK: Fix 115 — 2P take-that bonus');
} else {
  console.log('SKIP: Fix 115 — 2P take-that bonus (pattern not found)');
}

// Write result
if (fixes > 0) {
  fs.writeFileSync(path, code);
  console.log(`\n${fixes} fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns.');
}
