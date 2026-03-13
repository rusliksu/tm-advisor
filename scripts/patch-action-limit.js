#!/usr/bin/env node
// patch-action-limit.js
// Safety: limit blue card actions per generation to prevent infinite loops
// Some card combos can trigger unlimited actions (server bug or edge case)

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// Add action counter reset at generation start
{
  const old = `    // Blue card actions (VP accumulators, free resources)
    if (cardActionIdx >= 0) return pick(cardActionIdx);`;

  const replacement = `    // Blue card actions (VP accumulators, free resources)
    // Safety: limit actions per turn to prevent infinite loops
    if (!state._actionCount) state._actionCount = 0;
    if (cardActionIdx >= 0 && state._actionCount < 30) {
      state._actionCount++;
      return pick(cardActionIdx);
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Added action limit (max 30 per turn)');
    applied++;
  } else {
    console.log('SKIP: action limit pattern not found');
  }
}

// Reset counter at generation boundary
{
  const old = `=== GEN`;
  // Find the GEN logging line and add counter reset
  const genLogPattern = `console.log('\\n=== GEN`;
  const idx = code.indexOf(genLogPattern);
  if (idx >= 0) {
    // Add reset before the gen log
    code = code.slice(0, idx) + `if (state) state._actionCount = 0;\n    ` + code.slice(idx);
    console.log('OK: Added action counter reset at gen boundary');
    applied++;
  } else {
    console.log('SKIP: gen boundary pattern not found');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
