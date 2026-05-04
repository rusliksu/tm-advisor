#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'vue-bridge.js');

function makeElement() {
  const attrs = new Map();
  return {
    __vue__: null,
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
  };
}

function makeWaitingFor(title) {
  return {
    type: 'or',
    title: title || 'Take your next action',
    options: [{index: 0, title: 'Pass for this generation'}],
  };
}

function makePlayerView(waitingFor, playerOverrides = {}, opponentOverrides = {}) {
  const pv = {
    thisPlayer: Object.assign({color: 'red'}, playerOverrides),
    players: [
      Object.assign({color: 'red'}, playerOverrides),
      Object.assign({color: 'blue'}, opponentOverrides),
    ],
    game: {phase: 'action', generation: 5},
    _source: 'test',
  };
  if (waitingFor) pv.waitingFor = waitingFor;
  return pv;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  const game = makeElement();
  const body = makeElement();
  let fetchJson = {};
  const intervals = [];
  const timeouts = [];

  function runBridgeUpdate() {
    assert(intervals.length > 0, 'vue bridge should register update interval');
    intervals[0]();
  }

  function FakeXMLHttpRequest() {}
  FakeXMLHttpRequest.prototype.open = function() {};
  FakeXMLHttpRequest.prototype.send = function() {};
  FakeXMLHttpRequest.prototype.addEventListener = function() {};

  const documentObj = {
    hidden: false,
    body,
    getElementById(id) {
      return id === 'game' ? game : null;
    },
    querySelector(selector) {
      return selector === '#game' ? game : null;
    },
    addEventListener() {},
    dispatchEvent() {},
  };

  const sandbox = {
    console,
    document: documentObj,
    window: {
      fetch() {
        return Promise.resolve({
          clone() {
            return {
              json() {
                return Promise.resolve(fetchJson);
              },
            };
          },
        });
      },
    },
    XMLHttpRequest: FakeXMLHttpRequest,
    CustomEvent: function CustomEvent(type, init) {
      return {type, detail: init && init.detail};
    },
    setTimeout(fn) {
      timeouts.push(fn);
      return timeouts.length;
    },
    setInterval(fn) {
      intervals.push(fn);
      return intervals.length;
    },
    clearTimeout() {},
    clearInterval() {},
  };
  sandbox.window.XMLHttpRequest = FakeXMLHttpRequest;
  sandbox.globalThis = sandbox;

  game.__vue__ = {playerView: makePlayerView(makeWaitingFor('Initial prompt'))};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, {filename: sourcePath});

  runBridgeUpdate();
  assert.strictEqual(JSON.parse(game.getAttribute('data-tm-vue-wf')).title, 'Initial prompt');

  game.__vue__.playerView = makePlayerView(null, {
    megacredits: 74,
    megacreditProduction: 41,
  }, {
    megacredits: 12,
    megacreditProduction: 3,
  });
  runBridgeUpdate();
  const bridgePayload = JSON.parse(game.getAttribute('data-tm-vue-bridge'));
  assert.strictEqual(bridgePayload.thisPlayer.megaCredits, 74, 'bridge should normalize lowercase live megacredits');
  assert.strictEqual(bridgePayload.thisPlayer.megaCreditProduction, 41, 'bridge should normalize lowercase live megacreditProduction');
  assert.strictEqual(bridgePayload.players[1].megaCredits, 12, 'bridge should normalize lowercase opponent megacredits');
  assert.strictEqual(bridgePayload.players[1].megaCreditProduction, 3, 'bridge should normalize lowercase opponent megacreditProduction');

  game.__vue__.playerView = makePlayerView(null);
  runBridgeUpdate();
  assert.strictEqual(game.getAttribute('data-tm-vue-wf'), null, 'stale direct waitingFor attr should be removed');

  fetchJson = {result: 'GO', waitingFor: makeWaitingFor('Polled prompt')};
  await sandbox.window.fetch('/api/waitingfor');
  await flushPromises();
  runBridgeUpdate();
  assert.strictEqual(JSON.parse(game.getAttribute('data-tm-vue-wf')).title, 'Polled prompt');

  await sandbox.window.fetch('/api/playerInput', {method: 'POST', body: '{"type":"action"}'});
  await flushPromises();
  runBridgeUpdate();
  assert.strictEqual(game.getAttribute('data-tm-vue-wf'), null, 'player input should clear stale waitingFor attr');

  const actionLog = JSON.parse(game.getAttribute('data-tm-action-log'));
  assert(actionLog.some((entry) => entry.type === 'waitingForClear'), 'player input should append waitingForClear event');

  console.log('vue-bridge waitingFor checks: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
