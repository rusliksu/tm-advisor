#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.join(__dirname, 'check-core-drift.js');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function runCheck(args, env = {}) {
  return childProcess.spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {...process.env, ...env},
  });
}

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-core-drift-'));

process.on('exit', () => {
  fs.rmSync(tempRoot, {recursive: true, force: true});
});

test('fails when local evaluations drift from core', () => {
  const coreFile = path.join(tempRoot, 'core-drift.json');
  const localFile = path.join(tempRoot, 'local-drift.json');
  writeJson(coreFile, {
    'Earth Catapult': {score: 88, tier: 'A', notes: 'canonical'},
    'Protected Habitats': {score: 84, tier: 'A'},
    'Core Only': {score: 50, tier: 'C'},
  });
  writeJson(localFile, {
    'Earth Catapult': {score: 92, tier: 'S', notes: 'local experiment'},
    'Protected Habitats': {score: 70, tier: 'B'},
    'Local Only': {score: 55, tier: 'C'},
  });

  const result = runCheck(['--core', coreFile, '--local', localFile, '--max-examples', '10']);
  const output = outputOf(result);

  assert.strictEqual(result.status, 1, output);
  assert.match(output, /core drift check: FAILED/);
  assert.match(output, /score\/tier mismatches: 2/);
  assert.match(output, /missing in local: 1/);
  assert.match(output, /extra in local: 1/);
  assert.match(output, /Earth Catapult: core=88\/A local=92\/S/);
});

test('allows known drift only when explicitly requested', () => {
  const coreFile = path.join(tempRoot, 'core-allowed.json');
  const localFile = path.join(tempRoot, 'local-allowed.json');
  writeJson(coreFile, {
    Insects: {score: 88, tier: 'A'},
  });
  writeJson(localFile, {
    Insects: {score: 76, tier: 'B'},
  });

  const result = runCheck(['--core', coreFile, '--local', localFile, '--allow-drift']);
  const output = outputOf(result);

  assert.strictEqual(result.status, 0, output);
  assert.match(output, /core drift check: WARNING/);
  assert.match(output, /drift allowed/);
  assert.match(output, /Insects: core=88\/A local=76\/B/);
});

test('passes when score and tier match even if notes differ', () => {
  const coreFile = path.join(tempRoot, 'core-clean.json');
  const localFile = path.join(tempRoot, 'local-clean.json');
  writeJson(coreFile, {
    Asimov: {score: 40, tier: 'D', notes: 'weak CEO'},
  });
  writeJson(localFile, {
    Asimov: {score: 40, tier: 'D', notes: 'local wording'},
  });

  const result = runCheck(['--core', coreFile, '--local', localFile]);
  const output = outputOf(result);

  assert.strictEqual(result.status, 0, output);
  assert.match(output, /core drift check: OK/);
});
