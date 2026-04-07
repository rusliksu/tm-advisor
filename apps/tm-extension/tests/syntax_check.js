#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const JS_FILES = [
  'extension/background.js',
  'extension/content-badges.js',
  'extension/content-card-stats.js',
  'extension/content-cycle.js',
  'extension/content-draft-intel.js',
  'extension/content-draft-history.js',
  'extension/content-draft-poller.js',
  'extension/content-draft-recommendations.js',
  'extension/content-draft-tracker.js',
  'extension/content-gen-timer.js',
  'extension/content-hand-scores.js',
  'extension/content-hand-ui.js',
  'extension/content-log-ui.js',
  'extension/content-overlays.js',
  'extension/content-play-priority.js',
  'extension/content-player-meta.js',
  'extension/content-player-view.js',
  'extension/content-postgame.js',
  'extension/content-prelude-package.js',
  'extension/content-runtime-status.js',
  'extension/content-standard-projects.js',
  'extension/content-toast.js',
  'extension/content-tooltip.js',
  'extension/content-tooltip-state.js',
  'extension/content-vp-breakdown.js',
  'extension/content-vp-overlays.js',
  'extension/content.js',
  'extension/advisor-core.js',
  'extension/advisor-panel.js',
  'extension/advisor-workflow.js',
  'extension/game-watcher.js',
  'extension/gamelog.js',
  'extension/popup.js',
  'extension/presets.js',
  'extension/tm-brain.js',
  'extension/utils.js',
  'extension/vue-bridge.js',
  'extension/shared/brain-core.js',
  'extension/data/ratings.json.js',
  'extension/data/card_effects.json.js',
  'extension/data/scoring_config.json.js',
];

const JSON_FILES = [
  'extension/manifest.json',
];

function checkNodeSyntax(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  const result = spawnSync('node', ['-c', absPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`node -c failed for ${relPath}\n${result.stdout || ''}${result.stderr || ''}`.trim());
  }
}

function checkJsonParse(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function run() {
  for (const relPath of JS_FILES) checkNodeSyntax(relPath);
  for (const relPath of JSON_FILES) checkJsonParse(relPath);
  console.log('tm-extension syntax checks: OK');
}

module.exports = {run};

if (require.main === module) {
  run();
}
