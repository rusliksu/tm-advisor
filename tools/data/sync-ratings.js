#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  writeGeneratedExtensionFile,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'generated-extension-data'));
const {
  buildRatingsFromEvaluations,
  serializeJsVariable,
} = require(path.join(__dirname, 'build-ratings-data'));

const evalPath = path.join(ROOT, 'data', 'evaluations.json');
function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');
  const evaluations = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const ratings = buildRatingsFromEvaluations(evaluations);
  const output = serializeJsVariable('TM_RATINGS', ratings);

  if (checkOnly) {
    const check = require(path.join(__dirname, 'check-canonical'));
    return check.main();
  }

  const out = writeGeneratedExtensionFile('ratings.json.js', output, 'utf8');
  console.log(`Synced ratings.json.js: ${Object.keys(ratings).length} entries`);
  console.log(`Canonical: ${out.canonicalPath}`);
  console.log(`Legacy mirror: ${out.legacyPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
