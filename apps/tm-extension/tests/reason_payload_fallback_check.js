#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const tooltipPath = path.resolve(__dirname, '..', 'src', 'content-tooltip.js');
const draftPath = path.resolve(__dirname, '..', 'src', 'content-draft-recommendations.js');
const overlaysPath = path.resolve(__dirname, '..', 'src', 'content-overlays.js');

delete global.TM_CONTENT_TOOLTIP;
delete global.TM_CONTENT_DRAFT_RECOMMENDATIONS;
delete global.TM_CONTENT_OVERLAYS;
require(tooltipPath);
require(draftPath);
require(overlaysPath);

const tooltip = global.TM_CONTENT_TOOLTIP;
const draftRecommendations = global.TM_CONTENT_DRAFT_RECOMMENDATIONS;
const overlays = global.TM_CONTENT_OVERLAYS;

assert(tooltip, 'TM_CONTENT_TOOLTIP should be loaded');
assert(draftRecommendations, 'TM_CONTENT_DRAFT_RECOMMENDATIONS should be loaded');
assert(overlays, 'TM_CONTENT_OVERLAYS should be loaded');

global.document = {
  createElement() {
    return {
      className: '',
      innerHTML: '',
    };
  },
};

function makeAttrsTarget(baseAttrs = {}) {
  const attrs = {...baseAttrs};
  return {
    attrs,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete attrs[name];
    },
  };
}

function makeBadge(textContent) {
  const badge = makeAttrsTarget();
  badge.textContent = textContent;
  badge.className = 'tm-tier-badge tm-tier-C';
  badge.hasAttribute = function hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(badge.attrs, name);
  };
  return badge;
}

function makeCardEl(cardName, badge) {
  const el = makeAttrsTarget({'data-tm-card': cardName});
  el.classList = {
    add() {},
    remove() {},
  };
  el.querySelector = function querySelector(selector) {
    if (selector === '.tm-tier-badge') return badge;
    return null;
  };
  el.appendChild = function appendChild() {};
  return el;
}

function parseStoredRows(el) {
  const raw = el.getAttribute('data-tm-reason-rows');
  assert(raw, 'expected data-tm-reason-rows to be set');
  return {
    rawRows: JSON.parse(raw),
    parsedRows: tooltip.parseReasonRows(raw),
  };
}

function testDraftRecommendationFallbackKeepsToneInferred() {
  const badge = makeBadge('C 50');
  const el = makeCardEl('Test Card', badge);

  draftRecommendations.scoreHandCardsInPlace({
    detectMyCorp() {
      return 'Credicor';
    },
    getMyTableauNames() {
      return [];
    },
    getMyHandNames() {
      return [];
    },
    getCachedPlayerContext() {
      return {};
    },
    enrichCtxForScoring() {},
    documentObj: {
      querySelectorAll() {
        return [el];
      },
    },
    selHand: '.card',
    ratings: {
      'Test Card': {t: 'C', s: 50},
    },
    scoreDraftCard() {
      return {
        total: 45,
        uncappedTotal: 45,
        reasons: ['Нужно 2 колонии (есть 0)'],
      };
    },
    updateBadgeScore() {
      return 'D';
    },
  });

  const {rawRows, parsedRows} = parseStoredRows(el);
  assert.strictEqual(rawRows[0].tone, undefined, 'draft fallback should not force positive tone');
  assert.strictEqual(parsedRows[0].tone, 'negative', 'tooltip should infer negative tone from requirement text');
}

function testOverlayFallbackKeepsToneInferred() {
  const badge = makeBadge('C 50');
  const el = makeCardEl('Test Card', badge);

  overlays.applyDraftRecommendationCardUi({
    item: {
      el,
      name: 'Test Card',
      total: 45,
      uncappedTotal: 45,
      reasons: ['Нужно 2 колонии (есть 0)'],
    },
    scored: [],
    bestScore: 45,
    isDraftOrResearch: false,
    ratings: {
      'Test Card': {t: 'C', s: 50},
    },
    revealPendingContextBadge() {},
    scoreToTier() {
      return 'D';
    },
  });

  const {rawRows, parsedRows} = parseStoredRows(el);
  assert.strictEqual(rawRows[0].tone, undefined, 'overlay fallback should not force positive tone');
  assert.strictEqual(parsedRows[0].tone, 'negative', 'tooltip should infer negative tone from fallback overlay reason');
}

function testRenderCardOverlayPrefersRuNoteOverSynergyFallback() {
  const overlay = overlays.renderCardOverlay({
    item: {
      el: makeCardEl('Established Methods', makeBadge('C 66')),
      name: 'Established Methods',
      total: 66,
      reasons: [],
    },
    scored: [],
    ratings: {
      'Established Methods': {
        nr: 'Гибкая prelude под точный setup',
        y: ['Poseidon'],
      },
    },
    yName(name) {
      return name;
    },
  });

  assert(overlay, 'renderCardOverlay should return an overlay element');
  assert(overlay.innerHTML.includes('Гибкая prelude'), 'overlay should surface the RU note');
  assert(!overlay.innerHTML.includes('tm-iov-syn'), 'overlay should not fall back to synergy when RU note exists');
}

function testRequirementHtmlCanRenderMutedFutureWindow() {
  const html = tooltip.buildRequirementHtml({
    checks: [{tone: 'muted', text: 'Окно позже: Темп -30°C/4°C'}],
  });

  assert(html.includes('tm-tip-row--muted'), 'future requirement window should render as muted instead of error');
  assert(!html.includes('✗'), 'future requirement window should not show a hard error marker');
  assert(html.includes('Окно позже: Темп -30°C/4°C'));
}

function testTooltipHeaderIncludesCopyButton() {
  const html = tooltip.buildHeaderHtml({
    baseScore: 80,
    baseTier: 'A',
    cardCost: 12,
    ctxScore: 80,
    ctxTier: 'A',
    escHtml(value) {
      return String(value);
    },
    isOppCard: false,
    localizedName: 'Мангровые леса',
    name: 'Mangrove',
  });

  assert(html.includes('tm-tooltip-copy'), 'tooltip header should expose a copy button');
  assert(html.includes('data-tm-tooltip-copy'), 'copy button should be discoverable by delegated click handler');
  assert(html.includes('float:left'), 'copy button should sit at the upper-left of the tooltip header');
}

function testTagGateReasonsSurviveOverlayPayload() {
  const badge = makeBadge('C 58');
  const el = makeCardEl('Luna Governor', badge);

  overlays.applyDraftRecommendationCardUi({
    item: {
      el,
      name: 'Luna Governor',
      total: 58,
      uncappedTotal: 58,
      reasons: [
        'Tag gate Earth: need 3 on table (hand +5) -12',
        'Tag route Earth support +2',
      ],
    },
    scored: [],
    bestScore: 58,
    isDraftOrResearch: false,
    ratings: {
      'Luna Governor': {t: 'C', s: 71},
    },
    revealPendingContextBadge() {},
    scoreToTier() {
      return 'C';
    },
  });

  const {parsedRows} = parseStoredRows(el);
  assert.strictEqual(parsedRows.length, 2, 'tag-gate route reasons should survive into tooltip rows');
  assert.strictEqual(parsedRows[0].text, 'Tag gate Earth: need 3 on table (hand +5) -12');
  assert.strictEqual(parsedRows[0].tone, 'negative', 'tag-gate penalty should render as negative tooltip row');
  assert.strictEqual(parsedRows[1].text, 'Tag route Earth support +2');
  assert.strictEqual(parsedRows[1].tone, 'positive', 'tag route support should render as positive tooltip row');
  assert.strictEqual(
    el.getAttribute('data-tm-reasons'),
    'Tag gate Earth: need 3 on table (hand +5) -12|Tag route Earth support +2',
    'plain tooltip payload should keep both tag-gate reason texts',
  );
}

testDraftRecommendationFallbackKeepsToneInferred();
testOverlayFallbackKeepsToneInferred();
testRenderCardOverlayPrefersRuNoteOverSynergyFallback();
testRequirementHtmlCanRenderMutedFutureWindow();
testTooltipHeaderIncludesCopyButton();
testTagGateReasonsSurviveOverlayPayload();

console.log('reason payload fallback checks: OK');
