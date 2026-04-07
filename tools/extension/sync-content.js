#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(ROOT, 'apps', 'tm-extension', 'src', 'content.js');
const targetPath = path.join(ROOT, 'extension', 'content.js');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withBusyRetry(fn, label) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      const retryable = error && (error.code === 'EBUSY' || error.code === 'EPERM');
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      sleep(50 * attempt);
    }
  }
  throw new Error(`Unreachable retry exhaustion for ${label}`);
}

function sameFile(a, b) {
  return fs.existsSync(a) &&
    fs.existsSync(b) &&
    withBusyRetry(() => fs.readFileSync(a), a).equals(withBusyRetry(() => fs.readFileSync(b), b));
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
  withBusyRetry(() => fs.copyFileSync(sourcePath, targetPath), targetPath);
  console.log(`Synced ${path.relative(ROOT, targetPath)}`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
