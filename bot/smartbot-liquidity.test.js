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

function makeTradeVsActionWorkflow(actionCards, colonies) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Perform an action from a played card', type: 'card', cards: actionCards, selectBlueCardAction: true},
      {title: 'Trade with a colony tile', type: 'colony', coloniesModel: colonies},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };
}

function makeBuildColonyWorkflow(colonies) {
  return {
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: colonies,
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

function makeStandardOnlyWorkflow(standardCards) {
  return {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Standard projects', type: 'card', cards: standardCards},
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

function makeDraftKeepWorkflow(cards, min = 1) {
  return {
    type: 'card',
    title: 'Select a card to keep and pass the rest to blue',
    min,
    max: min,
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

function testOpeningUsesRobinsonActionBeforeExpensiveSpaceCardWhenCashTight() {
  const hand = [makeCard('Giant Space Mirror')];
  const state = makeState({mc: 4, gen: 1, hand});
  state.thisPlayer.titanium = 8;
  state.thisPlayer.tableau = [{name: 'Robinson Industries'}];
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, [makeCard('Robinson Industries')]), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testPassesOnWeakNoSpMidgameCard() {
  const hand = [makeCard('Supercapacitors')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 13, gen: 7, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testPassesOnExactFloorTrapWhenLowOnCash() {
  const hand = [makeCard('Equatorial Magnetizer')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 11, gen: 6, hand, income: 4}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testPassesOnInflatedWeakUtilityWhenLowOnCash() {
  const hand = [makeCard('Meltworks')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 11, gen: 6, hand, income: 4}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testStillPlaysSetupDrawCardWhenLowOnCash() {
  const hand = [makeCard('Spin-off Department')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 11, gen: 6, hand, income: 4}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Spin-off Department');
}

function testScoreCardPenalizesGlobalRaiseThatHelpsOpponents() {
  const card = makeCard('Comet');
  const neutralState = makeState({
    mc: 30,
    gen: 8,
    hand: [],
    players: [
      {color: 'red', megacreditProduction: 6, terraformRating: 24, plantProduction: 0, heatProduction: 0},
      {color: 'blue', megacreditProduction: 10, terraformRating: 22, plantProduction: 0, heatProduction: 0, heat: 0},
      {color: 'green', megacreditProduction: 9, terraformRating: 21, plantProduction: 0, heatProduction: 0, heat: 0},
    ],
  });
  const hostileState = makeState({
    mc: 30,
    gen: 8,
    hand: [],
    players: [
      {color: 'red', megacreditProduction: 6, terraformRating: 24, plantProduction: 0, heatProduction: 0},
      {color: 'blue', megacreditProduction: 10, terraformRating: 22, plantProduction: 5, heatProduction: 6, heat: 16},
      {color: 'green', megacreditProduction: 9, terraformRating: 21, plantProduction: 0, heatProduction: 0, heat: 0},
    ],
  });
  const neutralScore = BOT.TM_BRAIN.scoreCard(card, neutralState);
  const hostileScore = BOT.TM_BRAIN.scoreCard(card, hostileState);
  assert.ok(hostileScore < neutralScore);
}

function testScoreCardValuesGreenhousesWhenCitiesExist() {
  const card = makeCard('Greenhouses');
  const noCities = makeState({
    mc: 30,
    gen: 6,
    hand: [],
    players: [
      {color: 'red', megacreditProduction: 6, terraformRating: 24, citiesCount: 0},
      {color: 'blue', megacreditProduction: 10, terraformRating: 22, citiesCount: 0},
      {color: 'green', megacreditProduction: 9, terraformRating: 21, citiesCount: 0},
    ],
  });
  const cityTable = makeState({
    mc: 30,
    gen: 6,
    hand: [],
    players: [
      {color: 'red', megacreditProduction: 6, terraformRating: 24, citiesCount: 1},
      {color: 'blue', megacreditProduction: 10, terraformRating: 22, citiesCount: 1},
      {color: 'green', megacreditProduction: 9, terraformRating: 21, citiesCount: 1},
    ],
  });
  const lowScore = BOT.TM_BRAIN.scoreCard(card, noCities);
  const highScore = BOT.TM_BRAIN.scoreCard(card, cityTable);
  assert.ok(highScore > lowScore);
}

function testScoreCardKeepsOptimalAerobrakingPremiumWithSpaceSupport() {
  const hand = [
    makeCard('Optimal Aerobraking'),
    makeCard('Comet'),
    makeCard('Big Asteroid'),
    makeCard('Imported Hydrogen'),
  ];
  const state = makeState({mc: 30, gen: 3, hand});
  const score = BOT.TM_BRAIN.scoreCard(hand[0], state);
  assert.ok(score >= 20);
}

function testScoreCardValuesDiscountCardMoreWithMatchingHand() {
  const card = makeCard('Earth Office');
  const lightHand = [card, makeCard('Comet'), makeCard('Nitrite Reducing Bacteria')];
  const heavyHand = [card, makeCard('Media Group'), makeCard('Cartel'), makeCard('Sponsors')];
  const lowScore = BOT.TM_BRAIN.scoreCard(card, makeState({mc: 30, gen: 4, hand: lightHand}));
  const highScore = BOT.TM_BRAIN.scoreCard(card, makeState({mc: 30, gen: 4, hand: heavyHand}));
  assert.ok(highScore > lowScore);
}

function testScoreCardGivesProductionCardsMoreRunwayEarly() {
  const card = makeCard('Sponsors');
  const earlyScore = BOT.TM_BRAIN.scoreCard(card, makeState({mc: 30, gen: 2, hand: [card]}));
  const lateScore = BOT.TM_BRAIN.scoreCard(card, makeState({mc: 30, gen: 10, hand: [card]}));
  assert.ok(earlyScore > lateScore);
}

function testScoreCardDelaysExpensivePureVpCardsEarly() {
  const card = makeCard('Class-action Lawsuit');
  const earlyState = makeState({mc: 30, gen: 3, hand: []});
  earlyState.game.temperature = -20;
  earlyState.game.oxygenLevel = 2;
  earlyState.game.oceans = 1;
  earlyState.game.venusScaleLevel = 6;
  const lateState = makeState({mc: 30, gen: 10, hand: []});
  lateState.game.temperature = 6;
  lateState.game.oxygenLevel = 12;
  lateState.game.oceans = 8;
  lateState.game.venusScaleLevel = 28;
  const earlyScore = BOT.TM_BRAIN.scoreCard(card, earlyState);
  const lateScore = BOT.TM_BRAIN.scoreCard(card, lateState);
  assert.ok(lateScore > earlyScore);
}

function testScoreCardRewardsVpActionCardsEarlier() {
  const card = makeCard('Birds');
  const earlyState = makeState({mc: 30, gen: 3, hand: []});
  earlyState.game.temperature = -20;
  earlyState.game.oxygenLevel = 2;
  earlyState.game.oceans = 1;
  earlyState.game.venusScaleLevel = 6;
  const lateState = makeState({mc: 30, gen: 10, hand: []});
  lateState.game.temperature = 6;
  lateState.game.oxygenLevel = 12;
  lateState.game.oceans = 8;
  lateState.game.venusScaleLevel = 28;
  const earlyScore = BOT.TM_BRAIN.scoreCard(card, earlyState);
  const lateScore = BOT.TM_BRAIN.scoreCard(card, lateState);
  assert.ok(earlyScore > lateScore);
}

function testScoreCardDoesNotGiveWeakPseudoVpActionEarlyBoost() {
  const card = makeCard('Search For Life');
  const earlyState = makeState({mc: 30, gen: 3, hand: []});
  earlyState.game.temperature = -20;
  earlyState.game.oxygenLevel = 2;
  earlyState.game.oceans = 1;
  earlyState.game.venusScaleLevel = 6;
  const lateState = makeState({mc: 30, gen: 10, hand: []});
  lateState.game.temperature = 6;
  lateState.game.oxygenLevel = 12;
  lateState.game.oceans = 8;
  lateState.game.venusScaleLevel = 28;
  const earlyScore = BOT.TM_BRAIN.scoreCard(card, earlyState);
  const lateScore = BOT.TM_BRAIN.scoreCard(card, lateState);
  assert.ok(earlyScore <= lateScore);
}

function testScoreCardValuesFirstCityHigherThanLaterCities() {
  const card = makeCard('Underground City');
  const firstCityState = makeState({mc: 30, gen: 6, hand: []});
  firstCityState.thisPlayer.citiesCount = 0;
  firstCityState.players[0].citiesCount = 0;
  const laterCityState = makeState({mc: 30, gen: 6, hand: []});
  laterCityState.thisPlayer.citiesCount = 2;
  laterCityState.players[0].citiesCount = 2;
  const firstCityScore = BOT.TM_BRAIN.scoreCard(card, firstCityState);
  const laterCityScore = BOT.TM_BRAIN.scoreCard(card, laterCityState);
  assert.ok(firstCityScore > laterCityScore);
}

function testScoreCardDoesNotGiveOffBoardCitiesMarsCityPremium() {
  const card = makeCard('Ganymede Colony');
  const firstCityState = makeState({mc: 30, gen: 6, hand: []});
  firstCityState.thisPlayer.citiesCount = 0;
  firstCityState.players[0].citiesCount = 0;
  const laterCityState = makeState({mc: 30, gen: 6, hand: []});
  laterCityState.thisPlayer.citiesCount = 2;
  laterCityState.players[0].citiesCount = 2;
  const firstCityScore = BOT.TM_BRAIN.scoreCard(card, firstCityState);
  const laterCityScore = BOT.TM_BRAIN.scoreCard(card, laterCityState);
  assert.strictEqual(firstCityScore, laterCityScore);
}

function testScoreCardKeepsCityPremiumVisibleLate() {
  const card = makeCard('Underground City');
  const midState = makeState({mc: 30, gen: 6, hand: []});
  midState.thisPlayer.citiesCount = 0;
  midState.players[0].citiesCount = 0;
  const lateState = makeState({mc: 30, gen: 10, hand: []});
  lateState.thisPlayer.citiesCount = 0;
  lateState.players[0].citiesCount = 0;
  const midScore = BOT.TM_BRAIN.scoreCard(card, midState);
  const lateScore = BOT.TM_BRAIN.scoreCard(card, lateState);
  assert.ok(lateScore > midScore);
}

function testSearchForLifeEarlyNoSupportPassesWithoutSp() {
  const hand = [makeCard('Search For Life')];
  const state = makeState({mc: 8, gen: 2, hand, income: 22});
  state.game.oxygenLevel = 2;
  const input = BOT.handleInput(makeWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testSearchForLifeScienceShellStillPlayableEarly() {
  const hand = [makeCard('Search For Life')];
  const state = makeState({mc: 8, gen: 2, hand, income: 22});
  state.game.oxygenLevel = 2;
  state.thisPlayer.tableau = [{name: 'Mars University'}, {name: 'Olympus Conference'}];
  const input = BOT.handleInput(makeWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Search For Life');
}

function testLateBuySkipsSearchForLifePseudoVpTrap() {
  const pack = ['Investment Loan', 'Search For Life', 'Floater Prototypes', 'Nitrite Reducing Bacteria'].map(makeCard);
  const state = makeState({mc: 55, gen: 11, hand: [], income: 30});
  state.game.oxygenLevel = 8;
  const input = BOT.handleInput(makeBuyWorkflow(pack), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.ok(!input.cards.includes('Search For Life'));
}

function testLateDraftKeepSkipsSearchForLifePseudoVpTrap() {
  const pack = ['Cutting Edge Technology', 'Search For Life', 'Soil Studies'].map(makeCard);
  const state = makeState({mc: 55, gen: 11, hand: [], income: 30});
  state.game.oxygenLevel = 8;
  const input = BOT.handleInput(makeDraftKeepWorkflow(pack), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 1);
  assert.ok(!input.cards.includes('Search For Life'));
}

function testDraftKeepDoesNotOverweightOpeningBias() {
  const pack = ['Jovian Lanterns', 'Mineral Deposit', 'Release of Inert Gases', 'Subterranean Reservoir'].map(makeCard);
  const state = makeState({mc: 0, gen: 1, hand: pack, income: 0});
  state.game.phase = 'initial_drafting';
  state.game.temperature = -30;
  state.game.oxygenLevel = 0;
  state.game.oceans = 0;
  state.thisPlayer.tableau = [];
  const input = BOT.handleInput(makeDraftKeepWorkflow(pack), state);
  BOT.flushReasoning();
  assert.deepStrictEqual(input, {type: 'card', cards: ['Jovian Lanterns']});
}

function testMolecularPrintingScalesWithCitiesAndColoniesInPlay() {
  const card = makeCard('Molecular Printing');
  const emptyState = makeState({mc: 20, gen: 5, hand: [card], income: 20});
  const liveState = makeState({
    mc: 20,
    gen: 5,
    hand: [card],
    income: 20,
    players: [
      {color: 'red', citiesCount: 2},
      {color: 'blue', citiesCount: 1},
      {color: 'green', citiesCount: 0},
    ],
  });
  liveState.game.colonies = [
    {name: 'Luna', colonies: ['red', 'blue']},
    {name: 'Triton', colonies: [{color: 'green'}]},
  ];
  const emptyScore = BOT.TM_BRAIN.scoreCard(card, emptyState);
  const liveScore = BOT.TM_BRAIN.scoreCard(card, liveState);
  assert.strictEqual(Math.round((liveScore - emptyScore) * 10) / 10, 6);
}

function testBuildColonyPrefersTritonForEarlySpaceHand() {
  const hand = ['Space Hotels', 'Space Port Colony'].map(makeCard);
  const state = makeState({mc: 5, gen: 1, hand, income: 22});
  state.thisPlayer.titanium = 0;
  const colonies = [
    {name: 'Europa', colonies: []},
    {name: 'Titan', colonies: []},
    {name: 'Triton', colonies: []},
  ];
  const input = BOT.handleInput(makeBuildColonyWorkflow(colonies), state);
  BOT.flushReasoning();
  assert.deepStrictEqual(input, {type: 'colony', colonyName: 'Triton'});
}

function testEarlyStandardProjectColonyUsesTritonSpaceHandContext() {
  const hand = ['Space Hotels', 'Space Port Colony'].map(makeCard);
  const state = makeState({mc: 17, gen: 1, hand, income: 22});
  state.thisPlayer.titanium = 0;
  state.game.colonies = [
    {name: 'Europa', colonies: []},
    {name: 'Titan', colonies: []},
    {name: 'Triton', colonies: []},
  ];
  state.thisPlayer.coloniesCount = 0;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Build Colony', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testPassesOnUndergroundDetonationsTrapMidgame() {
  const hand = [makeCard('Underground Detonations')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 10, gen: 4, hand, income: 22}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testCheapEventNoSpGen3CardIsPlayable() {
  const hand = [makeCard('Sabotage')];
  const input = BOT.handleInput(makeWorkflow(hand), makeState({mc: 6, gen: 3, hand}));
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Sabotage');
}

function testPrefersHeatOverFreeDelegate() {
  const state = makeState({mc: 6, gen: 6, hand: []});
  state.thisPlayer.heat = 8;
  const input = BOT.handleInput(makeDelegateWorkflow({includeHeat: true}), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testGen12FarCoreConvertsHeatBeforeAward() {
  const hand = ['Tropical Resort', 'Sister Planet Support'].map(makeCard);
  const state = makeState({mc: 73, gen: 12, hand, income: 35});
  state.game.temperature = -12;
  state.game.oxygenLevel = 5;
  state.game.oceans = 2;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.heat = 8;
  state.thisPlayer.steel = 3;
  state.thisPlayer.tags = {science: 6};
  state.thisPlayer.victoryPointsBreakdown = {total: 75};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 35, victoryPointsBreakdown: {total: 75}, tags: {science: 6}},
    {color: 'blue', megacreditProduction: 45, terraformRating: 35, victoryPointsBreakdown: {total: 85}, tags: {science: 2}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 65}, tags: {science: 1}},
  ];

  const input = BOT.handleInput({
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Convert 8 heat into temperature', type: 'option'},
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: 'Fund an award (20 M€)', type: 'or', options: [
        {title: 'Banker', type: 'option'},
        {title: 'Scientist', type: 'option'},
        {title: 'Do nothing', type: 'option'},
      ]},
      {title: 'Standard projects', type: 'card', cards: ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Colony', 'Aquifer', 'Greenery', 'City'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
}

function testClosedTemperatureSkipsHeatAndPushesGreenery() {
  const state = makeState({mc: 60, gen: 13, hand: [], income: 46});
  state.game.temperature = 8;
  state.game.oxygenLevel = 8;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 24;
  state.thisPlayer.heat = 24;
  state.thisPlayer.energy = 17;
  state.thisPlayer.victoryPointsBreakdown = {total: 70};

  const input = BOT.handleInput({
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Convert 8 heat into temperature', type: 'option'},
      {title: 'Standard projects', type: 'card', cards: ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Colony', 'Aquifer', 'Greenery', 'City'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Greenery']);
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

function testSeptemOpeningUsesCorpActionBeforeProjectCard() {
  const hand = [makeCard('Spin-off Department')];
  const state = makeState({mc: 42, gen: 1, hand, income: 0});
  state.thisPlayer.tableau = [{name: 'Septem Tribus'}];
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, [{name: 'Septem Tribus'}]), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Septem Tribus']);
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
  const hand = [makeCard('Security Fleet')];
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
  const hand = ['Soil Export'].map(makeCard);
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

function testEarlySecondColonyStandardProjectPasses() {
  const state = makeState({mc: 23, gen: 1, hand: []});
  state.game.colonies = [
    {name: 'Luna', colonies: ['red']},
    {name: 'Ceres', colonies: []},
    {name: 'Europa', colonies: []},
  ];
  state.thisPlayer.coloniesCount = 1;
  const input = BOT.handleInput(makeStandardProjectWorkflow([]), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 2);
}

function testLateNegativeBuildColonyStandardProjectPasses() {
  const state = makeState({mc: 21, gen: 6, hand: []});
  state.game.colonies = [
    {name: 'Luna', colonies: []},
    {name: 'Ceres', colonies: []},
    {name: 'Europa', colonies: []},
  ];
  state.thisPlayer.coloniesCount = 3;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Build Colony'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testEarlyZeroBuildColonySecondColonyPasses() {
  const state = makeState({mc: 36, gen: 4, hand: []});
  state.game.colonies = [
    {name: 'Luna', colonies: [{}, {}]},
  ];
  state.thisPlayer.coloniesCount = 1;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Build Colony', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testEarlyExcavateStandardProjectPassesWithoutStrongSupport() {
  const state = makeState({mc: 21, gen: 2, hand: []});
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Excavate:SP', 'Collusion:SP', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testEarlyExcavateStandardProjectPassesWithOnlySteelStock() {
  const state = makeState({mc: 21, gen: 1, hand: []});
  state.thisPlayer.steel = 5;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Excavate:SP', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testExcavateStandardProjectStillAllowedWithStrongSupport() {
  const state = makeState({mc: 21, gen: 4, hand: []});
  state.thisPlayer.steel = 4;
  state.thisPlayer.steelProduction = 2;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Excavate:SP', 'Collusion:SP', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.deepStrictEqual(input.response?.cards, ['Excavate:SP']);
}

function testRepeatedEarlyExcavateStandardProjectPassesAfterFirstToken() {
  const state = makeState({mc: 21, gen: 3, hand: []});
  state.thisPlayer.steelProduction = 1;
  state.thisPlayer.underworldData = {
    corruption: 1,
    activeBonus: undefined,
    tokens: [{token: {}, shelter: false, active: false}],
  };
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Excavate:SP', 'Power Plant:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testAirScrappingStandardProjectPassesWhileCoreGlobalsOpen() {
  const state = makeState({mc: 18, gen: 8, hand: []});
  state.game.temperature = -16;
  state.game.oxygenLevel = 14;
  state.game.oceans = 4;
  state.game.venusScaleLevel = 20;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Air Scrapping'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testAirScrappingStandardProjectPassesWhenOnlyVenusOpen() {
  const state = makeState({mc: 18, gen: 12, hand: []});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 22;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Air Scrapping'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testCollusionStandardProjectPassesEvenWithCorruption() {
  const state = makeState({mc: 18, gen: 6, hand: []});
  state.thisPlayer.corruption = 2;
  const input = BOT.handleInput(makeStandardOnlyWorkflow(['Collusion:SP'].map(makeCard)), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
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

function testProfitableLunaTradeBeatsWeakCardAction() {
  const actionCards = [{name: 'World Government Advisor', resources: 0}];
  const state = makeState({mc: 16, gen: 6, hand: [], income: 24});
  const colonies = [{name: 'Luna', trackPosition: 8, colonies: ['red']}];
  const input = BOT.handleInput(makeTradeVsActionWorkflow(actionCards, colonies), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
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

function testOnlyVenusOpenPrefersBestBlueActionOverAirScrapping() {
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
  assert.strictEqual(input.index, 0);
  assert.deepStrictEqual(input.response?.cards, ['Venusian Insects']);
}

function testOnlyVenusOpenDoesNotForceAirScrappingOverWeakAction() {
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
  assert.strictEqual(input.index, 0);
  assert.deepStrictEqual(input.response?.cards, ['Search For Life']);
}

function testMandatoryStandardProjectSelectorDoesNotReturnEmpty() {
  const state = makeState({mc: 9, gen: 4, hand: [], income: 31});
  state.game.temperature = -28;
  state.game.oxygenLevel = 2;
  state.game.oceans = 0;
  state.game.venusScaleLevel = 4;
  const input = BOT.handleInput({
    type: 'card',
    title: 'Standard projects',
    min: 1,
    max: 1,
    cards: ['Excavate:SP'].map(makeCard),
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.deepStrictEqual(input.cards, ['Excavate:SP']);
}

function makeLateCorePushState() {
  const hand = ['Atalanta Planitia Lab', 'Venus Allies'].map(makeCard);
  const state = makeState({mc: 22, gen: 9, hand, income: 35});
  state.game.temperature = 2;
  state.game.oxygenLevel = 14;
  state.game.oceans = 7;
  state.game.venusScaleLevel = 22;
  state.thisPlayer.steel = 3;
  state.thisPlayer.titanium = 1;
  state.thisPlayer.plants = 7;
  state.thisPlayer.heat = 6;
  state.thisPlayer.terraformRating = 28;
  state.players = [
    {color: 'red', megacreditProduction: 7, terraformRating: 28, victoryPointsBreakdown: {total: 60}},
    {color: 'blue', megacreditProduction: 25, terraformRating: 35, victoryPointsBreakdown: {total: 70}},
    {color: 'green', megacreditProduction: 18, terraformRating: 28, victoryPointsBreakdown: {total: 62}},
  ];
  return {state, hand};
}

function makeLateCorePushStandardCards() {
  return ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Build Colony', 'Aquifer', 'Greenery', 'City']
    .map(makeCard)
    .map((card) => ['Collusion:SP', 'Greenery', 'City'].includes(card.name) ? {...card, isDisabled: true} : card);
}

function makeLateCoreCompletionState({mc = 48, hand = []} = {}) {
  const state = makeState({mc, gen: 12, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 10;
  state.game.oceans = 6;
  state.game.venusScaleLevel = 10;
  state.thisPlayer.steel = 3;
  state.thisPlayer.titanium = 1;
  state.thisPlayer.plants = 7;
  state.thisPlayer.heat = 6;
  state.thisPlayer.terraformRating = 28;
  state.thisPlayer.victoryPointsBreakdown = {total: 60};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 28, victoryPointsBreakdown: {total: 60}, tags: {science: 6}},
    {color: 'blue', megacreditProduction: 25, terraformRating: 35, victoryPointsBreakdown: {total: 70}, tags: {science: 2}},
    {color: 'green', megacreditProduction: 18, terraformRating: 28, victoryPointsBreakdown: {total: 62}, tags: {science: 1}},
  ];
  state.thisPlayer.tags = {science: 6};
  return state;
}

function testLateIdleHighCashCoreOpenChoosesStandardProjectBeforePass() {
  const {state, hand} = makeLateCorePushState();
  const input = BOT.handleInput({
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Send a delegate in an area (from lobby)', type: 'party'},
      {title: 'Fund an award (20 M€)', type: 'or', options: [{title: 'Do nothing', type: 'option'}]},
      {title: 'Standard projects', type: 'card', cards: makeLateCorePushStandardCards()},
      {title: 'Pass for this generation', type: 'option'},
      {title: 'Sell patents', type: 'card', cards: hand},
    ],
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 2);
}

function testLateCoreStandardProjectSelectorPrefersCoreOverExcavate() {
  const {state} = makeLateCorePushState();
  const input = BOT.handleInput({
    type: 'card',
    title: 'Standard projects',
    min: 1,
    max: 1,
    cards: makeLateCorePushStandardCards(),
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.deepStrictEqual(input.cards, ['Asteroid:SP']);
}

function testLateCoreCompletionDefersNonCoreCardForAquifer() {
  const hand = ['Atalanta Planitia Lab', 'Cassini Station', 'Io Mining Industries'].map(makeCard);
  const state = makeLateCoreCompletionState({mc: 48, hand});
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testLateCoreCompletionFundsCoreSpBeforeAward() {
  const state = makeLateCoreCompletionState({mc: 33, hand: []});
  state.game.fundedAwards = [{name: 'Thermalist'}];
  const input = BOT.handleInput({
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Fund an award (14 M€)', type: 'or', options: [{title: 'Banker', type: 'option'}, {title: 'Do nothing', type: 'option'}]},
      {title: 'Standard projects', type: 'card', cards: ['Collusion:SP', 'Excavate:SP', 'Power Plant:SP', 'Asteroid:SP', 'Air Scrapping', 'Build Colony', 'Aquifer', 'Greenery', 'City'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  }, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testGen10CoreCompletionDefersNonCoreCardForGreenery() {
  const hand = ['Medical Lab', 'Luxury Estate', 'Import of Advanced GHG'].map(makeCard);
  const state = makeState({mc: 41, gen: 10, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 7;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 18;
  state.thisPlayer.steel = 4;
  state.thisPlayer.titanium = 2;
  state.thisPlayer.terraformRating = 30;
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Greenery']);
}

function testGen12TwoCoreGlobalsDefersNonCoreCardForAquifer() {
  const hand = ['Jovian Embassy', 'Livestock', 'Acidizing', 'Huygens Observatory'].map(makeCard);
  const state = makeState({mc: 48, gen: 12, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 9;
  state.game.oceans = 3;
  state.game.venusScaleLevel = 10;
  state.thisPlayer.terraformRating = 32;
  state.thisPlayer.tags = {jovian: 3, animal: 2};
  state.thisPlayer.victoryPointsBreakdown = {total: 70};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 32, victoryPointsBreakdown: {total: 70}},
    {color: 'blue', megacreditProduction: 28, terraformRating: 35, victoryPointsBreakdown: {total: 75}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 65}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testGen12ThirteenCoreStepsDefersMidValueCardForAquifer() {
  const hand = ['Medical Lab'].map(makeCard);
  const state = makeState({mc: 62, gen: 12, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 5;
  state.game.oceans = 5;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.terraformRating = 35;
  state.thisPlayer.victoryPointsBreakdown = {total: 75};

  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testFinalCoreStepsDefersHighValueVenusCardForGreenery() {
  const hand = ['Venera Base', 'Jupiter Floating Station', 'Martian Express'].map(makeCard);
  const state = makeState({mc: 54, gen: 13, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 9;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 24;
  state.thisPlayer.tags = {venus: 5, jovian: 2};
  state.thisPlayer.terraformRating = 35;
  state.thisPlayer.victoryPointsBreakdown = {total: 80};
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Greenery']);
}

function makeLateFarCoreCatchUpState({mc = 38, hand = []} = {}) {
  const state = makeState({mc, gen: 11, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 6;
  state.game.oceans = 3;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.steel = 3;
  state.thisPlayer.titanium = 1;
  state.thisPlayer.terraformRating = 35;
  state.thisPlayer.victoryPointsBreakdown = {total: 75};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 35, victoryPointsBreakdown: {total: 75}},
    {color: 'blue', megacreditProduction: 45, terraformRating: 35, victoryPointsBreakdown: {total: 85}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 65}},
  ];
  return state;
}

function testLateFarCoreCatchUpDefersWeakCardForAquifer() {
  const hand = ['Miranda Resort'].map(makeCard);
  const state = makeLateFarCoreCatchUpState({mc: 38, hand});
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testLateFarCoreCatchUpStillPlaysStrongCard() {
  const hand = ['Physics Complex'].map(makeCard);
  const state = makeLateFarCoreCatchUpState({mc: 50, hand});
  state.thisPlayer.steel = 8;
  state.thisPlayer.titanium = 3;
  state.thisPlayer.tags = {science: 6};
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Physics Complex');
}

function makeGen11OceanLagState({mc = 38, hand = []} = {}) {
  const state = makeState({mc, gen: 11, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 9;
  state.game.oceans = 2;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.terraformRating = 35;
  state.thisPlayer.victoryPointsBreakdown = {total: 75};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 35, victoryPointsBreakdown: {total: 75}},
    {color: 'blue', megacreditProduction: 45, terraformRating: 35, victoryPointsBreakdown: {total: 85}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 65}},
  ];
  return state;
}

function testGen11OceanLagDefersSolidCardForAquifer() {
  const hand = ['Gene Repair'].map(makeCard);
  const state = makeGen11OceanLagState({mc: 38, hand});
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testGen11OceanLagStillPlaysPremiumCard() {
  const hand = ['Space Wargames'].map(makeCard);
  const state = makeGen11OceanLagState({mc: 50, hand});
  state.thisPlayer.titanium = 3;
  state.thisPlayer.tags = {jovian: 3};
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Space Wargames');
}

function makeGen11SevereOceanLagState({mc = 38, hand = []} = {}) {
  const state = makeGen11OceanLagState({mc, hand});
  state.game.temperature = 0;
  state.game.oxygenLevel = 14;
  state.game.oceans = 1;
  return state;
}

function testGen11SevereOceanLagPrefersAquiferOverCardAndAsteroid() {
  const hand = ['Aerial Mappers'].map(makeCard);
  const state = makeGen11SevereOceanLagState({mc: 38, hand});
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Aquifer']);
}

function testGen11SevereOceanLagStillPlaysPremiumCard() {
  const hand = ['Warp Drive'].map(makeCard);
  const state = makeGen11SevereOceanLagState({mc: 50, hand});
  state.thisPlayer.tags = {science: 6};
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Warp Drive');
}

function makeGen11OxygenLagState({mc = 38, hand = []} = {}) {
  const state = makeState({mc, gen: 11, hand, income: 35});
  state.game.temperature = 8;
  state.game.oxygenLevel = 3;
  state.game.oceans = 7;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.terraformRating = 35;
  state.thisPlayer.victoryPointsBreakdown = {total: 75};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 35, victoryPointsBreakdown: {total: 75}},
    {color: 'blue', megacreditProduction: 45, terraformRating: 35, victoryPointsBreakdown: {total: 85}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 65}},
  ];
  return state;
}

function testGen11OxygenLagDefersSolidCardForGreenery() {
  const hand = ['Solar Logistics'].map(makeCard);
  const state = makeGen11OxygenLagState({mc: 38, hand});
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Greenery']);
}

function testGen11OxygenLagStillPlaysPremiumCard() {
  const hand = ['Space Wargames'].map(makeCard);
  const state = makeGen11OxygenLagState({mc: 50, hand});
  state.thisPlayer.titanium = 3;
  state.thisPlayer.tags = {jovian: 3};
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Space Wargames');
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

function testFarFromClosureAsteroidDoesNotBeatStrongCardOnTempoBoost() {
  const hand = ['Extremophiles'].map(makeCard);
  const state = makeState({mc: 16, gen: 8, hand, income: 28});
  state.game.temperature = -6;
  state.game.oxygenLevel = 4;
  state.game.oceans = 6;
  state.game.venusScaleLevel = 14;
  state.thisPlayer.energy = 6;
  state.thisPlayer.plants = 6;
  state.thisPlayer.victoryPointsBreakdown = {total: 21};
  state.players = [
    {color: 'red', megacreditProduction: 28, terraformRating: 21, victoryPointsBreakdown: {total: 21}},
    {color: 'blue', megacreditProduction: 45, terraformRating: 30, victoryPointsBreakdown: {total: 8}},
    {color: 'green', megacreditProduction: 20, terraformRating: 22, victoryPointsBreakdown: {total: 7}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Extremophiles');
}

function testNearClosureAsteroidStillBeatsWeakCardOnTempoBoost() {
  const hand = ['Price Wars'].map(makeCard);
  const state = makeState({mc: 14, gen: 12, hand, income: 28});
  state.game.temperature = 6;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 30;
  state.thisPlayer.victoryPointsBreakdown = {total: 24};
  state.players = [
    {color: 'red', megacreditProduction: 28, terraformRating: 24, victoryPointsBreakdown: {total: 24}},
    {color: 'blue', megacreditProduction: 42, terraformRating: 28, victoryPointsBreakdown: {total: 10}},
    {color: 'green', megacreditProduction: 18, terraformRating: 20, victoryPointsBreakdown: {total: 9}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Asteroid:SP']);
}

function testMidClosureAsteroidDoesNotBeatSolidCardOnNegativeRaw() {
  const hand = ['Farming'].map(makeCard);
  const state = makeState({mc: 41, gen: 10, hand, income: 35});
  state.game.temperature = 4;
  state.game.oxygenLevel = 11;
  state.game.oceans = 8;
  state.game.venusScaleLevel = 0;
  state.thisPlayer.steel = 2;
  state.thisPlayer.plants = 4;
  state.thisPlayer.heat = 3;
  state.thisPlayer.victoryPointsBreakdown = {total: 28};
  state.players = [
    {color: 'red', megacreditProduction: 35, terraformRating: 27, victoryPointsBreakdown: {total: 28}},
    {color: 'blue', megacreditProduction: 48, terraformRating: 32, victoryPointsBreakdown: {total: 8}},
    {color: 'green', megacreditProduction: 20, terraformRating: 25, victoryPointsBreakdown: {total: 7}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Farming');
}

function testLateTerraformRaceDefersProductionCardForAsteroid() {
  const hand = ['Tectonic Stress Power', 'Hydrogen to Venus', 'Robot Pollinators'].map(makeCard);
  const state = makeState({mc: 78, gen: 10, hand, income: 33});
  state.game.temperature = -2;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 16;
  state.thisPlayer.steel = 25;
  state.thisPlayer.energy = 6;
  state.thisPlayer.terraformRating = 40;
  state.thisPlayer.tags = {science: 5, building: 10, venus: 3};
  state.thisPlayer.tableau = [{name: 'Tharsis Republic'}, {name: 'Standard Technology'}];
  state.players = [
    {color: 'red', megacreditProduction: 33, terraformRating: 40, victoryPointsBreakdown: {total: 100}},
    {color: 'blue', megacreditProduction: 61, terraformRating: 34, victoryPointsBreakdown: {total: 118}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 90}},
  ];

  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response?.cards, ['Asteroid:SP']);
}

function testLateTerraformRaceIgnoresVenusAndUtilityStandardProjects() {
  const hand = ['Fuel Factory'].map(makeCard);
  const state = makeState({mc: 78, gen: 10, hand, income: 33});
  state.game.temperature = -2;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 16;
  state.thisPlayer.steel = 25;
  state.thisPlayer.energy = 6;
  state.thisPlayer.terraformRating = 40;
  state.thisPlayer.tags = {science: 5, building: 10, venus: 3};
  state.thisPlayer.tableau = [{name: 'Tharsis Republic'}, {name: 'Standard Technology'}];
  state.players = [
    {color: 'red', megacreditProduction: 33, terraformRating: 40, victoryPointsBreakdown: {total: 100}},
    {color: 'blue', megacreditProduction: 61, terraformRating: 34, victoryPointsBreakdown: {total: 118}},
    {color: 'green', megacreditProduction: 20, terraformRating: 30, victoryPointsBreakdown: {total: 90}},
  ];
  const workflow = {
    type: 'or',
    title: 'Take your first action',
    options: [
      {title: 'Play project card', type: 'card', cards: hand, paymentOptions: {}},
      {title: 'Standard projects', type: 'card', cards: ['Air Scrapping', 'Excavate:SP'].map(makeCard)},
      {title: 'Pass for this generation', type: 'option'},
    ],
  };

  const input = BOT.handleInput(workflow, state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Fuel Factory');
}

function testCoreClosedVenusOpenDoesNotCreateProductionRunway() {
  const hand = ['Tectonic Stress Power', 'Fuel Factory'].map(makeCard);
  const state = makeState({mc: 78, gen: 10, hand, income: 33});
  state.game.temperature = 8;
  state.game.oxygenLevel = 14;
  state.game.oceans = 9;
  state.game.venusScaleLevel = 0;
  state.thisPlayer.steel = 25;
  state.thisPlayer.energy = 6;
  state.thisPlayer.terraformRating = 40;
  state.thisPlayer.tags = {science: 5, building: 10, venus: 3};
  state.thisPlayer.tableau = [{name: 'Tharsis Republic'}, {name: 'Standard Technology'}];

  const input = BOT.handleInput(makeWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testMidClosureAquiferDoesNotBeatSolidCardOnNegativeRaw() {
  const hand = ['Terraforming Robots'].map(makeCard);
  const state = makeState({mc: 19, gen: 11, hand, income: 43});
  state.game.temperature = 8;
  state.game.oxygenLevel = 4;
  state.game.oceans = 8;
  state.game.venusScaleLevel = 28;
  state.thisPlayer.steel = 10;
  state.thisPlayer.plants = 3;
  state.thisPlayer.heat = 6;
  state.thisPlayer.energy = 4;
  state.thisPlayer.terraformRating = 25;
  state.thisPlayer.victoryPointsBreakdown = {total: 25};
  state.players = [
    {color: 'red', megacreditProduction: 43, terraformRating: 25, victoryPointsBreakdown: {total: 25}},
    {color: 'blue', megacreditProduction: 20, terraformRating: 22, victoryPointsBreakdown: {total: 8}},
    {color: 'green', megacreditProduction: 18, terraformRating: 18, victoryPointsBreakdown: {total: 7}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Terraforming Robots');
}

function testNearClosureAquiferStillBeatsWeakCard() {
  const hand = ['Geologist Team'].map(makeCard);
  const state = makeState({mc: 39, gen: 11, hand, income: 44});
  state.game.temperature = 8;
  state.game.oxygenLevel = 12;
  state.game.oceans = 7;
  state.game.venusScaleLevel = 20;
  state.thisPlayer.titanium = 1;
  state.thisPlayer.plants = 6;
  state.thisPlayer.heat = 3;
  state.thisPlayer.energy = 6;
  state.thisPlayer.terraformRating = 28;
  state.thisPlayer.victoryPointsBreakdown = {total: 28};
  state.players = [
    {color: 'red', megacreditProduction: 44, terraformRating: 28, victoryPointsBreakdown: {total: 28}},
    {color: 'blue', megacreditProduction: 18, terraformRating: 20, victoryPointsBreakdown: {total: 7}},
    {color: 'green', megacreditProduction: 14, terraformRating: 18, victoryPointsBreakdown: {total: 6}},
  ];
  const input = BOT.handleInput(makeStandardProjectWorkflow(hand), state);
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

function testWeakBlueActionMidgamePrefersSinglePlayablePositiveCardWithoutSp() {
  const hand = ['Research'].map(makeCard);
  const actionCards = ['Extremophiles', 'Think Tank'].map(makeCard);
  const state = makeState({mc: 11, gen: 8, hand, income: 26});
  const input = BOT.handleInput(makeProjectVsActionWorkflow(hand, actionCards), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response?.card, 'Research');
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

function testSellPatentsDoesNotProtectSearchForLifeTrap() {
  const pack = ['Warp Drive', 'Search For Life'].map(makeCard);
  const state = makeState({mc: 2, gen: 6, hand: pack});
  state.game.oxygenLevel = 8;
  const input = BOT.handleInput(makeSellWorkflow(pack), state);
  BOT.flushReasoning();
  assert.strictEqual(input.type, 'card');
  assert.ok(input.cards.includes('Search For Life'));
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
  testPassesOnExactFloorTrapWhenLowOnCash();
  testPassesOnInflatedWeakUtilityWhenLowOnCash();
  testStillPlaysSetupDrawCardWhenLowOnCash();
  testScoreCardPenalizesGlobalRaiseThatHelpsOpponents();
  testScoreCardValuesGreenhousesWhenCitiesExist();
  testScoreCardKeepsOptimalAerobrakingPremiumWithSpaceSupport();
  testScoreCardValuesDiscountCardMoreWithMatchingHand();
  testScoreCardGivesProductionCardsMoreRunwayEarly();
  testScoreCardDelaysExpensivePureVpCardsEarly();
  testScoreCardRewardsVpActionCardsEarlier();
  testScoreCardDoesNotGiveWeakPseudoVpActionEarlyBoost();
  testScoreCardValuesFirstCityHigherThanLaterCities();
  testScoreCardDoesNotGiveOffBoardCitiesMarsCityPremium();
  testScoreCardKeepsCityPremiumVisibleLate();
  testSearchForLifeEarlyNoSupportPassesWithoutSp();
  testSearchForLifeScienceShellStillPlayableEarly();
  testLateBuySkipsSearchForLifePseudoVpTrap();
  testLateDraftKeepSkipsSearchForLifePseudoVpTrap();
  testDraftKeepDoesNotOverweightOpeningBias();
  testMolecularPrintingScalesWithCitiesAndColoniesInPlay();
  testBuildColonyPrefersTritonForEarlySpaceHand();
  testEarlyStandardProjectColonyUsesTritonSpaceHandContext();
  testPassesOnUndergroundDetonationsTrapMidgame();
  testCheapEventNoSpGen3CardIsPlayable();
  testPrefersHeatOverFreeDelegate();
  testGen12FarCoreConvertsHeatBeforeAward();
  testClosedTemperatureSkipsHeatAndPushesGreenery();
  testSkipsPaidDelegateInMidgame();
  testStillUsesFreeDelegateAsFallback();
  testFreeDelegateDoesNotDelayProjectCardPass();
  testSeptemOpeningUsesCorpActionBeforeProjectCard();
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
  testEarlySecondColonyStandardProjectPasses();
  testLateNegativeBuildColonyStandardProjectPasses();
  testEarlyZeroBuildColonySecondColonyPasses();
  testEarlyExcavateStandardProjectPassesWithoutStrongSupport();
  testEarlyExcavateStandardProjectPassesWithOnlySteelStock();
  testExcavateStandardProjectStillAllowedWithStrongSupport();
  testRepeatedEarlyExcavateStandardProjectPassesAfterFirstToken();
  testAirScrappingStandardProjectPassesWhileCoreGlobalsOpen();
  testAirScrappingStandardProjectPassesWhenOnlyVenusOpen();
  testCollusionStandardProjectPassesEvenWithCorruption();
  testLateClosedGlobalsPassesInsteadOfWeakStandardProjectFallback();
  testWeakEndgameStandardProjectsDoNotBeatBlueAction();
  testProfitableLunaTradeBeatsWeakCardAction();
  testLateOpenGlobalsPreferTerraformingSpOverPureVpActions();
  testOnlyVenusOpenPrefersBestBlueActionOverAirScrapping();
  testOnlyVenusOpenDoesNotForceAirScrappingOverWeakAction();
  testMandatoryStandardProjectSelectorDoesNotReturnEmpty();
  testLateIdleHighCashCoreOpenChoosesStandardProjectBeforePass();
  testLateCoreStandardProjectSelectorPrefersCoreOverExcavate();
  testLateCoreCompletionDefersNonCoreCardForAquifer();
  testLateCoreCompletionFundsCoreSpBeforeAward();
  testGen10CoreCompletionDefersNonCoreCardForGreenery();
  testGen12TwoCoreGlobalsDefersNonCoreCardForAquifer();
  testGen12ThirteenCoreStepsDefersMidValueCardForAquifer();
  testFinalCoreStepsDefersHighValueVenusCardForGreenery();
  testLateFarCoreCatchUpDefersWeakCardForAquifer();
  testLateFarCoreCatchUpStillPlaysStrongCard();
  testGen11OceanLagDefersSolidCardForAquifer();
  testGen11OceanLagStillPlaysPremiumCard();
  testGen11SevereOceanLagPrefersAquiferOverCardAndAsteroid();
  testGen11SevereOceanLagStillPlaysPremiumCard();
  testGen11OxygenLagDefersSolidCardForGreenery();
  testGen11OxygenLagStillPlaysPremiumCard();
  testLateCoreGlobalClosurePrefersGreeneryOverBlueActions();
  testLateOceanClosurePrefersAquiferOverBlueActions();
  testFarFromClosureAsteroidDoesNotBeatStrongCardOnTempoBoost();
  testNearClosureAsteroidStillBeatsWeakCardOnTempoBoost();
  testMidClosureAsteroidDoesNotBeatSolidCardOnNegativeRaw();
  testLateTerraformRaceDefersProductionCardForAsteroid();
  testLateTerraformRaceIgnoresVenusAndUtilityStandardProjects();
  testCoreClosedVenusOpenDoesNotCreateProductionRunway();
  testMidClosureAquiferDoesNotBeatSolidCardOnNegativeRaw();
  testNearClosureAquiferStillBeatsWeakCard();
  testMidgameExcavateDoesNotBeatStrongBlueActionWithSynergy();
  testWeakBlueActionMidgamePrefersNearThresholdSetupCard();
  testStrongerBlueActionStillBeatsNearThresholdSetupCard();
  testWeakBlueActionMidgamePrefersSinglePlayablePositiveCardWithoutSp();
  testWeakBlueActionMidgamePrefersSingleHigherValueCardWithoutSp();
  testWeakBlueActionMidgameStillSkipsSingleDeadCardWithoutSp();
  testSellPatentsKeepsSetupCardsInMidgame();
  testSellPatentsDoesNotProtectSearchForLifeTrap();
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
  testGen12FarCoreConvertsHeatBeforeAward,
  testClosedTemperatureSkipsHeatAndPushesGreenery,
  testCheapEventNoSpGen3CardIsPlayable,
  testPassesOnMarginalLowMcMidgameCard,
  testSkipsPaidDelegateInMidgame,
  testStarvedBuySkipsWeakFiller,
  testFreeDelegateDoesNotDelayProjectCardPass,
  testSeptemOpeningUsesCorpActionBeforeProjectCard,
  testPassesOnWeakNoSpMidgameCard,
  testPassesOnExactFloorTrapWhenLowOnCash,
  testPassesOnInflatedWeakUtilityWhenLowOnCash,
  testStillPlaysSetupDrawCardWhenLowOnCash,
  testScoreCardPenalizesGlobalRaiseThatHelpsOpponents,
  testScoreCardValuesGreenhousesWhenCitiesExist,
  testScoreCardKeepsOptimalAerobrakingPremiumWithSpaceSupport,
  testScoreCardValuesDiscountCardMoreWithMatchingHand,
  testScoreCardGivesProductionCardsMoreRunwayEarly,
  testScoreCardDelaysExpensivePureVpCardsEarly,
  testScoreCardRewardsVpActionCardsEarlier,
  testScoreCardDoesNotGiveWeakPseudoVpActionEarlyBoost,
  testScoreCardValuesFirstCityHigherThanLaterCities,
  testScoreCardDoesNotGiveOffBoardCitiesMarsCityPremium,
  testScoreCardKeepsCityPremiumVisibleLate,
  testSearchForLifeEarlyNoSupportPassesWithoutSp,
  testSearchForLifeScienceShellStillPlayableEarly,
  testLateBuySkipsSearchForLifePseudoVpTrap,
  testLateDraftKeepSkipsSearchForLifePseudoVpTrap,
  testDraftKeepDoesNotOverweightOpeningBias,
  testMolecularPrintingScalesWithCitiesAndColoniesInPlay,
  testBuildColonyPrefersTritonForEarlySpaceHand,
  testEarlyStandardProjectColonyUsesTritonSpaceHandContext,
  testPassesOnUndergroundDetonationsTrapMidgame,
  testThinHandMidgamePrefersPlayableCardOverSmallSpEdge,
  testThinHandMidgameStillLetsSpBeatWeakCard,
  testVisibleThinPlayPackBeatsSmallSpEdgeDespiteCloggedHand,
  testSetupCardMidgameBeatsSmallSpEdgeWithThreeVisibleCards,
  testProdSetupCardMidgameBeatsSmallSpEdge,
  testNonSetupFillerStillLetsSpWinOnBigEdge,
  testEarlyStandardProjectPrefersColonyOverBlindAsteroid,
  testEarlySecondColonyStandardProjectPasses,
  testLateNegativeBuildColonyStandardProjectPasses,
  testEarlyZeroBuildColonySecondColonyPasses,
  testEarlyExcavateStandardProjectPassesWithoutStrongSupport,
  testEarlyExcavateStandardProjectPassesWithOnlySteelStock,
  testExcavateStandardProjectStillAllowedWithStrongSupport,
  testRepeatedEarlyExcavateStandardProjectPassesAfterFirstToken,
  testAirScrappingStandardProjectPassesWhileCoreGlobalsOpen,
  testAirScrappingStandardProjectPassesWhenOnlyVenusOpen,
  testCollusionStandardProjectPassesEvenWithCorruption,
  testLateClosedGlobalsPassesInsteadOfWeakStandardProjectFallback,
  testWeakEndgameStandardProjectsDoNotBeatBlueAction,
  testProfitableLunaTradeBeatsWeakCardAction,
  testLateOpenGlobalsPreferTerraformingSpOverPureVpActions,
  testOnlyVenusOpenPrefersBestBlueActionOverAirScrapping,
  testOnlyVenusOpenDoesNotForceAirScrappingOverWeakAction,
  testMandatoryStandardProjectSelectorDoesNotReturnEmpty,
  testLateIdleHighCashCoreOpenChoosesStandardProjectBeforePass,
  testLateCoreStandardProjectSelectorPrefersCoreOverExcavate,
  testLateCoreCompletionDefersNonCoreCardForAquifer,
  testLateCoreCompletionFundsCoreSpBeforeAward,
  testGen10CoreCompletionDefersNonCoreCardForGreenery,
  testGen12TwoCoreGlobalsDefersNonCoreCardForAquifer,
  testGen12ThirteenCoreStepsDefersMidValueCardForAquifer,
  testFinalCoreStepsDefersHighValueVenusCardForGreenery,
  testLateFarCoreCatchUpDefersWeakCardForAquifer,
  testLateFarCoreCatchUpStillPlaysStrongCard,
  testGen11OceanLagDefersSolidCardForAquifer,
  testGen11OceanLagStillPlaysPremiumCard,
  testGen11SevereOceanLagPrefersAquiferOverCardAndAsteroid,
  testGen11SevereOceanLagStillPlaysPremiumCard,
  testGen11OxygenLagDefersSolidCardForGreenery,
  testGen11OxygenLagStillPlaysPremiumCard,
  testLateCoreGlobalClosurePrefersGreeneryOverBlueActions,
  testLateOceanClosurePrefersAquiferOverBlueActions,
  testFarFromClosureAsteroidDoesNotBeatStrongCardOnTempoBoost,
  testNearClosureAsteroidStillBeatsWeakCardOnTempoBoost,
  testMidClosureAsteroidDoesNotBeatSolidCardOnNegativeRaw,
  testLateTerraformRaceDefersProductionCardForAsteroid,
  testLateTerraformRaceIgnoresVenusAndUtilityStandardProjects,
  testCoreClosedVenusOpenDoesNotCreateProductionRunway,
  testMidClosureAquiferDoesNotBeatSolidCardOnNegativeRaw,
  testNearClosureAquiferStillBeatsWeakCard,
  testMidgameExcavateDoesNotBeatStrongBlueActionWithSynergy,
  testWeakBlueActionMidgamePrefersNearThresholdSetupCard,
  testStrongerBlueActionStillBeatsNearThresholdSetupCard,
  testWeakBlueActionMidgamePrefersSinglePlayablePositiveCardWithoutSp,
  testWeakBlueActionMidgamePrefersSingleHigherValueCardWithoutSp,
  testWeakBlueActionMidgameStillSkipsSingleDeadCardWithoutSp,
  testSellPatentsKeepsSetupCardsInMidgame,
  testSellPatentsDoesNotProtectSearchForLifeTrap,
  testSellPatentsStillDumpsDeadCardsInEndgame,
  testDelaysFirstAwardForStrongPlayableCard,
  testDelaysSecondAwardForVeryStrongPlayableCard,
  testStillFundsAwardWhenVisibleCardsAreWeak,
  testStillUsesFreeDelegateAsFallback,
  testStillPlaysStrongCardWhenLowOnCash,
  testOpeningUsesRobinsonActionBeforeExpensiveSpaceCardWhenCashTight,
};

if (require.main === module) {
  main();
}
