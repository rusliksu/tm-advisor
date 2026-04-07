// TM Tier Overlay - Content toast helpers
(function(global) {
  'use strict';

  var toastQueue = [];
  var toastActive = false;
  var toastEl = null;
  var toastShownKeys = {};
  var TOAST_ICONS = { deny: '\u26D4', great: '\u2705', milestone: '\uD83C\uDFC6', gen: '\uD83D\uDD04', corp: '\uD83C\uDFED', info: '\u2139\uFE0F' };

  function ensureToast(input) {
    var documentObj = input && input.documentObj;
    if (!documentObj) return null;
    if (toastEl) return toastEl;
    toastEl = documentObj.createElement('div');
    toastEl.className = 'tm-toast';
    documentObj.body.appendChild(toastEl);
    return toastEl;
  }

  function drainToastQueue(input) {
    var documentObj = input && input.documentObj;
    if (!documentObj) {
      toastActive = false;
      return;
    }
    if (toastQueue.length === 0) {
      toastActive = false;
      return;
    }
    toastActive = true;
    var next = toastQueue.shift();
    var msg = next.msg;
    var type = next.type;
    var el = ensureToast({ documentObj: documentObj });
    if (!el) {
      toastActive = false;
      return;
    }
    var icon = TOAST_ICONS[type] || '';
    el.textContent = (icon ? icon + ' ' : '') + msg;
    el.className = 'tm-toast tm-toast-' + type + ' tm-toast-show';
    setTimeout(function() {
      el.classList.remove('tm-toast-show');
      setTimeout(function() {
        drainToastQueue({ documentObj: documentObj });
      }, 300);
    }, 2500);
  }

  function showToast(input) {
    var documentObj = input && input.documentObj;
    var msg = input && input.msg;
    var type = input && input.type;
    if (!documentObj || !msg) return;
    toastQueue.push({ msg: msg, type: type || 'info' });
    if (!toastActive) drainToastQueue({ documentObj: documentObj });
  }

  function canShowToast(category, key) {
    var k = category + ':' + key;
    if (toastShownKeys[k]) return false;
    toastShownKeys[k] = true;
    return true;
  }

  function resetToastKeys() {
    toastShownKeys = {};
  }

  global.TM_CONTENT_TOAST = {
    ensureToast: ensureToast,
    showToast: showToast,
    canShowToast: canShowToast,
    resetToastKeys: resetToastKeys
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
