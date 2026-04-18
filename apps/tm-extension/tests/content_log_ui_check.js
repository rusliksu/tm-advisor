#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content-log-ui.js');
delete global.TM_CONTENT_LOG_UI;
require(sourcePath);

const logUi = global.TM_CONTENT_LOG_UI;
assert(logUi, 'TM_CONTENT_LOG_UI should be loaded');
assert.strictEqual(typeof logUi.decorateLogCardScores, 'function', 'decorateLogCardScores should be exported');

class FakeBadge {
  constructor(attrs) {
    this.className = '';
    this.textContent = '';
    this.parentNode = null;
    this.attrs = Object.assign(Object.create(null), attrs || {});
    this.style = {};
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  remove() {
    if (!this.parentNode) return;
    if (Array.isArray(this.parentNode.children)) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    if (this.parentNode.ownerCard && this.parentNode.ownerCard.nextSibling === this) {
      this.parentNode.ownerCard.nextSibling = null;
    }
    this.parentNode = null;
  }
}

class FakeLogCard {
  constructor(text) {
    this.baseText = text;
    this.attrs = Object.create(null);
    this.children = [];
    this.style = {};
    this.nextSibling = null;
    this.parentNode = {
      ownerCard: this,
      appendChild: (child) => {
        child.parentNode = this.parentNode;
        this.nextSibling = child;
        return child;
      },
    };
  }

  get textContent() {
    return this.baseText + this.children.map((child) => child.textContent).join('');
  }

  getAttribute(name) {
    return this.attrs[name] || '';
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  querySelector(selector) {
    if (selector !== '.tm-log-card-score') return null;
    return this.children.find((child) => child.className.split(/\s+/).includes('tm-log-card-score')) || null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentElement(position, child) {
    if (position !== 'afterend') return child;
    child.parentNode = this.parentNode;
    this.nextSibling = child;
    return child;
  }
}

class FakeDocument {
  constructor(cards, visibleCards) {
    this.cards = cards;
    this.visibleCards = visibleCards || [];
  }

  querySelectorAll(selector) {
    if (selector === '.log-card') return this.cards;
    if (selector === '.card-container[data-tm-card]') return this.visibleCards;
    if (selector === '.tm-log-card-score') {
      return this.cards
        .map((card) => card.nextSibling && card.nextSibling.className && card.nextSibling.className.split(/\s+/).includes('tm-log-card-score') ? card.nextSibling : card.querySelector('.tm-log-card-score'))
        .filter(Boolean);
    }
    return [];
  }

  createElement() {
    return new FakeBadge();
  }
}

class FakeVisibleCard {
  constructor(name, badge) {
    this.name = name;
    this.badge = badge;
    this.style = {};
  }

  getAttribute(name) {
    return name === 'data-tm-card' ? this.name : '';
  }

  querySelector(selector) {
    return selector === '.tm-tier-badge' ? this.badge : null;
  }
}

const asteroidCard = new FakeLogCard('Big Asteroid');
const mergerCard = new FakeLogCard('Merger');
const unknownCard = new FakeLogCard('Unknown Card');
const visibleAsteroid = new FakeVisibleCard('Big Asteroid', new FakeBadge({'data-tm-original': 'B 72'}));
visibleAsteroid.badge.textContent = 'A 81';
const visibleMerger = new FakeVisibleCard('Merger', new FakeBadge());
visibleMerger.badge.textContent = 'B 77';
const documentObj = new FakeDocument([asteroidCard, mergerCard, unknownCard], [visibleAsteroid, visibleMerger]);

logUi.decorateLogCardScores({
  enabled: true,
  documentObj,
  ratings: {
    'Big Asteroid': {t: 'B', s: 72},
    Merger: {t: 'B', s: 77},
  },
});

assert.strictEqual(asteroidCard.nextSibling.textContent, 'A 81', 'visible adjusted badges should override the base score in the log');
assert.strictEqual(mergerCard.nextSibling.textContent, 'B 77', 'multiple log cards should be decorated');
assert.strictEqual(unknownCard.nextSibling, null, 'unknown log cards should stay undecorated');
assert.strictEqual(asteroidCard.getAttribute('data-tm-log-card-name'), 'Big Asteroid', 'original log card name should be cached before decoration');

logUi.decorateLogCardScores({
  enabled: false,
  documentObj,
  ratings: {
    'Big Asteroid': {t: 'B', s: 72},
    Merger: {t: 'B', s: 77},
  },
});

assert.strictEqual(asteroidCard.nextSibling, null, 'disabling the extension should remove log score badges');
assert.strictEqual(mergerCard.nextSibling, null, 'all log score badges should be removable');

console.log('content log ui checks: OK');
