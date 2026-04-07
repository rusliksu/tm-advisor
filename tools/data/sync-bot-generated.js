#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(ROOT, 'packages', 'tm-data', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bundle = manifest.generated_bundles?.bot;
const files = bundle?.files || [];
const canonicalDir = path.join(ROOT, bundle?.canonical_output_dir || '');
const legacyDir = path.join(ROOT, bundle?.legacy_mirror_dir || '');

function sameFile(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  if (!bundle || files.length === 0) {
    console.error('No bot generated bundle files declared in packages/tm-data/manifest.json');
    return 1;
  }

  let hasIssues = false;

  if (checkOnly) {
    console.log('Checking generated smartbot bundle files...');
    for (const filename of files) {
      const canonicalPath = path.join(canonicalDir, filename);
      const legacyPath = path.join(legacyDir, filename);
      const ok = sameFile(canonicalPath, legacyPath);
      console.log(`  ${filename}: ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) {
        console.log(`    canonical: ${canonicalPath}`);
        console.log(`    legacy: ${legacyPath}`);
        hasIssues = true;
      }
    }
    if (hasIssues) return 1;
    console.log(`Done: ${files.length} files checked.`);
    return 0;
  }

  fs.mkdirSync(canonicalDir, {recursive: true});
  console.log('Syncing generated smartbot bundle files...');
  for (const filename of files) {
    const canonicalPath = path.join(canonicalDir, filename);
    const legacyPath = path.join(legacyDir, filename);
    if (!fs.existsSync(legacyPath)) {
      console.error(`Missing smartbot runtime file: ${legacyPath}`);
      hasIssues = true;
      continue;
    }
    fs.copyFileSync(legacyPath, canonicalPath);
    console.log(`  ${filename}`);
    console.log(`    source: ${legacyPath}`);
    console.log(`    canonical: ${canonicalPath}`);
  }

  if (hasIssues) return 1;
  console.log(`Done: ${files.length} files synced.`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
