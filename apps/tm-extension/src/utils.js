// TM Tier Overlay — Shared Utilities
// Common functions used across content.js, gamelog.js, templates.js, game-watcher.js

var TM_UTILS = {
  safeStorage: function(fn) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
        fn(chrome.storage);
      }
    } catch(e) { /* extension context invalidated */ }
  },
  downloadJson: function(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  downloadText: function(text, filename) {
    var blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  ruName: function(engName) {
    if (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[engName]) return TM_NAMES_RU[engName];
    return engName;
  },
  resolveCorpName: function(name) {
    return (typeof _corpAliasMap !== 'undefined' && _corpAliasMap[(name || '').toLowerCase()]) || name;
  },
  // Tier colors (single source of truth for JS; CSS duplicates in content.css & popup.html)
  TIER_COLORS: { S: '#e74c3c', A: '#e67e22', B: '#f1c40f', C: '#2ecc71', D: '#95a5a6', F: '#7f8c8d' },
  tierColor: function(t) {
    return TM_UTILS.TIER_COLORS[t] || '#7f8c8d';
  },
  // HTML escaping (cached element for performance)
  _escEl: null,
  escHtml: function(s) {
    if (!TM_UTILS._escEl) TM_UTILS._escEl = document.createElement('span');
    TM_UTILS._escEl.textContent = s;
    return TM_UTILS._escEl.innerHTML;
  },
  // Parse game/spectator ID from current URL
  parseGameId: function() {
    var m = window.location.pathname.match(/\/(player|game|spectator|the-end)\/([pgs][a-f0-9]+)/i);
    if (m) return m[2];
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (id && /^[pgs][a-f0-9]+$/i.test(id)) return id;
    var spectatorId = params.get('s');
    if (spectatorId && /^[s][a-f0-9]+$/i.test(spectatorId)) return spectatorId;
    return null;
  },
  parsePlayerId: function() {
    var m = window.location.pathname.match(/\/player\/(p[a-f0-9]+)/i);
    if (m) return m[1];
    if (window.location.pathname.includes('/player')) {
      var params = new URLSearchParams(window.location.search);
      var id = params.get('id');
      if (id && /^p[a-f0-9]+$/i.test(id)) return id;
    }
    return null;
  },
  // Player color palette (Material Design 700)
  playerColor: function(color) {
    var map = { red: '#d32f2f', blue: '#1976d2', green: '#388e3c', yellow: '#fbc02d', black: '#616161', purple: '#7b1fa2', orange: '#f57c00', pink: '#c2185b' };
    return map[color] || '#666';
  }
};
