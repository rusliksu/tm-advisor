/**
 * tm-telegram-patch.js — Monkey-patch TM server to send Telegram notifications on turn change.
 *
 * Usage: require this BEFORE starting the server, or inject via NODE_OPTIONS:
 *   node -r /path/to/tm-telegram-patch.js build/src/server/server.js
 *
 * Env:
 *   TM_BOT_TOKEN          — Telegram bot token
 *   TM_NOTIFY_DELAY_MS    — delay before sending notification (default: 5000)
 *   TM_NOTIFY_COOLDOWN_MS — min interval between notifications per player (default: 30000)
 */

'use strict';

const https = require('https');

const BOT_TOKEN = process.env.TM_BOT_TOKEN || '';
const NOTIFY_DELAY = parseInt(process.env.TM_NOTIFY_DELAY_MS || '5000');
const NOTIFY_COOLDOWN = parseInt(process.env.TM_NOTIFY_COOLDOWN_MS || '30000');
const HOST = process.env.HOST || 'https://tm.knightbyte.win:4444';

// Track last notification per player ID to avoid spam
const lastNotified = new Map();
// Track pending timers to cancel if player acts before delay
const pendingTimers = new Map();

function sendTelegram(chatId, text) {
  if (!BOT_TOKEN || !chatId) return;
  const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 10000,
  });
  req.on('error', (e) => console.warn('[TM-TG] Send error:', e.message));
  req.write(data);
  req.end();
}

function normalizeChatId(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  return /^\d{5,20}$/.test(text) ? text : null;
}

function patchPlayer() {
  if (!BOT_TOKEN) {
    console.warn('[TM-TG] TM_BOT_TOKEN is not set; Telegram patch disabled');
    return;
  }
  // Delay patch — Player module loads lazily
  setTimeout(() => {
    try {
      const PlayerModule = require('/home/openclaw/terraforming-mars/build/src/server/Player');
      const Player = PlayerModule.Player;
      if (!Player || !Player.prototype) {
        console.warn('[TM-TG] Player class not found');
        return;
      }

      const origSetWaitingFor = Player.prototype.setWaitingFor;
      Player.prototype.setWaitingFor = function(input, cb) {
        // Call original
        origSetWaitingFor.call(this, input, cb);

        // Cancel any pending notification for this player (they were already waiting)
        const playerId = this.id;
        if (pendingTimers.has(playerId)) {
          clearTimeout(pendingTimers.get(playerId));
          pendingTimers.delete(playerId);
        }

        // Schedule notification with delay (skip if player acts quickly)
        const chatId = normalizeChatId(this.telegramID);
        if (!chatId) return;

        const lastTime = lastNotified.get(playerId) || 0;
        if (Date.now() - lastTime < NOTIFY_COOLDOWN) return;

        const game = this.game;
        const gen = game ? game.generation : '?';
        const phase = game ? game.phase : '?';

        const timer = setTimeout(() => {
          pendingTimers.delete(playerId);
          // Re-check: is player still waiting?
          if (!this.getWaitingFor()) return;

          const link = `${HOST}/player?id=${playerId}`;
          const msg = `🎲 <b>Твой ход!</b>\nGen ${gen} · ${phase}\n\n<a href="${link}">Открыть игру</a>`;
          sendTelegram(chatId, msg);
          lastNotified.set(playerId, Date.now());
          console.log(`[TM-TG] Notified ${playerName} (gen ${gen})`);
        }, NOTIFY_DELAY);

        pendingTimers.set(playerId, timer);
      };

      // Also patch process (player input) to cancel pending notification
      const origProcess = Player.prototype.process;
      if (origProcess) {
        Player.prototype.process = function(input) {
          // Player acted — cancel pending notification
          if (pendingTimers.has(this.id)) {
            clearTimeout(pendingTimers.get(this.id));
            pendingTimers.delete(this.id);
          }
          return origProcess.call(this, input);
        };
      }

      console.log('[TM-TG] Player.setWaitingFor patched for Telegram notifications');
      console.log('[TM-TG] Bot token: configured');
      console.log('[TM-TG] Delay:', NOTIFY_DELAY + 'ms, Cooldown:', NOTIFY_COOLDOWN + 'ms');
    } catch (e) {
      console.warn('[TM-TG] Patch failed:', e.message);
    }
  }, 1000);
}

patchPlayer();
