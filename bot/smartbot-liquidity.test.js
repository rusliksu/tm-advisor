#!/usr/bin/env node
'use strict';

const assert = require('assert');

const BOT = require('./smartbot');

function makeCard(name) {
  const cost = BOT.CARD_DATA[name]?.cost || 0;
  return {name, calculatedCost: cost, cost};
}

function makeState({mc, gen, hand, income = 6, players}) {
  return {
    game: {
      generation: gen,
      temperature: -10,
      oxygenLevel: 7,
      oceans: 4,
      venusScaleLevel: 14,
      phase: 'action',
    },
    waitingFor: null,
    cardsInHand: hand,
    thisPlayer: {
      name: 'Test',
      color: 'red',
      megacredits: mc,
      megaCredits: mc,
      megacreditProduction: income,
      terraformRating: 24,
      steel: 0,
      titanium: 0,
      heat: 0,
      plants: 0,
      energy: 0,
      steelValue: 2,
      titaniumValue: 3,
      citiesCount: 0,
      tableau: [{name: 'Viron'}],
      cardsInHand: hand,
      actionsThisGeneration: [],
    },
    players: players || [
      {color: 'red', megacreditProduction: income, terraformRating: 24},
      {color: 'blue', megacreditProduction: 14, terraformRating: 28},
      {color: 'green', megacreditProduction: 9, terraformRating: 26},
    ],
  };
}

function makeWorkflow(hand) {
  return {
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeDelegateWorkflow({hand = [], paid = false, includeHeat = false} = {}) {
  const options = [];
  if (includeHeat) options.push({title: 'Convert 8 heat into temperature', type: 'option'});
  if (hand.length > 0) options.push({title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}});
  options.push({title: paid ? 'Send a delegate in an area (5 M€)' : 'Send a delegate in an area (from lobby)', type: 'party'});
  options.push({title: 'Pass for this generation', type: 'option'});
  return {
    type: 'or',
    title: 'Take your first action',
    options,
  };
}

function makeBuyWorkflow(cards) {
  return {
    type: 'card',
    title: 'Select card(s) to buy',
    min: 0,
    max: 4,
    cards,
  };
}

function makeStandardProjectWorkflow(hand) {
  return {
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: 'Standard projects', type: 'card', cards: ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Colony', 'Aquifer', 'Greenery', 'City'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeAwardActionWorkflow(hand, awardCost = 8) {
  return {
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: `Fund an award (${awardCost} M€)`, type: 'option'},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeProjectVsActionWorkflow(hand, actionCards) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: 'Perform an action from a played card', type: 'card', cards: actionCards, selectBlueCardAction: true},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeActionVsStandardProjectWorkflow(actionCards) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Perform an action from a played card', type: 'card', cards: actionCards, selectBlueCardAction: true},
      {title: 'Standard projects', type: 'card', cards: ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Colony', 'Aquifer', 'Greenery', 'City'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeCustomActionVsStandardProjectWorkflow(actionCards, standardCards) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Perform an action from a played card', type: 'card', cards: actionCards, selectBlueCardAction: true},
      {title: 'Standard projects', type: 'card', cards: standardCards},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeWeakUtilityStandardProjectWorkflow(actionCards) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Perform an action from a played card', type: 'card', cards: actionCards, selectBlueCardAction: true},
      {title: 'Standard projects', type: 'card', cards: ['Excavate:SP', 'Collusion:SP', 'Power Plant:SP'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeSellWorkflow(cards, min = 1) {
  return {
    type: 'card',
    title: 'Sell patents',
    min,
    max: cards.length,
    cards,
  };
}

function testPassesOnMarginalLowMcMidgameCard() {
  const hand = [makeCard('Market Manipulation')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 9, gen: 6, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testSmartPayLeavesOneFloaterForStratosphericBirdsWhenSingleSource() {
  const state = makeState({mc: 6, gen: 7, hand: []});
  state.thisPlayer.floaters = 3;
  state.thisPlayer.tableau = [{name: 'Dirigibles', resources: 3}];
  const pay = BOT.TM_BRAIN.smartPay(9, state, {paymentOptions: {floaters: true}}, ['venus', 'animal'], 'Stratospheric Birds');
  assert.strictEqual(pay.floaters, 2);
  assert.strictEqual(pay.megacredits ?? pay.megaCredits, 3);
}

function testSmartPayCanSpendAllFloatersForStratosphericBirdsWhenMultipleSources() {
  const state = makeState({mc: 0, gen: 7, hand: []});
  state.thisPlayer.floaters = 3;
  state.thisPlayer.tableau = [
    {name: 'Dirigibles', resources: 2},
    {name: 'Aerial Mappers', resources: 1},
  ];
  const pay = BOT.TM_BRAIN.smartPay(9, state, {paymentOptions: {floaters: true}}, ['venus', 'animal'], 'Stratospheric Birds');
  assert.strictEqual(pay.floaters, 3);
  assert.strictEqual(pay.megacredits ?? pay.megaCredits, 0);
}

function testStillPlaysStrongCardWhenLowOnCash() {
  const hand = [makeCard('Research')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 13, gen: 6, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Research');
}

function testPassesOnWeakNoSpMidgameCard() {
  const hand = [makeCard('Supercapacitors')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 13, gen: 7, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testPassesOnNegativeNoSpGen3Card() {
  const hand = [makeCard('Sabotage')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 6, gen: 3, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testPrefersHeatOverFreeDelegate() {
  const state = makeState({mc: 6, gen: 6, hand: []});
  state.thisPlayer.heat = 8;
  const input = BOT.handleInput(makeDelegateWorkflow({includeHeat: true}), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testSkipsPaidDelegateInMidgame() {
  const hand = [makeCard('Lunar Beam')];
  const input = BOT.handleInput(makeDelegateWorkflow({hand, paid: true}), makeState({mc: 9, gen: 5, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 2);
}

function testStillUsesFreeDelegateAsFallback() {
  const input = BOT.handleInput(makeDelegateWorkflow(), makeState({mc: 8, gen: 6, hand: []}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testFreeDelegateDoesNotDelayProjectCardPass() {
  const hand = [makeCard('Research')];
  const input = BOT.handleInput(makeDelegateWorkflow({hand}), makeState({mc: 8, gen: 8, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 2);
}

function testBuyPhaseRelaxesReserveWhenHandStarved() {
  const pack = ['Solar Power', 'Acquired Company', 'Market Manipulation', 'Greenhouses'].map(makeCard);
  const input = BOT.handleInput(makeBuyWorkflow(pack), makeState({mc: 18, gen: 5, hand: []}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.ok(input.cards.length >= 2, 'starving hand should buy at least 2 playable cards');
  assert.ok(input.cards.includes('Acquired Company'));
}

function testStarvedBuySkipsWeakFiller() {
  const pack = ['Research', 'Acquired Company', 'Political Alliance', 'Envoys From Venus'].map(makeCard);
  const input = BOT.handleInput(makeBuyWorkflow(pack), makeState({mc: 24, gen: 5, hand: []}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.ok(input.cards.includes('Research'));
  assert.ok(input.cards.includes('Acquired Company'));
  assert.ok(!input.cards.includes('Political Alliance'));
  assert.ok(!input.cards.includes('Envoys From Venus'));
}

function testBuyPhaseStaysTightWhenHandIsAlreadyFull() {
  const pack = ['Solar Power', 'Acquired Company', 'Market Manipulation', 'Greenhouses'].map(makeCard);
  const fullHand = Array.from({length: 6}, (_, i) => ({name: `Dummy${i}`}));
  const input = BOT.handleInput(makeBuyWorkflow(pack), makeState({mc: 18, gen: 5, hand: fullHand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 1);
}

function testThinHandMidgamePrefersPlayableCardOverSmallSpEdge() {
  const hand = [makeCard('Floater Prototypes')];
  const players = [
    {color: 'red', megacreditProduction: 6, terraformRating: 24},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), makeState({mc: 28, gen: 4, hand, players}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Floater Prototypes');
}

function testThinHandMidgameStillLetsSpBeatWeakCard() {
  const hand = [makeCard('Induced Tremor')];
  const players = [
    {color: 'red', megacreditProduction: 6, terraformRating: 24},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), makeState({mc: 17, gen: 4, hand, players}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testVisibleThinPlayPackBeatsSmallSpEdgeDespiteCloggedHand() {
  const visible = [makeCard('Floater Prototypes')];
  const fullHand = ['Space Port', 'Heavy Taxation', 'Dawn City', 'Moss', 'Floater Prototypes', 'Luxury Estate'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 6, terraformRating: 24},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(visible), makeState({mc: 28, gen: 4, hand: fullHand, players}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Floater Prototypes');
}

function testSetupCardMidgameBeatsSmallSpEdgeWithThreeVisibleCards() {
  const hand = ['Solarnet', 'Recruitment', 'Soil Export'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 4, terraformRating: 20},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const state = makeState({mc: 14, gen: 6, hand, players, income: 4});
  state.thisPlayer.terraformRating = 20;
  state.game.temperature = -10;
  state.game.oxygenLevel = 8;
  state.game.oceans = 5;
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Solarnet');
}

function testProdSetupCardMidgameBeatsSmallSpEdge() {
  const hand = ['Deep Well Heating', 'Recruitment', 'Soil Export'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 4, terraformRating: 20},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const state = makeState({mc: 14, gen: 6, hand, players, income: 4});
  state.thisPlayer.terraformRating = 20;
  state.game.temperature = -10;
  state.game.oxygenLevel = 8;
  state.game.oceans = 5;
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Deep Well Heating');
}

function testNonSetupFillerStillLetsSpWinOnBigEdge() {
  const hand = ['Crash Site Cleanup', 'Recruitment', 'Soil Export'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 4, terraformRating: 20},
    {color: 'blue', megacreditProduction: 0, terraformRating: 5},
    {color: 'green', megacreditProduction: 0, terraformRating: 5},
  ];
  const state = makeState({mc: 14, gen: 6, hand, players, income: 4});
  state.thisPlayer.terraformRating = 20;
  state.game.temperature = -10;
  state.game.oxygenLevel = 8;
  state.game.oceans = 5;
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testEarlyStandardProjectPrefersColonyOverBlindAsteroid() {
  const state = makeState({mc: 22, gen: 1, hand: []});
  state.game.colonies = [
    {name: 'Luna', colonies: []},
    {name: 'Europa', colonies: []},
    {name: 'Callisto', colonies: []},
  ];
  state.thisPlayer.coloniesCount = 0;
  const input = BOT.handleInput(makeStandardProjectWorkflow([]), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Colony']);
}

function testLateClosedGlobalsPassesInsteadOfWeakStandardProjectFallback() {
  const state = makeState({mc: 40, gen: 15, hand: []});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 30;
  state.game.colonies = [
    {name: 'Callisto', colonies: ['blue', 'green']},
    {name: 'Io', colonies: ['blue', 'green']},
  ];
  state.thisPlayer.coloniesCount = 2;
  const input = BOT.handleInput(makeStandardProjectWorkflow([]), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 2);
}

function testWeakEndgameStandardProjectsDoNotBeatBlueAction() {
  const actionCards = ['Underground Detonations', 'Power Infrastructure', 'Fish'].map(makeCard);
  const state = makeState({mc: 25, gen: 13, hand: [], income: 24});
  state.thisPlayer.energy = 10;
  state.thisPlayer.plants = 7;
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 30;
  const input = BOT.handleInput(makeActionVsStandardProjectWorkflow(actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testLateOpenGlobalsPreferTerraformingSpOverPureVpActions() {
  const actionCards = ['Birds', 'Fish'].map(makeCard);
  const state = makeState({mc: 25, gen: 14, hand: [], income: 24});
  state.game.temperature = 0;
  state.game.oxygenLevel = 11;
  state.game.oceans = 7;
  state.game.venusScaleLevel = 22;
  const input = BOT.handleInput(makeActionVsStandardProjectWorkflow(actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testLateClosureStandardProjectSelectionPrefersTerraformingOverUtilitySp() {
  const actionCards = ['Local Shading', 'Cultivation of Venus', 'Venusian Insects'].map(makeCard);
  const standardCards = ['Collusion:SP', 'Excavate:SP', 'Air Scrapping'].map(makeCard);
  const state = makeState({mc: 90, gen: 22, hand: [], income: 37});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 22;
  state.thisPlayer.steelProduction = 2;
  state.thisPlayer.steel = 4;
  state.thisPlayer.corruption = 1;
  const input = BOT.handleInput(makeCustomActionVsStandardProjectWorkflow(actionCards, standardCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Air Scrapping']);
}

function testClosureModeCompetitionUsesTerraformingSpOverWeakUtilitySp() {
  const actionCards = ['Breeding Farms', 'Search For Life', 'Hi-Tech Lab'].map(makeCard);
  const standardCards = ['Collusion:SP', 'Excavate:SP', 'Air Scrapping'].map(makeCard);
  const state = makeState({mc: 35, gen: 12, hand: [], income: 31});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 22;
  state.thisPlayer.steelProduction = 2;
  state.thisPlayer.steel = 4;
  state.thisPlayer.corruption = 1;
  const input = BOT.handleInput(makeCustomActionVsStandardProjectWorkflow(actionCards, standardCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Air Scrapping']);
}

function testLateCoreGlobalClosurePrefersGreeneryOverBlueActions() {
  const actionCards = ['Birds', 'Penguins', 'Search For Life'].map(makeCard);
  const standardCards = ['Collusion:SP', 'Excavate:SP', 'Asteroid:SP', 'Air Scrapping', 'Aquifer', 'Greenery'].map(makeCard);
  const state = makeState({mc: 40, gen: 13, hand: [], income: 28});
  state.game.temperature = 8;
  state.game.oxygenLevel = 13;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 30;
  const input = BOT.handleInput(makeCustomActionVsStandardProjectWorkflow(actionCards, standardCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Greenery']);
}

function testLateOceanClosurePrefersAquiferOverBlueActions() {
  const actionCards = ['Water Splitting Plant', 'Vermin', 'Venusian Insects'].map(makeCard);
  const standardCards = ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Aquifer', 'Greenery'].map(makeCard);
  const state = makeState({mc: 44, gen: 12, hand: [], income: 22});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 5;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.steel = 4;
  state.thisPlayer.titanium = 5;
  state.thisPlayer.heat = 6;
  state.thisPlayer.energy = 4;
  const input = BOT.handleInput(makeCustomActionVsStandardProjectWorkflow(actionCards, standardCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testMidgameExcavateDoesNotBeatStrongBlueActionWithSynergy() {
  const actionCards = ['Fish', 'Underground Detonations'].map(makeCard);
  const state = makeState({mc: 25, gen: 7, hand: [], income: 22});
  state.thisPlayer.steelProduction = 1;
  state.thisPlayer.steel = 4;
  state.thisPlayer.corruption = 1;
  const input = BOT.handleInput(makeWeakUtilityStandardProjectWorkflow(actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testWeakBlueActionMidgamePrefersNearThresholdSetupCard() {
  const hand = ['Insulation'].map(makeCard);
  const actionCards = ['Extremophiles', 'Think Tank'].map(makeCard);
  const state = makeState({mc: 7, gen: 6, hand, income: 28});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Insulation');
}

function testStrongerBlueActionStillBeatsNearThresholdSetupCard() {
  const hand = ['Insulation'].map(makeCard);
  const actionCards = ['Caretaker Contract'].map(makeCard);
  const state = makeState({mc: 7, gen: 6, hand, income: 28});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Caretaker Contract']);
}

function testWeakBlueActionMidgamePrefersSingleCheapPositiveCardWithoutSp() {
  const hand = ['Market Manipulation'].map(makeCard);
  const actionCards = ['Extremophiles', 'Think Tank'].map(makeCard);
  const state = makeState({mc: 1, gen: 8, hand, income: 26});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Market Manipulation');
}

function testWeakBlueActionMidgamePrefersSingleHigherValueCardWithoutSp() {
  const hand = ['Mining Market Insider'].map(makeCard);
  const actionCards = ['Extremophiles', 'Think Tank'].map(makeCard);
  const state = makeState({mc: 5, gen: 7, hand, income: 28});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Mining Market Insider');
}

function testWeakBlueActionMidgamePrefersSingleDrawSetupCardWithoutSp() {
  const hand = ['Invention Contest'].map(makeCard);
  const actionCards = ['Cloud Vortex Outpost', 'Space Elevator', 'Cloud Tourism', 'Sub-Crust Measurements', 'Atmo Collectors'].map(makeCard);
  const state = makeState({mc: 4, gen: 6, hand, income: 19});
  state.thisPlayer.steel = 1;
  state.thisPlayer.heat = 4;
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Invention Contest');
}

function testWeakBlueActionMidgameStillSkipsSingleDeadCardWithoutSp() {
  const hand = ['Hydrogen Processing Plant'].map(makeCard);
  const actionCards = ['Extremophiles', 'Think Tank'].map(makeCard);
  const state = makeState({mc: 9, gen: 7, hand, income: 22});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testSellPatentsKeepsSetupCardsInMidgame() {
  const pack = ['Research Colony', 'Warp Drive', 'Air Raid', 'Outdoor Sports', 'Casinos', 'Terraforming Contract'].map(makeCard);
  const input = BOT.handleInput(makeSellWorkflow(pack), makeState({mc: 2, gen: 6, hand: pack}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.ok(input.cards.length >= 1);
  assert.ok(input.cards.length <= 2, 'midgame sell should trim, not dump half the hand');
  assert.ok(!input.cards.includes('Research Colony'));
  assert.ok(!input.cards.includes('Warp Drive'));
}

function testSellPatentsStillDumpsDeadCardsInEndgame() {
  const pack = ['Air Raid', 'Sabotage', 'Man-made Volcano', 'Fuel Factory'].map(makeCard);
  const state = makeState({mc: 1, gen: 11, hand: pack});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 30;
  const input = BOT.handleInput(makeSellWorkflow(pack), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 4);
}

function testDelaysFirstAwardForStrongPlayableCard() {
  const hand = ['Olympus Conference', 'Think Tank', 'Mining Expedition'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 10, terraformRating: 28, tags: {science: 6}},
    {color: 'blue', megacreditProduction: 5, terraformRating: 24, tags: {science: 3}},
    {color: 'green', megacreditProduction: 4, terraformRating: 24, tags: {science: 2}},
  ];
  const state = makeState({mc: 28, gen: 5, hand, players, income: 10});
  state.game.awards = [
    {name: 'Banker', scores: [{color: 'red', score: 10}, {color: 'blue', score: 5}, {color: 'green', score: 4}]},
    {name: 'Scientist', scores: [{color: 'red', score: 6}, {color: 'blue', score: 3}, {color: 'green', score: 2}]},
  ];
  state.thisPlayer.tags = {science: 6};

  const input = BOT.handleInput(makeAwardActionWorkflow(hand, 8), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Olympus Conference');
}

function testDelaysSecondAwardForVeryStrongPlayableCard() {
  const hand = ['Interplanetary Colony Ship', 'Lunar Embassy'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 10, terraformRating: 28, tags: {science: 2}},
    {color: 'blue', megacreditProduction: 4, terraformRating: 24, tags: {science: 1}},
    {color: 'green', megacreditProduction: 5, terraformRating: 24, tags: {science: 1}},
  ];
  const state = makeState({mc: 34, gen: 7, hand, players, income: 10});
  state.game.awards = [
    {name: 'Banker', scores: [{color: 'red', score: 11}, {color: 'blue', score: 6}, {color: 'green', score: 5}]},
    {name: 'Landlord', scores: [{color: 'red', score: 3}, {color: 'blue', score: 1}, {color: 'green', score: 1}]},
  ];
  state.game.fundedAwards = [{name: 'Thermalist'}];

  const input = BOT.handleInput(makeAwardActionWorkflow(hand, 14), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Interplanetary Colony Ship');
}

function testStillFundsAwardWhenVisibleCardsAreWeak() {
  const hand = ['Sabotage'].map(makeCard);
  const players = [
    {color: 'red', megacreditProduction: 10, terraformRating: 28, tags: {science: 1}},
    {color: 'blue', megacreditProduction: 5, terraformRating: 24, tags: {science: 0}},
    {color: 'green', megacreditProduction: 4, terraformRating: 24, tags: {science: 0}},
  ];
  const state = makeState({mc: 28, gen: 5, hand, players, income: 10});
  state.game.awards = [
    {name: 'Banker', scores: [{color: 'red', score: 10}, {color: 'blue', score: 5}, {color: 'green', score: 4}]},
  ];

  const input = BOT.handleInput(makeAwardActionWorkflow(hand, 8), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function main() {
  testSmartPayLeavesOneFloaterForStratosphericBirdsWhenSingleSource();
  testSmartPayCanSpendAllFloatersForStratosphericBirdsWhenMultipleSources();
  testPassesOnMarginalLowMcMidgameCard();
  testStillPlaysStrongCardWhenLowOnCash();
  testPassesOnWeakNoSpMidgameCard();
  testPassesOnNegativeNoSpGen3Card();
  testPrefersHeatOverFreeDelegate();
  testSkipsPaidDelegateInMidgame();
  testStillUsesFreeDelegateAsFallback();
  testFreeDelegateDoesNotDelayProjectCardPass();
  testBuyPhaseRelaxesReserveWhenHandStarved();
  testStarvedBuySkipsWeakFiller();
  testBuyPhaseStaysTightWhenHandIsAlreadyFull();
  testThinHandMidgamePrefersPlayableCardOverSmallSpEdge();
  testThinHandMidgameStillLetsSpBeatWeakCard();
  testVisibleThinPlayPackBeatsSmallSpEdgeDespiteCloggedHand();
  testSetupCardMidgameBeatsSmallSpEdgeWithThreeVisibleCards();
  testProdSetupCardMidgameBeatsSmallSpEdge();
  testNonSetupFillerStillLetsSpWinOnBigEdge();
  testEarlyStandardProjectPrefersColonyOverBlindAsteroid();
  testLateClosedGlobalsPassesInsteadOfWeakStandardProjectFallback();
  testWeakEndgameStandardProjectsDoNotBeatBlueAction();
  testLateOpenGlobalsPreferTerraformingSpOverPureVpActions();
  testLateClosureStandardProjectSelectionPrefersTerraformingOverUtilitySp();
  testClosureModeCompetitionUsesTerraformingSpOverWeakUtilitySp();
  testLateCoreGlobalClosurePrefersGreeneryOverBlueActions();
  testLateOceanClosurePrefersAquiferOverBlueActions();
  testMidgameExcavateDoesNotBeatStrongBlueActionWithSynergy();
  testWeakBlueActionMidgamePrefersNearThresholdSetupCard();
  testStrongerBlueActionStillBeatsNearThresholdSetupCard();
  testWeakBlueActionMidgamePrefersSingleCheapPositiveCardWithoutSp();
  testWeakBlueActionMidgamePrefersSingleHigherValueCardWithoutSp();
  testWeakBlueActionMidgamePrefersSingleDrawSetupCardWithoutSp();
  testWeakBlueActionMidgameStillSkipsSingleDeadCardWithoutSp();
  testSellPatentsKeepsSetupCardsInMidgame();
  testSellPatentsStillDumpsDeadCardsInEndgame();
  testDelaysFirstAwardForStrongPlayableCard();
  testDelaysSecondAwardForVeryStrongPlayableCard();
  testStillFundsAwardWhenVisibleCardsAreWeak();
  console.log('smartbot-liquidity tests passed');
}

module.exports = {
  testSmartPayLeavesOneFloaterForStratosphericBirdsWhenSingleSource,
  testSmartPayCanSpendAllFloatersForStratosphericBirdsWhenMultipleSources,
  testBuyPhaseRelaxesReserveWhenHandStarved,
  testBuyPhaseStaysTightWhenHandIsAlreadyFull,
  testPrefersHeatOverFreeDelegate,
  testPassesOnNegativeNoSpGen3Card,
  testPassesOnMarginalLowMcMidgameCard,
  testSkipsPaidDelegateInMidgame,
  testStarvedBuySkipsWeakFiller,
  testFreeDelegateDoesNotDelayProjectCardPass,
  testPassesOnWeakNoSpMidgameCard,
  testThinHandMidgamePrefersPlayableCardOverSmallSpEdge,
  testThinHandMidgameStillLetsSpBeatWeakCard,
  testVisibleThinPlayPackBeatsSmallSpEdgeDespiteCloggedHand,
  testSetupCardMidgameBeatsSmallSpEdgeWithThreeVisibleCards,
  testProdSetupCardMidgameBeatsSmallSpEdge,
  testNonSetupFillerStillLetsSpWinOnBigEdge,
  testEarlyStandardProjectPrefersColonyOverBlindAsteroid,
  testLateClosedGlobalsPassesInsteadOfWeakStandardProjectFallback,
  testWeakEndgameStandardProjectsDoNotBeatBlueAction,
  testLateOpenGlobalsPreferTerraformingSpOverPureVpActions,
  testLateClosureStandardProjectSelectionPrefersTerraformingOverUtilitySp,
  testClosureModeCompetitionUsesTerraformingSpOverWeakUtilitySp,
  testLateCoreGlobalClosurePrefersGreeneryOverBlueActions,
  testLateOceanClosurePrefersAquiferOverBlueActions,
  testMidgameExcavateDoesNotBeatStrongBlueActionWithSynergy,
  testWeakBlueActionMidgamePrefersNearThresholdSetupCard,
  testStrongerBlueActionStillBeatsNearThresholdSetupCard,
  testWeakBlueActionMidgamePrefersSingleCheapPositiveCardWithoutSp,
  testWeakBlueActionMidgamePrefersSingleHigherValueCardWithoutSp,
  testWeakBlueActionMidgamePrefersSingleDrawSetupCardWithoutSp,
  testWeakBlueActionMidgameStillSkipsSingleDeadCardWithoutSp,
  testSellPatentsKeepsSetupCardsInMidgame,
  testSellPatentsStillDumpsDeadCardsInEndgame,
  testDelaysFirstAwardForStrongPlayableCard,
  testDelaysSecondAwardForVeryStrongPlayableCard,
  testStillFundsAwardWhenVisibleCardsAreWeak,
  testStillUsesFreeDelegateAsFallback,
  testStillPlaysStrongCardWhenLowOnCash,
};

if (require.main === module) {
  main();
}
