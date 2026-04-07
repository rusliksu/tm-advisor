#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const evalPath = path.join(ROOT, 'data', 'evaluations.json');
const canonicalRatingsPath = path.join(ROOT, 'packages', 'tm-data', 'generated', 'extension', 'ratings.json.js');
const legacyRatingsPath = path.join(ROOT, 'extension', 'data', 'ratings.json.js');

function main() {
  const EVALS = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const activeRatingsPath = fs.existsSync(canonicalRatingsPath) ? canonicalRatingsPath : legacyRatingsPath;
  const src = fs.readFileSync(activeRatingsPath, 'utf8');
  const m = src.match(/(?:const|var)\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  const RATINGS = m ? (new Function('return ' + m[1]))() : {};

  let added = 0;
  let updated = 0;
  for (const [name, ev] of Object.entries(EVALS)) {
    const nextRating = {
      s: ev.score, t: ev.tier,
      e: ev.economy || '', w: ev.when_to_pick || '',
      y: (ev.synergies || []).map((s) => [s]),
    };
    if (ev.description_ru) nextRating.dr = ev.description_ru;
    if (typeof ev.opening_hand_bias === 'number' && ev.opening_hand_bias !== 0) nextRating.o = ev.opening_hand_bias;
    if (ev.opening_hand_note) {
      nextRating.on = ev.opening_hand_note.length > 140
        ? ev.opening_hand_note.slice(0, 137) + '...'
        : ev.opening_hand_note;
    }
    if (!RATINGS[name]) {
      RATINGS[name] = nextRating;
      added++;
    } else if (JSON.stringify(RATINGS[name]) !== JSON.stringify(nextRating)) {
      RATINGS[name] = nextRating;
      updated++;
    }
  }

  const outLines = ['const TM_RATINGS = {'];
  for (const [k, v] of Object.entries(RATINGS)) {
    outLines.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',');
  }
  outLines.push('};');
  const out = outLines.join('\n');
  fs.mkdirSync(path.dirname(canonicalRatingsPath), {recursive: true});
  fs.mkdirSync(path.dirname(legacyRatingsPath), {recursive: true});
  fs.writeFileSync(canonicalRatingsPath, out);
  fs.writeFileSync(legacyRatingsPath, out);

  console.log(`Synced: ${added} added, ${updated} updated. Total: ${Object.keys(RATINGS).length}`);
  console.log(`Canonical: ${canonicalRatingsPath}`);
  console.log(`Legacy mirror: ${legacyRatingsPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {main};
