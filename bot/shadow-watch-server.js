#!/usr/bin/env node
/**
 * shadow-watch-server.js — discover TM games by SERVER_ID and keep shadow logs
 * for all active games in one process.
 *
 * Usage:
 *   node bot/shadow-watch-server.js --server-id <id>
 */
'use strict';

const fs = require('fs');

const {
  DEFAULT_SERVER_URL,
  appendJsonl,
  buildManagerLogPath,
  fetchJSON,
  pollShadowSession,
  stopShadowSession,
  startShadowSession,
} = require('./shadow-runtime');
const {getInputFile, mergeGameLogs} = require('./shadow-merge');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    serverUrl: process.env.TM_BASE_URL || DEFAULT_SERVER_URL,
    serverId: process.env.SERVER_ID || '',
    discoverInterval: 30,
    actionInterval: 3,
    parallelInterval: 4,
    normalInterval: 8,
    idleInterval: 20,
    burstInterval: 0.75,
    inputBurstPolls: 4,
    stalePolls: 5,
    maxNewGamesPerDiscovery: 25,
    restartCooldownSeconds: 180,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server-url' && args[i + 1]) result.serverUrl = args[++i];
    if (args[i] === '--server-id' && args[i + 1]) result.serverId = args[++i];
    if (args[i] === '--discover-interval' && args[i + 1]) result.discoverInterval = parseFloat(args[++i]);
    if (args[i] === '--action-interval' && args[i + 1]) result.actionInterval = parseFloat(args[++i]);
    if (args[i] === '--parallel-interval' && args[i + 1]) result.parallelInterval = parseFloat(args[++i]);
    if (args[i] === '--normal-interval' && args[i + 1]) result.normalInterval = parseFloat(args[++i]);
    if (args[i] === '--idle-interval' && args[i + 1]) result.idleInterval = parseFloat(args[++i]);
    if (args[i] === '--burst-interval' && args[i + 1]) result.burstInterval = parseFloat(args[++i]);
    if (args[i] === '--input-burst-polls' && args[i + 1]) result.inputBurstPolls = parseInt(args[++i], 10);
    if (args[i] === '--stale-polls' && args[i + 1]) result.stalePolls = parseInt(args[++i], 10);
    if (args[i] === '--max-new-games-per-discovery' && args[i + 1]) {
      result.maxNewGamesPerDiscovery = parseInt(args[++i], 10);
    }
    if (args[i] === '--restart-cooldown-seconds' && args[i + 1]) {
      result.restartCooldownSeconds = parseFloat(args[++i]);
    }
  }

  result.serverUrl = result.serverUrl.replace(/\/$/, '');
  return result;
}

function phaseNeedsAllPlayers(phase) {
  return phase === 'initialDrafting' || phase === 'initial_drafting' || phase === 'research' || phase === 'drafting' || phase === 'prelude';
}

function computePollInterval(session, args) {
  const phase = session.currentGame?.phase || '';
  let interval = args.normalInterval;
  if (phaseNeedsAllPlayers(phase)) {
    interval = args.parallelInterval;
  } else if (phase === 'action') {
    interval = args.actionInterval;
  }
  if ((session.pollsWithoutChange || 0) >= args.stalePolls) {
    interval = Math.max(interval, args.idleInterval);
  }
  return interval;
}

function computeNextPollDelay(session, args, result) {
  const phase = result?.phase || session.currentGame?.phase || '';
  const base = computePollInterval(session, args);
  if ((session.inputBurstPollsRemaining || 0) > 0) {
    return Math.min(base, Math.max(0.2, args.burstInterval || 0.75));
  }
  if (!result?.changed) return base;
  if (phaseNeedsAllPlayers(phase)) {
    return Math.min(base, Math.max(0.2, args.burstInterval || 0.75));
  }
  if (phase === 'action') {
    return Math.min(base, Math.max(0.5, args.burstInterval || 0.75));
  }
  return base;
}

async function discoverGames(serverUrl, serverId) {
  const params = new URLSearchParams({serverId});
  return fetchJSON(`${serverUrl}/api/games?${params.toString()}`);
}

function isDiscoveryUnauthorizedError(error) {
  return /\/api\/games\?/.test(String(error?.message || '')) &&
    /returned 403\b/.test(String(error?.message || ''));
}

function readInputLogMarker(inputFile) {
  try {
    const stat = fs.statSync(inputFile);
    return {exists: true, size: stat.size, mtimeMs: stat.mtimeMs};
  } catch (_err) {
    return {exists: false, size: 0, mtimeMs: 0};
  }
}

function inputLogAdvanced(previousMarker, nextMarker) {
  const prev = previousMarker || {exists: false, size: 0, mtimeMs: 0};
  const next = nextMarker || {exists: false, size: 0, mtimeMs: 0};
  if (!next.exists) return false;
  if (!prev.exists) return next.size > 0;
  return next.size > prev.size || next.mtimeMs > prev.mtimeMs;
}

function refreshSessionInputActivity(session, now, args) {
  const inputLogFile = session.inputLogFile || getInputFile(session.gameId);
  const nextMarker = readInputLogMarker(inputLogFile);
  const advanced = inputLogAdvanced(session.inputLogMarker, nextMarker);
  session.inputLogFile = inputLogFile;
  session.inputLogMarker = nextMarker;
  if (!advanced) return false;
  session.inputBurstPollsRemaining = Math.max(session.inputBurstPollsRemaining || 0, Math.max(1, args.inputBurstPolls || 4));
  session.nextPollAt = Math.min(session.nextPollAt || Number.POSITIVE_INFINITY, now);
  return true;
}

function mergeSessionLogs(managerLog, gameId, session, context = {}) {
  try {
    const merge = mergeGameLogs(gameId);
    appendJsonl(managerLog, {
      type: 'shadow_merged',
      ts: new Date().toISOString(),
      gameId,
      logPath: session?.logFile || null,
      mergedPath: merge.outputFile,
      skipped: merge.skipped === true,
      counts: merge.counts,
      ...context,
    });
  } catch (err) {
    appendJsonl(managerLog, {
      type: 'shadow_merge_failed',
      ts: new Date().toISOString(),
      gameId,
      error: err.message,
      logPath: session?.logFile || null,
      ...context,
    });
  }
}

async function finalizeActiveSessions(managerLog, sessions, options = {}) {
  const reason = options.reason || 'shutdown';
  const status = options.status || 'shutdown';
  const stopSession = options.stopSession || stopShadowSession;
  const mergeLogs = options.mergeLogs || mergeSessionLogs;
  const log = options.log || appendJsonl;
  const finalized = [];

  for (const [gameId, session] of [...sessions.entries()]) {
    sessions.delete(gameId);
    const ts = new Date().toISOString();
    try {
      const stopResult = await stopSession(session, status);
      log(managerLog, {
        type: 'shadow_shutdown_session',
        ts,
        gameId,
        status,
        reason,
        changed: stopResult?.changed === true,
        flushError: stopResult?.flushError?.message || null,
        logPath: session.logFile,
      });
      mergeLogs(managerLog, gameId, session, {reason, status});
      finalized.push({gameId, changed: stopResult?.changed === true, flushError: stopResult?.flushError || null});
    } catch (err) {
      log(managerLog, {
        type: 'shadow_shutdown_session_failed',
        ts,
        gameId,
        status,
        reason,
        error: err.message,
        logPath: session.logFile,
      });
      finalized.push({gameId, error: err});
    }
  }

  return finalized;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.serverId) {
    console.error('server id is required: pass --server-id or set SERVER_ID');
    process.exit(1);
  }

  const managerLog = buildManagerLogPath();
  const sessions = new Map();
  const suppressedGames = new Map();
  const restartCooldowns = new Map();
  let nextDiscoveryAt = 0;
  let currentIds = new Set();
  let shutdownStarted = false;

  console.log(`Shadow Watch Server | ${args.serverUrl} | serverId=${args.serverId}`);
  console.log(`Manager log: ${managerLog}`);

  const shutdown = async (reason, error = null, exitCode = 0) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    appendJsonl(managerLog, {
      type: 'shadow_manager_shutdown',
      ts: new Date().toISOString(),
      reason,
      activeSessions: sessions.size,
      error: error?.message || null,
    });
    await finalizeActiveSessions(managerLog, sessions, {
      reason: `manager_${reason}`,
      status: 'shutdown',
    });
    if (error) {
      console.error(error);
    }
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown('sigint', null, 0);
  });
  process.on('SIGTERM', () => {
    void shutdown('sigterm', null, 0);
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    void shutdown('unhandledRejection', error, 1);
  });
  process.on('uncaughtException', (error) => {
    void shutdown('uncaughtException', error, 1);
  });

  while (true) {
    const now = Date.now() / 1000;

    if (now >= nextDiscoveryAt) {
      try {
        const games = await discoverGames(args.serverUrl, args.serverId);
        currentIds = new Set(games.map((entry) => entry.gameId).filter(Boolean));
      } catch (err) {
        const unauthorized = isDiscoveryUnauthorizedError(err);
        appendJsonl(managerLog, {
          type: unauthorized ? 'discovery_unauthorized' : 'discovery_error',
          ts: new Date().toISOString(),
          error: err.message,
          hint: unauthorized
            ? 'SERVER_ID is missing, stale, or belongs to a different TM server. Sync/restart tm-shadow-watch with the active tm-server SERVER_ID.'
            : null,
        });
        if (unauthorized) {
          throw new Error(`Cannot discover games: ${err.message}. SERVER_ID is missing/stale or does not match ${args.serverUrl}.`);
        }
        nextDiscoveryAt = now + args.discoverInterval;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      for (const [gameId] of suppressedGames) {
        if (!currentIds.has(gameId)) suppressedGames.delete(gameId);
      }
      for (const [gameId, expiresAt] of restartCooldowns) {
        if (!currentIds.has(gameId) || expiresAt <= now) restartCooldowns.delete(gameId);
      }

      const newGameIds = [...currentIds]
        .filter((gameId) =>
          !sessions.has(gameId) &&
          !suppressedGames.has(gameId) &&
          !restartCooldowns.has(gameId))
        .sort();

      if (newGameIds.length > args.maxNewGamesPerDiscovery) {
        appendJsonl(managerLog, {
          type: 'shadow_start_deferred',
          ts: new Date().toISOString(),
          deferredCount: newGameIds.length - args.maxNewGamesPerDiscovery,
          maxNewGamesPerDiscovery: args.maxNewGamesPerDiscovery,
        });
      }

      for (const gameId of newGameIds.slice(0, args.maxNewGamesPerDiscovery)) {
        try {
          const session = await startShadowSession({
            gameId,
            serverUrl: args.serverUrl,
          });
          if (session.currentGame?.phase === 'end' || session.currentGame?.phase === 'the_end') {
            suppressedGames.set(gameId, 'ended');
            appendJsonl(managerLog, {
              type: 'shadow_skipped',
              ts: new Date().toISOString(),
              gameId,
              reason: 'phase_end',
              logPath: session.logFile,
            });
            continue;
          }
          session.pollsWithoutChange = 0;
          session.inputLogFile = getInputFile(gameId);
          session.inputLogMarker = readInputLogMarker(session.inputLogFile);
          session.nextPollAt = now + computePollInterval(session, args);
          sessions.set(gameId, session);
          appendJsonl(managerLog, {
            type: 'shadow_started',
            ts: new Date().toISOString(),
            gameId,
            players: session.players.length,
            logPath: session.logFile,
            nextPollIn: session.nextPollAt - now,
          });
        } catch (err) {
          restartCooldowns.set(gameId, now + args.restartCooldownSeconds);
          appendJsonl(managerLog, {
            type: 'shadow_start_failed',
            ts: new Date().toISOString(),
            gameId,
            error: err.message,
          });
        }
      }

      for (const [gameId, session] of sessions) {
        if (!currentIds.has(gameId)) {
          sessions.delete(gameId);
          appendJsonl(managerLog, {
            type: 'shadow_removed',
            ts: new Date().toISOString(),
            gameId,
            logPath: session.logFile,
          });
          mergeSessionLogs(managerLog, gameId, session, {reason: 'discovery_removed'});
        }
      }

      nextDiscoveryAt = now + args.discoverInterval;
    }

    for (const [gameId, session] of [...sessions.entries()]) {
      refreshSessionInputActivity(session, now, args);
      if (now < (session.nextPollAt || 0)) continue;
      try {
        const result = await pollShadowSession(session);
        if (result.active) {
          if (result.changed) {
            session.pollsWithoutChange = 0;
            session.lastChangeAt = now;
          } else {
            session.pollsWithoutChange = (session.pollsWithoutChange || 0) + 1;
          }
          session.nextPollAt = now + computeNextPollDelay(session, args, result);
          continue;
        }

        sessions.delete(gameId);
        if (result.status === 'ended') {
          suppressedGames.set(gameId, 'ended');
        } else {
          restartCooldowns.set(gameId, now + args.restartCooldownSeconds);
        }
        appendJsonl(managerLog, {
          type: 'shadow_stopped',
          ts: new Date().toISOString(),
          gameId,
          status: result.status,
          logPath: session.logFile,
        });
        mergeSessionLogs(managerLog, gameId, session, {reason: 'shadow_stopped', status: result.status});
      } catch (err) {
        sessions.delete(gameId);
        restartCooldowns.set(gameId, now + args.restartCooldownSeconds);
        appendJsonl(managerLog, {
          type: 'shadow_poll_failed',
          ts: new Date().toISOString(),
          gameId,
          error: err.message,
          logPath: session.logFile,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  computeNextPollDelay,
  computePollInterval,
  finalizeActiveSessions,
  isDiscoveryUnauthorizedError,
  inputLogAdvanced,
  parseArgs,
  phaseNeedsAllPlayers,
  readInputLogMarker,
  refreshSessionInputActivity,
};
