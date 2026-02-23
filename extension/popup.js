// TM Tier Overlay — Popup Logic v1.8.0

// Russian name helper
function ruName(engName) {
  if (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[engName]) return TM_NAMES_RU[engName];
  return engName;
}

const toggleEnabled = document.getElementById('toggle-enabled');
const toggleLogging = document.getElementById('toggle-logging');
const toggleDebug = document.getElementById('toggle-debug');
const info = document.getElementById('info');
const tierBtns = document.querySelectorAll('.tier-btn');

const defaultFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

// ── Tabs ──

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.getAttribute('data-tab')).classList.add('active');
  });
});

// ── Load settings ──

chrome.storage.local.get(
  { enabled: true, tierFilter: defaultFilter, logging: true, panel_debug: false },
  (s) => {
    toggleEnabled.checked = s.enabled;
    toggleLogging.checked = s.logging;
    toggleDebug.checked = s.panel_debug;

    tierBtns.forEach((btn) => {
      const tier = btn.getAttribute('data-tier');
      if (s.tierFilter[tier] === false) btn.classList.add('off');
    });
  }
);

// Card count
if (typeof TM_RATINGS !== 'undefined') {
  info.textContent = 'v1.8 \u2022 ' + Object.keys(TM_RATINGS).length + ' карт';
} else {
  info.textContent = 'v1.8';
}

// ── Toggle handlers ──

toggleEnabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggleEnabled.checked });
});

toggleLogging.addEventListener('change', () => {
  chrome.storage.local.set({ logging: toggleLogging.checked });
});

toggleDebug.addEventListener('change', () => {
  chrome.storage.local.set({ panel_debug: toggleDebug.checked });
});

// ── Tier filter buttons ──

tierBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('off');
    const filter = {};
    tierBtns.forEach((b) => {
      filter[b.getAttribute('data-tier')] = !b.classList.contains('off');
    });
    chrome.storage.local.set({ tierFilter: filter });
  });
});

// ── Game Logs ──

function loadLogs() {
  chrome.storage.local.get(null, (all) => {
    const logList = document.getElementById('log-list');
    const logActions = document.getElementById('log-actions');
    const logs = [];

    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith('gamelog_') && val.gameId) {
        logs.push(val);
      }
    }

    if (logs.length === 0) {
      logList.innerHTML = '<div class="empty">Игр ещё нет</div>';
      logActions.style.display = 'none';
      return;
    }

    logs.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    logList.innerHTML = '';
    logActions.style.display = 'block';

    for (const log of logs.slice(0, 20)) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const date = new Date(log.startTime);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);

      // v2 format: count events by type
      let statsText = '';
      if (log.version === 2 && log.events) {
        const decisions = log.events.filter(e => e.eventType && e.eventType !== 'state_snapshot' && e.type !== 'waiting_for' && e.type !== 'state_snapshot');
        const lastGen = log.events.reduce((g, e) => e.generation > g ? e.generation : g, 0);
        const playerNames = log.players ? log.players.map(p => p.name || p.color).join(' vs ') : '';
        statsText = 'Пок. ' + (lastGen || '?') + ' | ' + decisions.length + ' решений';
        if (playerNames) statsText += '\n' + playerNames;
      } else if (log.snapshots && log.snapshots.length > 0) {
        // v1 fallback
        const lastSnap = log.snapshots[log.snapshots.length - 1];
        statsText = 'Пок. ' + (lastSnap.generation || '?') + ' (v1)';
      }

      entry.innerHTML =
        '<div class="log-id">' + escHtml(log.gameId.slice(0, 12)) + '</div>' +
        '<div class="log-date">' + dateStr + '</div>' +
        '<div class="log-stats">' + escHtml(statsText) + '</div>';

      entry.addEventListener('click', () => showLogDetail(log));
      logList.appendChild(entry);
    }
  });
}

function showLogDetail(log) {
  const detail = document.getElementById('log-detail');
  detail.style.display = 'block';

  let html = '<h4>Игра ' + escHtml(log.gameId.slice(0, 12)) + '</h4>';

  // v2 format
  if (log.version === 2 && log.events) {
    // Players
    if (log.players && log.players.length > 0) {
      html += '<div style="margin-bottom:4px">';
      for (const p of log.players) {
        const isMe = p.color === log.myColor;
        html += '<span style="color:' + (isMe ? '#e67e22' : '#888') + '">' +
          escHtml(p.name || p.color) + (p.corp ? ' (' + escHtml(p.corp) + ')' : '') +
          '</span> ';
      }
      html += '</div>';
    }

    // Last state snapshot
    const snapshots = log.events.filter(e => e.type === 'state_snapshot' || e.type === 'final_state');
    const lastSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    if (lastSnap && lastSnap.globals) {
      const g = lastSnap.globals;
      html += '<div>T:' + (g.temperature != null ? g.temperature : '?') +
        ' O:' + (g.oxygen != null ? g.oxygen : '?') + '%' +
        ' Oc:' + (g.oceans != null ? g.oceans : '?') +
        (g.venus != null ? ' V:' + g.venus : '') + '</div>';
    }

    // Decision events summary
    const decisions = log.events.filter(e => e.eventType && e.type !== 'waiting_for' && e.type !== 'state_snapshot');
    const typeCounts = {};
    for (const d of decisions) {
      typeCounts[d.eventType] = (typeCounts[d.eventType] || 0) + 1;
    }

    html += '<h4>Решения (' + decisions.length + ')</h4><div style="font-size:11px;color:#666">';
    for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      html += escHtml(t) + ': ' + c + ' | ';
    }
    html += '</div>';

    // Last 15 decisions
    html += '<h4>Последние действия</h4><ul>';
    for (const ev of decisions.slice(-15)) {
      let desc = ev.eventType;
      if (ev.eventType === 'draft_pick') desc = 'Драфт: ' + (ev.picked || []).join(', ');
      else if (ev.eventType === 'card_buy') desc = 'Купил: ' + (ev.bought || []).join(', ');
      else if (ev.eventType === 'card_play') desc = 'Сыграл: ' + (ev.card || '?') + (ev.payment ? ' [' + ev.payment.megaCredits + 'MC]' : '');
      else if (ev.eventType === 'corp_select') desc = 'Корпорация: ' + (ev.selected || []).join(', ');
      else if (ev.eventType === 'prelude_select') desc = 'Прелюдия: ' + (ev.selected || []).join(', ');
      else if (ev.eventType === 'or_choice') desc = 'Выбор: ' + (ev.optionTitle || '#' + ev.index);
      else if (ev.eventType === 'space_select') desc = 'Клетка: ' + (ev.spaceId || '?');
      else if (ev.eventType === 'colony_select') desc = 'Колония: ' + (ev.colonyName || '?');
      html += '<li>' + escHtml(desc) + ' <span style="color:#aaa">G' + (ev.generation || '?') + '</span></li>';
    }
    html += '</ul>';

    // Export single game button
    html += '<div style="margin-top:8px"><button onclick="exportSingleLog(\'' + escHtml(log.gameId) + '\')" ' +
      'style="background:none;border:1px solid #2ecc71;border-radius:3px;padding:3px 8px;font-size:10px;cursor:pointer;color:#2ecc71">' +
      'Export this game JSON</button></div>';

  } else {
    // v1 fallback
    html += '<div class="empty">Лог v1 (старый формат)</div>';
  }

  detail.innerHTML = html;
}

// Export single game log
window.exportSingleLog = function(gameId) {
  chrome.storage.local.get('gamelog_' + gameId, (data) => {
    const log = data['gamelog_' + gameId];
    if (!log) return;
    const gen = log.events ? log.events.reduce((g, e) => e.generation > g ? e.generation : g, 0) : 0;
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tm-game-gen' + gen + '-' + dateStr + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
};

function escHtml(s) {
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
}

// Load logs when Logs tab is clicked
document.querySelector('[data-tab="logs"]').addEventListener('click', loadLogs);

// Export logs as JSON
document.getElementById('btn-export-logs').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const logs = {};
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith('gamelog_') && val.gameId) {
        logs[key] = val;
      }
    }
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tm-gamelogs-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

// Clear logs
document.getElementById('btn-clear-logs').addEventListener('click', () => {
  if (!confirm('Очистить все логи игр?')) return;
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith('gamelog_'));
    chrome.storage.local.remove(keysToRemove, () => {
      loadLogs();
      document.getElementById('log-detail').style.display = 'none';
    });
  });
});

// ── Stats Tab ──

function loadStats() {
  chrome.storage.local.get(null, (all) => {
    const container = document.getElementById('stats-content');
    const logs = [];

    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith('gamelog_') && val.gameId) {
        logs.push(val);
      }
    }

    if (logs.length === 0) {
      container.innerHTML = '<div class="empty">Нет данных. Сыграй пару игр!</div>';
      return;
    }

    let totalGames = logs.length;
    let totalGens = 0;
    let gensCount = 0;
    const cardPicks = {};    // card name → pick count (drafted/bought/played)
    const tierPicks = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    const corpUsage = {};    // corp name → count
    const decisionCounts = { draft_pick: 0, card_buy: 0, card_play: 0, corp_select: 0, prelude_select: 0, or_choice: 0 };
    let totalDecisions = 0;

    for (const log of logs) {
      if (log.version === 2 && log.events) {
        // v2: generation from events
        const maxGen = log.events.reduce((g, e) => (e.generation > g ? e.generation : g), 0);
        if (maxGen > 0) { totalGens += maxGen; gensCount++; }

        // Corp from players metadata
        if (log.players) {
          for (const p of log.players) {
            if (p.color === log.myColor && p.corp) {
              corpUsage[p.corp] = (corpUsage[p.corp] || 0) + 1;
            }
          }
        }

        // Process decision events
        for (const ev of log.events) {
          if (ev.type === 'waiting_for' || ev.type === 'state_snapshot' || ev.type === 'final_state' || ev.type === 'game_end') continue;

          const et = ev.eventType;
          if (!et) continue;
          totalDecisions++;
          if (decisionCounts[et] !== undefined) decisionCounts[et]++;

          // Collect card names for stats
          const cards = [];
          if (et === 'draft_pick' && ev.picked) cards.push(...ev.picked);
          if (et === 'card_buy' && ev.bought) cards.push(...ev.bought);
          if (et === 'card_play' && ev.card) cards.push(ev.card);
          if (et === 'corp_select' && ev.selected) cards.push(...ev.selected);
          if (et === 'prelude_select' && ev.selected) cards.push(...ev.selected);

          for (const name of cards) {
            cardPicks[name] = (cardPicks[name] || 0) + 1;
            if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) {
              tierPicks[TM_RATINGS[name].t] = (tierPicks[TM_RATINGS[name].t] || 0) + 1;
            }
          }
        }
      } else if (log.events) {
        // v1 fallback
        const lastSnap = log.snapshots && log.snapshots.length > 0 ? log.snapshots[log.snapshots.length - 1] : null;
        if (lastSnap && lastSnap.generation) { totalGens += lastSnap.generation; gensCount++; }
        for (const ev of log.events) {
          if (ev.type === 'card_click' && ev.card) {
            cardPicks[ev.card] = (cardPicks[ev.card] || 0) + 1;
            totalDecisions++;
            if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[ev.card]) {
              tierPicks[TM_RATINGS[ev.card].t] = (tierPicks[TM_RATINGS[ev.card].t] || 0) + 1;
            }
          }
        }
      }
    }

    let html = '';

    // Overview
    html += '<div class="stat-block"><h4>Обзор</h4>';
    html += '<div class="stat-row"><span>Игр записано</span><span class="stat-val">' + totalGames + '</span></div>';
    if (gensCount > 0) {
      html += '<div class="stat-row"><span>Средн. поколений</span><span class="stat-val">' + Math.round(totalGens / gensCount) + '</span></div>';
    }
    html += '<div class="stat-row"><span>Всего решений</span><span class="stat-val">' + totalDecisions + '</span></div>';
    html += '</div>';

    // Corp usage
    const topCorps = Object.entries(corpUsage).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topCorps.length > 0) {
      const maxCorp = topCorps[0][1];
      html += '<div class="stat-block"><h4>Корпорации</h4>';
      for (const [name, count] of topCorps) {
        const pct = Math.round((count / maxCorp) * 100);
        let tierClass = '';
        if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) tierClass = ' tier-' + TM_RATINGS[name].t;
        html += '<div class="stat-bar-wrap">';
        html += '<span class="stat-bar-label" title="' + escHtml(name) + '">' + escHtml(ruName(name)) + '</span>';
        html += '<div class="stat-bar"><div class="stat-bar-fill' + tierClass + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="stat-bar-num">' + count + '</span></div>';
      }
      html += '</div>';
    }

    // Tier distribution
    const maxTierPick = Math.max(...Object.values(tierPicks), 1);
    html += '<div class="stat-block"><h4>Тиры выбранных карт</h4>';
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) {
      if (tierPicks[t] > 0) {
        const pct = Math.round((tierPicks[t] / maxTierPick) * 100);
        html += '<div class="stat-bar-wrap">';
        html += '<span class="stat-bar-label">' + t + '-тир</span>';
        html += '<div class="stat-bar"><div class="stat-bar-fill tier-' + t + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="stat-bar-num">' + tierPicks[t] + '</span></div>';
      }
    }
    html += '</div>';

    // Most picked/played cards
    const topCards = Object.entries(cardPicks).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (topCards.length > 0) {
      const maxPick = topCards[0][1];
      html += '<div class="stat-block"><h4>Самые частые карты</h4>';
      for (const [name, count] of topCards) {
        const pct = Math.round((count / maxPick) * 100);
        let tierClass = '';
        if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) tierClass = ' tier-' + TM_RATINGS[name].t;
        html += '<div class="stat-bar-wrap">';
        html += '<span class="stat-bar-label" title="' + escHtml(name) + '">' + escHtml(ruName(name)) + '</span>';
        html += '<div class="stat-bar"><div class="stat-bar-fill' + tierClass + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="stat-bar-num">' + count + '</span></div>';
      }
      html += '</div>';
    }

    // Decision breakdown
    const decTotal = Object.values(decisionCounts).reduce((a, b) => a + b, 0);
    if (decTotal > 0) {
      const labels = { draft_pick: 'Драфт', card_buy: 'Покупка', card_play: 'Розыгрыш', corp_select: 'Корпорация', prelude_select: 'Прелюдия', or_choice: 'Выбор действия' };
      html += '<div class="stat-block"><h4>Типы решений</h4>';
      for (const [ctx, count] of Object.entries(decisionCounts).sort((a, b) => b[1] - a[1])) {
        if (count > 0) {
          html += '<div class="stat-row"><span>' + (labels[ctx] || ctx) + '</span><span class="stat-val">' + count + '</span></div>';
        }
      }
      html += '</div>';
    }

    container.innerHTML = html;
  });
}

// Load stats when Stats tab is clicked
document.querySelector('[data-tab="stats"]').addEventListener('click', loadStats);

// ── Settings Import/Export ──

document.getElementById('btn-export-settings').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const settings = {};
    for (const [key, val] of Object.entries(all)) {
      if (!key.startsWith('gamelog_')) {
        settings[key] = val;
      }
    }
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tm-settings-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

const fileInput = document.getElementById('file-import-settings');
document.getElementById('btn-import-settings').addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      chrome.storage.local.set(data, () => {
        alert('Настройки импортированы! Обнови страницу игры.');
        location.reload();
      });
    } catch (err) {
      alert('Некорректный JSON файл');
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
});

// ── Claude AI Tab ──

const toggleClaude = document.getElementById('toggle-claude');
const claudeApiKeyInput = document.getElementById('claude-api-key');
const claudeBaseUrlInput = document.getElementById('claude-base-url');
const btnSaveAI = document.getElementById('btn-save-ai');
const aiStatus = document.getElementById('ai-status');

// Load saved AI settings (claudeEnabled: true by default — proxy handles auth)
chrome.storage.local.get({ claudeEnabled: true, claudeApiKey: '', claudeBaseUrl: 'https://REDACTED_PROXY' }, (s) => {
  toggleClaude.checked = s.claudeEnabled;
  claudeApiKeyInput.value = s.claudeApiKey;
  claudeBaseUrlInput.value = s.claudeBaseUrl;
  aiStatus.textContent = s.claudeEnabled ? 'Работает через прокси' : 'Выключен';
  aiStatus.style.color = s.claudeEnabled ? '#2ecc71' : '#888';
});

toggleClaude.addEventListener('change', () => {
  chrome.storage.local.set({ claudeEnabled: toggleClaude.checked });
  aiStatus.textContent = toggleClaude.checked ? 'Работает через прокси' : 'Выключен';
  aiStatus.style.color = toggleClaude.checked ? '#2ecc71' : '#888';
});

btnSaveAI.addEventListener('click', () => {
  const key = claudeApiKeyInput.value.trim();
  const url = claudeBaseUrlInput.value.trim() || 'https://REDACTED_PROXY';
  chrome.storage.local.set({ claudeApiKey: key, claudeBaseUrl: url, claudeEnabled: true }, () => {
    toggleClaude.checked = true;
    aiStatus.textContent = key ? 'Ключ сохранён. Обнови страницу.' : 'Прокси сохранён. Обнови страницу.';
    aiStatus.style.color = '#2ecc71';
  });
});
