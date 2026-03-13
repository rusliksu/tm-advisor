#!/usr/bin/env node
// patch-action-limit-smart.js
// Smart action limit: only kicks in when game is running too long (gen > 15)
// Normal games (gen 1-15): unlimited blue actions
// Long games (gen 16+): max 4 actions per gen to force game to end

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// 1. Add global counter + gen tracker after RESTART_EVERY
{
  const old = `const RESTART_EVERY = 25;`;
  const replacement = `const RESTART_EVERY = 25;
let _globalActionCount = 0;
let _currentGen = 0;
function _actionAllowed() {
  if (_currentGen <= 15) return true; // normal game: no limit
  return _globalActionCount < 4; // stuck game: hard limit
}`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Added smart action limiter');
    applied++;
  } else {
    console.log('SKIP: RESTART_EVERY not found');
  }
}

// 2. Track gen number from GEN log — find genCounter assignment
{
  // Find where genCounter is set and add _currentGen sync
  const old = `const genCounter = `;
  const idx = code.indexOf(old);
  if (idx >= 0) {
    code = code.slice(0, idx) + `_globalActionCount = 0; ` + code.slice(idx);
    // Also sync _currentGen
    const genIdx = code.indexOf(`const genCounter = `, idx + 20);
    if (genIdx < 0) {
      // Only one occurrence, add _currentGen after it
      const lineEnd = code.indexOf(';', idx + 20);
      code = code.slice(0, lineEnd + 1) + ` _currentGen = genCounter;` + code.slice(lineEnd + 1);
      console.log('OK: Synced _currentGen at gen boundary');
      applied++;
    }
  } else {
    console.log('SKIP: genCounter not found');
  }
}

// 3. Guard all cardActionIdx picks with _actionAllowed()
{
  // Pattern: "return pick(cardActionIdx);"
  // Replace with guarded version
  const pattern = `return pick(cardActionIdx);`;
  const parts = code.split(pattern);
  if (parts.length > 1) {
    code = parts.join(`{ if (_actionAllowed()) { _globalActionCount++; return pick(cardActionIdx); } }`);
    console.log(`OK: Guarded ${parts.length - 1} action picks with _actionAllowed()`);
    applied++;
  } else {
    console.log('SKIP: no bare action picks found');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
