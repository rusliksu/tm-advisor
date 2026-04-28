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

testAdjustForResearchTreatsStepRequirementAsHardBlock();
testScoreDraftCardMarksSpecificReqAsPenaltyForPositionalFactors();
testScoreDraftCardDropsGenericFarFallbackWhenSpecificReasonExists();
testScoreDraftCardDropsBareCorpReasonWhenSpecificCorpReasonExists();
testScoreDraftCardIncludesVisibleCeoInSynergyContext();
testAdjustForResearchUsesLaterLabelForOneTagSoftRequirement();
testSeptemPoliticalShellDoesNotJumpTo75();
testAridorInitialDraftReasonLabelsAreActionable();
testCardAgainstCorpDoesNotDedupeOnFirstWordOnly();

console.log('content-play-priority reason checks: OK');
