import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pagePath = path.join(rootDir, 'output', 'tierlist_projects_ru.html');
const pageUrl = pathToFileURL(pagePath).href;

function shortResource(url) {
  return url.replace(/^file:\/\/\//, '').replace(/\//g, '\\');
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const requests = [];
  page.on('requestfinished', (req) => {
    requests.push({
      url: req.url(),
      resourceType: req.resourceType(),
    });
  });

  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const initial = {
    total: requests.length,
    sprites: requests.filter((r) => r.url.includes('/sprites/')).map((r) => shortResource(r.url)),
    projectCards: requests.filter((r) => r.url.includes('/images/project_cards/')).map((r) => shortResource(r.url)),
    tagIcons: requests.filter((r) => r.url.includes('/images/tags/')).map((r) => shortResource(r.url)),
    expansionIcons: requests.filter((r) => r.url.includes('/images/expansions/')).map((r) => shortResource(r.url)),
  };

  const firstCard = page.locator('.card').first();
  await firstCard.click();
  await page.waitForTimeout(500);

  const afterModal = {
    total: requests.length,
    sprites: requests.filter((r) => r.url.includes('/sprites/')).map((r) => shortResource(r.url)),
    projectCards: requests.filter((r) => r.url.includes('/images/project_cards/')).map((r) => shortResource(r.url)),
    tagIcons: requests.filter((r) => r.url.includes('/images/tags/')).map((r) => shortResource(r.url)),
    expansionIcons: requests.filter((r) => r.url.includes('/images/expansions/')).map((r) => shortResource(r.url)),
  };

  const modalImgSrc = await page.locator('.modal-card-img').getAttribute('src').catch(() => null);

  console.log(JSON.stringify({
    page: shortResource(pageUrl),
    initial,
    afterModal,
    modalImgSrc,
  }, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
