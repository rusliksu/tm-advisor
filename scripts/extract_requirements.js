/**
 * Извлекает requirements карт из TM репо.
 * requirements: {oxygen: 5} → "5% oxygen"
 * requirements: {temperature: -18} → "-18°C"
 * requirements: {tag: Tag.Science, count: 3} → "3 Science tags"
 */

const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '..', 'tmp_tm_repo', 'src', 'server', 'cards');
const index = JSON.parse(fs.readFileSync('data/card_index.json', 'utf8'));

// Build file map
const fileMap = {};
function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanDir(full);
    else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.'))
      fileMap[entry.name.replace('.ts', '').toLowerCase()] = full;
  }
}
scanDir(CARDS_DIR);

function nameToKey(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// Parse requirements from TS source
function parseRequirements(content) {
  // Match requirements: {...} or requirements: [{...}, {...}]
  const reqMatch = content.match(/requirements:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*[,\n]/);
  if (!reqMatch) return null;

  const reqStr = reqMatch[1];
  const isMax = /\bmax\b/.test(reqStr);
  const parts = [];

  // oxygen: N
  const oxy = reqStr.match(/oxygen:\s*(\d+)/);
  if (oxy) parts.push((isMax ? 'Max ' : '') + oxy[1] + '% oxygen');

  // temperature: N
  const temp = reqStr.match(/temperature:\s*(-?\d+)/);
  if (temp) parts.push((isMax ? 'Max ' : '') + temp[1] + '°C');

  // oceans: N
  const oceans = reqStr.match(/oceans:\s*(\d+)/);
  if (oceans) parts.push((isMax ? 'Max ' : '') + oceans[1] + ' oceans');

  // venus: N
  const venus = reqStr.match(/venus:\s*(\d+)/);
  if (venus) parts.push((isMax ? 'Max ' : '') + venus[1] + '% Venus');

  // greeneries: N
  const green = reqStr.match(/greeneries:\s*(\d+)/);
  if (green) parts.push(green[1] + ' greeneries');

  // cities: N
  const cities = reqStr.match(/cities:\s*(\d+)/);
  if (cities) parts.push(cities[1] + ' cities');

  // colonies: N
  const colonies = reqStr.match(/colonies:\s*(\d+)/);
  if (colonies) parts.push(colonies[1] + ' colonies');

  // floaters: N
  const floaters = reqStr.match(/floaters:\s*(\d+)/);
  if (floaters) parts.push(floaters[1] + ' floaters');

  // tag: Tag.XXX, count: N or {tag: Tag.XXX}
  const tagMatches = [...reqStr.matchAll(/tag:\s*Tag\.(\w+)(?:[\s\S]*?count:\s*(\d+))?/g)];
  for (const tm of tagMatches) {
    const tag = tm[1].charAt(0) + tm[1].slice(1).toLowerCase();
    const count = tm[2] || '1';
    parts.push(count + ' ' + tag + ' tag' + (count > 1 ? 's' : ''));
  }

  // production (megacredits production)
  const prod = reqStr.match(/production:\s*(\d+)/);
  if (prod) parts.push(prod[1] + ' MC production');

  // chairman
  if (reqStr.includes('chairman')) parts.push('Chairman');

  // party: PartyName.XXX
  const party = reqStr.match(/PartyName\.(\w+)/);
  if (party) parts.push(party[1] + ' ruling');

  // partyLeader
  if (reqStr.includes('partyLeader')) parts.push('Party leader');

  // tr: N
  const tr = reqStr.match(/\btr:\s*(\d+)/);
  if (tr) parts.push(tr[1] + ' TR');

  // habitatRate / miningRate / logisticRate (Moon)
  const habitat = reqStr.match(/habitatRate:\s*(\d+)/);
  if (habitat) parts.push(habitat[1] + ' habitat rate');
  const mining = reqStr.match(/miningRate:\s*(\d+)/);
  if (mining) parts.push(mining[1] + ' mining rate');
  const logistic = reqStr.match(/logisticRate:\s*(\d+)/);
  if (logistic) parts.push(logistic[1] + ' logistic rate');

  return parts.length > 0 ? parts.join(', ') : null;
}

// Also extract description if missing
const missingDesc = Object.entries(index).filter(([, c]) => !c.description);

let reqAdded = 0, reqUpdated = 0, descAdded = 0;

for (const [name, card] of Object.entries(index)) {
  const key = nameToKey(name);
  const filePath = fileMap[key];
  if (!filePath) continue;

  const content = fs.readFileSync(filePath, 'utf8');

  // Extract requirements
  if (!card.requirements) {
    const req = parseRequirements(content);
    if (req) {
      card.requirements = req;
      reqAdded++;
    }
  }

  // Extract description if missing
  if (!card.description) {
    const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
    if (!descMatch) {
      // Try multiline
      const descMatch2 = content.match(/description:\s*['"](.+?)['"],?\s*$/m);
      if (descMatch2) {
        card.description = descMatch2[1];
        descAdded++;
      }
    } else {
      card.description = descMatch[1];
      descAdded++;
    }
  }
}

console.log('Requirements added:', reqAdded);
console.log('Descriptions added:', descAdded);

// Count totals
const withReq = Object.values(index).filter(c => c.requirements).length;
const withDesc = Object.values(index).filter(c => c.description).length;
console.log('Cards with requirements:', withReq, '/', Object.keys(index).length);
console.log('Cards with description:', withDesc, '/', Object.keys(index).length);

fs.writeFileSync('data/card_index.json', JSON.stringify(index, null, 2));
console.log('card_index.json saved!');
