#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content-play-priority.js');
const routeSourcePath = path.resolve(__dirname, '..', 'src', 'content-route-validators.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const routeSource = fs.existsSync(routeSourcePath) ? fs.readFileSync(routeSourcePath, 'utf8') : '';
delete global.TM_CONTENT_ROUTE_VALIDATORS;
if (fs.existsSync(routeSourcePath)) require(routeSourcePath);
delete global.TM_CONTENT_PLAY_PRIORITY;
require(sourcePath);

const routeValidators = global.TM_CONTENT_ROUTE_VALIDATORS;
const playPriority = global.TM_CONTENT_PLAY_PRIORITY;
assert(playPriority, 'TM_CONTENT_PLAY_PRIORITY should be loaded');

function makeCardEl(cardName) {
  return {
    getAttribute(attr) {
      return attr === 'data-tm-card' ? cardName : '';
    },
    classList: {
      contains() {
        return false;
      },
    },
    querySelector() {
      return null;
    },
    closest() {
      return null;
    },
  };
}

function makeRequirementCardEl(cardName, reqText) {
  return {
    getAttribute(attr) {
      return attr === 'data-tm-card' ? cardName : '';
    },
    classList: {
      contains() {
        return false;
      },
    },
    querySelector(selector) {
      if (selector === '.card-requirements, .card-requirement') {
        return {textContent: reqText};
      }
      return null;
    },
    closest() {
      return null;
    },
  };
}

function neutralResult() {
  return {adj: 0, reasons: []};
}

function applyResult(result, bonus, reasons) {
  if (!result) return bonus;
  if (Array.isArray(result.reasons)) reasons.push(...result.reasons);
  return bonus + (result.adj || 0);
}

function baseDraftInput() {
  return {
    cardName: 'Test Card',
    myTableau: [],
    myHand: [],
    myCorp: 'Credicor',
    cardEl: makeCardEl('Test Card'),
    ctx: {
      gensLeft: 4,
      tradesLeft: 0,
      _myCorps: ['Credicor'],
      globalParams: {},
    },
    sc: {
      tagDecayFullAt: 8,
      tagDecayMin: 0.5,
      tradeTrackThreshold: 10,
      tradeTrackCap: 6,
      chainGodmode: 10,
      chainGreat: 7,
      chainDecent: 4,
    },
    ratings: {
      'Test Card': {s: 60, e: '', t: 'C'},
    },
    getPlayerVueData() {
      return {
        game: {players: []},
        thisPlayer: {megaCredits: 20},
      };
    },
    detectMyCorps() {
      return ['Credicor'];
    },
    getOpeningHandBias() {
      return 0;
    },
    applyResult,
    scoreTableauSynergy: neutralResult,
    scoreComboPotential: neutralResult,
    scoreHandSynergy: neutralResult,
    getCachedCardTags() {
      return new Set();
    },
    getCardCost() {
      return 8;
    },
    scoreCardRequirements: neutralResult,
    isPreludeOrCorpCard() {
      return false;
    },
    scoreDiscountsAndPayments: neutralResult,
    scoreTagSynergies: neutralResult,
    scoreColonySynergy: neutralResult,
    scoreTurmoilSynergy: neutralResult,
    scoreFTNTiming() {
      return {adj: 0, reasons: [], skipCrudeTiming: false};
    },
    scoreCrudeTiming: neutralResult,
    scoreMilestoneAwardProximity: neutralResult,
    scoreResourceSynergies: neutralResult,
    scoreCardEconomyInContext: neutralResult,
    scoreOpponentAwareness: neutralResult,
    scorePositionalFactors: neutralResult,
    getCorpBoost() {
      return 0;
    },
    combos: [],
    scoreMapMA: neutralResult,
    scoreTerraformRate: neutralResult,
    scorePostContextChecks: neutralResult,
    scoreBoardStateModifiers: neutralResult,
    scoreSynergyRules: neutralResult,
    scorePrelude: neutralResult,
    scoreBreakEvenTiming() {
      return {penalty: 0, reason: ''};
    },
    checkDenyDraft() {
      return null;
    },
    checkHateDraft() {
      return null;
    },
  };
}

function testAdjustForResearchTreatsStepRequirementAsHardBlock() {
  const result = {
    total: 70,
    uncappedTotal: 70,
    reasons: ['Req 3 шагов oxygen'],
  };

  playPriority.adjustForResearch({
    result,
    el: makeCardEl('Test Card'),
    myHand: [],
    ctx: {mc: 20, gensLeft: 2},
    getCardCost() {
      return 8;
    },
    getPlayerVueData() {
      return {
        game: {players: []},
        thisPlayer: {megaCredits: 20},
      };
    },
    tmBrain: null,
    cardEffects: null,
  });

  assert.strictEqual(result.total, 67, 'three-step requirement should be treated as a hard draft block');
  assert(result.reasons.includes('Skip'), 'hard-blocked draft card should be marked as skip');
  assert(!result.reasons.some((reason) => reason.startsWith('Buy')), 'hard-blocked draft card should not be marked as buy');
}

function testAdjustForResearchSkipsDenyOnlyInsectsBuy() {
  const result = {
    total: 64,
    uncappedTotal: 64,
    reasons: [
      '✂ Deny: Пеша plant shell',
      'Insects: нет plant shell cap -12',
      'Greenhouses +1.5',
    ],
  };

  playPriority.adjustForResearch({
    result,
    el: makeCardEl('Insects'),
    myHand: [],
    ctx: {mc: 80, gensLeft: 3},
    getCardCost() {
      return 9;
    },
    getPlayerVueData() {
      return {
        game: {players: []},
        thisPlayer: {megaCredits: 80},
        draftedCards: [{name: 'Insects'}],
      };
    },
    tmBrain: null,
    cardEffects: {Insects: {c: 9}},
  });

  assert(
    result.total <= 56,
    'deny-only Insects should be a draft deny, not a research buy recommendation',
  );
  assert(
    result.reasons.includes('Deny уже сделан: не покупать'),
    'deny-only research cards should explain that the deny was already achieved',
  );
  assert(
    !result.reasons.some((reason) => reason.startsWith('Buy')),
    'deny-only Insects should not receive a Buy label in research',
  );
}

function testScoreDraftCardMarksSpecificReqAsPenaltyForPositionalFactors() {
  let capturedReqPenaltyPresent = null;
  const input = baseDraftInput();
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {adj: 0, reasons: ['Req 2 шагов oxygen']};
  };
  input.scorePositionalFactors = function scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet, reqPenaltyPresent) {
    capturedReqPenaltyPresent = reqPenaltyPresent;
    return neutralResult();
  };

  playPriority.scoreDraftCard(input);
  assert.strictEqual(capturedReqPenaltyPresent, true, 'any Req-prefixed reason should propagate as a requirement penalty');
}

function testScoreDraftCardDropsGenericFarFallbackWhenSpecificReasonExists() {
  const input = baseDraftInput();
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {
      adj: 0,
      reasons: ['Req 4 шагов oxygen', 'Req далеко oxygen -30'],
    };
  };

  const result = playPriority.scoreDraftCard(input);
  assert(result.reasons.includes('Req 4 шагов oxygen'), 'specific requirement reason should be preserved');
  assert(!result.reasons.includes('Req далеко oxygen -30'), 'generic far fallback should be removed when a specific requirement reason exists');
}

function testScoreDraftCardDropsBareCorpReasonWhenSpecificCorpReasonExists() {
  const input = baseDraftInput();
  input.scoreTagSynergies = function scoreTagSynergies() {
    return {
      adj: 3,
      reasons: ['Credicor +3', 'Корп: Credicor'],
    };
  };

  const result = playPriority.scoreDraftCard(input);
  assert(result.reasons.includes('Credicor +3'), 'specific corp reason should be preserved');
  assert(!result.reasons.includes('Корп: Credicor'), 'bare corp reason should be removed once a specific corp reason exists');
}

function testScoreDraftCardIncludesVisibleCeoInSynergyContext() {
  let sawGordon = false;
  const input = baseDraftInput();
  input.cardName = 'Early Expedition';
  input.ratings = {
    'Early Expedition': {s: 69, e: '18 MC total (15+3), ti payable', t: 'C', y: ['Gordon', 'Immigrant City']},
  };
  input.getVisibleCeoNames = function getVisibleCeoNames() {
    return ['Gordon'];
  };
  input.scoreTableauSynergy = function scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet) {
    sawGordon = allMyCards.indexOf('Gordon') !== -1 && allMyCardsSet.has('Gordon');
    return neutralResult();
  };

  playPriority.scoreDraftCard(input);
  assert(sawGordon, 'visible CEO cards should be available to project-card synergy scoring');
}

function testScoreDraftCardRoundsStandardProjectComparisonReason() {
  const input = baseDraftInput();
  input.ratings = {
    'Test Card': {s: 52.8, e: 'production', t: 'D'},
  };
  input.cardEffects = {
    'Test Card': {mp: 1},
  };
  input.ctx = Object.assign({}, input.ctx, {
    allSP: [{type: 'power', name: 'Электростанция', adj: 58}],
  });

  const result = playPriority.scoreDraftCard(input);
  const reason = result.reasons.find((text) => text.startsWith('vs Электростанция'));

  assert.strictEqual(reason, 'vs Электростанция -5.2');
}

function testOptimalAerobrakingPenalizesHighTemperature() {
  const input = baseDraftInput();
  input.cardName = 'Optimal Aerobraking';
  input.cardEl = makeCardEl('Optimal Aerobraking');
  input.myHand = ['Optimal Aerobraking', 'Solar Probe', 'Deimos Down'];
  input.ratings = {
    'Optimal Aerobraking': {s: 84, e: 'When you play a space event, you gain 3 M€ and 3 heat.', t: 'A'},
  };
  input.cardTagsData = {
    'Optimal Aerobraking': ['space'],
    'Solar Probe': ['event', 'science', 'space'],
    'Deimos Down': ['event', 'space'],
  };
  input.ctx = Object.assign({}, input.ctx, {
    globalParams: {temp: 6, oxy: 8, oceans: 5, venus: 0},
  });
  input.sc = Object.assign({}, input.sc, {
    tempMax: 8,
    tempStep: 2,
    oxyMax: 14,
    oceansMax: 9,
    venusMax: 30,
  });

  const result = playPriority.scoreDraftCard(input);

  assert.strictEqual(result.total, 78, 'one remaining temperature step should apply a 6 point OptAero penalty');
  assert(
    result.reasons.some((reason) => reason.includes('Температура почти закрыта')),
    'OptAero high-temperature penalty should be visible in reasons',
  );
}

function testOptimalAerobrakingWaitsForSpaceEventTriggerWindow() {
  const input = baseDraftInput();
  input.cardName = 'Optimal Aerobraking';
  input.cardEl = makeCardEl('Optimal Aerobraking');
  input.myHand = ['Optimal Aerobraking', 'Solar Probe'];
  input.ratings = {
    'Optimal Aerobraking': {s: 84, e: 'When you play a space event, you gain 3 M€ and 3 heat.', t: 'A'},
    'Solar Probe': {s: 58, e: 'Space event.', t: 'C'},
  };
  input.cardTagsData = {
    'Optimal Aerobraking': ['space'],
    'Solar Probe': ['event', 'science', 'space'],
  };
  input.ctx = Object.assign({}, input.ctx, {
    gensLeft: 3,
    globalParams: {temp: -8, oxy: 4, oceans: 2, venus: 10},
  });
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 15, reasons: ['Hand: space event shell +15']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.reasons.some((reason) => reason.includes('OptAero: играть перед space event')),
    'Optimal Aerobraking should explain that it waits until right before the trigger',
  );
  assert(
    result.total <= 87,
    'a single future space event should not let Optimal Aerobraking jump as a play-now card',
  );
}

function testScoreDraftCardSuppressesClaimedMilestoneProximity() {
  const input = baseDraftInput();
  input.cardName = 'Tundra Farming';
  input.cardEl = makeCardEl('Tundra Farming');
  input.ratings = {
    'Tundra Farming': {s: 64, e: 'Increase your plant production 1 step and your M€ production 2 steps.', t: 'C'},
  };
  input.ctx = Object.assign({}, input.ctx, {
    milestoneNeeds: {plant: 2},
    globalParams: {temp: -6, oxy: 8, oceans: 5, venus: 0},
  });
  input.sc = Object.assign({}, input.sc, {
    milestoneNeed1: 7,
    milestoneNeed2: 5,
    milestoneNeed3: 3,
  });
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['plant']);
  };
  input.scoreMilestoneAwardProximity = function scoreMilestoneAwardProximity() {
    return {adj: 5, bonus: 5, reasons: ['до Ecologist ещё 2']};
  };
  input.getPlayerVueData = function getPlayerVueData() {
    return {
      game: {
        players: [],
        milestones: [
          {name: 'Ecologist', playerName: 'claimed-player', color: 'red'},
        ],
      },
      thisPlayer: {megaCredits: 30},
    };
  };

  const result = playPriority.scoreDraftCard(input);

  assert.strictEqual(result.total, 64, 'claimed Ecologist should not keep its stale +5 proximity bonus');
  assert(
    !result.reasons.some((reason) => reason.includes('Ecologist')),
    'claimed Ecologist should be removed from visible card reasons',
  );
}

function testDirectedImpactorsPenalizesLateFastTemperatureWindow() {
  const input = baseDraftInput();
  input.cardName = 'Directed Impactors';
  input.cardEl = makeCardEl('Directed Impactors');
  input.ratings = {
    'Directed Impactors': {s: 56, e: 'Action: spend 6 M€ to add 1 asteroid to any card, or remove 1 asteroid here to raise temperature 1 step.', t: 'C'},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 7,
    gensLeft: 3,
    globalParams: {temp: -8, oxy: 4, oceans: 2, venus: 10},
  });
  input.sc = Object.assign({}, input.sc, {
    tempMax: 8,
    tempStep: 2,
    oxyMax: 14,
    oceansMax: 9,
    venusMax: 30,
  });
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['space']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 17, bonus: 17, reasons: ['Hand: space shell +17']};
  };
  input.getPlayerVueData = function getPlayerVueData() {
    return {
      game: {
        generation: 7,
        temperature: -8,
        oxygenLevel: 4,
        oceans: 2,
        players: [],
      },
      thisPlayer: {megaCredits: 70, titanium: 3, titaniumProduction: 3},
    };
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 61,
    'late Directed Impactors should not jump to B from generic space/titanium synergies',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Impactors: темп окно')),
    'Directed Impactors temp-window penalty should be visible in reasons',
  );
}

function testDirigiblesLateEngineCapOverridesGenericSynergy() {
  const input = baseDraftInput();
  input.cardName = 'Dirigibles';
  input.cardEl = makeCardEl('Dirigibles');
  input.myHand = ['Dirigibles', 'Titan Shuttles', 'Forced Precipitation', 'Unexpected Application'];
  input.ratings = {
    'Dirigibles': {s: 75, e: 'When playing a Venus tag, Floaters here may be used as payment, and are worth 3M€ each.', t: 'B'},
  };
  input.cardEffects = {
    'Dirigibles': {c: 11, res: 'floater', tg: 'venus'},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 7,
    gensLeft: 4,
    globalParams: {temp: -8, oxy: 4, oceans: 2, venus: 10},
    floaterTargetCount: 1,
    floaterAccumRate: 0,
  });
  input.getCardCost = function getCardCost() {
    return 11;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['venus']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 17, bonus: 17, reasons: ['Hand: Venus/floater shell +17']};
  };
  input.scoreTagSynergies = function scoreTagSynergies() {
    return {adj: 3, bonus: 3, reasons: ['venus strategy +3']};
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -24, bonus: -24, reasons: ['Поздн. floater engine -24']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 54,
    'late Dirigibles should be capped to D-tier when it has no established floater payoff',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Dirigibles: поздний cap')),
    'late Dirigibles cap should be visible in reasons',
  );
  assert(
    !result.reasons.some((reason) => /Dirigibles: поздний cap -?\d+\.\d{4,}/.test(reason)),
    'late Dirigibles cap reason should not expose floating-point precision noise',
  );
}

function testMineLateProductionCapOverridesGenericSynergy() {
  const input = baseDraftInput();
  input.cardName = 'Mine';
  input.cardEl = makeCardEl('Mine');
  input.myHand = ['Mine', 'Space Elevator', 'Strip Mine'];
  input.ratings = {
    Mine: {s: 72, e: 'Increase your steel production 1 step.', t: 'B'},
  };
  input.cardEffects = {
    Mine: {c: 4, sp: 1},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 7,
    gensLeft: 4,
    globalParams: {temp: -8, oxy: 4, oceans: 2, venus: 10},
  });
  input.getCardCost = function getCardCost() {
    return 4;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['building']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 8, bonus: 8, reasons: ['Hand: steel/building shell +8']};
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -15, bonus: -15, reasons: ['Mine: поздняя окупаемость -15']};
  };
  input.scoreMapMA = function scoreMapMA() {
    return {adj: 4, bonus: 4, reasons: ['Miner/Builder race +4']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 54,
    'late Mine should stay D-tier even when steel/building and M/A context add generic bonuses',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Mine: поздний cap')),
    'late Mine cap should be visible in reasons',
  );
}

function testMiningRightsLateProductionCapOverridesGenericSynergy() {
  const input = baseDraftInput();
  input.cardName = 'Mining Rights';
  input.cardEl = makeCardEl('Mining Rights');
  input.myHand = ['Mining Rights', 'Advanced Alloys', 'Space Elevator'];
  input.ratings = {
    'Mining Rights': {s: 76, e: 'Place this tile on a steel or titanium placement bonus. Increase that production 1 step.', t: 'B'},
  };
  input.cardEffects = {
    'Mining Rights': {c: 9, sp: 1},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 8,
    gensLeft: 2,
    prod: {steel: 0, ti: 0},
    tags: {building: 3},
    globalParams: {temp: -4, oxy: 8, oceans: 3, venus: 12},
  });
  input.getCardCost = function getCardCost() {
    return 9;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['building']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 12, bonus: 12, reasons: ['Hand: steel/building shell +12']};
  };
  input.scoreDiscountsAndPayments = function scoreDiscountsAndPayments() {
    return {adj: 4, bonus: 4, reasons: ['Сталь −4 MC']};
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -8, bonus: -8, reasons: ['Mining Rights: поздняя окупаемость -8']};
  };
  input.scoreMapMA = function scoreMapMA() {
    return {adj: 4, bonus: 4, reasons: ['Builder race +4']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 62,
    'late Mining Rights should not stay B-tier just because generic building/steel synergies fire',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Mining Rights: поздний production cap')),
    'late Mining Rights cap should be visible in reasons',
  );

  const titaniumRaceResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      gensLeft: 3,
    }),
    scoreMapMA() {
      return {adj: 8, bonus: 8, reasons: ['Titanium spot +4', 'Miner/Builder race +4']};
    },
  }));

  assert(
    titaniumRaceResult.total > result.total && titaniumRaceResult.total <= 64,
    'late Mining Rights with a titanium/race reason can stay higher, but should still be capped below normal early B',
  );
}

function testMiningExpeditionGetsOnlyTimingRebateBoosts() {
  const input = baseDraftInput();
  input.cardName = 'Mining Expedition';
  input.cardEl = makeCardEl('Mining Expedition');
  input.myHand = ['Mining Expedition', 'Media Group'];
  input.ratings = {
    'Mining Expedition': {s: 46, e: 'Raise oxygen 1 step. Remove 2 plants from any player. Gain 2 steel.', t: 'D'},
    'Media Group': {s: 62, e: 'When you play an event, gain 3 M€.', t: 'C'},
  };
  input.cardEffects = {
    'Mining Expedition': {c: 12, o2: 1, steel: 2},
    'Media Group': {c: 6},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 6,
    gensLeft: 3,
    steelVal: 3,
    _myCorps: ['Interplanetary Cinematics'],
    globalParams: {oxy: 7, temp: -10, oceans: 4, venus: 12},
  });
  input.getCardCost = function getCardCost() {
    return 12;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['event']);
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -4, bonus: -4, reasons: ['Mining Expedition: узкий tempo event -4']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total >= 55,
    'Mining Expedition should rise into C-tier when it grabs the 8% O2 bonus with event/steel rebates',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Mining Expedition: 8% O2 bonus')),
    'Mining Expedition O2 timing reason should be visible',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Mining Expedition: event rebates')),
    'Mining Expedition event rebate reason should be visible',
  );

  const genericResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Mining Expedition'],
    ctx: Object.assign({}, input.ctx, {
      steelVal: 2,
      _myCorps: [],
      globalParams: {oxy: 4, temp: -10, oceans: 4, venus: 12},
    }),
  }));

  assert(
    genericResult.total <= 50,
    'generic Mining Expedition without O2 timing or rebates should remain a low-priority niche event',
  );
}

function testAiCentralFullHandLateCapOverridesGenericSynergy() {
  const input = baseDraftInput();
  input.cardName = 'AI Central';
  input.cardEl = makeCardEl('AI Central');
  input.myHand = ['AI Central', 'Warp Drive', 'Mars University', 'Olympus Conference', 'Research'];
  input.ratings = {
    'AI Central': {s: 88, e: 'Requires 3 science tags. Decrease your energy production 1 step. Action: Draw 2 cards. 1 VP.', t: 'A'},
  };
  input.cardEffects = {
    'AI Central': {c: 21, ep: -1, actCD: 2, vp: 1},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 7,
    gensLeft: 4,
    handSize: 14,
    tags: {science: 3, building: 2},
    globalParams: {temp: -8, oxy: 4, oceans: 2, venus: 10},
  });
  input.getCardCost = function getCardCost() {
    return 21;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['science', 'building']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 28, bonus: 28, reasons: ['Hand: VP cohesion/science/actions +28']};
  };
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {adj: 4, bonus: 4, reasons: ['Req ✓ +4']};
  };
  input.scoreDiscountsAndPayments = function scoreDiscountsAndPayments() {
    return {adj: 5, bonus: 5, reasons: ['steel/energy shell +5']};
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -15, bonus: -15, reasons: ['Тайминг -15']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 78,
    'late AI Central with a full hand should be capped below A/S despite generic science/draw synergies',
  );
  assert(
    result.reasons.some((reason) => reason.includes('AI Central: полная рука cap')),
    'late AI Central full-hand cap should be visible in reasons',
  );

  const richResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      mc: 70,
      prod: {mc: 41},
    }),
  }));

  assert(
    richResult.total > result.total && richResult.total <= 86,
    'rich late AI Central positions should stay A-tier rather than being forced down to the poor full-hand cap',
  );

  const richPvResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    getPlayerVueData() {
      return {
        game: {players: []},
        thisPlayer: {megaCredits: 67, megacreditProduction: 41},
      };
    },
  }));

  assert(
    richPvResult.total > result.total && richPvResult.total <= 86,
    'rich late AI Central positions should also be recognized from live player data when ctx economy is missing',
  );
}

function testDevelopmentCenterLateNoEnergyCapOverridesGenericSynergy() {
  const input = baseDraftInput();
  input.cardName = 'Development Center';
  input.cardEl = makeCardEl('Development Center');
  input.myHand = ['Development Center', 'Mars University', 'Olympus Conference', 'Research', 'Warp Drive'];
  input.ratings = {
    'Development Center': {s: 76, e: 'Action: Spend 1 energy to draw a card. Science and Building tags.', t: 'B'},
  };
  input.cardEffects = {
    'Development Center': {c: 11, actCD: 1},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 8,
    gensLeft: 2,
    handSize: 12,
    prod: {energy: 0, steel: 1},
    tags: {science: 3, building: 4},
    globalParams: {temp: -4, oxy: 8, oceans: 3, venus: 12},
  });
  input.getCardCost = function getCardCost() {
    return 11;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['science', 'building']);
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 16, bonus: 16, reasons: ['Hand: science/building draw shell +16']};
  };
  input.scoreDiscountsAndPayments = function scoreDiscountsAndPayments() {
    return {adj: 4, bonus: 4, reasons: ['Сталь −4 MC']};
  };
  input.scoreTagSynergies = function scoreTagSynergies() {
    return {adj: 6, bonus: 6, reasons: ['science/building стратегия +6']};
  };
  input.scoreCardEconomyInContext = function scoreCardEconomyInContext() {
    return {adj: -8, bonus: -8, reasons: ['Поздний draw engine -8']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 56,
    'late Development Center without energy and with a full hand should not look like a buyable B-tier draw card',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Development Center: поздний draw cap')),
    'late Development Center cap should be visible in reasons',
  );

  const energyResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      gensLeft: 3,
      handSize: 5,
      prod: {energy: 3, steel: 1},
    }),
  }));

  assert(
    energyResult.total > result.total && energyResult.total <= 68,
    'late Development Center with real spare energy should stay playable but capped below unconditional B/A',
  );
}

function testImmigrantCityContextKeepsGenericOpenerLowAndBoostsSupportedLate() {
  const input = baseDraftInput();
  input.cardName = 'Immigrant City';
  input.cardEl = makeCardEl('Immigrant City');
  input.myHand = ['Immigrant City'];
  input.ratings = {
    'Immigrant City': {
      s: 58,
      e: 'Decrease your energy production 1 step and decrease your M€ production 2 steps. Place a city tile.',
      t: 'C',
    },
  };
  input.cardEffects = {
    'Immigrant City': {c: 13, city: 1, ep: -1, mp: -2},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 2,
    gensLeft: 6,
    _myCorps: ['Credicor'],
    prod: {energy: 1},
    steel: 0,
    cities: 0,
    totalCities: 1,
  });
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['building', 'city']);
  };
  input.getCardCost = function getCardCost() {
    return 13;
  };

  const generic = playPriority.scoreDraftCard(input);
  assert(
    generic.total <= 54,
    'generic early Immigrant City should remain a low C/D pick rather than inherit the core B rating',
  );
  assert(
    generic.reasons.some((reason) => reason.includes('Immigrant City: early engine trap')),
    'generic early Immigrant City should explain the trap penalty',
  );

  const supported = playPriority.scoreDraftCard(Object.assign({}, input, {
    myCorp: 'Tharsis Republic',
    myTableau: ['Rover Construction', 'Pets'],
    ctx: Object.assign({}, input.ctx, {
      gen: 8,
      gensLeft: 2,
      _myCorps: ['Tharsis Republic'],
      prod: {energy: 1},
      steel: 8,
      steelVal: 3,
      cities: 2,
      totalCities: 7,
      milestones: new Set(['Mayor']),
    }),
    getPlayerVueData() {
      return {
        game: {players: [{citiesCount: 3}, {citiesCount: 2}, {citiesCount: 2}]},
        thisPlayer: {megaCredits: 40, energyProduction: 1, steel: 8, steelValue: 3},
      };
    },
  }));

  assert(
    supported.total >= 76 && supported.total <= 82,
    'supported late Immigrant City should rise into B/A context without changing the base score',
  );
  assert(
    supported.reasons.some((reason) => reason.includes('Immigrant City: Tharsis city engine')),
    'supported Immigrant City should show Tharsis context',
  );
  assert(
    supported.reasons.some((reason) => reason.includes('Immigrant City: Rover')),
    'supported Immigrant City should show Rover context',
  );
  assert(
    supported.reasons.some((reason) => reason.includes('Immigrant City: late city/steel dump')),
    'supported late Immigrant City should show late city/steel dump context',
  );
}

function testInsectsLateWithoutPlayedPlantShellDoesNotJumpToA() {
  const input = baseDraftInput();
  input.cardName = 'Insects';
  input.cardEl = makeCardEl('Insects');
  input.myHand = ['Insects', 'Greenhouses'];
  input.ratings = {
    Insects: {s: 76, e: 'Increase your plant production 1 step for each plant tag you have.', t: 'B'},
  };
  input.cardEffects = {
    Insects: {c: 9},
    Greenhouses: {c: 6},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 8,
    gensLeft: 3,
    tags: {plant: 0, wild: 0},
    tagsWithHand: {plant: 1, wild: 0},
    globalParams: {temp: -4, oxy: 8, oceans: 3, venus: 12},
  });
  input.getCardCost = function getCardCost() {
    return 9;
  };
  input.getCachedCardTags = function getCachedCardTags() {
    return new Set(['microbe']);
  };
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {adj: 4, bonus: 4, reasons: ['Req ✓ +4']};
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 6, bonus: 6, reasons: ['Greenhouses +1.5', 'Hand: 1 plant tag']};
  };
  input.scoreTagSynergies = function scoreTagSynergies() {
    return {adj: 1, bonus: 1, reasons: ['Topsoil → +1 MC']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert(
    result.total <= 64,
    'late Insects with zero played plant tags and one future plant tag should not look like a takeable B-tier card',
  );
  assert(
    result.reasons.some((reason) => reason.includes('Insects: нет plant shell cap')),
    'Insects plant-shell cap should be visible in reasons',
  );

  const plantShellResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      tags: {plant: 4, wild: 0},
      tagsWithHand: {plant: 4, wild: 0},
    }),
  }));

  assert(
    plantShellResult.total > 80,
    'Insects should still be high for a real played plant shell like a 4-plant-tag opponent',
  );
  assert(
    !plantShellResult.reasons.some((reason) => reason.includes('Insects: нет plant shell cap')),
    'real plant shell should not trigger the no-shell cap',
  );

  const shortWindowResult = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      gensLeft: 2,
    }),
  }));

  assert(
    shortWindowResult.total <= 58,
    'late Insects speculative one-tag route should drop further when the game has only about two generations left',
  );
}

function testScoreDraftCardKeepsProductionPaymentLockSoft() {
  const input = baseDraftInput();
  input.cardName = 'Livestock';
  input.cardEl = makeRequirementCardEl('Livestock', 'Requires 9% oxygen');
  input.ratings = {
    Livestock: {s: 73, e: '13 MC animal action vp accumulator', t: 'B'},
  };
  input.cardEffects = {
    Livestock: {c: 13, pp: -1, mp: 2},
  };
  input.ctx = Object.assign({}, input.ctx, {
    gen: 5,
    gensLeft: 4,
    prod: {plants: 0, energy: 0, steel: 0, ti: 0, heat: 0},
    allSP: [{type: 'power', name: 'Электростанция', adj: 70}],
  });
  input.getCardCost = function getCardCost() {
    return 13;
  };
  input.scoreBoardStateModifiers = function scoreBoardStateModifiers(cardName, data, eLower, ctx) {
    assert.strictEqual(cardName, 'Livestock');
    assert.strictEqual(ctx.prod.plants, 0);
    return {adj: -10, reasons: ['Не сейчас: plants prod 0→-1 −10']};
  };

  const result = playPriority.scoreDraftCard(input);

  assert.strictEqual(result.total, 63, 'temporary production payment lock should only apply the soft penalty');
  assert(result.reasons.includes('Не сейчас: plants prod 0→-1 −10'));
  assert(!result.reasons.some((reason) => reason.includes('Невозможно сыграть')));
  assert.strictEqual(
    result.reasons.find((reason) => reason.startsWith('vs Электростанция')),
    'vs Электростанция -7',
    'SP comparison should use the post-penalty score and remain rounded',
  );
}

function testComputeReqPriorityShowsProductionPaymentSoftPenalty() {
  const result = playPriority.computeReqPriority({
    cardEl: makeRequirementCardEl('Livestock', 'Requires 9% oxygen'),
    pv: {
      game: {
        oxygenLevel: 6,
        temperature: -16,
        oceans: 4,
        venusScaleLevel: 0,
      },
    },
    ctx: {
      gen: 5,
      gensLeft: 4,
      prod: {plants: 0},
    },
    getProductionFloorStatus() {
      return {
        unplayable: true,
        reasons: ['Невозможно сыграть: plants prod 0→-1'],
      };
    },
    evaluateBoardRequirements() {
      return {metNow: true, reqs: [], unmet: []};
    },
    detectMyCorps() {
      return [];
    },
    getRequirementFlexSteps() {
      return {any: 0, venus: 0};
    },
    getBoardRequirementDisplayName(_, amount) {
      return amount === 1 ? 'requirement' : 'requirements';
    },
    sc: {
      ppReqGapCap: 20,
      ppReqGapMul: 3,
      ppTagReqCap: 18,
      ppTagReqMul: 4,
      ppUnplayable: 50,
    },
  });

  assert.strictEqual(result.hardBlocked, false, 'production payment locks should not be hard-blocked');
  assert(result.penalty < 50, 'production payment locks should not use ppUnplayable');
  assert(
    result.reasons.some((reason) => reason.includes('Не сейчас: plants prod 0→-1 −')),
    'production payment soft-lock reason should show its visible penalty',
  );
  assert(!result.reasons.includes('Нельзя сыграть!'), 'production payment locks should not be labelled permanently impossible');
}

function testComputeReqPriorityShowsPenaltyOnEveryProductionPaymentLock() {
  const result = playPriority.computeReqPriority({
    cardEl: makeRequirementCardEl('Electro Catapult', ''),
    pv: {
      game: {
        oxygenLevel: 6,
        temperature: -16,
        oceans: 4,
        venusScaleLevel: 0,
      },
    },
    ctx: {
      gen: 5,
      gensLeft: 4,
      prod: {energy: 0, steel: 0},
    },
    getProductionFloorStatus() {
      return {
        unplayable: true,
        reasons: [
          'Невозможно сыграть: energy prod 0→-1',
          'Невозможно сыграть: steel prod 0→-1',
        ],
      };
    },
    evaluateBoardRequirements() {
      return {metNow: true, reqs: [], unmet: []};
    },
    detectMyCorps() {
      return [];
    },
    getRequirementFlexSteps() {
      return {any: 0, venus: 0};
    },
    getBoardRequirementDisplayName(_, amount) {
      return amount === 1 ? 'requirement' : 'requirements';
    },
    sc: {
      ppReqGapCap: 20,
      ppReqGapMul: 3,
      ppTagReqCap: 18,
      ppTagReqMul: 4,
      ppUnplayable: 50,
    },
  });

  assert.strictEqual(result.hardBlocked, false, 'multi production payment lock should stay temporary');
  assert.strictEqual(result.penalty, 10, 'two temporary production locks should use one combined soft penalty');
  assert(result.reasons.includes('Не сейчас: energy prod 0→-1 −10'));
  assert(result.reasons.includes('Не сейчас: steel prod 0→-1 −10'));
  assert(!result.reasons.some((reason) => reason.includes('Невозможно сыграть')));
  assert(!result.reasons.includes('Нельзя сыграть!'));
}

function testAdjustForResearchUsesLaterLabelForOneTagSoftRequirement() {
  const result = {
    total: 67,
    uncappedTotal: 67,
    reasons: ['Нужно 1 Earth сейчас -4'],
  };

  playPriority.adjustForResearch({
    result,
    el: makeCardEl('Conscription'),
    myHand: [],
    ctx: {mc: 20, gensLeft: 4},
    getCardCost() {
      return 5;
    },
    getPlayerVueData() {
      return {
        game: {players: []},
        thisPlayer: {megaCredits: 20},
      };
    },
    tmBrain: null,
    cardEffects: null,
  });

  assert(result.total >= 65, 'soft one-tag requirements should not take the full hard-block draft penalty');
  assert(result.reasons.includes('Позже (req)'), 'soft one-tag requirements should be marked as later, not skip');
  assert(!result.reasons.includes('Skip'), 'soft one-tag requirements should not be marked as skip');
}

function testSeptemPoliticalShellDoesNotJumpTo75() {
  const ratingsRaw = {
    'Septem Tribus': {
      s: 66,
      t: 'C',
      y: ['Corridors of Power', 'Rise To Power', 'Cultural Metropolis', 'Banned Delegate'],
    },
    'Corridors of Power': {s: 74, t: 'B'},
    'Rise To Power': {s: 66, t: 'C'},
    'Cultural Metropolis': {s: 73, t: 'B'},
    'Banned Delegate': {s: 70, t: 'B'},
    'Colonial Representation': {s: 72, t: 'B'},
  };
  const visibleCardEls = [
    'Septem Tribus',
    'Corridors of Power',
    'Rise To Power',
    'Cultural Metropolis',
    'Banned Delegate',
    'Colonial Representation',
  ].map(makeCardEl);

  const result = playPriority.scoreCorpByVisibleCards({
    corpName: 'Septem Tribus',
    visibleCardEls,
    ctx: {globalParams: {}},
    ratingsRaw,
    baseCardName(name) {
      return name;
    },
    getVisiblePreludeNames() {
      return ['Corridors of Power', 'Rise To Power'];
    },
    knownCorps: new Set(['Septem Tribus']),
    resolveCorpName(name) {
      return name;
    },
    getCachedCardTags() {
      return new Set();
    },
    getCardCost() {
      return 0;
    },
    isSpliceOpeningPlacer() {
      return false;
    },
    getCorpBoost(corpName, opts) {
      return corpName === 'Septem Tribus' && opts.cardName === 'Colonial Representation' ? 2 : 0;
    },
    getInitialDraftRatingScore(name, fallback) {
      return ratingsRaw[name] && typeof ratingsRaw[name].s === 'number' ? ratingsRaw[name].s : fallback;
    },
    getInitialDraftInfluence(score, minWeight, maxWeight) {
      const clamped = Math.max(45, Math.min(85, score));
      return minWeight + (maxWeight - minWeight) * ((clamped - 45) / 40);
    },
    ruName(name) {
      return name;
    },
    getVisibleColonyNames() {
      return [];
    },
    getPlayerVueData() {
      return {game: {players: [{}, {}, {}], gameOptions: {solarPhaseOption: true}}};
    },
  });

  assert.strictEqual(result.total, 71, 'Septem political support should raise the score modestly, not to 75+');
}

function testAridorInitialDraftReasonLabelsAreActionable() {
  const projectNames = ['Project A', 'Project B', 'Project C', 'Project D', 'Project E'];
  const ratingsRaw = {
    'Aridor': {
      s: 61,
      t: 'C',
      y: projectNames,
    },
    'Applied Science': {s: 70, t: 'B'},
    'Ecology Experts': {s: 55, t: 'C'},
  };
  for (const name of projectNames) ratingsRaw[name] = {s: 65, t: 'C'};
  const visibleCardEls = ['Aridor', ...projectNames, 'Applied Science', 'Ecology Experts'].map(makeCardEl);

  const result = playPriority.scoreCorpByVisibleCards({
    corpName: 'Aridor',
    visibleCardEls,
    ctx: {tags: {}, globalParams: {}},
    ratingsRaw,
    baseCardName(name) {
      return name;
    },
    getVisiblePreludeNames() {
      return ['Applied Science', 'Ecology Experts'];
    },
    knownCorps: new Set(['Aridor']),
    resolveCorpName(name) {
      return name;
    },
    getCachedCardTags(el) {
      const name = el.getAttribute('data-tm-card');
      if (name === 'Applied Science') return new Set(['wild']);
      if (name === 'Ecology Experts') return new Set(['plant', 'microbe']);
      return new Set();
    },
    getCardCost() {
      return 0;
    },
    isSpliceOpeningPlacer() {
      return false;
    },
    getCorpBoost(corpName, opts) {
      if (corpName !== 'Aridor') return 0;
      return opts.cardName === 'Applied Science' || opts.cardName === 'Ecology Experts' ? 3 : 0;
    },
    getInitialDraftRatingScore(name, fallback) {
      return ratingsRaw[name] && typeof ratingsRaw[name].s === 'number' ? ratingsRaw[name].s : fallback;
    },
    getInitialDraftInfluence(score, minWeight, maxWeight) {
      const clamped = Math.max(45, Math.min(85, score));
      return minWeight + (maxWeight - minWeight) * ((clamped - 45) / 40);
    },
    ruName(name) {
      return {
        'Applied Science': 'Научный подход',
        'Ecology Experts': 'Эксперты-экологи',
      }[name] || name;
    },
    getVisibleColonyNames() {
      return [];
    },
    getPlayerVueData() {
      return {game: {players: [{}, {}, {}], gameOptions: {solarPhaseOption: true}}};
    },
  });

  assert(result.reasons.includes('5 карт под корпу +7'), 'project-card context should not be labelled as draft cards');
  assert(result.reasons.includes('лучшая прел. Научный подход +2'), 'prelude reason should keep the full short card label');
  assert(!result.reasons.some((reason) => reason.includes('к драфту')), 'corp context reasons should not use the old draft-card label');
  assert(!result.reasons.some((reason) => reason.includes('прел.') && reason.endsWith('+0')), 'rounded zero prelude context should be hidden');
}

function scoreAnubisByVisibleCards(projectNames) {
  const ratingsRaw = {
    'Anubis Securities': {
      s: 81,
      t: 'A',
      y: ['Big Asteroid', 'Kelp Farming', 'Strip Mine'],
    },
    'Topsoil Contract': {s: 70, t: 'B'},
    'Cloud Seeding': {s: 64, t: 'C'},
    'Kelp Farming': {s: 87, t: 'A'},
  };
  const visibleCardEls = ['Anubis Securities', ...projectNames].map(makeCardEl);
  return playPriority.scoreCorpByVisibleCards({
    corpName: 'Anubis Securities',
    visibleCardEls,
    ctx: {gen: 1, gensLeft: 9, tags: {}, globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0}},
    ratingsRaw,
    baseCardName(name) {
      return name;
    },
    getVisiblePreludeNames() {
      return [];
    },
    knownCorps: new Set(['Anubis Securities']),
    resolveCorpName(name) {
      return name;
    },
    getCachedCardTags() {
      return new Set();
    },
    getCardCost() {
      return 0;
    },
    isSpliceOpeningPlacer() {
      return false;
    },
    getCorpBoost() {
      return 0;
    },
    getInitialDraftRatingScore(name, fallback) {
      return ratingsRaw[name] && typeof ratingsRaw[name].s === 'number' ? ratingsRaw[name].s : fallback;
    },
    getInitialDraftInfluence(score, minWeight, maxWeight) {
      const clamped = Math.max(45, Math.min(85, score));
      return minWeight + (maxWeight - minWeight) * ((clamped - 45) / 40);
    },
    ruName(name) {
      return name;
    },
    getVisibleColonyNames() {
      return [];
    },
    getPlayerVueData() {
      return {game: {players: [{}, {}, {}], gameOptions: {solarPhaseOption: true}}};
    },
    cardEffects: {
      'Topsoil Contract': {c: 8, pl: 3},
      'Cloud Seeding': {c: 11, pp: 2, mp: -1, pOpp: 1},
      'Kelp Farming': {c: 17, mp: 2, pp: 3, pl: 2, vp: 1},
    },
    cardGlobalReqs: {
      'Cloud Seeding': {oceans: {min: 3}},
      'Kelp Farming': {oceans: {min: 6}},
    },
    cardTagReqs: {},
  });
}

function testAnubisSecuritiesUsesGlobalRequirementRouteValidity() {
  const weakRoute = scoreAnubisByVisibleCards(['Topsoil Contract', 'Cloud Seeding']);
  assert(weakRoute.reasons.includes('Anubis weak target Cloud Seeding -18'), 'Anubis should downgrade weak global-req targets instead of trusting the A prior');
  assert(weakRoute.total <= 70, 'Anubis without a strong global-req payoff should not stay A-tier');

  const strongRoute = scoreAnubisByVisibleCards(['Topsoil Contract', 'Kelp Farming']);
  assert(strongRoute.reasons.some((reason) => reason.includes('Anubis target Kelp Farming')), 'Anubis should credit a real global-req payoff target');
  assert(strongRoute.total >= 85, 'Anubis with Kelp Farming should remain a strong corp candidate');
}

function testAnubisUsesCorpRouteValidatorRegistry() {
  assert(
    routeSource.includes('var CORP_ROUTE_VALIDATORS = ['),
    'corp-specific route checks should live in a CORP_ROUTE_VALIDATORS registry',
  );
  assert(
    routeSource.includes('function scoreCorpRouteValidators(input)'),
    'corp scoring should have a shared scoreCorpRouteValidators entry point',
  );
  assert(
    source.includes('routeValidators.scoreCorpRouteValidators({'),
    'scoreCorpByVisibleCards should apply route validators through the shared registry',
  );
}

function testRouteValidatorsLiveInDedicatedModule() {
  assert(routeSource, 'route validators should live in src/content-route-validators.js');
  assert(
    routeSource.includes('TM_CONTENT_ROUTE_VALIDATORS'),
    'route validator module should expose TM_CONTENT_ROUTE_VALIDATORS',
  );
  assert(routeValidators, 'TM_CONTENT_ROUTE_VALIDATORS should be loaded before content-play-priority');
  assert(
    source.includes('TM_CONTENT_ROUTE_VALIDATORS'),
    'content-play-priority should consume the shared route validator module',
  );
  assert(
    !source.includes('var DRAFT_ROUTE_VALIDATORS = ['),
    'draft route validators should not stay embedded in content-play-priority',
  );
  assert(
    !source.includes('var CORP_ROUTE_VALIDATORS = ['),
    'corp route validators should not stay embedded in content-play-priority',
  );
}

function testRoboticWorkforceUsesProductionCopyRouteValidity() {
  const input = baseDraftInput();
  input.cardName = 'Robotic Workforce';
  input.myHand = ['Robotic Workforce', 'Mining Area'];
  input.ctx = Object.assign({}, input.ctx, {
    _openingHand: true,
    gen: 1,
    gensLeft: 9,
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    tags: {},
  });
  input.ratings = {
    'Robotic Workforce': {s: 74, e: "12 MC total for duplicating a building card's production box", t: 'B'},
    'Mining Area': {s: 78, e: 'Cheap 1 steel production.', t: 'A'},
    'Mohole Area': {s: 75, e: '4 heat production.', t: 'B'},
  };
  input.cardEffects = {
    'Robotic Workforce': {c: 9},
    'Mining Area': {c: 4, sp: 1},
    'Mohole Area': {c: 20, hp: 4},
  };
  input.cardTagsData = {
    'Robotic Workforce': ['science'],
    'Mining Area': ['building'],
    'Mohole Area': ['building'],
  };
  input.cardGlobalReqs = {};
  input.cardTagReqs = {};
  input.getCachedCardTags = function getCachedCardTags(el) {
    return new Set((input.cardTagsData[el.getAttribute('data-tm-card')] || []));
  };
  input.scoreComboPotential = function scoreComboPotential() {
    return {adj: 7, reasons: ['Magnificent copy combo +7']};
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 6, reasons: ['generic copy synergy +6']};
  };

  const weakTarget = playPriority.scoreDraftCard(input);
  assert(weakTarget.reasons.includes('Copy weak target Mining Area -14'), 'weak copy targets should dominate generic hand-copy bonuses');
  assert(!weakTarget.reasons.includes('Magnificent copy combo +7'), 'copy-provider combo synergy should not double-count the route validator');
  assert(!weakTarget.reasons.includes('generic copy synergy +6'), 'copy-provider hand synergy should not double-count the route validator');
  assert(weakTarget.total <= 70, 'Robotic Workforce should not stay high with only a weak copy target');

  const strongTarget = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Robotic Workforce', 'Mohole Area'],
    scoreComboPotential() {
      return {adj: 0, reasons: []};
    },
    scoreHandSynergy() {
      return {adj: 0, reasons: []};
    },
  }));
  assert(strongTarget.reasons.some((reason) => reason.includes('Copy target Mohole Area')), 'strong copy targets should be credited explicitly');
  assert(strongTarget.total >= 76, 'Robotic Workforce with a real copy target should remain a good route');

  const strongTargetWithGenericHandSynergy = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Robotic Workforce', 'Mohole Area'],
  }));
  assert(
    strongTargetWithGenericHandSynergy.reasons.some((reason) => reason.includes('Copy target Mohole Area')),
    'route validator should still own the positive copy-target reason',
  );
  assert(
    !strongTargetWithGenericHandSynergy.reasons.includes('Magnificent copy combo +7'),
    'static copy combo synergy should be suppressed once the route validator scores the same route',
  );
  assert(
    !strongTargetWithGenericHandSynergy.reasons.includes('generic copy synergy +6'),
    'generic copy hand synergy should be suppressed once the route validator scores the same route',
  );
  assert(
    strongTargetWithGenericHandSynergy.total <= 78,
    'Robotic Workforce should not receive both route-validity credit and generic copy hand synergy',
  );
}

function testCardAgainstCorpDoesNotDedupeOnFirstWordOnly() {
  const result = playPriority.scoreCardAgainstCorps({
    name: 'Earth Office',
    el: makeCardEl('Earth Office'),
    myTableau: [],
    myHand: [],
    offeredCorps: ['Point Luna'],
    myCorp: '',
    ctx: {},
    scoreDraftCard(cardName, myTableau, myHand, corpName) {
      if (corpName === 'Point Luna') {
        return {total: 62, uncappedTotal: 62, reasons: ['Point scoring context +2']};
      }
      return {total: 50, uncappedTotal: 50, reasons: []};
    },
    withForcedCorpContext(ctx) {
      return ctx;
    },
    getInitialDraftRatingScore() {
      return 80;
    },
    getInitialDraftInfluence() {
      return 1;
    },
  });

  assert(result.reasons.includes('лучше с Point Luna'), 'corp-context dedupe should require the full corp label, not just the first word');
}

function testEcologyExpertsNeedsRealGlobalRequirementTarget() {
  const input = baseDraftInput();
  input.cardName = 'Ecology Experts';
  input.myHand = ['Ecology Experts', 'Topsoil Contract', 'Microbe A', 'Microbe B'];
  input.ctx = Object.assign({}, input.ctx, {
    _openingHand: true,
    gen: 1,
    gensLeft: 9,
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    tags: {science: 0},
  });
  input.ratings = {
    'Ecology Experts': {s: 70, e: 'Increase your plant production 1 step. Play a card from hand, ignoring global requirements.', t: 'B'},
    'Topsoil Contract': {s: 70, e: 'Gain 3 plants.', t: 'B'},
    'Microbe A': {s: 55, e: '', t: 'C'},
    'Microbe B': {s: 55, e: '', t: 'C'},
    'Kelp Farming': {s: 87, e: '', t: 'A'},
    'Mangrove': {s: 84, e: 'Place a greenery on an ocean reserved area.', t: 'A'},
    'Cloud Seeding': {s: 64, e: 'Decrease your M€ production 1 step. Increase your plant production 2 steps.', t: 'C'},
  };
  input.cardEffects = {
    'Ecology Experts': {c: 0, pp: 1},
    'Topsoil Contract': {c: 8, pl: 3},
    'Kelp Farming': {c: 17, mp: 2, pp: 3, pl: 2, vp: 1},
    'Mangrove': {c: 12, grn: 1, vp: 1},
    'Cloud Seeding': {c: 11, pp: 2, mp: -1, pOpp: 1},
  };
  input.cardGlobalReqs = {
    'Kelp Farming': {oceans: {min: 6}},
    'Mangrove': {temperature: {min: 4}},
    'Cloud Seeding': {oceans: {min: 3}},
  };
  input.getCachedCardTags = function getCachedCardTags(el) {
    const name = el.getAttribute('data-tm-card');
    if (name === 'Ecology Experts') return new Set(['plant', 'microbe']);
    if (name === 'Topsoil Contract') return new Set(['earth', 'microbe']);
    return new Set();
  };
  input.isPreludeOrCorpCard = function isPreludeOrCorpCard() {
    return true;
  };

  const noTarget = playPriority.scoreDraftCard(input);
  assert(noTarget.reasons.includes('Ecology no target -24'), 'Ecology Experts should explicitly penalize missing cheat target');
  assert(noTarget.total <= 62, 'Ecology Experts should not jump toward A-tier without a real global-req target');

  const withKelp = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Ecology Experts', 'Topsoil Contract', 'Kelp Farming'],
  }));
  assert(withKelp.reasons.some((reason) => reason.includes('Ecology target Kelp Farming')), 'strong global-req targets should be credited explicitly');
  assert(withKelp.total > noTarget.total + 12, 'Kelp Farming should materially change Ecology Experts from weak shell to strong payoff');

  const withMangrove = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Ecology Experts', 'Topsoil Contract', 'Mangrove'],
  }));
  assert(withMangrove.reasons.includes('Ecology weak target Mangrove -18'), 'Mangrove should not count as a strong Ecology Experts payoff');
  assert(withMangrove.total < withKelp.total - 12, 'Mangrove should be far below the Kelp Farming Ecology Experts shell');

  const withWeakGenericBonuses = playPriority.scoreDraftCard(Object.assign({}, input, {
    myCorp: 'EcoTec',
    myHand: ['Ecology Experts', 'Topsoil Contract', 'Cloud Seeding', 'Microbe A', 'Microbe B'],
    scoreComboPotential() {
      return {adj: 7, reasons: ['Ecology cheat combo +7']};
    },
    scoreHandSynergy() {
      return {adj: 13, reasons: ['Hand generic +13']};
    },
    scoreOpeningDraftPolicy() {
      return {adj: 2, reasons: ['Opening setup +2 (~3 MC)']};
    },
    getCorpBoost(corpName, opts) {
      return corpName === 'EcoTec' && opts.cardName === 'Ecology Experts' ? 2 : 0;
    },
  }));
  assert(withWeakGenericBonuses.reasons.includes('Ecology weak target Cloud Seeding -18'), 'Cloud Seeding should be a major weak-target penalty, not a small -4');
  assert(!withWeakGenericBonuses.reasons.includes('Ecology cheat combo +7'), 'Ecology combo synergy should not double-count the route validator');
  assert(withWeakGenericBonuses.total <= 70, 'weak Ecology target should dominate generic hand/setup/corp micro-synergies');
}

function testValuableGasesNeedsActiveFloaterTarget() {
  const input = baseDraftInput();
  input.cardName = 'Valuable Gases';
  input.myHand = ['Valuable Gases', 'Topsoil Contract'];
  input.ctx = Object.assign({}, input.ctx, {
    _openingHand: true,
    gen: 1,
    gensLeft: 9,
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    tags: {},
  });
  input.ratings = {
    'Valuable Gases': {s: 76, e: 'Gain 6 M€. Play an active floater card ignoring requirements and add 5 floaters to it.', t: 'B'},
    'Topsoil Contract': {s: 70, e: 'Gain 3 plants.', t: 'B'},
    'Local Shading': {s: 58, e: 'Add floaters and gain M€.', t: 'C'},
    'Floating Habs': {s: 80, e: 'Floater VP sink.', t: 'A'},
  };
  input.cardEffects = {
    'Valuable Gases': {c: 0, mc: 6},
    'Topsoil Contract': {c: 8, pl: 3},
    'Local Shading': {c: 4, res: 'floater', tg: 'venus'},
    'Floating Habs': {c: 5, res: 'floater', vpAcc: 1, vpPer: 2},
  };
  input.cardTagsData = {
    'Valuable Gases': ['jovian', 'venus'],
    'Topsoil Contract': ['earth', 'microbe'],
    'Local Shading': ['venus'],
    'Floating Habs': ['venus'],
  };
  input.isPreludeOrCorpCard = function isPreludeOrCorpCard() {
    return true;
  };

  const noTarget = playPriority.scoreDraftCard(input);
  assert(noTarget.reasons.includes('Valuable Gases no floater target -16'), 'Valuable Gases should be penalized when the free floater play has no target');
  assert(noTarget.total <= 64, 'Valuable Gases should not stay B-tier without an active floater target');

  const weakTarget = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Valuable Gases', 'Local Shading'],
  }));
  assert(weakTarget.reasons.includes('Valuable Gases weak floater target Local Shading -10'), 'a low-impact floater card should be treated as a weak Valuable Gases target');
  assert(weakTarget.total < 70, 'weak floater targets should not make Valuable Gases a strong opener');

  const strongTarget = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Valuable Gases', 'Floating Habs'],
  }));
  assert(strongTarget.reasons.some((reason) => reason.includes('Valuable Gases floater target Floating Habs')), 'real floater VP sinks should be credited as Valuable Gases targets');
  assert(strongTarget.total > noTarget.total + 16, 'a real floater target should materially change Valuable Gases from weak shell to strong route');
}

function testRogersNeedsVenusRoute() {
  const input = baseDraftInput();
  input.cardName = 'Rogers';
  input.myHand = ['Rogers', 'Topsoil Contract'];
  input.ctx = Object.assign({}, input.ctx, {
    _openingHand: true,
    gen: 1,
    gensLeft: 9,
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    tags: {science: 0},
  });
  input.ratings = {
    'Rogers': {s: 66, e: 'Ignore global requirements for Venus cards and discount Venus tags.', t: 'C'},
    'Topsoil Contract': {s: 70, e: 'Gain 3 plants.', t: 'B'},
    'Hydrogen to Venus': {s: 61, e: 'Raise Venus 1 step.', t: 'C'},
    'Venusian Animals': {s: 88, e: 'When you play a science tag, add 1 animal to this card.', t: 'A'},
  };
  input.cardEffects = {
    'Rogers': {c: 0},
    'Topsoil Contract': {c: 8, pl: 3},
    'Hydrogen to Venus': {c: 11, vn: 1},
    'Venusian Animals': {c: 15, vpAcc: 1, res: 'animal', triggerOnlyVpAcc: true},
  };
  input.cardTagsData = {
    'Rogers': [],
    'Topsoil Contract': ['earth', 'microbe'],
    'Hydrogen to Venus': ['venus'],
    'Venusian Animals': ['venus', 'animal', 'science'],
  };
  input.cardGlobalReqs = {
    'Venusian Animals': {venus: {min: 18}},
  };
  input.cardTagReqs = {};
  input.isPreludeOrCorpCard = function isPreludeOrCorpCard() {
    return true;
  };

  const noTarget = playPriority.scoreDraftCard(input);
  assert(noTarget.reasons.includes('Rogers no Venus route -12'), 'Rogers should be penalized when the visible hand has no Venus cards');
  assert(noTarget.total <= 58, 'Rogers should not stay near B-tier without Venus cards to discount or unlock');

  const weakTarget = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Rogers', 'Hydrogen to Venus'],
  }));
  assert(weakTarget.reasons.includes('Rogers weak Venus route Hydrogen to Venus -4'), 'a plain Venus tag should not be treated as a strong Rogers route');
  assert(weakTarget.total < 66, 'weak Venus filler should not erase the Rogers route penalty completely');

  const strongTarget = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Rogers', 'Venusian Animals', 'Hydrogen to Venus'],
  }));
  assert(strongTarget.reasons.some((reason) => reason.includes('Rogers Venus route Venusian Animals')), 'Rogers should explicitly credit a high-impact Venus requirement target');
  assert(strongTarget.total > noTarget.total + 14, 'a real Venus payoff should materially change Rogers from weak shell to playable route');
}

function testTagGatedPayoffNeedsPlayedTagsNotHandTags() {
  const input = baseDraftInput();
  input.cardName = 'Luna Governor';
  input.myHand = [
    'Luna Governor',
    'Earth Office',
    'Cartel',
    'Luna Metropolis',
    'Earth Catapult',
    'Space Hotels',
  ];
  input.ctx = Object.assign({}, input.ctx, {
    _openingHand: true,
    gen: 1,
    gensLeft: 9,
    tags: {earth: 0},
    _handTagCounts: {earth: 5},
    tagsWithHand: {earth: 5},
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
  });
  input.ratings = {
    'Luna Governor': {s: 71, e: 'Requires 3 Earth tags. Increase your M€ production 2 steps.', t: 'B'},
    'Earth Office': {s: 90, e: 'Earth discount.', t: 'S'},
    'Cartel': {s: 78, e: 'Increase your M€ production 1 step for each Earth tag.', t: 'B'},
    'Luna Metropolis': {s: 71, e: 'Earth tag city payoff.', t: 'B'},
    'Earth Catapult': {s: 97, e: 'Discount engine.', t: 'S'},
    'Space Hotels': {s: 72, e: 'Earth tag economy.', t: 'B'},
  };
  input.cardEffects = {
    'Luna Governor': {c: 4, mp: 2},
    'Earth Office': {c: 1},
    'Cartel': {c: 8, mp: 2},
    'Luna Metropolis': {c: 21, mp: 2, vp: 2},
    'Earth Catapult': {c: 23, vp: 2},
    'Space Hotels': {c: 12, mp: 4},
  };
  input.cardTagsData = {
    'Luna Governor': ['earth', 'earth'],
    'Earth Office': ['earth'],
    'Cartel': ['earth', 'building'],
    'Luna Metropolis': ['earth', 'city', 'building'],
    'Earth Catapult': ['earth'],
    'Space Hotels': ['earth', 'building'],
  };
  input.cardTagReqs = {
    'Luna Governor': {earth: 3},
  };
  input.getCachedCardTags = function getCachedCardTags(el) {
    return new Set((input.cardTagsData[el.getAttribute('data-tm-card')] || []));
  };
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {adj: -6, reasons: ['Нужно 3 Earth на стол (рука +5) -6']};
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 5, reasons: ['рука earth ×5']};
  };
  input.scoreOpeningDraftPolicy = function scoreOpeningDraftPolicy() {
    return {adj: 2, reasons: ['Opening setup +2 (~3 MC)']};
  };

  const gatedShell = playPriority.scoreDraftCard(input);
  assert(
    gatedShell.reasons.includes('Tag gate Earth: need 3 on table (hand +5) -12'),
    'tag-gated payoffs should explain that hand tags are only a route, not played tags',
  );
  assert(
    !gatedShell.reasons.includes('рука earth ×5'),
    'tag-gated payoffs should not also receive generic hand-tag mass synergy',
  );
  assert(
    gatedShell.reasons.includes('Tag route Earth support +2'),
    'cheap playable tag enablers should get a small explicit route support reason',
  );
  assert(
    gatedShell.total <= 62,
    'Luna Governor should not stay B-tier when all Earth requirements are still unplayed hand cards',
  );

  const expensiveRoute = playPriority.scoreDraftCard(Object.assign({}, input, {
    myHand: ['Luna Governor', 'Luna Metropolis', 'Earth Catapult'],
    ctx: Object.assign({}, input.ctx, {
      _handTagCounts: {earth: 2},
      tagsWithHand: {earth: 2},
    }),
  }));
  assert(
    !expensiveRoute.reasons.some((reason) => reason.indexOf('Tag route Earth support') >= 0),
    'expensive tag cards should not be treated as cheap route support',
  );

  const readyShell = playPriority.scoreDraftCard(Object.assign({}, input, {
    ctx: Object.assign({}, input.ctx, {
      tags: {earth: 3},
      _handTagCounts: {earth: 2},
      tagsWithHand: {earth: 5},
    }),
    scoreCardRequirements() {
      return {adj: 0, reasons: []};
    },
  }));
  assert(
    !readyShell.reasons.some((reason) => reason.indexOf('Tag gate Earth') >= 0),
    'tag-gate penalty should disappear once the required tags are actually on the table',
  );
  assert(
    readyShell.total > gatedShell.total + 10,
    'played tags should materially change the payoff route score',
  );
}

function testTagGateIgnoresEventTagsAsPersistentRouteSupport() {
  const input = baseDraftInput();
  input.cardName = 'Venus Governor';
  input.myHand = ['Venus Governor', 'Unexpected Application', 'Forced Precipitation'];
  input.ctx = Object.assign({}, input.ctx, {
    gen: 2,
    gensLeft: 8,
    tags: {venus: 1},
    _handTagCounts: {venus: 2},
    _persistentHandTagCounts: {venus: 1},
    tagsWithHand: {venus: 3},
    tagsWithPersistentHand: {venus: 2},
    globalParams: {temp: -28, oxy: 0, oceans: 0, venus: 0},
  });
  input.ratings = {
    'Venus Governor': {s: 74, e: 'Requires 2 Venus tags. Increase your M€ production 2 steps.', t: 'B'},
    'Unexpected Application': {s: 65, e: 'Raise Venus 1 step.', t: 'C'},
    'Forced Precipitation': {s: 62, e: 'Raise Venus 1 step.', t: 'C'},
  };
  input.cardEffects = {
    'Venus Governor': {c: 4, mp: 2},
    'Unexpected Application': {c: 4, vn: 1},
    'Forced Precipitation': {c: 6, vn: 1},
  };
  input.cardTagsData = {
    'Venus Governor': ['venus', 'venus'],
    'Unexpected Application': ['event', 'venus'],
    'Forced Precipitation': ['venus'],
  };
  input.cardTagReqs = {
    'Venus Governor': {venus: 2},
  };
  input.getCachedCardTags = function getCachedCardTags(el) {
    return new Set((input.cardTagsData[el.getAttribute('data-tm-card')] || []));
  };

  const eventFilteredShell = playPriority.scoreDraftCard(input);
  assert(
    eventFilteredShell.reasons.includes('Tag gate Venus: need 2 on table (hand +1) -6'),
    'tag-gated Venus payoffs should count only persistent hand Venus tags as on-table route support',
  );
  assert(
    !eventFilteredShell.reasons.includes('Tag gate Venus: need 2 on table (hand +2) -6'),
    'event Venus tags should not inflate the on-table Venus route support count',
  );
  assert(
    eventFilteredShell.reasons.includes('Tag route Venus support +1'),
    'only the persistent cheap Venus card should count as playable route support',
  );
  assert(
    !eventFilteredShell.reasons.includes('Tag route Venus support +2'),
    'event Venus cards should not count as cheap route cards for persistent tag gates',
  );
}

function testTagGateHonorsXavierRequirementWilds() {
  const input = baseDraftInput();
  input.cardName = 'Fusion Power';
  input.myHand = ['Fusion Power', 'Energy Market', 'Physics Complex'];
  input.ctx = Object.assign({}, input.ctx, {
    gen: 1,
    gensLeft: 9,
    tags: {power: 0},
    tableauNames: new Set(['Xavier']),
    _handTagCounts: {power: 2},
    tagsWithHand: {power: 2},
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
  });
  input.ratings = {
    'Fusion Power': {s: 58, e: 'Requires 2 Power tags. Increase your energy production 3 steps.', t: 'C'},
    'Energy Market': {s: 70, e: 'Power tag support.', t: 'B'},
    'Physics Complex': {s: 62, e: 'Power tag VP action.', t: 'C'},
  };
  input.cardEffects = {
    'Fusion Power': {c: 14, ep: 3},
    'Energy Market': {c: 3},
    'Physics Complex': {c: 12, vpAcc: 1},
  };
  input.cardTagsData = {
    'Fusion Power': ['power'],
    'Energy Market': ['power'],
    'Physics Complex': ['power', 'science'],
  };
  input.cardTagReqs = {
    'Fusion Power': {power: 2},
  };
  input.getCachedCardTags = function getCachedCardTags(el) {
    return new Set((input.cardTagsData[el.getAttribute('data-tm-card')] || []));
  };
  input.scoreCardRequirements = function scoreCardRequirements() {
    return {adj: 3, reasons: ['Xavier wild req +3']};
  };
  input.scoreHandSynergy = function scoreHandSynergy() {
    return {adj: 2, reasons: ['рука power ×2']};
  };

  const xavierShell = playPriority.scoreDraftCard(input);
  assert(
    !xavierShell.reasons.some((reason) => reason.indexOf('Tag gate Power') >= 0),
    'active Xavier should cover Fusion Power tag requirements instead of leaving a route-gate penalty',
  );
  assert(
    xavierShell.reasons.includes('Xavier wild req +3'),
    'the Xavier requirement reason should remain visible after route validation',
  );
  assert(
    xavierShell.reasons.includes('рука power ×2'),
    'generic hand-tag synergy should not be suppressed when there is no route-gate penalty',
  );
}

function baseStandardActionInput(overrides = {}) {
  const tp = Object.assign({
    color: 'red',
    heat: 0,
    plants: 0,
    megaCredits: 20,
    victoryPointsBreakdown: {total: 60},
    terraformRating: 30,
  }, overrides.tp || {});
  const pv = Object.assign({
    thisPlayer: tp,
    game: {
      oxygenLevel: 13,
      temperature: -12,
      oceans: 7,
      players: [
        tp,
        {color: 'blue', victoryPointsBreakdown: {total: 105}, terraformRating: 45},
      ],
      milestones: [],
      awards: [],
      colonies: [],
    },
  }, overrides.pv || {});
  if (!pv.thisPlayer) pv.thisPlayer = tp;
  const ctx = Object.assign({
    gensLeft: 1,
    tradesLeft: 0,
    globalParams: {oxy: 13, temp: -12, oceans: 7, venus: 24},
  }, overrides.ctx || {});
  const sc = Object.assign({
    plantsPerGreenery: 8,
    heatPerTR: 8,
    oxyMax: 14,
    tempMax: 8,
    tempStep: 2,
    oceansMax: 9,
  }, overrides.sc || {});
  return {
    tp,
    pv,
    ctx,
    saturation: overrides.saturation || {oxy: false, temp: false},
    sc,
    detectMyCorps: overrides.detectMyCorps || function detectMyCorps() { return []; },
    brain: overrides.brain || null,
    fundedAwardsCache: overrides.fundedAwardsCache || null,
  };
}

function testStandardGreeneryPenalizesClosingOxygenForLeaderWhenFarBehind() {
  const result = playPriority.scoreStandardActions(baseStandardActionInput({
    tp: {
      plants: 8,
      victoryPointsBreakdown: {total: 60},
      terraformRating: 30,
    },
    pv: {
      game: {
        oxygenLevel: 13,
        temperature: -12,
        oceans: 7,
        players: [
          {color: 'red', victoryPointsBreakdown: {total: 60}, terraformRating: 30},
          {color: 'blue', victoryPointsBreakdown: {total: 108}, terraformRating: 46},
        ],
        milestones: [],
        awards: [],
        colonies: [],
      },
    },
  }));
  const greenery = result.find((item) => item.name.includes('Озеленение'));
  assert(greenery, 'greenery conversion should still be visible when plants are ready');
  assert(
    greenery.priority <= 12,
    'trailing player should not receive normal greenery priority when it closes the last oxygen step for the leader',
  );
  assert(
    greenery.reasons.some((reason) => reason.includes('Не закрывай O2 лидеру')),
    'greenery endgame guard should explain the leader-finish risk',
  );
}

function testStandardAwardsGetEndgameTimingBoostWhenLeadIsBankable() {
  const tp = {
    color: 'red',
    heat: 0,
    plants: 0,
    megaCredits: 40,
    victoryPointsBreakdown: {total: 112},
    terraformRating: 50,
  };
  const result = playPriority.scoreStandardActions(baseStandardActionInput({
    tp,
    pv: {
      thisPlayer: tp,
      game: {
        oxygenLevel: 13,
        temperature: -8,
        oceans: 8,
        players: [
          tp,
          {color: 'blue', victoryPointsBreakdown: {total: 100}, terraformRating: 45},
        ],
        milestones: [],
        awards: [
          {
            name: 'Visionary',
            scores: [
              {color: 'red', score: 24},
              {color: 'blue', score: 17},
            ],
          },
        ],
        colonies: [],
      },
    },
    ctx: {
      gensLeft: 1,
      tradesLeft: 0,
      globalParams: {oxy: 13, temp: -8, oceans: 8, venus: 24},
    },
  }));
  const award = result.find((item) => item.name.includes('Visionary'));
  assert(award, 'bankable award should be suggested');
  assert(
    award.priority >= 45,
    'near-endgame award with a clear lead should be promoted above routine standard actions',
  );
  assert(
    award.reasons.some((reason) => reason.includes('Финиш awards')),
    'award timing boost should be explicit in reasons',
  );
}

function baseProjectPriorityInput(overrides = {}) {
  const handCards = overrides.handCards || ['Small Comet'];
  const cardEls = new Map(handCards.map((name) => [name, makeCardEl(name)]));
  const tp = Object.assign({
    color: 'red',
    megaCredits: 40,
    victoryPointsBreakdown: {total: 60},
    terraformRating: 30,
  }, overrides.tp || {});
  const pv = Object.assign({
    thisPlayer: tp,
    game: {
      oxygenLevel: 13,
      temperature: -12,
      oceans: 7,
      venusScaleLevel: 24,
      players: [
        tp,
        {color: 'blue', victoryPointsBreakdown: {total: 110}, terraformRating: 48},
      ],
    },
  }, overrides.pv || {});
  const ctx = Object.assign({
    gensLeft: 1,
    tradesLeft: 0,
    globalParams: {oxy: 13, temp: -12, oceans: 7, venus: 24},
  }, overrides.ctx || {});
  const ratings = Object.assign({
    'Small Comet': {s: 48, t: 'D', e: 'Raise the oxygen 1 step. Raise the temperature 1 step. Place an ocean tile.'},
  }, overrides.ratings || {});
  const cardEffects = Object.assign({
    'Small Comet': {c: 32, o2: 1, tmp: 1, oc: 1},
  }, overrides.cardEffects || {});
  const sc = Object.assign({
    ppBase: 35,
    ppProdMul: 2,
    ppActionMul: 2,
    ppDiscountMul: 2,
    ppTrBoost: 5,
    ppEnablesMul: 4,
    ppNeedsMul: 2,
    ppVpMul: 2,
    ppAffordCap: 15,
    ppAffordDiv: 4,
    tempMax: 8,
    tempStep: 2,
    oxyMax: 14,
    oceansMax: 9,
    venusMax: 30,
  }, overrides.sc || {});
  return {
    getMyHandNames() {
      return handCards;
    },
    detectGeneration() {},
    getPlayerVueData() {
      return pv;
    },
    estimateGensLeft() {
      return ctx.gensLeft;
    },
    getCachedPlayerContext() {
      return ctx;
    },
    getMyTableauNames() {
      return [];
    },
    documentObj: {
      querySelectorAll() {
        return Array.from(cardEls.values());
      },
    },
    selHand: '.card',
    ratings,
    cardTagsData: overrides.cardTagsData || {'Small Comet': ['event', 'space']},
    lookupCardData(data, name) {
      return data[name];
    },
    detectCardTypeForScoring() {
      return 'red';
    },
    cardEffects,
    computeCardValue() {
      return 0;
    },
    cardDiscounts: {},
    getCardCost(el) {
      return cardEffects[el.getAttribute('data-tm-card')].c;
    },
    sc,
    computeReqPriority() {
      return {penalty: 0, reasons: [], unplayable: false};
    },
    scorePlayPriorityMA() {
      return {bonus: 0, reasons: []};
    },
    scoreBlueActions() {
      return [];
    },
    scoreStandardActions() {
      return [];
    },
    yName(name) {
      return name;
    },
  };
}

function testProjectGlobalCardPenalizesClosingOxygenForLeaderWhenFarBehind() {
  const result = playPriority.computePlayPriorities(baseProjectPriorityInput());
  const card = result.find((item) => item.name === 'Small Comet');
  assert(card, 'project card should be scored');
  assert(
    card.priority <= 21,
    'global project card should be deprioritized when it closes the last oxygen step for the leader',
  );
  assert(
    card.reasons.some((reason) => reason.includes('Не закрывай O2 лидеру')),
    'project global guard should explain the leader-finish risk',
  );
}

function testPlayPriorityPromotesMiningExpeditionAtOxygenBonusWindow() {
  const result = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['Mining Expedition'],
    pv: {
      game: {
        oxygenLevel: 7,
        temperature: -10,
        oceans: 4,
        venusScaleLevel: 12,
        players: [
          {color: 'red', victoryPointsBreakdown: {total: 62}, terraformRating: 30},
          {color: 'blue', victoryPointsBreakdown: {total: 65}, terraformRating: 32},
        ],
      },
    },
    ctx: {
      gensLeft: 3,
      steelVal: 2,
      globalParams: {oxy: 7, temp: -10, oceans: 4, venus: 12},
    },
    ratings: {
      'Mining Expedition': {s: 46, t: 'D', e: 'Raise oxygen 1 step. Remove 2 plants from any player. Gain 2 steel.'},
    },
    cardEffects: {
      'Mining Expedition': {c: 12, o2: 1, steel: 2},
    },
    cardTagsData: {
      'Mining Expedition': ['event'],
    },
  }));
  const card = result.find((item) => item.name === 'Mining Expedition');
  assert(card, 'Mining Expedition should be scored');
  assert(
    card.priority >= 45,
    'Mining Expedition should become a visible play option at the 8% O2 bonus window',
  );
  assert(
    card.reasons.some((reason) => reason.includes('Mining Expedition: 8% O2 bonus')),
    'Mining Expedition play priority should explain the O2 bonus timing',
  );
}

function testPlayPriorityOrdersAdvancedAlloysBeforeAiCentral() {
  const result = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['AI Central', 'Advanced Alloys', 'Solar Probe'],
    tp: {
      megaCredits: 74,
      steel: 8,
      titanium: 3,
      victoryPointsBreakdown: {total: 70},
      terraformRating: 35,
    },
    ctx: {
      gensLeft: 3,
      globalParams: {oxy: 4, temp: -8, oceans: 2, venus: 10},
    },
    ratings: {
      'AI Central': {s: 88, t: 'A', e: 'Action: Draw 2 cards. 1 VP.'},
      'Advanced Alloys': {s: 86, t: 'A', e: 'Each titanium and steel is worth 1 M€ extra.'},
      'Solar Probe': {s: 58, t: 'C', e: 'Space event.'},
    },
    cardEffects: {
      'AI Central': {c: 21, ep: -1, actCD: 2, vp: 1},
      'Advanced Alloys': {c: 9},
      'Solar Probe': {c: 9},
    },
    cardTagsData: {
      'AI Central': ['building', 'science'],
      'Advanced Alloys': ['science'],
      'Solar Probe': ['event', 'science', 'space'],
    },
  }));
  const alloys = result.find((item) => item.name === 'Advanced Alloys');
  const ai = result.find((item) => item.name === 'AI Central');

  assert(alloys && ai, 'both Advanced Alloys and AI Central should be scored');
  assert(
    result.indexOf(alloys) < result.indexOf(ai),
    'Advanced Alloys should be ordered before AI Central when steel value changes the payment',
  );
  assert(
    alloys.reasons.some((reason) => reason.includes('Сначала перед steel/ti spend')),
    'Advanced Alloys setup ordering reason should be visible',
  );
  assert(
    ai.reasons.some((reason) => reason.includes('После Advanced Alloys')),
    'AI Central should explain that it waits for Advanced Alloys',
  );
}

function testPlayPriorityUsesLowercaseLiveMegacredits() {
  const result = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['AI Central', 'Advanced Alloys', 'Solar Probe'],
    tp: {
      megaCredits: undefined,
      megacredits: 74,
      steel: 8,
      titanium: 3,
      victoryPointsBreakdown: {total: 70},
      terraformRating: 35,
    },
    ctx: {
      gensLeft: 3,
      globalParams: {oxy: 4, temp: -8, oceans: 2, venus: 10},
    },
    ratings: {
      'AI Central': {s: 88, t: 'A', e: 'Action: Draw 2 cards. 1 VP.'},
      'Advanced Alloys': {s: 86, t: 'A', e: 'Each titanium and steel is worth 1 M€ extra.'},
      'Solar Probe': {s: 58, t: 'C', e: 'Space event.'},
    },
    cardEffects: {
      'AI Central': {c: 21, ep: -1, actCD: 2, vp: 1},
      'Advanced Alloys': {c: 9},
      'Solar Probe': {c: 9},
    },
    cardTagsData: {
      'AI Central': ['building', 'science'],
      'Advanced Alloys': ['science'],
      'Solar Probe': ['event', 'science', 'space'],
    },
  }));
  const alloys = result.find((item) => item.name === 'Advanced Alloys');
  const ai = result.find((item) => item.name === 'AI Central');

  assert(alloys && ai, 'live lowercase megacredits case should score both cards');
  assert(
    !alloys.reasons.some((reason) => reason.includes('Дорого')),
    'Advanced Alloys should not be marked expensive when live data uses megacredits',
  );
  assert(
    !ai.reasons.some((reason) => reason.includes('Дорого')),
    'AI Central should not be marked expensive when live data uses megacredits',
  );
  assert(
    result.indexOf(alloys) < result.indexOf(ai),
    'Advanced Alloys should still be ordered before AI Central in the live field-name case',
  );
}

function testPlayPriorityKeepsOptimalAerobrakingUntilSpaceEventTrigger() {
  const result = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['Optimal Aerobraking', 'AI Central', 'Solar Probe'],
    tp: {
      megaCredits: 74,
      steel: 0,
      titanium: 3,
      victoryPointsBreakdown: {total: 70},
      terraformRating: 35,
    },
    ctx: {
      gensLeft: 3,
      globalParams: {oxy: 4, temp: -8, oceans: 2, venus: 10},
    },
    ratings: {
      'Optimal Aerobraking': {s: 84, t: 'A', e: 'When you play a space event, you gain 3 M€ and 3 heat.'},
      'AI Central': {s: 88, t: 'A', e: 'Action: Draw 2 cards. 1 VP.'},
      'Solar Probe': {s: 58, t: 'C', e: 'Space event.'},
    },
    cardEffects: {
      'Optimal Aerobraking': {c: 7},
      'AI Central': {c: 21, ep: -1, actCD: 2, vp: 1},
      'Solar Probe': {c: 9},
    },
    cardTagsData: {
      'Optimal Aerobraking': ['space'],
      'AI Central': ['building', 'science'],
      'Solar Probe': ['event', 'science', 'space'],
    },
  }));
  const opt = result.find((item) => item.name === 'Optimal Aerobraking');
  const ai = result.find((item) => item.name === 'AI Central');

  assert(opt && ai, 'both Optimal Aerobraking and AI Central should be scored');
  assert(
    result.indexOf(ai) < result.indexOf(opt),
    'Optimal Aerobraking should not outrank an actual play before the space-event trigger window',
  );
  assert(
    opt.reasons.some((reason) => reason.includes('OptAero: играть перед space event')),
    'Optimal Aerobraking trigger timing reason should be visible',
  );
}

function testPlayPriorityPromotesMediaGroupBeforeKnownEvent() {
  const withEvent = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['Media Group', 'Big Asteroid', 'Ganymede Colony'],
    tp: {
      megaCredits: 16,
      victoryPointsBreakdown: {total: 76},
      terraformRating: 43,
    },
    ctx: {
      gensLeft: 1,
      globalParams: {oxy: 13, temp: 2, oceans: 8, venus: 30},
    },
    ratings: {
      'Media Group': {s: 62, t: 'C', e: 'When you play an event, you gain 3 M€.'},
      'Big Asteroid': {s: 70, t: 'B', e: 'Raise temperature.'},
      'Ganymede Colony': {s: 80, t: 'A', e: 'City on Ganymede.'},
    },
    cardEffects: {
      'Media Group': {c: 6},
      'Big Asteroid': {c: 27, tmp: 2},
      'Ganymede Colony': {c: 20, vp: 2},
    },
    cardTagsData: {
      'Media Group': ['earth'],
      'Big Asteroid': ['event', 'space'],
      'Ganymede Colony': ['space', 'city', 'jovian'],
    },
  }));
  const noEvent = playPriority.computePlayPriorities(baseProjectPriorityInput({
    handCards: ['Media Group', 'AI Central', 'Ganymede Colony'],
    tp: {
      megaCredits: 16,
      victoryPointsBreakdown: {total: 76},
      terraformRating: 43,
    },
    ctx: {
      gensLeft: 1,
      globalParams: {oxy: 13, temp: 2, oceans: 8, venus: 30},
    },
    ratings: {
      'Media Group': {s: 62, t: 'C', e: 'When you play an event, you gain 3 M€.'},
      'AI Central': {s: 88, t: 'A', e: 'Action: Draw 2 cards. 1 VP.'},
      'Ganymede Colony': {s: 80, t: 'A', e: 'City on Ganymede.'},
    },
    cardEffects: {
      'Media Group': {c: 6},
      'AI Central': {c: 21, ep: -1, actCD: 2, vp: 1},
      'Ganymede Colony': {c: 20, vp: 2},
    },
    cardTagsData: {
      'Media Group': ['earth'],
      'AI Central': ['building', 'science'],
      'Ganymede Colony': ['space', 'city', 'jovian'],
    },
  }));
  const mediaWithEvent = withEvent.find((item) => item.name === 'Media Group');
  const mediaNoEvent = noEvent.find((item) => item.name === 'Media Group');

  assert(mediaWithEvent && mediaNoEvent, 'Media Group should be scored in both contexts');
  assert(
    mediaWithEvent.reasons.some((reason) => reason.includes('Media Group: перед event')),
    'Media Group setup timing reason should be visible',
  );
  assert(
    mediaWithEvent.priority > mediaNoEvent.priority + 14,
    'Media Group should be much more urgent immediately before known event cards',
  );
}

function testBlueOceanActionPenalizesClosingOceansForLeaderWhenFarBehind() {
  const result = playPriority.scoreBlueActions({
    tableauCards: ['Water Import From Europa'],
    pv: {
      thisPlayer: {
        color: 'red',
        titanium: 4,
        victoryPointsBreakdown: {total: 62},
        terraformRating: 30,
      },
      game: {
        oxygenLevel: 13,
        temperature: -8,
        oceans: 8,
        players: [
          {color: 'red', victoryPointsBreakdown: {total: 62}, terraformRating: 30},
          {color: 'blue', victoryPointsBreakdown: {total: 112}, terraformRating: 50},
        ],
      },
    },
    ctx: {gensLeft: 1, globalParams: {oxy: 13, temp: -8, oceans: 8, venus: 24}},
    sc: {tempMax: 8, tempStep: 2, oxyMax: 14, oceansMax: 9},
    paramMaxed: {oceans: false},
    ratings: {
      'Water Import From Europa': {s: 60, t: 'B', e: 'Action: pay 12 M€ to place an ocean tile.'},
    },
    getFx() {
      return {actOc: 1};
    },
  });
  const action = result.find((item) => item.name.includes('Water Import From Europa'));
  assert(action, 'blue ocean action should be scored');
  assert(
    action.priority <= 52,
    'blue ocean action should be deprioritized when it closes oceans for the leader',
  );
  assert(
    action.reasons.some((reason) => reason.includes('Не закрывай океаны лидеру')),
    'blue action global guard should explain the leader-finish risk',
  );
}

function testVenusActionDoesNotGetFinishPenaltyWhenVenusCompletionIsOptional() {
  const result = playPriority.scoreBlueActions({
    tableauCards: ['Venus Pump'],
    pv: {
      thisPlayer: {
        color: 'red',
        titanium: 0,
        victoryPointsBreakdown: {total: 62},
        terraformRating: 30,
      },
      game: {
        oxygenLevel: 5,
        temperature: -20,
        oceans: 2,
        venusScaleLevel: 28,
        gameOptions: {requiresVenusTrackCompletion: false},
        players: [
          {color: 'red', victoryPointsBreakdown: {total: 62}, terraformRating: 30},
          {color: 'blue', victoryPointsBreakdown: {total: 112}, terraformRating: 50},
        ],
      },
    },
    ctx: {gensLeft: 5, globalParams: {oxy: 5, temp: -20, oceans: 2, venus: 28}},
    sc: {tempMax: 8, tempStep: 2, oxyMax: 14, oceansMax: 9, venusMax: 30},
    paramMaxed: {venus: false},
    ratings: {
      'Venus Pump': {s: 60, t: 'B', e: 'Action: raise Venus 1 step.'},
    },
    getFx() {
      return {actVN: 1};
    },
  });
  const action = result.find((item) => item.name.includes('Venus Pump'));
  assert(action, 'blue Venus action should be scored');
  assert(
    !action.reasons.some((reason) => reason.includes('Не закрывай Venus')),
    'optional Venus track should not be treated as a finish-assist risk',
  );
}

testAdjustForResearchTreatsStepRequirementAsHardBlock();
testAdjustForResearchSkipsDenyOnlyInsectsBuy();
testScoreDraftCardMarksSpecificReqAsPenaltyForPositionalFactors();
testScoreDraftCardDropsGenericFarFallbackWhenSpecificReasonExists();
testScoreDraftCardDropsBareCorpReasonWhenSpecificCorpReasonExists();
testScoreDraftCardIncludesVisibleCeoInSynergyContext();
testScoreDraftCardRoundsStandardProjectComparisonReason();
testOptimalAerobrakingPenalizesHighTemperature();
testOptimalAerobrakingWaitsForSpaceEventTriggerWindow();
testScoreDraftCardSuppressesClaimedMilestoneProximity();
testDirectedImpactorsPenalizesLateFastTemperatureWindow();
testDirigiblesLateEngineCapOverridesGenericSynergy();
testMineLateProductionCapOverridesGenericSynergy();
testMiningRightsLateProductionCapOverridesGenericSynergy();
testMiningExpeditionGetsOnlyTimingRebateBoosts();
testAiCentralFullHandLateCapOverridesGenericSynergy();
testDevelopmentCenterLateNoEnergyCapOverridesGenericSynergy();
testImmigrantCityContextKeepsGenericOpenerLowAndBoostsSupportedLate();
testInsectsLateWithoutPlayedPlantShellDoesNotJumpToA();
testScoreDraftCardKeepsProductionPaymentLockSoft();
testComputeReqPriorityShowsProductionPaymentSoftPenalty();
testComputeReqPriorityShowsPenaltyOnEveryProductionPaymentLock();
testAdjustForResearchUsesLaterLabelForOneTagSoftRequirement();
testSeptemPoliticalShellDoesNotJumpTo75();
testAridorInitialDraftReasonLabelsAreActionable();
testAnubisSecuritiesUsesGlobalRequirementRouteValidity();
testAnubisUsesCorpRouteValidatorRegistry();
testRouteValidatorsLiveInDedicatedModule();
testRoboticWorkforceUsesProductionCopyRouteValidity();
testCardAgainstCorpDoesNotDedupeOnFirstWordOnly();
testEcologyExpertsNeedsRealGlobalRequirementTarget();
testValuableGasesNeedsActiveFloaterTarget();
testRogersNeedsVenusRoute();
testTagGatedPayoffNeedsPlayedTagsNotHandTags();
testTagGateIgnoresEventTagsAsPersistentRouteSupport();
testTagGateHonorsXavierRequirementWilds();
testStandardGreeneryPenalizesClosingOxygenForLeaderWhenFarBehind();
testStandardAwardsGetEndgameTimingBoostWhenLeadIsBankable();
testProjectGlobalCardPenalizesClosingOxygenForLeaderWhenFarBehind();
testPlayPriorityPromotesMiningExpeditionAtOxygenBonusWindow();
testPlayPriorityOrdersAdvancedAlloysBeforeAiCentral();
testPlayPriorityUsesLowercaseLiveMegacredits();
testPlayPriorityKeepsOptimalAerobrakingUntilSpaceEventTrigger();
testPlayPriorityPromotesMediaGroupBeforeKnownEvent();
testBlueOceanActionPenalizesClosingOceansForLeaderWhenFarBehind();
testVenusActionDoesNotGetFinishPenaltyWhenVenusCompletionIsOptional();

console.log('content-play-priority reason checks: OK');
