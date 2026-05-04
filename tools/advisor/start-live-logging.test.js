#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {parseTargetIdentifier} = require('./start-live-logging');

function testParsesHerokuGameUrl() {
  const parsed = parseTargetIdentifier(
    'https://terraforming-mars.herokuapp.com/game?id=g2b0c1551b63c',
    'https://tm.knightbyte.win',
    false,
  );
  assert.deepStrictEqual(parsed, {
    identifier: 'g2b0c1551b63c',
    serverUrl: 'https://terraforming-mars.herokuapp.com',
    source: 'game-url',
  });
}

function testExplicitServerUrlOverridesUrlOrigin() {
  const parsed = parseTargetIdentifier(
    'https://terraforming-mars.herokuapp.com/game?id=g2b0c1551b63c',
    'https://tm.knightbyte.win',
    true,
  );
  assert.strictEqual(parsed.identifier, 'g2b0c1551b63c');
  assert.strictEqual(parsed.serverUrl, 'https://tm.knightbyte.win');
}

function testKeepsPlainIds() {
  const parsed = parseTargetIdentifier('g2b0c1551b63c', 'https://tm.knightbyte.win', false);
  assert.deepStrictEqual(parsed, {
    identifier: 'g2b0c1551b63c',
    serverUrl: 'https://tm.knightbyte.win',
    source: 'id',
  });
}

testParsesHerokuGameUrl();
testExplicitServerUrlOverridesUrlOrigin();
testKeepsPlainIds();
console.log('start-live-logging tests: OK');
