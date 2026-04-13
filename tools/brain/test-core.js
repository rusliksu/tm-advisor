'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const core = require(path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'brain-core.js'));

function testCoreHelpers() {
  assert.strictEqual(core.pAtLeastOne(0, 10, 4), 0, 'pAtLeastOne should short-circuit zero target');
  assert(core.pAtLeastOne(2, 10, 4) > 0, 'pAtLeastOne should return positive probability');

  const state = {
    game: {
      generation: 7,
      temperature: -6,
      oxygenLevel: 9,
      oceans: 7,
      venusScaleLevel: 20,
      turmoil: {ruling: 'Reds'},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megacredits: 12,
      steel: 2,
      titanium: 1,
      steelValue: 2,
      titaniumValue: 3,
      heat: 9,
      plants: 8,
      cardsInHandNbr: 2,
      cardsInHand: [{name: 'Space Card'}, {name: 'Science Card'}],
      tableau: [{name: 'VP Card'}],
      tags: {science: 2, event: 1},
      terraformRating: 28,
    },
  };

  const timing = core.buildEndgameTiming(state, {
    remainingSteps: () => 5,
    estimateGens: () => 2,
    shouldPush: () => true,
    vpLead: () => 4,
  });
  assert.strictEqual(timing.steps, 5);
  assert.strictEqual(timing.estimatedGens, 2);
  assert.strictEqual(timing.dangerZone, 'yellow');
  assert.strictEqual(timing.shouldPush, true);
  assert.strictEqual(timing.vpLead, 4);
  assert.strictEqual(timing.breakdown.oceans, 7);

  const interpolated = core.estimateScoreCardTimingInterpolated({
    steps: 10,
    gen: 6,
    playerCount: 3,
    totalSteps: 49,
  });
  assert.strictEqual(interpolated.avgGameLen, 9);
  assert.strictEqual(interpolated.gensLeft, 4);
  assert.strictEqual(interpolated.ratePerGen, 2.5);

  const accelerating = core.estimateScoreCardTimingAccelerating({
    steps: 10,
    playerCount: 3,
    totalSteps: 42,
    baseRate: 4,
  });
  assert.strictEqual(accelerating.baseRate, 4);
  assert.strictEqual(accelerating.gensLeft, 2);
  assert(accelerating.ratePerGen > 8 && accelerating.ratePerGen < 9);

  const scoreCtx = core.buildScoreCardContext({
    state,
    card: {name: 'City Card', cost: 18},
    remainingSteps: () => 10,
    isRedsRuling: () => true,
    estimateTiming: (meta) => core.estimateScoreCardTimingInterpolated({
      steps: meta.steps,
      gen: meta.gen,
      playerCount: meta.playerCount,
      totalSteps: 49,
    }),
  });
  assert.strictEqual(scoreCtx.name, 'City Card');
  assert.strictEqual(scoreCtx.cost, 18);
  assert.strictEqual(scoreCtx.gensLeft, 3);
  assert.strictEqual(scoreCtx.redsTax, 3);
  assert.strictEqual(scoreCtx.tableauNames.has('VP Card'), true);

  const prodCtx = core.buildProductionValuationContext({
    state,
    isPatched: true,
    gensLeft: 6,
  });
  assert.strictEqual(prodCtx.tempStepsLeft, 7);
  assert.strictEqual(prodCtx.oxyStepsLeft, 5);
  assert.strictEqual(prodCtx.heatDevalue, 1);
  assert.strictEqual(prodCtx.plantDevalue, 1);
  assert.strictEqual(prodCtx.prodCompound, 1.15);
  assert.strictEqual(prodCtx.prodLatePenalty, 1);

  const passLate = core.analyzePass(state, {remainingSteps: () => 3});
  assert.strictEqual(passLate.shouldPass, false);
  const passPoor = core.analyzePass({
    game: {generation: 10},
    thisPlayer: {megacredits: 3, heat: 0, plants: 0, cardsInHandNbr: 0},
  }, {remainingSteps: () => 3});
  assert.strictEqual(passPoor.shouldPass, true);

  const ranked = core.rankHandCards([
    {name: 'City Card', cost: 18, tags: ['building', 'city']},
    {name: 'VP Card', cost: 8, tags: ['science']},
  ], state, {
    getCardTags: (_name, fallbackTags) => fallbackTags,
    scoreCard: (card) => card.name === 'City Card' ? 24 : 14,
    getOverlayRating: (name) => name === 'VP Card' ? {s: 20} : null,
    isVPCard: (name) => name === 'VP Card',
    isEngineCard: () => false,
    isProdCard: () => false,
    isCityCard: (name) => name === 'City Card',
  });
  assert.strictEqual(ranked[0].name, 'VP Card');
  assert.strictEqual(ranked[0].score, 17);
  assert.strictEqual(ranked[1].reason, 'City [нет MC]');

  const actions = core.analyzeActions({
    type: 'or',
    options: [
      {title: 'Convert plants to greenery'},
      {title: 'Do nothing'},
      {title: 'Fund award'},
    ],
  }, state, {
    remainingSteps: () => 5,
    isRedsRuling: () => true,
    analyzePass: () => ({shouldPass: false, reason: 'Есть доступные действия'}),
  });
  assert.strictEqual(actions[0].action, 'Convert plants to greenery');
  assert(actions.some((item) => item.action === 'Do nothing' && item.score === 20));

  assert.strictEqual(
    core.countTagsInHand('science', [{name: 'Self'}, {name: 'Other'}, {name: 'Third'}], 'Self', (cardName) => {
      if (cardName === 'Other') return ['science', 'space'];
      if (cardName === 'Third') return ['science'];
      return [];
    }),
    2
  );

  const metaBonuses = core.scoreCardMetaBonuses({
    tags: ['earth', 'science'],
    tp: {
      steel: 1,
      titanium: 2,
      steelValue: 2,
      titaniumValue: 3,
      tableau: [{name: 'Teractor'}],
    },
    myTags: {earth: 2, science: 4},
    cost: 22,
    gensLeft: 4,
    prod: {megacredits: 2},
    beh: {},
    discount: {tag: 'earth', amount: 1},
    cd: {},
    act: {},
    state: {game: {fundedAwards: [{name: 'Scientist'}, {name: 'Banker'}]}},
    tagValue: {earth: 2, science: 3},
    stockValues: {megacredits: 5},
    vpMC: core.vpMC,
  });
  assert.strictEqual(metaBonuses.corp, 'Teractor');
  assert.strictEqual(metaBonuses.isEvent, false);
  assert(metaBonuses.delta > 20);

  const vpDelta = core.scoreCardVPInfo({
    vpInfo: {type: 'per_tag', tag: 'science', per: 2},
    gensLeft: 4,
    myTags: {science: 4},
    vpMC: core.vpMC,
  });
  assert.strictEqual(vpDelta, 16.5);

  const recurringDelta = core.scoreRecurringActionValue({
    act: {
      addResources: true,
      drawCard: 1,
      stock: {megacredits: 2, plants: 1},
      production: {heat: 1},
      tr: 1,
      global: {oxygen: 1},
    },
    vpInfo: {type: 'static', vp: 1},
    gensLeft: 3,
    redsTax: 2,
    stockValues: {megacredits: 1, plants: 2},
    prodValues: {heat: 4},
    trMC: core.trMC,
  });
  assert.strictEqual(recurringDelta, 43.5);

  assert.strictEqual(core.scoreCardDiscountValue({discount: {amount: 2}, gensLeft: 4}), 20);
  assert.strictEqual(core.scoreCardDiscountValue({discount: {tag: 'science', amount: 2}, gensLeft: 4}), 8);
  assert.strictEqual(core.scoreCardDisruptionValue({beh: {decreaseAnyProduction: {count: 2}, removeAnyPlants: 4}}), 5);

  const manualDelta = core.applyManualEVAdjustments({
    name: 'Manual Card',
    manual: {perGen: 2, once: 3, perTrigger: 1.5, triggerTag: 'science'},
    actionResourceReq: {'Manual Card': 'energy'},
    tp: {energyProduction: 0, energy: 0},
    gensLeft: 4,
    estimateTriggersPerGen: () => 2,
  });
  assert.strictEqual(manualDelta, 17.4);

  const deckAnalysis = core.analyzeDeck({
    game: {deckSize: 12, discardPileSize: 3, generation: 6, gameOptions: {}},
    players: [
      {color: 'red', tableau: [{name: 'Project A'}], cardsInHandNbr: 0},
      {color: 'blue', tableau: [{name: 'Project B'}], cardsInHandNbr: 2},
    ],
    thisPlayer: {
      color: 'red',
      cardsInHand: [{name: 'Project C'}],
      tableau: [{name: 'Project A'}],
    },
    draftedCards: [{name: 'Project D'}],
  }, {
    'Project A': {s: 80, t: 'S', y: ['Project X']},
    'Project B': {s: 60, t: 'B', y: []},
    'Project C': {s: 70, t: 'A', y: ['Project E']},
    'Project D': {s: 50, t: 'C', y: []},
    'Project E': {s: 65, t: 'A', y: ['Project A']},
  }, {
    'Project A': {tags: ['Science']},
    'Project B': {tags: ['Building']},
    'Project C': {tags: ['Space']},
    'Project D': {tags: ['Event']},
    'Project E': {tags: ['Plant']},
  }, [], {
    optToExp: {},
    expCards: {},
    nonProject: {},
    cardExp: {},
  });
  assert.strictEqual(deckAnalysis.knownCount, 4);
  assert.strictEqual(deckAnalysis.unknownCount, 1);
  assert.strictEqual(deckAnalysis.synCards[0].name, 'Project E');
}

function testWrapperParity() {
  global.TM_BRAIN_CORE = core;
  delete global.TM_RATINGS;

  const botBrain = require(path.join(ROOT, 'bot', 'tm-brain.js'));
  const extensionBrain = require(path.join(ROOT, 'extension', 'tm-brain.js'));

  const state = {
    game: {
      generation: 6,
      temperature: -10,
      oxygenLevel: 7,
      oceans: 6,
      venusScaleLevel: 18,
      turmoil: {ruling: 'Reds'},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megacredits: 4,
      heat: 0,
      plants: 0,
      cardsInHandNbr: 0,
    },
  };

  const waitingFor = {
    type: 'or',
    options: [
      {title: 'Do nothing'},
      {title: 'Fund award'},
      {title: 'Convert heat to temperature'},
    ],
  };

  assert.deepStrictEqual(extensionBrain.analyzePass(state), botBrain.analyzePass(state));
  assert.deepStrictEqual(extensionBrain.analyzeActions(waitingFor, state), botBrain.analyzeActions(waitingFor, state));

  const deckState = {
    game: {deckSize: 15, discardPileSize: 5, generation: 5, gameOptions: {}},
    players: [
      {color: 'red', tableau: [{name: 'Project A'}], cardsInHandNbr: 0},
      {color: 'blue', tableau: [{name: 'Project B'}], cardsInHandNbr: 1},
    ],
    thisPlayer: {
      color: 'red',
      cardsInHand: [{name: 'Project C'}],
      tableau: [{name: 'Project A'}],
    },
    draftedCards: [{name: 'Project D'}],
  };
  const ratings = {
    'Project A': {s: 80, t: 'S', y: ['Project X']},
    'Project B': {s: 60, t: 'B', y: []},
    'Project C': {s: 70, t: 'A', y: ['Project E']},
    'Project D': {s: 50, t: 'C', y: []},
    'Project E': {s: 65, t: 'A', y: ['Project A']},
  };
  const cardData = {
    'Project A': {tags: ['Science']},
    'Project B': {tags: ['Building']},
    'Project C': {tags: ['Space']},
    'Project D': {tags: ['Event']},
    'Project E': {tags: ['Plant']},
  };
  assert.deepStrictEqual(extensionBrain.analyzeDeck(deckState, ratings, cardData, []), botBrain.analyzeDeck(deckState, ratings, cardData, []));

  const insectsBaseState = {
    _botName: 'Beta',
    game: {
      generation: 4,
      temperature: -12,
      oxygenLevel: 6,
      oceans: 4,
      venusScaleLevel: 10,
      gameOptions: {},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megaCredits: 20,
      cardsInHandNbr: 0,
      cardsInHand: [],
      tableau: [],
      tags: {plant: 0, microbe: 0, wild: 0},
    },
  };
  const insectsPlantState = JSON.parse(JSON.stringify(insectsBaseState));
  insectsPlantState.thisPlayer.tags = {plant: 2, microbe: 0, wild: 1};
  const insectsWildSupportState = JSON.parse(JSON.stringify(insectsBaseState));
  insectsWildSupportState.thisPlayer.tags = {plant: 0, microbe: 0, wild: 2};

  const insectsNoSupport = botBrain.scoreCard({name: 'Insects', calculatedCost: 9}, insectsBaseState);
  const insectsPlantSupport = botBrain.scoreCard({name: 'Insects', calculatedCost: 9}, insectsPlantState);
  const insectsWildSupport = botBrain.scoreCard({name: 'Insects', calculatedCost: 9}, insectsWildSupportState);

  assert(insectsPlantSupport > insectsNoSupport + 12, 'Insects should scale with visible plant support');
  assert(insectsWildSupport > insectsNoSupport + 6, 'Wild tags should count as support for Insects');
  assert.strictEqual(
    extensionBrain.scoreCard({name: 'Insects', calculatedCost: 9}, insectsPlantState),
    insectsPlantSupport
  );

  const wormsBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  wormsBaseState.game.oxygenLevel = 4;
  const wormsMicrobeState = JSON.parse(JSON.stringify(wormsBaseState));
  wormsMicrobeState.thisPlayer.tags = {plant: 0, microbe: 3, wild: 1};

  const wormsNoSupport = botBrain.scoreCard({name: 'Worms', calculatedCost: 8}, wormsBaseState);
  const wormsMicrobeSupport = botBrain.scoreCard({name: 'Worms', calculatedCost: 8}, wormsMicrobeState);
  assert(wormsMicrobeSupport > wormsNoSupport + 8, 'Worms should scale with microbe and wild support');

  const tgBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  tgBaseState.thisPlayer.tags = {jovian: 2, wild: 0};
  const tgWildState = JSON.parse(JSON.stringify(insectsBaseState));
  tgWildState.thisPlayer.tags = {jovian: 2, wild: 1};
  const tgBase = botBrain.scoreCard({name: 'Terraforming Ganymede', calculatedCost: 33}, tgBaseState);
  const tgWild = botBrain.scoreCard({name: 'Terraforming Ganymede', calculatedCost: 33}, tgWildState);
  assert(tgWild > tgBase + 4, 'Wild tags should increase tag-dependent immediate effects such as Terraforming Ganymede');

  const surfBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  surfBaseState.thisPlayer.tags = {earth: 1, wild: 0};
  const surfWildState = JSON.parse(JSON.stringify(insectsBaseState));
  surfWildState.thisPlayer.tags = {earth: 1, wild: 1};
  const surfBase = botBrain.scoreCard({name: 'Saturn Surfing', calculatedCost: 13}, surfBaseState);
  const surfWild = botBrain.scoreCard({name: 'Saturn Surfing', calculatedCost: 13}, surfWildState);
  assert(surfWild > surfBase + 2, 'Wild tags should count for Earth-tag payoffs such as Saturn Surfing');
  assert.strictEqual(
    extensionBrain.scoreCard({name: 'Saturn Surfing', calculatedCost: 13}, surfWildState),
    surfWild
  );

  const cloudBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  cloudBaseState.thisPlayer.tags = {earth: 1, venus: 2, wild: 0};
  const cloudWildState = JSON.parse(JSON.stringify(insectsBaseState));
  cloudWildState.thisPlayer.tags = {earth: 1, venus: 2, wild: 1};
  const cloudBase = botBrain.scoreCard({name: 'Cloud Tourism', calculatedCost: 11}, cloudBaseState);
  const cloudWild = botBrain.scoreCard({name: 'Cloud Tourism', calculatedCost: 11}, cloudWildState);
  assert(cloudWild > cloudBase + 3, 'Wild tags should improve Earth-Venus pair counting for Cloud Tourism');
  assert.strictEqual(
    extensionBrain.scoreCard({name: 'Cloud Tourism', calculatedCost: 11}, cloudWildState),
    cloudWild
  );

  const cultBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  cultBaseState.thisPlayer.tags = {venus: 2, wild: 0};
  const cultWildState = JSON.parse(JSON.stringify(insectsBaseState));
  cultWildState.thisPlayer.tags = {venus: 2, wild: 1};
  const cultBase = botBrain.scoreCard({name: 'Cultivation of Venus', calculatedCost: 18}, cultBaseState);
  const cultWild = botBrain.scoreCard({name: 'Cultivation of Venus', calculatedCost: 18}, cultWildState);
  assert(cultWild > cultBase + 3, 'Wild tags should count toward Venus-tag payoffs such as Cultivation of Venus');

  const refineryBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  refineryBaseState.thisPlayer.tags = {venus: 1, wild: 0};
  refineryBaseState.thisPlayer.tableau = [{name: 'Floating Habs'}];
  const refineryWildState = JSON.parse(JSON.stringify(refineryBaseState));
  refineryWildState.thisPlayer.tags = {venus: 1, wild: 1};
  const refineryBase = botBrain.scoreCard({name: 'Floating Refinery', calculatedCost: 7}, refineryBaseState);
  const refineryWild = botBrain.scoreCard({name: 'Floating Refinery', calculatedCost: 7}, refineryWildState);
  assert(refineryWild > refineryBase + 3, 'Wild tags should count toward Venus-tag floater scaling such as Floating Refinery');

  const tardiBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  tardiBaseState.thisPlayer.tags = {microbe: 1, wild: 0};
  const tardiWildState = JSON.parse(JSON.stringify(insectsBaseState));
  tardiWildState.thisPlayer.tags = {microbe: 1, wild: 1};
  const tardiBase = botBrain.scoreCard({name: 'Tardigrades', calculatedCost: 4}, tardiBaseState);
  const tardiWild = botBrain.scoreCard({name: 'Tardigrades', calculatedCost: 4}, tardiWildState);
  assert.strictEqual(tardiWild, tardiBase, 'Wild tags should not alter Tardigrades scoring');

  const sflBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  sflBaseState.thisPlayer.tags = {science: 1, wild: 0};
  const sflWildState = JSON.parse(JSON.stringify(insectsBaseState));
  sflWildState.thisPlayer.tags = {science: 1, wild: 1};
  const sflBase = botBrain.scoreCard({name: 'Search For Life', calculatedCost: 3}, sflBaseState);
  const sflWild = botBrain.scoreCard({name: 'Search For Life', calculatedCost: 3}, sflWildState);
  assert.strictEqual(sflWild, sflBase, 'Wild tags should not alter Search For Life scoring');

  const titanBaseState = JSON.parse(JSON.stringify(insectsBaseState));
  titanBaseState.thisPlayer.tags = {jovian: 1, space: 1, wild: 0};
  const titanWildState = JSON.parse(JSON.stringify(insectsBaseState));
  titanWildState.thisPlayer.tags = {jovian: 1, space: 1, wild: 1};
  const titanBase = botBrain.scoreCard({name: 'Titan Floating Launch-pad', calculatedCost: 18}, titanBaseState);
  const titanWild = botBrain.scoreCard({name: 'Titan Floating Launch-pad', calculatedCost: 18}, titanWildState);
  assert.strictEqual(titanWild, titanBase, 'Wild tags should not alter Titan Floating Launch-pad scoring');
}

function main() {
  testCoreHelpers();
  testWrapperParity();
  console.log('tm-brain core tests: OK');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
