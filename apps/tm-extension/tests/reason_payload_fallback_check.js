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

testDraftRecommendationFallbackKeepsToneInferred();
testOverlayFallbackKeepsToneInferred();

console.log('reason payload fallback checks: OK');
