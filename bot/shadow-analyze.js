#!/usr/bin/env node
/**
 * shadow-analyze.js — Analyze shadow bot logs to find bot decision weaknesses.
 *
 * Usage:
 *   node bot/shadow-analyze.js [data/shadow/shadow-*.jsonl]
 *   node bot/shadow-analyze.js --all                          (all shadow logs)
 *   node bot/shadow-analyze.js --last N                       (last N logs)
 *
 * Output: structured report of bot decision patterns, mistakes, and suggestions.
 * Feed this output to Claude/Codex to get smartbot.js improvements.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('path');

const SHADOW_DIR = path.resolve(__dirname, '..', 'data', 'shadow');

// === Args ===
const args = process.argv.slice(2);
let files = [];

if (args.includes('--all')) {
  if (fs.existsSync(SHADOW_DIR)) {
    files = fs.readdirSync(SHADOW_DIR).filter(f => f.endsWith('.jsonl')).map(f => path.join(SHADOW_DIR, f));
  }
} else if (args.includes('--last')) {
  const n = parseInt(args[args.indexOf('--last') + 1]) || 5;
  if (fs.existsSync(SHADOW_DIR)) {
    files = fs.readdirSync(SHADOW_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(SHADOW_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, n)
      .map(f => path.join(SHADOW_DIR, f.name));
  }
} else {
  files = args.filter(a => !a.startsWith('--'));
  if (files.length === 0 && fs.existsSync(SHADOW_DIR)) {
    // Default: most recent
    const all = fs.readdirSync(SHADOW_DIR).filter(f => f.endsWith('.jsonl'));
    if (all.length > 0) {
      const sorted = all
        .map(f => ({ name: f, mtime: fs.statSync(path.join(SHADOW_DIR, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      files = [path.join(SHADOW_DIR, sorted[0].name)];
    }
  }
}

if (files.length === 0) {
  console.log('No shadow logs found. Run shadow-bot.js first.');
  process.exit(1);
}

// === Parse logs ===
function parseLog(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch(e) {}
  }
  return entries;
}

// === Analysis ===
function analyze(entries) {
  const stats = {
    totalDecisions: 0,
    byType: {},        // promptType → count
    byGen: {},         // gen → {decisions, spChosen, cardChosen, passChosen}
    byPlayer: {},      // player → {decisions, actions}
    actionDistribution: {},  // botAction category → count
    spVsCard: { spWins: 0, cardWins: 0, bothNone: 0 },
    cardEVs: [],       // EV of cards bot wanted to play
    spEVs: [],         // EV of SP when chosen
    reasoningPatterns: { noCards: 0, noSP: 0, cardBetterThanSP: 0, spBetterThanCard: 0 },
    handSizes: [],     // how many playable cards bot saw
    mcAtDecision: [],  // MC when making action decisions
    lowMCDecisions: 0, // decisions with MC < 10
    passRate: { total: 0, passes: 0 },
    genDistribution: {},
  };

  for (const e of entries) {
    if (!e.botReasoning || e.botReasoning.length === 0) continue;
    if (!e.botReasoning.some(r => r.includes('DECISION'))) continue;

    stats.totalDecisions++;
    const gen = e.gen || 0;
    const player = e.player || '?';

    // By gen
    if (!stats.byGen[gen]) stats.byGen[gen] = { decisions: 0, sp: 0, card: 0, pass: 0, trade: 0, action: 0 };
    stats.byGen[gen].decisions++;

    // By player
    if (!stats.byPlayer[player]) stats.byPlayer[player] = { decisions: 0 };
    stats.byPlayer[player].decisions++;

    // Parse DECISION line
    const decLine = e.botReasoning.find(r => r.includes('DECISION'));
    const handLine = e.botReasoning.find(r => r.includes('hand('));
    const contextLine = e.botReasoning.find(r => r.startsWith('gen='));

    let cardName = null, cardEV = -999, spEV = -999;
    if (decLine) {
      const cardMatch = decLine.match(/card=(\w[^(]*)\((-?\d+)/);
      const spMatch = decLine.match(/vs SP\((-?\d+)/);
      cardName = cardMatch ? cardMatch[1].trim() : null;
      cardEV = cardMatch ? parseInt(cardMatch[2]) : -999;
      spEV = spMatch ? parseInt(spMatch[1]) : -999;

      if (cardName && cardName !== 'none' && cardEV > spEV) {
        stats.spVsCard.cardWins++;
        stats.cardEVs.push(cardEV);
        stats.byGen[gen].card++;
      } else if (spEV > -900) {
        stats.spVsCard.spWins++;
        stats.spEVs.push(spEV);
        stats.byGen[gen].sp++;
      } else {
        stats.spVsCard.bothNone++;
        stats.byGen[gen].pass++;
      }

      if (!cardName || cardName === 'none') stats.reasoningPatterns.noCards++;
      if (spEV <= -900) stats.reasoningPatterns.noSP++;
    }

    // Parse hand size
    if (handLine) {
      const handMatch = handLine.match(/hand\((\d+)\)/);
      if (handMatch) stats.handSizes.push(parseInt(handMatch[1]));
    }

    // MC at decision
    if (e.mc != null) {
      stats.mcAtDecision.push(e.mc);
      if (e.mc < 10) stats.lowMCDecisions++;
    }

    // Action type
    const action = e.botAction || '?';
    if (action.startsWith('play ')) {
      stats.actionDistribution['play card'] = (stats.actionDistribution['play card'] || 0) + 1;
    } else if (action.includes('option[')) {
      // Could be SP, pass, trade, etc.
      stats.actionDistribution['option'] = (stats.actionDistribution['option'] || 0) + 1;
    } else {
      stats.actionDistribution[action] = (stats.actionDistribution[action] || 0) + 1;
    }

    // Pass rate
    stats.passRate.total++;
    if (action.includes('pass') || (spEV <= -900 && (!cardName || cardName === 'none'))) {
      stats.passRate.passes++;
    }
  }

  return stats;
}

function formatReport(stats, files) {
  const lines = [];
  lines.push('# Shadow Bot Analysis Report');
  lines.push(`Files: ${files.length} | Total decisions: ${stats.totalDecisions}`);
  lines.push('');

  // Card vs SP
  lines.push('## Card vs SP Decisions');
  const total = stats.spVsCard.cardWins + stats.spVsCard.spWins + stats.spVsCard.bothNone;
  if (total > 0) {
    lines.push(`  Card wins: ${stats.spVsCard.cardWins} (${(stats.spVsCard.cardWins/total*100).toFixed(0)}%)`);
    lines.push(`  SP wins:   ${stats.spVsCard.spWins} (${(stats.spVsCard.spWins/total*100).toFixed(0)}%)`);
    lines.push(`  Neither:   ${stats.spVsCard.bothNone} (${(stats.spVsCard.bothNone/total*100).toFixed(0)}%)`);
  }
  if (stats.cardEVs.length > 0) {
    const avgCardEV = stats.cardEVs.reduce((a,b) => a+b, 0) / stats.cardEVs.length;
    lines.push(`  Avg card EV when played: ${avgCardEV.toFixed(1)}`);
  }
  if (stats.spEVs.length > 0) {
    const avgSpEV = stats.spEVs.reduce((a,b) => a+b, 0) / stats.spEVs.length;
    lines.push(`  Avg SP EV when chosen: ${avgSpEV.toFixed(1)}`);
  }
  lines.push('');

  // Hand sizes
  if (stats.handSizes.length > 0) {
    const avgHand = stats.handSizes.reduce((a,b) => a+b, 0) / stats.handSizes.length;
    lines.push('## Hand Analysis');
    lines.push(`  Avg playable cards in hand: ${avgHand.toFixed(1)}`);
    lines.push(`  Empty hand (0 playable): ${stats.reasoningPatterns.noCards} / ${stats.totalDecisions} (${(stats.reasoningPatterns.noCards/stats.totalDecisions*100).toFixed(0)}%)`);
    lines.push('');
  }

  // MC
  if (stats.mcAtDecision.length > 0) {
    const avgMC = stats.mcAtDecision.reduce((a,b) => a+b, 0) / stats.mcAtDecision.length;
    lines.push('## Economy');
    lines.push(`  Avg MC at action decision: ${avgMC.toFixed(0)}`);
    lines.push(`  Low MC (<10) decisions: ${stats.lowMCDecisions} / ${stats.totalDecisions} (${(stats.lowMCDecisions/stats.totalDecisions*100).toFixed(0)}%)`);
    lines.push('');
  }

  // Per-gen breakdown
  lines.push('## Per-Generation Breakdown');
  const gens = Object.keys(stats.byGen).map(Number).sort((a,b) => a-b);
  for (const gen of gens) {
    const g = stats.byGen[gen];
    lines.push(`  Gen ${gen}: ${g.decisions} decisions | card:${g.card} sp:${g.sp} pass:${g.pass}`);
  }
  lines.push('');

  // Problems detected
  lines.push('## Detected Issues');
  if (stats.reasoningPatterns.noCards / stats.totalDecisions > 0.6) {
    lines.push('  ⚠ EMPTY HAND >60% of decisions — bot runs out of playable cards too fast');
    lines.push('    → Consider: buy more cards, lower play threshold, hold cards for later gens');
  }
  if (stats.lowMCDecisions / stats.totalDecisions > 0.4) {
    lines.push('  ⚠ LOW MC >40% of decisions — bot spends MC too aggressively');
    lines.push('    → Consider: increase MC reserve, prioritize income production');
  }
  if (stats.spVsCard.spWins > stats.spVsCard.cardWins * 2) {
    lines.push('  ⚠ SP dominates cards 2:1 — scoreCard may undervalue cards');
    lines.push('    → Consider: increase sunk cost bonus, add tag value to scoreCard');
  }
  if (stats.spVsCard.bothNone / total > 0.5) {
    lines.push('  ⚠ >50% decisions have neither card nor SP — bot passes too much');
    lines.push('    → Consider: lower thresholds, use blue card actions more');
  }
  const earlyGens = gens.filter(g => g <= 3);
  const earlyPassRate = earlyGens.reduce((s, g) => s + (stats.byGen[g]?.pass || 0), 0) /
    Math.max(1, earlyGens.reduce((s, g) => s + (stats.byGen[g]?.decisions || 0), 0));
  if (earlyPassRate > 0.5) {
    lines.push('  ⚠ High pass rate in Gen 1-3 — bot not developing engine fast enough');
    lines.push('    → Consider: lower card play threshold early, buy more aggressively');
  }
  lines.push('');

  // Suggestions for Claude/Codex
  lines.push('## Suggestions for AI Code Review');
  lines.push('Feed this report to Claude/Codex with:');
  lines.push('  "Analyze this shadow bot report and suggest changes to bot/smartbot.js');
  lines.push('   to improve card play rate, reduce pass rate, and lower avg generation."');
  lines.push('');

  return lines.join('\n');
}

// === Main ===
const allEntries = [];
for (const file of files) {
  const entries = parseLog(file);
  allEntries.push(...entries);
  console.error(`Loaded ${entries.length} entries from ${path.basename(file)}`);
}

const stats = analyze(allEntries);
const report = formatReport(stats, files);
console.log(report);
