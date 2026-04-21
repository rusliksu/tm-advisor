#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  writeGeneratedExtensionFile,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'generated-extension-data'));
const {
  buildRatingsFromEvaluations,
  serializeJsVariable,
} = require(path.join(__dirname, 'build-ratings-data'));

const evalPath = path.join(ROOT, 'data', 'evaluations.json');
const advisorNotesRuPath = path.join(ROOT, 'data', 'advisor_notes_ru.json');

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanDescriptionForLocaleMatch(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized
    .replace(/^Effect:\s*/i, '')
    .replace(/^Action:\s*/i, '')
    .replace(/\b(?:tag|item|symbol|effect|action|root|text|plate)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .;|]+$/g, '');
}

function normalizeName(name) {
  return normalizeText(name).toLowerCase();
}

function loadOptionalJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rememberDescription(lookup, normalizedLookup, name, description) {
  const normalizedName = normalizeName(name);
  const normalizedDescription = normalizeText(description);
  if (!normalizedName || !normalizedDescription || normalizedLookup.has(normalizedName)) return;
  normalizedLookup.add(normalizedName);
  lookup[name] = normalizedDescription;
}

function buildDescriptionRuByName() {
  const lookup = {};
  const normalizedLookup = new Set();
  const localePath = path.resolve(ROOT, '..', 'terraforming-mars', 'assets', 'locales', 'ru.json');
  const localeStrings = loadOptionalJson(localePath, {});

  function resolveLocalizedDescription(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const directRu = normalizeText(entry.description_ru);
    if (directRu) return directRu;
    const description = normalizeText(entry.description);
    const cleanedDescription = cleanDescriptionForLocaleMatch(entry.description);
    const cleanedWithPeriod = cleanedDescription ? `${cleanedDescription}.` : '';
    for (const candidate of [description, cleanedDescription, cleanedWithPeriod]) {
      if (candidate && typeof localeStrings[candidate] === 'string') {
        return normalizeText(localeStrings[candidate]);
      }
    }
    return '';
  }

  const cardIndexPath = path.join(ROOT, 'data', 'card_index.json');
  const cardIndex = loadOptionalJson(cardIndexPath, {});
  for (const [name, entry] of Object.entries(cardIndex || {})) {
    rememberDescription(lookup, normalizedLookup, name, resolveLocalizedDescription(entry));
  }

  for (const filename of ['all_cards.json', 'corporations.json', 'preludes.json', 'ceo_cards.json', 'pathfinder_cards.json']) {
    const filePath = path.join(ROOT, 'data', filename);
    const raw = loadOptionalJson(filePath, []);
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || !entry.name) continue;
      rememberDescription(lookup, normalizedLookup, entry.name, resolveLocalizedDescription(entry));
    }
  }

  return lookup;
}

function buildSyncedRatings(evaluationsOverride) {
  const evaluations = evaluationsOverride || JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const advisorNotesRu = fs.existsSync(advisorNotesRuPath)
    ? JSON.parse(fs.readFileSync(advisorNotesRuPath, 'utf8'))
    : {};
  const descriptionRuByName = buildDescriptionRuByName();
  return buildRatingsFromEvaluations(evaluations, {advisorNotesRu, descriptionRuByName});
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');
  const evaluations = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const ratings = buildSyncedRatings(evaluations);
  const output = serializeJsVariable('TM_RATINGS', ratings);

  if (checkOnly) {
    const check = require(path.join(__dirname, 'check-canonical'));
    return check.main();
  }

  const out = writeGeneratedExtensionFile('ratings.json.js', output, 'utf8');
  console.log(`Synced ratings.json.js: ${Object.keys(ratings).length} entries`);
  console.log(`Canonical: ${out.canonicalPath}`);
  console.log(`Legacy mirror: ${out.legacyPath}`);
  return 0;
}

module.exports = {
  buildDescriptionRuByName,
  buildSyncedRatings,
  main,
};

if (require.main === module) {
  process.exit(main());
}
