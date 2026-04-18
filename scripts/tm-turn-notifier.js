#!/usr/bin/env node
/**
 * tm-turn-notifier.js — legacy Telegram notifications for Terraforming Mars turns
 *
 * Emergency/manual fallback only. Do not run this as a permanent systemd service:
 * production turn notices are handled by the integrated TM server notifier.
 *
 * Env:
 *   TM_BOT_TOKEN    — Telegram bot token
 *   TM_BASE_URL     — TM base URL (default: https://tm.knightbyte.win)
 *   TM_DB_PATH      — path to game.db (default: /home/openclaw/tm-runtime/prod/shared/db/game.db)
 *   POLL_INTERVAL   — seconds between polls (default: 15)
 */

'use strict';

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const BOT_TOKEN = process.env.TM_BOT_TOKEN || '';
const BASE_URL = (process.env.TM_BASE_URL || 'https://tm.knightbyte.win').replace(/\/+$/, '');
const DB_PATH = process.env.TM_DB_PATH || '/home/openclaw/tm-runtime/prod/shared/db/game.db';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15') * 1000;

// Track: playerId -> { noticeKey, messageId, chatId }
const playerState = new Map();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Parse error: ' + body.slice(0, 80))); }
      });
    }).on('error', reject);
  });
}

function callTelegram(method, payload) {
  if (!BOT_TOKEN) {
    if (method === 'sendMessage') {
      console.log('[DRY]', payload.chat_id, String(payload.text || '').replace(/<[^>]+>/g, ''));
      return Promise.resolve({ ok: true, result: { message_id: -1 } });
    }
    return Promise.resolve({ ok: true });
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_err) {
          resolve({ ok: false, description: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sendTelegram(chatId, text) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

function deleteTelegramMessage(chatId, messageId) {
  if (!chatId || !Number.isInteger(messageId) || messageId < 0) {
    return Promise.resolve({ ok: true });
  }
  return callTelegram('deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

function runSql(query) {
  if (!fs.existsSync(DB_PATH)) return '';
  try {
    return execSync(
      `sqlite3 "${DB_PATH}" "${query}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
  } catch (_err) {
    return '';
  }
}

function normalizeChatId(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  return /^\d{5,20}$/.test(text) ? text : null;
}

function getActivePlayerEntriesFromDb() {
  const rows = runSql(
    "SELECT g.game FROM games g " +
    "JOIN (SELECT game_id, MAX(save_id) AS save_id FROM games WHERE status = 'running' GROUP BY game_id) latest " +
    "ON latest.game_id = g.game_id AND latest.save_id = g.save_id " +
    "LEFT JOIN completed_game c ON g.game_id = c.game_id " +
    "WHERE c.game_id IS NULL AND g.status = 'running' " +
    "ORDER BY g.created_time DESC LIMIT 60;"
  );
  if (!rows) return [];

  const entries = new Map();
  for (const line of rows.split('\n')) {
    if (!line.trim()) continue;
    try {
      const game = JSON.parse(line);
      const phase = game.phase || '';
      const activePlayerId = game.activePlayer || '';
      for (const player of Array.isArray(game.players) ? game.players : []) {
        if (!player || typeof player.id !== 'string' || !player.id.startsWith('p')) continue;
        entries.set(player.id, {
          activePlayerId,
          chatId: normalizeChatId(player.telegramID),
          gameId: game.id || '',
          phase,
          needsToDraft: player.needsToDraft === true,
          playerId: player.id,
          playerName: player.name || 'Unknown',
        });
      }
    } catch (_err) {
      // Ignore malformed rows
    }
  }
  return Array.from(entries.values());
}

// Get active (non-finished) player IDs from DB
function getActivePlayers() {
  return getActivePlayerEntriesFromDb();
}

// Fallback: watch file with player IDs (one per line)
const WATCH_FILE = '/home/openclaw/terraforming-mars/elo/active-players.txt';
function getWatchedPlayers() {
  const dbPlayers = getActivePlayers();
  if (dbPlayers.length > 0) return dbPlayers;
  // Fallback to file
  try {
    return fs.readFileSync(WATCH_FILE, 'utf8').trim().split('\n').filter(Boolean).map((playerId) => ({
      activePlayerId: '',
      chatId: null,
      gameId: '',
      phase: '',
      needsToDraft: false,
      playerId,
      playerName: 'Unknown',
    }));
  } catch (e) {
    return [];
  }
}

function getCardsFingerprint(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.map((card) => {
    if (card && typeof card === 'object') return card.name || '';
    return String(card || '');
  }).join('|');
}

function getResearchFingerprint(state) {
  return getCardsFingerprint(state.dealtProjectCards || state.cardsInHand);
}

function getWaitingFor(state) {
  return state.waitingFor || state.thisPlayer?.waitingFor || null;
}

function normalizePromptTitle(waitingFor) {
  if (!waitingFor) return '';
  const rawTitle = typeof waitingFor.title === 'object' ? (waitingFor.title?.message || '') : (waitingFor.title || '');
  const title = String(rawTitle).trim();
  switch (title) {
  case 'Take your first action':
  case 'Take your next action':
    return 'Выбери действие';
  case 'Select one option':
    return 'Выбери вариант';
  default:
    return title;
  }
}

function getPhase(state, entry) {
  return state.game?.phase || entry.phase || '';
}

function isDraftPhase(phase) {
  return phase === 'drafting' || phase === 'initial_drafting';
}

function isPlayersTurn(entry, state) {
  const waitingFor = getWaitingFor(state);
  if (waitingFor) return true;
  const phase = getPhase(state, entry);
  if (isDraftPhase(phase)) return entry.needsToDraft === true;
  if (phase === 'research') return Array.isArray(state.dealtProjectCards) && state.dealtProjectCards.length > 0;
  if (entry.activePlayerId) return entry.activePlayerId === entry.playerId;
  return false;
}

function buildNoticeKey(entry, state) {
  const phase = getPhase(state, entry);
  const gameId = state.game?.id || entry.gameId || '';
  const waitingFor = getWaitingFor(state) || {};
  const promptType = waitingFor.type || '';
  const promptTitle = normalizePromptTitle(waitingFor);
  if (isDraftPhase(phase)) {
    return [gameId, state.game?.generation || '?', phase, promptType, getCardsFingerprint(state.cardsInHand)].join('|');
  }
  if (phase === 'research') {
    return [gameId, state.game?.generation || '?', phase, promptType, getResearchFingerprint(state)].join('|');
  }
  return [gameId, state.game?.generation || '?', phase, entry.activePlayerId || entry.playerId, promptType, promptTitle].join('|');
}

function buildActionLabel(entry, state) {
  const phase = getPhase(state, entry);
  const waitingFor = getWaitingFor(state) || {};
  const wfTitle = normalizePromptTitle(waitingFor);
  if (isDraftPhase(phase) || phase === 'research') return 'Драфт карт';
  if (waitingFor.type === 'or') return wfTitle || 'Выбери действие';
  if (waitingFor.type === 'card') return 'Выбери карты';
  if (waitingFor.type === 'space') return 'Размести тайл';
  if (waitingFor.type === 'option') return wfTitle || 'Выбери вариант';
  if (wfTitle) return wfTitle;
  return 'Твой ход';
}

async function clearPlayerNotice(playerId) {
  const previous = playerState.get(playerId);
  if (!previous) return;
  playerState.delete(playerId);
  try {
    await deleteTelegramMessage(previous.chatId, previous.messageId);
  } catch (e) {
    if (e && e.message) {
      console.warn('delete notice error:', playerId.slice(0, 8), e.message);
    }
  }
}

async function checkPlayer(entry) {
  const playerId = entry.playerId;
  try {
    const state = await fetchJson(`${BASE_URL}/api/player?id=${playerId}`);
    if (!state) {
      await clearPlayerNotice(playerId);
      return;
    }

    if (!isPlayersTurn(entry, state)) {
      await clearPlayerNotice(playerId);
      return;
    }

    const playerName = state.thisPlayer?.name || entry.playerName || state.color || 'Unknown';
    const chatId = entry.chatId || normalizeChatId(state.thisPlayer?.telegramID);
    if (!chatId) return;

    const noticeKey = buildNoticeKey(entry, state);
    if (!noticeKey) return;
    const previous = playerState.get(playerId);
    if (previous && previous.noticeKey === noticeKey) return;

    const game = state.game || {};
    const gen = game.generation || '?';
    const phase = getPhase(state, entry) || '?';
    const action = buildActionLabel(entry, state);

    const link = `${BASE_URL}/player?id=${playerId}`;
    const msg = `<b>Твой ход!</b>\nGen ${gen} · ${phase}\n${action}\n\n<a href="${link}">Открыть игру</a>`;

    if (previous) {
      await deleteTelegramMessage(previous.chatId, previous.messageId);
    }
    const response = await sendTelegram(chatId, msg);
    const messageId = Number(response?.result?.message_id);
    playerState.set(playerId, {
      noticeKey,
      chatId,
      messageId: Number.isInteger(messageId) ? messageId : -1,
    });
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${playerName} notified (gen ${gen})`);
  } catch (e) {
    // Keep player state on transient API or Telegram failures to avoid duplicate spam.
    if (e.message && !e.message.includes('Parse error')) {
      console.warn('checkPlayer error:', playerId.slice(0, 8), e.message);
    }
  }
}

async function cleanupNotified() {
  const activePlayerIds = new Set(getWatchedPlayers().map((entry) => entry.playerId));
  for (const key of Array.from(playerState.keys())) {
    if (!activePlayerIds.has(key)) {
      await clearPlayerNotice(key);
    }
  }
}

async function poll() {
  const players = getWatchedPlayers();
  if (players.length === 0) return;
  for (const entry of players) {
    await checkPlayer(entry);
  }
  await cleanupNotified();
}

console.log('TM Turn Notifier started');
console.log(`Base URL: ${BASE_URL}`);
console.log(`DB: ${DB_PATH}`);
console.log(`Poll: ${POLL_INTERVAL / 1000}s`);
console.log(`Bot: ${BOT_TOKEN ? 'configured' : 'DRY RUN'}`);

setInterval(() => { void poll(); }, POLL_INTERVAL);
poll();
