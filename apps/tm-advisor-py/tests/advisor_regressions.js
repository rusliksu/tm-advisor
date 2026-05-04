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
  candidates.push(['python']);
  candidates.push(['py', '-3']);

  let lastFailure = null;
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    if (result.error) {
      lastFailure = result.error;
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

  throw lastFailure || new Error('Failed to run advisor opening regressions');
}

function runNodeScript(scriptPath) {
  const script = path.join(REPO_ROOT, scriptPath);
  const result = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${scriptPath} failed with ${result.status}`);
  }
}

function run() {
  testCollectWorkflowCardNamesTraversesNestedOptions();
  testCollectWorkflowCardNamesIgnoresEmptyNodes();
  runPythonScript('opening_regressions.py');
  runPythonScript('snapshot_output_regressions.py');
  runPythonScript('summary_selection_regressions.py');
  runPythonScript('turmoil_policy_regressions.py');
  runPythonScript('colorama_fallback_regressions.py');
  runPythonScript('arctic_algae_regressions.py');
  runPythonScript('action_value_regressions.py');
  runPythonScript('action_ordering_regressions.py');
  runPythonScript('late_scoring_regressions.py');
  runPythonScript('late_colony_regressions.py');
  runPythonScript('late_draw_regressions.py');
  runPythonScript('astra_consistency_regressions.py');
  runPythonScript('watch_live_logging_regressions.py');
  runNodeScript(path.join('tools', 'advisor', 'decision-sequence-parity.test.js'));
  console.log('advisor regression checks: OK');
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
