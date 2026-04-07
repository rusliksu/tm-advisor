#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'card-variants.js');
const targetPaths = [
  path.join(ROOT, 'bot', 'shared', 'card-variants.js'),
];

// Extension keeps its own format (global vars, no UMD) for script tag loading.
// Generate extension-compatible version from canonical source.
const extensionTargetPath = path.join(ROOT, 'extension', 'data', 'card_variants.js');

function sameFile(a, b) {
  return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

function generateExtensionVersion(source) {
  // Extract the data and functions, wrap as plain globals (extension loads via <script>)
  const mod = require(sourcePath);
  const lines = [
    '/**',
    ' * Variant card rating overrides and expansion variant rules.',
    ' * Single source of truth — used by content.js, tm-brain.js, popup.js.',
    ' * GENERATED from packages/tm-brain-js/src/card-variants.js — do not edit directly.',
    ' */',
    '',
    '// eslint-disable-next-line no-unused-vars',
    'var TM_VARIANT_RATING_OVERRIDES = ' + JSON.stringify(mod.TM_VARIANT_RATING_OVERRIDES, null, 2) + ';',
    '',
    '// eslint-disable-next-line no-unused-vars',
    'var TM_CARD_VARIANT_RULES = ' + JSON.stringify(mod.TM_CARD_VARIANT_RULES, null, 2) + ';',
    '',
    '// eslint-disable-next-line no-unused-vars',
    'var TM_VARIANT_SUFFIX_RE = ' + mod.TM_VARIANT_SUFFIX_RE.toString() + ';',
    '',
    '// eslint-disable-next-line no-unused-vars',
    'function tmBaseCardName(name) {',
    '  if (!name) return name;',
    '  return name',
    '    .replace(TM_VARIANT_SUFFIX_RE, \'\')',
    '    .replace(/\\\\\\\\+$/, \'\');',
    '}',
    '',
    '// eslint-disable-next-line no-unused-vars',
    'function tmIsVariantOptionEnabled(rule, game, opts) {',
    '  if (!rule) return false;',
    '  if (rule.option === \'ares\') {',
    '    return !!(',
    '      (game && game.ares) ||',
    '      (opts && opts.ares) ||',
    '      (opts && opts.aresExtension) ||',
    '      (opts && opts.aresExpansion) ||',
    '      (opts && typeof opts.boardName === \'string\' && opts.boardName.toLowerCase().indexOf(\'ares\') >= 0)',
    '    );',
    '  }',
    '  return !!(opts && opts[rule.option]);',
    '}',
    '',
  ];
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing source file: ${sourcePath}`);
    return 1;
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  let hasIssues = false;

  // Sync UMD version to bot/shared/
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
