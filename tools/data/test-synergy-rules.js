#!/usr/bin/env node
/**
 * test-synergy-rules.js
 *
 * Верификация SYNERGY_RULES (секция 48).
 * Эмулирует логику движка и проверяет ожидаемые бонусы.
 */

const fs = require('fs');
const path = require('path');
const {readGeneratedExtensionFile} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'generated-extension-data'));

// ── Load card_effects ──
const effectsRaw = readGeneratedExtensionFile('card_effects.json.js', 'utf8');
const effectsFn = new Function(effectsRaw.replace(/^const /, 'var ') + '\nreturn TM_CARD_EFFECTS;');
const FX = effectsFn();

// ── Load scoring_config ──
const scRaw = readGeneratedExtensionFile('scoring_config.json.js', 'utf8');
const scFn = new Function(scRaw.replace(/^var /, 'var ') + '\nreturn TM_SCORING_CONFIG;');
const SC = scFn();

// ── Helper: check if placer can reach target by tag ──
function canReachByTag(placerFx, targetFx) {
  if (!placerFx.placesTag) return true; // unrestricted placer
  const tg = targetFx.tg;
  const tags = Array.isArray(tg) ? tg : (tg ? [tg] : []);
  return tags.indexOf(placerFx.placesTag) !== -1;
}

// ── Emulate section 48 logic ──
function calcSynRules(cardName, allMyCards, ctx) {
  const fx48 = FX[cardName];
  if (!fx48) return { bonus: 0, reasons: [] };

  let synRulesBonus = 0;
  const reasons = [];

  // 48a. Placer → has accumulators in tableau (scaling по кол-ву целей)
  if (fx48.places) {
    const placeTypes = Array.isArray(fx48.places) ? fx48.places : [fx48.places];
    for (let pt = 0; pt < placeTypes.length; pt++) {
      let targetCount = 0;
      for (let m = 0; m < allMyCards.length; m++) {
        const mfx = FX[allMyCards[m]];
        if (mfx && mfx.res === placeTypes[pt] && canReachByTag(fx48, mfx)) targetCount++;
      }
      if (targetCount > 0) {
        const placerBonus = Math.min(targetCount * SC.placerPerTarget, SC.placerTargetCap);
        synRulesBonus += placerBonus;
        reasons.push(targetCount + ' ' + placeTypes[pt] + ' цель');
      }
    }
  }

  // 48e. Placer без целей — штраф
  if (fx48.places) {
    const placeTypes48e = Array.isArray(fx48.places) ? fx48.places : [fx48.places];
    for (let pt = 0; pt < placeTypes48e.length; pt++) {
      let hasTarget = false;
      for (let m = 0; m < allMyCards.length; m++) {
        const mfx = FX[allMyCards[m]];
        if (mfx && mfx.res === placeTypes48e[pt] && canReachByTag(fx48, mfx)) { hasTarget = true; break; }
      }
      if (!hasTarget) {
        synRulesBonus -= SC.noTargetPenalty;
        reasons.push('Нет ' + placeTypes48e[pt] + ' целей −' + SC.noTargetPenalty);
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
        if (mpt.indexOf(fx48.res) !== -1 && canReachByTag(mfx, fx48)) placerCount++;
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

// Predators — eats:'animal' + res:'animal' (v5: added res)
const predFx = FX['Predators'];
if (predFx && predFx.res === 'animal' && !predFx.places && predFx.eats === 'animal') {
  passed++; console.log('  ✓ Predators: res=animal, eats=animal, no places');
} else {
  failed++; console.log(`  ✗ Predators: expected res=animal + eats=animal, got res=${predFx && predFx.res}, eats=${predFx && predFx.eats}`);
}

// New annotations: fighter, floater, animal (missed in v1)
const newAnnotations = [
  ['Security Fleet', 'res', 'fighter'],
  ['Asteroid Hollowing', 'res', 'asteroid'],
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

// v2 annotations
const v2Annotations = [
  ['Thermophiles', 'res', 'microbe'],
  ['Recyclon', 'res', 'microbe'],
  ['Jupiter Floating Station', 'res', 'floater'],
  ['Local Shading', 'res', 'floater'],
  ['Bio Printing Facility', 'places', ['animal', 'microbe']],
];
for (const [card, field, expected] of v2Annotations) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  const val = fx[field];
  const match = Array.isArray(expected)
    ? Array.isArray(val) && expected.every(e => val.includes(e))
    : val === expected;
  if (match) {
    passed++; console.log(`  ✓ ${card}.${field} = ${JSON.stringify(val)}`);
  } else {
    failed++; console.log(`  ✗ ${card}.${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
  }
}

// ── Scoring scenarios ──
console.log('\n── Сценарии scoring ──');

// 1. Birds в руке + Large Convoy на столе → accumWithPlacer = +3
test('Birds + Large Convoy на столе', 'Birds', ['Large Convoy'], 3);

// 2. Large Convoy в руке + Birds на столе → placerPerTarget × 1 = +3
test('Large Convoy + Birds на столе', 'Large Convoy', ['Birds'], 3);

// 3. Large Convoy в руке + Birds + Fish на столе → scaling: 2 × 3 = +6
test('Large Convoy + Birds + Fish на столе', 'Large Convoy', ['Birds', 'Fish'], 6);

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
//    48a: animal type → Birds has res:'animal' → 1×3 = 3
//         microbe type → Decomposers has res:'microbe' → 1×3 = 3
//    Total = +6
test('Imported Nitrogen + Birds + Decomposers', 'Imported Nitrogen', ['Birds', 'Decomposers'], 6);

// 8. Symbiotic Fungus: self-feeder (res:'microbe', places:'microbe')
//    В руке + Ants (res:'microbe') на столе
//    48a: places:'microbe', Ants has res:'microbe' → 1×3 = 3
//    48b: res:'microbe', look for placers... Ants has no places → 0
//    Total = +3
test('Symbiotic Fungus + Ants на столе', 'Symbiotic Fungus', ['Ants'], 3);

// 9. Symbiotic Fungus + Extreme-Cold Fungus (mutual self-feeders)
//    48a: places:'microbe', ECF.res='microbe' → 1×3 = 3
//    48b: res:'microbe', ECF.places='microbe' → +3 (1 placer × 3)
//    Total = 6
test('Symbiotic Fungus + Extreme-Cold Fungus', 'Symbiotic Fungus', ['Extreme-Cold Fungus'], 6);

// 10. Card without annotations → 0
test('Asteroid (no annotations)', 'Asteroid', ['Birds', 'Large Convoy'], 0);

// 11. Cap test: Birds + 3 placers → 3 × 3 = 9, but cap of placerCount is 2 → 2 × 3 = 6
test('Birds + 3 placers (cap at 2)', 'Birds', ['Large Convoy', 'Imported Nitrogen', 'Imported Hydrogen'], 6);

// 48e: No-target penalty
test('Large Convoy без animal целей', 'Large Convoy', [], -4);
test('Imported Nitrogen без целей (dual)', 'Imported Nitrogen', [], -8);
test('Imported Nitrogen + Birds, нет microbe', 'Imported Nitrogen', ['Birds'], -1);
// 48a: 1 animal цель → +3; 48e: нет microbe целей → -4; net = -1
test('Bio Printing + Decomposers (есть microbe, нет animal)', 'Bio Printing Facility', ['Decomposers'], -1);

// Scaling cap test: Large Convoy + 3 animal targets → 3×3=9, cap=6 → +6
test('Large Convoy + 3 animal (placerTargetCap)', 'Large Convoy', ['Birds', 'Fish', 'Livestock'], 6);

// SynRules cap: Imported Nitrogen + 3 animal + 3 microbe → 6+6=12, cap=10
test('Imported Nitrogen + cap test', 'Imported Nitrogen',
  ['Birds', 'Fish', 'Livestock', 'Decomposers', 'Ants', 'Extremophiles'], 10);

// ── 48d: Eater scenarios ──
console.log('\n── Eater (48d) ──');

// 12. Predators в руке + Birds на столе → eatsOwnPenalty × 1 = -2
test('Predators + Birds (ест свой animal)', 'Predators', ['Birds'], -2);

// 13. Predators + Birds + Fish → eats -4 + competition -2 (3 animal accums incl Predators) = -6
test('Predators + Birds + Fish (ест 2 + competition)', 'Predators', ['Birds', 'Fish'], -6);

// 14. Predators + Birds + Fish + Livestock → eats -4 + competition -2 = -6
test('Predators + 3 animals (eats cap + competition)', 'Predators', ['Birds', 'Fish', 'Livestock'], -6);

// 15. Predators без animals → 0 (нечего жрать из своих)
test('Predators без своих animals', 'Predators', ['Strip Mine', 'Space Mirrors'], 0);

// 16. Predators + Large Convoy → Predators.res='animal' + LC.places='animal' → accumWithPlacer +3
//     eatsOwn: LC has no res → 0. Net: +3
test('Predators + Large Convoy (accum+placer)', 'Predators', ['Large Convoy'], 3);

// 17. Fighter cards don't interact (no fighter placers)
test('Security Fleet solo (no interaction)', 'Security Fleet', ['St. Joseph of Cupertino Mission'], 0);

// ── 48d: Opponent context ──
console.log('\n── Eater + opponent ctx ──');

// 18. Predators + opponent has 2 animal targets → +3 (eatsOppBonus)
test('Predators + опп. animals (no own)', 'Predators', [],
  3, { oppAnimalTargets: 2 });

// 19. Predators + own Birds + opponent animals → -2 + 3 = +1
test('Predators + own Birds + опп. animals', 'Predators', ['Birds'],
  1, { oppAnimalTargets: 1 });

// 20. Predators + own Birds+Fish + opponent animals → eats -4 + competition -2 + opp +3 = -3
test('Predators + 2 own + опп. animals', 'Predators', ['Birds', 'Fish'],
  -3, { oppAnimalTargets: 3 });

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

// ── v3: Floater placer annotations ──
console.log('\n── v3: Floater placers ──');
const v3Annotations = [
  ['Celestic', 'places', 'floater'],
  ['Stormcraft Incorporated', 'places', 'floater'],
  ['Stratopolis', 'places', 'floater'],
  ['Titan Floating Launch-pad', 'places', 'floater'],
  ['Floater Technology', 'places', 'floater'],
  ['Floater Prototypes', 'places', 'floater'],
  ['Venus Shuttles', 'places', 'floater'],
];
for (const [card, field, expected] of v3Annotations) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  if (fx[field] === expected) {
    passed++; console.log(`  ✓ ${card}.${field} = '${fx[field]}'`);
  } else {
    failed++; console.log(`  ✗ ${card}.${field}: expected '${expected}', got '${fx[field]}'`);
  }
}

// v3 negative: self-feeders should NOT have places
const v3Negative = ['Forced Precipitation', 'Jet Stream Microscrappers', 'Extractor Balloons'];
for (const card of v3Negative) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  if (!fx.places) {
    passed++; console.log(`  ✓ ${card}.places = undefined (self-feeder)`);
  } else {
    failed++; console.log(`  ✗ ${card}.places: expected undefined, got '${fx.places}'`);
  }
}

// v3 scoring: floater placer → accum
console.log('\n── v3: Floater placer scoring ──');

// Celestic (placer) + Dirigibles (accum) → +3 (1 floater цель)
test('Celestic + Dirigibles', 'Celestic', ['Dirigibles'], 3);

// Celestic + Dirigibles + Floating Habs → +6 (2 floater цели)
test('Celestic + 2 floater accums', 'Celestic', ['Dirigibles', 'Floating Habs'], 6);

// Celestic без floater целей → -4 (noTargetPenalty)
test('Celestic без floater целей', 'Celestic', [], -4);

// Dirigibles + Celestic на столе → +3 (1 placer для floater)
test('Dirigibles + Celestic (1 placer)', 'Dirigibles', ['Celestic'], 3);

// Dirigibles + Celestic + Stormcraft → +6 (2 placers, cap)
test('Dirigibles + 2 floater placers', 'Dirigibles', ['Celestic', 'Stormcraft Incorporated'], 6);

// Stratopolis (dual: res+places) + Floating Habs + Celestic
// 48a: places:'floater' → Floating Habs.res='floater' → 1×3 = 3
// 48b: res:'floater' → Celestic.places='floater' → 1×3 = 3
// Total = +6
test('Stratopolis dual + Floating Habs + Celestic', 'Stratopolis', ['Floating Habs', 'Celestic'], 6);

// Dirigibles + 2 other floater accums (competition: 3 total)
// 48b: 0 placers → 0; 48c: competitorCount=2 → -2
test('Dirigibles + 2 floater competitors', 'Dirigibles', ['Floating Habs', 'Aerial Mappers'], -2);

// Floater Technology (placer only) без целей → -4
test('Floater Technology без целей', 'Floater Technology', [], -4);

// ── v5: Missing res annotations ──
console.log('\n── v5: Пропущенные res ──');
const v5Annotations = [
  ['Predators', 'res', 'animal'],
  ['Extractor Balloons', 'res', 'floater'],
  ['Jet Stream Microscrappers', 'res', 'floater'],
  ['Forced Precipitation', 'res', 'floater'],
  ['Deuterium Export', 'res', 'floater'],
  ['Icy Impactors', 'res', 'floater'],
  ['Comet Aiming', 'res', 'floater'],
  ['Directed Impactors', 'res', 'floater'],
  ['Asteroid Deflection System', 'res', 'asteroid'],
];
for (const [card, field, expected] of v5Annotations) {
  const fx = FX[card];
  if (!fx) { console.log(`  ✗ ${card}: NOT IN EFFECTS`); failed++; continue; }
  if (fx[field] === expected) {
    passed++; console.log(`  ✓ ${card}.${field} = '${fx[field]}'`);
  } else {
    failed++; console.log(`  ✗ ${card}.${field}: expected '${expected}', got '${fx[field]}'`);
  }
}

// v5: Venus tags on floater self-feeders
const v5VenusTg = ['Extractor Balloons', 'Jet Stream Microscrappers', 'Forced Precipitation', 'Deuterium Export'];
for (const card of v5VenusTg) {
  const fx = FX[card];
  if (fx && fx.tg === 'venus') {
    passed++; console.log(`  ✓ ${card}.tg = 'venus'`);
  } else {
    failed++; console.log(`  ✗ ${card}.tg: expected 'venus', got '${fx && fx.tg}'`);
  }
}

// v5: Non-venus self-feeders should NOT have tg
const v5NoTg = ['Icy Impactors', 'Comet Aiming', 'Directed Impactors', 'Asteroid Deflection System'];
for (const card of v5NoTg) {
  const fx = FX[card];
  if (fx && !fx.tg) {
    passed++; console.log(`  ✓ ${card}.tg = undefined (not venus)`);
  } else {
    failed++; console.log(`  ✗ ${card}.tg: expected undefined, got '${fx && fx.tg}'`);
  }
}

// v5 scoring: Predators now has res:'animal' — eats own + is accumulator
// Predators + Birds: eatsOwn -2 (Birds.res=animal) + competition 0 (only 1 competitor) = -2
test('Predators + Birds (res+eats dual)', 'Predators', ['Birds'], -2);

// Predators + Large Convoy: accumWithPlacer +3 (Large Convoy places animal) + eatsOwn 0 (LC no res)
test('Predators + Large Convoy (accum gets placer)', 'Predators', ['Large Convoy'], 3);

// Celestic + Forced Precipitation (now res:'floater',tg:'venus') → valid target
test('Celestic + Forced Precipitation', 'Celestic', ['Forced Precipitation'], 3);

// Stratopolis (venus) + Icy Impactors (no tg) → mismatch, penalty
test('Stratopolis + Icy Impactors (no venus tag)', 'Stratopolis', ['Icy Impactors'], -4);

// ── v4: Tag-filtered placers ──
console.log('\n── v4: placesTag + tg аннотации ──');
const v4PlacesTag = [
  ['Stratopolis', 'placesTag', 'venus'],
  ['Titan Floating Launch-pad', 'placesTag', 'jovian'],
  ['Venus Shuttles', 'placesTag', 'venus'],
];
for (const [card, field, expected] of v4PlacesTag) {
  const fx = FX[card];
  if (fx[field] === expected) {
    passed++; console.log(`  ✓ ${card}.${field} = '${fx[field]}'`);
  } else {
    failed++; console.log(`  ✗ ${card}.${field}: expected '${expected}', got '${fx[field]}'`);
  }
}

// Unrestricted placers should NOT have placesTag
for (const card of ['Celestic', 'Stormcraft Incorporated', 'Floater Technology', 'Floater Prototypes']) {
  const fx = FX[card];
  if (!fx.placesTag) {
    passed++; console.log(`  ✓ ${card}.placesTag = undefined (unrestricted)`);
  } else {
    failed++; console.log(`  ✗ ${card}.placesTag: expected undefined, got '${fx.placesTag}'`);
  }
}

// Venus floater accumulators
const venusTg = ['Dirigibles', 'Aerial Mappers', 'Stratopolis', 'Rotator Impacts',
  'Atmo Collectors', 'Floater-Urbanism', 'Floating Habs', 'Local Shading'];
for (const card of venusTg) {
  const fx = FX[card];
  if (fx && fx.tg === 'venus') {
    passed++; console.log(`  ✓ ${card}.tg = 'venus'`);
  } else {
    failed++; console.log(`  ✗ ${card}.tg: expected 'venus', got '${fx && fx.tg}'`);
  }
}

// Jovian floater accumulators
const jovianTg = ['Jovian Lanterns', 'Titan Floating Launch-pad', 'Jupiter Floating Station'];
for (const card of jovianTg) {
  const fx = FX[card];
  if (fx && fx.tg === 'jovian') {
    passed++; console.log(`  ✓ ${card}.tg = 'jovian'`);
  } else {
    failed++; console.log(`  ✗ ${card}.tg: expected 'jovian', got '${fx && fx.tg}'`);
  }
}

// v4 scoring: tag-filtered placer→target
console.log('\n── v4: Tag-filtered scoring ──');

// Stratopolis (venus) + Dirigibles (venus) → valid: +3 target + (no placer on tableau) = +3
test('Stratopolis + Dirigibles (venus→venus)', 'Stratopolis', ['Dirigibles'], 3);

// Stratopolis (venus) + Jupiter Floating Station (jovian) → tag mismatch, skip
// 48a: 0 valid targets; 48e: no valid targets → -4
test('Stratopolis + JFS (venus→jovian, mismatch)', 'Stratopolis', ['Jupiter Floating Station'], -4);

// Titan FLP (jovian) + Jupiter Floating Station (jovian) → valid: +3
test('Titan FLP + JFS (jovian→jovian)', 'Titan Floating Launch-pad', ['Jupiter Floating Station'], 3);

// Titan FLP (jovian) + Dirigibles (venus) → tag mismatch
// 48a: 0 valid targets; 48e: -4
test('Titan FLP + Dirigibles (jovian→venus, mismatch)', 'Titan Floating Launch-pad', ['Dirigibles'], -4);

// Celestic (unrestricted) + Dirigibles → valid: +3
test('Celestic + Dirigibles (unrestricted)', 'Celestic', ['Dirigibles'], 3);

// Celestic (unrestricted) + Jupiter Floating Station → valid: +3
test('Celestic + JFS (unrestricted)', 'Celestic', ['Jupiter Floating Station'], 3);

// Venus Shuttles (venus) + Floating Habs (venus) → valid: +3
test('Venus Shuttles + Floating Habs (venus→venus)', 'Venus Shuttles', ['Floating Habs'], 3);

// Venus Shuttles (venus) + Jovian Lanterns (jovian) → mismatch: -4
test('Venus Shuttles + Jovian Lanterns (venus→jovian)', 'Venus Shuttles', ['Jovian Lanterns'], -4);

// 48b reverse: Dirigibles (venus) + Titan FLP (jovian placer) → TFL can't reach Dirigibles
// 48b: 0 valid placers; no competition (only 1 floater accum)
test('Dirigibles + Titan FLP (restricted placer cant reach)', 'Dirigibles', ['Titan Floating Launch-pad'], 0);

// 48b reverse: Dirigibles (venus) + Celestic (unrestricted) → valid placer
test('Dirigibles + Celestic (unrestricted placer)', 'Dirigibles', ['Celestic'], 3);

// 48b reverse: JFS (jovian) + Titan FLP (jovian placer) → valid placer
test('JFS + Titan FLP (jovian placer can reach)', 'Jupiter Floating Station', ['Titan Floating Launch-pad'], 3);

// 48b reverse: JFS (jovian) + Stratopolis (venus placer) → can't reach
test('JFS + Stratopolis (venus placer cant reach jovian)', 'Jupiter Floating Station', ['Stratopolis'], 0);

// Mixed: Dirigibles (venus) + Celestic (unrestricted) + Titan FLP (jovian, can't reach)
// 48b: only Celestic counts → 1 placer × 3 = +3
test('Dirigibles + Celestic + Titan FLP (1 valid, 1 cant reach)', 'Dirigibles', ['Celestic', 'Titan Floating Launch-pad'], 3);

// Stratopolis dual + Venus targets + Jovian targets
// 48a: places:'floater', placesTag:'venus' → only venus targets count
//   Floating Habs (venus) ✓, JFS (jovian) ✗ → 1 target = +3
// 48b: res:'floater' → Celestic (unrestricted) can reach ✓ → 1 placer = +3
// 48c: FH + JFS = 2 competitors → -2
// Total = +4
test('Stratopolis + FH + JFS + Celestic (mixed tags)', 'Stratopolis',
  ['Floating Habs', 'Jupiter Floating Station', 'Celestic'], 4);

// ── SC constants check ──
console.log('\n── SC константы ──');
const scChecks = [
  ['placerPerTarget', 3],
  ['placerTargetCap', 6],
  ['accumWithPlacer', 3],
  ['accumCompete', 2],
  ['noTargetPenalty', 4],
  ['eatsOwnPenalty', 2],
  ['eatsOppBonus', 3],
  ['synRulesCap', 10],
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
