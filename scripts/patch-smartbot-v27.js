#!/usr/bin/env node
// patch-smartbot-v27.js
// Fix 76: EV-based SP selection (replace hardcoded priority)
// Currently: asteroid > aquifer > air scrapping > greenery (by cost)
// Fix: calculate EV for each SP and pick the best one
// EV = trMC + tempo - cost (same formula as or-handler uses)
//
// Fix 77: Endgame delegate before sell/pass
// In endgame, bot does delegate at mc>=5 but AFTER card play attempts.
// If no cards affordable, bot falls to sell/pass. Move delegate before sell.

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 76: EV-based SP selection =====
{
  const old = `      const spPriority = [
        !tempDone && { kw: 'asteroid', cost: 14 + reds },
        !oceansDone && { kw: 'aquifer', cost: 18 + reds },
        !venusDone && { kw: 'air scrapping', cost: 15 + reds },
        !o2Done && { kw: 'greenery', cost: 23 + reds },
      ].filter(Boolean);
      for (const { kw, cost } of spPriority) {
        const sp = available.find(c => c.name.toLowerCase().includes(kw));
        if (sp && mc >= cost) return { type: 'card', cards: [sp.name] };
      }`;

  const replacement = `      // EV-based SP selection: pick SP with highest net EV
      const spStepsNow = remainingSteps(state);
      const spRateNow = Math.max(4, Math.min(8, (state?.players?.length || 3) * 2));
      const spGensNow = Math.max(1, Math.ceil(spStepsNow / spRateNow));
      const vpMCnow = spGensNow >= 6 ? 3 : (spGensNow >= 3 ? 5 : 7);
      const trMCsp = spGensNow + vpMCnow - reds;
      const tempoSP = spGensNow >= 5 ? 7 : (spGensNow >= 3 ? 5 : 3);
      const spCandidates = [
        !tempDone && { kw: 'asteroid', cost: 14 + reds, ev: trMCsp + tempoSP - 14 },
        !oceansDone && { kw: 'aquifer', cost: 18 + reds, ev: trMCsp + tempoSP + 2 - 18 },
        !venusDone && { kw: 'air scrapping', cost: 15 + reds, ev: trMCsp + tempoSP - 15 },
        !o2Done && { kw: 'greenery', cost: 23 + reds, ev: trMCsp + tempoSP + vpMCnow - 23 },
      ].filter(Boolean);
      // Sort by EV descending, pick best affordable
      spCandidates.sort((a, b) => b.ev - a.ev);
      for (const { kw, cost } of spCandidates) {
        const sp = available.find(c => c.name.toLowerCase().includes(kw));
        if (sp && mc >= cost) return { type: 'card', cards: [sp.name] };
      }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 76 — EV-based SP selection');
    applied++;
  } else {
    console.log('SKIP: Fix 76 (pattern not found)');
  }
}

// ===== Fix 77: Endgame sell excess cards earlier (>3 instead of >0) =====
// Currently in endgame: sell if cardsInHand.length > 0 (sells everything)
// This is fine but could be improved: sell cards with negative EV earlier
// Actually, let's not touch this — selling works fine
// Instead: improve endgame by adding card play for non-VP cards with high EV
// Actually skip this for now — focus on SP EV fix

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
