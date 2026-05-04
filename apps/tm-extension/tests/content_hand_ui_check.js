#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_HAND_UI;
require(path.resolve(__dirname, '..', 'src', 'content-hand-ui.js'));

const handUi = global.TM_CONTENT_HAND_UI;
const HAND_SEL = '.player_home_block--hand .card-container[data-tm-card]';

assert(handUi, 'TM_CONTENT_HAND_UI should be loaded');
assert.strictEqual(typeof handUi.injectHandPriorityBadges, 'function', 'injectHandPriorityBadges should be exported');
assert.strictEqual(typeof handUi.clearHandPriorityBadges, 'function', 'clearHandPriorityBadges should be exported');

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
    this.title = '';
    this.classList = {
      add: (cls) => {
        const parts = new Set(String(this.className).split(/\s+/).filter(Boolean));
        parts.add(cls);
        this.className = Array.from(parts).join(' ');
      },
      remove: (...classes) => {
        const removeSet = new Set(classes);
        this.className = String(this.className)
          .split(/\s+/)
          .filter((part) => part && !removeSet.has(part))
          .join(' ');
      },
      contains: (cls) => String(this.className).split(/\s+/).filter(Boolean).includes(cls),
    };
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
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
    const hasClass = (el, cls) => String(el.className).split(/\s+/).filter(Boolean).includes(cls);
    const matches = (el) => {
      if (selector === '.card-number') return hasClass(el, 'card-number');
      if (selector === '.tm-hand-priority-badge') return hasClass(el, 'tm-hand-priority-badge');
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
    this.hand = new FakeElement('div');
    this.hand.className = 'player_home_block--hand';
    this.body.appendChild(this.hand);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  querySelectorAll(selector) {
    if (selector === HAND_SEL) {
      return this.hand.children.filter((el) => el.getAttribute('data-tm-card'));
    }
    return this.body.querySelectorAll(selector);
  }
}

function makeCard(doc, name, cost) {
  const card = doc.createElement('div');
  card.className = 'card-container';
  card.setAttribute('data-tm-card', name);
  const costEl = doc.createElement('div');
  costEl.className = 'card-number';
  costEl.textContent = String(cost);
  card.appendChild(costEl);
  doc.hand.appendChild(card);
  return card;
}

function getCost(el) {
  const costEl = el.querySelector('.card-number');
  return costEl ? Number(costEl.textContent) : 0;
}

function testInjectsTopHandCardBadges() {
  const doc = new FakeDocument();
  const kelp = makeCard(doc, 'Kelp Farming', 17);
  const sponsors = makeCard(doc, 'Sponsors', 6);
  const cloud = makeCard(doc, 'Cloud Seeding', 11);
  const algae = makeCard(doc, 'Arctic Algae', 12);
  let callCount = 0;

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 5}, thisPlayer: {megaCredits: 20}}),
    getCardCost: getCost,
    getCardTags: () => new Set(['plant']),
    advisor: {
      rankHandCards(cards, state) {
        callCount++;
        assert.deepStrictEqual(cards.map((card) => card.name), ['Kelp Farming', 'Sponsors', 'Cloud Seeding', 'Arctic Algae']);
        assert.strictEqual(cards[0].calculatedCost, 17);
        assert.strictEqual(state.game.generation, 5);
        return [
          {name: 'Kelp Farming', score: 84.4, reason: 'ocean window'},
          {name: 'Sponsors', score: 61.2, reason: 'early economy'},
          {name: 'Cloud Seeding', score: 42.9, reason: 'plant prod'},
          {name: 'Arctic Algae', score: 20},
        ];
      },
    },
  });

  assert.strictEqual(callCount, 1, 'rankHandCards should be called once');
  assert(kelp.classList.contains('tm-hand-priority-card-1'), 'best card should get rank-1 class');
  assert(sponsors.classList.contains('tm-hand-priority-card-2'), 'second card should get rank-2 class');
  assert(cloud.classList.contains('tm-hand-priority-card-3'), 'third card should get rank-3 class');
  assert(!algae.classList.contains('tm-hand-priority-card'), 'fourth card should not get a badge');

  assert.strictEqual(kelp.getAttribute('data-tm-hand-priority'), '1');
  assert.strictEqual(kelp.getAttribute('data-tm-hand-priority-score'), '84');
  assert.strictEqual(kelp.querySelector('.tm-hand-priority-badge').textContent, '#1');
  assert(kelp.querySelector('.tm-hand-priority-badge').title.includes('ocean window'));
}

function testDeferredLatePayoffDoesNotLookLikePlayNow() {
  const doc = new FakeDocument();
  const ganymede = makeCard(doc, 'Terraforming Ganymede', 33);
  const sponsors = makeCard(doc, 'Sponsors', 6);
  const cloud = makeCard(doc, 'Cloud Seeding', 11);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 4}, thisPlayer: {megaCredits: 50}}),
    getCachedPlayerContext: () => ({gensLeft: 5}),
    getCardCost: getCost,
    getCardTags: () => new Set(['jovian']),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Terraforming Ganymede', score: 90, reason: 'VP'},
          {name: 'Sponsors', score: 50, reason: 'Prod'},
          {name: 'Cloud Seeding', score: 40, reason: 'Plant'},
        ];
      },
    },
  });

  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1', 'current economy play should outrank deferred payoff');
  assert.strictEqual(sponsors.querySelector('.tm-hand-priority-badge').textContent, '#1');
  assert.strictEqual(ganymede.getAttribute('data-tm-hand-priority-kind'), 'late', 'Ganymede should be marked as late');
  assert.strictEqual(ganymede.querySelector('.tm-hand-priority-badge').textContent, 'late');
  assert(ganymede.querySelector('.tm-hand-priority-badge').title.includes('late Jovian TR cashout'));
  assert(ganymede.querySelector('.tm-hand-priority-badge').title.includes('still in hand'));
  assert.strictEqual(ganymede.getAttribute('data-tm-hand-priority'), null, 'late marker should not consume a play-now rank');
  assert.strictEqual(cloud.getAttribute('data-tm-hand-priority'), '2', 'next playable card should get play-now rank 2');
}

function testGreenhousesDoesNotLookLikePlayNowBeforeCashout() {
  const doc = new FakeDocument();
  const greenhouses = makeCard(doc, 'Greenhouses', 6);
  const sponsors = makeCard(doc, 'Sponsors', 6);
  const cloud = makeCard(doc, 'Cloud Seeding', 11);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({
      game: {generation: 5, players: [{citiesCount: 1}, {citiesCount: 1}, {citiesCount: 1}]},
      thisPlayer: {megaCredits: 30, plants: 0},
    }),
    getCachedPlayerContext: () => ({gensLeft: 4}),
    getCardCost: getCost,
    getCardTags: () => new Set(['plant', 'building']),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Greenhouses', score: 85, reason: 'city plants'},
          {name: 'Sponsors', score: 55, reason: 'Prod'},
          {name: 'Cloud Seeding', score: 45, reason: 'Plant'},
        ];
      },
    },
  });

  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1', 'current economy play should outrank deferred Greenhouses');
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority-kind'), 'late');
  assert.strictEqual(greenhouses.querySelector('.tm-hand-priority-badge').textContent, 'late');
  assert(greenhouses.querySelector('.tm-hand-priority-badge').title.includes('late plant cashout'));
  assert(greenhouses.querySelector('.tm-hand-priority-badge').title.includes('3 cities now'));
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority'), null, 'deferred Greenhouses should not consume a play-now rank');
  assert.strictEqual(cloud.getAttribute('data-tm-hand-priority'), '2');
}

function testGreenhousesStillDefersAtTwoGensWithoutGreenery() {
  const doc = new FakeDocument();
  const greenhouses = makeCard(doc, 'Greenhouses', 6);
  const sponsors = makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({
      game: {
        generation: 7,
        players: [{citiesCount: 1}, {citiesCount: 1}, {citiesCount: 1}, {citiesCount: 1}],
        spaces: [
          {tileType: 0},
          {tileType: 0},
          {tileType: 0},
          {tileType: 0},
        ],
      },
      thisPlayer: {megaCredits: 30, plants: 0},
    }),
    getCachedPlayerContext: () => ({gensLeft: 2}),
    getCardCost: getCost,
    getCardTags: () => new Set(['plant', 'building']),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Greenhouses', score: 85, reason: 'city plants'},
          {name: 'Sponsors', score: 55, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1', 'current play should outrank two-gen deferred Greenhouses');
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority-kind'), 'late');
  assert.strictEqual(greenhouses.querySelector('.tm-hand-priority-badge').textContent, 'late');
  assert(greenhouses.querySelector('.tm-hand-priority-badge').title.includes('4 cities now, 0->4 plants'));
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority'), null);
}

function testLiveRuslanGreenhousesDoesNotKeepTopRank() {
  const doc = new FakeDocument();
  const ganymede = makeCard(doc, 'Terraforming Ganymede', 31);
  const aiCentral = makeCard(doc, 'AI Central', 21);
  const alloys = makeCard(doc, 'Advanced Alloys', 9);
  const greenhouses = makeCard(doc, 'Greenhouses', 6);
  const aerobraking = makeCard(doc, 'Optimal Aerobraking', 7);
  makeCard(doc, 'Solar Probe', 9);
  const tagMap = {
    'Terraforming Ganymede': ['space', 'jovian'],
    'AI Central': ['science', 'building'],
    'Advanced Alloys': ['science'],
    Greenhouses: ['plant'],
    'Optimal Aerobraking': ['space'],
    'Solar Probe': ['event', 'science', 'space'],
  };

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({
      game: {
        generation: 7,
        temperature: -8,
        oxygenLevel: 4,
        oceans: 2,
        venusScaleLevel: 10,
      },
      players: [
        {citiesCount: 2},
        {citiesCount: 1},
        {citiesCount: 1},
        {citiesCount: 1},
      ],
      thisPlayer: {
        megaCredits: 67,
        steel: 8,
        steelValue: 2,
        titanium: 3,
        titaniumValue: 3,
        plants: 0,
      },
    }),
    getCachedPlayerContext: () => ({gensLeft: 3, tags: {science: 3, jovian: 5}}),
    getCardCost: getCost,
    getCardTags: (el) => new Set(tagMap[el.getAttribute('data-tm-card')] || []),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Terraforming Ganymede', score: 47, reason: 'base'},
          {name: 'AI Central', score: 43, reason: 'Engine'},
          {name: 'Advanced Alloys', score: 43, reason: 'base'},
          {name: 'Greenhouses', score: 42, reason: 'city plants'},
          {name: 'Optimal Aerobraking', score: 40, reason: 'Engine'},
          {name: 'Solar Probe', score: 26, reason: 'space event'},
        ];
      },
    },
  });

  assert.strictEqual(alloys.getAttribute('data-tm-hand-priority'), '1', 'Advanced Alloys should be played before steel/titanium spend targets');
  assert.strictEqual(aiCentral.getAttribute('data-tm-hand-priority'), '2', 'AI Central should wait until after Advanced Alloys improves steel value');
  assert(alloys.querySelector('.tm-hand-priority-badge').title.includes('play before steel/titanium spend'));
  assert(aiCentral.querySelector('.tm-hand-priority-badge').title.includes('after Advanced Alloys'));
  assert.strictEqual(ganymede.getAttribute('data-tm-hand-priority'), null, 'Ganymede should stay a late cashout before the final window');
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority'), null, 'deferred Greenhouses must not keep a live #1 rank');
  assert(!greenhouses.classList.contains('tm-hand-priority-card-1'), 'Greenhouses should not have rank-1 class in the live gen-7 cashout shape');
  assert.strictEqual(aerobraking.getAttribute('data-tm-hand-priority'), null, 'Optimal Aerobraking should wait until a real space-event trigger window');
}

function testGreenhousesCanRankWhenItCreatesGreeneryNow() {
  const doc = new FakeDocument();
  const greenhouses = makeCard(doc, 'Greenhouses', 6);
  makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({
      game: {generation: 5, players: [{citiesCount: 1}, {citiesCount: 1}, {citiesCount: 1}]},
      thisPlayer: {megaCredits: 30, plants: 5},
    }),
    getCachedPlayerContext: () => ({gensLeft: 4}),
    getCardCost: getCost,
    getCardTags: () => new Set(['plant', 'building']),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Greenhouses', score: 85, reason: 'city plants'},
          {name: 'Sponsors', score: 55, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority'), '1', 'Greenhouses can be play-now when it creates a greenery');
  assert.strictEqual(greenhouses.getAttribute('data-tm-hand-priority-kind'), 'play');
  assert.strictEqual(greenhouses.querySelector('.tm-hand-priority-badge').textContent, '#1');
}

function testLatePayoffCanRankInLateGame() {
  const doc = new FakeDocument();
  const ganymede = makeCard(doc, 'Terraforming Ganymede', 33);
  makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 9}, thisPlayer: {megaCredits: 50}}),
    getCachedPlayerContext: () => ({gensLeft: 1}),
    getCardCost: getCost,
    advisor: {
      rankHandCards() {
        return [
          {name: 'Terraforming Ganymede', score: 90, reason: 'VP'},
          {name: 'Sponsors', score: 50, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(ganymede.getAttribute('data-tm-hand-priority'), '1', 'late payoff can become play priority near game end');
  assert.strictEqual(ganymede.getAttribute('data-tm-hand-priority-kind'), 'play');
  assert.strictEqual(ganymede.querySelector('.tm-hand-priority-badge').textContent, '#1');
}

function testInstantScalingCashoutCanBeDeferredByClass() {
  const doc = new FakeDocument();
  const social = makeCard(doc, 'Social Events', 18);
  const marsCard = makeCard(doc, 'Martian Monuments', 10);
  const sponsors = makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 3}, thisPlayer: {megaCredits: 40}}),
    getCachedPlayerContext: () => ({gensLeft: 6}),
    getCardCost: getCost,
    getCardTags: (el) => {
      const name = el.getAttribute('data-tm-card');
      if (name === 'Social Events') return new Set(['earth', 'event', 'mars']);
      if (name === 'Martian Monuments') return new Set(['mars']);
      return new Set([]);
    },
    advisor: {
      rankHandCards() {
        return [
          {name: 'Social Events', score: 78, reason: 'TR cashout'},
          {name: 'Sponsors', score: 52, reason: 'Prod'},
          {name: 'Martian Monuments', score: 45, reason: 'Mars tag'},
        ];
      },
    },
  });

  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1');
  assert.strictEqual(social.getAttribute('data-tm-hand-priority-kind'), 'late');
  assert.strictEqual(social.querySelector('.tm-hand-priority-badge').textContent, 'late');
  assert(social.querySelector('.tm-hand-priority-badge').title.includes('late Mars-tag TR cashout'));
  assert.strictEqual(marsCard.getAttribute('data-tm-hand-priority'), '2');
  assert.strictEqual(social.getAttribute('data-tm-hand-priority'), null);
}

function testUnplayableHighValueCardGetsHoldNotPlayRank() {
  const doc = new FakeDocument();
  const kelp = makeCard(doc, 'Kelp Farming', 17);
  const sponsors = makeCard(doc, 'Sponsors', 6);
  kelp.classList.add('tm-unplayable');
  sponsors.classList.add('tm-playable');

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 5}, thisPlayer: {megaCredits: 20}}),
    getCardCost: getCost,
    getCardTags: () => new Set([]),
    advisor: {
      rankHandCards() {
        return [
          {name: 'Kelp Farming', score: 88, reason: 'VP'},
          {name: 'Sponsors', score: 60, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(kelp.getAttribute('data-tm-hand-priority'), null, 'unplayable value card should not get a play rank');
  assert.strictEqual(kelp.getAttribute('data-tm-hand-priority-kind'), 'hold');
  assert.strictEqual(kelp.querySelector('.tm-hand-priority-badge').textContent, 'hold');
  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1');
  assert.strictEqual(sponsors.querySelector('.tm-hand-priority-badge').textContent, '#1');
}

function testUnmetGlobalRequirementDoesNotGetPlayRank() {
  const doc = new FakeDocument();
  const birds = makeCard(doc, 'Birds', 10);
  const sponsors = makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 5, oxygenLevel: 7}, thisPlayer: {megaCredits: 30}}),
    getCardCost: getCost,
    getCardTags: () => new Set(['animal']),
    cardGlobalReqs: {Birds: {oxygen: {min: 13}}},
    advisor: {
      rankHandCards() {
        return [
          {name: 'Birds', score: 66, reason: 'VP'},
          {name: 'Sponsors', score: 60, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(birds.getAttribute('data-tm-hand-priority'), null, 'unmet O2 requirement should block play rank');
  assert.strictEqual(birds.getAttribute('data-tm-hand-priority-kind'), 'hold');
  assert.strictEqual(birds.querySelector('.tm-hand-priority-badge').textContent, 'hold');
  assert.strictEqual(birds.getAttribute('data-tm-hand-priority-lock'), 'Req locked: O2 7/13');
  assert(birds.querySelector('.tm-hand-priority-badge').title.includes('Req locked: O2 7/13'));
  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1');
}

function testUnmetTagRequirementDoesNotGetPlayRank() {
  const doc = new FakeDocument();
  const warp = makeCard(doc, 'Warp Drive', 14);
  const sponsors = makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 5}, thisPlayer: {megaCredits: 30}}),
    getCachedPlayerContext: () => ({tags: {science: 2}}),
    getCardCost: getCost,
    getCardTags: (el) => el.getAttribute('data-tm-card') === 'Warp Drive' ? new Set(['science']) : new Set([]),
    cardTagReqs: {'Warp Drive': {science: 5}},
    advisor: {
      rankHandCards() {
        return [
          {name: 'Warp Drive', score: 75, reason: 'Engine'},
          {name: 'Sponsors', score: 60, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(warp.getAttribute('data-tm-hand-priority'), null, 'unmet science requirement should block play rank');
  assert.strictEqual(warp.getAttribute('data-tm-hand-priority-kind'), 'engine');
  assert.strictEqual(warp.querySelector('.tm-hand-priority-badge').textContent, 'eng');
  assert.strictEqual(warp.getAttribute('data-tm-hand-priority-lock'), 'Req locked: science tags 2/5');
  assert(warp.querySelector('.tm-hand-priority-badge').title.includes('Req locked: science tags 2/5'));
  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1');
}

function testProductionFloorLockUsesTemporaryNotNowLabel() {
  const doc = new FakeDocument();
  const livestock = makeCard(doc, 'Livestock', 13);
  const sponsors = makeCard(doc, 'Sponsors', 6);

  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {generation: 5}, thisPlayer: {megaCredits: 30}}),
    getCachedPlayerContext: () => ({gensLeft: 4, prod: {plants: 0}}),
    getCardCost: getCost,
    getCardTags: () => new Set(['animal']),
    getProductionFloorStatus(name) {
      if (name !== 'Livestock') return {unplayable: false, reasons: []};
      return {unplayable: true, reasons: ['Невозможно сыграть: plants prod 0→-1']};
    },
    advisor: {
      rankHandCards() {
        return [
          {name: 'Livestock', score: 63, reason: 'Не сейчас: plants prod 0→-1 −10'},
          {name: 'Sponsors', score: 60, reason: 'Prod'},
        ];
      },
    },
  });

  assert.strictEqual(livestock.getAttribute('data-tm-hand-priority'), null, 'temporary production lock should not get a play-now rank');
  assert.strictEqual(livestock.getAttribute('data-tm-hand-priority-lock'), 'Не сейчас: plants prod 0→-1');
  assert(!livestock.querySelector('.tm-hand-priority-badge').title.includes('Req locked: plants prod'));
  assert(livestock.querySelector('.tm-hand-priority-badge').title.includes('Не сейчас: plants prod 0→-1'));
  assert.strictEqual(sponsors.getAttribute('data-tm-hand-priority'), '1');
}

function testHighlightPlayableUsesLowercaseLiveMegacredits() {
  const doc = new FakeDocument();
  const aiCentral = makeCard(doc, 'AI Central', 21);

  handUi.highlightPlayable({
    dateNow: () => 100000,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({
      game: {},
      thisPlayer: {
        megaCredits: undefined,
        megacredits: 74,
        steel: 0,
        titanium: 0,
      },
    }),
    defaultSteelVal: 2,
    defaultTiVal: 3,
    getCardCost: getCost,
    getCardTags: () => new Set(['building', 'science']),
    getEffectiveCost: (cost) => cost,
  });

  assert(aiCentral.classList.contains('tm-playable'), 'live lowercase megacredits should make affordable hand cards playable');
  assert(!aiCentral.classList.contains('tm-unplayable'), 'affordable live lowercase megacredits card should not be marked unplayable');
}

function testDisabledClearsExistingBadges() {
  const doc = new FakeDocument();
  const card = makeCard(doc, 'Sponsors', 6);
  card.classList.add('tm-playable');
  handUi.injectHandPriorityBadges({
    enabled: true,
    documentObj: doc,
    selHand: HAND_SEL,
    getPlayerVueData: () => ({game: {}, thisPlayer: {}}),
    getCardCost: getCost,
    advisor: {rankHandCards: () => [{name: 'Sponsors', score: 50}]},
  });
  assert.strictEqual(card.querySelectorAll('.tm-hand-priority-badge').length, 1);

  handUi.injectHandPriorityBadges({
    enabled: false,
    documentObj: doc,
    selHand: HAND_SEL,
  });

  assert.strictEqual(card.querySelectorAll('.tm-hand-priority-badge').length, 0, 'disabled mode should clear badge');
  assert(!card.classList.contains('tm-hand-priority-card'), 'disabled mode should clear class');
  assert.strictEqual(card.getAttribute('data-tm-hand-priority'), null, 'disabled mode should clear rank attr');
}

testInjectsTopHandCardBadges();
testDeferredLatePayoffDoesNotLookLikePlayNow();
testGreenhousesDoesNotLookLikePlayNowBeforeCashout();
testGreenhousesStillDefersAtTwoGensWithoutGreenery();
testLiveRuslanGreenhousesDoesNotKeepTopRank();
testGreenhousesCanRankWhenItCreatesGreeneryNow();
testLatePayoffCanRankInLateGame();
testInstantScalingCashoutCanBeDeferredByClass();
testUnplayableHighValueCardGetsHoldNotPlayRank();
testUnmetGlobalRequirementDoesNotGetPlayRank();
testUnmetTagRequirementDoesNotGetPlayRank();
testProductionFloorLockUsesTemporaryNotNowLabel();
testHighlightPlayableUsesLowercaseLiveMegacredits();
testDisabledClearsExistingBadges();

console.log('content-hand-ui checks: OK');
