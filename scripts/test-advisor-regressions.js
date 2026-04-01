#!/usr/bin/env node
'use strict';

const assert = require('assert');
const WORKFLOW = require('../extension/advisor-workflow.js');

function testCollectWorkflowCardNamesTraversesNestedOptions() {
  const waitingFor = {
    type: 'or',
    options: [
      {
        type: 'card',
        title: 'Draft cards',
        cards: [{ name: 'Comet' }, { name: 'Asteroid' }],
      },
      {
        type: 'and',
        andOptions: [
          {
            type: 'card',
            cards: [{ name: 'Trees' }],
          },
          {
            type: 'or',
            options: [
              {
                type: 'card',
                cards: [{ name: 'Comet' }, { name: 'Research Outpost' }],
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
    options: [null, { type: 'noop' }, { type: 'card', cards: [] }],
  });
  assert.deepStrictEqual(names, []);
}

function run() {
  testCollectWorkflowCardNamesTraversesNestedOptions();
  testCollectWorkflowCardNamesIgnoresEmptyNodes();
  console.log('advisor regression checks: OK');
}

run();
