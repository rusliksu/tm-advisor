#!/usr/bin/env node
/**
 * tm-turn-notifier.js — Telegram notifications for Terraforming Mars turns
 *
 * Watches active games from DB, sends Telegram when it's your turn.
 * Runs as systemd daemon.
 *
 * Env:
 *   TM_BOT_TOKEN    — Telegram bot token
 *   TM_DB_PATH      — path to game.db (default: /home/openclaw/terraforming-mars/db/game.db)
 *   POLL_INTERVAL   — seconds between polls (default: 15)
 */

'use strict';

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const BOT_TOKEN = process.env.TM_BOT_TOKEN || '';
const DB_PATH = process.env.TM_DB_PATH || '/home/openclaw/terraforming-mars/db/game.db';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15') * 1000;

// Player name → Telegram chat ID
const PLAYER_TELEGRAM = {
  'gydro': 162438481,
  'руслан': 162438481,
  'ruslan': 162438481,
  'илья': 353877502,
  'genuinegold': 353877502,
};

// Track: playerId → last notified timestamp
const notified = new Map();
const NOTIFY_COOLDOWN = 120_000; // 2 min

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

function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) { console.log('[DRY]', chatId, text.replace(/<[^>]+>/g, '')); return Promise.resolve(); }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function findChatId(name) {
  const lower = (name || '').trim().toLowerCase();
  return PLAYER_TELEGRAM[lower] || null;
}

// Get active (non-finished) player IDs from DB
function getActivePlayers() {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    const out = execSync(
      `sqlite3 "${DB_PATH}" "SELECT p.participant FROM participants p LEFT JOIN completed_game c ON p.game_id = c.game_id WHERE c.game_id IS NULL AND p.participant LIKE 'p%' ORDER BY p.game_id DESC LIMIT 30;" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean);
  } catch (e) {
    // sqlite3 not available — fallback to watching file
    return [];
  }
}

// Fallback: watch file with player IDs (one per line)
const WATCH_FILE = '/home/openclaw/terraforming-mars/elo/active-players.txt';
function getWatchedPlayers() {
  const dbPlayers = getActivePlayers();
  if (dbPlayers.length > 0) return dbPlayers;
  // Fallback to file
  try {
    return fs.readFileSync(WATCH_FILE, 'utf8').trim().split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function checkPlayer(playerId) {
  try {
    const state = await fetchJson(`https://tm.knightbyte.win:4444/api/player?id=${playerId}`);
    if (!state || !state.waitingFor) return;

    const playerName = state.thisPlayer?.name || state.color || 'Unknown';
    const chatId = findChatId(playerName);
    if (!chatId) return;

    const lastNotified = notified.get(playerId) || 0;
    if (Date.now() - lastNotified < NOTIFY_COOLDOWN) return;

    const game = state.game || {};
    const gen = game.generation || '?';
    const phase = game.phase || '?';
    const wf = state.waitingFor;
    const wfTitle = typeof wf.title === 'object' ? (wf.title.message || '') : (wf.title || '');

    let action = '';
    if (phase === 'drafting' || phase === 'research') action = '📋 Драфт карт';
    else if (wf.type === 'or') action = '🎯 ' + (wfTitle.slice(0, 50) || 'Выбери действие');
    else if (wf.type === 'card') action = '🃏 Выбери карты';
    else if (wf.type === 'space') action = '📍 Размести тайл';
    else action = wf.type;

    const link = `https://tm.knightbyte.win:4444/player?id=${playerId}`;
    const msg = `🎲 <b>Твой ход!</b>\nGen ${gen} · ${phase}\n${action}\n\n<a href="${link}">Открыть игру</a>`;

    await sendTelegram(chatId, msg);
    notified.set(playerId, Date.now());
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${playerName} notified (gen ${gen})`);
  } catch (e) {
    // Player API failed — game might have ended or player ID invalid
    if (e.message && !e.message.includes('Parse error')) {
      console.warn('checkPlayer error:', playerId.slice(0, 8), e.message);
    }
  }
}

function cleanupNotified() {
  const cutoff = Date.now() - 3600_000;
  for (const [key, ts] of notified) {
    if (ts < cutoff) notified.delete(key);
  }
}

async function poll() {
  const players = getWatchedPlayers();
  if (players.length === 0) return;
  for (const pid of players) {
    await checkPlayer(pid);
  }
}

console.log('TM Turn Notifier started');
console.log(`DB: ${DB_PATH}`);
console.log(`Poll: ${POLL_INTERVAL / 1000}s`);
console.log(`Bot: ${BOT_TOKEN ? 'configured' : 'DRY RUN'}`);

setInterval(() => { poll(); cleanupNotified(); }, POLL_INTERVAL);
poll();
