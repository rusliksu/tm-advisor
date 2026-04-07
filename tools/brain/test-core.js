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
