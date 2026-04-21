#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_LOG_UI;
delete global.TM_CONTENT_DRAFT_HISTORY;
require(path.resolve(__dirname, '..', 'src', 'content-log-ui.js'));
require(path.resolve(__dirname, '..', 'src', 'content-draft-history.js'));

const logUi = global.TM_CONTENT_LOG_UI;
const draftHistory = global.TM_CONTENT_DRAFT_HISTORY;
assert(logUi, 'TM_CONTENT_LOG_UI should be loaded');
assert(draftHistory, 'TM_CONTENT_DRAFT_HISTORY should be loaded');

function makeScrollable(scrollTop) {
  return {
    scrollHeight: 1000,
    clientHeight: 300,
    scrollTop,
    children: [],
    querySelectorAll(selector) {
      if (selector === '.tm-draft-log-entry') return [];
      return [];
    },
    appendChild(child) {
      this.children.push(child);
    },
  };
}

function makeLogPanel(scrollable) {
  return {
    querySelector(selector) {
      if (selector === '#logpanel-scrollable') return scrollable;
      if (selector === '#logpanel-scrollable ul') return scrollable;
      return null;
    },
  };
}

function makeCardEl(name) {
  return {
    textContent: name,
    attrs: {},
    style: {removeProperty() {}},
    getAttribute(attr) {
      return this.attrs[attr] || '';
    },
    setAttribute(attr, value) {
      this.attrs[attr] = String(value);
    },
    querySelector() {
      return null;
    },
    insertAdjacentElement(_position, badge) {
      this.insertedBadge = badge;
    },
  };
}

function makeDocument(logPanel, cards) {
  return {
    querySelector(selector) {
      return selector === '.log-panel' ? logPanel : null;
    },
    querySelectorAll(selector) {
      if (selector === '.log-card') return cards;
      if (selector === '.tm-log-card-score') return [];
      return [];
    },
    createElement(tag) {
      return {tagName: tag.toUpperCase(), style: {}, attrs: {}};
    },
  };
}

function testLogBadgesStickWhenAlreadyAtBottom() {
  const scrollable = makeScrollable(676);
  const logPanel = makeLogPanel(scrollable);
  const card = makeCardEl('Research');
  logUi.decorateLogCardScores({
    documentObj: makeDocument(logPanel, [card]),
    ratings: {Research: {s: 77, t: 'B'}},
  });

  assert(card.insertedBadge, 'badge should be inserted');
  assert.strictEqual(scrollable.scrollTop, 1000, 'log should stick to bottom when badge insertion mutates near-bottom panel');
}

function testLogBadgesDoNotStealScrollWhenReadingHistory() {
  const scrollable = makeScrollable(100);
  const logPanel = makeLogPanel(scrollable);
  const card = makeCardEl('Research');
  logUi.decorateLogCardScores({
    documentObj: makeDocument(logPanel, [card]),
    ratings: {Research: {s: 77, t: 'B'}},
  });

  assert(card.insertedBadge, 'badge should be inserted');
  assert.strictEqual(scrollable.scrollTop, 100, 'log should not jump when user is reading older history');
}

function testDraftHistoryInjectionKeepsBottomScroll() {
  const oldDocument = global.document;
  global.document = {
    createElement(tag) {
      return {tagName: tag.toUpperCase(), className: '', innerHTML: ''};
    },
  };

  try {
    const scrollable = makeScrollable(676);
    const logPanel = makeLogPanel(scrollable);
    const count = draftHistory.injectDraftHistory({
      logPanel,
      draftHistory: [{
        round: 1,
        taken: 'Research',
        passed: ['Sponsors'],
        offered: [
          {name: 'Research', baseTier: 'B', baseScore: 77, tier: 'B', score: 77, reasons: []},
          {name: 'Sponsors', baseTier: 'C', baseScore: 63, tier: 'C', score: 63, reasons: []},
        ],
      }],
      ratings: {},
      ruName(name) { return name; },
      escHtml(text) { return String(text); },
    });

    assert.strictEqual(count, 1);
    assert.strictEqual(scrollable.children.length, 1, 'draft history entry should be appended');
    assert.strictEqual(scrollable.scrollTop, 1000, 'draft injection should keep bottom scroll');
  } finally {
    global.document = oldDocument;
  }
}

testLogBadgesStickWhenAlreadyAtBottom();
testLogBadgesDoNotStealScrollWhenReadingHistory();
testDraftHistoryInjectionKeepsBottomScroll();

console.log('content log scroll checks: OK');
