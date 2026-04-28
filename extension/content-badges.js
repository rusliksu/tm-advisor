// TM Tier Overlay — Content badge helpers
(function(global) {
  'use strict';

  function injectBadge(input) {
    var cardEl = input && input.cardEl;
    if (!cardEl || cardEl.querySelector('.tm-tier-badge')) return;

    var name = input.getCardName(cardEl);
    var data = input.getRatingByCardName(name);
    if (!name || !data) return;

    var s = data.s;
    var t = data.t;
    if (!t || s == null) return;
    var visible = input.tierFilter[t] !== false;
    var shouldDeferContextBadge = input && input.shouldDeferContextBadge;

    var badge = document.createElement('div');
    badge.className = 'tm-tier-badge tm-tier-' + t;
    badge.textContent = t + ' ' + s;
    var workflowOwned = !!cardEl.closest('.wf-component--select-card, .wf-component--select-prelude');
    var contextOwned = typeof shouldDeferContextBadge === 'function'
      ? !!shouldDeferContextBadge(cardEl, name, data)
      : false;
    var pendingContext = workflowOwned || contextOwned;
    if (pendingContext) {
      badge.setAttribute('data-tm-pending-context', '1');
      badge.style.visibility = 'hidden';
    }
    if (!visible) badge.style.display = 'none';

    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';

    cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
    cardEl.setAttribute('data-tm-card', name);
    cardEl.setAttribute('data-tm-tier', t);

    if (!cardEl.hasAttribute('data-tm-tip')) {
      cardEl.setAttribute('data-tm-tip', '1');
      cardEl.addEventListener('mouseenter', function(e) { input.showTooltip(e, name, data); });
      cardEl.addEventListener('mouseleave', input.hideTooltip);
    }

    if (!pendingContext && (t === 'D' || t === 'F')) {
      cardEl.classList.add('tm-dim');
    }
  }

  function revealPendingContextBadge(badge) {
    if (!badge || !badge.hasAttribute('data-tm-pending-context')) return;
    badge.style.visibility = '';
    badge.removeAttribute('data-tm-pending-context');
  }

  function revealPendingWorkflowBadges(scope) {
    var roots = [];
    if (!scope) roots = [document];
    else if (scope instanceof NodeList || Array.isArray(scope)) roots = Array.from(scope);
    else roots = [scope];
    roots.forEach(function(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('.tm-tier-badge[data-tm-pending-context]').forEach(revealPendingContextBadge);
    });
  }

  function reapplyFilter(input) {
    var tierFilter = input && input.tierFilter;
    var root = (input && input.root) || document;
    if (!tierFilter || !root || !root.querySelectorAll) return;
    root.querySelectorAll('.card-container[data-tm-tier]').forEach(function(el) {
      var tier = el.getAttribute('data-tm-tier');
      var badge = el.querySelector('.tm-tier-badge');
      if (badge) {
        badge.style.display = tierFilter[tier] !== false ? '' : 'none';
      }
    });
  }

  global.TM_CONTENT_BADGES = {
    injectBadge: injectBadge,
    reapplyFilter: reapplyFilter,
    revealPendingContextBadge: revealPendingContextBadge,
    revealPendingWorkflowBadges: revealPendingWorkflowBadges
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
