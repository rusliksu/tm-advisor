#!/usr/bin/env node
/**
 * shadow-analyze.js — Analyze shadow bot logs to find bot decision weaknesses.
 *
 * Usage:
 *   node bot/shadow-analyze.js [data/shadow/merged/merged-*.jsonl]
 *   node bot/shadow-analyze.js --all
 *   node bot/shadow-analyze.js --game <gameId>
 *   node bot/shadow-analyze.js --last N
 *   node bot/shadow-analyze.js --shadow-only
 *
 * By default, prefers merged logs when available, and falls back to raw shadow logs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {SHADOW_DIR} = require('./shadow-runtime');
const {MERGED_DIR, isBrokenPromptTitle, normalizeActionSummaryText, normalizeShadowPromptTitle} = require('./shadow-merge');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    all: args.includes('--all'),
    last: null,
    gameId: null,
    player: null,
    help: args.includes('--help') || args.includes('-h'),
    shadowOnly: args.includes('--shadow-only'),
    mergedOnly: args.includes('--merged-only'),
    files: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all' || arg === '--shadow-only' || arg === '--merged-only' || arg === '--help' || arg === '-h') continue;
    if (arg === '--game') {
      result.gameId = args[i + 1] || null;
      i++;
      continue;
    }
    if (arg === '--player') {
      result.player = args[i + 1] || null;
      i++;
      continue;
    }
    if (arg === '--last') {
      result.last = parseInt(args[i + 1], 10) || 5;
      i++;
      continue;
    }
    result.files.push(arg);
  }

  return result;
}

function normalizeCliFiles(files) {
  return files.filter((file) => file && !file.startsWith('--'));
}

function listJsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({
      path: path.join(dir, name),
      mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function resolveDefaultLogDir(options) {
  if (options.shadowOnly) return SHADOW_DIR;
  if (options.mergedOnly) return MERGED_DIR;
  const mergedFiles = listJsonlFiles(MERGED_DIR);
  if (mergedFiles.length > 0) return MERGED_DIR;
  return SHADOW_DIR;
}

function resolveFiles(options) {
  const explicitFiles = normalizeCliFiles(options.files).map((file) => path.resolve(file));
  if (explicitFiles.length > 0) return explicitFiles;

  const baseDir = resolveDefaultLogDir(options);
  if (options.gameId) {
    const mergedFile = path.join(MERGED_DIR, `merged-${options.gameId}.jsonl`);
    const shadowFile = path.join(SHADOW_DIR, `shadow-${options.gameId}.jsonl`);
    if (options.shadowOnly) return fs.existsSync(shadowFile) ? [shadowFile] : [];
    if (options.mergedOnly) return fs.existsSync(mergedFile) ? [mergedFile] : [];
    if (fs.existsSync(mergedFile)) return [mergedFile];
    return fs.existsSync(shadowFile) ? [shadowFile] : [];
  }

  const candidates = listJsonlFiles(baseDir);
  if (options.all) return candidates.map((entry) => entry.path);
  if (options.last != null) return candidates.slice(0, Math.max(1, options.last)).map((entry) => entry.path);
  return candidates.length > 0 ? [candidates[0].path] : [];
}

function formatUsage() {
  return [
    'Usage:',
    '  node bot/shadow-analyze.js [data/shadow/merged/merged-*.jsonl]',
    '  node bot/shadow-analyze.js --all',
    '  node bot/shadow-analyze.js --game <gameId>',
    '  node bot/shadow-analyze.js --player <name|id|color>',
    '  node bot/shadow-analyze.js --last N',
    '  node bot/shadow-analyze.js --shadow-only',
  ].join('\n');
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text.split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (entry.type === 'merge_meta') return [];

  if (entry.type === 'merged_turn') {
    const rawShadow = entry.shadow?.raw || {};
    const rawInput = entry.input?.raw || {};
    const promptTitle = (!isBrokenPromptTitle(entry.promptTitle) ? entry.promptTitle : '') || normalizeShadowPromptTitle(rawShadow) || rawInput.promptTitle || null;
    return [{
      sourceType: 'merged',
      matchStatus: entry.matchStatus || null,
      gen: entry.generation ?? rawShadow.gen ?? rawInput.generation ?? null,
      player: entry.player || rawShadow.player || rawInput.player || '?',
      playerId: entry.playerId || rawShadow.playerId || rawInput.playerId || null,
      color: entry.color || rawShadow.color || rawInput.color || null,
      promptType: entry.promptType || rawShadow.promptType || rawInput.promptType || null,
      promptTitle,
      botAction: normalizeActionSummaryText(entry.botAction || rawShadow.botAction || null),
      inputAction: rawInput.result && rawInput.result !== 'accepted' ? null : normalizeActionSummaryText(entry.inputAction || null),
      observedAction: entry.observedAction || rawShadow.observedAction || null,
      observedChanges: entry.shadow?.observedChanges || rawShadow.observedChanges || null,
      playerActed: entry.shadow?.playerActed ?? rawShadow.playerActed ?? null,
      status: entry.status || rawShadow.status || null,
      botReasoning: Array.isArray(entry.shadow?.botReasoning) ? entry.shadow.botReasoning : (Array.isArray(rawShadow.botReasoning) ? rawShadow.botReasoning : []),
      mc: rawShadow.mc ?? rawInput.mc ?? null,
      ts: entry.shadowTs || entry.inputTs || entry.resolvedAt || rawShadow.ts || rawInput.ts || null,
    }];
  }

  if (entry.gameId && typeof entry.botAction === 'string') {
    const promptTitle = normalizeShadowPromptTitle(entry) || null;
    return [{
      sourceType: 'shadow',
      matchStatus: null,
      gen: entry.gen ?? null,
      player: entry.player || '?',
      playerId: entry.playerId || null,
      color: entry.color || null,
      promptType: entry.promptType || null,
      promptTitle,
      botAction: normalizeActionSummaryText(entry.botAction || null),
      inputAction: null,
      observedAction: entry.observedAction || null,
      observedChanges: entry.observedChanges || null,
      playerActed: entry.playerActed ?? null,
      status: entry.status || null,
      botReasoning: Array.isArray(entry.botReasoning) ? entry.botReasoning : [],
      mc: entry.mc ?? null,
      ts: entry.ts || entry.resolvedAt || null,
    }];
  }

  return [];
}

function parseLog(file) {
  return readJsonl(file).flatMap(normalizeLogEntry);
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLowerCase();
}

function filterEntries(entries, options = {}) {
  const player = normalizeFilterText(options.player);
  if (!player) return entries;
  return entries.filter((entry) => {
    return normalizeFilterText(entry.player) === player ||
      normalizeFilterText(entry.playerId) === player ||
      normalizeFilterText(entry.color) === player;
  });
}

function canonicalizeAction(action) {
  const normalized = normalizeActionSummaryText(action);
  if (!normalized) return null;
  let value = String(normalized).trim();
  if (!value || value === '?') return null;
  if (value.includes(' | ')) value = value.split(' | ')[0];
  value = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return value || null;
}

function isExplicitPassAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (!value) return false;
  return value === 'pass' ||
    value === 'end turn' ||
    value === 'skip' ||
    value.includes('pass for this generation') ||
    value.includes('do nothing');
}

function isOpaqueOptionIndex(action) {
  return /^option\[\d+\]$/.test(String(action || '').trim());
}

const RAW_VP_DUMP_CARDS = new Set([
  'Interstellar Colony Ship',
]);

function isRawVpDumpAction(action) {
  const value = String(action || '').trim();
  const match = value.match(/^play\s+(.+)$/i);
  if (!match) return false;
  return RAW_VP_DUMP_CARDS.has(match[1].trim());
}

function hasResourceDelta(entry, key) {
  const resources = entry?.observedChanges?.resources || {};
  return Object.prototype.hasOwnProperty.call(resources, key);
}

function isCityAction(action) {
  const value = canonicalizeAction(action) || '';
  return value === 'play city' ||
    value === 'city' ||
    value.includes('city:sp') ||
    value.includes('standard project city');
}

function isFinishNowTerraformingAction(entry) {
  const input = canonicalizeAction(entry.inputAction) || '';
  const observed = String(entry.observedAction || '').toLowerCase();
  if (isCityAction(input)) return false;
  if (
    input.includes('asteroid:sp') ||
    input.includes('temperature') ||
    input.includes('greenery') ||
    input.includes('ocean')
  ) {
    return true;
  }
  if (input.startsWith('space ') && hasResourceDelta(entry, 'tr')) {
    return true;
  }
  if (observed.includes('resource delta') && hasResourceDelta(entry, 'tr')) {
    return hasResourceDelta(entry, 'heat') ||
      hasResourceDelta(entry, 'plants') ||
      hasResourceDelta(entry, 'mc');
  }
  return false;
}

function classifyStrategicOverride(entry) {
  if (isRawVpDumpAction(entry.botAction) && isFinishNowTerraformingAction(entry)) {
    return {
      type: 'finishNow',
      reason: 'player spent tempo on TR/global progress to end this generation',
    };
  }
  return null;
}

function classifyNoCardNoSpAction(action) {
  if (isExplicitPassAction(action)) return 'pass';
  if (isOpaqueOptionIndex(action)) return 'unknownOption';
  if (String(action || '').trim().startsWith('option')) return 'otherAction';
  return 'otherAction';
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitCardList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function changeContainsCard(changes, cardName) {
  if (!changes || !cardName) return false;
  const buckets = [
    'tableauAdded',
    'corpAdded',
    'preludeAdded',
    'draftedAdded',
    'actionsAdded',
  ];
  return buckets.some((bucket) => safeArray(changes[bucket]).includes(cardName));
}

function isIntermediateObservedAction(observedAction) {
  const value = String(observedAction || '').trim();
  return (
    !value ||
    value === 'state changed' ||
    value.startsWith('prompt ') ||
    value.startsWith('phase ') ||
    value.startsWith('resource delta') ||
    value.startsWith('corp ') ||
    value.startsWith('lastCard')
  );
}

function classifyObservedActionMatch(entry) {
  const status = entry.status || null;
  if (status && status !== 'resolved') {
    return {status: 'unscorable', reason: 'status!=resolved'};
  }
  if (entry.playerActed === false) {
    return {status: 'unscorable', reason: 'not acted'};
  }

  const botAction = String(entry.botAction || '').trim();
  const observedAction = String(entry.observedAction || '').trim();
  const changes = entry.observedChanges || {};
  if (!botAction) {
    return {status: 'unscorable', reason: 'no botAction'};
  }
  if (isIntermediateObservedAction(observedAction)) {
    return {status: 'unscorable', reason: 'intermediate observed action'};
  }

  if (botAction === 'initialCards') {
    return {status: 'unscorable', reason: 'initialCards bulk'};
  }
  if (botAction === 'option' || botAction.startsWith('option[')) {
    return {status: 'unscorable', reason: 'option index not comparable'};
  }
  if (botAction.startsWith('space ') || botAction.startsWith('player')) {
    return {status: 'unscorable', reason: 'board/player selection not comparable'};
  }

  if (botAction === 'pass') {
    const low = observedAction.toLowerCase();
    return (low.includes('pass') || low.includes('idle'))
      ? {status: 'match', reason: 'pass'}
      : {status: 'mismatch', reason: `bot pass, observed ${observedAction}`};
  }

  const cardsMatch = botAction.match(/^cards?:\s*(.+)$/);
  if (cardsMatch) {
    const cardNames = splitCardList(cardsMatch[1]);
    for (const cardName of cardNames) {
      if (
        observedAction === `draft ${cardName}` ||
        observedAction === `play ${cardName}` ||
        observedAction === `play card ${cardName}` ||
        observedAction === `action ${cardName}` ||
        changeContainsCard(changes, cardName)
      ) {
        return {status: 'match', reason: `card=${cardName}`};
      }
    }
    if (observedAction.startsWith('draft ')) {
      const picked = splitCardList(observedAction.slice('draft '.length));
      if (cardNames.some((cardName) => picked.includes(cardName))) {
        return {status: 'match', reason: 'card among multi-draft'};
      }
    }
    return {status: 'mismatch', reason: `bot=${cardNames.join(', ')}, observed=${observedAction}`};
  }

  const playMatch = botAction.match(/^play\s+(.+)$/);
  if (playMatch) {
    const cardName = playMatch[1].trim();
    if (
      observedAction === `play ${cardName}` ||
      observedAction === `play card ${cardName}` ||
      safeArray(changes.tableauAdded).includes(cardName)
    ) {
      return {status: 'match', reason: `played ${cardName}`};
    }
    return {status: 'mismatch', reason: `bot play ${cardName}, observed ${observedAction}`};
  }

  const colonyMatch = botAction.match(/^colony\s+(.+)$/);
  if (colonyMatch) {
    const colonyName = colonyMatch[1].trim();
    return observedAction.toLowerCase().includes(colonyName.toLowerCase())
      ? {status: 'match', reason: `colony ${colonyName}`}
      : {status: 'mismatch', reason: `bot colony ${colonyName}, observed ${observedAction}`};
  }

  return {status: 'unscorable', reason: `unknown ${botAction}`};
}

function analyze(entries) {
  const stats = {
    totalEntries: entries.length,
    totalDecisions: 0,
    byType: {},
    byGen: {},
    byPlayer: {},
    actionDistribution: {},
    spVsCard: {spWins: 0, cardWins: 0, bothNone: 0, otherActions: 0, unknownOptions: 0},
    cardEVs: [],
    spEVs: [],
    reasoningPatterns: {noCards: 0, noSP: 0, cardBetterThanSP: 0, spBetterThanCard: 0},
    projectCardCandidates: {noCandidateLine: 0, belowThreshold: 0},
    handSizes: [],
    mcAtDecision: [],
    lowMCDecisions: 0,
    passRate: {total: 0, passes: 0},
    genDistribution: {},
    sourceCoverage: {
      mergedTurns: 0,
      shadowTurns: 0,
      matched: 0,
      shadowOnly: 0,
      inputOnly: 0,
    },
    botVsPlayer: {
      comparable: 0,
      matched: 0,
      differed: 0,
      strategicOverrides: {
        finishNow: {count: 0, examples: []},
      },
      examples: [],
      byPromptType: {},
      mismatchPatterns: {},
    },
    botVsObserved: {
      scorable: 0,
      matched: 0,
      differed: 0,
      examples: [],
      byPromptType: {},
      mismatchPatterns: {},
    },
  };

  for (const e of entries) {
    if (e.sourceType === 'merged') {
      stats.sourceCoverage.mergedTurns++;
      if (e.matchStatus === 'matched') stats.sourceCoverage.matched++;
      else if (e.matchStatus === 'shadow_only') stats.sourceCoverage.shadowOnly++;
      else if (e.matchStatus === 'input_only') stats.sourceCoverage.inputOnly++;
    } else if (e.sourceType === 'shadow') {
      stats.sourceCoverage.shadowTurns++;
    }

    if (e.promptType) {
      stats.byType[e.promptType] = (stats.byType[e.promptType] || 0) + 1;
    }

    const comparableBot = canonicalizeAction(e.botAction);
    const comparableInput = canonicalizeAction(e.inputAction);
    if (comparableBot && comparableInput) {
      stats.botVsPlayer.comparable++;
      const promptKey = e.promptType || '?';
      if (!stats.botVsPlayer.byPromptType[promptKey]) {
        stats.botVsPlayer.byPromptType[promptKey] = {comparable: 0, matched: 0, differed: 0, strategic: 0};
      }
      stats.botVsPlayer.byPromptType[promptKey].comparable++;
      if (comparableBot === comparableInput) {
        stats.botVsPlayer.matched++;
        stats.botVsPlayer.byPromptType[promptKey].matched++;
      } else {
        const strategicOverride = classifyStrategicOverride(e);
        if (strategicOverride) {
          stats.botVsPlayer.byPromptType[promptKey].strategic++;
          const bucket = stats.botVsPlayer.strategicOverrides[strategicOverride.type];
          if (bucket) {
            bucket.count++;
            if (bucket.examples.length < 5) {
              bucket.examples.push({
                gen: e.gen,
                player: e.player,
                promptType: e.promptType,
                botAction: e.botAction,
                inputAction: e.inputAction,
                observedAction: e.observedAction,
                reason: strategicOverride.reason,
              });
            }
          }
          continue;
        }
        stats.botVsPlayer.differed++;
        stats.botVsPlayer.byPromptType[promptKey].differed++;
        const patternKey = [promptKey, comparableBot, comparableInput].join('||');
        if (!stats.botVsPlayer.mismatchPatterns[patternKey]) {
          stats.botVsPlayer.mismatchPatterns[patternKey] = {
            promptType: promptKey,
            botAction: e.botAction,
            inputAction: e.inputAction,
            comparableBot,
            comparableInput,
            count: 0,
            observedActions: {},
            sample: {
              gen: e.gen,
              player: e.player,
              observedAction: e.observedAction,
            },
          };
        }
        const pattern = stats.botVsPlayer.mismatchPatterns[patternKey];
        pattern.count++;
        const observedKey = e.observedAction || '?';
        pattern.observedActions[observedKey] = (pattern.observedActions[observedKey] || 0) + 1;
        if (stats.botVsPlayer.examples.length < 5) {
          stats.botVsPlayer.examples.push({
            gen: e.gen,
            player: e.player,
            promptType: e.promptType,
            botAction: e.botAction,
            inputAction: e.inputAction,
            observedAction: e.observedAction,
          });
        }
      }
    }

    const observedMatch = classifyObservedActionMatch(e);
    if (observedMatch.status === 'match' || observedMatch.status === 'mismatch') {
      const promptKey = e.promptType || '?';
      stats.botVsObserved.scorable++;
      if (!stats.botVsObserved.byPromptType[promptKey]) {
        stats.botVsObserved.byPromptType[promptKey] = {scorable: 0, matched: 0, differed: 0};
      }
      stats.botVsObserved.byPromptType[promptKey].scorable++;
      if (observedMatch.status === 'match') {
        stats.botVsObserved.matched++;
        stats.botVsObserved.byPromptType[promptKey].matched++;
      } else {
        stats.botVsObserved.differed++;
        stats.botVsObserved.byPromptType[promptKey].differed++;
        const patternKey = [promptKey, canonicalizeAction(e.botAction), String(e.observedAction || '').toLowerCase()].join('||');
        if (!stats.botVsObserved.mismatchPatterns[patternKey]) {
          stats.botVsObserved.mismatchPatterns[patternKey] = {
            promptType: promptKey,
            botAction: e.botAction,
            observedAction: e.observedAction,
            reason: observedMatch.reason,
            count: 0,
            sample: {
              gen: e.gen,
              player: e.player,
            },
          };
        }
        stats.botVsObserved.mismatchPatterns[patternKey].count++;
        if (stats.botVsObserved.examples.length < 5) {
          stats.botVsObserved.examples.push({
            gen: e.gen,
            player: e.player,
            promptType: e.promptType,
            botAction: e.botAction,
            observedAction: e.observedAction,
            reason: observedMatch.reason,
          });
        }
      }
    }

    if (!e.botReasoning || e.botReasoning.length === 0) continue;
    if (!e.botReasoning.some((line) => line.includes('DECISION'))) continue;

    stats.totalDecisions++;
    const gen = e.gen || 0;
    const player = e.player || '?';

    if (!stats.byGen[gen]) stats.byGen[gen] = {decisions: 0, sp: 0, card: 0, pass: 0, trade: 0, action: 0};
    stats.byGen[gen].decisions++;

    if (!stats.byPlayer[player]) stats.byPlayer[player] = {decisions: 0};
    stats.byPlayer[player].decisions++;

    const decLine = e.botReasoning.find((line) => line.includes('DECISION'));
    const handLine = e.botReasoning.find((line) => line.includes('hand('));

    let cardName = null;
    let cardEV = -999;
    let spEV = -999;
    if (decLine) {
      const cardMatch = decLine.match(/card=(\w[^(]*)\((-?\d+)/);
      const spMatch = decLine.match(/vs SP\((-?\d+)/);
      cardName = cardMatch ? cardMatch[1].trim() : null;
      cardEV = cardMatch ? parseInt(cardMatch[2], 10) : -999;
      spEV = spMatch ? parseInt(spMatch[1], 10) : -999;

      if (cardName && cardName !== 'none' && cardEV > spEV) {
        stats.spVsCard.cardWins++;
        stats.cardEVs.push(cardEV);
        stats.byGen[gen].card++;
      } else if (spEV > -900) {
        stats.spVsCard.spWins++;
        stats.spEVs.push(spEV);
        stats.byGen[gen].sp++;
      } else {
        const noCardNoSpKind = classifyNoCardNoSpAction(e.botAction);
        if (noCardNoSpKind === 'pass') {
          stats.spVsCard.bothNone++;
          stats.byGen[gen].pass++;
        } else if (noCardNoSpKind === 'unknownOption') {
          stats.spVsCard.unknownOptions++;
          stats.byGen[gen].action++;
        } else {
          stats.spVsCard.otherActions++;
          stats.byGen[gen].action++;
        }
      }

      if (!cardName || cardName === 'none') {
        stats.reasoningPatterns.noCards++;
        const handCountMatch = handLine ? handLine.match(/hand\((\d+)\)/) : null;
        const handCount = handCountMatch ? parseInt(handCountMatch[1], 10) : 0;
        if (handCount > 0) stats.projectCardCandidates.belowThreshold++;
        else stats.projectCardCandidates.noCandidateLine++;
      }
      if (spEV <= -900) stats.reasoningPatterns.noSP++;
    }

    if (handLine) {
      const handMatch = handLine.match(/hand\((\d+)\)/);
      if (handMatch) stats.handSizes.push(parseInt(handMatch[1], 10));
    }

    if (e.mc != null) {
      stats.mcAtDecision.push(e.mc);
      if (e.mc < 10) stats.lowMCDecisions++;
    }

    const action = e.botAction || '?';
    if (action.startsWith('play ')) {
      stats.actionDistribution['play card'] = (stats.actionDistribution['play card'] || 0) + 1;
    } else if (action.includes('option[')) {
      stats.actionDistribution.option = (stats.actionDistribution.option || 0) + 1;
    } else {
      stats.actionDistribution[action] = (stats.actionDistribution[action] || 0) + 1;
    }

    stats.passRate.total++;
    if (isExplicitPassAction(action)) {
      stats.passRate.passes++;
    }
  }

  return stats;
}

function formatReport(stats, files) {
  const lines = [];
  lines.push('# Shadow Bot Analysis Report');
  lines.push(`Files: ${files.length} | Parsed entries: ${stats.totalEntries} | Total decisions: ${stats.totalDecisions}`);
  lines.push('');

  if (stats.sourceCoverage.mergedTurns > 0 || stats.sourceCoverage.shadowTurns > 0) {
    lines.push('## Log Coverage');
    lines.push(`  Merged turns: ${stats.sourceCoverage.mergedTurns}`);
    if (stats.sourceCoverage.mergedTurns > 0) {
      lines.push(`  Matched exact inputs: ${stats.sourceCoverage.matched}`);
      lines.push(`  Shadow only:          ${stats.sourceCoverage.shadowOnly}`);
      lines.push(`  Input only:           ${stats.sourceCoverage.inputOnly}`);
      if (stats.sourceCoverage.matched === 0 && stats.sourceCoverage.shadowOnly > 0) {
        lines.push('  WARNING: no exact player-input matches; observed mismatch analysis is heuristic.');
      }
    }
    lines.push(`  Raw shadow turns: ${stats.sourceCoverage.shadowTurns}`);
    lines.push('');
  }

  if (stats.botVsPlayer.comparable > 0) {
    lines.push('## Bot vs Exact Player Input');
    lines.push(`  Comparable turns: ${stats.botVsPlayer.comparable}`);
    lines.push(`  Matched:          ${stats.botVsPlayer.matched} (${(stats.botVsPlayer.matched / stats.botVsPlayer.comparable * 100).toFixed(0)}%)`);
    const finishNowOverrides = stats.botVsPlayer.strategicOverrides.finishNow.count;
    if (finishNowOverrides > 0) {
      lines.push(`  Finish-now overrides: ${finishNowOverrides} (not counted as generic mismatch)`);
      for (const example of stats.botVsPlayer.strategicOverrides.finishNow.examples) {
        lines.push(`    Gen ${example.gen ?? '?'} ${example.player || '?'}: bot=${example.botAction} | input=${example.inputAction} | ${example.reason}`);
      }
    }
    lines.push(`  Differed:         ${stats.botVsPlayer.differed} (${(stats.botVsPlayer.differed / stats.botVsPlayer.comparable * 100).toFixed(0)}%)`);
    for (const example of stats.botVsPlayer.examples) {
      lines.push(`  Mismatch gen ${example.gen ?? '?'} ${example.player || '?'} [${example.promptType || '?'}]: bot=${example.botAction} | input=${example.inputAction} | observed=${example.observedAction || '?'}`);
    }
    lines.push('');

    const promptBreakdown = Object.entries(stats.botVsPlayer.byPromptType)
      .sort((a, b) => {
        const differedDelta = b[1].differed - a[1].differed;
        if (differedDelta !== 0) return differedDelta;
        return b[1].comparable - a[1].comparable;
      });
    if (promptBreakdown.length > 0) {
      lines.push('## Mismatch Breakdown By Prompt');
      for (const [promptType, promptStats] of promptBreakdown) {
        const mismatchRate = promptStats.comparable > 0 ? (promptStats.differed / promptStats.comparable * 100) : 0;
        const strategicSuffix = promptStats.strategic ? `, strategic ${promptStats.strategic}` : '';
        lines.push(`  ${promptType}: differed ${promptStats.differed}/${promptStats.comparable} (${mismatchRate.toFixed(0)}%)${strategicSuffix}`);
      }
      lines.push('');
    }

    const topPatterns = Object.values(stats.botVsPlayer.mismatchPatterns)
      .sort((a, b) => {
        const countDelta = b.count - a.count;
        if (countDelta !== 0) return countDelta;
        return a.promptType.localeCompare(b.promptType);
      })
      .slice(0, 8);
    if (topPatterns.length > 0) {
      lines.push('## Top Mismatch Patterns');
      for (const pattern of topPatterns) {
        const observed = Object.entries(pattern.observedActions)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || pattern.sample.observedAction || '?';
        lines.push(`  [${pattern.promptType}] ${pattern.botAction} -> ${pattern.inputAction} | count=${pattern.count} | observed=${observed}`);
      }
      lines.push('');
    }
  }

  if (stats.botVsObserved.scorable > 0) {
    lines.push('## Bot vs Observed Outcome');
    lines.push(`  Scorable turns: ${stats.botVsObserved.scorable}`);
    lines.push(`  Matched:        ${stats.botVsObserved.matched} (${(stats.botVsObserved.matched / stats.botVsObserved.scorable * 100).toFixed(0)}%)`);
    lines.push(`  Differed:       ${stats.botVsObserved.differed} (${(stats.botVsObserved.differed / stats.botVsObserved.scorable * 100).toFixed(0)}%)`);
    for (const example of stats.botVsObserved.examples) {
      lines.push(`  Mismatch gen ${example.gen ?? '?'} ${example.player || '?'} [${example.promptType || '?'}]: bot=${example.botAction} | observed=${example.observedAction || '?'} | ${example.reason}`);
    }
    lines.push('');

    const observedPromptBreakdown = Object.entries(stats.botVsObserved.byPromptType)
      .sort((a, b) => {
        const differedDelta = b[1].differed - a[1].differed;
        if (differedDelta !== 0) return differedDelta;
        return b[1].scorable - a[1].scorable;
      });
    if (observedPromptBreakdown.length > 0) {
      lines.push('## Observed Mismatch Breakdown By Prompt');
      for (const [promptType, promptStats] of observedPromptBreakdown) {
        const mismatchRate = promptStats.scorable > 0 ? (promptStats.differed / promptStats.scorable * 100) : 0;
        lines.push(`  ${promptType}: differed ${promptStats.differed}/${promptStats.scorable} (${mismatchRate.toFixed(0)}%)`);
      }
      lines.push('');
    }

    const topObservedPatterns = Object.values(stats.botVsObserved.mismatchPatterns)
      .sort((a, b) => {
        const countDelta = b.count - a.count;
        if (countDelta !== 0) return countDelta;
        return a.promptType.localeCompare(b.promptType);
      })
      .slice(0, 8);
    if (topObservedPatterns.length > 0) {
      lines.push('## Top Observed Mismatch Patterns');
      for (const pattern of topObservedPatterns) {
        lines.push(`  [${pattern.promptType}] ${pattern.botAction} -> ${pattern.observedAction || '?'} | count=${pattern.count} | ${pattern.reason}`);
      }
      lines.push('');
    }
  }

  lines.push('## Card vs SP Decisions');
  const total = stats.spVsCard.cardWins + stats.spVsCard.spWins + stats.spVsCard.bothNone +
    stats.spVsCard.otherActions + stats.spVsCard.unknownOptions;
  if (total > 0) {
    lines.push(`  Card wins: ${stats.spVsCard.cardWins} (${(stats.spVsCard.cardWins / total * 100).toFixed(0)}%)`);
    lines.push(`  SP wins:   ${stats.spVsCard.spWins} (${(stats.spVsCard.spWins / total * 100).toFixed(0)}%)`);
    lines.push(`  Explicit pass/no-op: ${stats.spVsCard.bothNone} (${(stats.spVsCard.bothNone / total * 100).toFixed(0)}%)`);
    lines.push(`  Other actions: ${stats.spVsCard.otherActions} (${(stats.spVsCard.otherActions / total * 100).toFixed(0)}%)`);
    lines.push(`  Unclassified option actions: ${stats.spVsCard.unknownOptions} (${(stats.spVsCard.unknownOptions / total * 100).toFixed(0)}%)`);
  }
  if (stats.cardEVs.length > 0) {
    const avgCardEV = stats.cardEVs.reduce((a, b) => a + b, 0) / stats.cardEVs.length;
    lines.push(`  Avg card EV when played: ${avgCardEV.toFixed(1)}`);
  }
  if (stats.spEVs.length > 0) {
    const avgSpEV = stats.spEVs.reduce((a, b) => a + b, 0) / stats.spEVs.length;
    lines.push(`  Avg SP EV when chosen: ${avgSpEV.toFixed(1)}`);
  }
  lines.push('');

  if (stats.handSizes.length > 0 || stats.totalDecisions > 0) {
    lines.push('## Hand Analysis');
    if (stats.handSizes.length > 0) {
      const avgHand = stats.handSizes.reduce((a, b) => a + b, 0) / stats.handSizes.length;
      lines.push(`  Avg playable cards in hand: ${avgHand.toFixed(1)}`);
    } else {
      lines.push('  Avg playable cards in hand: n/a');
    }
    if (stats.totalDecisions > 0) {
      lines.push(`  No project-card candidate: ${stats.reasoningPatterns.noCards} / ${stats.totalDecisions} (${(stats.reasoningPatterns.noCards / stats.totalDecisions * 100).toFixed(0)}%)`);
      lines.push(`  No candidate line: ${stats.projectCardCandidates.noCandidateLine}`);
      lines.push(`  Candidates below threshold: ${stats.projectCardCandidates.belowThreshold}`);
    }
    lines.push('');
  }

  if (stats.mcAtDecision.length > 0) {
    const avgMC = stats.mcAtDecision.reduce((a, b) => a + b, 0) / stats.mcAtDecision.length;
    lines.push('## Economy');
    lines.push(`  Avg MC at action decision: ${avgMC.toFixed(0)}`);
    if (stats.totalDecisions > 0) {
      lines.push(`  Low MC (<10) decisions: ${stats.lowMCDecisions} / ${stats.totalDecisions} (${(stats.lowMCDecisions / stats.totalDecisions * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  lines.push('## Per-Generation Breakdown');
  const gens = Object.keys(stats.byGen).map(Number).sort((a, b) => a - b);
  for (const gen of gens) {
    const genStats = stats.byGen[gen];
    lines.push(`  Gen ${gen}: ${genStats.decisions} decisions | card:${genStats.card} sp:${genStats.sp} pass:${genStats.pass}`);
  }
  lines.push('');

  lines.push('## Detected Issues');
  if (stats.sourceCoverage.mergedTurns > 0 && stats.sourceCoverage.matched === 0 && stats.sourceCoverage.shadowOnly > 0) {
    lines.push('  NO EXACT PLAYER INPUTS — server-input log is missing or not merged');
    lines.push('  Configure TM server with SHADOW_LOG=1 and SHADOW_LOG_DIR=data/shadow/server-inputs before using mismatch rates for calibration');
  }
  if (stats.totalDecisions === 0) {
    lines.push('  No DECISION traces found in the selected logs.');
  } else {
    if (stats.reasoningPatterns.noCards / stats.totalDecisions > 0.6) {
      lines.push('  NO PROJECT-CARD CANDIDATE >60% of decisions — bot often has no playable/scored project card');
      lines.push('  Consider: buy more cards, improve affordability, lower play threshold, or use action/SP labels before tuning pass rate');
    }
    if (stats.lowMCDecisions / stats.totalDecisions > 0.4) {
      lines.push('  LOW MC >40% of decisions — bot spends MC too aggressively');
      lines.push('  Consider: increase MC reserve, prioritize income production');
    }
    if (stats.spVsCard.spWins > stats.spVsCard.cardWins * 2) {
      lines.push('  SP dominates cards 2:1 — scoreCard may undervalue cards');
      lines.push('  Consider: increase sunk cost bonus, add tag value to scoreCard');
    }
    if (total > 0 && stats.spVsCard.unknownOptions / total > 0.25) {
      lines.push('  RAW OPTION ACTIONS >25% — old shadow logs do not identify selected option titles');
      lines.push('  Consider: regenerate shadow logs after runtime option-label logging before tuning pass rate');
    }
    const classifiedDecisionTotal = Math.max(1, total - stats.spVsCard.unknownOptions);
    if (total > 0 && stats.spVsCard.bothNone / classifiedDecisionTotal > 0.5) {
      lines.push('  >50% decisions have neither card nor SP — bot passes too much');
      lines.push('  Consider: lower thresholds, use blue card actions more');
    }
    const earlyGens = gens.filter((gen) => gen <= 3);
    const earlyPassRate = earlyGens.reduce((sum, gen) => sum + (stats.byGen[gen]?.pass || 0), 0) /
      Math.max(1, earlyGens.reduce((sum, gen) => sum + (stats.byGen[gen]?.decisions || 0), 0));
    if (earlyPassRate > 0.5) {
      lines.push('  High pass rate in Gen 1-3 — bot not developing engine fast enough');
      lines.push('  Consider: lower card play threshold early, buy more aggressively');
    }
    if (stats.botVsPlayer.comparable > 0 && stats.botVsPlayer.differed / stats.botVsPlayer.comparable > 0.4) {
      lines.push('  Bot choices diverge from exact player input on >40% of comparable turns');
      lines.push('  Consider: inspect mismatch examples before changing card scoring heuristics');
    }
    if (stats.botVsObserved.scorable > 0 && stats.botVsObserved.differed / stats.botVsObserved.scorable > 0.4) {
      lines.push('  Bot choices diverge from observed player outcomes on >40% of scorable turns');
      const exactCoverage = stats.sourceCoverage.matched > 0;
      lines.push(exactCoverage
        ? '  Consider: inspect observed mismatch patterns, then add focused bot regressions'
        : '  Consider: treat this as pattern evidence only until exact player-input logs are captured');
    }
  }
  lines.push('');

  lines.push('## Suggestions for AI Code Review');
  if (stats.totalDecisions === 0) {
    lines.push('Feed this report to Claude/Codex with:');
    lines.push('  "Investigate why this game produced zero shadow DECISION traces.');
    lines.push('   Check start-live-logging coverage, shadow log paths, and server-input capture before changing bot logic."');
  } else {
    lines.push('Feed this report to Claude/Codex with:');
    lines.push('  "Analyze this shadow bot report and suggest changes to bot/smartbot.js');
    lines.push('   to improve card play rate, reduce pass rate, and lower avg generation."');
  }
  lines.push('');

  return lines.join('\n');
}

function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(formatUsage());
    return 0;
  }
  const files = resolveFiles(options);
  if (files.length === 0) {
    console.log('No shadow or merged logs found. Run shadow-watch-server.js first.');
    return 1;
  }

  const allEntries = [];
  for (const file of files) {
    const entries = parseLog(file);
    allEntries.push(...entries);
    console.error(`Loaded ${entries.length} entries from ${path.basename(file)}`);
  }

  const filteredEntries = filterEntries(allEntries, options);
  if (options.player) {
    console.error(`Filtered ${filteredEntries.length}/${allEntries.length} entries for player ${options.player}`);
  }

  const stats = analyze(filteredEntries);
  console.log(formatReport(stats, files));
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  analyze,
  canonicalizeAction,
  formatReport,
  filterEntries,
  main,
  normalizeLogEntry,
  parseArgs,
  parseLog,
  resolveFiles,
};
