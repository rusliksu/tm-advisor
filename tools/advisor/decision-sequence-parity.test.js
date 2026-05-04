#!/usr/bin/env node
'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'data', 'test-fixtures', 'minority_refuge_miranda_sequence.json');

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

function runPythonSnapshot() {
  const script = `
import json
import sys
from pathlib import Path

root = Path(${JSON.stringify(ROOT)})
fixture = Path(${JSON.stringify(FIXTURE)})
sys.path.insert(0, str(root / "apps" / "tm-advisor-py" / "entrypoints"))

import advisor_snapshot

raw = json.loads(fixture.read_text(encoding="utf-8"))
snap = advisor_snapshot.snapshot_from_raw(raw)
print(json.dumps({
    "decision_kind": (snap.get("decision") or {}).get("kind"),
    "sequence": snap.get("sequence"),
    "best_move": (snap.get("summary") or {}).get("best_move"),
}, ensure_ascii=False))
`;
  const result = cp.spawnSync('python', ['-c', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `python exited with status ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function runJsOverlay() {
  const state = loadFixture();
  state._waitingFor = {
    type: 'or',
    options: [
      {type: 'card', title: 'Play project card', cards: state.cardsInHand},
      {type: 'option', title: 'Use played-card action'},
    ],
  };

  delete global.TM_CONTENT_ACTION_RECOMMENDATION;
  global.TM_BRAIN_CORE = require(path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'brain-core.js'));
  require(path.join(ROOT, 'apps', 'tm-extension', 'src', 'content-action-recommendation.js'));
  const actionRec = global.TM_CONTENT_ACTION_RECOMMENDATION;
  assert(actionRec, 'TM_CONTENT_ACTION_RECOMMENDATION should be loaded');

  return actionRec.computeActionRecommendation({
    state,
    advisor: {
      analyzeActions() {
        return [
          {index: 0, action: 'Play project card', score: 70, reason: 'Cheap colony'},
          {index: 1, action: 'Use played-card action', score: 65, reason: 'Draw first'},
        ];
      },
      rankHandCards() {
        throw new Error('sequence should override generic single-card rank');
      },
    },
    isPlayableCard(card) {
      return card.name !== 'Fish' && card.name !== 'Birds';
    },
  });
}

function makeSmartbotActionWorkflow(state) {
  return {
    type: 'or',
    options: [
      {type: 'projectCard', title: 'Play project card', cards: state.cardsInHand},
      {
        type: 'card',
        title: 'Perform an action from a played card',
        selectBlueCardAction: true,
        cards: [{name: 'Development Center'}],
      },
    ],
  };
}

function runSmartbotSequence() {
  const smartbot = require(path.join(ROOT, 'bot', 'smartbot.js'));

  const firstState = loadFixture();
  firstState.waitingFor = null;
  const first = smartbot.handleInput(makeSmartbotActionWorkflow(firstState), firstState, 1);

  const secondState = loadFixture();
  secondState.waitingFor = null;
  secondState.cardsInHand = secondState.cardsInHand.filter((card) => card.name !== 'Fish');
  secondState.thisPlayer.cardsInHand = secondState.cardsInHand;
  secondState.thisPlayer.tableau = [...secondState.thisPlayer.tableau, {name: 'Fish', resources: 0}];
  const second = smartbot.handleInput(makeSmartbotActionWorkflow(secondState), secondState, 1);

  const colony = smartbot.handleInput({
    type: 'colony',
    title: 'Select where to build a colony',
    coloniesModel: [
      {name: 'Luna', colonies: []},
      {name: 'Europa', colonies: []},
      {name: 'Miranda', colonies: ['red']},
    ],
  }, secondState, 1);

  return {first, second, colony};
}

const py = runPythonSnapshot();
assert.strictEqual(py.decision_kind, 'minority_refuge_miranda');
assert(py.sequence, 'Python advisor should return a sequence payload');
assert.strictEqual(py.sequence.best.target_colony, 'Miranda');
assert.strictEqual(py.sequence.best.animal_target, 'Fish');
assert.strictEqual(py.sequence.best.setup_card, 'Fish');
assert(String(py.best_move).startsWith('Sequence: Play Fish -> Minority Refuge on Miranda'));

const js = runJsOverlay();
assert(js, 'JS overlay should return a recommendation');
assert.strictEqual(js.kind, 'sequence');
assert.strictEqual(js.title, 'Play Fish -> Minority Refuge');
assert.strictEqual(js.cardName, 'Fish');
assert(js.subtitle.includes('Miranda'), js.subtitle);
assert(js.reasonRows.some((row) => row.text.includes('+1 VP')), js.reasonRows);

assert.strictEqual(js.cardName, py.sequence.best.animal_target);
assert(py.best_move.includes('Minority Refuge'), py.best_move);
assert(py.best_move.includes('Miranda'), py.best_move);
assert(js.title.includes('Minority Refuge'), js.title);

const bot = runSmartbotSequence();
assert.strictEqual(bot.first.type, 'or');
assert.strictEqual(bot.first.response.type, 'projectCard');
assert.strictEqual(bot.first.response.card, 'Fish');
assert.strictEqual(bot.second.type, 'or');
assert.strictEqual(bot.second.response.type, 'projectCard');
assert.strictEqual(bot.second.response.card, 'Minority Refuge');
assert.deepStrictEqual(bot.colony, {type: 'colony', colonyName: 'Miranda'});
assert.strictEqual(bot.first.response.card, js.cardName);

console.log('decision sequence parity checks: OK');
