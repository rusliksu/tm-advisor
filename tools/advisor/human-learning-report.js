#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'data', 'game_logs');
const REPLAY_SCRIPT = path.join(ROOT, 'tools', 'advisor', 'replay-watch-log.py');
const DEFAULT_MIN_GAP = 6;

function usage() {
  return [
    'Usage:',
    '  node tools/advisor/human-learning-report.js [watch_live_*.jsonl ...]',
    '  node tools/advisor/human-learning-report.js --game <gameId>',
    '  node tools/advisor/human-learning-report.js --last 10',
    '  node tools/advisor/human-learning-report.js --all',
    '  node tools/advisor/human-learning-report.js --last 5 --replay',
    '  node tools/advisor/human-learning-report.js --json',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    all: false,
    last: 10,
    gameId: null,
    minGap: DEFAULT_MIN_GAP,
    json: false,
    replay: false,
    help: false,
    files: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--all') out.all = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--replay') out.replay = true;
    else if (arg === '--game' && args[i + 1]) out.gameId = args[++i];
    else if (arg === '--last' && args[i + 1]) out.last = parseInt(args[++i], 10) || out.last;
    else if (arg === '--min-gap' && args[i + 1]) out.minGap = Number(args[++i]) || out.minGap;
    else if (!arg.startsWith('--')) out.files.push(path.resolve(arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function listWatchLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR)
    .filter((name) => /^watch_live_.*\.jsonl$/.test(name))
    .map((name) => {
      const full = path.join(LOG_DIR, name);
      return {full, name, mtimeMs: fs.statSync(full).mtimeMs};
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function resolveFiles(options) {
  if (options.files.length > 0) return options.files;
  let files = listWatchLogs();
  if (options.gameId) {
    files = files.filter((entry) => entry.name.startsWith(`watch_live_${options.gameId}_`));
  }
  if (!options.all) files = files.slice(0, Math.max(1, options.last));
  return files.map((entry) => entry.full);
}

function parseJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function replayFileWithCurrentAdvisor(file) {
  const tempPath = path.join(
    os.tmpdir(),
    `${path.basename(file, '.jsonl')}.replayed.${process.pid}.${Date.now()}.jsonl`,
  );
  const python = process.env.PYTHON || 'python';
  const result = spawnSync(python, [REPLAY_SCRIPT, file, '--out', tempPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`Replay failed for ${file}: ${detail || `exit ${result.status}`}`);
  }
  try {
    return {
      file: tempPath,
      sourceFile: file,
      events: parseJsonl(tempPath),
    };
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_err) {
      // Temp cleanup is best-effort; the report output should not fail because of it.
    }
  }
}

function buildEntries(files, options = {}) {
  if (!options.replay) {
    return files.map((file) => ({file, events: parseJsonl(file)}));
  }
  const replayFile = options.replayFile || replayFileWithCurrentAdvisor;
  return files.map((file) => replayFile(file));
}

function gameIdFromFile(file) {
  const name = path.basename(file);
  const match = name.match(/^watch_live_(.+?)_\d{8}_\d{6}\.jsonl$/);
  return match ? match[1] : null;
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function severityWeight(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function missKey(event) {
  return `${event.player_id || ''}\u0000${event.card || ''}`;
}

function fileMissKey(file, event) {
  return `${file}\u0000${missKey(event)}`;
}

function fileDecisionKey(file, decisionId) {
  return `${file}\u0000${decisionId || ''}`;
}

function eventTimeMs(event) {
  const ts = event?.ts || '';
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

function chooseNearestMiss(playEvent, file, missesByFileKey) {
  const list = missesByFileKey.get(fileMissKey(file, playEvent)) || [];
  if (list.length === 0) return null;
  const playTime = eventTimeMs(playEvent);
  if (playTime == null) return list[0];

  let best = null;
  let bestDelta = Infinity;
  for (const miss of list) {
    const missTime = eventTimeMs(miss);
    if (missTime == null) continue;
    const delta = Math.abs(missTime - playTime);
    if (delta < bestDelta) {
      best = miss;
      bestDelta = delta;
    }
  }
  return bestDelta <= 120000 ? best : null;
}

function topOptionsFrom(event, linkedDecision = null) {
  const options = event?.decision_context?.top_options;
  if (Array.isArray(options)) return options;
  const decisionOptions = linkedDecision?.decision_context?.top_options || linkedDecision?.top_options;
  return Array.isArray(decisionOptions) ? decisionOptions : [];
}

function cleanRecommendedCardName(value) {
  let text = String(value || '').trim();
  if (!text) return null;
  text = text.split(/\s+[-–—|]\s+/u, 1)[0].trim();
  text = text.replace(/\s+\([^)]*\).*$/, '').trim();
  return text || null;
}

function recommendedPlayFromBestMove(bestMove, options = []) {
  const raw = String(bestMove || '').trim();
  if (!raw.toLowerCase().startsWith('play ')) return null;
  const remainder = raw.slice(5).trim();
  if (!remainder) return null;
  const names = options.map((option) => option?.name).filter(Boolean);
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    if (remainder === name || remainder.startsWith(`${name} `)) return name;
  }
  for (const separator of [' — ', ' | ', ' - ']) {
    if (remainder.includes(separator)) return cleanRecommendedCardName(remainder.split(separator, 1)[0]);
  }
  return cleanRecommendedCardName(remainder);
}

function recommendedCardFromBestMove(bestMove) {
  const playCard = recommendedPlayFromBestMove(bestMove);
  if (playCard) return playCard;
  const raw = String(bestMove || '').trim();
  const lower = raw.toLowerCase();
  if (!lower.startsWith('draft ')) return null;
  let remainder = raw.slice(6).trim();
  if (!remainder) return null;
  return cleanRecommendedCardName(remainder);
}

function optionNumericScore(option) {
  return asNumber(option?.score ?? option?.play_value_now ?? option?.effective_score);
}

function compactText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:+ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bestMoveCore(bestMove) {
  let text = compactText(bestMove);
  for (const prefix of [
    'play ', 'use ', 'standard project ', 'sp ', 'trade ', 'claim ', 'fund ',
    'sell ', 'pass ', 'resolve current prompt ',
  ]) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  for (const separator of [' - ', ' | ', ' because ', ' за ', ' чтобы ']) {
    const idx = text.indexOf(separator.trim());
    if (idx > 0) text = text.slice(0, idx).trim();
  }
  return text;
}

function actionMatchesBestMove(actionText, bestMove) {
  const action = compactText(actionText);
  const best = compactText(bestMove);
  const core = bestMoveCore(bestMove);
  if (!action || !best) return false;
  if (action.length >= 4 && best.includes(action)) return true;
  if (core.length >= 4 && action.includes(core)) return true;
  return false;
}

function actionHintTexts(event, linkedDecision = null) {
  const decisionContext = event?.decision_context || linkedDecision?.decision_context || {};
  const summaryLines = []
    .concat(decisionContext.summary_lines || [])
    .concat(linkedDecision?.summary_lines || []);
  const alerts = []
    .concat(decisionContext.alerts || [])
    .concat(linkedDecision?.alerts || []);
  const explicitBestMoves = [
    decisionContext.best_move,
    linkedDecision?.best_move,
  ].filter(Boolean);
  const actionHints = []
    .concat(summaryLines)
    .concat(alerts)
    .filter(isActionRecommendationHint);
  return explicitBestMoves.concat(actionHints);
}

function isActionRecommendationHint(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const text = compactText(raw);
  return (
    raw.includes('🔵') ||
    text.startsWith('use ') ||
    text.startsWith('action ') ||
    text.includes(' actions ') ||
    text.includes('perform an action') ||
    text.includes('blue action')
  );
}

function findMatchingActionHint(actionText, hints) {
  return hints.find((hint) => actionMatchesBestMove(actionText, hint)) || null;
}

function classifyAdvisorMoveType(bestMove) {
  const raw = String(bestMove || '');
  if (raw.includes('🔵')) return 'action';
  if (raw.includes('🚀')) return 'trade';
  const text = compactText(bestMove);
  if (!text) return 'unknown';
  if (text.startsWith('play ') || text.startsWith('draft ')) return 'play_card';
  if (text.startsWith('use ') || text.startsWith('action ') || text.startsWith('🔵') || text.includes(' actions ')) return 'action';
  if (text.startsWith('trade ') || text.includes(' trade ') || text.includes('🚀')) return 'trade';
  if (text.includes('greenery') || text.includes('plants vp push')) return 'greenery';
  if (text.includes('heat') || text.includes('temp') || text.includes('temperature') || text.includes('asteroid')) return 'terraform';
  if (text.startsWith('claim ') || text.includes('заяви') || text.includes('milestone')) return 'milestone';
  if (text.startsWith('fund ') || text.includes('фонд') || text.includes('award')) return 'award';
  if (text.startsWith('sell ') || text.includes('sell patents')) return 'sell';
  if (text.startsWith('pass ')) return 'pass';
  if (text.startsWith('resolve current prompt')) return 'prompt';
  return 'other';
}

function findBestOption(play, miss, linkedDecision = null) {
  const topOptions = topOptionsFrom(play, linkedDecision);
  const bestCard = miss?.best_card ||
    play.prev_recommended_play ||
    recommendedPlayFromBestMove(linkedDecision?.best_move, topOptions) ||
    topOptions[0]?.name ||
    null;
  if (!bestCard) return null;
  const top = topOptions.find((option) => option.name === bestCard) || null;
  return {
    name: bestCard,
    score: asNumber(miss?.best_score) ?? optionNumericScore(top),
    action: top?.action || null,
    reason: top?.reason || null,
  };
}

function normalizeAction(event, file, decisionsByFileKey = new Map()) {
  const linkedDecision = event.decision_id
    ? decisionsByFileKey.get(fileDecisionKey(file, event.decision_id))
    : null;
  const decisionContext = event.decision_context || linkedDecision?.decision_context || {};
  const game = decisionContext.game || {};
  const me = decisionContext.me || {};
  const actions = Array.isArray(event.actions)
    ? event.actions
    : Array.isArray(event.action?.actions)
      ? event.action.actions
      : event.action?.action
        ? [event.action.action]
        : [];
  const actionText = actions.join(' + ') || event.action_type || '?';
  const hints = actionHintTexts(event, linkedDecision);
  const bestMove = decisionContext.best_move || linkedDecision?.best_move || null;
  const matchedHint = findMatchingActionHint(actionText, hints);
  return {
    file,
    gameId: event.game_id || gameIdFromFile(file),
    decisionId: event.decision_id || null,
    ts: event.ts || null,
    playerId: event.player_id || null,
    player: event.player || '?',
    actions,
    actionText,
    actionCount: actions.length,
    bestMove,
    bestMoveCore: bestMoveCore(bestMove),
    bestMoveType: classifyAdvisorMoveType(bestMove),
    matchedHint,
    actionHints: hints,
    snapshotError: event.snapshot_error || linkedDecision?.snapshot_error || null,
    game: {
      generation: game.generation ?? null,
      phase: game.phase || null,
      livePhase: game.live_phase || null,
    },
    resources: {
      mc: me.mc ?? null,
      steel: me.steel ?? null,
      titanium: me.titanium ?? null,
      plants: me.plants ?? null,
      heat: me.heat ?? null,
      mcProd: me.production?.mc ?? null,
    },
  };
}

function classifyAction(action) {
  if (action.snapshotError) return 'noisy';
  if (action.staleAfterCardPlay) return 'noisy';
  if (action.actionCount !== 1) return 'noisy';
  if (!action.actionHints.length) return 'unranked';
  if (action.matchedHint) return 'aligned';
  if (!action.bestMove) return 'unranked';
  if (action.bestMoveType === 'prompt') return 'unranked';
  return 'mismatch';
}

function advisorMismatchTarget(action) {
  if (action.bestMoveType === 'play_card') {
    return recommendedCardFromBestMove(action.bestMove) || action.bestMoveCore || '?';
  }
  return action.bestMoveCore || '?';
}

function normalizePlay(event, file, missesByFileKey, decisionsByFileKey = new Map()) {
  const miss = chooseNearestMiss(event, file, missesByFileKey);
  const linkedDecision = event.decision_id
    ? decisionsByFileKey.get(fileDecisionKey(file, event.decision_id))
    : null;
  const decisionContext = event.decision_context || linkedDecision?.decision_context || {};
  const topOptions = topOptionsFrom(event, linkedDecision);
  const cardName = event.card || event.last_card_played || event.action?.card || '?';
  const chosenOption = topOptions.find((option) => option.name === cardName) || null;
  const game = decisionContext.game || {};
  const me = decisionContext.me || {};
  const rank = asNumber(event.prev_play_rank) ?? asNumber(miss?.chosen_rank) ?? asNumber(chosenOption?.rank);
  const chosenScore = asNumber(event.prev_play_score) ?? asNumber(miss?.chosen_score) ?? optionNumericScore(chosenOption);
  const best = findBestOption(event, miss, linkedDecision);
  const scoreGap = asNumber(miss?.score_gap) ??
    (best?.score != null && chosenScore != null ? Number((best.score - chosenScore).toFixed(2)) : null);
  return {
    file,
    gameId: event.game_id || gameIdFromFile(file),
    decisionId: event.decision_id || null,
    ts: event.ts || null,
    playerId: event.player_id || null,
    player: event.player || '?',
    card: cardName,
    rank,
    chosenScore,
    best,
    scoreGap,
    severity: miss?.severity || null,
    confidence: miss?.confidence || null,
    reason: miss?.reason || null,
    samePollCardCount: event.same_poll_card_count ?? miss?.same_poll_card_count ?? 1,
    snapshotError: event.snapshot_error || miss?.snapshot_error || null,
    game: {
      generation: game.generation ?? null,
      phase: game.phase || null,
      livePhase: game.live_phase || null,
      gensLeft: game.gens_left ?? null,
      temperature: game.temperature ?? null,
      oxygen: game.oxygen ?? null,
      oceans: game.oceans ?? null,
      venus: game.venus ?? null,
    },
    resources: {
      mc: me.mc ?? null,
      steel: me.steel ?? null,
      titanium: me.titanium ?? null,
      plants: me.plants ?? null,
      heat: me.heat ?? null,
      mcProd: me.production?.mc ?? null,
    },
    topChoices: (miss?.top_choices || topOptions).slice(0, 3).map((option) => ({
      name: option.name,
      rank: option.rank,
      score: optionNumericScore(option),
      action: option.action || null,
      reason: option.reason || null,
    })),
  };
}

function classify(play, minGap) {
  if (play.snapshotError) return 'noisy';
  if (play.samePollCardCount > 1) return 'noisy';
  if (play.rank == null) return 'unranked';
  if (play.rank === 1) return 'aligned';
  if (play.rank <= 3 && (play.scoreGap == null || play.scoreGap < minGap)) return 'reasonable';
  if (play.deferredBest) return 'reasonable';
  if (
    play.confidence === 'normal' &&
    severityWeight(play.severity) >= 2 &&
    play.scoreGap != null &&
    play.scoreGap >= minGap
  ) {
    return 'teaching';
  }
  return 'candidate';
}

function markDeferredAdvisorBest(plays, options = {}) {
  const windowMs = options.deferWindowMs ?? 15 * 60 * 1000;
  const maxInterveningPlays = options.maxInterveningPlays ?? 3;
  const byFilePlayer = new Map();
  plays.forEach((play, index) => {
    const key = `${play.file}\u0000${play.gameId || ''}\u0000${play.playerId || play.player || ''}`;
    const list = byFilePlayer.get(key) || [];
    list.push({play, index, time: eventTimeMs(play)});
    byFilePlayer.set(key, list);
  });

  for (const list of byFilePlayer.values()) {
    list.sort((a, b) => {
      const at = a.time ?? 0;
      const bt = b.time ?? 0;
      return at - bt || a.index - b.index;
    });

    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      const bestName = current.play.best?.name;
      if (!bestName || bestName === current.play.card || current.time == null) continue;

      const later = list.slice(i + 1).find((row, offset) => {
        if (offset > maxInterveningPlays) return false;
        if (row.time == null || row.time <= current.time) return false;
        if (row.time - current.time > windowMs) return false;
        return row.play.card === bestName;
      });
      if (!later) continue;

      current.play.deferredBest = {
        card: bestName,
        ts: later.play.ts || null,
        minutes: Number(((later.time - current.time) / 60000).toFixed(1)),
        generation: later.play.game.generation ?? null,
      };
    }
  }
}

function addAgg(map, key, patch) {
  if (!key) return;
  const row = map.get(key) || {key, count: 0, totalGap: 0, maxGap: 0, examples: []};
  row.count += 1;
  if (patch.scoreGap != null) {
    row.totalGap += patch.scoreGap;
    row.maxGap = Math.max(row.maxGap, patch.scoreGap);
  }
  if (row.examples.length < 3) row.examples.push(patch.example);
  map.set(key, row);
}

function finalizeAgg(map) {
  return [...map.values()]
    .map((row) => ({
      ...row,
      avgGap: row.count > 0 ? Number((row.totalGap / row.count).toFixed(1)) : 0,
      maxGap: Number(row.maxGap.toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count || b.avgGap - a.avgGap || a.key.localeCompare(b.key));
}

function analyzeEntries(entries, options = {}) {
  const minGap = options.minGap ?? DEFAULT_MIN_GAP;
  const files = new Set();
  const missesByFileKey = new Map();
  const decisionsByFileKey = new Map();
  const rawPlays = [];
  const rawActions = [];
  let eventIndex = 0;

  for (const {file, events} of entries) {
    files.add(file);
    for (const event of events) {
      const index = eventIndex++;
      if (event.type === 'decision_observed' && event.decision_id) {
        decisionsByFileKey.set(fileDecisionKey(file, event.decision_id), event);
      } else if (event.type === 'advisor_miss') {
        const key = fileMissKey(file, event);
        const list = missesByFileKey.get(key) || [];
        list.push(event);
        list.sort((a, b) => (eventTimeMs(a) ?? 0) - (eventTimeMs(b) ?? 0));
        missesByFileKey.set(key, list);
      } else if (event.type === 'card_played') {
        rawPlays.push({file, event, index});
      } else if (event.type === 'actions_taken') {
        rawActions.push({file, event, index});
      }
    }
  }

  const plays = rawPlays.map(({file, event}) => normalizePlay(event, file, missesByFileKey, decisionsByFileKey));
  markDeferredAdvisorBest(plays, options);
  for (const play of plays) play.classification = classify(play, minGap);
  const cardPlayByDecision = new Map();
  for (const {file, event, index} of rawPlays) {
    if (!event.decision_id) continue;
    const key = fileDecisionKey(file, event.decision_id);
    const time = eventTimeMs(event);
    const existing = cardPlayByDecision.get(key);
    if (!existing || (time ?? 0) < (existing.time ?? 0) || ((time ?? 0) === (existing.time ?? 0) && index < existing.index)) {
      cardPlayByDecision.set(key, {card: event.card || event.action?.card || null, time, index});
    }
  }
  const actions = rawActions.map(({file, event, index}) => {
    const action = normalizeAction(event, file, decisionsByFileKey);
    if (event.decision_id) {
      const cardPlay = cardPlayByDecision.get(fileDecisionKey(file, event.decision_id));
      const actionTime = eventTimeMs(event);
      if (
        cardPlay &&
        actionTime != null &&
        (actionTime > cardPlay.time || (actionTime === cardPlay.time && index > cardPlay.index))
      ) {
        action.staleAfterCardPlay = {
          card: cardPlay.card,
          ts: event.ts || null,
        };
      }
    }
    return action;
  });
  for (const action of actions) action.classification = classifyAction(action);

  const summary = {
    files: files.size,
    plays: plays.length,
    ranked: plays.filter((play) => play.rank != null).length,
    aligned: plays.filter((play) => play.classification === 'aligned').length,
    reasonable: plays.filter((play) => play.classification === 'reasonable').length,
    teaching: plays.filter((play) => play.classification === 'teaching').length,
    candidate: plays.filter((play) => play.classification === 'candidate').length,
    deferredBest: plays.filter((play) => play.deferredBest).length,
    noisy: plays.filter((play) => play.classification === 'noisy').length,
    unranked: plays.filter((play) => play.classification === 'unranked').length,
    actions: actions.length,
    actionRanked: actions.filter((action) => !["noisy", "unranked"].includes(action.classification)).length,
    actionAligned: actions.filter((action) => action.classification === 'aligned').length,
    actionMismatch: actions.filter((action) => action.classification === 'mismatch').length,
    actionNoisy: actions.filter((action) => action.classification === 'noisy').length,
    actionStaleAfterCardPlay: actions.filter((action) => action.staleAfterCardPlay).length,
    actionUnranked: actions.filter((action) => action.classification === 'unranked').length,
  };

  const chosenAgg = new Map();
  const rejectedAgg = new Map();
  const pairAgg = new Map();
  for (const play of plays.filter((row) => row.classification === 'teaching')) {
    const example = compactExample(play);
    addAgg(chosenAgg, play.card, {scoreGap: play.scoreGap, example});
    addAgg(rejectedAgg, play.best?.name, {scoreGap: play.scoreGap, example});
    addAgg(pairAgg, `${play.card} <- ${play.best?.name || '?'}`, {scoreGap: play.scoreGap, example});
  }
  const actionPairAgg = new Map();
  const actionTypeAgg = new Map();
  const actionOverPlayActionAgg = new Map();
  const actionOverPlayAdvisorAgg = new Map();
  const actionOverPlayTimingAgg = new Map();
  for (const action of actions.filter((row) => row.classification === 'mismatch')) {
    const example = compactActionExample(action);
    addAgg(actionPairAgg, `${action.actionText} <- ${advisorMismatchTarget(action)}`, {scoreGap: 0, example});
    addAgg(actionTypeAgg, `blue_action <- ${action.bestMoveType}`, {scoreGap: 0, example});
    if (action.bestMoveType === 'play_card') {
      const advisorCard = advisorMismatchTarget(action);
      addAgg(actionOverPlayActionAgg, action.actionText, {scoreGap: 0, example});
      addAgg(actionOverPlayAdvisorAgg, advisorCard, {scoreGap: 0, example});
      addAgg(actionOverPlayTimingAgg, generationBucket(action.game.generation), {scoreGap: 0, example});
    }
  }

  return {
    summary,
    plays,
    actions,
    teaching: plays
      .filter((play) => play.classification === 'teaching')
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || (b.scoreGap || 0) - (a.scoreGap || 0)),
    candidates: plays
      .filter((play) => play.classification === 'candidate')
      .sort((a, b) => (b.scoreGap || 0) - (a.scoreGap || 0)),
    noisy: plays.filter((play) => play.classification === 'noisy'),
    actionMismatches: actions
      .filter((action) => action.classification === 'mismatch')
      .sort((a, b) => (a.game.generation || 0) - (b.game.generation || 0) || a.actionText.localeCompare(b.actionText)),
    aggregates: {
      chosen: finalizeAgg(chosenAgg),
      rejectedBest: finalizeAgg(rejectedAgg),
      pairs: finalizeAgg(pairAgg),
      actionPairs: finalizeAgg(actionPairAgg),
      actionTypes: finalizeAgg(actionTypeAgg),
      actionOverPlayActions: finalizeAgg(actionOverPlayActionAgg),
      actionOverPlayAdvisorPlays: finalizeAgg(actionOverPlayAdvisorAgg),
      actionOverPlayTiming: finalizeAgg(actionOverPlayTimingAgg),
    },
  };
}

function compactExample(play) {
  return {
    gameId: play.gameId,
    gen: play.game.generation,
    player: play.player,
    card: play.card,
    best: play.best?.name || null,
    rank: play.rank,
    gap: play.scoreGap,
    deferredBest: play.deferredBest || null,
  };
}

function compactActionExample(action) {
  return {
    gameId: action.gameId,
    gen: action.game.generation,
    player: action.player,
    action: action.actionText,
    bestMove: action.bestMove,
    staleAfterCardPlay: action.staleAfterCardPlay || null,
  };
}

function generationBucket(generation) {
  if (generation == null) return 'Gen ?';
  if (generation <= 3) return 'Gen 1-3';
  if (generation <= 6) return 'Gen 4-6';
  return 'Gen 7+';
}

function fmtNumber(value) {
  return value == null ? '?' : String(value);
}

function formatPlay(play) {
  const best = play.best?.name || '?';
  const gen = play.game.generation == null ? '?' : play.game.generation;
  const phase = play.game.phase || play.game.livePhase || '?';
  const gap = play.scoreGap == null ? '?' : play.scoreGap.toFixed ? play.scoreGap.toFixed(1) : play.scoreGap;
  const top = play.topChoices.map((row) => row.name).filter(Boolean).join(', ');
  const deferred = play.deferredBest ? `deferred ${play.deferredBest.card} +${play.deferredBest.minutes}m` : null;
  return [
    `${play.card} over ${best}`,
    `rank ${fmtNumber(play.rank)}`,
    `gap ${gap}`,
    deferred,
    `Gen ${gen}/${phase}`,
    `${play.player}`,
    `MC ${fmtNumber(play.resources.mc)}`,
    top ? `top: ${top}` : null,
  ].filter(Boolean).join(' | ');
}

function formatAction(action) {
  const gen = action.game.generation == null ? '?' : action.game.generation;
  const phase = action.game.phase || action.game.livePhase || '?';
  return [
    `${action.actionText} over ${action.bestMove || action.actionHints[0] || '?'}`,
    `Gen ${gen}/${phase}`,
    `${action.player}`,
    `MC ${fmtNumber(action.resources.mc)}`,
  ].filter(Boolean).join(' | ');
}

function formatAgg(rows, label, limit = 8) {
  if (!rows.length) return [`${label}: none`];
  return [
    `${label}:`,
    ...rows.slice(0, limit).map((row) => `  ${row.key}: n=${row.count}, avgGap=${row.avgGap}, maxGap=${row.maxGap}`),
  ];
}

function formatCountAgg(rows, label, limit = 8) {
  if (!rows.length) return [`${label}: none`];
  return [
    `${label}:`,
    ...rows.slice(0, limit).map((row) => `  ${row.key}: n=${row.count}`),
  ];
}

function formatReport(stats) {
  const s = stats.summary;
  const lines = [];
  lines.push('Human learning report');
  if (stats.replay) {
    lines.push(`Replay: current advisor engine over ${stats.replay.files} file(s)`);
  }
  lines.push(`Files: ${s.files} | plays: ${s.plays} | ranked: ${s.ranked}`);
  lines.push(`Aligned: ${s.aligned} | reasonable alt: ${s.reasonable} | teaching: ${s.teaching} | candidate: ${s.candidate} | deferred top later: ${s.deferredBest} | noisy: ${s.noisy} | unranked: ${s.unranked}`);
  lines.push(`Actions: ${s.actions} | ranked: ${s.actionRanked} | aligned: ${s.actionAligned} | mismatch: ${s.actionMismatch} | noisy: ${s.actionNoisy} | stale after card: ${s.actionStaleAfterCardPlay} | unranked: ${s.actionUnranked}`);
  lines.push('');
  lines.push(...formatAgg(stats.aggregates.pairs, 'Repeated human-over-advisor pairs'));
  lines.push('');
  lines.push(...formatAgg(stats.aggregates.chosen, 'Human-played off-top cards'));
  lines.push('');
  lines.push(...formatAgg(stats.aggregates.rejectedBest, 'Advisor top cards humans skipped'));
  lines.push('');
  lines.push('Top teaching candidates:');
  if (!stats.teaching.length) {
    lines.push('  none');
  } else {
    for (const play of stats.teaching.slice(0, 12)) {
      lines.push(`  ${formatPlay(play)}`);
    }
  }
  if (stats.candidates.length) {
    lines.push('');
    lines.push('Lower-confidence candidates:');
    for (const play of stats.candidates.slice(0, 8)) {
      lines.push(`  ${formatPlay(play)}`);
    }
  }
  lines.push('');
  lines.push(...formatCountAgg(stats.aggregates.actionTypes, 'Action mismatches by advisor recommendation type'));
  lines.push('');
  lines.push(...formatCountAgg(stats.aggregates.actionOverPlayActions, 'Blue action over play-card: human actions'));
  lines.push('');
  lines.push(...formatCountAgg(stats.aggregates.actionOverPlayAdvisorPlays, 'Blue action over play-card: advisor play targets'));
  lines.push('');
  lines.push(...formatCountAgg(stats.aggregates.actionOverPlayTiming, 'Blue action over play-card: timing'));
  lines.push('');
  lines.push(...formatCountAgg(stats.aggregates.actionPairs, 'Repeated human action-over-advisor pairs'));
  lines.push('');
  lines.push('Top action mismatches:');
  if (!stats.actionMismatches.length) {
    lines.push('  none');
  } else {
    for (const action of stats.actionMismatches.slice(0, 12)) {
      lines.push(`  ${formatAction(action)}`);
    }
  }
  lines.push('');
  lines.push('Use this as evidence, not automatic truth: repeated pairs are scoring-change candidates; one-offs need review against board state.');
  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const files = resolveFiles(options);
  const entries = buildEntries(files, options);
  const stats = analyzeEntries(entries, {minGap: options.minGap});
  if (options.replay) {
    stats.replay = {
      files: entries.length,
      sourceFiles: entries.map((entry) => entry.sourceFile || entry.file),
    };
  }
  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(formatReport(stats));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeEntries,
  buildEntries,
  classify,
  formatReport,
  resolveFiles,
  replayFileWithCurrentAdvisor,
};
