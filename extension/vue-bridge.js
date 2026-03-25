// Vue Bridge: runs in MAIN world, reads game data and writes to DOM for content script
(function() {
  'use strict';

  var _debugLog = [];
  function dlog(msg) { _debugLog.push(Date.now() + ': ' + msg); if (_debugLog.length > 20) _debugLog.shift(); }

  var MAX_VUE_DEPTH = 30;
  var MAX_VNODE_DEPTH = 20;

  // Strategy 1: Walk Vue component tree
  function findPlayerViewVue() {
    var roots = ['#game', '#app', '#main', '[data-v-app]'];
    var vueRoot = null;
    var foundMethod = '';
    for (var i = 0; i < roots.length; i++) {
      var el = document.querySelector(roots[i]);
      if (!el) continue;
      if (el.__vue__) { vueRoot = el.__vue__; foundMethod = 'vue2:' + roots[i]; break; }
      if (el.__vue_app__) {
        var app = el.__vue_app__;
        if (app._instance && app._instance.proxy) { vueRoot = app._instance.proxy; foundMethod = 'vue3app:' + roots[i]; break; }
      }
      if (el._vnode && el._vnode.component) { vueRoot = el._vnode.component.proxy; foundMethod = 'vue3vnode:' + roots[i]; break; }
    }
    if (!vueRoot) return null;
    dlog('Vue root found via ' + foundMethod);

    function walk(vue, depth) {
      if (depth > MAX_VUE_DEPTH) return null;
      if (vue.playerView) return vue.playerView;
      if (vue.$data && vue.$data.playerView) return vue.$data.playerView;
      if (vue.player && vue.player.thisPlayer) return vue.player;
      if (vue.spectator && vue.spectator.players && vue.spectator.game) {
        var spec = vue.spectator;
        return { thisPlayer: spec.players[0], players: spec.players, game: spec.game, _isSpectator: true };
      }
      if (vue.$data && vue.$data.spectator && vue.$data.spectator.players) {
        var spec2 = vue.$data.spectator;
        return { thisPlayer: spec2.players[0], players: spec2.players, game: spec2.game, _isSpectator: true };
      }
      if (vue.$children) {
        for (var j = 0; j < vue.$children.length; j++) {
          var r = walk(vue.$children[j], depth + 1);
          if (r) return r;
        }
      }
      if (vue.$ && vue.$.subTree) {
        var walkVnode = function(vn, d2) {
          if (!vn || d2 > MAX_VNODE_DEPTH) return null;
          if (vn.component) {
            var proxy = vn.component.proxy;
            if (proxy) { var r2 = walk(proxy, depth + 1); if (r2) return r2; }
          }
          if (vn.children && Array.isArray(vn.children)) {
            for (var k = 0; k < vn.children.length; k++) {
              var r3 = walkVnode(vn.children[k], d2 + 1);
              if (r3) return r3;
            }
          }
          return null;
        };
        var found = walkVnode(vue.$.subTree, 0);
        if (found) return found;
      }
      return null;
    }
    return walk(vueRoot, 0);
  }

  // Strategy 2: Intercept fetch/XHR responses for API data
  var _apiData = null;
  var _apiTimestamp = 0;

  // ═══ Action Log: capture player decisions & waitingFor prompts ═══
  var _actionLog = [];
  var _actionLogSeq = 0;
  var _maxActionLogSize = 50; // keep last N events in DOM attr to avoid megabyte attrs

  // Compact waitingFor: strip card descriptions, keep only names/titles
  function compactWaitingFor(wf) {
    if (!wf) return null;
    var compact = { type: wf.type, title: wf.title || '' };
    if (wf.cards) {
      compact.cards = wf.cards.map(function(c) {
        return { name: c.name || c, cost: c.cost, tags: c.tags };
      });
    }
    if (wf.options) {
      compact.options = wf.options.map(function(o) {
        var co = { title: o.title || '', index: o.index };
        if (o.cards) co.cards = o.cards.map(function(c) { return { name: c.name || c, cost: c.cost, tags: c.tags }; });
        if (o.options) co.options = o.options.map(function(so) { return { title: so.title || '', index: so.index }; });
        if (o.colonies) co.colonies = o.colonies;
        return co;
      });
    }
    if (wf.min != null) compact.min = wf.min;
    if (wf.max != null) compact.max = wf.max;
    return compact;
  }

  function pushActionEvent(evt) {
    evt.seq = ++_actionLogSeq;
    evt.timestamp = Date.now();
    _actionLog.push(evt);
    // Trim old events to prevent DOM attribute bloat
    if (_actionLog.length > _maxActionLogSize) {
      _actionLog = _actionLog.slice(-_maxActionLogSize);
    }
    // Flush to DOM attribute for content script (isolated world) to read
    try {
      var target = document.getElementById('game') || document.body;
      target.setAttribute('data-tm-action-log', JSON.stringify(_actionLog));
    } catch(e) {}
    // Also dispatch CustomEvent as backup channel
    try {
      document.dispatchEvent(new CustomEvent('tm-action-event', { detail: evt }));
    } catch(e) {}
    dlog('Action event #' + evt.seq + ' type=' + evt.type);
  }

  // Hook fetch to capture API responses AND player input POSTs
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = arguments[0];
    var opts = arguments[1];

    // Capture POST to /api/playerInput (player's decision)
    if (typeof url === 'string' && url.indexOf('/api/playerInput') !== -1 && opts && opts.method && opts.method.toUpperCase() === 'POST') {
      try {
        var bodyStr = typeof opts.body === 'string' ? opts.body : null;
        if (bodyStr) {
          var bodyJson = JSON.parse(bodyStr);
          pushActionEvent({ type: 'playerInput', url: url.split('?')[0], body: bodyJson });
        }
      } catch(e) { dlog('playerInput parse error: ' + e.message); }
    }

    var result = origFetch.apply(this, arguments);

    if (typeof url === 'string') {
      // Capture GET responses from /api/player, /api/spectator
      if (url.indexOf('/api/player') !== -1 || url.indexOf('/api/spectator') !== -1) {
        result.then(function(resp) {
          return resp.clone().json();
        }).then(function(json) {
          if (json && (json.thisPlayer || json.players || json.game)) {
            _apiData = json;
            _apiTimestamp = Date.now();
            dlog('API data captured from ' + url.split('?')[0]);
            // Capture waitingFor prompt if present (compacted to save space)
            if (json.waitingFor) {
              pushActionEvent({ type: 'waitingFor', waitingFor: compactWaitingFor(json.waitingFor) });
            }
          }
        }).catch(function(e) { dlog('fetch hook error: ' + e.message); });
      }
      // Capture GET responses from /api/waitingfor (polling endpoint)
      if (url.indexOf('/api/waitingfor') !== -1) {
        result.then(function(resp) {
          return resp.clone().json();
        }).then(function(json) {
          if (json && json.result === 'GO' && json.waitingFor) {
            pushActionEvent({ type: 'waitingFor', status: 'GO', waitingFor: compactWaitingFor(json.waitingFor) });
          }
        }).catch(function(e) { dlog('fetch hook error: ' + e.message); });
      }
    }
    return result;
  };

  // Hook XMLHttpRequest too
  var origXHROpen = XMLHttpRequest.prototype.open;
  var origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._tmUrl = url;
    this._tmMethod = method;
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    var self = this;

    // Capture POST to /api/playerInput
    if (self._tmUrl && self._tmUrl.indexOf('/api/playerInput') !== -1 && self._tmMethod && self._tmMethod.toUpperCase() === 'POST') {
      try {
        if (typeof body === 'string') {
          var bodyJson = JSON.parse(body);
          pushActionEvent({ type: 'playerInput', url: self._tmUrl.split('?')[0], body: bodyJson });
        }
      } catch(e) { dlog('playerInput XHR parse: ' + e.message); }
    }

    if (self._tmUrl && (self._tmUrl.indexOf('/api/player') !== -1 || self._tmUrl.indexOf('/api/spectator') !== -1)) {
      self.addEventListener('load', function() {
        try {
          var json = JSON.parse(self.responseText);
          if (json && (json.thisPlayer || json.players || json.game)) {
            _apiData = json;
            _apiTimestamp = Date.now();
            dlog('XHR data captured from ' + self._tmUrl.split('?')[0]);
            if (json.waitingFor) {
              pushActionEvent({ type: 'waitingFor', waitingFor: compactWaitingFor(json.waitingFor) });
            }
          }
        } catch(e) { dlog('XHR player parse: ' + e.message); }
      });
    }

    // Capture waitingfor XHR responses
    if (self._tmUrl && self._tmUrl.indexOf('/api/waitingfor') !== -1) {
      self.addEventListener('load', function() {
        try {
          var json = JSON.parse(self.responseText);
          if (json && json.result === 'GO' && json.waitingFor) {
            pushActionEvent({ type: 'waitingFor', status: 'GO', waitingFor: compactWaitingFor(json.waitingFor) });
          }
        } catch(e) { dlog('XHR waitingfor parse: ' + e.message); }
      });
    }

    return origXHRSend.apply(this, arguments);
  };

  function findPlayerView() {
    // Try Vue first
    var pv = findPlayerViewVue();
    if (pv) {
      dlog('Using Vue data');
      return pv;
    }

    // Fall back to intercepted API data (fresh within 30s)
    if (_apiData && (Date.now() - _apiTimestamp) < 30000) {
      dlog('Using intercepted API data');
      return _apiData;
    }

    dlog('No data source available');
    return null;
  }

  // Normalize tags: object {building:3} → array [{tag:"building",count:3}]
  function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'object') {
      var result = [];
      for (var key in tags) {
        if (Object.prototype.hasOwnProperty.call(tags, key)) {
          result.push({ tag: key, count: tags[key] || 0 });
        }
      }
      return result;
    }
    return [];
  }

  function serializePlayerView(pv) {
    if (!pv) return null;
    var data = {};

    // Game state
    if (pv.game) {
      var g = pv.game;
      data.game = {
        id: g.id || g.gameId || null,
        generation: g.generation,
        phase: g.phase || null,
        temperature: g.temperature,
        oxygenLevel: g.oxygenLevel,
        oceans: g.oceans,
        venusScaleLevel: g.venusScaleLevel,
        deckSize: g.deckSize || 0,
        discardPileSize: g.discardPileSize || 0,
      };
      // Game options
      if (g.gameOptions) {
        data.game.gameOptions = {
          boardName: g.gameOptions.boardName,
          venusNextExtension: !!g.gameOptions.venusNextExtension,
          coloniesExtension: !!g.gameOptions.coloniesExtension,
          turmoilExtension: !!g.gameOptions.turmoilExtension,
          preludeExtension: !!g.gameOptions.preludeExtension,
          prelude2Extension: !!g.gameOptions.prelude2Extension,
          promoCardsOption: !!g.gameOptions.promoCardsOption,
          draftVariant: !!g.gameOptions.draftVariant,
          showTimers: !!g.gameOptions.showTimers,
          solarPhaseOption: !!g.gameOptions.solarPhaseOption,
          escapeVelocityMode: g.gameOptions.escapeVelocityMode || null,
          escapeVelocityThreshold: g.gameOptions.escapeVelocityThreshold || null,
          escapeVelocityPeriod: g.gameOptions.escapeVelocityPeriod || null,
          escapeVelocityPenalty: g.gameOptions.escapeVelocityPenalty || null,
          twoCorpsVariant: !!g.gameOptions.twoCorpsVariant,
          moonExpansion: !!g.gameOptions.moonExpansion,
          pathfindersExpansion: !!g.gameOptions.pathfindersExpansion,
          underworldExpansion: !!g.gameOptions.underworldExpansion
        };
      }
      // Colonies
      if (g.colonies) {
        data.game.colonies = [];
        for (var ci = 0; ci < g.colonies.length; ci++) {
          var col = g.colonies[ci];
          data.game.colonies.push({
            name: col.name,
            colonies: col.colonies || [],
            isActive: col.isActive,
            trackPosition: col.trackPosition,
            visitor: col.visitor
          });
        }
      }
      // Turmoil
      if (g.turmoil) {
        data.game.turmoil = {
          ruling: g.turmoil.ruling,
          dominant: g.turmoil.dominant,
          chairman: g.turmoil.chairman,
          lobby: g.turmoil.lobby,
          delegateReserve: g.turmoil.delegateReserve,
          reserve: g.turmoil.reserve,
          parties: g.turmoil.parties,
          coming: g.turmoil.coming,
          distant: g.turmoil.distant,
          policyActionUsers: g.turmoil.policyActionUsers
        };
      }
      // Board spaces — aggregate cities/greeneries per player color
      if (g.spaces) {
        data.game.playerTiles = {};
        for (var si = 0; si < g.spaces.length; si++) {
          var sp = g.spaces[si];
          if (sp.color && sp.tileType !== undefined && sp.tileType !== null) {
            if (!data.game.playerTiles[sp.color]) {
              data.game.playerTiles[sp.color] = { cities: 0, greeneries: 0, oceans: 0 };
            }
            var tt = sp.tileType;
            if (tt === 'greenery' || tt === 1) data.game.playerTiles[sp.color].greeneries++;
            if (tt === 'city' || tt === 0 || tt === 'capital' || tt === 5) data.game.playerTiles[sp.color].cities++;
            if (tt === 'ocean' || tt === 2) data.game.playerTiles[sp.color].oceans++;
          }
        }
      }
      // Awards & Milestones (claim/fund status fetched via game API in content.js)
      if (g.awards) data.game.awards = g.awards.map(function(a) {
        return { name: a.name, description: a.description || '', playerName: a.playerName || null, playerColor: a.playerColor || null, scores: a.scores || [] };
      });
      if (g.milestones) data.game.milestones = g.milestones.map(function(m) {
        return { name: m.name, description: m.description || '', threshold: m.threshold || 0, playerName: m.playerName || null, playerColor: m.playerColor || null };
      });
    }

    // This player
    if (pv.thisPlayer) {
      var p = pv.thisPlayer;
      data.thisPlayer = {
        color: p.color,
        megaCredits: p.megaCredits,
        steel: p.steel,
        steelValue: p.steelValue,
        titanium: p.titanium,
        titaniumValue: p.titaniumValue,
        heat: p.heat,
        plants: p.plants,
        energy: p.energy,
        terraformRating: p.terraformRating,
        megaCreditProduction: p.megaCreditProduction,
        steelProduction: p.steelProduction,
        titaniumProduction: p.titaniumProduction,
        plantProduction: p.plantProduction,
        energyProduction: p.energyProduction,
        heatProduction: p.heatProduction,
        coloniesCount: p.coloniesCount || 0,
        fleetSize: p.fleetSize || 1,
        tradesThisGeneration: p.tradesThisGeneration || 0,
        cardsInHandNbr: p.cardsInHandNbr || 0,
        tags: normalizeTags(p.tags),
        lastCardPlayed: p.lastCardPlayed || null,
        actionsThisGeneration: p.actionsThisGeneration || [],
        victoryPointsBreakdown: p.victoryPointsBreakdown || null,
        victoryPointsByGeneration: p.victoryPointsByGeneration || null,
        timer: p.timer ? { sumMs: p.timer.sumOfPausedMilliseconds || 0 } : null,
      };
      // Tableau card names + resources (needed for VP calculation)
      if (p.tableau) {
        data.thisPlayer.tableau = [];
        for (var ti = 0; ti < p.tableau.length; ti++) {
          var tc = p.tableau[ti];
          var entry = { name: tc.name };
          if (tc.resources !== undefined && tc.resources !== null) entry.resources = tc.resources;
          if (tc.cloneTag) entry.cloneTag = tc.cloneTag;
          data.thisPlayer.tableau.push(entry);
        }
      }
      // Cards in hand (names if available)
      if (p.cardsInHand) {
        data.thisPlayer.cardsInHand = [];
        for (var hi = 0; hi < p.cardsInHand.length; hi++) {
          data.thisPlayer.cardsInHand.push({ name: p.cardsInHand[hi].name });
        }
      }
      // Drafted cards (accumulated during draft phase, cleared on research→action transition)
      if (pv.draftedCards) {
        data.draftedCards = [];
        for (var di = 0; di < pv.draftedCards.length; di++) {
          data.draftedCards.push({ name: pv.draftedCards[di].name, cost: pv.draftedCards[di].cost });
        }
      }
      // Dealt corps/preludes (for initial draft logging)
      if (pv.dealtCorporationCards) {
        data.dealtCorporationCards = pv.dealtCorporationCards.map(function(c) { return { name: c.name }; });
      }
      if (pv.dealtPreludeCards) {
        data.dealtPreludeCards = pv.dealtPreludeCards.map(function(c) { return { name: c.name }; });
      }
      if (pv.pickedCorporationCard) {
        data.pickedCorporationCard = pv.pickedCorporationCard.map(function(c) { return { name: c.name }; });
      }
      if (pv.preludeCardsInHand) {
        data.preludeCardsInHand = pv.preludeCardsInHand.map(function(c) { return { name: c.name }; });
      }
    }

    // All players (for opponent tracking, M/A racing)
    if (pv.players) {
      data.players = [];
      for (var pi = 0; pi < pv.players.length; pi++) {
        var pl = pv.players[pi];
        data.players.push({
          name: pl.name,
          color: pl.color,
          terraformRating: pl.terraformRating,
          megaCredits: pl.megaCredits,
          steel: pl.steel,
          titanium: pl.titanium,
          heat: pl.heat,
          plants: pl.plants,
          tags: normalizeTags(pl.tags),
          citiesCount: pl.citiesCount || 0,
          coloniesCount: pl.coloniesCount || 0,
          cardsInHandNbr: pl.cardsInHandNbr || 0,
          isActive: pl.isActive,
          actionsTakenThisRound: pl.actionsTakenThisRound || 0,
          megaCreditProduction: pl.megaCreditProduction,
          steelProduction: pl.steelProduction,
          titaniumProduction: pl.titaniumProduction,
          plantProduction: pl.plantProduction,
          energyProduction: pl.energyProduction,
          heatProduction: pl.heatProduction,
          energy: pl.energy,
          fleetSize: pl.fleetSize || 1,
          tradesThisGeneration: pl.tradesThisGeneration || 0,
          lastCardPlayed: pl.lastCardPlayed || null,
          actionsThisGeneration: pl.actionsThisGeneration || [],
          victoryPointsBreakdown: pl.victoryPointsBreakdown || null,
          victoryPointsByGeneration: pl.victoryPointsByGeneration || null,
          timer: pl.timer ? { sumMs: pl.timer.sumOfPausedMilliseconds || 0 } : null,
        });
        // Tableau for opponents (include resources for VP calc)
        if (pl.tableau) {
          data.players[pi].tableau = [];
          for (var oi = 0; oi < pl.tableau.length; oi++) {
            var oc = pl.tableau[oi];
            var oEntry = { name: oc.name };
            if (oc.resources !== undefined && oc.resources !== null) oEntry.resources = oc.resources;
            if (oc.cloneTag) oEntry.cloneTag = oc.cloneTag;
            data.players[pi].tableau.push(oEntry);
          }
        }
      }
    }

    data._isSpectator = !!pv._isSpectator;
    data._timestamp = Date.now();
    data._source = pv._source || 'vue';
    return data;
  }

  function update() {
    try {
      var pv = findPlayerView();
      var data = serializePlayerView(pv);
      var target = document.getElementById('game') || document.body;
      if (data) {
        target.setAttribute('data-tm-vue-bridge', JSON.stringify(data));
        target.setAttribute('data-tm-bridge-status', 'ok:' + (data._source || 'vue') + ':' + new Date().toLocaleTimeString());
        // Serialize waitingFor for advisor panel (from last captured action log)
        try {
          var lastWf = null;
          for (var ai = _actionLog.length - 1; ai >= 0; ai--) {
            if (_actionLog[ai].type === 'waitingFor' && _actionLog[ai].waitingFor) {
              lastWf = _actionLog[ai].waitingFor;
              break;
            }
          }
          if (lastWf) {
            target.setAttribute('data-tm-vue-wf', JSON.stringify(lastWf));
          }
        } catch(e) {}
      } else {
        target.setAttribute('data-tm-bridge-status', 'no-data:' + _debugLog.slice(-3).join(' | '));
      }
    } catch(e) {
      var target2 = document.getElementById('game') || document.body;
      target2.setAttribute('data-tm-bridge-status', 'error:' + e.message);
    }
  }

  // Update every 2 seconds (skip when tab is hidden)
  setInterval(function() { if (!document.hidden) update(); }, 2000);

  // Also run after delays to catch late-loading Vue
  setTimeout(update, 500);
  setTimeout(update, 2000);
  setTimeout(update, 5000);

  // ═══ Create Game Bridge ═══
  // Provides read/write Vue access for game creation templates

  var _cgVm = null;

  function findCreateGameVm() {
    var el = document.querySelector('#create-game');
    if (!el) return null;
    // Vue 2: element has __vue__ directly
    if (el.__vue__) return el.__vue__;
    var children = el.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      if (children[i].__vue__ && children[i].__vue__.playersCount !== undefined) {
        return children[i].__vue__;
      }
    }
    // Vue 3: __vue_app__ lives on mount point (#app), not on #create-game
    // Walk from root app instance through vnode tree to find CreateGameForm
    var appEl = document.querySelector('#app') || document.querySelector('[data-v-app]');
    if (appEl && appEl.__vue_app__) {
      var app = appEl.__vue_app__;
      // Check root instance first
      if (app._instance && app._instance.proxy && app._instance.proxy.playersCount !== undefined) {
        return app._instance.proxy;
      }
      // Walk vnode subtree to find CreateGameForm component
      if (app._instance && app._instance.subTree) {
        var found = walkVnodeForCG(app._instance.subTree, 0);
        if (found) return found;
      }
    }
    // Vue 3 fallback: check __vue_app__ on #create-game itself (unlikely but safe)
    if (el.__vue_app__) {
      var app2 = el.__vue_app__;
      if (app2._instance && app2._instance.proxy && app2._instance.proxy.playersCount !== undefined) {
        return app2._instance.proxy;
      }
    }
    return null;
  }

  function walkVnodeForCG(vn, depth) {
    if (!vn || depth > 20) return null;
    if (vn.component) {
      var proxy = vn.component.proxy;
      if (proxy && proxy.playersCount !== undefined) return proxy;
      // Recurse into component's subtree
      if (vn.component.subTree) {
        var r = walkVnodeForCG(vn.component.subTree, depth + 1);
        if (r) return r;
      }
    }
    if (vn.children && Array.isArray(vn.children)) {
      for (var i = 0; i < vn.children.length; i++) {
        var r2 = walkVnodeForCG(vn.children[i], depth + 1);
        if (r2) return r2;
      }
    }
    return null;
  }

  function serializeCreateGame(vm) {
    try {
      var data = {
        players: (vm.players || []).map(function(p) {
          return { name: p.name, color: p.color, beginner: p.beginner, handicap: p.handicap, first: p.first };
        }),
        expansions: Object.assign({}, vm.expansions || {}),
        playersCount: vm.playersCount,
        draftVariant: vm.draftVariant,
        showOtherPlayersVP: vm.showOtherPlayersVP,
        customCorporationsList: (vm.customCorporations || []).slice(),
        customColoniesList: (vm.customColonies || []).slice(),
        customPreludes: (vm.customPreludes || []).slice(),
        board: vm.board,
        solarPhaseOption: vm.solarPhaseOption,
        undoOption: vm.undoOption,
        showTimers: vm.showTimers,
        fastModeOption: vm.fastModeOption,
        includeFanMA: vm.includeFanMA,
        randomMA: vm.randomMA,
        shuffleMapOption: vm.shuffleMapOption,
        randomFirstPlayer: vm.randomFirstPlayer,
        initialDraft: vm.initialDraft,
        preludeDraftVariant: vm.preludeDraftVariant,
        ceosDraftVariant: vm.ceosDraftVariant,
        twoCorpsVariant: vm.twoCorpsVariant,
        startingCorporations: vm.startingCorporations,
        startingPreludes: vm.startingPreludes,
        aresExtremeVariant: vm.aresExtremeVariant,
        politicalAgendasExtension: vm.politicalAgendasExtension,
        removeNegativeGlobalEventsOption: vm.removeNegativeGlobalEventsOption,
        requiresVenusTrackCompletion: vm.requiresVenusTrackCompletion,
        requiresMoonTrackCompletion: vm.requiresMoonTrackCompletion,
        altVenusBoard: vm.altVenusBoard,
        customCeos: (vm.customCeos || []).slice(),
        startingCeos: vm.startingCeos,
      };
      // Banned/included cards from refs
      try {
        if (vm.$refs && vm.$refs.cardsFilter && vm.$refs.cardsFilter.selected) {
          data.bannedCards = vm.$refs.cardsFilter.selected.slice();
        }
      } catch(e) {}
      try {
        if (vm.$refs && vm.$refs.cardsFilter2 && vm.$refs.cardsFilter2.selected) {
          data.includedCards = vm.$refs.cardsFilter2.selected.slice();
        }
      } catch(e) {}
      return data;
    } catch(e) { return null; }
  }

  function applySettingsToVm(vm, s) {
    // Map server field names to client
    if (s.customCorporationsList) { s.customCorporations = s.customCorporationsList; }
    if (s.customColoniesList) { s.customColonies = s.customColoniesList; }

    if (s.players && s.players.length) vm.playersCount = s.players.length;
    if (s.expansions) {
      Object.keys(s.expansions).forEach(function(k) {
        if (vm.expansions && (k in vm.expansions)) vm.expansions[k] = s.expansions[k];
      });
    }

    setTimeout(function() {
      var boolFields = [
        'draftVariant','showOtherPlayersVP','solarPhaseOption','undoOption',
        'showTimers','fastModeOption','includeFanMA','shuffleMapOption',
        'randomFirstPlayer','initialDraft','preludeDraftVariant','ceosDraftVariant',
        'twoCorpsVariant','aresExtremeVariant','removeNegativeGlobalEventsOption',
        'requiresVenusTrackCompletion','requiresMoonTrackCompletion','altVenusBoard'
      ];
      boolFields.forEach(function(f) { if ((f in s) && (f in vm)) vm[f] = s[f]; });

      var otherFields = ['board','randomMA','politicalAgendasExtension','startingCorporations','startingPreludes','startingCeos'];
      otherFields.forEach(function(f) { if ((f in s) && (f in vm)) vm[f] = s[f]; });

      if (s.customCorporations && s.customCorporations.length) vm.customCorporations = s.customCorporations.slice();
      if (s.customColonies && s.customColonies.length) vm.customColonies = s.customColonies.slice();
      if (s.customPreludes && s.customPreludes.length) vm.customPreludes = s.customPreludes.slice();
      if (s.customCeos && s.customCeos.length) vm.customCeos = s.customCeos.slice();

      if (s.players && s.players.length && vm.players) {
        for (var i = 0; i < Math.min(s.players.length, vm.players.length); i++) {
          if (s.players[i].name) vm.players[i].name = s.players[i].name;
          if (s.players[i].color) vm.players[i].color = s.players[i].color;
        }
      }

      if (('solarPhaseOption' in s) && vm.$nextTick) {
        vm.$nextTick(function() { vm.solarPhaseOption = s.solarPhaseOption; });
      }

      if (s.bannedCards && s.bannedCards.length) {
        vm.showBannedCards = true;
        if (vm.$nextTick) vm.$nextTick(function() {
          setTimeout(function() {
            if (vm.$refs && vm.$refs.cardsFilter) vm.$refs.cardsFilter.selected = s.bannedCards.slice();
          }, 100);
        });
      }
      if (s.includedCards && s.includedCards.length) {
        vm.showIncludedCards = true;
        if (vm.$nextTick) vm.$nextTick(function() {
          setTimeout(function() {
            if (vm.$refs && vm.$refs.cardsFilter2) vm.$refs.cardsFilter2.selected = s.includedCards.slice();
          }, 100);
        });
      }
    }, 200);
  }

  // Listen for commands from content script (isolated world)
  document.addEventListener('tm-bridge-save', function() {
    var vm = _cgVm || findCreateGameVm();
    if (!vm) return;
    var data = serializeCreateGame(vm);
    if (data) {
      document.body.setAttribute('data-tm-cg-settings', JSON.stringify(data));
      document.body.setAttribute('data-tm-cg-event', 'saved:' + Date.now());
    }
  });

  document.addEventListener('tm-bridge-load', function(e) {
    var vm = _cgVm || findCreateGameVm();
    if (!vm) return;
    var raw = document.body.getAttribute('data-tm-cg-load');
    if (!raw) return;
    try {
      var settings = JSON.parse(raw);
      applySettingsToVm(vm, settings);
      document.body.setAttribute('data-tm-cg-event', 'loaded:' + Date.now());
    } catch(e) {}
  });

  // Hook fetch in MAIN world for auto-save on game create
  var _cgFetchHooked = false;
  function hookCreateFetch() {
    if (_cgFetchHooked) return;
    var vm = findCreateGameVm();
    if (!vm) return;
    _cgVm = vm;
    _cgFetchHooked = true;

    var _origFetch2 = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.indexOf('creategame') !== -1 && opts && opts.method === 'POST') {
        var data = serializeCreateGame(vm);
        if (data) {
          document.body.setAttribute('data-tm-cg-settings', JSON.stringify(data));
          document.body.setAttribute('data-tm-cg-event', 'autosaved:' + Date.now());
        }
      }
      return _origFetch2.apply(this, arguments);
    };
    // Signal that bridge is ready for create-game
    document.body.setAttribute('data-tm-cg-ready', '1');
  }

  // Poll for create-game page
  setInterval(function() {
    if (document.hidden) return;
    if (document.querySelector('#create-game')) {
      hookCreateFetch();
    } else {
      _cgFetchHooked = false;
      _cgVm = null;
    }
  }, 1000);
})();
