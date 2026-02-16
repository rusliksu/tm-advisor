// TM Tier Overlay — Popup Logic v1.8.0

// Russian name helper
function ruName(engName) {
  if (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[engName]) return TM_NAMES_RU[engName];
  return engName;
}

const toggleEnabled = document.getElementById('toggle-enabled');
const toggleLogging = document.getElementById('toggle-logging');
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
  { enabled: true, tierFilter: defaultFilter, logging: true },
  (s) => {
    toggleEnabled.checked = s.enabled;
    toggleLogging.checked = s.logging;

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

    // Sort by start time desc
    logs.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

    logList.innerHTML = '';
    logActions.style.display = 'block';

    for (const log of logs.slice(0, 20)) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const date = new Date(log.startTime);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);

      const lastSnap = log.snapshots && log.snapshots.length > 0
        ? log.snapshots[log.snapshots.length - 1]
        : null;

      let statsText = '';
      if (lastSnap) {
        statsText = 'Пок. ' + (lastSnap.generation || '?');
        if (lastSnap.myCards) {
          statsText += ' | Рука: ' + lastSnap.myCards.hand.length;
          statsText += ' | Сыграно: ' + lastSnap.myCards.tableau.length;
        }
      }

      entry.innerHTML =
        '<div class="log-id">' + log.gameId.slice(0, 10) + '</div>' +
        '<div class="log-date">' + dateStr + '</div>' +
        '<div class="log-stats">' + statsText + '</div>';

      entry.addEventListener('click', () => showLogDetail(log));
      logList.appendChild(entry);
    }
  });
}

function showLogDetail(log) {
  const detail = document.getElementById('log-detail');
  detail.style.display = 'block';

  const lastSnap = log.snapshots && log.snapshots.length > 0
    ? log.snapshots[log.snapshots.length - 1]
    : null;

  let html = '<h4>Игра ' + log.gameId.slice(0, 10) + '</h4>';

  if (lastSnap) {
    if (lastSnap.generation) {
      html += '<div>Поколение: ' + lastSnap.generation + '</div>';
    }
    if (lastSnap.globals) {
      const g = lastSnap.globals;
      html += '<div>T:' + (g.temperature || '?') +
        ' O:' + (g.oxygen || '?') + '%' +
        ' Oc:' + (g.oceans || '?') +
        (g.venus ? ' V:' + g.venus : '') + '</div>';
    }

    if (lastSnap.myCards && lastSnap.myCards.tableau.length > 0) {
      html += '<h4>Мой стол (' + lastSnap.myCards.tableau.length + ')</h4><ul>';
      for (const c of lastSnap.myCards.tableau) {
        html += '<li>' + escHtml(c) + '</li>';
      }
      html += '</ul>';
    }

    if (lastSnap.opponents && lastSnap.opponents.length > 0) {
      for (const opp of lastSnap.opponents) {
        html += '<h4>' + escHtml(opp.name || opp.color) +
          ' (TR:' + (opp.tr || '?') + ')</h4>';
        if (opp.tableau && opp.tableau.length > 0) {
          html += '<ul>';
          for (const c of opp.tableau) {
            html += '<li>' + escHtml(c) + '</li>';
          }
          html += '</ul>';
        }
      }
    }
  }

  // Events summary
  if (log.events && log.events.length > 0) {
    const cardClicks = log.events.filter((e) => e.type === 'card_click');
    if (cardClicks.length > 0) {
      html += '<h4>Выбранные карты (' + cardClicks.length + ')</h4><ul>';
      for (const ev of cardClicks.slice(-15)) {
        html += '<li>' + escHtml(ev.card) + ' <span style="color:#888">(' + ev.context + ')</span></li>';
      }
      html += '</ul>';
    }
  }

  // Timeline
  if (log.snapshots && log.snapshots.length > 1) {
    html += '<h4>Хронология</h4>';
    html += '<div class="timeline">';
    const firstTime = log.snapshots[0].timestamp || log.startTime;
    const lastTime = log.snapshots[log.snapshots.length - 1].timestamp || Date.now();
    const duration = lastTime - firstTime || 1;

    let prevGen = 0;
    for (const snap of log.snapshots) {
      if (snap.generation && snap.generation !== prevGen) {
        const pct = Math.round(((snap.timestamp - firstTime) / duration) * 100);
        html += '<div class="tl-marker" style="left:' + pct + '%">';
        html += '<div class="tl-dot"></div>';
        html += '<div class="tl-label">G' + snap.generation + '</div>';
        html += '</div>';
        prevGen = snap.generation;
      }
    }

    // Card pick events on timeline
    if (log.events) {
      const picks = log.events.filter((e) => e.type === 'card_click');
      for (const ev of picks) {
        const pct = Math.round(((ev.time - firstTime) / duration) * 100);
        if (pct >= 0 && pct <= 100) {
          html += '<div class="tl-event" style="left:' + pct + '%" title="' + escHtml(ev.card) + '"></div>';
        }
      }
    }

    html += '<div class="tl-line"></div>';
    html += '</div>';
  }

  detail.innerHTML = html;
}

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

    // Aggregate stats
    let totalGames = logs.length;
    let totalGens = 0;
    let gensCount = 0;
    const cardPicks = {};    // card name → pick count
    const tierPicks = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    const corpUsage = {};    // corp name → count
    const contextCounts = { draft: 0, buy: 0, play: 0, corp_select: 0, prelude_select: 0 };

    for (const log of logs) {
      // Generation from last snapshot
      const lastSnap = log.snapshots && log.snapshots.length > 0
        ? log.snapshots[log.snapshots.length - 1] : null;
      if (lastSnap && lastSnap.generation) {
        totalGens += lastSnap.generation;
        gensCount++;
      }

      // Card events
      if (log.events) {
        for (const ev of log.events) {
          if (ev.type === 'card_click' && ev.card) {
            cardPicks[ev.card] = (cardPicks[ev.card] || 0) + 1;
            if (ev.context) contextCounts[ev.context] = (contextCounts[ev.context] || 0) + 1;

            // Tier distribution
            if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[ev.card]) {
              const tier = TM_RATINGS[ev.card].t;
              tierPicks[tier] = (tierPicks[tier] || 0) + 1;
            }
          }
        }
      }

      // Corp detection from last snapshot tableau
      if (lastSnap && lastSnap.myCards && lastSnap.myCards.tableau) {
        for (const cardName of lastSnap.myCards.tableau) {
          if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[cardName]) {
            // Rough heuristic: corps are usually first in tableau
            // We'll just track all played cards; top ones likely include corps
          }
        }
      }
    }

    let html = '';

    // Overview
    html += '<div class="stat-block">';
    html += '<h4>Обзор</h4>';
    html += '<div class="stat-row"><span>Игр записано</span><span class="stat-val">' + totalGames + '</span></div>';
    if (gensCount > 0) {
      html += '<div class="stat-row"><span>Средн. поколений</span><span class="stat-val">' + Math.round(totalGens / gensCount) + '</span></div>';
    }
    const totalPicks = Object.values(cardPicks).reduce((a, b) => a + b, 0);
    html += '<div class="stat-row"><span>Всего карт выбрано</span><span class="stat-val">' + totalPicks + '</span></div>';
    html += '</div>';

    // Tier distribution of picks
    const maxTierPick = Math.max(...Object.values(tierPicks), 1);
    html += '<div class="stat-block">';
    html += '<h4>Распределение по тирам</h4>';
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) {
      if (tierPicks[t] > 0) {
        const pct = Math.round((tierPicks[t] / maxTierPick) * 100);
        html += '<div class="stat-bar-wrap">';
        html += '<span class="stat-bar-label">' + t + '-тир</span>';
        html += '<div class="stat-bar"><div class="stat-bar-fill tier-' + t + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="stat-bar-num">' + tierPicks[t] + '</span>';
        html += '</div>';
      }
    }
    html += '</div>';

    // Most picked cards
    const topCards = Object.entries(cardPicks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (topCards.length > 0) {
      const maxPick = topCards[0][1];
      html += '<div class="stat-block">';
      html += '<h4>Самые выбираемые</h4>';
      for (const [name, count] of topCards) {
        const pct = Math.round((count / maxPick) * 100);
        let tierClass = '';
        if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) {
          tierClass = ' tier-' + TM_RATINGS[name].t;
        }
        html += '<div class="stat-bar-wrap">';
        html += '<span class="stat-bar-label" title="' + escHtml(name) + '">' + escHtml(ruName(name)) + '</span>';
        html += '<div class="stat-bar"><div class="stat-bar-fill' + tierClass + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="stat-bar-num">' + count + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Context breakdown
    const contextTotal = Object.values(contextCounts).reduce((a, b) => a + b, 0);
    if (contextTotal > 0) {
      html += '<div class="stat-block">';
      html += '<h4>Контекст выбора</h4>';
      for (const [ctx, count] of Object.entries(contextCounts).sort((a, b) => b[1] - a[1])) {
        if (count > 0) {
          html += '<div class="stat-row"><span>' + ctx + '</span><span class="stat-val">' + count + '</span></div>';
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
