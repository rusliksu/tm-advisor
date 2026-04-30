#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_GAME_OVERLAYS;
require(path.resolve(__dirname, '..', 'src', 'content-game-overlays.js'));

const overlays = global.TM_CONTENT_GAME_OVERLAYS;
assert(overlays, 'TM_CONTENT_GAME_OVERLAYS should be loaded');
assert.strictEqual(typeof overlays.renderGameSignals, 'function', 'renderGameSignals should be exported');
assert.strictEqual(typeof overlays.clearGameSignals, 'function', 'clearGameSignals should be exported');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.textContent = '';
    this.attrs = {};
    this.style = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const matches = (el) => {
      if (selector === '.tm-game-signal-badge') return String(el.className).split(/\s+/).includes('tm-game-signal-badge');
      if (selector === '.tm-game-signal-stack') return String(el.className).split(/\s+/).includes('tm-game-signal-stack');
      if (selector === '[data-tm-game-anchor="heat"]') return el.getAttribute('data-tm-game-anchor') === 'heat';
      if (selector === '[data-tm-game-anchor="plants"]') return el.getAttribute('data-tm-game-anchor') === 'plants';
      if (selector === 'button') return el.tagName === 'button';
      if (selector === 'td') return el.tagName === 'td';
      if (selector === 'th') return el.tagName === 'th';
      if (selector === 'li') return el.tagName === 'li';
      if (selector === '.ma-name') return String(el.className).split(/\s+/).includes('ma-name');
      if (selector === '.milestone-award-inline') return String(el.className).split(/\s+/).includes('milestone-award-inline');
      if (selector === '.global-event') return String(el.className).split(/\s+/).includes('global-event');
      if (selector === '.global-event-title') return String(el.className).split(/\s+/).includes('global-event-title');
      if (selector === '.global-event-name') return String(el.className).split(/\s+/).includes('global-event-name');
      if (selector === '.global-event--coming') return String(el.className).split(/\s+/).includes('global-event--coming');
      if (selector === '.events-board') return String(el.className).split(/\s+/).includes('events-board');
      if (selector === '.events-board .global-event--coming') return String(el.className).split(/\s+/).includes('global-event--coming') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('events-board');
      if (selector === '.events-board .global-event') return String(el.className).split(/\s+/).includes('global-event') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('events-board');
      if (selector === '.turmoil .events-board') return String(el.className).split(/\s+/).includes('events-board') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('turmoil');
      if (selector === '.global_params') return String(el.className).split(/\s+/).includes('global_params');
      if (selector === '.global-numbers') return String(el.className).split(/\s+/).includes('global-numbers');
      if (selector === '.awards .ma-name--thermalist') return String(el.className).split(/\s+/).includes('ma-name--thermalist') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('awards');
      if (selector === '.awards .award-block.ma-name--thermalist') return String(el.className).split(/\s+/).includes('award-block') && String(el.className).split(/\s+/).includes('ma-name--thermalist') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('awards');
      if (selector === '.ma-name--awards.ma-name--thermalist') return String(el.className).split(/\s+/).includes('ma-name--awards') && String(el.className).split(/\s+/).includes('ma-name--thermalist');
      if (selector === '.milestones .ma-name--legend') return String(el.className).split(/\s+/).includes('ma-name--legend') && el.parentElement && String(el.parentElement.className).split(/\s+/).includes('milestones');
      if (selector === '.ma-name--milestones.ma-name--legend') return String(el.className).split(/\s+/).includes('ma-name--milestones') && String(el.className).split(/\s+/).includes('ma-name--legend');
      if (selector === '[class*="award"]') return String(el.className).includes('award');
      if (selector === '[class*="milestone"]') return String(el.className).includes('milestone');
      if (selector === '[class*="global"]') return String(el.className).includes('global');
      if (selector === '[class*="parameter"]') return String(el.className).includes('parameter');
      if (selector === '[class*="turmoil"]') return String(el.className).includes('turmoil');
      if (selector === '[class*="event"]') return String(el.className).includes('event');
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

function signal(id, severity, label, anchor, priority) {
  return {
    id,
    severity,
    label,
    anchor,
    priority,
    title: label,
    reasons: ['reason for ' + label],
    action: 'act on ' + label,
  };
}

function testRendererLimitsVisibleSignals() {
  const doc = new FakeDocument();
  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('critical-1', 'critical', 'Spend heat', {type: 'resource', key: 'heat'}, 100),
      signal('critical-2', 'critical', 'Other critical', {type: 'resource', key: 'plants'}, 99),
      signal('hint-1', 'warning', 'Fund award', {type: 'award', key: 'Thermalist'}, 90),
      signal('hint-2', 'info', 'Finish now', {type: 'global', key: 'terraforming'}, 80),
      signal('hint-3', 'warning', 'Extra hint', {type: 'milestone', key: 'Legend'}, 70),
    ],
  });

  const badges = doc.querySelectorAll('.tm-game-signal-badge');
  assert.strictEqual(badges.length, 3, 'renderer should show one critical plus two hints');
  assert.strictEqual(badges[0].textContent, 'Spend heat');
  assert(!badges.some((badge) => badge.textContent === 'Other critical'), 'second critical should be hidden');
}

function testRendererUsesAnchorWhenAvailable() {
  const doc = new FakeDocument();
  const heatAnchor = doc.createElement('div');
  heatAnchor.setAttribute('data-tm-game-anchor', 'heat');
  doc.body.appendChild(heatAnchor);

  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('heat-event-risk', 'critical', 'Spend heat', {type: 'resource', key: 'heat'}, 100),
    ],
  });

  assert.strictEqual(heatAnchor.querySelectorAll('.tm-game-signal-badge').length, 1, 'heat badge should attach to heat anchor');
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-stack').length, 0, 'fallback stack should not be created for anchored signal');
}

function testRendererUsesTextAnchorForAwards() {
  const doc = new FakeDocument();
  const awardRow = doc.createElement('button');
  awardRow.className = 'award-row';
  awardRow.textContent = 'Thermalist 26 vs 8';
  doc.body.appendChild(awardRow);

  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('fund-thermalist', 'warning', 'Fund Thermalist', {type: 'award', key: 'Thermalist'}, 90),
    ],
  });

  assert.strictEqual(awardRow.querySelectorAll('.tm-game-signal-badge').length, 1, 'award signal should attach to matching award text');
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-stack').length, 0, 'text-anchored signal should not use fallback stack');
}

function testRendererUsesRealAwardClassAnchor() {
  const doc = new FakeDocument();
  const awards = doc.createElement('div');
  awards.className = 'awards';
  const awardBlock = doc.createElement('div');
  awardBlock.className = 'ma-name ma-name--awards award-block ma-name--thermalist';
  awardBlock.textContent = 'Thermalist';
  awards.appendChild(awardBlock);
  doc.body.appendChild(awards);

  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('fund-thermalist', 'warning', 'Fund Thermalist', {type: 'award', key: 'Thermalist'}, 90),
    ],
  });

  assert.strictEqual(awardBlock.querySelectorAll('.tm-game-signal-badge').length, 1, 'award signal should attach to real ma-name class');
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-stack').length, 0, 'class-anchored award should not use fallback stack');
}

function testRendererUsesRealMilestoneClassAnchor() {
  const doc = new FakeDocument();
  const milestones = doc.createElement('div');
  milestones.className = 'milestones';
  const milestoneBlock = doc.createElement('div');
  milestoneBlock.className = 'ma-name--milestones ma-name ma-name--legend';
  milestoneBlock.textContent = 'Legend';
  milestones.appendChild(milestoneBlock);
  doc.body.appendChild(milestones);

  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('claim-legend', 'warning', 'Claim Legend', {type: 'milestone', key: 'Legend'}, 90),
    ],
  });

  assert.strictEqual(milestoneBlock.querySelectorAll('.tm-game-signal-badge').length, 1, 'milestone signal should attach to real ma-name class');
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-stack').length, 0, 'class-anchored milestone should not use fallback stack');
}

function testRendererUsesComingEventAnchor() {
  const doc = new FakeDocument();
  const globalParams = doc.createElement('div');
  globalParams.className = 'global_params';
  doc.body.appendChild(globalParams);
  const events = doc.createElement('div');
  events.className = 'events-board';
  const coming = doc.createElement('div');
  coming.className = 'global-event global-event--coming';
  coming.textContent = 'Corrosive Rain';
  events.appendChild(coming);
  doc.body.appendChild(events);

  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('heat-event-risk', 'critical', 'Heat event', {type: 'global', key: 'event'}, 100),
    ],
  });

  assert.strictEqual(coming.querySelectorAll('.tm-game-signal-badge').length, 1, 'event signal should prefer coming global event');
  assert.strictEqual(globalParams.querySelectorAll('.tm-game-signal-badge').length, 0, 'event signal should not attach to generic global params');
}

function testRendererFallsBackToStack() {
  const doc = new FakeDocument();
  overlays.renderGameSignals({
    documentObj: doc,
    signals: [
      signal('finish-now', 'info', 'Finish now', {type: 'global', key: 'terraforming'}, 80),
    ],
  });

  const stacks = doc.querySelectorAll('.tm-game-signal-stack');
  assert.strictEqual(stacks.length, 1, 'fallback stack should be created');
  assert.strictEqual(stacks[0].querySelectorAll('.tm-game-signal-badge').length, 1, 'fallback stack should contain signal badge');

  overlays.clearGameSignals({documentObj: doc});
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-badge').length, 0, 'clear should remove badges');
  assert.strictEqual(doc.querySelectorAll('.tm-game-signal-stack').length, 0, 'clear should remove fallback stack');
}

testRendererLimitsVisibleSignals();
testRendererUsesAnchorWhenAvailable();
testRendererUsesTextAnchorForAwards();
testRendererUsesRealAwardClassAnchor();
testRendererUsesRealMilestoneClassAnchor();
testRendererUsesComingEventAnchor();
testRendererFallsBackToStack();

console.log('content-game-overlays checks: OK');
