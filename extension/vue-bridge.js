// Vue Bridge: runs in MAIN world, reads game data and writes to DOM for content script
(function() {
  'use strict';

  var _debugLog = [];
  function dlog(msg) { _debugLog.push(Date.now() + ': ' + msg); if (_debugLog.length > 20) _debugLog.shift(); }

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
      if (depth > 30) return null;
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
          if (!vn || d2 > 20) return null;
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

  // Hook fetch to capture API responses
  var origFetch = window.fetch;
  window.fetch = function() {
    var result = origFetch.apply(this, arguments);
    var url = arguments[0];
    if (typeof url === 'string' && (url.indexOf('/api/player') !== -1 || url.indexOf('/api/spectator') !== -1 || url.indexOf('/api/waitingfor') !== -1)) {
      result.then(function(resp) {
        return resp.clone().json();
      }).then(function(json) {
        if (json && (json.thisPlayer || json.players || json.game)) {
          _apiData = json;
          _apiTimestamp = Date.now();
          dlog('API data captured from ' + url.split('?')[0]);
        }
      }).catch(function() {});
    }
    return result;
  };

  // Hook XMLHttpRequest too
  var origXHROpen = XMLHttpRequest.prototype.open;
  var origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._tmUrl = url;
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var self = this;
    if (self._tmUrl && (self._tmUrl.indexOf('/api/player') !== -1 || self._tmUrl.indexOf('/api/spectator') !== -1)) {
      self.addEventListener('load', function() {
        try {
          var json = JSON.parse(self.responseText);
          if (json && (json.thisPlayer || json.players || json.game)) {
            _apiData = json;
            _apiTimestamp = Date.now();
            dlog('XHR data captured from ' + self._tmUrl.split('?')[0]);
          }
        } catch(e) {}
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
        if (tags.hasOwnProperty(key)) {
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
        generation: g.generation,
        temperature: g.temperature,
        oxygenLevel: g.oxygenLevel,
        oceans: g.oceans,
        venusScaleLevel: g.venusScaleLevel,
      };
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
          parties: g.turmoil.parties
        };
      }
      // Board spaces — aggregate cities/greeneries per player color
      if (g.spaces) {
        data.game.playerTiles = {};
        for (var si = 0; si < g.spaces.length; si++) {
          var sp = g.spaces[si];
          if (sp.color && sp.tileType !== undefined && sp.tileType !== null) {
            if (!data.game.playerTiles[sp.color]) {
              data.game.playerTiles[sp.color] = { cities: 0, greeneries: 0 };
            }
            var tt = sp.tileType;
            if (tt === 'greenery' || tt === 1) data.game.playerTiles[sp.color].greeneries++;
            if (tt === 'city' || tt === 0 || tt === 'capital' || tt === 5) data.game.playerTiles[sp.color].cities++;
          }
        }
      }
      // Awards & Milestones
      if (g.awards) data.game.awards = g.awards;
      if (g.milestones) data.game.milestones = g.milestones;
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
      };
      // Tableau card names
      if (p.tableau) {
        data.thisPlayer.tableau = [];
        for (var ti = 0; ti < p.tableau.length; ti++) {
          data.thisPlayer.tableau.push({ name: p.tableau[ti].name });
        }
      }
      // Cards in hand (names if available)
      if (p.cardsInHand) {
        data.thisPlayer.cardsInHand = [];
        for (var hi = 0; hi < p.cardsInHand.length; hi++) {
          data.thisPlayer.cardsInHand.push({ name: p.cardsInHand[hi].name });
        }
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
          megaCreditProduction: pl.megaCreditProduction,
          steelProduction: pl.steelProduction,
          titaniumProduction: pl.titaniumProduction,
          plantProduction: pl.plantProduction,
          energyProduction: pl.energyProduction,
          heatProduction: pl.heatProduction,
        });
        // Tableau for opponents
        if (pl.tableau) {
          data.players[pi].tableau = [];
          for (var oi = 0; oi < pl.tableau.length; oi++) {
            data.players[pi].tableau.push({ name: pl.tableau[oi].name });
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
      } else {
        target.setAttribute('data-tm-bridge-status', 'no-data:' + _debugLog.slice(-3).join(' | '));
      }
    } catch(e) {
      var target2 = document.getElementById('game') || document.body;
      target2.setAttribute('data-tm-bridge-status', 'error:' + e.message);
    }
  }

  // Update every 2 seconds
  setInterval(update, 2000);

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
    // Vue 2
    if (el.__vue__) return el.__vue__;
    var children = el.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      if (children[i].__vue__ && children[i].__vue__.playersCount !== undefined) {
        return children[i].__vue__;
      }
    }
    // Vue 3
    if (el.__vue_app__) {
      var app = el.__vue_app__;
      if (app._instance && app._instance.proxy && app._instance.proxy.playersCount !== undefined) {
        return app._instance.proxy;
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
        if (vm.expansions && vm.expansions.hasOwnProperty(k)) vm.expansions[k] = s.expansions[k];
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
      boolFields.forEach(function(f) { if (s.hasOwnProperty(f) && vm.hasOwnProperty(f)) vm[f] = s[f]; });

      var otherFields = ['board','randomMA','politicalAgendasExtension','startingCorporations','startingPreludes','startingCeos'];
      otherFields.forEach(function(f) { if (s.hasOwnProperty(f) && vm.hasOwnProperty(f)) vm[f] = s[f]; });

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

      if (s.hasOwnProperty('solarPhaseOption') && vm.$nextTick) {
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
    if (document.querySelector('#create-game')) {
      hookCreateFetch();
    } else {
      _cgFetchHooked = false;
      _cgVm = null;
    }
  }, 1000);
})();
