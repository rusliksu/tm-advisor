// TM Tier Overlay - Content player meta helpers
(function(global) {
  'use strict';

  function cleanupEmptyVpMetaLanes(input) {
    var documentObj = input && input.documentObj;
    if (!documentObj) return;
    var lanes = documentObj.querySelectorAll('.tm-vp-meta-lane');
    for (var i = 0; i < lanes.length; i++) {
      if (!lanes[i].children.length) lanes[i].remove();
    }
  }

  function cleanupPlayerEloHosts(input) {
    var documentObj = input && input.documentObj;
    if (!documentObj) return;
    var hosts = documentObj.querySelectorAll('.tm-player-elo-host');
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].children.length) continue;
      var parent = hosts[i].parentElement;
      hosts[i].remove();
      if (!parent || !parent.hasAttribute('data-tm-elo-padded')) continue;
      parent.style.position = parent.getAttribute('data-tm-elo-orig-position') || '';
      parent.style.paddingRight = parent.getAttribute('data-tm-elo-orig-padding-right') || '';
      parent.removeAttribute('data-tm-elo-padded');
      parent.removeAttribute('data-tm-elo-orig-position');
      parent.removeAttribute('data-tm-elo-orig-padding-right');
    }
  }

  function removeEloBadges(input) {
    var documentObj = input && input.documentObj;
    if (!documentObj) return;
    var badges = documentObj.querySelectorAll('.tm-elo-badge');
    for (var i = 0; i < badges.length; i++) badges[i].remove();
    cleanupPlayerEloHosts({ documentObj: documentObj });
    cleanupEmptyVpMetaLanes({ documentObj: documentObj });
  }

  function updateEloBadges(input) {
    removeEloBadges(input);
  }

  global.TM_CONTENT_PLAYER_META = {
    cleanupEmptyVpMetaLanes: cleanupEmptyVpMetaLanes,
    cleanupPlayerEloHosts: cleanupPlayerEloHosts,
    removeEloBadges: removeEloBadges,
    updateEloBadges: updateEloBadges
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
