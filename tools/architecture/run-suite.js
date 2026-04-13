#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scriptNames = Object.keys(packageJson.scripts || {});

function unique(items) {
  return [...new Set(items)];
}

function getScriptsByPrefix(prefix) {
  return scriptNames
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));
}

const suites = {
  'check:all': unique([
    'arch:check-modules',
    ...getScriptsByPrefix('brain:check-'),
    ...getScriptsByPrefix('advisor:check-'),
    ...getScriptsByPrefix('data:check-'),
    ...getScriptsByPrefix('extension:check-'),
    'site:check',
  ]),
  'sync:all': unique([
    ...getScriptsByPrefix('brain:sync-'),
    ...getScriptsByPrefix('advisor:sync-'),
    ...getScriptsByPrefix('data:sync-'),
    ...getScriptsByPrefix('extension:sync-'),
    'site:sync',
  ]),
  'test:fast': [
    'data:check-canonical',
    'test',
    'test:brain-core',
    'test:advisor-opening',
    'test:bot',
    'test:syntax',
  ],
};

function runScript(scriptName) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const startedAt = Date.now();
  console.log(`\n>>> ${scriptName}`);
  const result = spawnSync(`${npmCmd} run --silent ${scriptName}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  const durationMs = Date.now() - startedAt;
  const durationSec = (durationMs / 1000).toFixed(1);

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error);
    }
    console.error(`<<< ${scriptName}: FAILED (${durationSec}s)`);
    return false;
  }

  console.log(`<<< ${scriptName}: OK (${durationSec}s)`);
  return true;
}

function main(argv = process.argv.slice(2)) {
  const suiteName = argv[0];
  if (!suiteName || !suites[suiteName]) {
    console.error(`Usage: node tools/architecture/run-suite.js <${Object.keys(suites).join('|')}>`);
    return 1;
  }

  const scripts = suites[suiteName];
  console.log(`Running suite ${suiteName} (${scripts.length} scripts)`);

  for (const script of scripts) {
    if (!packageJson.scripts[script]) {
      console.error(`Missing package.json script: ${script}`);
      return 1;
    }
    if (!runScript(script)) {
      return 1;
    }
  }

  console.log(`\nSuite ${suiteName}: OK`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main, suites};
