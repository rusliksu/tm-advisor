#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_REF = 'codex/advisor-live-fixes-20260421';

const REQUIRED_FILES = [
  'extension/content-game-signals.js',
  'extension/content-game-overlays.js',
  'extension/content-action-recommendation.js',
  'extension/content-route-validators.js',
  'extension/shared/manual-ev.js',
  'extension/advisor-panel.js',
  'extension/shared/brain-core.js',
  'extension/vue-bridge.js',
];

const REQUIRED_MANIFEST_JS = [
  'shared/manual-ev.js',
  'content-game-signals.js',
  'content-game-overlays.js',
  'content-action-recommendation.js',
  'content-route-validators.js',
  'content-play-priority.js',
  'content-runtime-status.js',
  'advisor-panel.js',
];

const ORDERED_MANIFEST_PAIRS = [
  ['shared/manual-ev.js', 'tm-brain.js'],
  ['content-game-signals.js', 'content-game-overlays.js'],
  ['content-game-overlays.js', 'content-action-recommendation.js'],
  ['content-action-recommendation.js', 'advisor-panel.js'],
];

const REQUIRED_SNIPPETS = [
  {
    path: 'extension/advisor-panel.js',
    contains: [
      'function panelIsMyActionTurn(state)',
      'panelIsMyActionTurn(state) || !spModule',
    ],
  },
  {
    path: 'extension/shared/brain-core.js',
    contains: [
      'function actionLabelText(value)',
      'function optionActionLabel(opt, fallback)',
    ],
  },
  {
    path: 'extension/vue-bridge.js',
    contains: [
      'function clearWaitingFor(status)',
      "pushActionEvent({ type: 'waitingForClear'",
    ],
  },
];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function readManifest(errors) {
  const relPath = 'extension/manifest.json';
  if (!fileExists(relPath)) {
    errors.push(`${relPath}: missing`);
    return null;
  }

  try {
    return JSON.parse(readText(relPath));
  } catch (error) {
    errors.push(`${relPath}: invalid JSON: ${error.message}`);
    return null;
  }
}

function getManifestScripts(manifest) {
  const entries = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  return entries.flatMap((entry) => Array.isArray(entry.js) ? entry.js : []);
}

function checkRequiredFiles(errors) {
  for (const relPath of REQUIRED_FILES) {
    if (!fileExists(relPath)) {
      errors.push(`${relPath}: missing from live advisor bundle`);
    }
  }
}

function checkManifest(errors) {
  const manifest = readManifest(errors);
  if (!manifest) return;

  const scripts = getManifestScripts(manifest);
  for (const scriptName of REQUIRED_MANIFEST_JS) {
    if (!scripts.includes(scriptName)) {
      errors.push(`extension/manifest.json: missing content script ${scriptName}`);
    }
  }

  for (const [before, after] of ORDERED_MANIFEST_PAIRS) {
    const beforeIndex = scripts.indexOf(before);
    const afterIndex = scripts.indexOf(after);
    if (beforeIndex === -1 || afterIndex === -1) continue;
    if (beforeIndex > afterIndex) {
      errors.push(`extension/manifest.json: ${before} must load before ${after}`);
    }
  }
}

function checkSnippets(errors) {
  for (const assertion of REQUIRED_SNIPPETS) {
    if (!fileExists(assertion.path)) continue;
    const content = readText(assertion.path);
    for (const snippet of assertion.contains) {
      if (!content.includes(snippet)) {
        errors.push(`${assertion.path}: missing live advisor marker ${JSON.stringify(snippet)}`);
      }
    }
  }
}

function run() {
  const errors = [];

  checkRequiredFiles(errors);
  checkManifest(errors);
  checkSnippets(errors);

  if (errors.length) {
    console.error('Live advisor bundle check: FAILED');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    console.error(`Restore command: git checkout ${LIVE_REF} -- extension`);
    return false;
  }

  console.log('Live advisor bundle check: OK');
  return true;
}

if (require.main === module) {
  process.exit(run() ? 0 : 1);
}

module.exports = {run};
