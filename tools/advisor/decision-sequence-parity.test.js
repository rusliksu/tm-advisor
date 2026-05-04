#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_NAME = 'minority_refuge_miranda_sequence.json';
const core = require(path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'brain-core.js'));
const smartbot = require(path.join(ROOT, 'bot', 'smartbot.js'));

function loadFixture() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'test-fixtures', FIXTURE_NAME), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDecision(decision) {
  assert(decision, 'expected sequence decision');
  return {
    kind: decision.kind,
    target_colony: decision.best?.target_colony,
    animal_target: decision.best?.animal_target,
    setup_card: decision.best?.setup_card || null,
  };
}

function runPythonDecision() {
  const script = `
import json
from pathlib import Path

from scripts.tm_advisor.decision_sequences import sequence_decision_advice
from scripts.tm_advisor.models import GameState

raw = json.loads((Path.cwd() / "data" / "test-fixtures" / "${FIXTURE_NAME}").read_text(encoding="utf-8"))
state = GameState(raw)
proposal = sequence_decision_advice(
    state,
    hand_advice=[{"name": "Fish", "action": "PLAY"}],
    req_checker=None,
)
print(json.dumps(proposal.to_dict() if proposal else None, ensure_ascii=True, sort_keys=True))
`.trim();

  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON]);
  candidates.push(['python3']);
  candidates.push(['python']);
  if (process.platform === 'win32') candidates.push(['py', '-3']);

  let lastFailure = null;
  let missingCommandFailure = null;
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), '-c', script], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: [ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    });

    if (result.error) {
      missingCommandFailure = result.error;
      continue;
    }
    if (result.status === 0) {
      return JSON.parse((result.stdout || '').trim());
    }
    lastFailure = new Error(
      `${candidate.join(' ')} failed with ${result.status}\n${result.stdout || ''}${result.stderr || ''}`.trim(),
    );
  }

  throw lastFailure || missingCommandFailure || new Error('Failed to run Python decision sequence check');
}

function makePlayProjectOrActionWorkflow(state) {
  return {
    type: 'or',
    options: [
      {
        type: 'projectCard',
        title: 'Play project card',
        cards: state.cardsInHand,
      },
      {
        type: 'card',
        title: 'Perform an action from a played card',
        selectBlueCardAction: true,
        cards: [{name: 'Development Center'}],
      },
    ],
  };
}

function assertSmartbotSequence(fixture) {
  const setupState = clone(fixture);
  const setupInput = smartbot.handleInput(makePlayProjectOrActionWorkflow(setupState), setupState);
  assert.strictEqual(setupInput.type, 'or');
  assert.strictEqual(setupInput.index, 0);
  assert.strictEqual(setupInput.response?.type, 'projectCard');
  assert.strictEqual(setupInput.response?.card, 'Fish');

  const refugeState = clone(fixture);
  refugeState.cardsInHand = refugeState.cardsInHand.filter((card) => card.name !== 'Fish');
  refugeState.thisPlayer.cardsInHand = refugeState.cardsInHand;
  refugeState.thisPlayer.tableau = [...refugeState.thisPlayer.tableau, {name: 'Fish', resources: 0}];

  const refugeInput = smartbot.handleInput(makePlayProjectOrActionWorkflow(refugeState), refugeState);
  assert.strictEqual(refugeInput.type, 'or');
  assert.strictEqual(refugeInput.index, 0);
  assert.strictEqual(refugeInput.response?.type, 'projectCard');
  assert.strictEqual(refugeInput.response?.card, 'Minority Refuge');

  const colonyInput = smartbot.handleInput({
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: [
      {name: 'Luna', colonies: []},
      {name: 'Europa', colonies: []},
      {name: 'Miranda', colonies: ['red']},
    ],
  }, refugeState);
  assert.deepStrictEqual(colonyInput, {type: 'colony', colonyName: 'Miranda'});
}

function main() {
  const fixture = loadFixture();
  const coreDecision = core.analyzeMinorityRefugeMirandaSequence({
    state: fixture,
    cards: fixture.cardsInHand,
    rankableCards: fixture.cardsInHand.filter((card) => card.name !== 'Fish' && card.name !== 'Birds'),
  });
  const pythonDecision = runPythonDecision();

  assert.deepStrictEqual(normalizeDecision(pythonDecision), normalizeDecision(coreDecision));
  assert.strictEqual(pythonDecision.best?.total_cost, 10);
  assertSmartbotSequence(fixture);

  console.log('decision sequence parity checks: OK');
}

if (require.main === module) {
  main();
}

module.exports = {main};
