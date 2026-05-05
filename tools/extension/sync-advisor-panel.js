#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  ['apps/tm-extension/src/advisor-panel.js', 'extension/advisor-panel.js'],
  ['apps/tm-extension/src/advisor-panel.css', 'extension/advisor-panel.css'],
];

function sameFile(a, b) {
  return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');
  let ok = true;

  for (const [sourceRel, targetRel] of FILES) {
    const sourcePath = path.join(ROOT, sourceRel);
    const targetPath = path.join(ROOT, targetRel);

    if (!fs.existsSync(sourcePath)) {
      console.error(`Missing source file: ${sourcePath}`);
      return 1;
    }

    if (checkOnly) {
      const same = sameFile(sourcePath, targetPath);
      console.log(`${targetRel}: ${same ? 'OK' : 'MISMATCH'}`);
      ok = ok && same;
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), {recursive: true});
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Synced ${targetRel}`);
  }

  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
