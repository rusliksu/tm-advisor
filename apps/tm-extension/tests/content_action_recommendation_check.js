#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_ACTION_RECOMMENDATION;
require(path.resolve(__dirname, '..', 'src', 'content-action-recommendation.js'));

const actionRec = global.TM_CONTENT_ACTION_RECOMMENDATION;
assert(actionRec, 'TM_CONTENT_ACTION_RECOMMENDATION should be loaded');
assert.strictEqual(typeof actionRec.computeActionRecommendation, 'function', 'computeActionRecommendation should be exported');
assert.strictEqual(typeof actionRec.renderActionRecommendation, 'function', 'renderActionRecommendation should be exported');

function makeState(overrides = {}) {
  return Object.assign({
    game: {phase: 'action', generation: 8},
    thisPlayer: {color: 'hydro', megacredits: 30},
    players: [{color: 'hydro'}],
    _waitingFor: {
      type: 'or',
      title: 'Select an action',
      options: [
        {
          type: 'card',
          title: 'Play project card',
          cards: [{name: 'Kelp Farming'}, {name: 'Cloud Seeding', isDisabled: true}],
        },
        {type: 'option', title: 'Pass for this generation'},
      ],
    },
  }, overrides);
}

function testAdvisorRecommendationRanksCard() {
  const advisor = {
    analyzeActions(waitingFor) {
      assert.strictEqual(waitingFor.options.length, 2);
      return [
        {index: 0, action: 'Play project card', score: 82, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.strictEqual(cards.length, 1);
      return [{name: 'Kelp Farming', reason: 'Ocean window + plant payoff'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({state: makeState(), advisor});
  assert(rec, 'advisor recommendation should be produced');
  assert.strictEqual(rec.title, 'Play Kelp Farming');
  assert.strictEqual(rec.cardName, 'Kelp Farming');
  assert.strictEqual(rec.optionIndex, 0);
  assert.strictEqual(rec.optionTitle, 'Play project card');
  assert(rec.reasonRows.some((row) => row.text.includes('Best card tempo')));
  assert(rec.reasonRows.some((row) => row.text.includes('Ocean window')));
  assert.strictEqual(rec.alt, 'Pass');
}

function testAdvisorRecommendationSkipsNonPlayableCards() {
  let rankedNames = null;
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 82, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      rankedNames = cards.map((card) => card.name);
      return [{name: 'Sponsors', reason: 'Playable economy'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: 'Birds'}, {name: 'Sponsors'}],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    isPlayableCard: (card) => card.name !== 'Birds',
  });

  assert.deepStrictEqual(rankedNames, ['Sponsors'], 'ranker should only see currently playable cards');
  assert(rec, 'recommendation should still be produced');
  assert.strictEqual(rec.title, 'Play Sponsors');
  assert(rec.reasonRows.some((row) => row.text.includes('Playable economy')));
}

function testAdvisorRecommendationSkipsDeferredGreenhouses() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['Greenhouses', 'Sponsors']);
      return [
        {name: 'Greenhouses', score: 85, reason: 'city plants'},
        {name: 'Sponsors', score: 55, reason: 'Prod'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {
        phase: 'action',
        generation: 7,
        spaces: [{tileType: 0}, {tileType: 0}, {tileType: 0}, {tileType: 0}],
      },
      thisPlayer: {color: 'hydro', megacredits: 30, plants: 0},
      players: [
        {color: 'hydro', isActive: true, citiesCount: 2},
        {color: 'red', isActive: false, citiesCount: 2},
      ],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: 'Greenhouses'}, {name: 'Sponsors'}],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
  });

  assert(rec, 'recommendation should still be produced from the next non-deferred card');
  assert.strictEqual(rec.title, 'Play Sponsors');
  assert(!rec.reasonRows.some((row) => row.text.includes('city plants')));
  assert(rec.reasonRows.some((row) => row.text.includes('Prod')));
}

function testAdvisorRecommendationUsesRealGensLeftForGreenhousesCashout() {
  const advisor = {
    analyzeActions() {
      return [{index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'}];
    },
    rankHandCards() {
      return [
        {name: 'Greenhouses', score: 85, reason: 'city plants'},
        {name: 'Sponsors', score: 55, reason: 'Prod'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {
        phase: 'action',
        generation: 7,
        spaces: [{tileType: 0}, {tileType: 0}, {tileType: 0}, {tileType: 0}],
      },
      thisPlayer: {color: 'hydro', megacredits: 30, plants: 0},
      players: [
        {color: 'hydro', isActive: true, citiesCount: 2},
        {color: 'red', isActive: false, citiesCount: 2},
      ],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: 'Greenhouses'}, {name: 'Sponsors'}],
          },
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 1,
  });

  assert(rec, 'recommendation should use the supplied endgame estimator');
  assert.strictEqual(rec.title, 'Play Greenhouses');
  assert(rec.reasonRows.some((row) => row.text.includes('city plants')));
}

function testAdvisorRecommendationSuppressesAllDeferredPlayCards() {
  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {
        phase: 'action',
        generation: 7,
        spaces: [{tileType: 0}, {tileType: 0}, {tileType: 0}, {tileType: 0}],
      },
      thisPlayer: {color: 'hydro', megacredits: 30, plants: 0},
      players: [{color: 'hydro', isActive: true, citiesCount: 4}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: 'Greenhouses'}],
          },
        ],
      },
    }),
    advisor: {
      analyzeActions() {
        return [{index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'}];
      },
      rankHandCards() {
        return [{name: 'Greenhouses', score: 85, reason: 'city plants'}];
      },
    },
    estimateGensLeft: () => 2,
  });

  assert.strictEqual(rec, null, 'all-deferred play-card options should not emit a stale Play recommendation');
}

function testAdvisorRecommendationSkipsDeferredTagCashout() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['Terraforming Ganymede', 'Sponsors', 'Io Mining Industries']);
      return [
        {name: 'Terraforming Ganymede', score: 92, reason: 'Jovian cashout'},
        {name: 'Sponsors', score: 55, reason: 'Prod'},
        {name: 'Io Mining Industries', score: 52, reason: 'future Jovian'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {phase: 'action', generation: 5},
      thisPlayer: {color: 'hydro', megacredits: 60},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [
              {name: 'Terraforming Ganymede', tags: ['space', 'jovian']},
              {name: 'Sponsors'},
              {name: 'Io Mining Industries', tags: ['jovian', 'space']},
            ],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
  });

  assert(rec, 'recommendation should still be produced from the next non-deferred card');
  assert.strictEqual(rec.title, 'Play Sponsors');
  assert(!rec.reasonRows.some((row) => row.text.includes('Jovian cashout')));
  assert(rec.reasonRows.some((row) => row.text.includes('Prod')));
}

function testAdvisorRecommendationSkipsTagCashoutWithoutFutureTagsBeforeFinalWindow() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['Terraforming Ganymede', 'Sponsors']);
      return [
        {name: 'Terraforming Ganymede', score: 92, reason: 'Jovian cashout'},
        {name: 'Sponsors', score: 55, reason: 'Prod'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {phase: 'action', generation: 7},
      thisPlayer: {color: 'hydro', megacredits: 60},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [
              {name: 'Terraforming Ganymede', tags: ['space', 'jovian']},
              {name: 'Sponsors'},
            ],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 3,
  });

  assert(rec, 'recommendation should still be produced from the next non-deferred card');
  assert.strictEqual(rec.title, 'Play Sponsors');
  assert(!rec.reasonRows.some((row) => row.text.includes('Jovian cashout')));
  assert(rec.reasonRows.some((row) => row.text.includes('Prod')));
}

function testAdvisorRecommendationPlaysAdvancedAlloysBeforeMetalSpend() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['AI Central', 'Advanced Alloys', 'Solar Probe']);
      return [
        {name: 'AI Central', score: 86, reason: 'draw engine'},
        {name: 'Advanced Alloys', score: 70, reason: 'metal setup'},
        {name: 'Solar Probe', score: 40, reason: 'space event'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {phase: 'action', generation: 7},
      thisPlayer: {color: 'hydro', megacredits: 74, steel: 8, titanium: 3},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [
              {name: 'AI Central', tags: ['building', 'science']},
              {name: 'Advanced Alloys', tags: ['science']},
              {name: 'Solar Probe', tags: ['event', 'science', 'space']},
            ],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
  });

  assert(rec, 'recommendation should be produced');
  assert.strictEqual(rec.title, 'Play Advanced Alloys');
  assert(rec.reasonRows.some((row) => row.text.includes('metal setup')));
}

function testAdvisorRecommendationSkipsOptimalAerobrakingUntilTriggerWindow() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['Optimal Aerobraking', 'AI Central', 'Solar Probe']);
      return [
        {name: 'Optimal Aerobraking', score: 92, reason: 'space event payoff'},
        {name: 'AI Central', score: 55, reason: 'draw engine'},
        {name: 'Solar Probe', score: 40, reason: 'space event'},
      ];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {phase: 'action', generation: 7},
      thisPlayer: {color: 'hydro', megacredits: 74, steel: 0, titanium: 3},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [
              {name: 'Optimal Aerobraking', tags: ['space']},
              {name: 'AI Central', tags: ['building', 'science']},
              {name: 'Solar Probe', tags: ['event', 'science', 'space']},
            ],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 3,
  });

  assert(rec, 'recommendation should be produced from the next non-deferred card');
  assert.strictEqual(rec.title, 'Play AI Central');
  assert(!rec.reasonRows.some((row) => row.text.includes('space event payoff')));
}

function testAdvisorRecommendationSkipsCeosFavoriteUntilFinalWindow() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Perform an action from a played card', score: 70, reason: 'Blue card action'},
        {index: 2, action: 'Pass for this generation', score: 20, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ["CEO's Favorite Project"]);
      return [{name: "CEO's Favorite Project", score: 70, reason: 'VP resource burst'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {phase: 'action', generation: 7},
      thisPlayer: {color: 'hydro', megacredits: 54},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: "CEO's Favorite Project"}],
          },
          {
            type: 'card',
            title: 'Perform an action from a played card',
            cards: [{name: 'Titan Shuttles'}],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 2,
  });

  assert(rec, 'recommendation should fall through to the next non-deferred action');
  assert.strictEqual(rec.title, 'Use Titan Shuttles');
  assert.strictEqual(rec.cardName, 'Titan Shuttles');
  assert.strictEqual(rec.optionIndex, 1);
  assert.strictEqual(rec.optionTitle, 'Perform an action from a played card');
  assert(!rec.reasonRows.some((row) => row.text.includes('VP resource burst')));
}

function testAdvisorRecommendationKeepsCeosFavoriteAsFinalPoke() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'VP resource burst'},
        {index: 1, action: 'Perform an action from a played card', score: 70, reason: 'Animal action first'},
        {index: 2, action: 'Pass for this generation', score: 20, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ["CEO's Favorite Project"]);
      return [{name: "CEO's Favorite Project", score: 90, reason: 'Add final animal'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {
        phase: 'action',
        generation: 9,
        temperature: 8,
        oxygenLevel: 14,
        oceans: 9,
        venusScaleLevel: 30,
        isTerraformed: true,
      },
      thisPlayer: {color: 'hydro', megacredits: 54},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        title: 'Take your next action',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: "CEO's Favorite Project"}],
          },
          {
            type: 'card',
            title: 'Perform an action from a played card',
            cards: [{name: 'Fish'}],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 1,
  });

  assert(rec, 'recommendation should use the blue action before the final CEO poke');
  assert.strictEqual(rec.title, 'Use Fish');
  assert.strictEqual(rec.cardName, 'Fish');
  assert.strictEqual(rec.optionIndex, 1);
  assert.strictEqual(rec.optionTitle, 'Perform an action from a played card');
  assert(!rec.reasonRows.some((row) => row.text.includes('Add final animal')));
}

function testAdvisorRecommendationKeepsCeosFavoriteAsFinalPokeFromApiFixture() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'VP resource burst'},
        {index: 1, action: 'Perform an action from a played card', score: 70, reason: 'Animal action first'},
        {index: 2, action: 'Pass for this generation', score: 20, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ["CEO's Favorite Project"]);
      return [{name: "CEO's Favorite Project", score: 90, reason: 'Add final animal'}];
    },
  };
  const waitingFor = {
    type: 'or',
    title: {message: 'Take your next action', data: []},
    options: [
      {
        type: 'card',
        title: {message: 'Play project card', data: []},
        cards: [{name: "CEO's Favorite Project", calculatedCost: 1, cost: 1}],
      },
      {
        type: 'card',
        title: {message: 'Perform an action from a played card', data: []},
        cards: [{name: 'Fish', resources: 2}],
      },
      {type: 'option', title: {message: 'Pass for this generation', data: []}},
    ],
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      _waitingFor: null,
      waitingFor,
      game: {
        phase: 'action',
        generation: 9,
        temperature: 8,
        oxygenLevel: 14,
        oceans: 9,
        venusScaleLevel: 30,
        isTerraformed: true,
      },
      thisPlayer: {
        color: 'hydro',
        megacredits: 54,
        cardsInHand: [{name: "CEO's Favorite Project", calculatedCost: 1, cost: 1}],
        tableau: [{name: 'Fish', resources: 2}],
      },
      players: [{color: 'hydro', isActive: true}],
    }),
    advisor,
    estimateGensLeft: () => 1,
  });

  assert(rec, 'recommendation should survive API-shaped object titles');
  assert.strictEqual(rec.title, 'Use Fish');
  assert.strictEqual(rec.cardName, 'Fish');
  assert.strictEqual(rec.optionIndex, 1);
  assert.strictEqual(rec.optionTitle, 'Perform an action from a played card');
  assert(!rec.reasonRows.some((row) => row.text.includes('Add final animal')));
}

function testAdvisorRecommendationSkipsFinalWindowEngineCardForScoringAction() {
  const advisor = {
    analyzeActions() {
      return [
        {index: 0, action: 'Play project card', score: 90, reason: 'Best card tempo'},
        {index: 1, action: 'Perform an action from a played card', score: 70, reason: 'VP animal cashout'},
        {index: 2, action: 'Pass for this generation', score: 20, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.deepStrictEqual(cards.map((card) => card.name), ['Sponsors']);
      return [{name: 'Sponsors', score: 90, reason: 'Prod'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({
    state: makeState({
      game: {
        phase: 'action',
        generation: 9,
        temperature: 8,
        oxygenLevel: 14,
        oceans: 9,
        venusScaleLevel: 30,
        isTerraformed: true,
      },
      thisPlayer: {color: 'hydro', megacredits: 30},
      players: [{color: 'hydro', isActive: true}],
      _waitingFor: {
        type: 'or',
        title: 'Take your next action',
        options: [
          {
            type: 'card',
            title: 'Play project card',
            cards: [{name: 'Sponsors'}],
          },
          {
            type: 'card',
            title: 'Perform an action from a played card',
            cards: [{name: 'Small Animals'}],
          },
          {type: 'option', title: 'Pass for this generation'},
        ],
      },
    }),
    advisor,
    estimateGensLeft: () => 1,
  });

  assert(rec, 'recommendation should fall through to the scoring action');
  assert.strictEqual(rec.title, 'Use Small Animals');
  assert.strictEqual(rec.cardName, 'Small Animals');
  assert.strictEqual(rec.optionIndex, 1);
  assert.strictEqual(rec.optionTitle, 'Perform an action from a played card');
  assert(!rec.reasonRows.some((row) => row.text.includes('Prod')));
}

function makeTradesmanChainState() {
  global.TM_CARD_DATA = {
    Psychrophiles: {resourceType: 'Microbe'},
    'Titan Shuttles': {resourceType: 'Floater'},
    'Neptunian Power Consultants': {resourceType: 'Hydroelectric resource'},
  };
  return makeState({
    thisPlayer: {
      color: 'blue',
      megacredits: 51,
      actionsTakenThisRound: 0,
      tableau: [
        {name: 'Psychrophiles', resources: 1},
        {name: 'Titan Shuttles', resources: 4},
        {name: 'Neptunian Power Consultants', resources: 0},
      ],
    },
    players: [
      {color: 'blue', isActive: true},
      {color: 'pink', isActive: false},
    ],
    game: {
      phase: 'action',
      generation: 5,
      oceans: 0,
      milestones: [
        {
          name: 'Tradesman',
          scores: [
            {color: 'pink', score: 2, claimable: false},
            {color: 'blue', score: 2, claimable: false},
          ],
        },
      ],
      colonies: [
        {name: 'Europa', isActive: true, trackPosition: 2, colonies: []},
        {name: 'Ceres', isActive: true, trackPosition: 3, colonies: ['green']},
      ],
      spaces: [
        {id: '15', spaceType: 'ocean', bonus: [2, 2, 2], tile: null},
      ],
    },
    _waitingFor: {
      type: 'or',
      title: 'Select an action',
      options: [
        {type: 'option', title: 'Standard projects'},
        {
          type: 'card',
          title: 'Play project card',
          cards: [{name: 'Miranda Resort'}],
        },
        {type: 'option', title: 'Pass for this generation'},
      ],
    },
  });
}

function testEuropaNeptunianTradesmanChainOverridesGenericAdvisor() {
  const rec = actionRec.computeActionRecommendation({
    state: makeTradesmanChainState(),
    advisor: {
      analyzeActions() {
        return [
          {index: 1, action: 'Play project card', score: 90, reason: 'Generic good card'},
          {index: 0, action: 'Standard projects', score: 45, reason: 'Generic SP'},
        ];
      },
      rankHandCards() {
        return [{name: 'Miranda Resort', reason: 'Jovian points'}];
      },
    },
  });

  assert(rec, 'milestone chain recommendation should be produced');
  assert.strictEqual(rec.kind, 'milestone-chain');
  assert.strictEqual(rec.optionIndex, 0);
  assert.strictEqual(rec.optionTitle, 'Standard projects');
  assert(rec.title.includes('Europa'), rec.title);
  assert(rec.title.includes('Tradesman'), rec.title);
  assert(rec.reasonRows.some((row) => row.text.includes('Neptunian')), rec.reasonRows);
  assert(rec.reasonRows.some((row) => row.text.includes('claim')), rec.reasonRows);
  assert(rec.reasonRows.some((row) => row.text.includes('opponent is also 2/3')), rec.reasonRows);
}

function testSignalFallbackRequiresActionPrompt() {
  const rec = actionRec.computeActionRecommendation({
    state: makeState(),
    advisor: {analyzeActions: () => []},
    signals: [{
      id: 'fund-thermalist',
      severity: 'warning',
      label: 'Fund Thermalist',
      title: 'Fund Thermalist',
      priority: 85,
      reasons: ['Current lead: 26 vs 8.'],
      action: 'Fund this award if no higher swing is available.',
    }],
  });

  assert(rec, 'signal fallback should be produced when advisor cannot rank the action prompt');
  assert.strictEqual(rec.title, 'Fund Thermalist');
  assert.strictEqual(rec.kind, 'signal');
  assert(rec.reasonRows.some((row) => row.text.includes('26 vs 8')));
}

function testNoRecommendationOutsideTurnOrActionPhase() {
  const advisor = {
    analyzeActions() {
      return [{index: 0, action: 'Play project card', score: 90, reason: 'Would be best on my turn'}];
    },
  };

  assert.strictEqual(
    actionRec.computeActionRecommendation({state: makeState({_waitingFor: null}), advisor: {}}),
    null,
    'no waitingFor means no in-turn recommendation'
  );
  assert.strictEqual(
    actionRec.computeActionRecommendation({state: makeState({game: {phase: 'drafting'}}), advisor: {}}),
    null,
    'drafting should not emit action recommendation'
  );
  assert.strictEqual(
    actionRec.computeActionRecommendation({
      state: makeState({
        players: [
          {color: 'hydro', isActive: false},
          {color: 'red', isActive: true},
        ],
      }),
      advisor,
    }),
    null,
    'stale waitingFor from a previous turn should not emit recommendation when another player is active'
  );
  assert.strictEqual(
    actionRec.computeActionRecommendation({
      state: makeState({game: {phase: 'action', activePlayer: 'red'}}),
      advisor,
    }),
    null,
    'activePlayer mismatch should suppress action recommendation'
  );
  assert(
    actionRec.computeActionRecommendation({
      state: makeState({
        players: [
          {color: 'hydro', isActive: true},
          {color: 'red', isActive: false},
        ],
      }),
      advisor,
    }),
    'own active turn should still emit recommendation'
  );
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.className = '';
    this.textContent = '';
    this.attrs = {};
    this.style = {};
    this.classList = {
      add: (cls) => {
        const parts = new Set(String(this.className).split(/\s+/).filter(Boolean));
        parts.add(cls);
        this.className = Array.from(parts).join(' ');
      },
      remove: (cls) => {
        this.className = String(this.className).split(/\s+/).filter((part) => part && part !== cls).join(' ');
      },
    };
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (before && before.parentNode !== this) {
      throw new Error('NotFoundError: insertBefore target is not a direct child');
    }
    child.parentNode = this;
    child.parentElement = this;
    const idx = this.children.indexOf(before);
    if (idx < 0) return this.appendChild(child);
    this.children.splice(idx, 0, child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const classParts = (el) => String(el.className).split(/\s+/).filter(Boolean);
    const hasClass = (el, cls) => classParts(el).includes(cls);
    const matches = (el) => {
      if (selector === '.tm-action-recommendation') return hasClass(el, 'tm-action-recommendation');
      if (selector === '.tm-action-recommendation-target') return hasClass(el, 'tm-action-recommendation-target');
      if (selector === '.tm-action-recommendation-card-target') return hasClass(el, 'tm-action-recommendation-card-target');
      if (selector === '.player_home_block--actions') return hasClass(el, 'player_home_block--actions');
      if (selector === '.wf-component') return hasClass(el, 'wf-component');
      if (selector === '.wf-options') return hasClass(el, 'wf-options');
      if (selector === '.card-container') return hasClass(el, 'card-container');
      if (selector === 'label.form-radio') return el.tagName === 'label' && hasClass(el, 'form-radio');
      if (selector === '.wf-action') return hasClass(el, 'wf-action');
      if (selector === '.wf-component button') return el.tagName === 'button' && el.parentElement && hasClass(el.parentElement, 'wf-component');
      if (selector === '.card-standard-project') return hasClass(el, 'card-standard-project');
      if (selector === 'button') return el.tagName === 'button';
      if (selector === '#actions') return el.getAttribute('id') === 'actions';
      if (selector === '[data-tm-game-anchor="actions"]') return el.getAttribute('data-tm-game-anchor') === 'actions';
      if (selector === '[data-tm-card]') return el.getAttribute('data-tm-card') !== null;
      if (selector === '.wf-component--select-option') return hasClass(el, 'wf-component--select-option');
      return false;
    };
    const walk = (el) => {
      if (matches(el)) result.push(el);
      el.children.forEach(walk);
    };
    walk(this);
    return result;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.documentElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function testRenderAnchorsAndHighlightsAction() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  const wf = doc.createElement('div');
  wf.className = 'wf-options';
  const play = doc.createElement('label');
  play.className = 'form-radio';
  play.textContent = 'Play project card';
  wf.appendChild(play);
  const pass = doc.createElement('label');
  pass.className = 'form-radio';
  pass.textContent = 'Pass for this generation';
  wf.appendChild(pass);
  actions.appendChild(wf);
  doc.body.appendChild(actions);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:0:Play Kelp Farming',
      title: 'Play Kelp Farming',
      optionTitle: 'Play project card',
      optionIndex: 0,
      score: 82,
      reasonRows: [{text: 'Best card tempo'}],
    },
  });

  assert.strictEqual(rendered.length, 2, 'box and highlighted target should be returned');
  assert.strictEqual(actions.querySelectorAll('.tm-action-recommendation').length, 1, 'recommendation should render inside actions block');
  assert(play.className.includes('tm-action-recommendation-target'), 'matching action option should be highlighted');

  actionRec.clearActionRecommendation({documentObj: doc});
  assert.strictEqual(actions.querySelectorAll('.tm-action-recommendation').length, 0, 'clear should remove recommendation box');
  assert(!play.className.includes('tm-action-recommendation-target'), 'clear should remove highlight');
}

function testRenderHighlightsRecommendedCard() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  const wf = doc.createElement('div');
  wf.className = 'wf-options';
  const play = doc.createElement('label');
  play.className = 'form-radio';
  play.textContent = 'Play project card';
  wf.appendChild(play);
  actions.appendChild(wf);
  doc.body.appendChild(actions);

  const hand = doc.createElement('div');
  const targetCard = doc.createElement('div');
  targetCard.setAttribute('data-tm-card', 'Kelp Farming');
  targetCard.textContent = 'Kelp Farming';
  hand.appendChild(targetCard);
  const otherCard = doc.createElement('div');
  otherCard.setAttribute('data-tm-card', 'Cloud Seeding');
  otherCard.textContent = 'Cloud Seeding';
  hand.appendChild(otherCard);
  doc.body.appendChild(hand);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:0:Play Kelp Farming',
      title: 'Play Kelp Farming',
      cardName: 'Kelp Farming',
      optionTitle: 'Play project card',
      optionIndex: 0,
      score: 82,
    },
  });

  assert.strictEqual(rendered.length, 3, 'box, action target, and card target should be returned');
  assert(play.className.includes('tm-action-recommendation-target'), 'matching action option should still be highlighted');
  assert(targetCard.className.includes('tm-action-recommendation-card-target'), 'recommended hand card should be highlighted');
  assert(!otherCard.className.includes('tm-action-recommendation-card-target'), 'other hand cards should not be highlighted');

  actionRec.clearActionRecommendation({documentObj: doc});
  assert(!targetCard.className.includes('tm-action-recommendation-card-target'), 'clear should remove card highlight');
}

function testRenderHighlightsCardContainerByTextFallback() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  const wf = doc.createElement('div');
  wf.className = 'wf-options';
  const use = doc.createElement('label');
  use.className = 'form-radio';
  use.textContent = 'Perform an action from a played card';
  wf.appendChild(use);
  actions.appendChild(wf);
  doc.body.appendChild(actions);

  const tableau = doc.createElement('div');
  const targetCard = doc.createElement('div');
  targetCard.className = 'card-container';
  targetCard.textContent = 'Titan Shuttles Add 2 floaters to this card';
  tableau.appendChild(targetCard);
  const otherCard = doc.createElement('div');
  otherCard.className = 'card-container';
  otherCard.textContent = 'CEO\'s Favorite Project Add 1 resource';
  tableau.appendChild(otherCard);
  doc.body.appendChild(tableau);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:1:Use Titan Shuttles',
      title: 'Use Titan Shuttles',
      cardName: 'Titan Shuttles',
      optionTitle: 'Perform an action from a played card',
      optionIndex: 0,
      score: 70,
    },
  });

  assert.strictEqual(rendered.length, 3, 'fallback should return box, action target, and text-matched card target');
  assert(use.className.includes('tm-action-recommendation-target'), 'matching action option should still be highlighted');
  assert(targetCard.className.includes('tm-action-recommendation-card-target'), 'card-container text fallback should highlight the matching card');
  assert(!otherCard.className.includes('tm-action-recommendation-card-target'), 'text fallback should not highlight other cards');
}

function testRenderSuppressesNotYourTurnBlock() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  actions.textContent = 'Actions Not your turn to take any actions';
  doc.body.appendChild(actions);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:0:Use action',
      title: 'Use action',
      optionTitle: 'Use action',
      optionIndex: 0,
      score: 80,
    },
  });

  assert.deepStrictEqual(rendered, [], 'not-your-turn actions block should not render a recommendation box');
  assert.strictEqual(actions.querySelectorAll('.tm-action-recommendation').length, 0, 'no box should be inserted');
}

function testRenderHandlesNestedWorkflowContainer() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  const wrapper = doc.createElement('div');
  wrapper.className = 'wf-wrapper';
  const wf = doc.createElement('div');
  wf.className = 'wf-component';
  const play = doc.createElement('button');
  play.textContent = 'Play project card';
  wf.appendChild(play);
  wrapper.appendChild(wf);
  actions.appendChild(wrapper);
  doc.body.appendChild(actions);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:0:Play Kelp Farming',
      title: 'Play Kelp Farming',
      optionTitle: 'Play project card',
      optionIndex: 0,
      score: 82,
    },
  });

  assert.strictEqual(rendered.length, 2, 'nested workflow should render without NotFoundError');
  assert.strictEqual(actions.children[0].className, 'tm-action-recommendation', 'box should be inserted at action root');
  assert(play.className.includes('tm-action-recommendation-target'), 'nested option should still be highlighted');
}

testAdvisorRecommendationRanksCard();
testAdvisorRecommendationSkipsNonPlayableCards();
testAdvisorRecommendationSkipsDeferredGreenhouses();
testAdvisorRecommendationUsesRealGensLeftForGreenhousesCashout();
testAdvisorRecommendationSuppressesAllDeferredPlayCards();
testAdvisorRecommendationSkipsDeferredTagCashout();
testAdvisorRecommendationSkipsTagCashoutWithoutFutureTagsBeforeFinalWindow();
testAdvisorRecommendationPlaysAdvancedAlloysBeforeMetalSpend();
testAdvisorRecommendationSkipsOptimalAerobrakingUntilTriggerWindow();
testAdvisorRecommendationSkipsCeosFavoriteUntilFinalWindow();
testAdvisorRecommendationKeepsCeosFavoriteAsFinalPoke();
testAdvisorRecommendationKeepsCeosFavoriteAsFinalPokeFromApiFixture();
testAdvisorRecommendationSkipsFinalWindowEngineCardForScoringAction();
testEuropaNeptunianTradesmanChainOverridesGenericAdvisor();
testSignalFallbackRequiresActionPrompt();
testNoRecommendationOutsideTurnOrActionPhase();
testRenderAnchorsAndHighlightsAction();
testRenderHighlightsRecommendedCard();
testRenderHighlightsCardContainerByTextFallback();
testRenderSuppressesNotYourTurnBlock();
testRenderHandlesNestedWorkflowContainer();

console.log('content-action-recommendation checks: OK');
