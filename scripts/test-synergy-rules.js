#!/usr/bin/env node
/**
 * test-synergy-rules.js
 *
 * Верификация SYNERGY_RULES (секция 48).
 * Эмулирует логику движка и проверяет ожидаемые бонусы.
 */

const fs = require('fs');
const path = require('path');

// ── Load card_effects ──
const effectsPath = path.join(__dirname, '..', 'extension', 'data', 'card_effects.json.js');
const effectsRaw = fs.readFileSync(effectsPath, 'utf8');
const effectsFn = new Function(effectsRaw.replace(/^const /, 'var ') + '\nreturn TM_CARD_EFFECTS;');
const FX = effectsFn();

// ── Load scoring_config ──
const scPath = path.join(__dirname, '..', 'extension', 'data', 'scoring_config.json.js');
const scRaw = fs.readFileSync(scPath, 'utf8');
const scFn = new Function(scRaw.replace(/^var /, 'var ') + '\nreturn TM_SCORING_CONFIG;');
const SC = scFn();

// ── Emulate section 48 logic ──
function calcSynRules(cardName, allMyCards, ctx) {
  const fx48 = FX[cardName];
  if (!fx48) return { bonus: 0, reasons: [] };

  let synRulesBonus = 0;
  const reasons = [];

  // 48a. Placer → has accumulators in tableau
  if (fx48.places) {
    const placeTypes = Array.isArray(fx48.places) ? fx48.places : [fx48.places];
    for (let pt = 0; pt < placeTypes.length; pt++) {
      for (let m = 0; m < allMyCards.length; m++) {
        const mfx = FX[allMyCards[m]];
        if (mfx && mfx.res === placeTypes[pt]) {
          synRulesBonus += SC.placerForAccum;
          reasons.push(allMyCards[m] + ' копит ' + placeTypes[pt]);
          break;
        }
      }
    }
  }

  // 48b. Accumulator → has placers in tableau
  if (fx48.res) {
    let placerCount = 0;
    for (let m = 0; m < allMyCards.length; m++) {
      const mfx = FX[allMyCards[m]];
      if (mfx && mfx.places) {
        const mpt = Array.isArray(mfx.places) ? mfx.places : [mfx.places];
        if (mpt.indexOf(fx48.res) !== -1) placerCount++;
      }
    }
    if (placerCount > 0) {
      const accumBonus = Math.min(placerCount, 2) * SC.accumWithPlacer;
      synRulesBonus += accumBonus;
      reasons.push(placerCount + ' placer для ' + fx48.res);
    }

    // 48c. Competition
    let competitorCount = 0;
    for (let m = 0; m < allMyCards.length; m++) {
      const mfx = FX[allMyCards[m]];
      if (mfx && mfx.res === fx48.res && allMyCards[m] !== cardName) {
        competitorCount++;
      }
    }
    if (competitorCount >= 2) {
      synRulesBonus -= SC.accumCompete;
      reasons.push('конкуренция ' + fx48.res + ' (' + (competitorCount + 1) + ' шт)');
    }
  }

  // 48d. Resource eater
  if (fx48.eats) {
    const eatType = fx48.eats;
    let ownAccumCount = 0;
    for (let m = 0; m < allMyCards.length; m++) {
      const mfx = FX[allMyCards[m]];
      if (mfx && mfx.res === eatType && allMyCards[m] !== cardName) {
        ownAccumCount++;
      }
    }
    if (ownAccumCount > 0) {
      const eatPenalty = SC.eatsOwnPenalty * Math.min(ownAccumCount, 2);
      synRulesBonus -= eatPenalty;
      reasons.push('ест свои ' + eatType + ' (' + ownAccumCount + ') −' + eatPenalty);
    }

    // Opponent targets → guaranteed food
    if (ctx) {
      const oppTgt = eatType === 'animal' ? (ctx.oppAnimalTargets || 0)
                   : eatType === 'microbe' ? (ctx.oppMicrobeTargets || 0) : 0;
      if (oppTgt > 0) {
        synRulesBonus += SC.eatsOppBonus;
        reasons.push('опп. ' + eatType + ' (' + oppTgt + ') +' + SC.eatsOppBonus);
      }
    }
  }

  const capped = Math.min(synRulesBonus, SC.synRulesCap);
  return { bonus: capped, reasons };
}

// ── Test cases ──
let passed = 0;
let failed = 0;

function test(name, cardName, tableau, expectedBonus, ctx) {
  const result = calcSynRules(cardName, tableau, ctx);
  const ok = result.bonus === expectedBonus;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}: +${result.bonus} [${result.reasons.join('; ')}]`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: expected +${expectedBonus}, got +${result.bonus} [${result.reasons.join('; ')}]`);
  }
}

console.log('\n=== SYNERGY_RULES TEST SUITE ===\n');

// ── Annotation checks ──
console.log('── Аннотации ──');
const annotationChecks = [
  ['Birds', 'res', 'animal'],
  ['Fish', 'res', 'animal'],
  ['Livestock', 'res', 'animal'],
  ['Penguins', 'res', 'animal'],
  ['Ecological Zone', 'res', 'animal'],
  ['Decomposers', 'res', 'microbe'],
  ['Ants', 'res', 'microbe'],
  ['Ants', 'eats', 'microbe'],
  ['Dirigibles', 'res', 'floater'],
  ['Floating Habs', 'res', 'floater'],
  ['Physics Complex', 'res', 'science'],
  ['Search For Life', 'res', 'science'],
  ['Large Convoy', 'places', 'animal'],
  ['Freyja Biodomes', 'places', 'animal'],
  ['Viral Enhancers', 'places', 'animal'],
  ['Controlled Bloom', 'places', 'animal'],
  ['Symbiotic Fungus', 'res', 'microbe'],
  ['Symbiotic Fungus', 'places', 'microbe'],
  ['Extreme-Cold Fungus', 'res', 'microbe'],
  ['Extreme-Cold Fungus', 'places', 'microbe'],
  ['Bactoviral Research', 'res', 'microbe'],
  ['Bactoviral Research', 'places', 'microbe'],
];

for (const [card, field, expected] of annotationChecks) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  const val = fx[field];
  const actual = Array.isArray(val) ? val : val;
  const match = Array.isArray(val) ? val.includes(expected) : val === expected;
  if (match) {
    passed++;
    console.log(`  ✓ ${card}.${field} = ${JSON.stringify(val)}`);
  } else {
    failed++;
    console.log(`  ✗ ${card}.${field}: expected ${expected}, got ${JSON.stringify(val)}`);
  }
}

// Multi-type placers
for (const card of ['Imported Nitrogen', 'Imported Hydrogen']) {
  const fx = FX[card];
  const ok = fx && Array.isArray(fx.places) && fx.places.includes('animal') && fx.places.includes('microbe');
  if (ok) { passed++; console.log(`  ✓ ${card}.places = ${JSON.stringify(fx.places)}`); }
  else { failed++; console.log(`  ✗ ${card}.places: expected ['animal','microbe'], got ${JSON.stringify(fx && fx.places)}`); }
}

// Predators — eats:'animal', НЕ res/places
const predFx = FX['Predators'];
if (predFx && !predFx.res && !predFx.places && predFx.eats === 'animal') {
  passed++; console.log('  ✓ Predators: eats=animal, no res/places');
} else {
  failed++; console.log(`  ✗ Predators: expected eats=animal + no res/places, got eats=${predFx && predFx.eats}, res=${predFx && predFx.res}`);
}

// New annotations: fighter, floater, animal (missed in v1)
const newAnnotations = [
  ['Security Fleet', 'res', 'fighter'],
  ['Asteroid Hollowing', 'res', 'fighter'],
  ['St. Joseph of Cupertino Mission', 'res', 'fighter'],
  ['Herbivores', 'res', 'animal'],
  ['Vermin', 'res', 'animal'],
  ['Anthozoa', 'res', 'animal'],
  ['Sub-zero Salt Fish', 'res', 'animal'],
  ['Floater-Urbanism', 'res', 'floater'],
];
for (const [card, field, expected] of newAnnotations) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  if (fx[field] === expected) {
    passed++; console.log(`  ✓ ${card}.${field} = '${fx[field]}'`);
  } else {
    failed++; console.log(`  ✗ ${card}.${field}: expected '${expected}', got '${fx[field]}'`);
  }
}

// ── Scoring scenarios ──
console.log('\n── Сценарии scoring ──');

// 1. Birds в руке + Large Convoy на столе → accumWithPlacer = +3
test('Birds + Large Convoy на столе', 'Birds', ['Large Convoy'], 3);

// 2. Large Convoy в руке + Birds на столе → placerForAccum = +4
test('Large Convoy + Birds на столе', 'Large Convoy', ['Birds'], 4);

// 3. Large Convoy в руке + Birds + Fish на столе → +4 (один бонус за тип animal)
test('Large Convoy + Birds + Fish на столе', 'Large Convoy', ['Birds', 'Fish'], 4);

// 4. Birds в руке + Large Convoy + Imported Nitrogen на столе → +6 (2 placers × 3)
test('Birds + 2 placers на столе', 'Birds', ['Large Convoy', 'Imported Nitrogen'], 6);

// 5. Birds + Fish + Livestock на столе, оцениваем ещё animal → competition -2
//    Pets (res:animal) в руке + 3 конкурента (Birds, Fish, Livestock)
//    No placers → bonus = 0 - 2 = -2, но cap is min(synRulesBonus, synRulesCap) = min(-2, 8) = -2
test('Pets + 3 animal конкурента (competition)', 'Pets', ['Birds', 'Fish', 'Livestock'], -2);

// 6. Dirigibles в руке + Floating Habs на столе
//    Both have res:'floater', Dirigibles has only res (no places).
//    48b check: Dirigibles.res='floater', look for placers of 'floater' → no cards with places containing 'floater' → 0
//    48c: competitorCount = 1 (Floating Habs) → < 2 → no penalty
test('Dirigibles + Floating Habs (floater accum, no placer)', 'Dirigibles', ['Floating Habs'], 0);

// 7. Imported Nitrogen в руке + Birds + Decomposers на столе
//    places:['animal','microbe']
//    48a: animal type → Birds has res:'animal' → +4
//         microbe type → Decomposers has res:'microbe' → +4
//    Total = +8 (= cap)
test('Imported Nitrogen + Birds + Decomposers', 'Imported Nitrogen', ['Birds', 'Decomposers'], 8);

// 8. Symbiotic Fungus: self-feeder (res:'microbe', places:'microbe')
//    В руке + Ants (res:'microbe') на столе
//    48a: places:'microbe', Ants has res:'microbe' → +4
//    48b: res:'microbe', look for placers... Ants has no places → 0
//    Total = +4
test('Symbiotic Fungus + Ants на столе', 'Symbiotic Fungus', ['Ants'], 4);

// 9. Symbiotic Fungus + Extreme-Cold Fungus (mutual self-feeders)
//    48a: places:'microbe', ECF.res='microbe' → +4
//    48b: res:'microbe', ECF.places='microbe' → +3 (1 placer × 3)
//    Total = 7
test('Symbiotic Fungus + Extreme-Cold Fungus', 'Symbiotic Fungus', ['Extreme-Cold Fungus'], 7);

// 10. Card without annotations → 0
test('Asteroid (no annotations)', 'Asteroid', ['Birds', 'Large Convoy'], 0);

// 11. Cap test: Birds + 3 placers → 3 × 3 = 9, but cap of placerCount is 2 → 2 × 3 = 6
test('Birds + 3 placers (cap at 2)', 'Birds', ['Large Convoy', 'Imported Nitrogen', 'Imported Hydrogen'], 6);

// ── 48d: Eater scenarios ──
console.log('\n── Eater (48d) ──');

// 12. Predators в руке + Birds на столе → eatsOwnPenalty × 1 = -2
test('Predators + Birds (ест свой animal)', 'Predators', ['Birds'], -2);

// 13. Predators + Birds + Fish → eatsOwnPenalty × min(2,2) = -4
test('Predators + Birds + Fish (ест 2 animal)', 'Predators', ['Birds', 'Fish'], -4);

// 14. Predators + Birds + Fish + Livestock → min(3,2)=2 × 2 = -4 (cap at 2 accum)
test('Predators + 3 animals (cap 2)', 'Predators', ['Birds', 'Fish', 'Livestock'], -4);

// 15. Predators без animals → 0 (нечего жрать из своих)
test('Predators без своих animals', 'Predators', ['Strip Mine', 'Space Mirrors'], 0);

// 16. Predators + Large Convoy → Large Convoy has places, not res → 0
test('Predators + Large Convoy (placer, не accum)', 'Predators', ['Large Convoy'], 0);

// 17. Fighter cards don't interact (no fighter placers)
test('Security Fleet solo (no interaction)', 'Security Fleet', ['Asteroid Hollowing'], 0);

// ── 48d: Opponent context ──
console.log('\n── Eater + opponent ctx ──');

// 18. Predators + opponent has 2 animal targets → +3 (eatsOppBonus)
test('Predators + опп. animals (no own)', 'Predators', [],
  3, { oppAnimalTargets: 2 });

// 19. Predators + own Birds + opponent animals → -2 + 3 = +1
test('Predators + own Birds + опп. animals', 'Predators', ['Birds'],
  1, { oppAnimalTargets: 1 });

// 20. Predators + own Birds+Fish + opponent animals → -4 + 3 = -1
test('Predators + 2 own + опп. animals', 'Predators', ['Birds', 'Fish'],
  -1, { oppAnimalTargets: 3 });

// 21. Predators без ctx → no opp bonus
test('Predators без ctx (no opp data)', 'Predators', ['Birds'], -2);

// 22. Predators + opponent 0 animals → no bonus
test('Predators + опп. 0 animals', 'Predators', [],
  0, { oppAnimalTargets: 0 });

// ── Ants (dual: res:'microbe' + eats:'microbe') ──
console.log('\n── Ants (dual) ──');

// 23. Ants + Symbiotic Fungus → accumWithPlacer +3 (SF places microbes) + eatsOwn -2 (SF has res:'microbe')
//     Net: +1
test('Ants + Symbiotic Fungus', 'Ants', ['Symbiotic Fungus'], 1);

// 24. Ants + opponent microbes, no own → eatsOppBonus +3 only (no own microbe accums)
test('Ants + опп. microbes (no own)', 'Ants', [],
  3, { oppMicrobeTargets: 2 });

// 25. Ants + Decomposers → accumWithPlacer: 0 (Decomposers has no places)
//     competition: 0 (only 1 competitor < 2), eatsOwn: -2 (Decomposers.res=microbe)
//     Net: -2
test('Ants + Decomposers (ест его микробов)', 'Ants', ['Decomposers'], -2);

// 26. Ants + Decomposers + Extremophiles → 2 competitors → competition -2
//     eatsOwn: min(2,2)*2 = -4. Net: -6
test('Ants + 2 microbe accums (competition + eats)', 'Ants',
  ['Decomposers', 'Extremophiles'], -6);

// 27. Ants + Decomposers + opponent microbes → eatsOwn -2 + oppBonus +3 = +1
test('Ants + Decomposers + опп. microbes', 'Ants', ['Decomposers'],
  1, { oppMicrobeTargets: 1 });

// ── SC constants check ──
console.log('\n── SC константы ──');
const scChecks = [
  ['placerForAccum', 4],
  ['accumWithPlacer', 3],
  ['accumCompete', 2],
  ['eatsOwnPenalty', 2],
  ['eatsOppBonus', 3],
  ['synRulesCap', 8],
];
for (const [key, expected] of scChecks) {
  if (SC[key] === expected) {
    passed++; console.log(`  ✓ SC.${key} = ${SC[key]}`);
  } else {
    failed++; console.log(`  ✗ SC.${key}: expected ${expected}, got ${SC[key]}`);
  }
}

// ── Summary ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Passed: ${passed}  |  Failed: ${failed}`);
if (failed === 0) console.log('ALL TESTS PASSED');
else process.exit(1);
