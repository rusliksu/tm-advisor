#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKFLOW = require(path.join(REPO_ROOT, 'packages', 'tm-advisor-js', 'src', 'advisor-workflow.js'));

function testCollectWorkflowCardNamesTraversesNestedOptions() {
  const waitingFor = {
    type: 'or',
    options: [
      {
        type: 'card',
        title: 'Draft cards',
        cards: [{name: 'Comet'}, {name: 'Asteroid'}],
      },
      {
        type: 'and',
        andOptions: [
          {
            type: 'card',
            cards: [{name: 'Trees'}],
          },
          {
            type: 'or',
            options: [
              {
                type: 'card',
                cards: [{name: 'Comet'}, {name: 'Research Outpost'}],
              },
            ],
          },
        ],
      },
    ],
  };

  const names = WORKFLOW.collectWorkflowCardNames(waitingFor);
  assert.deepStrictEqual(names, ['Comet', 'Asteroid', 'Trees', 'Research Outpost']);
}

function testCollectWorkflowCardNamesIgnoresEmptyNodes() {
  const names = WORKFLOW.collectWorkflowCardNames({
    type: 'or',
    options: [null, {type: 'noop'}, {type: 'card', cards: []}],
  });
  assert.deepStrictEqual(names, []);
}

function runPythonScript(scriptName) {
  const script = path.join(REPO_ROOT, 'apps', 'tm-advisor-py', 'tests', scriptName);
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON]);
  candidates.push(['python3']);
  candidates.push(['python']);
  if (process.platform === 'win32') candidates.push(['py', '-3']);

  let lastFailure = null;
  let missingCommandFailure = null;
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    if (result.error) {
      missingCommandFailure = result.error;
      continue;
    }
    if (result.status === 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      return;
    }
    lastFailure = new Error(
      `${candidate.join(' ')} failed with ${result.status}\n${result.stdout || ''}${result.stderr || ''}`.trim(),
    );
  }

  throw lastFailure || missingCommandFailure || new Error('Failed to run advisor opening regressions');
}

function run() {
  testCollectWorkflowCardNamesTraversesNestedOptions();
  testCollectWorkflowCardNamesIgnoresEmptyNodes();
  runPythonScript('opening_regressions.py');
  runPythonScript('action_ordering_regressions.py');
  runPythonScript('late_scoring_regressions.py');
  runPythonScript('late_colony_regressions.py');
  runPythonScript('late_draw_regressions.py');
  runPythonScript('endgame_allocation_regressions.py');
  runPythonScript('snapshot_regressions.py');
  runPythonScript('claude_output_regressions.py');
  runPythonScript('advisor_live_audit_regressions.py');
  runPythonScript('watch_live_game_regressions.py');
  runPythonScript('game_logger_regressions.py');
  runPythonScript('opponent_intent_regressions.py');
  runPythonScript('microbe_resource_regressions.py');
  runPythonScript('astra_consistency_regressions.py');
  console.log('advisor regression checks: OK');
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
