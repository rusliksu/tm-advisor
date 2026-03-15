// TM Tier Overlay — Content Script v2.0
// Full feature set: badges, tooltips, combos, dimming, draft summary, corp synergy,
// search, M/A advisor, recommendations, opponent intel, hand sort, toasts,
// dynamic value calc, milestone race, card comparison, income projection,
// draft filter, generation timer, panel persistence, buying power,
// standard projects, settings import/export

(function () {
  'use strict';

  let enabled = true;
  let debugMode = false;
  var SC = TM_SCORING_CONFIG;

  // ── Tile type helpers (API returns number or string) ──
  function isCityTile(t) { return t === 0 || t === 'city' || t === 5 || t === 'capital'; }
  function isGreeneryTile(t) { return t === 1 || t === 'greenery'; }
  function isOceanTile(t) { return t === 2 || t === 'ocean'; }

  // ── Debug logging infrastructure ──
  var _debugLog = []; // ring buffer (max 200 entries)
  var _lastProcessAllMs = 0;

  function tmLog(category, msg, data) {
    if (!debugMode) return;
    var prefix = '[TM:' + category + ']';
    if (data !== undefined) console.log(prefix, msg, data);
    else console.log(prefix, msg);
    _debugLog.push({ t: Date.now(), cat: category, msg: msg, data: data });
    if (_debugLog.length > 200) _debugLog.shift();
  }

  function tmWarn(category, msg, data) {
    if (!debugMode) return;
    console.warn('[TM:' + category + ']', msg, data || '');
    _debugLog.push({ t: Date.now(), cat: category, msg: '\u26a0 ' + msg, data: data });
    if (_debugLog.length > 200) _debugLog.shift();
  }

  var safeStorage = TM_UTILS.safeStorage;
  let tierFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

  // ── Reusable DOM selectors ──
  const SEL_HAND = '.player_home_block--hand .card-container[data-tm-card]';
  const SEL_TABLEAU = '.player_home_block--cards .card-container[data-tm-card]';
  const SEL_DRAFT = '.wf-component--select-card .card-container[data-tm-card]';

  // ── Weighted y helpers ──
  // y entries can be "CardName" (legacy, weight=default) or ["CardName", weight]
  function yName(entry) { return Array.isArray(entry) ? entry[0] : entry; }
  function yWeight(entry) { return Array.isArray(entry) ? entry[1] : 0; }
  function cardN(c) { return c.name || c; } // Vue tableau entries: object {name} or string
  function corpName(p) { var raw = typeof p.corporationCard === 'string' ? p.corporationCard : (p.corporationCard.name || ''); return resolveCorpName(raw); }
  function getFx(name) { return typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[name] ? TM_CARD_EFFECTS[name] : null; }
  function globalParamRaises(g) {
    var tempLeft = g.temperature != null ? Math.max(0, (SC.tempMax - g.temperature) / SC.tempStep) : 0;
    var oxyLeft = g.oxygenLevel != null ? Math.max(0, SC.oxyMax - g.oxygenLevel) : 0;
    var oceanLeft = g.oceans != null ? Math.max(0, SC.oceansMax - g.oceans) : 0;
    return { temp: tempLeft, oxy: oxyLeft, ocean: oceanLeft, total: tempLeft + oxyLeft + oceanLeft };
  }
  function estimateGensLeft(pv) {
    // Delegate to TM_BRAIN.estimateGensLeft for unified calculation
    if (typeof TM_ADVISOR !== 'undefined' && TM_ADVISOR.estimateGensLeft && pv) {
      return TM_ADVISOR.estimateGensLeft(pv);
    }
    // Fallback: gen-based estimate adapted to player count
    var gen = detectGeneration();
    var maxGen = SC.maxGenerations || 9;
    // Adjust for player count and WGT
    if (pv && pv.game) {
      var plCount = (pv.game.players || []).length || 3;
      var wgt = pv.game.gameOptions && pv.game.gameOptions.solarPhaseOption;
      if (plCount >= 4) maxGen = wgt ? 12 : 14;
      else if (plCount <= 2) maxGen = wgt ? 10 : 14;
      else maxGen = wgt ? 10 : 12;
    }
    var glByGen = Math.max(1, maxGen - gen);
    if (pv && pv.game) {
      var raises = globalParamRaises(pv.game);
      var glByRaises = Math.max(1, Math.ceil(raises.total / SC.genParamDivisor));
      return Math.min(glByRaises, glByGen);
    }
    return glByGen;
  }
  // 0 = use default tableauSynergyPer; explicit weight overrides

  // ── Visibility Guard — pause processing when tab is hidden ──
  let _tabVisible = !document.hidden;
  document.addEventListener('visibilitychange', function() {
    _tabVisible = !document.hidden;
    if (_tabVisible && enabled) debouncedProcess();
  });

  // Panel state keys for persistence
  const PANEL_DEFAULTS = {
    enabled: true, tierFilter: tierFilter,
    panel_debug: false,
    panel_min_state: '{}',
  };

  function savePanelState() {
    safeStorage((s) => s.local.set({
      panel_debug: debugMode,
      panel_min_state: JSON.stringify(panelMinState),
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
    var panel = btn.closest('.tm-log-panel');
    if (panel) {
      panel.classList.toggle('tm-panel-minimized');
      btn.textContent = panelMinState[id] ? '▼' : '▲';
    }
    savePanelState();
  });

  // Load settings
  safeStorage((s) => {
    s.local.get(PANEL_DEFAULTS, (r) => {
      enabled = r.enabled;
      tierFilter = r.tierFilter;
      debugMode = r.panel_debug;
      if (r.panel_min_state) {
        try { panelMinState = JSON.parse(r.panel_min_state); } catch(e) { tmWarn('init', 'panelMinState parse failed', e); }
      }
      if (debugMode) {
        tmLog('init', 'Debug mode ON (restored), v2.0');
        setTimeout(updateDebugPanel, 100);
      }
      loadCardStats(function() {}); // preload card stats for tooltip
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
      if (changes.panel_debug) {
        debugMode = changes.panel_debug.newValue;
        if (debugMode) {
          tmLog('init', 'Debug mode ON via popup, v2.0');
          showToast('Debug ON', 'info');
        } else {
          showToast('Debug OFF', 'info');
        }
        updateDebugPanel();
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

  var ruName = TM_UTILS.ruName;

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

  // ── Context building helpers (shared between getPlayerContext & buildOpponentContext) ──

  function extractPlayerTags(tagsArray, ctx) {
    if (!tagsArray || !Array.isArray(tagsArray)) return;
    for (var i = 0; i < tagsArray.length; i++) {
      var tagName = (tagsArray[i].tag || '').toLowerCase();
      if (tagName && tagsArray[i].count > 0) {
        ctx.tags[tagName] = tagsArray[i].count;
        ctx.uniqueTagCount++;
      }
    }
  }

  function applyCorpDiscounts(corpsArray, ctx) {
    if (typeof CORP_DISCOUNTS === 'undefined') return;
    for (var i = 0; i < corpsArray.length; i++) {
      var cd = CORP_DISCOUNTS[corpsArray[i]];
      if (cd) {
        for (var tag in cd) {
          ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
        }
      }
    }
  }

  function applyCardDiscounts(ctx) {
    if (typeof CARD_DISCOUNTS === 'undefined') return;
    for (var cardName in CARD_DISCOUNTS) {
      if (ctx.tableauNames.has(cardName)) {
        var cd = CARD_DISCOUNTS[cardName];
        for (var tag in cd) {
          ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
        }
      }
    }
  }

  function applyTagTriggers(ctx, corpsToCheck) {
    if (typeof TAG_TRIGGERS === 'undefined') return;
    for (var name in TAG_TRIGGERS) {
      if (ctx.tableauNames.has(name) || corpsToCheck.indexOf(name) >= 0) {
        var trigs = TAG_TRIGGERS[name];
        for (var i = 0; i < trigs.length; i++) {
          ctx.tagTriggers.push(trigs[i]);
        }
      }
    }
  }

  function computeBoardState(pv, ctx) {
    if (!pv || !pv.game || !pv.game.spaces) return;
    for (var i = 0; i < pv.game.spaces.length; i++) {
      var sp = pv.game.spaces[i];
      if (sp.spaceType === 'land' || sp.spaceType === 'ocean') {
        if (sp.tileType != null) {
          ctx.totalOccupied++;
          if (isOceanTile(sp.tileType)) ctx.oceansOnBoard++;
        } else {
          ctx.emptySpaces++;
        }
      }
    }
    ctx.boardFullness = (ctx.emptySpaces + ctx.totalOccupied) > 0
      ? ctx.totalOccupied / (ctx.emptySpaces + ctx.totalOccupied) : 0;
  }

  function extractColonies(pv, playerColor, ctx) {
    if (!pv || !pv.game || !pv.game.colonies) return;
    ctx.colonyWorldCount = pv.game.colonies.length;
    for (var i = 0; i < pv.game.colonies.length; i++) {
      var col = pv.game.colonies[i];
      if (col.colonies) {
        ctx.totalColonies += col.colonies.length;
        for (var j = 0; j < col.colonies.length; j++) {
          if (col.colonies[j].player === playerColor) ctx.coloniesOwned++;
        }
      }
    }
  }

  // MA proximity — milestone/award proximity computation for any player
  function processMAProximity(player, playerColor, pv, ctx) {
    if (typeof MA_DATA === 'undefined') return;
    var activeNames = detectActiveMA();
    var maEntries = Object.entries(MA_DATA);
    for (var mai = 0; mai < maEntries.length; mai++) {
      var maName = maEntries[mai][0];
      var ma = maEntries[mai][1];
      if (activeNames.length > 0 && !activeNames.some(function(n) { return n.includes(maName); })) continue;

      var current = computeMAValueForPlayer(ma, player, pv);
      var target = ma.target || 0;
      var pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      ctx.activeMA.push({ name: maName, type: ma.type, check: ma.check, tag: ma.tag, target: target, current: current, pct: pct, resource: ma.resource });

      // Milestone tag proximity
      if (ma.type === 'milestone' && ma.check === 'tags' && ma.tag && target > 0) {
        var need = target - current;
        if (need > 0 && need <= 3) {
          var prev = ctx.milestoneNeeds[ma.tag];
          if (prev === undefined || need < prev) ctx.milestoneNeeds[ma.tag] = need;
        }
      }
      if (ma.type === 'milestone' && ma.check === 'bioTags' && target > 0) {
        // Milestones check tableau only
        var bioCnt = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
        var bioNeed = target - bioCnt;
        if (bioNeed > 0 && bioNeed <= 3) {
          var bioTags = ['plant', 'microbe', 'animal'];
          for (var bti = 0; bti < bioTags.length; bti++) {
            var bPrev = ctx.milestoneNeeds[bioTags[bti]];
            if (bPrev === undefined || bioNeed < bPrev) ctx.milestoneNeeds[bioTags[bti]] = bioNeed;
          }
        }
      }
      if (ma.type === 'milestone' && target > 0 && ma.check !== 'tags' && ma.check !== 'bioTags') {
        var msNeed = target - current;
        if (msNeed > 0 && msNeed <= 3) {
          var msKey = ma.check + (ma.resource ? '_' + ma.resource : '');
          var msPrev = ctx.milestoneSpecial[msKey];
          if (msPrev === undefined || msNeed < msPrev) ctx.milestoneSpecial[msKey] = { need: msNeed, name: maName };
        }
      }
      if (ma.type === 'award' && ma.check === 'tags' && ma.tag) {
        ctx.awardTags[ma.tag] = true;
      }

      // Award racing
      if (ma.type === 'award' && pv && pv.game && pv.game.awards && pv.game.players) {
        var funded = null;
        for (var afi = 0; afi < pv.game.awards.length; afi++) {
          var aw = pv.game.awards[afi];
          if (((aw.name || '').toLowerCase().indexOf(maName.toLowerCase()) >= 0) ||
              (maName.toLowerCase().indexOf((aw.name || '').toLowerCase()) >= 0)) {
            funded = aw; break;
          }
        }
        if (funded && (funded.playerName || funded.player || funded.color)) {
          var bestOpp = 0;
          for (var opi = 0; opi < pv.game.players.length; opi++) {
            var rOpp = pv.game.players[opi];
            if (rOpp.color === playerColor) continue;
            var rScore = computeMAValueForPlayer(ma, rOpp, pv);
            if (rScore > bestOpp) bestOpp = rScore;
          }
          ctx.awardRacing[maName] = {
            myScore: current,
            bestOpp: bestOpp,
            delta: current - bestOpp,
            leading: current >= bestOpp
          };
        }
      }
    }
  }

  // Opponent scanning — detect opponent corps, take-that, attacks
  function scanOpponents(pv, myColor, ctx) {
    ctx.oppCorps = [];
    ctx.oppHasTakeThat = false;
    ctx.oppHasAnimalAttack = false;
    ctx.oppHasPlantAttack = false;
    ctx.oppHasSolarLogistics = false;
    ctx.oppHasEarthCatapult = false;
    ctx.oppAnimalTargets = 0;
    ctx.oppMicrobeTargets = 0;
    if (!pv || !pv.game || !pv.game.players) return;
    for (var i = 0; i < pv.game.players.length; i++) {
      var opp = pv.game.players[i];
      if (opp.color === myColor) continue;
      if (opp.tableau) {
        for (var j = 0; j < opp.tableau.length; j++) {
          var cn = cardN(opp.tableau[j]);
          if (opp.tableau[j].cardType === 'corp' || (TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp')) {
            ctx.oppCorps.push(cn);
          }
          if (TAKE_THAT_CARDS[cn]) ctx.oppHasTakeThat = true;
          if (cn === 'Predators' || cn === 'Ants') ctx.oppHasAnimalAttack = true;
          if (cn === 'Virus' || cn === 'Giant Ice Asteroid' || cn === 'Deimos Down' || cn === 'Comet') ctx.oppHasPlantAttack = true;
          if (ANIMAL_TARGETS.has(cn)) ctx.oppAnimalTargets++;
          if (MICROBE_TARGETS.has(cn)) ctx.oppMicrobeTargets++;
          if (cn === 'Solar Logistics') ctx.oppHasSolarLogistics = true;
          if (cn === 'Earth Catapult') ctx.oppHasEarthCatapult = true;
        }
      }
      if (opp.corporationCard) {
        var oc = corpName(opp);
        if (oc) ctx.oppCorps.push(oc);
      }
      // Track opponent TR and strategy signals
      var oppTR = opp.terraformRating || 0;
      if (!ctx.oppMaxTR || oppTR > ctx.oppMaxTR) {
        ctx.oppMaxTR = oppTR;
        ctx.oppLeader = opp.name || opp.color;
      }
      // Track opponent tags for deny-draft and award competition
      if (opp.tags) {
        if (!ctx.oppTags) ctx.oppTags = {};
        var oppTagArr = Array.isArray(opp.tags) ? opp.tags : [];
        for (var _oti = 0; _oti < oppTagArr.length; _oti++) {
          var _otag = oppTagArr[_oti].tag || '';
          var _ocount = oppTagArr[_oti].count || 0;
          ctx.oppTags[_otag] = (ctx.oppTags[_otag] || 0) + _ocount;
        }
      }
    }
    ctx.oppTRGap = (ctx.oppMaxTR || 0) - (ctx.tr || 0);
  }

  // Global params extraction
  function extractGlobalParams(pv, ctx) {
    ctx.globalParams = { temp: -30, oxy: 0, oceans: 0, venus: 0 };
    if (!pv || !pv.game) return;
    var g = pv.game;
    if (g.temperature != null) ctx.globalParams.temp = g.temperature;
    if (g.oxygenLevel != null) ctx.globalParams.oxy = g.oxygenLevel;
    if (g.oceans != null) ctx.globalParams.oceans = g.oceans;
    if (g.venusScaleLevel != null) ctx.globalParams.venus = g.venusScaleLevel;
  }

  // Fetch funded awards AND claimed milestones from game API
  var _gameMACache = { gameId: null, gen: 0, awards: new Set(), milestones: new Set(), claimedCount: 0, fetching: false };
  function _fetchGameMA(gameId, ctx) {
    var curGen = ctx.gen || 0;
    if (_gameMACache.gameId === gameId && _gameMACache.gen === curGen) {
      _gameMACache.awards.forEach(function(a) { ctx.awards.add(a); });
      // Re-enable unclaimed milestones if <3 claimed
      if (_gameMACache.claimedCount < 3) {
        _gameMACache.milestones.forEach(function(m) { ctx.milestones.add(m); });
      }
      ctx._awardsLoaded = true;
      return;
    }
    if (_gameMACache.fetching) return;
    _gameMACache.fetching = true;
    var url = window.location.origin + '/api/game?id=' + gameId;
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      _gameMACache.gameId = gameId;
      _gameMACache.gen = curGen;
      _gameMACache.awards = new Set();
      _gameMACache.milestones = new Set();
      _gameMACache.claimedCount = 0;
      if (data.awards) {
        data.awards.forEach(function(a) {
          if (a.funder_name || a.funder_color || a.fundedByPlayer) {
            _gameMACache.awards.add(a.name);
          }
        });
      }
      if (data.milestones) {
        data.milestones.forEach(function(m) {
          if (m.owner_name || m.owner_color) {
            _gameMACache.claimedCount++;
          } else {
            _gameMACache.milestones.add(m.name);
          }
        });
      }
      _gameMACache.fetching = false;
    }).catch(function() { _gameMACache.fetching = false; });
  }

  // Map + milestones/awards + terraform rate
  function extractMapAndRate(pv, ctx) {
    ctx.mapName = '';
    ctx.milestones = new Set();
    ctx.awards = new Set();
    ctx.terraformRate = 0;
    if (!pv || !pv.game) return;
    ctx.mapName = detectMap(pv.game);
    // Milestones + Awards: fetched from game API (playerView has no claim/fund status)
    // Milestones: only unclaimed ones added (if <3 claimed)
    // Awards: only funded ones added
    if (!ctx._awardsLoaded && pv.game.id) {
      _fetchGameMA(pv.game.id, ctx);
    }
    if (ctx.gen > 1) {
      var trTotal = 0;
      var gm = pv.game;
      if (typeof gm.temperature === 'number') trTotal += (gm.temperature + 30) / 2;
      if (typeof gm.oxygenLevel === 'number') trTotal += gm.oxygenLevel;
      if (typeof gm.oceans === 'number') trTotal += gm.oceans;
      ctx.terraformRate = trTotal / (ctx.gen - 1);
    }
  }

  // Turmoil context for a player
  function extractTurmoil(pv, playerColor, playerInfluence, ctx) {
    ctx.turmoilActive = false;
    ctx.rulingParty = '';
    ctx.myDelegates = 0;
    ctx.myInfluence = 0;
    ctx.dominantParty = '';
    if (!pv || !pv.game || !pv.game.turmoil) return;
    ctx.turmoilActive = true;
    var turm = pv.game.turmoil;
    if (turm.rulingParty) ctx.rulingParty = turm.rulingParty;
    ctx.dominantParty = turm.dominant || turm.dominantParty || '';
    ctx.myInfluence = playerInfluence || 0;
    if (turm.parties) {
      for (var i = 0; i < turm.parties.length; i++) {
        var party = turm.parties[i];
        if (!party.delegates) continue;
        for (var j = 0; j < party.delegates.length; j++) {
          var d = party.delegates[j];
          if (d === playerColor || (d && d.color === playerColor)) ctx.myDelegates++;
        }
      }
    }
    // Track coming/distant events for card scoring awareness
    ctx.comingEvent = turm.coming || '';
    ctx.distantEvent = turm.distant || '';
  }

  // ── Floater card detection via structured data ──

  function isFloaterCardByFx(cardName) {
    if (typeof TM_CARD_EFFECTS === 'undefined') return false;
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx) return false;
    return fx.res === 'floater' || fx.places === 'floater';
  }

  // ── Card owner detection (my card vs opponent's) ──

  function detectCardOwner(cardName) {
    var pv = getPlayerVueData();
    if (!pv) return null;
    // My tableau — return null (own card)
    if (pv.thisPlayer && pv.thisPlayer.tableau) {
      for (var i = 0; i < pv.thisPlayer.tableau.length; i++) {
        if ((cardN(pv.thisPlayer.tableau[i])) === cardName) return null;
      }
    }
    // Search opponent tableaus
    if (pv.game && pv.game.players) {
      var myColor = pv.thisPlayer ? pv.thisPlayer.color : null;
      for (var j = 0; j < pv.game.players.length; j++) {
        var opp = pv.game.players[j];
        if (opp.color === myColor) continue;
        if (opp.tableau) {
          for (var k = 0; k < opp.tableau.length; k++) {
            if ((cardN(opp.tableau[k])) === cardName) return opp;
          }
        }
      }
    }
    return null; // not in any tableau (draft/hand/shop)
  }

  // ── Opponent context cache ──
  var _oppCtxCache = {};   // color → { ctx, time }
  var _oppCtxCacheGen = 0; // reset when generation changes

  // Score a card from an opponent's perspective (reusable DRY helper)
  function scoreFromOpponentPerspective(cardName, oppPlayer, cardEl, pv) {
    var oCtx = getCachedOpponentContext(oppPlayer, pv);
    var oppTab = oCtx._allMyCards || [];
    var oCorp = oCtx._myCorps && oCtx._myCorps.length > 0 ? oCtx._myCorps[0] : '';
    return scoreDraftCard(cardName, oppTab, [], oCorp, cardEl, oCtx);
  }

  function getCachedOpponentContext(oppPlayer, pv) {
    var color = oppPlayer.color;
    var gen = detectGeneration();
    if (gen !== _oppCtxCacheGen) { _oppCtxCache = {}; _oppCtxCacheGen = gen; }
    var cached = _oppCtxCache[color];
    if (cached && Date.now() - cached.time < 5000) return cached.ctx;
    var ctx = buildOpponentContext(oppPlayer, pv);
    _oppCtxCache[color] = { ctx: ctx, time: Date.now() };
    return ctx;
  }

  function buildOpponentContext(oppPlayer, pv) {
    var gen = detectGeneration();
    var gensLeft = estimateGensLeft(pv);

    // Detect opponent corp from tableau
    var oppCorps = [];
    if (oppPlayer.tableau) {
      for (var i = 0; i < oppPlayer.tableau.length; i++) {
        var cn = cardN(oppPlayer.tableau[i]);
        if (oppPlayer.tableau[i].cardType === 'corp' || (TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp')) {
          oppCorps.push(cn);
        }
      }
    }
    if (oppCorps.length === 0 && oppPlayer.corporationCard) {
      var corpN = corpName(oppPlayer);
      if (corpN) oppCorps.push(corpN);
    }
    // Normalize opponent corp names via resolver
    for (var ri = 0; ri < oppCorps.length; ri++) oppCorps[ri] = resolveCorpName(oppCorps[ri]);

    var ctx = {
      gen: gen,
      gensLeft: gensLeft,
      tags: {},
      discounts: {},
      tagTriggers: [],
      mc: oppPlayer.megaCredits || 0,
      steel: oppPlayer.steel || 0,
      steelVal: oppPlayer.steelValue || SC.defaultSteelVal,
      titanium: oppPlayer.titanium || 0,
      tiVal: oppPlayer.titaniumValue || SC.defaultTiVal,
      heat: oppPlayer.heat || 0,
      colonies: oppPlayer.coloniesCount || 0,
      fleetSize: oppPlayer.fleetSize || 1,
      tradesUsed: oppPlayer.tradesThisGeneration || 0,
      tradesLeft: 0,
      coloniesOwned: 0,
      totalColonies: 0,
      colonyWorldCount: 0,
      prod: {
        mc: oppPlayer.megaCreditProduction || 0,
        steel: oppPlayer.steelProduction || 0,
        ti: oppPlayer.titaniumProduction || 0,
        plants: oppPlayer.plantProduction || 0,
        energy: oppPlayer.energyProduction || 0,
        heat: oppPlayer.heatProduction || 0,
      },
      tr: oppPlayer.terraformRating || 0,
      // M/A — skip for opponents (complex, low ROI)
      activeMA: [],
      milestoneNeeds: {},
      milestoneSpecial: {},
      awardTags: {},
      awardRacing: {},
      // Board state
      cities: 0,
      greeneries: 0,
      events: 0,
      handSize: oppPlayer.cardsInHandNbr || 0,
      tableauSize: oppPlayer.tableau ? oppPlayer.tableau.length : 0,
      uniqueTagCount: 0,
      tableauNames: new Set(),
      // Board spaces (shared)
      emptySpaces: 0,
      totalOccupied: 0,
      oceansOnBoard: 0,
      boardFullness: 0,
      // Resource accum
      microbeAccumRate: 0,
      floaterAccumRate: 0,
      animalAccumRate: 0,
      hasEnergyConsumers: false,
      floaterTargetCount: 0,
      animalTargetCount: 0,
      microbeTargetCount: 0,
      // Cached
      _myCorps: oppCorps,
      bestSP: null,
    };

    ctx.tradesLeft = Math.max(0, ctx.fleetSize - ctx.tradesUsed);

    // Colonies
    extractColonies(pv, oppPlayer.color, ctx);

    // Cities/greeneries
    if (pv && pv.game && pv.game.playerTiles && oppPlayer.color && pv.game.playerTiles[oppPlayer.color]) {
      ctx.cities = pv.game.playerTiles[oppPlayer.color].cities || 0;
      ctx.greeneries = pv.game.playerTiles[oppPlayer.color].greeneries || 0;
    }

    // Single-pass tableau scan: events, tableauNames, resource accum, energy, targets
    if (oppPlayer.tableau) scanTableauForContext(oppPlayer.tableau, ctx);

    // Tags, discounts, triggers, board
    extractPlayerTags(oppPlayer.tags, ctx);
    applyCorpDiscounts(oppCorps, ctx);
    applyCardDiscounts(ctx);
    applyTagTriggers(ctx, oppCorps);
    computeBoardState(pv, ctx);

    // Global params, map, MA proximity, opponent scanning, turmoil
    extractGlobalParams(pv, ctx);
    extractMapAndRate(pv, ctx);
    processMAProximity(oppPlayer, oppPlayer.color, pv, ctx);
    scanOpponents(pv, oppPlayer.color, ctx);
    extractTurmoil(pv, oppPlayer.color, oppPlayer.influence || 0, ctx);

    // ── Reference anchors ──
    var spResult = computeAllSP(pv, ctx.gensLeft);
    ctx.bestSP = spResult ? spResult.best : null;
    ctx.allSP = spResult ? spResult.all : [];

    // Pre-cache fields for scoreDraftCard (single pass)
    ctx._playedEvents = new Set();
    var oppTableauArr = [];
    if (oppPlayer.tableau) {
      for (var oti = 0; oti < oppPlayer.tableau.length; oti++) {
        var ocn = cardN(oppPlayer.tableau[oti]);
        oppTableauArr.push(ocn);
        var od = TM_RATINGS[ocn];
        if (od && od.t === 'event') ctx._playedEvents.add(ocn);
      }
    }
    ctx._allMyCards = oppTableauArr;
    ctx._allMyCardsSet = new Set(oppTableauArr);
    ctx._handTagCounts = {};

    return ctx;
  }

  // ── Reason classification (positive vs negative) ──

  var _negWords = ['Конфликт', 'закрыто', 'Поздн', 'Позд.', 'Мало ', 'Нет ',
    'disease', 'бесполезн', 'Недостижимо', 'Табло полно', 'Доска полна',
    'Рука полна', 'Floater trap', 'Флоатер дорого', 'ест свои', 'Окупаем.',
    'Быстр. игра', 'Избыток', 'дефицит', 'Req ~', 'Req далеко',
    'Solar Logistics opp', 'Event не в табло', 'Прод. избыток',
    'Тепл. прод. бесп', 'Темп. макс', 'под атакой', 'Флоат.action поздно'];

  function isNegativeReason(r) {
    // Positive patterns that contain minus sign — payment reductions
    if (/^(Скидка|Сталь|Титан)\s/.test(r)) return false;
    // Discount arrow: "Anti-Grav → −2 MC", "Earth Office → −3 MC" — positive
    if (r.indexOf('\u2192 \u2212') >= 0 || r.indexOf('-> -') >= 0) return false;
    // Milestone proximity: "Mayor −1", "Builder −2" — positive
    if (/\s\u2212[123]$/.test(r) && r.length < 25) return false;
    // Any Unicode minus (U+2212) = penalty
    if (r.indexOf('\u2212') >= 0) return true;
    // Regular minus before digit: "Тайминг -3"
    if (/[\s(]\-\d/.test(r)) return true;
    // Negative keywords
    for (var i = 0; i < _negWords.length; i++) {
      if (r.indexOf(_negWords[i]) >= 0) return true;
    }
    // Starts with "Опп." or "Помогает опп"
    if (/^(Опп\.|Помогает опп)/.test(r)) return true;
    // Fallback: any reason ending with negative number = negative
    if (/[−\-]\d+$/.test(r)) return true;
    return false;
  }

  // ── Tooltip panel ──

  let tooltipEl = null;
  let tooltipHideTimer = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tm-tooltip-panel';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => {
      if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    });
    tooltipEl.addEventListener('mouseleave', () => scheduleHideTooltip(200));
    return tooltipEl;
  }

  // Build trigger hits HTML for tooltip (mine or opponent's tableau)
  function buildTriggerHtml(cardEl, isOppCard, oppOwner, oppCtx, pv) {
    if (!cardEl) return '';
    var tags = getCardTags(cardEl);
    if (tags.size === 0) return '';

    var tableauNames = [];
    if (isOppCard && oppOwner) {
      if (oppOwner.tableau) { for (var oi = 0; oi < oppOwner.tableau.length; oi++) tableauNames.push(cardN(oppOwner.tableau[oi])); }
      if (oppCtx && oppCtx._myCorps) { for (var ci = 0; ci < oppCtx._myCorps.length; ci++) { if (oppCtx._myCorps[ci]) tableauNames.push(oppCtx._myCorps[ci]); } }
    } else {
      if (pv && pv.thisPlayer && pv.thisPlayer.tableau) { for (var c of pv.thisPlayer.tableau) tableauNames.push(cardN(c)); }
      var corpsForTrig = detectMyCorps();
      for (var cft = 0; cft < corpsForTrig.length; cft++) { if (corpsForTrig[cft]) tableauNames.push(corpsForTrig[cft]); }
    }

    var hits = [];
    for (var ti = 0; ti < tableauNames.length; ti++) {
      var trigs = TAG_TRIGGERS[tableauNames[ti]];
      if (!trigs) continue;
      for (var tri = 0; tri < trigs.length; tri++) {
        for (var tag of tags) {
          if (trigs[tri].tags.includes(tag.toLowerCase())) {
            // eventOnly triggers (e.g. Optimal Aerobraking) only fire on event cards
            if (trigs[tri].eventOnly && cardEl && !cardEl.classList.contains('card-type--event')) break;
            hits.push(trigs[tri].desc); break;
          }
        }
      }
    }
    if (hits.length === 0) return '';
    var cls = isOppCard ? 'tm-tip-row--trigger-opp' : 'tm-tip-row--trigger';
    return '<div class="tm-tip-row ' + cls + '">\u26A1 ' + hits.map(escHtml).join(', ') + '</div>';
  }

  // Build unmet requirements HTML for tooltip
  function buildReqCheckHtml(cardEl, pv) {
    if (!cardEl || !pv || !pv.game) return '';
    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return '';
    var reqText = (reqEl.textContent || '').trim();
    var checks = [];
    var gp = pv.game;
    var isMax = /max/i.test(reqText);

    var tempMatch = reqText.match(/([\-\d]+)\s*°?C/i);
    var oxyMatch = reqText.match(/(\d+)\s*%?\s*O/i);
    var oceanMatch = reqText.match(/(\d+)\s*ocean/i);
    var venusMatch = reqText.match(/(\d+)\s*%?\s*Venus/i);

    if (tempMatch && typeof gp.temperature === 'number') { var rv = parseInt(tempMatch[1]); if (!(isMax ? gp.temperature <= rv : gp.temperature >= rv)) checks.push('Темп ' + gp.temperature + '°C/' + rv + '°C'); }
    if (oxyMatch && typeof gp.oxygenLevel === 'number') { var rv2 = parseInt(oxyMatch[1]); if (!(isMax ? gp.oxygenLevel <= rv2 : gp.oxygenLevel >= rv2)) checks.push('O\u2082 ' + gp.oxygenLevel + '%/' + rv2 + '%'); }
    if (oceanMatch && typeof gp.oceans === 'number') { var rv3 = parseInt(oceanMatch[1]); if (!(isMax ? gp.oceans <= rv3 : gp.oceans >= rv3)) checks.push('Океаны ' + gp.oceans + '/' + rv3); }
    if (venusMatch && typeof gp.venusScaleLevel === 'number') { var rv4 = parseInt(venusMatch[1]); if (!(isMax ? gp.venusScaleLevel <= rv4 : gp.venusScaleLevel >= rv4)) checks.push('Венера ' + gp.venusScaleLevel + '%/' + rv4 + '%'); }

    if (checks.length === 0) return '';
    return '<div class="tm-tip-row tm-tip-row--error">\u2717 ' + checks.join(' | ') + '</div>';
  }

  // Split reasons into positive/negative and render as column
  function buildReasonsHtml(tipReasons) {
    if (!tipReasons) return '';
    var allR = tipReasons.split('|');
    var posR = [], negR = [];
    for (var ri = 0; ri < allR.length; ri++) {
      if (isNegativeReason(allR[ri])) negR.push(allR[ri]);
      else posR.push(allR[ri]);
    }
    var html = '';
    if (posR.length > 0) {
      html += '<div class="tm-tip-row tm-tip-row--positive' + (negR.length > 0 ? '' : ' tm-tip-row--divider') + '">';
      for (var pi = 0; pi < posR.length; pi++) {
        html += '<div>+ ' + escHtml(posR[pi]) + '</div>';
      }
      html += '</div>';
    }
    if (negR.length > 0) {
      html += '<div class="tm-tip-row tm-tip-row--negative tm-tip-row--divider">';
      for (var ni = 0; ni < negR.length; ni++) {
        html += '<div>\u2212 ' + escHtml(negR[ni]) + '</div>';
      }
      html += '</div>';
    }
    return html;
  }

  // ROI line: value − cost = profit (with tableau discounts)
  function buildROIHtml(name, isOppCard, oppCtx) {
    var ctx0 = isOppCard && oppCtx ? oppCtx : getCachedPlayerContext();
    var fx0 = getFx(name);
    if (!fx0 || !ctx0) return '';
    var mcVal = computeCardValue(fx0, ctx0.gensLeft);
    var baseCost = (fx0.c || 0) + SC.draftCost;
    // Apply tableau discounts (Warp Drive, Earth Office, etc.)
    var cardTagSet = new Set();
    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fxTags = TM_CARD_EFFECTS[name];
      if (fxTags && fxTags.tags) { for (var ti = 0; ti < fxTags.tags.length; ti++) cardTagSet.add(fxTags.tags[ti]); }
    }
    if (cardTagSet.size === 0 && typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name] && TM_RATINGS[name].g) {
      TM_RATINGS[name].g.split(',').forEach(function(t) { cardTagSet.add(t.trim().toLowerCase()); });
    }
    var effectiveCost = (ctx0.discounts && cardTagSet.size > 0)
      ? getEffectiveCost(fx0.c || 0, cardTagSet, ctx0.discounts) + SC.draftCost
      : baseCost;
    var roi0 = mcVal - effectiveCost;
    var roiColor = roi0 >= 10 ? '#2ecc71' : roi0 >= 0 ? '#f1c40f' : '#e74c3c';
    var costStr = effectiveCost < baseCost
      ? '<s>' + baseCost + '</s> ' + effectiveCost
      : '' + effectiveCost;
    return '<div class="tm-tip-row tm-tip-row--divider">'
      + 'Ценность ' + Math.round(mcVal) + ' \u2212 Стоим. ' + costStr + ' = <span style="color:' + roiColor + '"><b>' + (roi0 >= 0 ? '+' : '') + Math.round(roi0) + ' MC</b></span>'
      + '</div>';
  }

  // EV line: TM_BRAIN.scoreCard expected value
  function buildEVHtml(name, cardEl, isOppCard, oppCtx, pv) {
    if (typeof TM_BRAIN === 'undefined' || typeof TM_BRAIN.scoreCard !== 'function') return '';
    var ctx0 = isOppCard && oppCtx ? oppCtx : getCachedPlayerContext();
    if (!ctx0) return '';

    // Extract card cost from DOM or data
    var cardCost = 0;
    if (cardEl) {
      var costEl = cardEl.querySelector('.card-number, .card-cost');
      if (costEl) cardCost = parseInt(costEl.textContent) || 0;
    }

    // Map content.js ctx → tm-brain state format
    var gp = ctx0.globalParams || {};
    var state = {
      game: {
        generation: ctx0.gen || 5,
        temperature: typeof gp.temp === 'number' ? gp.temp : -30,
        oxygenLevel: typeof gp.oxy === 'number' ? gp.oxy : 0,
        oceans: typeof gp.oceans === 'number' ? gp.oceans : 0,
        venusScaleLevel: typeof gp.venus === 'number' ? gp.venus : 0
      },
      players: [{}, {}, {}],  // 3P stub for ratePerGen calc
      thisPlayer: {
        tags: ctx0.tags || {},
        megaCredits: ctx0.mc || 0,
        steel: ctx0.steel || 0,
        titanium: ctx0.titanium || 0,
        steelValue: ctx0.steelVal || 2,
        titaniumValue: ctx0.tiVal || 3,
        plantProduction: ctx0.prod ? ctx0.prod.plants : 0,
        megaCreditProduction: ctx0.prod ? ctx0.prod.mc : 0,
        tableau: ctx0.tableauNames ? Array.from(ctx0.tableauNames).map(function(n) { return { name: n }; }) : []
      }
    };

    // Populate players array from pv for accurate ratePerGen
    if (pv && pv.players) {
      state.players = pv.players.map(function() { return {}; });
    }

    var card = { name: name, cost: cardCost };
    try {
      var result = TM_BRAIN.scoreCard(card, state);
      if (result == null || isNaN(result)) return '';

      // scoreCard already returns net EV (ev - cost)
      var net = Math.round(result);
      var netColor = net >= 10 ? '#2ecc71' : net >= 0 ? '#f1c40f' : '#e74c3c';

      return '<div class="tm-tip-row" style="font-size:12px;padding:3px 6px;background:rgba(156,39,176,0.08);border-left:2px solid #9c27b0;border-radius:3px">'
        + '<b style="color:#9c27b0">EV</b> '
        + '<span style="color:' + netColor + ';font-weight:bold">' + (net >= 0 ? '+' : '') + net + ' MC</span>'
        + '</div>';
    } catch (ex) {
      return '';
    }
  }

  // Personal play stats from Dynamic Card Ratings
  function buildPersonalStatsHtml(name) {
    if (!_cardStatsCache || !_cardStatsCache.cards || !_cardStatsCache.cards[name]) return '';
    var cs = _cardStatsCache.cards[name];
    if (cs.timesPlayed < 3) return '';
    var avgVP = (cs.totalVP / cs.timesPlayed).toFixed(1);
    var winRate = cs.timesPlayed > 0 ? Math.round(cs.wins / cs.timesPlayed * 100) : 0;
    var html = '<div class="tm-tip-row" style="font-size:12px;padding:4px 6px;background:rgba(52,152,219,0.1);border-radius:3px;border-left:2px solid #3498db;margin-top:4px">';
    html += '<b style="color:#3498db">Твоя статистика</b><br>';
    html += cs.timesPlayed + ' игр | Avg VP: ' + avgVP + ' | Max: ' + cs.maxVP + ' | Win rate: ' + winRate + '%';
    // Avg gen played
    if (cs.genPlayedSum && cs.timesPlayed > 0) {
      var avgGen = (cs.genPlayedSum / cs.timesPlayed).toFixed(1);
      html += ' | Avg gen: ' + avgGen;
    }
    // Context breakdowns
    var ctxParts = [];
    if (cs.contexts.withColonies && cs.contexts.withColonies.count >= 2) {
      ctxParts.push('Колонии: ' + (cs.contexts.withColonies.totalVP / cs.contexts.withColonies.count).toFixed(1) + ' VP (' + cs.contexts.withColonies.count + ')');
    }
    if (cs.contexts.withTurmoil && cs.contexts.withTurmoil.count >= 2) {
      ctxParts.push('Турмоил: ' + (cs.contexts.withTurmoil.totalVP / cs.contexts.withTurmoil.count).toFixed(1) + ' VP (' + cs.contexts.withTurmoil.count + ')');
    }
    if (cs.contexts.withVenus && cs.contexts.withVenus.count >= 2) {
      ctxParts.push('Венера: ' + (cs.contexts.withVenus.totalVP / cs.contexts.withVenus.count).toFixed(1) + ' VP (' + cs.contexts.withVenus.count + ')');
    }
    if (cs.contexts.withWGT && cs.contexts.withWGT.count >= 2) {
      ctxParts.push('WGT: ' + (cs.contexts.withWGT.totalVP / cs.contexts.withWGT.count).toFixed(1) + ' VP (' + cs.contexts.withWGT.count + ')');
    }
    if (ctxParts.length > 0) {
      html += '<br><span style="color:#888">' + ctxParts.join(' | ') + '</span>';
    }
    html += '</div>';
    return html;
  }

  // Position tooltip near source element
  function positionTooltip(tip, srcEl) {
    if (!srcEl) return;
    var rect = srcEl.getBoundingClientRect();
    var tipW = tip.offsetWidth || 400;
    var tipH = tip.offsetHeight || 300;
    var left = rect.right + 10;
    var top = rect.top;
    if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 10;
    if (left < 8) left = 8;
    if (top + tipH > window.innerHeight - 8) top = window.innerHeight - tipH - 8;
    if (top < 8) top = 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function showTooltip(e, name, data) {
    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    const tip = ensureTooltip();
    const cardEl = e.target.closest('.card-container');
    var pv = getPlayerVueData();

    // === 0. Detect card owner (mine vs opponent's) ===
    var oppOwner = detectCardOwner(name);
    var isOppCard = !!oppOwner;
    var oppCtx = null;
    var oppScoreResult = null;
    if (isOppCard) {
      oppCtx = getCachedOpponentContext(oppOwner, pv);
      oppScoreResult = scoreFromOpponentPerspective(name, oppOwner, cardEl, pv);
    }

    // === 1. Header: dual score (COTD + EV) + cost + name ===
    var tipReasons = cardEl ? (cardEl.getAttribute('data-tm-reasons') || '') : '';
    var baseS = data.s;
    var baseT = data.t;
    // EV score removed — not useful in practice
    // Context-adjusted score (from badge with bonuses applied)
    var ctxScore = baseS;
    var ctxTier = baseT;
    if (isOppCard && oppScoreResult) {
      // For opponent cards: use score from their perspective
      ctxScore = Math.round(oppScoreResult.total * 10) / 10;
      ctxTier = scoreToTier(ctxScore);
      tipReasons = oppScoreResult.reasons.join('|');
    } else if (tipReasons && cardEl) {
      var tipBadge = cardEl.querySelector('.tm-tier-badge');
      if (tipBadge && tipBadge.textContent) {
        var bMatch = tipBadge.textContent.match(/[A-Z]\s*(\d+)/g);
        if (bMatch && bMatch.length >= 2) {
          ctxScore = parseInt(bMatch[bMatch.length - 1].replace(/[A-Z]\s*/, '')) || baseS;
          ctxTier = scoreToTier(ctxScore);
        }
      }
    }

    let html = '<div class="tm-tip-header">';
    // Opponent label
    if (isOppCard) {
      html += '<span class="tm-tip-opp">Для: ' + escHtml(oppOwner.name || '?') + '</span>';
    }
    // COTD score (primary)
    if (ctxScore !== baseS) {
      var ctxDelta = ctxScore - baseS;
      html += '<span class="tm-tip-tier tm-tier-' + baseT + '">' + baseT + baseS + '</span>';
      html += '<span style="color:#aaa;margin:0 3px">\u2192</span>';
      html += '<span class="tm-tip-tier tm-tier-' + ctxTier + '">' + ctxTier + ctxScore + '</span>';
      html += '<span style="color:' + (ctxDelta > 0 ? '#4caf50' : '#f44336') + ';font-weight:bold;margin-left:4px">' + (ctxDelta > 0 ? '+' : '') + ctxDelta + '</span> ';
    } else {
      html += '<span class="tm-tip-tier tm-tier-' + baseT + '">' + baseT + ' ' + baseS + '</span> ';
    }
    // EV display removed
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

    // === 1b. Card description (from TM source) ===
    if (typeof TM_CARD_DESCRIPTIONS !== 'undefined' && TM_CARD_DESCRIPTIONS[name]) {
      html += '<div class="tm-tip-row tm-tip-row--desc">' + escHtml(TM_CARD_DESCRIPTIONS[name]) + '</div>';
    }

    // === 2. Context reasons (split positive/negative) ===
    html += buildReasonsHtml(tipReasons);

    // === 3. ROI line ===
    html += buildROIHtml(name, isOppCard, oppCtx);

    // === 3a. EV line (tm-brain scoreCard) ===
    html += buildEVHtml(name, cardEl, isOppCard, oppCtx, pv);

    // === 3b. Card analysis (economy + timing) ===
    if (data.e) {
      html += '<div class="tm-tip-row">' + escHtml(data.e) + '</div>';
    }
    if (data.w) {
      html += '<div class="tm-tip-row tm-tip-row--muted">' + escHtml(data.w) + '</div>';
    }

    // === 4. Synergies (compact: corp + hand combos + key synergies) ===
    var synHtml = formatTooltipSynergies(name, data, isOppCard, oppCtx, pv);
    if (synHtml) html += synHtml;

    // === 6. Triggers from tableau (mine or opponent's) ===
    html += buildTriggerHtml(cardEl, isOppCard, oppOwner, oppCtx, pv);

    // === 7. Requirements check (only if unmet) ===
    html += buildReqCheckHtml(cardEl, pv);

    // === 8. Take-that warning (scales by player count) ===
    if (TAKE_THAT_CARDS[name]) {
      var ttPlayers = 3;
      var pvTT = getPlayerVueData();
      if (pvTT && pvTT.game && pvTT.game.players) ttPlayers = pvTT.game.players.length;
      var ttLabel = ttPlayers + 'P';
      html += '<div class="tm-tip-row tm-tip-row--warning">\u26A0 ' + ttLabel + ': ' + escHtml(TAKE_THAT_CARDS[name]) + '</div>';
    }

    // === 9. Combo (from card attribute) ===
    if (cardEl && cardEl.getAttribute('data-tm-combo')) {
      html += '<div class="tm-tip-row tm-tip-row--combo">\uD83D\uDD17 ' + escHtml(cardEl.getAttribute('data-tm-combo')) + '</div>';
    }

    // === 10. Anti-combo / conflict ===
    if (cardEl && cardEl.getAttribute('data-tm-anti-combo')) {
      html += '<div class="tm-tip-row tm-tip-row--conflict">\u26A0 Конфликт: ' + escHtml(cardEl.getAttribute('data-tm-anti-combo')) + '</div>';
    }

    // === 11. Dynamic Card Ratings — personal stats ===
    html += buildPersonalStatsHtml(name);

    tip.innerHTML = html;
    tip.style.display = 'block';

    positionTooltip(tip, cardEl || e.currentTarget);
  }

  function scheduleHideTooltip(delay) {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
      if (tooltipEl) tooltipEl.style.display = 'none';
      tooltipHideTimer = null;
    }, delay || 400);
  }

  function hideTooltip() {
    scheduleHideTooltip(400);
  }

  var escHtml = TM_UTILS.escHtml;

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

  // ── For The Nerd value table (gensLeft → [tr, prod, vp] in MC) ──

  var FTN_TABLE = TM_FTN_TABLE;
  var FTN_FALLBACK = [7, 5, 5]; // safe defaults: tr=7, prod=5, vp=5
  function ftnRow(gl) { return FTN_TABLE[gl] || FTN_TABLE[FTN_TABLE.length - 1] || FTN_FALLBACK; }

  const PROD_MUL = SC.prodMul;
  const RES_VAL = SC.resVal;

  function computeCardValue(fx, gensLeft, opts) {
    const gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    const row = ftnRow(gl);
    const trVal = row[0];
    const prod = row[1];
    const vpVal = row[2];
    var o2Maxed = opts && opts.o2Maxed;
    var tempMaxed = opts && opts.tempMaxed;

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

    // Global param raises (skip if param is maxed)
    if (fx.tmp && !tempMaxed) v += fx.tmp * trVal;
    if (fx.o2 && !o2Maxed) v += fx.o2 * trVal;
    if (fx.oc) v += fx.oc * (trVal + 3);  // ocean = TR + placement bonus
    if (fx.vn) v += fx.vn * trVal;

    // Tiles
    if (fx.grn) v += fx.grn * ((o2Maxed ? 0 : trVal) + vpVal + 3);  // greenery = O2 TR (if open) + 1VP + placement
    if (fx.city) v += fx.city * (3 + vpVal * 2);     // city = placement bonus + ~2VP adjacency

    // Take-that (halved for 3P — benefits third player)
    if (fx.rmPl) v += fx.rmPl * 1.6 * 0.5;
    if (fx.pOpp) v += Math.abs(fx.pOpp) * prod * 0.5;

    // VP accumulator (action: add resource, 1VP per N — VP value depends on game timing)
    if (fx.vpAcc) v += fx.vpAcc * gl * vpVal / Math.max(1, fx.vpPer || 1);

    // Blue action cards
    if (fx.actMC) v += fx.actMC * gl;
    if (fx.actTR) v += fx.actTR * gl * trVal;
    if (fx.actOc) v += fx.actOc * gl * (trVal + 4);  // action: ocean = TR + placement (~4 MC, ~11 total)
    if (fx.actCD) v += fx.actCD * gl * 3;

    return v;
  }

  // Deny-draft advisor — flag high-value cards that synergize with opponent corps
  // Returns reason string or null
  function checkDenyDraft(data, currentScore, ctx, cardTags, cardName, eLower) {
    if (!ctx || !ctx.oppCorps || ctx.oppCorps.length === 0 || !data) return null;
    if (!eLower) eLower = (data.e || '').toLowerCase();
    if (currentScore < SC.denyScoreThreshold && data.t !== 'S' && data.t !== 'A') return null;
    for (var oi = 0; oi < ctx.oppCorps.length; oi++) {
      var oc = ctx.oppCorps[oi];
      var ocShort = oc.substring(0, 12);

      // Layer A: CORP_ABILITY_SYNERGY — tag/keyword match
      var ocSyn = CORP_ABILITY_SYNERGY[oc];
      if (ocSyn) {
        var synMatch = false;
        if (cardTags && ocSyn.tags) {
          for (var ti = 0; ti < ocSyn.tags.length; ti++) {
            if (cardTags.has(ocSyn.tags[ti])) { synMatch = true; break; }
          }
        }
        if (!synMatch && eLower && ocSyn.kw) {
          for (var ki = 0; ki < ocSyn.kw.length; ki++) {
            if (eLower.includes(ocSyn.kw[ki])) { synMatch = true; break; }
          }
        }
        if (synMatch) return '\u2702 Deny от ' + ocShort;
      }

      // Layer B: getCorpBoost from opponent perspective
      if (cardName && data.e) {
        var oppBoost = getCorpBoost(oc, { eLower: eLower, cardTags: cardTags, cardCost: data.c || 0, cardName: cardName });
        if (oppBoost >= SC.denyCorpBoostThreshold) {
          return '\u2702 Deny: ' + ocShort + ' +' + oppBoost;
        }
      }

      // Layer C: card's y-list mentions opponent corp
      if (data.y) {
        for (var yi = 0; yi < data.y.length; yi++) {
          if (data.y[yi][0] === oc) return '\u2702 Deny: syn ' + ocShort;
        }
      }

      // Layer D: opponent corp's y-list mentions this card
      if (cardName) {
        var ocData = TM_RATINGS[oc];
        if (ocData && ocData.y) {
          for (var yj = 0; yj < ocData.y.length; yj++) {
            if (ocData.y[yj][0] === cardName) return '\u2702 Deny: ' + ocShort + ' wants';
          }
        }
      }
    }
    return null;
  }

  // Production break-even timer — penalty when production card won't pay off in remaining gens
  // Returns { penalty: number, reason: string|null }
  function scoreBreakEvenTiming(cardName, ctx, cardTags) {
    if (!ctx || !ctx.gensLeft || typeof TM_CARD_EFFECTS === 'undefined') return { penalty: 0, reason: null };
    // Skip during initial draft — gensLeft is full game, break-even always passes
    if (!ctx.tableauNames || ctx.tableauNames.size === 0) return { penalty: 0, reason: null };
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx) return { penalty: 0, reason: null };
    var totalProdPerGen = (fx.mp || 0) + (fx.sp || 0) * 2 + (fx.tp || 0) * 3 +
      (fx.pp || 0) * 1.5 + (fx.ep || 0) * 1.5 + (fx.hp || 0) * 0.5;
    if (totalProdPerGen <= 0) return { penalty: 0, reason: null };
    var printedCost = fx.c || 0;
    // Account for steel/titanium discounts (building/space tags)
    if (cardTags && cardTags.has('building') && ctx.steel > 0) {
      var stV = ctx.steelVal || SC.defaultSteelVal;
      printedCost = Math.max(0, printedCost - ctx.steel * stV);
    } else if (cardTags && cardTags.has('space') && ctx.titanium > 0) {
      var tiV = ctx.tiVal || SC.defaultTiVal;
      printedCost = Math.max(0, printedCost - ctx.titanium * tiV);
    }
    var effectiveCost = printedCost + SC.draftCost;
    // Subtract VP value (VP is immediate, not production — reduces effective cost)
    if (fx.vp) {
      var vpVal = fx.vp * (ctx.gensLeft <= 2 ? 7 : ctx.gensLeft <= 4 ? 5 : 3);
      effectiveCost = Math.max(0, effectiveCost - vpVal);
    }
    // Subtract TR value
    if (fx.tr) effectiveCost = Math.max(0, effectiveCost - fx.tr * 7);
    var breakEvenGens = Math.ceil(effectiveCost / Math.max(0.5, totalProdPerGen));
    if (breakEvenGens > ctx.gensLeft) {
      var penalty = Math.min(SC.breakEvenCap, (breakEvenGens - ctx.gensLeft) * SC.breakEvenMul);
      return { penalty: penalty, reason: 'Окупаем. ' + breakEvenGens + ' пок. (ост. ' + ctx.gensLeft + ') −' + penalty };
    }
    if (breakEvenGens === ctx.gensLeft && ctx.gensLeft <= 3) {
      return { penalty: 0, reason: 'Окуп. впритык (' + breakEvenGens + ' пок.)' };
    }
    return { penalty: 0, reason: null };
  }

  // Format tooltip synergies section (corps, hand combos, key synergies)
  // Returns HTML string or empty string
  function formatTooltipSynergies(cardName, data, isOppCard, oppCtx, pv) {
    var myCorpsTip = isOppCard && oppCtx ? oppCtx._myCorps : detectMyCorps();
    var synParts = [];
    // Corp synergy
    for (var tci = 0; tci < myCorpsTip.length; tci++) {
      var tipCorp = myCorpsTip[tci];
      if (data.y && data.y.some(function(syn) { return yName(syn) === tipCorp; })) {
        synParts.push('\u2605 ' + escHtml(tipCorp));
      }
    }
    // Hand card combos (skip for opponent)
    var handNames = isOppCard ? [] : getMyHandNames();
    if (handNames.length > 0 && data.y) {
      for (var hni = 0; hni < handNames.length; hni++) {
        var hName = handNames[hni];
        if (hName === cardName) continue;
        var hData = TM_RATINGS[hName];
        var thisMentions = data.y.some(function(s) { return yName(s).toLowerCase().includes(hName.toLowerCase()); });
        var handMentions = hData && hData.y && hData.y.some(function(s) { return yName(s).toLowerCase().includes(cardName.toLowerCase()); });
        if (thisMentions || handMentions) synParts.push('\uD83D\uDD17 ' + escHtml(hName));
      }
    }
    // Other synergies (max 3, skip already shown + skip taken milestones)
    if (data.y && data.y.length && yName(data.y[0]) !== 'None significant') {
      var claimedMs = new Set();
      var msAllFull = false;
      if (pv && pv.game && pv.game.milestones) {
        var claimedCount = 0;
        for (var mi = 0; mi < pv.game.milestones.length; mi++) {
          var ms = pv.game.milestones[mi];
          if (ms.playerName || ms.color) {
            claimedMs.add((ms.name || '').toLowerCase());
            claimedCount++;
          }
        }
        msAllFull = claimedCount >= 3;
      }
      var shown = 0;
      for (var ei = 0; ei < data.y.length; ei++) {
        if (shown >= 3) break;
        var syn = yName(data.y[ei]);
        if (myCorpsTip.indexOf(syn) !== -1) continue;
        if (handNames.some(function(h) { return syn.toLowerCase().includes(h.toLowerCase()); })) continue;
        if (/вэха|milestone/i.test(syn)) {
          if (msAllFull) continue;
          var msNameMatch = syn.match(/(?:вэха|milestone)\s+(.+)/i);
          if (msNameMatch && claimedMs.has(msNameMatch[1].toLowerCase().trim())) continue;
        }
        synParts.push(escHtml(syn));
        shown++;
      }
    }
    if (synParts.length === 0) return '';
    return '<div class="tm-tip-row">' + synParts.join(', ') + '</div>';
  }

  // Tag synergies — density, hand affinity, auto-synergy, corp ability, Pharmacy Union
  // Returns { bonus: number, reasons: string[] }
  function scoreTagSynergies(cardName, cardTags, cardType, cardCost, tagDecay, eLower, data, myCorps, ctx, pv) {
    var bonus = 0;
    var reasons = [];

    // 5. Tag density bonus — rare tags get bonus at lower counts
    // Event cards: tags go face-down, so no persistent tag density value
    // Space/Building: common tags, no density synergy (unlike Science/Jovian/Venus)
    if (cardTags.size > 0 && cardType !== 'red') {
      let bestBonus = 0;
      let bestTag = '';
      let bestCount = 0;
      for (const tag of cardTags) {
        const count = (ctx.tagsWithHand ? ctx.tagsWithHand[tag] : ctx.tags[tag]) || 0;
        const rarity = SC.tagRarity[tag] || 1;
        if (rarity <= 0) continue;
        let db = 0;
        if (count >= 6) db = SC.tagDensity6;
        else if (count >= 4) db = SC.tagDensity4;
        else if (count >= 2 && rarity >= 3) db = SC.tagDensity2Rare;
        else if (count >= 1 && rarity >= 5) db = SC.tagDensity1Epic;
        if (db > bestBonus) { bestBonus = db; bestTag = tag; bestCount = count; }
      }
      // Cap density bonus for cheap one-shot cards (e.g. Lagrange Observatory)
      if (bestBonus > 1 && cardCost != null && cardCost <= SC.tagDensityCheapCost) {
        var hasOngoing = eLower && (eLower.includes('action') || eLower.includes('действ') || eLower.includes('prod') || eLower.includes('прод'));
        if (!hasOngoing) bestBonus = SC.tagDensityCheapCap;
      }
      if (bestBonus > 0) {
        var decayedDensity = Math.round(bestBonus * tagDecay);
        if (decayedDensity > 0) {
          bonus += decayedDensity;
          reasons.push(bestTag + ' ×' + bestCount + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
        }
      }
    }

    // 5a2. Hand tag affinity — rare tags matching concentrated tags in hand
    if (cardTags.size > 0 && ctx && ctx._handTagCounts) {
      var htRarity = SC.tagRarity || {};
      var bestHtBonus = 0;
      var bestHtTag = '';
      var bestHtCount = 0;
      for (var htTag of cardTags) {
        var htCount = ctx._handTagCounts[htTag] || 0;
        var htR = htRarity[htTag] || 0;
        if (htR <= 0 || htCount < 2) continue;
        var htB = htCount >= 3 ? 2 : 1;
        if (htR >= 3) htB += 1;
        if (htB > bestHtBonus) { bestHtBonus = htB; bestHtTag = htTag; bestHtCount = htCount; }
      }
      if (bestHtBonus > 0) {
        var decayedHt = Math.round(bestHtBonus * tagDecay);
        if (decayedHt > 0) {
          bonus += decayedHt;
          reasons.push('рука ' + bestHtTag + ' ×' + bestHtCount + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
        }
      }
    }

    // 5b. Auto-synergy: card shares rare tags with corp/tableau trigger sources
    if (cardTags.size > 0 && myCorps.length > 0) {
      const RARE_TAG_VAL = SC.rareTagVal;
      let autoSynVal = 0;
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
      // Skip if CORP_ABILITY_SYNERGY will match this card (5c handles corp synergy)
      let alreadyHasCAS = false;
      for (var ami = 0; ami < myCorps.length; ami++) {
        var casChk = CORP_ABILITY_SYNERGY[myCorps[ami]];
        if (!casChk || casChk.b <= 0) continue;
        for (var cti = 0; cti < casChk.tags.length; cti++) {
          if (cardTags.has(casChk.tags[cti])) { alreadyHasCAS = true; break; }
        }
        if (!alreadyHasCAS && casChk.kw.length > 0 && data.e) {
          for (var kwi = 0; kwi < casChk.kw.length; kwi++) {
            if (eLower.includes(casChk.kw[kwi])) { alreadyHasCAS = true; break; }
          }
        }
        if (alreadyHasCAS) break;
      }
      if (autoSynVal >= SC.autoSynThreshold && !alreadyHasCAS) {
        bonus += Math.min(SC.autoSynCap, autoSynVal);
        reasons.push('Авто-синерг');
      }
    }

    // 5c. Corp ability synergy — tag/keyword matching (works during initial draft without game state)
    for (var casIdx = 0; casIdx < myCorps.length; casIdx++) {
      var casCorp = myCorps[casIdx];
      var cas = CORP_ABILITY_SYNERGY[casCorp];
      if (!cas || cas.b <= 0) continue;
      let casMatched = false;
      if (cas.tags.length > 0 && cardTags.size > 0) {
        for (const t of cas.tags) {
          if (cardTags.has(t)) { casMatched = true; break; }
        }
      }
      if (!casMatched && cas.kw.length > 0 && data.e) {
        for (const kw of cas.kw) {
          if (eLower.includes(kw)) {
            if ((kw === 'production' || kw === 'прод') && typeof TM_CARD_EFFECTS !== 'undefined') {
              var kwFx = TM_CARD_EFFECTS[cardName];
              if (kwFx) {
                var kwHasPosProd = (kwFx.mp > 0 || kwFx.sp > 0 || kwFx.tp > 0 || kwFx.pp > 0 || kwFx.ep > 0 || kwFx.hp > 0);
                if (!kwHasPosProd) continue;
              }
            }
            casMatched = true; break;
          }
        }
      }
      // Don't double-count with auto-synergy (5b) or TAG_TRIGGERS (4)
      const alreadyAutoSyn5c = (bonus > 0 && reasons.some(function(r) { return r.indexOf('Авто-синерг') !== -1; }));
      if (casMatched && !alreadyAutoSyn5c) {
        bonus += cas.b;
        var corpShort5c = casCorp.split(' ')[0];
        var alreadyInReasons5c = reasons.some(function(r) { return r.indexOf(corpShort5c) !== -1; });
        if (!alreadyInReasons5c) reasons.push('Корп: ' + corpShort5c);
      }
    }

    // 5d. Pharmacy Union specific — science tags cure/add disease, microbe generators help cure
    if (ctx.tableauNames && (ctx.tableauNames.has('Pharmacy Union') || myCorps.indexOf('Pharmacy Union') !== -1)) {
      var puDiseases = 0;
      if (pv && pv.thisPlayer && pv.thisPlayer.tableau) {
        for (var ti = 0; ti < pv.thisPlayer.tableau.length; ti++) {
          var tc = pv.thisPlayer.tableau[ti];
          if ((tc.name || tc) === 'Pharmacy Union') { puDiseases = tc.resources || 0; break; }
        }
      }
      var hasScienceTag = cardTags.has('science');
      var generatesMicrobes = eLower.includes('microbe') || eLower.includes('микроб') || eLower.includes('add 1 microbe') || eLower.includes('add 2 microbe');
      if (hasScienceTag) {
        if (puDiseases > 0) {
          bonus += SC.puCureBonus;
          reasons.push('PU cure +3MC (' + puDiseases + ' dis.)');
        } else {
          bonus -= SC.puDiseasePenalty;
          reasons.push('PU disease! −4MC');
        }
      }
      if (generatesMicrobes && puDiseases > 0) {
        bonus += SC.puMicrobeBonus;
        reasons.push('PU microbe→cure');
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Opponent awareness — plant/animal protection, take-that value, opponent advantage penalty
  // Returns { bonus: number, reasons: string[] }
  function scoreOpponentAwareness(cardName, eLower, data, cardTags, ctx) {
    var bonus = 0;
    var reasons = [];

    // 24b. Protected Habitats/Asteroid Deflection more valuable if opponent has attacks
    if (ctx.oppHasPlantAttack && (cardName === 'Protected Habitats' || cardName === 'Asteroid Deflection System')) {
      bonus += SC.plantProtect;
      reasons.push('Защита от атак опп.');
    }
    // Animal cards less valuable if opponent has Predators/Ants
    if (ctx.oppHasAnimalAttack && ANIMAL_TARGETS.has(cardName)) {
      bonus -= SC.animalAttackPenalty;
      reasons.push('Опп. атакует жив. −' + SC.animalAttackPenalty);
    }
    // Take-that cards slightly more valuable if opponents have strong engines
    if (TAKE_THAT_CARDS[cardName] && ctx.oppCorps.length > 0) {
      var hasStrongOpp = ctx.oppCorps.some(function(c) { return TM_STRONG_ENGINE_CORPS[c]; });
      if (hasStrongOpp) {
        bonus += SC.takeThatDenyBonus;
        reasons.push('Опп. сильный engine');
      }
    }

    // 41. Opponent advantage penalty — cards that help opponent corps
    if (ctx.oppCorps && ctx.oppCorps.length > 0 && data.e) {
      var oppPenalty = 0;
      for (var oci = 0; oci < ctx.oppCorps.length; oci++) {
        var oc = ctx.oppCorps[oci];
        var gVuln = TM_OPP_CORP_VULN_GLOBAL[oc];
        if (gVuln) {
          for (var gk = 0; gk < gVuln.length; gk++) {
            if (eLower.includes(gVuln[gk])) {
              oppPenalty = Math.max(oppPenalty, SC.oppAdvantagePenalty);
              break;
            }
          }
        }
        var iVuln = TM_OPP_CORP_VULN_INDIRECT[oc];
        if (iVuln) {
          for (var ik = 0; ik < iVuln.length; ik++) {
            if (eLower.includes(iVuln[ik])) {
              oppPenalty = Math.max(oppPenalty, Math.ceil(SC.oppAdvantagePenalty / 2));
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

    // 36b. Solar Logistics opponent
    if (ctx.oppHasSolarLogistics && cardTags.has('space') && cardTags.has('event')) {
      bonus -= SC.oppSolarLogistics;
      reasons.push('Solar Logistics opp −' + SC.oppSolarLogistics);
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Post-context checks — resource conversion, draw/hand optimizer, endgame chain,
  // floater trap, city adjacency, delegate leadership, CEO ability
  // Returns { bonus: number, reasons: string[] }
  function scorePostContextChecks(cardName, cardEl, eLower, data, cardTags, ctx, pv, myHand) {
    var bonus = 0;
    var reasons = [];

    // 38. Resource conversion synergy — cards that enable or improve conversions
    if (ctx && data.e) {
      // Plants→greenery: if player has high plant production but O₂ not maxed
      if (ctx.prod.plants >= 4 && ctx.globalParams && ctx.globalParams.oxy < SC.oxyMax) {
        if (eLower.includes('plant') || eLower.includes('раст') || eLower.includes('greener') || eLower.includes('озелен')) {
          bonus += SC.plantEngineConvBonus;
          reasons.push('Plant engine +' + SC.plantEngineConvBonus);
        }
      }
      // Heat conversion: cards that give heat when temp not maxed
      if (ctx.globalParams && ctx.globalParams.temp < SC.tempMax && ctx.prod.heat >= 4) {
        if (eLower.includes('heat') || eLower.includes('тепл')) {
          bonus += SC.heatConvBonus;
          reasons.push('Heat→TR +' + SC.heatConvBonus);
        }
      }
      // Microbe→TR: cards that place microbes when player has converters
      if (ctx.microbeAccumRate > 0) {
        if (eLower.includes('microbe') || eLower.includes('микроб')) {
          bonus += SC.microbeEngineBonus;
          reasons.push('Микроб engine +' + SC.microbeEngineBonus);
        }
      }
      // Floater accumulation when player has floater VP cards
      if (ctx.floaterAccumRate > 0) {
        if (isFloaterCardByFx(cardName)) {
          bonus += SC.floaterEngineBonus;
          reasons.push('Флоатер engine +' + SC.floaterEngineBonus);
        }
      }
      // Resource target synergy — placement cards more valuable with more targets in tableau
      if (FLOATER_TARGETS.has(cardName) && ctx.floaterTargetCount >= SC.resNetThreshold) {
        bonus += SC.resNetBonus;
        reasons.push('Флоат. сеть (' + ctx.floaterTargetCount + ')');
      }
      if (ANIMAL_TARGETS.has(cardName) && ctx.animalTargetCount >= SC.resNetThreshold) {
        bonus += SC.resNetBonus;
        reasons.push('Жив. сеть (' + ctx.animalTargetCount + ')');
      }
      if (MICROBE_TARGETS.has(cardName) && ctx.microbeTargetCount >= SC.resNetThreshold) {
        bonus += SC.resNetBonus;
        reasons.push('Микроб. сеть (' + ctx.microbeTargetCount + ')');
      }
    }

    // 40. Draw/Play hand size optimizer — draw cards penalty when hand full, bonus when empty
    if (ctx && data.e) {
      var isDrawCard40 = (eLower.includes('draw') || eLower.includes('рисуй') || eLower.includes('вытяни')) && !eLower.includes('withdraw');
      if (isDrawCard40) {
        var handSize = myHand ? myHand.length : 0;
        if (handSize >= SC.handFullThreshold) {
          bonus -= SC.handFullPenalty;
          reasons.push('Рука полна −' + SC.handFullPenalty);
        } else if (handSize <= SC.handEmptyThreshold) {
          bonus += SC.handEmptyBonus;
          reasons.push('Мало карт +' + SC.handEmptyBonus);
        }
      }
    }

    // 42. Endgame conversion chain — greenery cards before heat in final gen
    if (ctx && ctx.gensLeft <= 1 && data.e) {
      var isGreenerySource = eLower.includes('green') || eLower.includes('озелен') || eLower.includes('plant') || eLower.includes('раст');
      var isHeatSource = eLower.includes('heat') || eLower.includes('тепл');
      if (isGreenerySource && ctx.globalParams && ctx.globalParams.oxy < SC.oxyMax) {
        bonus += SC.endgameGreeneryBonus;
        reasons.push('Финал: озелен. +O₂ +' + SC.endgameGreeneryBonus);
      }
      if (isHeatSource && ctx.globalParams && ctx.globalParams.temp >= SC.tempMax) {
        bonus -= SC.endgameHeatPenalty;
        reasons.push('Темп. закрыта −' + SC.endgameHeatPenalty);
      }
    }

    // 42b. Floater trap detector (MCP: expensive floater cards rarely pay off in 3P)
    if (ctx) {
      var isFloaterCard42 = isFloaterCardByFx(cardName);
      var cost42b = data.c || 0;
      if (TM_FLOATER_TRAPS[cardName] && ctx.floaterTargetCount < 2) {
        bonus -= SC.floaterTrapKnown;
        reasons.push('⚠ Floater trap −' + SC.floaterTrapKnown);
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && !ctx.floaterAccumRate && ctx.floaterTargetCount === 0) {
        bonus -= SC.floaterTrapExpensive;
        reasons.push('Флоатер: 0 целей, нет engine −' + SC.floaterTrapExpensive);
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && !ctx.floaterAccumRate) {
        bonus -= Math.ceil(SC.floaterTrapExpensive / 2);
        reasons.push('Флоатер дорого без engine −' + Math.ceil(SC.floaterTrapExpensive / 2));
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && ctx.gensLeft && ctx.gensLeft <= 3) {
        bonus -= SC.floaterTrapLate;
        reasons.push('Флоат.action поздно −' + SC.floaterTrapLate);
      }
    }

    // 44. City adjacency planning — city cards better with greenery engine
    if (ctx && data.e) {
      if (eLower.includes('city') || eLower.includes('город')) {
        var myGreeneries = 0;
        if (pv && pv.game && pv.game.spaces && pv.thisPlayer) {
          for (var si = 0; si < pv.game.spaces.length; si++) {
            var sp = pv.game.spaces[si];
            if (sp.color === pv.thisPlayer.color && (isGreeneryTile(sp.tileType))) myGreeneries++;
          }
        }
        if (myGreeneries >= SC.cityGreeneryThreshold || ctx.prod.plants >= 4) {
          bonus += SC.cityAdjacencyBonus;
          reasons.push('Город+озелен. +' + SC.cityAdjacencyBonus);
        } else if (ctx.gensLeft <= 1 && myGreeneries < 2) {
          bonus -= SC.cityAdjacencyPenalty;
          reasons.push('Мало озелен. −' + SC.cityAdjacencyPenalty);
        }
      }
    }

    // 45. Delegate leadership opportunity
    if (ctx && ctx.turmoilActive && data.e) {
      if (eLower.includes('delegate') || eLower.includes('делегат')) {
        if (pv && pv.game && pv.game.turmoil && pv.game.turmoil.parties) {
          var leaderOpportunity = false;
          for (var pi = 0; pi < pv.game.turmoil.parties.length; pi++) {
            var party = pv.game.turmoil.parties[pi];
            if (!party.delegates) continue;
            var myDels = 0, maxOppDels = 0;
            for (var di = 0; di < party.delegates.length; di++) {
              var d = party.delegates[di];
              var dColor = d.color || d;
              if (dColor === (pv.thisPlayer && pv.thisPlayer.color)) myDels += (d.number || 1);
              else maxOppDels = Math.max(maxOppDels, d.number || 1);
            }
            if (myDels > 0 && myDels + 1 > maxOppDels) {
              leaderOpportunity = true;
              break;
            }
          }
          if (leaderOpportunity) {
            bonus += SC.delegateLeadershipBonus;
            reasons.push('Лидерство партии +' + SC.delegateLeadershipBonus);
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
        if (ceoE.includes('draw') || ceoE.includes('card') || ceoE.includes('рисуй')) ceoBonus = Math.min(SC.ceoDrawCap, gLeft);
        else if (ceoE.includes('discount') || ceoE.includes('скидк') || ceoE.includes('-') && ceoE.includes('mc')) ceoBonus = Math.min(SC.ceoDiscountCap, gLeft);
        else if (ceoE.includes('prod') || ceoE.includes('прод')) ceoBonus = Math.min(SC.ceoProdCap, Math.round(gLeft * SC.ceoProdMul));
        else if (ceoE.includes('vp') || ceoE.includes('vp per')) ceoBonus = Math.min(SC.ceoVPCap, Math.round(gLeft * SC.ceoVPMul));
        else if (ceoE.includes('action')) ceoBonus = Math.min(SC.ceoActionCap, gLeft);
        else ceoBonus = Math.min(SC.ceoGenericCap, Math.round(gLeft * SC.ceoGenericMul));
      }
      if (ceoBonus > 0) {
        bonus += ceoBonus;
        reasons.push('CEO пост. ×' + gLeft + ' +' + ceoBonus);
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Positional factors — stall, saturation, feasibility, std project comparison,
  // board fullness, resource accum VP, strategy detection, draw timing, stockpile
  // Returns { bonus: number, reasons: string[] }
  function scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet) {
    var bonus = 0;
    var reasons = [];

    // 23. Stall value — cheap action cards are underrated (extra action = delay round end)
    if (cardType === 'blue' && cardCost != null && cardCost <= SC.stallCostMax) {
      if (ctx.gensLeft >= 4) {
        bonus += SC.stallValue;
        reasons.push('Столл');
      } else if (ctx.gensLeft <= 2) {
        // Late game stall: extra action delays opponents from converting plants/greeneries first
        var fx23 = getFx(cardName);
        var hasUsefulAction23 = fx23 && (fx23.actTR || fx23.actMC || fx23.vpAcc || fx23.actCD || fx23.actOc);
        if (hasUsefulAction23) {
          bonus += 2;
          reasons.push('Столл late +2');
        }
      }
    }

    // 23b. Tableau saturation — blue cards less valuable when tableau is full late game
    if (cardType === 'blue' && ctx.tableauSize >= SC.tableauSatThreshold && ctx.gensLeft <= 2) {
      bonus -= SC.tableauSaturation;
      reasons.push('Табло полно −' + SC.tableauSaturation);
    }

    // 25. Parameter saturation — proportional penalty based on lost value fraction
    var sat25 = computeParamSaturation(cardName, ctx, baseScore);
    if (sat25.penalty > 0) {
      bonus -= sat25.penalty;
      reasons.push(sat25.reason);
    }

    // 26. Requirements feasibility — penalty if card can't be played anytime soon
    if (typeof TM_CARD_EFFECTS !== 'undefined' && !reqMet) {
      var fx26 = TM_CARD_EFFECTS[cardName];
      if (fx26 && fx26.minG) {
        // Scale minG by game length: longer games → minG pushed later
        var scaledMinG = fx26.minG;
        if (ctx.gensLeft > 8) scaledMinG = Math.round(fx26.minG * 1.3); // 4P no WGT
        var gensUntilPlayable = Math.max(0, scaledMinG - ctx.gen);
        if (gensUntilPlayable >= 2) {
          var reqPenalty = Math.min(SC.reqFarCap + 3, Math.round(gensUntilPlayable * 1.5));
          bonus -= reqPenalty;
          reasons.push('Req далеко −' + reqPenalty);
        }
      }
    }

    // 27. Standard project comparison — cards cheaper than std projects get bonus
    if (typeof TM_CARD_EFFECTS !== 'undefined' && cardCost != null) {
      var fx27 = TM_CARD_EFFECTS[cardName];
      if (fx27) {
        var stdBonus = 0;
        if (fx27.city && fx27.city >= 1 && cardCost <= SC.stdCityThreshold) {
          stdBonus += Math.min(SC.stdCityCap, Math.round((SC.stdCityRef - cardCost) / 2));
        }
        if (fx27.grn && fx27.grn >= 1 && cardCost <= SC.stdGreenThreshold) {
          stdBonus += Math.min(SC.stdGreenCap, Math.round((SC.stdGreenRef - cardCost) / 2));
        }
        if (fx27.oc && fx27.oc >= 1 && cardCost <= SC.stdOceanThreshold) {
          stdBonus += Math.min(SC.stdOceanCap, Math.round((SC.stdOceanRef - cardCost) / 2));
        }
        if (stdBonus > 0) {
          bonus += stdBonus;
          reasons.push('Дешевле std +' + stdBonus);
        }
      }
    }

    // 28. Board fullness — placement cards penalized when board is filling up
    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx28 = TM_CARD_EFFECTS[cardName];
      if (fx28 && (fx28.city || fx28.grn)) {
        if (ctx.boardFullness > SC.boardFullThreshold) {
          bonus -= SC.boardFullPenalty;
          reasons.push('Доска полна −' + SC.boardFullPenalty);
        } else if (ctx.emptySpaces <= SC.boardTightThreshold) {
          bonus -= SC.boardTightPenalty;
          reasons.push('Мало мест −' + SC.boardTightPenalty);
        }
      }
    }

    // 29. Resource accumulation VP bonus — VP-per-resource cards better when accum rate > 0
    if (data.e) {
      if (eLower.includes('vp') || eLower.includes('1 vp')) {
        if (eLower.includes('animal') && ctx.animalAccumRate > 0) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.animalAccumRate * 2);
          reasons.push('Жив. VP +' + Math.min(SC.resourceAccumVPCap, ctx.animalAccumRate * 2));
        }
        if (eLower.includes('microb') && ctx.microbeAccumRate > 0) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.microbeAccumRate * 2);
          reasons.push('Мик. VP +' + Math.min(SC.resourceAccumVPCap, ctx.microbeAccumRate * 2));
        }
        if (isFloaterCardByFx(cardName) && ctx.floaterAccumRate > 0) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.floaterAccumRate * 2);
          reasons.push('Флоат. VP +' + Math.min(SC.resourceAccumVPCap, ctx.floaterAccumRate * 2));
        }
      }
    }

    // 30. Strategy detection — committed directions get bonus
    // Uses tagsWithHand: cards in hand show strategic commitment too
    if (cardTags.size > 0) {
      for (var tag of cardTags) {
        var threshold = SC.strategyThresholds[tag];
        var tagCountStrat = (ctx.tagsWithHand ? ctx.tagsWithHand[tag] : ctx.tags[tag]) || 0;
        if (threshold && tagCountStrat >= threshold) {
          var depth = tagCountStrat - threshold;
          var stratBonusRaw = Math.min(SC.strategyCap, SC.strategyBase + depth);
          var stratBonus = Math.round(stratBonusRaw * tagDecay);
          if (stratBonus > 0) {
            bonus += stratBonus;
            reasons.push(tag + ' стратегия +' + stratBonus + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
          }
          break;
        }
      }
    }

    // 31. Card draw engine timing — draw cards valuable early, dead late
    if (data.e) {
      var isDrawCard = (eLower.includes('draw') || eLower.includes('рисуй') || eLower.includes('вытяни')) && !eLower.includes('withdraw');
      if (isDrawCard) {
        if (ctx.gensLeft >= 5) {
          bonus += SC.drawEarlyBonus;
          reasons.push('Рисовка рано +' + SC.drawEarlyBonus);
        } else if (ctx.gensLeft >= 3) {
          bonus += SC.drawMidBonus;
          reasons.push('Рисовка mid +' + SC.drawMidBonus);
        } else if (ctx.gensLeft <= 1) {
          // Last gen: drawn cards can't be played (no MC, no time) — heavy penalty
          bonus -= 8;
          reasons.push('Рисовка last gen −8');
        } else if (ctx.gensLeft <= 2) {
          bonus -= SC.drawLatePenalty;
          reasons.push('Рисовка поздно −' + SC.drawLatePenalty);
        }
      }
    }

    // 31b. MC-only effects in last gen — MC without VP conversion = wasted
    if (ctx.gensLeft <= 1 && data.e) {
      var fx31b = getFx(cardName);
      if (fx31b) {
        var isMCOnly = (fx31b.actMC > 0 || fx31b.mp > 0) && !fx31b.vp && !fx31b.vpAcc && !fx31b.tr && !fx31b.tmp && !fx31b.o2 && !fx31b.oc && !fx31b.vn && !fx31b.grn && !fx31b.city;
        if (isMCOnly && !eLower.includes('vp') && !eLower.includes('вп')) {
          bonus -= 5;
          reasons.push('MC бесполезны last gen −5');
        }
      }
    }

    // 32. Steel/Titanium resource stockpile — building/space cards cheaper when resources available
    if (cardTags.has('building') && ctx.steel >= SC.steelStockpileThreshold) {
      var stBonus32 = Math.min(SC.steelStockpileCap, Math.floor(ctx.steel / SC.steelStockpileDivisor));
      bonus += stBonus32;
      reasons.push('Steel ' + ctx.steel + ' +' + stBonus32);
    }
    if (cardTags.has('space') && ctx.titanium >= SC.tiStockpileThreshold) {
      var tiBonus32 = Math.min(SC.tiStockpileCap, Math.floor(ctx.titanium / SC.tiStockpileDivisor));
      bonus += tiBonus32;
      reasons.push('Ti ' + ctx.titanium + ' +' + tiBonus32);
    }

    // 32b. Space card penalty when 0 titanium — must pay full MC
    if (cardTags.has('space') && ctx.titanium === 0 && cardCost != null && cardCost >= SC.tiPenaltyCostThreshold) {
      var tiCap32 = cardCost >= SC.tiPenaltyCostHigh ? SC.tiPenaltyCapHigh : SC.tiPenaltyCapLow;
      var tiPenalty32 = Math.min(tiCap32, Math.ceil(cardCost / SC.tiPenaltyDivisor));
      bonus -= tiPenalty32;
      reasons.push('0 Ti −' + tiPenalty32);
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Card economy in context — multi-tag, production timing, action ROI, event tags,
  // steel/ti prod synergy, diminishing returns, VP accumulation, affordability
  // Returns { bonus: number, reasons: string[] }
  function scoreCardEconomyInContext(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, skipCrudeTiming) {
    var bonus = 0;
    var reasons = [];

    // 0. Unplayable/distant global requirements — uses TM_CARD_GLOBAL_REQS
    if (ctx.globalParams && typeof TM_CARD_GLOBAL_REQS !== 'undefined') {
      var _greq0 = TM_CARD_GLOBAL_REQS[cardName];
      if (_greq0) {
        var _dead0 = false;
        var _paramMap = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
        // Max requirements (e.g. "≤3 oceans") — permanently unplayable if exceeded
        for (var _p0 in _paramMap) {
          if (_greq0[_p0] && _greq0[_p0].max != null && (ctx.globalParams[_paramMap[_p0]] || 0) > _greq0[_p0].max) _dead0 = true;
        }
        if (_dead0) {
          bonus += -50;
          reasons.push('Невозможно сыграть −50');
        }
        // Max requirement proximity: warn when close to becoming unplayable
        if (!_dead0) {
          for (var _p0prx in _paramMap) {
            if (_greq0[_p0prx] && _greq0[_p0prx].max != null) {
              var _curPrx = ctx.globalParams[_paramMap[_p0prx]] || 0;
              var _maxPrx = _greq0[_p0prx].max;
              var _stepPrx = _p0prx === 'temperature' ? 2 : (_p0prx === 'venus' ? 2 : 1);
              var _stepsToMax = Math.floor((_maxPrx - _curPrx) / _stepPrx);
              if (_stepsToMax <= 2 && _stepsToMax >= 0) {
                var _urgPen = _stepsToMax <= 0 ? -50 : _stepsToMax === 1 ? -8 : -4;
                bonus += _urgPen;
                reasons.push('Окно закрывается ' + _p0prx + ' ' + _urgPen);
              }
            }
          }
        }
        // Min requirements (e.g. "requires -12°C") — may be met by hand cards or WGT
        if (!_dead0) {
          // Count parameter steps available from hand cards
          var _handSteps0 = { temperature: 0, oxygen: 0, oceans: 0, venus: 0 };
          if (typeof TM_CARD_EFFECTS !== 'undefined') {
            var _hc0 = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
            for (var _hi0 = 0; _hi0 < _hc0.length; _hi0++) {
              if (_hc0[_hi0] === cardName) continue;
              var _hfx0 = TM_CARD_EFFECTS[_hc0[_hi0]];
              if (!_hfx0) continue;
              if (_hfx0.tmp) _handSteps0.temperature += _hfx0.tmp;
              if (_hfx0.o2) _handSteps0.oxygen += _hfx0.o2;
              if (_hfx0.oc) _handSteps0.oceans += _hfx0.oc;
              if (_hfx0.vn) _handSteps0.venus += _hfx0.vn;
              // Greeneries raise oxygen
              if (_hfx0.grn) _handSteps0.oxygen += _hfx0.grn;
            }
          }
          for (var _p0m in _paramMap) {
            if (_greq0[_p0m] && _greq0[_p0m].min != null) {
              var _cur0 = ctx.globalParams[_paramMap[_p0m]] || 0;
              var _need0 = _greq0[_p0m].min;
              if (_cur0 < _need0) {
                var _gap0 = _need0 - _cur0;
                var _step0 = _p0m === 'temperature' ? 2 : 1;
                var _stepsNeeded = Math.ceil(_gap0 / _step0);
                // Subtract steps available from hand cards
                var _handCanProvide = _handSteps0[_p0m] || 0;
                var _netSteps = Math.max(0, _stepsNeeded - _handCanProvide);
                // If hand can fully reach the requirement → no penalty
                if (_netSteps <= 0) continue;
                // WGT + opponents also raise params — account for that
                // In 4P WGT, ~2-3 param steps/gen from others; in 3P WGT ~1-2; no WGT ~1
                var _othersRate = 1; // baseline: opponents raise params
                var _pv0 = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
                if (_pv0 && _pv0.game && _pv0.game.gameOptions) {
                  var _wgt0 = _pv0.game.gameOptions.solarPhaseOption;
                  var _pl0 = (_pv0.game.players || []).length || 3;
                  _othersRate = (_wgt0 ? 1 : 0) + Math.max(0, (_pl0 - 1) * 0.5);
                }
                var _adjustedNet = Math.max(0, _netSteps - Math.round(_othersRate * ctx.gensLeft * 0.3));
                // Last gen: can't rely on WGT/opponents to raise params
                if (ctx.gensLeft <= 1 && _adjustedNet > 2) {
                  bonus += -30;
                  reasons.push('Req далеко ' + _p0m + ' −30');
                } else if (_adjustedNet > ctx.gensLeft) {
                  var _distPen = Math.min(12, Math.round(_adjustedNet * 2));
                  bonus += -_distPen;
                  reasons.push('Req далеко ' + _p0m + ' −' + _distPen);
                }
              }
            }
          }
        }
      }
    }

    // 0b. Unmet tag requirements: can't play without required tags (tableau + hand)
    if (typeof TM_CARD_TAG_REQS !== 'undefined') {
      var _treq0b = TM_CARD_TAG_REQS[cardName];
      if (_treq0b) {
        var _myTags0b = ctx.tags || {};
        var _handTags0b = {};
        var _htCards0b = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
        var _htCT0b = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
        for (var _h0i = 0; _h0i < _htCards0b.length; _h0i++) {
          if (_htCards0b[_h0i] === cardName) continue;
          var _h0arr = _htCT0b[_htCards0b[_h0i]] || [];
          for (var _h0j = 0; _h0j < _h0arr.length; _h0j++) {
            if (_h0arr[_h0j] !== 'event') _handTags0b[_h0arr[_h0j]] = (_handTags0b[_h0arr[_h0j]] || 0) + 1;
          }
        }
        var _miss0b = 0, _total0b = 0, _missList0b = [];
        for (var _t0b in _treq0b) {
          if (typeof _treq0b[_t0b] === 'object') continue; // skip global reqs
          _total0b++;
          var _have0b = (_myTags0b[_t0b] || 0) + (_handTags0b[_t0b] || 0);
          if (_have0b < _treq0b[_t0b]) {
            _miss0b += (_treq0b[_t0b] - _have0b);
            _missList0b.push(_t0b);
          }
        }
        if (_miss0b > 0 && _total0b > 0) {
          var _tp0b = ctx.gensLeft <= 1 ? -30 : Math.round(-8 * _miss0b / Math.max(ctx.gensLeft * 0.5, 1));
          bonus += _tp0b;
          reasons.push('Нет ' + _missList0b.join('+') + ' ' + _tp0b);
        }
      }
    }

    // 0c. N-dependent production scaling — cards whose prod depends on tag/tile count
    // FTN sees flat mp:1, but real value = N × gensLeft. Bonus = (N-1) × prodValue × gensLeft
    if (ctx && ctx.gensLeft >= 1) {
      var _SCALING = {
        'Interplanetary Trade':   { type: 'uniqueTags', prodPerN: 1 },
        'Community Services':     { type: 'noTagCards', prodPerN: 1 },
        'Satellites':             { type: 'tag', tag: 'space', prodPerN: 1 },
        'Worms':                  { type: 'tag', tag: 'microbe', prodPerN: 0.5 },
        'Gyropolis':              { type: 'tags', tags: ['venus', 'earth'], prodPerN: 1 },
        'Energy Saving':          { type: 'allCities', prodPerN: 1 },
        'Immigration Shuttles':   { type: 'allCities', vpPer: 3 },
        // Tag-count production cards
        'Cartel':                 { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Miranda Resort':         { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Luna Metropolis':        { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Insects':                { type: 'tag', tag: 'plant', prodPerN: 1 },
        'Power Grid':             { type: 'tag', tag: 'power', prodPerN: 1 },
        'Advanced Power Grid':    { type: 'tag', tag: 'power', prodPerN: 1 },
        'Medical Lab':            { type: 'tag', tag: 'building', prodPerN: 0.5 },
        'Parliament Hall':        { type: 'tag', tag: 'building', prodPerN: 0.33 },
        'Sulphur Exports':        { type: 'tag', tag: 'venus', prodPerN: 1 },
        'Martian Monuments':      { type: 'tag', tag: 'mars', prodPerN: 1 },
        'Racketeering':           { type: 'tag', tag: 'crime', prodPerN: 1 },
        'Lunar Mining':           { type: 'tag', tag: 'earth', prodPerN: 0.5 },
        'Zeppelins':              { type: 'allCities', prodPerN: 1 },
        // TR/resource scaling
        'Terraforming Ganymede':  { type: 'tag', tag: 'jovian', trPerN: 1 },
        'Social Events':          { type: 'tag', tag: 'mars', trPerN: 0.5 },
        // Colony scaling
        'Ecology Research':       { type: 'colonies', prodPerN: 1 },
        'Quantum Communications': { type: 'allColonies', prodPerN: 1 },
        'Cassini Station':        { type: 'allColonies', prodPerN: 1 },
        'Microgravity Nutrition': { type: 'colonies', prodPerN: 1 },
        // Instant MC scaling
        'Toll Station':           { type: 'oppTag', tag: 'space', mcPerN: 1 },
        'Flat Mars Theory':       { type: 'generation', prodPerN: 1 },
      };
      var _sc = _SCALING[cardName];
      if (_sc) {
        var _N = 0;
        if (_sc.type === 'uniqueTags') _N = (ctx.uniqueTagCount || 0) + 1; // +1 for this card's space tag
        else if (_sc.type === 'noTagCards') {
          // Count no-tag cards in tableau
          if (ctx.tableauNames) {
            var _ntCT = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
            ctx.tableauNames.forEach(function(tn) { if (!_ntCT[tn] || _ntCT[tn].length === 0) _N++; });
          }
          _N++; // this card itself has no tags
        }
        else if (_sc.type === 'tag') _N = (ctx.tags[_sc.tag] || 0) + (cardTags.has(_sc.tag) ? 1 : 0);
        else if (_sc.type === 'tags') {
          for (var _sti = 0; _sti < _sc.tags.length; _sti++) _N += (ctx.tags[_sc.tags[_sti]] || 0);
          for (var _stj = 0; _stj < _sc.tags.length; _stj++) { if (cardTags.has(_sc.tags[_stj])) _N++; }
        }
        else if (_sc.type === 'cities') _N = ctx.citiesCount || 0;
        else if (_sc.type === 'allCities') {
          _N = (ctx.citiesCount || 0) + Math.max(2, Math.round((ctx.gen || 1) * 0.6));
        }
        else if (_sc.type === 'colonies') _N = ctx.coloniesOwned || 0;
        else if (_sc.type === 'allColonies') {
          _N = (ctx.coloniesOwned || 0) + Math.max(2, Math.round((ctx.gen || 1) * 0.4));
        }
        else if (_sc.type === 'oppTag') {
          // Count tag across all opponents
          if (ctx.oppTags) _N = ctx.oppTags[_sc.tag] || 0;
          else _N = Math.round((ctx.gen || 1) * 0.8); // estimate
        }
        else if (_sc.type === 'generation') _N = ctx.gen || 1;

        if (_sc.prodPerN && _N > 1) {
          // FTN already counted 1 prod unit. Bonus = (N-1) × value per gen
          var _extraProd = (_N - 1) * _sc.prodPerN;
          var _scalingVal = Math.round(_extraProd * Math.min(ctx.gensLeft, 6));
          var _scalingBonus = Math.min(20, Math.round(_scalingVal * 0.4));
          bonus += _scalingBonus;
          reasons.push(_N + '× прод +' + _scalingBonus);
        }
        if (_sc.vpPer && _N >= _sc.vpPer) {
          var _vpFromN = Math.floor(_N / _sc.vpPer);
          var _vpBonus = Math.min(8, _vpFromN * 2);
          bonus += _vpBonus;
          reasons.push(_N + '→' + _vpFromN + ' VP +' + _vpBonus);
        }
        if (_sc.trPerN && _N > 1) {
          var _extraTR = (_N - 1) * _sc.trPerN;
          var _trBonus = Math.min(15, Math.round(_extraTR * 3));
          bonus += _trBonus;
          reasons.push(_N + '× TR +' + _trBonus);
        }
        if (_sc.mcPerN && _N > 0) {
          var _mcBonus = Math.min(10, Math.round(_N * _sc.mcPerN * 0.5));
          if (_mcBonus > 0) { bonus += _mcBonus; reasons.push(_N + '× MC +' + _mcBonus); }
        }
      }
    }

    // 16. Multi-tag bonus — cards with 2+ tags fire more triggers & help more M/A
    if (cardTags.size >= 2) {
      // Only give bonus if there are active triggers/awards that benefit
      var multiHits = 0;
      for (var tag of cardTags) {
        if (ctx.awardTags[tag]) multiHits++;
        if (ctx.milestoneNeeds[tag] !== undefined) multiHits++;
        for (var ti = 0; ti < ctx.tagTriggers.length; ti++) {
          if (ctx.tagTriggers[ti].tags.includes(tag) && !(ctx.tagTriggers[ti].eventOnly && cardType !== 'red')) { multiHits++; break; }
        }
      }
      if (multiHits >= 2) {
        var mtBonusRaw = Math.min(SC.multiTagCap, multiHits);
        var mtBonus = Math.round(mtBonusRaw * tagDecay);
        if (mtBonus > 0) {
          bonus += mtBonus;
          reasons.push(cardTags.size + ' тегов' + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
        }
      }
    }

    // 17. Late production penalty — production cards lose value as game ends
    if (!skipCrudeTiming && data.e) {
      var gl17 = ctx.gensLeft || 1;
      if (gl17 <= 4) {
        var isProd17 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        var isVP17 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        var isAction17 = eLower.includes('action') || eLower.includes('действие');
        if (isProd17 && !isVP17 && !isAction17) {
          var penaltyVal = gl17 <= 1 ? SC.lateProdGen9 : gl17 <= 2 ? SC.lateProdGen8 : gl17 <= 3 ? SC.lateProdGen7 : SC.lateProdGen6;
          bonus += penaltyVal;
          reasons.push('Позд. прод. ' + penaltyVal + ' (' + gl17 + ' пок.)');
        }
      }
    }

    // 18. Action card ROI — blue cards: gensLeft × value per activation
    if (cardType === 'blue' && ctx.gensLeft >= 1) {
      var fx18 = getFx(cardName);
      var actVal = fx18 ? ((fx18.actMC || 0) + (fx18.actTR || 0) * SC.actionROITRMul + (fx18.actOc || 0) * SC.actionROIOcMul + (fx18.actCD || 0) * SC.actionROICDMul) : 0;
      if (actVal > 0) {
        var totalROI = actVal * ctx.gensLeft;
        var roiAdj = ctx.gensLeft <= 2
          ? -Math.min(SC.actionROIPenCap, Math.round(actVal))
          : Math.min(SC.actionROIBonCap, Math.round(totalROI / SC.actionROIDivisor));
        if (roiAdj !== 0) {
          bonus += roiAdj;
          reasons.push('ROI ' + Math.round(actVal) + '×' + ctx.gensLeft + (roiAdj > 0 ? ' +' : ' ') + roiAdj);
        }
      } else if (!skipCrudeTiming) {
        if (ctx.gensLeft >= 6) { bonus += SC.crudeActionEarly; reasons.push('Ранний action +' + SC.crudeActionEarly); }
        else if (ctx.gensLeft >= 4) { bonus += SC.crudeActionMid; reasons.push('Action +' + SC.crudeActionMid); }
        else if (ctx.gensLeft <= 2) { bonus += SC.crudeActionLate; reasons.push('Поздн. action ' + SC.crudeActionLate); }
      }
    }

    // 19. Event tag: does NOT persist in tableau → doesn't help tag milestones/awards
    if (cardType === 'red' && cardTags.has('event')) {
      var eventPenalty = 0;
      for (var tag2 of cardTags) {
        if (tag2 === 'event') continue;
        if (ctx.milestoneNeeds[tag2] !== undefined) eventPenalty += SC.eventMilestonePenalty;
        if (ctx.awardTags[tag2]) eventPenalty += SC.eventAwardPenalty;
      }
      if (eventPenalty > 0) {
        bonus -= Math.min(SC.eventPenaltyCap, eventPenalty);
        reasons.push('Event: теги уйдут −' + Math.min(SC.eventPenaltyCap, eventPenalty));
      }
    }

    // 20. Steel/Titanium PRODUCTION synergy — scales with gensLeft
    var gl20 = ctx.gensLeft || 4;
    var prodTimeMul = Math.min(1.0, gl20 / 4); // full value at 4+ gens, scales down
    if (cardTags.has('building') && ctx.prod.steel >= 2) {
      var stProdBonus = Math.round(Math.min(SC.steelProdSynCap, Math.floor(ctx.prod.steel / 2)) * prodTimeMul);
      if (stProdBonus > 0) { bonus += stProdBonus; reasons.push('Стл.прод ' + ctx.prod.steel + '/пок'); }
    }
    if (cardTags.has('space') && ctx.prod.ti >= 1) {
      var tiProdBonus = Math.round(Math.min(SC.tiProdSynCap, ctx.prod.ti * 2) * prodTimeMul);
      if (tiProdBonus > 0) { bonus += tiProdBonus; reasons.push('Ti.прод ' + ctx.prod.ti + '/пок'); }
    }

    // 20b. Production diminishing returns — high prod makes more prod less impactful
    if (data.e && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx20 = TM_CARD_EFFECTS[cardName];
      if (fx20 && fx20.mp && fx20.mp > 0 && ctx.prod.mc >= SC.mcProdExcessThreshold) {
        bonus -= SC.mcProdExcessPenalty;
        reasons.push('Прод. избыток −' + SC.mcProdExcessPenalty);
      }
      if (fx20 && fx20.hp && fx20.hp > 0 && ctx.globalParams) {
        var tempStepsLeft20 = Math.max(0, (SC.tempMax - ctx.globalParams.temp) / SC.tempStep);
        if (tempStepsLeft20 <= 0) {
          // Temp maxed: heat is dead weight unless Helion/Insulation
          var hasHeatConv20 = ctx.tableauNames && (ctx.tableauNames.has('Helion') || ctx.tableauNames.has('Insulation') || ctx.tableauNames.has('Caretaker Contract'));
          var hpPen20 = hasHeatConv20 ? -3 : -6;
          bonus += hpPen20;
          reasons.push('Темп. макс ' + hpPen20);
        } else if (tempStepsLeft20 <= 2) {
          // Temp almost maxed: heat-prod will barely be useful
          bonus -= 2;
          reasons.push('Темп. ≈макс −2');
        }
      }
    }

    // 21. VP-per-resource timing — accumulator cards are better early
    if (!skipCrudeTiming && data.e) {
      var isAccumulator = (eLower.includes('1 vp per') || eLower.includes('1 vp за') ||
                           eLower.includes('vp per') || eLower.includes('vp за'));
      if (isAccumulator) {
        if (ctx.gensLeft >= 5) {
          bonus += SC.vpAccumEarly;
          reasons.push('VP-копилка рано +' + SC.vpAccumEarly);
        } else if (ctx.gensLeft >= 3) {
          bonus += SC.vpAccumMid;
          reasons.push('VP-копилка +' + SC.vpAccumMid);
        } else if (ctx.gensLeft <= 1) {
          bonus -= SC.vpAccumLate;
          reasons.push('VP-копилка поздно −' + SC.vpAccumLate);
        }
      }
    }

    // 21b. VP multiplier projection — actual expected VP vs base score assumption
    // Accounts for: tags on tableau, self-tag, tags in hand, projected future tags from drafts
    if (typeof TM_VP_MULTIPLIERS !== 'undefined') {
      var mult = TM_VP_MULTIPLIERS[cardName];
      if (mult && mult.vpPer) {
        var projectedVP = 0;
        if (mult.vpPer === 'jovian' || mult.vpPer === 'science' || mult.vpPer === 'space' || mult.vpPer === 'earth' || mult.vpPer === 'venus') {
          var targetTag = mult.vpPer;
          // Self-contribution (does this card add the target tag?)
          var selfAdded = 0;
          if (mult.selfTags) {
            for (var si21 = 0; si21 < mult.selfTags.length; si21++) {
              if (mult.selfTags[si21] === targetTag) selfAdded++;
            }
          }
          // Use pre-computed projected tags (tableau + hand + future drafts)
          var baseTagCount = (ctx.tagsProjected ? ctx.tagsProjected[targetTag] : ctx.tags[targetTag]) || 0;
          var totalTags = baseTagCount + selfAdded;
          projectedVP = totalTags * (mult.rate || 1);
        } else if (mult.vpPer === 'all_cities') {
          // Total cities on board for all players
          var totalCities = 0;
          if (pv && pv.game && pv.game.playerTiles) {
            for (var pc in pv.game.playerTiles) {
              totalCities += (pv.game.playerTiles[pc].cities || 0);
            }
          }
          // Estimate 1-2 more cities by end
          totalCities += 2;
          projectedVP = Math.floor(totalCities / (mult.divisor || 3));
        } else if (mult.vpPer === 'self_resource') {
          // VP from resources accumulated on the card via action
          // Realistic estimate: -1 gen for play delay, 0.8x for action slot competition
          var gLeft21b = ctx.gensLeft || 3;
          var activeGens = Math.max(0, gLeft21b - 1); // delay: must play card first
          var estResources = Math.round(Math.min(activeGens, 8) * 0.8); // 80% activation rate
          projectedVP = Math.floor(estResources / (mult.divisor || 1));
        }
        // Compare projected VP with baseline assumption
        var vpDelta21b = projectedVP - SC.vpMultBaseline;
        var vpMultBonus = Math.round(vpDelta21b * SC.vpMultScale);
        vpMultBonus = Math.max(vpMultBonus, -SC.vpMultCap);
        vpMultBonus = Math.min(vpMultBonus, SC.vpMultCap);
        if (vpMultBonus !== 0) {
          bonus += vpMultBonus;
          reasons.push('VP\u00d7' + mult.vpPer + ': ~' + projectedVP + ' VP (\u03b4' + (vpDelta21b >= 0 ? '+' : '') + vpDelta21b + ')');
        }
      }
    }

    // 22. Affordability check — can we actually pay for this card?
    // Skip during initial draft — we don't have MC yet, all cards are speculative
    // Detect initial draft: no tableau cards yet (no corp played)
    var isInitialDraft22 = !ctx.tableauNames || ctx.tableauNames.size === 0;
    if (cardCost != null && !isInitialDraft22) {
      var buyingPower = ctx.mc;
      if (cardTags.has('building')) buyingPower += ctx.steel * ctx.steelVal;
      if (cardTags.has('space')) buyingPower += ctx.titanium * ctx.tiVal;
      var effectiveCost22 = getEffectiveCost(cardCost, cardTags, ctx.discounts);

      if (buyingPower < effectiveCost22) {
        var deficit = effectiveCost22 - buyingPower;
        var runway = ctx.mc + ctx.prod.mc * Math.max(0, ctx.gensLeft - 1);
        var runwayTotal = runway;
        if (cardTags.has('building')) runwayTotal += (ctx.steel + ctx.prod.steel * Math.max(0, ctx.gensLeft - 1)) * ctx.steelVal;
        if (cardTags.has('space')) runwayTotal += (ctx.titanium + ctx.prod.ti * Math.max(0, ctx.gensLeft - 1)) * ctx.tiVal;

        if (runwayTotal < effectiveCost22 * 0.5) {
          bonus -= SC.affordRunway50;
          reasons.push('Недостижимо −' + SC.affordRunway50);
        } else if (runwayTotal < effectiveCost22) {
          bonus -= SC.affordRunway100;
          reasons.push('Runway мало −' + SC.affordRunway100);
        } else if (deficit > 15) {
          bonus -= SC.affordDeficit15;
          reasons.push('Нет MC (−' + deficit + ')');
        } else if (deficit > 8) {
          bonus -= SC.affordDeficit8;
          reasons.push('Мало MC (−' + deficit + ')');
        }
      }
    }

    // Hospitals / per-tag VP cards — dynamic VP based on tag count
    if (cardName === 'Hospitals' && ctx.tags) {
      var bldTags = (ctx.tags['building'] || 0) + 2; // current + this card + ~1 future
      var hospitalVP = Math.floor(bldTags / 2);
      var extraVP = hospitalVP - 1; // card_effects already counts 1 static VP
      if (extraVP > 0) {
        var vpBonus = Math.round(extraVP * (ctx.gensLeft >= 4 ? 5 : 7));
        bonus += vpBonus;
        reasons.push(bldTags + ' building → ' + hospitalVP + ' VP (+' + vpBonus + ')');
      }
    }

    // Arctic Algae penalty — discount value based on already-placed oceans
    if (cardName === 'Arctic Algae' && ctx.globalParams) {
      var oceansPlaced = ctx.globalParams.oceans || 0;
      if (oceansPlaced > 0) {
        // Each placed ocean = 2 plants lost (won't trigger). 0.75 MC per plant.
        var lostValue = Math.round(oceansPlaced * 2 * 0.75);
        bonus -= lostValue;
        reasons.push('−' + oceansPlaced + ' океанов уже (−' + lostValue + ')');
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Milestone/Award proximity — tag-based and non-tag M/A scoring with racing
  // Returns { bonus: number, reasons: string[] }
  function scoreMilestoneAwardProximity(cardTags, cardType, eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];

    // 9. Milestone proximity — tag-based
    if (cardTags.size > 0 && cardType !== 'red') {
      for (var tag of cardTags) {
        if (tag === 'event') continue;
        var need = ctx.milestoneNeeds[tag];
        if (need !== undefined) {
          var msBonus = need === 1 ? SC.milestoneNeed1 : need === 2 ? SC.milestoneNeed2 : SC.milestoneNeed3;
          bonus += msBonus;
          var maEntries = TAG_TO_MA[tag] || [];
          var msName = maEntries.find(function(m) { return m.type === 'milestone'; });
          reasons.push((msName ? msName.name : 'Веха') + ' ещё ' + need);
          break;
        }
      }
    }

    // 9b. Non-tag milestone proximity (cities, greeneries, events, TR, prod)
    if (data.e) {
      for (var key in ctx.milestoneSpecial) {
        var ms = ctx.milestoneSpecial[key];
        var helps = false;
        if (key === 'cities' && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps = true;
        if (key === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps = true;
        if (key === 'events' && cardType === 'red') helps = true;
        if (key === 'tr' && (eLower.includes('tr') || eLower.includes('terraform'))) helps = true;
        if (key.startsWith('prod_') && eLower.includes('prod')) helps = true;
        if (key === 'prod_energy' && (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power'))) helps = true;
        if (helps) {
          var msBonus2 = ms.need === 1 ? SC.milestoneNeed1 : ms.need === 2 ? SC.milestoneNeed2 : SC.milestoneNeed3;
          bonus += msBonus2;
          reasons.push(ms.name + ' −' + ms.need);
          break;
        }
      }
    }

    // 10. Award tag positioning
    if (cardTags.size > 0 && cardType !== 'red') {
      for (var tag2 of cardTags) {
        if (tag2 === 'event') continue;
        if (ctx.awardTags[tag2]) {
          var myCount = ctx.tags[tag2] || 0;  // awards count tableau tags only
          var racingMod = 0;
          var racingInfo = '';
          for (var awName in ctx.awardRacing) {
            var race = ctx.awardRacing[awName];
            var maEntry = MA_DATA[awName];
            if (maEntry && maEntry.tag && (maEntry.tag === tag2 || (maEntry.tag.indexOf('+') >= 0 && maEntry.tag.split('+').indexOf(tag2) >= 0))) {
              if (race.leading && race.delta >= 2) {
                racingMod = SC.racingLeadBig;
                racingInfo = ' лидер +' + race.delta;
              } else if (race.leading) {
                racingMod = SC.racingLeadSmall;
                racingInfo = ' лидер +' + race.delta;
              } else if (race.delta >= -1) {
                racingMod = SC.racingClose;
                racingInfo = ' −' + Math.abs(race.delta);
              } else {
                racingMod = SC.racingFar;
                racingInfo = ' −' + Math.abs(race.delta) + ' далеко';
              }
              break;
            }
          }
          var baseBonus = myCount >= 4 ? SC.awardBaseHigh : myCount >= 2 ? SC.awardBaseMid : SC.awardBaseLow;
          var awBonus = Math.max(0, baseBonus + racingMod);
          if (awBonus > 0) {
            bonus += awBonus;
            reasons.push('Награда: ' + tag2 + racingInfo);
          }
          break;
        }
      }
    }

    // 10b. Non-tag award racing
    if (data.e) {
      for (var awName2 in ctx.awardRacing) {
        var race2 = ctx.awardRacing[awName2];
        var maEntry2 = MA_DATA[awName2];
        if (!maEntry2 || (maEntry2.check === 'tags' && maEntry2.tag)) continue;
        var helps2 = false;
        if ((maEntry2.check === 'tiles' || maEntry2.check === 'cities') && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps2 = true;
        if (maEntry2.check === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps2 = true;
        if (maEntry2.check === 'greenCards' && cardType === 'green') helps2 = true;
        if (maEntry2.check === 'prod') {
          var prodRes = maEntry2.resource || '';
          if (prodRes === 'megacredits' && eLower.includes('mc') && eLower.includes('prod')) helps2 = true;
          else if (prodRes === 'plants' && (eLower.includes('plant') && eLower.includes('prod'))) helps2 = true;
          else if (prodRes.indexOf('+') >= 0) {
            // Compound: steel+titanium, energy+heat, etc.
            var resParts = prodRes.split('+');
            var fx2prod = getFx(cardName);
            if (fx2prod) {
              var prodMap = { steel: 'sp', titanium: 'tp', energy: 'ep', heat: 'hp', plants: 'pp', megacredits: 'mp' };
              for (var _rpi = 0; _rpi < resParts.length; _rpi++) {
                if (fx2prod[prodMap[resParts[_rpi]]]) { helps2 = true; break; }
              }
            }
          }
          else if (prodRes === '' && eLower.includes('prod')) helps2 = true; // generic prod match
        }
        if (maEntry2.check === 'tr') {
          // Benefactor: ANY terraforming action raises TR (temp, oxy, ocean, venus, greenery)
          var fx2tr = getFx(cardName);
          if (fx2tr && (fx2tr.tr || fx2tr.tmp || fx2tr.o2 || fx2tr.oc || fx2tr.vn || fx2tr.grn)) helps2 = true;
          if (eLower.includes('tr') || eLower.includes('terraform') || eLower.includes('temperature') ||
              eLower.includes('oxygen') || eLower.includes('ocean') || eLower.includes('venus')) helps2 = true;
        }
        if (maEntry2.check === 'resource' && maEntry2.resource === 'heat' && (eLower.includes('heat') || eLower.includes('тепл'))) helps2 = true;
        if (maEntry2.check === 'steelTi' && (cardTags.has('building') || cardTags.has('space') || eLower.includes('steel') || eLower.includes('titan'))) helps2 = true;
        if (maEntry2.check === 'cardResources' && (eLower.includes('resource') || eLower.includes('animal') || eLower.includes('microbe') || eLower.includes('floater'))) helps2 = true;
        if (helps2) {
          var racingMod2 = 0;
          if (race2.leading && race2.delta >= 2) racingMod2 = SC.racingLeadBig;
          else if (race2.leading) racingMod2 = SC.racingLeadSmall;
          else if (race2.delta >= -1) racingMod2 = 0;
          else racingMod2 = SC.racingFar;
          var awBonus2 = Math.max(0, SC.awardNonTagBase + racingMod2);
          if (awBonus2 > 0) {
            var sign = race2.delta > 0 ? '+' : '';
            bonus += awBonus2;
            reasons.push(awName2 + ' ' + sign + race2.delta);
          }
          break;
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Crude timing — early production bonus, late production/VP/action/discount penalties
  // Returns { bonus: number, reasons: string[] }
  function scoreCrudeTiming(cardName, eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];

    // 7. Early production bonus
    if (ctx.gen <= SC.earlyProdMaxGen && data.e) {
      var isProd = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isProd) {
        bonus += SC.earlyProdBonus;
        reasons.push('Ранняя прод.');
      }
    }

    // 7b. Late production penalty
    if (ctx.gensLeft <= 3 && data.e) {
      var isProd2 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isVP2 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isAction2 = eLower.includes('action') || eLower.includes('действие');
      if (isProd2 && !isVP2 && !isAction2) {
        var prodPenalty = ctx.gensLeft <= 1 ? SC.lateProdGL1 : ctx.gensLeft <= 2 ? SC.lateProdGL2 : SC.lateProdGL3;
        bonus += prodPenalty;
        reasons.push('Позд. прод. ' + prodPenalty);
      }
    }

    // 8. Late VP bonus (based on remaining gens, not absolute gen number)
    var gl8 = ctx.gensLeft || 1;
    if ((gl8 <= 4 || ctx.gen >= SC.lateVPMinGen) && data.e) {
      var isVP3 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isProd3 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isVP3 && !isProd3) {
        bonus += SC.lateVPBonus;
        reasons.push('Поздний VP');
      }
    }

    // 8b. Late VP burst
    if (ctx.gensLeft <= 3 && data.e) {
      if (eLower.includes('vp') || eLower.includes('вп') || eLower.includes('victory')) {
        var isProd4 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        if (!isProd4) {
          var vpBurst = ctx.gensLeft <= 1 ? SC.vpBurstGL1 : ctx.gensLeft <= 2 ? SC.vpBurstGL2 : SC.vpBurstGL3;
          bonus += vpBurst;
          reasons.push('VP burst +' + vpBurst);
        }
      }
    }

    // 8c. Action cards late game
    if (ctx.gensLeft <= 2 && data.e) {
      var isAction3 = eLower.includes('action') || eLower.includes('действие');
      var isVP4 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isAction3 && !isVP4) {
        var actPenalty = ctx.gensLeft <= 1 ? SC.actionLateGL1 : SC.actionLateGL2;
        bonus += actPenalty;
        reasons.push('Поздн. действие ' + actPenalty);
      } else if (isAction3 && isVP4 && ctx.gensLeft <= 1) {
        bonus += SC.actionVPLate;
        reasons.push('Мало активаций ' + SC.actionVPLate);
      }
    }

    // 8d. Discount sources late game
    if (ctx.gensLeft <= 2 && CARD_DISCOUNTS && CARD_DISCOUNTS[cardName]) {
      var discPenalty = ctx.gensLeft <= 1 ? SC.discountLateGL1 : SC.discountLateGL2;
      bonus += discPenalty;
      reasons.push('Скидка бесполезна ' + discPenalty);
    }

    // 8e. TR chase — if behind on TR, terraforming cards get bonus
    if (ctx.oppTRGap > 0 && data.e) {
      var fx8e = getFx(cardName);
      if (fx8e && (fx8e.tr || fx8e.tmp || fx8e.o2 || fx8e.oc || fx8e.vn)) {
        var trSteps = (fx8e.tr || 0) + (fx8e.tmp || 0) + (fx8e.o2 || 0) + (fx8e.oc || 0) + (fx8e.vn || 0);
        var chaseBonus = Math.min(4, Math.round(ctx.oppTRGap * 0.3 * trSteps));
        if (chaseBonus > 0) {
          bonus += chaseBonus;
          reasons.push('TR chase −' + ctx.oppTRGap + ' +' + chaseBonus);
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Resource synergies — energy consumers/pipeline, plant engine, heat conversion
  // Returns { bonus: number, reasons: string[] }
  function scoreResourceSynergies(eLower, data, cardTags, ctx) {
    var bonus = 0;
    var reasons = [];

    // 13. Energy consumers
    if (ctx.prod.energy >= 2 && data.e) {
      if (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power')) {
        if (eLower.includes('decrease') || eLower.includes('spend') || eLower.includes('снизь') || eLower.includes('-')) {
          var enBonus = Math.min(SC.energyConsumerCap, Math.floor(ctx.prod.energy / 2));
          if (enBonus > 0) {
            bonus += enBonus;
            reasons.push('Энерг: ' + ctx.prod.energy);
          }
        }
      }
    }

    // 13b. Energy pipeline — surplus energy without consumers
    if (ctx.prod.energy >= 3 && !ctx.hasEnergyConsumers) {
      if (data.e) {
        var consumesEnergy = eLower.includes('spend') || eLower.includes('decrease energy') || eLower.includes('−energy') || eLower.includes('energy-prod');
        if (consumesEnergy) {
          bonus += SC.energySinkBonus;
          reasons.push('Энерг. сток +' + SC.energySinkBonus);
        }
      }
      if (cardTags.has('power') && data.e) {
        if (eLower.includes('energy-prod') || eLower.includes('энерг-прод') || (eLower.includes('energy') && eLower.includes('prod'))) {
          bonus -= SC.energySurplusPenalty;
          reasons.push('Избыток энерг. −' + SC.energySurplusPenalty);
        }
      }
    }

    // 14. Plant engine — high plant prod + O2 awareness
    if (ctx.prod.plants >= 2 && data.e) {
      if (eLower.includes('plant') || eLower.includes('greenery') || eLower.includes('раст') || eLower.includes('озелен')) {
        var o2Maxed = ctx.globalParams && ctx.globalParams.oxy >= SC.oxyMax;
        var greenPerGen = Math.floor(ctx.prod.plants / SC.plantsPerGreenery);
        var plBonus;
        if (greenPerGen >= 1 && !o2Maxed) {
          plBonus = Math.min(SC.plantEngineCapStrong, greenPerGen * 2 + Math.floor(ctx.prod.plants / 3));
        } else if (greenPerGen >= 1 && o2Maxed) {
          plBonus = Math.min(SC.plantEngineCapWeak, greenPerGen + 1);
        } else {
          plBonus = Math.min(SC.plantEngineCapWeak, Math.floor(ctx.prod.plants / 3));
        }
        if (plBonus > 0) {
          bonus += plBonus;
          reasons.push('Раст ' + ctx.prod.plants + (o2Maxed ? ' (O₂ макс)' : '') + ' +' + plBonus);
        }
      }
    }

    // 15. Heat synergy — heat → TR conversion + temp saturation
    if ((ctx.heat >= SC.heatPerTR || ctx.prod.heat >= 3) && data.e) {
      var tempMaxed = ctx.globalParams && ctx.globalParams.temp >= SC.tempMax;
      if (eLower.includes('heat') || eLower.includes('тепл')) {
        if (tempMaxed) {
          if (eLower.includes('prod') || eLower.includes('прод')) {
            bonus -= SC.heatProdMaxedPenalty;
            reasons.push('Темп. макс −' + SC.heatProdMaxedPenalty);
          } else if (ctx.heat >= SC.heatPerTR * 2) {
            bonus += SC.heatConverterValue;
            reasons.push('Тепло ' + ctx.heat);
          }
        } else {
          var trFromHeat = Math.floor(ctx.heat / SC.heatPerTR);
          if (trFromHeat >= 1) {
            bonus += Math.min(SC.heatToTRCap, trFromHeat + 1);
            reasons.push('Тепло→TR ' + trFromHeat);
          } else if (ctx.prod.heat >= 4) {
            bonus += SC.heatProdBonus;
            reasons.push('Тепло-прод ' + ctx.prod.heat);
          }
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // FTN timing delta + ocean-dependent action penalty
  // Returns { bonus: number, reasons: string[], skipCrudeTiming: boolean }
  function scoreFTNTiming(cardName, ctx, opts) {
    var bonus = 0;
    var reasons = [];
    var skipCrudeTiming = false;

    // Preludes and corps all play at gen 1 simultaneously — timing is constant, skip it
    if (opts && opts.isPreludeOrCorp) {
      return { bonus: 0, reasons: [], skipCrudeTiming: true };
    }

    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx = TM_CARD_EFFECTS[cardName];
      if (fx) {
        var isFixedTiming = fx.c === 0;
        if (!isFixedTiming) {
          // Dynamic reference gensLeft based on game format
          var REFERENCE_GL = SC.ftnReferenceGL;
          if (ctx.gensLeft > 8) REFERENCE_GL = Math.min(10, ctx.gensLeft); // longer games = higher reference
          var hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
          var hasVP = fx.vp || fx.vpAcc;
          var hasAction = fx.actMC || fx.actTR || fx.actOc || fx.actCD;
          var hasTR = fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn;
          var isPureProduction = hasProd && !hasVP && !hasAction && !hasTR && !fx.city && !fx.grn;
          var SCALE = isPureProduction ? SC.ftnScaleProd : SC.ftnScaleOther;
          var CAP = isPureProduction ? SC.ftnCapProd : SC.ftnCapOther;
          var maxGL = fx.minG ? Math.max(0, 9 - fx.minG) : 13;
          var costDelay = 0;
          if (fx.c > SC.ftnCostFree) {
            costDelay = Math.floor((fx.c - SC.ftnCostFree) / SC.ftnCostPerGen);
          }
          var effectiveGL = Math.max(0, Math.min(ctx.gensLeft, maxGL) - costDelay);
          var refGL = Math.min(REFERENCE_GL, maxGL);
          var cvOpts = null;
          if (ctx.globalParams) {
            cvOpts = { o2Maxed: ctx.globalParams.oxy >= SC.oxyMax, tempMaxed: ctx.globalParams.temp >= SC.tempMax };
          }
          var delta = computeCardValue(fx, effectiveGL, cvOpts) - computeCardValue(fx, refGL);
          var adj = Math.max(-CAP, Math.min(CAP, Math.round(delta * SCALE)));
          if (Math.abs(adj) >= 1) {
            bonus += adj;
            reasons.push((isPureProduction ? 'Прод. тайминг ' : 'Тайминг ') + (adj > 0 ? '+' : '') + adj);
          }
        }
        skipCrudeTiming = true;
      }
    }

    // 6c. Ocean-dependent action penalty
    if (typeof TM_CARD_EFFECTS !== 'undefined' && ctx.globalParams) {
      var fxOc = TM_CARD_EFFECTS[cardName];
      if (fxOc && fxOc.actOc) {
        var oceansPlaced = ctx.globalParams.oceans || 0;
        var oceansRemaining = Math.max(0, SC.oceansMax - oceansPlaced);
        var usableOceans = Math.min(oceansRemaining, ctx.gensLeft);
        if (usableOceans <= 2) {
          var ocPenalty = usableOceans <= 0 ? SC.oceanPen0 : usableOceans <= 1 ? SC.oceanPen1 : SC.oceanPen2;
          bonus += ocPenalty;
          reasons.push('Океанов ост. ' + oceansRemaining + ' ' + ocPenalty);
        }
      }
    }

    // 6d. Ocean-event-dependent cards: value comes from future ocean placements
    if (ctx.globalParams) {
      // Cards whose value depends on FUTURE ocean placements (by anyone).
      // NOT cards that place oceans (handled by actOc/FTN) or require oceans (handled by rule 0).
      var _OCEAN_DEP = {
        'Neptunian Power Consultants': true, // gains resources on ocean placement
        'Arctic Algae': true,                // gains plants on ocean placement
        'Lakefront Resorts': true            // MC prod from ocean adjacency
      };
      if (_OCEAN_DEP[cardName]) {
        var _ocRem = Math.max(0, SC.oceansMax - (ctx.globalParams.oceans || 0));
        if (_ocRem <= 0) {
          bonus += -20;
          reasons.push('Океаны макс. −20');
        } else if (_ocRem <= 2) {
          bonus += -8;
          reasons.push('Океанов ' + _ocRem + ' −8');
        }
      }
    }

    // 6e/6f moved to scoreCardEconomyInContext (rules 0 and 0b) where they reliably fire

    return { bonus: bonus, reasons: reasons, skipCrudeTiming: skipCrudeTiming };
  }

  // Turmoil synergy — delegates, influence, party policy, dominant party
  // Returns { bonus: number, reasons: string[] }
  function scoreTurmoilSynergy(eLower, data, cardTags, ctx) {
    var bonus = 0;
    var reasons = [];
    if (!ctx.turmoilActive || !data.e) return { bonus: bonus, reasons: reasons };

    var isDelegateCard = eLower.includes('delegate') || eLower.includes('делегат');
    var isInfluenceCard = eLower.includes('influence') || eLower.includes('влияние');

    if (isDelegateCard || isInfluenceCard) {
      var delBase = ctx.myDelegates < 2 ? SC.delegateFew : ctx.myDelegates < 4 ? SC.delegateMid : SC.delegateMany;
      var delCount = 1;
      var delM = eLower.match(/(\d+)\s*delegate/);
      if (delM) delCount = parseInt(delM[1]) || 1;
      if (delCount >= 2) delBase += SC.delegateMulti;
      if (isInfluenceCard && !isDelegateCard) {
        delBase = Math.min(delBase, SC.influenceCap);
      }
      bonus += delBase;
      reasons.push('Делегаты +' + delBase + ' (' + ctx.myDelegates + ' дел.)');
    }

    if (eLower.includes('chairman') || eLower.includes('party leader') || eLower.includes('лидер партии')) {
      bonus += SC.chairmanBonus;
      reasons.push('Лидер/Председатель +' + SC.chairmanBonus);
    }

    // 39. Party policy synergy
    if (ctx.rulingParty) {
      var partyBonus = 0;
      var rp = ctx.rulingParty;
      if (rp === 'Mars First') {
        if (cardTags.has('building') || cardTags.has('mars') || eLower.includes('city') || eLower.includes('город')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Scientists') {
        if (cardTags.has('science')) partyBonus = SC.partyMatchBonus;
        if (eLower.includes('draw') || eLower.includes('рисуй')) partyBonus += SC.scientistsDrawBonus;
      } else if (rp === 'Unity') {
        if (cardTags.has('jovian') || cardTags.has('venus') || cardTags.has('earth') || cardTags.has('space')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Greens') {
        if (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal') || eLower.includes('green') || eLower.includes('озелен')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Kelvinists') {
        if (eLower.includes('heat') || eLower.includes('тепл') || eLower.includes('energy') || eLower.includes('энерг')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Reds') {
        if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean') || eLower.includes('tr ') || eLower.includes('+1 tr') || eLower.includes('terraform')) {
          partyBonus = -SC.redsBasePenalty;
          var trCount = 0;
          var trM = eLower.match(/(\d+)\s*tr/);
          if (trM) trCount = parseInt(trM[1]) || 1;
          if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean')) trCount = Math.max(trCount, 1);
          if (trCount >= 2) partyBonus = -SC.redsMultiPenalty;
        }
      }
      if (partyBonus !== 0) {
        bonus += partyBonus;
        reasons.push(rp + (partyBonus > 0 ? ' +' : ' ') + partyBonus);
      }
    }

    // 39b. Dominant party alignment
    if (ctx.dominantParty) {
      var dom = ctx.dominantParty;
      if (dom !== ctx.rulingParty) {
        var domBonus = 0;
        if (dom === 'Mars First' && (cardTags.has('building') || eLower.includes('city'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Scientists' && cardTags.has('science')) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Unity' && (cardTags.has('space') || cardTags.has('venus') || cardTags.has('earth'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Greens' && (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Kelvinists' && (eLower.includes('heat') || eLower.includes('energy'))) domBonus = SC.dominantPartyBonus;
        if (domBonus > 0) {
          bonus += domBonus;
          reasons.push('Дом. ' + dom.split(' ')[0] + ' +1');
        }
      }
    }

    // Coming event awareness — penalize tags that upcoming events punish
    if (ctx.comingEvent) {
      var _evPenTags = {
        'Pandemic': 'building', 'GlobalDustStorm': 'building',
        'SolarFlare': 'space', 'MinersOnStrike': 'jovian',
      };
      var _evBonTags = {
        'SpinoffProducts': 'science', 'InterplanetaryTrade': 'space',
        'HomeworldSupport': 'earth', 'CelebrityLeaders': 'event',
        'VenusInfrastructure': 'venus', 'AsteroidMining': 'jovian',
      };
      var penTag = _evPenTags[ctx.comingEvent];
      if (penTag && cardTags.has(penTag)) {
        bonus -= 1;
        reasons.push('⚡ ' + ctx.comingEvent.replace(/([A-Z])/g, ' $1').trim() + ' −1');
      }
      var bonTag = _evBonTags[ctx.comingEvent];
      if (bonTag && cardTags.has(bonTag)) {
        bonus += 1;
        reasons.push('⚡ ' + ctx.comingEvent.replace(/([A-Z])/g, ' $1').trim() + ' +1');
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Colony synergy — colony/trade/fleet keywords + infrastructure context
  // TR gap awareness — if behind on TR, terraforming cards more valuable
  // (embedded in scoreTurmoilSynergy return, added after event awareness)

  // Returns { bonus: number, reasons: string[] }
  function scoreColonySynergy(eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];
    if (!data.e) return { bonus: bonus, reasons: reasons };

    var isColonyCard = eLower.includes('colon') || eLower.includes('trade') || eLower.includes('колон') || eLower.includes('торгов') || eLower.includes('fleet') || eLower.includes('флот');

    if (isColonyCard) {
      // Colony synergy: only when player actually has colonies or has traded (not just default fleet)
      if (ctx.coloniesOwned > 0) {
        var colonyBonus = Math.min(SC.colonyCap, ctx.coloniesOwned * SC.colonyPerOwned + ctx.tradesLeft * SC.colonyPerTrade);
        bonus += colonyBonus;
        var colParts = [ctx.coloniesOwned + ' колон.'];
        if (ctx.tradesLeft > 0) colParts.push(ctx.tradesLeft + ' флот');
        reasons.push(colParts.join(', ') + ' → +' + colonyBonus);
      }

      if (eLower.includes('fleet') || eLower.includes('флот') || eLower.includes('trade fleet')) {
        var fleetVal = Math.min(SC.fleetCap, ctx.coloniesOwned * SC.fleetPerColony + SC.fleetBase);
        if (ctx.coloniesOwned === 0) fleetVal = SC.fleetNoColony;
        bonus += fleetVal;
        reasons.push('Флот +' + fleetVal);
      }

      if ((eLower.includes('place') || eLower.includes('build')) && eLower.includes('colon')) {
        if (ctx.coloniesOwned < SC.colonySlotMax) {
          bonus += SC.colonyPlacement;
          // Recommend best colony to build on
          var bestBuild = '';
          if (typeof TM_COLONY_DATA !== 'undefined' && pv && pv.game && pv.game.colonies) {
            var bestBuildVal = 0;
            for (var _bci = 0; _bci < pv.game.colonies.length; _bci++) {
              var _bc = pv.game.colonies[_bci];
              if (!_bc.name) continue;
              var _bcd = TM_COLONY_DATA[_bc.name];
              if (!_bcd) continue;
              // Check if colony has free slots
              var _bcSlots = (_bc.colonies || []).length;
              if (_bcSlots >= 3) continue; // full
              // Estimate build bonus MC value
              var _bcVal = _bcd.build.includes('production') ? 6 : _bcd.build.includes('ocean') ? 10 : _bcd.build.includes('TR') ? 7 : 4;
              if (_bcVal > bestBuildVal) { bestBuildVal = _bcVal; bestBuild = _bc.name; }
            }
          }
          reasons.push('Колония' + (bestBuild ? ': ' + bestBuild : '') + ' +' + SC.colonyPlacement);
        }
      }

      if (ctx.totalColonies !== undefined && ctx.colonyWorldCount > 0 && ctx.gen >= 3) {
        // For "gain bonus of YOUR colonies" cards (Productive Outpost), use own colonies
        var isMyColonyCard = eLower.includes('colony bonus') || eLower.includes('each of your colon') || eLower.includes('бонус.*колон');
        var relevantCount = isMyColonyCard ? ctx.coloniesOwned : ctx.totalColonies;
        var maxPossible = ctx.colonyWorldCount * SC.colonySlotsPerWorld;
        var saturation = ctx.totalColonies / maxPossible;
        if (isMyColonyCard) {
          // Productive Outpost etc: value = own colonies count, not market saturation
          if (ctx.coloniesOwned >= 3) {
            bonus += SC.colonySatBonus + 2;
            reasons.push('Мои колонии ' + ctx.coloniesOwned);
          } else if (ctx.coloniesOwned >= 2) {
            bonus += SC.colonySatBonus;
            reasons.push('Мои колонии ' + ctx.coloniesOwned);
          }
        } else if (saturation < SC.colonySatLow && ctx.totalColonies <= SC.colonySatLowMax) {
          bonus -= SC.colonySatPenalty;
          reasons.push('Мало колоний ' + ctx.totalColonies + '/' + ctx.colonyWorldCount);
        } else if (saturation >= SC.colonySatHigh) {
          bonus += SC.colonySatBonus;
          reasons.push('Много колоний ' + ctx.totalColonies);
        }
      }
    }

    if (eLower.includes('trade income') || eLower.includes('trade bonus') || eLower.includes('when you trade') || eLower.includes('торговый бонус')) {
      if (ctx.coloniesOwned > 0) {
        var tradeBoost = Math.min(SC.tradeBonusCap, ctx.coloniesOwned * SC.tradeBonusPerColony);
        bonus += tradeBoost;
        reasons.push('Trade-бонус +' + tradeBoost);
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Board-state modifiers — energy deficit, plant vulnerability, prod-copy, floater engine, colony density
  // Returns { bonus: number, reasons: string[] }
  function scoreBoardStateModifiers(cardName, data, eLower, ctx) {
    var bonus = 0;
    var reasons = [];
    if (!ctx || typeof TM_CARD_EFFECTS === 'undefined') return { bonus: bonus, reasons: reasons };
    var fx = TM_CARD_EFFECTS[cardName];

    // 47a. Energy deficit
    if (fx && fx.ep && fx.ep < 0) {
      var energyAfter = ctx.prod.energy + fx.ep;
      if (energyAfter < -2) {
        bonus -= SC.energyDeepDeficit;
        reasons.push('Энерг. дефицит ' + ctx.prod.energy + '→' + energyAfter + ' −' + SC.energyDeepDeficit);
      } else if (energyAfter < 0 && ctx.prod.energy <= 0) {
        bonus -= SC.energyDeficitPenalty;
        reasons.push('Нет энергии ' + ctx.prod.energy + ' −' + SC.energyDeficitPenalty);
      }
    }

    // 47c. Plant production vulnerability
    if (ctx.oppHasPlantAttack && fx && fx.pp && fx.pp > 0) {
      bonus -= SC.plantProdVulnPenalty;
      reasons.push('Раст. прод. под атакой −' + SC.plantProdVulnPenalty);
    }

    // 47d. Production-copy cards (Robotic Workforce copies 1, Cyberia Systems copies 2)
    var isCopyCard = cardName === 'Robotic Workforce' || cardName === 'Mining Robots Manuf. Center' ||
        cardName === 'Robotic Workforce (P2)' || cardName === 'Cyberia Systems';
    if (isCopyCard) {
      var copyCount = (cardName === 'Cyberia Systems') ? 2 : 1;
      var buildProds = [];
      for (var tbName of ctx.tableauNames) {
        var tbFx = TM_CARD_EFFECTS[tbName];
        if (!tbFx) continue;
        var tbData = TM_RATINGS[tbName];
        if (!tbData || !tbData.g || tbData.g.indexOf('Building') === -1) continue;
        var prodVal = (tbFx.sp || 0) * 2 + (tbFx.tp || 0) * 3 + (tbFx.mp || 0) +
          (tbFx.pp || 0) * 1.5 + (tbFx.ep || 0) * 1.5 + (tbFx.hp || 0) * 0.5;
        if (prodVal > 0) buildProds.push({ name: tbName, val: prodVal });
      }
      buildProds.sort(function(a, b) { return b.val - a.val; });
      var topTargets = buildProds.slice(0, copyCount);
      var totalCopyVal = 0;
      var copyNames = [];
      for (var ci47 = 0; ci47 < topTargets.length; ci47++) {
        totalCopyVal += topTargets[ci47].val;
        copyNames.push(topTargets[ci47].name.split(' ')[0]);
      }
      if (totalCopyVal >= SC.prodCopyMinVal) {
        var copyBonus = Math.min(SC.prodCopyBonusCap * copyCount, Math.round(totalCopyVal));
        bonus += copyBonus;
        reasons.push('Копия ' + copyNames.join('+') + ' +' + copyBonus);
      }
    }

    // 47e. Floater engine
    if (fx && isFloaterCardByFx(cardName) && data.e) {
      var needsFloaters = eLower.includes('spend') || eLower.includes('remove') || eLower.includes('req');
      if (needsFloaters && ctx.floaterAccumRate > 0) {
        bonus += SC.floaterHasEngine;
        reasons.push('Флоат. engine +' + SC.floaterHasEngine);
      } else if (needsFloaters && ctx.floaterAccumRate === 0 && !eLower.includes('add')) {
        bonus -= SC.floaterNoEngine;
        reasons.push('Нет флоат. src −' + SC.floaterNoEngine);
      }
    }

    // 47f. Colony trade density
    if (ctx.coloniesOwned >= 3 && data.e) {
      if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('колон') || eLower.includes('торг')) {
        var ctdBonus = Math.min(SC.colonyTradeCap, (ctx.coloniesOwned - 2) * SC.colonyTradeDensity);
        if (ctdBonus > 0) {
          bonus += ctdBonus;
          reasons.push('Колонии ' + ctx.coloniesOwned + ' +' + ctdBonus);
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Requirement feasibility penalty + MET bonus
  // Returns { bonus: number, reasons: string[] } or null
  function scoreCardRequirements(cardEl, ctx) {
    if (!ctx.globalParams || !cardEl) return null;
    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return null;

    var bonus = 0;
    var reasons = [];
    var reqText = (reqEl.textContent || '').trim();
    var isMaxReq = /max/i.test(reqText);
    var gp = ctx.globalParams;

    if (isMaxReq) {
      // Max requirements — if window already closed, card is unplayable
      var windowClosed = false;
      var tmM = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM = reqText.match(/(\d+)\s*%?\s*O/i);
      var vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
      if (tmM && gp.temp > parseInt(tmM[1])) windowClosed = true;
      if (oxM && gp.oxy > parseInt(oxM[1])) windowClosed = true;
      if (vnM && gp.venus > parseInt(vnM[1])) windowClosed = true;
      if (windowClosed) {
        bonus -= SC.reqInfeasible;
        reasons.push('Окно закрыто!');
      }
    } else {
      // Min requirements — penalty based on how many gens until met
      var raisesNeeded = 0;
      var tmM2 = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM2 = reqText.match(/(\d+)\s*%?\s*O/i);
      var ocM = reqText.match(/(\d+)\s*ocean/i);
      var vnM2 = reqText.match(/(\d+)\s*%?\s*Venus/i);

      if (tmM2) { var n = parseInt(tmM2[1]); if (gp.temp < n) raisesNeeded += (n - gp.temp) / 2; }
      if (oxM2) { var n2 = parseInt(oxM2[1]); if (gp.oxy < n2) raisesNeeded += n2 - gp.oxy; }
      if (ocM) { var n3 = parseInt(ocM[1]); if (gp.oceans < n3) raisesNeeded += n3 - gp.oceans; }
      if (vnM2) { var n4 = parseInt(vnM2[1]); if (gp.venus < n4) raisesNeeded += (n4 - gp.venus) / 2; }

      if (raisesNeeded > 0) {
        var rate = ctx.terraformRate > 0 ? ctx.terraformRate : SC.terraformRateDefault;
        var gensWait = Math.ceil(raisesNeeded / rate);
        var reqPenalty = -Math.min(SC.reqPenaltyMax, gensWait * SC.reqPenaltyPerGen);
        bonus += reqPenalty;
        reasons.push('Req ~' + gensWait + ' пок.');
      }
    }

    // 0b. Requirement MET bonus — harder req = bigger bonus
    if (!isMaxReq) {
      var rt = reqText.toLowerCase();
      var hardness = 0;

      var tagReqPairs = rt.match(/(\d+)/g);
      if (tagReqPairs) {
        for (var i = 0; i < tagReqPairs.length; i++) {
          var nv = parseInt(tagReqPairs[i]);
          if (nv >= 2 && nv <= 8) hardness = Math.max(hardness, nv);
        }
      }

      var tmpM = rt.match(/([\-\d]+)\s*°/);
      if (tmpM) {
        var tv = parseInt(tmpM[1]);
        if (tv >= 0) hardness = Math.max(hardness, 4);
        else if (tv >= -10) hardness = Math.max(hardness, 3);
        else if (tv >= -20) hardness = Math.max(hardness, 2);
      }
      var oxyM = rt.match(/(\d+)\s*%/);
      if (oxyM) {
        var ov = parseInt(oxyM[1]);
        if (ov >= 7) hardness = Math.max(hardness, 4);
        else if (ov >= 4) hardness = Math.max(hardness, 3);
      }
      var oceM = rt.match(/(\d+)\s*ocean/i);
      if (oceM && parseInt(oceM[1]) >= 3) hardness = Math.max(hardness, 3);

      // Only give bonus if req is actually met NOW
      // Check tag requirements (e.g. "5 Science") against tableau tags
      var globalReqMet0b = true;
      if (ctx && ctx.globalParams) {
        if (oxyM && ctx.globalParams.oxy < parseInt(oxyM[1])) globalReqMet0b = false;
        if (tmpM && parseInt(tmpM[1]) > ctx.globalParams.temp) globalReqMet0b = false;
        if (oceM && ctx.globalParams.oceans < parseInt(oceM[1])) globalReqMet0b = false;
        var venM = rt.match(/(\d+)\s*%?\s*venus/i) || rt.match(/venus\s*(\d+)/i);
        if (venM && ctx.globalParams.venus < parseInt(venM[1])) globalReqMet0b = false;
      }
      var tagReqMet0b = true;
      var tagReqM0b = rt.match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i);
      if (tagReqM0b) {
        var tagReqCount0b = parseInt(tagReqM0b[1]);
        var tagReqName0b = tagReqM0b[2].toLowerCase();
        var myTagCount0b = (ctx && ctx.tags) ? (ctx.tags[tagReqName0b] || 0) : 0;
        if (myTagCount0b < tagReqCount0b) tagReqMet0b = false;
      }
      if (globalReqMet0b && tagReqMet0b && !reasons.some(function(r) { return r.includes('Req ~') || r.includes('Окно') || r.includes('Req далеко'); })) {
        if (hardness >= 4) { bonus += SC.reqMetHard; reasons.push('Req ✓ +' + SC.reqMetHard); }
        else if (hardness >= 3) { bonus += SC.reqMetMedium; reasons.push('Req ✓ +' + SC.reqMetMedium); }
        else if (hardness >= 2) { bonus += SC.reqMetEasy; reasons.push('Req ✓ +' + SC.reqMetEasy); }
      }
    }

    return (bonus !== 0 || reasons.length > 0) ? { bonus: bonus, reasons: reasons } : null;
  }

  // Parameter saturation — penalty when card raises global params that are near/at max
  // Returns { penalty: number, reason: string|null }
  function computeParamSaturation(cardName, ctx, baseScore) {
    if (typeof TM_CARD_EFFECTS === 'undefined') return { penalty: 0, reason: null };
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx || !ctx.globalParams) return { penalty: 0, reason: null };

    var gl = Math.max(0, Math.min(13, ctx.gensLeft));
    var trVal = ftnRow(gl)[0];
    var lostMCVal = 0;
    var approachPenalty = 0;

    // Choice params: e.g., "tmp,vn" = pick one (Atmoscoop: temp+2 OR venus+2)
    var choiceKeys = fx.choice ? fx.choice.split(',') : null;
    var choiceLost = 0;
    var choiceAllMaxed = !!choiceKeys;

    // Per-param saturation check
    var params = [
      { key: 'tmp', val: fx.tmp, cur: ctx.globalParams.temp, max: SC.tempMax, step: 2, extra: 0, approachTh: 2 },
      { key: 'o2',  val: fx.o2,  cur: ctx.globalParams.oxy,  max: SC.oxyMax,  step: 1, extra: 0, approachTh: 2 },
      { key: 'oc',  val: fx.oc,  cur: ctx.globalParams.oceans, max: SC.oceansMax, step: 1, extra: 3, approachTh: 1 },
      { key: 'vn',  val: fx.vn,  cur: ctx.globalParams.venus, max: SC.venusMax, step: 2, extra: 0, approachTh: 2 }
    ];
    for (var pi = 0; pi < params.length; pi++) {
      var pm = params[pi];
      if (!pm.val) continue;
      var isChoice = choiceKeys && choiceKeys.indexOf(pm.key) >= 0;
      var mcPerUnit = trVal + pm.extra;
      if (pm.cur >= pm.max) {
        var loss = pm.val * mcPerUnit;
        if (isChoice) choiceLost += loss; else lostMCVal += loss;
      } else {
        var remaining = Math.max(0, (pm.max - pm.cur) / pm.step);
        var over = Math.max(0, pm.val - remaining);
        if (isChoice) {
          choiceLost += over * mcPerUnit;
          if (over === 0) choiceAllMaxed = false;
        } else {
          lostMCVal += over * mcPerUnit;
          if (remaining <= pm.approachTh && over === 0) approachPenalty += SC.approachPenalty;
        }
      }
    }

    // Choice resolution: only add loss if ALL choice branches are maxed
    if (choiceKeys && choiceAllMaxed) lostMCVal += choiceLost;

    if (lostMCVal > 0 || approachPenalty > 0) {
      var totalMCVal = computeCardValue(fx, ctx.gensLeft);
      var fractionLost = totalMCVal > 1 ? lostMCVal / totalMCVal : (lostMCVal > 0 ? 0.9 : 0);
      // Cap penalty: don't penalize more than the lost MC value itself (e.g. lost ocean = ~10 MC, not 56)
      // Cards with other valuable effects (animal/microbe targets, tags) shouldn't lose ALL value
      var rawPenalty = Math.round(baseScore * fractionLost);
      var satPenalty = Math.min(rawPenalty, Math.round(lostMCVal * 1.5)) + approachPenalty;
      if (satPenalty > 0) {
        var lostTRCount = Math.round(lostMCVal / trVal);
        var reason = lostTRCount > 0
          ? lostTRCount + ' TR потер. −' + satPenalty + ' (' + Math.round(fractionLost * 100) + '%)'
          : 'Парам. скоро макс −' + satPenalty;
        return { penalty: satPenalty, reason: reason };
      }
    }
    return { penalty: 0, reason: null };
  }

  // ── Corp synergy detection (Two Corps support) ──

  let cachedCorp = null;
  let cachedCorps = null;
  let corpCacheTime = 0;

  function detectMyCorps() {
    if (Date.now() - corpCacheTime < 3000 && cachedCorps !== null) return cachedCorps;
    corpCacheTime = Date.now();

    var corps = [];
    var myCards = document.querySelectorAll(SEL_TABLEAU);

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
          var cn = cardN(pv.thisPlayer.tableau[k]);
          if (cn === 'Merger') continue; // Merger is a prelude, not a corp
          if (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn] || CORP_ABILITY_SYNERGY[cn]) {
            if (corps.indexOf(cn) === -1) corps.push(cn);
          }
        }
      }
    }

    // Normalize corp names via resolver (handles aliases from DOM)
    for (var ri = 0; ri < corps.length; ri++) corps[ri] = resolveCorpName(corps[ri]);
    cachedCorps = corps;
    cachedCorp = corps.length > 0 ? corps[0] : '';
    return cachedCorps;
  }

  function detectMyCorp() {
    detectMyCorps();
    return cachedCorp;
  }

  // Frozen scores cache: cardName → { html, className } — survives DOM re-renders
  var frozenScores = new Map();
  var _frozenGameId = null; // reset on new game
  var _oppTableauSizes = {}; // color → tableau length, for invalidation

  // Cached player context (light version for tag synergies)
  let cachedCtx = null;
  let ctxCacheTime = 0;

  function getCachedPlayerContext() {
    if (Date.now() - ctxCacheTime < 3000 && cachedCtx !== null) return cachedCtx;
    ctxCacheTime = Date.now();
    cachedCtx = getPlayerContext();
    return cachedCtx;
  }

  function enrichCtxForScoring(ctx, myTableau, myHand) {
    if (!ctx) return;
    ctx._playedEvents = getMyPlayedEventNames();
    ctx._allMyCards = [...myTableau, ...myHand];
    ctx._allMyCardsSet = new Set(ctx._allMyCards);
    ctx._handTagCounts = getHandTagCounts();
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
        for (var si = 0; si < corpData.y.length; si++) corpSyns.add(yName(corpData.y[si]));
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
            var yn = yName(data.y[i]);
            for (var k = 0; k < myCorpsHL.length; k++) {
              if (yn === myCorpsHL[k] || yn.indexOf(myCorpsHL[k]) !== -1) {
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

    var myNames = new Set();
    var nameToEls = {};
    var hasComboTip = new Set();
    var hasAntiTip = new Set();

    // Selectors for "my" cards only (tableau + hand + draft selection)
    var MY_CARD_SEL = SEL_TABLEAU + ', ' + SEL_HAND + ', ' + SEL_DRAFT;

    // Cleanup pass: remove combo classes from ALL cards (including opponent's)
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche', 'tm-combo-hint', 'tm-anti-combo');
      el.querySelectorAll('.tm-combo-tooltip, .tm-anti-combo-tooltip').forEach(function(t) { t.remove(); });
    });

    // Build name→elements map from MY cards only (no opponent tableau leaking in)
    document.querySelectorAll(MY_CARD_SEL).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) {
        myNames.add(name);
        if (!nameToEls[name]) nameToEls[name] = [];
        nameToEls[name].push(el);
      }
    });

    var ratingLabels = { godmode: 'GODMODE', great: 'Отлично', good: 'Хорошо', decent: 'Неплохо', niche: 'Ниша' };

    for (var ci = 0; ci < TM_COMBOS.length; ci++) {
      var combo = TM_COMBOS[ci];
      var matched = combo.cards.filter(function(c) { return myNames.has(c); });
      if (matched.length >= 2) {
        // Skip combos requiring a corp we don't own
        var _missingCombo = combo.cards.filter(function(c) { return !myNames.has(c); });
        var _corpDataC = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
        var _myCorpsC = detectMyCorps();
        var _skipCombo = false;
        for (var _mci = 0; _mci < _missingCombo.length; _mci++) {
          if (_corpDataC[_missingCombo[_mci]] && _myCorpsC.indexOf(_missingCombo[_mci]) === -1) { _skipCombo = true; break; }
        }
        if (_skipCombo) continue;

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
              var otherCards = combo.cards.filter(function(c) { return c !== cardName; }).join(' + ');
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
        var aMatched = anti.cards.filter(function(c) { return myNames.has(c); });
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
    // Lightweight: count + first/mid/last names instead of full sort
    var els = document.querySelectorAll('.card-container[data-tm-card]');
    if (els.length === 0) return '0';
    var first = els[0].getAttribute('data-tm-card') || '';
    var mid = els[Math.floor(els.length / 2)].getAttribute('data-tm-card') || '';
    var last = els[els.length - 1].getAttribute('data-tm-card') || '';
    return els.length + ':' + first + ':' + mid + ':' + last;
  }

  // ── Standard Project Rating ──

  var _spLastUpdate = 0;

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
                if (g.spaces[si].color === myColor && (isGreeneryTile(g.spaces[si].tileType))) myGreens++;
              }
            }
            if (myGreens >= 2) { bonus += SC.spMilestoneReach; reasons.push('→ ' + msName + '! (' + myGreens + '/3)'); }
            else if (myGreens >= 1) { bonus += SC.spMilestoneClose; reasons.push(msName + ' ' + myGreens + '/3'); }
          }

          // City SP → Mayor (3 cities), Suburbian award
          if (spType === 'city' && msName === 'Mayor') {
            var myCities = p.citiesCount || 0;
            if (myCities >= 2) { bonus += SC.spMilestoneReach; reasons.push('→ Mayor! (' + myCities + '/3)'); }
            else if (myCities >= 1) { bonus += SC.spMilestoneClose; reasons.push('Mayor ' + myCities + '/3'); }
          }

          // Power Plant → Specialist (10 prod), Energizer (6 energy prod)
          if (spType === 'power') {
            if (msName === 'Specialist') {
              var maxProd = Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
              var epAfter = (p.energyProduction || 0) + 1;
              if (epAfter >= 10 && maxProd < 10) { bonus += SC.spMilestoneReach; reasons.push('→ Specialist!'); }
            }
            if (msName === 'Energizer') {
              var ep = p.energyProduction || 0;
              if (ep + 1 >= 6 && ep < 6) { bonus += SC.spMilestoneReach; reasons.push('→ Energizer!'); }
              else if (ep >= 4) { bonus += SC.spMilestoneClose; reasons.push('Energizer ' + ep + '/6'); }
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
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardLead; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        // City → Suburbian, Urbanist
        if (spType === 'city' && (aw.name === 'Suburbian' || aw.name === 'Urbanist')) {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardLead; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        // Aquifer → Landlord (tile count)
        if (spType === 'aquifer' && aw.name === 'Landlord') {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardContrib; reasons.push('Landlord +1'); }
        }
        // Asteroid/Aquifer/Greenery → Benefactor (TR)
        if ((spType === 'asteroid' || spType === 'aquifer' || spType === 'greenery' || spType === 'venus' || spType === 'buffer') && aw.name === 'Benefactor') {
          if (myScore >= bestOpp - 2) { bonus += SC.spAwardContrib; reasons.push('Benefactor TR+1'); }
        }
        // Power Plant → Industrialist (steel+energy), Electrician
        if (spType === 'power' && (aw.name === 'Industrialist' || aw.name === 'Electrician')) {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardContrib; reasons.push(aw.name + ' +1'); }
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Universal MA value computation — accepts any player object
  function computeMAValueForPlayer(ma, player, pv) {
    if (!player) return 0;
    var p = player;
    var pColor = p.color;
    switch (ma.check) {
      case 'tr': return p.terraformRating || 0;
      case 'cities': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && (isCityTile(sp.tileType))) c++;
          }
        }
        return c;
      }
      case 'greeneries': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && isGreeneryTile(sp.tileType)) c++;
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
            var cn = cardN(p.tableau[i]);
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
            var cn = cardN(p.tableau[i]);
            var fx = getFx(cn);
            if (fx && fx.req) c++;
          }
        }
        return c;
      }
      case 'tiles': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            if (pv.game.spaces[i].color === pColor && pv.game.spaces[i].tileType != null) c++;
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
            var cn = cardN(p.tableau[i]);
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
            var cn = cardN(p.tableau[i]);
            var fx = getFx(cn);
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
      case 'polar': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && sp.tileType != null && sp.y >= 7) c++;
          }
        }
        return c;
      }
      default: return 0;
    }
  }

  // Helper: count delegates for a player across all turmoil parties
  function countMyDelegates(g, playerColor) {
    var count = 0;
    if (g.turmoil && g.turmoil.parties) {
      for (var i = 0; i < g.turmoil.parties.length; i++) {
        var party = g.turmoil.parties[i];
        if (party.delegates) {
          for (var j = 0; j < party.delegates.length; j++) {
            var d = party.delegates[j];
            if ((d.color || d) === playerColor) count += (d.number || 1);
          }
        }
      }
    }
    return count;
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
    var heat = p.heat || 0;
    var steel = p.steel || 0;
    var stVal = p.steelValue || SC.defaultSteelVal;
    var gen = g.generation || 1;
    var gensLeft = estimateGensLeft(pv);
    var myCorp = detectMyCorp();
    var isHelion = myCorp === 'Helion';
    var spBudget = mc + (isHelion ? heat : 0); // Helion can use heat as MC

    var raises = globalParamRaises(g);

    var gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0];
    var prodVal = row[1];
    var vpVal = row[2];

    var coloniesOwned = p.coloniesCount || 0;
    var fleetSize = p.fleetSize || 1;
    var tradesThisGen = p.tradesThisGeneration || 0;
    var tradesLeft = fleetSize - tradesThisGen;

    _spLastUpdate = now;

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
        var powerCost = (myCorp === 'Thorgate') ? SC.thorgatePowerCost : SC.spCosts.power;
        var epValue = Math.round(prodVal * 1.5);
        net = epValue - powerCost;
        canAfford = spBudget >= powerCost;
        if (gensLeft <= 2) { label = 'Поздно'; cls = 'tm-sp-bad'; }
        else {
          net += maBonus.bonus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -4 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'asteroid') {
        if (g.temperature != null && g.temperature >= SC.tempMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - SC.spCosts.asteroid + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.asteroid;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'aquifer') {
        if (g.oceans != null && g.oceans >= SC.oceansMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal + 2) - SC.spCosts.aquifer + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.aquifer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'greenery') {
        var sd = steelDiscount(SC.spCosts.greenery, steel, stVal);
        var o2open = g.oxygenLevel != null && g.oxygenLevel < SC.oxyMax;
        var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
        net = grEV - sd.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= SC.spCosts.greenery;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (sd.disc > 0) label += ' (⚒−' + sd.disc + ')';
        if (!o2open) label += ' VP';
        cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
      }
      else if (spType === 'city') {
        var sd = steelDiscount(SC.spCosts.city, steel, stVal);
        var cityEV = Math.round(vpVal * 2 + 3);
        net = cityEV - sd.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= SC.spCosts.city;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (sd.disc > 0) label += ' (⚒−' + sd.disc + ')';
        cls = net >= 0 ? 'tm-sp-good' : net >= -6 ? 'tm-sp-ok' : 'tm-sp-bad';
      }
      else if (spType === 'venus') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= SC.venusMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - SC.spCosts.venus + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.venus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      }
      else if (spType === 'buffer') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= SC.venusMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - SC.spCosts.buffer + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.buffer;
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
        var myDel = countMyDelegates(g, p.color || '');
        label = myDel + ' дел.';
        cls = myDel < 3 ? 'tm-sp-good' : myDel < 5 ? 'tm-sp-ok' : 'tm-sp-bad';
      }

      // Append milestone/award reason to badge
      if (maBonus.reasons.length > 0) {
        label += ' ' + maBonus.reasons[0];
        if (maBonus.bonus >= 5) cls = 'tm-sp-good'; // milestone grab = always highlight
      }

      if (!label) return;

      var badge = document.createElement('div');
      badge.className = 'tm-sp-badge ' + cls;
      badge.textContent = label;
      cardEl.style.position = 'relative';
      cardEl.appendChild(badge);
    });
  }

  // ── Steel discount helper ──
  function steelDiscount(baseCost, steel, stVal) {
    var disc = Math.min(steel, Math.floor(baseCost / stVal)) * stVal;
    return { eff: baseCost - disc, disc: disc };
  }

  // ── Best SP / Delegate score (pure data, no DOM) ──

  var SP_NAMES = { power: 'Электростанция', asteroid: 'Астероид', aquifer: 'Океан', greenery: 'Озеленение', city: 'Город', venus: 'Очистка', buffer: 'Буфер', lobby: 'Лобби' };

  function spScore(type, net) {
    return Math.round(Math.min(SC.spScoreMax, Math.max(SC.spScoreMin, SC.spBases[type] + net * SC.spScales[type])));
  }

  var SP_ICONS = { power: '⚡', asteroid: '🌡', aquifer: '🌊', greenery: '🌿', city: '🏙', venus: '♀', buffer: '♀B', lobby: '🏛' };

  function computeAllSP(pv, gensLeft, myCorp) {
    if (!pv || !pv.thisPlayer || !pv.game) return null;

    var p = pv.thisPlayer;
    var g = pv.game;
    var steel = p.steel || 0;
    var stVal = p.steelValue || SC.defaultSteelVal;
    var gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0], prodVal = row[1], vpVal = row[2];

    var all = [];
    var best = null;
    function consider(type, net, detail) {
      var ma = checkSPMilestoneAward(type, pv);
      net += ma.bonus;
      var adjS = spScore(type, net);
      var entry = { type: type, name: SP_NAMES[type], icon: SP_ICONS[type], cost: SC.spCosts[type], adj: adjS, net: net, detail: detail || '' };
      if (ma.bonus) entry.detail += (entry.detail ? ', ' : '') + 'веха/нагр +' + ma.bonus;
      all.push(entry);
      if (!best || adjS > best.score) best = { name: SP_NAMES[type], net: net, score: adjS };
    }

    // Power Plant: 11 MC → +1 energy prod (Thorgate: 8 MC)
    if (gensLeft > 2) {
      var pwCost = (myCorp === 'Thorgate') ? SC.thorgatePowerCost : SC.spCosts.power;
      var pwVal = Math.round(prodVal * 1.5);
      var pwNet = pwVal - pwCost;
      consider('power', pwNet, 'прод ' + pwVal + ' − ' + pwCost);
    }

    // Asteroid: 14 MC → +1 TR (temp)
    if (g.temperature == null || g.temperature < SC.tempMax) {
      consider('asteroid', Math.round(trVal) - SC.spCosts.asteroid, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.asteroid);
    }

    // Aquifer: 18 MC → +1 TR + ocean
    if (g.oceans == null || g.oceans < SC.oceansMax) {
      var aqVal = Math.round(trVal + 2);
      consider('aquifer', aqVal - SC.spCosts.aquifer, 'TR+бонус ' + aqVal + ' − ' + SC.spCosts.aquifer);
    }

    // Greenery: 23 MC → VP + TR
    {
      var grSD = steelDiscount(SC.spCosts.greenery, steel, stVal);
      var o2open = g.oxygenLevel == null || g.oxygenLevel < SC.oxyMax;
      var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
      var grDetail = 'VP+TR ' + grEV + ' − ' + grSD.eff;
      if (grSD.disc > 0) grDetail += ' (сталь −' + grSD.disc + ')';
      consider('greenery', grEV - grSD.eff, grDetail);
    }

    // City: 25 MC → VP + MC-prod
    {
      var ciSD = steelDiscount(SC.spCosts.city, steel, stVal);
      var ciEV = Math.round(vpVal * 2 + 3);
      var ciDetail = 'VP+прод ' + ciEV + ' − ' + ciSD.eff;
      if (ciSD.disc > 0) ciDetail += ' (сталь −' + ciSD.disc + ')';
      consider('city', ciEV - ciSD.eff, ciDetail);
    }

    // Venus: 15 MC → +1 TR
    if (g.venusScaleLevel == null || g.venusScaleLevel < SC.venusMax) {
      consider('venus', Math.round(trVal) - SC.spCosts.venus, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.venus);
    }

    // Buffer Gas: 7 MC → +1 TR
    if (g.venusScaleLevel == null || g.venusScaleLevel < SC.venusMax) {
      consider('buffer', Math.round(trVal) - SC.spCosts.buffer, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.buffer);
    }

    // Lobby: 5 MC → delegate
    if (g.turmoil) {
      var myDel = countMyDelegates(g, p.color || '');
      var delBonus = myDel < 3 ? 5 : myDel < 5 ? 3 : 1;
      consider('lobby', delBonus, 'влияние +' + delBonus);
    }

    // Sort by adjusted score descending
    all.sort(function(a, b) { return b.adj - a.adj; });

    return { all: all, best: best };
  }

  // Backward-compatible wrapper
  function computeBestSP(pv, gensLeft, myCorp) {
    var result = computeAllSP(pv, gensLeft, myCorp);
    return result ? result.best : null;
  }

  function processAll() {
    if (!enabled || _processingNow) return;
    _processingNow = true;
    var _t0 = debugMode ? performance.now() : 0;
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
        var _tCombos = debugMode ? performance.now() : 0;
        // Core: combo highlights + corp synergy glow
        checkCombos();
        highlightCorpSynergies();
        var _tDraft = debugMode ? performance.now() : 0;
        // Core: draft scoring + draft history
        updateDraftRecommendations();
        // Prelude package scoring
        checkPreludePackage();
        // Discard hints on hand cards
        injectDiscardHints();
        // Play priority badges
        injectPlayPriorityBadges();
        if (debugMode) {
          var _tEndDirty = performance.now();
          tmLog('perf', 'processAll breakdown: combos=' + (_tDraft - _tCombos).toFixed(1) + 'ms, draft+badges=' + (_tEndDirty - _tDraft).toFixed(1) + 'ms');
        }
      }
      trackDraftHistory();
      // Standard project ratings (throttled internally)
      rateStandardProjects();
      // Enhanced game log (cheap with :not selector, always run)
      enhanceGameLog();
      // Playable card highlight (throttled to 2s internally)
      highlightPlayable();
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
      if (debugMode) {
        _lastProcessAllMs = performance.now() - _t0;
        tmLog('perf', 'processAll ' + _lastProcessAllMs.toFixed(1) + 'ms, dirty=' + dirty);
      }
    }
  }

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
      for (const c of pv.cardsInHand) curHand.push(cardN(c));
    } else if (pv.thisPlayer && pv.thisPlayer.cardsInHand) {
      for (const c of pv.thisPlayer.cardsInHand) curHand.push(cardN(c));
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

  var getPlayerColor = TM_UTILS.playerColor;

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
          var drPos = [], drNeg = [];
          for (var dri = 0; dri < card.reasons.length; dri++) {
            if (isNegativeReason(card.reasons[dri])) drNeg.push(card.reasons[dri]);
            else drPos.push(card.reasons[dri]);
          }
          if (drPos.length > 0) cardsHtml += ' <span class="tm-draft-reasons">' + drPos.join(', ') + '</span>';
          if (drNeg.length > 0) cardsHtml += ' <span class="tm-draft-reasons" style="color:#ff5252">' + drNeg.join(', ') + '</span>';
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
    // Remove injected elements
    document.querySelectorAll('.tm-tier-badge, .tm-combo-tooltip, .tm-anti-combo-tooltip').forEach((el) => el.remove());
    // Strip combo classes
    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    // Strip single-class markers (8 selectors → 1 querySelectorAll)
    document.querySelectorAll('.tm-dim, .tm-corp-synergy, .tm-tag-synergy, .tm-combo-hint, .tm-anti-combo, .tm-rec-best, .tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-dim', 'tm-corp-synergy', 'tm-tag-synergy', 'tm-combo-hint', 'tm-anti-combo', 'tm-rec-best', 'tm-playable', 'tm-unplayable');
    });
    // Clear data attributes
    document.querySelectorAll('[data-tm-processed]').forEach((el) => {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    document.querySelectorAll('[data-tm-reasons]').forEach((el) => el.removeAttribute('data-tm-reasons'));
    hideTooltip();
  }

  // ── Milestone/Award advisor ──

  // MA_DATA loaded from data/ma_data.json.js as TM_MA_DATA
  const MA_DATA = typeof TM_MA_DATA !== 'undefined' ? TM_MA_DATA : {};


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
    } catch(e) { tmWarn('api', 'Vue data parse failed', e); _pvCache = null; return null; }
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

  var TOAST_ICONS = { deny: '\u26D4', great: '\u2705', milestone: '\uD83C\uDFC6', gen: '\uD83D\uDD04', corp: '\uD83C\uDFED', info: '\u2139\uFE0F' };

  function drainToastQueue() {
    if (toastQueue.length === 0) { toastActive = false; return; }
    toastActive = true;
    const { msg, type } = toastQueue.shift();
    const el = ensureToast();
    var icon = TOAST_ICONS[type] || '';
    el.textContent = (icon ? icon + ' ' : '') + msg;
    el.className = 'tm-toast tm-toast-' + type + ' tm-toast-show';
    setTimeout(() => {
      el.classList.remove('tm-toast-show');
      setTimeout(drainToastQueue, 300);
    }, 2500);
  }

  // Rate limiter: max 1 toast per category per gen/round
  var toastShownKeys = {};
  function canShowToast(category, key) {
    var k = category + ':' + key;
    if (toastShownKeys[k]) return false;
    toastShownKeys[k] = true;
    return true;
  }
  function resetToastKeys() { toastShownKeys = {}; }

  // ── Draft recommendation engine ──

  var _cachedTableauNames = null, _tableauNamesTime = 0;
  function getMyTableauNames() {
    if (Date.now() - _tableauNamesTime < 2000 && _cachedTableauNames) return _cachedTableauNames;
    var names = [];
    document.querySelectorAll(SEL_TABLEAU).forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    _cachedTableauNames = names;
    _tableauNamesTime = Date.now();
    return names;
  }

  var _cachedHandNames = null, _handNamesTime = 0;
  function getMyHandNames() {
    if (Date.now() - _handNamesTime < 2000 && _cachedHandNames) return _cachedHandNames;
    var names = [];
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    _cachedHandNames = names;
    _handNamesTime = Date.now();
    return names;
  }

  // Hand + already-drafted cards this generation (for draft pick synergy)
  function getMyHandWithDrafted() {
    var hand = getMyHandNames().slice(); // copy to avoid mutating cache
    var pv = getPlayerVueData();
    if (pv && pv.draftedCards && pv.draftedCards.length > 0) {
      var handSet = new Set(hand);
      for (var i = 0; i < pv.draftedCards.length; i++) {
        var n = pv.draftedCards[i].name;
        if (n && !handSet.has(n)) hand.push(n);
      }
    }
    return hand;
  }

  // Detect played event card names in tableau (events are one-shot, no ongoing synergy)
  function getMyPlayedEventNames() {
    var evts = new Set();
    document.querySelectorAll(SEL_TABLEAU).forEach(function(el) {
      var hasEvt = false;
      el.querySelectorAll('[class*="tag-"]').forEach(function(t) {
        if (t.classList.contains('tag-event')) hasEvt = true;
      });
      // Also check card-type class
      if (!hasEvt && el.classList.contains('card-type--event')) hasEvt = true;
      if (hasEvt) {
        var n = el.getAttribute('data-tm-card');
        if (n) evts.add(n);
      }
    });
    return evts;
  }

  // Count tags from hand card DOM elements
  function getHandTagCounts() {
    var counts = {};
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var tags = getCardTags(el);
      tags.forEach(function(tag) { counts[tag] = (counts[tag] || 0) + 1; });
    });
    return counts;
  }

  // ── Player context for draft scoring ──

  var CORP_DISCOUNTS = TM_CORP_DISCOUNTS;
  var CARD_DISCOUNTS = TM_CARD_DISCOUNTS;
  var TAG_TRIGGERS = TM_TAG_TRIGGERS;
  var TAKE_THAT_CARDS = TM_TAKE_THAT_CARDS;
  var ANIMAL_TARGETS = new Set(TM_ANIMAL_TARGETS);
  var MICROBE_TARGETS = new Set(TM_MICROBE_TARGETS);
  var FLOATER_TARGETS = new Set(TM_FLOATER_TARGETS);

  // Keywords for detecting production/VP cards in the card description
  const PROD_KEYWORDS = ['прод', 'prod', 'production', 'increase'];
  const VP_KEYWORDS = ['VP', 'vp', 'ПО', 'victory point'];

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

  // Single-pass tableau scan: events, names, resource rates/targets, energy consumers
  function scanTableauForContext(tableau, ctx) {
    for (var i = 0; i < tableau.length; i++) {
      var cn = cardN(tableau[i]);
      ctx.tableauNames.add(cn);
      // Events count
      var d = TM_RATINGS[cn];
      if (d && d.t === 'event') ctx.events++;
      // Resource accumulation + energy consumers
      var fx = getFx(cn);
      if (fx) {
        if (fx.vpAcc && fx.vpPer) {
          if (fx.res === 'microbe') ctx.microbeAccumRate += fx.vpAcc;
          else if (fx.res === 'floater') ctx.floaterAccumRate += fx.vpAcc;
          else if (fx.res === 'animal') ctx.animalAccumRate += fx.vpAcc;
          else if (d && d.e) {
            var eLow = d.e.toLowerCase();
            if (eLow.includes('microb')) ctx.microbeAccumRate += fx.vpAcc;
            if (eLow.includes('animal')) ctx.animalAccumRate += fx.vpAcc;
          }
        }
        if (!ctx.hasEnergyConsumers && fx.ep && fx.ep < 0) ctx.hasEnergyConsumers = true;
      }
      // Resource targets
      if (FLOATER_TARGETS.has(cn)) ctx.floaterTargetCount++;
      if (ANIMAL_TARGETS.has(cn)) ctx.animalTargetCount++;
      if (MICROBE_TARGETS.has(cn)) ctx.microbeTargetCount++;
    }
  }

  function getPlayerContext() {
    const pv = getPlayerVueData();
    const gen = detectGeneration();
    const gensLeft = estimateGensLeft(pv);
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
      tableauNames: new Set(),
    };

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;

      // Resources
      ctx.mc = p.megaCredits || 0;
      ctx.steel = p.steel || 0;
      ctx.steelVal = p.steelValue || SC.defaultSteelVal;
      ctx.titanium = p.titanium || 0;
      ctx.tiVal = p.titaniumValue || SC.defaultTiVal;
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
      ctx.totalColonies = 0;
      ctx.colonyWorldCount = 0;
      extractColonies(pv, p.color, ctx);

      // Board state: cities, greeneries, events, hand, tableau
      ctx.handSize = p.cardsInHandNbr || (p.cardsInHand ? p.cardsInHand.length : 0);
      ctx.tableauSize = p.tableau ? p.tableau.length : 0;
      // Cities/greeneries from pre-aggregated playerTiles (vue-bridge)
      if (pv.game && pv.game.playerTiles && p.color && pv.game.playerTiles[p.color]) {
        ctx.cities = pv.game.playerTiles[p.color].cities || 0;
        ctx.greeneries = pv.game.playerTiles[p.color].greeneries || 0;
      }
      // Tags, corp discounts
      ctx.uniqueTagCount = 0;
      extractPlayerTags(p.tags, ctx);
      // Extended tag contexts: hand tags + projected future
      ctx.handTags = getHandTagCounts();
      ctx.tagsWithHand = {};
      ctx.tagsProjected = {};
      var tagDraftRates = { jovian: 0.3, science: 0.5, venus: 0.4, earth: 0.5, space: 1.0, building: 0.8, plant: 0.4, microbe: 0.3, animal: 0.3, power: 0.2, city: 0.2, event: 0.5 };
      for (var twh in ctx.tags) { ctx.tagsWithHand[twh] = ctx.tags[twh]; ctx.tagsProjected[twh] = ctx.tags[twh]; }
      var handTagDiscount = SC.handTagDiscount || 0.5; // not all hand cards will be played
      for (var tht in ctx.handTags) {
        ctx.tagsWithHand[tht] = (ctx.tagsWithHand[tht] || 0) + Math.round(ctx.handTags[tht] * handTagDiscount);
        ctx.tagsProjected[tht] = (ctx.tagsProjected[tht] || 0) + Math.round(ctx.handTags[tht] * handTagDiscount);
      }
      var futureGens = Math.max(0, gensLeft - 1);
      for (var tdr in tagDraftRates) {
        ctx.tagsProjected[tdr] = (ctx.tagsProjected[tdr] || 0) + Math.round(tagDraftRates[tdr] * futureGens);
      }
      var allCorpsCtx = detectMyCorps();
      applyCorpDiscounts(allCorpsCtx, ctx);

      // Board space tracking
      ctx.emptySpaces = 0;
      ctx.totalOccupied = 0;
      ctx.oceansOnBoard = 0;
      computeBoardState(pv, ctx);

      // Single-pass tableau scan: events, names, resource rates/targets, energy
      ctx.microbeAccumRate = 0;
      ctx.floaterAccumRate = 0;
      ctx.animalAccumRate = 0;
      ctx.floaterTargetCount = 0;
      ctx.animalTargetCount = 0;
      ctx.microbeTargetCount = 0;
      ctx.hasEnergyConsumers = false;
      if (p.tableau) scanTableauForContext(p.tableau, ctx);

      applyCardDiscounts(ctx);
      applyTagTriggers(ctx, allCorpsCtx);

      // MA proximity, global params, opponents, map, turmoil
      processMAProximity(pv.thisPlayer, pv.thisPlayer.color, pv, ctx);
      extractGlobalParams(pv, ctx);
      scanOpponents(pv, pv.thisPlayer.color, ctx);
      extractMapAndRate(pv, ctx);
      var myInfluence = pv.thisPlayer.politicalAgendasActionUsedCount != null ? 0 : (pv.thisPlayer.influence || 0);
      extractTurmoil(pv, pv.thisPlayer.color, myInfluence, ctx);
    }

    // Cache detected corps in ctx to avoid repeated detectMyCorps() in scoreDraftCard
    ctx._myCorps = detectMyCorps();

    var spResult2 = computeAllSP(pv, ctx.gensLeft, detectMyCorp());
    ctx.bestSP = spResult2 ? spResult2.best : null;
    ctx.allSP = spResult2 ? spResult2.all : [];

    if (debugMode) tmLog('ctx', 'Context: gen=' + ctx.gen + ' gensLeft=' + ctx.gensLeft + ' tr=' + ctx.tr + ' mc=' + ctx.mc + ' tags=' + JSON.stringify(ctx.tags));
    return ctx;
  }

  var CORP_ABILITY_SYNERGY = TM_CORP_ABILITY_SYNERGY;

  // Pre-built combo/anti-combo indexes (built once, cached)
  var _comboIndex = null;   // cardName → [{combo, otherCards}]
  var _antiComboIndex = null;
  function getComboIndex() {
    if (_comboIndex) return _comboIndex;
    _comboIndex = {};
    if (typeof TM_COMBOS !== 'undefined') {
      for (var i = 0; i < TM_COMBOS.length; i++) {
        var combo = TM_COMBOS[i];
        for (var j = 0; j < combo.cards.length; j++) {
          var cn = combo.cards[j];
          if (!_comboIndex[cn]) _comboIndex[cn] = [];
          _comboIndex[cn].push({ combo: combo, otherCards: combo.cards.filter(function(c) { return c !== cn; }) });
        }
      }
    }
    return _comboIndex;
  }
  function getAntiComboIndex() {
    if (_antiComboIndex) return _antiComboIndex;
    _antiComboIndex = {};
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (var i = 0; i < TM_ANTI_COMBOS.length; i++) {
        var anti = TM_ANTI_COMBOS[i];
        for (var j = 0; j < anti.cards.length; j++) {
          var cn = anti.cards[j];
          if (!_antiComboIndex[cn]) _antiComboIndex[cn] = [];
          _antiComboIndex[cn].push({ anti: anti, otherCards: anti.cards.filter(function(c) { return c !== cn; }) });
        }
      }
    }
    return _antiComboIndex;
  }

  // Cached card tags from DOM (avoids repeated querySelectorAll per card)
  var _cardTagsCache = new WeakMap();
  function getCachedCardTags(cardEl) {
    var cached = _cardTagsCache.get(cardEl);
    if (cached) return cached;
    var tags = getCardTags(cardEl);
    _cardTagsCache.set(cardEl, tags);
    return tags;
  }

  // ── Unified corp boost calculation (used by draft scoring + discard advice) ──
  // Returns numeric bonus for a card given a corp. Positive = synergy, negative = anti-synergy.
  // opts: { eLower, cardTags, cardCost, cardType, cardName, ctx }
  function getCorpBoost(corpName, opts) {
    var eLower = opts.eLower || '';
    var cardTags = opts.cardTags;
    var cardCost = opts.cardCost;
    switch (corpName) {
      case 'Point Luna': return (eLower.includes('draw') || eLower.includes('card') || cardTags.has('earth')) ? 2 : 0;
      case 'EcoLine': {
        var ecoBoost = 0;
        // Plant cards are core strategy
        if (eLower.includes('plant') || eLower.includes('green') || eLower.includes('раст')) ecoBoost += 3;
        // Ocean cards: placement near greeneries for adjacency
        if (eLower.includes('ocean') || eLower.includes('океан')) ecoBoost += 2;
        // Plant production specifically
        if (eLower.includes('plant production') || eLower.includes('продукц') && eLower.includes('раст')) ecoBoost += 1;
        // Penalty: -MC production hurts card buying for plant engine
        if (eLower.includes('decrease') && eLower.includes('m€ production') || eLower.includes('decrease your m€')) ecoBoost -= 2;
        return ecoBoost;
      }
      case 'Tharsis Republic': return (eLower.includes('city') || eLower.includes('город')) ? 3 : 0;
      case 'Helion': return (eLower.includes('heat') || eLower.includes('тепл')) ? 2 : 0;
      case 'PhoboLog': return cardTags.has('space') ? 2 : 0;
      case 'Mining Guild': return (eLower.includes('steel') || eLower.includes('стал') || cardTags.has('building')) ? 1 : 0;
      case 'CrediCor': return (cardCost != null && cardCost >= 20) ? 2 : 0;
      case 'Interplanetary Cinematics': return cardTags.has('event') ? 2 : 0;
      case 'Arklight': return (eLower.includes('animal') || eLower.includes('plant') || eLower.includes('жив')) ? 2 : 0;
      case 'Poseidon': return (eLower.includes('colon') || eLower.includes('колон')) ? 3 : 0;
      case 'Polyphemos': return (eLower.includes('draw') || eLower.includes('card')) ? -2 : 0;
      case 'Lakefront Resorts': return (eLower.includes('ocean') || eLower.includes('океан')) ? 2 : 0;
      case 'Splice': return cardTags.has('microbe') ? 2 : 0;
      case 'Celestic': return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0;
      case 'Robinson Industries': return (eLower.includes('prod') || eLower.includes('прод')) ? 1 : 0;
      case 'Viron': return opts.cardType === 'blue' ? 2 : 0;
      case 'Recyclon': return cardTags.has('building') ? 1 : 0;
      case 'Stormcraft Incorporated': return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0;
      case 'Aridor':
        if (!opts.ctx || !opts.ctx.tags) return 0;
        var newType = false;
        cardTags.forEach(function(tag) { if ((opts.ctx.tags[tag] || 0) === 0) newType = true; });
        return newType ? 3 : 0;
      case 'Manutech':
        var fx = getFx(opts.cardName);
        if (fx) {
          var instantMC = 0;
          var sVal = opts.ctx ? (opts.ctx.steelVal || 2) : 2;
          var tVal = opts.ctx ? (opts.ctx.tiVal || 3) : 3;
          if (fx.sp > 0) instantMC += fx.sp * sVal;
          if (fx.tp > 0) instantMC += fx.tp * tVal;
          if (fx.mp > 0) instantMC += fx.mp;
          if (fx.pp > 0) instantMC += fx.pp * 1.5;
          if (fx.ep > 0) instantMC += fx.ep * 1.5;
          if (fx.hp > 0) instantMC += fx.hp;
          if (instantMC >= 13) return 5;
          if (instantMC >= 8) return 4;
          if (instantMC >= 4) return 3;
          if (instantMC > 0) return 2;
        }
        return (eLower.includes('prod') || eLower.includes('прод')) ? 2 : 0;

      // ── Additional corps (abilities from game source) ──
      case 'Aphrodite':
        return (cardTags.has('venus') || eLower.includes('venus')) ? 2 : 0;
      case 'Arcadian Communities':
        return (eLower.includes('city') || eLower.includes('город') || eLower.includes('tile') || eLower.includes('тайл')) ? 2 : 0;
      case 'Astrodrill':
        return cardTags.has('space') ? 1 : 0;
      case 'Cheung Shing MARS':
        return cardTags.has('building') ? 2 : 0;
      case 'EcoTec':
        return (cardTags.has('microbe') || cardTags.has('plant') || cardTags.has('animal')) ? 2 : 0;
      case 'Factorum':
        return cardTags.has('building') ? 1 : (eLower.includes('energy') || eLower.includes('энерг')) ? 1 : 0;
      case 'Inventrix': {
        var iFx = getFx(opts.cardName);
        return (iFx && (iFx.minG != null || iFx.maxG != null)) ? 2 : cardTags.has('science') ? 1 : 0;
      }
      case 'Kuiper Cooperative':
        return cardTags.has('space') ? 1 : (eLower.includes('colon') || eLower.includes('колон')) ? 1 : 0;
      case 'Midas':
        return (cardCost != null && cardCost >= 20) ? 1 : 0;
      case 'Mars Direct':
        return cardTags.has('mars') ? 2 : 0;
      case 'Mons Insurance':
        // Mons pays 3 MC to victims when YOU attack — penalty for attack cards
        if (eLower.includes('decrease') || eLower.includes('steal') || eLower.includes('remove')
            || eLower.includes('снизить') || eLower.includes('украсть')) return -2;
        return 0;
      case 'Morning Star Inc.':
        return cardTags.has('venus') ? 2 : 0;
      case 'Nirgal Enterprises': // free milestones/awards. Broad corp, no specific card-type boost.
        return 0;
      case 'Palladin Shipping':
        return (cardTags.has('space') && opts.cardType === 'event') ? 2 : cardTags.has('space') ? 1 : 0;
      case 'Pharmacy Union': // 2 starting diseases. Science → remove disease + 1 TR (or flip for 3 TR). Microbe → disease + -4 MC.
        return cardTags.has('science') ? 4 : cardTags.has('microbe') ? -3 : 0;
      case 'Philares':
        return (eLower.includes('city') || eLower.includes('город') || eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('tile') || eLower.includes('тайл')) ? 2 : 0;
      case 'Polaris': // any ocean → +1 MC-prod; OWN ocean → also +4 MC
        return (eLower.includes('ocean') || eLower.includes('океан')) ? 3 : 0;
      case 'PolderTECH Dutch':
        return (eLower.includes('ocean') || eLower.includes('океан') || eLower.includes('greenery') || eLower.includes('озелен')) ? 2 : cardTags.has('plant') ? 1 : 0;
      case 'Pristar': {
        // No TR this gen → +6 MC + 1 preservation (1 VP). Engine/VP without TR = ideal.
        var pFx = getFx(opts.cardName);
        if (pFx && (pFx.tr || pFx.actTR)) return -2; // TR costs bonus (~11 MC lost)
        if (pFx && (pFx.vp > 0 || pFx.vpAcc > 0)) return 2; // VP without TR = exactly what Pristar wants
        if (eLower.includes('prod') || eLower.includes('прод')) return 2; // production engine → more value per gen
        return 0;
      }
      case 'Sagitta Frontier Services': {
        // No-tag → +4 MC; exactly 1 tag → +1 MC. Events count as +1 tag.
        var sTagCount = cardTags.size || 0;
        if (opts.cardType === 'event') sTagCount++;
        return sTagCount === 0 ? 4 : sTagCount === 1 ? 1 : 0;
      }
      case 'Saturn Systems':
        return cardTags.has('jovian') ? 3 : 0;
      case 'Septem Tribus':
        return (eLower.includes('delegate') || eLower.includes('делегат') || eLower.includes('influence') || eLower.includes('влиян')) ? 2 : 0;
      case 'Spire': {
        var spTagCount = cardTags.size || 0;
        return spTagCount >= 2 ? 2 : 0;
      }
      case 'Teractor':
        return cardTags.has('earth') ? 3 : 0;
      case 'Terralabs Research':
        return (eLower.includes('draw') || eLower.includes('card') || eLower.includes('карт')) ? 2 : (cardCost != null && cardCost <= 12) ? 1 : 0;
      case 'Thorgate': // also -3 MC on Power Plant SP (not reflected in card boost)
        return cardTags.has('power') ? 3 : 0;
      case 'Tycho Magnetics':
        // Action: spend X energy → draw X, keep 1. Energy prod = better filtration
        if (cardTags.has('power') || eLower.includes('energy prod') || eLower.includes('энерг')) return 2;
        return 0;
      case 'United Nations Mars Initiative': {
        var uFx = getFx(opts.cardName);
        return (uFx && (uFx.tr || uFx.actTR)) ? 2 : 0;
      }
      case 'Utopia Invest':
        return (eLower.includes('prod') || eLower.includes('прод')) ? 1 : 0;
      case 'Valley Trust':
        return cardTags.has('science') ? 2 : 0;
      case 'Vitor': {
        var vFx = getFx(opts.cardName);
        return (vFx && (vFx.vp > 0 || vFx.vpAcc > 0)) ? 2 : 0;
      }
      case 'Gagarin Mobile Base':
        return (eLower.includes('tile') || eLower.includes('тайл') || eLower.includes('city') || eLower.includes('greenery')) ? 2 : 0;
      // Pathfinders corps
      case 'Ambient':
        // Action: when temp maxed, spend 8 heat → 1 TR (repeatable)
        return (eLower.includes('heat') || eLower.includes('тепл')) ? 2 : 0;
      case 'Mars Maths':
        // Action: take 2 extra actions per gen
        return opts.cardType === 'blue' ? 1 : 0; // more actions = more blue card activations
      case 'Bio-Sol':
        // Action: add 1 microbe to any card
        return cardTags.has('microbe') ? 2 : (eLower.includes('microbe') || eLower.includes('микроб')) ? 1 : 0;
      case 'Collegium Copernicus':
        // Action: spend 3 data → trade. Science tag corp
        return cardTags.has('science') ? 2 : 0;
      case 'Robin Haulings':
        // Action: remove 3 floaters → raise Venus or O₂
        return (eLower.includes('floater') || eLower.includes('venus')) ? 2 : 0;
      case 'Odyssey':
        // Action: replay event (≤16 MC). Events more valuable
        return opts.cardType === 'red' ? 2 : cardTags.has('event') ? 2 : 0;
      case 'Mind Set Mars':
        // Action: agenda resources ↔ delegates
        return (eLower.includes('delegate') || eLower.includes('делегат')) ? 2 : 0;
      // Underworld corps
      case 'Henkei Genetics':
        return cardTags.has('microbe') ? 2 : 0;
      case 'Arborist Collective':
        return cardTags.has('plant') ? 2 : (eLower.includes('plant') && eLower.includes('prod')) ? 1 : 0;
      case 'Keplertec':
        return cardTags.has('space') ? 1 : 0;
      case 'Voltagon':
        // Action: spend 8 energy → raise O₂ or Venus
        return (cardTags.has('power') || eLower.includes('energy prod')) ? 2 : 0;
      case 'Anubis Securities':
        return cardTags.has('crime') ? 2 : 0;
      // Moon corps
      case 'Nanotech Industries':
        // Action: add 1 science resource to any card
        return cardTags.has('science') ? 2 : (eLower.includes('resource') || eLower.includes('ресурс')) ? 1 : 0;
      case 'Luna Hyperloop Corporation':
        return (eLower.includes('road') || eLower.includes('moon')) ? 1 : cardTags.has('building') ? 1 : 0;
      case 'The Archaic Foundation Institute':
        return (eLower.includes('resource') || eLower.includes('ресурс')) ? 1 : 0;
      case 'Tempest Consultancy':
        return (eLower.includes('delegate') || cardTags.has('moon')) ? 1 : 0;
      case 'The Darkside of The Moon Syndicate':
        return cardTags.has('space') ? 1 : 0; // spend ti → fleet → steal MC
      case 'Hadesphere':
        return cardTags.has('building') ? 1 : 0; // excavation synergy
      case 'Demetron Labs':
        return cardTags.has('science') ? 1 : 0; // data → identify → claim
      case 'Jenson-Boyle & Co':
        return cardTags.has('crime') ? 2 : 0; // corruption synergy
      default: return 0;
    }
  }

  // ── Extracted scoring helpers for scoreDraftCard ──

  // 36. Map-aware Milestone/Award bonuses
  function _scoreMapMA(data, cardTags, cardCost, ctx, SC) {
    var bonus = 0, reasons = [];
    if ((!ctx.milestones || ctx.milestones.size === 0) && (!ctx.awards || ctx.awards.size === 0)) return { bonus: bonus, reasons: reasons };
    if (!cardTags || cardTags.size === 0) return { bonus: bonus, reasons: reasons };
    var eLow = data.e ? data.e.toLowerCase() : '';

    // Milestones
    if (ctx.milestones.has('Diversifier')) {
      // Skip on gen 1 — all tags are "new", bonus doesn't discriminate
      var uniqueTagCount = 0;
      // Milestones check tableau only (not hand) — milestone conditions are on-board
      if (ctx.tags) { for (var tk in ctx.tags) { if (ctx.tags[tk] > 0 && tk !== 'event') uniqueTagCount++; } }
      if (uniqueTagCount >= 3) {
        for (var tag of cardTags) { if ((ctx.tags[tag] || 0) === 0 && tag !== 'event') { bonus += SC.hellasDiversifier; reasons.push('Diversifier +' + SC.hellasDiversifier); break; } }
      }
    }
    if (ctx.milestones.has('Rim Settler') && cardTags.has('jovian')) { bonus += SC.hellasJovian; reasons.push('Rim Settler +' + SC.hellasJovian); }
    if (ctx.milestones.has('Energizer') && (cardTags.has('power') || eLow.includes('energy-prod'))) { bonus += SC.hellasEnergizer; reasons.push('Energizer +' + SC.hellasEnergizer); }
    if (ctx.milestones.has('Ecologist')) {
      var bioTags = ['plant', 'animal', 'microbe'];
      for (var bt = 0; bt < bioTags.length; bt++) { if (cardTags.has(bioTags[bt])) { bonus += SC.elysiumEcologist; reasons.push('Ecologist +' + SC.elysiumEcologist); break; } }
    }
    if (ctx.milestones.has('Legend') && cardTags.has('event')) { bonus += SC.elysiumLegend; reasons.push('Legend +' + SC.elysiumLegend); }
    if (ctx.milestones.has('Builder') && cardTags.has('building')) { bonus += SC.tharsisBuilder; reasons.push('Builder +' + SC.tharsisBuilder); }
    if (ctx.milestones.has('Mayor') && eLow.includes('city')) { bonus += SC.tharsisMayor; reasons.push('Mayor +' + SC.tharsisMayor); }
    var _ma = SC.maGenericBonus;
    if (ctx.milestones.has('Tactician') || ctx.milestones.has('Tactician4')) { if (data.w && data.w.toLowerCase().includes('req')) { bonus += _ma; reasons.push('Tactician +' + _ma); } }
    if (ctx.milestones.has('Hydrologist') || ctx.milestones.has('Polar Explorer')) { if (eLow.includes('ocean')) { bonus += _ma; reasons.push('Hydrologist +' + _ma); } }
    if (ctx.milestones.has('Gardener') && (eLow.includes('greenery') || eLow.includes('plant-prod'))) { bonus += _ma; reasons.push('Gardener +' + _ma); }
    if (ctx.milestones.has('Geologist') && (eLow.includes('steel-prod') || eLow.includes('ti-prod'))) { bonus += _ma; reasons.push('Geologist +' + _ma); }
    if (ctx.milestones.has('Terraformer') && eLow.includes('tr')) { bonus += _ma; reasons.push('Terraformer +' + _ma); }
    if (ctx.milestones.has('Planner') && (eLow.includes('card') || eLow.includes('draw'))) { bonus += _ma; reasons.push('Planner +' + _ma); }
    if (ctx.milestones.has('Generalist')) {
      var prodTypes = ['mc-prod', 'steel-prod', 'ti-prod', 'plant-prod', 'energy-prod', 'heat-prod'];
      for (var pi = 0; pi < prodTypes.length; pi++) { if (eLow.includes(prodTypes[pi])) { bonus += _ma; reasons.push('Generalist +' + _ma); break; } }
    }
    if (ctx.milestones.has('Briber') && (eLow.includes('delegate') || eLow.includes('influence'))) { bonus += _ma; reasons.push('Briber +' + _ma); }
    if (ctx.milestones.has('Terran') && cardTags.has('earth')) { bonus += _ma; reasons.push('Terran +' + _ma); }
    if (ctx.milestones.has('Architect') && cardTags.has('building')) { bonus += _ma; reasons.push('Architect +' + _ma); }
    if (ctx.milestones.has('T. Collector') && cardTags.size >= 2) { bonus += Math.round(_ma * 0.5); reasons.push('T.Coll +' + Math.round(_ma * 0.5)); }
    if (ctx.milestones.has('Tropicalist') && eLow.includes('ocean')) { bonus += _ma; reasons.push('Tropicalist +' + _ma); }

    // Awards
    if (ctx.awards.has('Scientist') && cardTags.has('science')) { bonus += _ma; reasons.push('Scientist +' + _ma); }
    if (ctx.awards.has('Celebrity') && cardCost != null && cardCost >= 15) { bonus += SC.elysiumCelebrity; reasons.push('Celebrity +' + SC.elysiumCelebrity); }
    if (ctx.awards.has('Banker') && eLow.includes('mc-prod')) { bonus += _ma; reasons.push('Banker +' + _ma); }
    if (ctx.awards.has('Manufacturer') || ctx.awards.has('Contractor')) {
      var awardName = ctx.awards.has('Manufacturer') ? 'Manufacturer' : 'Contractor';
      if (cardTags.has('building')) { bonus += _ma; reasons.push(awardName + ' +' + _ma); }
    }
    if (ctx.awards.has('Thermalist') && eLow.includes('heat')) { bonus += _ma; reasons.push('Thermalist +' + _ma); }
    if (ctx.awards.has('Miner') && (eLow.includes('steel') || eLow.includes('ti-prod') || eLow.includes('titanium'))) { bonus += _ma; reasons.push('Miner +' + _ma); }
    if (ctx.awards.has('Space Baron') && cardTags.has('space')) { bonus += _ma; reasons.push('Space Baron +' + _ma); }
    if (ctx.awards.has('Industrialist') && (eLow.includes('energy-prod') || eLow.includes('steel-prod'))) { bonus += _ma; reasons.push('Industrialist +' + _ma); }
    if (ctx.awards.has('Cultivator') && (eLow.includes('plant-prod') || eLow.includes('greenery'))) { bonus += _ma; reasons.push('Cultivator +' + _ma); }
    if (ctx.awards.has('Benefactor') && eLow.includes('tr')) { bonus += _ma; reasons.push('Benefactor +' + _ma); }

    return { bonus: bonus, reasons: reasons };
  }

  // 48. SYNERGY_RULES — placer/accumulator/eater mechanical synergies
  function _scoreSynergyRules(cardName, allMyCards, ctx, SC) {
    var bonus = 0, reasons = [];
    if (typeof TM_CARD_EFFECTS === 'undefined') return { bonus: bonus, reasons: reasons };
    var fx48 = TM_CARD_EFFECTS[cardName];
    if (!fx48) return { bonus: bonus, reasons: reasons };

    function canReach(placerFx, targetFx) {
      if (!placerFx.placesTag) return true;
      var tg = targetFx.tg;
      var tags = Array.isArray(tg) ? tg : (tg ? [tg] : []);
      return tags.indexOf(placerFx.placesTag) !== -1;
    }

    var synRulesBonus = 0;

    // 48a. Placer → accumulators in tableau
    if (fx48.places) {
      var placeTypes = Array.isArray(fx48.places) ? fx48.places : [fx48.places];
      for (var pt = 0; pt < placeTypes.length; pt++) {
        var targetCount = 0;
        for (var m = 0; m < allMyCards.length; m++) {
          var mfx = TM_CARD_EFFECTS[allMyCards[m]];
          if (mfx && mfx.res === placeTypes[pt] && canReach(fx48, mfx)) targetCount++;
        }
        if (targetCount > 0) {
          var placerBonus = Math.min(targetCount * SC.placerPerTarget, SC.placerTargetCap);
          synRulesBonus += placerBonus;
          reasons.push(targetCount + ' ' + placeTypes[pt] + ' цель');
        }
      }
      // 48e. Placer без целей
      for (var pt48e = 0; pt48e < placeTypes.length; pt48e++) {
        var hasTarget = false;
        for (var m48e = 0; m48e < allMyCards.length; m48e++) {
          var mfx48e = TM_CARD_EFFECTS[allMyCards[m48e]];
          if (mfx48e && mfx48e.res === placeTypes[pt48e] && canReach(fx48, mfx48e)) { hasTarget = true; break; }
        }
        if (!hasTarget) {
          synRulesBonus -= SC.noTargetPenalty;
          reasons.push('Нет ' + placeTypes[pt48e] + ' целей −' + SC.noTargetPenalty);
        }
      }
    }

    // 48b. Accumulator → placers in tableau
    if (fx48.res) {
      var placerCount = 0;
      for (var m = 0; m < allMyCards.length; m++) {
        var mfx = TM_CARD_EFFECTS[allMyCards[m]];
        if (mfx && mfx.places) {
          var mpt = Array.isArray(mfx.places) ? mfx.places : [mfx.places];
          if (mpt.indexOf(fx48.res) !== -1 && canReach(mfx, fx48)) placerCount++;
        }
      }
      if (placerCount > 0) {
        var accumBonus = Math.min(placerCount, 2) * SC.accumWithPlacer;
        synRulesBonus += accumBonus;
        reasons.push(placerCount + ' placer для ' + fx48.res);
      }
      // 48c. Accumulator competition
      var competitorCount = 0;
      for (var mc = 0; mc < allMyCards.length; mc++) {
        var mfxc = TM_CARD_EFFECTS[allMyCards[mc]];
        if (mfxc && mfxc.res === fx48.res && allMyCards[mc] !== cardName) competitorCount++;
      }
      if (competitorCount >= 2) {
        synRulesBonus -= SC.accumCompete;
        reasons.push('конкуренция ' + fx48.res + ' (' + (competitorCount + 1) + ' шт)');
      }
    }

    // 48d. Resource eater
    if (fx48.eats) {
      var eatType = fx48.eats;
      var ownAccumCount = 0;
      for (var me = 0; me < allMyCards.length; me++) {
        var mfxe = TM_CARD_EFFECTS[allMyCards[me]];
        if (mfxe && mfxe.res === eatType && allMyCards[me] !== cardName) ownAccumCount++;
      }
      if (ownAccumCount > 0) {
        var eatPenalty = SC.eatsOwnPenalty * Math.min(ownAccumCount, 2);
        synRulesBonus -= eatPenalty;
        reasons.push('ест свои ' + eatType + ' (' + ownAccumCount + ') −' + eatPenalty);
      }
      if (ctx) {
        var oppTgt = eatType === 'animal' ? (ctx.oppAnimalTargets || 0) : eatType === 'microbe' ? (ctx.oppMicrobeTargets || 0) : 0;
        if (oppTgt > 0) {
          var eatBonus = Math.min(SC.eatsOppBonus + Math.min(oppTgt - 1, 2), SC.eatsOppBonus + 2);
          synRulesBonus += eatBonus;
          reasons.push('опп. ' + eatType + ' (' + oppTgt + ') +' + eatBonus);
        }
      }
    }

    bonus = Math.min(synRulesBonus, SC.synRulesCap);
    return { bonus: bonus, reasons: reasons };
  }

  // Prelude-specific scoring
  function _scorePrelude(cardName, data, cardEl, myCorp, ctx, SC) {
    var bonus = 0, reasons = [];
    var isPrelude = cardEl && (
      cardEl.closest('.wf-component--select-prelude') ||
      cardEl.classList.contains('prelude-card')
    );
    if (!isPrelude || !ctx) return { bonus: bonus, reasons: reasons };

    // Gen 1 production bonus
    if (ctx.gen <= 1) {
      var econLower = (data.e || '').toLowerCase();
      if (econLower.includes('прод') || econLower.includes('prod') || econLower.includes('production')) {
        bonus += SC.preludeEarlyProd; reasons.push('Прод ген.1 +' + SC.preludeEarlyProd);
      }
      if (econLower.includes('tr') || econLower.includes('terraform')) {
        bonus += SC.preludeEarlyTR; reasons.push('Ранний TR +' + SC.preludeEarlyTR);
      }
      if (econLower.includes('steel') || econLower.includes('стал') || econLower.includes('titanium') || econLower.includes('титан')) {
        bonus += SC.preludeEarlyResources; reasons.push('Ресурсы ген.1 +' + SC.preludeEarlyResources);
      }
    }
    // Tag value on prelude
    if (cardEl) {
      var pTags = getCardTags(cardEl);
      if (pTags.size > 0 && ctx.tagTriggers) {
        var tagBonus = 0;
        for (var trigger of ctx.tagTriggers) {
          if (trigger.eventOnly) continue; // preludes are never events
          for (var tTag of (trigger.tags || [])) { if (pTags.has(tTag)) tagBonus += trigger.value; }
        }
        if (tagBonus > 0) { bonus += Math.min(SC.preludeTagCap, tagBonus); reasons.push('Теги прел. +' + Math.min(SC.preludeTagCap, tagBonus)); }
      }
    }
    // Corp+prelude combo
    if (myCorp && typeof TM_COMBOS !== 'undefined') {
      for (var ci = 0; ci < TM_COMBOS.length; ci++) {
        var combo = TM_COMBOS[ci];
        if (!combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
        var ratingBonus = combo.r === 'godmode' ? SC.preludeCorpGodmode : combo.r === 'great' ? SC.preludeCorpGreat : combo.r === 'good' ? SC.preludeCorpGood : SC.preludeCorpDecent;
        bonus += ratingBonus; reasons.push('Комбо с ' + myCorp + ' +' + ratingBonus);
        break;
      }
    }
    // Prelude-prelude synergy
    if (typeof TM_COMBOS !== 'undefined') {
      var preludeEls = document.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card]');
      var otherPreludes = [];
      preludeEls.forEach(function(pel) {
        var pName = pel.getAttribute('data-tm-card');
        if (!pName || pName === cardName) return;
        otherPreludes.push(pName);
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (combo.cards.includes(cardName) && combo.cards.includes(pName)) {
            var rBonus = combo.r === 'godmode' ? SC.preludePreludeGodmode : combo.r === 'great' ? SC.preludePreludeGreat : combo.r === 'good' ? SC.preludePreludeGood : SC.preludePreludeDecent;
            bonus += rBonus; reasons.push('Прел.+' + (ruName(pName) || pName).substring(0, 12) + ' +' + rBonus);
          }
        }
      });
      // Triple synergy
      if (myCorp && otherPreludes.length > 0) {
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (combo.cards.length < 3 || !combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
          for (var oi = 0; oi < otherPreludes.length; oi++) {
            if (combo.cards.includes(otherPreludes[oi])) {
              var matched = 2; // cardName + myCorp already confirmed
              for (var mi = 0; mi < otherPreludes.length; mi++) {
                if (combo.cards.includes(otherPreludes[mi])) matched++;
              }
              if (matched >= combo.cards.length) {
                var triBonus = combo.r === 'godmode' ? SC.preludeTripleGodmode : combo.r === 'great' ? SC.preludeTripleGreat : combo.r === 'good' ? SC.preludeTripleGood : SC.preludeTripleDecent;
                bonus += triBonus; reasons.push('★ Тройное комбо! +' + triBonus);
              } else {
                var partialBonus = combo.r === 'godmode' ? SC.preludePartialGodmode : combo.r === 'great' ? SC.preludePartialGreat : SC.preludePartialDecent;
                bonus += partialBonus; reasons.push('Тройное частичное 3/' + combo.cards.length + ' +' + partialBonus);
              }
            }
          }
        }
        // Rare tag synergy
        for (var oi = 0; oi < otherPreludes.length; oi++) {
          var otherData = TM_RATINGS[otherPreludes[oi]];
          if (!otherData || !otherData.g || !data.g) continue;
          var sharedTags = data.g.filter(function(t) { return otherData.g && otherData.g.includes(t); });
          var rareShared = sharedTags.filter(function(t) { return ['Jovian','Science','Venus','Earth'].includes(t); });
          if (rareShared.length > 0) {
            bonus += SC.preludeRareTagSynergy; reasons.push('Прелюдии: ' + rareShared[0] + ' синергия +' + SC.preludeRareTagSynergy);
          }
        }
      }
    }
    return { bonus: bonus, reasons: reasons };
  }

  // Apply {bonus, reasons} result to running totals
  function applyResult(result, bonus, reasons) {
    for (var i = 0; i < result.reasons.length; i++) reasons.push(result.reasons[i]);
    return bonus + result.bonus;
  }

  // Hand synergy: how well does this card pair with OTHER cards in hand (not tableau)
  // Captures enabler→payoff relationships that tableau synergy and combo index miss
  function scoreHandSynergy(cardName, myHand, ctx) {
    var bonus = 0;
    var descs = [];
    if (!myHand || myHand.length === 0) return { bonus: 0, reasons: [] };
    var gensLeft = ctx ? ctx.gensLeft : 5;
    var handSet = new Set(myHand);

    // Get card's tags
    var getCardTagsLocal = function(n) {
      if (typeof TM_CARD_TAGS !== 'undefined' && TM_CARD_TAGS[n]) return TM_CARD_TAGS[n];
      return [];
    };
    var cardTagsArr = getCardTagsLocal(cardName);
    var isEvent = cardTagsArr.indexOf('event') >= 0;
    var isSpaceEvent = isEvent && cardTagsArr.indexOf('space') >= 0;
    var _effData = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : {};
    var cardEff = _effData[cardName] || {};

    // Pre-build hand tag index (tag → count, card → tags cache)
    var handTagMap = {};   // tag → [cardName, ...]
    var handTagCache = {}; // cardName → tags[]
    for (var _hti = 0; _hti < myHand.length; _hti++) {
      var _htn = myHand[_hti];
      var _htTags = getCardTagsLocal(_htn);
      handTagCache[_htn] = _htTags;
      for (var _htj = 0; _htj < _htTags.length; _htj++) {
        var _htTag = _htTags[_htj];
        if (!handTagMap[_htTag]) handTagMap[_htTag] = [];
        handTagMap[_htTag].push(_htn);
      }
    }

    // Global headroom multipliers: reduce stacking bonus when globals are closing
    var gp = ctx && ctx.globalParams ? ctx.globalParams : {};
    var tempStepsLeft = typeof gp.temp === 'number' ? Math.max(0, (8 - gp.temp) / 2) : 19; // 19 total steps
    var oxyStepsLeft = typeof gp.oxy === 'number' ? Math.max(0, 14 - gp.oxy) : 14;
    var ocStepsLeft = ctx && typeof ctx.oceansOnBoard === 'number' ? Math.max(0, 9 - ctx.oceansOnBoard) : 9;
    var vnStepsLeft = typeof gp.venus === 'number' ? Math.max(0, (30 - gp.venus) / 2) : 15;
    // Headroom factor: 1.0 = fully open, 0.2 = nearly closed (enough for 1 card still)
    var tempHR = tempStepsLeft >= 3 ? 1.0 : Math.max(0.2, tempStepsLeft / 3);
    var plantHR = oxyStepsLeft >= 3 ? 1.0 : Math.max(0.2, oxyStepsLeft / 3);
    var ocHR = ocStepsLeft >= 2 ? 1.0 : Math.max(0.2, ocStepsLeft / 2);
    var vnHR = vnStepsLeft >= 3 ? 1.0 : Math.max(0.2, vnStepsLeft / 3);

    // ── 1. REBATES & TAG TRIGGERS in hand boost this card ──

    // Rush space events: raise globals (temp/ocean/oxygen/venus/TR) → tempo + Opt Aero heat = more rush
    var RUSH_SPACE_EVENTS = {
      'Asteroid': 1, 'Big Asteroid': 1, 'Comet': 1, 'Comet for Venus': 1, 'Convoy From Europa': 1,
      'Deimos Down': 1, 'GHG Import From Venus': 1, 'Giant Ice Asteroid': 1, 'Hydrogen to Venus': 1,
      'Ice Asteroid': 1, 'Imported Hydrogen': 1, 'Imported Nitrogen': 1, 'Large Convoy': 1,
      'Metallic Asteroid': 1, 'Nitrogen-Rich Asteroid': 1, 'Small Asteroid': 1, 'Small Comet': 1,
      'Solar Storm': 1, 'Spin-Inducing Asteroid': 1, 'Towing A Comet': 1, 'Water to Venus': 1
    };
    var isRushSpaceEvent = isSpaceEvent && RUSH_SPACE_EVENTS[cardName];

    // Optimal Aerobraking: rebate +3 MC +3 heat. Rush events get extra (heat → tempo)
    if (isSpaceEvent && handSet.has('Optimal Aerobraking') && cardName !== 'Optimal Aerobraking') {
      bonus += 3; // base rebate: +3 MC +3 heat always
      if (isRushSpaceEvent) { bonus += 1.5; descs.push('OptAero +4.5 rush'); }
      else { descs.push('OptAero +3'); }
    }
    // This card IS Optimal Aerobraking → count space events in hand
    if (cardName === 'Optimal Aerobraking') {
      var rushCount = 0, nonRushCount = 0;
      for (var oai = 0; oai < myHand.length; oai++) {
        var oaTags = handTagCache[myHand[oai]] || [];
        if (oaTags.indexOf('event') >= 0 && oaTags.indexOf('space') >= 0 && myHand[oai] !== cardName) {
          if (RUSH_SPACE_EVENTS[myHand[oai]]) rushCount++; else nonRushCount++;
        }
      }
      var total = rushCount + nonRushCount;
      if (total > 0) {
        bonus += Math.min(total * 2 + rushCount * 0.5, 8); // capped
        var oaDesc = total + ' space ev';
        if (rushCount > 0) oaDesc += ' (' + rushCount + ' rush)';
        descs.push(oaDesc);
      }
    }

    // Media Group: this card is an event → +1.5 MC from Media trigger
    if (isEvent && handSet.has('Media Group') && cardName !== 'Media Group') {
      bonus += 1.5; descs.push('Media +1.5');
    }
    if (cardName === 'Media Group') {
      var eventsInHand = (handTagMap['event'] || []).length;
      if (eventsInHand > 0) { bonus += Math.min(eventsInHand * 1, 5); descs.push(eventsInHand + ' events'); }
    }

    // Earth Office: this card has earth tag → -3 MC
    if (cardTagsArr.indexOf('earth') >= 0 && handSet.has('Earth Office') && cardName !== 'Earth Office') {
      bonus += 3; descs.push('EarthOff -3');
    }
    if (cardName === 'Earth Office') {
      var earthInHand = (handTagMap['earth'] || []).length;
      if (earthInHand > 0) { bonus += Math.min(earthInHand * 1.5, 6); descs.push(earthInHand + ' earth'); }
    }

    // ── 2. RESOURCE PLACEMENT ──
    var animalVPInHand = myHand.filter(function(n) { return TM_ANIMAL_VP_CARDS.indexOf(n) >= 0; });
    var microbeVPInHand = myHand.filter(function(n) { return TM_MICROBE_VP_CARDS.indexOf(n) >= 0; });

    // Animal placement cards boost animal VP targets in hand
    var animalPlacers = TM_ANIMAL_PLACERS;
    if (animalPlacers[cardName] && animalVPInHand.length > 0) {
      var vpPerA = gensLeft >= 4 ? 4 : 7;
      var aBonus = Math.min(animalPlacers[cardName] * vpPerA, 14) * 0.5;
      bonus += aBonus;
      descs.push(animalVPInHand[0].split(' ')[0] + ' +' + animalPlacers[cardName] + 'a');
    }
    // This card IS an animal VP card → count animal placers in hand
    if (TM_ANIMAL_VP_CARDS.indexOf(cardName) >= 0) {
      var placersInHand = 0;
      for (var pn in animalPlacers) {
        if (handSet.has(pn)) placersInHand += animalPlacers[pn];
      }
      if (placersInHand > 0) {
        var apBonus = Math.min(placersInHand * (gensLeft >= 4 ? 4 : 7), 14) * 0.4;
        bonus += apBonus;
        descs.push('+' + placersInHand + ' animal placers');
      }
    }

    // Viral Enhancers: bio tags in hand → extra resources
    if (cardName === 'Viral Enhancers') {
      var bioTags = ['plant', 'animal', 'microbe'];
      var bioFeeders = myHand.filter(function(n) {
        var t = handTagCache[n] || [];
        for (var bi = 0; bi < bioTags.length; bi++) { if (t.indexOf(bioTags[bi]) >= 0) return true; }
        return false;
      }).length;
      if (bioFeeders > 0 && (animalVPInHand.length > 0 || microbeVPInHand.length > 0)) {
        bonus += Math.min(bioFeeders * 1.5, 8);
        descs.push(bioFeeders + ' bio feeders');
      }
    }
    if (handSet.has('Viral Enhancers') && cardName !== 'Viral Enhancers') {
      var hasBioTag = ['plant', 'animal', 'microbe'].some(function(t) { return cardTagsArr.indexOf(t) >= 0; });
      if (hasBioTag && (animalVPInHand.length > 0 || microbeVPInHand.length > 0)) {
        bonus += 1.5; descs.push('Viral +res');
      }
    }

    // Imported Nitrogen also places 3 microbes on microbe VP cards
    if (cardName === 'Imported Nitrogen' && microbeVPInHand.length > 0) {
      var mVP = gensLeft >= 4 ? 4 : 7;
      bonus += Math.min(3 * mVP * 0.4, 8);
      descs.push(microbeVPInHand[0].split(' ')[0] + ' +3m');
    }
    if (TM_MICROBE_VP_CARDS.indexOf(cardName) >= 0 && handSet.has('Imported Nitrogen')) {
      bonus += Math.min(3 * (gensLeft >= 4 ? 4 : 7) * 0.3, 6);
      descs.push('ImpNitro +3m');
    }

    // ── 3. SHUTTLES: -2 MC on space cards ──
    if (cardTagsArr.indexOf('space') >= 0 && handSet.has('Shuttles') && cardName !== 'Shuttles') {
      bonus += 2; descs.push('Shuttles -2');
    }
    if (cardName === 'Shuttles') {
      var spaceInHand = (handTagMap['space'] || []).filter(function(n) { return n !== 'Shuttles'; }).length;
      if (spaceInHand > 0) { bonus += Math.min(spaceInHand * 1.5, 8); descs.push(spaceInHand + ' space'); }
    }

    // ── 4. TAG DENSITY: per-tag production/VP cards + matching tags in hand ──
    var perTagCards = {
      'Medical Lab': { tag: 'building', per: 2, val: 1.5 },
      'Parliament Hall': { tag: 'building', per: 3, val: 1.5 },
      'Cartel': { tag: 'earth', per: 1, val: 1.5 },
      'Satellites': { tag: 'space', per: 1, val: 1.5 },
      'Insects': { tag: 'plant', per: 1, val: 1.5 },
      'Worms': { tag: 'microbe', per: 1, val: 1.5 },
      // Physics Complex removed — handled in energy chain (section 7)
    };
    if (perTagCards[cardName]) {
      var ptDef = perTagCards[cardName];
      var handTagCnt = (handTagMap[ptDef.tag] || []).filter(function(n) { return n !== cardName; }).length;
      if (handTagCnt > 0) {
        var extraVal = Math.min(Math.floor(handTagCnt / ptDef.per) * ptDef.val, 6);
        if (extraVal > 0) { bonus += extraVal; descs.push('+' + handTagCnt + ' ' + ptDef.tag); }
      }
    }
    // Reverse: card has tag that matches a per-tag card in hand
    for (var ptcName in perTagCards) {
      if (ptcName === cardName || !handSet.has(ptcName)) continue;
      var ptcDef = perTagCards[ptcName];
      if (cardTagsArr.indexOf(ptcDef.tag) >= 0) {
        bonus += ptcDef.val * 0.5;
        descs.push(ptcName.split(' ')[0] + ' +tag');
      }
    }

    // ── 5. SCIENCE CHAIN: Research, Olympus Conference, Invention Contest + science tags ──
    // Tag triggers fire PER TAG (Research has 2 science → triggers engines 2x)
    var scienceEngines = { 'Research': 2, 'Olympus Conference': 1.5, 'Invention Contest': 1, 'Mars University': 1 };
    var mySciCount = 0;
    for (var _scc = 0; _scc < cardTagsArr.length; _scc++) { if (cardTagsArr[_scc] === 'science') mySciCount++; }
    if (mySciCount > 0) {
      var sciChainB = 0;
      for (var seName in scienceEngines) {
        if (handSet.has(seName) && cardName !== seName) {
          sciChainB += scienceEngines[seName] * mySciCount;
          descs.push(seName.split(' ')[0] + ' +sci' + (mySciCount > 1 ? '×' + mySciCount : ''));
        }
      }
      bonus += Math.min(sciChainB, 6);
    }
    if (scienceEngines[cardName]) {
      var sciInHand = (handTagMap['science'] || []).filter(function(n) { return n !== cardName; }).length;
      if (sciInHand > 0) { bonus += Math.min(sciInHand * scienceEngines[cardName] * 0.5, 6); descs.push(sciInHand + ' sci in hand'); }
    }

    // ── 6. DISCOUNT CHAIN (data-driven from TM_CARD_DISCOUNTS) ──
    var _cdData = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
    var _cdSkip = { 'Earth Office': 1, 'Shuttles': 1, 'Media Archives': 1, 'Science Fund': 1 }; // handled elsewhere
    // This card benefits from discount engines in hand (stack all applicable)
    var discountDescs = [];
    for (var deName in _cdData) {
      if (deName === cardName || !handSet.has(deName) || _cdSkip[deName]) continue;
      var deEntry = _cdData[deName];
      for (var deTag in deEntry) {
        var deVal = deEntry[deTag];
        if (deVal <= 0) continue;
        if (deTag === '_all' || deTag === '_req' || cardTagsArr.indexOf(deTag) >= 0) {
          bonus += deVal; discountDescs.push(deName.split(' ')[0] + ' -' + deVal);
          break; // one match per discount card
        }
      }
    }
    if (discountDescs.length > 0) descs.push(discountDescs.slice(0, 2).join(', '));
    // Reverse: this card IS a discount engine → count matching cards in hand
    if (_cdData[cardName] && !_cdSkip[cardName]) {
      var de2Entry = _cdData[cardName];
      var de2Tag = Object.keys(de2Entry)[0];
      var de2Val = de2Entry[de2Tag] || 0;
      if (de2Val > 0) {
        var de2Count = myHand.filter(function(n) {
          if (n === cardName) return false;
          if (de2Tag === '_all' || de2Tag === '_req') return true;
          return (handTagCache[n] || []).indexOf(de2Tag) >= 0;
        }).length;
        if (de2Count > 0) { bonus += de2Count * de2Val * 0.3; descs.push(de2Count + ' to discount'); }
      }
    }
    // Advanced Alloys: +1 steel & +1 titanium value → building & space cards
    if (handSet.has('Advanced Alloys') && cardName !== 'Advanced Alloys') {
      if (cardTagsArr.indexOf('building') >= 0) { bonus += 1.5; descs.push('AdvAlloys +steel'); }
      else if (cardTagsArr.indexOf('space') >= 0) { bonus += 1.5; descs.push('AdvAlloys +ti'); }
    }
    if (cardName === 'Advanced Alloys') {
      var aaBld = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      var aaSpc = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (aaBld + aaSpc > 0) {
        bonus += (aaBld + aaSpc) * 0.5;
        descs.push((aaBld + aaSpc) + ' bld/spc +value');
      }
    }

    // ── 6b. TAG TRIGGER ENGINES (data-driven from TM_TAG_TRIGGERS) ──
    // Skip: corps (on tableau from gen 1), cards already handled explicitly above
    var _ttSkip = {
      'Optimal Aerobraking': 1, 'Earth Office': 1, 'Media Group': 1, 'Viral Enhancers': 1,   // section 1
      'Olympus Conference': 1, 'Mars University': 1,                                           // section 5 (science chain)
      'Space Station': 1, 'Quantum Extractor': 1, 'Mass Converter': 1, 'Warp Drive': 1,       // section 6
      'Anti-Gravity Technology': 1, 'Earth Catapult': 1, 'Research Outpost': 1,                 // section 6
      'Dirigibles': 1, 'Venus Waystation': 1, 'Shuttles': 1, 'Advanced Alloys': 1,              // section 6
      'Titan Floating Launch-pad': 1,                                                            // section 9 (floater)
    };
    var _ttCorps = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
    var _ttData = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
    // This card triggers engines in hand — count per TAG (double tags = 2x trigger)
    var triggerDescs = [];
    for (var ttName in _ttData) {
      if (ttName === cardName || !handSet.has(ttName) || _ttSkip[ttName] || _ttCorps[ttName]) continue;
      var ttEntries = _ttData[ttName];
      for (var tti = 0; tti < ttEntries.length; tti++) {
        var tte = ttEntries[tti];
        if (tte.eventOnly && !isEvent) continue;
        // Count how many of card's tags match this trigger (Research science×2 = 2 triggers)
        var ttTagHits = 0;
        for (var _tth = 0; _tth < cardTagsArr.length; _tth++) {
          if (tte.tags.indexOf(cardTagsArr[_tth]) >= 0) ttTagHits++;
        }
        if (ttTagHits > 0) {
          bonus += tte.value * 0.5 * ttTagHits;
          triggerDescs.push(ttName.split(' ')[0] + (ttTagHits > 1 ? '×' + ttTagHits : ''));
          break; // one match per trigger card
        }
      }
    }
    if (triggerDescs.length > 0) descs.push(triggerDescs.slice(0, 3).join('+') + ' trigger');
    // Reverse: this card IS a tag trigger → count matching tags in hand (including double tags)
    if (_ttData[cardName] && !_ttSkip[cardName] && !_ttCorps[cardName]) {
      var ttMyEntries = _ttData[cardName];
      var ttMatchCount = 0;
      var ttBestVal = 0;
      for (var ttmi = 0; ttmi < myHand.length; ttmi++) {
        if (myHand[ttmi] === cardName) continue;
        var ttmTags = handTagCache[myHand[ttmi]] || [];
        var ttmIsEvt = ttmTags.indexOf('event') >= 0;
        for (var ttei = 0; ttei < ttMyEntries.length; ttei++) {
          var ttme = ttMyEntries[ttei];
          if (ttme.eventOnly && !ttmIsEvt) continue;
          // Count per tag (double tags = 2 triggers)
          var ttmHits = 0;
          for (var _ttmh = 0; _ttmh < ttmTags.length; _ttmh++) {
            if (ttme.tags.indexOf(ttmTags[_ttmh]) >= 0) ttmHits++;
          }
          if (ttmHits > 0) {
            ttMatchCount += ttmHits; if (ttme.value > ttBestVal) ttBestVal = ttme.value;
            break;
          }
        }
      }
      if (ttMatchCount > 0) { bonus += Math.min(ttMatchCount * ttBestVal * 0.3, 6); descs.push(ttMatchCount + ' tag triggers'); }
    }

    // ── 7. ENERGY CHAIN: energy producers + energy consumers ──
    var energyProducers = TM_ENERGY_PRODUCERS;
    var energyConsumers = TM_ENERGY_CONSUMERS;
    if (energyProducers.indexOf(cardName) >= 0) {
      var consumers = myHand.filter(function(n) { return energyConsumers.indexOf(n) >= 0; }).length;
      if (consumers > 0) { bonus += Math.min(consumers * 2, 6); descs.push(consumers + ' energy consumer' + (consumers > 1 ? 's' : '')); }
    }
    if (energyConsumers.indexOf(cardName) >= 0) {
      var producers = myHand.filter(function(n) { return energyProducers.indexOf(n) >= 0; }).length;
      if (producers > 0) { bonus += Math.min(producers * 2, 6); descs.push(producers + ' energy prod'); }
    }

    // ── 8. JOVIAN VP CHAIN: jovian VP multipliers + jovian tags in hand ──
    var jovianVPCards = TM_JOVIAN_VP_CARDS;
    var isJovian = cardTagsArr.indexOf('jovian') >= 0;
    if (isJovian) {
      var jvpInHand = myHand.filter(function(n) { return n !== cardName && jovianVPCards.indexOf(n) >= 0; }).length;
      if (jvpInHand > 0) {
        // Each jovian tag → +1 VP on each jovian VP card
        var jBonus = Math.min(jvpInHand * (gensLeft >= 4 ? 4 : 6), 8);
        bonus += jBonus; descs.push(jvpInHand + ' jovian VP card' + (jvpInHand > 1 ? 's' : ''));
      }
    }
    if (jovianVPCards.indexOf(cardName) >= 0) {
      var jovianInHand = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
      if (jovianInHand > 0) {
        bonus += Math.min(jovianInHand * (gensLeft >= 4 ? 3 : 5), 8);
        descs.push(jovianInHand + ' jovian in hand');
      }
    }

    // ── 9. FLOATER ENGINE: floater generators + floater consumers ──
    var floaterGenerators = TM_FLOATER_GENERATORS;
    var floaterConsumers = TM_FLOATER_CONSUMERS;
    if (floaterGenerators.indexOf(cardName) >= 0) {
      var fConsumers = myHand.filter(function(n) { return n !== cardName && floaterConsumers.indexOf(n) >= 0; }).length;
      if (fConsumers > 0) { bonus += fConsumers * 2; descs.push(fConsumers + ' floater target' + (fConsumers > 1 ? 's' : '')); }
    }
    if (floaterConsumers.indexOf(cardName) >= 0) {
      var fGens = myHand.filter(function(n) { return n !== cardName && floaterGenerators.indexOf(n) >= 0; }).length;
      if (fGens > 0) { bonus += fGens * 2; descs.push(fGens + ' floater source' + (fGens > 1 ? 's' : '')); }
    }
    // Titan Floating Launch-pad: jovian tags in hand = more floaters
    if (cardName === 'Titan Floating Launch-pad') {
      var jovianCards = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
      if (jovianCards > 0) { bonus += jovianCards * 1.5; descs.push(jovianCards + ' jovian→floater'); }
    }
    if (handSet.has('Titan Floating Launch-pad') && cardName !== 'Titan Floating Launch-pad' && isJovian) {
      bonus += 1.5; descs.push('TitanLpad +floater');
    }

    // ── 10. COLONY DENSITY: colony build cards + trade/colony benefit cards ──
    var colonyBuilders = TM_COLONY_BUILDERS;
    var colonyBenefits = TM_COLONY_BENEFITS;
    if (colonyBuilders.indexOf(cardName) >= 0) {
      var colBenefits = myHand.filter(function(n) { return n !== cardName && colonyBenefits.indexOf(n) >= 0; }).length;
      var otherBuilders = myHand.filter(function(n) { return n !== cardName && colonyBuilders.indexOf(n) >= 0; }).length;
      if (colBenefits > 0) { bonus += colBenefits * 1.5; descs.push(colBenefits + ' colony benefit'); }
      if (otherBuilders >= 2) { bonus += 2; descs.push('colony chain'); }
    }

    // ── 11. Protected Habitats: mainly protects plants from removal (Ants, Birds, -plant attacks) ──
    if (cardName === 'Protected Habitats') {
      // Plant production/plant cards in hand → plants are the main target of removal
      var plantCardsInHand = (handTagMap['plant'] || []).filter(function(n) { return n !== cardName; }).length;
      var plantProdCards = ['Nitrophilic Moss', 'Arctic Algae', 'Bushes', 'Trees', 'Grass',
        'Kelp Farming', 'Farming', 'Greenhouses', 'Greenhouse'];
      var plantProducers = myHand.filter(function(n) { return plantProdCards.indexOf(n) >= 0; }).length;
      var protBonus = plantCardsInHand * 1 + plantProducers * 2 + animalVPInHand.length * 1;
      if (protBonus > 0) { bonus += protBonus; descs.push('protect plants' + (animalVPInHand.length > 0 ? '+animals' : '')); }
    }

    // ── 12. STEEL/TI PRODUCTION SYNERGY: steel prod + building cards, ti prod + space cards ──
    // Steel prod card + building cards in hand = steel won't waste
    if (cardEff.sp && cardEff.sp > 0) {
      var bldInHand = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldInHand > 0) {
        bonus += Math.min(cardEff.sp * bldInHand * 0.8, 5);
        descs.push(bldInHand + ' bld for steel');
      }
    }
    // Building card + steel prod cards in hand = cheaper to play
    if (cardTagsArr.indexOf('building') >= 0) {
      var steelProdTotal = 0;
      for (var spi = 0; spi < myHand.length; spi++) {
        if (myHand[spi] === cardName) continue;
        var spEff = _effData[myHand[spi]];
        if (spEff && spEff.sp > 0) steelProdTotal += spEff.sp;
      }
      if (steelProdTotal > 0) {
        bonus += Math.min(steelProdTotal * 0.7, 4);
        descs.push('steel prod ' + steelProdTotal);
      }
    }
    // Titanium prod card + space cards in hand
    if (cardEff.tp && cardEff.tp > 0) {
      var spcInHand = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcInHand > 0) {
        bonus += Math.min(cardEff.tp * spcInHand * 1.0, 6);
        descs.push(spcInHand + ' spc for ti');
      }
    }
    // Space card + titanium prod cards in hand
    if (cardTagsArr.indexOf('space') >= 0) {
      var tiProdTotal = 0;
      for (var tpi = 0; tpi < myHand.length; tpi++) {
        if (myHand[tpi] === cardName) continue;
        var tpEff = _effData[myHand[tpi]];
        if (tpEff && tpEff.tp > 0) tiProdTotal += tpEff.tp;
      }
      if (tiProdTotal > 0) {
        bonus += Math.min(tiProdTotal * 0.9, 5);
        descs.push('ti prod ' + tiProdTotal);
      }
    }

    // ── 13-14, 16, 19-20, 29. PRODUCTION/PARAM STACKING (from TM_STACKING_RULES) ──
    var _hrMap = { plant: plantHR, temp: tempHR, venus: vnHR, ocean: ocHR };
    for (var _sti = 0; _sti < TM_STACKING_RULES.length; _sti++) {
      var sr = TM_STACKING_RULES[_sti];
      var srHR = sr.hrKey ? (_hrMap[sr.hrKey] || 1.0) : 1.0;
      if (cardEff[sr.field] && cardEff[sr.field] > 0) {
        var srOther = 0;
        for (var _stj = 0; _stj < myHand.length; _stj++) {
          if (myHand[_stj] === cardName) continue;
          var srEff = _effData[myHand[_stj]];
          if (srEff && srEff[sr.field] > 0) srOther += srEff[sr.field];
        }
        var srMin = sr.minOther || 0;
        if (srOther > srMin) {
          bonus += Math.min(srOther * sr.coeff * srHR, sr.cap);
          descs.push(sr.desc + ' +' + srOther + (sr.suffix || '') + (srHR < 1 ? ' ' + sr.hrLabel : ''));
        }
      }
    }

    // ── 15. MICROBE ENGINE: microbe VP targets + microbe generators + Decomposers ──
    var MICROBE_VP_ALL = { 'Decomposers': 3, 'Ants': 2, 'Tardigrades': 4, 'Extremophiles': 3, 'Extreme-Cold Fungus': 0 };
    var MICROBE_GENERATORS = { 'Symbiotic Fungus': 1, 'Extreme-Cold Fungus': 2, 'Bactoviral Research': 1 };
    // Decomposers + bio tags in hand: each plant/animal/microbe tag → +1 microbe
    if (cardName === 'Decomposers' || cardName === 'Urban Decomposers') {
      var bioTagCount = 0;
      for (var dci = 0; dci < myHand.length; dci++) {
        if (myHand[dci] === cardName) continue;
        var dcTags = handTagCache[myHand[dci]] || [];
        if (['plant', 'animal', 'microbe'].some(function(t) { return dcTags.indexOf(t) >= 0; })) bioTagCount++;
      }
      if (bioTagCount > 0) {
        var dcVal = cardName === 'Decomposers' ? bioTagCount * 1.5 : bioTagCount * 0.8;
        bonus += Math.min(dcVal, 8); descs.push(bioTagCount + ' bio→microbe');
      }
    }
    // Reverse: bio-tagged card + Decomposers in hand = extra microbe
    if (handSet.has('Decomposers') && cardName !== 'Decomposers') {
      if (['plant', 'animal', 'microbe'].some(function(t) { return cardTagsArr.indexOf(t) >= 0; })) {
        bonus += 1; descs.push('Decomp +1m');
      }
    }
    // Microbe generators + microbe VP targets in hand
    if (MICROBE_GENERATORS[cardName]) {
      var mTargets = myHand.filter(function(n) { return n !== cardName && MICROBE_VP_ALL[n] && MICROBE_VP_ALL[n] > 0; });
      if (mTargets.length > 0) {
        bonus += mTargets.length * MICROBE_GENERATORS[cardName] * 1.5;
        descs.push(mTargets.length + ' microbe VP target');
      }
    }
    // Reverse: microbe VP card + generators in hand
    if (MICROBE_VP_ALL[cardName] && MICROBE_VP_ALL[cardName] > 0) {
      var mGens = 0;
      for (var mgi = 0; mgi < myHand.length; mgi++) {
        if (myHand[mgi] === cardName) continue;
        if (MICROBE_GENERATORS[myHand[mgi]]) mGens += MICROBE_GENERATORS[myHand[mgi]];
      }
      if (mGens > 0) {
        bonus += mGens * 1.5; descs.push('+' + mGens + ' microbe/gen');
      }
    }

    // (16. venus stacking → moved to STACKING_RULES above)

    // ── 17. CITY CHAIN: multiple city cards → Mayor milestone + synergy cards ──
    var isCityCard = cardTagsArr.indexOf('city') >= 0;
    if (isCityCard) {
      var otherCities = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (otherCities >= 1) {
        // 2+ city cards = Mayor milestone potential (+5 VP)
        var cityBonus = otherCities >= 2 ? 3 : 1.5;
        bonus += cityBonus; descs.push(otherCities + ' cities→Mayor');
      }
      // Rover Construction in hand: +2 MC per city placed
      if (handSet.has('Rover Construction') && cardName !== 'Rover Construction') {
        bonus += 2; descs.push('Rover +2');
      }
    }
    // Rover Construction + city cards in hand
    if (cardName === 'Rover Construction') {
      var cityCount = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (cityCount > 0) {
        bonus += cityCount * 1.5; descs.push(cityCount + ' cities');
      }
    }

    // ── 18. EVENT MASS: many events → Legend milestone + compound with Media/OptAero ──
    if (isEvent) {
      var otherEvents = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
      // 3+ events in hand → Legend milestone becomes reachable (needs 5 total played)
      // Only if Legend milestone exists in this game
      if (otherEvents >= 2 && ctx.milestones && ctx.milestones.has('Legend')) {
        bonus += 1.5; descs.push('Legend potential');
      }
      // Compound: Media Group + Opt Aero both in hand → events get double value
      var hasMedia = handSet.has('Media Group');
      var hasOptAero = handSet.has('Optimal Aerobraking');
      if (hasMedia && hasOptAero && isSpaceEvent && cardName !== 'Media Group' && cardName !== 'Optimal Aerobraking') {
        bonus += 1; descs.push('Media+OptA combo');
      }
    }

    // (19-20. temp/ocean stacking → moved to STACKING_RULES above)

    // ── 21. TR RUSH: 3+ TR-raising cards → cohesive rush strategy ──
    var cardTR = (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.oc || 0) + (cardEff.vn ? Math.ceil(cardEff.vn / 2) : 0);
    if (cardTR > 0) {
      var handTR = 0;
      for (var tri = 0; tri < myHand.length; tri++) {
        if (myHand[tri] === cardName) continue;
        var trEff = _effData[myHand[tri]];
        if (!trEff) continue;
        handTR += (trEff.tr || 0) + (trEff.tmp || 0) + (trEff.oc || 0) + (trEff.vn ? Math.ceil(trEff.vn / 2) : 0);
      }
      if (handTR >= 4) {
        bonus += Math.min(handTR * 0.3, 3);
        descs.push('TR rush ' + handTR);
      }
    }

    // ── 22. ROBOTIC WORKFORCE: copies building production → synergy with high-prod buildings ──
    if (cardName === 'Robotic Workforce') {
      var bestProd = 0, bestProdName = '';
      for (var rwi = 0; rwi < myHand.length; rwi++) {
        if (myHand[rwi] === cardName) continue;
        var rwTags = handTagCache[myHand[rwi]] || [];
        if (rwTags.indexOf('building') < 0) continue;
        var rwE = _effData[myHand[rwi]] || {};
        var rwVal = (rwE.mp||0)*1 + (rwE.sp||0)*1.6 + (rwE.tp||0)*2.5 + (rwE.pp||0)*1.6 + (rwE.ep||0)*1.5 + (rwE.hp||0)*0.8;
        if (rwVal > bestProd) { bestProd = rwVal; bestProdName = myHand[rwi]; }
      }
      if (bestProd >= 3) {
        bonus += Math.min(bestProd * 0.8, 6);
        descs.push('copy ' + bestProdName.split(' ')[0]);
      }
    }
    // Reverse: building prod card + Robotic Workforce in hand
    if (handSet.has('Robotic Workforce') && cardName !== 'Robotic Workforce' && cardTagsArr.indexOf('building') >= 0) {
      var rwMyE = cardEff;
      var rwMyVal = (rwMyE.mp||0)*1 + (rwMyE.sp||0)*1.6 + (rwMyE.tp||0)*2.5 + (rwMyE.pp||0)*1.6 + (rwMyE.ep||0)*1.5 + (rwMyE.hp||0)*0.8;
      if (rwMyVal >= 3) {
        bonus += Math.min(rwMyVal * 0.4, 3);
        descs.push('RoboWork copy');
      }
    }

    // ── 23. REGO PLASTICS / ADVANCED ALLOYS: steel/ti value boost + resource cards ──
    // Rego Plastics (+1 steel value) + building cards
    if (cardName === 'Rego Plastics') {
      var bldCount = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldCount > 0) { bonus += Math.min(bldCount * 1, 4); descs.push(bldCount + ' bld +steel'); }
    }
    if (handSet.has('Rego Plastics') && cardName !== 'Rego Plastics' && cardTagsArr.indexOf('building') >= 0) {
      bonus += 1; descs.push('Rego +1 steel');
    }

    // ── 24-28, 30-31. NAMED CARD COMBOS (from TM_NAMED_EFF_COMBOS / TM_NAMED_TAG_COMBOS) ──
    for (var _nci = 0; _nci < TM_NAMED_EFF_COMBOS.length; _nci++) {
      var nc = TM_NAMED_EFF_COMBOS[_nci];
      if (cardName === nc.n) {
        var ncTotal = 0;
        for (var _ncj = 0; _ncj < myHand.length; _ncj++) {
          if (myHand[_ncj] === cardName) continue;
          var ncEff = _effData[myHand[_ncj]];
          if (ncEff && ncEff[nc.f] > 0) ncTotal += ncEff[nc.f];
        }
        if (ncTotal > (nc.fM || 0)) {
          bonus += Math.min(ncTotal * nc.fc, nc.fC);
          descs.push(ncTotal + ' ' + nc.fd);
        }
      }
      if (handSet.has(nc.n) && cardName !== nc.n && cardEff[nc.f] && cardEff[nc.f] > 0) {
        if (nc.rf > 0) {
          bonus += nc.rf; descs.push(nc.rd);
        } else if (nc.rc > 0) {
          bonus += Math.min(cardEff[nc.f] * nc.rc, nc.rC);
          descs.push(nc.rd + (nc.rm ? ' +' + (cardEff[nc.f] * nc.rm) + 'pl' : ''));
        }
      }
    }
    for (var _ntci = 0; _ntci < TM_NAMED_TAG_COMBOS.length; _ntci++) {
      var ntc = TM_NAMED_TAG_COMBOS[_ntci];
      if (cardName === ntc.n) {
        var ntcCount = 0;
        for (var _ntcj = 0; _ntcj < myHand.length; _ntcj++) {
          if (myHand[_ntcj] === cardName) continue;
          var ntcTags = handTagCache[myHand[_ntcj]] || [];
          for (var _ntct = 0; _ntct < ntc.tags.length; _ntct++) {
            if (ntcTags.indexOf(ntc.tags[_ntct]) >= 0) { ntcCount++; break; }
          }
        }
        if (ntcCount > 0) {
          bonus += Math.min(ntcCount * ntc.fc, ntc.fC);
          descs.push(ntcCount + ' ' + ntc.fd);
        }
      }
      if (handSet.has(ntc.n) && cardName !== ntc.n) {
        var ntcMatch = false;
        for (var _ntct2 = 0; _ntct2 < ntc.tags.length; _ntct2++) {
          if (cardTagsArr.indexOf(ntc.tags[_ntct2]) >= 0) { ntcMatch = true; break; }
        }
        if (ntcMatch) {
          bonus += ntc.rb; descs.push(ntc.rd);
        }
      }
    }

    // ── 32. ACTION CARD DIMINISHING RETURNS: 4+ action cards → not enough actions/gen ──
    var isAction = !!(cardEff.actTR || cardEff.actMC || cardEff.vpAcc);
    if (isAction) {
      var actionsInHand = 0;
      for (var aci = 0; aci < myHand.length; aci++) {
        if (myHand[aci] === cardName) continue;
        var acEff = _effData[myHand[aci]];
        if (acEff && (acEff.actTR || acEff.actMC || acEff.vpAcc)) actionsInHand++;
      }
      // 4+ action cards = too many for limited actions per gen
      if (actionsInHand >= 3) {
        var actPenalty = (actionsInHand - 2) * -0.8;
        bonus += Math.max(actPenalty, -3);
        descs.push(actionsInHand + ' actions compete');
      }
    }

    // ── 33. EXISTING PRODUCTION AMPLIFIER: new prod card joins running engine ──
    var _existProd = ctx && ctx.prod ? ctx.prod : {};
    // Steel prod card + existing steel prod + building cards in hand
    if (cardEff.sp && cardEff.sp > 0 && (_existProd.steel || 0) >= 1) {
      var bldForExist = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldForExist > 0) {
        bonus += Math.min((_existProd.steel || 0) * 0.3, 1.5);
        descs.push('steel engine ×' + _existProd.steel);
      }
    }
    // Ti prod card + existing ti prod + space cards in hand
    if (cardEff.tp && cardEff.tp > 0 && (_existProd.ti || 0) >= 1) {
      var spcForExist = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcForExist > 0) {
        bonus += Math.min((_existProd.ti || 0) * 0.4, 2);
        descs.push('ti engine ×' + _existProd.ti);
      }
    }
    // Plant prod card + existing plant prod ≥2 → greenery threshold closer
    if (cardEff.pp && cardEff.pp > 0 && (_existProd.plants || 0) >= 2) {
      bonus += Math.min((_existProd.plants || 0) * 0.2 * plantHR, 1.5);
      descs.push('plant engine ×' + _existProd.plants);
    }
    // Heat prod card + existing heat prod ≥3 → temp raise threshold closer
    if (cardEff.hp && cardEff.hp > 0 && (_existProd.heat || 0) >= 3) {
      bonus += Math.min((_existProd.heat || 0) * 0.15 * tempHR, 1.5);
      descs.push('heat engine ×' + _existProd.heat);
    }

    // ── 34. ENERGY CONSUMER + EXISTING ENERGY PROD (no producer in hand needed) ──
    if (TM_ENERGY_CONSUMERS.indexOf(cardName) >= 0 && (_existProd.energy || 0) >= 1) {
      // Check if there's already an energy producer in hand (section 7 handles that case)
      var hasEProdInHand = false;
      for (var epi = 0; epi < myHand.length; epi++) {
        if (TM_ENERGY_PRODUCERS.indexOf(myHand[epi]) >= 0) { hasEProdInHand = true; break; }
      }
      if (!hasEProdInHand) {
        bonus += Math.min((_existProd.energy || 0) * 1, 3);
        descs.push('existing ep ' + _existProd.energy);
      }
    }

    // ── 35. CORP-SPECIFIC HAND SYNERGY: cards compound when corp ability multiplies them ──
    var _myCorpsHand = ctx && ctx._myCorps ? ctx._myCorps : [];
    if (_myCorpsHand.length > 0) {
      var corpSet = new Set(_myCorpsHand);
      var corpSynB = 0;

      // Point Luna: each earth tag draws a card → multiple earth cards in hand = compound draw engine
      if (corpSet.has('Point Luna')) {
        var earthInHand = (handTagMap['earth'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('earth') >= 0 && earthInHand >= 1) {
          // Drawn cards may chain into more earth — compound value
          corpSynB += Math.min(earthInHand * 0.8, 3);
          descs.push('PtLuna earth×' + (earthInHand + 1));
        }
      }

      // Interplanetary Cinematics: +2 MC per event → mass events = large MC burst
      if (corpSet.has('Interplanetary Cinematics')) {
        var eventsInHand = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
        if (isEvent && eventsInHand >= 2) {
          corpSynB += Math.min(eventsInHand * 0.5, 2.5);
          descs.push('IC events×' + (eventsInHand + 1));
        }
      }

      // Splice: +2 MC per microbe tag → mass microbe = MC engine
      if (corpSet.has('Splice')) {
        var micInHand = (handTagMap['microbe'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('microbe') >= 0 && micInHand >= 1) {
          corpSynB += Math.min(micInHand * 0.5, 2);
          descs.push('Splice mic×' + (micInHand + 1));
        }
      }

      // Arklight: +1 MC prod per animal/plant tag → bio mass = compound prod
      if (corpSet.has('Arklight')) {
        var bioInHand = ((handTagMap['animal'] || []).concat(handTagMap['plant'] || [])).filter(function(n) { return n !== cardName; }).length;
        var myBio = 0;
        for (var _abk = 0; _abk < cardTagsArr.length; _abk++) {
          if (cardTagsArr[_abk] === 'animal' || cardTagsArr[_abk] === 'plant') myBio++;
        }
        if (myBio > 0 && bioInHand >= 1) {
          corpSynB += Math.min(bioInHand * 0.6, 3);
          descs.push('Arklight bio×' + (bioInHand + myBio));
        }
      }

      // Tharsis Republic: +1 MC prod per city → multiple cities = compound prod
      if (corpSet.has('Tharsis Republic')) {
        var citiesInHand = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('city') >= 0 && citiesInHand >= 1) {
          corpSynB += Math.min(citiesInHand * 0.7, 2.5);
          descs.push('Tharsis city×' + (citiesInHand + 1));
        }
      }

      // Saturn Systems: +1 MC prod per jovian → multiple jovians = compound prod
      if (corpSet.has('Saturn Systems')) {
        var jovInHand = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('jovian') >= 0 && jovInHand >= 1) {
          corpSynB += Math.min(jovInHand * 0.7, 3);
          descs.push('Saturn jov×' + (jovInHand + 1));
        }
      }

      // CrediCor: -4 MC refund on cards costing 20+ → multiple expensive cards = tempo burst
      if (corpSet.has('CrediCor')) {
        var myCost = cardEff.c || 0;
        if (myCost >= 20) {
          var expensiveInHand = 0;
          for (var _cri = 0; _cri < myHand.length; _cri++) {
            if (myHand[_cri] === cardName) continue;
            var _crEff = _effData[myHand[_cri]];
            if (_crEff && (_crEff.c || 0) >= 20) expensiveInHand++;
          }
          if (expensiveInHand >= 1) {
            corpSynB += Math.min(expensiveInHand * 0.6, 2.5);
            descs.push('CrediCor 20+×' + (expensiveInHand + 1));
          }
        }
      }

      // Helion: heat = MC → heat prod cards compound value (convert excess heat freely)
      if (corpSet.has('Helion')) {
        var heatPInHand = 0;
        for (var _hli = 0; _hli < myHand.length; _hli++) {
          if (myHand[_hli] === cardName) continue;
          var _hlEff = _effData[myHand[_hli]];
          if (_hlEff && _hlEff.hp > 0) heatPInHand += _hlEff.hp;
        }
        if (cardEff.hp && cardEff.hp > 0 && heatPInHand >= 2) {
          corpSynB += Math.min(heatPInHand * 0.4, 2);
          descs.push('Helion heat→MC ×' + heatPInHand);
        }
      }

      // Mining Guild: +1 steel prod per steel/ti placement → building cards compound
      if (corpSet.has('Mining Guild')) {
        var bldInHand = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('building') >= 0 && bldInHand >= 2) {
          corpSynB += Math.min((bldInHand - 1) * 0.5, 2);
          descs.push('MiningG bld×' + (bldInHand + 1));
        }
      }

      // Thorgate: -3 MC per power tag → multiple power cards = discount burst
      if (corpSet.has('Thorgate')) {
        var pwrInHand = (handTagMap['power'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('power') >= 0 && pwrInHand >= 1) {
          corpSynB += Math.min(pwrInHand * 0.6, 2);
          descs.push('Thorgate pwr×' + (pwrInHand + 1));
        }
      }

      bonus += Math.min(corpSynB, 4);
    }

    // ── 36. MILESTONE DELTA: multiple cards pushing toward same milestone = compound value ──
    var _msNeeds = ctx && ctx.milestoneNeeds ? ctx.milestoneNeeds : {};
    var _msSpecial = ctx && ctx.milestoneSpecial ? ctx.milestoneSpecial : {};
    var msBonusTotal = 0;
    // Tag-based milestones (Builder, Scientist, Mayor, etc.)
    // Events don't persist in tableau — skip tag milestone bonus for event cards entirely
    if (!isEvent) for (var _mst = 0; _mst < cardTagsArr.length; _mst++) {
      var msTag = cardTagsArr[_mst];
      if (msTag === 'event') continue; // event tag doesn't count for milestones
      if (_msNeeds[msTag] !== undefined) {
        var msNeed = _msNeeds[msTag]; // tags still needed for milestone
        // Count how many OTHER cards in hand also contribute this tag
        var msOthers = (handTagMap[msTag] || []).filter(function(n) { return n !== cardName; });
        // Filter out events (they don't contribute to tag milestones)
        var msContributors = 0;
        for (var _msc = 0; _msc < msOthers.length; _msc++) {
          var msOTags = handTagCache[msOthers[_msc]] || [];
          if (msOTags.indexOf('event') < 0) msContributors++;
        }
        if (msContributors >= 1 && msNeed <= 3) {
          // The closer to milestone AND the more contributors, the bigger the compound
          // need=1 → almost there, need 2-3 = buying last pieces
          var msVal = msContributors >= msNeed ? 2.5 : msContributors * (1.0 / msNeed);
          msBonusTotal += msVal;
          descs.push('milestone −' + msNeed + ' w/' + msContributors + ' help');
        }
      }
    }
    // Special milestones: cities (Mayor), events (Legend), MC prod (Banker)
    if (_msSpecial.cities) {
      var cityNeed = _msSpecial.cities.need;
      if (cardTagsArr.indexOf('city') >= 0 && cityNeed <= 2) {
        var otherCitiesMs = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
        if (otherCitiesMs >= 1 && otherCitiesMs >= cityNeed) {
          msBonusTotal += 2;
          descs.push(_msSpecial.cities.name + ' −' + cityNeed);
        }
      }
    }
    if (_msSpecial.events) {
      var evNeed = _msSpecial.events.need;
      if (isEvent && evNeed <= 3) {
        var otherEventsMs = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
        if (otherEventsMs >= 1 && otherEventsMs >= evNeed) {
          msBonusTotal += 1.5;
          descs.push(_msSpecial.events.name + ' −' + evNeed);
        }
      }
    }
    bonus += Math.min(msBonusTotal, 4);

    // ── 37. AWARD RACING SYNERGY: hand cards that push a funded award I'm leading/contesting ──
    var _awRacing = ctx && ctx.awardRacing ? ctx.awardRacing : {};
    var _awTags = ctx && ctx.awardTags ? ctx.awardTags : {};
    var awBonusTotal = 0;
    for (var awName in _awRacing) {
      var aw = _awRacing[awName];
      if (!aw || aw.delta < -3) continue; // too far behind, not worth chasing
      // Identify which tags contribute to this award
      var awContribTags = [];
      for (var _awt in _awTags) {
        // Simple heuristic: if this tag is tracked as an award tag, it's relevant
        awContribTags.push(_awt);
      }
      // Count my card's contribution to relevant award tags
      for (var _awc = 0; _awc < cardTagsArr.length; _awc++) {
        if (isEvent && cardTagsArr[_awc] !== 'event') continue; // events don't persist for tag awards
        if (_awTags[cardTagsArr[_awc]]) {
          // Count other cards in hand with same tag
          var awOthers = (handTagMap[cardTagsArr[_awc]] || []).filter(function(n) { return n !== cardName; });
          var awNonEvent = 0;
          for (var _awe = 0; _awe < awOthers.length; _awe++) {
            var awOTags = handTagCache[awOthers[_awe]] || [];
            if (awOTags.indexOf('event') < 0) awNonEvent++;
          }
          if (awNonEvent >= 1) {
            // Leading = compound defense, behind = compound chase
            var awVal = aw.leading ? Math.min(awNonEvent * 0.6, 2) : Math.min(awNonEvent * 0.4, 1.5);
            awBonusTotal += awVal;
            descs.push(awName + (aw.leading ? ' lead' : ' chase') + ' w/' + awNonEvent);
            break; // one award contribution per card
          }
        }
      }
    }
    bonus += Math.min(awBonusTotal, 3);

    // ── 38. LATE-GAME VP BURST: hand full of VP/TR cards at gensLeft ≤ 2 = compound play ──
    if (gensLeft <= 2) {
      // vpAcc cards (Birds, Fish, etc.) ARE VP cards at endgame — they still accumulate 1-2 VP
      var myVP = (cardEff.vp || 0) + (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.vn || 0) + (cardEff.oc || 0) + (cardEff.vpAcc > 0 ? 1 : 0);
      if (myVP > 0) {
        var otherVPCards = 0;
        for (var _vbi = 0; _vbi < myHand.length; _vbi++) {
          if (myHand[_vbi] === cardName) continue;
          var _vbEff = _effData[myHand[_vbi]];
          if (_vbEff) {
            var otherVP = (_vbEff.vp || 0) + (_vbEff.tr || 0) + (_vbEff.tmp || 0) + (_vbEff.vn || 0) + (_vbEff.oc || 0) + (_vbEff.vpAcc > 0 ? 1 : 0);
            if (otherVP > 0) otherVPCards++;
          }
        }
        // 3+ VP/TR cards in hand at endgame = can dump them all for massive finish
        // Scale by THIS card's VP contribution (1 VP card gets less burst than 3 VP card)
        if (otherVPCards >= 2) {
          var vpScale = Math.min(myVP, 3) / 2; // 1VP=0.5x, 2VP=1.0x, 3VP=1.5x
          var burstVal = gensLeft <= 1 ? Math.min(otherVPCards * 0.8 * vpScale, 5) : Math.min(otherVPCards * 0.4 * vpScale, 2);
          bonus += burstVal;
          descs.push('VP burst ×' + (otherVPCards + 1) + (gensLeft <= 1 ? ' FINAL' : ''));
        }
      }
    }

    // ── 39. COLONY TRADE ENGINE: trade fleet cards + colony placement = compound income ──
    var colonyBuilders = ['Space Port', 'Space Port Colony', 'Titan Shuttles', 'Trade Envoys',
      'Rim Freighters', 'Mining Colony', 'Research Colony', 'Martian Zoo',
      'Community Services', 'Productive Outpost', 'Pioneer Settlement'];
    var tradeFleetCards = ['Trade Envoys', 'Rim Freighters', 'Titan Shuttles',
      'Galilean Waystation', 'Quantum Communications'];
    var isColBuilder = colonyBuilders.indexOf(cardName) >= 0;
    var isFleetCard = tradeFleetCards.indexOf(cardName) >= 0;
    if (isColBuilder || isFleetCard) {
      var colOthers = 0;
      var fleetOthers = 0;
      for (var _cli = 0; _cli < myHand.length; _cli++) {
        if (myHand[_cli] === cardName) continue;
        if (colonyBuilders.indexOf(myHand[_cli]) >= 0) colOthers++;
        if (tradeFleetCards.indexOf(myHand[_cli]) >= 0) fleetOthers++;
      }
      var colSynB = 0;
      // Colony builder + fleet card = trade more often with more colonies
      if (isColBuilder && fleetOthers >= 1) {
        colSynB += Math.min(fleetOthers * 1.0, 2);
        descs.push('fleet+colony ×' + fleetOthers);
      }
      // Fleet card + colony builders = more colonies to trade at
      if (isFleetCard && colOthers >= 1) {
        colSynB += Math.min(colOthers * 0.8, 2.5);
        descs.push('colony×' + colOthers + '+fleet');
      }
      // Multiple colony builders = colony density bonus (more trade targets)
      if (isColBuilder && colOthers >= 2) {
        colSynB += Math.min((colOthers - 1) * 0.5, 1.5);
        descs.push(colOthers + ' col stack');
      }
      bonus += Math.min(colSynB, 4);
    }

    // ── 40. TURMOIL PARTY SYNERGY: ruling/dominant party boosts certain tags in hand ──
    var _ruling = ctx && ctx.rulingParty ? ctx.rulingParty : '';
    var _dominant = ctx && ctx.dominantParty ? ctx.dominantParty : '';
    var partyTagMap = {
      'Mars First': ['mars'],
      'Scientists': ['science'],
      'Unity': ['venus', 'earth', 'jovian'],
      'Greens': ['plant', 'microbe', 'animal'],
      'Kelvinists': ['_heat'] // special: heat prod cards, not a tag
    };
    // Reds anti-synergy: TR raising cards penalized
    var partiesToCheck = [];
    if (_ruling && _ruling !== 'Reds') partiesToCheck.push({ name: _ruling, mult: 1.0 });
    if (_dominant && _dominant !== _ruling && _dominant !== 'Reds') partiesToCheck.push({ name: _dominant, mult: 0.5 });
    var turSynB = 0;
    for (var _tpi = 0; _tpi < partiesToCheck.length; _tpi++) {
      var partyInfo = partiesToCheck[_tpi];
      var partyTags = partyTagMap[partyInfo.name];
      if (!partyTags) continue;
      // Special: Kelvinists boost heat prod
      if (partyInfo.name === 'Kelvinists') {
        if (cardEff.hp && cardEff.hp > 0) {
          var hpOthers = 0;
          for (var _kli = 0; _kli < myHand.length; _kli++) {
            if (myHand[_kli] === cardName) continue;
            var _klEff = _effData[myHand[_kli]];
            if (_klEff && _klEff.hp > 0) hpOthers++;
          }
          if (hpOthers >= 1) {
            turSynB += Math.min(hpOthers * 0.5 * partyInfo.mult, 2);
            descs.push('Kelvin heat×' + (hpOthers + 1));
          }
        }
        continue;
      }
      // Tag-based parties
      var myPartyHits = 0;
      for (var _ptc = 0; _ptc < cardTagsArr.length; _ptc++) {
        if (partyTags.indexOf(cardTagsArr[_ptc]) >= 0) myPartyHits++;
      }
      if (myPartyHits > 0) {
        var partyOthers = 0;
        for (var _pto = 0; _pto < partyTags.length; _pto++) {
          var tagCards = (handTagMap[partyTags[_pto]] || []).filter(function(n) { return n !== cardName; });
          partyOthers += tagCards.length;
        }
        if (partyOthers >= 1) {
          turSynB += Math.min(partyOthers * 0.4 * partyInfo.mult * myPartyHits, 2.5);
          descs.push(partyInfo.name.split(' ')[0] + ' party ×' + (partyOthers + myPartyHits));
        }
      }
      // Policy-specific compound bonuses (beyond tag matching)
      // Greens policy: +4 MC per greenery/city placement → plant prod and city cards extra valuable
      if (partyInfo.name === 'Greens') {
        if (cardEff.pp && cardEff.pp > 0) {
          var ppOthersGrn = 0;
          for (var _gpi = 0; _gpi < myHand.length; _gpi++) {
            if (myHand[_gpi] === cardName) continue;
            var _gpEff = _effData[myHand[_gpi]];
            if (_gpEff && _gpEff.pp > 0) ppOthersGrn++;
          }
          if (ppOthersGrn >= 1) {
            turSynB += Math.min((ppOthersGrn + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('Greens pp×' + (ppOthersGrn + 1));
          }
        }
        if (cardTagsArr.indexOf('city') >= 0) {
          turSynB += 0.4 * partyInfo.mult;
          descs.push('Greens city');
        }
      }
      // Mars First policy: -2 MC per building tag card → building cards compound
      if (partyInfo.name === 'Mars First') {
        if (cardTagsArr.indexOf('building') >= 0) {
          var buildOthersMF = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
          if (buildOthersMF >= 1) {
            turSynB += Math.min((buildOthersMF + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('MarsFirst build×' + (buildOthersMF + 1));
          }
        }
      }
      // Scientists policy: draw 1 card per science tag played → ~3-4 MC per science card
      if (partyInfo.name === 'Scientists') {
        if (cardTagsArr.indexOf('science') >= 0) {
          var sciOthersSci = (handTagMap['science'] || []).filter(function(n) { return n !== cardName; }).length;
          if (sciOthersSci >= 1) {
            turSynB += Math.min((sciOthersSci + 1) * 0.4 * partyInfo.mult, 2);
            descs.push('Sci draw×' + (sciOthersSci + 1));
          }
        }
      }
      // Unity policy: +2 MC per space tag played → space cards cheaper
      if (partyInfo.name === 'Unity') {
        if (cardTagsArr.indexOf('space') >= 0) {
          var spcOthersUni = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
          if (spcOthersUni >= 1) {
            turSynB += Math.min((spcOthersUni + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('Unity space×' + (spcOthersUni + 1));
          }
        }
      }
    }
    // Reds penalty: TR-raising cards less valuable when Reds rule
    if (_ruling === 'Reds') {
      var trValue = (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.vn || 0) + (cardEff.oc || 0);
      if (trValue > 0) {
        var otherTR = 0;
        for (var _rdi = 0; _rdi < myHand.length; _rdi++) {
          if (myHand[_rdi] === cardName) continue;
          var _rdEff = _effData[myHand[_rdi]];
          if (_rdEff) otherTR += (_rdEff.tr || 0) + (_rdEff.tmp || 0) + (_rdEff.vn || 0) + (_rdEff.oc || 0);
        }
        if (otherTR > 0) {
          // Multiple TR cards under Reds = all more expensive (-3 MC each)
          turSynB -= Math.min(otherTR * 0.3, 2);
          descs.push('Reds tax TR×' + (otherTR + trValue));
        }
      }
    }
    bonus += Math.max(Math.min(turSynB, 3), -3);

    // ── 41. ANTI-SYNERGY: cards that conflict within the same hand ──
    // Plant prod + SELF plant-prod reduction in same hand = real conflict
    // Birds/Herbivores target opponent's plant prod, so NOT anti-synergy with own plant prod
    if (cardEff.pp && cardEff.pp > 0) {
      var selfPlantEaters = ['Food Factory', 'Biomass Combustors'];
      for (var _pai = 0; _pai < selfPlantEaters.length; _pai++) {
        if (handSet.has(selfPlantEaters[_pai]) && cardName !== selfPlantEaters[_pai]) {
          bonus -= 1;
          descs.push(selfPlantEaters[_pai].split(' ')[0] + ' eats own pp');
          break;
        }
      }
    }
    // Energy prod consumed by own consumer = less energy for other uses
    if (cardEff.ep && cardEff.ep > 0) {
      var energyHogs = ['Steelworks', 'Ironworks', 'Water Splitting Plant'];
      var hogsInHand = 0;
      for (var _ehi = 0; _ehi < energyHogs.length; _ehi++) {
        if (handSet.has(energyHogs[_ehi]) && cardName !== energyHogs[_ehi]) hogsInHand++;
      }
      // 2+ energy consumers competing for same energy = diminishing returns (section 7 handles pairing, this handles excess)
      if (hogsInHand >= 2) {
        bonus -= Math.min((hogsInHand - 1) * 0.5, 1.5);
        descs.push(hogsInHand + ' ep consumers fight');
      }
    }

    // 41b. Energy-consuming actions compete with colony trading
    if (ctx && ctx.coloniesOwned > 0 && ctx.fleetSize > 0) {
      var ENERGY_HOGS = { 'Ironworks': 4, 'Steelworks': 4, 'Water Splitting Plant': 3,
        'Ore Processor': 4, 'Physics Complex': 6, 'Venus Magnetizer': 4 };
      var hogCost = ENERGY_HOGS[cardName];
      if (hogCost) {
        // Trading uses 3 energy and gives ~8-12 MC value — usually better than converting
        var tradePenalty = Math.min(4, Math.round(ctx.coloniesOwned * 1.5));
        bonus -= tradePenalty;
        descs.push('Торговля лучше −' + tradePenalty);
      }
    }

    // ── 42. OPPONENT-AWARE HAND PENALTY: opp attacks devalue vulnerable cards in hand ──
    var _oppAnAtk = ctx && ctx.oppHasAnimalAttack;
    var _oppPlAtk = ctx && ctx.oppHasPlantAttack;
    // If opponent has Predators/Ants, animal VP accumulators in my hand are riskier
    if (_oppAnAtk && (cardEff.vpAcc || cardTagsArr.indexOf('animal') >= 0)) {
      var animalBuddies = (handTagMap['animal'] || []).filter(function(n) { return n !== cardName; }).length;
      if (animalBuddies >= 1) {
        // Multiple animal targets = opponent can only hit one per turn, but still devalues all
        bonus -= Math.min(animalBuddies * 0.4, 1.5);
        descs.push('opp Pred/Ants ×' + (animalBuddies + 1) + ' animals');
      }
    }
    // If opponent has plant attacks and I'm investing in plant prod, discount stacking
    if (_oppPlAtk && cardEff.pp && cardEff.pp > 0) {
      var ppBuddies = 0;
      for (var _oppi = 0; _oppi < myHand.length; _oppi++) {
        if (myHand[_oppi] === cardName) continue;
        var _oppEff = _effData[myHand[_oppi]];
        if (_oppEff && _oppEff.pp > 0) ppBuddies++;
      }
      if (ppBuddies >= 2) {
        bonus -= Math.min(ppBuddies * 0.3, 1);
        descs.push('opp plant atk risky');
      }
    }

    // ── 43. PRODUCTION DIVERSITY: hand gives 3+ different prod types → Generalist potential ──
    var prodTypes = {};
    if (cardEff.mp && cardEff.mp > 0) prodTypes.mc = true;
    if (cardEff.sp && cardEff.sp > 0) prodTypes.steel = true;
    if (cardEff.tp && cardEff.tp > 0) prodTypes.ti = true;
    if (cardEff.pp && cardEff.pp > 0) prodTypes.plants = true;
    if (cardEff.ep && cardEff.ep > 0) prodTypes.energy = true;
    if (cardEff.hp && cardEff.hp > 0) prodTypes.heat = true;
    var myProdCount = Object.keys(prodTypes).length;
    if (myProdCount >= 1) {
      var handProdTypes = {};
      for (var _pdi = 0; _pdi < myHand.length; _pdi++) {
        if (myHand[_pdi] === cardName) continue;
        var _pdEff = _effData[myHand[_pdi]];
        if (!_pdEff) continue;
        if (_pdEff.mp > 0) handProdTypes.mc = true;
        if (_pdEff.sp > 0) handProdTypes.steel = true;
        if (_pdEff.tp > 0) handProdTypes.ti = true;
        if (_pdEff.pp > 0) handProdTypes.plants = true;
        if (_pdEff.ep > 0) handProdTypes.energy = true;
        if (_pdEff.hp > 0) handProdTypes.heat = true;
      }
      var combinedProdTypes = 0;
      for (var _cpt in prodTypes) { combinedProdTypes++; }
      for (var _cpt2 in handProdTypes) { if (!prodTypes[_cpt2]) combinedProdTypes++; }
      // 4+ different prod types together = Generalist potential (+5 VP milestone)
      if (combinedProdTypes >= 4) {
        var divBonus = combinedProdTypes >= 6 ? 2 : combinedProdTypes >= 5 ? 1.5 : 1;
        bonus += divBonus;
        descs.push(combinedProdTypes + ' prod types→Generalist');
      }
    }

    // ── 44. OPPONENT CORP GLOBAL PENALTY: raising params that help opp corps ──
    var _oppCorpsHand = ctx && ctx.oppCorps ? ctx.oppCorps : [];
    if (_oppCorpsHand.length > 0) {
      var oppGlobVuln = typeof TM_OPP_CORP_VULN_GLOBAL !== 'undefined' ? TM_OPP_CORP_VULN_GLOBAL : {};
      // Check if my card raises a global that benefits an opponent corp
      var raisesPenalty = 0;
      for (var _ogi = 0; _ogi < _oppCorpsHand.length; _ogi++) {
        var oppVuln = oppGlobVuln[_oppCorpsHand[_ogi]];
        if (!oppVuln) continue;
        // Polaris: ocean cards help them
        if (_oppCorpsHand[_ogi] === 'Polaris' && cardEff.oc && cardEff.oc > 0) {
          var otherOc = 0;
          for (var _ocj = 0; _ocj < myHand.length; _ocj++) {
            if (myHand[_ocj] === cardName) continue;
            var _ocEff = _effData[myHand[_ocj]];
            if (_ocEff && _ocEff.oc > 0) otherOc++;
          }
          if (otherOc >= 1) {
            raisesPenalty += Math.min(otherOc * 0.4, 1.5);
            descs.push('opp Polaris oc×' + (otherOc + 1));
          }
        }
        // Aphrodite: venus raises help them
        if (_oppCorpsHand[_ogi] === 'Aphrodite' && cardEff.vn && cardEff.vn > 0) {
          var otherVn = 0;
          for (var _vnj = 0; _vnj < myHand.length; _vnj++) {
            if (myHand[_vnj] === cardName) continue;
            var _vnEff = _effData[myHand[_vnj]];
            if (_vnEff && _vnEff.vn > 0) otherVn++;
          }
          if (otherVn >= 1) {
            raisesPenalty += Math.min(otherVn * 0.3, 1);
            descs.push('opp Aphrodite vn×' + (otherVn + 1));
          }
        }
      }
      bonus -= Math.min(raisesPenalty, 2);
    }

    // ── 45. TIMING COHESION: hand of all-prod early or all-VP late = strategic coherence ──
    var isProdCard = (cardEff.mp > 0 || cardEff.sp > 0 || cardEff.tp > 0 || cardEff.pp > 0 || cardEff.ep > 0 || cardEff.hp > 0);
    var isVPCard = (cardEff.vp > 0 || cardEff.vpAcc || cardEff.tr > 0);
    if (isProdCard && gensLeft >= 5) {
      var otherProd = 0;
      for (var _tci = 0; _tci < myHand.length; _tci++) {
        if (myHand[_tci] === cardName) continue;
        var _tcEff = _effData[myHand[_tci]];
        if (_tcEff && (_tcEff.mp > 0 || _tcEff.sp > 0 || _tcEff.tp > 0 || _tcEff.pp > 0 || _tcEff.ep > 0 || _tcEff.hp > 0)) otherProd++;
      }
      // 3+ prod cards early = production rush, all compound in value
      if (otherProd >= 3) {
        bonus += Math.min((otherProd - 2) * 0.5, 1.5);
      }
    }
    if (isVPCard && gensLeft === 3) { // gensLeft ≤ 2 handled by VP burst (section 38)
      var otherVP = 0;
      for (var _tcv = 0; _tcv < myHand.length; _tcv++) {
        if (myHand[_tcv] === cardName) continue;
        var _tcvEff = _effData[myHand[_tcv]];
        if (_tcvEff && ((_tcvEff.vp || 0) > 0 || _tcvEff.vpAcc || (_tcvEff.tr || 0) > 0)) otherVP++;
      }
      if (otherVP >= 2) {
        bonus += Math.min((otherVP - 1) * 0.5, 2);
        descs.push('VP cohesion ×' + (otherVP + 1));
      }
    }

    // ── 46. WILD TAG COMPOUND: wild tags count as any tag → amplify all triggers/discounts ──
    var hasWild = cardTagsArr.indexOf('wild') >= 0;
    if (hasWild) {
      // Wild tag benefits from ALL tag triggers and discounts in hand
      var wildTriggerBonus = 0;
      var _ttData = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
      for (var _wti = 0; _wti < myHand.length; _wti++) {
        if (myHand[_wti] === cardName) continue;
        if (_ttData[myHand[_wti]]) wildTriggerBonus += 0.5; // each trigger card = some value
      }
      var _cdData = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
      for (var _wdi = 0; _wdi < myHand.length; _wdi++) {
        if (myHand[_wdi] === cardName) continue;
        if (_cdData[myHand[_wdi]]) wildTriggerBonus += 0.3;
      }
      if (wildTriggerBonus > 0) {
        bonus += Math.min(wildTriggerBonus, 3);
        descs.push('wild amplifies triggers');
      }
    }
    // Cards with wild tag in hand amplify OTHER cards' trigger matches
    var wildInHand = (handTagMap['wild'] || []).filter(function(n) { return n !== cardName; }).length;
    if (wildInHand >= 1 && cardTagsArr.length > 0 && !isEvent) {
      // Each wild in hand potentially fires an extra trigger for this card
      var _ttData2 = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
      var triggerCount = 0;
      for (var _wt2 = 0; _wt2 < myHand.length; _wt2++) {
        if (myHand[_wt2] === cardName) continue;
        if (_ttData2[myHand[_wt2]]) triggerCount++;
      }
      if (triggerCount >= 1) {
        bonus += Math.min(wildInHand * 0.3, 1);
        descs.push(wildInHand + ' wild in hand');
      }
    }

    // ── 47. STEEL/TI STOCKPILE COMPOUND: resources + matching cards = play more cheaply ──
    var _stk = ctx || {};
    var stStockpile = _stk.steel || 0;
    var tiStockpile = _stk.titanium || 0;
    if (stStockpile >= 3 && cardTagsArr.indexOf('building') >= 0) {
      var bldBuddies = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldBuddies >= 2) {
        // Many building cards + steel stockpile = can afford to play multiple → compound
        bonus += Math.min(bldBuddies * 0.4, 2);
        descs.push('steel ' + stStockpile + '+' + (bldBuddies + 1) + ' bld');
      }
    }
    if (tiStockpile >= 2 && cardTagsArr.indexOf('space') >= 0) {
      var spcBuddies = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcBuddies >= 2) {
        bonus += Math.min(spcBuddies * 0.5, 2.5);
        descs.push('ti ' + tiStockpile + '+' + (spcBuddies + 1) + ' spc');
      }
    }

    // ── 48. DRAW ENGINE COMPOUND: multiple card-draw sources = hand refill engine ──
    var drawCards = {
      'Research': 2, 'Invention Contest': 1, 'Mars University': 1, 'Olympus Conference': 1,
      'Business Network': 1, 'Restricted Area': 1, 'AI Central': 2, 'Rover Construction': 0,
      'Media Archives': 1, 'Orbital Laboratories': 1, 'Development Center': 1,
      'Designed Microorganisms': 0, 'Search For Life': 1, 'Aerial Mappers': 1
    };
    var myDrawVal = drawCards[cardName];
    if (myDrawVal !== undefined && myDrawVal > 0) {
      var otherDraws = 0;
      for (var _dri = 0; _dri < myHand.length; _dri++) {
        if (myHand[_dri] === cardName) continue;
        if (drawCards[myHand[_dri]] !== undefined && drawCards[myHand[_dri]] > 0) otherDraws++;
      }
      // 2+ draw sources = card advantage engine
      if (otherDraws >= 1) {
        bonus += Math.min(otherDraws * 0.6, 2);
        descs.push('draw engine ×' + (otherDraws + 1));
      }
    }

    // ── 49. HAND COST TEMPO: cheap cohesive hand = play 3-4 cards/gen vs 1-2 ──
    if (cardEff.c && cardEff.c <= 14 && myHand.length >= 4) {
      var cheapCount = 0;
      for (var _cti = 0; _cti < myHand.length; _cti++) {
        var ctEff = _effData[myHand[_cti]];
        if (ctEff && ctEff.c && ctEff.c <= 14) cheapCount++;
      }
      // 3+ cheap cards (≤14 MC) = tempo advantage: play them all in one gen
      if (cheapCount >= 3) {
        bonus += Math.min((cheapCount - 2) * 0.8, 3);
      }
    }

    // ── 50. MICROBE PLACEMENT: Imported Nitrogen microbes + microbe VP targets not in section 2 ──
    // (section 2 covers animal placement; microbe placement for Symbiotic Fungus etc. covered in section 15)

    // ── 51. DOUBLE TAG EXTRA TRIGGERS: cards with 2+ of same tag fire triggers twice ──
    // Research (sci×2), Luna Governor (earth×2), Mining Guild (building×2) etc.
    // Section 5 handles science chain; this catches earth/building/venus double-tags with triggers
    if (cardTagsArr.length >= 2) {
      var tagCounts = {};
      for (var _dti = 0; _dti < cardTagsArr.length; _dti++) {
        tagCounts[cardTagsArr[_dti]] = (tagCounts[cardTagsArr[_dti]] || 0) + 1;
      }
      for (var dtTag in tagCounts) {
        if (tagCounts[dtTag] < 2 || dtTag === 'science') continue; // science already in section 5
        // Check if any trigger card in hand fires on this tag
        for (var _dtj = 0; _dtj < myHand.length; _dtj++) {
          if (myHand[_dtj] === cardName) continue;
          var dtTrigger = TM_TAG_TRIGGERS[myHand[_dtj]];
          if (!dtTrigger) continue;
          for (var _dtk = 0; _dtk < dtTrigger.length; _dtk++) {
            if (dtTrigger[_dtk].tags.indexOf(dtTag) >= 0) {
              // This card fires trigger X times instead of 1
              var dtExtra = (tagCounts[dtTag] - 1) * dtTrigger[_dtk].value * 0.3;
              bonus += Math.min(dtExtra, 2);
              descs.push(myHand[_dtj].split(' ')[0] + ' +' + dtTag + '×' + tagCounts[dtTag]);
              break;
            }
          }
        }
      }
    }

    // ── 52. NO-TAG PENALTY: cards without tags miss all trigger/discount synergies ──
    if (!isEvent && cardTagsArr.length === 0) {
      // Count how many trigger/discount sources are in hand that this card can't benefit from
      var missedSources = 0;
      for (var _nti = 0; _nti < myHand.length; _nti++) {
        if (myHand[_nti] === cardName) continue;
        if (TM_TAG_TRIGGERS[myHand[_nti]] || TM_CARD_DISCOUNTS[myHand[_nti]]) missedSources++;
      }
      if (missedSources >= 1) {
        bonus -= Math.min(missedSources * 0.6, 2);
        descs.push('no tag: miss ' + missedSources + ' trigger/disc');
      }
    }

    // ── 53. VP ACCUMULATOR TIMING: early vpAcc cards = more gens to grow ──
    if (cardEff.vpAcc && cardEff.vpAcc > 0 && gensLeft >= 4) {
      // vpAcc cards generate VP per action over time; more gens left = more VP
      var vpAccOther = 0;
      for (var _vai = 0; _vai < myHand.length; _vai++) {
        if (myHand[_vai] === cardName) continue;
        var vaEff = _effData[myHand[_vai]];
        if (vaEff && vaEff.vpAcc > 0) vpAccOther++;
      }
      // 2+ VP accumulators early = "VP engine" setup
      if (vpAccOther >= 1 && gensLeft >= 5) {
        bonus += Math.min(vpAccOther * 0.5, 1.5);
        descs.push('VP engine ×' + (vpAccOther + 1) + ' early');
      }
    }

    // ── 54. GLOBAL PARAM RUSH: hand all-in on one param = closing bonus ──
    // 3+ cards raising same param = dedicated rush → first to close gets bonus tiles, deny opp TR
    var paramCounts = { tmp: 0, oc: 0, vn: 0 };
    for (var _gri = 0; _gri < myHand.length; _gri++) {
      var grEff = _effData[myHand[_gri]];
      if (!grEff) continue;
      if (grEff.tmp > 0) paramCounts.tmp += grEff.tmp;
      if (grEff.oc > 0) paramCounts.oc += grEff.oc;
      if (grEff.vn > 0) paramCounts.vn += grEff.vn;
    }
    // Check if this card contributes to the rush
    var rushParams = [];
    if (cardEff.tmp > 0 && paramCounts.tmp >= 4) rushParams.push({ p: 'temp', total: paramCounts.tmp, hr: tempHR });
    if (cardEff.oc > 0 && paramCounts.oc >= 3) rushParams.push({ p: 'ocean', total: paramCounts.oc, hr: ocHR });
    if (cardEff.vn > 0 && paramCounts.vn >= 4) rushParams.push({ p: 'venus', total: paramCounts.vn, hr: vnHR });
    for (var _grj = 0; _grj < rushParams.length; _grj++) {
      var rp = rushParams[_grj];
      // Rush bonus scaled by headroom (more room = more value in rushing)
      var rushVal = Math.min(rp.total * 0.2 * rp.hr, 1.5);
      if (rushVal > 0.3) {
        bonus += rushVal;
        descs.push(rp.p + ' rush ×' + rp.total);
      }
    }

    // ── 55. TAG DENSITY BONUS: 4+ cards with same tag → milestone proximity ──
    // Complements section 36 (milestone delta) which needs ctx.milestoneNeeds
    var tagDensity = {};
    for (var _tdi = 0; _tdi < myHand.length; _tdi++) {
      var tdTags = handTagCache[myHand[_tdi]] || [];
      for (var _tdj = 0; _tdj < tdTags.length; _tdj++) {
        var tdt = tdTags[_tdj];
        if (tdt === 'event') continue; // events don't persist
        tagDensity[tdt] = (tagDensity[tdt] || 0) + 1;
      }
    }
    // This card's tags benefit from density
    for (var _tdk = 0; _tdk < cardTagsArr.length; _tdk++) {
      var myTag = cardTagsArr[_tdk];
      if (myTag === 'event') continue;
      var tdCount = tagDensity[myTag] || 0;
      if (tdCount >= 4) {
        // 4+ same tag = Builder (building 8), Scientist (science 3), etc.
        bonus += Math.min((tdCount - 3) * 0.4, 1.5);
        descs.push(tdCount + '×' + myTag);
        break; // only count highest density
      }
    }

    // ── 56. COST OVERLOAD PENALTY: hand of expensive cards = can't play multiple per gen ──
    // Typical gen budget ~40-50 MC. Hand of 5 cards at 30 MC each = only play 1-2.
    if (cardEff.c && cardEff.c > 20 && myHand.length >= 4) {
      var expensiveCount = 0, totalHandCost = 0;
      for (var _coi = 0; _coi < myHand.length; _coi++) {
        var coEff = _effData[myHand[_coi]];
        if (coEff && coEff.c) {
          totalHandCost += coEff.c;
          if (coEff.c > 20) expensiveCount++;
        }
      }
      var avgHandCost = totalHandCost / myHand.length;
      // Penalty when 3+ expensive cards and avg > 22 MC — can't play them all
      if (expensiveCount >= 3 && avgHandCost > 22) {
        var overloadPen = -Math.min((avgHandCost - 22) * 0.15, 2.5);
        bonus += overloadPen;
        descs.push('costly hand avg' + Math.round(avgHandCost));
      }
    }

    // ── 57. ENERGY→HEAT PIPELINE: energy prod residual becomes heat next gen ──
    // Energy not consumed by actions becomes heat. With heat strategy cards, this is hidden synergy.
    if (cardEff.ep && cardEff.ep > 0) {
      // Check if there are heat-benefit cards in hand (heat prod, temp raise, Insulation)
      var heatBenefitCards = 0;
      for (var _ehi = 0; _ehi < myHand.length; _ehi++) {
        if (myHand[_ehi] === cardName) continue;
        var ehEff = _effData[myHand[_ehi]];
        if (!ehEff) continue;
        if (ehEff.hp > 0 || ehEff.tmp > 0) heatBenefitCards++;
        if (myHand[_ehi] === 'Insulation' || myHand[_ehi] === 'Caretaker Contract') heatBenefitCards++;
      }
      // Also check if there's NO energy consumer in hand (section 7 handles that)
      var hasConsumer = false;
      for (var _ehj = 0; _ehj < myHand.length; _ehj++) {
        if (TM_ENERGY_CONSUMERS.indexOf(myHand[_ehj]) >= 0 && myHand[_ehj] !== cardName) { hasConsumer = true; break; }
      }
      // If no consumer, energy → heat. With heat strategy, that's a bonus.
      if (!hasConsumer && heatBenefitCards >= 2) {
        // Higher bonus when heat synergy is dense (3+ heat benefit cards)
        var heatDensity57 = heatBenefitCards >= 3 ? 0.6 : 0.4;
        var pipeVal = Math.min(cardEff.ep * heatDensity57 * tempHR, 2.0);
        if (pipeVal > 0.2) {
          bonus += pipeVal;
          descs.push('ep→heat pipe ×' + heatBenefitCards);
        }
      }
    }

    // ── 58. MC CONVERSION ENABLERS: Insulation/Power Infra/Caretaker compound with production ──
    // These cards convert resources to MC or TR; value scales with matching production in hand
    var MC_CONVERTERS = {
      'Insulation': { src: 'hp', label: 'heat→MC', perProd: 0.6, cap: 5 },
      'Power Infrastructure': { src: 'ep', label: 'energy→MC', perProd: 0.8, cap: 5 },
      'Caretaker Contract': { src: 'hp', label: 'heat→TR', perProd: 0.6, cap: 5 },
    };
    var mcConv = MC_CONVERTERS[cardName];
    if (mcConv) {
      var convProdTotal = 0;
      for (var _mci = 0; _mci < myHand.length; _mci++) {
        if (myHand[_mci] === cardName) continue;
        var mcEff = _effData[myHand[_mci]];
        if (mcEff && mcEff[mcConv.src] > 0) convProdTotal += mcEff[mcConv.src];
      }
      // Section 24 (NAMED_EFF_COMBOS) already covers Insulation→hp, but this adds the converter's own perspective
      if (convProdTotal >= 3) {
        var convVal = Math.min(convProdTotal * mcConv.perProd, mcConv.cap);
        bonus += convVal;
        descs.push(mcConv.label + ' ×' + convProdTotal + ' prod');
      }
    }
    // Reverse: production card + converter in hand
    if (cardEff.hp && cardEff.hp > 0 && (handSet.has('Caretaker Contract') || handSet.has('Power Infrastructure'))) {
      // Only add if NOT already covered by Insulation in NAMED_EFF_COMBOS
      if (!handSet.has('Insulation')) {
        var convName = handSet.has('Caretaker Contract') ? 'Caretaker' : 'PwrInfra';
        bonus += Math.min(cardEff.hp * 0.4, 2);
        descs.push(convName + ' convert');
      }
    }
    if (cardEff.ep && cardEff.ep > 0 && handSet.has('Power Infrastructure')) {
      bonus += Math.min(cardEff.ep * 0.5, 2.5);
      descs.push('PwrInfra ×' + cardEff.ep + 'ep');
    }

    // ── 59. (removed — Predators eating own animals is VP-neutral, not a penalty) ──

    // ── 62. IMMEDIATE RESOURCES: cards giving steel/ti + building/space cards = instant use ──
    // If hand gives immediate steel and has building cards, that steel gets used right away
    if (cardEff.st && cardEff.st > 0) {
      var bldForSteel = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldForSteel > 0) {
        bonus += Math.min(cardEff.st * 0.5, 2.5);
        descs.push(cardEff.st + ' steel→' + bldForSteel + ' bld');
      }
    }
    // Building card + cards giving immediate steel in hand
    if (cardTagsArr.indexOf('building') >= 0) {
      var steelFromHand = 0;
      for (var _isi = 0; _isi < myHand.length; _isi++) {
        if (myHand[_isi] === cardName) continue;
        var isEff = _effData[myHand[_isi]];
        if (isEff && isEff.st > 0) steelFromHand += isEff.st;
      }
      if (steelFromHand >= 3) {
        bonus += Math.min(steelFromHand * 0.3, 1.5);
        descs.push(steelFromHand + ' steel avail');
      }
    }
    // Immediate titanium + space cards
    if (cardEff.ti && cardEff.ti > 0) {
      var spcForTi = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcForTi > 0) {
        bonus += Math.min(cardEff.ti * 0.7, 3);
        descs.push(cardEff.ti + ' ti→' + spcForTi + ' spc');
      }
    }
    // Space card + cards giving immediate titanium in hand
    if (cardTagsArr.indexOf('space') >= 0) {
      var tiFromHand = 0;
      for (var _iti = 0; _iti < myHand.length; _iti++) {
        if (myHand[_iti] === cardName) continue;
        var itEff = _effData[myHand[_iti]];
        if (itEff && itEff.ti > 0) tiFromHand += itEff.ti;
      }
      if (tiFromHand >= 2) {
        bonus += Math.min(tiFromHand * 0.4, 2);
        descs.push(tiFromHand + ' ti avail');
      }
    }

    // ── 63. DELEGATE COMPOUND: multiple delegate cards = political control ──
    // 3+ delegates from hand = party leader, 5+ = chairman → influence + TR/gen
    var _delCards = typeof TM_DELEGATE_CARDS !== 'undefined' ? TM_DELEGATE_CARDS : {};
    if (_delCards[cardName]) {
      var totalDelegates = 0;
      var delCardCount = 0;
      for (var _dli = 0; _dli < myHand.length; _dli++) {
        if (myHand[_dli] === cardName) continue;
        if (_delCards[myHand[_dli]]) {
          totalDelegates += _delCards[myHand[_dli]];
          delCardCount++;
        }
      }
      var allDelegates = totalDelegates + _delCards[cardName];
      if (delCardCount >= 1 && totalDelegates >= 2) {
        // Non-linear: 3-4 = party leader (+0.5/del), 5-6 = chairman likely (+0.7/del), 7+ = chairman lock (+0.9/del)
        var delCoeff = allDelegates >= 7 ? 0.9 : allDelegates >= 5 ? 0.7 : 0.5;
        var delVal = Math.min(totalDelegates * delCoeff, 5);
        bonus += delVal;
        descs.push(allDelegates + ' delegates');
      }
    }

    // ── 60. STANDARD TECHNOLOGY: -3 MC on standard projects ──
    // StdTech is good with MC production (more budget to dump into SPs).
    // Plant/heat/energy prod REDUCE SP need (you greenery via plants, temp via heat, etc.).
    if (cardName === 'Standard Technology') {
      var stMCProd = 0;
      for (var _sti2 = 0; _sti2 < myHand.length; _sti2++) {
        if (myHand[_sti2] === cardName) continue;
        var stEff = _effData[myHand[_sti2]];
        if (!stEff) continue;
        // MC production = more budget for SPs → each SP saves 3 MC
        if (stEff.mp > 0) stMCProd += stEff.mp;
      }
      if (stMCProd >= 3) {
        bonus += Math.min(stMCProd * 0.3, 2);
        descs.push('StdTech +' + stMCProd + 'MC→SP');
      }
    }
    // Reverse: MC production card with Standard Technology in hand
    if (handSet.has('Standard Technology') && cardName !== 'Standard Technology') {
      if (cardEff.mp && cardEff.mp > 0) {
        bonus += 0.5;
        descs.push('StdTech -3 SP');
      }
    }

    // ── 61. GREENERY PIPELINE: 6+ total plant prod in hand + O2 headroom = TR engine ──
    // Not just plant stacking (section 13) — this captures the full plant→greenery→O2→TR pipeline
    if (cardEff.pp && cardEff.pp > 0 && plantHR > 0.5) {
      var totalPP = 0;
      for (var _gpi = 0; _gpi < myHand.length; _gpi++) {
        var gpEff = _effData[myHand[_gpi]];
        if (gpEff && gpEff.pp > 0) totalPP += gpEff.pp;
      }
      // 6+ total plant prod = ~1 greenery per gen = sustained TR engine
      if (totalPP >= 6 && gensLeft >= 4) {
        var greeneryRate = totalPP / 8; // greeneries per gen
        var pipelineVal = Math.min(greeneryRate * 0.6 * plantHR, 1.5);
        if (pipelineVal > 0.3) {
          bonus += pipelineVal;
          descs.push('greenery engine ' + totalPP + 'pp');
        }
      }
    }

    // ── 64. MULTI-DISCOUNT COMPOUND: 3+ discount sources = massive savings ──
    // When 2+ discount cards in hand, each additional card in hand benefits from ALL discounts
    // The compound effect: each new card added saves more because multiple discounts stack
    if (!isEvent) {
      var totalDiscount = 0;
      var discountSources = 0;
      var _cdDataMD = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
      for (var _mdi = 0; _mdi < myHand.length; _mdi++) {
        if (myHand[_mdi] === cardName) continue;
        var mdEntry = _cdDataMD[myHand[_mdi]];
        if (!mdEntry) continue;
        for (var mdTag in mdEntry) {
          if (mdEntry[mdTag] <= 0) continue;
          if (mdTag === '_all' || mdTag === '_req' || cardTagsArr.indexOf(mdTag) >= 0) {
            totalDiscount += mdEntry[mdTag];
            discountSources++;
            break;
          }
        }
      }
      // 2+ discount sources stacking on this card = compound savings
      if (discountSources >= 2 && totalDiscount >= 4) {
        var compoundVal = Math.min((discountSources - 1) * 0.5, 1.5);
        bonus += compoundVal;
        descs.push(discountSources + ' disc stack -' + totalDiscount);
      }
    }

    // ── 65. CITY + GREENERY ADJACENCY: city cards + plant production = adjacency MC ──
    // Each city adjacent to greeneries gets +1 MC per adjacent greenery.
    // If hand has city cards and plant production, the greeneries will be placed next to cities.
    var isCityCardAdj = cardTagsArr.indexOf('city') >= 0;
    if (isCityCardAdj && gensLeft >= 3) {
      var ppForAdj = 0;
      for (var _adi = 0; _adi < myHand.length; _adi++) {
        if (myHand[_adi] === cardName) continue;
        var adEff = _effData[myHand[_adi]];
        if (adEff && adEff.pp > 0) ppForAdj += adEff.pp;
      }
      // 4+ plant prod = ~1 greenery/gen to place adjacent to this city → +1 MC/gen
      if (ppForAdj >= 4) {
        var adjVal = Math.min(ppForAdj / 8 * gensLeft * 0.15, 1.5);
        if (adjVal > 0.3) {
          bonus += adjVal;
          descs.push('adj greenery ' + ppForAdj + 'pp');
        }
      }
    }
    // Reverse: plant prod card + city cards in hand = greeneries have good placement
    if (cardEff.pp && cardEff.pp > 0 && gensLeft >= 3) {
      var citiesForAdj = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (citiesForAdj >= 1) {
        bonus += Math.min(citiesForAdj * 0.4, 1);
        descs.push(citiesForAdj + ' city adj');
      }
    }

    // ── 66. PREREQ ENABLERS: param-raising cards unlock requirement cards in hand ──
    // If card raises a global param and another card in hand has min-requirement for that param,
    // both get a small bonus (enabler helps unlock, locked card is closer to playable).
    var _globalReqs = typeof TM_CARD_GLOBAL_REQS !== 'undefined' ? TM_CARD_GLOBAL_REQS : {};
    var paramMap = { tmp: 'temperature', oc: 'oceans', o2: 'oxygen', vn: 'venus' };
    // How much each effect unit raises the param
    var paramStep = { tmp: 2, oc: 1, o2: 1, vn: 2 };
    // Check if THIS card raises params and unlocks others
    var enabledCards = 0;
    for (var pmKey in paramMap) {
      if (!cardEff[pmKey] || cardEff[pmKey] <= 0) continue;
      var pmName = paramMap[pmKey];
      var raiseAmount = cardEff[pmKey] * paramStep[pmKey];
      for (var _rei = 0; _rei < myHand.length; _rei++) {
        if (myHand[_rei] === cardName) continue;
        var reqData = _globalReqs[myHand[_rei]];
        if (!reqData || !reqData[pmName] || !reqData[pmName].min) continue;
        // Card in hand needs this param raised — our card helps
        enabledCards++;
      }
    }
    if (enabledCards >= 1) {
      bonus += Math.min(enabledCards * 0.5, 1.5);
      descs.push('unlock ' + enabledCards + ' req card' + (enabledCards > 1 ? 's' : ''));
    }
    // Reverse: THIS card has min-requirement and hand has param-raisers
    var myReqs = _globalReqs[cardName];
    if (myReqs) {
      var enablers = 0;
      for (var pmKey2 in paramMap) {
        var pmName2 = paramMap[pmKey2];
        if (!myReqs[pmName2] || !myReqs[pmName2].min) continue;
        for (var _rej = 0; _rej < myHand.length; _rej++) {
          if (myHand[_rej] === cardName) continue;
          var enjEff = _effData[myHand[_rej]];
          if (enjEff && enjEff[pmKey2] && enjEff[pmKey2] > 0) enablers++;
        }
      }
      if (enablers >= 1) {
        bonus += Math.min(enablers * 0.4, 1);
        descs.push(enablers + ' enabler' + (enablers > 1 ? 's' : '') + ' for req');
      }
    }

    // ── 67. MAX-REQ ANTI-SYNERGY: param-raising cards conflict with max-requirement cards ──
    // Cards with max-requirement (e.g., max temp -18) get WORSE when hand raises that param.
    if (myReqs) {
      var antiEnablers = 0;
      for (var pmKey3 in paramMap) {
        var pmName3 = paramMap[pmKey3];
        if (!myReqs[pmName3] || !myReqs[pmName3].max) continue;
        for (var _rek = 0; _rek < myHand.length; _rek++) {
          if (myHand[_rek] === cardName) continue;
          var aekEff = _effData[myHand[_rek]];
          if (aekEff && aekEff[pmKey3] && aekEff[pmKey3] > 0) antiEnablers++;
        }
      }
      if (antiEnablers >= 1) {
        bonus -= Math.min(antiEnablers * 0.4, 1);
        descs.push(antiEnablers + ' raise vs max-req');
      }
    }

    // ── 70. TAG REQUIREMENT ENABLERS: hand provides tags needed for tag-req cards ──
    // If card needs N science tags and hand provides some/all of them, bonus for both sides.
    var _tagReqs = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
    var myTagReq = _tagReqs[cardName];
    if (myTagReq) {
      for (var trTag in myTagReq) {
        var trNeeded = myTagReq[trTag];
        // Count matching tags from OTHER hand cards
        var trProvided = 0;
        for (var _tri = 0; _tri < myHand.length; _tri++) {
          if (myHand[_tri] === cardName) continue;
          var trTags = getCardTagsLocal(myHand[_tri]);
          for (var _trk = 0; _trk < trTags.length; _trk++) {
            if (trTags[_trk] === trTag) trProvided++;
          }
        }
        if (trProvided >= 1) {
          // Full enable: hand provides all needed tags → big bonus
          // Partial: some tags → scaled bonus
          var trRatio = Math.min(trProvided / trNeeded, 1);
          var trVal = trRatio >= 1 ? Math.min(1.5, trNeeded * 0.3) : trRatio * 0.8;
          if (trVal > 0.2) {
            bonus += trVal;
            descs.push(trProvided + '/' + trNeeded + ' ' + trTag + ' req');
          }
        }
      }
    }
    // Reverse: this card's tags enable other cards with tag requirements
    if (!isEvent && cardTagsArr.length > 0) {
      var enabledByTags = 0;
      for (var _trj = 0; _trj < myHand.length; _trj++) {
        if (myHand[_trj] === cardName) continue;
        var trReq = _tagReqs[myHand[_trj]];
        if (!trReq) continue;
        for (var trTag2 in trReq) {
          if (cardTagsArr.indexOf(trTag2) >= 0) { enabledByTags++; break; }
        }
      }
      if (enabledByTags >= 1) {
        bonus += Math.min(enabledByTags * 0.3, 1);
        descs.push('enable ' + enabledByTags + ' tag-req');
      }
    }

    // ── 71. TRIPLE RESOURCE CHAIN: energy→heat→MC/TR pipeline compound ──
    // If hand has energy prod + heat prod/converter + MC converter (Insulation/Power Infra/Caretaker),
    // energy cards get extra bonus: energy→heat(residual)→MC is a triple chain.
    var _mcConverters = ['Insulation', 'Power Infrastructure', 'Caretaker Contract'];
    var hasMCConverter = false;
    var hasHeatProd = false;
    var hasEnergyProd = false;
    for (var _rci = 0; _rci < myHand.length; _rci++) {
      if (myHand[_rci] === cardName) continue;
      if (_mcConverters.indexOf(myHand[_rci]) >= 0) hasMCConverter = true;
      var rcEff = _effData[myHand[_rci]];
      if (rcEff && rcEff.hp > 0) hasHeatProd = true;
      if (rcEff && rcEff.ep > 0) hasEnergyProd = true;
    }
    // Energy prod card in hand with heat prod + MC converter = triple chain
    if (cardEff.ep && cardEff.ep > 0 && (hasHeatProd || hasMCConverter) && (hasHeatProd && hasMCConverter)) {
      bonus += Math.min(cardEff.ep * 0.6, 1.5);
      descs.push('ep→hp→MC chain');
    }
    // MC converter card in hand with both energy + heat prod = triple chain receiving end
    if (_mcConverters.indexOf(cardName) >= 0 && hasEnergyProd && hasHeatProd) {
      bonus += 1;
      descs.push('triple chain sink');
    }

    // ── 68. TIMING MISMATCH: prod cards late game or VP-only cards early = diminished value ──
    // Production cards at gensLeft ≤ 2 barely pay back; pure VP cards at gensLeft >= 7 are too early.
    if (isProdCard && !isVPCard && gensLeft <= 2) {
      var lateOtherProd = 0;
      for (var _tmi = 0; _tmi < myHand.length; _tmi++) {
        if (myHand[_tmi] === cardName) continue;
        var tmEff = _effData[myHand[_tmi]];
        if (tmEff && (tmEff.mp > 0 || tmEff.sp > 0 || tmEff.tp > 0 || tmEff.pp > 0 || tmEff.ep > 0 || tmEff.hp > 0)
            && !(tmEff.vp > 0 || tmEff.vpAcc || tmEff.tr > 0)) lateOtherProd++;
      }
      if (lateOtherProd >= 2) {
        var lateProdPen = -Math.min((lateOtherProd - 1) * 0.5, 1.5);
        bonus += lateProdPen;
        descs.push('late prod ×' + (lateOtherProd + 1));
      }
    }

    // ── 69. SHARED RESOURCE COMPETITION: multiple animal VP accumulators compete for placements ──
    // If 3+ animal VP accumulators, they compete for limited animal placement from Large Convoy etc.
    if (cardEff.vpAcc && cardTagsArr.indexOf('animal') >= 0) {
      var animalAccCount = 0;
      for (var _arc = 0; _arc < myHand.length; _arc++) {
        if (myHand[_arc] === cardName) continue;
        var arcEff = _effData[myHand[_arc]];
        var arcTags = getCardTagsLocal(myHand[_arc]);
        if (arcEff && arcEff.vpAcc && arcTags.indexOf('animal') >= 0) animalAccCount++;
      }
      // 3+ competing accumulators = diminishing returns on placement
      if (animalAccCount >= 2) {
        bonus -= Math.min((animalAccCount - 1) * 0.4, 1);
        descs.push((animalAccCount + 1) + ' animal VP compete');
      }
    }

    // ── 72. EVENT BENEFIT COMPOUND: event-boosting cards + multiple events in hand ──
    // Media Group (+3 MC per event), Media Archives (similar), Optimal Aerobraking (heat+plants per space event)
    var _eventBenefitCards = { 'Media Group': 3, 'Media Archives': 3, 'Optimal Aerobraking': 3 };
    var eventsInHandCount = (handTagMap['event'] || []).length;
    if (_eventBenefitCards[cardName]) {
      var evOthers = eventsInHandCount - (cardTagsArr.indexOf('event') >= 0 ? 1 : 0);
      if (evOthers >= 2) {
        var evBenVal = Math.min((evOthers - 1) * _eventBenefitCards[cardName] / 7, 2);
        bonus += evBenVal;
        descs.push(evOthers + ' events +' + _eventBenefitCards[cardName] + 'ea');
      }
    }
    if (cardTagsArr.indexOf('event') >= 0) {
      var evBenCount = 0;
      for (var _ebi = 0; _ebi < myHand.length; _ebi++) {
        if (myHand[_ebi] === cardName) continue;
        if (_eventBenefitCards[myHand[_ebi]]) evBenCount++;
      }
      if (evBenCount >= 1) {
        bonus += Math.min(evBenCount * 0.5, 1);
        descs.push(evBenCount + ' event benefiter' + (evBenCount > 1 ? 's' : ''));
      }
    }

    // ── 73. TERRAFORM SPREAD: hand covers multiple global parameters efficiently ──
    // Raising 3+ different params = flexible terraforming, no wasted standard project actions
    // Also count grn (greenery→o2) and actOc (action ocean) as param coverage
    var paramsCovered = {};
    for (var _tsi = 0; _tsi < myHand.length; _tsi++) {
      var tsEff = _effData[myHand[_tsi]];
      if (!tsEff) continue;
      if (tsEff.tmp > 0) paramsCovered['tmp'] = true;
      if (tsEff.oc > 0 || tsEff.actOc > 0) paramsCovered['oc'] = true;
      if (tsEff.o2 > 0 || tsEff.grn > 0) paramsCovered['o2'] = true;
      if (tsEff.vn > 0) paramsCovered['vn'] = true;
    }
    var paramTypes = Object.keys(paramsCovered).length;
    var myParamContrib = 0;
    if (cardEff.tmp > 0) myParamContrib++;
    if (cardEff.oc > 0 || cardEff.actOc > 0) myParamContrib++;
    if (cardEff.o2 > 0 || cardEff.grn > 0) myParamContrib++;
    if (cardEff.vn > 0) myParamContrib++;
    if (paramTypes >= 3 && myParamContrib >= 1) {
      // 3 params = +0.9, 4 params = +1.8; multi-param card bonus handled in section 93
      var tfSpreadBase = Math.min((paramTypes - 2) * 0.9, 2.0);
      bonus += tfSpreadBase;
      descs.push('terraform ' + paramTypes + ' params');
    }

    // ── 74. CONVERSION FLEXIBILITY: energy prod + 2+ different converters = adaptive engine ──
    // Having multiple energy sinks means you choose the best one each turn
    var _energyConverterMap = {
      'Steelworks': 'steel', 'Ironworks': 'steel', 'Water Splitting Plant': 'ocean',
      'Electro Catapult': 'MC', 'Power Infrastructure': 'MC',
      'Caretaker Contract': 'TR', 'Insulation': 'heat→MC'
    };
    if (cardEff.ep && cardEff.ep > 0) {
      var convTypes = {};
      for (var _cfi = 0; _cfi < myHand.length; _cfi++) {
        if (myHand[_cfi] === cardName) continue;
        var convType = _energyConverterMap[myHand[_cfi]];
        if (convType) convTypes[convType] = true;
      }
      var convCount = Object.keys(convTypes).length;
      if (convCount >= 2) {
        bonus += Math.min((convCount - 1) * 0.5, 1.5);
        descs.push(convCount + ' conv options');
      }
    }
    if (_energyConverterMap[cardName]) {
      var otherConvTypes = {};
      var hasEpForConv = false;
      for (var _cfj = 0; _cfj < myHand.length; _cfj++) {
        if (myHand[_cfj] === cardName) continue;
        var cfjEff = _effData[myHand[_cfj]];
        if (cfjEff && cfjEff.ep > 0) hasEpForConv = true;
        var cfjConv = _energyConverterMap[myHand[_cfj]];
        if (cfjConv && cfjConv !== _energyConverterMap[cardName]) otherConvTypes[cfjConv] = true;
      }
      if (hasEpForConv && Object.keys(otherConvTypes).length >= 1) {
        bonus += 0.4;
        descs.push('conv flex');
      }
    }

    // ── 75. AFFORDABILITY TENSION: too many expensive cards compete for limited MC ──
    // 4+ cards costing ≥20 MC = can't play them all, hand has internal tension
    if (cardEff.c && cardEff.c >= 20) {
      var expensiveOthers = 0;
      for (var _ati = 0; _ati < myHand.length; _ati++) {
        if (myHand[_ati] === cardName) continue;
        var atEff = _effData[myHand[_ati]];
        if (atEff && atEff.c >= 20) expensiveOthers++;
      }
      if (expensiveOthers >= 3) {
        bonus -= Math.min((expensiveOthers - 2) * 0.4, 1.2);
        descs.push('MC crunch ×' + (expensiveOthers + 1));
      }
    }

    // ── 80. HEAT-ONLY TR ENGINE: high heat prod → temp via standard project = implicit TR ──
    // Without temp raisers or MC converters (Insulation/PowerInfra), heat → temperature for free
    if (cardEff.hp && cardEff.hp > 0) {
      var totalHp80 = cardEff.hp;
      var hasTmpCards80 = false;
      var hasMCSink80 = false;
      for (var _hoi = 0; _hoi < myHand.length; _hoi++) {
        if (myHand[_hoi] === cardName) continue;
        var hoEff80 = _effData[myHand[_hoi]];
        if (hoEff80 && hoEff80.hp > 0) totalHp80 += hoEff80.hp;
        if (hoEff80 && hoEff80.tmp > 0) hasTmpCards80 = true;
        if (myHand[_hoi] === 'Insulation' || myHand[_hoi] === 'Power Infrastructure') hasMCSink80 = true;
      }
      // Section 78 handles heat+tmp; section 58 handles heat+converters. This handles heat-only.
      if (!hasTmpCards80 && !hasMCSink80 && totalHp80 >= 8) {
        var trPerGen80 = totalHp80 / 8;
        bonus += Math.min(trPerGen80 * 0.5, 1.5);
        descs.push('heat→temp ' + (Math.round(trPerGen80 * 10) / 10) + '/gen');
      }
    }

    // ── 78. HEAT→TEMP COMPOUND: heat prod + temp raisers both push temperature ──
    // High heat prod = implicit temp raises via conversion (8 heat → 1 temp → 1 TR).
    // Combined with direct temp cards = accelerated TR engine.
    var totalHpHand78 = 0;
    var totalTmpHand78 = 0;
    for (var _hti = 0; _hti < myHand.length; _hti++) {
      if (myHand[_hti] === cardName) continue;
      var htEff78 = _effData[myHand[_hti]];
      if (!htEff78) continue;
      if (htEff78.hp > 0) totalHpHand78 += htEff78.hp;
      if (htEff78.tmp > 0) totalTmpHand78 += htEff78.tmp;
    }
    // Heat prod card + temp raisers in hand: both push temperature
    if (cardEff.hp && cardEff.hp > 0 && totalTmpHand78 >= 1) {
      bonus += Math.min(totalTmpHand78 * 0.4, 2);
      descs.push('hp+tmp×' + totalTmpHand78);
    }
    // Temp raiser + high heat prod: heat also pushes temp
    if (cardEff.tmp && cardEff.tmp > 0 && totalHpHand78 >= 6) {
      var implicitTempTR = totalHpHand78 / 8;
      bonus += Math.min(implicitTempTR * 0.8, 2);
      descs.push('tmp+' + totalHpHand78 + 'hp');
    }

    // ── 79. PLANT→O2 COMPOUND: plant prod + greenery/oxygen raisers both push oxygen ──
    // High plant prod = greeneries = oxygen raises. Direct o2/grn cards compound with plant prod.
    var totalPpHand79 = 0;
    var totalO2Hand79 = 0;
    for (var _poi = 0; _poi < myHand.length; _poi++) {
      if (myHand[_poi] === cardName) continue;
      var poEff79 = _effData[myHand[_poi]];
      if (!poEff79) continue;
      if (poEff79.pp > 0) totalPpHand79 += poEff79.pp;
      if (poEff79.o2 > 0 || poEff79.grn > 0) totalO2Hand79 += (poEff79.o2 || 0) + (poEff79.grn || 0);
    }
    // Plant prod card + o2/greenery cards: both push oxygen
    if (cardEff.pp && cardEff.pp > 0 && totalO2Hand79 >= 1) {
      bonus += Math.min(totalO2Hand79 * 0.4, 1.5);
      descs.push('pp+o2×' + totalO2Hand79);
    }
    // O2/greenery card + high plant prod: plants also push oxygen via greenery
    if ((cardEff.o2 > 0 || cardEff.grn > 0) && totalPpHand79 >= 4) {
      var implicitO2 = totalPpHand79 / 8;
      bonus += Math.min(implicitO2 * 0.6, 1.5);
      descs.push('o2+' + totalPpHand79 + 'pp');
    }

    // ── 76. WILD TAG FLEXIBILITY: wild tags count as any tag for stacking/requirements ──
    var isWildCard = cardTagsArr.indexOf('wild') >= 0;
    if (isWildCard) {
      // Wild tag = can be any tag. Most valuable when hand has concentrated tag demand.
      var handTagDemand = {};
      var _tagReqsWild = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
      // Demand from tag requirements
      for (var _wi = 0; _wi < myHand.length; _wi++) {
        if (myHand[_wi] === cardName) continue;
        var wrReq = _tagReqsWild[myHand[_wi]];
        if (wrReq) {
          for (var wrTag in wrReq) handTagDemand[wrTag] = (handTagDemand[wrTag] || 0) + 2;
        }
      }
      // Demand from tag stacking (2+ of same tag = stacking is active)
      var _stackTags = ['science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'building', 'space'];
      for (var _wj = 0; _wj < _stackTags.length; _wj++) {
        var stCount = (handTagMap[_stackTags[_wj]] || []).filter(function(n) { return n !== cardName; }).length;
        if (stCount >= 2) handTagDemand[_stackTags[_wj]] = (handTagDemand[_stackTags[_wj]] || 0) + stCount;
      }
      var maxDemand = 0;
      for (var _wk in handTagDemand) {
        if (handTagDemand[_wk] > maxDemand) maxDemand = handTagDemand[_wk];
      }
      if (maxDemand >= 2) {
        bonus += Math.min(maxDemand * 0.3, 1.5);
        descs.push('wild→' + Object.keys(handTagDemand).length + ' tags');
      }
    }
    // Reverse: wild tags in hand help satisfy this card's tag requirements
    if (!isWildCard) {
      var wildInHand = (handTagMap['wild'] || []).filter(function(n) { return n !== cardName; }).length;
      var _tagReqsWild2 = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
      if (wildInHand >= 1 && _tagReqsWild2[cardName]) {
        bonus += Math.min(wildInHand * 0.4, 1);
        descs.push(wildInHand + ' wild for req');
      }
    }

    // ── 81. ACTION STALL COMPOUND: 2-3 action cards = stall value (delay round end) ──
    // Section 32 penalizes 4+ actions. But 2-3 is the sweet spot: each extra action = ~1 MC stall value.
    // Only fires at gensLeft >= 3 (stall matters when game is contested, not in final push).
    var isAction81 = !!(cardEff.actTR || cardEff.actMC || cardEff.vpAcc || cardEff.actCD || cardEff.actOc);
    if (isAction81 && gensLeft >= 3) {
      var actionsOther81 = 0;
      for (var _as81 = 0; _as81 < myHand.length; _as81++) {
        if (myHand[_as81] === cardName) continue;
        var asEff81 = _effData[myHand[_as81]];
        if (asEff81 && (asEff81.actTR || asEff81.actMC || asEff81.vpAcc || asEff81.actCD || asEff81.actOc)) actionsOther81++;
      }
      // 2-3 action cards = stall bonus; 4+ already penalized by section 32
      if (actionsOther81 >= 1 && actionsOther81 <= 2) {
        bonus += Math.min((actionsOther81 + 1) * 0.3, 0.9);
        descs.push((actionsOther81 + 1) + ' actions stall');
      }
    }

    // ── 82. MC PROD SELF-FUNDING: MC-prod cards offset cost of expensive cards in hand ──
    // A hand with both MC-prod and expensive cards is more coherent: the engine funds the payoffs.
    var totalMpHand82 = 0;
    for (var _sf82 = 0; _sf82 < myHand.length; _sf82++) {
      if (myHand[_sf82] === cardName) continue;
      var sfEff82 = _effData[myHand[_sf82]];
      if (sfEff82 && sfEff82.mp > 0) totalMpHand82 += sfEff82.mp;
    }
    if (cardEff.c && cardEff.c >= 15 && totalMpHand82 >= 3) {
      // Expensive card with good MC prod support = easier to afford
      bonus += Math.min(totalMpHand82 * 0.2, 1.2);
      descs.push('funded by ' + totalMpHand82 + 'mp');
    }
    if (cardEff.mp && cardEff.mp > 0) {
      // MC prod card with expensive cards in hand = funding role
      var expensiveInHand82 = 0;
      for (var _sf82b = 0; _sf82b < myHand.length; _sf82b++) {
        if (myHand[_sf82b] === cardName) continue;
        var sfEff82b = _effData[myHand[_sf82b]];
        if (sfEff82b && sfEff82b.c >= 15) expensiveInHand82++;
      }
      if (expensiveInHand82 >= 2) {
        // Scale with both expensive card count AND mp amount
        var fundVal82 = Math.min(expensiveInHand82 * 0.15 + cardEff.mp * 0.2, 2.0);
        bonus += fundVal82;
        descs.push('funds ' + expensiveInHand82 + ' ×' + cardEff.mp + 'mp');
      }
    }

    // ── 83. VP DENSITY LATE: 3+ VP cards at gensLeft ≤ 3 = VP sprint bonus ──
    // Late game, VP cards convert MC directly to points. Dense VP hands maximize final push.
    if (isVPCard && gensLeft <= 3 && gensLeft >= 1) {
      var vpOthers83 = 0;
      var totalVPValue83 = 0;
      for (var _vd83 = 0; _vd83 < myHand.length; _vd83++) {
        if (myHand[_vd83] === cardName) continue;
        var vdEff83 = _effData[myHand[_vd83]];
        if (vdEff83 && ((vdEff83.vp || 0) > 0 || vdEff83.vpAcc || (vdEff83.tr || 0) > 0)) {
          vpOthers83++;
          totalVPValue83 += (vdEff83.vp || 0) + (vdEff83.tr || 0) * 2;
        }
      }
      // 3+ VP cards in late game = sprint is on
      // Scale by this card's VP (1 VP gets less sprint than 3 VP)
      if (vpOthers83 >= 2) {
        var myVP83 = (cardEff.vp || 0) + (cardEff.tr || 0);
        var vpScale83 = Math.min(myVP83, 3) / 2; // 1VP=0.5x, 2VP=1.0x, 3VP=1.5x
        var sprintMult83 = (4 - gensLeft) * 0.4 * Math.max(vpScale83, 0.3);
        bonus += Math.min(vpOthers83 * sprintMult83, 4);
        descs.push('VP sprint ×' + (vpOthers83 + 1));
      }
    }

    // ── 77. MULTI-PARAM CARD BONUS: cards that raise 2+ different params are more versatile ──
    // Comet (tmp+oc), Giant Ice Asteroid (tmp+oc), Towing A Comet (oc+o2) etc.
    // (Section 77 merged into section 93 — multi-param intrinsic bonus)

    // ── 84. DISCOUNT AMPLIFIER: multiple discounters = compound savings ──
    // Each discount card saves MC per play. 2+ discounters = play more cards per gen = compound.
    var _discData84 = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
    var myDisc84 = _discData84[cardName];
    if (myDisc84) {
      var otherDisc84 = 0;
      var matchingTagCards84 = 0;
      for (var _d84 = 0; _d84 < myHand.length; _d84++) {
        if (myHand[_d84] === cardName) continue;
        if (_discData84[myHand[_d84]]) otherDisc84++;
        // Count cards that benefit from this discount
        var d84Tags = getCardTagsLocal(myHand[_d84]);
        if (myDisc84._all || myDisc84._req) matchingTagCards84++;
        else {
          for (var d84k in myDisc84) {
            if (d84Tags.indexOf(d84k) >= 0) { matchingTagCards84++; break; }
          }
        }
      }
      if (otherDisc84 >= 1 && matchingTagCards84 >= 2) {
        bonus += Math.min(otherDisc84 * 0.4 + matchingTagCards84 * 0.15, 1.5);
        descs.push((otherDisc84 + 1) + ' disc + ' + matchingTagCards84 + ' targets');
      }
    }
    // Reverse: card benefits from discounters in hand
    // Skip discounters with hard tag requirements (e.g. Warp Drive needs 5 science)
    if (!myDisc84) {
      var discSavings84 = 0;
      var myTagCounts84 = ctx.tags || {};
      for (var _d84r = 0; _d84r < myHand.length; _d84r++) {
        if (myHand[_d84r] === cardName) continue;
        var rd84 = _discData84[myHand[_d84r]];
        if (!rd84) continue;
        // Skip discount cards with tag requirements we're unlikely to meet
        if (rd84._tagReq) {
          var sciTags84 = (myTagCounts84.science || 0) + (ctx.handTags && ctx.handTags.science || 0);
          if (sciTags84 < rd84._tagReq * 0.6) continue; // need 60%+ of req to count
        }
        if (rd84._all || rd84._req) { discSavings84 += (rd84._all || rd84._req); continue; }
        for (var rd84k in rd84) {
          if (rd84k.charAt(0) === '_') continue; // skip meta keys
          if (cardTagsArr.indexOf(rd84k) >= 0) { discSavings84 += rd84[rd84k]; break; }
        }
      }
      if (discSavings84 >= 3) {
        bonus += Math.min(discSavings84 * 0.15, 1);
        descs.push('-' + discSavings84 + ' MC disc');
      }
    }

    // ── 85. RESOURCE GENERATOR COMPOUND: resource generators + VP accumulators of same type ──
    // Symbiotic Fungus generates microbes → Decomposers accumulates VP from microbes. Same for animals/floaters.
    if (cardEff.vpAcc && cardEff.res) {
      var resType85 = cardEff.res;
      var generators85 = 0;
      for (var _rg85 = 0; _rg85 < myHand.length; _rg85++) {
        if (myHand[_rg85] === cardName) continue;
        var rgEff85 = _effData[myHand[_rg85]];
        if (!rgEff85) continue;
        // Cards that generate this resource type (have res field but are generators, not just accumulators)
        if (rgEff85.res === resType85 && !rgEff85.vpAcc) generators85++;
      }
      if (generators85 >= 1) {
        bonus += Math.min(generators85 * 0.5, 1.5);
        descs.push(generators85 + ' ' + resType85 + ' gen');
      }
    }
    // Reverse: generator with VP accumulators in hand
    if (cardEff.res && !cardEff.vpAcc) {
      var resType85r = cardEff.res;
      var accumulators85 = 0;
      for (var _rg85r = 0; _rg85r < myHand.length; _rg85r++) {
        if (myHand[_rg85r] === cardName) continue;
        var rgEff85r = _effData[myHand[_rg85r]];
        if (rgEff85r && rgEff85r.vpAcc && rgEff85r.res === resType85r) accumulators85++;
      }
      if (accumulators85 >= 1) {
        bonus += Math.min(accumulators85 * 0.4, 1);
        descs.push(accumulators85 + ' ' + resType85r + ' VP sink');
      }
    }

    // ── 86. TRIGGER CHAIN AMPLIFIER: 2+ trigger cards + dense matching tags = compound draw ──
    // Mars Uni + Olympus Conf in a 4-science hand = double card draw per science played.
    var _ttDataTCA = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
    var isTriggerCard86 = !!_ttDataTCA[cardName];
    if (isTriggerCard86) {
      var otherTriggers86 = 0;
      var triggerTagPool86 = {};
      // Collect tags that fire triggers from all trigger cards
      var myTrigEntries86 = _ttDataTCA[cardName] || [];
      for (var _t86a = 0; _t86a < myTrigEntries86.length; _t86a++) {
        var t86tags = myTrigEntries86[_t86a].tags;
        for (var _t86b = 0; _t86b < t86tags.length; _t86b++) triggerTagPool86[t86tags[_t86b]] = true;
      }
      for (var _t86c = 0; _t86c < myHand.length; _t86c++) {
        if (myHand[_t86c] === cardName) continue;
        if (_ttDataTCA[myHand[_t86c]]) {
          otherTriggers86++;
          var otEntries86 = _ttDataTCA[myHand[_t86c]];
          for (var _t86d = 0; _t86d < otEntries86.length; _t86d++) {
            var ot86tags = otEntries86[_t86d].tags;
            for (var _t86e = 0; _t86e < ot86tags.length; _t86e++) triggerTagPool86[ot86tags[_t86e]] = true;
          }
        }
      }
      // Count hand cards matching any trigger tag (excluding trigger cards themselves)
      if (otherTriggers86 >= 1) {
        var matchingCards86 = 0;
        for (var _t86f = 0; _t86f < myHand.length; _t86f++) {
          if (myHand[_t86f] === cardName) continue;
          if (_ttDataTCA[myHand[_t86f]]) continue;
          var ftags86 = getCardTagsLocal(myHand[_t86f]);
          for (var _t86g = 0; _t86g < ftags86.length; _t86g++) {
            if (triggerTagPool86[ftags86[_t86g]]) { matchingCards86++; break; }
          }
        }
        if (matchingCards86 >= 2) {
          bonus += Math.min(otherTriggers86 * matchingCards86 * 0.2, 1.5);
          descs.push((otherTriggers86 + 1) + ' triggers×' + matchingCards86);
        }
      }
    }

    // ── 87. TIMING DAMPENER: at gensLeft ≤ 2, reduce production-centric synergies ──
    // Generalist milestone, prod diversity, steel/ti availability — all lose value in final gens.
    // This doesn't replace section 68 (which directly penalizes late prod), it dampens compounding bonuses.
    if (isProdCard && !isVPCard && gensLeft <= 2 && bonus > 2) {
      var dampFactor87 = 0.7; // reduce 30% of non-VP prod synergy excess
      var excessBonus87 = bonus - 2;
      bonus = 2 + excessBonus87 * dampFactor87;
      descs.push('late damp');
    }

    // ── 88. CITY ADJACENCY COMPOUND: 3+ city cards = adjacency VP compound ──
    // Each city adjacent to another city = 1 VP. 3 cities = up to 3-6 VP from adjacency alone.
    if (cardTagsArr.indexOf('city') >= 0 && gensLeft >= 3) {
      var citiesOther88 = 0;
      for (var _ca88 = 0; _ca88 < myHand.length; _ca88++) {
        if (myHand[_ca88] === cardName) continue;
        var caTags88 = getCardTagsLocal(myHand[_ca88]);
        if (caTags88.indexOf('city') >= 0) citiesOther88++;
      }
      // 3+ cities = adjacency planning becomes viable
      if (citiesOther88 >= 2) {
        bonus += Math.min(citiesOther88 * 0.4, 1.2);
        descs.push((citiesOther88 + 1) + ' city adj');
      }
    }

    // ── 89. SOLE CONVERTER KEYSTONE: only converter for 10+ production = keystone card ──
    // If this card is the only way to monetize a large production base, it's irreplaceable.
    // Caretaker with 15hp and no Insulation = keystone; Insulation with 15hp and no Caretaker = keystone.
    if (mcConv) {
      var otherConverters89 = 0;
      for (var _sk89 = 0; _sk89 < myHand.length; _sk89++) {
        if (myHand[_sk89] === cardName) continue;
        if (MC_CONVERTERS[myHand[_sk89]] && MC_CONVERTERS[myHand[_sk89]].src === mcConv.src) otherConverters89++;
      }
      // Also count Helion as a heat converter (heat=MC inherently)
      if (mcConv.src === 'hp' && ctx._myCorps) {
        for (var _hc89 = 0; _hc89 < ctx._myCorps.length; _hc89++) {
          if (ctx._myCorps[_hc89] === 'Helion') otherConverters89++;
        }
      }
      var convProd89 = 0;
      for (var _sp89 = 0; _sp89 < myHand.length; _sp89++) {
        if (myHand[_sp89] === cardName) continue;
        var sp89Eff = _effData[myHand[_sp89]];
        if (sp89Eff && sp89Eff[mcConv.src] > 0) convProd89 += sp89Eff[mcConv.src];
      }
      if (otherConverters89 === 0 && convProd89 >= 10) {
        var keystoneVal = Math.min((convProd89 - 8) * 0.3, 1.5);
        bonus += keystoneVal;
        descs.push('sole ' + mcConv.label.split('→')[1] + ' conv');
      }
    }

    // ── 90. AWARD RACING SYNERGY: cards that help win a contested award ──
    // ctx.awardRacing = { 'Thermalist': 2, 'Miner': 1 } → distance to 1st place
    // Cards whose effects/tags push toward winning an award get a bonus.
    if (ctx.awardRacing) {
      var _awardMap90 = {
        'Thermalist': { res: 'hp', immediate: 'h' },  // heat resource + heat prod
        'Miner': { res: 'sp', res2: 'tp' },            // steel + ti prod
        'Banker': { res: 'mp' },                        // MC prod
        'Scientist': { tag: 'science' },
        'Landlord': { tag: 'plant', eff: 'grn' },      // greenery tiles
        'Cultivator': { eff: 'grn', eff2: 'pp' },      // greenery tiles + plant prod
        'Celebrity': {},                                 // 20+ cost cards (handled separately)
        'Industrialist': { res: 'sp', res2: 'ep' },    // steel + energy
        'Desert Settler': { eff: 'oc' },                // oceans
        'Estate Dealer': { eff: 'oc' },                 // oceans (adjacent)
        'Venuphile': { tag: 'venus' },
        'Contractor': { tag: 'building' },
        'Promoter': { tag: 'event' },
      };
      for (var aw90 in ctx.awardRacing) {
        var awDist90 = ctx.awardRacing[aw90];
        if (awDist90 > 5) continue; // Too far to matter
        var awDef90 = _awardMap90[aw90];
        if (!awDef90) continue;
        var awContrib90 = 0;
        // Tag match
        if (awDef90.tag && cardTagsArr.indexOf(awDef90.tag) >= 0) awContrib90 += cardTagsArr.filter(function(t) { return t === awDef90.tag; }).length;
        // Production match
        if (awDef90.res && cardEff[awDef90.res] && cardEff[awDef90.res] > 0) awContrib90 += cardEff[awDef90.res];
        if (awDef90.res2 && cardEff[awDef90.res2] && cardEff[awDef90.res2] > 0) awContrib90 += cardEff[awDef90.res2];
        // Effect match
        if (awDef90.eff && cardEff[awDef90.eff] && cardEff[awDef90.eff] > 0) awContrib90 += cardEff[awDef90.eff];
        if (awDef90.eff2 && cardEff[awDef90.eff2] && cardEff[awDef90.eff2] > 0) awContrib90 += 1;
        // Immediate resources
        if (awDef90.immediate && cardEff[awDef90.immediate] && cardEff[awDef90.immediate] > 0) awContrib90 += 1;
        if (awContrib90 > 0) {
          // Closer to winning = bigger bonus; distance 0-1 = very close, 2-3 = medium, 4-5 = far
          var awMul90 = awDist90 <= 1 ? 1.0 : (awDist90 <= 3 ? 0.6 : 0.3);
          var awVal90 = Math.min(awContrib90 * awMul90, 2);
          bonus += awVal90;
          descs.push(aw90 + ' award +' + awContrib90);
        }
      }
    }

    // ── 91. COLONY FLEET DENSITY: 4+ colony cards amplify trade fleet value ──
    // With 4+ colonies in hand, each trade fleet card unlocks significantly more income per trade
    var _colonyCardsAll91 = ['Space Port', 'Space Port Colony', 'Titan Shuttles', 'Trade Envoys',
      'Rim Freighters', 'Mining Colony', 'Research Colony', 'Martian Zoo',
      'Community Services', 'Productive Outpost', 'Pioneer Settlement'];
    var _fleetCards91 = ['Trade Envoys', 'Rim Freighters', 'Titan Shuttles',
      'Galilean Waystation', 'Quantum Communications'];
    var colCount91 = 0;
    var isFleet91 = _fleetCards91.indexOf(cardName) >= 0;
    var isCol91 = _colonyCardsAll91.indexOf(cardName) >= 0;
    if (isFleet91 || isCol91) {
      for (var _c91 = 0; _c91 < myHand.length; _c91++) {
        if (_colonyCardsAll91.indexOf(myHand[_c91]) >= 0) colCount91++;
      }
      if (colCount91 >= 4) {
        var colDensity91 = Math.min((colCount91 - 3) * 0.6, 1.5);
        bonus += colDensity91;
        descs.push(colCount91 + ' col density');
      }
    }

    // ── 92. CHAIRMAN CONTROL PREMIUM: 7+ delegates = chairman lock, compound political power ──
    // Chairman gives +1 TR/gen and party control — 7+ delegates makes it very likely
    if (_delCards[cardName]) {
      var totalDel92 = 0;
      for (var _d92 = 0; _d92 < myHand.length; _d92++) {
        if (_delCards[myHand[_d92]]) totalDel92 += _delCards[myHand[_d92]];
      }
      if (totalDel92 >= 7) {
        // Chairman lock premium: +1 TR/gen is worth ~7 MC/gen; each delegate above 6 solidifies control
        var chairBonus92 = Math.min((totalDel92 - 6) * 0.5, 2.0);
        bonus += chairBonus92;
        descs.push('chairman lock');
      }
    }

    // ── 93. MULTI-PARAM INTRINSIC: cards raising 2+ different global params = efficient TR ──
    // A card like Comet (tmp+oc) gives 2 TR from one play — intrinsically efficient.
    // Also scales with other param cards in hand (compound flex from old section 77).
    if (myParamContrib >= 2) {
      var mpBase93 = Math.min((myParamContrib - 1) * 0.6, 1.2);
      var otherParamCards93 = 0;
      for (var _mp93 = 0; _mp93 < myHand.length; _mp93++) {
        if (myHand[_mp93] === cardName) continue;
        var mp93Eff = _effData[myHand[_mp93]];
        if (!mp93Eff) continue;
        if (mp93Eff.tmp > 0 || mp93Eff.oc > 0 || mp93Eff.actOc > 0 || mp93Eff.o2 > 0 || mp93Eff.grn > 0 || mp93Eff.vn > 0) otherParamCards93++;
      }
      // Extra for compound with other param cards
      if (otherParamCards93 >= 2) mpBase93 += Math.min(otherParamCards93 * 0.15, 0.6);
      bonus += mpBase93;
      descs.push(myParamContrib + '-param card');
    }

    // ── 94. TAG DIVERSITY FOR MILESTONES: 7+ unique tag types in hand = Diversifier proximity ──
    // Only applies if Diversifier milestone is actually in the game
    var hasDiversifierMS = ctx.milestones && ctx.milestones.has('Diversifier');
    var uniqueTagTypes94 = {};
    for (var _t94 = 0; _t94 < myHand.length; _t94++) {
      var t94Tags = getCardTagsLocal(myHand[_t94]);
      for (var _t94j = 0; _t94j < t94Tags.length; _t94j++) {
        if (t94Tags[_t94j] !== 'event' && t94Tags[_t94j] !== 'wild') uniqueTagTypes94[t94Tags[_t94j]] = true;
      }
    }
    var tagDiversity94 = Object.keys(uniqueTagTypes94).length;
    if (hasDiversifierMS && tagDiversity94 >= 7 && cardTagsArr.length > 0) {
      // Check if this card contributes a unique tag not provided by others
      var myUniqueTags94 = 0;
      for (var _t94k = 0; _t94k < cardTagsArr.length; _t94k++) {
        if (cardTagsArr[_t94k] === 'event' || cardTagsArr[_t94k] === 'wild') continue;
        // Would removing this card lose this tag type?
        var otherHasTag94 = false;
        for (var _t94m = 0; _t94m < myHand.length; _t94m++) {
          if (myHand[_t94m] === cardName) continue;
          var t94mTags = getCardTagsLocal(myHand[_t94m]);
          if (t94mTags.indexOf(cardTagsArr[_t94k]) >= 0) { otherHasTag94 = true; break; }
        }
        if (!otherHasTag94) myUniqueTags94++;
      }
      if (myUniqueTags94 > 0) {
        bonus += Math.min(myUniqueTags94 * 0.5, 1.0);
        descs.push('Diversifier ' + tagDiversity94 + ' tags');
      }
    }

    // ── 95. ACTION + VP ACCUMULATOR WINDOW: action VP cards need gens to accumulate ──
    // When hand has multiple action cards that accumulate VP (vpAcc), enough gensLeft amplifies their value.
    if (cardEff.vpAcc && !(cardEff.actMC > 0) && gensLeft >= 4) {
      var otherVpAcc95 = 0;
      for (var _v95 = 0; _v95 < myHand.length; _v95++) {
        if (myHand[_v95] === cardName) continue;
        var v95Eff = _effData[myHand[_v95]];
        if (v95Eff && v95Eff.vpAcc) otherVpAcc95++;
      }
      // 2+ vpAcc cards = VP accumulation engine; more gens = more VP
      if (otherVpAcc95 >= 1) {
        var vpAccBonus95 = Math.min(otherVpAcc95 * 0.3 * Math.min(gensLeft / 5, 1.5), 1.5);
        bonus += vpAccBonus95;
        descs.push(otherVpAcc95 + 1 + ' VP accum ×' + gensLeft + 'g');
      }
    }

    // ── 96. ENERGY FULL CHAIN VALUE: ep without consumer in heat-heavy hand ──
    // When energy prod has no consumer but the hand is fully heat-committed (heat prod + heat use),
    // each energy prod generates heat that integrates into the heat chain at full value.
    if (cardEff.ep && cardEff.ep > 0) {
      var hasConsumer96 = false;
      var heatTotal96 = 0;
      var heatUse96 = 0; // heat converters or temp raisers
      for (var _ec96 = 0; _ec96 < myHand.length; _ec96++) {
        if (myHand[_ec96] === cardName) continue;
        if (TM_ENERGY_CONSUMERS.indexOf(myHand[_ec96]) >= 0) hasConsumer96 = true;
        var ec96Eff = _effData[myHand[_ec96]];
        if (ec96Eff) {
          if (ec96Eff.hp > 0) heatTotal96 += ec96Eff.hp;
          if (ec96Eff.tmp > 0) heatUse96++;
        }
        if (myHand[_ec96] === 'Insulation' || myHand[_ec96] === 'Caretaker Contract') heatUse96++;
      }
      // Temp headroom counts as a heat use path (standard project heat→temp)
      if (tempHR > 0.5) heatUse96++;
      // No consumer + high heat + heat use = energy fully integrates into heat chain
      if (!hasConsumer96 && heatTotal96 >= 8 && heatUse96 >= 1) {
        var chainVal96 = Math.min(cardEff.ep * 0.3, 1.0);
        bonus += chainVal96;
        descs.push('ep→heat chain ' + heatTotal96 + 'hp');
      }
    }

    // ── 97. HAND TAG DENSITY: 10+ total tags from 5 cards = flexible for requirements ──
    // Dense tag hands satisfy more requirements, contribute to more milestones/awards.
    var totalTagCount97 = 0;
    for (var _td97 = 0; _td97 < myHand.length; _td97++) {
      var td97Tags = getCardTagsLocal(myHand[_td97]);
      totalTagCount97 += td97Tags.length;
    }
    if (totalTagCount97 >= 10 && cardTagsArr.length >= 2) {
      // Cards with 2+ tags in a tag-dense hand contribute disproportionately
      var tagDenseVal97 = Math.min((cardTagsArr.length - 1) * 0.3, 0.9);
      bonus += tagDenseVal97;
    }

    // ── 98. EARLY PROD AMPLIFIER: production at gensLeft >= 7 compounds extra ──
    // Each gen of production adds cumulative value. At 7+ gens left, prod cards get timing premium.
    if (isProdCard && !isVPCard && gensLeft >= 7) {
      var earlyProdVal98 = Math.min((gensLeft - 6) * 0.3, 0.9);
      bonus += earlyProdVal98;
    }

    // ── 99. MC CRUNCH RELIEF: steel/ti prod offsets expensive building/space cards ──
    // When the hand has MC crunch (4+ expensive cards) but also steel/ti production,
    // the crunch is partially relieved for building/space cards.
    if (cardEff.c && cardEff.c >= 20) {
      var reliefProd99 = 0;
      var expCount99 = 0;
      for (var _cr99 = 0; _cr99 < myHand.length; _cr99++) {
        if (myHand[_cr99] === cardName) continue;
        var cr99Eff = _effData[myHand[_cr99]];
        if (!cr99Eff) continue;
        if (cr99Eff.c >= 20) expCount99++;
        if (cardTagsArr.indexOf('building') >= 0 && cr99Eff.sp > 0) reliefProd99 += cr99Eff.sp * 2;
        if (cardTagsArr.indexOf('space') >= 0 && cr99Eff.tp > 0) reliefProd99 += cr99Eff.tp * 3;
      }
      if (expCount99 >= 3 && reliefProd99 >= 4) {
        var reliefVal99 = Math.min(reliefProd99 * 0.08, 0.8);
        bonus += reliefVal99;
        descs.push('crunch relief ' + reliefProd99 + ' res');
      }
    }

    // ── 100. STALL + VP ACCUMULATOR COMPOUND: action VP + stall = VP/gen while delaying ──
    // When action vpAcc cards also have stall value (2-3 actions), each stall action generates VP.
    if (cardEff.vpAcc && isAction81 && gensLeft >= 4) {
      var otherActions100 = 0;
      var otherVpAcc100 = 0;
      for (var _sv100 = 0; _sv100 < myHand.length; _sv100++) {
        if (myHand[_sv100] === cardName) continue;
        var sv100Eff = _effData[myHand[_sv100]];
        if (!sv100Eff) continue;
        if (sv100Eff.actTR || sv100Eff.actMC || sv100Eff.vpAcc || sv100Eff.actCD || sv100Eff.actOc) otherActions100++;
        if (sv100Eff.vpAcc) otherVpAcc100++;
      }
      // 2+ total actions AND 1+ other vpAcc = stalling while accumulating VP
      if (otherActions100 >= 1 && otherVpAcc100 >= 1) {
        var stallVP100 = Math.min(otherVpAcc100 * 0.4, 1.2);
        bonus += stallVP100;
        descs.push('stall+VP ×' + (otherVpAcc100 + 1));
      }
    }

    // ── 101. VENUS STRATEGY COMPOUND: 4+ venus tags = Venus Governor/Venuphile proximity ──
    // Dense venus hands amplify venus-specific discounts, milestones, and venus raise cards.
    var venusTagCount101 = 0;
    var venusRaisers101 = 0;
    var isVenusTag101 = cardTagsArr.indexOf('venus') >= 0;
    if (isVenusTag101) {
      for (var _v101 = 0; _v101 < myHand.length; _v101++) {
        var v101Tags = getCardTagsLocal(myHand[_v101]);
        if (v101Tags.indexOf('venus') >= 0) venusTagCount101++;
        var v101Eff = _effData[myHand[_v101]];
        if (v101Eff && v101Eff.vn > 0) venusRaisers101++;
      }
      // 4+ venus tags = Venus Governor proximity (req 3 venus tags on map)
      // Each additional venus tag beyond 3 = more milestone/award coverage
      if (venusTagCount101 >= 4) {
        var venusDensity101 = Math.min((venusTagCount101 - 3) * 0.4, 1.2);
        // Extra if hand also raises venus (venus raisers + venus tags = full venus strategy)
        if (venusRaisers101 >= 2) venusDensity101 += Math.min(venusRaisers101 * 0.2, 0.6);
        bonus += venusDensity101;
        descs.push('venus ' + venusTagCount101 + ' tags');
      }
    }

    // ── 102. RESOURCE PLACEMENT CROSS-AMPLIFIER: places:X card + 3+ res:X cards = keystone ──
    // Cards with places:"floater"/"animal"/"microbe" place resources on ANY card of that type.
    // With 3+ matching resource cards, the placer amplifies multiple VP/TR sinks at once.
    var _placesField102 = cardEff.places;
    if (_placesField102) {
      var matchingRes102 = 0;
      for (var _rp102 = 0; _rp102 < myHand.length; _rp102++) {
        if (myHand[_rp102] === cardName) continue;
        var rp102Eff = _effData[myHand[_rp102]];
        if (rp102Eff && rp102Eff.res === _placesField102) matchingRes102++;
      }
      // 3+ matching res cards = the placer is a keystone accelerating all of them
      if (matchingRes102 >= 3) {
        var placeAmp102 = Math.min((matchingRes102 - 2) * 0.5, 1.5);
        bonus += placeAmp102;
        descs.push('place ' + _placesField102 + ' ×' + matchingRes102);
      }
    }
    // Reverse: res:X card with places:X cards in hand = gets extra resources
    if (cardEff.res && !cardEff.places) {
      var placers102 = 0;
      for (var _rp102r = 0; _rp102r < myHand.length; _rp102r++) {
        if (myHand[_rp102r] === cardName) continue;
        var rp102rEff = _effData[myHand[_rp102r]];
        if (rp102rEff && rp102rEff.places === cardEff.res) placers102++;
      }
      // 2+ placers = this card gets resources from multiple sources
      if (placers102 >= 2) {
        var receiveAmp102 = Math.min(placers102 * 0.4, 1.2);
        bonus += receiveAmp102;
        descs.push(placers102 + ' ' + cardEff.res + ' placers');
      }
    }

    // ── 103. ACTION REVENUE DIVERSITY: 3+ action cards with different revenue types ──
    // When action cards produce MC, TR, cards, and oceans from different sources,
    // the hand has diversified income = lower variance, more flexible per-gen decisions.
    var isAction103 = cardEff.actTR > 0 || cardEff.actMC > 0 || cardEff.actCD > 0 || cardEff.actOc > 0 || cardEff.vpAcc;
    if (isAction103) {
      var revenueTypes103 = {};
      var actionCount103 = 0;
      for (var _ar103 = 0; _ar103 < myHand.length; _ar103++) {
        var ar103Eff = _effData[myHand[_ar103]];
        if (!ar103Eff) continue;
        var hasAct103 = false;
        if (ar103Eff.actTR > 0) { revenueTypes103['TR'] = true; hasAct103 = true; }
        if (ar103Eff.actMC > 0) { revenueTypes103['MC'] = true; hasAct103 = true; }
        if (ar103Eff.actCD > 0) { revenueTypes103['CD'] = true; hasAct103 = true; }
        if (ar103Eff.actOc > 0) { revenueTypes103['OC'] = true; hasAct103 = true; }
        if (ar103Eff.vpAcc) { revenueTypes103['VP'] = true; hasAct103 = true; }
        if (hasAct103) actionCount103++;
      }
      var revTypes103 = Object.keys(revenueTypes103).length;
      // 3+ different revenue types from 3+ action cards = diversified action income
      if (revTypes103 >= 3 && actionCount103 >= 3) {
        var divBonus103 = Math.min((revTypes103 - 2) * 0.4, 1.2);
        bonus += divBonus103;
        descs.push(revTypes103 + ' act revenue');
      }
    }

    if (bonus !== 0) {
      // Soft cap: diminishing returns above 8, hard cap at 12
      if (bonus > 8) bonus = 8 + (bonus - 8) * 0.5;
      bonus = Math.max(Math.min(bonus, 12), -5);
      var topDescs = descs.slice(0, 4);
      if (descs.length > 4) topDescs.push('+' + (descs.length - 4));
      return { bonus: Math.round(bonus * 10) / 10, reasons: topDescs.length > 0 ? ['Hand: ' + topDescs.join(', ')] : [] };
    }
    return { bonus: 0, reasons: [] };
  }

  // Synergy with tableau cards — forward (data.y) + reverse lookup
  function scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet, playedEvents) {
    let synTotal = 0;
    let synCount = 0;
    let synDescs = [];
    if (data.y) {
      for (const entry of data.y) {
        var sn = yName(entry);
        var sw = yWeight(entry) || SC.tableauSynergyPer;
        if (playedEvents.has(sn)) continue;
        if (allMyCardsSet.has(sn) && synCount < SC.tableauSynergyMax) {
          synCount++;
          synTotal += sw;
          if (sw < 0) synDescs.push(sn.split(' ')[0] + ' ' + sw);
          else synDescs.push(sn.split(' ')[0] + ' +' + sw);
        }
      }
    }
    for (const myCard of allMyCards) {
      if (playedEvents.has(myCard)) continue;
      const myData = TM_RATINGS[myCard];
      if (!myData || !myData.y) continue;
      for (const re of myData.y) {
        if (yName(re) === cardName && synCount < SC.tableauSynergyMax) {
          var rw = yWeight(re) || SC.tableauSynergyPer;
          synCount++;
          synTotal += rw;
          synDescs.push(myCard.split(' ')[0] + ' +' + rw);
          break;
        }
      }
    }
    if (synTotal !== 0) {
      return { bonus: synTotal, reasons: [synDescs.slice(0, 2).join(', ')] };
    }
    return { bonus: 0, reasons: [] };
  }

  // Combo + anti-combo potential (indexed lookup with timing)
  function scoreComboPotential(cardName, eLower, allMyCardsSet, ctx) {
    var bonus = 0;
    var reasons = [];
    var comboIdx = getComboIndex();
    if (comboIdx[cardName]) {
      let bestComboBonus = 0;
      let bestComboDesc = '';
      for (const entry of comboIdx[cardName]) {
        const combo = entry.combo;
        const otherCards = entry.otherCards;
        const matchCount = otherCards.filter(function(c) { return allMyCardsSet.has(c); }).length;
        if (matchCount === 0) continue;

        // Check if missing cards include a corporation we don't own — combo is impossible
        var _missingCards = otherCards.filter(function(c) { return !allMyCardsSet.has(c); });
        var _corpData = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
        var _myCorpsCombo = ctx && ctx._myCorps ? ctx._myCorps : [];
        var _hasMissingCorp = false;
        for (var _mc = 0; _mc < _missingCards.length; _mc++) {
          if (_corpData[_missingCards[_mc]] && _myCorpsCombo.indexOf(_missingCards[_mc]) === -1) {
            _hasMissingCorp = true; break;
          }
        }
        if (_hasMissingCorp) continue; // combo requires a corp we don't have — skip

        const baseBonus = combo.r === 'godmode' ? SC.comboGodmode : combo.r === 'great' ? SC.comboGreat : combo.r === 'good' ? SC.comboGood : SC.comboDecent;
        const completionRate = (matchCount + 1) / combo.cards.length;
        let comboBonus = Math.round(baseBonus * (1 + completionRate));

        if (ctx) {
          let timingMul = 1.0;
          if (ctx.gensLeft !== undefined) {
            const cardIsBlue = eLower.includes('action');
            const isProd = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
            const isVPBurst = eLower.includes('vp') && !isProd && !cardIsBlue;
            const isAccum = eLower.includes('vp per') || eLower.includes('vp за');

            if (cardIsBlue) {
              timingMul = ctx.gensLeft >= 6 ? SC.timingBlue6 : ctx.gensLeft >= 4 ? SC.timingBlue4 : ctx.gensLeft >= 2 ? SC.timingBlue2 : SC.timingBlue1;
            } else if (isProd) {
              timingMul = ctx.gensLeft >= 5 ? SC.timingProd5 : ctx.gensLeft >= 3 ? SC.timingProd3 : SC.timingProd1;
            } else if (isVPBurst) {
              timingMul = ctx.gensLeft <= 2 ? SC.timingVPBurst2 : ctx.gensLeft <= 4 ? SC.timingVPBurst4 : SC.timingVPBurstHi;
            } else if (isAccum) {
              timingMul = ctx.gensLeft >= 5 ? SC.timingAccum5 : ctx.gensLeft >= 3 ? SC.timingAccum3 : SC.timingAccum1;
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
    var antiIdx = getAntiComboIndex();
    if (antiIdx[cardName]) {
      for (const entry of antiIdx[cardName]) {
        if (entry.otherCards.some(function(c) { return allMyCardsSet.has(c); })) {
          bonus -= SC.antiCombo;
          reasons.push('Конфликт: ' + entry.anti.v);
          break;
        }
      }
    }
    return { bonus: bonus, reasons: reasons };
  }

  // ── Discounts, material payments, and tag triggers ──

  function scoreDiscountsAndPayments(cardTags, cardCost, ctx, tagDecay) {
    var bonus = 0;
    var reasons = [];

    // 1. Tag discounts from corp/cards
    if (cardCost != null && cardTags.size > 0) {
      var totalDiscount = cardCost - getEffectiveCost(cardCost, cardTags, ctx.discounts);
      if (totalDiscount >= 2) {
        var discountBonus = Math.min(SC.discountCap, totalDiscount);
        bonus += discountBonus;
        reasons.push('Скидка −' + totalDiscount + ' MC');
      }
      // Discount stacking bonus: 2+ sources = extra synergy
      if (totalDiscount >= 4) {
        var discountSources = 1;
        for (var tag of cardTags) {
          if (ctx.discounts[tag] > 0) discountSources++;
        }
        if (discountSources >= 2) {
          var stackBonus = Math.min(SC.discountStackMax, discountSources);
          bonus += stackBonus;
          reasons.push('Стак скидок ×' + discountSources);
        }
      }
    }

    // 2. Steel payment (building tag)
    if (cardTags.has('building') && ctx.steel > 0) {
      var steelUsable = cardCost != null ? Math.min(ctx.steel, Math.ceil(cardCost / ctx.steelVal)) : ctx.steel;
      var steelMC = Math.min(steelUsable * ctx.steelVal, cardCost != null ? cardCost : steelUsable * ctx.steelVal);
      var steelBonus = Math.min(SC.steelPayCap, Math.round(steelMC / SC.steelPayDivisor));
      if (steelBonus > 0) {
        bonus += steelBonus;
        reasons.push('Сталь −' + steelMC + ' MC');
      }
    }

    // 3. Titanium payment (space tag)
    if (cardTags.has('space') && ctx.titanium > 0) {
      var tiUsable = cardCost != null ? Math.min(ctx.titanium, Math.ceil(cardCost / ctx.tiVal)) : ctx.titanium;
      var tiMC = Math.min(tiUsable * ctx.tiVal, cardCost != null ? cardCost : tiUsable * ctx.tiVal);
      var tiBonus = Math.min(SC.tiPayCap, Math.round(tiMC / SC.tiPayDivisor));
      if (tiBonus > 0) {
        bonus += tiBonus;
        reasons.push('Титан −' + tiMC + ' MC');
      }
    }

    // 4. Tag triggers from tableau cards
    if (cardTags.size > 0 && ctx.tagTriggers.length > 0) {
      var triggerTotal = 0;
      var triggerDescs = [];
      for (var ti = 0; ti < ctx.tagTriggers.length; ti++) {
        var trigger = ctx.tagTriggers[ti];
        for (var tti = 0; tti < trigger.tags.length; tti++) {
          if (cardTags.has(trigger.tags[tti])) {
            if (trigger.eventOnly && cardType !== 'red') break; // e.g. Optimal Aerobraking: space events only
            triggerTotal += trigger.value;
            triggerDescs.push(trigger.desc);
            break;
          }
        }
      }
      if (triggerTotal > 0) {
        var decayedTrigger = Math.round(Math.min(SC.triggerCap, triggerTotal) * tagDecay);
        if (decayedTrigger > 0) {
          bonus += decayedTrigger;
          reasons.push(triggerDescs.slice(0, 2).join(', ') + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
  }

  // ── Terraform rate awareness (fast/slow game) ──

  function scoreTerraformRate(ctx, eLower, data) {
    var bonus = 0;
    var reasons = [];
    if (!ctx || ctx.terraformRate <= 0 || ctx.gen < 3 || !data.e) return { bonus: 0, reasons: [] };

    var isFastGame = ctx.terraformRate >= SC.terraformFastThreshold;
    var isSlowGame = ctx.terraformRate <= SC.terraformSlowThreshold;
    var isProd = eLower.includes('prod') || eLower.includes('прод');
    var isVP = eLower.includes('vp') || eLower.includes('вп');

    if (isFastGame && isProd && !isVP) {
      bonus -= SC.terraformFastProdPenalty;
      reasons.push('Быстр. игра −' + SC.terraformFastProdPenalty);
    }
    if (isSlowGame && isProd && !isVP && ctx.gensLeft >= 4) {
      bonus += SC.terraformSlowProdBonus;
      reasons.push('Медл. игра +' + SC.terraformSlowProdBonus);
    }
    if (isFastGame && isVP) {
      bonus += SC.terraformFastVPBonus;
      reasons.push('Быстр. → VP +' + SC.terraformFastVPBonus);
    }

    return { bonus: bonus, reasons: reasons };
  }

  function scoreDraftCard(cardName, myTableau, myHand, myCorp, cardEl, ctx) {
    const data = TM_RATINGS[cardName];
    if (!data) return { total: 0, reasons: [] };

    var pv = getPlayerVueData();
    let bonus = 0;
    const reasons = [];
    const eLower = data.e ? data.e.toLowerCase() : '';

    // Two Corps support: use cached corps from ctx or detect once
    var myCorps = ctx && ctx._myCorps ? ctx._myCorps : [];
    if (myCorps.length === 0) {
      if (myCorp) myCorps.push(myCorp);
      var allDetected = detectMyCorps();
      for (var ci = 0; ci < allDetected.length; ci++) {
        if (allDetected[ci] && myCorps.indexOf(allDetected[ci]) === -1) myCorps.push(allDetected[ci]);
      }
    }

    // Base score: always COTD expert rating (EV shown alongside)
    var baseScore = data.s;

    // Tag value decay — tags lose value toward endgame (fewer cards left to play)
    var tagDecay = (ctx.gensLeft >= SC.tagDecayFullAt) ? 1.0
      : Math.max(SC.tagDecayMin, ctx.gensLeft / SC.tagDecayFullAt);

    // Corp boosts handled by getCorpBoost + CORP_ABILITY_SYNERGY

    // Synergy with tableau cards (weighted y) + reverse lookup
    const allMyCards = ctx && ctx._allMyCards ? ctx._allMyCards : [...myTableau, ...myHand];
    const allMyCardsSet = ctx && ctx._allMyCardsSet ? ctx._allMyCardsSet : new Set(allMyCards);
    var playedEvents = ctx && ctx._playedEvents ? ctx._playedEvents : new Set();
    bonus = applyResult(scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet, playedEvents), bonus, reasons);

    // Combo + anti-combo potential (indexed lookup with timing)
    bonus = applyResult(scoreComboPotential(cardName, eLower, allMyCardsSet, ctx), bonus, reasons);

    // Hand synergy: enablers, resource placement, tag density between cards in hand
    bonus = applyResult(scoreHandSynergy(cardName, myHand, ctx), bonus, reasons);

    // Detect card tags and cost from DOM (used by context scoring and post-context checks)
    let cardTags = new Set();
    if (cardEl) {
      cardTags = getCachedCardTags(cardEl);
    }
    let cardCost = null;
    if (cardEl) {
      cardCost = getCardCost(cardEl);
    }
    // Fallback: get cost from card_effects data if DOM parsing failed
    if (cardCost == null && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fxCost = TM_CARD_EFFECTS[cardName];
      if (fxCost && fxCost.c != null) cardCost = fxCost.c;
    }

    // ── Context-aware scoring (requires ctx and optionally cardEl) ──
    if (ctx) {

      // 0. Requirement feasibility + MET bonus
      var reqResult = scoreCardRequirements(cardEl, ctx);
      if (reqResult) {
        bonus = applyResult(reqResult, bonus, reasons);
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
      } else if (eLower.includes('action')) {
        cardType = 'blue';
      }

      // 1-4. Discounts, material payments, tag triggers
      bonus = applyResult(scoreDiscountsAndPayments(cardTags, cardCost, ctx, tagDecay), bonus, reasons);

      // 5-5d. Tag synergies — density, hand affinity, auto-synergy, corp ability, Pharmacy Union
      var tagSyn = scoreTagSynergies(cardName, cardTags, cardType, cardCost, tagDecay, eLower, data, myCorps, ctx, pv);
      bonus = applyResult(tagSyn, bonus, reasons);

      // 6. Colony synergy
      var colSyn = scoreColonySynergy(eLower, data, ctx);
      bonus = applyResult(colSyn, bonus, reasons);

      // 6b. Turmoil synergy
      var turSyn = scoreTurmoilSynergy(eLower, data, cardTags, ctx);
      bonus = applyResult(turSyn, bonus, reasons);

      // FTN timing delta + ocean-dependent action penalty
      // Detect prelude/corp — skip timing (all play at gen 1 simultaneously)
      var _isPreludeOrCorp = cardEl && (
        cardEl.closest('.wf-component--select-prelude') ||
        cardEl.classList.contains('prelude-card') ||
        !!cardEl.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
        !!cardEl.closest('.select-corporation') ||
        !!cardEl.closest('[class*="corporation"]')
      );
      var ftnResult = scoreFTNTiming(cardName, ctx, { isPreludeOrCorp: !!_isPreludeOrCorp });
      bonus = applyResult(ftnResult, bonus, reasons);
      var skipCrudeTiming = ftnResult.skipCrudeTiming;

      // 7-8d. Crude timing (skipped when FTN timing available)
      if (!skipCrudeTiming) {
        var ctResult = scoreCrudeTiming(cardName, eLower, data, ctx);
        bonus = applyResult(ctResult, bonus, reasons);
      }

      // 9-10b. Milestone/Award proximity
      var maProx = scoreMilestoneAwardProximity(cardTags, cardType, eLower, data, ctx);
      bonus = applyResult(maProx, bonus, reasons);

      // 13-15. Resource synergies — energy, plants, heat
      var resSyn = scoreResourceSynergies(eLower, data, cardTags, ctx);
      bonus = applyResult(resSyn, bonus, reasons);

      // 16-22. Card economy in context
      var econCtx = scoreCardEconomyInContext(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, skipCrudeTiming);
      bonus = applyResult(econCtx, bonus, reasons);

      // 24b + 41. Opponent awareness
      var oppAw = scoreOpponentAwareness(cardName, eLower, data, cardTags, ctx);
      bonus = applyResult(oppAw, bonus, reasons);

      // 23-32b. Positional factors
      var reqMet = reasons.some(function(r) { return r.includes('Req ✓'); });
      var posFact = scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet);
      bonus = applyResult(posFact, bonus, reasons);

      // 33. Corporation-specific scoring via unified getCorpBoost()
      if (myCorp && data.e) {
        var cbOpts = { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx };
        for (var cbi = 0; cbi < myCorps.length; cbi++) {
          var cbCorp = myCorps[cbi];
          var corpBoost = getCorpBoost(cbCorp, cbOpts);
          if (corpBoost !== 0) {
            bonus += corpBoost;
            reasons.push(cbCorp.split(' ')[0] + ' ' + (corpBoost > 0 ? '+' : '') + corpBoost);
          }
        }
      }

      // 34. 3+ card combo chain — enhanced bonus for closing multi-card combos
      if (typeof TM_COMBOS !== 'undefined') {
        for (const combo of TM_COMBOS) {
          if (!combo.cards.includes(cardName)) continue;
          const otherCards = combo.cards.filter(function(c) { return c !== cardName; });
          const matchCount = otherCards.filter(function(c) { return allMyCardsSet.has(c); }).length;
          if (matchCount >= 2) {
            const chainRating = combo.r === 'godmode' ? SC.chainGodmode : combo.r === 'great' ? SC.chainGreat : SC.chainDecent;
            bonus += chainRating;
            reasons.push('Цепь ' + (matchCount + 1) + '/' + combo.cards.length + ' +' + chainRating);
            break;
          }
        }
      }

      // 35. Trade value by colony track positions
      if (ctx.tradesLeft > 0 && data.e) {

        if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('торг') || eLower.includes('колон')) {
          if (pv && pv.game && pv.game.colonies) {
            let bestTrackVal = 0;
            for (const col of pv.game.colonies) {
              if (col.isActive !== false && col.trackPosition != null) {
                bestTrackVal = Math.max(bestTrackVal, col.trackPosition);
              }
            }
            if (bestTrackVal >= SC.tradeTrackThreshold) {
              const tradeBonus = Math.min(SC.tradeTrackCap, Math.floor(bestTrackVal / 2));
              bonus += tradeBonus;
              reasons.push('Трек ' + bestTrackVal + ' +' + tradeBonus);
            }
          }
        }
      }

      // 36. Milestone/Award-specific card bonuses — extracted to _scoreMapMA()
      var maResult = _scoreMapMA(data, cardTags, cardCost, ctx, SC);
      bonus = applyResult(maResult, bonus, reasons);

      // 37. Terraform rate awareness — fast game = less time for engine
      bonus = applyResult(scoreTerraformRate(ctx, eLower, data), bonus, reasons);
    }

    // 38-46. Post-context checks
    var postCtx = scorePostContextChecks(cardName, cardEl, eLower, data, cardTags, ctx, pv, myHand);
    bonus = applyResult(postCtx, bonus, reasons);

    // 47. Board-state modifiers
    var bsm = scoreBoardStateModifiers(cardName, data, eLower, ctx);
    bonus = applyResult(bsm, bonus, reasons);

    // 48. SYNERGY_RULES — extracted to _scoreSynergyRules()
    var srResult = _scoreSynergyRules(cardName, allMyCards, ctx, SC);
    bonus = applyResult(srResult, bonus, reasons);

    // Prelude-specific scoring — extracted to _scorePrelude()
    var preResult = _scorePrelude(cardName, data, cardEl, myCorp, ctx, SC);
    bonus = applyResult(preResult, bonus, reasons);

    // Smart vs SP: compare card with RELEVANT standard project only
    if (ctx && ctx.allSP && typeof TM_CARD_EFFECTS !== 'undefined') {
      var cfx = TM_CARD_EFFECTS[cardName];
      var relevantSP = null;
      if (cfx) {
        // Production cards → compare with Power Plant
        if ((cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp) && !cfx.tr) {
          relevantSP = ctx.allSP.find(function(sp) { return sp.type === 'power'; });
        }
        // TR-raising cards (no production) → compare with cheapest TR SP
        else if (cfx.tr && !(cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp)) {
          var trSPs = ctx.allSP.filter(function(sp) { return sp.type === 'asteroid' || sp.type === 'aquifer' || sp.type === 'venus' || sp.type === 'buffer'; });
          if (trSPs.length > 0) relevantSP = trSPs.reduce(function(best, sp) { return sp.adj > best.adj ? sp : best; });
        }
      }
      if (relevantSP) {
        var spDiff = (baseScore + bonus) - relevantSP.adj;
        if (spDiff < -5) {
          reasons.push('vs ' + relevantSP.name + ' ' + spDiff);
        }
      }
    }

    // Negative VP warning (MCP knowledge: negative VP cards lose games when trailing)
    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx = TM_CARD_EFFECTS[cardName];
      if (fx && fx.vp && fx.vp < 0) {
        reasons.push('⚠ ' + fx.vp + ' VP');
      }
    }

    // Production break-even timer
    var be = scoreBreakEvenTiming(cardName, ctx, cardTags);
    if (be.penalty > 0) { bonus -= be.penalty; }
    if (be.reason) reasons.push(be.reason);

    // Deny-draft advisor — also boost score for high-deny cards
    var denyReason = checkDenyDraft(data, baseScore + bonus, ctx, cardTags, cardName, eLower);
    if (denyReason) {
      reasons.push(denyReason);
      // If the card is mediocre for us but great for opponent, boost score
      var currentTotal = baseScore + bonus;
      if (currentTotal < 75 && data.s >= 70) {
        var denyBoost = Math.min(8, Math.round((data.s - currentTotal) * 0.3));
        if (denyBoost > 0) { bonus += denyBoost; reasons.push('Deny ↑' + denyBoost); }
      }
    }

    // Fallback: if no contextual reasons, show base evaluation info
    if (reasons.length === 0 && data) {
      if (data.e) {
        var evShort = data.e.length > 40 ? data.e.substring(0, 40) + '\u2026' : data.e;
        reasons.push(evShort);
      }
      if (data.w) reasons.push(data.w);
    }

    // Cap total score at 100 — S-tier ceiling
    var finalScore = Math.min(100, baseScore + bonus);
    if (debugMode) tmLog('score', cardName + ': ' + baseScore + ' \u2192 ' + finalScore + ' (' + reasons.join(', ') + ')');
    return { total: finalScore, reasons };
  }

  function scoreToTier(score) {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  var tierColor = TM_UTILS.tierColor;

  // Shared badge rendering: origTier/origScore → newTier/adjTotal with colored delta
  function updateBadgeScore(badge, origTier, origScore, total, extraClass) {
    var adjTotal = Math.round(total * 10) / 10;
    var delta = Math.round((adjTotal - origScore) * 10) / 10;
    var newTier = scoreToTier(adjTotal);
    if (delta === 0) {
      badge.innerHTML = newTier + ' ' + adjTotal;
    } else {
      var cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
      var sign = delta > 0 ? '+' : '';
      badge.innerHTML = origTier + origScore +
        '<span class="tm-badge-arrow">\u2192</span>' +
        newTier + adjTotal +
        ' <span class="' + cls + '">' + sign + delta + '</span>';
    }
    badge.className = 'tm-tier-badge tm-tier-' + newTier + (extraClass || '');
    return newTier;
  }

  // Detect corps offered during initial draft (3 fallback levels)
  function detectOfferedCorps() {
    var offeredCorps = [];
    // Level 1: DOM heuristic — corporation-specific styling
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (!cn) return;
      if (el.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
          (el.closest('.select-corporation') || el.closest('[class*="corporation"]'))) {
        offeredCorps.push(cn);
      }
    });
    if (offeredCorps.length > 0) return offeredCorps;

    // Level 2: Known corp patterns in ratings
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (!cn) return;
      var d = TM_RATINGS[cn];
      if (d && d.e && (d.e.includes('Корп') || d.e.includes('Corp') || d.e.includes('Стартовый') || d.e.includes('Start'))) {
        offeredCorps.push(cn);
      }
    });
    if (offeredCorps.length > 0) return offeredCorps;

    // Level 3: Check TAG_TRIGGERS/CORP_DISCOUNTS
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn])) {
        offeredCorps.push(cn);
      }
    });
    return offeredCorps;
  }

  // Render inline overlay on a draft card
  function renderCardOverlay(item, scored) {
    var adjTotal28 = Math.round(item.total * 10) / 10;
    var rec28, recClass28;
    if (adjTotal28 >= 70) { rec28 = '\u0411\u0415\u0420\u0418'; recClass28 = 'tm-iov-take'; }
    else if (adjTotal28 >= 55) { rec28 = 'OK'; recClass28 = 'tm-iov-ok'; }
    else { rec28 = '\u041F\u0410\u0421\u0421'; recClass28 = 'tm-iov-skip'; }

    var overlay28 = document.createElement('div');
    overlay28.className = 'tm-inline-overlay';
    var ovHTML = '<div class="tm-iov-rec ' + recClass28 + '">' + rec28 + '</div>';

    var rank28 = scored.indexOf(item) + 1;
    if (rank28 === 1) ovHTML += '<div class="tm-iov-rank">#1</div>';
    else if (rank28 === 2) ovHTML += '<div class="tm-iov-rank tm-iov-rank2">#2</div>';

    var cost28 = getCardCost(item.el);
    if (cost28 != null) {
      var ctx28 = getCachedPlayerContext();
      var disc28 = ctx28 && ctx28.discounts ? ctx28.discounts : {};
      var tags28 = getCardTags(item.el);
      var effCost28 = getEffectiveCost(cost28, tags28, disc28);
      var costStr28 = effCost28 < cost28 ? effCost28 + '/<s>' + cost28 + '</s>' : '' + cost28;
      ovHTML += '<div class="tm-iov-cost">' + costStr28 + ' MC</div>';
    }

    // VP/MC efficiency for last gen
    var ctx28vp = getCachedPlayerContext();
    if (ctx28vp && ctx28vp.gensLeft <= 1 && cost28 != null && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx28vp = TM_CARD_EFFECTS[item.name];
      if (fx28vp) {
        var vpTotal28 = (fx28vp.vp || 0) + (fx28vp.tr || 0) + (fx28vp.tmp || 0) + (fx28vp.o2 || 0) + (fx28vp.oc || 0) + (fx28vp.vn || 0);
        if (fx28vp.grn) vpTotal28 += fx28vp.grn * (ctx28vp.globalParams && ctx28vp.globalParams.oxy < 14 ? 2 : 1);
        if (vpTotal28 > 0) {
          var effCost28vp = cost28 + 3; // include draft cost
          var ratio28 = Math.round(effCost28vp / vpTotal28 * 10) / 10;
          ovHTML += '<div class="tm-iov-vp">' + vpTotal28 + ' VP за ' + effCost28vp + ' MC (' + ratio28 + '/VP)</div>';
        }
      }
    }

    var reasons28 = item.reasons.slice(0, 3);
    if (reasons28.length > 0) {
      ovHTML += '<div class="tm-iov-reasons">';
      for (var ri28 = 0; ri28 < reasons28.length; ri28++) {
        var rText = reasons28[ri28];
        if (rText.length > 30) rText = rText.substring(0, 30) + '\u2026';
        ovHTML += '<div class="tm-iov-reason">' + rText + '</div>';
      }
      ovHTML += '</div>';
    }

    var rData28 = TM_RATINGS[item.name];
    if (rData28 && rData28.y && rData28.y.length > 0) {
      var synName28 = yName(rData28.y[0]);
      var synShort28 = synName28.split(' ')[0];
      var alreadyInReasons28 = item.reasons.some(function(r) { return r.indexOf(synShort28) !== -1; });
      if (!alreadyInReasons28) {
        if (synName28.length > 20) synName28 = synName28.substring(0, 20) + '\u2026';
        ovHTML += '<div class="tm-iov-syn">\uD83D\uDD17 ' + synName28 + '</div>';
      }
    }

    overlay28.innerHTML = ovHTML;
    return overlay28;
  }

  // Score card against multiple offered corps (initial draft), pick best
  function scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx) {
    if (!myCorp && offeredCorps.length > 0 && !offeredCorps.includes(name)) {
      var bestResult = null;
      var bestTotal = -999;
      var bestCorp = '';
      for (var ci = 0; ci < offeredCorps.length; ci++) {
        var r = scoreDraftCard(name, myTableau, myHand, offeredCorps[ci], el, ctx);
        if (r.total > bestTotal) {
          bestTotal = r.total;
          bestResult = r;
          bestCorp = offeredCorps[ci];
        }
      }
      var noCorp = scoreDraftCard(name, myTableau, myHand, '', el, ctx);
      var result = bestResult || noCorp;
      if (bestCorp && bestResult && bestResult.total >= noCorp.total + 3) {
        var corpShort = bestCorp.split(' ')[0];
        if (!result.reasons.some(function(r) { return r.indexOf(corpShort) !== -1; })) {
          result.reasons.push('лучше с ' + bestCorp);
        }
      }
      return result;
    }
    return scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
  }

  // Research phase buy/skip adjustment
  function adjustForResearch(result, el, myHand, ctx) {
    var adj = 0;
    var handSize = myHand ? myHand.length : 0;
    var cardCost = getCardCost(el);
    var myMC = ctx ? (ctx.mc || 0) : 0;
    var gensLeft = ctx ? (ctx.gensLeft || 3) : 3;

    // Strong cards (A/B tier) are almost always worth 3 MC to buy
    if (result.total >= 80) adj += 5;
    else if (result.total >= 70) adj += 3;
    // Cheap playable cards with synergies = good buys
    else if (cardCost !== null && cardCost <= 10 && result.reasons.length >= 2) adj += 3;
    // Expensive unaffordable cards = skip
    else if (cardCost !== null && cardCost > 20 && myMC < cardCost * 0.7) adj -= 4;
    // Weak cards (D/F) = skip
    if (result.total < 50) adj -= 5;
    else if (result.total < 60) adj -= 3;
    // Hand bloat: penalty scales with hand size AND gensLeft
    if (handSize > gensLeft * 3 + 2) adj -= Math.min(5, handSize - gensLeft * 3);
    // Last gen: only VP cards worth buying
    if (gensLeft <= 1) {
      var fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[el.getAttribute('data-tm-card')] : null;
      var hasVP = fx && (fx.vp || fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn);
      if (!hasVP) adj -= 8;
    }
    result.total += adj;
    if (adj <= -3) result.reasons.push('Research: skip');
    else if (adj >= 3) result.reasons.push('Research: buy');
  }

  function resetDraftOverlays() {
    document.querySelectorAll('.tm-rec-best').forEach(function(el) { el.classList.remove('tm-rec-best'); });
    document.querySelectorAll('[data-tm-reasons]').forEach(function(el) { el.removeAttribute('data-tm-reasons'); });
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach(function(badge) {
      badge.textContent = badge.getAttribute('data-tm-original');
      badge.removeAttribute('data-tm-original');
      var origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) {
        badge.className = 'tm-tier-badge tm-tier-' + origTier;
        badge.removeAttribute('data-tm-orig-tier');
      }
    });
  }

  function scoreHandCardsInPlace() {
    var myCorp = detectMyCorp();
    if (!myCorp) return;
    var myTableau = getMyTableauNames();
    var myHand = getMyHandNames();
    var ctx = getCachedPlayerContext();
    enrichCtxForScoring(ctx, myTableau, myHand);
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name || !TM_RATINGS[name]) return;
      var origData = TM_RATINGS[name];
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      if (!badge.hasAttribute('data-tm-original')) {
        badge.setAttribute('data-tm-original', badge.textContent);
        badge.setAttribute('data-tm-orig-tier', origData.t);
      }
      var newTier = updateBadgeScore(badge, origData.t, origData.s, result.total);
      // Dim low-value hand cards (sell candidates)
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

  function updateDraftRecommendations() {
    if (!enabled) return;

    resetDraftOverlays();

    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) {
      scoreHandCardsInPlace();
      return;
    }

    let myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandWithDrafted(); // includes already-drafted cards this gen
    const ctx = getCachedPlayerContext();
    enrichCtxForScoring(ctx, myTableau, myHand);

    // Initial draft detection: detect offered corps when no corp chosen yet
    var gen = detectGeneration();
    var offeredCorps = (!myCorp && gen <= 1) ? detectOfferedCorps() : [];

    // Detect research phase (gen >= 2, 4 cards with buy/skip checkboxes, not prelude)
    var isResearchPhase = false;
    if (gen >= 2) {
      var cardCount = 0;
      selectCards.forEach(function(sec) { cardCount += sec.querySelectorAll('.card-container[data-tm-card]').length; });
      // Research = 4 cards shown for buying, not during draft (draft has smaller sets rotating)
      var hasCheckboxes = document.querySelectorAll('.wf-component--select-card input[type="checkbox"]').length > 0;
      isResearchPhase = cardCount === 4 && hasCheckboxes;
    }

    // Skip scoring for action-target selections (e.g. Ants choosing microbe target)
    // Detection: action phase + shown cards are NOT in player's hand
    var pv0_check = getPlayerVueData();
    var phase0_check = pv0_check && pv0_check.game ? pv0_check.game.phase : null;
    if (phase0_check === 'action') {
      var handSet0 = new Set(myHand);
      var allShownNames0 = [];
      selectCards.forEach(function(sec) {
        sec.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
          var n = el.getAttribute('data-tm-card');
          if (n) allShownNames0.push(n);
        });
      });
      var handCardsShown0 = allShownNames0.filter(function(n) { return handSet0.has(n); });
      if (allShownNames0.length > 0 && handCardsShown0.length === 0) {
        // All shown cards are outside hand → action target selection, skip scoring
        return;
      }
    }

    // Score each card in selection
    const scored = [];
    selectCards.forEach((section) => {
      section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;

        var result = scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx);

        if (isResearchPhase) adjustForResearch(result, el, myHand, ctx);

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

    // Detect draft/research phase once (not per-card)
    var pv28 = getPlayerVueData();
    var gamePhase28 = pv28 && pv28.game ? pv28.game.phase : null;
    var isDraftOrResearch28 = false;
    if (gamePhase28) {
      isDraftOrResearch28 = gamePhase28 === 'drafting' || gamePhase28 === 'research'
        || gamePhase28 === 'initial_drafting' || gamePhase28 === 'corporationsDrafting';
    } else {
      // Fallback: heuristics, but exclude blue-card action selection
      var hasBlueAction = false;
      selectCards.forEach(function(sec) {
        if (sec.querySelector('.card-content--blue, .blue-action, .card-content-wrapper[class*="blue"]')) hasBlueAction = true;
      });
      isDraftOrResearch28 = !hasBlueAction && (isResearchPhase || (!myCorp && scored.length <= 10));
    }

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

        if (!badge.hasAttribute('data-tm-original')) {
          badge.setAttribute('data-tm-original', badge.textContent);
          badge.setAttribute('data-tm-orig-tier', origTier);
        }

        const newTier = updateBadgeScore(badge, origTier, origScore, item.total);

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

      // Inline overlay — only during draft/research
      var oldOverlay = item.el.querySelector('.tm-inline-overlay');
      if (oldOverlay) oldOverlay.remove();
      if (!isDraftOrResearch28) return;
      item.el.appendChild(renderCardOverlay(item, scored));
    });

    // Deny toast: alert when a non-best card is a strong deny pick
    if (isDraftOrResearch28) {
      var gen28 = detectGeneration();
      for (var di = 0; di < scored.length; di++) {
        var dItem = scored[di];
        if (dItem.total >= bestScore - 5) continue; // skip top picks
        for (var ri = 0; ri < dItem.reasons.length; ri++) {
          if (dItem.reasons[ri].indexOf('\u2702') === 0 && canShowToast('deny', gen28 + '-' + dItem.name)) {
            showToast(dItem.reasons[ri] + ': ' + dItem.name, 'deny');
            break;
          }
        }
      }
    }
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

        // Corp+prelude and prelude+prelude combos (single pass)
        if (typeof TM_COMBOS !== 'undefined') {
          for (var ci = 0; ci < TM_COMBOS.length; ci++) {
            var combo = TM_COMBOS[ci];
            if (myCorp) {
              var matchCount = 0;
              if (combo.cards.includes(myCorp)) matchCount++;
              if (combo.cards.includes(p1)) matchCount++;
              if (combo.cards.includes(p2)) matchCount++;
              if (matchCount >= 2) pairScore += combo.r === 'godmode' ? 20 : combo.r === 'great' ? 12 : combo.r === 'good' ? 6 : 2;
            }
            if (combo.cards.includes(p1) && combo.cards.includes(p2)) {
              pairScore += combo.r === 'godmode' ? 15 : combo.r === 'great' ? 10 : combo.r === 'good' ? 5 : 2;
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
        showToast('Лучшая пара: ' + name1 + ' + ' + name2 + ' (счёт: ' + bestPairScore + ')', 'great');
      }
    }
  }


  // VP Engine detection — finds cards with vpAcc in a player's tableau
  function detectVPEngines(tableau, gensLeft) {
    if (!tableau || typeof TM_CARD_EFFECTS === 'undefined') return [];
    var engines = [];
    for (var i = 0; i < tableau.length; i++) {
      var cn = tableau[i].name || tableau[i];
      var fx = TM_CARD_EFFECTS[cn];
      if (!fx || !fx.vpAcc) continue;
      var rate = fx.vpAcc; // VP per gen (action)
      var resources = tableau[i].resources || 0;
      var perVP = fx.vpPer || 1; // resources per VP
      var currentVP = Math.floor(resources / perVP);
      var projectedVP = currentVP + Math.floor((rate * gensLeft) / perVP);
      var threat = rate < 0.7 ? 'green' : rate <= 1.5 ? 'yellow' : 'red';
      engines.push({ name: cn, rate: rate, perVP: perVP, resources: resources, currentVP: currentVP, projectedVP: projectedVP, threat: threat });
    }
    engines.sort(function(a, b) { return b.projectedVP - a.projectedVP; });
    return engines;
  }



  // Draft history tracking
  const draftHistory = []; // [{round, offered: [{name, total, tier}], taken: string|null, passed: [...]}]
  let lastDraftSet = new Set();
  let lastDraftScores = {}; // name → {total, tier, reasons}
  let lastDraftIsDraft = false; // true only for real draft, not card-play selection


  // Click listener to capture which draft card was clicked
  var _lastClickedDraftCard = null;
  document.addEventListener('click', function(e) {
    var cardEl = e.target.closest(SEL_DRAFT);
    if (cardEl && lastDraftIsDraft) {
      _lastClickedDraftCard = cardEl.getAttribute('data-tm-card');
    }
  }, true); // capture phase

  function recordDraftPick(taken, passed) {
    var offeredWithScores = Array.from(lastDraftSet).map(function(n) {
      var sc = lastDraftScores[n];
      var d = TM_RATINGS[n];
      return { name: n, total: sc ? sc.total : (d ? d.s : 0), tier: sc ? sc.tier : (d ? d.t : '?'), baseTier: d ? d.t : '?', baseScore: d ? d.s : 0, reasons: sc ? sc.reasons : [] };
    });
    offeredWithScores.sort(function(a, b) { return b.total - a.total; });
    draftHistory.push({ round: draftHistory.length + 1, offered: offeredWithScores, taken: taken, passed: passed });
  }

  function trackDraftHistory() {
    var selectCards = document.querySelectorAll(SEL_DRAFT);
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
          recordDraftPick(taken, passed);
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
        recordDraftPick(taken2, passed2);
      }
      _lastClickedDraftCard = null;
    }

    lastDraftSet = currentSet;
    lastDraftIsDraft = isDraft;
  }


  // ── Helpers for computePlayPriorities ──

  // Requirement feasibility: returns {penalty, unplayable, reasons[]}
  function computeReqPriority(cardEl, pv, ctx) {
    var result = { penalty: 0, unplayable: false, reasons: [] };
    if (!cardEl || !pv || !pv.game) return result;
    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return result;

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
      var tmM = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM = reqText.match(/(\d+)\s*%?\s*O/i);
      var vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
      if (tmM && typeof gTemp === 'number' && gTemp > parseInt(tmM[1]) + reqBonus * 2) result.unplayable = true;
      if (oxM && typeof gOxy === 'number' && gOxy > parseInt(oxM[1]) + reqBonus) result.unplayable = true;
      if (vnM && gVenus != null && gVenus > parseInt(vnM[1]) + reqBonus * 2) result.unplayable = true;
    } else {
      var tmM2 = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM2 = reqText.match(/(\d+)\s*%?\s*O/i);
      var ocM2 = reqText.match(/(\d+)\s*ocean/i);
      var vnM2 = reqText.match(/(\d+)\s*%?\s*Venus/i);

      var maxGap = 0;
      if (tmM2 && typeof gTemp === 'number') { var need = parseInt(tmM2[1]) - reqBonus * 2; var gap = (need - gTemp) / 2; if (gap > maxGap) maxGap = gap; }
      if (oxM2 && typeof gOxy === 'number') { var need2 = parseInt(oxM2[1]) - reqBonus; var gap2 = need2 - gOxy; if (gap2 > maxGap) maxGap = gap2; }
      if (ocM2 && typeof gOceans === 'number') { var need3 = parseInt(ocM2[1]); var gap3 = need3 - gOceans; if (gap3 > maxGap) maxGap = gap3; }
      if (vnM2 && gVenus != null) { var need4 = parseInt(vnM2[1]) - reqBonus * 2; var gap4 = (need4 - gVenus) / 2; if (gap4 > maxGap) maxGap = gap4; }

      if (maxGap > 0) {
        result.penalty += Math.min(SC.ppReqGapCap, Math.round(maxGap * SC.ppReqGapMul));
        if (maxGap <= 1) result.reasons.push('Req почти (' + Math.ceil(maxGap) + ' подн.)');
        else result.reasons.push('Req далеко (' + Math.ceil(maxGap) + ' подн.)');
      }

      // Tag-based requirements
      var tagReqM = reqText.match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i);
      if (tagReqM) {
        var tagReqCount = parseInt(tagReqM[1]);
        var tagReqName = tagReqM[2].toLowerCase();
        // Use tagsWithHand for real gap (can you play it soon?), tagsProjected to soften penalty
        var realCount = (ctx && ctx.tagsWithHand) ? (ctx.tagsWithHand[tagReqName] || 0) : ((ctx && ctx.tags) ? (ctx.tags[tagReqName] || 0) : 0);
        var projCount = (ctx && ctx.tagsProjected) ? (ctx.tagsProjected[tagReqName] || 0) : realCount;
        var tagGap = tagReqCount - realCount;
        if (tagGap > 0) {
          var projGap = Math.max(0, tagReqCount - projCount);
          // If projected says we'll get there, soften penalty by 50%
          var penaltyMul = (projGap <= 0) ? 0.5 : 1.0;
          result.penalty += Math.round(Math.min(SC.ppTagReqCap, tagGap * SC.ppTagReqMul) * penaltyMul);
          result.reasons.push('Нужно ' + tagGap + ' ' + tagReqName + ' тег(ов)' + (projGap <= 0 ? ' (прогноз ок)' : ''));
        }
      }
    }

    if (result.unplayable) {
      result.penalty += SC.ppUnplayable;
      result.reasons.push('Нельзя сыграть!');
    }
    return result;
  }

  // Blue card actions from tableau — returns scored items array
  function scoreBlueActions(tableauCards, pv, paramMaxed) {
    var scored = [];
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var myTi = tp ? (tp.titanium || 0) : 0;

    for (var ti = 0; ti < tableauCards.length; ti++) {
      var tName = tableauCards[ti];
      var tData = TM_RATINGS[tName];
      if (!tData) continue;
      var tEcon = (tData.e || '').toLowerCase();
      if (!tEcon.includes('action') && !tEcon.includes('действие')) continue;

      var aPriority = 45;
      var aReasons = [];
      var aMCValue = 0;

      var fx = getFx(tName);
      if (fx) {
        if (fx.actMC) { aMCValue += fx.actMC; if (fx.actMC > 0) aReasons.push('+' + fx.actMC + ' MC'); }
        if (fx.actTR) { var trVal = fx.actTR * 7.2; aMCValue += trVal; aReasons.push('+' + fx.actTR + ' TR (~' + Math.round(trVal) + ' MC)'); }
        if (fx.actCD) { aMCValue += fx.actCD * 3.5; aReasons.push('+' + fx.actCD + ' карт'); }
        if (fx.actOc && !paramMaxed.oceans) { aMCValue += 18; aReasons.push('Океан!'); }
        if (fx.vpAcc) { aMCValue += fx.vpAcc * 5; aReasons.push('+' + fx.vpAcc + ' VP'); }
      }

      if (!fx) {
        if (tEcon.includes('vp') || tEcon.includes('вп')) { aPriority += 10; aMCValue += 5; aReasons.push('VP действие'); }
        if (tEcon.includes('microbe') || tEcon.includes('микроб') || tEcon.includes('animal') || tEcon.includes('животн') || tEcon.includes('floater') || tEcon.includes('флоатер')) { aPriority += 5; aMCValue += 3; aReasons.push('Ресурс'); }
        if (tEcon.includes('mc') && (tEcon.includes('gain') || tEcon.includes('получ'))) { aPriority += 8; aMCValue += 4; aReasons.push('MC'); }
      }

      var isVenusAction = tEcon.includes('venus') || tEcon.includes('венер') || tEcon.includes('флоатер') || tEcon.includes('floater');
      if (isVenusAction && paramMaxed.venus) {
        if (fx && fx.actTR) aMCValue -= fx.actTR * 7.2;
        aPriority -= 20;
        aReasons.push('Venus max!');
      }

      if ((tEcon.includes('titanium') || tEcon.includes('титан')) && myTi < 1) {
        aPriority -= 15;
        aReasons.push('Нет титана');
      }

      aPriority += Math.min(20, Math.round(aMCValue * 1.5));
      scored.push({ name: '⚡ ' + tName, priority: aPriority, reasons: aReasons, tier: tData.t || '?', score: tData.s || 0, type: 'action', mcValue: aMCValue });
    }
    return scored;
  }

  // ── Standard conversion actions (heat/plants/trade) ──

  function scoreStandardActions(tp, pv, ctx, saturation) {
    var items = [];
    var plantCost = SC.plantsPerGreenery;
    var myCorpsP = detectMyCorps();
    if (myCorpsP.indexOf('EcoLine') !== -1) plantCost = SC.plantsPerGreenery - 1;
    var myHeat = tp.heat || 0;
    var myPlants = tp.plants || 0;

    // Heat → Temperature (1 TR = 7.2 MC)
    if (myHeat >= SC.heatPerTR && !saturation.temp) {
      var heatConvs = Math.floor(myHeat / SC.heatPerTR);
      var heatReasons = heatConvs > 1 ? [myHeat + ' heat (' + heatConvs + 'x)'] : [myHeat + ' heat'];
      items.push({ name: '🔥 Тепло → Темп', priority: 35, reasons: heatReasons, tier: '-', score: 0, type: 'standard', mcValue: 7.2 });
    }

    // Plants → Greenery (1 TR if oxy not maxed + VP)
    if (myPlants >= plantCost) {
      var greenMC = saturation.oxy ? 4 : 11;
      var greenPrio = saturation.oxy ? 20 : 25;
      items.push({ name: '🌿 Озеленение', priority: greenPrio, reasons: [myPlants + ' растений' + (saturation.oxy ? ', O₂ max' : '')], tier: '-', score: 0, type: 'standard', mcValue: greenMC });
    }

    // Trade action (if fleets available) — with colony value breakdown
    if (ctx && ctx.tradesLeft > 0 && pv.game && pv.game.colonies) {
      var colReasons = [ctx.tradesLeft + ' флот(ов)'];
      var bestColVal = 0, bestColName = '';
      // Trade value in MC equivalent (tracks from TM_COLONY_DATA × resource MC value)
      var RESOURCE_MC = { steel: 2, titanium: 3, plants: 1.5, energy: 1, heat: 0.5, MC: 1, microbes: 2, animals: 5, floaters: 2, cards: 3.5 };
      var COLONY_TRADE_MC = {};
      if (typeof TM_COLONY_DATA !== 'undefined') {
        for (var _ck in TM_COLONY_DATA) {
          COLONY_TRADE_MC[_ck] = { track: TM_COLONY_DATA[_ck].track, res: TM_COLONY_DATA[_ck].res };
        }
      }
      for (var ci = 0; ci < pv.game.colonies.length; ci++) {
        var col = pv.game.colonies[ci];
        if (!col.isActive && col.isActive !== undefined) continue;
        if (col.visitor) continue; // already traded this gen
        var colData = COLONY_TRADE_MC[col.name];
        var pos = Math.min(col.trackPosition || 0, colData ? colData.track.length - 1 : 0);
        var rawVal = colData ? colData.track[pos] : 3;
        var resMC = colData ? (RESOURCE_MC[colData.res] || 1) : 1;
        var val = Math.round(rawVal * resMC);
        // Bonus for having colony here (colony bonus per trade)
        var myColor = tp.color;
        var myColonies = (col.colonies || []).filter(function(c) { return c === myColor; }).length;
        val += myColonies * 2;
        if (val > bestColVal) { bestColVal = val; bestColName = col.name + ' (' + rawVal + ' ' + (colData ? colData.res : '?') + ')'; }
      }
      if (bestColName) colReasons.push('Лучшая: ' + bestColName + ' ~' + bestColVal + ' MC');
      items.push({ name: '🚀 Торговля', priority: 40, reasons: colReasons, tier: '-', score: 0, type: 'standard', mcValue: Math.max(8, bestColVal) });
    }

    // Milestone claiming — always top priority if claimable
    if (pv.game && pv.game.milestones && tp && (tp.megaCredits || 0) >= 8) {
      var claimedMs = 0;
      pv.game.milestones.forEach(function(ms) {
        if (ms.owner_name || ms.owner_color) claimedMs++;
      });
      if (claimedMs < 3) {
        // Use evaluateMilestone from tm-brain if available, or check scores from API
        pv.game.milestones.forEach(function(ms) {
          if (ms.owner_name || ms.owner_color) return; // already claimed
          if (ms.scores) {
            var myMsScore = 0, msThr = ms.threshold || 0;
            for (var msi = 0; msi < ms.scores.length; msi++) {
              if (ms.scores[msi].color === tp.color) myMsScore = ms.scores[msi].score;
            }
            if (msThr > 0 && myMsScore >= msThr) {
              items.push({ name: '⭐ ' + ms.name, priority: 80, reasons: ['5 VP за 8 MC!', myMsScore + '/' + msThr], tier: '-', score: 0, type: 'standard', mcValue: 32 });
            }
          }
        });
      }
    }

    // Award funding advisor — analyze each unfunded award
    if (pv.game && pv.game.awards && tp) {
      var myColor = tp.color;
      var fundedCount = 0;
      var fundCosts = [8, 14, 20];
      pv.game.awards.forEach(function(aw) {
        if (aw.funder_name || aw.funder_color || (aw.scores && aw.scores.some(function(s) { return s.claimable; }))) fundedCount++;
      });
      // Check funded count from cache too
      if (_fundedAwardsCache.awards) fundedCount = Math.max(fundedCount, _fundedAwardsCache.awards.size);
      if (fundedCount < 3) {
        var fundCost = fundCosts[Math.min(fundedCount, 2)];
        if ((tp.megaCredits || 0) >= fundCost) {
          pv.game.awards.forEach(function(aw) {
            if (!aw.scores || aw.scores.length === 0) return;
            var isFunded = _fundedAwardsCache.awards && _fundedAwardsCache.awards.has(aw.name);
            if (isFunded) return;
            var myScore = 0, bestOpp = 0;
            for (var si = 0; si < aw.scores.length; si++) {
              if (aw.scores[si].color === myColor) myScore = aw.scores[si].score;
              else bestOpp = Math.max(bestOpp, aw.scores[si].score);
            }
            if (myScore <= 0) return;
            var lead = myScore - bestOpp;
            var vpExpected = lead > 0 ? 5 : lead === 0 ? 3.5 : lead >= -2 ? 2 : 0;
            var ev = vpExpected * 8 - fundCost; // VP in MC equivalent minus cost
            if (ev > 0 && lead >= -2) {
              var prio = lead > 0 ? 30 : 20;
              var awReasons = [myScore + ' vs ' + bestOpp + (lead > 0 ? ' лидер' : lead === 0 ? ' равны' : ' −' + Math.abs(lead))];
              awReasons.push(fundCost + ' MC, EV ' + Math.round(ev) + ' MC');
              items.push({ name: '🏆 ' + aw.name, priority: prio, reasons: awReasons, tier: '-', score: 0, type: 'standard', mcValue: ev });
            }
          });
        }
      }
    }

    return items;
  }

  // Shared play priority scorer — used by panel and hand sort
  function computePlayPriorities() {
    const handCards = getMyHandNames();
    if (handCards.length === 0) return [];

    const gen = detectGeneration();
    const pv = getPlayerVueData();
    const gensLeft = estimateGensLeft(pv);
    const ctx = getCachedPlayerContext();
    const myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    const myTableau = getMyTableauNames();

    // Pre-build name→element map (avoids O(N²) querySelector in discount loop)
    const handElMap = new Map();
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      handElMap.set(el.getAttribute('data-tm-card'), el);
    });

    const scored = [];
    for (const name of handCards) {
      const data = TM_RATINGS[name];
      if (!data) { scored.push({ name, priority: SC.ppBase, reasons: [], tier: '?', score: 0 }); continue; }

      let priority = SC.ppBase;
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
        priority += gensLeft * SC.ppProdMul;
        reasons.push('Продукция');
      }

      // Action cards: play early for more activations
      if (econ.includes('action') || when.includes('action')) {
        priority += gensLeft * SC.ppActionMul;
        reasons.push('Действие');
      }

      // Discount sources: play before expensive cards
      if (CARD_DISCOUNTS[name]) {
        var expensiveInHand = 0;
        for (var hi = 0; hi < handCards.length; hi++) {
          if (handCards[hi] === name) continue;
          var hEl = handElMap.get(handCards[hi]);
          if (hEl) { var hCost = getCardCost(hEl); if (hCost !== null && hCost >= 12) expensiveInHand++; }
        }
        if (expensiveInHand > 0) {
          priority += expensiveInHand * SC.ppDiscountMul;
          reasons.push('Скидка → ' + expensiveInHand + ' карт');
        }
      }

      // TR cards: moderate priority
      if (econ.includes('tr') && !econ.includes('prod')) {
        priority += SC.ppTrBoost;
        reasons.push('TR');
      }

      // Cards that enable other hand cards (synergy prereqs)
      let enablesOthers = 0;
      for (const other of handCards) {
        if (other === name) continue;
        const od = TM_RATINGS[other];
        if (od && od.y && od.y.some(function(e) { return yName(e) === name; })) enablesOthers++;
      }
      if (enablesOthers > 0) {
        priority += enablesOthers * SC.ppEnablesMul;
        reasons.push('Активирует ' + enablesOthers);
      }

      // Cards that need other hand cards — play after
      let needsOthers = 0;
      if (data.y) {
        for (const entry of data.y) {
          if (handCards.includes(yName(entry))) needsOthers++;
        }
      }
      if (needsOthers > 0) {
        priority -= needsOthers * SC.ppNeedsMul;
        reasons.push('После синергии');
      }

      // VP-only: low priority (no ongoing value until game end)
      if (econ.includes('vp') && !econ.includes('prod') && !econ.includes('action')) {
        priority -= gensLeft * SC.ppVpMul;
        reasons.push('Только VP');
      }

      // Affordability: can't afford now = lower priority
      var cardEl = handElMap.get(name);
      if (cardEl) {
        var cardCost = getCardCost(cardEl);
        if (cardCost !== null && cardCost > myMC) {
          priority -= Math.min(SC.ppAffordCap, Math.round((cardCost - myMC) / SC.ppAffordDiv));
          reasons.push('Дорого (' + cardCost + ' MC)');
        }
      }

      // Requirement feasibility
      var reqResult = computeReqPriority(cardEl, pv, ctx);
      var reqUnplayable = reqResult.unplayable;
      priority -= reqResult.penalty;
      for (var rqi = 0; rqi < reqResult.reasons.length; rqi++) reasons.push(reqResult.reasons[rqi]);

      scored.push({ name, priority, reasons, tier: data.t || '?', score: data.s || 0, type: 'play', mcValue: cardMCValue > 0 ? cardMCValue : 0, unplayable: reqUnplayable });
    }

    // ── Global params for saturation checks ──
    var _tempMaxed = false, _oxyMaxed = false, _venusMaxed = false, _oceansMaxed = false;
    if (pv && pv.game) {
      _tempMaxed = typeof pv.game.temperature === 'number' && pv.game.temperature >= SC.tempMax;
      _oxyMaxed = typeof pv.game.oxygenLevel === 'number' && pv.game.oxygenLevel >= SC.oxyMax;
      _venusMaxed = pv.game.venusScaleLevel != null && pv.game.venusScaleLevel >= SC.venusMax;
      _oceansMaxed = typeof pv.game.oceans === 'number' && pv.game.oceans >= SC.oceansMax;
    }

    // ── Blue card actions from tableau ──
    var tableauCards = getMyTableauNames();
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var saturation = { temp: _tempMaxed, oxy: _oxyMaxed, venus: _venusMaxed, oceans: _oceansMaxed };
    var blueActions = scoreBlueActions(tableauCards, pv, saturation);
    for (var bai = 0; bai < blueActions.length; bai++) scored.push(blueActions[bai]);

    // Standard conversion actions: heat/plants/trade
    if (tp) {
      var stdActions = scoreStandardActions(tp, pv, ctx, saturation);
      for (var sai = 0; sai < stdActions.length; sai++) scored.push(stdActions[sai]);
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored;
  }


  // ── Play Priority Badges + Hand Sort ──
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
    _applyPriorityBadges(SEL_HAND);

    // Also apply to card selection dialogs (when choosing card to play)
    _applyPriorityBadges(SEL_DRAFT);
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

      // Store priority for sorting (badge removed)

      // Store priority for sorting
      el.setAttribute('data-tm-priority', info.priority);
    });
  }

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
          if (myTableau.includes(yName(data.y[j]))) synCount++;
        }
      }
      for (var j = 0; j < myTableau.length; j++) {
        var td = TM_RATINGS[myTableau[j]];
        if (td && td.y && td.y.some(function(e) { return yName(e) === name; })) synCount++;
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
        if (hd && hd.y && hd.y.some(function(e) { return yName(e) === name; })) handSyn++;
        if (data.y && data.y.some(function(e) { return yName(e) === handCards[j]; })) handSyn++;
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
      if (myCorp && data.y && data.y.some(function(e) { return yName(e) === myCorp; })) {
        keepScore += 5;
        keepReasons.push('корп.');
      }

      // Corp-specific boosts via unified getCorpBoost()
      // Iterate ALL corps (Two Corps / Merger support)
      var allCorpsHand = ctx && ctx._myCorps ? ctx._myCorps : (myCorp ? [myCorp] : []);
      if (data.e && cardEls.length > 0) {
        var cTags = getCardTags(cardEls[0]);
        var cType = 'green';
        if (cardEls[0].querySelector('.card-content--blue, .blue-action, [class*="blue"]')) cType = 'blue';
        var cbOpts2 = { eLower: data.e.toLowerCase(), cardTags: cTags, cardCost: cardCost, cardType: cType, cardName: name, ctx: ctx };
        for (var hci = 0; hci < allCorpsHand.length; hci++) {
          var hcCorp = allCorpsHand[hci];
          var cb = getCorpBoost(hcCorp, cbOpts2);
          if (cb !== 0) {
            keepScore += cb;
            keepReasons.push(hcCorp.split(' ')[0] + ' ' + (cb > 0 ? '+' : '') + cb);
          }
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
  // Known corp names for initial draft detection (canonical source: TM_CORPS)
  var _knownCorps = typeof TM_CORPS !== 'undefined' ? new Set(Object.keys(TM_CORPS)) : new Set();

  // Debug: validate ALL hardcoded names against canonical sources
  (function() {
    // Corp names → TM_CORPS
    if (typeof TM_CORPS !== 'undefined') {
      var corpMaps = { CORP_DISCOUNTS: CORP_DISCOUNTS, CORP_ABILITY_SYNERGY: CORP_ABILITY_SYNERGY };
      for (var mapName in corpMaps) {
        for (var k in corpMaps[mapName]) {
          if (!TM_CORPS[k]) tmWarn('init', mapName + ' key "' + k + '" not in TM_CORPS');
        }
      }
    }
    // Card names → TM_RATINGS (canonical card list)
    if (typeof TM_RATINGS !== 'undefined') {
      var cardMaps = { CARD_DISCOUNTS: CARD_DISCOUNTS, TAG_TRIGGERS: TAG_TRIGGERS, TAKE_THAT_CARDS: TAKE_THAT_CARDS };
      for (var cm in cardMaps) {
        for (var ck in cardMaps[cm]) {
          if (!TM_RATINGS[ck] && !(_knownCorps.has && _knownCorps.has(ck))) {
            tmWarn('init', cm + ' key "' + ck + '" not in TM_RATINGS');
          }
        }
      }
      var cardSets = { ANIMAL_TARGETS: ANIMAL_TARGETS, MICROBE_TARGETS: MICROBE_TARGETS, FLOATER_TARGETS: FLOATER_TARGETS };
      for (var cs in cardSets) {
        cardSets[cs].forEach(function(val) {
          if (!TM_RATINGS[val] && !(_knownCorps.has && _knownCorps.has(val))) {
            tmWarn('init', cs + ' "' + val + '" not in TM_RATINGS');
          }
        });
      }
      // TM_CARD_EFFECTS keys → TM_RATINGS
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        for (var ce in TM_CARD_EFFECTS) {
          if (!TM_RATINGS[ce]) tmWarn('init', 'TM_CARD_EFFECTS key "' + ce + '" not in TM_RATINGS');
        }
      }
      // TM_COMBOS card names → TM_RATINGS or TM_CORPS (colonies are valid non-card names)
      if (typeof TM_COMBOS !== 'undefined') {
        var _colonyNames = { 'Pluto Colony':1, 'Luna Colony':1, 'Enceladus Colony':1, 'Miranda Colony':1,
          'Titan Colony':1, 'Ceres Colony':1, 'Ganymede Colony':1, 'Callisto Colony':1, 'Europa Colony':1,
          'Io Colony':1, 'Triton Colony':1 };
        for (var cbi = 0; cbi < TM_COMBOS.length; cbi++) {
          var combo = TM_COMBOS[cbi];
          for (var cbj = 0; cbj < combo.cards.length; cbj++) {
            var cn = combo.cards[cbj];
            if (!TM_RATINGS[cn] && !(_knownCorps.has && _knownCorps.has(cn)) && !_colonyNames[cn]) {
              tmWarn('init', 'TM_COMBOS[' + cbi + '] card "' + cn + '" not in TM_RATINGS/TM_CORPS');
            }
          }
        }
      }
    }
  })();

  // ── Invalidate stale frozen scores on game change / opponent tableau change ──

  function invalidateStaleScores() {
    var pvf = getPlayerVueData();
    var curGameId = pvf && pvf.game ? (pvf.game.id || '') : '';
    if (curGameId && curGameId !== _frozenGameId) {
      frozenScores.clear();
      _frozenGameId = curGameId;
      _oppTableauSizes = {};
    }
    if (pvf && pvf.game && pvf.game.players && pvf.thisPlayer) {
      var myCol = pvf.thisPlayer.color;
      for (var opi = 0; opi < pvf.game.players.length; opi++) {
        var opp = pvf.game.players[opi];
        if (opp.color === myCol) continue;
        var newSize = opp.tableau ? opp.tableau.length : 0;
        var oldSize = _oppTableauSizes[opp.color] || 0;
        if (newSize !== oldSize) {
          _oppTableauSizes[opp.color] = newSize;
          var prefix = 'opp:' + opp.color + ':';
          frozenScores.forEach(function(v, k) {
            if (k.indexOf(prefix) === 0) frozenScores.delete(k);
          });
          if (_oppCtxCache[opp.color]) delete _oppCtxCache[opp.color];
        }
      }
    }
  }

  function updateHandScores() {
    if (!enabled) return;
    // Score ALL visible cards with badges — hand, draft, selection, any context
    var allCards = document.querySelectorAll('.card-container[data-tm-card]');
    if (allCards.length === 0) return;

    var myCorp = detectMyCorp();
    var myTableau = getMyTableauNames();
    var myHand = getMyHandWithDrafted(); // includes already-drafted cards this gen
    var ctx = getCachedPlayerContext();
    // Pre-cache allMyCards in ctx for scoreDraftCard
    enrichCtxForScoring(ctx, myTableau, myHand);

    // During initial draft (no corp): detect offered corps from visible cards
    var offeredCorps = [];
    var gen = detectGeneration();

    // Reset frozen scores on new game + invalidate stale opponent scores
    invalidateStaleScores();

    if (!myCorp && gen <= 1) {
      allCards.forEach(function(el) {
        var cn = resolveCorpName(el.getAttribute('data-tm-card'));
        if (cn && _knownCorps.has(cn)) {
          offeredCorps.push(cn);
        }
      });
    }

    // Collect other visible card names for inter-card synergy
    var visibleNames = [];
    allCards.forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && !_knownCorps.has(cn) && !_knownCorps.has(resolveCorpName(cn))) visibleNames.push(cn);
    });

    allCards.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var data = TM_RATINGS[name];
      if (!data) return;
      // Skip corp cards (they don't need context scoring)
      if (_knownCorps.has(name) || _knownCorps.has(resolveCorpName(name))) return;

      // Tableau cards (already played): freeze score in JS Map, survives DOM re-renders
      var isInTableau = !!el.closest('.player_home_block--cards, .player_home_block--tableau, .cards-wrapper');

      // Detect opponent card for tableau scoring
      var cardOpp = null;
      if (isInTableau) {
        cardOpp = detectCardOwner(name);
      }

      if (isInTableau) {
        // Use color-prefixed key for opponent cards to avoid collisions
        var frozenKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        var frozen = frozenScores.get(frozenKey);
        if (frozen) {
          // Restore from cache — don't re-score
          badge.innerHTML = frozen.html;
          badge.className = frozen.className;
          if (frozen.reasons) el.setAttribute('data-tm-reasons', frozen.reasons);
          if (frozen.dimClass) el.classList.add('tm-dim'); else el.classList.remove('tm-dim');
          return;
        }
      }

      var result;
      if (cardOpp) {
        // Opponent tableau card: score from their perspective
        result = scoreFromOpponentPerspective(name, cardOpp, el, getPlayerVueData());
      } else if (!myCorp && offeredCorps.length > 0) {
        result = scoreCardAgainstCorps(name, el, myTableau, visibleNames, offeredCorps, myCorp, ctx);
      } else {
        result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      }

      var newTier = updateBadgeScore(badge, data.t, data.s, result.total, cardOpp ? ' tm-opp-badge' : '');

      // Sync tm-dim with adjusted tier
      if (newTier === 'D' || newTier === 'F') {
        el.classList.add('tm-dim');
      } else {
        el.classList.remove('tm-dim');
      }

      if (result.reasons.length > 0) {
        el.setAttribute('data-tm-reasons', result.reasons.join('|'));
      }

      // Freeze tableau card score in JS Map (survives DOM re-renders)
      if (isInTableau) {
        var fKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        frozenScores.set(fKey, {
          html: badge.innerHTML,
          className: badge.className,
          reasons: result.reasons.length > 0 ? result.reasons.join('|') : '',
          dimClass: newTier === 'D' || newTier === 'F'
        });
      }
    });
  }

  function injectDiscardHints() {
    if (!enabled) return;
    var advice = getDiscardAdvice();
    if (!advice || advice.length < 6) return;

    // Mark bottom 2-3 cards in hand with discard hint — only if score < C55
    var threshold = advice.length >= 8 ? 3 : 2;
    var discardSet = new Set();
    for (var i = Math.max(0, advice.length - threshold); i < advice.length; i++) {
      if (advice[i].keepScore !== undefined && advice[i].keepScore >= 55) continue; // don't mark C+ cards
      discardSet.add(advice[i].name);
    }

    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      // Remove old hints
      var oldHint = el.querySelector('.tm-discard-hint');
      if (oldHint) oldHint.remove();

      if (discardSet.has(name)) {
        var hint = document.createElement('div');
        hint.className = 'tm-discard-hint';
        hint.textContent = '📤 продать';
        hint.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:9px;color:#ff9800;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;z-index:5;pointer-events:none';
        el.style.position = 'relative';
        el.appendChild(hint);
      }
    });
  }


  // (updateActionReminder removed in v52 — dead code, no callers)

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
      }
      // Gen summary toast (skip gen 1)
      if (lastTrackedGen > 0 && canShowToast('gen', gen)) {
        var pvGen = getPlayerVueData();
        if (pvGen && pvGen.thisPlayer) {
          var p = pvGen.thisPlayer;
          var tr = p.terraformRating || 0;
          var cards = p.playedCards ? p.playedCards.length : 0;
          var mc = p.megaCredits || 0;
          showToast('Gen ' + gen + ' | TR ' + tr + ' | ' + cards + ' карт | ' + mc + ' MC', 'gen');
        }
      }
      genStartTime = Date.now();
      lastTrackedGen = gen;
      resetToastKeys();

      // Opponent lead warning
      var pvLead = getPlayerVueData();
      if (pvLead && pvLead.thisPlayer && pvLead.game && pvLead.game.players) {
        var myTR = pvLead.thisPlayer.terraformRating || 0;
        var oppLeader = null, oppMaxTR = 0;
        for (var oli = 0; oli < pvLead.game.players.length; oli++) {
          var opl = pvLead.game.players[oli];
          if (opl.color === pvLead.thisPlayer.color) continue;
          var oplTR = opl.terraformRating || 0;
          if (oplTR > oppMaxTR) { oppMaxTR = oplTR; oppLeader = opl.name; }
        }
        if (oppLeader && oppMaxTR > myTR + 5) {
          showToast(oppLeader + ' лидирует: TR ' + oppMaxTR + ' (ты ' + myTR + ', −' + (oppMaxTR - myTR) + ')', 'info');
        }
      }

      // Hand bloat warning
      var pvHand = pvLead || getPlayerVueData();
      if (pvHand && pvHand.thisPlayer) {
        var handSize = pvHand.thisPlayer.cardsInHandNbr || 0;
        var gl = estimateGensLeft(pvHand);
        if (handSize > gl * 4 + 2 && gl <= 3) {
          showToast(handSize + ' карт в руке, ~' + gl + ' ген(ов) — не успеешь сыграть все', 'info');
        }
      }

      // Game Logger: snapshot at new generation start
      logSnapshot(gen);
    }
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


  // ── Playable Card Highlight ──


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

  function getEffectiveCost(cost, tags, discounts) {
    var d = discounts['_all'] || 0;
    tags.forEach(function(t) { d += discounts[t] || 0; });
    return Math.max(0, cost - d);
  }

  // ── Lightweight playable/unplayable highlight ──
  var _lastPlayableCheck = 0;

  function highlightPlayable() {
    var now = Date.now();
    if (now - _lastPlayableCheck < 2000) return;
    _lastPlayableCheck = now;

    // Clear old classes
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach(function(el) {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    var p = pv.thisPlayer;
    var mc = p.megaCredits || 0;
    var steel = p.steel || 0, steelVal = p.steelValue || SC.defaultSteelVal;
    var ti = p.titanium || 0, tiVal = p.titaniumValue || SC.defaultTiVal;
    var heat = p.heat || 0;
    // Helion: heat as MC
    var isHelion = false;
    if (p.tableau) {
      for (var i = 0; i < p.tableau.length; i++) {
        if (((p.tableau[i].name || '') + '').toLowerCase() === 'helion') { isHelion = true; break; }
      }
    }
    var heatMC = isHelion ? heat : 0;

    // Discount-aware: apply corp/card discounts from cached context
    var ctx = getCachedPlayerContext();
    var discounts = (ctx && ctx.discounts) ? ctx.discounts : {};

    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var cost = getCardCost(el);
      if (cost == null) return;
      var tags = getCardTags(el);
      var effectiveCost = getEffectiveCost(cost, tags, discounts);
      var bp = mc + heatMC;
      if (tags.has('building')) bp += steel * steelVal;
      if (tags.has('space')) bp += ti * tiVal;
      // Check global requirements (unplayable even if affordable)
      var reqMet = true;
      var cardName = el.getAttribute('data-tm-card');
      if (cardName && typeof TM_CARD_GLOBAL_REQS !== 'undefined') {
        var greq = TM_CARD_GLOBAL_REQS[cardName];
        if (greq && pv.game) {
          var gp = { oxy: pv.game.oxygenLevel, temp: pv.game.temperature, oceans: pv.game.oceans, venus: pv.game.venusScaleLevel };
          var pm = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
          for (var rk in pm) {
            if (greq[rk]) {
              var cv = gp[pm[rk]];
              if (cv == null) continue;
              if (greq[rk].max != null && cv > greq[rk].max) reqMet = false;
              if (greq[rk].min != null && cv < greq[rk].min) reqMet = false;
            }
          }
        }
      }
      // Check tag requirements
      if (reqMet && cardName && typeof TM_CARD_TAG_REQS !== 'undefined') {
        var treq = TM_CARD_TAG_REQS[cardName];
        if (treq) {
          var myTags = (ctx && ctx.tags) ? ctx.tags : {};
          for (var tk in treq) {
            if (typeof treq[tk] === 'object') continue;
            if ((myTags[tk] || 0) < treq[tk]) { reqMet = false; break; }
          }
        }
      }
      if (bp >= effectiveCost && reqMet) {
        el.classList.add('tm-playable');
      } else {
        el.classList.add('tm-unplayable');
      }
    });
  }

  // ── Debug Panel ──

  var debugPanelEl = null;
  var debugFilterCat = 'all';
  var _debugPanelInterval = null;

  function buildDebugPanel() {
    if (debugPanelEl) return debugPanelEl;
    debugPanelEl = document.createElement('div');
    debugPanelEl.className = 'tm-debug-panel';
    debugPanelEl.innerHTML =
      '<div class="tm-debug-header">' +
        '<span class="tm-debug-title">Debug</span>' +
        '<div class="tm-debug-filters">' +
          '<button class="tm-debug-filter-btn tm-debug-filter-active" data-cat="all">all</button>' +
          '<button class="tm-debug-filter-btn" data-cat="score">score</button>' +
          '<button class="tm-debug-filter-btn" data-cat="perf">perf</button>' +
          '<button class="tm-debug-filter-btn" data-cat="api">api</button>' +
          '<button class="tm-debug-filter-btn" data-cat="ctx">ctx</button>' +
          '<button class="tm-debug-filter-btn" data-cat="vp">vp</button>' +
          '<button class="tm-debug-filter-btn" data-cat="storage">storage</button>' +
        '</div>' +
        '<button class="tm-debug-clear-btn" title="Clear">\u2715</button>' +
      '</div>' +
      '<div class="tm-debug-log"></div>';
    document.body.appendChild(debugPanelEl);

    // Filter buttons
    debugPanelEl.addEventListener('click', function(e) {
      var btn = e.target.closest('.tm-debug-filter-btn');
      if (btn) {
        debugFilterCat = btn.getAttribute('data-cat');
        debugPanelEl.querySelectorAll('.tm-debug-filter-btn').forEach(function(b) { b.classList.remove('tm-debug-filter-active'); });
        btn.classList.add('tm-debug-filter-active');
        renderDebugLog();
        return;
      }
      if (e.target.closest('.tm-debug-clear-btn')) {
        _debugLog = [];
        renderDebugLog();
      }
    });

    return debugPanelEl;
  }

  function renderDebugLog() {
    if (!debugPanelEl) return;
    var logDiv = debugPanelEl.querySelector('.tm-debug-log');
    if (!logDiv) return;
    var entries = debugFilterCat === 'all' ? _debugLog : _debugLog.filter(function(e) { return e.cat === debugFilterCat; });
    var html = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var ts = new Date(e.t);
      var timeStr = ('0' + ts.getHours()).slice(-2) + ':' + ('0' + ts.getMinutes()).slice(-2) + ':' + ('0' + ts.getSeconds()).slice(-2);
      var dataStr = e.data !== undefined ? ' ' + (typeof e.data === 'object' ? JSON.stringify(e.data) : String(e.data)) : '';
      html += '<div class="tm-debug-entry tm-debug-cat-' + e.cat + '">' +
        '<span class="tm-debug-time">' + timeStr + '</span> ' +
        '<span class="tm-debug-cat">[' + e.cat + ']</span> ' +
        e.msg + dataStr +
      '</div>';
    }
    logDiv.innerHTML = html;
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function updateDebugPanel() {
    if (!debugMode) {
      if (debugPanelEl) debugPanelEl.style.display = 'none';
      if (_debugPanelInterval) { clearInterval(_debugPanelInterval); _debugPanelInterval = null; }
      return;
    }
    var panel = buildDebugPanel();
    panel.style.display = 'flex';
    renderDebugLog();
    // Auto-refresh every 1s
    if (!_debugPanelInterval) {
      _debugPanelInterval = setInterval(renderDebugLog, 1000);
    }
  }

  // ── VP Breakdown (used by post-game insights, card stats) ──

  function computeVPBreakdown(player, pv) {
    var bp = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };
    if (!player) return bp;

    var vb = player.victoryPointsBreakdown;
    if (vb && vb.total > 0) {
      bp.tr = vb.terraformRating || 0;
      bp.greenery = vb.greenery || 0;
      bp.city = vb.city || 0;
      bp.cards = vb.victoryPoints || 0;
      bp.milestones = vb.milestones || 0;
      bp.awards = vb.awards || 0;
      bp.total = vb.total;
      return bp;
    }

    bp.tr = player.terraformRating || 0;
    var pColor = player.color;

    if (pv && pv.game && pv.game.spaces) {
      for (var i = 0; i < pv.game.spaces.length; i++) {
        var sp = pv.game.spaces[i];
        if (sp.color === pColor) {
          if (isGreeneryTile(sp.tileType)) bp.greenery++;
          if (isCityTile(sp.tileType)) bp.city++;
        }
      }
    }

    if (player.tableau) {
      for (var i = 0; i < player.tableau.length; i++) {
        var card = player.tableau[i];
        if (card.victoryPoints !== undefined && card.victoryPoints !== 0) {
          if (typeof card.victoryPoints === 'number') bp.cards += card.victoryPoints;
          else if (card.victoryPoints && typeof card.victoryPoints.points === 'number') bp.cards += card.victoryPoints.points;
        }
        if (card.resources && card.resources > 0) {
          var cn = cardN(card);
          var fx = getFx(cn);
          if (fx && fx.vpAcc) {
            var perVP = fx.vpPer || 1;
            bp.cards += Math.floor(card.resources / perVP);
          }
        }
      }
    }

    if (pv && pv.game && pv.game.milestones) {
      for (var i = 0; i < pv.game.milestones.length; i++) {
        var ms = pv.game.milestones[i];
        if (ms.color === pColor || ms.playerColor === pColor) bp.milestones += 5;
      }
    }

    if (pv && pv.game && pv.game.awards) {
      for (var i = 0; i < pv.game.awards.length; i++) {
        var aw = pv.game.awards[i];
        if (!(aw.playerName || aw.color)) continue;
        if (!aw.scores || aw.scores.length < 2) continue;
        var sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        var myEntry = sorted.find(function(s) { return s.color === pColor; });
        if (!myEntry) continue;
        var myRank = sorted.findIndex(function(s) { return s.color === pColor; });
        if (myRank === 0) bp.awards += 5;
        else if (myRank === 1) bp.awards += 2;
        if (myRank > 0 && sorted[0].score === myEntry.score) bp.awards = bp.awards - 2 + 5;
      }
    }

    bp.total = bp.tr + bp.greenery + bp.city + bp.cards + bp.milestones + bp.awards;
    return bp;
  }


  var _hotkeyHelpEl = null;

  function showHotkeyHelp() {
    if (_hotkeyHelpEl) { hideHotkeyHelp(); return; }
    _hotkeyHelpEl = document.createElement('div');
    _hotkeyHelpEl.className = 'tm-hotkey-help';
    _hotkeyHelpEl.innerHTML =
      '<div class="tm-hotkey-help-inner">' +
      '<h3>Горячие клавиши</h3>' +
      '<table>' +
      '<tr><td><kbd>1-4</kbd></td><td>Выбрать карту в драфте</td></tr>' +
      '<tr><td><kbd>L</kbd></td><td>Game Log</td></tr>' +
      '<tr><td><kbd>Shift+L</kbd></td><td>Export JSON</td></tr>' +
      '<tr><td><kbd>Shift+D</kbd></td><td>Debug</td></tr>' +
      '<tr><td><kbd>?</kbd></td><td>Эта справка</td></tr>' +
      '<tr><td><kbd>Esc</kbd></td><td>Закрыть</td></tr>' +
      '</table>' +
      '</div>';
    document.body.appendChild(_hotkeyHelpEl);
  }

  function hideHotkeyHelp() {
    if (_hotkeyHelpEl) { _hotkeyHelpEl.remove(); _hotkeyHelpEl = null; }
  }

  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    // Don't intercept system combos
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.code === 'Escape') {
      if (_hotkeyHelpEl) { hideHotkeyHelp(); e.preventDefault(); return; }
      if (logPanelVisible) { toggleLogPanel(); e.preventDefault(); return; }
      return;
    }

    // Shift combos
    if (e.shiftKey) {
      if (e.code === 'KeyL') { exportGameLog(); e.preventDefault(); return; }
      if (e.code === 'KeyD') {
        debugMode = !debugMode;
        savePanelState();
        if (debugMode) { tmLog('init', 'Debug mode ON, v2.0'); showToast('Debug ON', 'info'); }
        else { _debugLog = []; showToast('Debug OFF', 'info'); }
        updateDebugPanel();
        e.preventDefault();
        return;
      }
      if (e.key === '?') { showHotkeyHelp(); e.preventDefault(); return; }
      return;
    }

    // Draft card quick-select: 1-4 during active draft
    if (e.code >= 'Digit1' && e.code <= 'Digit4') {
      var draftCards = document.querySelectorAll(SEL_DRAFT);
      if (draftCards.length > 0 && lastDraftIsDraft) {
        var idx = parseInt(e.code.charAt(5)) - 1;
        // Get cards sorted by score (same order as panel)
        var sorted = Array.from(draftCards).map(function(el) {
          var n = el.getAttribute('data-tm-card');
          var sc = lastDraftScores[n];
          return { el: el, name: n, score: sc ? sc.total : 0 };
        }).sort(function(a, b) { return b.score - a.score; });
        if (idx < sorted.length) {
          sorted[idx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sorted[idx].el.classList.add('tm-draft-flash');
          setTimeout(function() { sorted[idx].el.classList.remove('tm-draft-flash'); }, 700);
          sorted[idx].el.click();
          showToast('#' + (idx + 1) + ' ' + sorted[idx].name, 'info');
          e.preventDefault();
        }
        return;
      }
    }

    // Single-key hotkeys (no shift)
    switch (e.code) {
      case 'KeyL': toggleLogPanel(); break;
      default:
        return; // don't preventDefault for unhandled keys
    }
    e.preventDefault();
  });

  // ══════════════════════════════════════════════════════════════
  // GAME LOGGER — полное логирование игры для пост-анализа
  // ══════════════════════════════════════════════════════════════

  const gameLog = {
    active: false,
    playerId: null,       // player/spectator ID for API calls
    gameId: null,         // Game ID (из player ID: p→g)
    gameOptions: null,    // Настройки игры (один раз при init)
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
      // Derive game ID from player ID (pXXX → gXXX)
      if (gameLog.playerId) {
        gameLog.gameId = gameLog.playerId.replace(/^p/, 'g');
      }
    } catch (e) { /* no ID */ }

    // All players info
    if (pv.players) {
      gameLog.players = pv.players.map(function (p) {
        // Corp = first card in tableau with no cost (heuristic)
        var corp = null;
        if (p.tableau && p.tableau.length > 0) {
          corp = cardN(p.tableau[0]);
        }
        return { name: p.name, color: p.color, corp: corp, isMe: p.color === gameLog.myColor };
      });
    }

    // Map & game options
    if (pv.game.gameOptions) {
      gameLog.map = pv.game.gameOptions.boardName || null;
      gameLog.gameOptions = {
        boardName: pv.game.gameOptions.boardName || null,
        venusNext: !!pv.game.gameOptions.venusNextExtension,
        colonies: !!pv.game.gameOptions.coloniesExtension,
        turmoil: !!pv.game.gameOptions.turmoilExtension,
        prelude: !!pv.game.gameOptions.preludeExtension,
        prelude2: !!pv.game.gameOptions.prelude2Extension,
        promos: !!pv.game.gameOptions.promoCardsOption,
        draft: !!pv.game.gameOptions.draftVariant,
        timers: !!pv.game.gameOptions.showTimers,
        solarPhase: !!pv.game.gameOptions.solarPhaseOption,
        escapeVelocity: pv.game.gameOptions.escapeVelocityMode || null,
        evThreshold: pv.game.gameOptions.escapeVelocityThreshold || null,
        evPeriod: pv.game.gameOptions.escapeVelocityPeriod || null,
        evPenalty: pv.game.gameOptions.escapeVelocityPenalty || null,
        twoCorp: !!pv.game.gameOptions.twoCorpsVariant
      };
    }

    // First snapshot
    logSnapshot(gen);

  }

  var _lastSnapshotTime = 0;

  // Build colony state for snapshot
  function buildColonySnap(colonies) {
    var result = [];
    for (var ci = 0; ci < colonies.length; ci++) {
      var col = colonies[ci];
      var entry = {
        name: col.name,
        trackPosition: col.trackPosition != null ? col.trackPosition : 0,
        visitor: col.visitor || null,
        colonists: {}
      };
      if (col.colonies) {
        for (var cci = 0; cci < col.colonies.length; cci++) {
          var cPlayer = col.colonies[cci].player || col.colonies[cci];
          entry.colonists[cPlayer] = (entry.colonists[cPlayer] || 0) + 1;
        }
      }
      result.push(entry);
    }
    return result;
  }

  // Compute opponent tableau/production diffs vs previous generation
  function buildOpponentDiffs(snap, prevSnap, myColor) {
    var diffs = {};
    Object.keys(snap.players).forEach(function(color) {
      if (color === myColor) return;
      var curTab = snap.players[color].tableau;
      var prevTab = prevSnap.players[color] ? prevSnap.players[color].tableau : [];
      var newCards = curTab.filter(function(c) { return prevTab.indexOf(c) === -1; });
      var prev = prevSnap.players[color] || {};
      diffs[color] = {
        played: newCards,
        trDelta: snap.players[color].tr - (prev.tr || 0),
        deltas: {
          mcProd: snap.players[color].mcProd - (prev.mcProd || 0),
          steelProd: snap.players[color].steelProd - (prev.steelProd || 0),
          tiProd: snap.players[color].tiProd - (prev.tiProd || 0),
          plantProd: snap.players[color].plantProd - (prev.plantProd || 0),
          energyProd: snap.players[color].energyProd - (prev.energyProd || 0),
          heatProd: snap.players[color].heatProd - (prev.heatProd || 0)
        }
      };
    });
    return diffs;
  }

  // ── Milestone/Award scores mapper (DRY) ──

  function mapMAScores(scores) {
    if (!scores || scores.length === 0) return undefined;
    var out = {};
    for (var si = 0; si < scores.length; si++) {
      out[scores[si].color] = scores[si].playerScore != null
        ? scores[si].playerScore : (scores[si].score || 0);
    }
    return out;
  }

  // ── Freeze card scores for snapshot ──

  function freezeCardScores(snap, gen) {
    // My cards: freeze with DOM badge
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
    // Opponent cards: freeze base scores only
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

    // Collect scores: frozen as primary, DOM badge as fallback
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
  }

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
      milestones: (pv.game.milestones || []).map(function (m) {
        var entry = { name: m.name, claimed: !!(m.playerName || m.playerColor), claimant: m.playerName || m.playerColor || null };
        var sc = mapMAScores(m.scores);
        if (sc) entry.scores = sc;
        return entry;
      }),
      awards: (pv.game.awards || []).map(function (a) {
        var entry = { name: a.name, funded: !!(a.playerName || a.color), funder: a.playerName || a.playerColor || null };
        var sc = mapMAScores(a.scores);
        if (sc) entry.scores = sc;
        return entry;
      }),
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
        tableau: (p.tableau || []).map(cardN),
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

    // Freeze card scores + collect from DOM
    freezeCardScores(snap, gen);

    // Colony state
    if (pv.game && pv.game.colonies) {
      snap.colonies = buildColonySnap(pv.game.colonies);
    }

    // Board summary: cities/greeneries per player
    if (pv.game && pv.game.playerTiles) {
      snap.boardSummary = {};
      var colors = Object.keys(pv.game.playerTiles);
      for (var bsi = 0; bsi < colors.length; bsi++) {
        snap.boardSummary[colors[bsi]] = {
          cities: pv.game.playerTiles[colors[bsi]].cities || 0,
          greeneries: pv.game.playerTiles[colors[bsi]].greeneries || 0
        };
      }
    }

    // Timer data per player
    snap.timers = {};
    pv.players.forEach(function (p) {
      if (p.timer) {
        snap.timers[p.color] = p.timer.sumMs || 0;
      }
    });

    // Compute opponent tableau diffs vs previous generation
    var prevGenNum = gen - 1;
    var prevGd = gameLog.generations[prevGenNum];
    if (prevGd && prevGd.snapshot) {
      snap.opponentDiffs = buildOpponentDiffs(snap, prevGd.snapshot, gameLog.myColor);
    }

    // Per-player generation stats
    snap.genStats = {};
    Object.keys(snap.players).forEach(function(color) {
      var cur = snap.players[color];
      var prev = prevGd && prevGd.snapshot && prevGd.snapshot.players[color] ? prevGd.snapshot.players[color] : null;
      snap.genStats[color] = {
        cardsPlayed: prev ? cur.tableau.length - prev.tableau.length : cur.tableau.length,
        trGrowth: prev ? cur.tr - prev.tr : 0
      };
    });

    // Debug-enriched snapshot data
    if (debugMode) {
      // Scoring breakdown from frozen scores + badges
      snap.scoring = {};
      for (var sk in gameLog.frozenCardScores) {
        if (sk.indexOf(':') === -1) {
          var fs = gameLog.frozenCardScores[sk];
          snap.scoring[sk] = { score: fs.score, base: fs.baseScore, tier: fs.baseTier, gen: fs.gen };
        }
      }
      snap.perfMs = _lastProcessAllMs;
      tmLog('game', 'Snapshot gen=' + gen + ' players=' + Object.keys(snap.players).length);
    }

    if (!gameLog.generations[gen]) gameLog.generations[gen] = {};
    gameLog.generations[gen].snapshot = snap;
    gameLog.lastSnapshotGen = gen;
    _lastSnapshotTime = Date.now();

    // Autosave to localStorage every snapshot
    autoSaveGameLog();
  }

  function cleanupLocalStorage() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('tm-gamelog-') === 0) keys.push(k);
      }
      if (keys.length <= 5) return;
      // Sort by startTime (newest first), fall back to key name
      keys.sort(function(a, b) {
        try {
          var da = JSON.parse(localStorage.getItem(a));
          var db = JSON.parse(localStorage.getItem(b));
          return (db.startTime || 0) - (da.startTime || 0);
        } catch(e) { return 0; }
      });
      // Remove oldest, keep 5 newest
      for (var j = 5; j < keys.length; j++) {
        localStorage.removeItem(keys[j]);
      }
      tmLog('storage', 'Cleaned up localStorage: removed ' + (keys.length - 5) + ' old game logs');
    } catch(e) { tmWarn('storage', 'cleanupLocalStorage failed', e); }
  }

  function autoSaveGameLog() {
    if (!gameLog.active) return;
    var key = 'tm-gamelog-' + (gameLog.playerId || 'unknown');
    var exportData = buildExportData();
    var payload = JSON.stringify(exportData);
    // Warn if log is very large
    if (payload.length > 1048576) {
      tmWarn('storage', 'Game log is > 1 MB (' + Math.round(payload.length / 1024) + ' KB)');
    }
    try {
      localStorage.setItem(key, payload);
    } catch (e) {
      // QuotaExceededError — cleanup and retry once
      tmWarn('storage', 'localStorage quota exceeded, cleaning up', e);
      cleanupLocalStorage();
      try { localStorage.setItem(key, payload); }
      catch (e2) { tmWarn('storage', 'localStorage save failed after cleanup', e2); }
    }
    // Also save to chrome.storage for popup stats (v4 format)
    safeStorage(function(storage) {
      var csKey = 'gamelog_' + (exportData.gameId || exportData.playerId || 'unknown');
      var obj = {};
      obj[csKey] = exportData;
      storage.local.set(obj);
    });
  }

  function buildExportData() {
    var pv = getPlayerVueData();
    var data = {
      version: 4,
      exportTime: new Date().toISOString(),
      startTime: gameLog.startTime,
      playerId: gameLog.playerId,
      gameId: gameLog.gameId || null,
      gameOptions: gameLog.gameOptions || null,
      myColor: gameLog.myColor,
      myCorp: gameLog.myCorp,
      players: gameLog.players,
      map: gameLog.map,
      endGen: Math.max.apply(null, Object.keys(gameLog.generations).map(Number).concat([0])),
      gameDuration: Date.now() - gameLog.startTime,
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
          cards: vb ? vb.victoryPoints : 0,
          vpByGen: p.victoryPointsByGeneration || null
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

    // Timer data
    if (pv && pv.players) {
      data.timers = {};
      pv.players.forEach(function (p) {
        if (p.timer) {
          data.timers[p.color] = p.timer.sumMs || 0;
        }
      });
    }

    return data;
  }

  var downloadJson = TM_UTILS.downloadJson;

  function exportGameLog() {
    // Final snapshot before export
    var gen = detectGeneration();
    logSnapshot(gen);

    var data = buildExportData();
    var genCount = Object.keys(gameLog.generations).length;
    var draftCount = draftHistory.length;

    downloadJson(data, 'tm-game-gen' + gen + '-' + new Date().toISOString().slice(0, 10) + '.json');
    showToast('Лог экспортирован: ' + genCount + ' пок., ' + draftCount + ' драфтов', 'great');
  }

  // ── Log Panel UI ──

  function buildLogPanel() {
    if (logPanelEl) return logPanelEl;
    logPanelEl = document.createElement('div');
    logPanelEl.className = 'tm-log-panel';
    document.body.appendChild(logPanelEl);
    return logPanelEl;
  }

  var logPanelTab = 'history'; // 'history' | 'draft'

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
    if (logPanelTab === 'history') {
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


  // ── Quick adjusted score for history tab cards ──

  function quickAdjustScore(c, gensLeft, snapTableau) {
    var rd = TM_RATINGS[c];
    if (!rd) return { adj: 0, parts: [] };
    var adj = 0;
    var parts = [];
    var gl = gensLeft;

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
      if (Math.abs(ta) >= 1) { adj += ta; parts.push((isPP ? 'прод.' : '') + 'тайм ' + (ta > 0 ? '+' : '') + ta); }
    } else if (rd.e) {
      // Crude timing without FTN
      var el2 = rd.e.toLowerCase();
      var isP = /prod|прод/.test(el2);
      var isV = /vp|вп/.test(el2);
      if (gl <= 1 && isP && !isV) { adj -= 15; parts.push('поздн.прод -15'); }
      else if (gl <= 2 && isP && !isV) { adj -= 10; parts.push('поздн.прод -10'); }
      if (gl >= 5 && isP) { adj += 3; parts.push('ранн.прод +3'); }
      if (gl <= 1 && isV && !isP) { adj += 8; parts.push('VP burst +8'); }
      else if (gl <= 2 && isV && !isP) { adj += 5; parts.push('поздн.VP +5'); }
      var isAct = /action|действие/.test(el2);
      if (gl <= 1 && isAct && !isV) { adj -= 10; parts.push('поздн.act -10'); }
      else if (gl <= 2 && isAct && !isV) { adj -= 5; parts.push('поздн.act -5'); }
    }

    // Corp synergy
    var myCorps3 = detectMyCorps();
    for (var ci3 = 0; ci3 < myCorps3.length; ci3++) {
      var cc = myCorps3[ci3];
      if (rd.y && rd.y.some(function(s) { var n = yName(s); return n === cc || n.indexOf(cc) !== -1; })) {
        adj += 8; parts.push(cc.split(' ')[0] + ' +8');
      }
      var crd = TM_RATINGS[cc];
      if (crd && crd.y && crd.y.some(function(e) { return yName(e) === c; })) {
        adj += 5; parts.push(cc.split(' ')[0] + ' нужна +5');
      }
    }

    // Tableau synergy (max +9)
    var synC = 0;
    for (var ti3 = 0; ti3 < snapTableau.length && synC < 3; ti3++) {
      if (rd.y && rd.y.indexOf(snapTableau[ti3]) !== -1) synC++;
      else { var td3 = TM_RATINGS[snapTableau[ti3]]; if (td3 && td3.y && td3.y.indexOf(c) !== -1) synC++; }
    }
    if (synC > 0) { adj += synC * 3; parts.push(synC + ' синерг. +' + (synC * 3)); }

    return { adj: adj, parts: parts };
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
              var ctx2 = getCachedPlayerContext();
              var gl = ctx2 ? ctx2.gensLeft : 1;
              var tab3 = (snap.players[gameLog.myColor] || {}).tableau || [];
              parts.push(newCards.map(function (c) {
                var rd = TM_RATINGS[c];
                if (!rd) return ruName(c);
                var qa = quickAdjustScore(c, gl, tab3);
                var adjTotal = rd.s + qa.adj;
                var adjTier = scoreToTier(adjTotal);
                var tc = tierColor(adjTier);
                if (qa.adj !== 0) {
                  var sign3 = qa.adj > 0 ? '+' : '';
                  return ruName(c) + ' <span style="color:' + tc + '" title="' + qa.parts.join(', ') + '">' + rd.t + rd.s + '\u2192' + adjTier + adjTotal + ' <span style="font-size:9px">' + sign3 + qa.adj + '</span></span>';
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
      updateLogPanel();
    } else {
      if (logPanelEl) logPanelEl.style.display = 'none';
    }
  }

  // Listen for export button click (from inline onclick → CustomEvent)
  document.addEventListener('tm-export-log', function () {
    exportGameLog();
  });

  // ── Game End Stats ──

  // ── Dynamic Card Ratings — personal stats ──

  var _cardStatsCache = null;

  function loadCardStats(callback) {
    if (_cardStatsCache) { callback(_cardStatsCache); return; }
    safeStorage(function(s) {
      s.local.get({ tm_card_stats: { cards: {} } }, function(r) {
        _cardStatsCache = r.tm_card_stats;
        callback(_cardStatsCache);
      });
    });
  }

  function saveCardStats(stats) {
    _cardStatsCache = stats;
    safeStorage(function(s) {
      s.local.set({ tm_card_stats: stats });
    });
  }

  function recordGameStats() {
    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.players) return;

    var myColor = pv.thisPlayer.color;
    var myBP = computeVPBreakdown(pv.thisPlayer, pv);

    // Determine if we won
    var iWon = true;
    for (var i = 0; i < pv.players.length; i++) {
      if (pv.players[i].color !== myColor) {
        var oppBP = computeVPBreakdown(pv.players[i], pv);
        if (oppBP.total > myBP.total) { iWon = false; break; }
      }
    }

    // Detect game context
    var hasColonies = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.coloniesExtension);
    var hasTurmoil = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.turmoilExtension);
    var hasVenus = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.venusNextExtension);
    var hasWGT = !!(pv.game && pv.game.gameOptions && (pv.game.gameOptions.solarPhaseOption || pv.game.gameOptions.worldGovernmentTerraforming));
    var endGen = detectGeneration();

    loadCardStats(function(stats) {
      if (!stats || !stats.cards) stats = { cards: {} };
      var myTableau = pv.thisPlayer.tableau || [];
      for (var i = 0; i < myTableau.length; i++) {
        var cn = myTableau[i].name || myTableau[i];
        if (!cn) continue;

        // Card VP estimation
        var cardVP = 0;
        if (myTableau[i].victoryPoints !== undefined) {
          if (typeof myTableau[i].victoryPoints === 'number') cardVP = myTableau[i].victoryPoints;
          else if (myTableau[i].victoryPoints && typeof myTableau[i].victoryPoints.points === 'number') cardVP = myTableau[i].victoryPoints.points;
        }
        if (myTableau[i].resources && myTableau[i].resources > 0) {
          var fx = getFx(cn);
          if (fx && fx.vpAcc) {
            var perVP = fx.vpPer || 1;
            cardVP += Math.floor(myTableau[i].resources / perVP);
          }
        }

        if (!stats.cards[cn]) {
          stats.cards[cn] = { timesPlayed: 0, totalVP: 0, maxVP: 0, wins: 0, losses: 0, genPlayedSum: 0, contexts: {} };
        }
        var cs = stats.cards[cn];
        cs.timesPlayed++;
        cs.totalVP += cardVP;
        if (cardVP > cs.maxVP) cs.maxVP = cardVP;
        if (iWon) cs.wins++;
        else cs.losses++;

        // Track gen played from frozen card scores
        var frozen = gameLog.active && gameLog.frozenCardScores[cn];
        if (frozen && frozen.gen) {
          if (!cs.genPlayedSum) cs.genPlayedSum = 0;
          cs.genPlayedSum += frozen.gen;
        }

        // Context tracking
        if (hasColonies) {
          if (!cs.contexts.withColonies) cs.contexts.withColonies = { count: 0, totalVP: 0 };
          cs.contexts.withColonies.count++;
          cs.contexts.withColonies.totalVP += cardVP;
        }
        if (hasTurmoil) {
          if (!cs.contexts.withTurmoil) cs.contexts.withTurmoil = { count: 0, totalVP: 0 };
          cs.contexts.withTurmoil.count++;
          cs.contexts.withTurmoil.totalVP += cardVP;
        }
        if (hasVenus) {
          if (!cs.contexts.withVenus) cs.contexts.withVenus = { count: 0, totalVP: 0 };
          cs.contexts.withVenus.count++;
          cs.contexts.withVenus.totalVP += cardVP;
        }
        if (hasWGT) {
          if (!cs.contexts.withWGT) cs.contexts.withWGT = { count: 0, totalVP: 0 };
          cs.contexts.withWGT.count++;
          cs.contexts.withWGT.totalVP += cardVP;
        }
      }

      saveCardStats(stats);
      tmLog('game', 'Card stats recorded for ' + myTableau.length + ' cards');
    });
  }

  let gameEndNotified = false;
  var _postGameInsightsEl = null;

  function generatePostGameInsights(pv) {
    if (!pv || !pv.thisPlayer || !pv.players) return null;
    var gen = detectGeneration();
    var myColor = pv.thisPlayer.color;
    var myBP = computeVPBreakdown(pv.thisPlayer, pv);
    var opponents = pv.players.filter(function(p) { return p.color !== myColor; });
    var insights = [];

    // Find winner
    var allBPs = [{ name: pv.thisPlayer.name || 'Я', color: myColor, bp: myBP, isMe: true }];
    for (var i = 0; i < opponents.length; i++) {
      allBPs.push({ name: opponents[i].name || opponents[i].color, color: opponents[i].color, bp: computeVPBreakdown(opponents[i], pv), isMe: false });
    }
    allBPs.sort(function(a, b) { return b.bp.total - a.bp.total; });
    var winner = allBPs[0];
    var iWon = winner.isMe;
    var vpDiff = iWon ? (allBPs.length > 1 ? myBP.total - allBPs[1].bp.total : 0) : allBPs[0].bp.total - myBP.total;

    // 1. M&A gap analysis
    var myMAVP = myBP.milestones + myBP.awards;
    var bestOppMAVP = 0;
    for (var i2 = 0; i2 < allBPs.length; i2++) {
      if (!allBPs[i2].isMe) {
        var oppMA = allBPs[i2].bp.milestones + allBPs[i2].bp.awards;
        if (oppMA > bestOppMAVP) bestOppMAVP = oppMA;
      }
    }
    var maGap = myMAVP - bestOppMAVP;
    if (Math.abs(maGap) >= 5) {
      insights.push({ icon: '🏆', text: 'M&A gap: ' + (maGap >= 0 ? '+' : '') + maGap + ' VP' + (Math.abs(maGap) >= 10 ? ' — решающий фактор!' : ''), color: maGap > 0 ? '#2ecc71' : '#e74c3c' });
    }

    // 2. VP engines of opponents
    for (var i3 = 0; i3 < opponents.length; i3++) {
      if (opponents[i3].tableau) {
        var engines = detectVPEngines(opponents[i3].tableau, estimateGensLeft(pv));
        if (engines.length > 0) {
          var totalEVP = 0;
          for (var ei = 0; ei < engines.length; ei++) totalEVP += engines[ei].projectedVP;
          if (totalEVP >= 8) {
            insights.push({ icon: '⚙', text: (opponents[i3].name || opponents[i3].color) + ': VP engines ~' + totalEVP + ' VP', color: '#bb86fc' });
          }
        }
      }
    }

    // 3. Game length analysis
    var lengthStr = gen <= 7 ? 'Быстрая игра (' + gen + ' пок.)' : gen <= 9 ? 'Стандартная (' + gen + ' пок.)' : 'Длинная игра (' + gen + ' пок.)';
    insights.push({ icon: '⏱', text: lengthStr, color: '#3498db' });

    // 4. Biggest VP diff category
    if (allBPs.length >= 2) {
      var cats = ['tr', 'greenery', 'city', 'cards', 'milestones', 'awards'];
      var catLabels = { tr: 'TR', greenery: 'Озеленение', city: 'Города', cards: 'Карты', milestones: 'Вехи', awards: 'Награды' };
      var biggestLoss = null, biggestWin = null;
      for (var ci = 0; ci < cats.length; ci++) {
        var bestOppCat = 0;
        for (var oi = 0; oi < allBPs.length; oi++) {
          if (!allBPs[oi].isMe && allBPs[oi].bp[cats[ci]] > bestOppCat) bestOppCat = allBPs[oi].bp[cats[ci]];
        }
        var diff = myBP[cats[ci]] - bestOppCat;
        if (!biggestLoss || diff < biggestLoss.diff) biggestLoss = { cat: catLabels[cats[ci]], diff: diff };
        if (!biggestWin || diff > biggestWin.diff) biggestWin = { cat: catLabels[cats[ci]], diff: diff };
      }
      if (biggestLoss && biggestLoss.diff < -3) {
        insights.push({ icon: '📉', text: 'Слабое место: ' + biggestLoss.cat + ' (' + biggestLoss.diff + ')', color: '#e74c3c' });
      }
      if (biggestWin && biggestWin.diff > 3) {
        insights.push({ icon: '📈', text: 'Сильная сторона: ' + biggestWin.cat + ' (+' + biggestWin.diff + ')', color: '#2ecc71' });
      }
    }

    // 5. Draft quality — how often player took the best-scored card
    if (draftHistory.length > 0) {
      var tookBest = 0;
      for (var dhi = 0; dhi < draftHistory.length; dhi++) {
        var dh = draftHistory[dhi];
        if (!dh.taken || !dh.offered || dh.offered.length === 0) continue;
        if (dh.offered[0].name === dh.taken) tookBest++;
      }
      var draftPct = Math.round(tookBest / draftHistory.length * 100);
      var draftColor = draftPct >= 70 ? '#2ecc71' : draftPct >= 50 ? '#f39c12' : '#e74c3c';
      insights.push({ icon: '🎯', text: 'Драфт: лучшую в ' + tookBest + '/' + draftHistory.length + ' раундов (' + draftPct + '%)', color: draftColor });
    }

    // 6. Corp synergy utilization — % of played cards synergizing with corp
    var myCorp6 = detectMyCorp();
    if (myCorp6 && pv.thisPlayer.tableau) {
      var synCount = 0;
      var corpData6 = TM_RATINGS[myCorp6];
      var corpYSet = new Set();
      if (corpData6 && corpData6.y) {
        for (var cyi = 0; cyi < corpData6.y.length; cyi++) corpYSet.add(corpData6.y[cyi][0]);
      }
      var tableau6 = pv.thisPlayer.tableau;
      for (var t6i = 0; t6i < tableau6.length; t6i++) {
        var cn6 = tableau6[t6i].name || tableau6[t6i];
        if (!cn6) continue;
        if (corpYSet.has(cn6)) { synCount++; continue; }
        var cd6 = TM_RATINGS[cn6];
        if (cd6 && cd6.y) {
          for (var y6i = 0; y6i < cd6.y.length; y6i++) {
            if (cd6.y[y6i][0] === myCorp6) { synCount++; break; }
          }
        }
      }
      if (tableau6.length > 0) {
        var synPct = Math.round(synCount / tableau6.length * 100);
        insights.push({ icon: '🔗', text: myCorp6.split(' ')[0] + ' синергия: ' + synCount + '/' + tableau6.length + ' карт (' + synPct + '%)', color: synPct >= 30 ? '#2ecc71' : '#f39c12' });
      }
    }

    // 7. Tempo analysis — TR leadership across generations
    if (gameLog.active && gameLog.myColor) {
      var genKeys = Object.keys(gameLog.generations);
      if (genKeys.length >= 3) {
        var leadGens = 0;
        for (var gki = 0; gki < genKeys.length; gki++) {
          var snap7 = gameLog.generations[genKeys[gki]];
          if (!snap7 || !snap7.snapshot || !snap7.snapshot.players) continue;
          var myTR = snap7.snapshot.players[gameLog.myColor] ? snap7.snapshot.players[gameLog.myColor].tr : 0;
          var maxOppTR = 0;
          for (var pc in snap7.snapshot.players) {
            if (pc !== gameLog.myColor && snap7.snapshot.players[pc].tr > maxOppTR) maxOppTR = snap7.snapshot.players[pc].tr;
          }
          if (myTR >= maxOppTR) leadGens++;
        }
        var tempoPct = Math.round(leadGens / genKeys.length * 100);
        var tempoColor = tempoPct >= 60 ? '#2ecc71' : tempoPct >= 40 ? '#f39c12' : '#e74c3c';
        insights.push({ icon: '📊', text: 'Темпо: лидер по TR в ' + leadGens + '/' + genKeys.length + ' пок. (' + tempoPct + '%)', color: tempoColor });
      }
    }

    // Summary sentence
    var summary = iWon
      ? 'Победа на ' + vpDiff + ' VP'
      : 'Проигрыш на ' + vpDiff + ' VP';
    if (Math.abs(maGap) >= 5) summary += ' — M&A gap ' + (maGap >= 0 ? '+' : '') + maGap + ' VP решил игру';

    return { insights: insights, summary: summary, iWon: iWon, myTotal: myBP.total, winner: winner, allBPs: allBPs };
  }

  function showPostGameInsights(pv) {
    var data = generatePostGameInsights(pv);
    if (!data) return;

    if (_postGameInsightsEl) _postGameInsightsEl.remove();
    _postGameInsightsEl = document.createElement('div');
    _postGameInsightsEl.className = 'tm-postgame-overlay';

    var html = '<div class="tm-postgame-inner">';
    html += '<div class="tm-postgame-title">' + (data.iWon ? '🎉 Победа!' : '😤 Поражение') + '</div>';
    html += '<div class="tm-postgame-summary" style="color:' + (data.iWon ? '#2ecc71' : '#e74c3c') + '">' + escHtml(data.summary) + '</div>';

    // Score table
    html += '<div style="margin:10px 0">';
    for (var i = 0; i < data.allBPs.length; i++) {
      var bp = data.allBPs[i];
      var rowColor = bp.isMe ? '#2ecc71' : '#aaa';
      var bgStyle = bp.isMe ? 'background:rgba(46,204,113,0.1);' : '';
      html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;font-size:13px;border-radius:3px;' + bgStyle + 'color:' + rowColor + '">';
      html += '<span style="font-weight:bold">' + escHtml(bp.name) + '</span>';
      html += '<span style="font-weight:bold">' + bp.bp.total + ' VP</span>';
      html += '</div>';
    }
    html += '</div>';

    // VP breakdown bars
    var vpCats = [
      { key: 'tr', label: 'TR', color: '#3498db' },
      { key: 'greenery', label: '\u041E\u0437\u0435\u043B\u0435\u043D\u0435\u043D\u0438\u0435', color: '#27ae60' },
      { key: 'city', label: '\u0413\u043E\u0440\u043E\u0434\u0430', color: '#95a5a6' },
      { key: 'cards', label: '\u041A\u0430\u0440\u0442\u044B', color: '#e67e22' },
      { key: 'milestones', label: '\u0412\u0435\u0445\u0438', color: '#f1c40f' },
      { key: 'awards', label: '\u041D\u0430\u0433\u0440\u0430\u0434\u044B', color: '#9b59b6' }
    ];
    var maxCatVP = 1;
    for (var vci = 0; vci < data.allBPs.length; vci++) {
      for (var vcj = 0; vcj < vpCats.length; vcj++) {
        var v = data.allBPs[vci].bp[vpCats[vcj].key] || 0;
        if (v > maxCatVP) maxCatVP = v;
      }
    }
    html += '<div style="margin:10px 0;font-size:12px">';
    html += '<div style="font-weight:bold;margin-bottom:6px;color:#ccc">VP Breakdown</div>';
    for (var vck = 0; vck < vpCats.length; vck++) {
      var cat = vpCats[vck];
      html += '<div style="margin-bottom:4px"><div style="color:#aaa;font-size:10px;margin-bottom:1px">' + cat.label + '</div>';
      for (var vcp = 0; vcp < data.allBPs.length; vcp++) {
        var bpEntry = data.allBPs[vcp];
        var catVal = bpEntry.bp[cat.key] || 0;
        var barW = Math.round(catVal / maxCatVP * 100);
        var barColor = bpEntry.isMe ? cat.color : '#555';
        html += '<div style="display:flex;align-items:center;gap:4px;height:14px">';
        html += '<span style="width:50px;font-size:10px;color:' + (bpEntry.isMe ? '#fff' : '#888') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(bpEntry.name.split(' ')[0]) + '</span>';
        html += '<div style="flex:1;background:#333;border-radius:2px;height:10px;overflow:hidden"><div style="width:' + barW + '%;height:100%;background:' + barColor + ';border-radius:2px;transition:width 0.3s"></div></div>';
        html += '<span style="width:24px;text-align:right;font-size:10px;color:' + (bpEntry.isMe ? '#fff' : '#888') + '">' + catVal + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Insights
    for (var i2 = 0; i2 < data.insights.length; i2++) {
      var ins = data.insights[i2];
      html += '<div style="font-size:13px;color:' + ins.color + ';padding:3px 0">' + ins.icon + ' ' + escHtml(ins.text) + '</div>';
    }

    html += '<button class="tm-postgame-close">Закрыть</button>';
    html += '</div>';

    _postGameInsightsEl.innerHTML = html;
    document.body.appendChild(_postGameInsightsEl);
    _postGameInsightsEl.querySelector('.tm-postgame-close').addEventListener('click', function() {
      if (_postGameInsightsEl) _postGameInsightsEl.remove();
    });
  }

  function checkGameEnd() {
    if (gameEndNotified) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;

    // Only trigger when game is truly over (phase === 'end'), not just parameters maxed
    if (pv.game.phase !== 'end') return;

    gameEndNotified = true;

    // Check if we already processed this game end (survives page reload)
    var gameId = (pv.game.id || pv.id || '').replace(/^[pg]/, '');
    var exportKey = 'tm_exported_' + gameId;
    var alreadyExported = false;
    try { alreadyExported = !!localStorage.getItem(exportKey); } catch(e) { /* localStorage may be disabled */ }

    // Skip everything if reopening a finished game — no toast, no overlay, no export
    if (alreadyExported) return;

    const gen = detectGeneration();
    const elapsed = Date.now() - gameStartTime;
    const p = pv.thisPlayer;
    const tr = p.terraformRating || 0;
    const cardsPlayed = p.tableau ? p.tableau.length : 0;
    const mins = Math.round(elapsed / 60000);
    showToast('Конец игры! Пок. ' + gen + ' | TR ' + tr + ' | ' + cardsPlayed + ' карт | ' + mins + ' мин', 'great');

    // Show Post-Game Insights overlay (delayed to let VP data settle)
    setTimeout(function() { showPostGameInsights(getPlayerVueData()); }, 4000);

    // Record card stats for Dynamic Ratings (Feature 6)
    setTimeout(function() { recordGameStats(); }, 5000);

    // Auto-export game log
    logSnapshot(gen);
    autoSaveGameLog();
    setTimeout(function () {
      var data = buildExportData();
      downloadJson(data, 'tm-game-gen' + gen + '-' + new Date().toISOString().slice(0, 10) + '.json');
      showToast('Лог игры экспортирован автоматически', 'great');
      try { localStorage.setItem(exportKey, '1'); } catch(e) { /* localStorage may be disabled */ }
    }, 2000);
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
    if (!_processingNow && _tabVisible) debouncedProcess();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Generation timer: update every second
  setInterval(function() {
    if (!_tabVisible) return;
    if (enabled) {
      updateGenTimer();
      checkGameEnd();
    }
  }, 1000);

  // Context-aware hand/draft scores: separate slow interval (not on every mutation)
  setInterval(function() {
    if (!_tabVisible) return;
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

  cleanupLocalStorage();
  processAll();

})();

// ═══════════════════════════════════════════════════════════════════
// Game Creation Auto-Fill — сохраняет и восстанавливает настройки
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STORAGE_KEY = 'tm_create_game_settings';

  var safeStorage = TM_UTILS.safeStorage;

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
            storage.local.set({ [STORAGE_KEY]: settings });
          });
        } catch(e) { console.debug('[TM CG] settings parse failed', e); }
      }
    }
    _lastCgEvent = ev;
  }

  var obs = new MutationObserver(function() {
    checkAutoSave();
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tm-cg-event'] });
})();
