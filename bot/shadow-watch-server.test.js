#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  computeNextPollDelay,
  computePollInterval,
  finalizeActiveSessions,
  inputLogAdvanced,
  phaseNeedsAllPlayers,
  readInputLogMarker,
  refreshSessionInputActivity,
} = require('./shadow-watch-server');

function testPhaseNeedsAllPlayers() {
  assert.strictEqual(phaseNeedsAllPlayers('initial_drafting'), true);
  assert.strictEqual(phaseNeedsAllPlayers('research'), true);
  assert.strictEqual(phaseNeedsAllPlayers('action'), false);
}

function testComputePollIntervalBase() {
  const args = {
    actionInterval: 2,
    parallelInterval: 3,
    normalInterval: 6,
    idleInterval: 20,
    stalePolls: 5,
  };
  const session = {
    currentGame: {phase: 'initial_drafting'},
    pollsWithoutChange: 0,
  };
  assert.strictEqual(computePollInterval(session, args), 3);
}

function testComputeNextPollDelayUsesBurstForSimultaneousChange() {
  const args = {
    actionInterval: 2,
    parallelInterval: 3,
    normalInterval: 6,
    idleInterval: 20,
    stalePolls: 5,
    burstInterval: 0.75,
  };
  const session = {
    currentGame: {phase: 'initial_drafting'},
    pollsWithoutChange: 0,
  };
  const delay = computeNextPollDelay(session, args, {changed: true, phase: 'initial_drafting'});
  assert.strictEqual(delay, 0.75);
}

function testComputeNextPollDelayKeepsBaseWithoutChange() {
  const args = {
    actionInterval: 2,
    parallelInterval: 3,
    normalInterval: 6,
    idleInterval: 20,
    stalePolls: 5,
    burstInterval: 0.75,
  };
  const session = {
    currentGame: {phase: 'initial_drafting'},
    pollsWithoutChange: 0,
  };
  const delay = computeNextPollDelay(session, args, {changed: false, phase: 'initial_drafting'});
  assert.strictEqual(delay, 3);
}

function testComputeNextPollDelayUsesBurstWhileInputBurstActive() {
  const args = {
    actionInterval: 2,
    parallelInterval: 3,
    normalInterval: 6,
    idleInterval: 20,
    stalePolls: 5,
    burstInterval: 0.75,
  };
  const session = {
    currentGame: {phase: 'action'},
    pollsWithoutChange: 0,
    inputBurstPollsRemaining: 2,
  };
  const delay = computeNextPollDelay(session, args, {changed: false, phase: 'action'});
  assert.strictEqual(delay, 0.75);
}

function testInputLogHelpersDetectGrowthAndArmBurst() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-watch-'));
  const inputFile = path.join(tempDir, 'input-g1.jsonl');
  const initialMarker = readInputLogMarker(inputFile);
  assert.strictEqual(initialMarker.exists, false);

  fs.writeFileSync(inputFile, '{"x":1}\n', 'utf8');
  const nextMarker = readInputLogMarker(inputFile);
  assert.strictEqual(inputLogAdvanced(initialMarker, nextMarker), true);

  const session = {
    gameId: 'g1',
    inputLogFile: inputFile,
    inputLogMarker: initialMarker,
    inputBurstPollsRemaining: 0,
    nextPollAt: 999,
  };
  const args = {inputBurstPolls: 4};
  const changed = refreshSessionInputActivity(session, 123, args);
  assert.strictEqual(changed, true);
  assert.strictEqual(session.inputBurstPollsRemaining, 4);
  assert.strictEqual(session.nextPollAt, 123);
}

async function testFinalizeActiveSessionsStopsAndMergesSessions() {
  const sessions = new Map([
    ['g1', {gameId: 'g1', logFile: 'shadow-g1.jsonl'}],
    ['g2', {gameId: 'g2', logFile: 'shadow-g2.jsonl'}],
  ]);
  const events = [];
  const merges = [];

  const finalized = await finalizeActiveSessions('manager.jsonl', sessions, {
    reason: 'manager_sigterm',
    status: 'shutdown',
    stopSession: async (session, status) => ({changed: session.gameId === 'g1', flushError: null, status}),
    mergeLogs: (_managerLog, gameId, _session, context) => merges.push({gameId, context}),
    log: (_managerLog, entry) => events.push(entry),
  });

  assert.strictEqual(sessions.size, 0);
  assert.strictEqual(finalized.length, 2);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].type, 'shadow_shutdown_session');
  assert.strictEqual(events[0].reason, 'manager_sigterm');
  assert.strictEqual(events[0].status, 'shutdown');
  assert.strictEqual(merges.length, 2);
  assert.strictEqual(merges[0].context.reason, 'manager_sigterm');
  assert.strictEqual(merges[0].context.status, 'shutdown');
}

async function main() {
  testPhaseNeedsAllPlayers();
  testComputePollIntervalBase();
  testComputeNextPollDelayUsesBurstForSimultaneousChange();
  testComputeNextPollDelayKeepsBaseWithoutChange();
  testComputeNextPollDelayUsesBurstWhileInputBurstActive();
  testInputLogHelpersDetectGrowthAndArmBurst();
  await testFinalizeActiveSessionsStopsAndMergesSessions();
  console.log('shadow-watch-server tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
