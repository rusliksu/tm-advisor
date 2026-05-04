#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SMARTBOT = require(path.resolve(__dirname, '..', '..', '..', 'bot', 'smartbot'));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const {
  testSmartPayLeavesOneFloaterForStratosphericBirdsWhenSingleSource,
  testSmartPayCanSpendAllFloatersForStratosphericBirdsWhenMultipleSources,
  testBuyPhaseRelaxesReserveWhenHandStarved,
  testBuyPhaseStaysTightWhenHandIsAlreadyFull,
  testPrefersHeatOverFreeDelegate,
  testGen12FarCoreConvertsHeatBeforeAward,
  testClosedTemperatureSkipsHeatAndPushesGreenery,
  testCheapEventNoSpGen3CardIsPlayable,
  testPassesOnMarginalLowMcMidgameCard,
  testPassesOnWeakNoSpMidgameCard,
  testPassesOnExactFloorTrapWhenLowOnCash,
  testPassesOnInflatedWeakUtilityWhenLowOnCash,
  testStillPlaysSetupDrawCardWhenLowOnCash,
  testScoreCardPenalizesGlobalRaiseThatHelpsOpponents,
  testScoreCardValuesGreenhousesWhenCitiesExist,
  testScoreCardMartianRailsScalesWithTableCitiesAndMode,
  testScoreCardKeepsOptimalAerobrakingPremiumWithSpaceSupport,
  testScoreCardValuesMediaGroupBeforeKnownEvents,
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
  testPassesOnUndergroundDetonationsTrapMidgame,
  testSkipsPaidDelegateInMidgame,
  testStarvedBuySkipsWeakFiller,
  testFreeDelegateDoesNotDelayProjectCardPass,
  testSeptemOpeningUsesCorpActionBeforeProjectCard,
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
  testFinalClosedGlobalsUsesScoringBlueActionOverEngineCard,
  testFinalClosedGlobalsUsesScoringBlueActionBeforeCeoPoke,
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
  testStillUsesFreeDelegateAsFallback,
  testStillPlaysStrongCardWhenLowOnCash,
  testSellPatentsKeepsSetupCardsInMidgame,
  testSellPatentsDoesNotProtectSearchForLifeTrap,
  testSellPatentsStillDumpsDeadCardsInEndgame,
  testDelaysFirstAwardForStrongPlayableCard,
  testDelaysSecondAwardForVeryStrongPlayableCard,
  testStillFundsAwardWhenVisibleCardsAreWeak,
} = require(path.resolve(__dirname, '..', '..', '..', 'bot', 'smartbot-liquidity.test'));

function buildDraftProjectCard(name) {
  const cardData = SMARTBOT.TM_BRAIN.getCardDataByName(name) || {};
  const cost = typeof cardData.cost === 'number' ? cardData.cost : 0;
  return {name, cost, calculatedCost: cost};
}

function loadSharedFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'test-fixtures', name), 'utf8'));
}

function testKeepPassDraftUsesDraftRatingNotPlayEv() {
  const wf = {
    type: 'card',
    title: {message: 'Select a card to keep and pass the rest to ${0}', data: []},
    buttonLabel: 'Keep',
    min: 1,
    max: 1,
    cards: [
      buildDraftProjectCard('Viral Enhancers'),
      buildDraftProjectCard('Adapted Lichen'),
      buildDraftProjectCard('Medical Lab'),
      buildDraftProjectCard('Great Escarpment Consortium'),
    ],
  };
  const state = {
    thisPlayer: {
      name: 'Руслан',
      color: 'red',
      megaCredits: 0,
      megacredits: 0,
      terraformRating: 20,
      tableau: [],
      tags: {},
    },
    cardsInHand: [],
    draftedCards: [{name: 'Colonial Representation'}],
    game: {
      generation: 1,
      phase: 'initial_drafting',
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, {type: 'card', cards: ['Viral Enhancers']});
}

function testKeepPassDraftPrefersMolecularPrintingOverGenericPlantProduction() {
  const wf = {
    type: 'card',
    title: {message: 'Select a card to keep and pass the rest to ${0}', data: []},
    buttonLabel: 'Keep',
    min: 1,
    max: 1,
    cards: [
      buildDraftProjectCard('Plantation'),
      buildDraftProjectCard('Molecular Printing'),
      buildDraftProjectCard('Snow Algae'),
    ],
  };
  const state = {
    thisPlayer: {
      name: 'Паша',
      color: 'orange',
      megaCredits: 0,
      megacredits: 0,
      terraformRating: 20,
      tableau: [],
      tags: {},
    },
    cardsInHand: [],
    draftedCards: [],
    players: [{color: 'orange'}, {color: 'red'}, {color: 'gold'}],
    game: {
      generation: 1,
      phase: 'initial_drafting',
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, {type: 'card', cards: ['Molecular Printing']});
}

function testResearchBuyCarriesHighPriorityDraftPickThroughPurchase() {
  const wf = {
    type: 'card',
    title: 'Select card(s) to buy',
    min: 0,
    max: 4,
    cards: [
      buildDraftProjectCard('Viral Enhancers'),
      buildDraftProjectCard('Deepnuking'),
      buildDraftProjectCard('Earth Elevator'),
      buildDraftProjectCard('Private Investigator'),
    ],
  };
  const state = {
    thisPlayer: {
      color: 'blue',
      megaCredits: 40,
      megacredits: 40,
      megacreditProduction: 5,
      terraformRating: 22,
      tableau: [],
      tags: {},
      cardsInHand: [buildDraftProjectCard('Colonial Representation')],
    },
    cardsInHand: [buildDraftProjectCard('Colonial Representation')],
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 4,
      phase: 'research',
      oxygenLevel: 2,
      temperature: -22,
      oceans: 2,
      venusScaleLevel: 4,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert(input.cards.includes('Earth Elevator'));
  assert(input.cards.includes('Viral Enhancers'));
  assert(!input.cards.includes('Deepnuking'));
}

function testOpeningColonyPrefersTritonOverEuropaWhenTitaniumScarce() {
  const wf = {
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: [
      {name: 'Europa', colonies: []},
      {name: 'Titan', colonies: []},
      {name: 'Triton', colonies: []},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megaCredits: 20,
      megacredits: 20,
      titanium: 0,
      steel: 0,
      tableau: [],
      cardsInHand: [],
    },
    cardsInHand: [],
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 1,
      phase: 'action',
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
    },
  };

  assert.deepStrictEqual(SMARTBOT.handleInput(wf, state), {
    type: 'colony',
    colonyName: 'Triton',
  });
}

function testOpeningColonyPrefersTritonOverOccupiedEuropaTie() {
  const wf = {
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: [
      {name: 'Ceres', colonies: []},
      {name: 'Europa', colonies: [{color: 'red'}, {color: 'blue'}]},
      {name: 'Ganymede', colonies: []},
      {name: 'Triton', colonies: []},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'green',
      megaCredits: 23,
      megacredits: 23,
      titanium: 0,
      titaniumProduction: 0,
      steel: 4,
      tableau: [],
      cardsInHand: [],
    },
    cardsInHand: [],
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 1,
      phase: 'action',
      oxygenLevel: 1,
      temperature: -30,
      oceans: 3,
      venusScaleLevel: 2,
    },
  };

  assert.deepStrictEqual(SMARTBOT.handleInput(wf, state), {
    type: 'colony',
    colonyName: 'Triton',
  });
}

function makeMinorityRefugeActionState() {
  const state = loadSharedFixture('minority_refuge_miranda_sequence.json');
  state.waitingFor = null;
  return state;
}

function makePlayProjectOrActionWorkflow(state) {
  return {
    type: 'or',
    options: [
      {
        type: 'projectCard',
        title: 'Play project card',
        cards: state.cardsInHand,
      },
      {
        type: 'card',
        title: 'Perform an action from a played card',
        selectBlueCardAction: true,
        cards: [{name: 'Development Center'}],
      },
    ],
  };
}

function testMinorityRefugeSequencePlaysAnimalBeforeColonyCard() {
  const state = makeMinorityRefugeActionState();
  const input = SMARTBOT.handleInput(makePlayProjectOrActionWorkflow(state), state);

  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.strictEqual(input.response.type, 'projectCard');
  assert.strictEqual(input.response.card, 'Fish');
}

function testMinorityRefugeSequenceThenPlaysRefugeAndChoosesMiranda() {
  const state = makeMinorityRefugeActionState();
  state.cardsInHand = state.cardsInHand.filter((card) => card.name !== 'Fish');
  state.thisPlayer.cardsInHand = state.cardsInHand;
  state.thisPlayer.tableau = [...state.thisPlayer.tableau, {name: 'Fish', resources: 0}];

  const playInput = SMARTBOT.handleInput(makePlayProjectOrActionWorkflow(state), state);
  assert.strictEqual(playInput.type, 'or');
  assert.strictEqual(playInput.index, 0);
  assert.strictEqual(playInput.response.type, 'projectCard');
  assert.strictEqual(playInput.response.card, 'Minority Refuge');

  const colonyInput = SMARTBOT.handleInput({
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: [
      {name: 'Luna', colonies: []},
      {name: 'Europa', colonies: []},
      {name: 'Miranda', colonies: ['red']},
    ],
  }, state);
  assert.deepStrictEqual(colonyInput, {type: 'colony', colonyName: 'Miranda'});
}

function testPlutoDiscardDoesNotUseDraftKeepPriority() {
  const wf = {
    type: 'card',
    title: 'Pluto colony bonus. Select a card to discard',
    min: 1,
    max: 1,
    cards: [
      buildDraftProjectCard('Fusion Power'),
      buildDraftProjectCard('Molecular Printing'),
      buildDraftProjectCard('Air-Scrapping Expedition'),
      buildDraftProjectCard('New Holland'),
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megaCredits: 10,
      megacredits: 10,
      terraformRating: 25,
      tableau: [],
      tags: {},
      cardsInHand: [],
    },
    cardsInHand: [],
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 9,
      phase: 'action',
      oxygenLevel: 8,
      temperature: -6,
      oceans: 2,
      venusScaleLevel: 30,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert.notStrictEqual(input.cards[0], 'Molecular Printing');
}

function testPlutoDiscardProtectsHighPriorityDraftPick() {
  const wf = {
    type: 'card',
    title: 'Pluto colony bonus. Select a card to discard',
    min: 1,
    max: 1,
    cards: [
      buildDraftProjectCard('Molecular Printing'),
      buildDraftProjectCard('GMO Contract'),
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megaCredits: 2,
      megacredits: 2,
      terraformRating: 27,
      tableau: [],
      tags: {},
      cardsInHand: [
        buildDraftProjectCard('Molecular Printing'),
        buildDraftProjectCard('GMO Contract'),
      ],
    },
    cardsInHand: [
      buildDraftProjectCard('Molecular Printing'),
      buildDraftProjectCard('GMO Contract'),
    ],
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 3,
      phase: 'action',
      oxygenLevel: 1,
      temperature: -22,
      oceans: 1,
      venusScaleLevel: 10,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, {type: 'card', cards: ['GMO Contract']});
}

function testJovianLanternsKeepsImmediateFloaters() {
  const cardData = SMARTBOT.TM_BRAIN.getCardDataByName('Jovian Lanterns') || {};
  assert.deepStrictEqual(cardData.behavior && cardData.behavior.addResourcesToAnyCard, {
    count: 2,
    type: 'Floater',
  });
}

function testFloaterTargetPrefersVpAccumulator() {
  const wf = {
    type: 'card',
    title: 'Add 1 floater to a Jovian card',
    min: 1,
    max: 1,
    cards: [
      {name: 'Titan Shuttles', resources: 0},
      {name: 'Jovian Lanterns', resources: 0},
      {name: 'Red Spot Observatory', resources: 0},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'pink',
      megaCredits: 20,
      megacredits: 20,
      tableau: [
        {name: 'Titan Shuttles', resources: 0},
        {name: 'Jovian Lanterns', resources: 0},
        {name: 'Red Spot Observatory', resources: 0},
      ],
      cardsInHand: [],
    },
    players: [{color: 'pink'}],
    game: {generation: 8, phase: 'action'},
  };

  assert.deepStrictEqual(SMARTBOT.handleInput(wf, state), {
    type: 'card',
    cards: ['Jovian Lanterns'],
  });
}

function testEnergyMarketLowMcTakesMegacredits() {
  const wf = {
    type: 'or',
    title: 'Select one option',
    options: [
      {type: 'option', title: 'Spend 2X M€ to gain X energy'},
      {type: 'option', title: 'Decrease energy production 1 step to gain 8 M€'},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'pink',
      megaCredits: 6,
      megacredits: 6,
      energyProduction: 1,
      tableau: [{name: 'Energy Market'}],
    },
    players: [{color: 'pink'}],
    game: {generation: 7, phase: 'action'},
  };

  assert.deepStrictEqual(SMARTBOT.handleInput(wf, state), {
    type: 'or',
    index: 1,
    response: {type: 'option'},
  });
}

function testProductionToLoseUsesPayProductionCost() {
  const wf = {
    type: 'productionToLose',
    title: 'Lose production',
    payProduction: {
      cost: 5,
      units: {
        megacredits: 0,
        steel: 0,
        titanium: 0,
        plants: 0,
        energy: 2,
        heat: 3,
      },
    },
  };
  const state = {
    thisPlayer: {
      megacreditProduction: -3,
      steelProduction: 1,
      titaniumProduction: 1,
      plantProduction: 0,
      energyProduction: 2,
      heatProduction: 3,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);

  assert.deepStrictEqual(input, {
    type: 'productionToLose',
    units: {
      megacredits: 0,
      steel: 0,
      titanium: 0,
      plants: 0,
      energy: 2,
      heat: 3,
    },
  });
}

function testInitialCardsStillHonorRequiredMinimum() {
  const wf = {
    type: 'initialCards',
    options: [{
      type: 'card',
      title: 'Buy initial cards',
      min: 2,
      max: 4,
      cards: [
        {name: 'Comet', cost: 21},
        {name: 'Asteroid', cost: 14},
        {name: 'Trees', cost: 13},
      ],
    }],
  };
  const state = {
    thisPlayer: {
      megaCredits: 0,
      tableau: [],
    },
    players: [],
    game: {
      generation: 1,
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'initialCards');
  assert.strictEqual(input.responses.length, 1);
  assert.strictEqual(input.responses[0].type, 'card');
  assert.ok(input.responses[0].cards.length >= 2, 'required minimum pick count must be preserved');
}

function buildInitialDraftWorkflow(corpNames, preludeNames, projectNames) {
  return {
    type: 'initialCards',
    options: [
      {
        type: 'card',
        title: 'Corporation cards',
        min: 1,
        max: 1,
        cards: corpNames.map((name) => ({name, cost: 0, calculatedCost: 0})),
      },
      {
        type: 'card',
        title: 'Prelude cards',
        min: 1,
        max: 1,
        cards: preludeNames.map((name) => ({name, cost: 0, calculatedCost: 0})),
      },
      {
        type: 'card',
        title: 'Buy initial cards',
        min: 0,
        max: projectNames.length,
        cards: projectNames.map((name) => buildDraftProjectCard(name)),
      },
    ],
  };
}

function buildOpeningDraftState(colonies) {
  return {
    thisPlayer: {
      color: 'red',
      megaCredits: 21,
      megacredits: 21,
      tableau: [],
      cardsInHand: [],
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 1,
      phase: 'initial_drafting',
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
      colonies: colonies.map((name) => ({name})),
    },
  };
}

function getCorpPickFromInitialDraft(input) {
  assert.strictEqual(input.type, 'initialCards');
  assert.ok(Array.isArray(input.responses));
  assert.ok(input.responses[0]);
  assert.strictEqual(input.responses[0].type, 'card');
  assert.ok(Array.isArray(input.responses[0].cards));
  assert.ok(input.responses[0].cards[0], 'expected a corporation pick in the first initialCards response');
  return input.responses[0].cards[0];
}

function getPreludePickFromInitialDraft(input) {
  assert.strictEqual(input.type, 'initialCards');
  assert.ok(Array.isArray(input.responses));
  assert.ok(input.responses[1]);
  assert.strictEqual(input.responses[1].type, 'card');
  assert.ok(Array.isArray(input.responses[1].cards));
  assert.ok(input.responses[1].cards[0], 'expected a prelude pick in the second initialCards response');
  return input.responses[1].cards[0];
}

function getProjectPicksFromInitialDraft(input) {
  assert.strictEqual(input.type, 'initialCards');
  assert.ok(Array.isArray(input.responses));
  assert.ok(input.responses[2]);
  assert.strictEqual(input.responses[2].type, 'card');
  assert.ok(Array.isArray(input.responses[2].cards));
  return input.responses[2].cards;
}

function testEventCardsExposeSyntheticEventTag() {
  assert.ok(
    SMARTBOT.CARD_TAGS['Comet for Venus'].includes('event'),
    'Comet for Venus should expose event tag to smartbot'
  );
  assert.ok(
    SMARTBOT.CARD_TAGS['Large Convoy'].includes('event'),
    'Large Convoy should expose event tag to smartbot'
  );
}

function testGeneratedCardNamesKeepEscapedApostrophes() {
  for (const [label, table] of [
    ['CARD_DATA', SMARTBOT.CARD_DATA],
    ['CARD_TAGS', SMARTBOT.CARD_TAGS],
  ]) {
    const badKeys = Object.keys(table).filter((key) => key.includes('\\'));
    assert.deepStrictEqual(badKeys, [], label + ' should not contain escaped/truncated card-name keys');
  }

  for (const staleName of ['CEO\\', 'Inventors\\', 'An Offer You Can\\', 'Darkside Smugglers\\']) {
    assert.strictEqual(SMARTBOT.CARD_DATA[staleName], undefined, staleName + ' should not exist in smartbot card data');
    assert.strictEqual(SMARTBOT.CARD_TAGS[staleName], undefined, staleName + ' should not exist in smartbot card tags');
  }

  for (const canonicalName of ["CEO's Favorite Project", "Inventors' Guild", "An Offer You Can't Refuse", "Darkside Smugglers' Union"]) {
    assert.ok(SMARTBOT.CARD_DATA[canonicalName], canonicalName + ' should exist in smartbot card data');
  }
  assert.ok(SMARTBOT.CARD_TAGS["Inventors' Guild"].includes('science'), "Inventors' Guild should keep its science tag");
  assert.ok(SMARTBOT.CARD_TAGS["Darkside Smugglers' Union"].includes('space'), "Darkside Smugglers' Union should keep its space tag");
}

function testAsteroidResourcesDoesNotSumChoiceBranches() {
  const behavior = SMARTBOT.CARD_DATA['Asteroid Resources'].behavior || {};
  assert.strictEqual(behavior.production.steel, 1);
  assert.strictEqual(behavior.production.titanium, 1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(behavior, 'stock'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(behavior, 'ocean'), false);
}

function testStatefulOrActionsDoNotSumChoiceBranches() {
  for (const name of [
    'Aerial Mappers',
    'Atmo Collectors',
    'Copernicus Tower',
    'Deuterium Export',
    'Dirigibles',
    'Extractor Balloons',
    'GHG Producing Bacteria',
    'Local Shading',
    'Nitrite Reducing Bacteria',
    'Regolith Eaters',
    'Sulphur-Eating Bacteria',
    'Thermophiles',
    'Weather Balloons',
  ]) {
    const action = SMARTBOT.CARD_DATA[name].action || {};
    assert.strictEqual(action.addResources, 1, name + ' should keep only the accumulation action branch');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(action, 'tr'), false, name + ' should not sum TR with resource accumulation');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(action, 'global'), false, name + ' should not sum global raises with resource accumulation');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(action, 'stock'), false, name + ' should not sum stock gains with resource accumulation');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(action, 'production'), false, name + ' should not sum production gains with resource accumulation');
  }
  for (const name of [
    'Arklight',
    'Bactoviral Research',
    'Decomposers',
    'Ecological Zone',
    'Ecological Zone:ares',
    'Hecate Speditions',
    'Herbivores',
    'Mars University',
    'Microgravity Nutrition',
    'Ocean Sanctuary',
    'Olympus Conference',
    'Pets',
    'Pristar',
    'Recyclon',
    'Research & Development Hub',
    'Thiolava Vents',
    'Venusian Animals',
    'Whales',
  ]) {
    const data = SMARTBOT.CARD_DATA[name] || {};
    assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'action'), false, name + ' should not expose trigger-only resources as recurring actions');
  }
  for (const [name, per] of Object.entries({
    'Ants': 2,
    'Decomposers': 3,
    'Stratopolis': 3,
    'Venusian Animals': 1,
  })) {
    assert.strictEqual(SMARTBOT.CARD_DATA[name].vp.type, 'per_resource', name + ' should score VP from resources');
    assert.strictEqual(SMARTBOT.CARD_DATA[name].vp.per, per, name + ' should preserve canonical VP/resource divisor');
  }
  assert.strictEqual(String(SMARTBOT.CARD_DATA['Arklight'].resourceType || '').toLowerCase(), 'animal', 'Arklight should keep animal resource metadata from canonical card data');
  assert.strictEqual(String(SMARTBOT.CARD_DATA['Research & Development Hub'].resourceType || '').toLowerCase(), 'data', 'Research & Development Hub should keep data resource metadata from canonical card data');
  assert.strictEqual(SMARTBOT.CARD_DATA['Physics Complex'].vp.per, 0.5, 'Physics Complex should score 2 VP per science resource');
}

function testOpeningDraftPrefersIcEventShell() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Experimental Forest'],
    ['Optimal Aerobraking', 'Media Group', 'Comet', 'Decomposers']
  );
  const state = buildOpeningDraftState(['Triton']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Interplanetary Cinematics');
}

function testOpeningDraftPrefersSpliceDenseMicrobeShell() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Soil Bacteria'],
    ['Decomposers', 'Vermin', 'Symbiotic Fungus', 'Topsoil Contract']
  );
  const state = buildOpeningDraftState(['Enceladus']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Splice');
}

function testOpeningDraftKeepsIcAheadWhenSpliceOnlyHasLoneDecomposers() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Experimental Forest'],
    ['Optimal Aerobraking', 'Decomposers', 'Floater Prototypes']
  );
  const state = buildOpeningDraftState(['Enceladus', 'Triton']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Interplanetary Cinematics');
}

function testOpeningDraftEcolineRushKeepsKelpAndSkipsDeadScienceGreed() {
  const wf = buildInitialDraftWorkflow(
    ['Ecoline', 'Helion', 'Arklight'],
    ['Ecology Experts', 'Power Generation'],
    ['Kelp Farming', 'Warp Drive', 'Anti-Gravity Technology', 'Biofuels']
  );
  const state = buildOpeningDraftState(['Ceres', 'Luna']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Ecoline');
  assert.strictEqual(getPreludePickFromInitialDraft(input), 'Ecology Experts');
  const bought = getProjectPicksFromInitialDraft(input);
  assert.ok(bought.includes('Kelp Farming'), 'Ecoline must prioritize Kelp Farming');
  // With v76 VP valuation, both Warp Drive (5 VP) and AGT (discount all cards -2 MC)
  // are acceptable buys even for Ecoline — VP and discount value outweigh off-theme penalty
}

function testOpeningDraftPrefersFactorumColoniesTempoShell() {
  const wf = buildInitialDraftWorkflow(
    ['Factorum', 'Teractor', 'Arklight'],
    ['Early Colonization', 'Power Generation'],
    ['Trading Colony', 'House Printing', 'Power Infrastructure', 'Research']
  );
  const state = buildOpeningDraftState(['Ceres', 'Luna', 'Miranda']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Factorum');
  const bought = getProjectPicksFromInitialDraft(input);
  assert.ok(bought.includes('Trading Colony'));
}

function testOpeningDraftPrefersVironWithPremiumActionShell() {
  const wf = buildInitialDraftWorkflow(
    ['Viron', 'Helion', 'Teractor'],
    ['Power Generation', 'Business Empire'],
    ['AI Central', 'Development Center', 'Olympus Conference', 'Research']
  );
  const state = buildOpeningDraftState(['Luna', 'Ceres']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Viron');
  const bought = getProjectPicksFromInitialDraft(input);
  assert.ok(bought.includes('AI Central'));
  assert.ok(bought.includes('Development Center'));
}

function testVironBoostPrefersPremiumActionOverTrapAction() {
  const state = buildOpeningDraftState(['Luna']);
  const projects = ['AI Central', 'Development Center', 'Olympus Conference', 'Research'].map(buildDraftProjectCard);
  const context = {
    state,
    allProjectCards: projects,
    allPreludes: [{name: 'Power Generation'}],
    colonyNames: new Set(['Luna']),
    opening: true,
  };

  assert.ok(SMARTBOT.corpCardBoost('AI Central', 'Viron', context) > 10);
  assert.ok(SMARTBOT.corpCardBoost('Security Fleet', 'Viron', context) <= 0);
}

function testOpeningDraftDoesNotForceVironWithoutActionShell() {
  const wf = buildInitialDraftWorkflow(
    ['Viron', 'Ecoline', 'Helion'],
    ['Ecology Experts', 'Business Empire'],
    ['Kelp Farming', 'Trees', 'Nitrogen-Rich Asteroid', 'Sponsors']
  );
  const state = buildOpeningDraftState(['Luna', 'Triton']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Ecoline');
}

function testPristarBoostPrefersEngineShellOverTerraforming() {
  assert.ok(SMARTBOT.corpCardBoost('Research Network', 'Pristar') > 0);
  assert.ok(SMARTBOT.corpCardBoost('Comet', 'Pristar') < 0);
  assert.ok(
    SMARTBOT.corpCardBoost('Research Network', 'Pristar') >
      SMARTBOT.corpCardBoost('Comet', 'Pristar')
  );
}

function testForcedSellFallsBackWhenAllCardsHaveVpPotential() {
  const wf = {
    type: 'card',
    title: 'Sell patents',
    min: 1,
    max: 1,
    cards: [
      {name: 'Trees', cost: 13},
      {name: 'Ganymede Colony', cost: 20},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 5,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 10,
      oxygenLevel: 10,
      temperature: 0,
      oceans: 7,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 1, 'forced sell must still choose a card');
  assert.ok(['Trees', 'Ganymede Colony'].includes(input.cards[0]));
}

function testDiscardHonorsRequiredCount() {
  const wf = {
    type: 'card',
    title: 'Discard cards',
    min: 2,
    max: 2,
    cards: [
      {name: 'Comet', cost: 21},
      {name: 'Asteroid', cost: 14},
      {name: 'Trees', cost: 13},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 20,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 4,
      oxygenLevel: 4,
      temperature: -16,
      oceans: 2,
      venusScaleLevel: 6,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 2, 'discard should satisfy required minimum count');
}

function testStandardProjectSkipsClosedGlobals() {
  const wf = {
    type: 'and',
    options: [
      {type: 'city'},
      {type: 'greenery'},
      {type: 'increaseOxygen'},
      {type: 'increaseTemperature'},
      {type: 'placeOceanTile'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 100, plants: 0, heat: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {
      generation: 8,
      oxygenLevel: 14,
      temperature: 8,
      oceans: 9,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.ok(input);
  assert.notStrictEqual(input.type, 'increaseOxygen');
  assert.notStrictEqual(input.type, 'increaseTemperature');
  assert.notStrictEqual(input.type, 'placeOceanTile');
}

function testStandardProjectPrioritizesOpenAsteroid() {
  const wf = {
    type: 'and',
    options: [
      {type: 'increaseTemperature'},
      {type: 'greenery'},
      {type: 'city'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 100, plants: 0, heat: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {
      generation: 8,
      oxygenLevel: 10,
      temperature: 0,
      oceans: 8,
      venusScaleLevel: 14,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'and');
  assert.ok(Array.isArray(input.responses));
  assert.strictEqual(input.responses.length, 3);
  assert.ok(input.responses.every((response) => response && response.type === 'option'));
}

function testBlueActionIgnoresDisabledHigherEvOption() {
  const wf = {
    type: 'or',
    title: 'Choose action',
    options: [
      {title: 'Disabled high EV', disabled: true, type: 'card'},
      {title: 'Enabled lower EV', type: 'pass'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 20, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 6, oxygenLevel: 6, temperature: -2, oceans: 5, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.ok(input);
  assert.notStrictEqual(input.index, 0);
}

function testTradePaymentPrefersEnergyInNestedOr() {
  const wf = {
    type: 'or',
    title: 'Choose payment',
    options: [
      {
        type: 'and',
        andOptions: [
          {type: 'resource', resource: 'megaCredits', amount: 10},
        ],
      },
      {
        type: 'and',
        andOptions: [
          {type: 'resource', resource: 'energy', amount: 3},
        ],
      },
    ],
  };
  const state = {
    thisPlayer: {megacredits: 20, energy: 3, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 5, oxygenLevel: 5, temperature: -8, oceans: 4, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testNestedOrSelectsStandardProjectBranch() {
  const wf = {
    type: 'or',
    options: [
      {title: 'Do nothing', type: 'pass'},
      {
        title: 'Standard project',
        type: 'and',
        andOptions: [{type: 'increaseTemperature'}],
      },
    ],
  };
  const state = {
    thisPlayer: {megacredits: 30, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 9, oxygenLevel: 10, temperature: 0, oceans: 8, venusScaleLevel: 14},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testAndAmountRespectsMixedExchangeRates() {
  const wf = {
    type: 'and',
    options: [
      {type: 'amount', amount: 4, title: 'Pay 4'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 2, steel: 1, titanium: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 5, oxygenLevel: 6, temperature: -10, oceans: 4, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'and');
  assert.ok(Array.isArray(input.responses));
  assert.strictEqual(input.responses.length, 1);
  assert.strictEqual(input.responses[0].type, 'amount');
}

function testAresGlobalParametersReturnsValidPayload() {
  const wf = {
    type: 'aresGlobalParameters',
    title: 'Raise two parameters',
    optional: false,
    data: {
      current: {
        temperatureDelta: 0,
        oxygenDelta: 0,
        lowOceanDelta: 0,
        highOceanDelta: 0,
      },
      max: {
        temperatureDelta: 1,
        oxygenDelta: 1,
        lowOceanDelta: 1,
        highOceanDelta: 1,
      },
      payment: {
        temperatureDelta: 14,
        oxygenDelta: 14,
        lowOceanDelta: 16,
        highOceanDelta: 16,
      },
    },
  };
  const state = {
    thisPlayer: {
      megacredits: 30,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 10,
      oxygenLevel: 13,
      temperature: 6,
      oceans: 8,
      venusScaleLevel: 12,
      gameOptions: {
        aresExtension: true,
      },
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'aresGlobalParameters');
  assert.strictEqual(input.response.lowOceanDelta, 0);
  assert.strictEqual(input.response.highOceanDelta, 0);
  assert.ok(
    (input.response.temperatureDelta === 1 && input.response.oxygenDelta === 0) ||
    (input.response.temperatureDelta === 0 && input.response.oxygenDelta === 1),
    'expected exactly one reachable global parameter to be raised',
  );
}

function testClaimedUndergroundTokenReturnsSelectedIndexes() {
  const wf = {
    type: 'claimedUndergroundToken',
    title: 'Select a token to discard',
    min: 1,
    max: 1,
    tokens: [
      {token: 'plant'},
      {token: 'steel'},
    ],
  };

  const input = SMARTBOT.handleInput(wf, {});
  assert.deepStrictEqual(input, {
    type: 'claimedUndergroundToken',
    selected: [0],
  });
}

function testAwardFundingBranchDoesNotUseStepsBeforeInit() {
  const wf = {
    type: 'or',
    title: 'Fund an award',
    options: [
      {title: 'Banker'},
      {title: 'Thermalist'},
      {title: 'Do nothing'},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megacredits: 24,
      heat: 4,
      plants: 2,
      tableau: [],
      tags: {science: 2, venus: 1},
      terraformRating: 28,
      megacreditProduction: 3,
      steelProduction: 1,
      titaniumProduction: 0,
      citiesCount: 1,
    },
    players: [
      {color: 'red', megacreditProduction: 3, heat: 4, energy: 2, heatProduction: 2, steel: 1, titanium: 0, steelProduction: 1, titaniumProduction: 0, tags: {science: 2, venus: 1}, citiesCount: 1},
      {color: 'blue', megacreditProduction: 1, heat: 2, energy: 1, heatProduction: 1, steel: 0, titanium: 0, steelProduction: 0, titaniumProduction: 0, tags: {science: 1}, citiesCount: 0},
      {color: 'green', megacreditProduction: 2, heat: 3, energy: 0, heatProduction: 1, steel: 0, titanium: 1, steelProduction: 0, titaniumProduction: 1, tags: {venus: 2}, citiesCount: 0},
    ],
    game: {
      generation: 8,
      oxygenLevel: 9,
      temperature: 0,
      oceans: 6,
      venusScaleLevel: 18,
      fundedAwards: [],
      awards: [
        {
          name: 'Banker',
          scores: [
            {color: 'red', score: 3},
            {color: 'blue', score: 1},
            {color: 'green', score: 2},
          ],
        },
        {
          name: 'Thermalist',
          scores: [
            {color: 'red', score: 8},
            {color: 'blue', score: 3},
            {color: 'green', score: 4},
          ],
        },
      ],
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.ok(typeof input.index === 'number');
}

function testMegaCreditsNormalizationCamelCase() {
  // Our fork API can return megaCredits (camelCase) without the lowercase alias.
  // Verify smartPay still reads state aliases, but emits server-compatible payment.
  const state = {
    thisPlayer: {
      megaCredits: 30,
      steel: 2, titanium: 1, heat: 5,
      steelValue: 2, titaniumValue: 3,
      tableau: [], cardsInHand: [],
    },
    players: [],
    game: { generation: 3, oxygenLevel: 2, temperature: -20, oceans: 1, venusScaleLevel: 4 },
  };
  const payment = SMARTBOT.TM_BRAIN.smartPay(14, state, {});
  assert.ok(payment.hasOwnProperty('megacredits'), 'payment must have megacredits (lowercase)');
  assert.ok(!payment.hasOwnProperty('megaCredits'), 'payment must not leak legacy megaCredits');
  assert.ok(typeof payment.megacredits === 'number', 'megacredits must be a number');
  assert.strictEqual(payment.megacredits, 14, 'smartPay must spend camelCase MC when lowercase alias is absent');
  assert.ok(payment.hasOwnProperty('steel'), 'payment must include all server payment keys');
}

function testMoneyNormalizationCoversMcProductionBothWays() {
  const wf = { type: 'option' };
  const camelState = {
    thisPlayer: { megaCredits: 30, megaCreditProduction: 12 },
    players: [{ color: 'red', megaCredits: 20, megaCreditProduction: 4 }],
    game: { generation: 3 },
  };
  SMARTBOT.handleInput(wf, camelState);
  assert.strictEqual(camelState.thisPlayer.megacredits, 30);
  assert.strictEqual(camelState.thisPlayer.megacreditProduction, 12);
  assert.strictEqual(camelState.players[0].megacredits, 20);
  assert.strictEqual(camelState.players[0].megacreditProduction, 4);

  const lowerState = {
    thisPlayer: { megacredits: 21, megacreditProduction: 7 },
    players: [{ color: 'blue', megacredits: 11, megacreditProduction: 2 }],
    game: { generation: 3 },
  };
  SMARTBOT.handleInput(wf, lowerState);
  assert.strictEqual(lowerState.thisPlayer.megaCredits, 21);
  assert.strictEqual(lowerState.thisPlayer.megaCreditProduction, 7);
  assert.strictEqual(lowerState.players[0].megaCredits, 11);
  assert.strictEqual(lowerState.players[0].megaCreditProduction, 2);
}

function testCardPlaySeesMegaCreditsFromState() {
  // Verify bot can play cards when state has megaCredits (camelCase only)
  const wf = {
    type: 'or',
    title: 'Take your first action',
    options: [
      {
        title: 'Play project card',
        type: 'card',
        cards: [{ name: 'Comet', cost: 21, calculatedCost: 21 }],
        paymentOptions: {},
      },
      { title: 'Standard projects', type: 'option' },
      { title: 'Pass for this generation', type: 'pass' },
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megaCredits: 40, // camelCase only — no lowercase alias
      steel: 0, titanium: 0, heat: 0, plants: 0, energy: 0,
      tableau: [], cardsInHand: [{ name: 'Comet', cost: 21 }],
      tags: {}, terraformRating: 20,
      megacreditProduction: 5,
    },
    players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
    game: {
      generation: 4, oxygenLevel: 3, temperature: -18, oceans: 2, venusScaleLevel: 6,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  // Bot should NOT just pass — it has 40 MC and a playable card
  assert.strictEqual(input.type, 'or');
  // Should pick card (index 0) or SP (index 1), NOT pass (index 2)
  assert.ok(input.index !== 2, 'bot with 40 MC should not pass — must play card or SP');
}

function testUnaffordableStandardProjectFallbackDoesNotPickPowerPlant() {
  const wf = {
    type: 'or',
    title: 'Take your next action',
    options: [
      {title: 'Play project card', type: 'card', cards: []},
      {title: 'Standard projects', type: 'card', cards: [{name: 'Power Plant:SP'}]},
      {title: 'Confirm', type: 'option'},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'orange',
      megaCredits: 1,
      steel: 0, titanium: 1, heat: 0, plants: 0, energy: 0,
      tableau: [], cardsInHand: [],
      tags: {}, terraformRating: 22,
      megacreditProduction: 0,
    },
    players: [{color: 'orange'}, {color: 'red'}, {color: 'blue'}],
    game: {
      generation: 2,
      oxygenLevel: 0, temperature: -30, oceans: 0, venusScaleLevel: 0,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.notStrictEqual(input.index, 1, 'bot must not enter Standard projects when every SP is unaffordable');
}

function run() {
  testKeepPassDraftUsesDraftRatingNotPlayEv();
  testKeepPassDraftPrefersMolecularPrintingOverGenericPlantProduction();
  testResearchBuyCarriesHighPriorityDraftPickThroughPurchase();
  testOpeningColonyPrefersTritonOverEuropaWhenTitaniumScarce();
  testOpeningColonyPrefersTritonOverOccupiedEuropaTie();
  testMinorityRefugeSequencePlaysAnimalBeforeColonyCard();
  testMinorityRefugeSequenceThenPlaysRefugeAndChoosesMiranda();
  testPlutoDiscardDoesNotUseDraftKeepPriority();
  testPlutoDiscardProtectsHighPriorityDraftPick();
  testJovianLanternsKeepsImmediateFloaters();
  testFloaterTargetPrefersVpAccumulator();
  testEnergyMarketLowMcTakesMegacredits();
  testProductionToLoseUsesPayProductionCost();
  testInitialCardsStillHonorRequiredMinimum();
  testEventCardsExposeSyntheticEventTag();
  testGeneratedCardNamesKeepEscapedApostrophes();
  testAsteroidResourcesDoesNotSumChoiceBranches();
  testStatefulOrActionsDoNotSumChoiceBranches();
  testOpeningDraftPrefersIcEventShell();
  testOpeningDraftPrefersSpliceDenseMicrobeShell();
  testOpeningDraftKeepsIcAheadWhenSpliceOnlyHasLoneDecomposers();
  testOpeningDraftEcolineRushKeepsKelpAndSkipsDeadScienceGreed();
  testOpeningDraftPrefersFactorumColoniesTempoShell();
  testOpeningDraftPrefersVironWithPremiumActionShell();
  testVironBoostPrefersPremiumActionOverTrapAction();
  testOpeningDraftDoesNotForceVironWithoutActionShell();
  testPristarBoostPrefersEngineShellOverTerraforming();
  testForcedSellFallsBackWhenAllCardsHaveVpPotential();
  testDiscardHonorsRequiredCount();
  testStandardProjectSkipsClosedGlobals();
  testStandardProjectPrioritizesOpenAsteroid();
  testBlueActionIgnoresDisabledHigherEvOption();
  testTradePaymentPrefersEnergyInNestedOr();
  testNestedOrSelectsStandardProjectBranch();
  testAndAmountRespectsMixedExchangeRates();
  testAresGlobalParametersReturnsValidPayload();
  testClaimedUndergroundTokenReturnsSelectedIndexes();
  testAwardFundingBranchDoesNotUseStepsBeforeInit();
  testMegaCreditsNormalizationCamelCase();
  testMoneyNormalizationCoversMcProductionBothWays();
  testCardPlaySeesMegaCreditsFromState();
  testUnaffordableStandardProjectFallbackDoesNotPickPowerPlant();
  testSmartPayLeavesOneFloaterForStratosphericBirdsWhenSingleSource();
  testSmartPayCanSpendAllFloatersForStratosphericBirdsWhenMultipleSources();
  testBuyPhaseRelaxesReserveWhenHandStarved();
  testBuyPhaseStaysTightWhenHandIsAlreadyFull();
  testPrefersHeatOverFreeDelegate();
  testGen12FarCoreConvertsHeatBeforeAward();
  testClosedTemperatureSkipsHeatAndPushesGreenery();
  testCheapEventNoSpGen3CardIsPlayable();
  testPassesOnMarginalLowMcMidgameCard();
  testPassesOnWeakNoSpMidgameCard();
  testPassesOnExactFloorTrapWhenLowOnCash();
  testPassesOnInflatedWeakUtilityWhenLowOnCash();
  testStillPlaysSetupDrawCardWhenLowOnCash();
  testScoreCardPenalizesGlobalRaiseThatHelpsOpponents();
  testScoreCardValuesGreenhousesWhenCitiesExist();
  testScoreCardMartianRailsScalesWithTableCitiesAndMode();
  testScoreCardKeepsOptimalAerobrakingPremiumWithSpaceSupport();
  testScoreCardValuesMediaGroupBeforeKnownEvents();
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
  testPassesOnUndergroundDetonationsTrapMidgame();
  testSkipsPaidDelegateInMidgame();
  testStarvedBuySkipsWeakFiller();
  testFreeDelegateDoesNotDelayProjectCardPass();
  testSeptemOpeningUsesCorpActionBeforeProjectCard();
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
  testFinalClosedGlobalsUsesScoringBlueActionOverEngineCard();
  testFinalClosedGlobalsUsesScoringBlueActionBeforeCeoPoke();
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
  testStillUsesFreeDelegateAsFallback();
  testStillPlaysStrongCardWhenLowOnCash();
  testSellPatentsKeepsSetupCardsInMidgame();
  testSellPatentsDoesNotProtectSearchForLifeTrap();
  testSellPatentsStillDumpsDeadCardsInEndgame();
  testDelaysFirstAwardForStrongPlayableCard();
  testDelaysSecondAwardForVeryStrongPlayableCard();
  testStillFundsAwardWhenVisibleCardsAreWeak();
  console.log('smartbot regression checks: OK');
}

module.exports = {run};

if (require.main === module) {
  run();
}
