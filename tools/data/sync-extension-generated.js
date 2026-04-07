#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  getCanonicalGeneratedExtensionPath,
  getLegacyGeneratedExtensionPath,
  syncGeneratedExtensionFile,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'generated-extension-data'));

const manifestPath = path.join(ROOT, 'packages', 'tm-data', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const files = manifest.generated_bundles?.extension?.files || [];
const orphanRootRatingsPath = path.join(ROOT, 'extension', 'ratings.json.js');

function sameFile(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  if (files.length === 0) {
    console.error('No extension generated bundle files declared in packages/tm-data/manifest.json');
    return 1;
  }

  let hasIssues = false;

  if (checkOnly) {
    console.log('Checking generated extension bundle files...');
    for (const filename of files) {
      const canonicalPath = getCanonicalGeneratedExtensionPath(filename);
      const legacyPath = getLegacyGeneratedExtensionPath(filename);
      const ok = sameFile(canonicalPath, legacyPath);
      console.log(`  ${filename}: ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) {
        console.log(`    canonical: ${canonicalPath}`);
        console.log(`    legacy: ${legacyPath}`);
        hasIssues = true;
      }
    }
  } else {
    console.log('Syncing generated extension bundle files...');
    for (const filename of files) {
      const out = syncGeneratedExtensionFile(filename);
      console.log(`  ${filename}`);
      console.log(`    source: ${out.sourcePath}`);
      console.log(`    canonical: ${out.canonicalPath}`);
      console.log(`    legacy: ${out.legacyPath}`);
    }
  }

  if (fs.existsSync(orphanRootRatingsPath)) {
    const canonicalRatingsPath = getCanonicalGeneratedExtensionPath('ratings.json.js');
    const orphanMatchesCanonical = sameFile(orphanRootRatingsPath, canonicalRatingsPath);
    if (!orphanMatchesCanonical) {
      console.warn('WARNING: orphan legacy file differs from canonical bundle');
      console.warn(`  orphan: ${orphanRootRatingsPath}`);
      console.warn(`  canonical: ${canonicalRatingsPath}`);
      console.warn('  active runtime/scripts should use packages/tm-data/generated/extension and extension/data mirror instead');
    } else {
      console.log(`Orphan root ratings mirror matches canonical: ${orphanRootRatingsPath}`);
    }
  }

  if (checkOnly && hasIssues) return 1;
  console.log(checkOnly ? `Done: ${files.length} files checked.` : `Done: ${files.length} files synced.`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
