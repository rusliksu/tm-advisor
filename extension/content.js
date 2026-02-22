// TM Tier Overlay — Content Script v2.0
// Full feature set: badges, tooltips, combos, dimming, draft summary, corp synergy,
// search, M/A advisor, recommendations, opponent intel, hand sort, toasts,
// dynamic value calc, milestone race, card comparison, income projection,
// card pool tracker, play order advisor, tag counter, draft filter,
// generation timer, VP tracker, global parameters HUD,
// panel persistence, buying power, standard projects, settings import/export

(function () {
  'use strict';

  let enabled = true;
  let showRu = false;

  // Safe chrome.storage wrapper — prevents "Extension context invalidated" errors
  function safeStorage(fn) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
        fn(chrome.storage);
      }
    } catch (e) { /* extension context invalidated */ }
  }
  let tierFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

  // Panel state keys for persistence
  const PANEL_DEFAULTS = {
    enabled: true, tierFilter: tierFilter,
    panel_advisor: false, panel_opp: false, panel_income: false,
    panel_pool: false, panel_playorder: false, panel_tags: false,
    panel_vp: false, panel_globals: false,
    panel_playable: false, panel_turmoil: false,
  };

  function savePanelState() {
    safeStorage((s) => s.local.set({
      panel_advisor: advisorVisible, panel_opp: oppTrackerVisible,
      panel_income: incomeVisible, panel_pool: poolVisible,
      panel_playorder: playOrderVisible, panel_tags: tagCounterVisible,
      panel_vp: vpVisible, panel_globals: globalsVisible,
      panel_playable: playableVisible, panel_turmoil: turmoilVisible,
    }));
  }

  // ── Panel minimize state ──
  var panelMinState = {}; // panelId → boolean
  function minBtn(panelId) {
    var sym = panelMinState[panelId] ? '▼' : '▲';
    return '<button class="tm-minimize-btn" data-minimize="' + panelId + '" title="Свернуть/развернуть">' + sym + '</button>';
  }
  function applyMinState(el, panelId) {
    if (!el) return;
    if (panelMinState[panelId]) el.classList.add('tm-panel-minimized');
    else el.classList.remove('tm-panel-minimized');
  }
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-minimize]');
    if (!btn) return;
    var id = btn.getAttribute('data-minimize');
    panelMinState[id] = !panelMinState[id];
    var panel = btn.closest('.tm-advisor-panel,.tm-opp-tracker,.tm-globals-panel,.tm-vp-panel,.tm-turmoil-panel,.tm-colony-panel,.tm-log-panel');
    if (panel) {
      panel.classList.toggle('tm-panel-minimized');
      btn.textContent = panelMinState[id] ? '▼' : '▲';
    }
  });

  // Load settings
  safeStorage((s) => {
    s.local.get(PANEL_DEFAULTS, (r) => {
      enabled = r.enabled;
      tierFilter = r.tierFilter;
      // Restore panel states
      advisorVisible = r.panel_advisor;
      oppTrackerVisible = r.panel_opp;
      incomeVisible = r.panel_income;
      poolVisible = r.panel_pool;
      playOrderVisible = r.panel_playorder;
      tagCounterVisible = r.panel_tags;
      vpVisible = r.panel_vp;
      globalsVisible = r.panel_globals;
      playableVisible = r.panel_playable;
      turmoilVisible = r.panel_turmoil;
      loadSeenCards();
      if (enabled) processAll();
    });

    s.onChanged.addListener((changes) => {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
        enabled ? processAll() : removeAll();
      }
      if (changes.tierFilter) {
        tierFilter = changes.tierFilter.newValue;
        reapplyFilter();
      }
    });
  });

  // Kebab lookup: "arctic-algae" → "Arctic Algae"
  const kebabLookup = {};
  // Lowercase lookup: "arctic algae" → "Arctic Algae" (for log matching)
  const lowerLookup = {};
  for (const name in TM_RATINGS) {
    kebabLookup[name.toLowerCase().replace(/ /g, '-')] = name;
    lowerLookup[name.toLowerCase()] = name;
  }

  // Russian display name: always prefer Russian, fallback to English
  function ruName(engName) {
    if (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[engName]) {
      return TM_NAMES_RU[engName];
    }
    return engName;
  }

  // Combo rating colors
  const COMBO_COLORS = {
    godmode: { bg: 'rgba(231,76,60,0.92)', border: '#e74c3c' },
    great:   { bg: 'rgba(243,156,18,0.92)', border: '#f39c12' },
    good:    { bg: 'rgba(46,204,113,0.92)', border: '#2ecc71' },
    decent:  { bg: 'rgba(52,152,219,0.92)', border: '#3498db' },
    niche:   { bg: 'rgba(149,165,166,0.85)', border: '#95a5a6' },
  };

  // ── Card name extraction ──

  function getCardName(cardEl) {
    for (const cls of cardEl.classList) {
      if (
        cls.startsWith('card-') &&
        cls !== 'card-container' &&
        cls !== 'card-unavailable' &&
        cls !== 'card-standard-project' &&
        cls !== 'card-hide'
      ) {
        const kebab = cls.slice(5);
        if (kebabLookup[kebab]) return kebabLookup[kebab];
      }
    }

    const titleEl = cardEl.querySelector('.card-title');
    if (titleEl) {
      const textEls = titleEl.querySelectorAll(
        'div:not(.prelude-label):not(.corporation-label):not(.ceo-label)'
      );
      for (const el of textEls) {
        const text = el.textContent.trim().split(':')[0].trim();
        if (text && TM_RATINGS[text]) return text;
      }
      const directText = titleEl.textContent.trim().split(':')[0].trim();
      if (directText && TM_RATINGS[directText]) return directText;
    }
    return null;
  }

  // ── Badge injection ──

  function injectBadge(cardEl) {
    if (cardEl.querySelector('.tm-tier-badge')) return;

    const name = getCardName(cardEl);
    if (!name || !TM_RATINGS[name]) return;

    const data = TM_RATINGS[name];
    const { s, t } = data;
    if (!t || s == null) return;
    const visible = tierFilter[t] !== false;

    const badge = document.createElement('div');
    badge.className = 'tm-tier-badge tm-tier-' + t;
    badge.textContent = t + ' ' + s;
    if (!visible) badge.style.display = 'none';

    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', (e) => {
      if (e.ctrlKey) { e.stopPropagation(); addToCompare(name); }
    });

    cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
    cardEl.setAttribute('data-tm-card', name);
    cardEl.setAttribute('data-tm-tier', t);

    // Tooltip on entire card hover
    if (!cardEl.hasAttribute('data-tm-tip')) {
      cardEl.setAttribute('data-tm-tip', '1');
      cardEl.addEventListener('mouseenter', (e) => showTooltip(e, name, data));
      cardEl.addEventListener('mouseleave', hideTooltip);
    }

    if (t === 'D' || t === 'F') {
      cardEl.classList.add('tm-dim');
    }
  }

  // ── Tooltip panel ──

  let tooltipEl = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tm-tooltip-panel';
    document.body.appendChild(tooltipEl);
    // No mouseenter/mouseleave on tooltip — disappears instantly when leaving card
    return tooltipEl;
  }

  function showTooltip(e, name, data) {
    const tip = ensureTooltip();
    const cardEl = e.target.closest('.card-container');

    // === 1. Header: score + cost + name ===
    var tipReasons = cardEl ? (cardEl.getAttribute('data-tm-reasons') || '') : '';
    var ctxScore = data.s;
    var ctxTier = data.t;
    if (tipReasons && cardEl) {
      var tipBadge = cardEl.querySelector('.tm-tier-badge');
      if (tipBadge && tipBadge.textContent) {
        var bMatch = tipBadge.textContent.match(/[A-Z]\s*(\d+)/g);
        if (bMatch && bMatch.length >= 2) {
          ctxScore = parseInt(bMatch[bMatch.length - 1].replace(/[A-Z]\s*/, '')) || data.s;
          ctxTier = scoreToTier(ctxScore);
        }
      }
    }

    let html = '<div class="tm-tip-header">';
    if (ctxScore !== data.s) {
      var ctxDelta = ctxScore - data.s;
      html += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + data.s + '</span>';
      html += '<span style="color:#aaa;margin:0 3px">\u2192</span>';
      html += '<span class="tm-tip-tier tm-tier-' + ctxTier + '">' + ctxTier + ctxScore + '</span>';
      html += '<span style="color:' + (ctxDelta > 0 ? '#4caf50' : '#f44336') + ';font-weight:bold;margin-left:4px">' + (ctxDelta > 0 ? '+' : '') + ctxDelta + '</span> ';
    } else {
      html += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + ' ' + data.s + '</span> ';
    }
    // Cost with effective cost
    if (cardEl) {
      const costEl = cardEl.querySelector('.card-number, .card-cost');
      if (costEl) {
        const cost = parseInt(costEl.textContent);
        if (!isNaN(cost)) {
          html += '<span class="tm-tip-cost">' + cost + ' MC</span> ';
        }
      }
    }
    html += '<span class="tm-tip-name">' + escHtml(name) + '</span>';
    if (ruName(name) !== name) html += '<br><span class="tm-tip-ru">' + escHtml(ruName(name)) + '</span>';
    html += '</div>';

    // === 2. Context reasons (compact one-liner) ===
    if (tipReasons) {
      html += '<div class="tm-tip-row" style="font-size:13px;color:#4caf50;border-bottom:1px solid #333;padding-bottom:3px;margin-bottom:3px">';
      html += escHtml(tipReasons.replace(/\|/g, ' \u2022 '));
      html += '</div>';
    }

    // === 3. ROI line ===
    {
      const ctx0 = getCachedPlayerContext();
      const fx0 = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[name] : null;
      if (fx0 && ctx0) {
        var mcVal = computeCardValue(fx0, ctx0.gensLeft);
        var totalCost0 = (fx0.c || 0) + 3;
        var roi0 = mcVal - totalCost0;
        var roiColor = roi0 >= 10 ? '#2ecc71' : roi0 >= 0 ? '#f1c40f' : '#e74c3c';
        html += '<div class="tm-tip-row" style="font-size:13px;border-bottom:1px solid #333;padding-bottom:3px;margin-bottom:3px">';
        html += 'Ценность ' + Math.round(mcVal) + ' \u2212 Стоим. ' + totalCost0 + ' = <span style="color:' + roiColor + '"><b>' + (roi0 >= 0 ? '+' : '') + Math.round(roi0) + ' MC</b></span>';
        html += '</div>';
      }
    }

    // === 3b. Card analysis (economy + timing) ===
    if (data.e) {
      html += '<div class="tm-tip-row" style="font-size:13px;color:#ccc">' + escHtml(data.e) + '</div>';
    }
    if (data.w) {
      html += '<div class="tm-tip-row" style="font-size:13px;color:#aaa">' + escHtml(data.w) + '</div>';
    }

    // === 4. Synergies (compact: corp + hand combos + key synergies) ===
    {
      const myCorpsTip = detectMyCorps();
      const synParts = [];
      // Corp synergy — check ALL corps
      for (var tci = 0; tci < myCorpsTip.length; tci++) {
        var tipCorp = myCorpsTip[tci];
        if (data.y && data.y.some(function(syn) { return syn === tipCorp; })) {
          synParts.push('\u2605 ' + escHtml(tipCorp));
        }
      }
      // Hand card combos
      const handNames = getMyHandNames();
      if (handNames.length > 0 && data.y) {
        for (const hName of handNames) {
          if (hName === name) continue;
          const hData = TM_RATINGS[hName];
          const thisMentions = data.y.some(function(s) { return s.toLowerCase().includes(hName.toLowerCase()); });
          const handMentions = hData && hData.y && hData.y.some(function(s) { return s.toLowerCase().includes(name.toLowerCase()); });
          if (thisMentions || handMentions) synParts.push('\uD83D\uDD17 ' + escHtml(hName));
        }
      }
      // Other synergies (max 3, skip already shown + skip taken milestones)
      if (data.y && data.y.length && data.y[0] !== 'None significant') {
        // Build set of taken/full milestones
        var _claimedMs = new Set();
        var _msAllFull = false;
        var _pvMs = getPlayerVueData();
        if (_pvMs && _pvMs.game && _pvMs.game.milestones) {
          var _claimedCount = 0;
          for (var _mi = 0; _mi < _pvMs.game.milestones.length; _mi++) {
            var _ms = _pvMs.game.milestones[_mi];
            if (_ms.playerName || _ms.color) {
              _claimedMs.add((_ms.name || '').toLowerCase());
              _claimedCount++;
            }
          }
          _msAllFull = _claimedCount >= 3;
        }
        let shown = 0;
        for (const syn of data.y) {
          if (shown >= 3) break;
          if (myCorpsTip.indexOf(syn) !== -1) continue;
          if (handNames.some(function(h) { return syn.toLowerCase().includes(h.toLowerCase()); })) continue;
          // Skip milestone synergies if all milestones taken or specific milestone already claimed
          if (/вэха|milestone/i.test(syn)) {
            if (_msAllFull) continue;
            var msNameMatch = syn.match(/(?:вэха|milestone)\s+(.+)/i);
            if (msNameMatch && _claimedMs.has(msNameMatch[1].toLowerCase().trim())) continue;
          }
          synParts.push(escHtml(syn));
          shown++;
        }
      }
      if (synParts.length > 0) {
        html += '<div class="tm-tip-row" style="font-size:13px">' + synParts.join(', ') + '</div>';
      }
    }

    // === 6. Triggers from my tableau (compact) ===
    if (cardEl) {
      const tags = getCardTags(cardEl);
      if (tags.size > 0) {
        const triggerHits = [];
        const myTableauNames2 = [];
        const pv2 = getPlayerVueData();
        if (pv2 && pv2.thisPlayer && pv2.thisPlayer.tableau) {
          for (const c of pv2.thisPlayer.tableau) myTableauNames2.push(c.name || c);
        }
        const corpsForTrig = detectMyCorps();
        for (var cft = 0; cft < corpsForTrig.length; cft++) {
          if (corpsForTrig[cft]) myTableauNames2.push(corpsForTrig[cft]);
        }
        for (const tName of myTableauNames2) {
          const trigs = TAG_TRIGGERS[tName];
          if (!trigs) continue;
          for (const tr of trigs) {
            for (const tag of tags) {
              if (tr.tags.includes(tag.toLowerCase())) {
                triggerHits.push(tr.desc);
                break;
              }
            }
          }
        }
        if (triggerHits.length > 0) {
          html += '<div class="tm-tip-row" style="font-size:13px;color:#2ecc71">\u26A1 ' + triggerHits.map(escHtml).join(', ') + '</div>';
        }
      }
    }

    // === 7. Requirements check (only if unmet) ===
    if (cardEl) {
      const pv = getPlayerVueData();
      if (pv && pv.game) {
        const reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
        if (reqEl) {
          const reqText = (reqEl.textContent || '').trim();
          const checks = [];
          const gp = pv.game;
          const tempMatch = reqText.match(/([\-\d]+)\s*°?C/i);
          const oxyMatch = reqText.match(/(\d+)\s*%?\s*O/i);
          const oceanMatch = reqText.match(/(\d+)\s*ocean/i);
          const venusMatch = reqText.match(/(\d+)\s*%?\s*Venus/i);
          const isMax = /max/i.test(reqText);

          if (tempMatch && typeof gp.temperature === 'number') {
            const rv = parseInt(tempMatch[1]); const met = isMax ? gp.temperature <= rv : gp.temperature >= rv;
            if (!met) checks.push('Темп ' + gp.temperature + '°C/' + rv + '°C');
          }
          if (oxyMatch && typeof gp.oxygenLevel === 'number') {
            const rv = parseInt(oxyMatch[1]); const met = isMax ? gp.oxygenLevel <= rv : gp.oxygenLevel >= rv;
            if (!met) checks.push('O\u2082 ' + gp.oxygenLevel + '%/' + rv + '%');
          }
          if (oceanMatch && typeof gp.oceans === 'number') {
            const rv = parseInt(oceanMatch[1]); const met = isMax ? gp.oceans <= rv : gp.oceans >= rv;
            if (!met) checks.push('Океаны ' + gp.oceans + '/' + rv);
          }
          if (venusMatch && typeof gp.venusScaleLevel === 'number') {
            const rv = parseInt(venusMatch[1]); const met = isMax ? gp.venusScaleLevel <= rv : gp.venusScaleLevel >= rv;
            if (!met) checks.push('Венера ' + gp.venusScaleLevel + '%/' + rv + '%');
          }
          if (checks.length > 0) {
            html += '<div class="tm-tip-row" style="color:#f44336;font-size:13px">\u2717 ' + checks.join(' | ') + '</div>';
          }
        }
      }
    }

    // === 8. 3P take-that warning ===
    if (TAKE_THAT_CARDS[name]) {
      html += '<div class="tm-tip-row" style="color:#f39c12;font-size:13px">\u26A0 3P: ' + escHtml(TAKE_THAT_CARDS[name]) + '</div>';
    }

    // === 9. Combo (from card attribute) ===
    if (cardEl && cardEl.getAttribute('data-tm-combo')) {
      html += '<div class="tm-tip-row" style="color:#f1c40f;font-size:13px">\uD83D\uDD17 ' + escHtml(cardEl.getAttribute('data-tm-combo')) + '</div>';
    }

    // === 10. Anti-combo / conflict ===
    if (cardEl && cardEl.getAttribute('data-tm-anti-combo')) {
      html += '<div class="tm-tip-row" style="color:#e74c3c;font-size:13px">\u26A0 Конфликт: ' + escHtml(cardEl.getAttribute('data-tm-anti-combo')) + '</div>';
    }

    tip.innerHTML = html;
    tip.style.display = 'block';

    // Position near the card
    const srcEl = (cardEl) || e.currentTarget;
    if (srcEl) {
      const rect = srcEl.getBoundingClientRect();
      const tipW = tip.offsetWidth || 400;
      const tipH = tip.offsetHeight || 300;

      let left = rect.right + 10;
      let top = rect.top;

      // If goes off right edge, show on left side of card
      if (left + tipW > window.innerWidth - 8) {
        left = rect.left - tipW - 10;
      }
      // If still off-screen (left), pin to left edge
      if (left < 8) left = 8;

      // If goes off bottom, adjust up
      if (top + tipH > window.innerHeight - 8) {
        top = window.innerHeight - tipH - 8;
      }
      if (top < 8) top = 8;

      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function escHtml(s) {
    const d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Generation detection & dynamic value ──

  let cachedGen = 1;
  let genCacheTime = 0;

  function detectGeneration() {
    if (Date.now() - genCacheTime < 2000) return cachedGen;
    genCacheTime = Date.now();

    // Try Vue data first
    const pv = getPlayerVueData();
    if (pv && pv.game && pv.game.generation) {
      cachedGen = pv.game.generation;
      return cachedGen;
    }

    // Fallback: DOM
    const genEl = document.querySelector('.gen_marker.active, .log-gen-num.active');
    if (genEl) {
      const n = parseInt(genEl.textContent);
      if (n > 0) cachedGen = n;
    }
    return cachedGen;
  }

  // MC value multipliers by generation (avg game ~9 gens)
  // Based on CLAUDE.md formulas
  function getValueMultipliers(gen) {
    const gensLeft = Math.max(1, 9 - gen);
    return {
      mcProd: Math.min(6, gensLeft * 0.9),    // MC-prod worth ~0.9 MC per gen remaining
      steelProd: Math.min(9, gensLeft * 1.3),
      tiProd: Math.min(14, gensLeft * 2.0),
      plantProd: Math.min(9, gensLeft * 1.3),
      energyProd: Math.min(8, gensLeft * 1.1),
      heatProd: Math.min(5, gensLeft * 0.6),
      tr: 7 + (gen > 6 ? 1 : 0),              // TR=7-8 MC
      vp: 1 + (gen - 1) * 0.875,               // VP scales from 1 to ~8 MC over 9 gens
      card: 3.5,                                // card draw ~ 3-4 MC always
    };
  }

  // ── For The Nerd value table (gensLeft → [tr, prod, vp] in MC) ──

  const FTN_TABLE = {
    0:  [8.0, 0.0, 8.0],
    1:  [8.0, 0.5, 7.5],
    2:  [8.0, 1.2, 6.8],
    3:  [8.0, 2.0, 6.0],
    4:  [7.9, 2.9, 5.0],
    5:  [7.8, 3.9, 3.9],
    6:  [7.6, 4.8, 2.8],
    7:  [7.4, 5.4, 2.0],
    8:  [7.2, 5.6, 1.6],
    9:  [7.1, 5.7, 1.4],
    10: [7.0, 5.8, 1.2],
    11: [7.0, 5.9, 1.1],
    12: [7.0, 6.0, 1.0],
    13: [7.0, 6.0, 1.0],
  };

  // Resource production multipliers (relative to MC-prod)
  const PROD_MUL = { mp: 1, sp: 1.6, tp: 2.5, pp: 1.6, ep: 1.5, hp: 0.8 };
  // Immediate resource values (MC per unit)
  const RES_VAL = { mc: 1, st: 2, ti: 3, pl: 1.6, he: 0.5, en: 1, cd: 3 };

  function computeCardValue(fx, gensLeft) {
    const gl = Math.max(0, Math.min(13, gensLeft));
    const row = FTN_TABLE[gl];
    const trVal = row[0];
    const prod = row[1];
    const vpVal = row[2];

    let v = 0;

    // Production
    for (const k of ['mp', 'sp', 'tp', 'pp', 'ep', 'hp']) {
      if (fx[k]) v += fx[k] * prod * PROD_MUL[k];
    }

    // Immediate resources
    for (const k of ['mc', 'st', 'ti', 'pl', 'he', 'en', 'cd']) {
      if (fx[k]) v += fx[k] * RES_VAL[k];
    }

    // TR
    if (fx.tr) v += fx.tr * trVal;

    // VP
    if (fx.vp) v += fx.vp * vpVal;

    // Global param raises
    if (fx.tmp) v += fx.tmp * trVal;
    if (fx.o2) v += fx.o2 * trVal;
    if (fx.oc) v += fx.oc * (trVal + 3);  // ocean = TR + placement bonus
    if (fx.vn) v += fx.vn * trVal;

    // Tiles
    if (fx.grn) v += fx.grn * (trVal + vpVal + 3);  // greenery = O2 TR + 1VP + placement bonus
    if (fx.city) v += fx.city * (3 + vpVal * 2);     // city = placement bonus + ~2VP adjacency

    // Take-that (halved for 3P — benefits third player)
    if (fx.rmPl) v += fx.rmPl * 1.6 * 0.5;
    if (fx.pOpp) v += Math.abs(fx.pOpp) * prod * 0.5;

    // VP accumulator (action: add resource, 1VP per N — VP realized at game end = 8 MC)
    if (fx.vpAcc) v += fx.vpAcc * gl * 8 / Math.max(1, fx.vpPer || 1);

    // Blue action cards
    if (fx.actMC) v += fx.actMC * gl;
    if (fx.actTR) v += fx.actTR * gl * trVal;
    if (fx.actOc) v += fx.actOc * gl * (trVal + 4);  // action: ocean = TR + placement (~4 MC, ~11 total)
    if (fx.actCD) v += fx.actCD * gl * 3;

    return v;
  }

  // ── Corp synergy detection (Two Corps support) ──

  let cachedCorp = null;
  let cachedCorps = null;
  let corpCacheTime = 0;

  function detectMyCorps() {
    if (Date.now() - corpCacheTime < 3000 && cachedCorps !== null) return cachedCorps;
    corpCacheTime = Date.now();

    var corps = [];
    var myCards = document.querySelectorAll(
      '.player_home_block--cards .card-container[data-tm-card]'
    );

    // DOM detection: .is-corporation or .card-corporation-logo
    for (var i = 0; i < myCards.length; i++) {
      var el = myCards[i];
      var name = el.getAttribute('data-tm-card');
      if (!name) continue;
      var corpTitle = el.querySelector('.card-title.is-corporation, .card-corporation-logo');
      if (corpTitle && corps.indexOf(name) === -1) corps.push(name);
    }

    // Fallback: corporation-label
    if (corps.length === 0) {
      for (var j = 0; j < myCards.length; j++) {
        var el2 = myCards[j];
        var name2 = el2.getAttribute('data-tm-card');
        if (!name2) continue;
        var corpLabel = el2.querySelector('.corporation-label');
        if (corpLabel && corps.indexOf(name2) === -1) corps.push(name2);
      }
    }

    // Fallback: check TAG_TRIGGERS/CORP_DISCOUNTS/CORP_ABILITY_SYNERGY for tableau cards
    if (corps.length === 0) {
      var pv = getPlayerVueData();
      if (pv && pv.thisPlayer && pv.thisPlayer.tableau) {
        for (var k = 0; k < pv.thisPlayer.tableau.length; k++) {
          var cn = pv.thisPlayer.tableau[k].name || pv.thisPlayer.tableau[k];
          if (cn === 'Merger') continue; // Merger is a prelude, not a corp
          if (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn] || CORP_ABILITY_SYNERGY[cn]) {
            if (corps.indexOf(cn) === -1) corps.push(cn);
          }
        }
      }
    }

    cachedCorps = corps;
    cachedCorp = corps.length > 0 ? corps[0] : '';
    return cachedCorps;
  }

  function detectMyCorp() {
    detectMyCorps();
    return cachedCorp;
  }

  // Cached player context (light version for tag synergies)
  let cachedCtx = null;
  let ctxCacheTime = 0;

  function getCachedPlayerContext() {
    if (Date.now() - ctxCacheTime < 3000 && cachedCtx !== null) return cachedCtx;
    ctxCacheTime = Date.now();
    cachedCtx = getPlayerContext();
    return cachedCtx;
  }

  /**
   * Highlight cards that synergize with the player's corporation
   * + Tag-based soft synergies via TAG_TRIGGERS and CARD_DISCOUNTS
   */
  function highlightCorpSynergies() {
    var myCorpsHL = detectMyCorps();

    // Single querySelectorAll — clean up + compute in one pass
    var cardEls = document.querySelectorAll('.card-container[data-tm-card]');

    // Remove old highlights first
    cardEls.forEach(function(el) {
      el.classList.remove('tm-corp-synergy', 'tm-tag-synergy');
    });

    if (myCorpsHL.length === 0) return;

    // Pre-compute: corp synergy set (cards ANY corp lists as synergies)
    var corpSyns = new Set();
    var corpNameSet = new Set(myCorpsHL);
    for (var hi = 0; hi < myCorpsHL.length; hi++) {
      var corpData = TM_RATINGS[myCorpsHL[hi]];
      if (corpData && corpData.y) {
        for (var si = 0; si < corpData.y.length; si++) corpSyns.add(corpData.y[si]);
      }
    }

    // Pre-compute: trigger tags from ALL corps + tableau
    var triggerTags = new Set();
    for (var tci = 0; tci < myCorpsHL.length; tci++) {
      var tc = myCorpsHL[tci];
      if (TAG_TRIGGERS[tc]) {
        TAG_TRIGGERS[tc].forEach(function(t) { t.tags.forEach(function(tag) { triggerTags.add(tag); }); });
      }
      if (CORP_DISCOUNTS[tc]) {
        for (var tag in CORP_DISCOUNTS[tc]) {
          if (!tag.startsWith('_')) triggerTags.add(tag);
        }
      }
    }
    var tableauNames = getMyTableauNames();
    for (var ti = 0; ti < tableauNames.length; ti++) {
      var tName = tableauNames[ti];
      if (TAG_TRIGGERS[tName]) {
        TAG_TRIGGERS[tName].forEach(function(t) { t.tags.forEach(function(tag) { triggerTags.add(tag); }); });
      }
      if (CARD_DISCOUNTS[tName]) {
        for (var ctag in CARD_DISCOUNTS[tName]) {
          if (!ctag.startsWith('_')) triggerTags.add(ctag);
        }
      }
    }

    // Single pass: apply both corp synergy + tag synergy
    cardEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name || corpNameSet.has(name)) return;

      // Corp synergy check: card listed by ANY corp, or card lists ANY corp
      var isCorpSyn = false;
      if (corpSyns.has(name)) {
        isCorpSyn = true;
      } else {
        var data = TM_RATINGS[name];
        if (data && data.y) {
          for (var i = 0; i < data.y.length; i++) {
            for (var k = 0; k < myCorpsHL.length; k++) {
              if (data.y[i] === myCorpsHL[k] || data.y[i].indexOf(myCorpsHL[k]) !== -1) {
                isCorpSyn = true;
                break;
              }
            }
            if (isCorpSyn) break;
          }
        }
      }

      if (isCorpSyn) {
        el.classList.add('tm-corp-synergy');
      } else if (triggerTags.size > 0) {
        // Tag synergy (only if not already corp synergy)
        var tags = getCardTags(el);
        for (var j = 0; j < tags.length; j++) {
          if (triggerTags.has(tags[j])) {
            el.classList.add('tm-tag-synergy');
            break;
          }
        }
      }
    });
  }

  // ── Combo highlighting (with rating colors) ──

  function checkCombos() {
    if (typeof TM_COMBOS === 'undefined') return;

    // Single cleanup pass instead of 6 querySelectorAll
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche', 'tm-combo-hint', 'tm-anti-combo');
      var tip = el.querySelector('.tm-combo-tooltip, .tm-anti-combo-tooltip');
      while (tip) { tip.remove(); tip = el.querySelector('.tm-combo-tooltip, .tm-anti-combo-tooltip'); }
    });

    var cardEls = document.querySelectorAll('.card-container[data-tm-card]');
    var visibleNames = new Set();
    var nameToEls = {};
    // Track which elements already have a tooltip (avoid querySelector inside loop)
    var hasComboTip = new Set();
    var hasAntiTip = new Set();

    cardEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) {
        visibleNames.add(name);
        if (!nameToEls[name]) nameToEls[name] = [];
        nameToEls[name].push(el);
      }
    });

    var ratingLabels = { godmode: 'GODMODE', great: 'Отлично', good: 'Хорошо', decent: 'Неплохо', niche: 'Ниша' };

    for (var ci = 0; ci < TM_COMBOS.length; ci++) {
      var combo = TM_COMBOS[ci];
      var matched = combo.cards.filter(function(c) { return visibleNames.has(c); });
      if (matched.length >= 2) {
        var rating = combo.r || 'decent';
        var comboClass = 'tm-combo-' + rating;
        for (var mi = 0; mi < matched.length; mi++) {
          var cardName = matched[mi];
          var els = nameToEls[cardName] || [];
          for (var ei = 0; ei < els.length; ei++) {
            var el = els[ei];
            el.classList.add('tm-combo-highlight', comboClass);
            if (!hasComboTip.has(el)) {
              hasComboTip.add(el);
              var otherCards = combo.cards.filter(function(c) { return c !== cardName; }).map(function(c) { return c; }).join(' + ');
              el.setAttribute('data-tm-combo', (ratingLabels[rating] || rating) + ' [' + otherCards + ']: ' + combo.v);
            }
          }
        }
      } else if (matched.length === 1 && (combo.r === 'godmode' || combo.r === 'great' || combo.r === 'good')) {
        // One-sided combo hint
        var hintEls = nameToEls[matched[0]] || [];
        for (var hi = 0; hi < hintEls.length; hi++) {
          if (!hintEls[hi].classList.contains('tm-combo-highlight')) {
            hintEls[hi].classList.add('tm-combo-hint');
          }
        }
      }
    }

    // Anti-combos
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (var ai = 0; ai < TM_ANTI_COMBOS.length; ai++) {
        var anti = TM_ANTI_COMBOS[ai];
        var aMatched = anti.cards.filter(function(c) { return visibleNames.has(c); });
        if (aMatched.length >= 2) {
          for (var ami = 0; ami < aMatched.length; ami++) {
            var aEls = nameToEls[aMatched[ami]] || [];
            for (var aei = 0; aei < aEls.length; aei++) {
              var ael = aEls[aei];
              ael.classList.add('tm-anti-combo');
              if (!hasAntiTip.has(ael)) {
                hasAntiTip.add(ael);
                ael.setAttribute('data-tm-anti-combo', anti.v);
              }
            }
          }
        }
      }
    }
  }

  // Draft summary panel — removed

  // ── Tier filter ──

  function reapplyFilter() {
    document.querySelectorAll('.card-container[data-tm-tier]').forEach((el) => {
      const tier = el.getAttribute('data-tm-tier');
      const badge = el.querySelector('.tm-tier-badge');
      if (badge) {
        badge.style.display = tierFilter[tier] !== false ? '' : 'none';
      }
    });
  }

  // ── Process / Remove ──

  // Dirty-check: skip expensive work if visible cards haven't changed
  var _prevVisibleHash = '';
  var _prevCorpName = '';
  var _processingNow = false; // flag to ignore self-mutations

  function getVisibleCardsHash() {
    // Lightweight: count + first/last names instead of full sort
    var els = document.querySelectorAll('.card-container[data-tm-card]');
    if (els.length === 0) return '0';
    var first = els[0].getAttribute('data-tm-card') || '';
    var last = els[els.length - 1].getAttribute('data-tm-card') || '';
    return els.length + ':' + first + ':' + last;
  }

  // ── Standard Project Rating ──

  var _spLastUpdate = 0;
  var _spHighlights = []; // SP tips for main VP panel

  function detectSPType(cardEl) {
    var classes = cardEl.className || '';
    var title = (cardEl.querySelector('.card-title') || {}).textContent || '';
    title = title.trim().toLowerCase();

    if (classes.indexOf('sell-patents') !== -1 || title.indexOf('sell') !== -1 || title.indexOf('патент') !== -1) return 'sell';
    if (classes.indexOf('power-plant') !== -1 || (title.indexOf('power') !== -1 && title.indexOf('plant') !== -1) || title.indexOf('электростан') !== -1) return 'power';
    if (classes.indexOf('asteroid-standard') !== -1 || (title.indexOf('asteroid') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('астероид') !== -1) return 'asteroid';
    if (classes.indexOf('aquifer') !== -1 || title.indexOf('aquifer') !== -1 || title.indexOf('океан') !== -1 || title.indexOf('аквифер') !== -1) return 'aquifer';
    if (classes.indexOf('greenery') !== -1 || title.indexOf('greenery') !== -1 || title.indexOf('озеленен') !== -1) return 'greenery';
    if (classes.indexOf('city-standard') !== -1 || (title.indexOf('city') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('город') !== -1) return 'city';
    if (classes.indexOf('air-scrapping') !== -1 || title.indexOf('air scrap') !== -1 || title.indexOf('очистк') !== -1) return 'venus';
    if (classes.indexOf('buffer-gas') !== -1 || title.indexOf('buffer') !== -1 || title.indexOf('буфер') !== -1) return 'buffer';
    if (classes.indexOf('trade') !== -1 || title.indexOf('trade') !== -1 || title.indexOf('торг') !== -1) return 'trade';
    if (classes.indexOf('build-colony') !== -1 || (title.indexOf('colony') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('колон') !== -1) return 'colony';
    if (classes.indexOf('lobby') !== -1 || title.indexOf('lobby') !== -1 || title.indexOf('лобби') !== -1) return 'lobby';
    return null;
  }

  // Check if an SP helps reach a milestone or improve award position
  function checkSPMilestoneAward(spType, pv) {
    var bonus = 0;
    var reasons = [];
    var g = pv.game;
    var p = pv.thisPlayer;
    if (!g || !p) return { bonus: 0, reasons: [] };

    var myColor = p.color;

    // Check milestones (unclaimed, within reach)
    if (g.milestones) {
      var claimedCount = 0;
      for (var mi = 0; mi < g.milestones.length; mi++) {
        if (g.milestones[mi].playerName || g.milestones[mi].player) claimedCount++;
      }
      if (claimedCount < 3) {
        for (var mi = 0; mi < g.milestones.length; mi++) {
          var ms = g.milestones[mi];
          if (ms.playerName || ms.player) continue; // already claimed
          var msName = ms.name;

          // Greenery SP → Gardener (3 greeneries), Forester (3 greeneries)
          if (spType === 'greenery' && (msName === 'Gardener' || msName === 'Forester')) {
            var myGreens = 0;
            if (g.spaces) {
              for (var si = 0; si < g.spaces.length; si++) {
                if (g.spaces[si].color === myColor && (g.spaces[si].tileType === 1 || g.spaces[si].tileType === 'greenery')) myGreens++;
              }
            }
            if (myGreens >= 2) { bonus += 8; reasons.push('→ ' + msName + '! (' + myGreens + '/3)'); }
            else if (myGreens >= 1) { bonus += 3; reasons.push(msName + ' ' + myGreens + '/3'); }
          }

          // City SP → Mayor (3 cities), Suburbian award
          if (spType === 'city' && msName === 'Mayor') {
            var myCities = p.citiesCount || 0;
            if (myCities >= 2) { bonus += 8; reasons.push('→ Mayor! (' + myCities + '/3)'); }
            else if (myCities >= 1) { bonus += 3; reasons.push('Mayor ' + myCities + '/3'); }
          }

          // Power Plant → Specialist (10 prod), Energizer (6 energy prod)
          if (spType === 'power') {
            if (msName === 'Specialist') {
              var maxProd = Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
              var epAfter = (p.energyProduction || 0) + 1;
              if (epAfter >= 10 && maxProd < 10) { bonus += 8; reasons.push('→ Specialist!'); }
            }
            if (msName === 'Energizer') {
              var ep = p.energyProduction || 0;
              if (ep + 1 >= 6 && ep < 6) { bonus += 8; reasons.push('→ Energizer!'); }
              else if (ep >= 4) { bonus += 3; reasons.push('Energizer ' + ep + '/6'); }
            }
          }
        }
      }
    }

    // Check awards (funded or fundable)
    if (g.awards) {
      for (var ai = 0; ai < g.awards.length; ai++) {
        var aw = g.awards[ai];
        var isFunded = !!(aw.playerName || aw.color);
        if (!isFunded) continue; // only check funded awards
        if (!aw.scores || aw.scores.length === 0) continue;

        var myScore = 0, bestOpp = 0;
        for (var si = 0; si < aw.scores.length; si++) {
          if (aw.scores[si].color === myColor) myScore = aw.scores[si].score;
          else bestOpp = Math.max(bestOpp, aw.scores[si].score);
        }

        // Greenery → Landscaper, Cultivator
        if (spType === 'greenery' && (aw.name === 'Landscaper' || aw.name === 'Cultivator')) {
          if (myScore >= bestOpp - 1) { bonus += 4; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        // City → Suburbian, Urbanist
        if (spType === 'city' && (aw.name === 'Suburbian' || aw.name === 'Urbanist')) {
          if (myScore >= bestOpp - 1) { bonus += 4; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        // Aquifer → Landlord (tile count)
        if (spType === 'aquifer' && aw.name === 'Landlord') {
          if (myScore >= bestOpp - 1) { bonus += 3; reasons.push('Landlord +1'); }
        }
        // Asteroid/Aquifer/Greenery → Benefactor (TR)
        if ((spType === 'asteroid' || spType === 'aquifer' || spType === 'greenery' || spType === 'venus' || spType === 'buffer') && aw.name === 'Benefactor') {
          if (myScore >= bestOpp - 2) { bonus += 3; reasons.push('Benefactor TR+1'); }
        }
        // Power Plant → Industrialist (steel+energy), Electrician
        if (spType === 'power' && (aw.name === 'Industrialist' || aw.name === 'Electrician')) {
          if (myScore >= bestOpp - 1) { bonus += 3; reasons.push(aw.name + ' +1'); }
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Compute current player value for any milestone/award check type
  // Used as fallback when ms.scores/aw.scores not available
  function computeMAValue(ma, pv) {
    if (!pv || !pv.thisPlayer) return 0;
    var p = pv.thisPlayer;
    var myColor = p.color;
    switch (ma.check) {
      case 'tr': return p.terraformRating || 0;
      case 'cities': {
        var c = 0;
        if (pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === myColor && (sp.tileType === 0 || sp.tileType === 'city' || sp.tileType === 5 || sp.tileType === 'capital')) c++;
          }
        }
        return c;
      }
      case 'greeneries': {
        var c = 0;
        if (pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === myColor && (sp.tileType === 1 || sp.tileType === 'greenery')) c++;
          }
        }
        return c;
      }
      case 'tags': {
        if (ma.tag && p.tags && Array.isArray(p.tags)) {
          for (var i = 0; i < p.tags.length; i++) {
            if ((p.tags[i].tag || '').toLowerCase() === ma.tag) return p.tags[i].count || 0;
          }
        }
        return 0;
      }
      case 'hand': return p.cardsInHandNbr || (p.cardsInHand ? p.cardsInHand.length : 0);
      case 'tableau': return p.tableau ? p.tableau.length : 0;
      case 'events': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = p.tableau[i].name || p.tableau[i];
            var d = TM_RATINGS[cn];
            if (d && d.t === 'event') c++;
          }
        }
        return c;
      }
      case 'uniqueTags': {
        var c = 0;
        if (p.tags && Array.isArray(p.tags)) {
          for (var i = 0; i < p.tags.length; i++) { if (p.tags[i].count > 0) c++; }
        }
        return c;
      }
      case 'prod': {
        if (ma.resource) {
          var rn = ma.resource === 'megacredits' ? 'megaCreditProduction' : ma.resource + 'Production';
          return p[rn] || 0;
        }
        return 0;
      }
      case 'maxProd':
        return Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
      case 'generalist': {
        var c = 0;
        if ((p.megaCreditProduction || 0) > 0) c++;
        if ((p.steelProduction || 0) > 0) c++;
        if ((p.titaniumProduction || 0) > 0) c++;
        if ((p.plantProduction || 0) > 0) c++;
        if ((p.energyProduction || 0) > 0) c++;
        if ((p.heatProduction || 0) > 0) c++;
        return c;
      }
      case 'bioTags': {
        var b = 0;
        if (p.tags && Array.isArray(p.tags)) {
          for (var i = 0; i < p.tags.length; i++) {
            var tg = (p.tags[i].tag || '').toLowerCase();
            if (tg === 'plant' || tg === 'microbe' || tg === 'animal') b += (p.tags[i].count || 0);
          }
        }
        return b;
      }
      case 'maxTag': {
        var mx = 0;
        if (p.tags && Array.isArray(p.tags)) {
          for (var i = 0; i < p.tags.length; i++) {
            var tg = (p.tags[i].tag || '').toLowerCase();
            if (tg !== 'earth' && tg !== 'event' && (p.tags[i].count || 0) > mx) mx = p.tags[i].count;
          }
        }
        return mx;
      }
      case 'manager': {
        var c = 0;
        if ((p.megaCreditProduction || 0) >= 2) c++;
        if ((p.steelProduction || 0) >= 2) c++;
        if ((p.titaniumProduction || 0) >= 2) c++;
        if ((p.plantProduction || 0) >= 2) c++;
        if ((p.energyProduction || 0) >= 2) c++;
        if ((p.heatProduction || 0) >= 2) c++;
        return c;
      }
      case 'reqCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = p.tableau[i].name || p.tableau[i];
            var fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cn] : null;
            if (fx && fx.req) c++;
          }
        }
        return c;
      }
      case 'tiles': {
        var c = 0;
        if (pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            if (pv.game.spaces[i].color === myColor && pv.game.spaces[i].tileType != null) c++;
          }
        }
        return c;
      }
      case 'resource': return p[ma.resource] || 0;
      case 'steelTi': return (p.steel || 0) + (p.titanium || 0);
      case 'steelEnergy': return (p.steel || 0) + (p.energy || 0);
      case 'greenCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = p.tableau[i].name || p.tableau[i];
            var d = TM_RATINGS[cn];
            if (d && d.t === 'green') c++;
          }
        }
        return c;
      }
      case 'expensiveCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = p.tableau[i].name || p.tableau[i];
            var fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cn] : null;
            if (fx && fx.c >= 20) c++;
          }
        }
        return c;
      }
      case 'cardResources': {
        var t = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            if (p.tableau[i].resources) t += p.tableau[i].resources;
          }
        }
        return t;
      }
      case 'polar': return 0; // coordinate data not available
      default: return 0;
    }
  }

  function rateStandardProjects() {
    var now = Date.now();
    if (now - _spLastUpdate < 2000) return;

    var spCards = document.querySelectorAll('.card-standard-project');
    if (spCards.length === 0) return;

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.game) return;

    var p = pv.thisPlayer;
    var g = pv.game;
    var mc = p.megaCredits || 0;
    var steel = p.steel || 0;
    var stVal = p.steelValue || 2;
    var gen = g.generation || 1;
    var gensLeft = Math.max(1, 9 - gen);

    var tempLeft = g.temperature != null ? Math.max(0, (8 - g.temperature) / 2) : 0;
    var oxyLeft = g.oxygenLevel != null ? Math.max(0, 14 - g.oxygenLevel) : 0;
    var oceanLeft = g.oceans != null ? Math.max(0, 9 - g.oceans) : 0;
    var totalRaises = tempLeft + oxyLeft + oceanLeft;
    var paramGL = Math.ceil(totalRaises / 3);
    gensLeft = Math.max(1, Math.min(gensLeft, paramGL));

    var gl = Math.max(0, Math.min(13, gensLeft));
    var row = FTN_TABLE[gl];
    var trVal = row[0];
    var prodVal = row[1];
    var vpVal = row[2];

    var coloniesOwned = p.coloniesCount || 0;
    var fleetSize = p.fleetSize || 1;
    var tradesThisGen = p.tradesThisGeneration || 0;
    var tradesLeft = fleetSize - tradesThisGen;

    _spLastUpdate = now;
    _spHighlights = [];

    spCards.forEach(function(cardEl) {
      var old = cardEl.querySelector('.tm-sp-badge');
      if (old) old.remove();

      var spType = detectSPType(cardEl);
      if (!spType) return;

      var label = '';
      var cls = 'tm-sp-bad';
      var net = 0;
      var canAfford = false;

      // Check milestone/award bonuses
      var maBonus = checkSPMilestoneAward(spType, pv);

      if (spType === 'sell') {
        label = '1 MC/карта';
        cls = 'tm-sp-ok';
      }
      else if (spType === 'power') {
        var epValue = Math.round(prodVal * 1.5);
        net = epValue - 11;
        canAfford = mc >= 11;
        if (gensLeft <= 2) { label = 'Поздно'; cls = 'tm-sp-bad'; }
        else {
          net += maBonus.bonus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -4 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'asteroid') {
        if (g.temperature != null && g.temperature >= 8) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - 14 + maBonus.bonus;
          canAfford = mc >= 14;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'aquifer') {
        if (g.oceans != null && g.oceans >= 9) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal + 2) - 18 + maBonus.bonus;
          canAfford = mc >= 18;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'greenery') {
        var effCost = 23;
        var stDiscount = Math.min(steel, Math.floor(23 / stVal)) * stVal;
        if (stDiscount > 0) effCost = 23 - stDiscount;
        var o2open = g.oxygenLevel != null && g.oxygenLevel < 14;
        var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
        net = grEV - effCost + maBonus.bonus;
        canAfford = mc + steel * stVal >= 23;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (stDiscount > 0) label += ' (⚒−' + stDiscount + ')';
        if (!o2open) label += ' VP';
        cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
      }
      else if (spType === 'city') {
        var effCost = 25;
        var stDiscount = Math.min(steel, Math.floor(25 / stVal)) * stVal;
        if (stDiscount > 0) effCost = 25 - stDiscount;
        var cityEV = Math.round(vpVal * 2 + 3);
        net = cityEV - effCost + maBonus.bonus;
        canAfford = mc + steel * stVal >= 25;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (stDiscount > 0) label += ' (⚒−' + stDiscount + ')';
        cls = net >= 0 ? 'tm-sp-good' : net >= -6 ? 'tm-sp-ok' : 'tm-sp-bad';
      }
      else if (spType === 'venus') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= 30) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - 15 + maBonus.bonus;
          canAfford = mc >= 15;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'buffer') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= 30) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - 7 + maBonus.bonus;
          canAfford = mc >= 7;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : 'tm-sp-ok';
        }
      }
      else if (spType === 'trade') {
        if (tradesLeft > 0 && coloniesOwned > 0) {
          label = tradesLeft + ' trade, ' + coloniesOwned + ' кол.';
          cls = 'tm-sp-good';
        } else if (tradesLeft > 0) {
          label = tradesLeft + ' trade';
          cls = 'tm-sp-ok';
        } else {
          label = 'Нет trade'; cls = 'tm-sp-bad';
        }
      }
      else if (spType === 'colony') {
        if (coloniesOwned < 3) {
          label = (coloniesOwned + 1) + '-я кол.';
          cls = coloniesOwned === 0 ? 'tm-sp-good' : 'tm-sp-ok';
        } else {
          label = 'Макс. колоний'; cls = 'tm-sp-bad';
        }
      }
      else if (spType === 'lobby') {
        var myDel = 0;
        if (g.turmoil && g.turmoil.parties) {
          var myCol = (p.color || '');
          for (var lpi = 0; lpi < g.turmoil.parties.length; lpi++) {
            var lp = g.turmoil.parties[lpi];
            if (lp.delegates) {
              for (var ldi = 0; ldi < lp.delegates.length; ldi++) {
                var ld = lp.delegates[ldi];
                if ((ld.color || ld) === myCol) myDel += (ld.number || 1);
              }
            }
          }
        }
        label = myDel + ' дел.';
        cls = myDel < 3 ? 'tm-sp-good' : myDel < 5 ? 'tm-sp-ok' : 'tm-sp-bad';
      }

      // Append milestone/award reason to badge
      if (maBonus.reasons.length > 0) {
        label += ' ' + maBonus.reasons[0];
        if (maBonus.bonus >= 5) cls = 'tm-sp-good'; // milestone grab = always highlight
      }

      if (!label) return;

      // Collect highlights for main panel (good SP plays)
      if (cls === 'tm-sp-good' && canAfford !== false) {
        var spNames = { sell: 'Патенты', power: 'Электростанция', asteroid: 'Астероид', aquifer: 'Океан', greenery: 'Озеленение', city: 'Город', venus: 'Очистка', buffer: 'Буфер', trade: 'Торговля', colony: 'Колония', lobby: 'Лобби' };
        _spHighlights.push('⚡ SP: ' + (spNames[spType] || spType) + ' — ' + label);
      }

      var badge = document.createElement('div');
      badge.className = 'tm-sp-badge ' + cls;
      badge.textContent = label;
      cardEl.style.position = 'relative';
      cardEl.appendChild(badge);
    });
  }

  function processAll() {
    if (!enabled || _processingNow) return;
    _processingNow = true;
    // Preserve scroll position to prevent jump on DOM changes
    var scrollY = window.scrollY;
    try {
      // Core: inject tier badges on cards
      var newCards = false;
      document.querySelectorAll('.card-container:not([data-tm-processed])').forEach(function(el) {
        injectBadge(el);
        el.setAttribute('data-tm-processed', '1');
        newCards = true;
      });
      // Expensive functions: only run if visible cards changed
      var curHash = getVisibleCardsHash();
      var curCorp = detectMyCorp() || '';
      var dirty = newCards || curHash !== _prevVisibleHash || curCorp !== _prevCorpName;
      _prevVisibleHash = curHash;
      _prevCorpName = curCorp;
      if (dirty) {
        // Core: combo highlights + corp synergy glow
        checkCombos();
        highlightCorpSynergies();
        // Core: draft scoring + draft history
        updateDraftRecommendations();
        // Prelude package scoring
        checkPreludePackage();
        // Discard hints on hand cards
        injectDiscardHints();
        // Play priority badges
        injectPlayPriorityBadges();
      }
      trackDraftHistory();
      // Standard project ratings (throttled internally)
      rateStandardProjects();
      // Enhanced game log (cheap with :not selector, always run)
      enhanceGameLog();
      // VP tracker panel (M&A tracker, tips)
      updateVPTracker();
      // Game Logger: init on first processAll with valid game
      initGameLogger();
      // Re-snapshot periodically (every 30s) for late-game updates
      if (gameLog.active) {
        var curGen = detectGeneration();
        if (curGen > 0) logSnapshot(curGen);
      }
    } finally {
      _processingNow = false;
      // Restore scroll if it jumped during DOM manipulation
      if (Math.abs(window.scrollY - scrollY) > 5) {
        window.scrollTo(0, scrollY);
      }
    }
  }

  // ── Enhanced Game Log ──

  // ── Enhanced Game Log ──

  let logFilterPlayer = null; // null = show all, 'red'/'blue'/etc = filter
  let logFilterBarEl = null;
  let prevHandCards = []; // track hand for choice context

  function enhanceGameLog() {
    const logPanel = document.querySelector('.log-panel');
    if (!logPanel) return;

    if (!logPanel.hasAttribute('data-tm-enhanced')) {
      logPanel.setAttribute('data-tm-enhanced', '1');
    }

    // Build player filter bar
    buildLogFilterBar(logPanel);

    // Inject tier badges next to card names in log
    logPanel.querySelectorAll('.log-card:not([data-tm-log])').forEach((el) => {
      el.setAttribute('data-tm-log', '1');
      const cardName = el.textContent.trim();
      let data = TM_RATINGS[cardName];
      if (!data) {
        const exact = lowerLookup[cardName.toLowerCase()];
        if (exact) data = TM_RATINGS[exact];
      }
      if (data && data.t && data.s != null) {
        const badge = document.createElement('span');
        badge.className = 'tm-log-tier tm-tier-' + data.t;
        badge.textContent = data.t + data.s;
        badge.title = (ruName(cardName) || cardName) + '\n' + (data.e || '') + (data.w ? '\n' + data.w : '');
        el.insertAdjacentElement('afterend', badge);
      }
    });

    // Highlight important log entries
    logPanel.querySelectorAll('li:not([data-tm-hl])').forEach((li) => {
      li.setAttribute('data-tm-hl', '1');
      const text = li.textContent || '';
      if (/terraform rating|raised.*temperature|raised.*oxygen|placed.*ocean/i.test(text)) {
        li.style.borderLeft = '3px solid #4caf50';
        li.style.paddingLeft = '6px';
      } else if (/VP|victory point|award|milestone/i.test(text)) {
        li.style.borderLeft = '3px solid #ff9800';
        li.style.paddingLeft = '6px';
      }
    });

    // Apply player filter
    applyLogFilter(logPanel);

    // Track hand changes for choice context
    trackHandChoices(logPanel);

    // Generation summaries
    injectGenSummaries(logPanel);

    // Draft history in log
    injectDraftHistory(logPanel);
  }

  function buildLogFilterBar(logPanel) {
    const logContainer = logPanel.closest('.log-container');
    if (!logContainer || logContainer.querySelector('.tm-log-filter')) return;

    // Get player colors from log
    const playerColors = new Set();
    logPanel.querySelectorAll('.log-player').forEach((el) => {
      const cls = Array.from(el.classList).find(c => c.startsWith('player_bg_color_'));
      if (cls) playerColors.add(cls.replace('player_bg_color_', ''));
    });

    if (playerColors.size === 0) return;

    const bar = document.createElement('div');
    bar.className = 'tm-log-filter';

    // "All" button
    const allBtn = document.createElement('span');
    allBtn.className = 'tm-log-filter-btn tm-log-filter-active';
    allBtn.textContent = 'Все';
    allBtn.addEventListener('click', () => {
      logFilterPlayer = null;
      bar.querySelectorAll('.tm-log-filter-btn').forEach(b => b.classList.remove('tm-log-filter-active'));
      allBtn.classList.add('tm-log-filter-active');
      applyLogFilter(logPanel);
    });
    bar.appendChild(allBtn);

    // Player color buttons
    const colorMap = { red: '#d32f2f', blue: '#1976d2', green: '#388e3c', yellow: '#fbc02d', black: '#616161', purple: '#7b1fa2', orange: '#f57c00', pink: '#c2185b' };
    for (const color of playerColors) {
      const btn = document.createElement('span');
      btn.className = 'tm-log-filter-btn';
      btn.style.background = colorMap[color] || '#666';
      // Find player name from log
      const nameEl = logPanel.querySelector('.log-player.player_bg_color_' + color);
      btn.textContent = nameEl ? nameEl.textContent.trim() : color;
      btn.addEventListener('click', () => {
        logFilterPlayer = color;
        bar.querySelectorAll('.tm-log-filter-btn').forEach(b => b.classList.remove('tm-log-filter-active'));
        btn.classList.add('tm-log-filter-active');
        applyLogFilter(logPanel);
      });
      bar.appendChild(btn);
    }

    logContainer.insertBefore(bar, logPanel);
    logFilterBarEl = bar;
  }

  function applyLogFilter(logPanel) {
    logPanel.querySelectorAll('li').forEach((li) => {
      if (!logFilterPlayer) {
        li.style.display = '';
        return;
      }
      const hasPlayer = li.querySelector('.log-player.player_bg_color_' + logFilterPlayer);
      li.style.display = hasPlayer ? '' : 'none';
    });
  }

  // Track hand cards to show what alternatives were when a card was played
  function trackHandChoices(logPanel) {
    const pv = getPlayerVueData();
    if (!pv) return;

    // Get current hand
    const curHand = [];
    if (pv.cardsInHand) {
      for (const c of pv.cardsInHand) curHand.push(c.name || c);
    } else if (pv.thisPlayer && pv.thisPlayer.cardsInHand) {
      for (const c of pv.thisPlayer.cardsInHand) curHand.push(c.name || c);
    }

    // Detect cards that disappeared from hand (were played/discarded)
    if (prevHandCards.length > 0 && curHand.length < prevHandCards.length) {
      const curSet = new Set(curHand);
      const played = prevHandCards.filter(c => !curSet.has(c));

      if (played.length > 0 && played.length <= 3 && prevHandCards.length > 1) {
        // Check if there's a matching "played" entry in recent log
        const recentLis = logPanel.querySelectorAll('li:not([data-tm-choice])');
        for (const li of recentLis) {
          const text = li.textContent || '';
          const playedCard = played.find(c => text.toLowerCase().includes(c.toLowerCase()) && /played/i.test(text));
          if (playedCard) {
            li.setAttribute('data-tm-choice', '1');
            const alternatives = prevHandCards.filter(c => c !== playedCard);
            if (alternatives.length > 0) {
              const altDiv = document.createElement('div');
              altDiv.className = 'tm-log-alternatives';
              const altCards = alternatives.map(c => {
                const d = TM_RATINGS[c];
                const tier = d ? ' <span class="tm-log-tier tm-tier-' + d.t + '">' + d.t + d.s + '</span>' : '';
                return escHtml(ruName(c) || c) + tier;
              });
              altDiv.innerHTML = '↳ Выбор из: ' + altCards.join(', ');
              li.appendChild(altDiv);
            }
            break;
          }
        }
      }
    }

    prevHandCards = curHand;
  }

  // ── Generation Summary ──

  let logSummaryGen = 0;

  function injectGenSummaries(logPanel) {
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.players) return;

    const curGen = pv.game.generation || detectGeneration();
    if (curGen <= 1 || curGen <= logSummaryGen) return;

    // Check if we already injected for this generation
    if (logPanel.querySelector('.tm-gen-summary[data-gen="' + (curGen - 1) + '"]')) {
      logSummaryGen = curGen;
      return;
    }

    // Build summary for previous generation from player data
    const summary = document.createElement('div');
    summary.className = 'tm-gen-summary';
    summary.setAttribute('data-gen', curGen - 1);

    let html = '<div class="tm-gen-summary-title">Итог поколения ' + (curGen - 1) + '</div>';
    for (const p of pv.players) {
      const name = p.name || '?';
      const color = p.color || 'gray';
      const tr = p.terraformRating || 0;
      const mc = p.megaCredits || 0;
      const cards = (p.tableau || []).length;
      const mcProd = p.megaCreditProduction || 0;
      html += '<div class="tm-gen-summary-row">';
      html += '<span class="tm-gen-summary-player" style="background:' + getPlayerColor(color) + '">' + escHtml(name) + '</span> ';
      html += 'TR:' + tr + ' MC:' + mc + ' Прод:' + mcProd + ' Карт:' + cards;
      html += '</div>';
    }
    summary.innerHTML = html;

    // Insert before the generation marker in the log
    const scrollable = logPanel.querySelector('#logpanel-scrollable');
    if (scrollable) {
      scrollable.appendChild(summary);
    }

    logSummaryGen = curGen;
  }

  function getPlayerColor(color) {
    const map = { red: '#d32f2f', blue: '#1976d2', green: '#388e3c', yellow: '#fbc02d', black: '#616161', purple: '#7b1fa2', orange: '#f57c00', pink: '#c2185b' };
    return map[color] || '#666';
  }

  // ── Draft History Injection ──

  let lastDraftLogCount = 0;

  function injectDraftHistory(logPanel) {
    if (draftHistory.length === 0 || draftHistory.length === lastDraftLogCount) return;

    const scrollable = logPanel.querySelector('#logpanel-scrollable ul') || logPanel.querySelector('#logpanel-scrollable');
    if (!scrollable) return;

    for (let i = lastDraftLogCount; i < draftHistory.length; i++) {
      const entry = draftHistory[i];
      const li = document.createElement('li');
      li.className = 'tm-draft-log-entry';

      const takenName = entry.taken || '?';

      // Build card list showing all offered cards with scores
      let cardsHtml = '<div class="tm-draft-cards">';
      for (let j = 0; j < entry.offered.length; j++) {
        const card = entry.offered[j];
        const isTaken = card.name === takenName;
        const displayName = escHtml(ruName(card.name) || card.name);
        const tierClass = 'tm-tier-' + card.tier;
        const scoreText = card.baseTier + card.baseScore;
        const adjText = card.total !== card.baseScore ? ' → ' + card.total : '';

        var isPassed = !isTaken && entry.passed && entry.passed.includes(card.name);
        cardsHtml += '<div class="tm-draft-card-row' + (isTaken ? ' tm-draft-taken' : '') + '">';
        cardsHtml += '<span class="tm-log-tier ' + tierClass + '">' + scoreText + adjText + '</span> ';
        if (isTaken) {
          cardsHtml += '<b>' + displayName + ' ✓</b>';
        } else if (isPassed) {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span> <span style="color:#ff9800;font-size:10px">↗ отдано</span>';
        } else {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span>';
        }
        if (isTaken && card.reasons.length > 0) {
          cardsHtml += ' <span class="tm-draft-reasons">' + card.reasons.join(', ') + '</span>';
        }
        cardsHtml += '</div>';
      }
      cardsHtml += '</div>';

      li.innerHTML = '<span style="color:#bb86fc">📋 Драфт ' + entry.round + '</span>' + cardsHtml;

      scrollable.appendChild(li);
    }

    lastDraftLogCount = draftHistory.length;
  }

  function removeAll() {
    document.querySelectorAll('.tm-tier-badge').forEach((el) => el.remove());
    document.querySelectorAll('.tm-combo-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    document.querySelectorAll('.tm-dim').forEach((el) => el.classList.remove('tm-dim'));
    document.querySelectorAll('.tm-corp-synergy').forEach((el) => el.classList.remove('tm-corp-synergy'));
    document.querySelectorAll('.tm-tag-synergy').forEach((el) => el.classList.remove('tm-tag-synergy'));
    document.querySelectorAll('.tm-combo-hint').forEach((el) => el.classList.remove('tm-combo-hint'));
    document.querySelectorAll('.tm-anti-combo').forEach((el) => el.classList.remove('tm-anti-combo'));
    document.querySelectorAll('.tm-anti-combo-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('[data-tm-processed]').forEach((el) => {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));
    document.querySelectorAll('[data-tm-reasons]').forEach((el) => el.removeAttribute('data-tm-reasons'));
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach((badge) => {
      const orig = badge.getAttribute('data-tm-original');
      badge.textContent = orig;
      const origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) badge.className = 'tm-tier-badge tm-tier-' + origTier;
      badge.removeAttribute('data-tm-original');
      badge.removeAttribute('data-tm-orig-tier');
    });
    document.querySelectorAll('.tm-sort-badge').forEach((el) => el.remove());
    if (advisorEl) advisorEl.style.display = 'none';
    if (oppTrackerEl) oppTrackerEl.style.display = 'none';
    if (incomeEl) incomeEl.style.display = 'none';
    if (poolEl) poolEl.style.display = 'none';
    if (playOrderEl) playOrderEl.style.display = 'none';
    if (tagCounterEl) tagCounterEl.style.display = 'none';
    if (lensEl) lensEl.style.display = 'none';
    // timerEl removed
    if (vpEl) vpEl.style.display = 'none';
    if (globalsEl) globalsEl.style.display = 'none';
    if (turmoilEl) turmoilEl.style.display = 'none';
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });
    document.querySelectorAll('.tm-lens-dim').forEach((el) => el.classList.remove('tm-lens-dim'));
    document.querySelectorAll('.tm-action-reminder').forEach((el) => el.remove());
    hideTooltip();
  }

  // ── Card search overlay ──

  let searchEl = null;
  let searchOpen = false;

  let searchTierFilter = null; // null = all tiers

  function buildSearchOverlay() {
    if (searchEl) return searchEl;
    searchEl = document.createElement('div');
    searchEl.className = 'tm-search-overlay';
    searchEl.innerHTML =
      '<div class="tm-search-header">' +
        '<input type="text" class="tm-search-input" placeholder="Поиск карт..." autocomplete="off">' +
        '<span class="tm-search-close">&times;</span>' +
      '</div>' +
      '<div class="tm-search-tier-bar">' +
        '<button class="tm-search-tier-btn tm-search-tier-active" data-tier="">Все</button>' +
        '<button class="tm-search-tier-btn" data-tier="S">S</button>' +
        '<button class="tm-search-tier-btn" data-tier="A">A</button>' +
        '<button class="tm-search-tier-btn" data-tier="B">B</button>' +
        '<button class="tm-search-tier-btn" data-tier="C">C</button>' +
        '<button class="tm-search-tier-btn" data-tier="D">D</button>' +
        '<button class="tm-search-tier-btn" data-tier="F">F</button>' +
      '</div>' +
      '<div class="tm-search-count"></div>' +
      '<div class="tm-search-results"></div>';
    document.body.appendChild(searchEl);

    const input = searchEl.querySelector('.tm-search-input');
    const results = searchEl.querySelector('.tm-search-results');
    const countEl = searchEl.querySelector('.tm-search-count');
    const closeBtn = searchEl.querySelector('.tm-search-close');

    closeBtn.addEventListener('click', closeSearch);

    // Tier filter buttons
    searchEl.querySelectorAll('.tm-search-tier-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        searchEl.querySelectorAll('.tm-search-tier-btn').forEach((b) => b.classList.remove('tm-search-tier-active'));
        btn.classList.add('tm-search-tier-active');
        searchTierFilter = btn.getAttribute('data-tier') || null;
        doSearch();
      });
    });

    function doSearch() {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 && !searchTierFilter) { results.innerHTML = ''; countEl.textContent = ''; return; }

      const matches = [];
      for (const name in TM_RATINGS) {
        const data = TM_RATINGS[name];
        // Tier filter
        if (searchTierFilter && data.t !== searchTierFilter) continue;

        // Text filter (skip if empty query and we have tier filter)
        if (q.length >= 2) {
          const matchEn = name.toLowerCase().includes(q);
          const ruN = (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[name]) || '';
          const matchRu = ruN.toLowerCase().includes(q);
          if (!matchEn && !matchRu) continue;
        }

        matches.push({ name, data });
        if (matches.length >= 30) break;
      }

      // Sort by score desc
      matches.sort((a, b) => b.data.s - a.data.s);

      countEl.textContent = matches.length >= 30 ? '30+ результатов' : matches.length + ' результатов';

      if (matches.length === 0) {
        results.innerHTML = '<div class="tm-search-empty">Ничего не найдено</div>';
        return;
      }

      let html = '';
      for (const m of matches) {
        html += '<div class="tm-search-item" data-card="' + escHtml(m.name) + '">';
        html += '<span class="tm-tip-tier tm-tier-' + m.data.t + '">' + m.data.t + ' ' + m.data.s + '</span> ';
        html += '<span class="tm-search-name">' + escHtml(ruName(m.name)) + '</span>';
        if (ruName(m.name) !== m.name) html += ' <span class="tm-search-ru">' + escHtml(m.name) + '</span>';
        if (m.data.e) html += '<div class="tm-search-detail">' + escHtml(m.data.e) + '</div>';
        if (m.data.w) html += '<div class="tm-search-detail">' + escHtml(m.data.w) + '</div>';
        if (m.data.y && m.data.y.length && m.data.y[0] !== 'None significant') {
          html += '<div class="tm-search-detail"><b>Синергии:</b> ' + m.data.y.map(escHtml).join(', ') + '</div>';
        }
        html += '</div>';
      }
      results.innerHTML = html;
    }

    input.addEventListener('input', doSearch);

    return searchEl;
  }

  function openSearch() {
    const overlay = buildSearchOverlay();
    overlay.style.display = 'block';
    searchOpen = true;
    setTimeout(() => overlay.querySelector('.tm-search-input').focus(), 50);
  }

  function closeSearch() {
    if (searchEl) searchEl.style.display = 'none';
    searchOpen = false;
  }

  // ── Milestone/Award advisor ──

  const MA_DATA = {
    // Tharsis milestones
    'Terraformer': { type: 'milestone', map: 'Tharsis', desc: 'TR >= 35', check: 'tr', target: 35, reddit: 'One of the better milestones. Contested as 3rd on Tharsis after Builder/Gardener. 5 VP over 35 TR is a lot in a short game' },
    'Mayor': { type: 'milestone', map: 'Tharsis', desc: '3 cities', check: 'cities', target: 3 },
    'Gardener': { type: 'milestone', map: 'Tharsis', desc: '3 greeneries', check: 'greeneries', target: 3 },
    'Builder': { type: 'milestone', map: 'Tharsis', desc: '8 building tags', check: 'tags', tag: 'building', target: 8, reddit: 'Go for it naturally, not from the start, unless 3+ building tags in preludes. Usually the first claimed milestone' },
    'Planner': { type: 'milestone', map: 'Tharsis', desc: '16 cards in hand', check: 'hand', target: 16 },
    // Hellas milestones
    'Diversifier': { type: 'milestone', map: 'Hellas', desc: '8 different tags', check: 'uniqueTags', target: 8 },
    'Tactician': { type: 'milestone', map: 'Hellas', desc: '5 cards with requirements', check: 'reqCards', target: 5 },
    'Energizer': { type: 'milestone', map: 'Hellas', desc: '6 energy production', check: 'prod', resource: 'energy', target: 6 },
    'Rim Settler': { type: 'milestone', map: 'Hellas', desc: '3 Jovian tags', check: 'tags', tag: 'jovian', target: 3 },
    // Elysium milestones
    'Generalist': { type: 'milestone', map: 'Elysium', desc: 'All 6 productions +1', check: 'generalist' },
    'Specialist': { type: 'milestone', map: 'Elysium', desc: '10 in any production', check: 'maxProd', target: 10, reddit: 'Common in 2P with money or heat production. Harder in 3-4P' },
    'Ecologist': { type: 'milestone', map: 'Elysium', desc: '4 bio tags', check: 'bioTags', target: 4 },
    'Tycoon': { type: 'milestone', map: 'Elysium', desc: '15 project cards', check: 'tableau', target: 15 },
    'Legend': { type: 'milestone', map: 'Elysium', desc: '5 events', check: 'events', target: 5 },
    // M&A expansion milestones
    'Terran': { type: 'milestone', map: 'M&A', desc: '5 Earth tags', check: 'tags', tag: 'earth', target: 5, reddit: 'Hard to reach 5 Earth tags without dedicated strategy. Point Luna makes it much easier' },
    'Forester': { type: 'milestone', map: 'M&A', desc: '3 greenery tiles', check: 'greeneries', target: 3, reddit: '3 feels low, but greeneries are expensive early. Often contested' },
    'Manager': { type: 'milestone', map: 'M&A', desc: '4 productions at 2+', check: 'manager' },
    'Geologist': { type: 'milestone', map: 'M&A', desc: '5 same non-Earth tags', check: 'maxTag', target: 5 },
    'Polar Explorer': { type: 'milestone', map: 'M&A', desc: '3 tiles on bottom rows', check: 'polar', target: 3, reddit: 'Always try for the ocean spot. Pairs well with city placement strategy' },
    // Tharsis awards
    'Landlord': { type: 'award', map: 'Tharsis', desc: 'Most tiles', check: 'tiles' },
    'Scientist': { type: 'award', map: 'Tharsis', desc: 'Most science tags', check: 'tags', tag: 'science' },
    'Banker': { type: 'award', map: 'Tharsis', desc: 'Most MC production', check: 'prod', resource: 'megacredits' },
    'Thermalist': { type: 'award', map: 'Tharsis', desc: 'Most heat', check: 'resource', resource: 'heat', reddit: 'Better for engine (Mass Converter/Quantum) than terraforming. NOT good for Helion contrary to popular belief' },
    'Miner': { type: 'award', map: 'Tharsis', desc: 'Most steel + titanium', check: 'steelTi', reddit: 'Very competitive. Best with steel/ti production corps. Fund early before opponents accumulate resources' },
    // Hellas awards
    'Cultivator': { type: 'award', map: 'Hellas', desc: 'Most greeneries', check: 'greeneries' },
    'Magnate': { type: 'award', map: 'Hellas', desc: 'Most green cards', check: 'greenCards' },
    'Space Baron': { type: 'award', map: 'Hellas', desc: 'Most space tags', check: 'tags', tag: 'space' },
    'Contractor': { type: 'award', map: 'Hellas', desc: 'Most building tags', check: 'tags', tag: 'building', reddit: 'Better online than in-person — avoids constant tag counting. Pairs well with Builder milestone' },
    // Elysium awards
    'Celebrity': { type: 'award', map: 'Elysium', desc: 'Most cards costing 20+', check: 'expensiveCards', reddit: 'Best when someone else funds it. Good for Space/Jovian heavy strategies with expensive cards' },
    'Industrialist': { type: 'award', map: 'Elysium', desc: 'Most steel + energy', check: 'steelEnergy' },
    'Benefactor': { type: 'award', map: 'Elysium', desc: 'Highest TR', check: 'tr' },
    // M&A expansion awards
    'Collector': { type: 'award', map: 'M&A', desc: 'Most resources on cards', check: 'cardResources', reddit: 'Not particularly swingy. Fun with Decomposers, animal cards, floater engines' },
    'Electrician': { type: 'award', map: 'M&A', desc: 'Most Power tags', check: 'tags', tag: 'power', reddit: 'Finally a reason to play Thorgate! Power tags become valuable' },
    'Suburbian': { type: 'award', map: 'M&A', desc: 'Most city tiles', check: 'cities', reddit: 'Less swingy, empowers ground game. Pairs well with Mayor milestone and city-heavy strategy' },
    'Landscaper': { type: 'award', map: 'M&A', desc: 'Most greenery tiles', check: 'greeneries', reddit: 'Many ways to fight and block it. Risky to fund — opponents can steal with late greeneries' },
  };

  let advisorEl = null;
  let advisorVisible = false;

  var _pvCache = null;
  var _pvCacheTime = 0;
  function getPlayerVueData() {
    // Cached: avoid re-parsing large JSON on every call (tooltip calls 3-5x per hover)
    if (Date.now() - _pvCacheTime < 2000 && _pvCache !== null) return _pvCache;
    var bridgeEl = document.getElementById('game') || document.body;
    var bridgeData = bridgeEl.getAttribute('data-tm-vue-bridge');
    if (!bridgeData) { _pvCache = null; return null; }
    try {
      var parsed = JSON.parse(bridgeData);
      if (parsed._timestamp && Date.now() - parsed._timestamp > 15000) { _pvCache = null; return null; }
      _pvCache = parsed;
      _pvCacheTime = Date.now();
      return _pvCache;
    } catch(e) { _pvCache = null; return null; }
  }

  function detectActiveMA() {
    // Read milestone/award names from the DOM
    const maNames = [];
    document.querySelectorAll('.ma-name, .milestone-award-inline').forEach((el) => {
      const text = el.textContent.trim();
      if (text) maNames.push(text);
    });
    return maNames;
  }

  function buildAdvisorPanel() {
    if (advisorEl) return advisorEl;
    advisorEl = document.createElement('div');
    advisorEl.className = 'tm-advisor-panel';
    document.body.appendChild(advisorEl);
    return advisorEl;
  }

  function updateAdvisor() {
    if (!advisorVisible || !enabled) {
      if (advisorEl) advisorEl.style.display = 'none';
      return;
    }

    const panel = buildAdvisorPanel();
    const pv = getPlayerVueData();

    // Read what we can from Vue or DOM
    const myData = {
      tr: 0,
      hand: 0,
      tableau: 0,
      tags: {},
      prod: {},
    };

    if (pv) {
      if (pv.thisPlayer) {
        const p = pv.thisPlayer;
        myData.tr = p.terraformRating || 0;
        myData.prod.megacredits = p.megaCreditProduction || 0;
        myData.prod.steel = p.steelProduction || 0;
        myData.prod.titanium = p.titaniumProduction || 0;
        myData.prod.plants = p.plantProduction || 0;
        myData.prod.energy = p.energyProduction || 0;
        myData.prod.heat = p.heatProduction || 0;
        myData.hand = (pv.cardsInHand || []).length;
        myData.tableau = (p.tableau || []).length;

        // Count tags from tableau
        if (p.tags) {
          for (const t of p.tags) {
            const tagName = (t.tag || '').toLowerCase();
            myData.tags[tagName] = (myData.tags[tagName] || 0) + t.count;
          }
        }
      }
    } else {
      // Fallback: count from DOM
      const handCards = document.querySelectorAll('.player_home_block--hand .card-container');
      myData.hand = handCards.length;
      const playedCards = document.querySelectorAll('.player_home_block--cards .card-container');
      myData.tableau = playedCards.length;
    }

    // Detect which MA are in this game
    const activeNames = detectActiveMA();

    let html = '<div class="tm-advisor-title">' + minBtn('advisor') + 'Вехи и Награды</div>';
    let hasContent = false;

    // Check milestones in MA_DATA that match active names
    for (const [name, ma] of Object.entries(MA_DATA)) {
      if (activeNames.length > 0 && !activeNames.some((n) => n.includes(name))) continue;

      let current = '?';
      let target = ma.target || '?';
      let pct = 0;

      if (ma.check === 'tr' && myData.tr) {
        current = myData.tr;
        pct = Math.min(100, (myData.tr / (ma.target || 35)) * 100);
      } else if (ma.check === 'hand') {
        current = myData.hand;
        pct = Math.min(100, (myData.hand / (ma.target || 16)) * 100);
      } else if (ma.check === 'tableau') {
        current = myData.tableau;
        pct = Math.min(100, (myData.tableau / (ma.target || 15)) * 100);
      } else if (ma.check === 'tags' && ma.tag) {
        current = myData.tags[ma.tag] || 0;
        pct = Math.min(100, (current / (ma.target || 1)) * 100);
      } else if (ma.check === 'prod' && ma.resource) {
        current = myData.prod[ma.resource] || 0;
        pct = Math.min(100, (current / (ma.target || 1)) * 100);
      } else if (ma.check === 'maxProd') {
        const maxP = Math.max(...Object.values(myData.prod).map(Number).filter((n) => !isNaN(n)), 0);
        current = maxP;
        pct = Math.min(100, (maxP / (ma.target || 10)) * 100);
      } else if (ma.check === 'bioTags') {
        current = (myData.tags['plant'] || 0) + (myData.tags['microbe'] || 0) + (myData.tags['animal'] || 0);
        pct = Math.min(100, (current / (ma.target || 4)) * 100);
      } else {
        continue; // Skip if we can't compute
      }

      if (current === '?' || current === 0) continue;

      hasContent = true;
      const typeIcon = ma.type === 'milestone' ? 'M' : 'A';
      const typeClass = ma.type === 'milestone' ? 'tm-adv-ms' : 'tm-adv-aw';
      const done = pct >= 100;

      html += '<div class="tm-adv-row' + (done ? ' tm-adv-done' : '') + '">';
      html += '<span class="tm-adv-icon ' + typeClass + '">' + typeIcon + '</span> ';
      html += '<span class="tm-adv-name">' + escHtml(name) + '</span>';
      html += '<div class="tm-adv-bar"><div class="tm-adv-fill" style="width:' + Math.round(pct) + '%"></div></div>';
      html += '<span class="tm-adv-val">' + current + '/' + target + '</span>';
      if (ma.reddit) {
        html += '<div class="tm-adv-reddit" style="color:#ff6b35;font-size:10px;padding:1px 0 2px 20px;opacity:0.85">' + escHtml(ma.reddit) + '</div>';
      }
      html += '</div>';
    }

    if (!hasContent) {
      panel.style.display = 'none';
      return;
    }

    // Milestone status — claimed and claimable
    if (pv && pv.game && pv.game.milestones) {
      const claimedList = [];
      for (const ms of pv.game.milestones) {
        if (ms.color || ms.playerName) {
          claimedList.push({ name: ms.name, player: ms.playerName || ms.color });
        } else if (ms.scores) {
          const myColor = pv.thisPlayer.color;
          const myMs = ms.scores.find(function(s) { return s.color === myColor; });
          if (myMs && myMs.claimable) {
            html += '<div class="tm-turm-warn" style="background:rgba(46,204,113,0.2);border-color:#2ecc71;color:#2ecc71">Можно заявить: ' + escHtml(ms.name) + '!</div>';
            hasContent = true;
          }
        }
      }
      if (claimedList.length > 0) {
        html += '<div style="font-size:10px;color:#888;margin-top:4px">Заявлены: ';
        html += claimedList.map(function(c) { return escHtml(c.name) + ' (' + escHtml(c.player) + ')'; }).join(', ');
        html += '</div>';
        hasContent = true;
      }
    }

    // Milestone race: show who's close among opponents
    if (pv && pv.players && pv.thisPlayer) {
      const opponents = pv.players.filter((p) => p.color !== pv.thisPlayer.color);
      const raceWarnings = [];

      for (const opp of opponents) {
        const oppName = opp.name || opp.color;
        // Check tag-based milestones for opponents
        if (opp.tags) {
          const oppTags = {};
          for (const t of opp.tags) {
            oppTags[(t.tag || '').toLowerCase()] = t.count || 0;
          }

          for (const [maName, ma] of Object.entries(MA_DATA)) {
            if (ma.type !== 'milestone') continue;
            if (activeNames.length > 0 && !activeNames.some((n) => n.includes(maName))) continue;

            let oppVal = 0;
            if (ma.check === 'tags' && ma.tag) oppVal = oppTags[ma.tag] || 0;
            else if (ma.check === 'tr') oppVal = opp.terraformRating || 0;
            else if (ma.check === 'bioTags') {
              oppVal = (oppTags['plant'] || 0) + (oppTags['microbe'] || 0) + (oppTags['animal'] || 0);
            }
            else continue;

            if (ma.target && oppVal >= ma.target - 1 && oppVal > 0) {
              raceWarnings.push(oppName + ': ' + oppVal + '/' + ma.target + ' в ' + maName + '!');
            }
          }
        }
      }

      if (raceWarnings.length > 0) {
        html += '<div class="tm-adv-race-title">Гонка за вехами</div>';
        for (const w of raceWarnings.slice(0, 4)) {
          html += '<div class="tm-adv-race-warn">' + escHtml(w) + '</div>';
        }
        hasContent = true;
      }
    }

    // Award race warnings — check who's winning funded awards
    if (pv && pv.game && pv.game.awards && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      const awardWarnings = [];
      for (const aw of pv.game.awards) {
        if (!(aw.playerName || aw.color)) continue; // not funded
        if (!aw.scores || aw.scores.length < 2) continue;
        const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        const myEntry = sorted.find(function(s) { return s.color === myColor; });
        if (!myEntry) continue;
        const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
        const leader = sorted[0];
        // Warn if I'm losing (not 1st)
        if (myRank > 0 && leader.color !== myColor) {
          const gap = leader.score - myEntry.score;
          const urgency = gap <= 2 ? 'близко' : 'отстаю';
          awardWarnings.push(aw.name + ': ' + leader.color + ' ' + leader.score + ' vs мои ' + myEntry.score + ' (' + urgency + ')');
        }
        // Warn if I'm 1st but it's tight
        if (myRank === 0 && sorted.length > 1 && sorted[1].score >= myEntry.score - 1) {
          awardWarnings.push(aw.name + ': лидирую ' + myEntry.score + ', но ' + sorted[1].color + ' ' + sorted[1].score + ' рядом');
        }
      }
      if (awardWarnings.length > 0) {
        html += '<div class="tm-adv-race-title">Гонка за наградами</div>';
        for (const w of awardWarnings.slice(0, 4)) {
          html += '<div class="tm-adv-race-warn" style="color:#ff9800">' + escHtml(w) + '</div>';
        }
        hasContent = true;
      }
    }

    // Unfunded awards — VP potential if I fund them
    if (pv && pv.game && pv.game.awards && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      const funded = pv.game.awards.filter(function(a) { return a.playerName || a.color; }).length;
      const costs = [8, 14, 20];
      if (funded < 3) {
        const unfundedGood = [];
        for (const aw of pv.game.awards) {
          if (aw.playerName || aw.color) continue; // already funded
          if (!aw.scores || aw.scores.length < 2) continue;
          const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
          const myEntry = sorted.find(function(s) { return s.color === myColor; });
          if (!myEntry) continue;
          const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
          const vpGain = myRank === 0 ? 5 : myRank === 1 ? 2 : 0;
          if (myRank === 0 || (myRank === 1 && sorted[0].score - myEntry.score <= 2)) {
            unfundedGood.push({ name: aw.name, vp: vpGain, rank: myRank + 1, myScore: myEntry.score, leaderScore: sorted[0].score });
          }
        }
        if (unfundedGood.length > 0) {
          unfundedGood.sort(function(a, b) { return b.vp - a.vp; });
          html += '<div class="tm-adv-race-title">Потенциал наград</div>';
          for (const uf of unfundedGood) {
            const color = uf.vp >= 5 ? '#2ecc71' : uf.vp >= 2 ? '#f1c40f' : '#888';
            html += '<div style="font-size:11px;padding:1px 0;color:' + color + '">';
            html += escHtml(uf.name) + ': +' + uf.vp + ' VP (позиция #' + uf.rank + ', счёт ' + uf.myScore + ')';
            html += ' — ' + costs[funded] + ' MC';
            html += '</div>';
          }
          hasContent = true;
        }
      }
    }

    // Award funding cost
    if (pv && pv.game && pv.game.awards) {
      const funded = pv.game.awards.filter(function(a) { return a.playerName || a.color; }).length;
      const costs = [8, 14, 20];
      const nextCost = funded < 3 ? costs[funded] : null;
      const msClaimed = pv.game.milestones ? pv.game.milestones.filter(function(m) { return m.playerName || m.color; }).length : 0;
      html += '<div style="font-size:11px;color:#888;margin-top:4px;padding-top:4px;border-top:1px solid #333">';
      html += 'Вехи: ' + msClaimed + '/3 заявлены | ';
      html += 'Награды: ' + funded + '/3 профинан.';
      if (nextCost) html += ' (след. ' + nextCost + ' MC)';
      html += '</div>';
      hasContent = true;
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'advisor');
    panel.style.display = 'block';
  }

  function toggleAdvisor() {
    advisorVisible = !advisorVisible;
    savePanelState();
    updateAdvisor();
  }

  // ── Toast notification system ──

  const toastQueue = [];
  let toastActive = false;
  let toastEl = null;

  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'tm-toast';
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg, type) {
    toastQueue.push({ msg, type: type || 'info' });
    if (!toastActive) drainToastQueue();
  }

  function drainToastQueue() {
    if (toastQueue.length === 0) { toastActive = false; return; }
    toastActive = true;
    const { msg, type } = toastQueue.shift();
    const el = ensureToast();
    el.textContent = msg;
    el.className = 'tm-toast tm-toast-' + type + ' tm-toast-show';
    setTimeout(() => {
      el.classList.remove('tm-toast-show');
      setTimeout(drainToastQueue, 300);
    }, 2500);
  }

  // Track what we already notified about to avoid spam
  const notifiedCombos = new Set();
  const notifiedMilestones = new Set();

  function checkToastTriggers() {
    if (!enabled) return;

    // 1. Godmode/great combo alerts
    if (typeof TM_COMBOS !== 'undefined') {
      const visibleNames = new Set();
      document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        visibleNames.add(el.getAttribute('data-tm-card'));
      });
      for (const combo of TM_COMBOS) {
        if (combo.r !== 'godmode' && combo.r !== 'great') continue;
        const matched = combo.cards.filter((c) => visibleNames.has(c));
        if (matched.length >= 2) {
          const key = combo.cards.sort().join('+');
          if (!notifiedCombos.has(key)) {
            notifiedCombos.add(key);
            const label = combo.r === 'godmode' ? 'БОГОМОД' : 'Отличное';
            showToast(label + ' комбо: ' + combo.v, combo.r === 'godmode' ? 'godmode' : 'great');
          }
        }
      }
    }

    // 2. Corp synergy card in draft
    const myCorp = detectMyCorp();
    if (myCorp) {
      const selectCards = document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]');
      selectCards.forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;
        const data = TM_RATINGS[name];
        if (data && data.y && data.y.some((syn) => syn === myCorp)) {
          const nKey = 'syn-' + name;
          if (!notifiedCombos.has(nKey)) {
            notifiedCombos.add(nKey);
            showToast('Синергия с корпорацией: ' + ruName(name), 'synergy');
          }
        }
      });
    }

    // 3. Milestone claimable notification
    const pv = getPlayerVueData();
    if (pv && pv.game && pv.game.milestones && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      for (const ms of pv.game.milestones) {
        if (ms.color || ms.playerName) continue; // already claimed
        if (ms.scores) {
          const myMs = ms.scores.find(function(s) { return s.color === myColor; });
          if (myMs && myMs.claimable) {
            const nKey = 'ms-claim-' + ms.name;
            if (!notifiedCombos.has(nKey)) {
              notifiedCombos.add(nKey);
              showToast('Веха доступна: ' + ms.name + '! (8 MC)', 'great');
            }
          }
        }
      }
    }

    // 4. Plant/Heat conversion ready
    if (pv && pv.thisPlayer) {
      const plants = pv.thisPlayer.plants || 0;
      const plantsNeeded = pv.thisPlayer.plantsNeededForGreenery || 8;
      if (plants >= plantsNeeded) {
        const nKey = 'plants-ready-' + detectGeneration();
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🌿 Хватает растений на озеленение! (' + plants + '/' + plantsNeeded + ')', 'info');
        }
      }
      const heat = pv.thisPlayer.heat || 0;
      if (heat >= 8) {
        const nKey = 'heat-ready-' + detectGeneration();
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🔥 Хватает тепла на +1°C! (' + heat + '/8)', 'info');
        }
      }
    }

    // 5. Opponent played S-tier card
    if (pv && pv.players && pv.thisPlayer) {
      for (const opp of pv.players) {
        if (opp.color === pv.thisPlayer.color) continue;
        const color = opp.color;
        if (oppRecentPlays[color]) {
          for (const rp of oppRecentPlays[color]) {
            if (rp.tier === 'S') {
              const nKey = 'opp-s-' + color + '-' + rp.name;
              if (!notifiedCombos.has(nKey)) {
                notifiedCombos.add(nKey);
                showToast('⚠ ' + (opp.name || color) + ' сыграл S-tier: ' + ruName(rp.name), 'synergy');
              }
            }
          }
        }
      }
    }

    // 6. Card pool depletion
    {
      const totalCards = Object.keys(TM_RATINGS).length;
      const seenPct = totalCards > 0 ? Math.round(seenCards.size / totalCards * 100) : 0;
      if (seenPct >= 70) {
        let unseenSA = 0;
        for (const cn in TM_RATINGS) {
          if (!seenCards.has(cn) && (TM_RATINGS[cn].t === 'S' || TM_RATINGS[cn].t === 'A')) unseenSA++;
        }
        const nKey = 'pool-depleted-' + seenPct;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('📊 Пул: ' + seenPct + '% карт увидены. Осталось ' + unseenSA + ' S/A карт', 'info');
        }
      }
    }

    // 7. Panic mode — falling behind significantly
    if (pv && pv.players && pv.thisPlayer) {
      const gen = detectGeneration();
      if (gen >= 4) {
        const myTR = pv.thisPlayer.terraformRating || 0;
        let maxOppTR = 0;
        for (const opp of pv.players) {
          if (opp.color === pv.thisPlayer.color) continue;
          const oppTR = opp.terraformRating || 0;
          if (oppTR > maxOppTR) maxOppTR = oppTR;
        }
        const gap = maxOppTR - myTR;
        if (gap >= 8) {
          const nKey = 'panic-gen-' + gen;
          if (!notifiedCombos.has(nKey)) {
            notifiedCombos.add(nKey);
            const hint = gap >= 15 ? 'Фокус на VP-карты и стандартные проекты!'
              : gap >= 10 ? 'Нужно ускорить TR — стандартные проекты и конвертации'
              : 'Отставание от лидера — наращивай TR';
            showToast('📉 Отставание: −' + gap + ' TR от лидера. ' + hint, 'info');
          }
        }
      }
    }

    // 8. Award fundable — you're leading and can fund
    if (pv && pv.game && pv.game.awards && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      const myMC = pv.thisPlayer.megaCredits || 0;
      const fundedCount = pv.game.awards.filter(function(a) { return a.color || a.playerName; }).length;
      const fundCost = fundedCount === 0 ? 8 : fundedCount === 1 ? 14 : fundedCount === 2 ? 20 : 999;
      if (myMC >= fundCost && fundedCount < 3) {
        for (const award of pv.game.awards) {
          if (award.color || award.playerName) continue;
          if (!award.scores) continue;
          const myAward = award.scores.find(function(s) { return s.color === myColor; });
          if (!myAward) continue;
          const maxOppScore = Math.max.apply(null, award.scores.filter(function(s) { return s.color !== myColor; }).map(function(s) { return s.playerScore || 0; }));
          if ((myAward.playerScore || 0) > maxOppScore) {
            const nKey = 'award-lead-' + award.name + '-gen-' + detectGeneration();
            if (!notifiedCombos.has(nKey)) {
              notifiedCombos.add(nKey);
              showToast('🏆 Лидируешь в ' + award.name + '! Финансирование: ' + fundCost + ' MC', 'great');
            }
          }
        }
      }
    }

    // 9. Production milestone — significant production thresholds
    if (pv && pv.thisPlayer) {
      const gen = detectGeneration();
      const mcProd = pv.thisPlayer.megaCreditProduction || 0;
      const totalProd = mcProd + (pv.thisPlayer.steelProduction || 0) * 2 + (pv.thisPlayer.titaniumProduction || 0) * 3
        + (pv.thisPlayer.plantsProduction || 0) + (pv.thisPlayer.energyProduction || 0) + (pv.thisPlayer.heatProduction || 0);
      if (totalProd >= 20 && gen <= 5) {
        const nKey = 'prod-milestone-20-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('💪 Мощный движок! Прод ' + totalProd + ' MC-экв/пок', 'great');
        }
      } else if (totalProd >= 30) {
        const nKey = 'prod-milestone-30-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🚀 Движок на максимуме! Прод ' + totalProd + ' MC-экв/пок', 'godmode');
        }
      }
    }

    // 10. Colony trade reminder — unused trades
    if (pv && pv.thisPlayer && pv.game && pv.game.colonies) {
      const fleetSize = pv.thisPlayer.fleetSize || 1;
      const tradesUsed = pv.thisPlayer.tradesThisGeneration || 0;
      const tradesLeft = Math.max(0, fleetSize - tradesUsed);
      if (tradesLeft > 0 && pv.game.colonies.length > 0) {
        const gen = detectGeneration();
        const nKey = 'trade-remind-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          if (tradesLeft === fleetSize) {
            showToast('🚢 ' + tradesLeft + ' торговля доступна! Не забудь колонии', 'info');
          }
        }
      }
    }

    // 11. Turmoil ruling party change awareness
    if (pv && pv.game && pv.game.turmoil) {
      const turmoil = pv.game.turmoil;
      const ruling = turmoil.ruling || turmoil.rulingParty;
      if (ruling) {
        const gen = detectGeneration();
        const nKey = 'turmoil-ruling-' + ruling + '-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          const partyBonuses = {
            'Mars First': 'Бонус за карты с тегом Mars',
            'Scientists': 'Бонус за Science теги',
            'Unity': 'Бонус за Venus/Earth/Jovian теги',
            'Greens': 'Бонус за Plant/Microbe/Animal теги',
            'Reds': 'TR замедляется',
            'Kelvinists': 'Бонус за heat production'
          };
          const hint = partyBonuses[ruling] || '';
          showToast('🏛 Правящая партия: ' + ruling + (hint ? '. ' + hint : ''), 'info');
        }
      }
    }

    // 12. Double greenery — plants for 2+ greeneries
    if (pv && pv.thisPlayer) {
      const plants = pv.thisPlayer.plants || 0;
      const needed = pv.thisPlayer.plantsNeededForGreenery || 8;
      if (plants >= needed * 2) {
        const gen = detectGeneration();
        const nKey = 'double-green-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          const count = Math.floor(plants / needed);
          showToast('🌿🌿 Растений хватает на ' + count + ' озеленений! (' + plants + '/' + needed + ')', 'great');
        }
      }
    }

    // 13. Standard Project timing advisor
    if (pv && pv.thisPlayer && pv.game) {
      const gen = detectGeneration();
      const p = pv.thisPlayer;
      const myMC = p.megaCredits || 0;
      const mySt = p.steel || 0;
      const myTi = p.titanium || 0;
      const stVal = p.steelValue || 2;
      const tiVal = p.titaniumValue || 3;
      const g = pv.game;

      // Reds ruling — TR raises cost +3 MC extra
      var turmoil = g.turmoil;
      var redsRuling = turmoil && (turmoil.ruling === 'Reds' || turmoil.rulingParty === 'Reds');

      // Late game (gen 7+): standard projects become VP-efficient
      if (gen >= 7) {
        var spAdvice = [];
        // Greenery SP: 23 MC, +1 VP +1 O₂
        if (typeof g.oxygenLevel === 'number' && g.oxygenLevel < 14) {
          var greenCost = 23;
          var stDiscount = Math.min(mySt, Math.floor(greenCost / stVal)) * stVal;
          var effectiveCost = greenCost - stDiscount;
          if (myMC + mySt * stVal >= greenCost) {
            spAdvice.push('🌿 Озеленение ' + effectiveCost + ' MC → 1 VP + O₂');
          }
        }
        // Asteroid SP: 14 MC, +1 temp (Reds: +3 MC)
        if (typeof g.temperature === 'number' && g.temperature < 8) {
          var astCost = 14 + (redsRuling ? 3 : 0);
          if (myMC >= astCost) {
            spAdvice.push('☄ Астероид ' + astCost + ' MC → +1°C' + (redsRuling ? ' (Reds +3)' : ''));
          }
        }
        // Aquifer SP: 18 MC, +1 ocean
        if (typeof g.oceans === 'number' && g.oceans < 9) {
          var aquaCost = 18 + (redsRuling ? 3 : 0);
          if (myMC >= aquaCost) {
            spAdvice.push('🌊 Океан ' + aquaCost + ' MC → +1 TR' + (redsRuling ? ' (Reds +3)' : ''));
          }
        }
        // City SP: 25 MC
        if (myMC + mySt * stVal >= 25) {
          spAdvice.push('🏙 Город 25 MC → 1+ VP adjacency');
        }

        if (spAdvice.length >= 2) {
          var nKey = 'sp-advice-' + gen;
          if (!notifiedCombos.has(nKey)) {
            notifiedCombos.add(nKey);
            showToast('💡 СП доступны: ' + spAdvice.slice(0, 2).join(' | '), 'info');
          }
        }
      }

      // Reds ruling specific warning
      if (redsRuling && gen >= 3) {
        var nKey = 'reds-cost-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🔴 Reds правят: TR raises стоят +3 MC!', 'info');
        }
      }
    }

    // 14. Event timing windows
    checkEventTimingWindows();
  }

  // 14. Event timing windows — play-now-or-miss alerts for cards in hand
  function checkEventTimingWindows() {
    if (!enabled) return;
    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.game) return;

    var handCards = getMyHandNames();
    if (handCards.length === 0) return;

    var g = pv.game;
    var temp = typeof g.temperature === 'number' ? g.temperature : null;
    var oxy = typeof g.oxygenLevel === 'number' ? g.oxygenLevel : null;
    var oce = typeof g.oceans === 'number' ? g.oceans : null;
    var gen = detectGeneration();

    for (var i = 0; i < handCards.length; i++) {
      var name = handCards[i];
      var data = TM_RATINGS[name];
      if (!data || !data.e) continue;
      var econ = data.e.toLowerCase();

      // Detect requirement-based closing windows
      var windowWarning = null;

      // Temperature upper limit requirements (e.g., "temp < 0", "max -2°C")
      if (econ.includes('temp') && (econ.includes('<') || econ.includes('max') || econ.includes('макс'))) {
        if (temp !== null && temp >= -2) {
          windowWarning = 'Темп. ' + temp + '°C — скоро закроется!';
        }
      }
      // Oxygen upper limit (e.g., "O₂ < 5%")
      if (econ.includes('oxygen') && (econ.includes('<') || econ.includes('max'))) {
        if (oxy !== null && oxy >= 11) {
          windowWarning = 'O₂ ' + oxy + '% — скоро закроется!';
        }
      }
      // Ocean limit (e.g., "max 3 oceans")
      if (econ.includes('ocean') && (econ.includes('<') || econ.includes('max'))) {
        if (oce !== null && oce >= 7) {
          windowWarning = 'Океаны ' + oce + '/9 — скоро закроется!';
        }
      }
      // General "requirement" cards that become harder late
      if (econ.includes('require') && gen >= 7) {
        // Generic late-game warning for requirement cards still in hand
        if (!windowWarning) windowWarning = 'Поколение ' + gen + ' — сыграй скоро';
      }

      if (windowWarning) {
        var nKey = 'evt-window-' + name + '-' + gen;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('⏰ ' + (ruName(name) || name) + ': ' + windowWarning, 'info');
        }
      }
    }
  }

  // ── Draft recommendation engine ──

  function getMyTableauNames() {
    const names = [];
    document.querySelectorAll('.player_home_block--cards .card-container[data-tm-card]').forEach((el) => {
      const n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    return names;
  }

  function getMyHandNames() {
    const names = [];
    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach((el) => {
      const n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    return names;
  }

  // ── Player context for draft scoring ──

  // Corporation tag discounts (corp name → { tag: discount })
  // Only COST REDUCTIONS — triggers that give resources/production go to TAG_TRIGGERS
  const CORP_DISCOUNTS = {
    'Teractor': { earth: 3 },
    'Cheung Shing MARS': { building: 2 },
    'Thorgate': { power: 3 },
    'Terralabs': { _all: 1 },       // 1 MC buy cost instead of 3 → ~1 MC effective discount
    'Polaris': { _ocean: 2 },       // -2 MC on cards that place oceans (niche)
    'Inventrix': { _req: 2 },       // +/-2 on global requirements → effectively cheaper cards
    'Morning Star Inc': { venus: 2 },
    'Manutech': { _all: 0 },        // No discount, but prod=resource → placeholder for trigger
    'Stormcraft Incorporated': { jovian: 0 }, // Floater value, no direct discount
    'Energia': { power: 1 },        // +1 energy prod per power tag
  };

  // Cards that provide tag discounts (card name → { tag: discount })
  const CARD_DISCOUNTS = {
    'Earth Office': { earth: 3 },
    'Mass Converter': { space: 2 },
    'Space Station': { space: 2 },
    'Research Outpost': { _all: 1 },
    'Cutting Edge Technology': { _req: 2 },
    'Anti-Gravity Technology': { _all: 2 },
    'Earth Catapult': { _all: 2 },
    'Quantum Extractor': { space: 2 },
    'Shuttles': { space: 2 },
    'Warp Drive': { space: 4 },
    'Sky Docks': { _all: 1 },
    'Mercurian Alliances': { _all: 2 },  // 2 Wild tags — approximated as general discount
    'Dirigibles': { venus: 2 },
    'Luna Conference': { _all: 1 },       // -1 MC per science tag played (effect)
    'Media Archives': { event: 1 },       // +1 MC per event played (effect)
    'Science Fund': { science: 2 },       // Effective discount on science cards
    'Recruited Scientists': { _all: 1 },  // Prelude effect — ongoing discount
  };

  // Tag triggers: card/corp name → array of { tags: [...], value: N, desc: string }
  // value = approximate MC value of the trigger firing once
  const TAG_TRIGGERS = {
    // ── Science triggers ──
    'Olympus Conference': [{ tags: ['science'], value: 4, desc: 'Olympus Conf → карта' }],
    'Mars University': [{ tags: ['science'], value: 3, desc: 'Mars Uni → обмен' }],
    'Crescent Research': [{ tags: ['science'], value: 1, desc: 'Cresc Res → +1 MC' }],
    'High-Tech Lab': [{ tags: ['science'], value: 2, desc: 'Hi-Tech Lab → draw' }],
    'Research Coordination': [{ tags: ['science'], value: 2, desc: 'Science → Res Coord +wild' }],
    'Science Fund': [{ tags: ['science'], value: 2, desc: 'Sci Fund → +2 MC' }],

    // ── Earth triggers ──
    'Point Luna': [{ tags: ['earth'], value: 4, desc: 'Point Luna → карта' }],
    'Luna Mining': [{ tags: ['earth'], value: 4, desc: 'Luna Mining → +1 ti-прод' }],
    'Teractor': [{ tags: ['earth'], value: 3, desc: 'Teractor → −3 MC' }],
    'Earth Office': [{ tags: ['earth'], value: 3, desc: 'Earth Office → −3 MC' }],
    'Lunar Exports': [{ tags: ['earth'], value: 2, desc: 'Lunar Exp → +1 MC-прод' }],

    // ── Event triggers ──
    'Media Group': [{ tags: ['event'], value: 3, desc: 'Media Group → +3 MC' }],
    'Interplanetary Cinematics': [{ tags: ['event'], value: 2, desc: 'IC → +2 MC' }],
    'Media Archives': [{ tags: ['event'], value: 1, desc: 'Media Arch → +1 MC' }],

    // ── Jovian triggers ──
    'Saturn Systems': [{ tags: ['jovian'], value: 4, desc: 'Saturn Sys → +1 MC-прод' }],
    'Titan Floating Launch-Pad': [{ tags: ['jovian'], value: 2, desc: 'Titan FLP → флоатер' }],
    'Jovian Embassy': [{ tags: ['jovian'], value: 2, desc: 'Jov Emb → +1 MC-прод' }],

    // ── Microbe triggers ──
    'Splice': [{ tags: ['microbe'], value: 2, desc: 'Splice → +2 MC' }],
    'Topsoil Contract': [{ tags: ['microbe'], value: 1, desc: 'Topsoil → +1 MC' }],

    // ── Venus triggers ──
    'Morning Star Inc': [{ tags: ['venus'], value: 2, desc: 'MSI → −2 req' }],
    'Dirigibles': [{ tags: ['venus'], value: 2, desc: 'Dirig → −2 MC' }],
    'Celestic': [{ tags: ['venus'], value: 1, desc: 'Celestic → флоатер' }],
    'Stratospheric Birds': [{ tags: ['venus'], value: 1, desc: 'Strato Birds → +1 VP' }],

    // ── Animal/Plant/Bio triggers ──
    'Arklight': [
      { tags: ['animal'], value: 5, desc: 'Arklight → +1 MC-прод' },
      { tags: ['plant'], value: 5, desc: 'Arklight → +1 MC-прод' },
    ],
    'Decomposers': [
      { tags: ['animal'], value: 2, desc: 'Decomp → ресурс' },
      { tags: ['plant'], value: 2, desc: 'Decomp → ресурс' },
      { tags: ['microbe'], value: 2, desc: 'Decomp → ресурс' },
    ],
    'Meat Industry': [{ tags: ['animal'], value: 2, desc: 'Meat Ind → +2 MC' }],
    'Ecological Zone': [
      { tags: ['animal'], value: 1, desc: 'Eco Zone → VP' },
      { tags: ['plant'], value: 1, desc: 'Eco Zone → VP' },
    ],
    'Viral Enhancers': [
      { tags: ['animal'], value: 1, desc: 'Viral Enh → растение' },
      { tags: ['plant'], value: 1, desc: 'Viral Enh → растение' },
      { tags: ['microbe'], value: 1, desc: 'Viral Enh → растение' },
    ],
    'Ecology Experts': [
      { tags: ['plant'], value: 3, desc: 'Eco Exp → −5 req' },
    ],

    // ── Building triggers ──
    'Recyclon': [{ tags: ['building'], value: 1, desc: 'Recyclon → микроб' }],
    'Mining Guild': [{ tags: ['building'], value: 2, desc: 'Mining Guild → +1 steel-прод' }],
    'PhilAres': [{ tags: ['building'], value: 2, desc: 'PhilAres → +1 MC/тайл' }],
    'United Planetary Alliance': [{ tags: ['building'], value: 1, desc: 'UPA → +1 TR' }],

    // ── City triggers ──
    'Immigrant Community': [{ tags: ['city'], value: 3, desc: 'Immig Comm → +1 MC-прод' }],
    'Tharsis Republic': [{ tags: ['city'], value: 3, desc: 'Tharsis → +1 MC-прод' }],
    'Rover Construction': [{ tags: ['city'], value: 2, desc: 'Rover Constr → +2 MC' }],

    // ── Space triggers ──
    'Optimal Aerobraking': [{ tags: ['space'], value: 3, desc: 'Opt Aero → +3 MC/тепло' }],
    'Warp Drive': [{ tags: ['space'], value: 4, desc: 'Warp Drive → −4 MC' }],
    'Mass Converter': [{ tags: ['space'], value: 3, desc: 'Mass Conv → −5 MC' }],
    'Space Station': [{ tags: ['space'], value: 2, desc: 'Space Stn → −2 MC' }],
    'Shuttles': [{ tags: ['space'], value: 2, desc: 'Shuttles → −2 MC' }],

    // ── Power triggers ──
    'Thorgate': [{ tags: ['power'], value: 3, desc: 'Thorgate → −3 MC' }],

    // ── Wild/Multi triggers ──
    'Earth Catapult': [
      { tags: ['building', 'space', 'science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars'], value: 2, desc: 'E-Catapult → −2 MC' },
    ],
    'Anti-Gravity Technology': [
      { tags: ['building', 'space', 'science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars'], value: 2, desc: 'Anti-Grav → −2 MC' },
    ],
  };

  // Keywords for detecting production/VP cards in the card description
  const PROD_KEYWORDS = ['прод', 'prod', 'production', 'increase'];
  const VP_KEYWORDS = ['VP', 'vp', 'ПО', 'victory point'];

  // Take-that cards: 3P context warnings
  const TAKE_THAT_CARDS = {
    'Hackers': 'Отнимает MC-прод у оппонента — третий игрок выигрывает бесплатно',
    'Energy Tapping': 'Отнимает energy-прод + теряешь 1 VP',
    'Biomass Combustors': 'Отнимает plant-прод у оппонента',
    'Predators': 'Убирает animal у оппонента каждый ход',
    'Ants': 'Убирает microbe у оппонента каждый ход',
    'Virus': 'Убирает до 5 растений у оппонента',
    'Flooding': 'Занимает тайл оппонента',
    'Mining Strike': 'Отнимает steel-прод',
    'Power Supply Consortium': 'Отнимает energy-прод у оппонента',
    'Great Escarpment Consortium': 'Отнимает steel-прод у оппонента',
    'Hired Raiders': 'Крадёт steel или MC у оппонента',
    'Sabotage': 'Отнимает titanium/steel/MC у оппонента',
    'Asteroid Mining Consortium': 'Отнимает ti-прод у оппонента',
    'Comet': 'Убирает до 3 растений у оппонента',
    'Giant Ice Asteroid': 'Убирает до 6 растений у оппонента',
    'Deimos Down': 'Убирает до 8 растений у оппонента',
  };

  // Cards that accept animal/microbe resource placement
  const ANIMAL_TARGETS = [
    'Birds', 'Fish', 'Livestock', 'Predators', 'Small Animals', 'Pets',
    'Ecological Zone', 'Penguins', 'Marine Apes', 'Security Fleet',
    'Venusian Animals', 'Venusian Insects', 'Stratospheric Birds',
    'Directed Impactors', 'Ants', 'Tardigrades', 'Extremophiles',
    'Aerosport Tournament', 'Jupiter Floating Station',
  ];
  const MICROBE_TARGETS = [
    'Decomposers', 'Ants', 'Tardigrades', 'Extremophiles',
    'Nitrite Reducing Bacteria', 'GHG Producing Bacteria', 'Psychrophiles',
    'Sulphur-Eating Bacteria', 'Thermophiles', 'Viral Enhancers',
    'Topsoil Contract', 'Recyclon',
  ];

  // Cards that place animals/microbes on OTHER cards
  const ANIMAL_PLACERS = [
    'Large Convoy', 'Imported Nitrogen', 'Imported Hydrogen',
    'Local Shading', 'Herbivores', 'Bio Printing Facility',
  ];
  const MICROBE_PLACERS = [
    'Imported Nitrogen', 'Imported Hydrogen', 'Local Shading',
    'Sponsored Academies', 'Bio Printing Facility',
  ];

  // Tag → which milestone/award it contributes to (tag: [{name, type, tag}])
  // Built from MA_DATA at init
  const TAG_TO_MA = {};
  for (const [maName, ma] of Object.entries(MA_DATA)) {
    if (ma.check === 'tags' && ma.tag) {
      if (!TAG_TO_MA[ma.tag]) TAG_TO_MA[ma.tag] = [];
      TAG_TO_MA[ma.tag].push({ name: maName, type: ma.type, target: ma.target || 0 });
    }
    if (ma.check === 'bioTags') {
      for (const bt of ['plant', 'microbe', 'animal']) {
        if (!TAG_TO_MA[bt]) TAG_TO_MA[bt] = [];
        TAG_TO_MA[bt].push({ name: maName, type: ma.type, target: ma.target || 0, bio: true });
      }
    }
  }

  function getPlayerContext() {
    const pv = getPlayerVueData();
    const gen = detectGeneration();
    let gensLeft = Math.max(1, 9 - gen);
    // Better gensLeft estimate based on remaining global param raises
    if (pv && pv.game) {
      const g = pv.game;
      const tempLeft = g.temperature != null ? Math.max(0, (8 - g.temperature) / 2) : 0;
      const oxyLeft = g.oxygenLevel != null ? Math.max(0, 14 - g.oxygenLevel) : 0;
      const oceanLeft = g.oceans != null ? Math.max(0, 9 - g.oceans) : 0;
      const totalRaises = tempLeft + oxyLeft + oceanLeft;
      // ~3 raises per gen (2 player actions + 1 WGT in 3P)
      const paramBasedGL = Math.ceil(totalRaises / 3);
      gensLeft = Math.max(1, Math.min(gensLeft, paramBasedGL));
    }
    const myCorp = detectMyCorp();

    const ctx = {
      gen: gen,
      gensLeft: gensLeft,
      tags: {},
      discounts: {},
      tagTriggers: [],
      mc: 0,
      steel: 0,
      steelVal: 2,
      titanium: 0,
      tiVal: 3,
      heat: 0,
      colonies: 0,
      prod: { mc: 0, steel: 0, ti: 0, plants: 0, energy: 0, heat: 0 },
      tr: 0,
      // Milestone/Award context
      activeMA: [],       // [{name, type, check, tag, target, current, pct}]
      milestoneNeeds: {},  // tag → how many more needed for closest milestone
      milestoneSpecial: {}, // check_type → need (e.g. 'cities' → 1, 'events' → 2)
      awardTags: {},       // tag → true if tag-based award is active
      awardRacing: {},     // award_name → { myScore, bestOpp, delta, leading }
      // Board state
      cities: 0,
      greeneries: 0,
      events: 0,
      handSize: 0,
      tableauSize: 0,
      uniqueTagCount: 0,
      // Resource targets in tableau
      animalTargets: 0,
      microbeTargets: 0,
      tableauNames: new Set(),
    };

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;

      // Resources
      ctx.mc = p.megaCredits || 0;
      ctx.steel = p.steel || 0;
      ctx.steelVal = p.steelValue || 2;
      ctx.titanium = p.titanium || 0;
      ctx.tiVal = p.titaniumValue || 3;
      ctx.heat = p.heat || 0;
      ctx.tr = p.terraformRating || 0;

      // Production
      ctx.prod.mc = p.megaCreditProduction || 0;
      ctx.prod.steel = p.steelProduction || 0;
      ctx.prod.ti = p.titaniumProduction || 0;
      ctx.prod.plants = p.plantProduction || 0;
      ctx.prod.energy = p.energyProduction || 0;
      ctx.prod.heat = p.heatProduction || 0;

      // Colonies + trade fleets
      ctx.colonies = p.coloniesCount || 0;
      ctx.fleetSize = p.fleetSize || 1;
      ctx.tradesUsed = p.tradesThisGeneration || 0;
      ctx.tradesLeft = Math.max(0, ctx.fleetSize - ctx.tradesUsed);
      ctx.coloniesOwned = 0;
      if (pv.game && pv.game.colonies) {
        const myColor = p.color;
        for (const col of pv.game.colonies) {
          if (col.colonies) {
            for (const c of col.colonies) {
              if (c.player === myColor) ctx.coloniesOwned++;
            }
          }
        }
      }

      // Board state: cities, greeneries, events, hand, tableau
      ctx.handSize = p.cardsInHandNbr || (p.cardsInHand ? p.cardsInHand.length : 0);
      ctx.tableauSize = p.tableau ? p.tableau.length : 0;
      // Cities/greeneries from pre-aggregated playerTiles (vue-bridge)
      if (pv.game && pv.game.playerTiles && p.color && pv.game.playerTiles[p.color]) {
        ctx.cities = pv.game.playerTiles[p.color].cities || 0;
        ctx.greeneries = pv.game.playerTiles[p.color].greeneries || 0;
      }
      // Count events played (red cards in tableau)
      if (p.tableau) {
        for (const card of p.tableau) {
          const cn = card.name || card;
          const d = TM_RATINGS[cn];
          if (d && d.t === 'event') ctx.events++;
        }
      }
      // Unique tags
      ctx.uniqueTagCount = 0;

      // Tags — array [{tag,count}] (normalized by vue-bridge)
      if (p.tags && Array.isArray(p.tags)) {
        for (const t of p.tags) {
          const tagName = (t.tag || '').toLowerCase();
          if (tagName && t.count > 0) {
            ctx.tags[tagName] = t.count;
            ctx.uniqueTagCount++;
          }
        }
      }

      // Corp discounts — apply from ALL corps (Two Corps support)
      var allCorpsCtx = detectMyCorps();
      for (var dci = 0; dci < allCorpsCtx.length; dci++) {
        var dcCorp = allCorpsCtx[dci];
        if (CORP_DISCOUNTS[dcCorp]) {
          var cd = CORP_DISCOUNTS[dcCorp];
          for (const tag in cd) {
            ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
          }
        }
      }

      // Card discounts + tag triggers + resource targets from tableau
      if (p.tableau) {
        for (const card of p.tableau) {
          const cname = card.name || card;
          ctx.tableauNames.add(cname);
          if (ANIMAL_TARGETS.includes(cname)) ctx.animalTargets++;
          if (MICROBE_TARGETS.includes(cname)) ctx.microbeTargets++;
        }
      }

      // Board space tracking
      ctx.emptySpaces = 0;
      ctx.totalOccupied = 0;
      ctx.oceansOnBoard = 0;
      if (pv.game && pv.game.spaces) {
        for (const sp of pv.game.spaces) {
          if (sp.spaceType === 'land' || sp.spaceType === 'ocean') {
            if (sp.tileType != null && sp.tileType !== undefined) {
              ctx.totalOccupied++;
              if (sp.tileType === 'ocean' || sp.tileType === 2) ctx.oceansOnBoard++;
            } else {
              ctx.emptySpaces++;
            }
          }
        }
      }
      ctx.boardFullness = (ctx.emptySpaces + ctx.totalOccupied) > 0 ? ctx.totalOccupied / (ctx.emptySpaces + ctx.totalOccupied) : 0;

      // Resource accumulation rates
      ctx.microbeAccumRate = 0;
      ctx.floaterAccumRate = 0;
      ctx.animalAccumRate = 0;
      if (p.tableau) {
        for (const card of p.tableau) {
          const cn = card.name || card;
          const fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cn] : null;
          if (fx) {
            if (fx.vpAcc && fx.vpPer) {
              const rd = TM_RATINGS[cn];
              if (rd && rd.e) {
                const eLow = rd.e.toLowerCase();
                if (eLow.includes('microb') || eLow.includes('микроб')) ctx.microbeAccumRate += fx.vpAcc;
                if (eLow.includes('floater') || eLow.includes('флоат')) ctx.floaterAccumRate += fx.vpAcc;
                if (eLow.includes('animal') || eLow.includes('жив')) ctx.animalAccumRate += fx.vpAcc;
              }
            }
          }
        }
      }

      // Energy consumers detection
      ctx.hasEnergyConsumers = false;
      if (p.tableau) {
        for (const card of p.tableau) {
          const cn = card.name || card;
          const fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cn] : null;
          if (fx && fx.ep && fx.ep < 0) { ctx.hasEnergyConsumers = true; break; }
        }
      }

      for (const cardName in CARD_DISCOUNTS) {
        if (ctx.tableauNames.has(cardName)) {
          const cd = CARD_DISCOUNTS[cardName];
          for (const tag in cd) {
            ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
          }
        }
      }

      for (const cardName in TAG_TRIGGERS) {
        if (ctx.tableauNames.has(cardName) || cardName === myCorp) {
          for (const trigger of TAG_TRIGGERS[cardName]) {
            ctx.tagTriggers.push(trigger);
          }
        }
      }

      // Milestone/Award proximity
      const activeNames = detectActiveMA();
      for (const [maName, ma] of Object.entries(MA_DATA)) {
        if (activeNames.length > 0 && !activeNames.some((n) => n.includes(maName))) continue;

        let current = 0;
        if (ma.check === 'tags' && ma.tag) {
          current = ctx.tags[ma.tag] || 0;
        } else if (ma.check === 'bioTags') {
          current = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
        } else if (ma.check === 'prod' && ma.resource) {
          current = ctx.prod[ma.resource] || ctx.prod[ma.resource === 'megacredits' ? 'mc' : ma.resource] || 0;
        } else if (ma.check === 'tr') {
          current = ctx.tr;
        } else if (ma.check === 'cities') {
          current = ctx.cities;
        } else if (ma.check === 'greeneries') {
          current = ctx.greeneries;
        } else if (ma.check === 'events') {
          current = ctx.events;
        } else if (ma.check === 'hand') {
          current = ctx.handSize;
        } else if (ma.check === 'tableau') {
          current = ctx.tableauSize;
        } else if (ma.check === 'uniqueTags') {
          current = ctx.uniqueTagCount;
        } else if (ma.check === 'maxTag') {
          // Most of any single non-earth tag
          let maxT = 0;
          for (const tg in ctx.tags) {
            if (tg !== 'earth' && tg !== 'event' && ctx.tags[tg] > maxT) maxT = ctx.tags[tg];
          }
          current = maxT;
        } else if (ma.check === 'maxProd') {
          // Max of any single production
          current = Math.max(ctx.prod.mc, ctx.prod.steel, ctx.prod.ti, ctx.prod.plants, ctx.prod.energy, ctx.prod.heat);
        } else {
          continue;
        }

        const target = ma.target || 0;
        const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        ctx.activeMA.push({ name: maName, type: ma.type, check: ma.check, tag: ma.tag, target, current, pct, resource: ma.resource });

        // Milestone tag proximity: how many more tags needed?
        if (ma.type === 'milestone' && ma.check === 'tags' && ma.tag && target > 0) {
          const need = target - current;
          if (need > 0 && need <= 3) {
            const prev = ctx.milestoneNeeds[ma.tag];
            if (prev === undefined || need < prev) {
              ctx.milestoneNeeds[ma.tag] = need;
            }
          }
        }
        // Ecologist: bio tags for milestone
        if (ma.type === 'milestone' && ma.check === 'bioTags' && target > 0) {
          const bioCount = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
          const need = target - bioCount;
          if (need > 0 && need <= 3) {
            for (const bt of ['plant', 'microbe', 'animal']) {
              const prev = ctx.milestoneNeeds[bt];
              if (prev === undefined || need < prev) {
                ctx.milestoneNeeds[bt] = need;
              }
            }
          }
        }
        // Non-tag milestone proximity (cities, greeneries, events, TR, prod, etc.)
        if (ma.type === 'milestone' && target > 0 && ma.check !== 'tags' && ma.check !== 'bioTags') {
          const need = target - current;
          if (need > 0 && need <= 3) {
            const key = ma.check + (ma.resource ? '_' + ma.resource : '');
            const prev = ctx.milestoneSpecial[key];
            if (prev === undefined || need < prev) {
              ctx.milestoneSpecial[key] = { need: need, name: maName };
            }
          }
        }

        // Award: mark tag-based awards as active
        if (ma.type === 'award' && ma.check === 'tags' && ma.tag) {
          ctx.awardTags[ma.tag] = true;
        }

        // Award racing: compare my score vs opponents for funded awards
        if (ma.type === 'award' && pv.game && pv.game.awards && pv.game.players) {
          const funded = pv.game.awards.find(function(aw) {
            return (aw.name || '').toLowerCase().includes(maName.toLowerCase()) ||
                   maName.toLowerCase().includes((aw.name || '').toLowerCase());
          });
          if (funded && (funded.playerName || funded.player || funded.color)) {
            let bestOpp = 0;
            const myColor = pv.thisPlayer.color;
            for (const opp of pv.game.players) {
              if (opp.color === myColor) continue;
              let oppScore = 0;
              if (ma.check === 'tags' && ma.tag && opp.tags) {
                for (const t of opp.tags) {
                  if ((t.tag || '').toLowerCase() === ma.tag) oppScore = t.count || 0;
                }
              } else if (ma.check === 'tr') {
                oppScore = opp.terraformRating || 0;
              } else if (ma.check === 'prod' && ma.resource) {
                const rName = ma.resource === 'megacredits' ? 'megaCreditProduction' : ma.resource + 'Production';
                oppScore = opp[rName] || 0;
              } else if (ma.check === 'greeneries' && pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === opp.color && (sp.tileType === 'greenery' || sp.tileType === 1)) oppScore++;
                }
              } else if (ma.check === 'cities' && pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === opp.color && (sp.tileType === 'city' || sp.tileType === 0 || sp.tileType === 'capital' || sp.tileType === 5)) oppScore++;
                }
              } else if (ma.check === 'steelTi') {
                oppScore = (opp.steel || 0) + (opp.titanium || 0);
              } else if (ma.check === 'steelEnergy') {
                oppScore = (opp.steel || 0) + (opp.energy || 0);
              } else if (ma.check === 'resource' && ma.resource === 'heat') {
                oppScore = opp.heat || 0;
              } else if (ma.check === 'tiles' && pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === opp.color) oppScore++;
                }
              } else if (ma.check === 'greenCards' && opp.tableau) {
                for (const card of opp.tableau) {
                  const cn = card.name || card;
                  const d = TM_RATINGS[cn];
                  if (d && d.t === 'green') oppScore++;
                }
              } else if (ma.check === 'expensiveCards' && opp.tableau) {
                for (const card of opp.tableau) {
                  const cn = card.name || card;
                  const d = TM_RATINGS[cn];
                  if (d && typeof d.s === 'number') {
                    const costEl2 = null; // Can't read opponent card cost from DOM
                    // Use card_effects cost if available
                    const fx2 = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cn] : null;
                    if (fx2 && fx2.c >= 20) oppScore++;
                  }
                }
              } else if (ma.check === 'cardResources' && opp.tableau) {
                for (const card of opp.tableau) {
                  if (card.resources) oppScore += card.resources;
                }
              }
              if (oppScore > bestOpp) bestOpp = oppScore;
            }
            // My score for this award
            let myScore = current;
            if (ma.check === 'steelTi') myScore = ctx.steel + ctx.titanium;
            if (ma.check === 'steelEnergy') myScore = ctx.steel + (pv.thisPlayer.energy || 0);
            if (ma.check === 'resource' && ma.resource === 'heat') myScore = ctx.heat;
            if (ma.check === 'tiles') {
              myScore = 0;
              if (pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === pv.thisPlayer.color) myScore++;
                }
              }
            }
            if (ma.check === 'greenCards') {
              myScore = 0;
              if (pv.thisPlayer.tableau) {
                for (const card of pv.thisPlayer.tableau) {
                  const cn = card.name || card;
                  const d = TM_RATINGS[cn];
                  if (d && d.t === 'green') myScore++;
                }
              }
            }
            if (ma.check === 'cardResources') {
              myScore = 0;
              if (pv.thisPlayer.tableau) {
                for (const card of pv.thisPlayer.tableau) {
                  if (card.resources) myScore += card.resources;
                }
              }
            }
            ctx.awardRacing[maName] = {
              myScore: myScore,
              bestOpp: bestOpp,
              delta: myScore - bestOpp,
              leading: myScore >= bestOpp
            };
          }
        }
      }
    }

    // Global parameters
    ctx.globalParams = { temp: -30, oxy: 0, oceans: 0, venus: 0 };
    if (pv && pv.game) {
      const g = pv.game;
      if (g.temperature != null) ctx.globalParams.temp = g.temperature;
      if (g.oxygenLevel != null) ctx.globalParams.oxy = g.oxygenLevel;
      if (g.oceans != null) ctx.globalParams.oceans = g.oceans;
      if (g.venusScaleLevel != null) ctx.globalParams.venus = g.venusScaleLevel;
    }

    // Opponent corps and key tableau cards
    ctx.oppCorps = [];
    ctx.oppHasTakeThat = false;
    ctx.oppHasAnimalAttack = false;
    ctx.oppHasPlantAttack = false;
    if (pv && pv.game && pv.game.players && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      for (const opp of pv.game.players) {
        if (opp.color === myColor) continue;
        // Detect opponent corp from their tableau or corporation field
        if (opp.tableau) {
          for (const card of opp.tableau) {
            const cn = card.name || card;
            if (card.cardType === 'corp' || (TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp')) {
              ctx.oppCorps.push(cn);
            }
            // Check for take-that cards in opponent tableau
            if (TAKE_THAT_CARDS[cn]) ctx.oppHasTakeThat = true;
            if (cn === 'Predators' || cn === 'Ants') ctx.oppHasAnimalAttack = true;
            if (cn === 'Virus' || cn === 'Giant Ice Asteroid' || cn === 'Deimos Down' || cn === 'Comet') ctx.oppHasPlantAttack = true;
          }
        }
        if (opp.corporationCard) {
          const cn = typeof opp.corporationCard === 'string' ? opp.corporationCard : (opp.corporationCard.name || '');
          if (cn) ctx.oppCorps.push(cn);
        }
      }
    }

    // Map detection
    ctx.mapName = '';
    if (pv && pv.game) ctx.mapName = detectMap(pv.game);

    // Terraform rate — raises per generation
    ctx.terraformRate = 0;
    if (pv && pv.game && ctx.gen > 1) {
      let totalRaises = 0;
      const g = pv.game;
      if (typeof g.temperature === 'number') totalRaises += (g.temperature + 30) / 2;
      if (typeof g.oxygenLevel === 'number') totalRaises += g.oxygenLevel;
      if (typeof g.oceans === 'number') totalRaises += g.oceans;
      ctx.terraformRate = totalRaises / (ctx.gen - 1);
    }

    // Turmoil context
    ctx.turmoilActive = false;
    ctx.rulingParty = '';
    ctx.myDelegates = 0;
    ctx.myInfluence = 0;
    if (pv && pv.game && pv.game.turmoil) {
      ctx.turmoilActive = true;
      const t = pv.game.turmoil;
      if (t.rulingParty) ctx.rulingParty = t.rulingParty;
      ctx.dominantParty = t.dominant || t.dominantParty || '';
      if (pv.thisPlayer) {
        ctx.myInfluence = pv.thisPlayer.politicalAgendasActionUsedCount != null ? 0 : (pv.thisPlayer.influence || 0);
        // Count delegates across all parties
        const myColor = pv.thisPlayer.color;
        if (t.parties) {
          for (const party of t.parties) {
            if (party.delegates) {
              for (const d of party.delegates) {
                if (d === myColor || (d && d.color === myColor)) ctx.myDelegates++;
              }
            }
          }
        }
      }
    }

    return ctx;
  }

  // Corp ability synergy: tag/keyword matching for initial draft scoring
  // Works without game state — matches card DOM tags + data.e keywords (RU+EN) with corp abilities
  const CORP_ABILITY_SYNERGY = {
    'Helion': { tags: ['power'], kw: ['heat', 'тепл', 'temperature', 'температур', 'energy', 'энерг'], b: 5 },
    'Stormcraft Incorporated': { tags: ['jovian', 'venus'], kw: ['floater', 'флоатер'], b: 5 },
    'EcoLine': { tags: ['plant'], kw: ['greenery', 'озелен', 'plant', 'раст'], b: 5 },
    'PhoboLog': { tags: ['space'], kw: ['titanium', 'титан'], b: 4 },
    'Teractor': { tags: ['earth'], kw: [], b: 4 },
    'Point Luna': { tags: ['earth'], kw: [], b: 5 },
    'Arklight': { tags: ['animal', 'plant'], kw: ['animal', 'живот', 'plant', 'раст'], b: 4 },
    'Cheung Shing MARS': { tags: ['building'], kw: ['steel', 'сталь', 'city', 'город'], b: 4 },
    'Mining Guild': { tags: ['building'], kw: ['steel', 'сталь'], b: 4 },
    'Thorgate': { tags: ['power'], kw: ['energy', 'энерг'], b: 4 },
    'Interplanetary Cinematics': { tags: ['event'], kw: [], b: 3 },
    'Morning Star Inc.': { tags: ['venus'], kw: ['venus', 'венус', 'floater', 'флоатер'], b: 4 },
    'Aphrodite': { tags: ['venus'], kw: ['venus', 'венус'], b: 4 },
    'Nirgal Enterprises': { tags: [], kw: ['ocean', 'океан', 'temperature', 'температур', 'oxygen', 'кислород', 'greenery', 'озелен', 'terraform', 'терраформ', 'tr ', '+1 tr', '+2 tr'], b: 4 },
    'Poseidon': { tags: [], kw: ['colony', 'колон', 'trade', 'торгов', 'fleet', 'флот'], b: 5 },
    'Aridor': { tags: [], kw: ['colony', 'колон'], b: 2 },
    'Splice': { tags: ['microbe'], kw: ['microbe', 'микроб'], b: 4 },
    'Saturn Systems': { tags: ['jovian'], kw: [], b: 4 },
    'Septem Tribus': { tags: [], kw: ['delegate', 'делегат', 'influence', 'влияни'], b: 3 },
    'Tharsis Republic': { tags: ['city'], kw: ['city', 'город'], b: 4 },
    'Manutech': { tags: [], kw: ['production', 'прод'], b: 3 },
    'Robinson Industries': { tags: [], kw: ['production', 'прод'], b: 3 },
    'Celestic': { tags: ['venus'], kw: ['floater', 'флоатер'], b: 4 },
    'Recyclon': { tags: ['building'], kw: ['microbe', 'микроб'], b: 3 },
    'Vitor': { tags: [], kw: ['vp', 'VP', 'victory', 'побед'], b: 4 },
    'Inventrix': { tags: ['science'], kw: [], b: 3 },
    'Crescent Research': { tags: ['science'], kw: [], b: 3 },
    'Kuiper Cooperative': { tags: [], kw: ['colony', 'колон', 'trade', 'торгов', 'fleet', 'флот'], b: 4 },
    'Factorum': { tags: ['building'], kw: ['energy', 'энерг'], b: 3 },
    'Gagarin Mobility': { tags: ['space'], kw: ['colony', 'колон', 'trade', 'торгов'], b: 3 },
    'Lakefront Resorts': { tags: [], kw: ['ocean', 'океан', 'city', 'город'], b: 3 },
    'Valley Trust': { tags: ['science'], kw: [], b: 3 },
    'Pharmacy Union': { tags: ['science', 'microbe'], kw: [], b: 3 },
    'EcoTec': { tags: ['plant', 'microbe', 'animal'], kw: [], b: 3 },
    'Arcadian Communities': { tags: [], kw: ['city', 'город'], b: 4 },
    'Philares': { tags: [], kw: ['tile', 'тайл', 'city', 'город', 'greenery', 'озелен', 'ocean', 'океан'], b: 4 },
    'Polaris': { tags: [], kw: ['ocean', 'океан'], b: 4 },
    'Viron': { tags: [], kw: ['action', 'действи'], b: 4 },
    'Terralabs Research': { tags: ['science'], kw: [], b: 3 },
    'Palladin Shipping': { tags: ['space'], kw: ['colony', 'колон', 'trade', 'торгов'], b: 3 },
    'Spire': { tags: ['science', 'building'], kw: [], b: 3 },
    'CrediCor': { tags: [], kw: [], b: 0 },
    'Polyphemos': { tags: [], kw: [], b: 0 },
    'Utopia Invest': { tags: [], kw: ['production', 'прод'], b: 3 },
    'Mons Insurance': { tags: [], kw: ['production', 'прод'], b: 3 },
    'Astrodrill': { tags: [], kw: ['asteroid', 'астероид'], b: 3 },
    'Energia': { tags: ['power'], kw: ['energy', 'энерг'], b: 4 },
    'Pristar': { tags: [], kw: [], b: 0 },
    'Mars Direct': { tags: [], kw: [], b: 0 },
    'Sagitta Frontier Services': { tags: [], kw: [], b: 0 },
  };

  function scoreDraftCard(cardName, myTableau, myHand, myCorp, cardEl, ctx) {
    const data = TM_RATINGS[cardName];
    if (!data) return { total: 0, reasons: [] };

    let bonus = 0;
    const reasons = [];

    // Two Corps support: build array of all corps
    var myCorps = [];
    if (myCorp) myCorps.push(myCorp);
    // Add second corp from detectMyCorps() if available and different
    var allDetected = detectMyCorps();
    for (var ci = 0; ci < allDetected.length; ci++) {
      if (allDetected[ci] && myCorps.indexOf(allDetected[ci]) === -1) myCorps.push(allDetected[ci]);
    }

    // Base score (normalized 0-10 scale from the 0-100 tier score)
    const baseScore = data.s;

    // Corp synergy bonus (+8 per matching corp, max once per corp)
    for (var csi = 0; csi < myCorps.length; csi++) {
      var c = myCorps[csi];
      if (data.y && data.y.some(function(syn) { return syn === c || syn.includes(c); })) {
        bonus += 8;
        reasons.push('Синерг. ' + c.split(' ')[0]);
      }
    }

    // Reverse: does any of my corps synergize with this card?
    for (var cri = 0; cri < myCorps.length; cri++) {
      var cr = myCorps[cri];
      var corpData = TM_RATINGS[cr];
      if (corpData && corpData.y && corpData.y.includes(cardName)) {
        bonus += 5;
        reasons.push('Нужна ' + cr.split(' ')[0]);
      }
    }

    // Synergy with tableau cards (+3 each, max +9)
    const allMyCards = [...myTableau, ...myHand];
    let synCount = 0;
    if (data.y) {
      for (const syn of data.y) {
        if (allMyCards.includes(syn) && synCount < 3) {
          synCount++;
          bonus += 3;
        }
      }
    }
    // Also check if any of my cards list this card as synergy
    for (const myCard of allMyCards) {
      const myData = TM_RATINGS[myCard];
      if (myData && myData.y && myData.y.includes(cardName) && synCount < 3) {
        synCount++;
        bonus += 3;
      }
    }
    if (synCount > 0) reasons.push(synCount + ' синерг.');

    // Combo potential with completion rate
    if (typeof TM_COMBOS !== 'undefined') {
      let bestComboBonus = 0;
      let bestComboDesc = '';
      for (const combo of TM_COMBOS) {
        if (!combo.cards.includes(cardName)) continue;
        const otherCards = combo.cards.filter((c) => c !== cardName);
        const matchCount = otherCards.filter((c) => allMyCards.includes(c)).length;
        if (matchCount === 0) continue;

        const baseBonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
        const completionRate = (matchCount + 1) / combo.cards.length;
        let comboBonus = Math.round(baseBonus * (1 + completionRate));

        // Gen-aware timing: action combos scale with gensLeft, prod combos bad late, VP-burst good late
        if (ctx) {
          let timingMul = 1.0;
          if (ctx.gensLeft !== undefined) {
            const eLower = (data.e || '').toLowerCase();
            const cardIsBlue = eLower.includes('action');
            const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
            const isVPBurst = eLower.includes('vp') && !isProd && !cardIsBlue;
            const isAccum = eLower.includes('vp per') || eLower.includes('vp за');

            if (cardIsBlue) {
              // Action combos: much better early, bad late
              timingMul = ctx.gensLeft >= 6 ? 1.5 : ctx.gensLeft >= 4 ? 1.2 : ctx.gensLeft >= 2 ? 0.8 : 0.5;
            } else if (isProd) {
              // Production combos: great early, worthless late
              timingMul = ctx.gensLeft >= 5 ? 1.3 : ctx.gensLeft >= 3 ? 1.0 : 0.4;
            } else if (isVPBurst) {
              // VP-burst combos (CEO's Fav Project, etc.): better late
              timingMul = ctx.gensLeft <= 2 ? 1.4 : ctx.gensLeft <= 4 ? 1.1 : 0.8;
            } else if (isAccum) {
              // VP accumulator combos: scale with remaining gens
              timingMul = ctx.gensLeft >= 5 ? 1.4 : ctx.gensLeft >= 3 ? 1.1 : 0.6;
            }
          }
          comboBonus = Math.round(comboBonus * timingMul);
        }

        if (comboBonus > bestComboBonus) {
          bestComboBonus = comboBonus;
          bestComboDesc = combo.v + ' (' + (matchCount + 1) + '/' + combo.cards.length + ')';
        }
      }
      if (bestComboBonus > 0) {
        bonus += bestComboBonus;
        reasons.push('Комбо: ' + bestComboDesc);
      }
    }

    // Anti-combo penalty
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (const anti of TM_ANTI_COMBOS) {
        if (!anti.cards.includes(cardName)) continue;
        const otherCards = anti.cards.filter((c) => c !== cardName);
        if (otherCards.some((c) => allMyCards.includes(c))) {
          bonus -= 3;
          reasons.push('Конфликт: ' + anti.v);
          break;
        }
      }
    }

    // Detect card tags and cost from DOM (used by context scoring and post-context checks)
    let cardTags = new Set();
    if (cardEl) {
      cardTags = getCardTags(cardEl);
    }
    let cardCost = null;
    if (cardEl) {
      cardCost = getCardCost(cardEl);
    }

    // ── Context-aware scoring (requires ctx and optionally cardEl) ──
    if (ctx) {

      // 0. Requirement feasibility penalty — cards with unmet global requirements penalized by wait time
      if (ctx.globalParams && cardEl) {
        const reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
        const reqText = reqEl ? (reqEl.textContent || '').trim() : '';
        const isMaxReq = reqEl ? /max/i.test(reqText) : false;
        if (reqEl) {
          const gp = ctx.globalParams;

          if (isMaxReq) {
            // Max requirements — if window already closed, card is unplayable
            let windowClosed = false;
            const tmM = reqText.match(/([\-\d]+)\s*°?C/i);
            const oxM = reqText.match(/(\d+)\s*%?\s*O/i);
            const vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
            if (tmM && gp.temp > parseInt(tmM[1])) windowClosed = true;
            if (oxM && gp.oxy > parseInt(oxM[1])) windowClosed = true;
            if (vnM && gp.venus > parseInt(vnM[1])) windowClosed = true;
            if (windowClosed) {
              bonus -= 20;
              reasons.push('Окно закрыто!');
            }
          } else {
            // Min requirements — penalty based on how many gens until met
            let raisesNeeded = 0;
            const tmM = reqText.match(/([\-\d]+)\s*°?C/i);
            const oxM = reqText.match(/(\d+)\s*%?\s*O/i);
            const ocM = reqText.match(/(\d+)\s*ocean/i);
            const vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);

            if (tmM) { const n = parseInt(tmM[1]); if (gp.temp < n) raisesNeeded += (n - gp.temp) / 2; }
            if (oxM) { const n = parseInt(oxM[1]); if (gp.oxy < n) raisesNeeded += n - gp.oxy; }
            if (ocM) { const n = parseInt(ocM[1]); if (gp.oceans < n) raisesNeeded += n - gp.oceans; }
            if (vnM) { const n = parseInt(vnM[1]); if (gp.venus < n) raisesNeeded += (n - gp.venus) / 2; }

            if (raisesNeeded > 0) {
              // ~4 raises/gen default for 3P WGT (temp+oxy+oceans shared + WGT auto-raise)
              const rate = ctx.terraformRate > 0 ? ctx.terraformRate : 4;
              const gensWait = Math.ceil(raisesNeeded / rate);
              // -3 per gen of dead weight (card in hand = 3 MC holding cost), max -15
              const reqPenalty = -Math.min(15, gensWait * 3);
              bonus += reqPenalty;
              reasons.push('Req ~' + gensWait + ' пок.');
            }
          }
        }

        // 0b. Requirement MET bonus — base score penalizes cards for having requirements
        // When the requirement IS met, recover that penalty (harder req = bigger bonus)
        // SKIP for MAX requirements — they're easy early, restrictive late (opposite of min)
        if (reqEl && !isMaxReq) {
          const rt = (reqEl.textContent || '').trim().toLowerCase();
          let hardness = 0;

          // Check tag requirements (e.g. "4 Science", "3 Jovian")
          const tagReqPairs = rt.match(/(\d+)/g);
          if (tagReqPairs) {
            for (const numStr of tagReqPairs) {
              const n = parseInt(numStr);
              if (n >= 2 && n <= 8) hardness = Math.max(hardness, n);
            }
          }

          // Global parameter hardness (high thresholds = harder)
          const tmpM = rt.match(/([\-\d]+)\s*°/);
          if (tmpM) {
            const tv = parseInt(tmpM[1]);
            if (tv >= 0) hardness = Math.max(hardness, 4);
            else if (tv >= -10) hardness = Math.max(hardness, 3);
            else if (tv >= -20) hardness = Math.max(hardness, 2);
          }
          const oxyM = rt.match(/(\d+)\s*%/);
          if (oxyM) {
            const ov = parseInt(oxyM[1]);
            if (ov >= 7) hardness = Math.max(hardness, 4);
            else if (ov >= 4) hardness = Math.max(hardness, 3);
          }
          const oceM = rt.match(/(\d+)\s*ocean/i);
          if (oceM && parseInt(oceM[1]) >= 3) hardness = Math.max(hardness, 3);

          // Only give bonus if no penalty was applied (req is met)
          if (bonus >= 0 || !reasons.some(function(r) { return r.includes('Req ~') || r.includes('Окно'); })) {
            if (hardness >= 4) { bonus += 6; reasons.push('Req ✓ +6'); }
            else if (hardness >= 3) { bonus += 4; reasons.push('Req ✓ +4'); }
            else if (hardness >= 2) { bonus += 3; reasons.push('Req ✓ +3'); }
          }
        }
      }

      // Detect card type: blue (active/action), red (event), green (automated)
      let cardType = 'green';
      if (cardEl) {
        if (cardEl.classList.contains('card-type--active') ||
            cardEl.querySelector('.card-content--blue, .blue-action, [class*="blue"]')) {
          cardType = 'blue';
        } else if (cardTags.has('event') ||
                   cardEl.classList.contains('card-type--event') ||
                   cardEl.querySelector('.card-content--red')) {
          cardType = 'red';
        }
      } else if (cardTags.has('event')) {
        cardType = 'red';
      } else if (data.e && data.e.toLowerCase().includes('action')) {
        cardType = 'blue';
      }

      // 1. Tag discounts from corp/cards
      if (cardCost != null && cardTags.size > 0) {
        let totalDiscount = 0;
        const allDiscount = ctx.discounts['_all'] || 0;
        if (allDiscount > 0) totalDiscount += allDiscount;

        for (const tag of cardTags) {
          if (ctx.discounts[tag]) {
            totalDiscount += ctx.discounts[tag];
          }
        }

        // Cap discount at card cost
        totalDiscount = Math.min(totalDiscount, cardCost);
        if (totalDiscount >= 2) {
          const discountBonus = Math.min(7, totalDiscount);
          bonus += discountBonus;
          reasons.push('Скидка −' + totalDiscount + ' MC');
        }
        // Discount stacking bonus: 2+ sources = extra synergy
        if (totalDiscount >= 4) {
          let discountSources = 0;
          if (allDiscount > 0) discountSources++;
          for (const tag of cardTags) {
            if (ctx.discounts[tag] > 0) discountSources++;
          }
          if (discountSources >= 2) {
            const stackBonus = Math.min(3, discountSources);
            bonus += stackBonus;
            reasons.push('Стак скидок ×' + discountSources);
          }
        }
      }

      // 2. Steel payment (building tag)
      if (cardTags.has('building') && ctx.steel > 0) {
        const steelMC = Math.min(ctx.steel, cardCost != null ? Math.ceil(cardCost / ctx.steelVal) : ctx.steel) * ctx.steelVal;
        const steelBonus = Math.min(5, Math.round(steelMC / 3));
        if (steelBonus > 0) {
          bonus += steelBonus;
          reasons.push('Сталь −' + steelMC + ' MC');
        }
      }

      // 3. Titanium payment (space tag)
      if (cardTags.has('space') && ctx.titanium > 0) {
        const tiMC = Math.min(ctx.titanium, cardCost != null ? Math.ceil(cardCost / ctx.tiVal) : ctx.titanium) * ctx.tiVal;
        const tiBonus = Math.min(7, Math.round(tiMC / 3));
        if (tiBonus > 0) {
          bonus += tiBonus;
          reasons.push('Титан −' + tiMC + ' MC');
        }
      }

      // 4. Tag triggers from tableau cards
      if (cardTags.size > 0 && ctx.tagTriggers.length > 0) {
        let triggerTotal = 0;
        const triggerDescs = [];
        for (const trigger of ctx.tagTriggers) {
          for (const trigTag of trigger.tags) {
            if (cardTags.has(trigTag)) {
              triggerTotal += trigger.value;
              triggerDescs.push(trigger.desc);
              break; // one trigger per trigger source per card
            }
          }
        }
        if (triggerTotal > 0) {
          bonus += Math.min(12, triggerTotal);
          reasons.push(triggerDescs.slice(0, 2).join(', '));
        }
      }

      // 5. Tag density bonus — rare tags get bonus at lower counts
      // Event cards: tags go face-down, so no persistent tag density value
      // Space/Building: common tags, no density synergy (unlike Science/Jovian/Venus)
      if (cardTags.size > 0 && cardType !== 'red') {
        const TAG_RARITY = { 'jovian': 5, 'science': 3, 'venus': 3, 'earth': 2, 'microbe': 1, 'animal': 1, 'plant': 1, 'space': 0, 'building': 0, 'power': 1, 'city': 1, 'event': 0 };
        let bestBonus = 0;
        let bestTag = '';
        let bestCount = 0;
        for (const tag of cardTags) {
          const count = ctx.tags[tag] || 0;
          const rarity = TAG_RARITY[tag] || 1;
          if (rarity <= 0) continue; // space/building/event — no density bonus
          let db = 0;
          if (count >= 6) db = 4;
          else if (count >= 4) db = 3;
          else if (count >= 2 && rarity >= 3) db = 2;
          else if (count >= 1 && rarity >= 5) db = 2;
          if (db > bestBonus) { bestBonus = db; bestTag = tag; bestCount = count; }
        }
        // Cap density bonus for cheap one-shot cards (e.g. Lagrange Observatory)
        // These cards just have the tag but don't benefit from more of the same
        if (bestBonus > 1 && cardCost != null && cardCost <= 15) {
          var hasOngoing = data.e && (data.e.toLowerCase().includes('action') || data.e.toLowerCase().includes('действ') || data.e.toLowerCase().includes('prod') || data.e.toLowerCase().includes('прод'));
          if (!hasOngoing) bestBonus = 1;
        }
        if (bestBonus > 0) {
          bonus += bestBonus;
          reasons.push(bestTag + ' ×' + bestCount);
        }
      }

      // 5b. Auto-synergy: card shares rare tags with corp/tableau trigger sources
      if (cardTags.size > 0 && myCorps.length > 0) {
        const RARE_TAG_VAL = { 'jovian': 3, 'science': 2, 'venus': 2, 'earth': 2, 'microbe': 1, 'animal': 1 };
        let autoSynVal = 0;
        // Corp trigger tags — collect from ALL corps
        const corpTrigTags = new Set();
        for (var cci = 0; cci < myCorps.length; cci++) {
          var cc = myCorps[cci];
          if (TAG_TRIGGERS[cc]) {
            for (const tr of TAG_TRIGGERS[cc]) {
              for (const t of tr.tags) corpTrigTags.add(t);
            }
          }
          if (CORP_DISCOUNTS[cc]) {
            for (const t in CORP_DISCOUNTS[cc]) {
              if (t !== '_all' && t !== '_req' && t !== '_ocean') corpTrigTags.add(t);
            }
          }
        }
        for (const tag of cardTags) {
          if (RARE_TAG_VAL[tag] && corpTrigTags.has(tag)) {
            autoSynVal += RARE_TAG_VAL[tag];
          }
        }
        // Skip if already counted as manual synergy (data.y includes any corp)
        const alreadyManual = data.y && data.y.some(function(s) {
          for (var ami = 0; ami < myCorps.length; ami++) { if (s === myCorps[ami]) return true; }
          return false;
        });
        if (autoSynVal >= 2 && !alreadyManual) {
          bonus += Math.min(4, autoSynVal);
          reasons.push('Авто-синерг');
        }
      }

      // 5c. Corp ability synergy — tag/keyword matching (works during initial draft without game state)
      for (var casIdx = 0; casIdx < myCorps.length; casIdx++) {
        var casCorp = myCorps[casIdx];
        var cas = CORP_ABILITY_SYNERGY[casCorp];
        if (!cas || cas.b <= 0) continue;
        let casMatched = false;
        // Check tags
        if (cas.tags.length > 0 && cardTags.size > 0) {
          for (const t of cas.tags) {
            if (cardTags.has(t)) { casMatched = true; break; }
          }
        }
        // Check keywords in effect text
        if (!casMatched && cas.kw.length > 0 && data.e) {
          const eLow = data.e.toLowerCase();
          for (const kw of cas.kw) {
            if (eLow.includes(kw)) { casMatched = true; break; }
          }
        }
        // Don't double-count with explicit synergy (data.y includes this corp) or auto-synergy
        const alreadyCounted5c = (data.y && data.y.some(function(s) { return s === casCorp; }));
        const alreadyAutoSyn5c = (bonus > 0 && reasons.some(function(r) { return r.indexOf('Авто-синерг') !== -1; }));
        if (casMatched && !alreadyCounted5c && !alreadyAutoSyn5c) {
          bonus += cas.b;
          reasons.push('Корп: ' + casCorp.split(' ')[0]);
        }
      }

      // 5d. Pharmacy Union specific — science tags cure/add disease, microbe generators help cure
      if (ctx.tableauNames && (ctx.tableauNames.has('Pharmacy Union') || myCorps.indexOf('Pharmacy Union') !== -1)) {
        // Count diseases from Pharmacy Union resources
        var puDiseases = 0;
        var pv5d = getPlayerVueData();
        if (pv5d && pv5d.thisPlayer && pv5d.thisPlayer.tableau) {
          for (var ti = 0; ti < pv5d.thisPlayer.tableau.length; ti++) {
            var tc = pv5d.thisPlayer.tableau[ti];
            if ((tc.name || tc) === 'Pharmacy Union') { puDiseases = tc.resources || 0; break; }
          }
        }

        var hasScienceTag = cardTags.has('science');
        var eLow5d = (data.e || '').toLowerCase();
        var generatesMicrobes = eLow5d.includes('microbe') || eLow5d.includes('микроб') || eLow5d.includes('add 1 microbe') || eLow5d.includes('add 2 microbe');

        if (hasScienceTag) {
          if (puDiseases > 0) {
            bonus += 4;
            reasons.push('PU cure +3MC (' + puDiseases + ' dis.)');
          } else {
            bonus -= 3;
            reasons.push('PU disease! −4MC');
          }
        }
        if (generatesMicrobes && puDiseases > 0) {
          bonus += 2;
          reasons.push('PU microbe→cure');
        }
      }

      // 6. Colony synergy (cards with colony/trade keywords + trade fleet context)
      if (data.e) {
        const eLower = data.e.toLowerCase();
        const isColonyCard = eLower.includes('colon') || eLower.includes('trade') || eLower.includes('колон') || eLower.includes('торгов') || eLower.includes('fleet') || eLower.includes('флот');

        if (isColonyCard) {
          // Base colony card bonus when player has infrastructure
          if (ctx.coloniesOwned > 0 || ctx.tradesLeft > 0) {
            const colonyBonus = Math.min(10, ctx.coloniesOwned * 3 + ctx.tradesLeft * 2);
            bonus += colonyBonus;
            reasons.push('Колонии ' + ctx.coloniesOwned + '/' + ctx.tradesLeft + 'tr → +' + colonyBonus);
          }

          // Fleet cards: extra fleet = trade every gen = ~5-8 MC value
          if (eLower.includes('fleet') || eLower.includes('флот') || eLower.includes('trade fleet')) {
            var fleetVal = Math.min(6, ctx.coloniesOwned * 2 + 2);
            if (ctx.coloniesOwned === 0) fleetVal = 1; // fleet without colonies is weak
            bonus += fleetVal;
            reasons.push('Флот +' + fleetVal);
          }

          // Colony placement cards: bonus based on available colony slots
          if (eLower.includes('place') && eLower.includes('colon') || eLower.includes('build') && eLower.includes('colon')) {
            if (ctx.coloniesOwned < 3) {
              bonus += 3;
              reasons.push('Слот колонии +3');
            }
          }
        }

        // Trade bonus cards (cards that boost trade income or give trade discounts)
        if (eLower.includes('trade income') || eLower.includes('trade bonus') || eLower.includes('when you trade') || eLower.includes('торговый бонус')) {
          if (ctx.coloniesOwned > 0) {
            var tradeBoost = Math.min(5, ctx.coloniesOwned * 2);
            bonus += tradeBoost;
            reasons.push('Trade-бонус +' + tradeBoost);
          }
        }
      }

      // 6b. Turmoil delegate/influence scoring
      if (ctx.turmoilActive && data.e) {
        const eLower = data.e.toLowerCase();
        const isDelegateCard = eLower.includes('delegate') || eLower.includes('делегат');
        const isInfluenceCard = eLower.includes('influence') || eLower.includes('влияние');

        if (isDelegateCard || isInfluenceCard) {
          // Base: delegates are more valuable when you have few
          var delBase = ctx.myDelegates < 2 ? 5 : ctx.myDelegates < 4 ? 4 : 2;

          // Count how many delegates the card gives
          var delCount = 1;
          var delM = eLower.match(/(\d+)\s*delegate/);
          if (delM) delCount = parseInt(delM[1]) || 1;
          if (delCount >= 2) delBase += 2; // multi-delegate cards are stronger

          // Influence cards: influence = MC discount on turmoil events + party bonus
          if (isInfluenceCard && !isDelegateCard) {
            delBase = Math.min(delBase, 3); // influence alone is less impactful
          }

          bonus += delBase;
          reasons.push('Делегаты +' + delBase + ' (' + ctx.myDelegates + ' дел.)');
        }

        // Chairman bonus — cards that give chairman or party leader
        if (eLower.includes('chairman') || eLower.includes('party leader') || eLower.includes('лидер партии')) {
          bonus += 4;
          reasons.push('Лидер/Председатель +4');
        }

        // 39. Party policy synergy — detailed alignment with ruling party
        if (ctx.rulingParty) {
          var partyBonus = 0;
          var rp = ctx.rulingParty;
          if (rp === 'Mars First') {
            if (cardTags.has('building') || cardTags.has('mars') || eLower.includes('city') || eLower.includes('город')) partyBonus = 2;
          } else if (rp === 'Scientists') {
            if (cardTags.has('science')) partyBonus = 2;
            if (eLower.includes('draw') || eLower.includes('рисуй')) partyBonus += 1;
          } else if (rp === 'Unity') {
            if (cardTags.has('jovian') || cardTags.has('venus') || cardTags.has('earth') || cardTags.has('space')) partyBonus = 2;
          } else if (rp === 'Greens') {
            if (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal') || eLower.includes('green') || eLower.includes('озелен')) partyBonus = 2;
          } else if (rp === 'Kelvinists') {
            if (eLower.includes('heat') || eLower.includes('тепл') || eLower.includes('energy') || eLower.includes('энерг')) partyBonus = 2;
          } else if (rp === 'Reds') {
            // Reds penalize TR raises — stronger penalty based on how much TR the card gives
            if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean') || eLower.includes('tr ') || eLower.includes('+1 tr') || eLower.includes('terraform')) {
              partyBonus = -3; // base Reds penalty
              // Extra penalty for multi-TR cards
              var trCount = 0;
              var trM = eLower.match(/(\d+)\s*tr/);
              if (trM) trCount = parseInt(trM[1]) || 1;
              if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean')) trCount = Math.max(trCount, 1);
              if (trCount >= 2) partyBonus = -5;
            }
          }
          if (partyBonus !== 0) {
            bonus += partyBonus;
            reasons.push(rp + (partyBonus > 0 ? ' +' : ' ') + partyBonus);
          }
        }

        // 39b. Dominant party alignment — card tags match dominant (next ruling) party
        if (ctx.dominantParty) {
          var dom = ctx.dominantParty;
          if (dom !== ctx.rulingParty) {
            var domBonus = 0;
            if (dom === 'Mars First' && (cardTags.has('building') || eLower.includes('city'))) domBonus = 1;
            else if (dom === 'Scientists' && cardTags.has('science')) domBonus = 1;
            else if (dom === 'Unity' && (cardTags.has('space') || cardTags.has('venus') || cardTags.has('earth'))) domBonus = 1;
            else if (dom === 'Greens' && (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal'))) domBonus = 1;
            else if (dom === 'Kelvinists' && (eLower.includes('heat') || eLower.includes('energy'))) domBonus = 1;
            if (domBonus > 0) {
              bonus += domBonus;
              reasons.push('Дом. ' + dom.split(' ')[0] + ' +1');
            }
          }
        }
      }

      // FTN timing delta (replaces crude factors #7, #8, #17, #18, #21 when data available)
      let skipCrudeTiming = false;
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx) {
          const REFERENCE_GL = 5;
          // Detect pure-production cards (no VP, no action, no TR burst)
          const hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
          const hasVP = fx.vp || fx.vpAcc;
          const hasAction = fx.actMC || fx.actTR || fx.actOc || fx.actCD;
          const hasTR = fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn;
          const isPureProduction = hasProd && !hasVP && !hasAction && !hasTR && !fx.city && !fx.grn;
          // Pure production cards get harsher timing: higher scale, bigger cap
          const SCALE = isPureProduction ? 3.0 : 1.5;
          const CAP = isPureProduction ? 30 : 15;
          // If card has minG (earliest play gen due to requirements), cap both effective and reference GL
          const maxGL = fx.minG ? Math.max(0, 9 - fx.minG) : 13;
          const effectiveGL = Math.min(ctx.gensLeft, maxGL);
          const refGL = Math.min(REFERENCE_GL, maxGL);
          const delta = computeCardValue(fx, effectiveGL) - computeCardValue(fx, refGL);
          const adj = Math.max(-CAP, Math.min(CAP, Math.round(delta * SCALE)));
          if (Math.abs(adj) >= 1) {
            bonus += adj;
            reasons.push((isPureProduction ? 'Прод. тайминг ' : 'Тайминг ') + (adj > 0 ? '+' : '') + adj);
          }
          skipCrudeTiming = true;
        }
      }

      // 7. Early production bonus (gen 1-4)
      if (!skipCrudeTiming && ctx.gen <= 4 && data.e) {
        const eLower = data.e.toLowerCase();
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isProd) {
          bonus += 3;
          reasons.push('Ранняя прод.');
        }
      }

      // 7b. Late production penalty — production doesn't pay off if game is ending
      if (!skipCrudeTiming && ctx.gensLeft <= 3 && data.e) {
        const eLower = data.e.toLowerCase();
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        const isAction = eLower.includes('action') || eLower.includes('действие');
        if (isProd && !isVP && !isAction) {
          // Pure production: aggressive penalty
          const prodPenalty = ctx.gensLeft <= 1 ? -15 : ctx.gensLeft <= 2 ? -10 : -5;
          bonus += prodPenalty;
          reasons.push('Позд. прод. ' + prodPenalty);
        }
      }

      // 8. Late VP bonus (gen 8+)
      if (!skipCrudeTiming && ctx.gen >= 8 && data.e) {
        const eLower = data.e.toLowerCase();
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isVP && !isProd) {
          bonus += 4;
          reasons.push('Поздний VP');
        }
      }

      // 8b. Late VP burst — immediate VP cards very strong when game ending
      if (!skipCrudeTiming && ctx.gensLeft <= 3 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('vp') || eLower.includes('вп') || eLower.includes('victory')) {
          const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
          if (!isProd) {
            const vpBurst = ctx.gensLeft <= 1 ? 8 : ctx.gensLeft <= 2 ? 5 : 3;
            bonus += vpBurst;
            reasons.push('VP burst +' + vpBurst);
          }
        }
      }

      // 8c. Action cards late game — limited activations
      if (ctx.gensLeft <= 2 && data.e) {
        const eLower = data.e.toLowerCase();
        const isAction = eLower.includes('action') || eLower.includes('действие');
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isAction && !isVP) {
          // Action without VP = low value late game (1-2 activations left)
          const actPenalty = ctx.gensLeft <= 1 ? -10 : -5;
          bonus += actPenalty;
          reasons.push('Поздн. действие ' + actPenalty);
        } else if (isAction && isVP && ctx.gensLeft <= 1) {
          // Action with VP = still get VP from resource, but fewer activations
          bonus -= 3;
          reasons.push('Мало активаций -3');
        }
      }

      // 8d. Discount sources late game — fewer cards left to benefit
      if (ctx.gensLeft <= 2 && CARD_DISCOUNTS && CARD_DISCOUNTS[cardName]) {
        const discPenalty = ctx.gensLeft <= 1 ? -8 : -4;
        bonus += discPenalty;
        reasons.push('Скидка бесполезна ' + discPenalty);
      }

      // 9. Milestone proximity — card tag helps reach a milestone (1-3 tags away = 5 VP)
      // Event cards are played face-down — their tags DON'T count for milestones/awards
      if (cardTags.size > 0 && cardType !== 'red') {
        for (const tag of cardTags) {
          if (tag === 'event') continue; // event tag itself doesn't help tag-based milestones
          const need = ctx.milestoneNeeds[tag];
          if (need !== undefined) {
            const msBonus = need === 1 ? 7 : need === 2 ? 5 : 3;
            bonus += msBonus;
            const maEntries = TAG_TO_MA[tag] || [];
            const msName = maEntries.find((m) => m.type === 'milestone');
            reasons.push((msName ? msName.name : 'Веха') + ' −' + need);
            break;
          }
        }
      }

      // 9b. Non-tag milestone proximity (cities, greeneries, events, TR, prod)
      if (data.e) {
        const eLower = data.e.toLowerCase();
        for (const key in ctx.milestoneSpecial) {
          const ms = ctx.milestoneSpecial[key];
          let helps = false;
          if (key === 'cities' && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps = true;
          if (key === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps = true;
          if (key === 'events' && cardType === 'red') helps = true;
          if (key === 'tr' && (eLower.includes('tr') || eLower.includes('terraform'))) helps = true;
          if (key.startsWith('prod_') && eLower.includes('prod')) helps = true;
          if (key === 'prod_energy' && (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power'))) helps = true;
          if (helps) {
            const msBonus = ms.need === 1 ? 7 : ms.need === 2 ? 5 : 3;
            bonus += msBonus;
            reasons.push(ms.name + ' −' + ms.need);
            break;
          }
        }
      }

      // 10. Award tag positioning — card tag helps in a tag-based award
      // Event cards face-down — tags don't count for awards
      if (cardTags.size > 0 && cardType !== 'red') {
        for (const tag of cardTags) {
          if (tag === 'event') continue;
          if (ctx.awardTags[tag]) {
            const myCount = ctx.tags[tag] || 0;
            // Check racing data — adjust bonus based on our position vs opponents
            let racingMod = 0;
            let racingInfo = '';
            for (const awName in ctx.awardRacing) {
              const race = ctx.awardRacing[awName];
              const maEntry = MA_DATA[awName];
              if (maEntry && maEntry.tag === tag) {
                if (race.leading && race.delta >= 2) {
                  racingMod = 2; // leading comfortably → defend
                  racingInfo = ' лидер +' + race.delta;
                } else if (race.leading) {
                  racingMod = 1; // leading by 1 → worth strengthening
                  racingInfo = ' лидер +' + race.delta;
                } else if (race.delta >= -1) {
                  racingMod = 1; // close behind → worth catching up
                  racingInfo = ' −' + Math.abs(race.delta);
                } else {
                  racingMod = -2; // far behind → not worth investing
                  racingInfo = ' −' + Math.abs(race.delta) + ' далеко';
                }
                break;
              }
            }
            const baseBonus = myCount >= 4 ? 4 : myCount >= 2 ? 3 : 2;
            const awBonus = Math.max(0, baseBonus + racingMod);
            if (awBonus > 0) {
              bonus += awBonus;
              reasons.push('Награда: ' + tag + racingInfo);
            }
            break; // one award bonus per card
          }
        }
      }

      // 10b. Non-tag award racing — card helps win non-tag awards (Landlord, Magnate, Celebrity, etc.)
      if (data.e) {
        const eLower = data.e.toLowerCase();
        for (const awName in ctx.awardRacing) {
          const race = ctx.awardRacing[awName];
          const maEntry = MA_DATA[awName];
          if (!maEntry || (maEntry.check === 'tags' && maEntry.tag)) continue; // skip tag-based (handled above)
          let helps = false;
          // Landlord/Suburbian: tiles → city cards help
          if ((maEntry.check === 'tiles' || maEntry.check === 'cities') && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps = true;
          // Cultivator/Landscaper: greeneries
          if (maEntry.check === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps = true;
          // Magnate: green cards
          if (maEntry.check === 'greenCards' && cardType === 'green') helps = true;
          // Banker: MC production
          if (maEntry.check === 'prod' && maEntry.resource === 'megacredits' && eLower.includes('prod')) helps = true;
          // Benefactor: TR
          if (maEntry.check === 'tr' && (eLower.includes('tr') || eLower.includes('terraform'))) helps = true;
          // Thermalist: heat
          if (maEntry.check === 'resource' && maEntry.resource === 'heat' && (eLower.includes('heat') || eLower.includes('тепл'))) helps = true;
          // Miner: steel + titanium
          if (maEntry.check === 'steelTi' && (cardTags.has('building') || cardTags.has('space') || eLower.includes('steel') || eLower.includes('titan'))) helps = true;
          // Collector: resources on cards
          if (maEntry.check === 'cardResources' && (eLower.includes('resource') || eLower.includes('animal') || eLower.includes('microbe') || eLower.includes('floater'))) helps = true;
          if (helps) {
            let racingMod = 0;
            if (race.leading && race.delta >= 2) racingMod = 2;
            else if (race.leading) racingMod = 1;
            else if (race.delta >= -1) racingMod = 0;
            else racingMod = -2;
            const awBonus = Math.max(0, 3 + racingMod);
            if (awBonus > 0) {
              const sign = race.delta > 0 ? '+' : '';
              bonus += awBonus;
              reasons.push(awName + ' ' + sign + race.delta);
            }
            break;
          }
        }
      }

      // 11. Animal placement synergy — if we have animal targets, cards that place animals are more valuable
      if (ctx.animalTargets > 0 && ANIMAL_PLACERS.includes(cardName)) {
        const apBonus = Math.min(6, ctx.animalTargets * 3);
        bonus += apBonus;
        reasons.push(ctx.animalTargets + ' жив. цель');
      }
      // Reverse: if we have animal placers and card IS an animal target
      if (ANIMAL_TARGETS.includes(cardName)) {
        let placerCount = 0;
        for (const placer of ANIMAL_PLACERS) {
          if (ctx.tableauNames.has(placer)) placerCount++;
        }
        if (placerCount > 0) {
          bonus += Math.min(5, placerCount * 3);
          reasons.push(placerCount + ' жив. плейс.');
        }
      }

      // 12. Microbe placement synergy
      if (ctx.microbeTargets > 0 && MICROBE_PLACERS.includes(cardName)) {
        const mpBonus = Math.min(5, ctx.microbeTargets * 2);
        bonus += mpBonus;
        reasons.push(ctx.microbeTargets + ' мик. цель');
      }
      if (MICROBE_TARGETS.includes(cardName)) {
        let placerCount = 0;
        for (const placer of MICROBE_PLACERS) {
          if (ctx.tableauNames.has(placer)) placerCount++;
        }
        if (placerCount > 0) {
          bonus += Math.min(4, placerCount * 2);
          reasons.push(placerCount + ' мик. плейс.');
        }
      }

      // 13. Energy consumers — cards that use energy are better with high energy prod
      if (ctx.prod.energy >= 2 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power')) {
          if (eLower.includes('decrease') || eLower.includes('spend') || eLower.includes('снизь') || eLower.includes('-')) {
            const enBonus = Math.min(5, Math.floor(ctx.prod.energy / 2));
            if (enBonus > 0) {
              bonus += enBonus;
              reasons.push('Энерг: ' + ctx.prod.energy);
            }
          }
        }
      }

      // 13b. Energy pipeline — energy without consumers just converts to heat (wasteful)
      if (ctx.prod.energy >= 3 && !ctx.hasEnergyConsumers) {
        // Energy-consuming cards are extra valuable when energy has no use
        if (data.e) {
          const eLower = data.e.toLowerCase();
          const consumesEnergy = eLower.includes('spend') || eLower.includes('decrease energy') || eLower.includes('−energy') || eLower.includes('energy-prod');
          if (consumesEnergy) {
            bonus += 3;
            reasons.push('Энерг. сток +3');
          }
        }
        // Energy-producing cards are less valuable when energy already surplus
        if (cardTags.has('power') && data.e) {
          const eLower = data.e.toLowerCase();
          if (eLower.includes('energy-prod') || eLower.includes('энерг-прод') || (eLower.includes('energy') && eLower.includes('prod'))) {
            bonus -= 2;
            reasons.push('Избыток энерг. −2');
          }
        }
      }

      // 14. Plant engine — high plant prod + O2 awareness for greenery value
      if (ctx.prod.plants >= 2 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('plant') || eLower.includes('greenery') || eLower.includes('раст') || eLower.includes('озелен')) {
          // Greenery value depends on whether O2 is maxed
          const o2Maxed = ctx.globalParams && ctx.globalParams.oxy >= 14;
          const greenPerGen = Math.floor(ctx.prod.plants / 8);
          let plBonus;
          if (greenPerGen >= 1 && !o2Maxed) {
            // Strong: greenery = VP + TR + placement bonus
            plBonus = Math.min(5, greenPerGen * 2 + Math.floor(ctx.prod.plants / 3));
          } else if (greenPerGen >= 1 && o2Maxed) {
            // Weaker: greenery = VP + placement only (no TR)
            plBonus = Math.min(3, greenPerGen + 1);
          } else {
            plBonus = Math.min(3, Math.floor(ctx.prod.plants / 3));
          }
          if (plBonus > 0) {
            bonus += plBonus;
            reasons.push('Раст ' + ctx.prod.plants + (o2Maxed ? ' (O₂ макс)' : '') + ' +' + plBonus);
          }
        }
      }

      // 15. Heat synergy — heat → TR conversion value + temp saturation awareness
      if ((ctx.heat >= 8 || ctx.prod.heat >= 3) && data.e) {
        const eLower = data.e.toLowerCase();
        const tempMaxed = ctx.globalParams && ctx.globalParams.temp >= 8;
        if (eLower.includes('heat') || eLower.includes('тепл')) {
          if (tempMaxed) {
            // Temperature maxed: heat-producers are less valuable
            if (eLower.includes('prod') || eLower.includes('прод')) {
              bonus -= 3;
              reasons.push('Темп. макс −3');
            } else if (ctx.heat >= 16) {
              // Heat converters (Caretaker Contract, Insulation) still have some value
              bonus += 1;
              reasons.push('Тепло ' + ctx.heat);
            }
          } else {
            // Temp not maxed: heat is valuable for TR raises (8 heat = 1 TR)
            const trFromHeat = Math.floor(ctx.heat / 8);
            if (trFromHeat >= 1) {
              bonus += Math.min(3, trFromHeat + 1);
              reasons.push('Тепло→TR ' + trFromHeat);
            } else if (ctx.prod.heat >= 4) {
              bonus += 2;
              reasons.push('Тепло-прод ' + ctx.prod.heat);
            }
          }
        }
      }

      // 16. Multi-tag bonus — cards with 2+ tags fire more triggers & help more M/A
      if (cardTags.size >= 2) {
        // Only give bonus if there are active triggers/awards that benefit
        let multiHits = 0;
        for (const tag of cardTags) {
          if (ctx.awardTags[tag]) multiHits++;
          if (ctx.milestoneNeeds[tag] !== undefined) multiHits++;
          for (const trigger of ctx.tagTriggers) {
            if (trigger.tags.includes(tag)) { multiHits++; break; }
          }
        }
        if (multiHits >= 2) {
          const mtBonus = Math.min(4, multiHits);
          bonus += mtBonus;
          reasons.push(cardTags.size + ' тегов');
        }
      }

      // 17. Late production penalty (gen 7+ — production cards lose value)
      if (!skipCrudeTiming && ctx.gen >= 6 && data.e) {
        const eLower = data.e.toLowerCase();
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        const isAction = eLower.includes('action') || eLower.includes('действие');
        if (isProd && !isVP && !isAction) {
          // Sliding scale: gen 6=-3, gen 7=-6, gen 8=-10, gen 9+=-15
          const penaltyVal = ctx.gen >= 9 ? -15 : ctx.gen >= 8 ? -10 : ctx.gen >= 7 ? -6 : -3;
          bonus += penaltyVal;
          reasons.push('Позд. прод. ' + penaltyVal);
        }
      }

      // 18. Action card ROI — blue cards: gensLeft × value per activation
      if (cardType === 'blue' && ctx.gensLeft >= 1) {
        const fx18 = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cardName] : null;
        const actVal = fx18 ? ((fx18.actMC || 0) + (fx18.actTR || 0) * 7 + (fx18.actOc || 0) * 11 + (fx18.actCD || 0) * 3) : 0;
        if (actVal > 0) {
          const totalROI = actVal * ctx.gensLeft;
          const roiAdj = ctx.gensLeft <= 2
            ? -Math.min(4, Math.round(actVal))
            : Math.min(8, Math.round(totalROI / 4));
          if (roiAdj !== 0) {
            bonus += roiAdj;
            reasons.push('ROI ' + Math.round(actVal) + '×' + ctx.gensLeft + (roiAdj > 0 ? ' +' : ' ') + roiAdj);
          }
        } else if (!skipCrudeTiming) {
          if (ctx.gensLeft >= 6) { bonus += 5; reasons.push('Ранний action +5'); }
          else if (ctx.gensLeft >= 4) { bonus += 3; reasons.push('Action +3'); }
          else if (ctx.gensLeft <= 2) { bonus -= 4; reasons.push('Поздн. action −4'); }
        }
      }

      // 19. Event tag: does NOT persist in tableau → doesn't help tag milestones/awards
      if (cardType === 'red' && cardTags.has('event')) {
        // If card also has other tags that help milestones → reduce the milestone bonus
        // Events trigger tag triggers but don't persist for M/A counting
        let eventPenalty = 0;
        for (const tag of cardTags) {
          if (tag === 'event') continue;
          if (ctx.milestoneNeeds[tag] !== undefined) eventPenalty += 2;
          if (ctx.awardTags[tag]) eventPenalty += 1;
        }
        if (eventPenalty > 0) {
          bonus -= Math.min(4, eventPenalty);
          reasons.push('Event не в табло −' + Math.min(4, eventPenalty));
        }
      }

      // 20. Steel/Titanium PRODUCTION synergy — recurring discount over gensLeft
      if (cardTags.has('building') && ctx.prod.steel >= 2) {
        // High steel prod → building cards consistently cheaper in future
        const stProdBonus = Math.min(4, Math.floor(ctx.prod.steel / 2));
        bonus += stProdBonus;
        reasons.push('Стл.прод ' + ctx.prod.steel + '/пок');
      }
      if (cardTags.has('space') && ctx.prod.ti >= 1) {
        const tiProdBonus = Math.min(5, ctx.prod.ti * 2);
        bonus += tiProdBonus;
        reasons.push('Ti.прод ' + ctx.prod.ti + '/пок');
      }

      // 20b. Production diminishing returns — high prod makes more prod less impactful
      if (data.e && typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && fx.mp && fx.mp > 0 && ctx.prod.mc >= 15) {
          bonus -= 2;
          reasons.push('Прод. избыток −2');
        }
        // Heat prod is mostly useless if temp is maxed and no converters
        if (fx && fx.hp && fx.hp > 0 && ctx.globalParams && ctx.globalParams.temp >= 8) {
          bonus -= 2;
          reasons.push('Тепл. прод. бесп. −2');
        }
      }

      // 21. VP-per-resource timing — accumulator cards are better early
      if (!skipCrudeTiming && data.e) {
        const eLower = data.e.toLowerCase();
        const isAccumulator = (eLower.includes('1 vp per') || eLower.includes('1 vp за') ||
                               eLower.includes('vp per') || eLower.includes('vp за'));
        if (isAccumulator) {
          if (ctx.gensLeft >= 5) {
            bonus += 4;
            reasons.push('VP-копилка рано +4');
          } else if (ctx.gensLeft >= 3) {
            bonus += 2;
            reasons.push('VP-копилка +2');
          } else if (ctx.gensLeft <= 1) {
            bonus -= 3;
            reasons.push('VP-копилка поздно −3');
          }
        }
      }

      // 22. Affordability check — can we actually pay for this card?
      if (cardCost != null) {
        let buyingPower = ctx.mc;
        if (cardTags.has('building')) buyingPower += ctx.steel * ctx.steelVal;
        if (cardTags.has('space')) buyingPower += ctx.titanium * ctx.tiVal;
        // Apply known discounts
        let discount = ctx.discounts['_all'] || 0;
        for (const tag of cardTags) {
          discount += ctx.discounts[tag] || 0;
        }
        const effectiveCost = Math.max(0, cardCost - discount);

        if (buyingPower < effectiveCost) {
          const deficit = effectiveCost - buyingPower;
          // MC runway: can we afford within remaining generations?
          const runway = ctx.mc + ctx.prod.mc * Math.max(0, ctx.gensLeft - 1);
          let runwayTotal = runway;
          if (cardTags.has('building')) runwayTotal += (ctx.steel + ctx.prod.steel * Math.max(0, ctx.gensLeft - 1)) * ctx.steelVal;
          if (cardTags.has('space')) runwayTotal += (ctx.titanium + ctx.prod.ti * Math.max(0, ctx.gensLeft - 1)) * ctx.tiVal;

          if (runwayTotal < effectiveCost * 0.5) {
            bonus -= 6;
            reasons.push('Недостижимо −6');
          } else if (runwayTotal < effectiveCost) {
            bonus -= 4;
            reasons.push('Runway мало −4');
          } else if (deficit > 15) {
            bonus -= 3;
            reasons.push('Нет MC (−' + deficit + ')');
          } else if (deficit > 8) {
            bonus -= 2;
            reasons.push('Мало MC (−' + deficit + ')');
          }
        }
      }

      // 23. Stall value — cheap action cards are underrated (extra action = delay round end)
      if (cardType === 'blue' && cardCost != null && cardCost <= 8 && ctx.gensLeft >= 3) {
        bonus += 2;
        reasons.push('Столл');
      }

      // 23b. Tableau saturation — blue cards less valuable when tableau is full late game
      if (cardType === 'blue' && ctx.tableauSize >= 12 && ctx.gensLeft <= 3) {
        bonus -= 3;
        reasons.push('Табло полно −3');
      }

      // 24. No-tag penalty — REMOVED: already baked into base score (data.s)
      // Cards without tags have lower base ratings by design (-3 to -5)

      // 24b. Opponent awareness — adjust based on opponent threats
      // Protected Habitats/Asteroid Deflection more valuable if opponent has attacks
      if (ctx.oppHasPlantAttack && (cardName === 'Protected Habitats' || cardName === 'Asteroid Deflection System')) {
        bonus += 4;
        reasons.push('Защита от атак опп.');
      }
      // Animal cards less valuable if opponent has Predators/Ants
      if (ctx.oppHasAnimalAttack && ANIMAL_TARGETS.includes(cardName)) {
        bonus -= 2;
        reasons.push('Опп. атакует жив. −2');
      }
      // Take-that cards slightly more valuable if opponents have strong engines
      if (TAKE_THAT_CARDS[cardName] && ctx.oppCorps.length > 0) {
        // Check if any opponent corp is strong engine
        const strongEngineCorps = ['Point Luna', 'Tharsis Republic', 'Ecoline', 'Arklight', 'Mining Guild'];
        const hasStrongOpp = ctx.oppCorps.some(function(c) { return strongEngineCorps.includes(c); });
        if (hasStrongOpp) {
          bonus += 1;
          reasons.push('Опп. сильный engine');
        }
      }

      // 41. Opponent advantage penalty — cards that disproportionately help opponent corps
      if (ctx.oppCorps && ctx.oppCorps.length > 0 && data.e) {
        var eLow41 = data.e.toLowerCase();
        var oppPenalty = 0;
        var OPP_CORP_VULN = {
          'Ecoline': ['plant', 'green', 'раст', 'озелен'],
          'Point Luna': ['draw', 'card', 'earth'],
          'Arklight': ['animal', 'plant'],
          'Poseidon': ['colon', 'колон', 'trade', 'торг'],
          'Tharsis Republic': ['city', 'город'],
          'Lakefront': ['ocean', 'океан'],
          'Splice': ['microbe', 'микроб'],
          'Celestic': ['floater', 'флоат'],
          'Helion': ['heat', 'тепл'],
          'Mining Guild': ['steel', 'стал']
        };
        for (var oci = 0; oci < ctx.oppCorps.length; oci++) {
          var oc = ctx.oppCorps[oci];
          var vulnKws = OPP_CORP_VULN[oc];
          if (!vulnKws) continue;
          // Check if THIS card's effect keywords match opponent's strengths
          // Only penalize for global effects (oceans, temperature, etc.) that benefit everyone
          var isGlobalEffect = eLow41.includes('ocean') || eLow41.includes('temperature') || eLow41.includes('oxygen') || eLow41.includes('global');
          if (isGlobalEffect) {
            for (var vk = 0; vk < vulnKws.length; vk++) {
              if (eLow41.includes(vulnKws[vk])) {
                oppPenalty = Math.max(oppPenalty, 2);
                break;
              }
            }
          }
        }
        if (oppPenalty > 0) {
          bonus -= oppPenalty;
          reasons.push('Помогает опп. −' + oppPenalty);
        }
      }

      // 25. Parameter saturation — proportional penalty based on lost value fraction
      // Supports choice:"tmp,vn" — player picks one param, penalize only if ALL maxed
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && ctx.globalParams) {
          var gl25 = Math.max(0, Math.min(13, ctx.gensLeft));
          var trVal25 = FTN_TABLE[gl25][0];
          var lostMCVal = 0;
          var approachPenalty25 = 0;

          // Choice params: e.g., "tmp,vn" = pick one (Atmoscoop: temp+2 OR venus+2)
          var choiceKeys = fx.choice ? fx.choice.split(',') : null;
          var choiceLost = 0;
          var choiceAllMaxed = !!choiceKeys;

          // Temperature: max +8, steps of 2
          if (fx.tmp) {
            var isChoice = choiceKeys && choiceKeys.indexOf('tmp') >= 0;
            if (ctx.globalParams.temp >= 8) {
              var loss = fx.tmp * trVal25;
              if (isChoice) choiceLost += loss; else lostMCVal += loss;
            } else {
              var tempRL = Math.max(0, (8 - ctx.globalParams.temp) / 2);
              var tempOver = Math.max(0, fx.tmp - tempRL);
              if (isChoice) {
                choiceLost += tempOver * trVal25;
                if (tempOver === 0) choiceAllMaxed = false;
              } else {
                lostMCVal += tempOver * trVal25;
                if (tempRL <= 2 && tempOver === 0) approachPenalty25 += 2;
              }
            }
          }
          // Oxygen: max 14%
          if (fx.o2) {
            var isChoice = choiceKeys && choiceKeys.indexOf('o2') >= 0;
            if (ctx.globalParams.oxy >= 14) {
              var loss = fx.o2 * trVal25;
              if (isChoice) choiceLost += loss; else lostMCVal += loss;
            } else {
              var oxyRL = Math.max(0, 14 - ctx.globalParams.oxy);
              var oxyOver = Math.max(0, fx.o2 - oxyRL);
              if (isChoice) {
                choiceLost += oxyOver * trVal25;
                if (oxyOver === 0) choiceAllMaxed = false;
              } else {
                lostMCVal += oxyOver * trVal25;
                if (oxyRL <= 2 && oxyOver === 0) approachPenalty25 += 2;
              }
            }
          }
          // Oceans: max 9 (ocean TR + ~3 MC placement bonus)
          if (fx.oc) {
            var isChoice = choiceKeys && choiceKeys.indexOf('oc') >= 0;
            if (ctx.globalParams.oceans >= 9) {
              var loss = fx.oc * (trVal25 + 3);
              if (isChoice) choiceLost += loss; else lostMCVal += loss;
            } else {
              var ocRL = Math.max(0, 9 - ctx.globalParams.oceans);
              var ocOver = Math.max(0, fx.oc - ocRL);
              if (isChoice) {
                choiceLost += ocOver * (trVal25 + 3);
                if (ocOver === 0) choiceAllMaxed = false;
              } else {
                lostMCVal += ocOver * (trVal25 + 3);
                if (ocRL <= 1 && ocOver === 0) approachPenalty25 += 2;
              }
            }
          }
          // Venus: max 30%, steps of 2
          if (fx.vn) {
            var isChoice = choiceKeys && choiceKeys.indexOf('vn') >= 0;
            if (ctx.globalParams.venus >= 30) {
              var loss = fx.vn * trVal25;
              if (isChoice) choiceLost += loss; else lostMCVal += loss;
            } else {
              var vnRL = Math.max(0, (30 - ctx.globalParams.venus) / 2);
              var vnOver = Math.max(0, fx.vn - vnRL);
              if (isChoice) {
                choiceLost += vnOver * trVal25;
                if (vnOver === 0) choiceAllMaxed = false;
              } else {
                lostMCVal += vnOver * trVal25;
                if (vnRL <= 2 && vnOver === 0) approachPenalty25 += 2;
              }
            }
          }

          // Choice resolution: only add loss if ALL choice branches are maxed
          if (choiceKeys && choiceAllMaxed) lostMCVal += choiceLost;

          if (lostMCVal > 0 || approachPenalty25 > 0) {
            var totalMCVal = computeCardValue(fx, ctx.gensLeft);
            var fractionLost = totalMCVal > 1 ? lostMCVal / totalMCVal : (lostMCVal > 0 ? 0.9 : 0);
            var satPenalty = Math.round(baseScore * fractionLost) + approachPenalty25;
            if (satPenalty > 0) {
              bonus -= satPenalty;
              var lostTRCount = Math.round(lostMCVal / trVal25);
              reasons.push(lostTRCount > 0
                ? lostTRCount + ' TR потер. −' + satPenalty + ' (' + Math.round(fractionLost * 100) + '%)'
                : 'Парам. скоро макс −' + satPenalty);
            }
          }
        }
      }

      // 26. Requirements feasibility — penalty if card can't be played anytime soon
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && fx.minG) {
          const gensUntilPlayable = Math.max(0, fx.minG - ctx.gen);
          if (gensUntilPlayable >= 3) {
            const reqPenalty = Math.min(5, gensUntilPlayable);
            bonus -= reqPenalty;
            reasons.push('Req далеко −' + reqPenalty);
          }
        }
      }

      // 27. Standard project comparison — cards cheaper than std projects get bonus
      if (typeof TM_CARD_EFFECTS !== 'undefined' && cardCost != null) {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx) {
          let stdBonus = 0;
          if (fx.city && fx.city >= 1 && cardCost <= 22) {
            stdBonus += Math.min(4, Math.round((25 - cardCost) / 2));
          }
          if (fx.grn && fx.grn >= 1 && cardCost <= 20) {
            stdBonus += Math.min(3, Math.round((23 - cardCost) / 2));
          }
          if (fx.oc && fx.oc >= 1 && cardCost <= 15) {
            stdBonus += Math.min(3, Math.round((18 - cardCost) / 2));
          }
          if (stdBonus > 0) {
            bonus += stdBonus;
            reasons.push('Дешевле std +' + stdBonus);
          }
        }
      }

      // 28. Board fullness — placement cards penalized when board is filling up
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && (fx.city || fx.grn)) {
          if (ctx.boardFullness > 0.7) {
            bonus -= 2;
            reasons.push('Доска полна −2');
          } else if (ctx.emptySpaces <= 5) {
            bonus -= 3;
            reasons.push('Мало мест −3');
          }
        }
      }

      // 29. Resource accumulation VP bonus — VP-per-resource cards better when accum rate > 0
      if (data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('vp') || eLower.includes('1 vp')) {
          if (eLower.includes('animal') && ctx.animalAccumRate > 0) {
            bonus += Math.min(3, ctx.animalAccumRate * 2);
            reasons.push('Жив. VP +' + Math.min(3, ctx.animalAccumRate * 2));
          }
          if (eLower.includes('microb') && ctx.microbeAccumRate > 0) {
            bonus += Math.min(3, ctx.microbeAccumRate * 2);
            reasons.push('Мик. VP +' + Math.min(3, ctx.microbeAccumRate * 2));
          }
          if (eLower.includes('floater') && ctx.floaterAccumRate > 0) {
            bonus += Math.min(3, ctx.floaterAccumRate * 2);
            reasons.push('Флоат. VP +' + Math.min(3, ctx.floaterAccumRate * 2));
          }
        }
      }

      // 30. Strategy detection — committed directions get bonus
      if (cardTags.size > 0) {
        const STRATEGY_THRESHOLDS = { 'venus': 3, 'jovian': 2, 'science': 4, 'earth': 4, 'microbe': 3, 'animal': 3, 'building': 6 };
        for (const tag of cardTags) {
          const threshold = STRATEGY_THRESHOLDS[tag];
          if (threshold && (ctx.tags[tag] || 0) >= threshold) {
            const depth = (ctx.tags[tag] || 0) - threshold;
            const stratBonus = Math.min(4, 2 + depth);
            bonus += stratBonus;
            reasons.push(tag + ' стратегия +' + stratBonus);
            break;
          }
        }
      }

      // 31. Card draw engine timing — draw cards valuable early, dead late
      if (data.e) {
        const eLower = data.e.toLowerCase();
        const isDrawCard = (eLower.includes('draw') || eLower.includes('рисуй') || eLower.includes('вытяни')) && !eLower.includes('withdraw');
        if (isDrawCard) {
          if (ctx.gensLeft >= 5) {
            bonus += 4;
            reasons.push('Рисовка рано +4');
          } else if (ctx.gensLeft >= 3) {
            bonus += 1;
          } else if (ctx.gensLeft <= 2) {
            bonus -= 3;
            reasons.push('Рисовка поздно −3');
          }
        }
      }

      // 32. Steel/Titanium resource stockpile — building/space cards cheaper when resources available
      if (cardTags.has('building') && ctx.steel >= 6) {
        const stBonus = Math.min(3, Math.floor(ctx.steel / 4));
        bonus += stBonus;
        reasons.push('Steel ' + ctx.steel + ' +' + stBonus);
      }
      if (cardTags.has('space') && ctx.titanium >= 4) {
        const tiBonus = Math.min(4, Math.floor(ctx.titanium / 2));
        bonus += tiBonus;
        reasons.push('Ti ' + ctx.titanium + ' +' + tiBonus);
      }

      // 32b. Space card penalty when 0 titanium — must pay full MC
      if (cardTags.has('space') && ctx.titanium === 0 && cardCost != null && cardCost >= 10) {
        const tiCap = cardCost >= 25 ? 8 : 5;
        const tiPenalty = Math.min(tiCap, Math.ceil(cardCost / 5));
        bonus -= tiPenalty;
        reasons.push('0 Ti −' + tiPenalty);
      }

      // 33. Corporation-specific scoring — unique adjustments beyond tag triggers
      if (myCorp && data.e) {
        const eLower = data.e.toLowerCase();
        const CORP_BOOSTS = {
          'Point Luna': function() { return (eLower.includes('draw') || eLower.includes('card') || cardTags.has('earth')) ? 2 : 0; },
          'Ecoline': function() { return (eLower.includes('plant') || eLower.includes('green') || eLower.includes('раст')) ? 2 : 0; },
          'Tharsis Republic': function() { return (eLower.includes('city') || eLower.includes('город')) ? 3 : 0; },
          'Helion': function() { return (eLower.includes('heat') || eLower.includes('тепл')) ? 2 : 0; },
          'Phobolog': function() { return cardTags.has('space') ? 2 : 0; },
          'Mining Guild': function() { return (eLower.includes('steel') || eLower.includes('стал') || cardTags.has('building')) ? 1 : 0; },
          'Credicor': function() { return (cardCost != null && cardCost >= 20) ? 2 : 0; },
          'Interplanetary Cinematics': function() { return cardTags.has('event') ? 2 : 0; },
          'Arklight': function() { return (eLower.includes('animal') || eLower.includes('plant') || eLower.includes('жив')) ? 2 : 0; },
          'Poseidon': function() { return (eLower.includes('colon') || eLower.includes('колон')) ? 3 : 0; },
          'Polyphemos': function() { return (eLower.includes('draw') || eLower.includes('card')) ? -2 : 0; },
          'Lakefront': function() { return (eLower.includes('ocean') || eLower.includes('океан')) ? 2 : 0; },
          'Splice': function() { return cardTags.has('microbe') ? 2 : 0; },
          'Celestic': function() { return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0; },
          'Robinson Industries': function() { return (eLower.includes('prod') || eLower.includes('прод')) ? 1 : 0; },
          'Viron': function() { return cardType === 'blue' ? 2 : 0; },
          'Recyclon': function() { return cardTags.has('building') ? 1 : 0; },
          'Stormcraft': function() { return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0; },
          'Aridor': function() {
            let newType = false;
            for (const tag of cardTags) { if ((ctx.tags[tag] || 0) === 0) newType = true; }
            return newType ? 3 : 0;
          },
          'Manutech': function() { return (eLower.includes('prod') || eLower.includes('прод')) ? 2 : 0; },
        };
        const corpFn = CORP_BOOSTS[myCorp];
        if (corpFn) {
          const corpBoost = corpFn();
          if (corpBoost !== 0) {
            bonus += corpBoost;
            reasons.push(myCorp + ' ' + (corpBoost > 0 ? '+' : '') + corpBoost);
          }
        }
      }

      // 34. 3+ card combo chain — enhanced bonus for closing multi-card combos
      if (typeof TM_COMBOS !== 'undefined') {
        for (const combo of TM_COMBOS) {
          if (!combo.cards.includes(cardName)) continue;
          const otherCards = combo.cards.filter(function(c) { return c !== cardName; });
          const matchCount = otherCards.filter(function(c) { return allMyCards.includes(c); }).length;
          if (matchCount >= 2) {
            const chainRating = combo.r === 'godmode' ? 6 : combo.r === 'great' ? 4 : 3;
            bonus += chainRating;
            reasons.push('Цепь ' + (matchCount + 1) + '/' + combo.cards.length + ' +' + chainRating);
            break;
          }
        }
      }

      // 35. Trade value by colony track positions
      if (ctx.tradesLeft > 0 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('торг') || eLower.includes('колон')) {
          const pv = getPlayerVueData();
          if (pv && pv.game && pv.game.colonies) {
            let bestTrackVal = 0;
            for (const col of pv.game.colonies) {
              if (col.isActive !== false && col.trackPosition != null) {
                bestTrackVal = Math.max(bestTrackVal, col.trackPosition);
              }
            }
            if (bestTrackVal >= 3) {
              const tradeBonus = Math.min(3, Math.floor(bestTrackVal / 2));
              bonus += tradeBonus;
              reasons.push('Трек ' + bestTrackVal + ' +' + tradeBonus);
            }
          }
        }
      }

      // 36. Map-specific card bonuses
      if (ctx.mapName && cardTags.size > 0) {
        // Hellas: Diversifier (8 unique tags), Rim Settler (3 Jovian), Energizer (6 energy-prod)
        if (ctx.mapName === 'Hellas') {
          if (cardTags.has('jovian')) { bonus += 2; reasons.push('Hellas Jovian +2'); }
          // New unique tag type helps Diversifier
          for (const tag of cardTags) {
            if ((ctx.tags[tag] || 0) === 0 && tag !== 'event') {
              bonus += 2; reasons.push('Diversifier +2'); break;
            }
          }
          if (cardTags.has('power') || (data.e && data.e.toLowerCase().includes('energy-prod'))) {
            bonus += 1; reasons.push('Energizer +1');
          }
        }
        // Elysium: Ecologist (4 bio tags), Legend (5 events), Celebrity (15+ MC cards)
        if (ctx.mapName === 'Elysium') {
          const bioTags = ['plant', 'animal', 'microbe'];
          for (const tag of cardTags) {
            if (bioTags.includes(tag)) { bonus += 1; reasons.push('Ecologist +1'); break; }
          }
          if (cardTags.has('event')) { bonus += 1; reasons.push('Legend +1'); }
          if (cardCost != null && cardCost >= 15) { bonus += 1; reasons.push('Celebrity +1'); }
        }
        // Tharsis: Mayor (3 cities), Builder (8 building), Gardener (3 greeneries)
        if (ctx.mapName === 'Tharsis') {
          if (data.e && data.e.toLowerCase().includes('city')) { bonus += 1; reasons.push('Mayor +1'); }
          if (cardTags.has('building')) { bonus += 1; reasons.push('Builder +1'); }
        }
      }

      // 37. Terraform rate awareness — fast game = less time for engine
      if (ctx.terraformRate > 0 && ctx.gen >= 3) {
        const isFastGame = ctx.terraformRate >= 4;
        const isSlowGame = ctx.terraformRate <= 2;
        if (data.e) {
          const eLower = data.e.toLowerCase();
          const isProd = eLower.includes('prod') || eLower.includes('прод');
          const isVP = eLower.includes('vp') || eLower.includes('вп');
          if (isFastGame && isProd && !isVP) {
            bonus -= 2;
            reasons.push('Быстр. игра −2');
          }
          if (isSlowGame && isProd && !isVP && ctx.gensLeft >= 4) {
            bonus += 2;
            reasons.push('Медл. игра +2');
          }
          if (isFastGame && isVP) {
            bonus += 2;
            reasons.push('Быстр. → VP +2');
          }
        }
      }
    }

    // 38. Resource conversion synergy — cards that enable or improve conversions
    if (ctx && data.e) {
      const eLower = data.e.toLowerCase();
      // Plants→greenery: if player has high plant production but O₂ not maxed
      if (ctx.plantProd >= 4 && ctx.oxygenLeft > 0) {
        if (eLower.includes('plant') || eLower.includes('раст') || eLower.includes('greener') || eLower.includes('озелен')) {
          bonus += 2;
          reasons.push('Plant engine +2');
        }
      }
      // Heat conversion: cards that give heat when temp not maxed
      if (ctx.tempLeft > 0 && ctx.heatProd >= 4) {
        if (eLower.includes('heat') || eLower.includes('тепл')) {
          bonus += 1;
          reasons.push('Heat→TR +1');
        }
      }
      // Microbe→TR: cards that place microbes when player has converters (Regolith, GHG Bacteria)
      if (ctx.microbeAccumRate > 0) {
        if (eLower.includes('microbe') || eLower.includes('микроб')) {
          bonus += 2;
          reasons.push('Микроб engine +2');
        }
      }
      // Floater accumulation when player has floater VP cards
      if (ctx.floaterAccumRate > 0) {
        if (eLower.includes('floater') || eLower.includes('флоат')) {
          bonus += 2;
          reasons.push('Флоатер engine +2');
        }
      }
    }

    // 40. Draw/Play hand size optimizer — draw cards penalty when hand full, bonus when empty
    if (ctx && data.e) {
      var eLow = data.e.toLowerCase();
      var isDrawCard = (eLow.includes('draw') || eLow.includes('рисуй') || eLow.includes('вытяни')) && !eLow.includes('withdraw');
      if (isDrawCard) {
        var handSize = myHand ? myHand.length : 0;
        if (handSize >= 10) {
          bonus -= 3;
          reasons.push('Рука полна −3');
        } else if (handSize <= 3) {
          bonus += 3;
          reasons.push('Мало карт +3');
        }
      }
    }

    // 42. Endgame conversion chain — greenery cards before heat in final gen
    if (ctx && ctx.gensLeft <= 1 && data.e) {
      var eLow42 = data.e.toLowerCase();
      var isGreenerySource = eLow42.includes('green') || eLow42.includes('озелен') || eLow42.includes('plant') || eLow42.includes('раст');
      var isHeatSource = eLow42.includes('heat') || eLow42.includes('тепл');
      // Greenery in final gen = VP + possible O₂ bonus TR
      if (isGreenerySource && ctx.oxyLeft > 0) {
        bonus += 3;
        reasons.push('Финал: озелен. +O₂ +3');
      }
      // Heat in final gen is lower value if temp maxed
      if (isHeatSource && ctx.tempLeft <= 0) {
        bonus -= 2;
        reasons.push('Темп. закрыта −2');
      }
    }

    // 43. Wild tag flexibility — wild tags count as most-needed tag for milestones/awards
    if (cardTags.has('wild') && ctx) {
      var wildBonus = 0;
      // Check which milestone/award tags are most needed
      if (ctx.milestoneProximity) {
        for (var mpi = 0; mpi < ctx.milestoneProximity.length; mpi++) {
          var mp = ctx.milestoneProximity[mpi];
          if (mp.needed <= 2 && mp.needed > 0) {
            wildBonus = Math.max(wildBonus, 3);
          }
        }
      }
      if (wildBonus === 0) wildBonus = 2; // generic wild flexibility
      bonus += wildBonus;
      reasons.push('Дикий тег +' + wildBonus);
    }

    // 44. City adjacency planning — city cards better with greenery engine
    if (ctx && data.e) {
      var eLow44 = data.e.toLowerCase();
      if (eLow44.includes('city') || eLow44.includes('город')) {
        var myGreeneries = 0;
        var pv44 = getPlayerVueData();
        if (pv44 && pv44.game && pv44.game.spaces && pv44.thisPlayer) {
          for (var si = 0; si < pv44.game.spaces.length; si++) {
            var sp = pv44.game.spaces[si];
            if (sp.color === pv44.thisPlayer.color && (sp.tileType === 'greenery' || sp.tileType === 1)) myGreeneries++;
          }
        }
        if (myGreeneries >= 3 || ctx.plantProd >= 4) {
          bonus += 2;
          reasons.push('Город+озелен. +2');
        } else if (ctx.gensLeft <= 1 && myGreeneries < 2) {
          bonus -= 2;
          reasons.push('Мало озелен. −2');
        }
      }
    }

    // 45. Delegate leadership opportunity
    if (ctx && ctx.turmoilActive && data.e) {
      var eLow45 = data.e.toLowerCase();
      if (eLow45.includes('delegate') || eLow45.includes('делегат')) {
        var pv45 = getPlayerVueData();
        if (pv45 && pv45.game && pv45.game.turmoil && pv45.game.turmoil.parties) {
          var leaderOpportunity = false;
          for (var pi = 0; pi < pv45.game.turmoil.parties.length; pi++) {
            var party = pv45.game.turmoil.parties[pi];
            if (!party.delegates) continue;
            var myDels = 0, maxOppDels = 0;
            for (var di = 0; di < party.delegates.length; di++) {
              var d = party.delegates[di];
              var dColor = d.color || d;
              if (dColor === (pv45.thisPlayer && pv45.thisPlayer.color)) myDels += (d.number || 1);
              else maxOppDels = Math.max(maxOppDels, d.number || 1);
            }
            // If +1 delegate gives leadership
            if (myDels > 0 && myDels + 1 > maxOppDels) {
              leaderOpportunity = true;
              break;
            }
          }
          if (leaderOpportunity) {
            bonus += 3;
            reasons.push('Лидерство партии +3');
          }
        }
      }
    }

    // 46. CEO card permanent ability value
    if (cardEl && cardEl.querySelector('.ceo-label')) {
      var gLeft = ctx ? (ctx.gensLeft || 5) : 5;
      var ceoBonus = 0;
      if (data.e) {
        var ceoE = data.e.toLowerCase();
        // Categorize CEO ability
        if (ceoE.includes('draw') || ceoE.includes('card') || ceoE.includes('рисуй')) ceoBonus = Math.min(8, gLeft);
        else if (ceoE.includes('discount') || ceoE.includes('скидк') || ceoE.includes('-') && ceoE.includes('mc')) ceoBonus = Math.min(6, gLeft);
        else if (ceoE.includes('prod') || ceoE.includes('прод')) ceoBonus = Math.min(6, Math.round(gLeft * 0.8));
        else if (ceoE.includes('vp') || ceoE.includes('vp per')) ceoBonus = Math.min(5, Math.round(gLeft * 0.7));
        else if (ceoE.includes('action')) ceoBonus = Math.min(7, gLeft);
        else ceoBonus = Math.min(4, Math.round(gLeft * 0.5)); // generic
      }
      if (ceoBonus > 0) {
        bonus += ceoBonus;
        reasons.push('CEO пост. ×' + gLeft + ' +' + ceoBonus);
      }
    }

    // Prelude-specific scoring
    // Detect prelude by: cardEl has no cost (.card-number missing or cost=0) AND card is in prelude selection
    const isPrelude = cardEl && (
      cardEl.closest('.wf-component--select-prelude') ||
      cardEl.classList.contains('prelude-card') ||
      (getCardCost(cardEl) === null && data.s > 0)
    );
    if (isPrelude && ctx) {
      // Gen 1 bonus: production preludes are more valuable early
      if (ctx.gen <= 1) {
        const econLower = (data.e || '').toLowerCase();
        if (econLower.includes('прод') || econLower.includes('prod') || econLower.includes('production')) {
          bonus += 4;
          reasons.push('Прод ген.1 +4');
        }
        // Immediate TR bonus
        if (econLower.includes('tr') || econLower.includes('terraform')) {
          bonus += 3;
          reasons.push('Ранний TR +3');
        }
        // Immediate resources (steel, titanium, MC) for gen 1 flexibility
        if (econLower.includes('steel') || econLower.includes('стал') || econLower.includes('titanium') || econLower.includes('титан')) {
          bonus += 2;
          reasons.push('Ресурсы ген.1 +2');
        }
      }
      // Tag value on prelude — gen 1 tags are very valuable
      if (cardEl) {
        const pTags = getCardTags(cardEl);
        if (pTags.size > 0 && ctx.tagTriggers) {
          let tagBonus = 0;
          for (const trigger of ctx.tagTriggers) {
            for (const tTag of (trigger.tags || [])) {
              if (pTags.has(tTag)) tagBonus += trigger.value;
            }
          }
          if (tagBonus > 0) {
            bonus += Math.min(8, tagBonus);
            reasons.push('Теги прел. +' + Math.min(8, tagBonus));
          }
        }
      }
      // Corp+prelude synergy — prelude combo with selected corp
      if (myCorp && typeof TM_COMBOS !== 'undefined') {
        for (const combo of TM_COMBOS) {
          if (!combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
          const ratingBonus = combo.r === 'godmode' ? 8 : combo.r === 'great' ? 5 : combo.r === 'good' ? 3 : 1;
          bonus += ratingBonus;
          reasons.push('Комбо с ' + myCorp + ' +' + ratingBonus);
          break;
        }
      }
      // Prelude synergy with other selected prelude (if visible)
      if (typeof TM_COMBOS !== 'undefined') {
        const preludeEls = document.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card]');
        const otherPreludes = [];
        preludeEls.forEach(function(pel) {
          const pName = pel.getAttribute('data-tm-card');
          if (!pName || pName === cardName) return;
          otherPreludes.push(pName);
          // Check if there's a combo between this prelude and the other one
          for (const combo of TM_COMBOS) {
            if (combo.cards.includes(cardName) && combo.cards.includes(pName)) {
              const rBonus = combo.r === 'godmode' ? 6 : combo.r === 'great' ? 4 : combo.r === 'good' ? 2 : 1;
              bonus += rBonus;
              reasons.push('Прел.+' + (ruName(pName) || pName).substring(0, 12) + ' +' + rBonus);
            }
          }
        });

        // Triple synergy: corp + this prelude + another prelude
        if (myCorp && otherPreludes.length > 0) {
          for (const combo of TM_COMBOS) {
            if (combo.cards.length < 3) continue;
            if (!combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
            for (const otherP of otherPreludes) {
              if (combo.cards.includes(otherP)) {
                const matched = [cardName, myCorp, otherP].length;
                if (matched >= 3 && matched >= combo.cards.length) {
                  const triBonus = combo.r === 'godmode' ? 12 : combo.r === 'great' ? 8 : combo.r === 'good' ? 5 : 3;
                  bonus += triBonus;
                  reasons.push('★ Тройное комбо! +' + triBonus);
                } else if (matched >= 3) {
                  const partialBonus = combo.r === 'godmode' ? 6 : combo.r === 'great' ? 4 : 2;
                  bonus += partialBonus;
                  reasons.push('Тройное частичное ' + matched + '/' + combo.cards.length + ' +' + partialBonus);
                }
              }
            }
          }
          // Tag-based triple synergy: if corp+prelude+prelude share rare tags
          for (const otherP of otherPreludes) {
            const otherData = TM_RATINGS[otherP];
            if (!otherData || !otherData.g || !data.g) continue;
            const sharedTags = data.g.filter(function(t) { return otherData.g && otherData.g.includes(t); });
            const rareShared = sharedTags.filter(function(t) { return ['Jovian','Science','Venus','Earth'].includes(t); });
            if (rareShared.length > 0) {
              // Both preludes share rare tag + corp might benefit
              bonus += 2;
              reasons.push('Прелюдии: ' + rareShared[0] + ' синергия +2');
            }
          }
        }
      }
    }

    return { total: baseScore + bonus, reasons };
  }

  function scoreToTier(score) {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  function tierColor(t) {
    return t === 'S' ? '#e74c3c' : t === 'A' ? '#e67e22' : t === 'B' ? '#f1c40f'
      : t === 'C' ? '#2ecc71' : t === 'D' ? '#95a5a6' : '#7f8c8d';
  }

  function updateDraftRecommendations() {
    if (!enabled) return;

    // Remove old recommendation overlays
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));
    document.querySelectorAll('[data-tm-reasons]').forEach((el) => el.removeAttribute('data-tm-reasons'));
    // Restore badges that were modified in previous run
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach((badge) => {
      const orig = badge.getAttribute('data-tm-original');
      badge.textContent = orig;
      badge.removeAttribute('data-tm-original');
      // Restore original tier class
      const origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) {
        badge.className = 'tm-tier-badge tm-tier-' + origTier;
        badge.removeAttribute('data-tm-orig-tier');
      }
    });

    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) return;

    let myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandNames();
    const ctx = getCachedPlayerContext();

    // Initial draft detection: detect offered corps when no corp chosen yet
    let offeredCorps = [];
    var gen = detectGeneration();
    if (!myCorp && gen <= 1) {
      // Find corp cards on the page (they have .card-title.is-corporation or corp-specific selectors)
      document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
        var cn = el.getAttribute('data-tm-card');
        if (!cn) return;
        var d = TM_RATINGS[cn];
        // Heuristic: if data exists AND it's in the synergy list of other cards as a corp, treat it as corp
        // Better: check DOM for corporation card styling
        if (el.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
            (el.closest('.select-corporation') || el.closest('[class*="corporation"]'))) {
          offeredCorps.push(cn);
        }
      });
      // Fallback: if no DOM heuristic worked, try known corp names from ratings
      if (offeredCorps.length === 0) {
        document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
          var cn = el.getAttribute('data-tm-card');
          if (!cn) return;
          var d = TM_RATINGS[cn];
          // Corps typically have synergy lists and economy descriptions
          if (d && d.e && (d.e.includes('Корп') || d.e.includes('Corp') || d.e.includes('Стартовый') || d.e.includes('Start'))) {
            offeredCorps.push(cn);
          }
        });
      }
      // Last fallback: check if TAG_TRIGGERS or CORP_DISCOUNTS have the card name
      if (offeredCorps.length === 0) {
        document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
          var cn = el.getAttribute('data-tm-card');
          if (cn && (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn])) {
            offeredCorps.push(cn);
          }
        });
      }
    }

    // Detect research phase (gen >= 2, 4 cards with buy/skip checkboxes, not prelude)
    var isResearchPhase = false;
    if (gen >= 2) {
      var cardCount = 0;
      selectCards.forEach(function(sec) { cardCount += sec.querySelectorAll('.card-container[data-tm-card]').length; });
      // Research = 4 cards shown for buying, not during draft (draft has smaller sets rotating)
      var hasCheckboxes = document.querySelectorAll('.wf-component--select-card input[type="checkbox"]').length > 0;
      isResearchPhase = cardCount === 4 && hasCheckboxes;
    }

    // Score each card in selection
    const scored = [];
    selectCards.forEach((section) => {
      section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;

        // During initial draft: score against each offered corp, pick best
        let result;
        if (!myCorp && offeredCorps.length > 0 && !offeredCorps.includes(name)) {
          let bestResult = null;
          let bestTotal = -999;
          let bestCorp = '';
          for (const corpName of offeredCorps) {
            const r = scoreDraftCard(name, myTableau, myHand, corpName, el, ctx);
            if (r.total > bestTotal) {
              bestTotal = r.total;
              bestResult = r;
              bestCorp = corpName;
            }
          }
          result = bestResult || scoreDraftCard(name, myTableau, myHand, '', el, ctx);
          if (bestCorp && bestResult && bestResult.total > (TM_RATINGS[name] ? TM_RATINGS[name].s : 0)) {
            result.reasons.push('↑ с ' + bestCorp);
          }
        } else {
          result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
        }

        // Research phase adjustment: factor in 3 MC buy cost + hand space
        if (isResearchPhase) {
          var researchAdj = 0;
          var handSize = myHand ? myHand.length : 0;
          // Card costs 3 MC to buy — is it worth that?
          var cardCost = getCardCost(el);
          var myMC = ctx ? (ctx.mc || 0) : 0;

          // Cheap synergy cards (< 10 MC + has synergy) = always buy
          if (cardCost !== null && cardCost <= 10 && result.reasons.length >= 2) {
            researchAdj += 3;
          }
          // Expensive cards (> 20 MC) that we can't afford soon
          else if (cardCost !== null && cardCost > 20 && myMC < cardCost * 0.7) {
            researchAdj -= 4;
          }
          // Hand already large — hand space penalty
          if (handSize >= 8) {
            researchAdj -= 3;
          }
          // Low score cards (< 60) aren't worth 3 MC
          if (result.total < 60) {
            researchAdj -= 5;
          }

          result.total += researchAdj;
          if (researchAdj < -2) result.reasons.push('Research: skip');
          else if (researchAdj > 2) result.reasons.push('Research: buy');
        }

        scored.push({ el, name, ...result });
      });
    });

    if (scored.length === 0) return;

    // Save scores for draft history logging
    lastDraftScores = {};
    scored.forEach((item) => {
      const d = TM_RATINGS[item.name];
      lastDraftScores[item.name] = { total: item.total, tier: scoreToTier(item.total), baseTier: d ? d.t : '?', baseScore: d ? d.s : 0, reasons: item.reasons.slice(0, 3) };
    });

    // Sort by score desc
    scored.sort((a, b) => b.total - a.total);
    const bestScore = scored[0].total;

    // Update badge on every card in draft with calculated score
    scored.forEach((item) => {
      const isBest = item.total >= bestScore - 5;
      const hasBonus = item.reasons.length > 0;

      // Highlight top picks
      if (isBest && hasBonus) {
        item.el.classList.add('tm-rec-best');
      }

      // Update existing badge with calculated score
      const badge = item.el.querySelector('.tm-tier-badge');
      if (badge) {
        const origData = TM_RATINGS[item.name];
        const origTier = origData ? origData.t : 'C';
        const origScore = origData ? origData.s : 0;
        const newTier = scoreToTier(item.total);

        // Save original text for restoration
        if (!badge.hasAttribute('data-tm-original')) {
          badge.setAttribute('data-tm-original', badge.textContent);
          badge.setAttribute('data-tm-orig-tier', origTier);
        }

        // Update badge text: show base→adjusted with colored delta
        const delta = item.total - origScore;
        if (delta === 0) {
          badge.textContent = newTier + ' ' + item.total;
        } else {
          const cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
          const sign = delta > 0 ? '+' : '';
          badge.innerHTML = origTier + origScore +
            '<span class="tm-badge-arrow">\u2192</span>' +
            newTier + item.total +
            ' <span class="' + cls + '">' + sign + delta + '</span>';
        }

        // Update tier color class
        badge.className = 'tm-tier-badge tm-tier-' + newTier;

        // Sync tm-dim with adjusted tier (not base tier)
        if (newTier === 'D' || newTier === 'F') {
          item.el.classList.add('tm-dim');
        } else {
          item.el.classList.remove('tm-dim');
        }
      }

      // Store reasons on card element for tooltip display
      if (item.reasons.length > 0) {
        item.el.setAttribute('data-tm-reasons', item.reasons.join('|'));
      } else {
        item.el.removeAttribute('data-tm-reasons');
      }
    });
  }

  // ── Prelude Package Scoring ──

  let lastPackageNotified = '';

  function checkPreludePackage() {
    if (!enabled) return;
    var preludeEls = document.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card]');
    if (preludeEls.length < 3) return; // Need 3+ preludes to compare pairs

    var myCorp = detectMyCorp();
    var preludes = [];
    preludeEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) preludes.push(name);
    });
    if (preludes.length < 3) return;

    // Score all pairs
    var bestPair = null;
    var bestPairScore = -Infinity;
    for (var i = 0; i < preludes.length; i++) {
      for (var j = i + 1; j < preludes.length; j++) {
        var p1 = preludes[i];
        var p2 = preludes[j];
        var d1 = TM_RATINGS[p1];
        var d2 = TM_RATINGS[p2];
        var pairScore = (d1 ? d1.s : 50) + (d2 ? d2.s : 50);

        // Corp+prelude combo bonus
        if (myCorp && typeof TM_COMBOS !== 'undefined') {
          for (var ci = 0; ci < TM_COMBOS.length; ci++) {
            var combo = TM_COMBOS[ci];
            var matchCount = 0;
            if (combo.cards.includes(myCorp)) matchCount++;
            if (combo.cards.includes(p1)) matchCount++;
            if (combo.cards.includes(p2)) matchCount++;
            if (matchCount >= 2) {
              var comboVal = combo.r === 'godmode' ? 20 : combo.r === 'great' ? 12 : combo.r === 'good' ? 6 : 2;
              pairScore += comboVal;
            }
          }
        }

        // Prelude+prelude combo
        if (typeof TM_COMBOS !== 'undefined') {
          for (var ci = 0; ci < TM_COMBOS.length; ci++) {
            var combo = TM_COMBOS[ci];
            if (combo.cards.includes(p1) && combo.cards.includes(p2)) {
              var comboVal = combo.r === 'godmode' ? 15 : combo.r === 'great' ? 10 : combo.r === 'good' ? 5 : 2;
              pairScore += comboVal;
            }
          }
        }

        // Tag diversity bonus (for milestones)
        if (d1 && d1.g && d2 && d2.g) {
          var allTags = new Set();
          d1.g.forEach(function(t) { allTags.add(t); });
          d2.g.forEach(function(t) { allTags.add(t); });
          if (allTags.size >= 4) pairScore += 5;
          // Rare tag bonus
          var rares = ['Jovian', 'Science', 'Venus'];
          for (var ri = 0; ri < rares.length; ri++) {
            if (allTags.has(rares[ri])) pairScore += 2;
          }
        }

        // Production focus bonus (both give production = strong gen 1)
        if (d1 && d1.e && d2 && d2.e) {
          var e1 = d1.e.toLowerCase();
          var e2 = d2.e.toLowerCase();
          if ((e1.includes('prod') || e1.includes('прод')) && (e2.includes('prod') || e2.includes('прод'))) {
            pairScore += 5;
          }
        }

        if (pairScore > bestPairScore) {
          bestPairScore = pairScore;
          bestPair = [p1, p2];
        }
      }
    }

    if (bestPair) {
      var pairKey = bestPair.sort().join('+');
      if (pairKey !== lastPackageNotified) {
        lastPackageNotified = pairKey;
        var name1 = (ruName(bestPair[0]) || bestPair[0]).substring(0, 15);
        var name2 = (ruName(bestPair[1]) || bestPair[1]).substring(0, 15);
        showToast('★ Лучшая пара: ' + name1 + ' + ' + name2 + ' (счёт: ' + bestPairScore + ')', 'great');
      }
    }
  }

  // ── Opponent strategy tracker ──

  let oppTrackerEl = null;
  let oppTrackerVisible = false;
  const oppLastTableau = {}; // color → Set of card names
  const oppRecentPlays = {}; // color → [{name, tier, turn}] last 5 cards
  const oppTRHistory = {}; // color → [{gen, tr}]
  let lastOppTRGen = 0;

  function buildOppTracker() {
    if (oppTrackerEl) return oppTrackerEl;
    oppTrackerEl = document.createElement('div');
    oppTrackerEl.className = 'tm-opp-tracker';
    document.body.appendChild(oppTrackerEl);
    return oppTrackerEl;
  }

  function updateOppTracker() {
    if (!oppTrackerVisible || !enabled) {
      if (oppTrackerEl) oppTrackerEl.style.display = 'none';
      return;
    }

    const panel = buildOppTracker();
    const pv = getPlayerVueData();

    let opponents = [];

    if (pv && pv.players && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      opponents = pv.players.filter((p) => p.color !== myColor);
    }

    if (opponents.length === 0) {
      // Fallback: try DOM
      panel.style.display = 'none';
      return;
    }

    let html = '<div class="tm-opp-title">' + minBtn('opp') + 'Оппоненты</div>';

    for (const opp of opponents) {
      const name = opp.name || opp.color || '?';
      const tr = opp.terraformRating || '?';
      const mc = opp.megaCredits != null ? opp.megaCredits : '?';
      const handSize = opp.cardsInHandNbr != null ? opp.cardsInHandNbr : '?';
      const tableauCount = opp.tableau ? opp.tableau.length : 0;

      // Count tags from Vue data
      const tagCounts = {};
      if (opp.tags) {
        for (const t of opp.tags) {
          const tagName = (t.tag || '').toLowerCase();
          if (tagName && t.count > 0) tagCounts[tagName] = t.count;
        }
      }

      // Analyze strategy from cards and production
      let strategyHints = [];

      if (opp.tableau && opp.tableau.length > 0) {
        const cardNames = opp.tableau.map((c) => c.name || c);
        let sCount = 0, aCount = 0;
        for (const cn of cardNames) {
          const d = TM_RATINGS[cn];
          if (d) {
            if (d.t === 'S') sCount++;
            else if (d.t === 'A') aCount++;
          }
        }
        if (sCount > 0) strategyHints.push(sCount + ' S-tier');
        if (aCount > 0) strategyHints.push(aCount + ' A-tier');
      }

      // Detect corp
      let oppCorp = '';
      if (opp.tableau) {
        for (const c of opp.tableau) {
          const cn = c.name || c;
          if (TM_RATINGS[cn] && TM_RATINGS[cn].t) continue; // project cards have tiers
          oppCorp = cn;
          break;
        }
      }
      if (oppCorp) strategyHints.push(oppCorp);

      // Strategy archetype from tags
      const sc = tagCounts.science || 0;
      const jov = tagCounts.jovian || 0;
      const sp = tagCounts.space || 0;
      const bld = tagCounts.building || 0;
      const plt = tagCounts.plant || 0;
      const ven = tagCounts.venus || 0;
      const mic = tagCounts.microbe || 0;
      const erth = tagCounts.earth || 0;

      if (sc >= 4) strategyHints.push('Science rush');
      else if (jov >= 3) strategyHints.push('Jovian');
      else if (sp >= 5) strategyHints.push('Space');
      else if (plt >= 3 || (opp.plantProduction || 0) >= 4) strategyHints.push('Plant engine');
      else if (bld >= 5) strategyHints.push('Builder');
      else if (ven >= 3) strategyHints.push('Venus');
      else if (mic >= 3) strategyHints.push('Microbe');
      else if (erth >= 3) strategyHints.push('Earth');

      // Production focus (secondary)
      if (opp.titaniumProduction >= 2) strategyHints.push('Ti:' + opp.titaniumProduction);
      if (opp.steelProduction >= 3) strategyHints.push('St:' + opp.steelProduction);
      if (opp.megaCreditProduction >= 10) strategyHints.push('MC:' + opp.megaCreditProduction);

      // Colony count
      if (opp.coloniesCount >= 2) strategyHints.push(opp.coloniesCount + ' кол.');

      // Fleet size
      if (opp.fleetSize >= 2) strategyHints.push('Флот:' + opp.fleetSize);

      // Color indicator
      const colorMap = {
        red: '#e74c3c', green: '#2ecc71', blue: '#3498db',
        yellow: '#f1c40f', black: '#555', purple: '#9b59b6',
        orange: '#e67e22', pink: '#e91e63',
      };
      const dotColor = colorMap[(opp.color || '').toLowerCase()] || '#888';

      html += '<div class="tm-opp-row">';
      html += '<div class="tm-opp-header">';
      html += '<span class="tm-opp-dot" style="background:' + dotColor + '"></span>';
      html += '<span class="tm-opp-name">' + escHtml(name) + '</span>';
      html += '<span class="tm-opp-tr">TR:' + tr + '</span>';
      // TR delta tracking
      const gen = detectGeneration();
      const oc = opp.color;
      if (!oppTRHistory[oc]) oppTRHistory[oc] = [];
      if (gen > 0 && typeof tr === 'number') {
        const lastEntry = oppTRHistory[oc][oppTRHistory[oc].length - 1];
        if (!lastEntry || lastEntry.gen !== gen) {
          oppTRHistory[oc].push({ gen: gen, tr: tr });
          if (oppTRHistory[oc].length > 15) oppTRHistory[oc].shift();
        } else {
          lastEntry.tr = tr;
        }
      }
      if (oppTRHistory[oc].length >= 2) {
        const lastH = oppTRHistory[oc][oppTRHistory[oc].length - 1];
        const prevH = oppTRHistory[oc][oppTRHistory[oc].length - 2];
        const trDelta = lastH.tr - prevH.tr;
        const trDeltaColor = trDelta > 3 ? '#f44336' : trDelta > 0 ? '#e67e22' : '#888';
        html += '<span style="font-size:10px;color:' + trDeltaColor + '"> (' + (trDelta >= 0 ? '+' : '') + trDelta + '/пок.)</span>';
      }
      html += '</div>';
      html += '<div class="tm-opp-stats">';
      html += '<span>' + mc + ' MC</span>';
      html += '<span>' + handSize + ' карт</span>';
      html += '<span>' + tableauCount + ' сыграно</span>';
      html += '</div>';

      // Tag breakdown
      const oppTagLabels = {
        building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
        venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', power: 'Энер',
        city: 'Гор', event: 'Соб'
      };
      const oppTagKeys = Object.keys(tagCounts).filter((k) => tagCounts[k] > 0 && oppTagLabels[k]);
      if (oppTagKeys.length > 0) {
        html += '<div class="tm-opp-tags">';
        for (const tk of oppTagKeys) {
          html += '<span class="tm-opp-tag">' + oppTagLabels[tk] + ':' + tagCounts[tk] + '</span>';
        }
        html += '</div>';
      }

      if (strategyHints.length > 0) {
        html += '<div class="tm-opp-hints">' + strategyHints.join(' / ') + '</div>';
      }

      // Production comparison vs me
      if (pv.thisPlayer) {
        const myP = pv.thisPlayer;
        const prodKeys = [
          { key: 'megaCreditProduction', label: 'MC', color: '#f1c40f' },
          { key: 'steelProduction', label: 'St', color: '#8b7355' },
          { key: 'titaniumProduction', label: 'Ti', color: '#888' },
          { key: 'plantProduction', label: 'Pl', color: '#4caf50' },
          { key: 'energyProduction', label: 'En', color: '#9b59b6' },
          { key: 'heatProduction', label: 'He', color: '#e67e22' },
        ];
        const diffs = [];
        for (const pk of prodKeys) {
          const myVal = myP[pk.key] || 0;
          const oppVal = opp[pk.key] || 0;
          const diff = oppVal - myVal;
          if (diff !== 0) {
            diffs.push('<span style="color:' + (diff > 0 ? '#f44336' : '#4caf50') + '">' + pk.label + (diff > 0 ? '+' : '') + diff + '</span>');
          }
        }
        if (diffs.length > 0) {
          html += '<div style="font-size:10px;color:#888;margin-top:1px">Прод. vs я: ' + diffs.join(' ') + '</div>';
        }
      }

      // VP estimation
      const oppTR = typeof tr === 'number' ? tr : 0;
      let oppGreen = 0;
      let oppCities = 0;
      if (pv.game && pv.game.spaces) {
        for (const sp of pv.game.spaces) {
          if (sp.color === opp.color) {
            if (sp.tileType === 'greenery' || sp.tileType === 1) oppGreen++;
            if (sp.tileType === 'city' || sp.tileType === 0 || sp.tileType === 'capital' || sp.tileType === 5) oppCities++;
          }
        }
      }
      // Milestone VP
      let oppMsVP = 0;
      if (pv.game && pv.game.milestones) {
        for (const ms of pv.game.milestones) {
          if (ms.color === opp.color || ms.playerColor === opp.color) oppMsVP += 5;
        }
      }
      // Real VP if available
      const oppVB = opp.victoryPointsBreakdown;
      const oppTotal = (oppVB && oppVB.total > 0) ? oppVB.total : (oppTR + oppGreen + oppCities + oppMsVP);
      const isReal = oppVB && oppVB.total > 0;

      // Delta vs me
      const myPV = pv.thisPlayer;
      const myVB = myPV ? myPV.victoryPointsBreakdown : null;
      let myTotal = 0;
      if (myVB && myVB.total > 0) {
        myTotal = myVB.total;
      } else if (myPV) {
        myTotal = (myPV.terraformRating || 0);
        if (pv.game && pv.game.spaces) {
          for (const sp of pv.game.spaces) {
            if (sp.color === myPV.color && (sp.tileType === 'greenery' || sp.tileType === 1)) myTotal++;
          }
        }
      }
      const delta = myTotal - oppTotal;
      const dSign = delta > 0 ? '+' : '';
      const dColor = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#888';

      html += '<div class="tm-opp-stats" style="margin-top:2px">';
      html += '<span style="color:#e67e22;font-weight:bold">VP~' + oppTotal + (isReal ? '' : '?') + '</span>';
      html += '<span style="color:' + dColor + ';font-weight:bold">' + dSign + delta + '</span>';
      html += '<span style="color:#888">' + oppGreen + 'O ' + oppCities + 'C' + (oppMsVP > 0 ? ' ' + (oppMsVP/5) + 'M' : '') + '</span>';
      html += '</div>';

      // Greenery/heat conversion threat
      const oppPlants = opp.plants || 0;
      const oppPlantsNeeded = opp.plantsNeededForGreenery || 8;
      const oppHeat = opp.heat || 0;
      const threats = [];
      if (oppPlants >= oppPlantsNeeded) threats.push('🌿 Озеленение (' + oppPlants + '/' + oppPlantsNeeded + ')');
      if (oppHeat >= 8) threats.push('🔥 +1°C (' + oppHeat + '/8)');
      if (threats.length > 0) {
        html += '<div style="font-size:10px;color:#ff9800;margin-top:1px">' + threats.join(' | ') + '</div>';
      }

      // Track newly played cards
      if (opp.tableau) {
        const color = opp.color;
        const currentCards = new Set(opp.tableau.map(function(c) { return c.name || c; }));
        if (!oppLastTableau[color]) oppLastTableau[color] = new Set();
        if (!oppRecentPlays[color]) oppRecentPlays[color] = [];

        for (const cn of currentCards) {
          if (!oppLastTableau[color].has(cn)) {
            const d = TM_RATINGS[cn];
            oppRecentPlays[color].push({ name: cn, tier: d ? d.t : '?', gen: detectGeneration() });
            if (oppRecentPlays[color].length > 5) oppRecentPlays[color].shift();
          }
        }
        oppLastTableau[color] = currentCards;

        // Show recent plays
        if (oppRecentPlays[color].length > 0) {
          html += '<div class="tm-opp-recent">';
          html += '<span style="color:#888;font-size:10px">Послед.: </span>';
          for (const rp of oppRecentPlays[color]) {
            const tClass = rp.tier !== '?' ? ' tm-tier-' + rp.tier : '';
            html += '<span class="tm-opp-recent-card' + tClass + '" title="' + escHtml(rp.name) + '">' + escHtml(ruName(rp.name)).substring(0, 12) + (rp.tier !== '?' ? ' (' + rp.tier + ')' : '') + '</span>';
          }
          html += '</div>';
        }
      }

      html += '</div>';
    }

    // Award/Milestone Racing Section
    if (pv && pv.game && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;

      // Awards
      if (pv.game.awards) {
        const awardRaces = [];
        for (const award of pv.game.awards) {
          if (award.color || award.playerName) continue; // already funded
          if (!award.scores) continue;
          const myScore = (award.scores.find(function(s) { return s.color === myColor; }) || {}).playerScore || 0;
          let leader = null;
          for (const sc of award.scores) {
            if (sc.color === myColor) continue;
            if (!leader || (sc.playerScore || 0) > leader.score) {
              leader = { color: sc.color, score: sc.playerScore || 0 };
            }
          }
          if (leader) {
            const diff = myScore - leader.score;
            awardRaces.push({ name: award.name, myScore: myScore, oppScore: leader.score, diff: diff, oppColor: leader.color });
          }
        }
        if (awardRaces.length > 0) {
          var gen = detectGeneration();
          var fundedCount = pv.game.awards.filter(function(a) { return a.color || a.playerName; }).length;
          var fundCost = fundedCount === 0 ? 8 : fundedCount === 1 ? 14 : fundedCount === 2 ? 20 : 999;
          var myMC = (pv.thisPlayer.megaCredits || 0);

          html += '<div class="tm-opp-section">';
          html += '<div style="font-size:11px;color:#ff9800;margin:4px 0 2px 0"><b>Awards</b> (фонд: ' + fundCost + ' MC)</div>';
          for (const ar of awardRaces) {
            const dColor = ar.diff > 0 ? '#4caf50' : ar.diff < 0 ? '#f44336' : '#888';
            const dSign = ar.diff > 0 ? '+' : '';
            const icon = ar.diff > 0 ? '✓' : ar.diff >= -2 ? '⚠' : '✗';
            html += '<div style="font-size:10px"><span style="color:' + dColor + '">' + icon + '</span> ';
            html += escHtml(ar.name) + ': ' + ar.myScore + ' vs ' + ar.oppScore;
            html += ' <span style="color:' + dColor + '">(' + dSign + ar.diff + ')</span>';
            // Funding advice
            if (ar.diff > 0 && fundedCount < 3 && myMC >= fundCost) {
              var advice = '';
              if (ar.diff >= 3 && gen >= 5) {
                advice = ' <span style="color:#4caf50;font-weight:bold">★ Финансируй!</span>';
              } else if (ar.diff >= 2 && gen >= 7) {
                advice = ' <span style="color:#ff9800">→ Пора</span>';
              } else if (ar.diff >= 1 && gen >= 4) {
                advice = ' <span style="color:#888">жди</span>';
              }
              html += advice;
            }
            html += '</div>';
          }
          html += '</div>';
        }
      }

      // Milestones
      if (pv.game.milestones) {
        const msRaces = [];
        for (const ms of pv.game.milestones) {
          if (ms.color || ms.playerName) continue; // already claimed
          if (!ms.scores) continue;
          const mySc = ms.scores.find(function(s) { return s.color === myColor; });
          if (!mySc) continue;
          const myProg = mySc.playerScore || 0;
          // Check if any opponent is close to claiming
          for (const sc of ms.scores) {
            if (sc.color === myColor) continue;
            if (sc.claimable) {
              msRaces.push({ name: ms.name, myScore: myProg, oppScore: sc.playerScore || 0, threat: true });
              break;
            }
          }
        }
        if (msRaces.length > 0) {
          html += '<div class="tm-opp-section">';
          html += '<div style="font-size:11px;color:#f44336;margin:4px 0 2px 0"><b>Вехи — угрозы</b></div>';
          for (const mr of msRaces) {
            html += '<div style="font-size:10px;color:#f44336">⚠ ' + escHtml(mr.name) + ' — оппонент может забрать!</div>';
          }
          html += '</div>';
        }
      }
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'opp');
    panel.style.display = 'block';
  }

  // ── Card age tracking ──

  const cardAcquiredGen = {}; // cardName → gen when first seen in hand

  function trackCardAge() {
    const gen = detectGeneration();
    if (gen <= 0) return;
    const handNames = getMyHandNames();
    for (const name of handNames) {
      if (!cardAcquiredGen[name]) cardAcquiredGen[name] = gen;
    }
    // Clean up cards no longer in hand
    for (const name in cardAcquiredGen) {
      if (!handNames.includes(name)) delete cardAcquiredGen[name];
    }
  }

  function updateCardAgeIndicators() {
    document.querySelectorAll('.tm-card-age, .tm-sell-hint').forEach((el) => el.remove());
    if (!enabled) return;

    const gen = detectGeneration();

    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      const data = TM_RATINGS[name];

      // Card age badge (2+ gens held)
      if (gen > 1) {
        const acqGen = cardAcquiredGen[name];
        if (acqGen && gen - acqGen >= 2) {
          const age = gen - acqGen;
          const badge = document.createElement('div');
          badge.className = 'tm-card-age' + (age >= 3 ? ' tm-card-stale' : '');
          badge.textContent = age + ' п.';
          badge.title = 'В руке ' + age + ' покол.' + (age >= 3 ? ' — подумай о продаже' : '');
          el.appendChild(badge);
        }
      }

      // Sell patent hint removed — tier badge D/F already signals weak card
    });
  }

  // ── Hand sort indicators (replaced by Play Priority system) ──

  function updateHandSort() {
    // Legacy stub — priority badges now handled by injectPlayPriorityBadges()
  }

  // ── Card comparison mode ──

  let compareCards = [];
  let compareEl = null;

  function addToCompare(cardName) {
    if (compareCards.includes(cardName)) return;
    compareCards.push(cardName);
    if (compareCards.length >= 2) {
      showComparison(compareCards[0], compareCards[1]);
      compareCards = [];
    } else {
      showToast('Сравнение: ' + ruName(cardName) + ' (кликни другой бейдж)', 'info');
    }
  }

  function showComparison(name1, name2) {
    const d1 = TM_RATINGS[name1];
    const d2 = TM_RATINGS[name2];
    if (!d1 || !d2) return;

    if (!compareEl) {
      compareEl = document.createElement('div');
      compareEl.className = 'tm-compare-panel';
      document.body.appendChild(compareEl);
      compareEl.addEventListener('click', (e) => {
        if (e.target === compareEl || e.target.classList.contains('tm-compare-close')) {
          compareEl.style.display = 'none';
        }
      });
    }

    const gen = detectGeneration();
    const mul = getValueMultipliers(gen);

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandNames();
    const ctx = getCachedPlayerContext();
    const r1 = scoreDraftCard(name1, myTableau, myHand, myCorp, null, ctx);
    const r2 = scoreDraftCard(name2, myTableau, myHand, myCorp, null, ctx);

    const winner = r1.total > r2.total ? 1 : r2.total > r1.total ? 2 : 0;

    function cardHtml(name, data, result, isWinner) {
      let h = '<div class="tm-cmp-card' + (isWinner ? ' tm-cmp-winner' : '') + '">';
      h += '<div class="tm-cmp-header">';
      h += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + ' ' + data.s + '</span> ';
      h += '<span class="tm-cmp-name">' + escHtml(ruName(name)) + '</span>';
      h += '</div>';
      if (data.e) h += '<div class="tm-cmp-row">' + escHtml(data.e) + '</div>';
      if (data.w) h += '<div class="tm-cmp-row" style="opacity:0.8">' + escHtml(data.w) + '</div>';
      if (data.y && data.y.length && data.y[0] !== 'None significant') {
        h += '<div class="tm-cmp-row"><b>Синергии:</b> ' + data.y.map(escHtml).join(', ') + '</div>';
      }

      // Corp synergy indicator
      if (myCorp) {
        const corpSyn = (data.y && data.y.includes(myCorp));
        const corpAbilMatch = (function() {
          if (!data.e) return false;
          const eL = data.e.toLowerCase();
          const corpKW = {
            'Point Luna': ['draw','card','earth'], 'Ecoline': ['plant','green'], 'Tharsis Republic': ['city','город'],
            'Helion': ['heat','тепл'], 'Phobolog': ['space'], 'Mining Guild': ['steel','building'],
            'Interplanetary Cinematics': ['event'], 'Arklight': ['animal','plant'],
            'Poseidon': ['colon'], 'Lakefront': ['ocean'], 'Celestic': ['floater'],
            'Splice': ['microbe'], 'Viron': ['action'], 'Recyclon': ['building'],
            'Stormcraft': ['floater'], 'Manutech': ['prod'], 'Credicor': []
          };
          const kws = corpKW[myCorp];
          if (!kws) return false;
          return kws.some(function(kw) { return eL.includes(kw); });
        })();
        if (corpSyn || corpAbilMatch) {
          h += '<div class="tm-cmp-row" style="color:#bb86fc">★ Синергия с ' + escHtml(myCorp) + '</div>';
        }
      }

      // Combo partial match
      if (typeof TM_COMBOS !== 'undefined') {
        const allCards = [...myTableau, ...myHand];
        let bestCombo = null;
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (!combo.cards.includes(name)) continue;
          var otherCards = combo.cards.filter(function(c) { return c !== name; });
          var matchedCount = otherCards.filter(function(c) { return allCards.includes(c); }).length;
          if (matchedCount > 0 && (!bestCombo || matchedCount > bestCombo.matched)) {
            bestCombo = { combo: combo, matched: matchedCount + 1, total: combo.cards.length };
          }
        }
        if (bestCombo) {
          var cColor = bestCombo.combo.r === 'godmode' ? '#ff4444' : bestCombo.combo.r === 'great' ? '#ffaa00' : '#4caf50';
          h += '<div class="tm-cmp-row" style="color:' + cColor + '">⚡ Комбо ' + bestCombo.matched + '/' + bestCombo.total + ': ' + escHtml(bestCombo.combo.v) + '</div>';
        }
      }

      // Timing warning
      if (ctx && data.e) {
        var eL = data.e.toLowerCase();
        var isProd = eL.includes('prod') || eL.includes('прод');
        var isAction = eL.includes('action') || eL.includes('действие');
        var isVP = eL.includes('vp') || eL.includes('vp per');
        if (isProd && ctx.gensLeft <= 2) {
          h += '<div class="tm-cmp-row" style="color:#ff6b6b">⏰ Поздно для продакшена (осталось ~' + ctx.gensLeft + ' пок.)</div>';
        } else if (isAction && ctx.gensLeft <= 2) {
          h += '<div class="tm-cmp-row" style="color:#ff6b6b">⏰ Мало активаций осталось (~' + ctx.gensLeft + ' пок.)</div>';
        } else if (isVP && !isProd && !isAction && ctx.gensLeft <= 2) {
          h += '<div class="tm-cmp-row" style="color:#4caf50">✓ Хорошее время для VP-burst</div>';
        } else if (isProd && ctx.gensLeft >= 5) {
          h += '<div class="tm-cmp-row" style="color:#4caf50">✓ Отличное время для продакшена</div>';
        }
      }

      // Strategy fit
      if (ctx && ctx.tags) {
        var STRAT = { 'venus': 3, 'jovian': 2, 'science': 4, 'earth': 4, 'microbe': 3, 'animal': 3, 'building': 6 };
        var fits = [];
        if (data.g) {
          for (var si = 0; si < data.g.length; si++) {
            var tag = data.g[si].toLowerCase();
            if (STRAT[tag] && (ctx.tags[tag] || 0) >= STRAT[tag]) {
              fits.push(tag + ' ×' + ctx.tags[tag]);
            }
          }
        }
        if (fits.length > 0) {
          h += '<div class="tm-cmp-row" style="color:#64ffda">★ Стратегия: ' + fits.join(', ') + '</div>';
        }
      }

      h += '<div class="tm-cmp-score">Оценка: ' + result.total + '</div>';
      if (result.reasons.length > 0) {
        h += '<div class="tm-cmp-reasons">' + result.reasons.join(' | ') + '</div>';
      }
      h += '</div>';
      return h;
    }

    let html = '<div class="tm-compare-inner">';
    html += '<span class="tm-compare-close">&times;</span>';
    html += '<div class="tm-compare-title">Сравнение карт (Поколение ' + gen + ')</div>';
    html += '<div class="tm-cmp-grid">';
    html += cardHtml(name1, d1, r1, winner === 1);
    html += '<div class="tm-cmp-vs">VS</div>';
    html += cardHtml(name2, d2, r2, winner === 2);
    html += '</div>';
    if (winner > 0) {
      const winName = winner === 1 ? name1 : name2;
      const diff = Math.abs(r1.total - r2.total);
      const confidence = diff >= 10 ? 'уверенно' : diff >= 5 ? 'с перевесом' : 'незначительно';
      html += '<div class="tm-cmp-verdict">' + escHtml(ruName(winName)) + ' побеждает ' + confidence + ' (+' + diff + ')</div>';
    } else {
      html += '<div class="tm-cmp-verdict">Ничья — выбирай по вкусу!</div>';
    }
    // Context bar
    if (ctx) {
      html += '<div class="tm-cmp-context" style="font-size:11px;opacity:0.7;text-align:center;margin-top:6px">';
      var parts = [];
      if (ctx.gen) parts.push('Пок. ' + ctx.gen);
      if (ctx.gensLeft !== undefined) parts.push('~' + ctx.gensLeft + ' ост.');
      if (ctx.mc !== undefined) parts.push(ctx.mc + ' MC');
      if (myCorp) parts.push(myCorp);
      html += parts.join(' · ');
      html += '</div>';
    }
    html += '</div>';

    compareEl.innerHTML = html;
    compareEl.style.display = 'flex';
  }

  // ── Income Projection ──

  let incomeEl = null;
  let incomeVisible = false;
  const incomeHistory = []; // [{gen, tr, mcProd, totalIncome}]
  let lastIncomeGen = 0;
  let genStartMC = -1; // MC at start of current generation

  function buildIncomePanel() {
    if (incomeEl) return incomeEl;
    incomeEl = document.createElement('div');
    incomeEl.className = 'tm-income-panel';
    document.body.appendChild(incomeEl);
    return incomeEl;
  }

  function updateIncomeProjection() {
    if (!incomeVisible || !enabled) {
      if (incomeEl) incomeEl.style.display = 'none';
      return;
    }

    const panel = buildIncomePanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      panel.style.display = 'none';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();

    // Track MC spending — record MC at start of gen
    if (gen > lastIncomeGen && gen > 0) {
      genStartMC = p.megaCredits || 0;
    }

    const cur = {
      mc: p.megaCredits || 0,
      steel: p.steel || 0,
      ti: p.titanium || 0,
      plants: p.plants || 0,
      energy: p.energy || 0,
      heat: p.heat || 0,
    };

    const prod = {
      mc: p.megaCreditProduction || 0,
      steel: p.steelProduction || 0,
      ti: p.titaniumProduction || 0,
      plants: p.plantProduction || 0,
      energy: p.energyProduction || 0,
      heat: p.heatProduction || 0,
    };

    const tr = p.terraformRating || 0;

    // Next gen: current + production. Energy resets (converts to heat).
    const next = {
      mc: cur.mc + prod.mc + tr,
      steel: cur.steel + prod.steel,
      ti: cur.ti + prod.ti,
      plants: cur.plants + prod.plants,
      energy: prod.energy,
      heat: cur.heat + cur.energy + prod.heat,
    };

    // Rough MC value of total income per gen
    const incomeValue = prod.mc + tr + prod.steel * 2 + prod.ti * 3 +
      prod.plants * 1.5 + prod.energy * 1 + prod.heat * 0.5;

    let html = '<div class="tm-income-title">Прогноз дохода</div>';
    html += '<div class="tm-income-gen">Пок. ' + gen + ' → ' + (gen + 1) + '</div>';

    const rows = [
      { name: 'MC', cur: cur.mc, prodLabel: prod.mc + '+' + tr + 'TR', next: next.mc },
      { name: 'Сталь', cur: cur.steel, prodLabel: '+' + prod.steel, next: next.steel },
      { name: 'Титан', cur: cur.ti, prodLabel: '+' + prod.ti, next: next.ti },
      { name: 'Расте', cur: cur.plants, prodLabel: '+' + prod.plants, next: next.plants },
      { name: 'Энерг', cur: cur.energy, prodLabel: '+' + prod.energy, next: next.energy },
      { name: 'Тепло', cur: cur.heat, prodLabel: '+' + prod.heat + '+' + cur.energy, next: next.heat },
    ];

    for (const r of rows) {
      html += '<div class="tm-inc-row">';
      html += '<span class="tm-inc-name">' + r.name + '</span>';
      html += '<span class="tm-inc-cur">' + r.cur + '</span>';
      html += '<span class="tm-inc-prod">' + r.prodLabel + '</span>';
      html += '<span class="tm-inc-next">' + r.next + '</span>';
      html += '</div>';
    }

    html += '<div class="tm-inc-total">Доход: ~' + Math.round(incomeValue) + ' MC/пок.</div>';
    // MC spent this generation
    if (genStartMC >= 0 && gen > 0) {
      const mcSpent = Math.max(0, genStartMC - cur.mc);
      html += '<div style="font-size:11px;color:#f39c12;padding:2px 4px">Потрачено: ' + mcSpent + ' MC (было ' + genStartMC + ', сейчас ' + cur.mc + ')</div>';
    }

    // Buying power: MC + steel for building + titanium for space
    const steelVal = p.steelValue || 2;
    const tiVal = p.titaniumValue || 3;
    const buildingPower = next.mc + next.steel * steelVal;
    const spacePower = next.mc + next.ti * tiVal;
    const maxPower = next.mc + next.steel * steelVal + next.ti * tiVal;

    html += '<div class="tm-inc-section">Покупательная сила (след. пок.)</div>';
    html += '<div class="tm-inc-buy"><span>Строит.</span><span>' + buildingPower + ' MC</span></div>';
    html += '<div class="tm-inc-buy"><span>Космос</span><span>' + spacePower + ' MC</span></div>';
    html += '<div class="tm-inc-buy"><span>Макс.</span><span>' + maxPower + ' MC</span></div>';

    // Resource efficiency — cards played vs TR/VP gained
    if (gen >= 2 && p.tableau) {
      const cardsPlayed = p.tableau.length;
      const trGained = tr - 20; // Starting TR is 20
      const ratioTR = cardsPlayed > 0 ? (trGained / cardsPlayed).toFixed(1) : '0';
      html += '<div class="tm-inc-section">Эффективность</div>';
      html += '<div class="tm-inc-buy"><span>Карт сыграно</span><span>' + cardsPlayed + '</span></div>';
      html += '<div class="tm-inc-buy"><span>TR набрано</span><span>+' + trGained + ' (от 20)</span></div>';
      html += '<div class="tm-inc-buy"><span>TR/карту</span><span>' + ratioTR + '</span></div>';
      // Income per card played
      const incPerCard = cardsPlayed > 0 ? (incomeValue / cardsPlayed).toFixed(1) : '0';
      html += '<div class="tm-inc-buy"><span>Доход/карту</span><span>' + incPerCard + ' MC</span></div>';
    }

    // Track income per generation
    if (gen > lastIncomeGen && gen > 0) {
      const totalIncome = tr + prod.mc + prod.steel * steelVal + prod.ti * tiVal;
      incomeHistory.push({ gen: gen, tr: tr, mcProd: prod.mc, totalIncome: totalIncome });
      lastIncomeGen = gen;
    }

    // Mini income graph
    if (incomeHistory.length >= 2) {
      html += '<div class="tm-inc-section">Рост дохода</div>';
      const maxInc = Math.max.apply(null, incomeHistory.map(function(h) { return h.totalIncome; }));
      html += '<div style="display:flex;align-items:flex-end;gap:2px;height:30px;margin:4px 0">';
      for (const h of incomeHistory) {
        const barH = maxInc > 0 ? Math.round((h.totalIncome / maxInc) * 28) : 1;
        html += '<div style="flex:1;height:' + Math.max(2, barH) + 'px;background:linear-gradient(#e67e22,#2ecc71);border-radius:1px" title="Пок.' + h.gen + ': ' + h.totalIncome + ' MC"></div>';
      }
      html += '</div>';
      // Delta last 2 gens
      const last = incomeHistory[incomeHistory.length - 1];
      const prev = incomeHistory[incomeHistory.length - 2];
      const incDelta = last.totalIncome - prev.totalIncome;
      html += '<div style="font-size:11px;color:#888;text-align:center">';
      html += 'Пок.' + last.gen + ': ' + last.totalIncome + ' MC';
      html += ' (<span style="color:' + (incDelta >= 0 ? '#4caf50' : '#f44336') + '">' + (incDelta >= 0 ? '+' : '') + incDelta + '</span>)';
      html += '</div>';
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';

    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Card Pool Tracker ──

  let poolEl = null;
  let poolVisible = false;
  const seenCards = new Set();

  // Draft history tracking
  const draftHistory = []; // [{round, offered: [{name, total, tier}], taken: string|null, passed: [...]}]
  let lastDraftSet = new Set();
  let lastDraftScores = {}; // name → {total, tier, reasons}
  let lastDraftIsDraft = false; // true only for real draft, not card-play selection

  // Click listener to capture which draft card was clicked
  var _lastClickedDraftCard = null;
  document.addEventListener('click', function(e) {
    var cardEl = e.target.closest('.wf-component--select-card .card-container[data-tm-card]');
    if (cardEl && lastDraftIsDraft) {
      _lastClickedDraftCard = cardEl.getAttribute('data-tm-card');
    }
  }, true); // capture phase

  function trackDraftHistory() {
    var selectCards = document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]');
    if (selectCards.length === 0) {
      // No draft active — if we had cards before, the last pick was made
      if (lastDraftSet.size > 0 && lastDraftIsDraft) {
        var taken = _lastClickedDraftCard && lastDraftSet.has(_lastClickedDraftCard)
          ? _lastClickedDraftCard : null;
        var passed = [];
        for (var name of lastDraftSet) {
          if (name !== taken) passed.push(name);
        }
        if (taken || passed.length > 0) {
          var offeredWithScores = Array.from(lastDraftSet).map(function(n) {
            var sc = lastDraftScores[n];
            var d = TM_RATINGS[n];
            return { name: n, total: sc ? sc.total : (d ? d.s : 0), tier: sc ? sc.tier : (d ? d.t : '?'), baseTier: d ? d.t : '?', baseScore: d ? d.s : 0, reasons: sc ? sc.reasons : [] };
          });
          offeredWithScores.sort(function(a, b) { return b.total - a.total; });
          draftHistory.push({ round: draftHistory.length + 1, offered: offeredWithScores, taken: taken, passed: passed });
        }
        // Fallback: delayed hand check if click wasn't captured
        if (!taken && lastDraftSet.size > 0) {
          var capturedSet = new Set(lastDraftSet);
          setTimeout(function() {
            var myHand = new Set(getMyHandNames());
            for (var fname of capturedSet) {
              if (myHand.has(fname)) {
                var lastEntry = draftHistory[draftHistory.length - 1];
                if (lastEntry && !lastEntry.taken) {
                  lastEntry.taken = fname;
                  lastEntry.passed = lastEntry.passed.filter(function(p) { return p !== fname; });
                }
                break;
              }
            }
          }, 500);
        }
        _lastClickedDraftCard = null;
        lastDraftSet = new Set();
        lastDraftScores = {};
        lastDraftIsDraft = false;
      }
      return;
    }

    var currentSet = new Set();
    selectCards.forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) currentSet.add(n);
    });

    // Distinguish real draft from playing a card:
    // In draft, offered cards are NOT in hand yet. When playing, they ARE in hand.
    var myHand2 = new Set(getMyHandNames());
    var inHandCount = 0;
    for (var cn of currentSet) {
      if (myHand2.has(cn)) inHandCount++;
    }
    var isDraft = currentSet.size > 0 && inHandCount < currentSet.size / 2;

    if (!isDraft) {
      // This is card play selection, not draft — skip tracking
      lastDraftSet = new Set();
      lastDraftIsDraft = false;
      return;
    }

    // Detect if cards changed (new draft round)
    if (currentSet.size > 0 && lastDraftSet.size > 0 && lastDraftIsDraft && currentSet.size !== lastDraftSet.size) {
      var taken2 = _lastClickedDraftCard && lastDraftSet.has(_lastClickedDraftCard)
        ? _lastClickedDraftCard : null;
      var passed2 = [];
      for (var name2 of lastDraftSet) {
        if (!currentSet.has(name2)) {
          if (name2 !== taken2) passed2.push(name2);
        }
      }
      // Fallback: diff-based detection if click missed
      if (!taken2) {
        var myHand3 = new Set(getMyHandNames());
        for (var name3 of lastDraftSet) {
          if (!currentSet.has(name3) && myHand3.has(name3)) { taken2 = name3; break; }
        }
        if (taken2) passed2 = passed2.filter(function(p) { return p !== taken2; });
      }
      if (taken2 || passed2.length > 0) {
        var offeredWithScores2 = Array.from(lastDraftSet).map(function(n) {
          var sc = lastDraftScores[n];
          var d = TM_RATINGS[n];
          return { name: n, total: sc ? sc.total : (d ? d.s : 0), tier: sc ? sc.tier : (d ? d.t : '?'), baseTier: d ? d.t : '?', baseScore: d ? d.s : 0, reasons: sc ? sc.reasons : [] };
        });
        offeredWithScores2.sort(function(a, b) { return b.total - a.total; });
        draftHistory.push({ round: draftHistory.length + 1, offered: offeredWithScores2, taken: taken2, passed: passed2 });
      }
      _lastClickedDraftCard = null;
    }

    lastDraftSet = currentSet;
    lastDraftIsDraft = isDraft;
  }

  let lastPoolSave = 0;

  function getPoolKey() {
    return 'tm_pool_' + (location.search || location.hash || 'default');
  }

  function trackSeenCards() {
    const before = seenCards.size;
    document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (name) seenCards.add(name);
    });
    // Auto-save to storage every 10 seconds if new cards were seen
    if (seenCards.size > before && Date.now() - lastPoolSave > 10000) {
      lastPoolSave = Date.now();
      saveSeenCards();
    }
  }

  function saveSeenCards() {
    safeStorage((storage) => {
      const obj = {};
      obj[getPoolKey()] = Array.from(seenCards);
      storage.local.set(obj);
    });
  }

  function loadSeenCards() {
    safeStorage((storage) => {
      const key = getPoolKey();
      storage.local.get(key, (result) => {
        if (result[key] && Array.isArray(result[key])) {
          for (const name of result[key]) seenCards.add(name);
        }
      });
    });
  }

  function buildPoolPanel() {
    if (poolEl) return poolEl;
    poolEl = document.createElement('div');
    poolEl.className = 'tm-pool-panel';
    document.body.appendChild(poolEl);
    return poolEl;
  }

  function updateCardPool() {
    if (!poolVisible || !enabled) {
      if (poolEl) poolEl.style.display = 'none';
      return;
    }

    const panel = buildPoolPanel();
    const totalCards = Object.keys(TM_RATINGS).length;
    const seenCount = seenCards.size;
    const unseenCount = totalCards - seenCount;

    const unseenTiers = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    const totalTiers = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const [name, data] of Object.entries(TM_RATINGS)) {
      totalTiers[data.t] = (totalTiers[data.t] || 0) + 1;
      if (!seenCards.has(name)) {
        unseenTiers[data.t] = (unseenTiers[data.t] || 0) + 1;
      }
    }

    let html = '<div class="tm-pool-title">Пул карт</div>';
    html += '<div class="tm-pool-summary">';
    html += '<span>Видели: ' + seenCount + '</span>';
    html += '<span>Осталось: ' + unseenCount + '</span>';
    html += '<span>Всего: ' + totalCards + '</span>';
    html += '</div>';

    const pct = Math.round((seenCount / totalCards) * 100);
    html += '<div class="tm-pool-bar"><div class="tm-pool-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="tm-pool-pct">' + pct + '% видели</div>';

    html += '<div class="tm-pool-tiers">';
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) {
      if (totalTiers[t] > 0) {
        const seenT = totalTiers[t] - unseenTiers[t];
        const tPct = Math.round((seenT / totalTiers[t]) * 100);
        html += '<div class="tm-pool-tier-row">';
        html += '<span class="tm-tip-tier tm-tier-' + t + '">' + t + '</span>';
        html += '<div class="tm-pool-tier-bar"><div class="tm-pool-tier-fill" style="width:' + tPct + '%;background:' + (t === 'S' ? '#e74c3c' : t === 'A' ? '#e67e22' : t === 'B' ? '#f1c40f' : '#888') + '"></div></div>';
        html += '<span class="tm-pool-tier-num">' + seenT + '/' + totalTiers[t] + ' (' + tPct + '%)</span>';
        html += '</div>';
      }
    }
    html += '</div>';

    // Draw probabilities (4 cards drawn per pick)
    if (unseenCount > 0) {
      const drawSize = 4;
      html += '<div class="tm-pool-section">Шанс при draw (' + drawSize + ' карт)</div>';
      for (const t of ['S', 'A', 'B']) {
        const n = unseenTiers[t] || 0;
        if (n === 0) continue;
        // P(at least 1 of tier T in draw of drawSize) = 1 - C(unseenCount-n, drawSize) / C(unseenCount, drawSize)
        let pNone = 1;
        for (let i = 0; i < drawSize; i++) {
          pNone *= (unseenCount - n - i) / (unseenCount - i);
        }
        const pAtLeast1 = Math.max(0, Math.min(1, 1 - pNone));
        const pctDraw = Math.round(pAtLeast1 * 100);
        html += '<div class="tm-pool-tier-row">';
        html += '<span class="tm-tip-tier tm-tier-' + t + '">' + t + '</span>';
        html += '<span class="tm-pool-tier-num">' + pctDraw + '% шанс</span>';
        html += '</div>';
      }
    }

    // Key unseen S/A cards
    const unseenGood = [];
    for (const [name, data] of Object.entries(TM_RATINGS)) {
      if (!seenCards.has(name) && (data.t === 'S' || data.t === 'A')) {
        unseenGood.push({ name, score: data.s, tier: data.t });
      }
    }
    unseenGood.sort((a, b) => b.score - a.score);

    if (unseenGood.length > 0) {
      html += '<div class="tm-pool-section">Невиданные S/A (' + unseenGood.length + ')</div>';
      html += '<div class="tm-pool-list">';
      for (const c of unseenGood.slice(0, 12)) {
        html += '<div class="tm-pool-item"><span class="tm-tip-tier tm-tier-' + c.tier + '">' + c.tier + '</span> ' + escHtml(ruName(c.name)) + '</div>';
      }
      if (unseenGood.length > 12) {
        html += '<div class="tm-pool-more">+' + (unseenGood.length - 12) + ' ещё</div>';
      }
      html += '</div>';
    }

    // Draft history — show what was passed to opponents
    if (draftHistory.length > 0) {
      const passedToOpp = [];
      for (const round of draftHistory) {
        for (const name of round.passed) {
          const data = TM_RATINGS[name];
          if (data && (data.t === 'S' || data.t === 'A' || data.t === 'B')) {
            passedToOpp.push({ name: name, tier: data.t, score: data.s, round: round.round });
          }
        }
      }
      if (passedToOpp.length > 0) {
        passedToOpp.sort(function(a, b) { return b.score - a.score; });
        html += '<div class="tm-pool-section">Ушли оппонентам (' + passedToOpp.length + ')</div>';
        html += '<div class="tm-pool-list">';
        for (const c of passedToOpp.slice(0, 8)) {
          html += '<div class="tm-pool-item"><span class="tm-tip-tier tm-tier-' + c.tier + '">' + c.tier + '</span> ' + escHtml(ruName(c.name)) + '</div>';
        }
        if (passedToOpp.length > 8) {
          html += '<div class="tm-pool-more">+' + (passedToOpp.length - 8) + ' ещё</div>';
        }
        html += '</div>';
      }
    }

    // Draft Pattern Analysis
    if (draftHistory.length >= 3) {
      const tagPickCount = {};
      const tagSeenCount = {};
      let pickedScoreSum = 0, pickedCount = 0;
      let passedScoreSum = 0, passedCount = 0;

      for (const round of draftHistory) {
        // Count tags in offered cards
        for (const off of round.offered) {
          const d = TM_RATINGS[off.name];
          if (d && d.g) {
            for (var gi = 0; gi < d.g.length; gi++) {
              var tag = d.g[gi].toLowerCase();
              tagSeenCount[tag] = (tagSeenCount[tag] || 0) + 1;
              if (off.name === round.taken) {
                tagPickCount[tag] = (tagPickCount[tag] || 0) + 1;
              }
            }
          }
          if (off.name === round.taken) {
            pickedScoreSum += off.total;
            pickedCount++;
          } else {
            passedScoreSum += off.total;
            passedCount++;
          }
        }
      }

      html += '<div class="tm-pool-section">Аналитика драфта</div>';
      html += '<div style="font-size:11px;padding:2px 4px">';

      // Avg score picked vs passed
      var avgPicked = pickedCount > 0 ? Math.round(pickedScoreSum / pickedCount) : 0;
      var avgPassed = passedCount > 0 ? Math.round(passedScoreSum / passedCount) : 0;
      var instinctColor = avgPicked >= avgPassed ? '#4caf50' : '#f44336';
      html += '<div>Средний: взято <b>' + avgPicked + '</b> vs пропущено <b>' + avgPassed + '</b> ';
      html += '<span style="color:' + instinctColor + '">' + (avgPicked >= avgPassed ? '✓' : '⚠') + '</span></div>';

      // Tag pick rates — show top 3 picked and least picked
      var tagRates = [];
      for (var tag in tagSeenCount) {
        if (tagSeenCount[tag] >= 2) {
          tagRates.push({ tag: tag, rate: Math.round((tagPickCount[tag] || 0) / tagSeenCount[tag] * 100), seen: tagSeenCount[tag], picked: tagPickCount[tag] || 0 });
        }
      }
      tagRates.sort(function(a, b) { return b.rate - a.rate; });
      if (tagRates.length > 0) {
        html += '<div style="margin-top:3px">Предпочтения:</div>';
        var topTags = tagRates.slice(0, 3);
        for (var ti = 0; ti < topTags.length; ti++) {
          var t = topTags[ti];
          html += '<div style="font-size:10px;color:#888">' + t.tag + ': ' + t.rate + '% (' + t.picked + '/' + t.seen + ')</div>';
        }
        // Least picked
        var bottomTags = tagRates.filter(function(t) { return t.rate < 50 && t.seen >= 3; }).slice(-2);
        if (bottomTags.length > 0) {
          html += '<div style="font-size:10px;color:#e67e22;margin-top:2px">Редко берёшь:</div>';
          for (var bi = 0; bi < bottomTags.length; bi++) {
            var bt = bottomTags[bi];
            html += '<div style="font-size:10px;color:#e67e22">' + bt.tag + ': ' + bt.rate + '% (' + bt.picked + '/' + bt.seen + ')</div>';
          }
        }
      }

      // Rounds count
      html += '<div style="font-size:10px;color:#666;margin-top:2px">' + draftHistory.length + ' раундов драфта</div>';
      html += '</div>';
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Play Order Advisor ──

  let playOrderEl = null;
  let playOrderVisible = false;

  function buildPlayOrderPanel() {
    if (playOrderEl) return playOrderEl;
    playOrderEl = document.createElement('div');
    playOrderEl.className = 'tm-playorder-panel';
    document.body.appendChild(playOrderEl);
    return playOrderEl;
  }

  // Shared play priority scorer — used by panel and hand sort
  function computePlayPriorities() {
    const handCards = getMyHandNames();
    if (handCards.length === 0) return [];

    const gen = detectGeneration();
    const gensLeft = Math.max(1, 9 - gen);
    const ctx = getCachedPlayerContext();
    const pv = getPlayerVueData();
    const myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    const myTableau = getMyTableauNames();

    const scored = [];
    for (const name of handCards) {
      const data = TM_RATINGS[name];
      if (!data) { scored.push({ name, priority: 50, reasons: [], tier: '?', score: 0 }); continue; }

      let priority = 50;
      const reasons = [];
      const econ = (data.e || '').toLowerCase();
      const when = (data.w || '').toLowerCase();

      // FTN timing: use card_effects if available
      var cardMCValue = 0;
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[name];
        if (fx) {
          var mcNow = computeCardValue(fx, gensLeft);
          var mcLater = computeCardValue(fx, Math.max(0, gensLeft - 2));
          var urgency = mcNow - mcLater; // how much value lost by waiting 2 gens
          cardMCValue = mcNow - (fx.c || 0) - 3; // net value = FTN value - cost - draft cost
          if (urgency > 5) { priority += Math.min(20, Math.round(urgency)); reasons.push('Срочно (' + Math.round(urgency) + ' MC потерь)'); }
          else if (urgency > 2) { priority += Math.round(urgency); reasons.push('Лучше раньше'); }
          else if (urgency < -2) { priority += Math.round(urgency); reasons.push('Можно позже'); }
        }
      }

      // Production cards: play early for more generations of benefit
      if (econ.includes('prod') && !econ.includes('vp only')) {
        priority += gensLeft * 3;
        reasons.push('Продукция');
      }

      // Action cards: play early for more activations
      if (econ.includes('action') || when.includes('action')) {
        priority += gensLeft * 2;
        reasons.push('Действие');
      }

      // Discount sources: play before expensive cards
      if (CARD_DISCOUNTS[name]) {
        var expensiveInHand = 0;
        for (var hi = 0; hi < handCards.length; hi++) {
          if (handCards[hi] === name) continue;
          var hEl = document.querySelector('.player_home_block--hand .card-container[data-tm-card="' + handCards[hi] + '"]');
          if (hEl) { var hCost = getCardCost(hEl); if (hCost !== null && hCost >= 12) expensiveInHand++; }
        }
        if (expensiveInHand > 0) {
          priority += expensiveInHand * 4;
          reasons.push('Скидка → ' + expensiveInHand + ' карт');
        }
      }

      // TR cards: moderate priority
      if (econ.includes('tr') && !econ.includes('prod')) {
        priority += 5;
        reasons.push('TR');
      }

      // Cards that enable other hand cards (synergy prereqs)
      let enablesOthers = 0;
      for (const other of handCards) {
        if (other === name) continue;
        const od = TM_RATINGS[other];
        if (od && od.y && od.y.includes(name)) enablesOthers++;
      }
      if (enablesOthers > 0) {
        priority += enablesOthers * 5;
        reasons.push('Активирует ' + enablesOthers);
      }

      // Cards that need other hand cards — play after
      let needsOthers = 0;
      if (data.y) {
        for (const syn of data.y) {
          if (handCards.includes(syn)) needsOthers++;
        }
      }
      if (needsOthers > 0) {
        priority -= needsOthers * 3;
        reasons.push('После синергии');
      }

      // VP-only: low priority (no ongoing value until game end)
      if (econ.includes('vp') && !econ.includes('prod') && !econ.includes('action')) {
        priority -= gensLeft * 2;
        reasons.push('Только VP');
      }

      // Affordability: can't afford now = lower priority
      var cardEl = document.querySelector('.player_home_block--hand .card-container[data-tm-card="' + name + '"]');
      if (cardEl) {
        var cardCost = getCardCost(cardEl);
        if (cardCost !== null && cardCost > myMC) {
          priority -= Math.min(15, Math.round((cardCost - myMC) / 3));
          reasons.push('Дорого (' + cardCost + ' MC)');
        }
      }

      // Requirement feasibility: check if global/tag requirements are met
      var reqUnplayable = false;
      if (cardEl && pv && pv.game) {
        var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
        if (reqEl) {
          var reqText = (reqEl.textContent || '').trim();
          var isMaxReq = /max/i.test(reqText);
          var gTemp = pv.game.temperature;
          var gOxy = pv.game.oxygenLevel;
          var gVenus = pv.game.venusScaleLevel;
          var gOceans = pv.game.oceans;

          // Requirement bonus from Inventrix (+2/-2 on global params)
          var reqBonus = 0;
          var myCorpsReq = detectMyCorps();
          for (var rci = 0; rci < myCorpsReq.length; rci++) {
            var cd = CORP_DISCOUNTS[myCorpsReq[rci]];
            if (cd && cd._req) reqBonus += cd._req;
          }

          if (isMaxReq) {
            // Max requirements — window closed if param exceeded (reqBonus extends max window UP)
            var tmM = reqText.match(/([\-\d]+)\s*°?C/i);
            var oxM = reqText.match(/(\d+)\s*%?\s*O/i);
            var vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
            if (tmM && typeof gTemp === 'number' && gTemp > parseInt(tmM[1]) + reqBonus * 2) reqUnplayable = true;
            if (oxM && typeof gOxy === 'number' && gOxy > parseInt(oxM[1]) + reqBonus) reqUnplayable = true;
            if (vnM && gVenus != null && gVenus > parseInt(vnM[1]) + reqBonus * 2) reqUnplayable = true;
          } else {
            // Min global requirements — scaling penalty based on distance
            var tmM2 = reqText.match(/([\-\d]+)\s*°?C/i);
            var oxM2 = reqText.match(/(\d+)\s*%?\s*O/i);
            var ocM2 = reqText.match(/(\d+)\s*ocean/i);
            var vnM2 = reqText.match(/(\d+)\s*%?\s*Venus/i);

            var maxGap = 0; // largest gap across all param requirements
            if (tmM2 && typeof gTemp === 'number') {
              var need = parseInt(tmM2[1]) - reqBonus * 2;
              var gap = (need - gTemp) / 2; // each raise = 2°C
              if (gap > maxGap) maxGap = gap;
            }
            if (oxM2 && typeof gOxy === 'number') {
              var need2 = parseInt(oxM2[1]) - reqBonus;
              var gap2 = need2 - gOxy;
              if (gap2 > maxGap) maxGap = gap2;
            }
            if (ocM2 && typeof gOceans === 'number') {
              var need3 = parseInt(ocM2[1]);
              var gap3 = need3 - gOceans;
              if (gap3 > maxGap) maxGap = gap3;
            }
            if (vnM2 && gVenus != null) {
              var need4 = parseInt(vnM2[1]) - reqBonus * 2;
              var gap4 = (need4 - gVenus) / 2;
              if (gap4 > maxGap) maxGap = gap4;
            }

            if (maxGap > 0) {
              // Scaling: 1 raise away = -3, 2 = -6, 5+ = -15 (capped)
              var reqPenalty = Math.min(20, Math.round(maxGap * 3));
              priority -= reqPenalty;
              if (maxGap <= 1) reasons.push('Req почти (' + Math.ceil(maxGap) + ' подн.)');
              else reasons.push('Req далеко (' + Math.ceil(maxGap) + ' подн.)');
            }

            // Tag-based requirements: "X Science", "X Earth", etc.
            var tagReqM = reqText.match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i);
            if (tagReqM) {
              var tagReqCount = parseInt(tagReqM[1]);
              var tagReqName = tagReqM[2].toLowerCase();
              var myTagCount = 0;
              if (ctx && ctx.tags) {
                myTagCount = ctx.tags[tagReqName] || 0;
              }
              var tagGap = tagReqCount - myTagCount;
              if (tagGap > 0) {
                var tagPenalty = Math.min(20, tagGap * 5);
                priority -= tagPenalty;
                reasons.push('Нужно ' + tagGap + ' ' + tagReqName + ' тег(ов)');
              }
            }
          }
        }
      }
      if (reqUnplayable) {
        priority -= 50;
        reasons.push('Нельзя сыграть!');
      }

      scored.push({ name, priority, reasons, tier: data.t || '?', score: data.s || 0, type: 'play', mcValue: cardMCValue > 0 ? cardMCValue : 0, unplayable: reqUnplayable });
    }

    // ── Global params for saturation checks ──
    var _tempMaxed = false, _oxyMaxed = false, _venusMaxed = false, _oceansMaxed = false;
    if (pv && pv.game) {
      _tempMaxed = typeof pv.game.temperature === 'number' && pv.game.temperature >= 8;
      _oxyMaxed = typeof pv.game.oxygenLevel === 'number' && pv.game.oxygenLevel >= 14;
      _venusMaxed = pv.game.venusScaleLevel != null && pv.game.venusScaleLevel >= 30;
      _oceansMaxed = typeof pv.game.oceans === 'number' && pv.game.oceans >= 9;
    }

    // ── Blue card actions from tableau (enhanced with MC value) ──
    var tableauCards = getMyTableauNames();
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var myTi = tp ? (tp.titanium || 0) : 0;
    var myPlants = tp ? (tp.plants || 0) : 0;
    var myHeat = tp ? (tp.heat || 0) : 0;
    var myEnergy = tp ? (tp.energy || 0) : 0;

    for (var ti = 0; ti < tableauCards.length; ti++) {
      var tName = tableauCards[ti];
      var tData = TM_RATINGS[tName];
      if (!tData) continue;
      var tEcon = (tData.e || '').toLowerCase();
      if (!tEcon.includes('action') && !tEcon.includes('действие')) continue;

      var aPriority = 45;
      var aReasons = [];
      var aMCValue = 0; // estimated MC value of this action

      // Use TM_CARD_EFFECTS for precise estimation
      var fx = (typeof TM_CARD_EFFECTS !== 'undefined') ? TM_CARD_EFFECTS[tName] : null;

      if (fx) {
        // actMC: MC gained per action (negative = cost)
        if (fx.actMC) {
          aMCValue += fx.actMC;
          if (fx.actMC > 0) aReasons.push('+' + fx.actMC + ' MC');
        }
        // actTR: TR per action
        if (fx.actTR) {
          var trVal = fx.actTR * 7.2;
          aMCValue += trVal;
          aReasons.push('+' + fx.actTR + ' TR (~' + Math.round(trVal) + ' MC)');
        }
        // actCD: cards drawn per action
        if (fx.actCD) { aMCValue += fx.actCD * 3.5; aReasons.push('+' + fx.actCD + ' карт'); }
        // actOc: ocean per action
        if (fx.actOc && !_oceansMaxed) { aMCValue += 18; aReasons.push('Океан!'); }
        // vpAcc: VP per gen (accumulating)
        if (fx.vpAcc) { aMCValue += fx.vpAcc * 5; aReasons.push('+' + fx.vpAcc + ' VP'); }
      }

      // Text-based fallbacks for cards not in effects
      if (!fx) {
        if (tEcon.includes('vp') || tEcon.includes('вп')) { aPriority += 10; aMCValue += 5; aReasons.push('VP действие'); }
        if (tEcon.includes('microbe') || tEcon.includes('микроб') || tEcon.includes('animal') || tEcon.includes('животн') || tEcon.includes('floater') || tEcon.includes('флоатер')) { aPriority += 5; aMCValue += 3; aReasons.push('Ресурс'); }
        if (tEcon.includes('mc') && (tEcon.includes('gain') || tEcon.includes('получ'))) { aPriority += 8; aMCValue += 4; aReasons.push('MC'); }
      }

      // Venus action check — useless if Venus maxed
      var isVenusAction = tEcon.includes('venus') || tEcon.includes('венер') || tEcon.includes('флоатер') || tEcon.includes('floater');
      if (isVenusAction && _venusMaxed) {
        // Only VP accumulation value remains, Venus raise worthless
        if (fx && fx.actTR) aMCValue -= fx.actTR * 7.2; // remove TR value
        aPriority -= 20;
        aReasons.push('Venus max!');
      }

      // Titanium-consuming actions: check if we have ti
      var needsTi = tEcon.includes('titanium') || tEcon.includes('титан');
      if (needsTi && myTi < 1) {
        aPriority -= 15;
        aReasons.push('Нет титана');
      }

      // Priority based on MC value
      aPriority += Math.min(20, Math.round(aMCValue * 1.5));

      scored.push({ name: '⚡ ' + tName, priority: aPriority, reasons: aReasons, tier: tData.t || '?', score: tData.s || 0, type: 'action', mcValue: aMCValue });
    }

    // ── Standard actions: convert heat/plants + trade ──
    if (tp) {
      var plantCost = 8;
      var myCorpsP = detectMyCorps();
      if (myCorpsP.indexOf('EcoLine') !== -1 || myCorpsP.indexOf('Ecoline') !== -1) plantCost = 7;

      // Heat → Temperature (1 TR = 7.2 MC)
      if (myHeat >= 8 && !_tempMaxed) {
        var heatMC = 7.2;
        var heatPrio = 35;
        var heatConvs = Math.floor(myHeat / 8);
        var heatReasons = heatConvs > 1 ? [myHeat + ' heat (' + heatConvs + 'x)'] : [myHeat + ' heat'];
        scored.push({ name: '🔥 Тепло → Темп', priority: heatPrio, reasons: heatReasons, tier: '-', score: 0, type: 'standard', mcValue: heatMC });
      } else if (myHeat >= 8 && _tempMaxed) {
        // Can't convert — temp maxed
      }

      // Plants → Greenery (1 TR if oxy not maxed + VP)
      if (myPlants >= plantCost) {
        var greenMC = _oxyMaxed ? 4 : 11; // 1 TR (7) + ~4 MC placement bonus, or just placement if oxy max
        var greenPrio = _oxyMaxed ? 20 : 25;
        scored.push({ name: '🌿 Озеленение', priority: greenPrio, reasons: [myPlants + ' растений' + (_oxyMaxed ? ', O₂ max' : '')], tier: '-', score: 0, type: 'standard', mcValue: greenMC });
      }

      // Trade action (if fleets available)
      if (ctx && ctx.tradesLeft > 0 && pv.game && pv.game.colonies) {
        var tradeMC = 8; // rough average trade value
        scored.push({ name: '🚀 Торговля', priority: 40, reasons: [ctx.tradesLeft + ' флот(ов)'], tier: '-', score: 0, type: 'standard', mcValue: tradeMC });
      }
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored;
  }

  function analyzePlayOrder() {
    if (!playOrderVisible || !enabled) {
      if (playOrderEl) playOrderEl.style.display = 'none';
      return;
    }

    const panel = buildPlayOrderPanel();
    const scored = computePlayPriorities();
    const gen = detectGeneration();
    const gensLeft = Math.max(1, 9 - gen);

    if (scored.length === 0) {
      panel.innerHTML = '<div class="tm-po-title">Порядок розыгрыша</div><div class="tm-pool-more">Нет карт в руке</div>';
      panel.style.display = 'block';
      return;
    }

    let html = '<div class="tm-po-title">Приоритет действий (Пок. ' + gen + ', осталось ' + gensLeft + ')</div>';

    scored.forEach((item, idx) => {
      html += '<div class="tm-po-row">';
      html += '<span class="tm-po-num">' + (idx + 1) + '</span>';
      if (item.tier !== '-') {
        html += '<span class="tm-tip-tier tm-tier-' + item.tier + '">' + item.tier + '</span> ';
      }
      html += '<span class="tm-po-name">' + escHtml(item.type === 'action' || item.type === 'standard' ? item.name : ruName(item.name)) + '</span>';
      // MC value badge
      if (item.mcValue && item.mcValue > 0) {
        html += ' <span style="color:#f1c40f;font-size:10px;font-weight:bold">~' + Math.round(item.mcValue) + ' MC</span>';
      }
      if (item.reasons.length > 0) {
        html += '<div class="tm-po-reason">' + item.reasons.join(', ') + '</div>';
      }
      html += '</div>';
    });

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Play Priority Badges + Hand Sort ──
  let handSortActive = false;
  var _lastPriorityMap = {}; // name → {rank, reasons, priority, affordable, useless}

  function injectPlayPriorityBadges() {
    if (!enabled) return;
    var scored = computePlayPriorities();
    if (scored.length === 0) return;

    // Get MC for affordability
    var pv = getPlayerVueData();
    var myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    var ctx = getCachedPlayerContext();
    var steel = ctx ? ctx.steel * ctx.steelVal : 0;
    var ti = ctx ? ctx.titanium * ctx.tiVal : 0;

    // Build name→info map with affordability and "useless" flag
    _lastPriorityMap = {};
    for (var i = 0; i < scored.length; i++) {
      var item = scored[i];
      var data = TM_RATINGS[item.name];
      var cardEl = document.querySelector('.player_home_block--hand .card-container[data-tm-card="' + item.name + '"]');
      var cost = cardEl ? getCardCost(cardEl) : null;
      var tags = cardEl ? getCardTags(cardEl) : new Set();

      // Effective buying power for this card
      var effectiveMC = myMC;
      if (tags.has('building')) effectiveMC += steel;
      if (tags.has('space')) effectiveMC += ti;

      var affordable = (cost === null || effectiveMC >= cost);
      // "Useless" = D/F tier AND no context bonus AND not affordable
      var useless = data && (data.s <= 45) && item.priority < 40;

      _lastPriorityMap[item.name] = {
        rank: i + 1,
        reasons: item.reasons,
        priority: item.priority,
        affordable: affordable,
        cost: cost,
        useless: useless,
        unplayable: !!item.unplayable
      };
    }

    // Apply badges to hand cards
    _applyPriorityBadges('.player_home_block--hand .card-container[data-tm-card]');

    // Also apply to card selection dialogs (when choosing card to play)
    _applyPriorityBadges('.wf-component--select-card .card-container[data-tm-card]');
  }

  function _applyPriorityBadges(selector) {
    document.querySelectorAll(selector).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      var info = _lastPriorityMap[name];

      // Remove old badges
      var old = el.querySelector('.tm-priority-badge');
      if (old) old.remove();
      var oldMark = el.querySelector('.tm-play-mark');
      if (oldMark) oldMark.remove();

      if (!info) return;

      // Priority number badge
      var badge = document.createElement('div');
      badge.className = 'tm-priority-badge';

      if (info.unplayable) {
        badge.textContent = 'Нельзя';
        badge.classList.add('tm-prio-sell');
      } else if (info.useless) {
        badge.textContent = 'Продай';
        badge.classList.add('tm-prio-sell');
      } else if (!info.affordable) {
        badge.textContent = '#' + info.rank + ' $';
        badge.classList.add('tm-prio-nomc');
      } else if (info.rank <= 2) {
        badge.textContent = '#' + info.rank;
        badge.classList.add('tm-prio-high');
      } else if (info.rank <= 4) {
        badge.textContent = '#' + info.rank;
        badge.classList.add('tm-prio-mid');
      } else {
        badge.textContent = '#' + info.rank;
        badge.classList.add('tm-prio-low');
      }

      var tipParts = [];
      if (!info.affordable && info.cost) tipParts.push('Нужно ' + info.cost + ' MC');
      if (info.reasons.length) tipParts.push(info.reasons.join(', '));
      badge.title = tipParts.join(' | ') || 'Нет особых факторов';

      el.style.position = 'relative';
      el.appendChild(badge);

      // Store priority for sorting
      el.setAttribute('data-tm-priority', info.priority);
    });
  }

  // Sort/button removed — priority info only via badges + panel
  function sortHandByPriority() { /* disabled */ }
  function injectSortButton() { /* disabled */ }

  // ── Discard Advisor ──

  function getDiscardAdvice() {
    const handCards = getMyHandNames();
    if (handCards.length < 6) return null;

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const ctx = getCachedPlayerContext();
    const allCards = [...myTableau, ...handCards];
    const pv = getPlayerVueData();
    const myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;

    const scored = [];
    for (var i = 0; i < handCards.length; i++) {
      var name = handCards[i];
      var data = TM_RATINGS[name];
      if (!data) continue;

      var keepScore = data.s || 50;
      var keepReasons = [];

      // Synergy with tableau
      var synCount = 0;
      if (data.y) {
        for (var j = 0; j < data.y.length; j++) {
          if (myTableau.includes(data.y[j])) synCount++;
        }
      }
      for (var j = 0; j < myTableau.length; j++) {
        var td = TM_RATINGS[myTableau[j]];
        if (td && td.y && td.y.includes(name)) synCount++;
      }
      if (synCount > 0) {
        keepScore += synCount * 5;
        keepReasons.push(synCount + ' синерг.');
      }

      // Synergy with other hand cards
      var handSyn = 0;
      for (var j = 0; j < handCards.length; j++) {
        if (handCards[j] === name) continue;
        var hd = TM_RATINGS[handCards[j]];
        if (hd && hd.y && hd.y.includes(name)) handSyn++;
        if (data.y && data.y.includes(handCards[j])) handSyn++;
      }
      if (handSyn > 0) {
        keepScore += handSyn * 3;
        keepReasons.push('связь с ' + handSyn + ' в руке');
      }

      // Affordability — can I play this?
      var cardCost = null;
      var cardEls = document.querySelectorAll('.card-container[data-tm-card="' + name + '"]');
      if (cardEls.length > 0) cardCost = getCardCost(cardEls[0]);
      if (cardCost !== null && cardCost > myMC * 1.5 && ctx && ctx.gensLeft <= 2) {
        keepScore -= 15;
        keepReasons.push('не потянуть');
      }

      // Timing
      if (data.e) {
        var eL = data.e.toLowerCase();
        var isProd = eL.includes('prod') || eL.includes('прод');
        if (isProd && ctx && ctx.gensLeft <= 1) {
          keepScore -= 10;
          keepReasons.push('поздно для прод');
        }
      }

      // Corp synergy
      if (myCorp && data.y && data.y.includes(myCorp)) {
        keepScore += 5;
        keepReasons.push('корп.');
      }

      // Corp-specific boosts (mirrors CORP_BOOSTS from draft scoring)
      if (myCorp && data.e && cardEls.length > 0) {
        var eLower2 = data.e.toLowerCase();
        var cTags = getCardTags(cardEls[0]);
        var cb = 0;
        switch (myCorp) {
          case 'Point Luna': cb = (eLower2.includes('draw') || eLower2.includes('card') || cTags.has('earth')) ? 2 : 0; break;
          case 'Ecoline': cb = (eLower2.includes('plant') || eLower2.includes('green') || eLower2.includes('раст')) ? 2 : 0; break;
          case 'Tharsis Republic': cb = (eLower2.includes('city') || eLower2.includes('город')) ? 3 : 0; break;
          case 'Helion': cb = (eLower2.includes('heat') || eLower2.includes('тепл')) ? 2 : 0; break;
          case 'Phobolog': cb = cTags.has('space') ? 2 : 0; break;
          case 'Mining Guild': cb = (eLower2.includes('steel') || eLower2.includes('стал') || cTags.has('building')) ? 1 : 0; break;
          case 'Credicor': cb = (cardCost != null && cardCost >= 20) ? 2 : 0; break;
          case 'Interplanetary Cinematics': cb = cTags.has('event') ? 2 : 0; break;
          case 'Arklight': cb = (eLower2.includes('animal') || eLower2.includes('plant') || eLower2.includes('жив')) ? 2 : 0; break;
          case 'Poseidon': cb = (eLower2.includes('colon') || eLower2.includes('колон')) ? 3 : 0; break;
          case 'Polyphemos': cb = (eLower2.includes('draw') || eLower2.includes('card')) ? -2 : 0; break;
          case 'Lakefront Resorts': cb = (eLower2.includes('ocean') || eLower2.includes('океан')) ? 2 : 0; break;
          case 'Splice': cb = cTags.has('microbe') ? 2 : 0; break;
          case 'Celestic': cb = (eLower2.includes('floater') || eLower2.includes('флоат')) ? 2 : 0; break;
          case 'Robinson Industries': cb = (eLower2.includes('prod') || eLower2.includes('прод')) ? 1 : 0; break;
          case 'Viron': cb = (cardEls[0].closest('.card-container') && cardEls[0].querySelector('[class*="tag-"]')) ? 2 : 0; break;
          case 'Recyclon': cb = cTags.has('building') ? 1 : 0; break;
          case 'Stormcraft Incorporated': cb = (eLower2.includes('floater') || eLower2.includes('флоат')) ? 2 : 0; break;
          case 'Manutech': cb = (eLower2.includes('prod') || eLower2.includes('прод')) ? 2 : 0; break;
        }
        if (cb !== 0) {
          keepScore += cb;
          keepReasons.push('корп.буст ' + (cb > 0 ? '+' : '') + cb);
        }
      }

      // Combo bonus with corp or tableau
      if (typeof TM_COMBOS !== 'undefined') {
        var bestCb = 0;
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (!combo.cards.includes(name)) continue;
          var otherCards = combo.cards.filter(function(c) { return c !== name; });
          var matchCount = otherCards.filter(function(c) { return c === myCorp || myTableau.includes(c) || handCards.includes(c); }).length;
          if (matchCount > 0) {
            var cbonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
            if (cbonus > bestCb) bestCb = cbonus;
          }
        }
        if (bestCb > 0) {
          keepScore += bestCb;
          keepReasons.push('комбо +' + bestCb);
        }
      }

      scored.push({ name: name, keepScore: keepScore, tier: data.t, reasons: keepReasons });
    }

    scored.sort(function(a, b) { return b.keepScore - a.keepScore; });
    return scored;
  }

  // ── Context-aware scores on hand cards ──
  // Known corp names for initial draft detection
  var _knownCorps = new Set();
  (function() {
    // Build set from CORP_DISCOUNTS, TAG_TRIGGERS, and ratings with corp-like properties
    for (var k in CORP_DISCOUNTS) _knownCorps.add(k);
    for (var k in TAG_TRIGGERS) _knownCorps.add(k);
    // Also add known corps from ratings that have synergy lists typical for corps
    var corpNames = [
      'Arklight','Aphrodite','Aridor','Arcadian Communities','Astrodrill',
      'Cheung Shing MARS','CrediCor','Celestic','EcoLine','EcoTec',
      'Factorum','Helion','Interplanetary Cinematics','Inventrix',
      'Kuiper Cooperative','Lakefront Resorts','Manutech','Mining Guild',
      'Mons Insurance','Morning Star Inc.','Nirgal Enterprises','Palladin Shipping',
      'Pharmacy Union','Philares','PhoboLog','Point Luna','Polaris','Polyphemos',
      'Poseidon','Pristar','Recyclon','Robinson Industries','Sagitta Frontier Services',
      'Saturn Systems','Septem Tribus','Splice','Spire','Stormcraft Incorporated',
      'Teractor','Terralabs Research','Tharsis Republic','Thorgate',
      'Tycho Magnetics','United Nations Mars Initiative','Utopia Invest',
      'Valley Trust','Viron','Vitor','Mars Direct','Gagarin Mobility',
    ];
    for (var i = 0; i < corpNames.length; i++) _knownCorps.add(corpNames[i]);
  })();

  function updateHandScores() {
    if (!enabled) return;
    // Score ALL visible cards with badges — hand, draft, selection, any context
    var allCards = document.querySelectorAll('.card-container[data-tm-card]');
    if (allCards.length === 0) return;

    var myCorp = detectMyCorp();
    var myTableau = getMyTableauNames();
    var myHand = getMyHandNames();
    var ctx = getCachedPlayerContext();


    // During initial draft (no corp): detect offered corps from visible cards
    var offeredCorps = [];
    var gen = detectGeneration();
    if (!myCorp && gen <= 1) {
      allCards.forEach(function(el) {
        var cn = el.getAttribute('data-tm-card');
        if (cn && _knownCorps.has(cn)) {
          offeredCorps.push(cn);
        }
      });
    }

    // Collect other visible card names for inter-card synergy
    var visibleNames = [];
    allCards.forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && !_knownCorps.has(cn)) visibleNames.push(cn);
    });

    allCards.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var data = TM_RATINGS[name];
      if (!data) return;
      // Skip corp cards (they don't need context scoring)
      if (_knownCorps.has(name)) return;

      // Tableau cards (already played): freeze score at first context evaluation, don't re-score
      var isInTableau = !!el.closest('.player_home_block--cards, .player_home_block--tableau, .cards-wrapper');
      if (isInTableau) {
        // If already frozen — skip
        if (el.hasAttribute('data-tm-frozen')) return;
        // First time seeing this tableau card with context — score once and freeze
        el.setAttribute('data-tm-frozen', '1');
      }

      var result;
      if (!myCorp && offeredCorps.length > 0) {
        // Score against each offered corp, pick best
        var bestResult = null;
        var bestTotal = -999;
        var bestCorp = '';
        for (var ci = 0; ci < offeredCorps.length; ci++) {
          var r = scoreDraftCard(name, myTableau, visibleNames, offeredCorps[ci], el, ctx);
          if (r.total > bestTotal) { bestTotal = r.total; bestResult = r; bestCorp = offeredCorps[ci]; }
        }
        result = bestResult || scoreDraftCard(name, myTableau, visibleNames, '', el, ctx);
        if (bestCorp && bestResult && bestResult.total > data.s) {
          result.reasons.push('\u2191 ' + bestCorp);
        }
      } else {
        result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      }

      var origTier = data.t;
      var origScore = data.s;
      var newTier = scoreToTier(result.total);
      var delta = result.total - origScore;

      if (delta === 0) {
        badge.textContent = newTier + ' ' + result.total;
      } else {
        var cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
        var sign = delta > 0 ? '+' : '';
        badge.innerHTML = origTier + origScore +
          '<span class="tm-badge-arrow">\u2192</span>' +
          newTier + result.total +
          ' <span class="' + cls + '">' + sign + delta + '</span>';
      }
      badge.className = 'tm-tier-badge tm-tier-' + newTier;

      // Sync tm-dim with adjusted tier
      if (newTier === 'D' || newTier === 'F') {
        el.classList.add('tm-dim');
      } else {
        el.classList.remove('tm-dim');
      }

      if (result.reasons.length > 0) {
        el.setAttribute('data-tm-reasons', result.reasons.join('|'));
      }
    });
  }

  function injectDiscardHints() {
    if (!enabled) return;
    var advice = getDiscardAdvice();
    if (!advice || advice.length < 6) return;

    // Mark bottom 2-3 cards in hand with discard hint
    var threshold = advice.length >= 8 ? 3 : 2;
    var discardSet = new Set();
    for (var i = Math.max(0, advice.length - threshold); i < advice.length; i++) {
      discardSet.add(advice[i].name);
    }

    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      // Remove old hints
      var oldHint = el.querySelector('.tm-discard-hint');
      if (oldHint) oldHint.remove();

      if (discardSet.has(name)) {
        var hint = document.createElement('div');
        hint.className = 'tm-discard-hint';
        hint.textContent = '✗ сброс';
        hint.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:9px;color:#f44336;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;z-index:5;pointer-events:none';
        el.style.position = 'relative';
        el.appendChild(hint);
      }
    });
  }

  // ── Tag Counter Dashboard ──

  let tagCounterEl = null;
  let tagCounterVisible = false;

  function buildTagCounter() {
    if (tagCounterEl) return tagCounterEl;
    tagCounterEl = document.createElement('div');
    tagCounterEl.className = 'tm-tagcount-panel';
    document.body.appendChild(tagCounterEl);
    return tagCounterEl;
  }

  function updateTagCounter() {
    if (!tagCounterVisible || !enabled) {
      if (tagCounterEl) tagCounterEl.style.display = 'none';
      return;
    }

    const panel = buildTagCounter();
    const pv = getPlayerVueData();

    const tags = {};
    const prod = {};

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;
      if (p.tags) {
        for (const t of p.tags) {
          const name = (t.tag || '').toLowerCase();
          if (name && t.count > 0) tags[name] = t.count;
        }
      }
      prod.mc = p.megaCreditProduction || 0;
      prod.steel = p.steelProduction || 0;
      prod.ti = p.titaniumProduction || 0;
      prod.plants = p.plantProduction || 0;
      prod.energy = p.energyProduction || 0;
      prod.heat = p.heatProduction || 0;
    } else {
      panel.innerHTML = '<div class="tm-tc-title">Теги</div><div class="tm-pool-more">Данные недоступны</div>';
      panel.style.display = 'block';
      return;
    }

    let html = '<div class="tm-tc-title">Мои теги и продукция</div>';

    // Tags
    const tagOrder = ['building', 'space', 'science', 'earth', 'jovian', 'venus',
                      'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars', 'wild'];
    const tagLabels = {
      building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
      venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', power: 'Энер',
      city: 'Гор', event: 'Соб', mars: 'Мар', wild: 'Уни'
    };

    html += '<div class="tm-tc-tags">';
    for (const tag of tagOrder) {
      if (tags[tag]) {
        html += '<span class="tm-tc-tag" title="' + tag + '">';
        html += '<span class="tm-tc-tag-name">' + tagLabels[tag] + '</span>';
        html += '<span class="tm-tc-tag-count">' + tags[tag] + '</span>';
        html += '</span>';
      }
    }
    html += '</div>';

    // Production
    html += '<div class="tm-tc-prod-title">Продукция</div>';
    html += '<div class="tm-tc-prod">';
    const prodItems = [
      { name: 'MC', val: prod.mc },
      { name: 'Стл', val: prod.steel },
      { name: 'Ти', val: prod.ti },
      { name: 'Рст', val: prod.plants },
      { name: 'Энг', val: prod.energy },
      { name: 'Тпл', val: prod.heat },
    ];
    for (const pi of prodItems) {
      html += '<span class="tm-tc-prod-item">';
      html += '<span class="tm-tc-prod-name">' + pi.name + '</span>';
      html += '<span class="tm-tc-prod-val">' + pi.val + '</span>';
      html += '</span>';
    }
    html += '</div>';

    const uniqueTagCount = Object.keys(tags).length;
    html += '<div class="tm-tc-unique">Уникальных тегов: ' + uniqueTagCount + '</div>';

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Draft Tag Filter ──

  let lensEl = null;
  let activeLens = null;

  function updateDraftLens() {
    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) {
      if (lensEl) lensEl.style.display = 'none';
      if (activeLens) {
        activeLens = null;
        document.querySelectorAll('.tm-lens-dim').forEach((el) => el.classList.remove('tm-lens-dim'));
      }
      return;
    }

    if (!lensEl) {
      lensEl = document.createElement('div');
      lensEl.className = 'tm-lens-bar';

      const filters = [
        { label: 'Все', key: null },
        { label: 'Стр', key: 'building' },
        { label: 'Косм', key: 'space' },
        { label: 'Нау', key: 'science' },
        { label: 'Раст', key: 'plant' },
        { label: 'Мик', key: 'microbe' },
        { label: 'Жив', key: 'animal' },
        { label: 'Зем', key: 'earth' },
        { label: 'Юпи', key: 'jovian' },
        { label: 'Вен', key: 'venus' },
        { label: 'Соб', key: 'event' },
      ];

      for (const f of filters) {
        const btn = document.createElement('button');
        btn.className = 'tm-lens-btn';
        if (!f.key) btn.classList.add('tm-lens-active');
        btn.textContent = f.label;
        btn.title = f.key || 'Показать все';
        btn.addEventListener('click', () => {
          lensEl.querySelectorAll('.tm-lens-btn').forEach((b) => b.classList.remove('tm-lens-active'));
          btn.classList.add('tm-lens-active');
          applyDraftLens(f.key);
        });
        lensEl.appendChild(btn);
      }

      document.body.appendChild(lensEl);
    }

    lensEl.style.display = 'flex';
    // Re-apply active lens to new cards
    if (activeLens) applyDraftLens(activeLens);
  }

  function applyDraftLens(tagKey) {
    activeLens = tagKey;
    document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]').forEach((el) => {
      if (!tagKey) {
        el.classList.remove('tm-lens-dim');
        return;
      }

      // Check card DOM for tag class
      const hasTagIcon = el.querySelector('[class*="tag-' + tagKey + '"]');
      if (hasTagIcon) {
        el.classList.remove('tm-lens-dim');
        return;
      }

      // Fallback: check synergy and economy text
      const name = el.getAttribute('data-tm-card');
      const data = name ? TM_RATINGS[name] : null;
      if (data) {
        const allText = ((data.e || '') + ' ' + (data.y || []).join(' ') + ' ' + name).toLowerCase();
        if (allText.includes(tagKey)) {
          el.classList.remove('tm-lens-dim');
          return;
        }
      }

      el.classList.add('tm-lens-dim');
    });
  }

  // ── Generation Change Summary ──

  let lastSummaryGen = 0;
  let genStartTR = 0;
  let genStartTableau = 0;
  let genStartMCSnapshot = 0;
  let genStartProdSnapshot = null; // {mc, steel, ti, plant, energy, heat}
  let genSummaryHistory = []; // [{gen, trGained, cardsPlayed, mcSpent, prodGrowth}]

  function checkGenChange() {
    if (!enabled) return;
    const gen = detectGeneration();
    if (gen <= 0) return;

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    const p = pv.thisPlayer;

    if (gen > lastSummaryGen && lastSummaryGen > 0) {
      // Generation changed — rich summary of previous gen
      const trNow = p.terraformRating || 0;
      const tableauNow = (p.tableau || []).length;
      const trGained = trNow - genStartTR;
      const cardsPlayed = tableauNow - genStartTableau;
      const mcNow = p.megaCredits || 0;

      // Production growth
      var prodGrowth = 0;
      if (genStartProdSnapshot) {
        var currentProd = (p.megaCreditProduction || 0) + (p.steelProduction || 0) * 2
          + (p.titaniumProduction || 0) * 3 + (p.plantProduction || 0)
          + (p.energyProduction || 0) + (p.heatProduction || 0);
        var oldProd = genStartProdSnapshot.total;
        prodGrowth = currentProd - oldProd;
      }

      // Save history
      genSummaryHistory.push({
        gen: lastSummaryGen, trGained: trGained, cardsPlayed: cardsPlayed,
        prodGrowth: prodGrowth
      });

      // Build rich summary toast
      var parts = ['Пок. ' + lastSummaryGen + ' → ' + gen + ':'];
      if (trGained > 0) parts.push('+' + trGained + ' TR');
      if (cardsPlayed > 0) parts.push(cardsPlayed + ' карт');
      if (prodGrowth > 0) parts.push('+' + prodGrowth + ' прод');
      else if (prodGrowth < 0) parts.push(prodGrowth + ' прод');

      // Compare with opponents
      if (pv.players) {
        var myTR = trNow;
        var bestOppTR = 0;
        var bestOppName = '';
        for (var oi = 0; oi < pv.players.length; oi++) {
          var opp = pv.players[oi];
          if (opp.color === p.color) continue;
          var oppTR = opp.terraformRating || 0;
          if (oppTR > bestOppTR) { bestOppTR = oppTR; bestOppName = opp.name || opp.color; }
        }
        var trDelta = myTR - bestOppTR;
        if (trDelta > 0) parts.push('TR лидер (+' + trDelta + ')');
        else if (trDelta < -3) parts.push('⚠ −' + Math.abs(trDelta) + ' TR от ' + bestOppName);
      }

      // Terrain progress
      if (pv.game) {
        var gTemp = pv.game.temperature;
        var gOxy = pv.game.oxygenLevel;
        var gOce = pv.game.oceans;
        var totalRaises = 0, totalTarget = 0;
        if (typeof gTemp === 'number') { totalRaises += (gTemp + 30) / 2; totalTarget += 19; }
        if (typeof gOxy === 'number') { totalRaises += gOxy; totalTarget += 14; }
        if (typeof gOce === 'number') { totalRaises += gOce; totalTarget += 9; }
        if (totalTarget > 0) {
          var pctDone = Math.round(totalRaises / totalTarget * 100);
          parts.push(pctDone + '% терраф.');
        }
      }

      showToast(parts.join(' | '), trGained >= 3 ? 'great' : 'info');

      // Production trend toast (every 3 gens)
      if (genSummaryHistory.length >= 3 && genSummaryHistory.length % 3 === 0) {
        var recentTR = 0;
        for (var si = genSummaryHistory.length - 3; si < genSummaryHistory.length; si++) {
          recentTR += genSummaryHistory[si].trGained;
        }
        var avgTR = (recentTR / 3).toFixed(1);
        showToast('📊 Темп последних 3 пок.: ~' + avgTR + ' TR/пок.', 'info');
      }
    }

    if (gen !== lastSummaryGen) {
      lastSummaryGen = gen;
      genStartTR = p.terraformRating || 0;
      genStartTableau = (p.tableau || []).length;
      genStartMCSnapshot = p.megaCredits || 0;
      var mc = p.megaCreditProduction || 0;
      var st = p.steelProduction || 0;
      var ti = p.titaniumProduction || 0;
      var pl = p.plantProduction || 0;
      var en = p.energyProduction || 0;
      var he = p.heatProduction || 0;
      genStartProdSnapshot = { mc: mc, st: st, ti: ti, pl: pl, en: en, he: he, total: mc + st * 2 + ti * 3 + pl + en + he };
    }
  }

  // ── Action Card Reminder ──

  let lastReminderGen = 0;
  const activatedThisGen = new Set();

  function updateActionReminder() {
    if (!enabled) return;

    const gen = detectGeneration();
    // Reset activated set when generation changes
    if (gen !== lastReminderGen) {
      activatedThisGen.clear();
      lastReminderGen = gen;
    }

    // Remove old indicators
    document.querySelectorAll('.tm-action-reminder').forEach((el) => el.remove());

    // Only show during action phase (when we see the main game board, not during draft)
    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length > 0) return; // Draft phase — skip

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    // Check which cards in our tableau are blue (active) cards with actions
    const tableauEls = document.querySelectorAll('.player_home_block--cards .card-container[data-tm-card]');

    for (const el of tableauEls) {
      const name = el.getAttribute('data-tm-card');
      if (!name || activatedThisGen.has(name)) continue;

      // Detect blue/active cards by DOM (blue background or .card-type--active class)
      const isBlue = el.classList.contains('card-type--active') ||
        el.querySelector('.card-content-wrapper[class*="blue"]') ||
        el.querySelector('.card-content--blue') ||
        el.querySelector('.blue-action');

      // Fallback: check if ratings data mentions "action" in economy
      const data = TM_RATINGS[name];
      const hasAction = isBlue || (data && data.e && data.e.toLowerCase().includes('action'));

      if (!hasAction) continue;

      // Check Vue data for activation status
      if (pv.thisPlayer.tableau) {
        for (const card of pv.thisPlayer.tableau) {
          const cn = card.name || card;
          if (cn === name && card.isDisabled) {
            activatedThisGen.add(name);
            break;
          }
        }
        if (activatedThisGen.has(name)) continue;
      }

      // Classify action priority
      let priority = 'normal';
      let actionHint = 'Действие доступно';
      if (data) {
        const eLower = (data.e || '').toLowerCase();
        if (eLower.includes('vp') || eLower.includes('animal') || eLower.includes('floater') || eLower.includes('science')) {
          priority = 'vp';
          actionHint = 'VP action — приоритет!';
        } else if (eLower.includes('mc') || eLower.includes('prod') || eLower.includes('steel') || eLower.includes('titanium')) {
          priority = 'econ';
          actionHint = 'Экономический action';
        } else if (eLower.includes('card') || eLower.includes('draw')) {
          priority = 'card';
          actionHint = 'Card draw action';
        }
      }

      // Add reminder dot with priority color
      const dot = document.createElement('div');
      dot.className = 'tm-action-reminder tm-action-' + priority;
      dot.title = actionHint;
      el.appendChild(dot);
    }
  }

  // ── Generation Timer ──

  let genStartTime = Date.now();
  let gameStartTime = Date.now();
  let lastTrackedGen = 0;
  let genTimes = [];

  function updateGenTimer() {
    const gen = detectGeneration();

    if (gen !== lastTrackedGen && gen > 0) {
      if (lastTrackedGen > 0) {
        genTimes.push({ gen: lastTrackedGen, duration: Date.now() - genStartTime });
        // Game Logger: fetch actions for completed generation
        fetchGameActions(lastTrackedGen);
      }
      genStartTime = Date.now();
      lastTrackedGen = gen;
      // Game Logger: snapshot at new generation start
      logSnapshot(gen);
    }

    // Timer tracking only (no UI — removed bottom bar)
  }

  // ── Global Parameters HUD ──

  let globalsEl = null;
  let globalsVisible = false;

  function buildGlobalsPanel() {
    if (globalsEl) return globalsEl;
    globalsEl = document.createElement('div');
    globalsEl.className = 'tm-globals-panel';
    document.body.appendChild(globalsEl);
    return globalsEl;
  }

  const MAP_MILESTONES = {
    'Tharsis': ['Terraformer', 'Mayor', 'Gardener', 'Builder', 'Planner'],
    'Hellas':  ['Diversifier', 'Tactician', 'Polar Explorer', 'Energizer', 'Rim Settler'],
    'Elysium': ['Generalist', 'Specialist', 'Ecologist', 'Tycoon', 'Legend'],
  };

  function detectMap(game) {
    if (!game || !game.milestones) return '';
    const msNames = game.milestones.map(function(m) { return m.name; });
    for (const mapName in MAP_MILESTONES) {
      const expected = MAP_MILESTONES[mapName];
      if (expected.some(function(n) { return msNames.indexOf(n) >= 0; })) return mapName;
    }
    return '';
  }

  function updateGlobals() {
    if (!globalsVisible || !enabled) {
      if (globalsEl) globalsEl.style.display = 'none';
      return;
    }

    const panel = buildGlobalsPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game) {
      panel.style.display = 'none';
      return;
    }

    const g = pv.game;
    const gen = g.generation || detectGeneration();
    const temp = g.temperature != null ? g.temperature : '?';
    const oxy = g.oxygenLevel != null ? g.oxygenLevel : '?';
    const oceans = g.oceans != null ? g.oceans : '?';
    const venus = g.venusScaleLevel != null ? g.venusScaleLevel : null;

    // Calculate remaining raises
    const tempLeft = typeof temp === 'number' ? Math.max(0, (8 - temp) / 2) : '?';
    const oxyLeft = typeof oxy === 'number' ? Math.max(0, 14 - oxy) : '?';
    const oceansLeft = typeof oceans === 'number' ? Math.max(0, 9 - oceans) : '?';
    const venusLeft = venus != null ? Math.max(0, (30 - venus) / 2) : null;

    // Estimate gens remaining based on global progress
    let totalRaises = 0;
    let totalTarget = 0;
    if (typeof temp === 'number') { totalRaises += (temp + 30) / 2; totalTarget += 19; }
    if (typeof oxy === 'number') { totalRaises += oxy; totalTarget += 14; }
    if (typeof oceans === 'number') { totalRaises += oceans; totalTarget += 9; }
    const progress = totalTarget > 0 ? Math.round((totalRaises / totalTarget) * 100) : 0;

    // Game end estimation
    const raisesLeft = (typeof tempLeft === 'number' ? tempLeft : 0)
      + (typeof oxyLeft === 'number' ? oxyLeft : 0)
      + (typeof oceansLeft === 'number' ? oceansLeft : 0);
    const estGensLeft = Math.max(1, Math.ceil(raisesLeft / 3));

    const mapName = detectMap(g);

    // Game phase detection
    let phase, phaseColor, phaseHint;
    if (gen <= 2) {
      phase = 'Ранняя'; phaseColor = '#2ecc71';
      phaseHint = 'Приоритет: продукция, теги, engine-building';
    } else if (progress < 40) {
      phase = 'Развитие'; phaseColor = '#3498db';
      phaseHint = 'Приоритет: баланс продукции и VP-карт';
    } else if (progress < 75) {
      phase = 'Середина'; phaseColor = '#f39c12';
      phaseHint = 'Приоритет: VP-карты, TR, милестоуны/награды';
    } else {
      phase = 'Финал'; phaseColor = '#e74c3c';
      phaseHint = 'Приоритет: VP, конвертация ресурсов, стандартные проекты';
    }

    let html = '<div class="tm-gl-title">' + minBtn('globals') + 'Глобальные (Пок. ' + gen + (mapName ? ' | ' + mapName : '') + ')</div>';
    html += '<div class="tm-gl-phase" style="color:' + phaseColor + '" title="' + phaseHint + '">' + phase + ' — ' + phaseHint + '</div>';
    html += '<div class="tm-gl-endgame">';
    html += '<div class="tm-pool-bar" style="margin:4px 0"><div class="tm-pool-fill" style="width:' + progress + '%"></div></div>';
    html += '<div style="text-align:center;font-size:11px;opacity:0.8">' + progress + '% | ~' + estGensLeft + ' пок. до конца</div>';
    html += '</div>';

    // Temperature
    const tempBonus = (typeof temp === 'number' && temp === -24) ? ' 🌊' : '';
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">🌡</span>';
    html += '<span class="tm-gl-label">Темп</span>';
    html += '<span class="tm-gl-val">' + temp + '°C' + tempBonus + '</span>';
    html += '<span class="tm-gl-left">ост. ' + tempLeft + '</span>';
    html += '</div>';
    if (typeof temp === 'number' && temp === -24) {
      html += '<div style="font-size:10px;color:#3498db;padding:0 4px 2px 24px">+1°C → бесплатный океан!</div>';
    }

    // Oxygen
    const oxyBonus = (typeof oxy === 'number' && oxy === 8) ? ' 🌡' : '';
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">O₂</span>';
    html += '<span class="tm-gl-label">Кислород</span>';
    html += '<span class="tm-gl-val">' + oxy + '%' + oxyBonus + '</span>';
    html += '<span class="tm-gl-left">ост. ' + oxyLeft + '</span>';
    html += '</div>';
    if (typeof oxy === 'number' && oxy === 8) {
      html += '<div style="font-size:10px;color:#e67e22;padding:0 4px 2px 24px">+1% O₂ → бонусный +1°C!</div>';
    }

    // Oceans
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">🌊</span>';
    html += '<span class="tm-gl-label">Океаны</span>';
    html += '<span class="tm-gl-val">' + oceans + '/9</span>';
    html += '<span class="tm-gl-left">ост. ' + oceansLeft + '</span>';
    html += '</div>';

    // Venus (if in game)
    if (venus != null) {
      html += '<div class="tm-gl-row">';
      html += '<span class="tm-gl-icon">♀</span>';
      html += '<span class="tm-gl-label">Венера</span>';
      html += '<span class="tm-gl-val">' + venus + '%</span>';
      html += '<span class="tm-gl-left">ост. ' + venusLeft + '</span>';
      html += '</div>';
      // Venus bonus thresholds
      const vBonuses = [];
      if (venus < 8) vBonuses.push('8% → +1 TR всем');
      if (venus < 16) vBonuses.push('16% → +1 TR всем');
      if (vBonuses.length > 0) {
        html += '<div style="font-size:10px;color:#e91e63;padding:0 4px 2px 24px">' + vBonuses.join(' | ') + '</div>';
      }
    }

    // Overall progress bar
    html += '<div class="tm-gl-progress">';
    html += '<div class="tm-gl-progress-bar"><div class="tm-gl-progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<span class="tm-gl-progress-pct">' + progress + '%</span>';
    html += '</div>';

    // Estimated gens remaining
    if (gen > 1 && progress > 0 && progress < 100) {
      const raisesPerGen = totalRaises / (gen - 1);
      const raisesNeeded = totalTarget - totalRaises;
      const gensEst = raisesPerGen > 0 ? Math.ceil(raisesNeeded / raisesPerGen) : '?';
      html += '<div class="tm-gl-est">~' + gensEst + ' пок. до конца</div>';
    }

    // Terraforming priority advisor
    {
      const priorities = [];
      if (tempLeft > 0) priorities.push({ name: 'Температура', left: tempLeft, spCost: 14, trPer: 1, bonus: temp <= -24 ? ' (+океан!)' : '' });
      if (oxyLeft > 0) priorities.push({ name: 'Кислород', left: oxyLeft, spCost: 23, trPer: 1, bonus: '' });
      if (oceansLeft > 0) priorities.push({ name: 'Океан', left: oceansLeft, spCost: 18, trPer: 1, bonus: ' (+бонус тайла)' });
      if (venus != null && venusLeft > 0) priorities.push({ name: 'Венера', left: venusLeft, spCost: 15, trPer: 1, bonus: '' });

      if (priorities.length > 0) {
        priorities.sort(function(a, b) { return a.spCost - b.spCost; });
        const best = priorities[0];
        html += '<div class="tm-gl-section">Приоритет терраформинга</div>';
        html += '<div class="tm-gl-priority" style="color:#2ecc71;font-size:11px">';
        html += '★ ' + best.name + ' — ' + best.spCost + ' MC/TR' + best.bonus;
        html += '</div>';
        if (priorities.length > 1) {
          const rest = priorities.slice(1).map(function(p) { return p.name + ' ' + p.spCost; }).join(' · ');
          html += '<div style="font-size:10px;opacity:0.6">' + rest + '</div>';
        }
      }
    }

    // WGT prediction — which parameter will World Government raise next?
    {
      const wgtParams = [];
      if (typeof temp === 'number' && temp < 8) {
        const tempPct = ((temp + 30) / 38) * 100;
        wgtParams.push({ name: 'Температура', pct: tempPct, icon: '🌡', left: tempLeft });
      }
      if (typeof oxy === 'number' && oxy < 14) {
        const oxyPct = (oxy / 14) * 100;
        wgtParams.push({ name: 'Кислород', pct: oxyPct, icon: 'O₂', left: oxyLeft });
      }
      if (typeof oceans === 'number' && oceans < 9) {
        const oceanPct = (oceans / 9) * 100;
        wgtParams.push({ name: 'Океан', pct: oceanPct, icon: '🌊', left: oceansLeft });
      }
      if (venus != null && venus < 30) {
        const venusPct = (venus / 30) * 100;
        wgtParams.push({ name: 'Венера', pct: venusPct, icon: '♀', left: venusLeft });
      }
      if (wgtParams.length > 0) {
        // WGT picks lowest % completion (most behind)
        wgtParams.sort(function(a, b) { return a.pct - b.pct; });
        const wgtNext = wgtParams[0];
        html += '<div class="tm-gl-section">WGT прогноз</div>';
        html += '<div style="font-size:11px;color:#9b59b6">';
        html += wgtNext.icon + ' ' + wgtNext.name + ' (' + Math.round(wgtNext.pct) + '% — самый отстающий)';
        html += '</div>';
        if (wgtParams.length > 1 && Math.abs(wgtParams[0].pct - wgtParams[1].pct) < 5) {
          html += '<div style="font-size:10px;opacity:0.6">Близко с ' + wgtParams[1].name + ' — может быть любой</div>';
        }
      }
    }

    // Strategy summary — detect committed directions
    {
      const ctx = getCachedPlayerContext();
      if (ctx) {
        const strategies = [];
        const STRAT_THR = { 'venus': [3, 'Venus'], 'jovian': [2, 'Jovian'], 'science': [4, 'Science'], 'earth': [4, 'Earth'], 'building': [6, 'Building'], 'microbe': [3, 'Microbe'], 'animal': [3, 'Animal'], 'space': [5, 'Space'] };
        for (const tag in STRAT_THR) {
          const count = ctx.tags[tag] || 0;
          if (count >= STRAT_THR[tag][0]) {
            strategies.push(STRAT_THR[tag][1] + ' ×' + count);
          }
        }
        if (strategies.length > 0) {
          html += '<div class="tm-gl-section">Стратегия</div>';
          html += '<div style="font-size:11px;color:#ce93d8">★ ' + strategies.join(' · ') + '</div>';
        }

        // Resource efficiency summary
        const prodTotal = (ctx.prod.mc || 0) + (ctx.prod.steel || 0) * 2 + (ctx.prod.ti || 0) * 3 +
          (ctx.prod.plants || 0) * 1.5 + (ctx.prod.energy || 0) * 1.5 + (ctx.prod.heat || 0) * 0.5;
        const prodRating = prodTotal >= 30 ? 'Мощный' : prodTotal >= 20 ? 'Хороший' : prodTotal >= 12 ? 'Средний' : 'Слабый';
        const prodColor = prodTotal >= 30 ? '#2ecc71' : prodTotal >= 20 ? '#3498db' : prodTotal >= 12 ? '#f39c12' : '#e74c3c';
        html += '<div style="font-size:10px;color:' + prodColor + '">Engine: ' + prodRating + ' (' + Math.round(prodTotal) + ' MC-экв/пок)</div>';
      }
    }

    // Standard project costs with current resources
    const p = pv.thisPlayer;
    if (p) {
      const steel = p.steel || 0;
      const ti = p.titanium || 0;
      const steelVal = p.steelValue || 2;
      const tiVal = p.titaniumValue || 3;
      const mc = p.megaCredits || 0;

      html += '<div class="tm-gl-section">Стандартные проекты</div>';
      const projects = [
        { name: 'Озеленение', cost: 23, usesSteel: true, value: 1 },
        { name: 'Город', cost: 25, usesSteel: true, value: 1.5 },
        { name: 'Океан', cost: 18, value: 1 },
        { name: 'Температура', cost: 14, value: 1 },
        { name: 'Электростанция', cost: 11, value: 0.6 },
      ];

      // Calculate effective costs and find best affordable project
      let bestIdx = -1;
      let bestRatio = 999;
      for (let i = 0; i < projects.length; i++) {
        const proj = projects[i];
        proj.effective = proj.cost;
        if (proj.usesSteel) proj.effective = Math.max(0, proj.cost - steel * steelVal);
        proj.canAfford = mc >= proj.effective;
        if (proj.canAfford) {
          const ratio = proj.effective / proj.value;
          if (ratio < bestRatio) { bestRatio = ratio; bestIdx = i; }
        }
      }

      for (let i = 0; i < projects.length; i++) {
        const proj = projects[i];
        const isBest = (i === bestIdx);
        html += '<div class="tm-gl-sp-row' + (proj.canAfford ? '' : ' tm-gl-sp-cant') + (isBest ? ' tm-gl-sp-best' : '') + '">';
        html += '<span class="tm-gl-sp-name">' + (isBest ? '★ ' : '') + proj.name + '</span>';
        html += '<span class="tm-gl-sp-cost">';
        if (proj.usesSteel && steel > 0) {
          html += proj.effective + ' MC';
          html += ' <span class="tm-gl-sp-savings">(-' + Math.min(steel * steelVal, proj.cost) + '⚒)</span>';
        } else {
          html += proj.cost + ' MC';
        }
        html += '</span>';
        html += '</div>';
      }
    }

    // Resource conversion reminders + countdown
    if (pv.thisPlayer) {
      const myPlants = pv.thisPlayer.plants || 0;
      const myHeat = pv.thisPlayer.heat || 0;
      const plantProd = pv.thisPlayer.plantProduction || 0;
      const heatProd = pv.thisPlayer.heatProduction || 0;
      const energyProd = pv.thisPlayer.energyProduction || 0;
      const plantsNeeded = pv.thisPlayer.plantsNeededForGreenery || 8;
      const showSection = myPlants >= plantsNeeded || myHeat >= 8 || (plantProd > 0 && myPlants < plantsNeeded) || (heatProd + energyProd > 0 && myHeat < 8);

      if (showSection) {
        html += '<div class="tm-gl-section">Конвертация</div>';
        if (myPlants >= plantsNeeded) {
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#4caf50;font-weight:bold">🌿 ' + myPlants + '/' + plantsNeeded + ' → озеленение ГОТОВО</span></div>';
        } else if (plantProd > 0) {
          const gensToGreen = Math.ceil((plantsNeeded - myPlants) / plantProd);
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#4caf50">🌿 ' + myPlants + '/' + plantsNeeded + ' → через ' + gensToGreen + ' пок.</span></div>';
        }
        if (myHeat >= 8) {
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#ff6b35;font-weight:bold">🔥 ' + myHeat + '/8 → +1°C ГОТОВО</span></div>';
        } else if (heatProd + energyProd > 0) {
          const totalHeatPerGen = heatProd + energyProd;
          const gensToHeat = Math.ceil((8 - myHeat) / totalHeatPerGen);
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#ff6b35">🔥 ' + myHeat + '/8 → через ' + gensToHeat + ' пок.</span></div>';
        }
        // Conversion priority hint
        if (myPlants >= plantsNeeded && myHeat >= 8) {
          const tempMaxed = typeof temp === 'number' && temp >= 8;
          const oxyMaxed = typeof oxy === 'number' && oxy >= 14;
          if (tempMaxed && !oxyMaxed) {
            html += '<div style="font-size:10px;color:#2ecc71;padding:1px 4px">→ Озеленение первым (тепло уже не даёт TR)</div>';
          } else if (oxyMaxed && !tempMaxed) {
            html += '<div style="font-size:10px;color:#ff6b35;padding:1px 4px">→ Тепло первым (кислород уже макс)</div>';
          } else if (!tempMaxed && !oxyMaxed) {
            html += '<div style="font-size:10px;color:#3498db;padding:1px 4px">→ Озеленение первым (VP + TR vs только TR)</div>';
          }
        }
      }
    }

    // Turn order
    if (pv.game && pv.game.players && pv.thisPlayer) {
      const players = pv.game.players;
      const firstIdx = players.findIndex(function(pl) { return pl.isActive; });
      const myIdx = players.findIndex(function(pl) { return pl.color === pv.thisPlayer.color; });
      if (firstIdx >= 0 && myIdx >= 0 && players.length > 1) {
        const order = [];
        for (let i = 0; i < players.length; i++) {
          const idx = (firstIdx + i) % players.length;
          const pl = players[idx];
          const isMe = pl.color === pv.thisPlayer.color;
          order.push((isMe ? '▶ ' : '') + (pl.name || pl.color));
        }
        const myTurn = (myIdx - firstIdx + players.length) % players.length + 1;
        html += '<div class="tm-gl-section">Порядок хода</div>';
        html += '<div style="font-size:11px;color:#aaa;padding:1px 4px">' + order.join(' → ') + '</div>';
        if (myTurn > 1) {
          html += '<div style="font-size:10px;color:#f39c12;padding:1px 4px">Ты ходишь ' + myTurn + '-м</div>';
        } else {
          html += '<div style="font-size:10px;color:#2ecc71;padding:1px 4px">Ты ходишь первым!</div>';
        }
      }
    }

    // Board summary — cities, greeneries, oceans placed
    if (pv.game && pv.game.spaces) {
      let myCities = 0, myGreeneries = 0, totalCities = 0, totalGreeneries = 0;
      const myColor = pv.thisPlayer ? pv.thisPlayer.color : null;
      for (const sp of pv.game.spaces) {
        if (sp.tileType === 'city' || sp.tileType === 0 || sp.tileType === 'capital' || sp.tileType === 5) {
          totalCities++;
          if (sp.color === myColor) myCities++;
        }
        if (sp.tileType === 'greenery' || sp.tileType === 1) {
          totalGreeneries++;
          if (sp.color === myColor) myGreeneries++;
        }
      }
      if (totalCities > 0 || totalGreeneries > 0) {
        html += '<div class="tm-gl-section">Карта</div>';
        html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name">🏙 Города: ' + myCities + ' мои / ' + totalCities + ' всего</span></div>';
        html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name">🌿 Озеленения: ' + myGreeneries + ' мои / ' + totalGreeneries + ' всего</span></div>';
        // VP from greeneries adjacent to my cities
        if (myCities > 0 && totalGreeneries > 0) {
          html += '<div style="font-size:10px;color:#888;padding:1px 4px">VP город = кол-во смежных озеленений</div>';
        }
      }
    }

    // Resource waste detection
    if (pv.thisPlayer) {
      const wastes = [];
      const myP = pv.thisPlayer;
      const tempMaxed = typeof temp === 'number' && temp >= 8;
      const oxyMaxed = typeof oxy === 'number' && oxy >= 14;
      const oceansMaxed = typeof oceans === 'number' && oceans >= 9;
      if (tempMaxed && (myP.heatProduction || 0) > 0) {
        wastes.push('🔥 Тепло-продукция (' + myP.heatProduction + ') без пользы (темп макс)');
      }
      if (oxyMaxed && (myP.plantProduction || 0) > 0 && !tempMaxed) {
        // Plants still give greenery VP even if O2 maxed, but no TR
        wastes.push('🌿 Озеленения не дают TR (O₂ макс), но всё ещё +1 VP');
      }
      if (tempMaxed && oxyMaxed && oceansMaxed) {
        // All params maxed — game ends this round
        wastes.push('⚠ Все параметры на максимуме — последнее поколение!');
      }
      if ((myP.energyProduction || 0) > 0 && (myP.energy || 0) > 10 && !myP.tableau.some(function(c) { const n = (c.name || c).toLowerCase(); return n.includes('power') || n.includes('energy'); })) {
        wastes.push('⚡ Энергия копится (' + myP.energy + ') — нет потребителей');
      }
      if (wastes.length > 0) {
        html += '<div class="tm-gl-section" style="color:#e74c3c">Предупреждения</div>';
        for (const w of wastes) {
          html += '<div style="font-size:10px;color:#e74c3c;padding:1px 4px">' + w + '</div>';
        }
      }
    }

    // My tag summary
    if (pv.thisPlayer && pv.thisPlayer.tags) {
      const tagLabels = {
        building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
        venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', event: 'Соб',
        power: 'Энер', city: 'Гор', mars: 'Марс', wild: 'Дик'
      };
      const tagColors = {
        building: '#8b7355', space: '#444', science: '#ecf0f1', earth: '#3498db', jovian: '#e67e22',
        venus: '#e91e63', plant: '#4caf50', microbe: '#27ae60', animal: '#8e44ad', event: '#e74c3c',
        power: '#9b59b6', city: '#888', mars: '#c0392b'
      };
      const myTags = [];
      for (const t of pv.thisPlayer.tags) {
        const tName = (t.tag || '').toLowerCase();
        if (t.count > 0 && tagLabels[tName]) {
          myTags.push({ name: tName, count: t.count, label: tagLabels[tName], color: tagColors[tName] || '#888' });
        }
      }
      if (myTags.length > 0) {
        myTags.sort(function(a, b) { return b.count - a.count; });
        html += '<div class="tm-gl-section">Мои теги</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;padding:1px 4px">';
        for (const tag of myTags) {
          html += '<span class="tm-tag-pill" style="border-color:' + tag.color + '">' + tag.label + ':' + tag.count + '</span>';
        }
        html += '</div>';
      }
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'globals');
    panel.style.display = 'block';
  }

  // ── VP Tracker ──

  let vpEl = null;
  let vpVisible = false;

  function buildVPPanel() {
    if (vpEl) return vpEl;
    vpEl = document.createElement('div');
    vpEl.className = 'tm-vp-panel';
    document.body.appendChild(vpEl);
    return vpEl;
  }

  function updateVPTracker() {
    if (!vpVisible || !enabled) {
      if (vpEl) vpEl.style.display = 'none';
      return;
    }

    const panel = buildVPPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      panel.innerHTML = '<div class="tm-vp-title">Оценка VP</div><div class="tm-pool-more">Данные недоступны</div>';
      panel.style.display = 'block';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();

    // 1. TR
    const tr = p.terraformRating || 0;

    // 2. Greeneries — each is 1 VP (from tiles on map)
    // Count from Vue: p.tableau cards that placed greeneries, or from map tiles
    // Best approximation: check player's tile data if available
    let greeneries = 0;
    let cities = 0;

    // Try to read from player's played tiles
    if (pv.game && pv.game.spaces) {
      const myColor = pv.thisPlayer.color;
      for (const space of pv.game.spaces) {
        if (space.color === myColor) {
          if (space.tileType === 'greenery' || space.tileType === 1) greeneries++;
          if (space.tileType === 'city' || space.tileType === 0 ||
              space.tileType === 'capital' || space.tileType === 5) cities++;
        }
      }
    }

    // 3. Card VPs from tableau
    let cardVP = 0;
    let cardVPDetails = [];
    if (p.tableau) {
      for (const card of p.tableau) {
        const cardName = card.name || card;
        const data = TM_RATINGS[cardName];
        // Check for victoryPoints in Vue data
        if (card.victoryPoints !== undefined && card.victoryPoints !== 0) {
          let vp = 0;
          if (typeof card.victoryPoints === 'number') {
            vp = card.victoryPoints;
          } else if (card.victoryPoints && typeof card.victoryPoints.points === 'number') {
            vp = card.victoryPoints.points;
          }
          if (vp !== 0) {
            cardVP += vp;
            cardVPDetails.push({ name: cardName, vp: vp });
          }
        }
      }
    }

    // 4. VP from resources on cards (animals, microbes for Ants, etc.)
    // This comes from card.resources in Vue
    let resourceVP = 0;
    let resourceVPDetails = [];
    if (p.tableau) {
      for (const card of p.tableau) {
        const cardName = card.name || card;
        // Cards with "1 VP per resource" or similar
        if (card.resources && card.resources > 0) {
          // Check if this card gives VP per resource
          const data = TM_RATINGS[cardName];
          if (data) {
            const econ = (data.e || '').toLowerCase();
            // Common patterns: "1 vp per animal", "1 vp per microbe", "1/2 vp per"
            if (econ.includes('vp per') || econ.includes('vp/')) {
              let vpPer = 1;
              if (econ.includes('1/2 vp') || econ.includes('0.5 vp')) vpPer = 0.5;
              if (econ.includes('1/3 vp')) vpPer = 1/3;
              const vp = Math.floor(card.resources * vpPer);
              if (vp > 0) {
                resourceVP += vp;
                resourceVPDetails.push({ name: cardName, vp: vp, res: card.resources });
              }
            }
          }
        }
      }
    }

    // 5. Milestones — 5 VP each (check if we funded any)
    let milestoneVP = 0;
    if (pv.game && pv.game.milestones) {
      for (const ms of pv.game.milestones) {
        if (ms.playerColor === pv.thisPlayer.color || ms.player === pv.thisPlayer.color) {
          milestoneVP += 5;
        }
      }
    }

    // 6. Awards — use real scores from game
    let awardVP = 0;
    const awardDetails = [];
    if (pv.game && pv.game.awards) {
      const myColor = pv.thisPlayer.color;
      for (const aw of pv.game.awards) {
        if (!(aw.playerName || aw.color)) continue; // not funded
        if (!aw.scores || aw.scores.length === 0) continue;
        const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        const myEntry = sorted.find(function(s) { return s.color === myColor; });
        if (!myEntry) continue;
        const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
        let vpGain = 0;
        if (myRank === 0) vpGain = 5;
        else if (myRank === 1) vpGain = 2;
        // Tie with 1st
        if (myRank > 0 && sorted[0].score === myEntry.score) vpGain = 5;
        // Tie with 2nd (if not 1st)
        if (myRank > 1 && sorted[1] && sorted[1].score === myEntry.score) vpGain = 2;
        awardVP += vpGain;
        awardDetails.push({ name: aw.name, vp: vpGain, leader: sorted[0].color, leaderScore: sorted[0].score, myScore: myEntry.score });
      }
    }

    // 7. City adjacency bonus — use real breakdown if available
    const vb = p.victoryPointsBreakdown;
    const hasRealVP = vb && vb.total > 0;
    const cityAdj = hasRealVP ? (vb.city || 0) : cities * 1;

    // Use real VP data if available, else estimate
    let total;
    let rows;
    if (hasRealVP) {
      total = vb.total;
      const realCardVP = (vb.victoryPoints || 0);
      rows = [
        { label: 'Terraform Rating', val: vb.terraformRating || tr, cls: '' },
        { label: 'Озеленение', val: vb.greenery || greeneries, cls: '' },
        { label: 'Города', val: vb.city || 0, cls: '' },
        { label: 'VP с карт', val: realCardVP, cls: '' },
        { label: 'Вехи', val: vb.milestones || 0, cls: '' },
        { label: 'Награды', val: vb.awards || 0, cls: '' },
      ];
    } else {
      total = tr + greeneries + cardVP + resourceVP + milestoneVP + awardVP + cityAdj;
      rows = [
        { label: 'Terraform Rating', val: tr, cls: '' },
        { label: 'Озеленение', val: greeneries, cls: greeneries > 0 ? '' : 'tm-vp-zero' },
        { label: 'Города (оценка)', val: cityAdj, cls: cityAdj > 0 ? '' : 'tm-vp-zero' },
        { label: 'VP с карт', val: cardVP, cls: cardVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'VP с ресурсов', val: resourceVP, cls: resourceVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'Вехи', val: milestoneVP, cls: milestoneVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'Награды', val: awardVP, cls: awardVP > 0 ? '' : 'tm-vp-zero' },
      ];
    }

    let html = '<div class="tm-vp-title">' + minBtn('vp') + (hasRealVP ? 'VP' : 'Оценка VP') + ' (Пок. ' + gen + ')</div>';

    for (const r of rows) {
      if (r.val === 0 && r.cls === 'tm-vp-zero') continue; // skip zero rows
      html += '<div class="tm-vp-row' + (r.cls ? ' ' + r.cls : '') + '">';
      html += '<span class="tm-vp-label">' + r.label + '</span>';
      html += '<span class="tm-vp-val">' + r.val + '</span>';
      html += '</div>';
    }

    html += '<div class="tm-vp-total">';
    html += '<span>Итого' + (hasRealVP ? '' : ' (оценка)') + '</span>';
    html += '<span class="tm-vp-total-val">' + total + '</span>';
    html += '</div>';

    // VP distribution chart
    if (total > 0) {
      const segments = [];
      for (const r of rows) {
        if (r.val > 0) {
          const pctR = Math.round(r.val / total * 100);
          segments.push({ label: r.label, pct: pctR, val: r.val });
        }
      }
      if (segments.length > 0) {
        const barColors = ['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c'];
        html += '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin:4px 0">';
        for (let i = 0; i < segments.length; i++) {
          html += '<div style="width:' + segments[i].pct + '%;background:' + barColors[i % barColors.length] + '" title="' + segments[i].label + ': ' + segments[i].val + ' (' + segments[i].pct + '%)"></div>';
        }
        html += '</div>';
        html += '<div style="font-size:10px;color:#888;display:flex;flex-wrap:wrap;gap:4px">';
        for (let i = 0; i < segments.length; i++) {
          html += '<span><span style="color:' + barColors[i % barColors.length] + '">●</span> ' + segments[i].pct + '%</span>';
        }
        html += '</div>';
      }
    }

    // Card VP details — use real breakdown if available
    if (hasRealVP && vb.detailsCards && vb.detailsCards.length > 0) {
      const sorted = vb.detailsCards.slice().sort(function(a, b) { return b.victoryPoint - a.victoryPoint; });
      html += '<div class="tm-vp-section">VP по картам</div>';
      for (const c of sorted.slice(0, 8)) {
        html += '<div class="tm-vp-card-row">';
        html += '<span class="tm-vp-card-name">' + escHtml(ruName(c.cardName)) + '</span>';
        html += '<span class="tm-vp-card-val">' + (c.victoryPoint > 0 ? '+' : '') + c.victoryPoint + '</span>';
        html += '</div>';
      }
      if (sorted.length > 8) {
        html += '<div class="tm-pool-more">+' + (sorted.length - 8) + ' ещё</div>';
      }
    } else {
      const allVPCards = [...cardVPDetails, ...resourceVPDetails].sort((a, b) => b.vp - a.vp);
      if (allVPCards.length > 0) {
        html += '<div class="tm-vp-section">VP по картам</div>';
        for (const c of allVPCards.slice(0, 8)) {
          html += '<div class="tm-vp-card-row">';
          html += '<span class="tm-vp-card-name">' + escHtml(ruName(c.name)) + '</span>';
          html += '<span class="tm-vp-card-val">+' + c.vp + (c.res ? ' (' + c.res + ' рес.)' : '') + '</span>';
          html += '</div>';
        }
        if (allVPCards.length > 8) {
          html += '<div class="tm-pool-more">+' + (allVPCards.length - 8) + ' ещё</div>';
        }
      }
    }

    // Award VP details
    if (awardDetails.length > 0) {
      html += '<div class="tm-vp-section">Награды</div>';
      for (const ad of awardDetails) {
        const color = ad.vp >= 5 ? '#4caf50' : ad.vp > 0 ? '#f1c40f' : '#666';
        html += '<div class="tm-vp-row">';
        html += '<span class="tm-vp-label">' + escHtml(ad.name) + ' <span style="color:' + ad.leader + '">(' + ad.leaderScore + ')</span> мой:' + ad.myScore + '</span>';
        html += '<span class="tm-vp-val" style="color:' + color + '">' + (ad.vp > 0 ? '+' + ad.vp : '0') + '</span>';
        html += '</div>';
      }
    }

    // ── Milestone & Award Tracker ──
    if (pv.game) {
      const milestones = pv.game.milestones || [];
      const awards = pv.game.awards || [];
      const myColor2 = pv.thisPlayer.color;
      const claimedCount = milestones.filter(function(ms) { return ms.playerName || ms.player || ms.playerColor || ms.color; }).length;

      // Milestones tracker
      if (milestones.length > 0) {
        let msHtml = '';
        for (const ms of milestones) {
          const msName = ms.name || '';
          const isClaimed = !!(ms.playerName || ms.player || ms.playerColor || ms.color);
          const claimerColor = ms.playerColor || ms.player || ms.color || '';
          const claimerName = ms.playerName || claimerColor;
          const isMyMilestone = claimerColor === myColor2;
          const maEntry = MA_DATA[msName];

          if (isClaimed) {
            if (isMyMilestone) {
              msHtml += '<div class="tm-ma-row tm-ma-claimed-mine"><span>✅ ' + escHtml(msName) + '</span><span style="color:#4caf50">+5 VP</span></div>';
            } else {
              msHtml += '<div class="tm-ma-row tm-ma-claimed"><span>⬜ <s>' + escHtml(msName) + '</s></span><span style="color:' + claimerColor + '">' + escHtml(claimerName) + '</span></div>';
            }
          } else if (claimedCount < 3) {
            // Get score from game data (ms.scores) or compute ourselves
            let current = 0;
            let isClaimable = false;
            if (ms.scores) {
              const myMs = ms.scores.find(function(s) { return s.color === myColor2; });
              if (myMs) {
                current = myMs.playerScore || 0;
                isClaimable = !!myMs.claimable;
              }
            } else if (maEntry) {
              current = computeMAValue(maEntry, pv);
            }
            const target = maEntry ? (maEntry.target || (maEntry.check === 'generalist' ? 6 : maEntry.check === 'manager' ? 4 : 0)) : 0;

            if (target > 0) {
              const pctVal = current / target;
              const diff = target - current;
              let icon, cls;
              if (isClaimable || current >= target) { icon = '🟢'; cls = ' tm-ma-claimable'; }
              else if (pctVal >= 0.6 || diff <= 2) { icon = '🟡'; cls = ' tm-ma-close'; }
              else { icon = '⚪'; cls = ''; }
              const barPct = Math.min(100, Math.round(pctVal * 100));
              msHtml += '<div class="tm-ma-row' + cls + '">';
              msHtml += '<span>' + icon + ' ' + escHtml(msName) + '</span>';
              msHtml += '<span class="tm-ma-progress">' + current + '/' + target;
              if (isClaimable || diff <= 0) msHtml += ' <span class="tm-ma-hint">← забирай!</span>';
              else if (diff === 1) msHtml += ' <span class="tm-ma-hint">← 1!</span>';
              else if (diff === 2) msHtml += ' <span class="tm-ma-hint">← 2</span>';
              msHtml += '</span></div>';
              msHtml += '<div class="tm-ma-bar-wrap"><div class="tm-ma-bar' + cls + '" style="width:' + barPct + '%"></div></div>';
            } else {
              // Unknown target — just show current score
              msHtml += '<div class="tm-ma-row"><span>⚪ ' + escHtml(msName) + '</span>';
              msHtml += '<span class="tm-ma-progress">' + current + '</span></div>';
            }
          }
        }
        if (msHtml) {
          html += '<div class="tm-vp-section">🏅 Вехи' + (claimedCount >= 3 ? ' (все заняты)' : '') + '</div>';
          html += msHtml;
        }
      }

      // Awards tracker — funded awards with competitive position
      {
        let awHtml = '';
        for (const aw of awards) {
          const isFunded = !!(aw.playerName || aw.player || aw.color);
          if (!isFunded) continue;
          if (!aw.scores || aw.scores.length === 0) continue;
          const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
          const myEntry = sorted.find(function(s) { return s.color === myColor2; });
          if (!myEntry) continue;
          const myScore = myEntry.score;
          const bestOpp = sorted.find(function(s) { return s.color !== myColor2; });
          const bestOppScore = bestOpp ? bestOpp.score : 0;
          const myRank = sorted.findIndex(function(s) { return s.color === myColor2; });
          let vpGain = 0;
          if (myRank === 0) vpGain = 5;
          else if (myRank === 1) vpGain = 2;
          if (myRank > 0 && sorted[0].score === myScore) vpGain = 5;
          if (myRank > 1 && sorted[1] && sorted[1].score === myScore) vpGain = 2;
          const icon = vpGain >= 5 ? '🥇' : vpGain >= 2 ? '🥈' : '⬜';
          const diff = myScore - bestOppScore;
          const diffStr = diff > 0 ? '+' + diff : diff === 0 ? '=' : '' + diff;
          const diffColor = diff > 0 ? '#4caf50' : diff < 0 ? '#f44336' : '#aaa';
          awHtml += '<div class="tm-ma-row">';
          awHtml += '<span>' + icon + ' ' + escHtml(aw.name) + '</span>';
          awHtml += '<span style="font-size:11px">' + myScore + ' vs ' + bestOppScore + ' <span style="color:' + diffColor + '">(' + diffStr + ')</span></span>';
          awHtml += '</div>';
        }
        if (awHtml) {
          html += '<div class="tm-vp-section">🏆 Трекер наград</div>';
          html += awHtml;
        }
      }
    }

    // VP delta vs opponents
    if (pv.game && pv.game.players) {
      const myColor = pv.thisPlayer.color;
      const opponents = pv.game.players.filter(function(pl) { return pl.color !== myColor; });
      if (opponents.length > 0) {
        html += '<div class="tm-vp-section">Дельта VP</div>';
        for (const opp of opponents) {
          const oppTR = opp.terraformRating || 0;
          let oppGreen = 0;
          if (pv.game.spaces) {
            for (const sp of pv.game.spaces) {
              if (sp.color === opp.color && (sp.tileType === 'greenery' || sp.tileType === 1)) oppGreen++;
            }
          }
          const oppEst = oppTR + oppGreen;
          const delta = total - oppEst;
          const sign = delta > 0 ? '+' : '';
          const color = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#aaa';
          html += '<div class="tm-vp-row">';
          html += '<span class="tm-vp-label" style="color:' + opp.color + '">' + (opp.name || opp.color) + ' (~' + oppEst + ')</span>';
          html += '<span class="tm-vp-val" style="color:' + color + ';font-weight:bold">' + sign + delta + '</span>';
          html += '</div>';
        }
      }
    }

    // Score projection — estimate final VP
    {
      const gen = detectGeneration();
      if (gen >= 3 && pv.game) {
        let gTemp = pv.game.temperature; let gOxy = pv.game.oxygenLevel; let gOce = pv.game.oceans;
        let raises = 0, target = 0;
        if (typeof gTemp === 'number') { raises += (gTemp + 30) / 2; target += 19; }
        if (typeof gOxy === 'number') { raises += gOxy; target += 14; }
        if (typeof gOce === 'number') { raises += gOce; target += 9; }
        const prog = target > 0 ? raises / target : 0;
        const estGensLeft = prog > 0 ? Math.max(1, Math.ceil((1 - prog) * gen / prog)) : 3;
        const myP = pv.thisPlayer;
        if (myP) {
          // Future TR growth (assume ~1-2 TR/gen from cards)
          const futureTR = Math.round(estGensLeft * 1.5);
          // Future greeneries from plants
          const plantsPerGen = myP.plantProduction || 0;
          const totalFuturePlants = (myP.plants || 0) + plantsPerGen * estGensLeft;
          const futureGreeneries = Math.floor(totalFuturePlants / (myP.plantsNeededForGreenery || 8));
          // Future animal/microbe VP growth
          let futureResVP = 0;
          if (myP.tableau) {
            for (var ci2 = 0; ci2 < myP.tableau.length; ci2++) {
              var card = myP.tableau[ci2];
              if (!card.resources || card.resources <= 0) continue;
              var cn2 = card.name || card;
              var d2 = TM_RATINGS[cn2];
              if (!d2) continue;
              var ec = (d2.e || '').toLowerCase();
              if (ec.includes('vp per') || ec.includes('vp/')) {
                var vpRate = ec.includes('1/3') ? 1/3 : ec.includes('1/2') ? 0.5 : 1;
                // Estimate future resource accumulation (~1 per gen for active cards)
                var hasAction = ec.includes('action');
                var futureRes = hasAction ? estGensLeft : 0;
                futureResVP += Math.floor((card.resources + futureRes) * vpRate) - Math.floor(card.resources * vpRate);
              }
            }
          }
          // Future heat→TR conversions
          var futureHeatTR = 0;
          if (pv.game && typeof pv.game.temperature === 'number' && pv.game.temperature < 8) {
            var heatPerGen = (myP.heatProduction || 0) + (myP.energyProduction || 0);
            var totalHeat = (myP.heat || 0) + heatPerGen * estGensLeft;
            futureHeatTR = Math.min(Math.floor(totalHeat / 8), Math.ceil((8 - pv.game.temperature) / 2));
          }
          // Projected total
          const projectedTotal = total + futureTR + futureGreeneries + futureResVP + futureHeatTR;
          // MC per VP efficiency
          if (myP.tableau && total > 20) {
            let estMCSpent = 0;
            for (const card of myP.tableau) {
              const cn = card.name || card;
              const d = TM_RATINGS[cn];
              if (d && typeof d.s === 'number') {
                // Estimate card cost from DOM or ratings — rough: cards average ~15 MC + 3 draft
                const costEl = document.querySelector('.card-container[data-tm-card="' + cn + '"] .card-number');
                const cardCost = costEl ? parseInt(costEl.textContent) : 15;
                estMCSpent += (isNaN(cardCost) ? 15 : cardCost) + 3;
              }
            }
            const vpGained = total - 20; // VP above starting TR
            if (vpGained > 0 && estMCSpent > 0) {
              const mcPerVP = (estMCSpent / vpGained).toFixed(1);
              const effColor = mcPerVP <= 7 ? '#2ecc71' : mcPerVP <= 10 ? '#f1c40f' : '#e74c3c';
              html += '<div class="tm-vp-section">Эффективность</div>';
              html += '<div style="font-size:11px;padding:2px 4px">';
              html += 'Потрачено ~' + estMCSpent + ' MC → +' + vpGained + ' VP = ';
              html += '<span style="color:' + effColor + ';font-weight:bold">' + mcPerVP + ' MC/VP</span>';
              html += '</div>';
            }
          }
          html += '<div class="tm-vp-section">Прогноз финала</div>';
          html += '<div style="font-size:12px;padding:2px 4px">';
          html += 'Текущие: <b>' + total + ' VP</b> | ';
          html += 'Прогноз: <b style="color:#2ecc71">~' + projectedTotal + ' VP</b>';
          html += '</div>';
          html += '<div style="font-size:10px;color:#888;padding:1px 4px">';
          var projParts = ['+' + futureTR + ' TR'];
          if (futureGreeneries > 0) projParts.push('+' + futureGreeneries + ' озел.');
          if (futureResVP > 0) projParts.push('+' + futureResVP + ' рес.VP');
          if (futureHeatTR > 0) projParts.push('+' + futureHeatTR + ' тепло→TR');
          html += projParts.join(' ') + ' (~' + estGensLeft + ' пок.)';
          html += '</div>';

          // Winning condition — what you need to win
          if (pv.players) {
            let maxOppEst = 0;
            for (const opp of pv.players) {
              if (opp.color === pv.thisPlayer.color) continue;
              const oppTR = opp.terraformRating || 0;
              let oppGreen = 0;
              if (pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === opp.color && (sp.tileType === 'greenery' || sp.tileType === 1)) oppGreen++;
                }
              }
              const oppEst = oppTR + oppGreen + Math.round(estGensLeft * 1.5);
              if (oppEst > maxOppEst) maxOppEst = oppEst;
            }
            const vpNeeded = Math.max(0, maxOppEst - projectedTotal + 1);
            if (vpNeeded > 0) {
              const vpPerGen = estGensLeft > 0 ? (vpNeeded / estGensLeft).toFixed(1) : vpNeeded;
              html += '<div style="font-size:11px;color:#e74c3c;padding:2px 4px;margin-top:2px;border:1px solid rgba(231,76,60,0.3);border-radius:4px">';
              html += '🎯 Для победы: +' + vpNeeded + ' VP (' + vpPerGen + '/пок.)';
              html += '</div>';
            } else {
              html += '<div style="font-size:11px;color:#2ecc71;padding:2px 4px;margin-top:2px">✓ На пути к победе!</div>';
            }
          }
        }
      }
    }

    // End-game VP optimization tips
    {
      const gen = detectGeneration();
      // Calculate progress from Vue game data
      let vpProgress = 0;
      if (pv.game) {
        let raises = 0, target = 0;
        const gTemp = pv.game.temperature; const gOxy = pv.game.oxygenLevel; const gOce = pv.game.oceans;
        if (typeof gTemp === 'number') { raises += (gTemp + 30) / 2; target += 19; }
        if (typeof gOxy === 'number') { raises += gOxy; target += 14; }
        if (typeof gOce === 'number') { raises += gOce; target += 9; }
        if (target > 0) vpProgress = Math.round(raises / target * 100);
      }
      if (gen >= 6 || vpProgress >= 60) {
        const tips = [];
        const myP = pv.thisPlayer;
        if (myP) {
          const myPlants = myP.plants || 0;
          const plantsNeeded = myP.plantsNeededForGreenery || 8;
          if (myPlants >= plantsNeeded) {
            tips.push('🌿 Конвертируй ' + plantsNeeded + ' растений → озеленение (+1 VP)');
          } else if (myPlants >= plantsNeeded - 3 && myP.plantProduction >= 2) {
            tips.push('🌿 Через 1 пок. хватит на озеленение (' + myPlants + '/' + plantsNeeded + ')');
          }
          const myHeat = myP.heat || 0;
          if (myHeat >= 8) {
            tips.push('🔥 Конвертируй тепло → +1°C (+1 TR)');
          }
          // Check available standard projects for VP
          const myMC = myP.megaCredits || 0;
          const mySt = myP.steel || 0;
          const stVal = myP.steelValue || 2;
          if (myMC + mySt * stVal >= 23) tips.push('💰 Хватает на озеленение (23 MC)');
          if (myMC >= 18 && pv.game) {
            const oce = pv.game.oceans != null ? pv.game.oceans : 0;
            if (oce < 9) tips.push('🌊 Можно купить океан (18 MC → +1 TR)');
          }
          // Unused blue card actions
          let unusedActions = 0;
          if (myP.tableau) {
            for (const card of myP.tableau) {
              if (card.isDisabled === false && (card.action || card.actions)) unusedActions++;
            }
          }
          if (unusedActions > 0) tips.push('🎯 ' + unusedActions + ' неиспользованных action-карт');
          // Endgame conversion order advice
          if (vpProgress >= 80 || gen >= 8) {
            var canGreen = myP.plants >= (myP.plantsNeededForGreenery || 8);
            var canHeat = (myP.heat || 0) >= 8;
            var oxyNotMax = pv.game && typeof pv.game.oxygenLevel === 'number' && pv.game.oxygenLevel < 14;
            var tempNotMax = pv.game && typeof pv.game.temperature === 'number' && pv.game.temperature < 8;
            if (canGreen && canHeat && oxyNotMax && tempNotMax) {
              tips.push('⚡ Порядок: озеленение ПЕРЕД теплом! (O₂ бонус → доп. TR)');
            } else if (canGreen && canHeat) {
              tips.push('⚡ Конвертируй: сначала растения, потом тепло');
            }
          }
        }
        // Milestone proximity tips
        if (pv.game && pv.game.milestones) {
          var msClaimed = 0;
          for (var msi = 0; msi < pv.game.milestones.length; msi++) {
            var msT = pv.game.milestones[msi];
            if (msT.playerName || msT.player || msT.playerColor || msT.color) msClaimed++;
          }
          if (msClaimed >= 3) {
            tips.push('⚠️ 3 вехи заняты — вехи закрыты');
          } else {
            var myColorT = pv.thisPlayer.color;
            for (var msi = 0; msi < pv.game.milestones.length; msi++) {
              var msT = pv.game.milestones[msi];
              if (msT.playerName || msT.player || msT.playerColor || msT.color) continue;
              if (!msT.scores) continue;
              var myMsT = null;
              for (var sci = 0; sci < msT.scores.length; sci++) {
                if (msT.scores[sci].color === myColorT) { myMsT = msT.scores[sci]; break; }
              }
              if (!myMsT) continue;
              var msEntry = MA_DATA[msT.name];
              var msTarget = msEntry ? (msEntry.target || (msEntry.check === 'generalist' ? 6 : msEntry.check === 'manager' ? 4 : 0)) : 0;
              if (myMsT.claimable) {
                tips.push('🏅 Можешь забрать ' + msT.name + ' прямо сейчас! (8 MC)');
              } else if (msTarget > 0 && msTarget - (myMsT.playerScore || 0) === 1) {
                var hint = msEntry.tag ? (msEntry.tag + ' тег') : (msEntry.desc || '1 шаг');
                tips.push('🏅 1 ' + hint + ' до ' + msT.name + '!');
              }
            }
          }
        }
        // Inject SP highlights from rateStandardProjects()
        if (_spHighlights && _spHighlights.length > 0) {
          for (var shi = 0; shi < _spHighlights.length; shi++) {
            tips.push(_spHighlights[shi]);
          }
        }
        if (tips.length > 0) {
          html += '<div class="tm-vp-section">Советы VP</div>';
          for (const tip of tips) {
            html += '<div class="tm-vp-tip">' + tip + '</div>';
          }
        }
      }
    }

    // TR history
    html += getTRHistoryHTML();

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'vp');
    panel.style.display = 'block';
  }

  // ── Best Card in Hand ──

  function updateBestHandCard() {
    document.querySelectorAll('.tm-best-hand').forEach(function(el) { el.classList.remove('tm-best-hand'); });
    if (!enabled) return;

    const handCards = document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]');
    let best = null;
    let bestScore = -1;

    for (const el of handCards) {
      const name = el.getAttribute('data-tm-card');
      const data = name ? TM_RATINGS[name] : null;
      if (data && data.s > bestScore) {
        bestScore = data.s;
        best = el;
      }
    }

    if (best && bestScore >= 60) {
      best.classList.add('tm-best-hand');
    }
  }

  // ── TR History Tracker ──

  const trHistory = []; // [{gen, tr}]
  let lastTRHistoryGen = 0;

  function trackTRHistory() {
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    const gen = detectGeneration();
    if (gen <= 0) return;
    const tr = pv.thisPlayer.terraformRating || 20;
    if (gen !== lastTRHistoryGen) {
      // New generation — record TR at start
      const existing = trHistory.find(function(h) { return h.gen === gen; });
      if (!existing) {
        trHistory.push({ gen: gen, tr: tr });
        if (trHistory.length > 20) trHistory.shift();
      }
      lastTRHistoryGen = gen;
    } else if (trHistory.length > 0) {
      // Same gen — update current entry to latest TR
      trHistory[trHistory.length - 1].tr = tr;
    }
  }

  function getTRHistoryHTML() {
    if (trHistory.length < 2) return '';
    let html = '<div class="tm-vp-section">TR по поколениям</div>';
    html += '<div class="tm-tr-history">';
    for (let i = 0; i < trHistory.length; i++) {
      const h = trHistory[i];
      const delta = i > 0 ? h.tr - trHistory[i - 1].tr : 0;
      const deltaStr = i > 0 ? (delta >= 0 ? '+' + delta : '' + delta) : '—';
      const deltaColor = delta > 0 ? '#2ecc71' : delta < 0 ? '#e74c3c' : '#888';
      html += '<span class="tm-tr-h-item">';
      html += '<span style="color:#888">П' + h.gen + ':</span> ';
      html += '<span style="color:#f1c40f">' + h.tr + '</span>';
      if (i > 0) html += ' <span style="color:' + deltaColor + ';font-size:10px">(' + deltaStr + ')</span>';
      html += '</span>';
    }
    // Average TR gain
    if (trHistory.length >= 2) {
      const totalGain = trHistory[trHistory.length - 1].tr - trHistory[0].tr;
      const gens = trHistory.length - 1;
      const avg = (totalGain / gens).toFixed(1);
      html += '<div style="margin-top:3px;font-size:10px;color:#aaa">Средний рост: +' + avg + ' TR/пок.</div>';
    }
    html += '</div>';
    return html;
  }

  // ── Playable Card Highlight ──

  let playableVisible = false;

  function getCardTags(cardEl) {
    const tags = new Set();
    cardEl.querySelectorAll('[class*="tag-"]').forEach((el) => {
      for (const cls of el.classList) {
        if (cls.startsWith('tag-') && cls !== 'tag-count') {
          tags.add(cls.replace('tag-', ''));
        }
      }
    });
    return tags;
  }

  function getCardCost(cardEl) {
    const costEl = cardEl.querySelector('.card-number');
    if (costEl) {
      const num = parseInt(costEl.textContent);
      if (!isNaN(num)) return num;
    }
    return null;
  }

  function detectHelion(pv) {
    if (pv.thisPlayer.tableau) {
      for (const card of pv.thisPlayer.tableau) {
        if ((card.name || '').toLowerCase() === 'helion') return true;
      }
    }
    return false;
  }

  let playableCountEl = null;

  function updatePlayableHighlight() {
    // Remove old classes
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });

    // Remove counter if hidden
    if (!playableVisible || !enabled) {
      if (playableCountEl) { playableCountEl.style.display = 'none'; }
      return;
    }

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    const p = pv.thisPlayer;
    const mc = p.megaCredits || 0;
    const steel = p.steel || 0;
    const steelVal = p.steelValue || 2;
    const ti = p.titanium || 0;
    const tiVal = p.titaniumValue || 3;
    const heat = p.heat || 0;

    // Detect Helion
    const isHelion = detectHelion(pv);
    const heatMC = isHelion ? heat : 0;

    const handCards = document.querySelectorAll('.player_home_block--hand .card-container');
    let playable = 0;
    let total = 0;
    let typeGreen = 0, typeBlue = 0, typeRed = 0;

    for (const cardEl of handCards) {
      const cost = getCardCost(cardEl);
      if (cost === null) continue;
      total++;

      // Detect card type from CSS class
      if (cardEl.querySelector('.card-content-wrapper--automated, .project-card--automated') || cardEl.classList.contains('card--automated')) typeGreen++;
      else if (cardEl.querySelector('.card-content-wrapper--active, .project-card--active') || cardEl.classList.contains('card--active')) typeBlue++;
      else if (cardEl.querySelector('.card-content-wrapper--event, .project-card--event') || cardEl.classList.contains('card--event')) typeRed++;

      const tags = getCardTags(cardEl);
      const hasBuilding = tags.has('building');
      const hasSpace = tags.has('space');

      let buyingPower = mc + heatMC;
      if (hasBuilding) buyingPower += steel * steelVal;
      if (hasSpace) buyingPower += ti * tiVal;

      if (buyingPower >= cost) {
        cardEl.classList.add('tm-playable');
        playable++;
      } else {
        cardEl.classList.add('tm-unplayable');
      }
    }

    // Show playable count badge
    if (!playableCountEl) {
      playableCountEl = document.createElement('div');
      playableCountEl.className = 'tm-playable-count';
      document.body.appendChild(playableCountEl);
    }
    const pct = total > 0 ? Math.round(playable / total * 100) : 0;
    const color = playable === 0 ? '#e74c3c' : playable <= 2 ? '#f39c12' : '#2ecc71';
    playableCountEl.style.display = 'block';
    playableCountEl.style.borderColor = color;
    let badgeHTML = '<span style="color:' + color + ';font-weight:bold">' + playable + '</span>/' + total + ' играбельных <span style="opacity:0.6">(' + pct + '%)</span>';
    if (total > 0) {
      badgeHTML += '<div style="font-size:10px;margin-top:1px;opacity:0.7">';
      if (typeGreen > 0) badgeHTML += '<span style="color:#4caf50">' + typeGreen + '⚙</span> ';
      if (typeBlue > 0) badgeHTML += '<span style="color:#2196f3">' + typeBlue + '↻</span> ';
      if (typeRed > 0) badgeHTML += '<span style="color:#f44336">' + typeRed + '⚡</span>';
      badgeHTML += '</div>';
    }
    // Hand value score
    const handNames = getMyHandNames();
    if (handNames.length > 0) {
      let totalScore = 0;
      let rated = 0;
      for (const hn of handNames) {
        const d = TM_RATINGS[hn];
        if (d) { totalScore += d.s; rated++; }
      }
      if (rated > 0) {
        const avg = (totalScore / rated).toFixed(0);
        const avgColor = avg >= 75 ? '#2ecc71' : avg >= 60 ? '#f1c40f' : '#e74c3c';
        badgeHTML += '<div style="font-size:10px;opacity:0.7">Рейтинг руки: <span style="color:' + avgColor + '">' + avg + '</span></div>';
      }
    }
    playableCountEl.innerHTML = badgeHTML;
  }

  // ── Turmoil Tracker ──

  let turmoilEl = null;
  let turmoilVisible = false;

  const PARTY_COLORS = {
    'mars first': '#c0392b',
    'scientists': '#ecf0f1',
    'unity': '#e91e63',
    'greens': '#27ae60',
    'reds': '#e74c3c',
    'kelvinists': '#8e44ad',
  };

  const PARTY_NAMES_RU = {
    'mars first': 'Марс прежде всего',
    'scientists': 'Учёные',
    'unity': 'Единство',
    'greens': 'Зелёные',
    'reds': 'Красные',
    'kelvinists': 'Кельвинисты',
  };

  function partyNameRu(name) {
    if (!name) return '?';
    return PARTY_NAMES_RU[name.toLowerCase()] || name;
  }

  function partyColor(name) {
    if (!name) return '#888';
    return PARTY_COLORS[name.toLowerCase()] || '#888';
  }

  function buildTurmoilPanel() {
    if (turmoilEl) return turmoilEl;
    turmoilEl = document.createElement('div');
    turmoilEl.className = 'tm-turmoil-panel';
    document.body.appendChild(turmoilEl);
    return turmoilEl;
  }

  // Global event impact data (name → description of effect for quick lookup)
  const GLOBAL_EVENT_EFFECTS = {
    // Positive events
    'Spin-Off Products': { desc: '+2 MC за Science тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'science')) * 2; } },
    'Diversity': { desc: '9+ тегов (с влиянием) → +10 MC', calc: function(p) { return uniqueTagCount(p) >= 9 ? 10 : 0; } },
    'Asteroid Mining': { desc: '+1 Ti за Jovian тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'jovian')) * 3; } },
    'Sponsored Projects': { desc: '+1 ресурс на карты с ресурсами. +1 карта за влияние', calc: function() { return 3.5; } },
    'Interplanetary Trade': { desc: '+2 MC за Space тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'space')) * 2; } },
    'Celebrity Leaders': { desc: '+2 MC за Event (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'event')) * 2; } },
    'Homeworld Support': { desc: '+2 MC за Earth тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'earth')) * 2; } },
    'Productivity': { desc: '+1 Steel за Steel-prod (макс 5) + влияние', calc: function(p) { return Math.min(5, (p.steelProduction || 0)) * 2; } },
    'Strong Society': { desc: '+2 MC за City тайл (макс 5) + влияние', calc: null },
    'Successful Organisms': { desc: '+1 Plant за Plant-prod (макс 5) + влияние', calc: function(p) { return Math.min(5, (p.plantProduction || 0)) * 2.5; } },
    'Venus Infrastructure': { desc: '+2 MC за Venus тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'venus')) * 2; } },
    'Scientific Community': { desc: '+1 MC за карту в руке (без лимита) + влияние', calc: null },
    'Generous Funding': { desc: '+2 MC за каждые 5 TR > 15 (макс 5) + влияние', calc: function(p) { return Math.min(5, Math.floor(((p.terraformRating || 0) - 15) / 5)) * 2; } },
    'Improved Energy Templates': { desc: '+1 Energy-prod за 2 Power тега + влияние', calc: function(p) { return Math.floor(countTag(p, 'power') / 2) * 7; } },
    'Jovian Tax Rights': { desc: '+1 MC-prod за колонию. +1 Ti за влияние', calc: function(p) { return (p.coloniesCount || 0) * 5; } },
    'Election': { desc: '1-й по очкам → +2 TR, 2-й → +1 TR', calc: null },
    // Negative events
    'Pandemic': { desc: '−3 MC за Building тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'building')) * 3; } },
    'Eco Sabotage': { desc: 'Потерять все растения кроме 3 + влияние', calc: function(p) { return -Math.max(0, (p.plants || 0) - 3) * 2.5; } },
    'Mud Slides': { desc: '−2 MC за City тайл (макс 5), −влияние', calc: null },
    'Snow Cover': { desc: '−2°C. +1 карта за влияние', calc: function() { return -7; } },
    'Solar Flare': { desc: '−3 MC за Space тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'space')) * 3; } },
    'War on Earth': { desc: '−4 TR. Влияние уменьшает потерю', calc: function() { return -28; } },
    'Revolution': { desc: '1-й по очкам → −2 TR, 2-й → −1 TR', calc: null },
    'Global Dust Storm': { desc: 'Потерять всё тепло. −2 MC за Building (макс 5), −влияние', calc: function(p) { return -(p.heat || 0) - Math.min(5, countTag(p, 'building')) * 2; } },
    'Red Influence': { desc: '−3 MC за 5 TR > 10 (макс 5). +1 MC-prod за влияние', calc: function(p) { return -Math.min(5, Math.floor(((p.terraformRating || 0) - 10) / 5)) * 3; } },
    'Miners On Strike': { desc: '−1 Ti за Jovian тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'jovian')) * 3; } },
    'Riots': { desc: '−4 MC за City тайл (макс 5), −влияние', calc: null },
    'Sabotage': { desc: '−1 Steel-prod, −1 Energy-prod. +1 Steel за влияние', calc: function() { return -10; } },
    'Solarnet Shutdown': { desc: '−3 MC за Blue карту (макс 5), −влияние', calc: null },
    'Microgravity Health Problems': { desc: '−1 MC за Space тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'space')); } },
    'Corrosive Rain': { desc: '−2 Floater или −10 MC. +1 карта за влияние', calc: function() { return -6; } },
    'Volcanic Eruptions': { desc: '+1 Plant-prod за Plant тег', calc: function(p) { return countTag(p, 'plant') * 8; } },
    'Paradigm Breakdown': { desc: '−1 MC за Science тег, −влияние', calc: function(p) { return -countTag(p, 'science'); } },
  };

  function countTag(player, tag) {
    if (!player || !player.tags) return 0;
    const t = player.tags.find(function(x) { return (x.tag || '').toLowerCase() === tag; });
    return t ? (t.count || 0) : 0;
  }

  function uniqueTagCount(player) {
    if (!player || !player.tags) return 0;
    return player.tags.filter(function(t) { return t.count > 0; }).length;
  }

  const PARTY_POLICIES = {
    'Mars First':    { ru: 'Марс Первый', effect: 'Стал-карты −2 MC', bonus: '+1 MC за каждый тег Building' },
    'Scientists':    { ru: 'Учёные', effect: '−1 MC за тег Science при розыгрыше', bonus: '+1 MC за каждый тег Science' },
    'Unity':         { ru: 'Единство', effect: 'Титан-карты −2 MC', bonus: '+1 MC за каждый тег Venus/Earth/Jovian' },
    'Greens':        { ru: 'Зелёные', effect: '+4 MC за озеленение', bonus: '+1 MC за каждый тег Plant/Microbe/Animal' },
    'Reds':          { ru: 'Красные', effect: '+3 MC за шаг TR', bonus: '−1 TR если TR > ср.' },
    'Kelvinists':    { ru: 'Кельвинисты', effect: '6 MC = +1°C', bonus: '+1 MC за каждые 2 Heat-prod' },
  };

  function updateTurmoilTracker() {
    if (!turmoilVisible || !enabled) {
      if (turmoilEl) turmoilEl.style.display = 'none';
      return;
    }

    const panel = buildTurmoilPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.game.turmoil) {
      panel.innerHTML = '<div class="tm-turm-title">Турмоил</div>' +
        '<div class="tm-pool-more">Турмоил не включён</div>' +
        '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
      panel.style.display = 'block';
      return;
    }

    const t = pv.game.turmoil;
    const myColor = pv.thisPlayer.color;

    let html = '<div class="tm-turm-title">' + minBtn('turmoil') + 'Турмоил</div>';

    // Ruling party
    const ruling = t.ruling || t.rulingParty;
    if (ruling) {
      const rColor = partyColor(ruling);
      const isReds = ruling.toLowerCase() === 'reds';
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Правящая:</span>';
      html += '<span class="tm-turm-party" style="color:' + rColor + '">' + escHtml(partyNameRu(ruling)) + '</span>';
      html += '</div>';

      if (isReds) {
        html += '<div class="tm-turm-warn">+3 MC за каждый шаг TR</div>';
      }
      // Policy description
      const rPolicy = PARTY_POLICIES[ruling];
      if (rPolicy) {
        html += '<div style="font-size:11px;color:#888;padding:2px 0">' + rPolicy.effect + '</div>';
      }
    }

    // Dominant party
    const dominant = t.dominant || t.dominantParty;
    if (dominant) {
      const dColor = partyColor(dominant);
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Доминир.:</span>';
      html += '<span class="tm-turm-party" style="color:' + dColor + '">' + escHtml(partyNameRu(dominant)) + '</span>';
      html += '</div>';
    }

    // Chairman
    if (t.chairman) {
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Председат.:</span>';
      html += '<span class="tm-turm-val">' + escHtml(t.chairman) + '</span>';
      html += '</div>';
    }

    // Global events
    const events = [];
    if (t.distant) events.push({ label: 'Далёкое', data: t.distant });
    if (t.coming) events.push({ label: 'Ближайшее', data: t.coming });
    if (t.current) events.push({ label: 'Текущее', data: t.current });

    if (events.length > 0) {
      html += '<div class="tm-turm-section">Глобальные события</div>';
      for (const ev of events) {
        const evName = typeof ev.data === 'string' ? ev.data : (ev.data.name || ev.data.id || '?');
        const evEffect = GLOBAL_EVENT_EFFECTS[evName];
        html += '<div class="tm-turm-event">';
        html += '<span class="tm-turm-ev-label">' + ev.label + ':</span> ';
        html += '<span class="tm-turm-ev-name">' + escHtml(evName) + '</span>';
        if (evEffect) {
          html += '<div style="font-size:10px;color:#aaa;padding-left:12px">' + evEffect.desc + '</div>';
          if (evEffect.calc && pv.thisPlayer) {
            const impact = evEffect.calc(pv.thisPlayer);
            const impColor = impact > 0 ? '#4caf50' : impact < 0 ? '#f44336' : '#888';
            html += '<div style="font-size:11px;padding-left:12px;color:' + impColor + ';font-weight:bold">Мне: ' + (impact > 0 ? '+' : '') + impact + ' MC</div>';
          }
        }
        html += '</div>';
      }
    }

    // Parties breakdown — delegates
    if (t.parties && t.parties.length > 0) {
      html += '<div class="tm-turm-section">Партии</div>';
      // Sort parties by delegate count desc
      const sortedParties = [...t.parties].sort((a, b) => {
        const aLen = (a.delegates || []).length;
        const bLen = (b.delegates || []).length;
        return bLen - aLen;
      });
      for (const party of sortedParties) {
        const pName = party.name || '?';
        const pColor = partyColor(pName);
        const dels = party.delegates || [];
        const total = dels.length;
        // Count my delegates
        let myDels = 0;
        for (const d of dels) {
          const dc = typeof d === 'string' ? d : (d.color || d);
          if (dc === myColor) myDels++;
        }
        const leader = party.partyLeader;
        const leaderText = leader ? (leader === myColor ? ' (лидер: я)' : '') : '';

        html += '<div class="tm-turm-party-row">';
        html += '<span class="tm-turm-party-dot" style="background:' + pColor + '"></span>';
        html += '<span class="tm-turm-party-name">' + escHtml(partyNameRu(pName)) + '</span>';
        html += '<span class="tm-turm-party-dels">' + total + ' дел.' +
          (myDels > 0 ? ' <b>(' + myDels + ' мои)</b>' : '') +
          leaderText + '</span>';
        html += '</div>';
      }
    }

    // Next gen prediction: dominant becomes ruling
    if (dominant && dominant !== ruling) {
      const nextPolicy = PARTY_POLICIES[dominant];
      if (nextPolicy) {
        html += '<div class="tm-turm-section">Прогноз сл. пок.</div>';
        html += '<div style="font-size:12px;color:#ccc;padding:2px 0">';
        html += '<span style="color:' + partyColor(dominant) + ';font-weight:bold">' + escHtml(partyNameRu(dominant)) + '</span> → правящая';
        html += '</div>';
        html += '<div style="font-size:11px;color:#f1c40f;padding:1px 0">' + nextPolicy.effect + '</div>';
        html += '<div style="font-size:11px;color:#888;padding:1px 0">' + nextPolicy.bonus + '</div>';
      }
    }

    // My delegates in lobby/reserve + influence
    {
      const lobbyDels = ((t.lobby || []).filter((d) => {
        const dc = typeof d === 'string' ? d : (d.color || d);
        return dc === myColor;
      })).length;
      const reserveDels = ((t.reserve || []).filter((d) => {
        const dc = typeof d === 'string' ? d : (d.color || d);
        return dc === myColor;
      })).length;

      // Count total my delegates across all parties
      let totalMyDels = lobbyDels + reserveDels;
      let isChairman = (t.chairman === myColor);
      let partiesWithMyDels = 0;
      if (t.parties) {
        for (const party of t.parties) {
          let myInParty = 0;
          for (const d of (party.delegates || [])) {
            const dc = typeof d === 'string' ? d : (d.color || d);
            if (dc === myColor) myInParty++;
          }
          totalMyDels += myInParty;
          if (myInParty > 0) partiesWithMyDels++;
        }
      }

      // Influence = chairman(1) + party leader(1) + 1 per 2 non-leader dels in ruling party
      let influence = isChairman ? 1 : 0;
      if (ruling && t.parties) {
        const rulingParty = t.parties.find((p) => p.name === ruling);
        if (rulingParty) {
          if (rulingParty.partyLeader === myColor) influence++;
          let myInRuling = 0;
          for (const d of (rulingParty.delegates || [])) {
            const dc = typeof d === 'string' ? d : (d.color || d);
            if (dc === myColor) myInRuling++;
          }
          // Non-leader delegates count
          const nonLeader = rulingParty.partyLeader === myColor ? myInRuling - 1 : myInRuling;
          influence += Math.floor(nonLeader / 2);
        }
      }

      html += '<div class="tm-turm-section">Мои делегаты</div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Лобби:</span><span class="tm-turm-val">' + lobbyDels + '</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Резерв:</span><span class="tm-turm-val">' + reserveDels + '</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Всего:</span><span class="tm-turm-val">' + totalMyDels + ' (в ' + partiesWithMyDels + ' партиях)</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Влияние:</span><span class="tm-turm-val" style="color:#f1c40f;font-weight:bold">' + influence + '</span></div>';
      if (isChairman) {
        html += '<div style="font-size:11px;color:#f1c40f;padding:1px 0">Ты председатель (+1 влияние)</div>';
      }
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'turmoil');
    panel.style.display = 'block';
  }

  // ── Colony Advisor ──

  // MC conversion rates per resource unit
  const RES_MC_VALUE = { MC: 1, Steel: 2, Titanium: 3, Plant: 2.5, Heat: 0.8, Card: 3.5, Microbe: 2, Animal: 5, Floater: 3 };

  const COLONY_DATA = {
    'Callisto':    { res: 'MC',       track: [0,2,3,5,7,10,13], bonus: '3 MC-prod' },
    'Ceres':       { res: 'Steel',    track: [1,2,3,4,5,6,7], bonus: '2 steel-prod' },
    'Enceladus':   { res: 'Microbe',  track: [0,1,1,2,2,3,3], bonus: '3 microbes' },
    'Europa':      { res: 'MC',       track: [1,1,2,2,3,3,4], bonus: 'Place ocean' },
    'Ganymede':    { res: 'Plant',    track: [0,1,2,3,4,5,6], bonus: '1 plant-prod' },
    'Io':          { res: 'Heat',     track: [2,3,4,6,8,10,13], bonus: '2 heat-prod' },
    'Luna':        { res: 'MC',       track: [1,2,4,7,10,13,17], bonus: '2 MC-prod' },
    'Miranda':     { res: 'Animal',   track: [0,0,1,1,1,2,2], bonus: '1 animal' },
    'Pluto':       { res: 'Card',     track: [0,1,2,2,3,3,4], bonus: '2 cards' },
    'Titan':       { res: 'Floater',  track: [0,1,1,2,3,3,4], bonus: '3 floaters' },
    'Triton':      { res: 'Titanium', track: [0,1,1,2,3,4,5], bonus: '3 titanium' },
  };

  let colonyEl = null;
  let colonyVisible = false;

  function buildColonyPanel() {
    if (colonyEl) return colonyEl;
    colonyEl = document.createElement('div');
    colonyEl.className = 'tm-colony-panel';
    document.body.appendChild(colonyEl);
    return colonyEl;
  }

  function updateColonyPanel() {
    if (!colonyVisible || !enabled) {
      if (colonyEl) colonyEl.style.display = 'none';
      return;
    }

    const panel = buildColonyPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.game.colonies) {
      panel.innerHTML = '<div class="tm-turm-title">Колонии</div><div class="tm-pool-more">Колонии не активны</div>';
      panel.style.display = 'block';
      return;
    }

    const colonies = pv.game.colonies;
    const myColor = pv.thisPlayer ? pv.thisPlayer.color : null;

    let html = '<div class="tm-turm-title">' + minBtn('colony') + 'Колонии (' + colonies.length + ')</div>';

    // Trade fleet info
    if (pv.thisPlayer) {
      const fleet = pv.thisPlayer.fleetSize || 1;
      const used = pv.thisPlayer.tradesThisGeneration || 0;
      const left = Math.max(0, fleet - used);
      const tradeCost = 9 - fleet; // base 9 MC, discount = fleet size
      html += '<div class="tm-col-fleet">';
      html += 'Флот: ' + left + '/' + fleet;
      html += ' | Торговля: ' + tradeCost + ' MC / 3E / 3Ti';
      html += '</div>';
    }

    let bestTrade = null;
    let bestTradeVal = -1;

    for (const col of colonies) {
      const name = col.name || '?';
      const info = COLONY_DATA[name];
      const pos = col.trackPosition != null ? col.trackPosition : 0;
      const tradeVal = info ? (info.track[Math.min(pos, info.track.length - 1)] || 0) : pos;
      const mcRate = info ? (RES_MC_VALUE[info.res] || 1) : 1;
      const mcValue = Math.round(tradeVal * mcRate * 10) / 10;
      const slots = col.colonies || [];
      const mySlots = slots.filter(function(c) { return c.player === myColor || c === myColor; }).length;
      const isActive = col.isActive !== false;
      const visitor = col.visitor;

      if (isActive && mcValue > bestTradeVal && visitor == null) {
        bestTradeVal = mcValue;
        bestTrade = { name: name, val: tradeVal, res: info ? info.res : '?', mc: mcValue };
      }

      html += '<div class="tm-col-row' + (isActive ? '' : ' tm-col-inactive') + '">';
      html += '<div class="tm-col-header">';
      html += '<span class="tm-col-name">' + escHtml(name) + '</span>';
      html += '<span class="tm-col-track">' + (info ? info.res : '?') + ': ' + tradeVal + ' <span style="color:#f1c40f;font-size:11px">(~' + mcValue + ' MC)</span></span>';
      html += '</div>';

      // Track position bar
      if (info) {
        const maxPos = info.track.length - 1;
        const pct = maxPos > 0 ? Math.round((pos / maxPos) * 100) : 0;
        html += '<div class="tm-pool-bar" style="margin:2px 0;height:5px"><div class="tm-pool-fill" style="width:' + pct + '%"></div></div>';
      }

      // Colony slots
      html += '<div class="tm-col-slots">';
      for (let i = 0; i < 3; i++) {
        if (i < slots.length) {
          const slotColor = slots[i].player || slots[i];
          const isMine = slotColor === myColor;
          html += '<span class="tm-col-slot" style="background:' + slotColor + (isMine ? ';outline:1px solid #fff' : '') + '"></span>';
        } else {
          html += '<span class="tm-col-slot tm-col-slot-empty"></span>';
        }
      }
      html += '<span class="tm-col-slots-label">' + slots.length + '/3</span>';
      html += '</div>';

      // Visitor indicator
      if (visitor) {
        html += '<div style="font-size:11px;color:#888">Торговля: <span style="color:' + visitor + '">' + visitor + '</span></div>';
      }

      // My colony bonus
      if (mySlots > 0 && info) {
        html += '<div style="font-size:11px;color:#2ecc71">Бонус: ' + info.bonus + ' x' + mySlots + '</div>';
      }

      html += '</div>';
    }

    // Trade advisor — rank all tradeable colonies by net MC value
    {
      const fleet = pv.thisPlayer ? (pv.thisPlayer.fleetSize || 1) : 1;
      const tradeCost = 9 - fleet;
      const tradeOptions = [];
      for (const col of colonies) {
        if (col.isActive === false) continue;
        if (col.visitor != null) continue; // already traded
        const cName = col.name || '?';
        const info = COLONY_DATA[cName];
        if (!info) continue;
        const pos = col.trackPosition != null ? col.trackPosition : 0;
        const tradeVal = info.track[Math.min(pos, info.track.length - 1)] || 0;
        const mcRate = RES_MC_VALUE[info.res] || 1;
        const mcGross = tradeVal * mcRate;
        // Add colony bonus value for my colonies
        const mySlots = (col.colonies || []).filter(function(c) { return c.player === myColor || c === myColor; }).length;
        const bonusMC = mySlots * (mcRate * 0.5); // rough estimate of production bonus
        const netMC = Math.round((mcGross + bonusMC - tradeCost) * 10) / 10;
        tradeOptions.push({ name: cName, res: info.res, tradeVal: tradeVal, grossMC: Math.round(mcGross * 10) / 10, netMC: netMC, mySlots: mySlots });
      }
      tradeOptions.sort(function(a, b) { return b.netMC - a.netMC; });

      if (tradeOptions.length > 0) {
        html += '<div class="tm-col-best">Рейтинг торговли (нетто, −' + tradeCost + ' MC)</div>';
        for (let i = 0; i < Math.min(3, tradeOptions.length); i++) {
          const opt = tradeOptions[i];
          const color = opt.netMC > 0 ? '#2ecc71' : opt.netMC >= -2 ? '#f1c40f' : '#e74c3c';
          html += '<div style="font-size:11px;padding:1px 0">';
          html += (i === 0 ? '★ ' : '') + '<b>' + escHtml(opt.name) + '</b>: ';
          html += opt.tradeVal + ' ' + opt.res + ' = ' + opt.grossMC + ' MC';
          html += ' → <span style="color:' + color + ';font-weight:bold">нетто ' + (opt.netMC > 0 ? '+' : '') + opt.netMC + '</span>';
          if (opt.mySlots > 0) html += ' <span style="color:#3498db">(+' + opt.mySlots + ' кол.)</span>';
          html += '</div>';
        }
      }
    }

    html += '<div class="tm-adv-hint">Popup → вкл/выкл</div>';
    panel.innerHTML = html;
    applyMinState(panel, 'colony');
    panel.style.display = 'block';
  }

  function toggleColony() {
    colonyVisible = !colonyVisible;
    savePanelState();
    updateColonyPanel();
  }

  // ── Export Game Summary ──

  function exportGameSummary() {
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      showToast('Нет данных для экспорта', 'info');
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();
    const tr = p.terraformRating || 0;
    const mc = p.megaCredits || 0;
    const corp = detectMyCorp() || '?';
    const vb = p.victoryPointsBreakdown;
    const vpTotal = (vb && vb.total > 0) ? vb.total : tr;
    const handSize = (pv.cardsInHand || []).length;
    const tableauSize = (p.tableau || []).length;

    // Productions
    const prods = [
      'MC:' + (p.megaCreditProduction || 0),
      'St:' + (p.steelProduction || 0),
      'Ti:' + (p.titaniumProduction || 0),
      'Pl:' + (p.plantProduction || 0),
      'En:' + (p.energyProduction || 0),
      'He:' + (p.heatProduction || 0),
    ];

    // Tags
    let tagStr = '';
    if (p.tags) {
      tagStr = p.tags.filter(function(t) { return t.count > 0; })
        .sort(function(a, b) { return b.count - a.count; })
        .map(function(t) { return t.tag + ':' + t.count; }).join(', ');
    }

    // Globals
    let globalsStr = '';
    if (pv.game) {
      const parts = [];
      if (typeof pv.game.temperature === 'number') parts.push('T:' + pv.game.temperature + '°C');
      if (typeof pv.game.oxygenLevel === 'number') parts.push('O₂:' + pv.game.oxygenLevel + '%');
      if (typeof pv.game.oceans === 'number') parts.push('Oc:' + pv.game.oceans + '/9');
      globalsStr = parts.join(' | ');
    }

    const lines = [
      '=== TM Game Summary ===',
      'Gen: ' + gen + ' | Corp: ' + corp,
      'VP: ~' + vpTotal + ' | TR: ' + tr + ' | MC: ' + mc,
      'Prod: ' + prods.join(', '),
      'Cards: ' + handSize + ' hand / ' + tableauSize + ' played',
      'Tags: ' + tagStr,
      'Globals: ' + globalsStr,
      '========================',
    ];

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(function() {
      showToast('📋 Сводка скопирована!', 'info');
    }).catch(function() {
      showToast('Ошибка копирования', 'info');
    });
  }

  // ── Quick Stats Overlay ──

  let quickStatsEl = null;
  let quickStatsVisible = false;

  function showQuickStats() {
    quickStatsVisible = !quickStatsVisible;
    if (!quickStatsVisible) {
      if (quickStatsEl) quickStatsEl.style.display = 'none';
      return;
    }

    if (!quickStatsEl) {
      quickStatsEl = document.createElement('div');
      quickStatsEl.className = 'tm-quick-stats';
      document.body.appendChild(quickStatsEl);
    }

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      quickStatsEl.innerHTML = '<div style="padding:12px">Нет данных</div>';
      quickStatsEl.style.display = 'block';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();
    const tr = p.terraformRating || 0;
    const mc = p.megaCredits || 0;
    const mcProd = p.megaCreditProduction || 0;
    const cardsInHand = (pv.cardsInHand || []).length;
    const tableau = (p.tableau || []).length;

    // Calculate progress
    let progress = 0;
    if (pv.game) {
      let raises = 0, target = 0;
      if (typeof pv.game.temperature === 'number') { raises += (pv.game.temperature + 30) / 2; target += 19; }
      if (typeof pv.game.oxygenLevel === 'number') { raises += pv.game.oxygenLevel; target += 14; }
      if (typeof pv.game.oceans === 'number') { raises += pv.game.oceans; target += 9; }
      if (target > 0) progress = Math.round(raises / target * 100);
    }

    // Phase
    let phase;
    if (gen <= 2) phase = 'Ранняя';
    else if (progress < 40) phase = 'Развитие';
    else if (progress < 75) phase = 'Середина';
    else phase = 'Финал';

    // VP estimate
    const vb = p.victoryPointsBreakdown;
    const vpTotal = (vb && vb.total > 0) ? vb.total : tr;

    let html = '<div style="font-weight:bold;font-size:14px;margin-bottom:6px">📊 Сводка — Пок. ' + gen + ' (' + phase + ')</div>';
    html += '<div class="tm-qs-row"><span>VP</span><span style="font-size:16px;font-weight:bold;color:#2ecc71">' + vpTotal + '</span></div>';
    html += '<div class="tm-qs-row"><span>TR</span><span>' + tr + '</span></div>';
    html += '<div class="tm-qs-row"><span>MC</span><span>' + mc + ' (+' + mcProd + ' prod +' + tr + ' TR)</span></div>';
    html += '<div class="tm-qs-row"><span>Карт</span><span>' + cardsInHand + ' руке / ' + tableau + ' сыграно</span></div>';
    html += '<div class="tm-qs-row"><span>Прогресс</span><span>' + progress + '%</span></div>';

    // Tags summary
    if (p.tags) {
      const topTags = p.tags.filter(function(t) { return t.count > 0; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);
      if (topTags.length > 0) {
        html += '<div style="margin-top:4px;font-size:11px;color:#888">Теги: ' +
          topTags.map(function(t) { return t.tag + ':' + t.count; }).join(', ') + '</div>';
      }
    }
    html += '<div style="margin-top:6px;font-size:10px;color:#666;text-align:center">I — закрыть</div>';

    quickStatsEl.innerHTML = html;
    quickStatsEl.style.display = 'block';
  }

  // ── Hotkeys (minimal) ──

  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.code === 'Escape') {
      if (logPanelVisible) { toggleLogPanel(); e.preventDefault(); return; }
      if (searchOpen) { closeSearch(); e.preventDefault(); }
    }
    if (e.code === 'KeyL' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.shiftKey) {
        // Shift+L = export JSON immediately
        exportGameLog();
      } else {
        // L = toggle log panel
        toggleLogPanel();
      }
      e.preventDefault();
    }
  });

  // ══════════════════════════════════════════════════════════════
  // GAME LOGGER — полное логирование игры для пост-анализа
  // ══════════════════════════════════════════════════════════════

  const gameLog = {
    active: false,
    playerId: null,       // player/spectator ID for API calls
    startTime: null,
    myColor: null,
    myCorp: null,
    players: [],          // [{name, color, corp}]
    map: null,
    generations: {},      // gen# → {snapshot, actions, timestamp}
    lastSnapshotGen: 0,
    frozenCardScores: {},  // cardName → {score, baseTier, baseScore, gen}
    finalScores: null
  };

  let logPanelEl = null;
  let logPanelVisible = false;

  function initGameLogger() {
    if (gameLog.active) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;
    const gen = detectGeneration();
    if (gen < 1) return;

    gameLog.active = true;
    gameLog.startTime = Date.now();
    gameLog.myColor = pv.thisPlayer.color;
    gameLog.myCorp = detectMyCorp();

    // Player ID from URL
    try {
      const params = new URLSearchParams(window.location.search);
      gameLog.playerId = params.get('id');
    } catch (e) { /* no ID */ }

    // All players info
    if (pv.players) {
      gameLog.players = pv.players.map(function (p) {
        // Corp = first card in tableau with no cost (heuristic)
        var corp = null;
        if (p.tableau && p.tableau.length > 0) {
          corp = p.tableau[0].name || p.tableau[0];
        }
        return { name: p.name, color: p.color, corp: corp, isMe: p.color === gameLog.myColor };
      });
    }

    // Map
    if (pv.game.gameOptions) {
      gameLog.map = pv.game.gameOptions.boardName || null;
    }

    // First snapshot
    logSnapshot(gen);

    // Fetch actions for all past generations (staggered)
    setTimeout(function() { fetchAllPastActions(gen); }, 2000);
  }

  var _lastSnapshotTime = 0;

  function logSnapshot(gen, force) {
    if (!gameLog.active) return;
    // Allow re-snapshot same gen if forced or 30s+ elapsed (for late-game updates)
    if (!force && gameLog.lastSnapshotGen === gen && Date.now() - _lastSnapshotTime < 30000) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.players || !pv.game) return;

    var snap = {
      timestamp: Date.now(),
      gen: gen,
      globalParams: {
        temp: pv.game.temperature,
        oxy: pv.game.oxygenLevel,
        venus: pv.game.venusScaleLevel,
        oceans: pv.game.oceans
      },
      milestones: (pv.game.milestones || []).filter(function (m) { return m.playerName; }).map(function (m) { return { name: m.name, player: m.playerName || m.playerColor }; }),
      awards: (pv.game.awards || []).filter(function (a) { return a.funded; }).map(function (a) { return { name: a.name, player: a.playerName || a.playerColor }; }),
      players: {}
    };

    pv.players.forEach(function (p) {
      var tags = {};
      if (p.tags) {
        (Array.isArray(p.tags) ? p.tags : []).forEach(function (t) {
          if (t.count > 0) tags[t.tag] = t.count;
        });
      }
      snap.players[p.color] = {
        tr: p.terraformRating || 0,
        mc: p.megaCredits || 0, mcProd: p.megaCreditProduction || 0,
        steel: p.steel || 0, steelProd: p.steelProduction || 0,
        ti: p.titanium || 0, tiProd: p.titaniumProduction || 0,
        plants: p.plants || 0, plantProd: p.plantProduction || 0,
        energy: p.energy || 0, energyProd: p.energyProduction || 0,
        heat: p.heat || 0, heatProd: p.heatProduction || 0,
        cardsInHand: p.cardsInHandNbr || (p.color === gameLog.myColor && pv.cardsInHand ? pv.cardsInHand.length : 0),
        tableau: (p.tableau || []).map(function (c) { return c.name || c; }),
        lastCard: p.lastCardPlayed || null,
        tags: tags,
        vp: p.victoryPointsBreakdown || null,
        vpByGen: p.victoryPointsByGeneration || null,
        actionsThisGen: p.actionsThisGeneration || [],
        colonies: p.coloniesCount || 0,
        cities: p.citiesCount || 0,
        fleets: p.fleetSize || 0
      };
    });

    // Freeze scores when cards first appear in tableau
    var myTab = snap.players[gameLog.myColor] ? snap.players[gameLog.myColor].tableau : [];
    for (var fi = 0; fi < myTab.length; fi++) {
      var cn = myTab[fi];
      if (gameLog.frozenCardScores[cn]) continue;
      var el = document.querySelector('.card-container[data-tm-card="' + cn.replace(/'/g, "\\'") + '"] .tm-tier-badge');
      var scoreText = el ? el.textContent.trim() : null;
      var base = TM_RATINGS[cn];
      gameLog.frozenCardScores[cn] = {
        score: scoreText || (base ? base.t.toUpperCase() + ' ' + base.s : null),
        baseTier: base ? base.t : null,
        baseScore: base ? base.s : null,
        gen: gen
      };
    }
    // Freeze base scores for opponent cards (no context badge)
    Object.keys(snap.players).forEach(function(color) {
      if (color === gameLog.myColor) return;
      var oppTab = snap.players[color].tableau;
      for (var oi = 0; oi < oppTab.length; oi++) {
        var ocn = oppTab[oi];
        var okey = color + ':' + ocn;
        if (gameLog.frozenCardScores[okey]) continue;
        var obase = TM_RATINGS[ocn];
        gameLog.frozenCardScores[okey] = {
          score: obase ? obase.t.toUpperCase() + ' ' + obase.s : null,
          baseTier: obase ? obase.t : null,
          baseScore: obase ? obase.s : null,
          gen: gen
        };
      }
    });

    // Card scores: frozen as primary, DOM badge as fallback for non-tableau cards
    snap.cardScores = {};
    Object.keys(gameLog.frozenCardScores).forEach(function(key) {
      if (key.indexOf(':') === -1) {
        snap.cardScores[key] = gameLog.frozenCardScores[key].score;
      }
    });
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var hcn = el.getAttribute('data-tm-card');
      if (!hcn || snap.cardScores[hcn]) return;
      var badge = el.querySelector('.tm-tier-badge');
      if (badge) snap.cardScores[hcn] = badge.textContent.trim();
    });

    // Compute opponent tableau diffs vs previous generation
    var prevGenNum = gen - 1;
    var prevGd = gameLog.generations[prevGenNum];
    if (prevGd && prevGd.snapshot) {
      snap.opponentDiffs = {};
      Object.keys(snap.players).forEach(function(color) {
        if (color === gameLog.myColor) return;
        var curTab = snap.players[color].tableau;
        var prevTab = prevGd.snapshot.players[color] ? prevGd.snapshot.players[color].tableau : [];
        var newCards = curTab.filter(function(c) { return prevTab.indexOf(c) === -1; });
        if (newCards.length > 0) {
          snap.opponentDiffs[color] = {
            played: newCards,
            trDelta: snap.players[color].tr - (prevGd.snapshot.players[color] ? prevGd.snapshot.players[color].tr : 0),
            prodDelta: snap.players[color].mcProd - (prevGd.snapshot.players[color] ? prevGd.snapshot.players[color].mcProd : 0)
          };
        }
      });
    }

    if (!gameLog.generations[gen]) gameLog.generations[gen] = {};
    gameLog.generations[gen].snapshot = snap;
    gameLog.lastSnapshotGen = gen;
    _lastSnapshotTime = Date.now();

    // Autosave to localStorage every snapshot
    autoSaveGameLog();
  }

  function parseLogMessages(logs) {
    return logs.map(function (l) {
      var text = l.message || '';
      if (l.data && l.data.length > 0) {
        l.data.forEach(function (d, i) {
          text = text.replace('${' + i + '}', d.value || '');
        });
      }
      return { ts: l.timestamp, text: text, type: l.type || null };
    });
  }

  var _actionFetchTimes = {};

  function fetchGameActions(gen) {
    if (!gameLog.playerId || !gameLog.active) return;
    if (_actionFetchTimes[gen] && Date.now() - _actionFetchTimes[gen] < 10000) return;
    _actionFetchTimes[gen] = Date.now();

    fetch('/api/game-logs?id=' + encodeURIComponent(gameLog.playerId) + '&generation=' + gen)
      .then(function (resp) { return resp.ok ? resp.json() : []; })
      .then(function (logs) {
        if (!Array.isArray(logs) || logs.length === 0) return;
        if (!gameLog.generations[gen]) gameLog.generations[gen] = {};
        gameLog.generations[gen].actions = parseLogMessages(logs);
      })
      .catch(function () { /* silent */ });
  }

  function fetchAllPastActions(maxGen) {
    if (!gameLog.playerId || !gameLog.active) return;
    var delay = 0;
    for (var g = 1; g <= maxGen; g++) {
      (function(gen) {
        if (gameLog.generations[gen] && gameLog.generations[gen].actions
            && gameLog.generations[gen].actions.length > 0) return;
        delay += 300;
        setTimeout(function() {
          fetch('/api/game-logs?id=' + encodeURIComponent(gameLog.playerId) + '&generation=' + gen)
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(logs) {
              if (!Array.isArray(logs) || logs.length === 0) return;
              if (!gameLog.generations[gen]) gameLog.generations[gen] = {};
              gameLog.generations[gen].actions = parseLogMessages(logs);
            }).catch(function() {});
        }, delay);
      })(g);
    }
  }

  // Live feed: fetch current gen actions (repeatable, no dedup guard)
  var liveActions = [];
  var liveFetchBusy = false;

  function fetchLiveActions() {
    if (!gameLog.playerId || !gameLog.active || liveFetchBusy) return;
    var gen = detectGeneration();
    liveFetchBusy = true;
    fetch('/api/game-logs?id=' + encodeURIComponent(gameLog.playerId) + '&generation=' + gen)
      .then(function (resp) { return resp.ok ? resp.json() : []; })
      .then(function (logs) {
        liveActions = Array.isArray(logs) ? parseLogMessages(logs) : [];
        // Also store in generations for persistence
        if (liveActions.length > 0) {
          if (!gameLog.generations[gen]) gameLog.generations[gen] = {};
          gameLog.generations[gen].actions = liveActions;
        }
        liveFetchBusy = false;
      })
      .catch(function () { liveFetchBusy = false; });
  }

  function autoSaveGameLog() {
    if (!gameLog.active) return;
    var key = 'tm-gamelog-' + (gameLog.playerId || 'unknown');
    try {
      localStorage.setItem(key, JSON.stringify(buildExportData()));
    } catch (e) { /* quota exceeded — silent */ }
  }

  function buildExportData() {
    var pv = getPlayerVueData();
    var data = {
      version: 3,
      exportTime: new Date().toISOString(),
      startTime: gameLog.startTime,
      playerId: gameLog.playerId,
      myColor: gameLog.myColor,
      myCorp: gameLog.myCorp,
      players: gameLog.players,
      map: gameLog.map,
      genTimes: genTimes,
      generations: gameLog.generations,
      draftLog: draftHistory,
      frozenCardScores: gameLog.frozenCardScores,
      finalScores: null
    };

    // Final VP breakdown
    if (pv && pv.players) {
      data.finalScores = {};
      pv.players.forEach(function (p) {
        var vb = p.victoryPointsBreakdown;
        data.finalScores[p.color] = {
          total: vb && vb.total > 0 ? vb.total : p.terraformRating,
          tr: vb ? vb.terraformRating : p.terraformRating,
          milestones: vb ? vb.milestones : 0,
          awards: vb ? vb.awards : 0,
          greenery: vb ? vb.greenery : 0,
          city: vb ? vb.city : 0,
          cards: vb ? vb.victoryPoints : 0
        };
      });
    }

    // Collect opponent diffs from all generations
    var oppActivity = {};
    Object.keys(gameLog.generations).forEach(function(gn) {
      var gd = gameLog.generations[gn];
      if (gd.snapshot && gd.snapshot.opponentDiffs) {
        oppActivity[gn] = gd.snapshot.opponentDiffs;
      }
    });
    data.opponentActivity = oppActivity;

    return data;
  }

  function exportGameLog() {
    // Final snapshot before export
    var gen = detectGeneration();
    logSnapshot(gen);
    fetchGameActions(gen);
    fetchAllPastActions(gen);

    // Small delay for fetch to complete, then export
    setTimeout(function () {
      var data = buildExportData();
      var genCount = Object.keys(gameLog.generations).length;
      var draftCount = draftHistory.length;

      // Download as JSON
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tm-game-gen' + gen + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      showToast('Лог экспортирован: ' + genCount + ' пок., ' + draftCount + ' драфтов', 'great');
    }, 1500);
  }

  // ── Log Panel UI ──

  function buildLogPanel() {
    if (logPanelEl) return logPanelEl;
    logPanelEl = document.createElement('div');
    logPanelEl.className = 'tm-log-panel';
    document.body.appendChild(logPanelEl);
    return logPanelEl;
  }

  var logPanelTab = 'live'; // 'live' | 'history' | 'draft'

  function updateLogPanel() {
    if (!logPanelVisible) {
      if (logPanelEl) logPanelEl.style.display = 'none';
      return;
    }
    buildLogPanel();
    var gen = detectGeneration();
    var genCount = Object.keys(gameLog.generations).length;
    var draftCount = draftHistory.length;

    // Header
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<span style="font-weight:bold;font-size:13px">Game Logger</span>';
    html += '<span style="font-size:11px;color:#888">' + minBtn('log') + 'Пок.' + gen + ' | ' + genCount + ' снапш.</span>';
    html += '</div>';

    // Tabs
    var tabs = [
      { id: 'live', label: 'Live (' + liveActions.length + ')' },
      { id: 'history', label: 'История' },
      { id: 'draft', label: 'Драфт (' + draftCount + ')' }
    ];
    html += '<div style="display:flex;gap:2px;margin-bottom:8px">';
    for (var ti = 0; ti < tabs.length; ti++) {
      var tab = tabs[ti];
      var isActive = logPanelTab === tab.id;
      html += '<button data-log-tab="' + tab.id + '" style="flex:1;padding:3px 6px;font-size:11px;border:1px solid ' + (isActive ? '#3498db' : '#555') + ';background:' + (isActive ? '#3498db' : 'transparent') + ';color:' + (isActive ? '#fff' : '#aaa') + ';border-radius:3px;cursor:pointer">' + tab.label + '</button>';
    }
    html += '</div>';

    // Tab content
    if (logPanelTab === 'live') {
      html += renderLiveTab(gen);
    } else if (logPanelTab === 'history') {
      html += renderHistoryTab(gen);
    } else if (logPanelTab === 'draft') {
      html += renderDraftTab();
    }

    // Export
    html += '<div style="margin-top:8px;display:flex;gap:6px;justify-content:center">';
    html += '<button data-log-action="export" style="background:#3498db;color:#fff;border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:11px">Экспорт JSON</button>';
    html += '<button data-log-action="close" style="background:#555;color:#fff;border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:11px">Закрыть</button>';
    html += '</div>';
    html += '<div style="font-size:9px;color:#555;text-align:center;margin-top:4px">Shift+L экспорт | Esc закрыть</div>';

    logPanelEl.innerHTML = html;
    applyMinState(logPanelEl, 'log');
    logPanelEl.style.display = 'block';

    // Attach tab click handlers
    logPanelEl.querySelectorAll('[data-log-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        logPanelTab = btn.getAttribute('data-log-tab');
        updateLogPanel();
      });
    });
    logPanelEl.querySelectorAll('[data-log-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-log-action');
        if (act === 'export') exportGameLog();
        if (act === 'close') toggleLogPanel();
      });
    });
  }

  function renderLiveTab(gen) {
    var html = '';

    // Live actions feed
    if (liveActions.length > 0) {
      html += '<div style="max-height:300px;overflow-y:auto;font-size:11px;line-height:1.5">';
      // Show newest first
      for (var i = liveActions.length - 1; i >= Math.max(0, liveActions.length - 50); i--) {
        var a = liveActions[i];
        if (a.type === 'NEW_GENERATION') {
          html += '<div style="color:#f39c12;font-weight:bold;margin:4px 0;border-top:1px solid rgba(255,255,255,0.15);padding-top:4px">' + a.text + '</div>';
        } else {
          html += '<div style="color:#ccc;padding:1px 0">' + escHtml(a.text) + '</div>';
        }
      }
      html += '</div>';
    } else {
      html += '<div style="color:#888;font-size:11px;text-align:center;padding:20px 0">Нет действий. Лог обновляется каждые 5 сек.</div>';
    }

    return html;
  }

  function renderHistoryTab(currentGen) {
    var html = '';
    var gens = Object.keys(gameLog.generations).sort(function (a, b) { return +b - +a; }); // newest first

    if (gens.length === 0) {
      html += '<div style="color:#888;font-size:11px;text-align:center;padding:20px 0">Нет снапшотов</div>';
      return html;
    }

    html += '<div style="max-height:350px;overflow-y:auto">';
    for (var gi = 0; gi < gens.length; gi++) {
      var gn = gens[gi];
      var gd = gameLog.generations[gn];
      var snap = gd.snapshot;
      if (!snap) continue;

      // Gen header
      html += '<div style="font-size:12px;font-weight:bold;color:#3498db;margin-top:' + (gi === 0 ? '0' : '8px') + ';margin-bottom:2px">Поколение ' + gn + '</div>';

      // Global params
      var gp = snap.globalParams;
      html += '<div style="font-size:10px;color:#888">';
      html += 'T:' + (gp.temp != null ? gp.temp + '°' : '?');
      html += ' O₂:' + (gp.oxy != null ? gp.oxy + '%' : '?');
      html += ' Oc:' + (gp.oceans != null ? gp.oceans + '/9' : '?');
      if (gp.venus != null) html += ' Vn:' + gp.venus + '%';
      html += '</div>';

      // Player rows
      var colors = Object.keys(snap.players);
      for (var ci = 0; ci < colors.length; ci++) {
        var col = colors[ci];
        var ps = snap.players[col];
        var isMe = col === gameLog.myColor;

        // Delta from previous gen
        var prevGn = gens[gi + 1]; // previous gen (older)
        var delta = '';
        if (prevGn && gameLog.generations[prevGn] && gameLog.generations[prevGn].snapshot) {
          var prevPs = gameLog.generations[prevGn].snapshot.players[col];
          if (prevPs) {
            var dTR = ps.tr - prevPs.tr;
            var dCards = ps.tableau.length - prevPs.tableau.length;
            var parts = [];
            if (dTR > 0) parts.push('<span style="color:#2ecc71">+' + dTR + ' TR</span>');
            if (dCards > 0) parts.push('+' + dCards + ' карт');
            // New cards played this gen
            var newCards = ps.tableau.filter(function (c) { return prevPs.tableau.indexOf(c) === -1; });
            if (newCards.length > 0) {
              parts.push(newCards.map(function (c) {
                var rd = TM_RATINGS[c];
                if (!rd) return ruName(c);
                // Quick adjusted score: FTN timing + corp synergy + tableau synergy
                var adj = 0;
                var adjParts = [];
                var ctx2 = getCachedPlayerContext();
                var gl = ctx2 ? ctx2.gensLeft : 1;

                // FTN timing delta
                if (typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[c]) {
                  var fx = TM_CARD_EFFECTS[c];
                  var hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
                  var hasVP = fx.vp || fx.vpAcc;
                  var hasAct = fx.actMC || fx.actTR || fx.actOc || fx.actCD;
                  var hasTR = fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn;
                  var isPP = hasProd && !hasVP && !hasAct && !hasTR;
                  var sc = isPP ? 3.0 : 1.5;
                  var cap = isPP ? 30 : 15;
                  var refGL = 5;
                  var effGL = Math.min(gl, fx.minG ? Math.max(0, 9 - fx.minG) : 13);
                  var rGL = Math.min(refGL, fx.minG ? Math.max(0, 9 - fx.minG) : 13);
                  var td = computeCardValue(fx, effGL) - computeCardValue(fx, rGL);
                  var ta = Math.max(-cap, Math.min(cap, Math.round(td * sc)));
                  if (Math.abs(ta) >= 1) { adj += ta; adjParts.push((isPP ? 'прод.' : '') + 'тайм ' + (ta > 0 ? '+' : '') + ta); }
                } else if (rd.e) {
                  // Crude timing without FTN
                  var el2 = rd.e.toLowerCase();
                  var isP = /prod|прод/.test(el2);
                  var isV = /vp|вп/.test(el2);
                  if (gl <= 1 && isP && !isV) { adj -= 15; adjParts.push('поздн.прод -15'); }
                  else if (gl <= 2 && isP && !isV) { adj -= 10; adjParts.push('поздн.прод -10'); }
                  if (gl >= 5 && isP) { adj += 3; adjParts.push('ранн.прод +3'); }
                  if (gl <= 1 && isV && !isP) { adj += 8; adjParts.push('VP burst +8'); }
                  else if (gl <= 2 && isV && !isP) { adj += 5; adjParts.push('поздн.VP +5'); }
                  // Action penalty late game
                  var isAct = /action|действие/.test(el2);
                  if (gl <= 1 && isAct && !isV) { adj -= 10; adjParts.push('поздн.act -10'); }
                  else if (gl <= 2 && isAct && !isV) { adj -= 5; adjParts.push('поздн.act -5'); }
                }

                // Corp synergy
                var myCorps3 = detectMyCorps();
                for (var ci3 = 0; ci3 < myCorps3.length; ci3++) {
                  var cc = myCorps3[ci3];
                  if (rd.y && rd.y.some(function(s) { return s === cc || s.indexOf(cc) !== -1; })) {
                    adj += 8; adjParts.push(cc.split(' ')[0] + ' +8');
                  }
                  var crd = TM_RATINGS[cc];
                  if (crd && crd.y && crd.y.indexOf(c) !== -1) {
                    adj += 5; adjParts.push(cc.split(' ')[0] + ' нужна +5');
                  }
                }

                // Tableau synergy (max +9)
                var tab3 = (snap.players[gameLog.myColor] || {}).tableau || [];
                var synC = 0;
                for (var ti3 = 0; ti3 < tab3.length && synC < 3; ti3++) {
                  if (rd.y && rd.y.indexOf(tab3[ti3]) !== -1) synC++;
                  else { var td3 = TM_RATINGS[tab3[ti3]]; if (td3 && td3.y && td3.y.indexOf(c) !== -1) synC++; }
                }
                if (synC > 0) { adj += synC * 3; adjParts.push(synC + ' синерг. +' + (synC * 3)); }

                var adjTotal = rd.s + adj;
                var adjTier = scoreToTier(adjTotal);
                var tc = tierColor(adjTier);
                if (adj !== 0) {
                  var sign3 = adj > 0 ? '+' : '';
                  return ruName(c) + ' <span style="color:' + tc + '" title="' + adjParts.join(', ') + '">' + rd.t + rd.s + '\u2192' + adjTier + adjTotal + ' <span style="font-size:9px">' + sign3 + adj + '</span></span>';
                }
                return ruName(c) + ' <span style="color:' + tc + '">' + adjTier + adjTotal + '</span>';
              }).join(', '));
            }
            if (parts.length > 0) delta = ' ' + parts.join(' | ');
          }
        }

        html += '<div style="font-size:11px;padding:2px 0;' + (isMe ? 'color:#fff;font-weight:bold' : 'color:#bbb') + '">';
        html += '<span style="display:inline-block;width:8px;height:8px;background:' + col + ';border-radius:50%;margin-right:4px"></span>';
        html += 'TR:' + ps.tr + ' MC:' + ps.mc + '(+' + ps.mcProd + ') ';
        html += ps.tableau.length + ' карт';
        if (delta) html += '<div style="font-size:10px;margin-left:12px;color:#aaa">' + delta + '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderDraftTab() {
    var html = '';
    if (draftHistory.length === 0) {
      html += '<div style="color:#888;font-size:11px;text-align:center;padding:20px 0">Нет драфт-решений</div>';
      return html;
    }

    html += '<div style="max-height:350px;overflow-y:auto">';
    // Newest first
    for (var di = draftHistory.length - 1; di >= 0; di--) {
      var dr = draftHistory[di];
      html += '<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">';
      html += '<div style="font-size:11px;font-weight:bold;color:#f39c12">Раунд ' + dr.round + '</div>';
      for (var oi = 0; oi < dr.offered.length; oi++) {
        var card = dr.offered[oi];
        var isTaken = card.name === dr.taken;
        html += '<div style="font-size:11px;padding:1px 0;' + (isTaken ? 'color:#2ecc71;font-weight:bold' : 'color:#888') + '">';
        html += (isTaken ? '✓ ' : '  ') + ruName(card.name);
        html += ' <span style="color:' + (card.total >= 70 ? '#2ecc71' : card.total >= 55 ? '#f39c12' : '#e74c3c') + '">' + card.total + '</span>';
        html += '/' + card.tier;
        if (card.baseTier !== card.tier) html += ' <span style="color:#888">(базовый ' + card.baseScore + '/' + card.baseTier + ')</span>';
        if (card.reasons && card.reasons.length > 0) {
          html += '<div style="font-size:9px;color:#666;margin-left:12px">' + card.reasons.join('; ') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function toggleLogPanel() {
    logPanelVisible = !logPanelVisible;
    if (logPanelVisible) {
      fetchLiveActions();
      setTimeout(function () { updateLogPanel(); }, 800);
      updateLogPanel(); // immediate render with current data
    } else {
      if (logPanelEl) logPanelEl.style.display = 'none';
    }
  }

  // Listen for export button click (from inline onclick → CustomEvent)
  document.addEventListener('tm-export-log', function () {
    exportGameLog();
  });

  // ── Game End Stats ──

  let gameEndNotified = false;

  function checkGameEnd() {
    if (gameEndNotified) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;
    const g = pv.game;
    const tempMax = typeof g.temperature === 'number' && g.temperature >= 8;
    const oxyMax = typeof g.oxygenLevel === 'number' && g.oxygenLevel >= 14;
    const oceansMax = typeof g.oceans === 'number' && g.oceans >= 9;
    if (!tempMax || !oxyMax || !oceansMax) return;

    gameEndNotified = true;
    const gen = detectGeneration();
    const elapsed = Date.now() - gameStartTime;
    const p = pv.thisPlayer;
    const tr = p.terraformRating || 0;
    const cardsPlayed = p.tableau ? p.tableau.length : 0;
    const mins = Math.round(elapsed / 60000);
    showToast('🏁 Конец игры! Пок. ' + gen + ' | TR ' + tr + ' | ' + cardsPlayed + ' карт | ' + mins + ' мин', 'great');

    // Auto-export game log on game end
    logSnapshot(gen);
    setTimeout(function () {
      fetchGameActions(gen);
      autoSaveGameLog();
      showToast('Лог игры сохранён. Нажми L для экспорта', 'info');
    }, 2000);
  }

  // ── Compact Mode ──

  let compactMode = false;

  function toggleCompact() {
    compactMode = !compactMode;
    document.body.classList.toggle('tm-compact', compactMode);
    showToast(compactMode ? 'Компактный режим включён' : 'Компактный режим выключен', 'info');
  }

  // ── Floating Resource Bar ──

  let resBarEl = null;

  function updateResourceBar() {
    if (!enabled) {
      if (resBarEl) resBarEl.style.display = 'none';
      return;
    }
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      if (resBarEl) resBarEl.style.display = 'none';
      return;
    }
    if (!resBarEl) {
      resBarEl = document.createElement('div');
      resBarEl.className = 'tm-res-bar';
      document.body.appendChild(resBarEl);
    }
    const p = pv.thisPlayer;
    const items = [
      { icon: '💰', val: p.megaCredits || 0, prod: (p.megaCreditProduction || 0) + (p.terraformRating || 0), color: '#f1c40f' },
      { icon: '⚒', val: p.steel || 0, prod: p.steelProduction || 0, color: '#8b7355' },
      { icon: '🔩', val: p.titanium || 0, prod: p.titaniumProduction || 0, color: '#aaa' },
      { icon: '🌿', val: p.plants || 0, prod: p.plantProduction || 0, color: '#4caf50' },
      { icon: '⚡', val: p.energy || 0, prod: p.energyProduction || 0, color: '#9b59b6' },
      { icon: '🔥', val: p.heat || 0, prod: p.heatProduction || 0, color: '#e67e22' },
    ];
    let html = '';
    for (const it of items) {
      html += '<span class="tm-res-item" style="color:' + it.color + '">' + it.icon + ' ' + it.val;
      if (it.prod > 0) html += '<span class="tm-res-prod">+' + it.prod + '</span>';
      html += '</span>';
    }
    // TR
    html += '<span class="tm-res-item" style="color:#3498db">TR ' + (p.terraformRating || 0) + '</span>';
    resBarEl.innerHTML = html;
    resBarEl.style.display = 'flex';
  }

  // ── MutationObserver ──

  function debounce(fn, ms) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  const debouncedProcess = debounce(processAll, 350);
  const observer = new MutationObserver(function() {
    if (!_processingNow) debouncedProcess();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Generation timer: update every second
  setInterval(function() {
    if (enabled) {
      updateGenTimer();
      checkGameEnd();
    }
  }, 1000);

  // Context-aware hand/draft scores: separate slow interval (not on every mutation)
  setInterval(function() {
    if (enabled && !_processingNow) {
      _processingNow = true;
      try {
        // Retry draft/research scoring if selection dialog is open
        if (document.querySelector('.wf-component--select-card .card-container')) {
          updateDraftRecommendations();
        }
        updateHandScores();
      } finally { _processingNow = false; }
    }
  }, 3000);

  // Game Logger: live feed every 5s, render panel only when visible, autosave every 30s
  setInterval(function () {
    if (gameLog.active) {
      fetchLiveActions();
      if (logPanelVisible) {
        setTimeout(function () { updateLogPanel(); }, 1500);
      }
    }
  }, 5000);

  setInterval(function () {
    if (gameLog.active) autoSaveGameLog();
  }, 30000);

  processAll();

})();

// ═══════════════════════════════════════════════════════════════════
// Game Creation Auto-Fill — сохраняет и восстанавливает настройки
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STORAGE_KEY = 'tm_create_game_settings';
  let applied = false;
  let vueInstance = null;

  function safeStorage(fn) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
        fn(chrome.storage);
      }
    } catch (e) { /* extension context invalidated */ }
  }


  function showNotification(text) {
    var el = document.createElement('div');
    el.className = 'tm-autofill-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, 3000);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3500);
  }

  // Auto-save when bridge signals game was created (fetch intercepted in MAIN world)
  var _lastCgEvent = '';
  function checkAutoSave() {
    var ev = document.body.getAttribute('data-tm-cg-event') || '';
    if (ev !== _lastCgEvent && ev.startsWith('autosaved:')) {
      _lastCgEvent = ev;
      var raw = document.body.getAttribute('data-tm-cg-settings');
      if (raw) {
        try {
          var settings = JSON.parse(raw);
          safeStorage(function(storage) {
            storage.local.set({ tm_create_game_settings: settings });
          });
        } catch(e) {}
      }
    }
    _lastCgEvent = ev;
  }

  var obs = new MutationObserver(function() {
    checkAutoSave();
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tm-cg-event'] });
})();
