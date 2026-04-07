'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifests = [
  'apps/tm-site/app-manifest.json',
  'apps/tm-extension/app-manifest.json',
  'apps/tm-smartbot/app-manifest.json',
  'apps/tm-advisor-py/app-manifest.json',
  'packages/tm-data/package-manifest.json',
  'packages/tm-brain-js/package-manifest.json',
  'packages/tm-advisor-js/package-manifest.json',
  'tools/architecture/tool-manifest.json',
  'tools/data/tool-manifest.json',
  'tools/brain/tool-manifest.json',
  'tools/advisor/tool-manifest.json',
  'tools/site/tool-manifest.json',
  'tools/extension/tool-manifest.json',
];

function readJson(relPath) {
  const absPath = path.join(repoRoot, relPath);
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function readText(relPath) {
  const absPath = path.join(repoRoot, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

function walkFiles(relPath, acc) {
  const absPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(absPath)) return;
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    acc.push(relPath);
    return;
  }
  for (const entry of fs.readdirSync(absPath, {withFileTypes: true})) {
    const childRel = path.join(relPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(childRel, acc);
    } else if (entry.isFile()) {
      acc.push(childRel);
    }
  }
}

function assertExists(relPath, errors, label) {
  const absPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(absPath)) {
    errors.push(`${label}: missing ${relPath}`);
    return false;
  }
  return true;
}

function compareMirror(pair, errors, label) {
  if (!assertExists(pair.path, errors, label) || !assertExists(pair.source, errors, label)) return;
  const runtime = readText(pair.path);
  const canonical = readText(pair.source);
  if (runtime !== canonical) {
    errors.push(`${label}: mirror mismatch ${pair.path} != ${pair.source}`);
  }
}

function checkAssertions(assertions, errors, label) {
  for (const assertion of assertions || []) {
    if (!assertExists(assertion.path, errors, label)) continue;
    const content = readText(assertion.path);
    for (const pattern of assertion.contains || []) {
      if (!content.includes(pattern)) {
        errors.push(`${label}: ${assertion.path} missing pattern ${JSON.stringify(pattern)}`);
      }
    }
    for (const pattern of assertion.not_contains || []) {
      if (content.includes(pattern)) {
        errors.push(`${label}: ${assertion.path} contains forbidden pattern ${JSON.stringify(pattern)}`);
      }
    }
  }
}

function checkScanAssertions(assertions, errors, label) {
  for (const assertion of assertions || []) {
    const files = [];
    const roots = assertion.roots || [];
    for (const root of roots) {
      walkFiles(root, files);
    }

    const allow = new Set(assertion.allow || []);
    const extensions = assertion.extensions || null;
    for (const relPath of files) {
      if (allow.has(relPath)) continue;
      if (extensions && !extensions.some((ext) => relPath.endsWith(ext))) continue;
      const content = readText(relPath);
      for (const pattern of assertion.not_contains || []) {
        if (content.includes(pattern)) {
          errors.push(`${label}: ${relPath} contains forbidden pattern ${JSON.stringify(pattern)} from scan assertion`);
        }
      }
    }
  }
}

function checkManifest(relPath) {
  const manifest = readJson(relPath);
  const errors = [];
  const label = manifest.name || relPath;

  for (const filePath of manifest.required_files || []) {
    assertExists(filePath, errors, label);
  }
  for (const filePath of manifest.shared_dependencies || []) {
    assertExists(filePath, errors, label);
  }
  for (const filePath of manifest.forbidden_files || []) {
    const absPath = path.join(repoRoot, filePath);
    if (fs.existsSync(absPath)) {
      errors.push(`${label}: forbidden file present ${filePath}`);
    }
  }
  for (const pair of manifest.runtime_mirrors || []) {
    compareMirror(pair, errors, label);
  }
  checkAssertions(manifest.path_assertions, errors, label);
  checkScanAssertions(manifest.scan_assertions, errors, label);

  if (errors.length) {
    for (const error of errors) console.error(error);
    return false;
  }

  console.log(`${label}: OK`);
  return true;
}

function run() {
  let ok = true;
  for (const manifestPath of manifests) {
    ok = checkManifest(manifestPath) && ok;
  }
  return ok;
}

if (require.main === module) {
  process.exit(run() ? 0 : 1);
}

module.exports = {run};
