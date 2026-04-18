#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content-play-priority.js');
delete global.TM_CONTENT_PLAY_PRIORITY;
require(sourcePath);

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

testAdjustForResearchTreatsStepRequirementAsHardBlock();
testScoreDraftCardMarksSpecificReqAsPenaltyForPositionalFactors();
testScoreDraftCardDropsGenericFarFallbackWhenSpecificReasonExists();
testScoreDraftCardDropsBareCorpReasonWhenSpecificCorpReasonExists();
testAdjustForResearchUsesLaterLabelForOneTagSoftRequirement();

console.log('content-play-priority reason checks: OK');
