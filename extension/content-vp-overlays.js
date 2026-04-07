// TM Tier Overlay - Content VP overlay helpers
(function(global) {
  'use strict';

  function ensureVpCalcAnchor(input) {
    var vpTag = input && input.vpTag;
    var windowObj = input && input.windowObj;
    if (!vpTag || !vpTag.style) return;
    var computedPosition = '';
    try {
      computedPosition = windowObj && typeof windowObj.getComputedStyle === 'function'
        ? (windowObj.getComputedStyle(vpTag).position || '')
        : '';
    } catch (e) {}
    if (!computedPosition || computedPosition === 'static') {
      vpTag.style.position = 'relative';
    }
    vpTag.style.overflow = 'visible';
  }

  function vpTooltip(bp) {
    var s = 'VP (calc): TR=' + bp.tr + ' | green=' + bp.greenery + ' | city=' + bp.city + ' | cards=' + bp.cards + ' | ms=' + bp.milestones + ' | aw=' + bp.awards;
    if (bp.escapeVelocity) s += ' | esc=' + bp.escapeVelocity;
    return s + ' | total=' + bp.total;
  }

  function updateVPOverlays(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var computeVPBreakdown = input && input.computeVPBreakdown;
    var documentObj = input && input.documentObj;
    var windowObj = input && input.windowObj;

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    if (!pv || !pv.players || !documentObj || typeof computeVPBreakdown !== 'function') return;

    var vpByColor = {};
    for (var pi = 0; pi < pv.players.length; pi++) {
      var p = pv.players[pi];
      if (!p.color) continue;
      vpByColor[p.color] = computeVPBreakdown(p, pv);
    }

    var vpTags = documentObj.querySelectorAll('.tag-vp');
    for (var vi = 0; vi < vpTags.length; vi++) {
      var vpTag = vpTags[vi];
      var ancestor = vpTag.closest('[class*="player_bg_color_"], [class*="player_translucent_bg_color_"]');
      if (!ancestor) {
        var el = vpTag;
        for (var up = 0; up < 15 && el; up++) {
          el = el.parentElement;
          if (el && el.className && /player_(?:translucent_)?bg_color_/.test(el.className)) {
            ancestor = el;
            break;
          }
        }
      }
      if (!ancestor) continue;

      var colorMatch = ancestor.className.match(/player_(?:translucent_)?bg_color_(\w+)/);
      if (!colorMatch) continue;
      var color = colorMatch[1];
      var bp = vpByColor[color];
      if (!bp || bp.total <= 0) continue;

      var tagContainer = vpTag.parentElement;
      if (!tagContainer) continue;

      var existing = tagContainer.querySelector('.tm-vp-calc');
      if (existing) {
        ensureVpCalcAnchor({ vpTag: vpTag, windowObj: windowObj });
        if (existing.parentElement !== vpTag) vpTag.appendChild(existing);
        if (existing.textContent !== String(bp.total)) {
          existing.textContent = bp.total;
          existing.title = vpTooltip(bp);
        }
        continue;
      }

      var badge = documentObj.createElement('span');
      badge.className = 'tm-vp-calc';
      badge.textContent = bp.total;
      badge.title = vpTooltip(bp);
      badge.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;min-width:18px;text-align:center;background:rgba(90,74,30,0.96);color:#ffd700;font-weight:bold;font-size:10px;padding:0 3px;border-radius:10px;cursor:help;border:1px solid #8d6e2e;line-height:1.2;z-index:3;pointer-events:auto;';
      ensureVpCalcAnchor({ vpTag: vpTag, windowObj: windowObj });
      vpTag.appendChild(badge);
    }
  }

  global.TM_CONTENT_VP_OVERLAYS = {
    ensureVpCalcAnchor: ensureVpCalcAnchor,
    updateVPOverlays: updateVPOverlays,
    vpTooltip: vpTooltip
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
