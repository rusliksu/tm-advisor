#!/usr/bin/env node
// patch-action-limit-v2.js
// Global action counter to prevent infinite blue action loops
// Uses module-level variable instead of state (which gets replaced each fetch)

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// 1. Add global counter after RESTART_EVERY
{
  const old = `const RESTART_EVERY = 25;`;
  const replacement = `const RESTART_EVERY = 25;
let _globalActionCount = 0;
const MAX_ACTIONS_PER_GEN = 20;`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Added global action counter');
    applied++;
  } else {
    console.log('SKIP: global counter (pattern not found)');
  }
}

// 2. Reset counter at GEN boundary (GEN log line)
{
  const old = `console.log('\\n=== GEN`;
  if (code.includes(old)) {
    code = code.replace(old, `_globalActionCount = 0;\n    console.log('\\n=== GEN`);
    console.log('OK: Reset counter at GEN boundary');
    applied++;
  } else {
    console.log('SKIP: GEN boundary reset (pattern not found)');
  }
}

// 3. Guard ALL cardActionIdx picks — wrap the simple "return pick(cardActionIdx)" calls
// Replace all bare "return pick(cardActionIdx);" with guarded version
{
  // The v1 patch added a guard at line 635-636, remove it first
  const v1guard = `    if (!state._actionCount) state._actionCount = 0;
    if (cardActionIdx >= 0 && state._actionCount < 30) {
      state._actionCount++;
      return pick(cardActionIdx);
    }`;
  if (code.includes(v1guard)) {
    code = code.replace(v1guard, `    if (cardActionIdx >= 0 && _globalActionCount < MAX_ACTIONS_PER_GEN) {
      _globalActionCount++;
      return pick(cardActionIdx);
    }`);
    console.log('OK: Replaced v1 guard with global counter');
    applied++;
  }

  // Guard the other bare "return pick(cardActionIdx);" calls
  // There are multiple — need to add counter check to each
  let count = 0;
  const bare = `return pick(cardActionIdx);`;
  // Split on bare pattern, rebuild with guard
  const parts = code.split(bare);
  if (parts.length > 1) {
    // First occurrence is already guarded (the one we just replaced)
    // Guard remaining occurrences
    code = parts[0];
    for (let i = 1; i < parts.length; i++) {
      // Check if the previous context already has the guard
      const prevChunk = code.slice(-100);
      if (prevChunk.includes('_globalActionCount < MAX_ACTIONS_PER_GEN')) {
        // Already guarded, keep as is
        code += bare + parts[i];
      } else {
        // Add guard
        code += `{ _globalActionCount++; return pick(cardActionIdx); }` + parts[i];
        count++;
      }
    }
    if (count > 0) {
      console.log(`OK: Guarded ${count} additional cardActionIdx picks`);
      applied++;
    }
  }
}

// 4. Also guard "if (hasVPAccum) return pick(cardActionIdx);"
{
  const old = `if (hasVPAccum) return pick(cardActionIdx);`;
  const replacement = `if (hasVPAccum && _globalActionCount < MAX_ACTIONS_PER_GEN) { _globalActionCount++; return pick(cardActionIdx); }`;
  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Guarded VP accum action pick');
    applied++;
  } else {
    console.log('SKIP: VP accum guard (already applied or not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
