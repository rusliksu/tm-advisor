// TM Tier Overlay — Popup Logic

var ruName = TM_UTILS.ruName;
var POPUP_VERSION = chrome.runtime.getManifest().version;

const toggleEnabled = document.getElementById('toggle-enabled');
const toggleDebug = document.getElementById('toggle-debug');
const toggleAdvisor = document.getElementById('toggle-advisor');
const info = document.getElementById('info');
const tierBtns = document.querySelectorAll('.tier-btn');

const defaultFilter = { S: true, A: true, B: true, C: true, D: true, F: true };
const IMPORTABLE_SETTINGS_KEYS = new Set([
  'enabled',
  'tierFilter',
  'panel_debug',
  'advisor_enabled',
  'panel_min_state',
  'tm_elo_data',
  'tm_create_game_settings',
]);
// Variant data loaded from data/card_variants.js (TM_VARIANT_RATING_OVERRIDES)
const VARIANT_RATING_OVERRIDES = (typeof TM_VARIANT_RATING_OVERRIDES !== 'undefined') ? TM_VARIANT_RATING_OVERRIDES : {};

// baseCardName from data/card_variants.js (tmBaseCardName)
const baseCardName = (typeof tmBaseCardName !== 'undefined') ? tmBaseCardName : (n) => n;

function getRatingKeyByCardName(name) {
  if (!name || typeof TM_RATINGS === 'undefined') return null;
  if (TM_RATINGS[name]) return name;
  const base = baseCardName(name);
  return TM_RATINGS[base] ? base : null;
}

function getRatingByCardName(name) {
  const key = getRatingKeyByCardName(name);
  if (!key) return null;
  const base = baseCardName(key);
  const baseRating = TM_RATINGS[key] || TM_RATINGS[base] || null;
  const override = VARIANT_RATING_OVERRIDES[key];
  return override ? Object.assign({}, baseRating || {}, override) : baseRating;
}

const TM_RATINGS_RAW = (typeof window.TM_RATINGS !== 'undefined') ? window.TM_RATINGS : {};
var TM_RATINGS = new Proxy(TM_RATINGS_RAW, {
  get(target, prop, receiver) {
    if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
    if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
    const key = getRatingKeyByCardName(prop);
    return key ? target[key] : undefined;
  }
});

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
  { enabled: true, tierFilter: defaultFilter, panel_debug: false, advisor_enabled: true },
  (s) => {
    toggleEnabled.checked = s.enabled;
    toggleDebug.checked = s.panel_debug;
    toggleAdvisor.checked = s.advisor_enabled;

    tierBtns.forEach((btn) => {
      const tier = btn.getAttribute('data-tier');
      if (s.tierFilter[tier] === false) btn.classList.add('off');
    });
  }
);

// Card count
if (typeof TM_RATINGS !== 'undefined') {
  info.textContent = 'v' + POPUP_VERSION + ' \u2022 ' + Object.keys(TM_RATINGS).length + ' карт';
} else {
  info.textContent = 'v' + POPUP_VERSION;
}

// ── Toggle handlers ──

toggleEnabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggleEnabled.checked });
});

toggleDebug.addEventListener('change', () => {
  chrome.storage.local.set({ panel_debug: toggleDebug.checked });
});

toggleAdvisor.addEventListener('change', () => {
  chrome.storage.local.set({ advisor_enabled: toggleAdvisor.checked });
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
    let wins = 0;
    let totalVP = 0;
    let vpCount = 0;
    let draftBestTaken = 0;
    let draftTotalRounds = 0;
    const cardPicks = {};    // card name → pick count (drafted/bought/played)
    const tierPicks = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    const corpUsage = {};    // corp name → count
    const decisionCounts = { draft_pick: 0, card_buy: 0, card_play: 0, corp_select: 0, prelude_select: 0, or_choice: 0 };
    let totalDecisions = 0;

    for (const log of logs) {
      // v4 format: generations-based (current)
      if (log.version >= 4 && log.generations) {
        const gens = Object.keys(log.generations).map(Number);
        const maxGen = gens.length > 0 ? Math.max(...gens) : (log.endGen || 0);
        if (maxGen > 0) { totalGens += maxGen; gensCount++; }

        // Corp from myCorp or players
        if (log.myCorp) {
          corpUsage[log.myCorp] = (corpUsage[log.myCorp] || 0) + 1;
        } else if (log.players) {
          for (const p of log.players) {
            if (p.color === log.myColor && p.corp) {
              corpUsage[p.corp] = (corpUsage[p.corp] || 0) + 1;
            }
          }
        }

        // Process actions from each generation
        for (const genKey of gens) {
          const genData = log.generations[genKey];
          if (!genData || !genData.actions) continue;
          for (const act of genData.actions) {
            if (!act.type) continue;
            totalDecisions++;
            const et = act.type;
            if (decisionCounts[et] !== undefined) decisionCounts[et]++;
            else decisionCounts[et] = 1;

            // Collect card names
            const cards = [];
            if (act.card) cards.push(act.card);
            if (act.cards && Array.isArray(act.cards)) cards.push(...act.cards);
            if (act.picked && Array.isArray(act.picked)) cards.push(...act.picked);
            if (act.bought && Array.isArray(act.bought)) cards.push(...act.bought);
            if (act.selected && Array.isArray(act.selected)) cards.push(...act.selected);

            for (const name of cards) {
              cardPicks[name] = (cardPicks[name] || 0) + 1;
              const rating = getRatingByCardName(name);
              if (rating) {
                tierPicks[rating.t] = (tierPicks[rating.t] || 0) + 1;
              }
            }
          }
        }

        // Also count drafted cards from draftLog
        if (log.draftLog && Array.isArray(log.draftLog)) {
          for (const dr of log.draftLog) {
            if (dr.taken) {
              totalDecisions++;
              decisionCounts['draft_pick'] = (decisionCounts['draft_pick'] || 0) + 1;
              cardPicks[dr.taken] = (cardPicks[dr.taken] || 0) + 1;
              const takenRating = getRatingByCardName(dr.taken);
              if (takenRating) {
                tierPicks[takenRating.t] = (tierPicks[takenRating.t] || 0) + 1;
              }
            }
            // Draft accuracy: did player take the best-scored card?
            if (dr.offered && dr.offered.length > 0 && dr.taken) {
              draftTotalRounds++;
              const bestOffered = dr.offered.reduce((a, b) => (b.total || 0) > (a.total || 0) ? b : a, dr.offered[0]);
              if (bestOffered && bestOffered.name === dr.taken) draftBestTaken++;
            }
          }
        }

        // Win rate & VP from finalScores
        if (log.finalScores && log.myColor) {
          const myScore = log.finalScores[log.myColor];
          if (myScore && myScore.total > 0) {
            totalVP += myScore.total;
            vpCount++;
            const allScores = Object.values(log.finalScores).map(s => s.total || 0);
            if (myScore.total >= Math.max(...allScores)) wins++;
          }
        }
      }
      // v2 format: events-based (legacy)
      else if (log.version === 2 && log.events) {
        const maxGen = log.events.reduce((g, e) => (e.generation > g ? e.generation : g), 0);
        if (maxGen > 0) { totalGens += maxGen; gensCount++; }

        if (log.players) {
          for (const p of log.players) {
            if (p.color === log.myColor && p.corp) {
              corpUsage[p.corp] = (corpUsage[p.corp] || 0) + 1;
            }
          }
        }

        for (const ev of log.events) {
          if (ev.type === 'waiting_for' || ev.type === 'state_snapshot' || ev.type === 'final_state' || ev.type === 'game_end') continue;
          const et = ev.eventType;
          if (!et) continue;
          totalDecisions++;
          if (decisionCounts[et] !== undefined) decisionCounts[et]++;

          const cards = [];
          if (et === 'draft_pick' && ev.picked) cards.push(...ev.picked);
          if (et === 'card_buy' && ev.bought) cards.push(...ev.bought);
          if (et === 'card_play' && ev.card) cards.push(ev.card);
          if (et === 'corp_select' && ev.selected) cards.push(...ev.selected);
          if (et === 'prelude_select' && ev.selected) cards.push(...ev.selected);

          for (const name of cards) {
            cardPicks[name] = (cardPicks[name] || 0) + 1;
            const rating = getRatingByCardName(name);
            if (rating) {
              tierPicks[rating.t] = (tierPicks[rating.t] || 0) + 1;
            }
          }
        }
      }
      // v1 fallback
      else if (log.events) {
        const lastSnap = log.snapshots && log.snapshots.length > 0 ? log.snapshots[log.snapshots.length - 1] : null;
        if (lastSnap && lastSnap.generation) { totalGens += lastSnap.generation; gensCount++; }
        for (const ev of log.events) {
          if (ev.type === 'card_click' && ev.card) {
            cardPicks[ev.card] = (cardPicks[ev.card] || 0) + 1;
            totalDecisions++;
            const cardRating = getRatingByCardName(ev.card);
            if (cardRating) {
              tierPicks[cardRating.t] = (tierPicks[cardRating.t] || 0) + 1;
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
    if (vpCount > 0) {
      const winRate = Math.round(wins / totalGames * 100);
      const avgVP = Math.round(totalVP / vpCount);
      html += '<div class="stat-row"><span>Win rate</span><span class="stat-val">' + wins + '/' + totalGames + ' (' + winRate + '%)</span></div>';
      html += '<div class="stat-row"><span>Средний VP</span><span class="stat-val">' + avgVP + '</span></div>';
    }
    if (draftTotalRounds > 0) {
      const draftAcc = Math.round(draftBestTaken / draftTotalRounds * 100);
      html += '<div class="stat-row"><span>Draft accuracy</span><span class="stat-val">' + draftBestTaken + '/' + draftTotalRounds + ' (' + draftAcc + '%)</span></div>';
    }
    html += '</div>';

    // Corp usage
    const topCorps = Object.entries(corpUsage).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topCorps.length > 0) {
      const maxCorp = topCorps[0][1];
      html += '<div class="stat-block"><h4>Корпорации</h4>';
      for (const [name, count] of topCorps) {
        const pct = Math.round((count / maxCorp) * 100);
        let tierClass = '';
        const corpRating = getRatingByCardName(name);
        if (corpRating) tierClass = ' tier-' + corpRating.t;
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
        const pickRating = getRatingByCardName(name);
        if (pickRating) tierClass = ' tier-' + pickRating.t;
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

// ── Elo Tab ──

function renderLeaderboard(list, games, container, isVpMode) {
  if (list.length === 0) {
    container.innerHTML = '<div class="empty">Нет данных. Завершите игру — Elo обновится автоматически.</div>';
    return;
  }
  var modeLabel = isVpMode ? 'VP Margin' : 'Place';
  var html = '<div style="margin-bottom:8px;font-size:11px;color:#888">' +
    'Игр: ' + (games ? games.length : 0) + ' | Режим: ' + modeLabel + '</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="border-bottom:1px solid #ddd;font-weight:bold;color:#666">';
  html += '<td style="padding:3px">#</td><td>Игрок</td><td style="text-align:right">Elo</td>';
  html += '<td style="text-align:right">Игр</td><td style="text-align:right">Win%</td>';
  html += '<td style="text-align:right">VP</td><td>Корп</td></tr>';

  for (var i = 0; i < Math.min(list.length, 30); i++) {
    var p = list[i];
    var eloColor = p.elo >= 1600 ? '#2ecc71' : p.elo >= 1500 ? '#333' : '#e74c3c';
    var nameStyle = i < 3 ? 'font-weight:bold' : '';
    var medal = i === 0 ? '\uD83E\uDD47 ' : i === 1 ? '\uD83E\uDD48 ' : i === 2 ? '\uD83E\uDD49 ' : '';
    html += '<tr style="border-bottom:1px solid #f0f0f0">';
    html += '<td style="padding:3px;color:#888">' + (i + 1) + '</td>';
    html += '<td style="' + nameStyle + '">' + medal + escHtml(p.name) + '</td>';
    html += '<td style="text-align:right;color:' + eloColor + ';font-weight:bold">' + p.elo + '</td>';
    html += '<td style="text-align:right;color:#888">' + p.games + '</td>';
    html += '<td style="text-align:right">' + p.winRate + '%</td>';
    html += '<td style="text-align:right">' + p.avgVP + '</td>';
    html += '<td style="font-size:11px;color:#888;max-width:60px;overflow:hidden;text-overflow:ellipsis" title="' +
      escHtml(p.favCorp || '') + ' (' + (p.favCorpCount || 0) + 'x)">' +
      escHtml(p.favCorp ? p.favCorp.split(' ')[0] : '-') + '</td>';
    html += '</tr>';
  }
  html += '</table>';

  if (games && games.length > 0) {
    var recent = games.slice(-5).reverse();
    html += '<div style="margin-top:10px;font-size:11px"><b>Последние игры:</b></div>';
    for (var gi = 0; gi < recent.length; gi++) {
      var g = recent[gi];
      var date = g.date ? g.date.slice(0, 10) : '?';
      var results = (g.results || []).sort(function(a, b) { return a.place - b.place; });
      var resStr = results.map(function(r) {
        var sign = r.delta >= 0 ? '+' : '';
        return r.displayName + ' ' + sign + r.delta;
      }).join(', ');
      html += '<div style="font-size:11px;color:#666;margin:2px 0">' + date + ': ' + resStr + '</div>';
    }
  }
  container.innerHTML = html;
}

function loadElo() {
  var container = document.getElementById('elo-leaderboard');
  if (!container) return;
  if (typeof TM_ELO === 'undefined') {
    container.innerHTML = '<div class="empty">Elo модуль не загружен</div>';
    return;
  }
  var vpMode = document.getElementById('elo-vp-mode') && document.getElementById('elo-vp-mode').checked;
  TM_ELO.getLeaderboard(function(list, games) {
    // Sort by VP Elo if VP mode
    if (vpMode) {
      // Re-sort by elo_vp from raw data
      TM_ELO.loadData(function(raw) {
        var vpList = [];
        for (var key in raw.players) {
          var p = raw.players[key];
          if (p.games < 1) continue;
          var favCorp = '';
          var maxPlayed = 0;
          for (var corp in p.corps) {
            if (p.corps[corp] > maxPlayed) { maxPlayed = p.corps[corp]; favCorp = corp; }
          }
          vpList.push({
            name: p.displayName || key,
            elo: p.elo_vp || p.elo || 1500,
            eloPlace: p.elo || 1500,
            games: p.games, wins: p.wins,
            winRate: p.games > 0 ? Math.round(p.wins / p.games * 100) : 0,
            avgVP: p.games > 0 ? Math.round((p.totalVP || 0) / p.games) : 0,
            favCorp: favCorp, favCorpCount: maxPlayed,
          });
        }
        vpList.sort(function(a, b) { return b.elo - a.elo; });
        renderLeaderboard(vpList, games, container, true);
      });
      return;
    }
    renderLeaderboard(list, games, container, false);
  });
}

document.querySelector('[data-tab="elo"]').addEventListener('click', loadElo);

// VP mode toggle
document.getElementById('elo-vp-mode').addEventListener('change', loadElo);

// Import Elo data
document.getElementById('elo-import-btn').addEventListener('click', () => {
  document.getElementById('elo-import-file').click();
});
document.getElementById('elo-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (typeof TM_ELO !== 'undefined' && TM_ELO.importData) {
        TM_ELO.importData(data, () => {
          alert('Elo data imported! ' + (data.games ? data.games.length : 0) + ' games.');
          loadElo();
        });
      }
    } catch(err) {
      alert('Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

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
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid settings object');
      }
      const data = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (IMPORTABLE_SETTINGS_KEYS.has(key)) {
          data[key] = value;
        }
      }
      if (Object.keys(data).length === 0) {
        alert('В файле нет поддерживаемых настроек для импорта');
        return;
      }
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

