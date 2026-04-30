#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'manual-ev.js');
const targetPaths = [
  path.join(ROOT, 'extension', 'shared', 'manual-ev.js'),
  path.join(ROOT, 'bot', 'shared', 'manual-ev.js'),
];

function sameFile(a, b) {
  return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing source file: ${sourcePath}`);
    return 1;
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  let hasIssues = false;

  for (const targetPath of targetPaths) {
    if (checkOnly) {
      const ok = sameFile(sourcePath, targetPath);
      console.log(`${path.relative(ROOT, targetPath)}: ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) hasIssues = true;
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), {recursive: true});
    fs.writeFileSync(targetPath, source, 'utf8');
    console.log(`Synced ${path.relative(ROOT, targetPath)}`);
  }

  return checkOnly && hasIssues ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
