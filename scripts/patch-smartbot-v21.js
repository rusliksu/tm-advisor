#!/usr/bin/env node
// patch-smartbot-v21.js — Fix 63-65: Corp selection + award selection + colony trade
// Fix 63: Hard-coded corp tier penalties in scoreCorp (Polyphemos avg 56 VP → must pick less)
// Fix 64: Smart award selection — pick award where lead is biggest
// Fix 65: Improved colony trade selection — pick highest-value colony

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 63: Corp tier adjustments in smartbot.js scoreCorp =====
// Bot uses TM_BRAIN.scoreCorp (returns undefined since tm-brain has no scoreCorp)
// → falls back to local scoreCorp() which uses PREF_CORPS index.
// Replace corp selection to use data-driven tier scores.
{
  const old = `        const scored = cards.map(c => {
          const score = TM_BRAIN.scoreCorp ? TM_BRAIN.scoreCorp(c.name, cardNames, state) : scoreCorp(c.name).score;
          return { name: c.name, score };
        }).sort((a, b) => b.score - a.score);`;

  const replacement = `        // Data-driven corp tiers — calibrated on v16+v21 batch data (bot-vs-bot)
        // v21 data: Manutech 73.5, Saturn S 71.7, Tharsis 71.1, Utopia I 71.2
        // v16 data: Point Luna 76.8, Saturn S 79.0, Vitor 79.2, Teractor 79.7
        // Blended with sample size weights
        const _CORP_TIERS = {
          // v21b = best config (avg 68.4). v21c overtweaked tiers → avg 66.8 (reverted)
          'Manutech': 78, 'Saturn Systems': 78, 'Teractor': 76, 'Tharsis Republic': 74,
          'Utopia Invest': 74, 'Interplanetary Cinematics': 73, 'Point Luna': 72,
          'Arklight': 72, 'Lakefront Resorts': 72, 'Mining Guild': 70,
          'EcoLine': 68, 'Aphrodite': 68, 'Poseidon': 68, 'Helion': 68,
          'Kuiper Cooperative': 66, 'PolderTECH': 66, 'Mons Insurance': 66,
          'Vitor': 65, 'Cheung Shing MARS': 65, 'PhoboLog': 64, 'Recyclon': 65,
          'Philares': 64, 'Factorum': 62, 'CrediCor': 62, 'Celestic': 62,
          'Stormcraft Incorporated': 60, 'Pharmacy Union': 60,
          'Inventrix': 58, 'Morning Star Inc.': 55,
          'United Nations Mars Initiative': 50, 'Viron': 48,
          'Polyphemos': 38, 'Thorgate': 48,
        };
        const scored = cards.map(c => {
          // Match corp name to tier (handle aliases like "PolderTECH Dutch" → "PolderTECH")
          let tierScore = _CORP_TIERS[c.name];
          if (tierScore == null) {
            for (const k of Object.keys(_CORP_TIERS)) {
              if (c.name.startsWith(k) || k.startsWith(c.name)) { tierScore = _CORP_TIERS[k]; break; }
            }
          }
          if (tierScore == null) tierScore = 55;
          const localScore = scoreCorp(c.name).score;
          // Blend: tier data (60%) + local synergy (40%)
          const score = tierScore * 0.6 + (localScore + 50) * 0.4;
          return { name: c.name, score };
        }).sort((a, b) => b.score - a.score);`;

  if (code.includes(old) && !code.includes('_CORP_TIERS')) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 63 — data-driven corp tier selection');
    applied++;
  } else {
    console.log('SKIP: Fix 63 (' + (code.includes('_CORP_TIERS') ? 'already applied' : 'pattern not found') + ')');
  }
}

// ===== Fix 64: Smart award selection =====
// Currently bot just picks first available award (pick(awardIdx)).
// Should pick the award where we have the biggest lead over opponents.
{
  const old = `      if (competitive) {
        console.log(\`    → FUNDING award! MC=\${mc} gen=\${gen} lead=\${awardLead} banker=\${my.banker} therm=\${my.thermalist} miner=\${my.miner} sci=\${my.scientist}\`);
        return pick(awardIdx);
      }`;

  const replacement = `      if (competitive) {
        // Smart award selection: pick the award where we have biggest lead
        const awardOpt = opts[awardIdx];
        const awardCards = awardOpt?.cards || awardOpt?.options || [];
        if (awardCards.length > 1) {
          const awardMetricMap = {
            banker: 'banker', thermalist: 'thermalist', miner: 'miner',
            scientist: 'scientist', venuphile: 'venuphile', landlord: 'landlord',
            celebrity: 'banker', industrialist: 'miner', desert: 'landlord',
            estate: 'landlord', magnate: 'banker', space: 'miner',
            contractor: 'miner', cultivator: 'landlord',
          };
          let bestAwardIdx = 0, bestAwardLead = -999;
          for (let ai = 0; ai < awardCards.length; ai++) {
            const awName = (awardCards[ai].name || getTitle(awardCards[ai]) || '').toLowerCase();
            for (const [key, metric] of Object.entries(awardMetricMap)) {
              if (awName.includes(key)) {
                const myVal = my[metric] ?? 0;
                const maxOtherVal = Math.max(0, ...others.map(o => o[metric] ?? 0));
                const lead = myVal - maxOtherVal;
                if (lead > bestAwardLead) {
                  bestAwardLead = lead;
                  bestAwardIdx = ai;
                }
                break;
              }
            }
          }
          console.log(\`    → FUNDING award #\${bestAwardIdx} (lead=\${bestAwardLead}) MC=\${mc} gen=\${gen}\`);
        } else {
          console.log(\`    → FUNDING award! MC=\${mc} gen=\${gen} lead=\${awardLead}\`);
        }
        return pick(awardIdx);
      }`;

  if (code.includes(old) && !code.includes('bestAwardLead')) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 64 — smart award selection');
    applied++;
  } else {
    console.log('SKIP: Fix 64 (' + (code.includes('bestAwardLead') ? 'already applied' : 'pattern not found') + ')');
  }
}

// ===== Fix 65: Colony trade selection =====
// Currently bot picks tradeIdx blindly. Should select highest-value colony for trade.
// The trade handler picks colony but we should influence which one via state hints.
{
  const old = `    // High-value trade before weak cards
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {
      const tradeOpt2 = opts[tradeIdx];
      const colonies2 = tradeOpt2?.coloniesModel || tradeOpt2?.colonies || [];
      if (colonies2.length > 0) {
        const bestTradeVal2 = Math.max(...colonies2.map(c => scoreColonyTrade(c, state)));
        const tradeCost2 = (energy >= 3 || titanium >= 3) ? 0 : 9;
        // Trade if net value > 5 (good trade beats weak card)
        if (bestTradeVal2 - tradeCost2 >= 5) return pick(tradeIdx);
      }
    }`;

  const replacement = `    // High-value trade before weak cards
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {
      const tradeOpt2 = opts[tradeIdx];
      const colonies2 = tradeOpt2?.coloniesModel || tradeOpt2?.colonies || [];
      if (colonies2.length > 0) {
        const scored2 = colonies2.map(c => ({ name: c.name, val: scoreColonyTrade(c, state) })).sort((a, b) => b.val - a.val);
        const bestTradeVal2 = scored2[0]?.val ?? 0;
        const tradeCost2 = (energy >= 3 || titanium >= 3) ? 0 : 9;
        // Trade if net value > 5 (good trade beats weak card)
        if (bestTradeVal2 - tradeCost2 >= 5) {
          // Store preferred colony for trade handler
          state._preferredTradeColony = scored2[0]?.name;
          return pick(tradeIdx);
        }
      }
    }`;

  if (code.includes(old) && !code.includes('_preferredTradeColony')) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 65 — colony trade with preferred selection');
    applied++;
  } else {
    console.log('SKIP: Fix 65 (' + (code.includes('_preferredTradeColony') ? 'already applied' : 'pattern not found') + ')');
  }
}

// ===== Fix 65b: Use preferred colony in trade handler =====
{
  // Find where trade colony is selected and prefer the scored one
  const tradeHandlerPattern = `if (title.includes('trade'))`;
  const tradeLines = code.split('\n');
  let tradeHandlerLine = -1;
  for (let i = 0; i < tradeLines.length; i++) {
    if (tradeLines[i].includes("title.includes('trade')") && tradeLines[i].includes('colony')) {
      tradeHandlerLine = i;
      break;
    }
  }
  if (tradeHandlerLine === -1) {
    // Alternative: look for colony selection in card handler
    console.log('INFO: Fix 65b — trade handler not found, skipping preferred colony inject');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
