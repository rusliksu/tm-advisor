#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  getCanonicalGeneratedExtensionPath,
  getLegacyGeneratedExtensionPath,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'generated-extension-data'));
const {
  serializeJsVariable,
} = require(path.join(__dirname, 'build-ratings-data'));
const {
  buildSyncedRatings,
} = require(path.join(__dirname, 'sync-ratings'));

const VALID_TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'F']);
const evaluationsPath = path.join(ROOT, 'data', 'evaluations.json');
const cotdLookupPath = path.join(ROOT, 'data', 'cotd_lookup.json');

function scoreToTier(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pushLimited(list, message, limit = 20) {
  if (list.length < limit) {
    list.push(message);
  }
}

function validateEvaluations(evaluations, cotdLookup) {
  const errors = [];
  const warnings = [];
  const caseInsensitiveNames = new Map();

  for (const [key, card] of Object.entries(evaluations)) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      pushLimited(errors, `${key}: expected object value`);
      continue;
    }

    const name = card.name || key;
    if (typeof name !== 'string' || !name.trim()) {
      pushLimited(errors, `${key}: missing non-empty name`);
      continue;
    }

    const ciName = name.toLowerCase();
    const previous = caseInsensitiveNames.get(ciName);
    if (previous && previous !== name) {
      pushLimited(warnings, `case-colliding names: "${previous}" vs "${name}"`);
    } else {
      caseInsensitiveNames.set(ciName, name);
    }

    const hasScore = card.score !== undefined && card.score !== null;
    const hasTier = card.tier !== undefined && card.tier !== null && card.tier !== '';
    if (hasScore !== hasTier) {
      pushLimited(errors, `${name}: score/tier must either both exist or both be absent`);
    }

    if (hasScore) {
      if (typeof card.score !== 'number' || !Number.isFinite(card.score)) {
        pushLimited(errors, `${name}: score must be a finite number`);
      }
      if (!VALID_TIERS.has(card.tier)) {
        pushLimited(errors, `${name}: invalid tier "${card.tier}"`);
      } else {
        const expectedTier = scoreToTier(card.score);
        if (card.tier !== expectedTier) {
          pushLimited(errors, `${name}: tier "${card.tier}" does not match score ${card.score}; expected "${expectedTier}"`);
        }
      }
    }

    if (card.synergies !== undefined) {
      if (!Array.isArray(card.synergies) || card.synergies.some((item) => typeof item !== 'string')) {
        pushLimited(errors, `${name}: synergies must be an array of strings`);
      }
    }

    if (card.opening_hand_bias !== undefined && !Number.isInteger(card.opening_hand_bias)) {
      pushLimited(errors, `${name}: opening_hand_bias must be an integer`);
    }

    if (card.opening_hand_note !== undefined && typeof card.opening_hand_note !== 'string') {
      pushLimited(errors, `${name}: opening_hand_note must be a string`);
    }

    if (card.when_to_pick !== undefined && typeof card.when_to_pick !== 'string') {
      pushLimited(errors, `${name}: when_to_pick must be a string`);
    }

    if (card.economy !== undefined && typeof card.economy !== 'string') {
      pushLimited(errors, `${name}: economy must be a string`);
    }

    if (card.cotd_url) {
      const lookupEntries = cotdLookup[name] || cotdLookup[key];
      if (!Array.isArray(lookupEntries) || lookupEntries.length === 0) {
        pushLimited(warnings, `${name}: cotd_url present but no lookup entry found`);
      } else if (!lookupEntries.some((entry) => entry && entry.url === card.cotd_url)) {
        pushLimited(warnings, `${name}: cotd_url not found in cotd_lookup entries`);
      }
    }
  }

  return {errors, warnings};
}

function compareRatings(label, expectedJs, actualJs) {
  if (expectedJs === actualJs) return [];
  const expected = loadJsVarFromContent(expectedJs, 'TM_RATINGS');
  const actual = loadJsVarFromContent(actualJs, 'TM_RATINGS');
  const diffs = [];

  for (const [name, expectedEntry] of Object.entries(expected)) {
    if (!(name in actual)) {
      pushLimited(diffs, `${label}: missing ${name}`);
      continue;
    }
    if (JSON.stringify(expectedEntry) !== JSON.stringify(actual[name])) {
      pushLimited(diffs, `${label}: mismatch for ${name}`);
    }
  }

  for (const name of Object.keys(actual)) {
    if (!(name in expected)) {
      pushLimited(diffs, `${label}: unexpected ${name}`);
    }
  }

  return diffs;
}

function loadJsVarFromContent(source, varName) {
  const fn = new Function(`${source}\nreturn ${varName};`);
  return fn();
}

function main() {
  const evaluations = loadJson(evaluationsPath);
  const cotdLookup = loadJson(cotdLookupPath);
  const {errors, warnings} = validateEvaluations(evaluations, cotdLookup);

  const expectedRatings = buildSyncedRatings(evaluations);
  const expectedRatingsJs = serializeJsVariable('TM_RATINGS', expectedRatings);
  const canonicalRatingsPath = getCanonicalGeneratedExtensionPath('ratings.json.js');
  const legacyRatingsPath = getLegacyGeneratedExtensionPath('ratings.json.js');

  if (!fs.existsSync(canonicalRatingsPath)) {
    pushLimited(errors, `missing generated file: ${canonicalRatingsPath}`);
  }
  if (!fs.existsSync(legacyRatingsPath)) {
    pushLimited(errors, `missing generated file: ${legacyRatingsPath}`);
  }

  if (fs.existsSync(canonicalRatingsPath)) {
    const actualCanonicalJs = fs.readFileSync(canonicalRatingsPath, 'utf8');
    errors.push(...compareRatings('canonical ratings', expectedRatingsJs, actualCanonicalJs));
  }
  if (fs.existsSync(legacyRatingsPath)) {
    const actualLegacyJs = fs.readFileSync(legacyRatingsPath, 'utf8');
    errors.push(...compareRatings('legacy ratings', expectedRatingsJs, actualLegacyJs));
  }

  console.log(`evaluations.json: ${Object.keys(evaluations).length} entries`);
  console.log(`cotd_lookup.json: ${Object.keys(cotdLookup).length} keys`);
  console.log(`expected ratings: ${Object.keys(expectedRatings).length} entries`);

  if (warnings.length) {
    console.warn(`Warnings (${warnings.length}):`);
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
    if (warnings.length >= 20) {
      console.warn('  - warning output truncated');
    }
  }

  if (errors.length) {
    console.error(`Errors (${errors.length}):`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    if (errors.length >= 20) {
      console.error('  - error output truncated');
    }
    return 1;
  }

  console.log('Canonical data check: OK');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
