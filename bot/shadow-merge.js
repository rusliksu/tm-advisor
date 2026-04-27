#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {SHADOW_DIR, summarizeAction} = require('./shadow-runtime');

const SERVER_INPUT_DIR = path.join(SHADOW_DIR, 'server-inputs');
const MERGED_DIR = path.join(SHADOW_DIR, 'merged');
const MATCH_EARLY_MS = 180 * 1000;
const MATCH_LATE_MS = 15 * 1000;
const PRECURSOR_WINDOW_MS = 45 * 1000;
const FOLLOWUP_WINDOW_MS = 20 * 1000;
const SYNTHETIC_INPUT_GAP_MS = 20 * 1000;
const SYNTHETIC_DRAFT_GAP_MS = 30 * 1000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    gameIds: [],
    shadowDir: SHADOW_DIR,
    inputDir: SERVER_INPUT_DIR,
    outputDir: MERGED_DIR,
    mode: 'default',
    last: 5,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      result.mode = 'all';
      continue;
    }
    if (arg === '--last' && args[i + 1]) {
      result.mode = 'last';
      result.last = parseInt(args[++i], 10) || result.last;
      continue;
    }
    if (arg === '--shadow-dir' && args[i + 1]) {
      result.shadowDir = path.resolve(args[++i]);
      continue;
    }
    if (arg === '--input-dir' && args[i + 1]) {
      result.inputDir = path.resolve(args[++i]);
      continue;
    }
    if (arg === '--output-dir' && args[i + 1]) {
      result.outputDir = path.resolve(args[++i]);
      continue;
    }
    result.gameIds.push(normalizeGameId(arg));
  }

  return result;
}

function normalizeGameId(value) {
  return String(value || '').trim().replace(/^shadow-/, '').replace(/^input-/, '').replace(/\.jsonl$/i, '');
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

function writeJsonl(file, entries) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const payload = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(file, payload ? payload + '\n' : '', 'utf8');
}

function getShadowFile(gameId, shadowDir = SHADOW_DIR) {
  return path.join(shadowDir, `shadow-${gameId}.jsonl`);
}

function getInputFile(gameId, inputDir = SERVER_INPUT_DIR) {
  return path.join(inputDir, `input-${gameId}.jsonl`);
}

function getMergedFile(gameId, outputDir = MERGED_DIR) {
  return path.join(outputDir, `merged-${gameId}.jsonl`);
}

function isShadowTurnEntry(entry) {
  return Boolean(entry && entry.gameId && entry.playerId && typeof entry.botAction === 'string');
}

function isInputEntry(entry) {
  return Boolean(entry && entry.source === 'player-input' && entry.gameId && entry.playerId);
}

function toSeq(value) {
  if (value === undefined || value === null || value === '') return null;
  const seq = Number(value);
  return Number.isInteger(seq) ? seq : null;
}

function toMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function getPromptOptionLabel(context, index) {
  if (!context || index === undefined || index === null) return null;
  const options = Array.isArray(context.promptOptions) ? context.promptOptions : [];
  const option = options[Number(index)];
  const title = normalizePromptTitle(option?.title || '');
  return title || null;
}

function summarizeIndexedOption(action, context) {
  const fallback = summarizeAction(action);
  const label = getPromptOptionLabel(context, action?.index);
  return label ? `${fallback}: ${label}` : fallback;
}

function summarizePlayerInputAction(action, context = null) {
  if (!action) return null;
  if (action.type === 'initialCards') {
    const responses = Array.isArray(action.responses) ? action.responses : [];
    const corp = Array.isArray(responses[0]?.cards) ? responses[0].cards : [];
    const preludes = Array.isArray(responses[1]?.cards) ? responses[1].cards : [];
    const bought = Array.isArray(responses[responses.length - 1]?.cards) ? responses[responses.length - 1].cards : [];
    const parts = ['initialCards'];
    if (corp.length > 0) parts.push(`corp=${corp.join(', ')}`);
    if (preludes.length > 0) parts.push(`preludes=${preludes.join(', ')}`);
    if (bought.length > 0) parts.push(`buy=${bought.join(', ')}`);
    return parts.join(' | ');
  }
  if ((action.type === 'or' || action.type === 'option') && action.response) {
    const nestedSummary = summarizePlayerInputAction(action.response, context);
    if (nestedSummary && nestedSummary !== 'option') {
      return nestedSummary;
    }
    return summarizeIndexedOption(action, context);
  }
  if ((action.type === 'or' || action.type === 'option') && action.index !== undefined) {
    return summarizeIndexedOption(action, context);
  }
  return summarizeAction(action);
}

function normalizeActionSummaryText(action) {
  if (action === undefined || action === null) return null;
  const value = String(action)
    .replace(/option\[(?:undefined|null|nan)\]/gi, 'option')
    .replace(/\s+/g, ' ')
    .trim();
  return value || null;
}

function extractActionTokens(action) {
  if (!action) return [];
  if (action.type === 'card') {
    return Array.isArray(action.cards) ? action.cards.filter(Boolean) : [];
  }
  if (action.type === 'initialCards') {
    const responses = Array.isArray(action.responses) ? action.responses : [];
    return responses.flatMap((response) => Array.isArray(response?.cards) ? response.cards.filter(Boolean) : []);
  }
  if (action.type === 'projectCard' && action.card) {
    return [action.card];
  }
  if ((action.type === 'or' || action.type === 'option') && action.response) {
    return extractActionTokens(action.response);
  }
  if (Array.isArray(action.responses)) {
    return action.responses.flatMap((response) => extractActionTokens(response));
  }
  if (typeof action.card === 'string' && action.card) {
    return [action.card];
  }
  return [];
}

function extractInputTokens(input) {
  return extractActionTokens(input?.playerAction);
}

function extractShadowObservedTokens(shadow) {
  const changes = shadow?.observedChanges || {};
  return [
    ...safeArray(changes.tableauAdded),
    ...safeArray(changes.draftedAdded),
    ...safeArray(changes.corpAdded),
    ...safeArray(changes.preludeAdded),
    ...safeArray(changes.ceoAdded),
  ].filter(Boolean);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePromptTitle(title) {
  const value = String(title || '').trim();
  if (!value) return '';
  if (/^Take your (first|next) action$/i.test(value)) return 'Take your action';
  return value;
}

function isBrokenPromptTitle(title) {
  const value = String(title || '').trim();
  return value === '[object Object]';
}

function inferShadowPromptTitle(shadow) {
  const changes = shadow?.observedChanges || {};
  const promptType = shadow?.promptType || null;
  const phase = shadow?.phase || changes.phaseFrom || changes.phaseTo || '';

  if (promptType === 'card') {
    const draftedCount = safeArray(changes.draftedAdded).length;
    const packChanged = safeArray(changes.currentPackAdded).length > 0 || safeArray(changes.currentPackRemoved).length > 0;
    if (phase === 'initial_drafting' || phase === 'drafting' || draftedCount > 0 || packChanged) {
      return draftedCount > 1
        ? 'Select two cards to keep and pass the rest to ${0}'
        : 'Select a card to keep and pass the rest to ${0}';
    }
  }

  return '';
}

function normalizeShadowPromptTitle(shadow) {
  const original = typeof shadow?.title === 'string' ? shadow.title : '';
  if (!isBrokenPromptTitle(original)) return original;
  return inferShadowPromptTitle(shadow) || '';
}

function promptTitlesEquivalent(left, right) {
  const a = normalizePromptTitle(left);
  const b = normalizePromptTitle(right);
  if (!a || !b) return true;
  return a === b;
}

function isActionPromptTitle(title) {
  return normalizePromptTitle(title) === 'Take your action';
}

function countOverlap(left, right) {
  const rightSet = new Set(safeArray(right));
  let matches = 0;
  for (const item of safeArray(left)) {
    if (rightSet.has(item)) matches++;
  }
  return matches;
}

function inputMatchesShadowWindow(input, shadow) {
  const inputTs = toMs(input.ts);
  if (inputTs === null) return false;
  const shadowStart = toMs(shadow.ts) ?? toMs(shadow.resolvedAt) ?? inputTs;
  const shadowEnd = toMs(shadow.resolvedAt) ?? shadowStart;
  return inputTs >= (shadowStart - MATCH_EARLY_MS) && inputTs <= (shadowEnd + MATCH_LATE_MS);
}

function inputMatchesPrompt(shadow, input) {
  if (shadow.promptType && input.promptType && shadow.promptType !== input.promptType) return false;
  if (!promptTitlesEquivalent(normalizeShadowPromptTitle(shadow), input.promptTitle)) return false;
  return true;
}

function inputMatchesShadowSeqRange(input, shadow) {
  const inputSeq = toSeq(input?.inputSeq);
  const shadowInputSeq = toSeq(shadow?.inputSeq);
  if (inputSeq === null || shadowInputSeq === null) return false;
  const promptInputSeq = toSeq(shadow?.promptInputSeq) ?? (shadowInputSeq - 1);
  if (shadowInputSeq <= promptInputSeq) return false;
  return inputSeq > promptInputSeq && inputSeq <= shadowInputSeq;
}

function computeMatchScore(input, shadow) {
  const inputTs = toMs(input.ts) ?? 0;
  const shadowStart = toMs(shadow.ts) ?? inputTs;
  const shadowResolved = toMs(shadow.resolvedAt) ?? toMs(shadow.ts) ?? inputTs;
  const observedTokens = extractShadowObservedTokens(shadow);
  const inputTokens = extractInputTokens(input);
  const overlap = countOverlap(inputTokens, observedTokens);
  let score = Math.abs(shadowResolved - inputTs);
  if (inputTs > shadowResolved) score += 45 * 1000;
  if (inputTs < shadowStart) score += 15 * 1000;
  if (shadow.promptType && input.promptType && shadow.promptType !== input.promptType) score += 60 * 1000;
  if (input.result && input.result !== 'accepted') score += 120 * 1000;
  if (shadow.player && input.player && shadow.player !== input.player) score += 5 * 1000;
  if (observedTokens.length > 0) {
    if (overlap > 0) {
      score -= overlap * 90 * 1000;
      if (isMatchedActionKind(input.playerAction)) {
        score -= 45 * 1000;
      }
    } else {
      score += 180 * 1000;
    }
  }
  return {score, overlap, observedTokens, inputTokens};
}

function expectedInputCount(shadow) {
  if (shadow?.promptType === 'card') {
    const draftCount = safeArray(shadow?.observedChanges?.draftedAdded).length;
    if (draftCount > 0) return draftCount;
  }
  if (shadow?.promptType === 'or') {
    const playedCount = safeArray(shadow?.observedChanges?.tableauAdded).length;
    if (playedCount > 1) return playedCount;
  }
  return 1;
}

function getNextShadowBoundaryByPlayer(sortedShadowTurns) {
  const nextBoundary = new Map();
  const nextResolvedByPlayer = new Map();
  for (let i = sortedShadowTurns.length - 1; i >= 0; i--) {
    const shadow = sortedShadowTurns[i];
    const playerId = shadow.playerId || '';
    nextBoundary.set(shadow, nextResolvedByPlayer.get(playerId) ?? null);
    const startMs = toMs(shadow.ts) ?? toMs(shadow.resolvedAt) ?? null;
    if (startMs !== null) nextResolvedByPlayer.set(playerId, startMs);
  }
  return nextBoundary;
}

function getPreviousShadowBoundaryByPlayer(sortedShadowTurns) {
  const previousBoundary = new Map();
  const lastResolvedByPlayer = new Map();
  for (const shadow of sortedShadowTurns) {
    const playerId = shadow.playerId || '';
    previousBoundary.set(shadow, lastResolvedByPlayer.get(playerId) ?? null);
    const resolvedMs = toMs(shadow.resolvedAt) ?? toMs(shadow.ts) ?? null;
    if (resolvedMs !== null) lastResolvedByPlayer.set(playerId, resolvedMs);
  }
  return previousBoundary;
}

function collectPrecursorInputs(sortedShadowTurns, availableInputs, matches) {
  const precursorInputs = new Map();
  const previousBoundary = getPreviousShadowBoundaryByPlayer(sortedShadowTurns);

  for (const shadow of sortedShadowTurns) {
    const matchedInputs = safeArray(matches.get(shadow));
    if (matchedInputs.length === 0) continue;

    const matchedTimes = matchedInputs.map((input) => toMs(input.ts)).filter((value) => value !== null);
    if (matchedTimes.length === 0) continue;
    const upperBound = Math.max(...matchedTimes);
    const lowerBound = Math.max(previousBoundary.get(shadow) ?? -Infinity, upperBound - PRECURSOR_WINDOW_MS);

    const picked = availableInputs
      .filter((candidate) => !candidate.used)
      .filter((candidate) => {
        const input = candidate.input;
        const inputTs = toMs(input.ts);
        const observedTokens = extractShadowObservedTokens(shadow);
        const overlap = countOverlap(extractInputTokens(input), observedTokens);
        if (inputTs === null) return false;
        if (shadow.playerId && input.playerId && shadow.playerId !== input.playerId) return false;
        if (shadow.gen != null && input.generation != null && shadow.gen !== input.generation) return false;
        if (!inputMatchesPrompt(shadow, input)) return false;
        if (input.result && input.result !== 'accepted') return false;
        if (observedTokens.length > 0 && isActionPromptTitle(shadow.title) && overlap === 0) return false;
        return inputTs >= lowerBound && inputTs <= upperBound;
      })
      .sort((left, right) => (toMs(left.input.ts) ?? 0) - (toMs(right.input.ts) ?? 0));

    if (picked.length === 0) continue;
    for (const candidate of picked) {
      candidate.used = true;
    }
    precursorInputs.set(shadow, picked.map((candidate) => candidate.input));
  }

  return precursorInputs;
}

function extractLeafAction(action) {
  if (!action) return null;
  if ((action.type === 'or' || action.type === 'option') && action.response) {
    return extractLeafAction(action.response) || action;
  }
  if (Array.isArray(action.responses) && action.responses.length > 0) {
    return extractLeafAction(action.responses[action.responses.length - 1]) || action;
  }
  return action;
}

function isMatchedActionKind(action) {
  const leaf = extractLeafAction(action);
  const type = leaf?.type || '';
  return type === 'projectCard' || type === 'colony' || type === 'moonStandardProject' || type === 'standardProject';
}

function classifyPostMatchInput(input, shadow) {
  const inputTokens = extractInputTokens(input);
  const observedTokens = extractShadowObservedTokens(shadow);
  const overlap = countOverlap(inputTokens, observedTokens);
  const samePrompt = inputMatchesPrompt(shadow, input);
  if (overlap > 0 && isMatchedActionKind(input.playerAction)) {
    return 'matched';
  }
  if (overlap > 0) {
    return 'followup';
  }
  if (!samePrompt && (!isActionPromptTitle(input.promptTitle) || input.promptType !== shadow.promptType)) {
    return 'followup';
  }
  return null;
}

function collectPostMatchInputs(sortedShadowTurns, availableInputs, matches) {
  const postMatchInputs = new Map();
  const nextBoundary = getNextShadowBoundaryByPlayer(sortedShadowTurns);

  for (const shadow of sortedShadowTurns) {
    const matchedInputs = safeArray(matches.get(shadow));
    if (matchedInputs.length === 0) continue;

    const lowerBound = Math.min(
      ...matchedInputs.map((input) => toMs(input.ts)).filter((value) => value !== null),
    );
    if (!Number.isFinite(lowerBound)) continue;
    const shadowResolved = toMs(shadow.resolvedAt) ?? lowerBound;
    const upperBound = Math.min(
      nextBoundary.get(shadow) ?? Number.POSITIVE_INFINITY,
      shadowResolved + FOLLOWUP_WINDOW_MS,
    );

    const attached = [];
    const candidates = availableInputs
      .filter((candidate) => !candidate.used)
      .filter((candidate) => {
        const input = candidate.input;
        const inputTs = toMs(input.ts);
        if (inputTs === null) return false;
        if (shadow.playerId && input.playerId && shadow.playerId !== input.playerId) return false;
        if (shadow.gen != null && input.generation != null && shadow.gen !== input.generation) return false;
        return inputTs >= lowerBound && inputTs <= upperBound;
      })
      .sort((left, right) => (toMs(left.input.ts) ?? 0) - (toMs(right.input.ts) ?? 0));

    for (const candidate of candidates) {
      const role = classifyPostMatchInput(candidate.input, shadow);
      if (!role) continue;
      candidate.used = true;
      attached.push({role, input: candidate.input});
    }
    if (attached.length > 0) {
      postMatchInputs.set(shadow, attached);
    }
  }

  return postMatchInputs;
}

function matchInputsToShadow(shadowTurns, inputEntries) {
  const availableInputs = inputEntries
    .filter(isInputEntry)
    .map((input, index) => ({index, input, used: false}));
  const matches = new Map();

  const sortedShadowTurns = [...shadowTurns]
    .filter(isShadowTurnEntry)
    .sort((a, b) => (toMs(a.resolvedAt) ?? toMs(a.ts) ?? 0) - (toMs(b.resolvedAt) ?? toMs(b.ts) ?? 0));

  for (const shadow of sortedShadowTurns) {
    const seqPicked = availableInputs
      .filter((candidate) => !candidate.used)
      .filter((candidate) => {
        const input = candidate.input;
        if (shadow.playerId && input.playerId && shadow.playerId !== input.playerId) return false;
        if (shadow.gen != null && input.generation != null && shadow.gen !== input.generation) return false;
        return inputMatchesShadowSeqRange(input, shadow);
      })
      .sort((left, right) => {
        const seqDiff = (toSeq(left.input.inputSeq) ?? 0) - (toSeq(right.input.inputSeq) ?? 0);
        if (seqDiff !== 0) return seqDiff;
        return (toMs(left.input.ts) ?? 0) - (toMs(right.input.ts) ?? 0);
      });
    if (seqPicked.length > 0) {
      for (const candidate of seqPicked) {
        candidate.used = true;
      }
      matches.set(shadow, seqPicked.map((candidate) => candidate.input));
      continue;
    }

    const slots = expectedInputCount(shadow);
    const picked = [];
    for (let slot = 0; slot < slots; slot++) {
      let bestCandidate = null;
      for (const candidate of availableInputs) {
        if (candidate.used) continue;
        const input = candidate.input;
        if (shadow.playerId && input.playerId && shadow.playerId !== input.playerId) continue;
        if (shadow.gen != null && input.generation != null && shadow.gen !== input.generation) continue;
        if (!inputMatchesPrompt(shadow, input)) continue;
        if (!inputMatchesShadowWindow(input, shadow)) continue;
        const match = computeMatchScore(input, shadow);
        if (bestCandidate === null || match.score < bestCandidate.match.score) {
          bestCandidate = {candidate, match};
        }
      }
      if (bestCandidate === null) break;
      const requiresSemanticMatch = bestCandidate.match.observedTokens.length > 0 && bestCandidate.match.overlap === 0;
      if (requiresSemanticMatch) break;
      bestCandidate.candidate.used = true;
      picked.push(bestCandidate.candidate.input);
    }
    if (picked.length > 0) {
      picked.sort((left, right) => (toMs(left.ts) ?? 0) - (toMs(right.ts) ?? 0));
      matches.set(shadow, picked);
    }
  }

  const precursorInputs = collectPrecursorInputs(sortedShadowTurns, availableInputs, matches);
  const postMatchInputs = collectPostMatchInputs(sortedShadowTurns, availableInputs, matches);
  const unusedInputs = availableInputs.filter((candidate) => !candidate.used).map((candidate) => candidate.input);
  return {matches, precursorInputs, postMatchInputs, unusedInputs};
}

function joinInputActions(inputs) {
  const actions = safeArray(inputs)
    .map((input) => summarizePlayerInputAction(input.playerAction, input))
    .filter(Boolean);
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];
  return actions.join(' + ');
}

function toMergedInputRecord(input, role = 'matched') {
  return {
    role,
    ts: input.ts || null,
    result: input.result || null,
    serverRunId: input.serverRunId || null,
    promptInputSeq: toSeq(input.promptInputSeq),
    inputSeq: toSeq(input.inputSeq),
    gameAge: input.gameAge ?? null,
    inputType: input.inputType || null,
    isUndo: input.isUndo === true,
    playerAction: input.playerAction || null,
    rawBody: input.rawBody || null,
    promptButtonLabel: input.promptButtonLabel || null,
    actionSummary: summarizePlayerInputAction(input.playerAction, input),
    raw: input,
  };
}

function getRawInputsFromTurn(turn) {
  const trail = safeArray(turn?.inputTrail)
    .map((entry) => entry?.raw)
    .filter(Boolean);
  if (trail.length > 0) return trail;
  const raw = turn?.input?.raw;
  return raw ? [raw] : [];
}

function isDraftKeepPrompt(input) {
  const title = String(input?.promptTitle || '').trim();
  return input?.promptType === 'card' && /(keep and pass the rest|card\(s\) to keep)/i.test(title);
}

function syntheticInputFamily(input) {
  const title = normalizePromptTitle(input?.promptTitle);
  if (isActionPromptTitle(title)) return 'action';
  if (isDraftKeepPrompt(input)) return `draft:${title}`;
  return `${input?.promptType || ''}:${title}`;
}

function clusterTokenSet(inputs) {
  return new Set(safeArray(inputs).flatMap((input) => extractInputTokens(input)));
}

function shouldClusterInputOnlyTurns(clusterTurns, nextTurn) {
  const clusterInputs = clusterTurns.flatMap(getRawInputsFromTurn);
  const nextInputs = getRawInputsFromTurn(nextTurn);
  const nextInput = nextInputs[0];
  const lastInput = clusterInputs[clusterInputs.length - 1];
  if (!lastInput || !nextInput) return false;
  if (lastInput.playerId && nextInput.playerId && lastInput.playerId !== nextInput.playerId) return false;
  if (lastInput.generation != null && nextInput.generation != null && lastInput.generation !== nextInput.generation) return false;

  const lastTs = toMs(lastInput.ts);
  const nextTs = toMs(nextInput.ts);
  if (lastTs === null || nextTs === null || nextTs < lastTs) return false;

  const firstFamily = syntheticInputFamily(clusterInputs[0]);
  const lastFamily = syntheticInputFamily(lastInput);
  const nextFamily = syntheticInputFamily(nextInput);
  const windowMs = (firstFamily.startsWith('draft:') || nextFamily.startsWith('draft:'))
    ? SYNTHETIC_DRAFT_GAP_MS
    : SYNTHETIC_INPUT_GAP_MS;
  if ((nextTs - lastTs) > windowMs) return false;

  const clusterTokens = clusterTokenSet(clusterInputs);
  const nextTokens = extractInputTokens(nextInput);
  if (countOverlap(nextTokens, Array.from(clusterTokens)) > 0) return true;

  if (firstFamily.startsWith('draft:') && nextFamily === firstFamily) return true;

  const clusterHasNonAction = clusterInputs.some((input) => !isActionPromptTitle(input.promptTitle));
  const nextSummary = summarizePlayerInputAction(nextInput.playerAction, nextInput) || '';

  if (firstFamily === 'action') {
    if (!isActionPromptTitle(nextInput.promptTitle)) return true;
    if (clusterHasNonAction) return true;
    if (/option\[undefined\]/i.test(nextSummary)) return true;
    return false;
  }

  if (nextFamily === lastFamily) return true;

  if (!isActionPromptTitle(lastInput.promptTitle) && isActionPromptTitle(nextInput.promptTitle)) {
    if (clusterHasNonAction) return true;
    if (/option\[undefined\]/i.test(nextSummary)) return true;
  }

  return false;
}

function buildSyntheticInputOnlyTurn(clusterTurns) {
  const rawInputs = clusterTurns.flatMap(getRawInputsFromTurn)
    .sort((left, right) => (toMs(left.ts) ?? 0) - (toMs(right.ts) ?? 0));
  const primaryInput = rawInputs[0] || null;
  const lastInput = rawInputs[rawInputs.length - 1] || null;
  return {
    type: 'merged_turn',
    matchStatus: 'input_only',
    synthetic: true,
    syntheticSize: rawInputs.length,
    gameId: primaryInput?.gameId || null,
    generation: primaryInput?.generation ?? null,
    playerId: primaryInput?.playerId || null,
    player: primaryInput?.player || null,
    color: primaryInput?.color || null,
    phase: null,
    promptType: primaryInput?.promptType || null,
    promptTitle: primaryInput?.promptTitle || null,
    promptInputSeq: toSeq(primaryInput?.promptInputSeq),
    inputSeq: toSeq(lastInput?.inputSeq),
    shadowTs: null,
    inputTs: primaryInput?.ts || null,
    resolvedAt: rawInputs.length > 1 ? (lastInput?.ts || null) : null,
    botAction: null,
    observedAction: null,
    inputAction: normalizeActionSummaryText(joinInputActions(rawInputs)),
    shadow: null,
    input: primaryInput ? {
      result: primaryInput.result || null,
      serverRunId: primaryInput.serverRunId || null,
      gameAge: primaryInput.gameAge ?? null,
      inputType: primaryInput.inputType || null,
      isUndo: primaryInput.isUndo === true,
      playerAction: primaryInput.playerAction || null,
      rawBody: primaryInput.rawBody || null,
      promptButtonLabel: primaryInput.promptButtonLabel || null,
      raw: primaryInput,
    } : null,
    inputs: rawInputs.map((input, index) => toMergedInputRecord(input, index === 0 ? 'input_only' : 'synthetic_followup')),
    inputTrail: rawInputs.map((input, index) => toMergedInputRecord(input, index === 0 ? 'input_only' : 'synthetic_followup')),
  };
}

function collapseInputOnlyChains(mergedTurns) {
  const playerBuckets = new Map();
  for (const turn of mergedTurns) {
    const key = turn.playerId || `unknown:${turn.player || '?'}`;
    if (!playerBuckets.has(key)) playerBuckets.set(key, []);
    playerBuckets.get(key).push(turn);
  }

  const collapsed = [];
  for (const turns of playerBuckets.values()) {
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.matchStatus !== 'input_only') {
        collapsed.push(turn);
        continue;
      }
      const cluster = [turn];
      while (i + 1 < turns.length && turns[i + 1].matchStatus === 'input_only' && shouldClusterInputOnlyTurns(cluster, turns[i + 1])) {
        cluster.push(turns[i + 1]);
        i++;
      }
      collapsed.push(cluster.length === 1 ? turn : buildSyntheticInputOnlyTurn(cluster));
    }
  }

  collapsed.sort((a, b) => {
    const aMs = toMs(a.inputTs) ?? toMs(a.shadowTs) ?? toMs(a.resolvedAt) ?? 0;
    const bMs = toMs(b.inputTs) ?? toMs(b.shadowTs) ?? toMs(b.resolvedAt) ?? 0;
    return aMs - bMs;
  });
  return collapsed;
}

function buildMergedTurnFromShadow(shadow, inputs, inputTrail = inputs, followupInputs = []) {
  const matchedInputs = safeArray(inputs);
  const primaryInput = matchedInputs[0] || null;
  const trail = safeArray(inputTrail);
  const matchedSet = new Set(matchedInputs);
  const followupSet = new Set(safeArray(followupInputs));
  const normalizedShadowTitle = normalizeShadowPromptTitle(shadow);
  return {
    type: 'merged_turn',
    matchStatus: primaryInput ? 'matched' : 'shadow_only',
    gameId: shadow.gameId,
    generation: shadow.gen ?? primaryInput?.generation ?? null,
    playerId: shadow.playerId || primaryInput?.playerId || null,
    player: shadow.player || primaryInput?.player || null,
    color: shadow.color || primaryInput?.color || null,
    phase: shadow.phase || null,
    promptType: shadow.promptType || primaryInput?.promptType || null,
    promptTitle: normalizedShadowTitle || primaryInput?.promptTitle || null,
    promptInputSeq: toSeq(shadow.promptInputSeq),
    inputSeq: toSeq(shadow.inputSeq),
    shadowTs: shadow.ts || null,
    inputTs: primaryInput?.ts || null,
    resolvedAt: shadow.resolvedAt || null,
    botAction: normalizeActionSummaryText(shadow.botAction),
    observedAction: shadow.observedAction || null,
    inputAction: normalizeActionSummaryText(joinInputActions(matchedInputs)),
    shadow: {
      status: shadow.status || null,
      playerActed: shadow.playerActed === true,
      botReasoning: shadow.botReasoning || null,
      observedChanges: shadow.observedChanges || null,
      raw: shadow,
    },
    input: primaryInput ? {
      result: primaryInput.result || null,
      serverRunId: primaryInput.serverRunId || null,
      gameAge: primaryInput.gameAge ?? null,
      inputType: primaryInput.inputType || null,
      isUndo: primaryInput.isUndo === true,
      playerAction: primaryInput.playerAction || null,
      rawBody: primaryInput.rawBody || null,
      promptButtonLabel: primaryInput.promptButtonLabel || null,
      raw: primaryInput,
    } : null,
    inputs: matchedInputs.map((input) => toMergedInputRecord(input, 'matched')),
    inputTrail: trail.map((input) => {
      const role = matchedSet.has(input) ? 'matched' : (followupSet.has(input) ? 'followup' : 'precursor');
      return toMergedInputRecord(input, role);
    }),
  };
}

function buildMergedTurnFromInput(input) {
  return {
    type: 'merged_turn',
    matchStatus: 'input_only',
    gameId: input.gameId,
    generation: input.generation ?? null,
    playerId: input.playerId || null,
    player: input.player || null,
    color: input.color || null,
    phase: null,
    promptType: input.promptType || null,
    promptTitle: input.promptTitle || null,
    promptInputSeq: toSeq(input.promptInputSeq),
    inputSeq: toSeq(input.inputSeq),
    shadowTs: null,
    inputTs: input.ts || null,
    resolvedAt: null,
    botAction: null,
    observedAction: null,
    inputAction: normalizeActionSummaryText(summarizePlayerInputAction(input.playerAction, input)),
    shadow: null,
    input: {
      result: input.result || null,
      serverRunId: input.serverRunId || null,
      gameAge: input.gameAge ?? null,
      inputType: input.inputType || null,
      isUndo: input.isUndo === true,
      playerAction: input.playerAction || null,
      rawBody: input.rawBody || null,
      promptButtonLabel: input.promptButtonLabel || null,
      raw: input,
    },
    inputs: [toMergedInputRecord(input, 'input_only')],
    inputTrail: [toMergedInputRecord(input, 'input_only')],
  };
}

function dedupeTokens(tokens) {
  return [...new Set(safeArray(tokens).filter(Boolean))];
}

function extractTurnInputTokens(turn) {
  return dedupeTokens(getRawInputsFromTurn(turn).flatMap((input) => extractInputTokens(input)));
}

function extractTurnObservedTokens(turn) {
  const rawShadow = turn?.shadow?.raw || null;
  if (rawShadow) return dedupeTokens(extractShadowObservedTokens(rawShadow));
  const observedChanges = turn?.shadow?.observedChanges || null;
  if (!observedChanges) return [];
  return dedupeTokens(extractShadowObservedTokens({observedChanges}));
}

function getTurnStartMs(turn) {
  return toMs(turn?.inputTs) ?? toMs(turn?.shadowTs) ?? toMs(turn?.resolvedAt) ?? null;
}

function getTurnEndMs(turn) {
  return toMs(turn?.resolvedAt) ?? toMs(turn?.inputTs) ?? toMs(turn?.shadowTs) ?? null;
}

function turnsSharePlayerAndGeneration(shadowTurn, inputTurn) {
  if (!shadowTurn || !inputTurn) return false;
  if (shadowTurn.playerId && inputTurn.playerId && shadowTurn.playerId !== inputTurn.playerId) return false;
  if (shadowTurn.generation != null && inputTurn.generation != null && shadowTurn.generation !== inputTurn.generation) return false;
  return true;
}

function turnPromptsCompatibleForReconcile(shadowTurn, inputTurn) {
  if (!shadowTurn || !inputTurn) return false;
  if (shadowTurn.promptType && inputTurn.promptType && shadowTurn.promptType !== inputTurn.promptType) return false;
  if (promptTitlesEquivalent(shadowTurn.promptTitle, inputTurn.promptTitle)) return true;
  return isDraftKeepPrompt(shadowTurn) && isDraftKeepPrompt(inputTurn);
}

function turnsOverlapWithinReconcileWindow(shadowTurn, inputTurn) {
  const shadowStart = getTurnStartMs(shadowTurn);
  const shadowEnd = getTurnEndMs(shadowTurn);
  const inputStart = getTurnStartMs(inputTurn);
  const inputEnd = getTurnEndMs(inputTurn);
  if (shadowStart === null || shadowEnd === null || inputStart === null || inputEnd === null) return false;
  return inputStart >= (shadowStart - MATCH_EARLY_MS) && inputEnd <= (shadowEnd + MATCH_LATE_MS);
}

function computeTurnReconcileScore(shadowTurn, inputTurn) {
  if (!turnsSharePlayerAndGeneration(shadowTurn, inputTurn)) return null;
  if (!turnPromptsCompatibleForReconcile(shadowTurn, inputTurn)) return null;
  if (!turnsOverlapWithinReconcileWindow(shadowTurn, inputTurn)) return null;

  const observedTokens = extractTurnObservedTokens(shadowTurn);
  const inputTokens = extractTurnInputTokens(inputTurn);
  if (observedTokens.length === 0 || inputTokens.length === 0) return null;

  const observedSet = new Set(observedTokens);
  if (!inputTokens.every((token) => observedSet.has(token))) return null;

  const shadowEnd = getTurnEndMs(shadowTurn) ?? 0;
  const inputEnd = getTurnEndMs(inputTurn) ?? 0;
  const overlap = inputTokens.length;
  const coverage = overlap / Math.max(observedTokens.length, 1);

  let score = Math.abs(shadowEnd - inputEnd);
  score -= overlap * 120 * 1000;
  score -= Math.round(coverage * 60 * 1000);
  if (inputTurn.synthetic && overlap > 1) score -= 15 * 1000;
  if (isDraftKeepPrompt(shadowTurn) && isDraftKeepPrompt(inputTurn)) score -= 60 * 1000;

  return {score, overlap, coverage, observedTokens, inputTokens};
}

function reconcileShadowAndInputOnlyTurns(mergedTurns) {
  const passthrough = [];
  const shadowOnlyTurns = [];
  const inputOnlyTurns = [];

  for (const turn of mergedTurns) {
    if (turn.matchStatus === 'shadow_only') {
      shadowOnlyTurns.push(turn);
      continue;
    }
    if (turn.matchStatus === 'input_only') {
      inputOnlyTurns.push(turn);
      continue;
    }
    passthrough.push(turn);
  }

  const inputUsed = new Set();
  const reconciledShadowTurns = [];

  for (const shadowTurn of shadowOnlyTurns) {
    let best = null;
    for (let i = 0; i < inputOnlyTurns.length; i++) {
      if (inputUsed.has(i)) continue;
      const inputTurn = inputOnlyTurns[i];
      const match = computeTurnReconcileScore(shadowTurn, inputTurn);
      if (!match) continue;
      if (best === null || match.score < best.match.score) {
        best = {index: i, inputTurn, match};
      }
    }

    if (best === null) {
      reconciledShadowTurns.push(shadowTurn);
      continue;
    }

    inputUsed.add(best.index);
    const rawInputs = getRawInputsFromTurn(best.inputTurn)
      .sort((left, right) => (toMs(left.ts) ?? 0) - (toMs(right.ts) ?? 0));
    const reconciledTurn = buildMergedTurnFromShadow(shadowTurn.shadow?.raw || shadowTurn.shadow, rawInputs, rawInputs, []);
    reconciledTurn.reconciled = {
      stage: 'shadow_input_only_overlap',
      syntheticInput: best.inputTurn.synthetic === true,
      overlap: best.match.overlap,
      coverage: best.match.coverage,
    };
    reconciledShadowTurns.push(reconciledTurn);
  }

  const remainingInputTurns = inputOnlyTurns.filter((_turn, index) => !inputUsed.has(index));
  const reconciledTurns = [...passthrough, ...reconciledShadowTurns, ...remainingInputTurns];
  reconciledTurns.sort((a, b) => {
    const aMs = getTurnStartMs(a) ?? getTurnEndMs(a) ?? 0;
    const bMs = getTurnStartMs(b) ?? getTurnEndMs(b) ?? 0;
    return aMs - bMs;
  });
  return reconciledTurns;
}

function mergeEntries(gameId, shadowEntries, inputEntries) {
  const shadowTurns = shadowEntries.filter(isShadowTurnEntry);
  const normalizedInputs = inputEntries.filter(isInputEntry);
  const {matches, precursorInputs, postMatchInputs, unusedInputs} = matchInputsToShadow(shadowTurns, normalizedInputs);

  const mergedTurns = shadowTurns.map((shadow) => {
    const matchedInputs = [...(matches.get(shadow) || [])];
    const precursor = precursorInputs.get(shadow) || [];
    const postMatch = postMatchInputs.get(shadow) || [];
    const extraMatched = postMatch.filter((entry) => entry.role === 'matched').map((entry) => entry.input);
    const followups = postMatch.filter((entry) => entry.role === 'followup').map((entry) => entry.input);
    matchedInputs.push(...extraMatched);
    matchedInputs.sort((left, right) => (toMs(left.ts) ?? 0) - (toMs(right.ts) ?? 0));
    const inputTrail = [...precursor, ...matchedInputs, ...followups]
      .sort((left, right) => (toMs(left.ts) ?? 0) - (toMs(right.ts) ?? 0));
    return buildMergedTurnFromShadow(shadow, matchedInputs, inputTrail, followups);
  });
  for (const input of unusedInputs) {
    mergedTurns.push(buildMergedTurnFromInput(input));
  }

  mergedTurns.sort((a, b) => {
    const aMs = toMs(a.inputTs) ?? toMs(a.shadowTs) ?? toMs(a.resolvedAt) ?? 0;
    const bMs = toMs(b.inputTs) ?? toMs(b.shadowTs) ?? toMs(b.resolvedAt) ?? 0;
    return aMs - bMs;
  });

  const collapsedTurns = collapseInputOnlyChains(mergedTurns);
  const reconciledTurns = reconcileShadowAndInputOnlyTurns(collapsedTurns);

  const counts = {
    shadowTurns: shadowTurns.length,
    inputEntries: normalizedInputs.length,
    matched: reconciledTurns.filter((entry) => entry.matchStatus === 'matched').length,
    shadowOnly: reconciledTurns.filter((entry) => entry.matchStatus === 'shadow_only').length,
    inputOnly: reconciledTurns.filter((entry) => entry.matchStatus === 'input_only').length,
  };

  const meta = {
    type: 'merge_meta',
    ts: new Date().toISOString(),
    gameId,
    version: 2,
    counts,
  };

  return {meta, mergedTurns: reconciledTurns, counts};
}

function mergeGameLogs(gameId, options = {}) {
  const shadowDir = options.shadowDir || SHADOW_DIR;
  const inputDir = options.inputDir || SERVER_INPUT_DIR;
  const outputDir = options.outputDir || MERGED_DIR;
  const shadowFile = options.shadowFile || getShadowFile(gameId, shadowDir);
  const inputFile = options.inputFile || getInputFile(gameId, inputDir);
  const outputFile = options.outputFile || getMergedFile(gameId, outputDir);

  const shadowEntries = readJsonl(shadowFile);
  const inputEntries = readJsonl(inputFile);
  if (shadowEntries.length === 0 && inputEntries.length === 0) {
    return {
      gameId,
      shadowFile,
      inputFile,
      outputFile,
      skipped: true,
      counts: {shadowTurns: 0, inputEntries: 0, matched: 0, shadowOnly: 0, inputOnly: 0},
    };
  }

  const {meta, mergedTurns, counts} = mergeEntries(gameId, shadowEntries, inputEntries);
  writeJsonl(outputFile, [meta, ...mergedTurns]);
  return {
    gameId,
    shadowFile,
    inputFile,
    outputFile,
    skipped: false,
    counts,
  };
}

function resolveGameIds(args) {
  if (args.gameIds.length > 0) return args.gameIds;
  const shadowDir = args.shadowDir;
  if (!fs.existsSync(shadowDir)) return [];
  const shadowFiles = fs.readdirSync(shadowDir)
    .filter((name) => /^shadow-.*\.jsonl$/i.test(name))
    .map((name) => ({
      gameId: normalizeGameId(name),
      mtimeMs: fs.statSync(path.join(shadowDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (args.mode === 'all') return shadowFiles.map((entry) => entry.gameId);
  if (args.mode === 'last') return shadowFiles.slice(0, Math.max(1, args.last)).map((entry) => entry.gameId);
  return shadowFiles.length > 0 ? [shadowFiles[0].gameId] : [];
}

function formatCounts(counts) {
  return `matched=${counts.matched} shadowOnly=${counts.shadowOnly} inputOnly=${counts.inputOnly}`;
}

function cli(argv = process.argv) {
  const args = parseArgs(argv);
  const gameIds = resolveGameIds(args);
  if (gameIds.length === 0) {
    console.error('No shadow games found to merge.');
    return 1;
  }

  let failures = 0;
  for (const gameId of gameIds) {
    try {
      const result = mergeGameLogs(gameId, args);
      if (result.skipped) {
        console.log(`${gameId}: skipped (no shadow/input logs found)`);
      } else {
        console.log(`${gameId}: ${formatCounts(result.counts)} -> ${result.outputFile}`);
      }
    } catch (err) {
      failures++;
      console.error(`${gameId}: merge failed: ${err.message}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(cli(process.argv));
}

module.exports = {
  MATCH_EARLY_MS,
  MATCH_LATE_MS,
  FOLLOWUP_WINDOW_MS,
  MERGED_DIR,
  PRECURSOR_WINDOW_MS,
  SERVER_INPUT_DIR,
  SYNTHETIC_DRAFT_GAP_MS,
  SYNTHETIC_INPUT_GAP_MS,
  buildMergedTurnFromInput,
  buildSyntheticInputOnlyTurn,
  buildMergedTurnFromShadow,
  cli,
  collapseInputOnlyChains,
  collectPrecursorInputs,
  collectPostMatchInputs,
  computeMatchScore,
  extractLeafAction,
  getInputFile,
  getRawInputsFromTurn,
  getMergedFile,
  getNextShadowBoundaryByPlayer,
  getShadowFile,
  inputMatchesPrompt,
  isDraftKeepPrompt,
  isActionPromptTitle,
  isMatchedActionKind,
  isInputEntry,
  isShadowTurnEntry,
  matchInputsToShadow,
  mergeEntries,
  mergeGameLogs,
  normalizeGameId,
  normalizeActionSummaryText,
  normalizePromptTitle,
  normalizeShadowPromptTitle,
  parseArgs,
  promptTitlesEquivalent,
  readJsonl,
  reconcileShadowAndInputOnlyTurns,
  shouldClusterInputOnlyTurns,
  syntheticInputFamily,
  summarizePlayerInputAction,
  toMs,
  inferShadowPromptTitle,
  isBrokenPromptTitle,
};
