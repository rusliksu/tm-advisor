// TM Tier Overlay - Prelude package helpers
(function(global) {
  'use strict';

  var _lastPackageNotified = '';

  function checkPreludePackage(input) {
    var enabled = input && input.enabled;
    var documentObj = input && input.documentObj;
    var detectMyCorp = input && input.detectMyCorp;
    var ratings = input && input.ratings;
    var combos = input && input.combos;
    var ruName = input && input.ruName;
    var showToast = input && input.showToast;

    if (!enabled || !documentObj || typeof documentObj.querySelectorAll !== 'function') return;

    var preludeEls = documentObj.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card]');
    if (preludeEls.length < 3) return;

    var myCorp = typeof detectMyCorp === 'function' ? detectMyCorp() : null;
    var preludes = [];
    preludeEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) preludes.push(name);
    });
    if (preludes.length < 3) return;

    var bestPair = null;
    var bestPairScore = -Infinity;

    for (var i = 0; i < preludes.length; i++) {
      for (var j = i + 1; j < preludes.length; j++) {
        var p1 = preludes[i];
        var p2 = preludes[j];
        var d1 = ratings ? ratings[p1] : null;
        var d2 = ratings ? ratings[p2] : null;
        var pairScore = (d1 ? d1.s : 50) + (d2 ? d2.s : 50);

        if (Array.isArray(combos)) {
          for (var ci = 0; ci < combos.length; ci++) {
            var combo = combos[ci];
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

        if (d1 && d1.g && d2 && d2.g) {
          var allTags = new Set();
          d1.g.forEach(function(tag) { allTags.add(tag); });
          d2.g.forEach(function(tag) { allTags.add(tag); });
          if (allTags.size >= 4) pairScore += 5;
          var rares = ['Jovian', 'Science', 'Venus'];
          for (var ri = 0; ri < rares.length; ri++) {
            if (allTags.has(rares[ri])) pairScore += 2;
          }
        }

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

    if (!bestPair) return;

    var pairKey = bestPair.slice().sort().join('+');
    if (pairKey === _lastPackageNotified) return;

    _lastPackageNotified = pairKey;
    var name1 = ((typeof ruName === 'function' ? ruName(bestPair[0]) : '') || bestPair[0]).substring(0, 15);
    var name2 = ((typeof ruName === 'function' ? ruName(bestPair[1]) : '') || bestPair[1]).substring(0, 15);
    if (typeof showToast === 'function') {
      showToast('Лучшая пара: ' + name1 + ' + ' + name2 + ' (счёт: ' + bestPairScore + ')', 'great');
    }
  }

  global.TM_CONTENT_PRELUDE_PACKAGE = {
    checkPreludePackage: checkPreludePackage
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
