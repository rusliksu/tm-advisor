// TM Tier Overlay — Popup Logic

var ruName = TM_UTILS.ruName;
var POPUP_VERSION = chrome.runtime.getManifest().version;

const toggleEnabled = document.getElementById('toggle-enabled');
const toggleAdvisor = document.getElementById('toggle-advisor');
const info = document.getElementById('info');
const tierBtns = document.querySelectorAll('.tier-btn');

const defaultFilter = { S: true, A: true, B: true, C: true, D: true, F: true };
const IMPORTABLE_SETTINGS_KEYS = new Set([
  'enabled',
  'tierFilter',
  'advisor_enabled',
  'panel_min_state',
  'tm_create_game_settings',
]);
// Variant data loaded from data/card_variants.js (TM_VARIANT_RATING_OVERRIDES)
const VARIANT_RATING_OVERRIDES = (typeof TM_VARIANT_RATING_OVERRIDES !== 'undefined') ? TM_VARIANT_RATING_OVERRIDES : {};

// baseCardName from data/card_variants.js (tmBaseCardName)
const baseCardName = (typeof tmBaseCardName !== 'undefined') ? tmBaseCardName : (n) => n;

function normalizedPlaceScore(place, playerCount) {
  if (playerCount <= 1) return 1;
  return Math.max(0, Math.min(1, 1 - ((place - 1) / (playerCount - 1))));
}

function formatAvgPlaceScore(value) {
  if (typeof value !== 'number' || !isFinite(value)) return '-';
  return value.toFixed(2);
}

function getRatingKeyByCardName(name) {
  if (!name || typeof popupRatings === 'undefined') return null;
  if (popupRatings[name]) return name;
  const base = baseCardName(name);
  return popupRatings[base] ? base : null;
}

function getRatingByCardName(name) {
  const key = getRatingKeyByCardName(name);
  if (!key) return null;
  const base = baseCardName(key);
  const baseRating = popupRatings[key] || popupRatings[base] || null;
  const override = VARIANT_RATING_OVERRIDES[key];
  return override ? Object.assign({}, baseRating || {}, override) : baseRating;
}

const TM_RATINGS_RAW = (typeof window.TM_RATINGS !== 'undefined') ? window.TM_RATINGS : {};
const popupRatings = new Proxy(TM_RATINGS_RAW, {
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
  { enabled: true, tierFilter: defaultFilter, advisor_enabled: true },
  (s) => {
    toggleEnabled.checked = s.enabled;
    toggleAdvisor.checked = s.advisor_enabled;

    tierBtns.forEach((btn) => {
      const tier = btn.getAttribute('data-tier');
      if (s.tierFilter[tier] === false) btn.classList.add('off');
    });
  }
);

// Card count
if (typeof popupRatings !== 'undefined') {
  info.textContent = 'v' + POPUP_VERSION + ' \u2022 ' + Object.keys(TM_RATINGS_RAW).length + ' карт';
} else {
  info.textContent = 'v' + POPUP_VERSION;
}

// ── Toggle handlers ──

toggleEnabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggleEnabled.checked });
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
    let placeScoreSum = 0;
    let placeScoreGames = 0;
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

        // Placement score & VP from finalScores
        if (log.finalScores && log.myColor) {
          const myScore = log.finalScores[log.myColor];
          if (myScore && myScore.total > 0) {
            totalVP += myScore.total;
            vpCount++;
            const ranked = Object.entries(log.finalScores)
              .map(([color, score]) => ({ color, total: (score && score.total) || 0 }))
              .sort((a, b) => b.total - a.total);
            for (let idx = 0; idx < ranked.length; idx++) {
              ranked[idx].place = idx > 0 && ranked[idx - 1].total === ranked[idx].total
                ? ranked[idx - 1].place
                : idx + 1;
            }
            const myEntry = ranked.find((entry) => entry.color === log.myColor);
            const myPlace = myEntry ? myEntry.place : ranked.length;
            placeScoreSum += normalizedPlaceScore(myPlace, ranked.length);
            placeScoreGames++;
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
      const avgVP = Math.round(totalVP / vpCount);
      if (placeScoreGames > 0) {
        html += '<div class="stat-row"><span>Avg place</span><span class="stat-val">' + formatAvgPlaceScore(placeScoreSum / placeScoreGames) + '</span></div>';
      }
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
