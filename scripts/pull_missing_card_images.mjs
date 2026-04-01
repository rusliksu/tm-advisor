import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const REPO_ROOT = process.cwd();
const IMAGE_MAPPING_PATH = path.join(REPO_ROOT, 'data', 'image_mapping.json');
const CARD_INDEX_PATH = path.join(REPO_ROOT, 'data', 'card_index.json');

const CARD_LIST_URL = 'https://tm.knightbyte.win/cards';
const EXPANSION_CHECKBOX_IDS = [
  'base-checkbox',
  'corpera-checkbox',
  'promo-checkbox',
  'venus-checkbox',
  'colonies-checkbox',
  'prelude-checkbox',
  'prelude2-checkbox',
  'turmoil-checkbox',
  'community-checkbox',
  'ares-checkbox',
  'moon-checkbox',
  'pathfinders-checkbox',
  'ceo-checkbox',
  'starwars-checkbox',
  'underworld-checkbox',
];
const EXPANSION_TO_CHECKBOX = {
  Ares: 'ares-checkbox',
  Underworld: 'underworld-checkbox',
};
const TYPE_TO_DIR = {
  corporation: 'corporations',
  prelude: 'preludes',
  automated: 'project_cards',
  active: 'project_cards',
  event: 'project_cards',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function slugifyCardName(cardName) {
  return cardName
    .replace(/:ares$/i, '_ares')
    .replace(/:u$/i, '_u')
    .replace(/&/g, 'and')
    .replace(/['’.]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeLookup(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getOutputPath(card) {
  const dir = TYPE_TO_DIR[card.type] || 'project_cards';
  const filename = `${slugifyCardName(card.name)}.png`;
  return {
    rel: path.posix.join('images', dir, filename),
    abs: path.join(REPO_ROOT, 'images', dir, filename),
  };
}

async function dismissDialogs(page) {
  const okButtons = page.getByRole('button', { name: 'OK' });
  if (await okButtons.count()) {
    try {
      await okButtons.first().click({ timeout: 1500 });
    } catch {
      // Ignore if the dialog is already gone.
    }
  }
}

async function setExpansion(page, expansion) {
  const targetId = EXPANSION_TO_CHECKBOX[expansion];
  await page.evaluate(({ ids, targetId }) => {
    for (const id of ids) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.checked = id === targetId;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { ids: EXPANSION_CHECKBOX_IDS, targetId });
  await page.waitForTimeout(150);
}

async function setFilter(page, rawName) {
  await page.evaluate((value) => {
    const input = document.querySelector('input.filter');
    if (!input) throw new Error('Card filter input not found');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, rawName);
  await page.waitForTimeout(300);
}

async function screenshotCard(page, card, outPath) {
  await setExpansion(page, card.expansion);
  const filterName = card.name.replace(/:ares$/i, '').replace(/:u$/i, '');
  await setFilter(page, filterName);

  const cardLocator = page.locator('.cardbox').first();
  await cardLocator.waitFor({ state: 'visible', timeout: 10000 });
  await cardLocator.screenshot({ path: outPath });
}

async function main() {
  const mapping = readJson(IMAGE_MAPPING_PATH);
  const cardIndex = readJson(CARD_INDEX_PATH);
  const cards = Object.values(cardIndex)
    .filter((card) => card && ['Underworld', 'Ares'].includes(card.expansion) && !mapping[card.name]);

  const fileLookup = {};
  for (const file of fs.readdirSync(path.join(REPO_ROOT, 'images', 'project_cards'))) {
    if (!file.endsWith('.png')) continue;
    fileLookup[normalizeLookup(path.basename(file, '.png'))] = path.posix.join('images', 'project_cards', file);
  }

  let aliasCount = 0;
  const captureQueue = [];
  for (const card of cards) {
    const baseName = card.name.replace(/:ares$/i, '').replace(/:u$/i, '');
    const aliasPath = fileLookup[normalizeLookup(baseName)];
    if (aliasPath) {
      mapping[card.name] = aliasPath;
      aliasCount += 1;
      continue;
    }
    captureQueue.push(card);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(CARD_LIST_URL, { waitUntil: 'networkidle' });
  await dismissDialogs(page);

  let screenshotCount = 0;
  for (const card of captureQueue) {
    const output = getOutputPath(card);
    fs.mkdirSync(path.dirname(output.abs), { recursive: true });
    await screenshotCard(page, card, output.abs);
    mapping[card.name] = output.rel;
    screenshotCount += 1;
    console.log(`captured ${card.name} -> ${output.rel}`);
  }

  await browser.close();
  writeJson(IMAGE_MAPPING_PATH, mapping);

  console.log(`alias mappings added: ${aliasCount}`);
  console.log(`screenshots captured: ${screenshotCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
