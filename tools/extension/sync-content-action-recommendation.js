#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(ROOT, 'apps', 'tm-extension', 'src', 'content-action-recommendation.js');
const targetPath = path.join(ROOT, 'extension', 'content-action-recommendation.js');

function sameFile(a, b) {
  return fs.existsSync(a) &&
    fs.existsSync(b) &&
    fs.readFileSync(a).equals(fs.readFileSync(b));
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing source file: ${sourcePath}`);
    return 1;
  }

  if (checkOnly) {
    const ok = sameFile(sourcePath, targetPath);
    console.log(`${path.relative(ROOT, targetPath)}: ${ok ? 'OK' : 'MISMATCH'}`);
    return ok ? 0 : 1;
  }

  fs.mkdirSync(path.dirname(targetPath), {recursive: true});
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Synced ${path.relative(ROOT, targetPath)}`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
