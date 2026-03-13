#!/usr/bin/env node
// patch-smartbot-v25.js — Fix 72: Free lobby delegate priority
// Free delegate (from lobby) costs 0 MC — should be used early in priority chain
// Currently: delegate is last in priority (line 597), after all cards/SP/trades
// Fix: move free lobby delegate up — after milestones, before card vs SP competition

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 72: Free lobby delegate priority =====
// The bot has delegateIdx = find('send a delegate') which matches both
// "send a delegate in an area (from lobby)" (free) and "send a delegate in an area (5 m€)" (paid)
// The title text contains 'lobby' for the free one.
// Strategy: check if delegate title includes 'lobby', and if so, send it early
{
  // Part 1: Add free lobby delegate check right before card vs SP competition
  const old = `    // === CARD vs SP COMPETITION ===
    // Cards and Standard Projects compete on EV. Best action wins.`;

  const replacement = `    // Free lobby delegate — 0 MC, always worth doing before spending MC on cards
    if (delegateIdx >= 0 && titles[delegateIdx]?.t.includes('lobby')) {
      console.log('    → FREE lobby delegate (mc=' + mc + ')');
      return pick(delegateIdx);
    }

    // === CARD vs SP COMPETITION ===
    // Cards and Standard Projects compete on EV. Best action wins.`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 72 — free lobby delegate before card/SP competition');
    applied++;
  } else {
    console.log('SKIP: Fix 72 (pattern not found)');
  }
}

// ===== Fix 73: Lower paid delegate MC threshold =====
// Currently: mc >= 8 for paid delegate. But paid delegate costs 5 MC.
// 8 MC threshold means bot only sends paid delegate when rich
// Lower to 5 MC (exact cost) — delegate is still last priority so only fires when nothing else to do
{
  const old = `    // Delegate (chairman VP, party leader VP, anti-Reds)
    if (delegateIdx >= 0 && mc >= 8) return pick(delegateIdx);`;

  const replacement = `    // Delegate — paid (5 MC): chairman VP, party leader VP, anti-Reds
    if (delegateIdx >= 0 && mc >= 5) return pick(delegateIdx);`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 73 — paid delegate threshold 8→5 MC');
    applied++;
  } else {
    console.log('SKIP: Fix 73 (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
