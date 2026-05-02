// TM Tier Overlay - Content player view helpers
(function(global) {
  'use strict';

  var pvCache = null;
  var pvCacheTime = 0;
  var pvApiState = null;
  var pvApiStateTime = 0;
  var pvApiFetchInFlight = false;
  var pvLastApiFetchAt = 0;
  var pvGraceMs = 10000;
  var pvApiFetchCooldownMs = 5000;

  function getBridgeTargets(documentObj) {
    return [
      documentObj.getElementById('game'),
      documentObj.getElementById('app'),
      documentObj.querySelector('[data-v-app]'),
      documentObj.body,
    ];
  }

  function getBridgeHostEl(documentObj) {
    var targets = getBridgeTargets(documentObj);
    for (var i = 0; i < targets.length; i++) {
      if (targets[i]) return targets[i];
    }
    return documentObj.body;
  }

  function normalizePlayerPayload(data) {
    if (!data || typeof data !== 'object') return data;
    if (data.thisPlayer) return data;
    if (data.playerView && data.playerView.thisPlayer) return data.playerView;
    if (data.player && data.player.thisPlayer) return data.player;
    if (data.player && data.player.game && data.player.color && !data.player.thisPlayer) {
      data = data.player;
    }
    if (data.game && data.players && data.color && !data.thisPlayer) {
      var wrapped = {
        thisPlayer: data,
        players: data.players || [],
        game: data.game || null,
        _source: data._source || 'legacy-api'
      };
      if (data.waitingFor) wrapped.waitingFor = data.waitingFor;
      if (data.waitingFor && !wrapped._waitingFor) wrapped._waitingFor = data.waitingFor;
      if (data.draftedCards) wrapped.draftedCards = data.draftedCards;
      if (data.dealtCorporationCards) wrapped.dealtCorporationCards = data.dealtCorporationCards;
      if (data.dealtPreludeCards) wrapped.dealtPreludeCards = data.dealtPreludeCards;
      if (data.pickedCorporationCard) wrapped.pickedCorporationCard = data.pickedCorporationCard;
      if (data.preludeCardsInHand) wrapped.preludeCardsInHand = data.preludeCardsInHand;
      if (data.dealtProjectCards) wrapped.dealtProjectCards = data.dealtProjectCards;
      return wrapped;
    }
    return data;
  }

  function requestPlayerViewApiFallback(input) {
    var documentObj = input && input.documentObj;
    var parseGameId = input && input.parseGameId;
    var fetchFn = input && input.fetchFn;
    var tmWarn = input && input.tmWarn;
    if (!documentObj || typeof parseGameId !== 'function' || typeof fetchFn !== 'function') return;
    if (pvApiFetchInFlight) return;
    if (Date.now() - pvLastApiFetchAt < pvApiFetchCooldownMs) return;

    var gameId = parseGameId();
    if (!gameId) return;

    var endpoint = gameId.charAt(0).toLowerCase() === 'p'
      ? '/api/player?id=' + encodeURIComponent(gameId)
      : '/api/spectator?id=' + encodeURIComponent(gameId);

    pvApiFetchInFlight = true;
    pvLastApiFetchAt = Date.now();

    fetchFn(endpoint, { credentials: 'same-origin' })
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        data = normalizePlayerPayload(data);
        if (!data || (!data.thisPlayer && !data.players && !data.game)) return;
        var stamped = Object.assign({}, data);
        stamped._timestamp = Date.now();
        if (stamped.waitingFor && !stamped._waitingFor) stamped._waitingFor = stamped.waitingFor;
        pvApiState = stamped;
        pvApiStateTime = Date.now();
        pvCache = stamped;
        pvCacheTime = Date.now();
        try {
          var target = getBridgeHostEl(documentObj);
          target.setAttribute('data-tm-vue-bridge', JSON.stringify(stamped));
          if (stamped._waitingFor) {
            target.setAttribute('data-tm-vue-wf', JSON.stringify(stamped._waitingFor));
          } else if (target.removeAttribute) {
            target.removeAttribute('data-tm-vue-wf');
          }
          target.setAttribute('data-tm-bridge-status', 'ok:api-fallback:' + new Date().toLocaleTimeString());
        } catch (e) {}
      })
      .catch(function(e) {
        if (typeof tmWarn === 'function') tmWarn('api', 'API fallback failed', e);
      })
      .then(function() {
        pvApiFetchInFlight = false;
      });
  }

  function getPlayerVueData(input) {
    var documentObj = input && input.documentObj;
    var parseGameId = input && input.parseGameId;
    var fetchFn = input && input.fetchFn;
    var tmWarn = input && input.tmWarn;
    if (!documentObj) return null;

    if (Date.now() - pvCacheTime < 2000 && pvCache !== null) return pvCache;
    var bridgeTargets = getBridgeTargets(documentObj);
    var bridgeData = null;
    for (var bi = 0; bi < bridgeTargets.length; bi++) {
      var bridgeEl = bridgeTargets[bi];
      if (!bridgeEl) continue;
      bridgeData = bridgeEl.getAttribute('data-tm-vue-bridge');
      if (bridgeData) break;
    }
    if (!bridgeData) {
      requestPlayerViewApiFallback({
        documentObj: documentObj,
        parseGameId: parseGameId,
        fetchFn: fetchFn,
        tmWarn: tmWarn
      });
      if (pvApiState !== null && Date.now() - pvApiStateTime < pvGraceMs) return pvApiState;
      if (pvCache !== null && Date.now() - pvCacheTime < pvGraceMs) return pvCache;
      pvCache = null;
      return null;
    }
    try {
      var parsed = normalizePlayerPayload(JSON.parse(bridgeData));
      if (parsed._timestamp && Date.now() - parsed._timestamp > 15000) {
        requestPlayerViewApiFallback({
          documentObj: documentObj,
          parseGameId: parseGameId,
          fetchFn: fetchFn,
          tmWarn: tmWarn
        });
        if (pvApiState !== null && Date.now() - pvApiStateTime < pvGraceMs) return pvApiState;
        if (pvCache !== null && Date.now() - pvCacheTime < pvGraceMs) return pvCache;
        pvCache = null;
        return null;
      }
      pvCache = parsed;
      pvCacheTime = Date.now();
      return pvCache;
    } catch (e) {
      if (typeof tmWarn === 'function') tmWarn('api', 'Vue data parse failed', e);
      requestPlayerViewApiFallback({
        documentObj: documentObj,
        parseGameId: parseGameId,
        fetchFn: fetchFn,
        tmWarn: tmWarn
      });
      if (pvApiState !== null && Date.now() - pvApiStateTime < pvGraceMs) return pvApiState;
      if (pvCache !== null && Date.now() - pvCacheTime < pvGraceMs) return pvCache;
      pvCache = null;
      return null;
    }
  }

  global.TM_CONTENT_PLAYER_VIEW = {
    getPlayerVueData: getPlayerVueData
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
