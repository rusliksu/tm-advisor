#!/usr/bin/env node
// Sync evaluations.json → ratings.json.js
// Usage: node scripts/sync-ratings.js

const fs = require('fs');
const path = require('path');

const evalPath = path.join(__dirname, '..', 'data', 'evaluations.json');
const ratingsPath = path.join(__dirname, '..', 'extension', 'data', 'ratings.json.js');

const EVALS = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
const src = fs.readFileSync(ratingsPath, 'utf8');
const m = src.match(/(?:const|var)\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
const RATINGS = m ? (new Function('return ' + m[1]))() : {};

let added = 0, updated = 0;
for (const [name, ev] of Object.entries(EVALS)) {
  if (!RATINGS[name]) {
    RATINGS[name] = {
      s: ev.score, t: ev.tier,
      e: ev.economy || '', w: ev.when_to_pick || '',
      y: (ev.synergies || []).map(s => [s]),
    };
    added++;
  } else if (RATINGS[name].s !== ev.score || RATINGS[name].t !== ev.tier) {
    RATINGS[name].s = ev.score;
    RATINGS[name].t = ev.tier;
    if (ev.economy) RATINGS[name].e = ev.economy;
    if (ev.when_to_pick) RATINGS[name].w = ev.when_to_pick;
    updated++;
  }
}

const outLines = ['const TM_RATINGS = {'];
for (const [k, v] of Object.entries(RATINGS)) {
  outLines.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',');
}
outLines.push('};');
fs.writeFileSync(ratingsPath, outLines.join('\n'));

console.log(`Synced: ${added} added, ${updated} updated. Total: ${Object.keys(RATINGS).length}`);
