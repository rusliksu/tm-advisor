#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildRatingsFromEvaluations,
} = require('./build-ratings-data');

const longNote = 'Очень длинная заметка '.repeat(10);
const ratings = buildRatingsFromEvaluations({
  'Mars University': {
    name: 'Mars University',
    score: 70,
    tier: 'B',
    description_ru: 'Описание из evaluations',
  },
  'Olympus Conference': {
    name: 'Olympus Conference',
    score: 72,
    tier: 'B',
  },
  'Invention Contest': {
    name: 'Invention Contest',
    score: 70,
    tier: 'B',
  },
}, {
  advisorNotesRu: {
    'mars university': longNote,
    'Olympus   Conference': 'Сохраняет science-trigger заметку',
  },
  descriptionRuByName: {
    'Mars University': 'Описание из fallback не должно победить',
    'olympus conference': 'Описание из normalized fallback',
  },
});

assert.strictEqual(ratings['Mars University'].dr, 'Описание из evaluations');
assert.ok(ratings['Mars University'].nr.length <= 120);
assert.ok(ratings['Mars University'].nr.endsWith('...'));
assert.strictEqual(ratings['Olympus Conference'].nr, 'Сохраняет science-trigger заметку');
assert.strictEqual(ratings['Olympus Conference'].dr, 'Описание из normalized fallback');
assert.strictEqual(Object.prototype.hasOwnProperty.call(ratings['Invention Contest'], 'nr'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(ratings['Invention Contest'], 'dr'), false);

console.log('build-ratings-data checks: OK');
