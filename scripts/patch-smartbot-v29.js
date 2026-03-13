#!/usr/bin/env node
// patch-smartbot-v29.js
// Fix 80: Accurate trade cost accounting
// Currently: tradeCost = (energy >= 3 || titanium >= 3) ? 0 : 9
// Wrong: titanium trade costs 3×titaniumValue (~9 MC), energy trade costs 3×1.7 (~5 MC)
// Fix: calculate real opportunity cost for each payment method
//
// Fix 82: Milestone/tag proximity bonus in card PLAY scoring
// Currently: play scoring only adds VP_CARDS (+8) and CITY_CARDS (+7)
// Buy scoring adds: VP, city, engine, plant prod, tag synergy, corp synergy, awards, milestones
// Gap: bot buys cards for milestones but doesn't prioritize PLAYING them
// Fix: add milestone proximity + tag synergy bonus to play EV calculation

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 80a: High-value trade before weak cards =====
{
  const old = `        const bestTradeVal2 = scored2[0]?.val ?? 0;
        const tradeCost2 = (energy >= 3 || titanium >= 3) ? 0 : 9;`;

  const replacement = `        const bestTradeVal2 = scored2[0]?.val ?? 0;
        // Real trade cost: energy 3×1.7≈5 MC, MC=9, titanium 3×tiVal≈9 MC
        const tc2TiVal = state?.thisPlayer?.titaniumValue || 3;
        const tc2E = energy >= 3 ? 5 : 999;
        const tc2MC = mc >= 9 ? 9 : 999;
        const tc2Ti = titanium >= 3 ? 3 * tc2TiVal : 999;
        const tradeCost2 = Math.min(tc2E, tc2MC, tc2Ti);`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 80a — accurate trade cost (high-value trade)');
    applied++;
  } else {
    console.log('SKIP: Fix 80a (pattern not found)');
  }
}

// ===== Fix 80b: Standard trade colonies =====
{
  const old = `        const bestTradeVal = Math.max(...colonies.map(c => scoreColonyTrade(c, state)));
        // Trade costs 9 MC (or free if using energy/titanium)
        const tradeCost = (energy >= 3 || titanium >= 3) ? 0 : 9;`;

  const replacement = `        const bestTradeVal = Math.max(...colonies.map(c => scoreColonyTrade(c, state)));
        // Real trade cost: energy 3×1.7≈5 MC, MC=9, titanium 3×tiVal≈9 MC
        const tcTiVal = state?.thisPlayer?.titaniumValue || 3;
        const tcE = energy >= 3 ? 5 : 999;
        const tcMC2 = mc >= 9 ? 9 : 999;
        const tcTi = titanium >= 3 ? 3 * tcTiVal : 999;
        const tradeCost = Math.min(tcE, tcMC2, tcTi);`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 80b — accurate trade cost (standard trade)');
    applied++;
  } else {
    console.log('SKIP: Fix 80b (pattern not found)');
  }
}

// ===== Fix 80c: Endgame trade (from v28) =====
{
  const old = `          const egTradeCost = (energy >= 3 || titanium >= 3) ? 0 : 9;`;

  const replacement = `          // Real trade cost: energy ~5 MC, MC 9, titanium ~9 MC
          const egTiVal = state?.thisPlayer?.titaniumValue || 3;
          const egCostE = energy >= 3 ? 5 : 999;
          const egCostMC = mc >= 9 ? 9 : 999;
          const egCostTi = titanium >= 3 ? 3 * egTiVal : 999;
          const egTradeCost = Math.min(egCostE, egCostMC, egCostTi);`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 80c — accurate trade cost (endgame)');
    applied++;
  } else {
    console.log('SKIP: Fix 80c (pattern not found)');
  }
}

// ===== Fix 82: Milestone/tag proximity in card PLAY scoring =====
// Add milestone + tag synergy bonus to the card-vs-SP play EV calculation
{
  const old = `        .map(c => {
            let score = scoreCard(c, state);
            // VP and city cards get priority bonus — production values alone don't capture end-game VP
            if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) score += 8;
            if (CITY_CARDS.has(c.name)) score += 7;
            return { ...c, _score: score };
          })`;

  const replacement = `        .map(c => {
            let score = scoreCard(c, state);
            // VP and city cards get priority bonus — production values alone don't capture end-game VP
            if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) score += 8;
            if (CITY_CARDS.has(c.name)) score += 7;
            // Milestone proximity: playing tags that advance milestones = huge ROI (5 VP for 8 MC)
            const claimedMs = state?.game?.milestones?.filter(m => m.playerName) || [];
            if (claimedMs.length < 3) {
              const allMs = state?.game?.milestones || [];
              const myClr = state?.thisPlayer?.color;
              const cTags2 = CARD_TAGS[c.name] || [];
              const cData2 = CARD_DATA[c.name] || {};
              for (const ms of allMs) {
                if (ms.playerName) continue;
                const mySc = ms.scores?.find(s => s.color === myClr);
                if (!mySc) continue;
                const sc2 = mySc.score ?? 0;
                const mn = (ms.name || '').toLowerCase();
                // Builder: need 8 building tags
                if (mn.includes('builder') && sc2 >= 5 && cTags2.includes('building')) score += (8 - sc2 <= 2) ? 5 : 2;
                // Gardener: need 3 greeneries — plant prod cards help
                if (mn.includes('gardener') && sc2 >= 1 && (cData2.behavior?.production?.plants > 0)) score += 4;
                // Diversifier: 8 different tags — rare tags we lack
                if (mn.includes('diversifier') && sc2 >= 5) {
                  const myTgs = state?.thisPlayer?.tags || {};
                  if (cTags2.some(t => !(myTgs[t] > 0))) score += (8 - sc2 <= 2) ? 4 : 2;
                }
                // Ecologist: 4 bio tags
                if (mn.includes('ecologist') && sc2 >= 2 && cTags2.some(t => ['plant','animal','microbe'].includes(t))) score += (4 - sc2 <= 1) ? 5 : 2;
                // Legend: 5 events
                if (mn.includes('legend') && sc2 >= 3 && cTags2.includes('event')) score += (5 - sc2 <= 1) ? 5 : 2;
                // Rim Settler: 3 Jovian
                if (mn.includes('rim') && sc2 >= 1 && cTags2.includes('jovian')) score += (3 - sc2 <= 1) ? 5 : 3;
              }
            }
            // Tag synergy: cards matching concentrated tags get play priority
            const myTags2 = state?.thisPlayer?.tags || {};
            const cTags3 = CARD_TAGS[c.name] || [];
            for (const t of cTags3) { if ((myTags2[t] || 0) >= 3) score += 2; }
            return { ...c, _score: score };
          })`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 82 — milestone/tag proximity in card play scoring');
    applied++;
  } else {
    console.log('SKIP: Fix 82 (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
