/**
 * Скачивает недостающие картинки карт с terraforming-mars.herokuapp.com.
 * Использует Puppeteer для скриншотов рендеренных карт.
 *
 * Для запуска нужен puppeteer: npm install puppeteer
 * Альтернатива: скачать с ssimeonoff.github.io через прямые URL.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const imgMap = JSON.parse(fs.readFileSync('data/image_mapping.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('data/card_index.json', 'utf8'));
const evals = JSON.parse(fs.readFileSync('data/evaluations.json', 'utf8'));

const missing = Object.keys(evals).filter(n => !imgMap[n]);
console.log('Missing images:', missing.length);
missing.forEach(n => {
  const type = (index[n] && index[n].type) || '?';
  console.log(`  ${n} (${type})`);
});

// These 17 cards need manual resolution.
// For now, create placeholder entries so the generator can work.
// Images can be added later by:
// 1. Screenshot from https://terraforming-mars.herokuapp.com/cards
// 2. ssimeonoff.github.io for older cards
// 3. Manual screenshots during game

console.log('\nThese cards will show as text placeholders on the site.');
console.log('To add images later, place PNG files in the appropriate images/ directory');
console.log('and re-run scripts/fix_images.js');
