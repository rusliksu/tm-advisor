#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BASE_URL = 'https://bga-tm-scraper-functions.azurewebsites.net';
const DEFAULT_TIMEOUT_MS = 30000;

const ENDPOINTS = Object.freeze({
  global: {
    path: '/api/GetGlobalStatistics',
    output: 'data/tfmstats_global_statistics.json',
    validate: validateGlobalStatistics,
    count: (payload) => Object.keys(payload || {}).length,
  },
  cards: {
    path: '/api/cards/stats',
    output: 'data/tfmstats_card_stats.json',
    validate: (payload) => validateCardStats(payload, 'cards'),
    count: (payload) => payload.length,
  },
  'card-options': {
    path: '/api/cards/option-stats',
    output: 'data/tfmstats_card_option_stats.json',
    validate: (payload) => validateCardStats(payload, 'card-options'),
    count: (payload) => payload.length,
  },
  'starting-hands': {
    path: '/api/startinghands/stats',
    output: 'data/tfmstats_starting_hand_stats.json',
    validate: validateStartingHandStats,
    count: (payload) => payload.length,
  },
});

const ENDPOINT_ALIASES = Object.freeze({
  all: 'all',
  card: 'cards',
  'card-stats': 'cards',
  cards: 'cards',
  options: 'card-options',
  'option-stats': 'card-options',
  'card-option-stats': 'card-options',
  'card-options': 'card-options',
  global: 'global',
  startinghands: 'starting-hands',
  'starting-hand': 'starting-hands',
  'starting-hands': 'starting-hands',
  'starting-hand-stats': 'starting-hands',
});

function usage() {
  const endpointList = Object.keys(ENDPOINTS).join(', ');
  return [
    'Usage: node tools/data/import-tfmstats.js [--check|--write] [--endpoint NAME] [--base URL]',
    '',
    'Fetches public TFMStats API data and validates the payload before writing it.',
    '',
    'Options:',
    '  --check              Fetch and validate only. This is the default.',
    '  --write              Fetch, validate, and update local data/*.json files.',
    '  --endpoint NAME      Limit to one endpoint. Repeat or comma-separate for several.',
    '  --base URL           Override TFMSTATS_API_BASE for this run.',
    '  --timeout-ms N       Request timeout in milliseconds.',
    '  --help               Show this help.',
    '',
    `Endpoints: ${endpointList}`,
    '',
    'Required environment:',
    '  TFMSTATS_API_KEY     Azure Functions key from the TFMStats frontend/API.',
    '',
    'Optional environment:',
    `  TFMSTATS_API_BASE    Defaults to ${DEFAULT_BASE_URL}`,
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    mode: 'check',
    baseUrl: process.env.TFMSTATS_API_BASE || DEFAULT_BASE_URL,
    apiKey: process.env.TFMSTATS_API_KEY || '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    endpoints: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--check') {
      options.mode = 'check';
    } else if (arg === '--write') {
      options.mode = 'write';
    } else if (arg === '--endpoint') {
      index += 1;
      if (index >= argv.length) throw new Error('--endpoint requires a value');
      options.endpoints.push(...splitEndpointList(argv[index]));
    } else if (arg.startsWith('--endpoint=')) {
      options.endpoints.push(...splitEndpointList(arg.slice('--endpoint='.length)));
    } else if (arg === '--base') {
      index += 1;
      if (index >= argv.length) throw new Error('--base requires a URL');
      options.baseUrl = argv[index];
    } else if (arg.startsWith('--base=')) {
      options.baseUrl = arg.slice('--base='.length);
    } else if (arg === '--timeout-ms') {
      index += 1;
      if (index >= argv.length) throw new Error('--timeout-ms requires a value');
      options.timeoutMs = parseTimeout(argv[index]);
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseTimeout(arg.slice('--timeout-ms='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.endpoints.length === 0 || options.endpoints.includes('all')) {
    options.endpoints = Object.keys(ENDPOINTS);
  }

  options.endpoints = Array.from(new Set(options.endpoints.map(normalizeEndpointName)));
  for (const endpoint of options.endpoints) {
    if (!ENDPOINTS[endpoint]) throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  return options;
}

function splitEndpointList(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeEndpointName);
}

function normalizeEndpointName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return ENDPOINT_ALIASES[normalized] || normalized;
}

function parseTimeout(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${value}`);
  }
  return timeout;
}

function buildUrl(baseUrl, endpointPath) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/g, '');
  if (!normalizedBase) throw new Error('TFMSTATS_API_BASE is empty');
  return new URL(endpointPath, `${normalizedBase}/`);
}

async function fetchEndpoint(name, options) {
  const endpoint = ENDPOINTS[name];
  const url = buildUrl(options.baseUrl, endpoint.path);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-functions-key': options.apiKey,
    },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();

  if (!response.ok) {
    const detail = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`GET ${endpoint.path} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`GET ${endpoint.path} returned invalid JSON: ${error.message}`);
  }
}

function validatePayload(name, payload) {
  const validator = ENDPOINTS[name].validate;
  const errors = validator(payload);
  if (errors.length) {
    const shown = errors.slice(0, 12).map((error) => `  - ${error}`).join('\n');
    const suffix = errors.length > 12 ? `\n  - ... ${errors.length - 12} more` : '';
    throw new Error(`${name} payload failed validation:\n${shown}${suffix}`);
  }
}

function validateGlobalStatistics(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['expected object payload'];
  }

  for (const field of ['totalIndexedGames', 'scrapedGamesTotal', 'totalPlayers']) {
    requireInteger(payload, field, `global.${field}`, errors);
  }

  return errors;
}

function validateCardStats(payload, label) {
  const errors = [];
  if (!Array.isArray(payload)) return [`${label}: expected array payload`];

  payload.forEach((entry, index) => {
    const prefix = `${label}[${index}]`;
    requireObject(entry, prefix, errors);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    requireString(entry, 'card', `${prefix}.card`, errors);
    requireInteger(entry, 'timesPlayed', `${prefix}.timesPlayed`, errors);
    requireNumber(entry, 'winRate', `${prefix}.winRate`, errors);
    requireNullableNumber(entry, 'avgElo', `${prefix}.avgElo`, errors);
    requireNullableNumber(entry, 'avgEloChange', `${prefix}.avgEloChange`, errors);
  });

  return errors;
}

function validateStartingHandStats(payload) {
  const errors = [];
  if (!Array.isArray(payload)) return ['starting-hands: expected array payload'];

  payload.forEach((entry, index) => {
    const prefix = `starting-hands[${index}]`;
    requireObject(entry, prefix, errors);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    requireString(entry, 'card', `${prefix}.card`, errors);

    const numericKeys = Object.keys(entry).filter((key) => key !== 'card' && typeof entry[key] === 'number');
    if (numericKeys.length === 0) {
      errors.push(`${prefix}: expected at least one numeric statistic`);
    }

    if ('offeredGames' in entry) requireInteger(entry, 'offeredGames', `${prefix}.offeredGames`, errors);
    if ('keptGames' in entry) requireInteger(entry, 'keptGames', `${prefix}.keptGames`, errors);
    if ('notKeptGames' in entry) requireInteger(entry, 'notKeptGames', `${prefix}.notKeptGames`, errors);
    if ('keepRate' in entry) requireNumber(entry, 'keepRate', `${prefix}.keepRate`, errors);

    for (const [key, value] of Object.entries(entry)) {
      if (key === 'card') continue;
      if (value !== null && typeof value !== 'number') {
        errors.push(`${prefix}.${key}: expected number or null`);
      }
    }
  });

  return errors;
}

function requireObject(value, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label}: expected object`);
  }
}

function requireString(entry, field, label, errors) {
  if (typeof entry[field] !== 'string' || !entry[field].trim()) {
    errors.push(`${label}: expected non-empty string`);
  }
}

function requireInteger(entry, field, label, errors) {
  const value = entry[field];
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label}: expected non-negative integer`);
  }
}

function requireNumber(entry, field, label, errors) {
  const value = entry[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${label}: expected finite number`);
  }
}

function requireNullableNumber(entry, field, label, errors) {
  const value = entry[field];
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(`${label}: expected finite number or null`);
  }
}

function writeJson(relativePath, payload) {
  const outputPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
  return outputPath;
}

function buildManifest(records, options) {
  const globalRecord = records.find((record) => record.name === 'global');
  return {
    source: 'tfmstats',
    base_url: options.baseUrl,
    fetched_at: new Date().toISOString(),
    mode: options.mode,
    endpoints: records.map((record) => ({
      name: record.name,
      path: ENDPOINTS[record.name].path,
      output: ENDPOINTS[record.name].output,
      count: record.count,
    })),
    global_statistics: globalRecord ? globalRecord.payload : undefined,
  };
}

async function run(options) {
  if (!options.apiKey) {
    throw new Error('Missing TFMSTATS_API_KEY. The API key is intentionally not stored in the repo; set it only in your current shell/session.');
  }

  const records = [];
  for (const name of options.endpoints) {
    const payload = await fetchEndpoint(name, options);
    validatePayload(name, payload);
    const count = ENDPOINTS[name].count(payload);
    records.push({name, payload, count});
    console.log(`${name}: OK (${count})`);
  }

  if (options.mode === 'write') {
    for (const record of records) {
      const outputPath = writeJson(ENDPOINTS[record.name].output, record.payload);
      console.log(`${record.name}: wrote ${path.relative(ROOT, outputPath)}`);
    }
    const manifestPath = writeJson('data/tfmstats_import_manifest.json', buildManifest(records, options));
    console.log(`manifest: wrote ${path.relative(ROOT, manifestPath)}`);
  } else {
    console.log('Check only: no files written.');
  }
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage());
    return 1;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  try {
    await run(options);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

module.exports = {
  ENDPOINTS,
  buildUrl,
  fetchEndpoint,
  main,
  parseArgs,
  validatePayload,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
