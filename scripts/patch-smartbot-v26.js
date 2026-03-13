#!/usr/bin/env node
// patch-smartbot-v26.js — Fix 74: Smarter party selection for delegates
// Current: reinforce where leader > grow where most delegates > hardcoded priority
// Problem: doesn't consider dominant party (= next ruling = Chairman election)
// Fix: prioritize dominant party for party leader / chairman capture
//
// Fix 75: Anti-Reds delegate when Reds is dominant
// If Reds is dominant, send delegate to any other party to try to shift dominant

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 74: Smart party selection with dominant awareness =====
{
  const old = `  if (t === 'party') {
    const parties = wf.parties || wf.availableParties || [];
    // Priority: reinforce party where we already lead, else pick by value
    // Mars First > Greens > Scientists > Kelvinists > Unity > Reds
    // In endgame, anti-Reds is critical (Reds blocks WG terraform + taxes TR)
    const steps = remainingSteps(state);
    const gen = state?.game?.generation ?? 5;
    const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
    const PARTY_PRIO = isEndgame
      ? ['Greens', 'Mars First', 'Scientists', 'Kelvinists', 'Unity', 'Reds']
      : ['Mars First', 'Greens', 'Scientists', 'Kelvinists', 'Unity', 'Reds'];
    const turmoil = state?.game?.turmoil;
    const myColor = state?.thisPlayer?.color;
    if (turmoil && myColor) {
      // Find party where we are partyLeader → reinforce
      const myParty = turmoil.parties?.find(p =>
        p.partyLeader === myColor && parties.includes(p.name));
      if (myParty) return { type: 'party', partyName: myParty.name };
      // Find party where we have most delegates → grow
      let bestParty = null, bestCount = 0;
      for (const p of (turmoil.parties || [])) {
        if (!parties.includes(p.name)) continue;
        const myDel = (p.delegates || []).find(d => d.color === myColor);
        if (myDel && myDel.number > bestCount) { bestCount = myDel.number; bestParty = p.name; }
      }
      if (bestParty) return { type: 'party', partyName: bestParty };
    }
    // Fallback: priority list, skip Reds if possible
    const pick = PARTY_PRIO.find(p => parties.includes(p)) || parties[0] || 'Mars First';
    return { type: 'party', partyName: pick };
  }`;

  const replacement = `  if (t === 'party') {
    const parties = wf.parties || wf.availableParties || [];
    const turmoil = state?.game?.turmoil;
    const myColor = state?.thisPlayer?.color;
    const steps = remainingSteps(state);
    const gen = state?.game?.generation ?? 5;

    if (turmoil && myColor) {
      const dominant = turmoil.dominant;
      const allParties = turmoil.parties || [];

      // Helper: count my delegates in a party
      const myDelegatesIn = (pName) => {
        const p = allParties.find(x => x.name === pName);
        if (!p) return 0;
        const d = (p.delegates || []).find(x => x.color === myColor);
        return d ? d.number : 0;
      };
      // Helper: get total delegates in a party
      const totalDelegatesIn = (pName) => {
        const p = allParties.find(x => x.name === pName);
        if (!p) return 0;
        return (p.delegates || []).reduce((s, d) => s + (d.number || 0), 0);
      };

      // Strategy 1: If I'm party leader in dominant party → reinforce (protect Chairman)
      const domParty = allParties.find(p => p.name === dominant);
      if (domParty && domParty.partyLeader === myColor && parties.includes(dominant)) {
        return { type: 'party', partyName: dominant };
      }

      // Strategy 2: If dominant party is not Reds, try to become leader there
      // (1 delegate away from tying/beating leader = high value)
      if (dominant && dominant !== 'Reds' && parties.includes(dominant)) {
        const myDel = myDelegatesIn(dominant);
        const leaderDel = totalDelegatesIn(dominant) - myDel; // rough: others' total
        // If we have any presence, reinforce to compete for leader
        if (myDel > 0) return { type: 'party', partyName: dominant };
        // If party is small (≤3 delegates total), we can take it with 2 delegates
        if (totalDelegatesIn(dominant) <= 3) return { type: 'party', partyName: dominant };
      }

      // Strategy 3: If Reds is dominant → send to strongest non-Reds party to shift dominant
      if (dominant === 'Reds') {
        let bestAlt = null, bestAltCount = 0;
        for (const p of allParties) {
          if (p.name === 'Reds' || !parties.includes(p.name)) continue;
          const total = totalDelegatesIn(p.name);
          if (total > bestAltCount) { bestAltCount = total; bestAlt = p.name; }
        }
        if (bestAlt) return { type: 'party', partyName: bestAlt };
      }

      // Strategy 4: Reinforce where I'm already party leader (any party)
      const myLeadParty = allParties.find(p =>
        p.partyLeader === myColor && parties.includes(p.name));
      if (myLeadParty) return { type: 'party', partyName: myLeadParty.name };

      // Strategy 5: Grow where I have most delegates
      let bestParty = null, bestCount = 0;
      for (const p of allParties) {
        if (!parties.includes(p.name)) continue;
        const myDel = myDelegatesIn(p.name);
        if (myDel > bestCount) { bestCount = myDel; bestParty = p.name; }
      }
      if (bestParty) return { type: 'party', partyName: bestParty };
    }
    // Fallback: priority list (avoid Reds)
    const PARTY_PRIO = ['Mars First', 'Greens', 'Scientists', 'Kelvinists', 'Unity', 'Reds'];
    const pick = PARTY_PRIO.find(p => parties.includes(p)) || parties[0] || 'Mars First';
    return { type: 'party', partyName: pick };
  }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 74+75 — smart party selection (dominant awareness + anti-Reds)');
    applied++;
  } else {
    console.log('SKIP: Fix 74+75 (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
