/**
 * gen_card_requirements.js — Extract card requirements from TM source
 * Focus: tag requirements (e.g. "7 Science tags")
 *
 * Usage: node scripts/gen_card_requirements.js
 */

const fs = require('fs');
const path = require('path');

const TM_SRC = path.resolve(__dirname, '../../terraforming-mars/src/server/cards');
const ENUM_FILE = path.resolve(__dirname, '../../terraforming-mars/src/common/cards/CardName.ts');

// Parse CardName enum
var enumSrc = fs.readFileSync(ENUM_FILE, 'utf8');
var cardNameMap = {};
var re = /(\w+)\s*=\s*'([^']+)'/g;
var m;
while ((m = re.exec(enumSrc)) !== null) cardNameMap[m[1]] = m[2];

// Find all .ts files
function findTsFiles(dir) {
  var results = [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var e of entries) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) results = results.concat(findTsFiles(full));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) results.push(full);
  }
  return results;
}

var files = findTsFiles(TM_SRC);
var tagReqs = {};
var globalReqs = {};

for (var file of files) {
  var src = fs.readFileSync(file, 'utf8');

  var nameMatch = src.match(/name:\s*CardName\.(\w+)/);
  if (!nameMatch) continue;
  var displayName = cardNameMap[nameMatch[1]];
  if (!displayName) continue;

  // Format: requirements: {tag: Tag.SCIENCE, count: 7}
  // Or: requirements: {oceans: 5}
  // Or: requirements: [{tag: Tag.PLANT}, {tag: Tag.ANIMAL}]

  // Extract all requirements blocks (can be object or array)
  var reqMatch = src.match(/requirements:\s*(\{[^}]+\}|\[[^\]]+\])/);
  if (!reqMatch) continue;

  var reqStr = reqMatch[1];

  // Tag requirements: tag: Tag.XXX, count: N
  var tagReqRe = /tag:\s*Tag\.(\w+)(?:,\s*count:\s*(\d+))?/g;
  var tm;
  while ((tm = tagReqRe.exec(reqStr)) !== null) {
    var tag = tm[1].toLowerCase();
    var count = parseInt(tm[2]) || 1;
    if (count >= 2) {
      if (!tagReqs[displayName]) tagReqs[displayName] = {};
      tagReqs[displayName][tag] = count;
    }
  }

  // Global requirements — each param can be min or max
  // Format: {temperature: -10, max} or {oxygen: 6} (min by default)
  // For arrays: [{oceans: 1}, {cities: 1}] — parse each element
  var reqBlocks = [reqStr];
  // If array format, split into blocks
  if (reqStr.charAt(0) === '[') {
    reqBlocks = reqStr.match(/\{[^}]+\}/g) || [];
  }

  for (var bi = 0; bi < reqBlocks.length; bi++) {
    var block = reqBlocks[bi];
    var isMax = /\bmax\b/.test(block);

    var params = [
      ['temperature', /temperature:\s*(-?\d+)/],
      ['oxygen', /oxygen:\s*(\d+)/],
      ['oceans', /oceans:\s*(\d+)/],
      ['venus', /venus:\s*(\d+)/]
    ];

    for (var pi = 0; pi < params.length; pi++) {
      var pm = block.match(params[pi][1]);
      if (pm) {
        if (!globalReqs[displayName]) globalReqs[displayName] = {};
        var val = parseInt(pm[1]);
        // Store as {min: X} or {max: X}
        globalReqs[displayName][params[pi][0]] = isMax ? {max: val} : {min: val};
      }
    }
  }
}

// Output tag requirements (sorted by count desc)
var tagReqList = Object.keys(tagReqs).map(function(name) {
  return { name: name, reqs: tagReqs[name] };
}).sort(function(a, b) {
  var aMax = Math.max.apply(null, Object.values(a.reqs));
  var bMax = Math.max.apply(null, Object.values(b.reqs));
  return bMax - aMax;
});

console.log('=== TAG REQUIREMENTS (count >= 2) ===');
console.log('Found ' + tagReqList.length + ' cards with tag requirements');
console.log('');
tagReqList.forEach(function(item) {
  var reqs = Object.entries(item.reqs).map(function(e) { return e[1] + ' ' + e[0]; }).join(', ');
  console.log('  ' + item.name + ': ' + reqs);
});

console.log('\n=== GLOBAL REQUIREMENTS ===');
console.log('Found ' + Object.keys(globalReqs).length + ' cards with global requirements');

// Show some examples
var gKeys = Object.keys(globalReqs).slice(0, 10);
gKeys.forEach(function(n) {
  var parts = [];
  for (var k in globalReqs[n]) {
    var v = globalReqs[n][k];
    parts.push(k + (v.max !== undefined ? ' <= ' + v.max : ' >= ' + v.min));
  }
  console.log('  ' + n + ': ' + parts.join(', '));
});
if (Object.keys(globalReqs).length > 10) console.log('  ... and ' + (Object.keys(globalReqs).length - 10) + ' more');

// Write combined requirements file
var jsContent = '// Card requirements — generated from TM source\n';
jsContent += '// Tag requirements: ' + Object.keys(tagReqs).length + ' cards\n';
jsContent += '// Global requirements: ' + Object.keys(globalReqs).length + ' cards\n';
jsContent += 'const TM_CARD_TAG_REQS = ' + JSON.stringify(tagReqs, null, 2) + ';\n\n';
jsContent += 'const TM_CARD_GLOBAL_REQS = ' + JSON.stringify(globalReqs, null, 2) + ';\n';

var outPath = path.resolve(__dirname, '../extension/data/card_tag_reqs.js');
fs.writeFileSync(outPath, jsContent, 'utf8');
console.log('\nWritten to ' + path.relative(process.cwd(), outPath));
