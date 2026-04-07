'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_EXTENSION_GENERATED_DIR = path.join(
  ROOT,
  'packages',
  'tm-data',
  'generated',
  'extension',
);
const LEGACY_EXTENSION_DATA_DIR = path.join(ROOT, 'extension', 'data');

function getCanonicalGeneratedExtensionPath(filename) {
  return path.join(CANONICAL_EXTENSION_GENERATED_DIR, filename);
}

function getLegacyGeneratedExtensionPath(filename) {
  return path.join(LEGACY_EXTENSION_DATA_DIR, filename);
}

function resolveGeneratedExtensionPath(filename) {
  const canonicalPath = getCanonicalGeneratedExtensionPath(filename);
  if (fs.existsSync(canonicalPath)) {
    return canonicalPath;
  }
  return getLegacyGeneratedExtensionPath(filename);
}

function readGeneratedExtensionFile(filename, encoding = 'utf8') {
  return fs.readFileSync(resolveGeneratedExtensionPath(filename), encoding);
}

function syncGeneratedExtensionFile(filename, encoding = 'utf8') {
  const sourcePath = resolveGeneratedExtensionPath(filename);
  const content = fs.readFileSync(sourcePath, encoding);
  const out = writeGeneratedExtensionFile(filename, content, encoding);
  return {sourcePath, ...out};
}

function writeGeneratedExtensionFile(filename, content, encoding = 'utf8') {
  const canonicalPath = getCanonicalGeneratedExtensionPath(filename);
  const legacyPath = getLegacyGeneratedExtensionPath(filename);

  fs.mkdirSync(path.dirname(canonicalPath), {recursive: true});
  fs.mkdirSync(path.dirname(legacyPath), {recursive: true});

  fs.writeFileSync(canonicalPath, content, encoding);
  fs.writeFileSync(legacyPath, content, encoding);

  return {canonicalPath, legacyPath};
}

module.exports = {
  CANONICAL_EXTENSION_GENERATED_DIR,
  LEGACY_EXTENSION_DATA_DIR,
  ROOT,
  getCanonicalGeneratedExtensionPath,
  getLegacyGeneratedExtensionPath,
  readGeneratedExtensionFile,
  resolveGeneratedExtensionPath,
  syncGeneratedExtensionFile,
  writeGeneratedExtensionFile,
};
