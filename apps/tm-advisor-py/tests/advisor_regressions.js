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

function runPythonOpeningRegressions() {
  const script = path.join(REPO_ROOT, 'apps', 'tm-advisor-py', 'tests', 'opening_regressions.py');
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

function run() {
  testCollectWorkflowCardNamesTraversesNestedOptions();
  testCollectWorkflowCardNamesIgnoresEmptyNodes();
  runPythonOpeningRegressions();
  console.log('advisor regression checks: OK');
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
