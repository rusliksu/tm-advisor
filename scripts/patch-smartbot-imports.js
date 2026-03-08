const fs = require('fs');
const file = process.argv[2] || '/home/openclaw/terraforming-mars/smartbot.js';
let code = fs.readFileSync(file, 'utf8');

const oldImports = [
  "const http = require('http');",
  "const CARD_TAGS = require('./card_tags');",
  "const CARD_VP = require('./card_vp');",
  "const CARD_DATA = require('./card_data');",
  "const TM_BRAIN = require('./tm-brain');",
  "TM_BRAIN.setCardData(CARD_TAGS, CARD_VP, CARD_DATA);"
].join('\n');

const newImports = [
  "const http = require('http');",
  "const fs2 = require('fs');",
  "const CARD_TAGS = require('./card_tags');",
  "const CARD_VP = require('./card_vp');",
  "const CARD_DATA = require('./card_data');",
  "let TM_RATINGS = {};",
  "try { const r = fs2.readFileSync(__dirname + '/ratings.json.js', 'utf8').replace(/\\\\bconst\\\\b/g, 'var'); TM_RATINGS = (new Function(r + '\\nreturn TM_RATINGS;'))(); } catch(e) { console.warn('ratings.json.js not found'); }",
  "let TM_CARD_TAG_REQS = {}, TM_CARD_GLOBAL_REQS = {};",
  "try { const r = fs2.readFileSync(__dirname + '/card_tag_reqs.js', 'utf8').replace(/\\\\bconst\\\\b/g, 'var'); const res = (new Function(r + '\\nreturn {t:TM_CARD_TAG_REQS, g:TM_CARD_GLOBAL_REQS};'))(); TM_CARD_TAG_REQS = res.t; TM_CARD_GLOBAL_REQS = res.g; } catch(e) { console.warn('card_tag_reqs.js not found'); }",
  "let TM_CARD_DISCOUNTS = {};",
  'try { const r = fs2.readFileSync(__dirname + \'/synergy_tables.json.js\', \'utf8\').replace(/\\\\bconst\\\\b/g, \'var\'); TM_CARD_DISCOUNTS = (new Function(r + \'\\nreturn typeof TM_CARD_DISCOUNTS!=="undefined"?TM_CARD_DISCOUNTS:{};\'))(); } catch(e) {}',
  "const TM_BRAIN = require('./tm-brain');",
  "TM_BRAIN.setCardData(CARD_TAGS, CARD_VP, CARD_DATA, TM_CARD_DISCOUNTS, TM_CARD_TAG_REQS, TM_CARD_GLOBAL_REQS, TM_RATINGS);"
].join('\n');

if (code.includes(oldImports)) {
  code = code.replace(oldImports, newImports);
  fs.writeFileSync(file, code);
  console.log('Patched imports OK');
} else {
  console.log('ERROR: Old imports pattern not found');
  console.log('First 400 chars:', code.substring(0, 400));
}
