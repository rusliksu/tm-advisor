// TM Tier Overlay - Postgame insight helpers
(function(global) {
  'use strict';

  var _postGameInsightsEl = null;

  function detectVPEngines(input) {
    var tableau = input && input.tableau;
    var gensLeft = input && input.gensLeft;
    var cardEffects = input && input.cardEffects;
    if (!tableau || !cardEffects) return [];

    var engines = [];
    for (var i = 0; i < tableau.length; i++) {
      var cn = tableau[i].name || tableau[i];
      var fx = cardEffects[cn];
      if (!fx || !fx.vpAcc) continue;
      var rate = fx.vpAcc;
      var resources = tableau[i].resources || 0;
      var perVP = fx.vpPer || 1;
      var currentVP = Math.floor(resources / perVP);
      var projectedVP = currentVP + Math.floor((rate * gensLeft) / perVP);
      var threat = rate < 0.7 ? 'green' : rate <= 1.5 ? 'yellow' : 'red';
      engines.push({
        name: cn,
        rate: rate,
        perVP: perVP,
        resources: resources,
        currentVP: currentVP,
        projectedVP: projectedVP,
        threat: threat
      });
    }
    engines.sort(function(a, b) { return b.projectedVP - a.projectedVP; });
    return engines;
  }

  function generatePostGameInsights(input) {
    var pv = input && input.pv;
    var detectGeneration = input && input.detectGeneration;
    var computeVPBreakdown = input && input.computeVPBreakdown;
    var estimateGensLeft = input && input.estimateGensLeft;
    var detectMyCorp = input && input.detectMyCorp;
    var getPlayerTagCount = input && input.getPlayerTagCount;
    var cardN = input && input.cardN;
    var getFx = input && input.getFx;
    var lookupCardData = input && input.lookupCardData;
    var draftIntel = input && input.draftIntel;
    var draftHistory = input && input.draftHistory;
    var oppPredictedCards = input && input.oppPredictedCards;
    var ratings = input && input.ratings;
    var cardEffects = input && input.cardEffects;
    var cardVp = input && input.cardVp;
    var corps = input && input.corps;
    var ruName = input && input.ruName;

    if (!pv || !pv.thisPlayer || !pv.players || typeof computeVPBreakdown !== 'function') return null;
    if (typeof cardN !== 'function') cardN = function(card) { return card && (card.name || card); };
    if (typeof ruName !== 'function') ruName = function(name) { return name || ''; };

    var gen = typeof detectGeneration === 'function' ? detectGeneration() : 0;
    var myColor = pv.thisPlayer.color;
    var myBP = computeVPBreakdown(pv.thisPlayer, pv);
    var opponents = pv.players.filter(function(p) { return p.color !== myColor; });
    var insights = [];

    var allBPs = [{ name: pv.thisPlayer.name || 'Я', color: myColor, bp: myBP, isMe: true }];
    for (var i = 0; i < opponents.length; i++) {
      allBPs.push({
        name: opponents[i].name || opponents[i].color,
        color: opponents[i].color,
        bp: computeVPBreakdown(opponents[i], pv),
        isMe: false
      });
    }
    allBPs.sort(function(a, b) { return b.bp.total - a.bp.total; });
    var winner = allBPs[0];
    var iWon = winner.isMe;
    var vpDiff = iWon ? (allBPs.length > 1 ? myBP.total - allBPs[1].bp.total : 0) : allBPs[0].bp.total - myBP.total;

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
      var maDesc = '';
      if (Math.abs(maGap) >= 10) {
        maDesc = iWon
          ? (maGap > 0 ? ' — решающее преимущество!' : ' — преодолён мастерством!')
          : (maGap < 0 ? ' — решающий фактор!' : ' — не хватило!');
      }
      insights.push({
        icon: '🏆',
        text: 'M&A gap: ' + (maGap >= 0 ? '+' : '') + maGap + ' VP' + maDesc,
        color: maGap > 0 ? '#2ecc71' : '#e74c3c'
      });
    }

    for (var i3 = 0; i3 < opponents.length; i3++) {
      if (opponents[i3].tableau) {
        var engines = detectVPEngines({
          tableau: opponents[i3].tableau,
          gensLeft: typeof estimateGensLeft === 'function' ? estimateGensLeft(pv) : 0,
          cardEffects: cardEffects
        });
        if (engines.length > 0) {
          var totalEVP = 0;
          for (var ei = 0; ei < engines.length; ei++) totalEVP += engines[ei].projectedVP;
          if (totalEVP >= 8) {
            insights.push({
              icon: '⚙',
              text: (opponents[i3].name || opponents[i3].color) + ': VP engines ~' + totalEVP + ' VP',
              color: '#bb86fc'
            });
          }
        }
      }
    }

    var lengthStr = gen <= 7 ? 'Быстрая игра (' + gen + ' пок.)' : gen <= 9 ? 'Стандартная (' + gen + ' пок.)' : 'Длинная игра (' + gen + ' пок.)';
    insights.push({ icon: '⏱', text: lengthStr, color: '#3498db' });

    if (allBPs.length >= 2) {
      var cats = ['tr', 'greenery', 'city', 'cards', 'milestones', 'awards'];
      var catLabels = { tr: 'TR', greenery: 'Озеленение', city: 'Города', cards: 'Карты', milestones: 'Вехи', awards: 'Награды' };
      var biggestLoss = null;
      var biggestWin = null;
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

    if (draftIntel && typeof draftIntel.appendDraftInsights === 'function') {
      draftIntel.appendDraftInsights({
        insights: insights,
        pv: pv,
        draftHistory: draftHistory,
        oppPredictedCards: oppPredictedCards,
        ratings: ratings,
        ruName: ruName
      });
    }

    var myCorp = typeof detectMyCorp === 'function' ? detectMyCorp() : null;
    if (myCorp && pv.thisPlayer.tableau && ratings) {
      var synCount = 0;
      var corpData = ratings[myCorp];
      var corpYSet = new Set();
      if (corpData && corpData.y) {
        for (var cyi = 0; cyi < corpData.y.length; cyi++) corpYSet.add(corpData.y[cyi][0]);
      }
      var reqCorps = { Inventrix: true };
      var isReqCorp = false;
      for (var rc6 = 0; rc6 < pv.thisPlayer.tableau.length; rc6++) {
        var rcn = pv.thisPlayer.tableau[rc6].name || pv.thisPlayer.tableau[rc6];
        if (reqCorps[rcn]) { isReqCorp = true; break; }
      }

      var tableau = pv.thisPlayer.tableau;
      for (var t6i = 0; t6i < tableau.length; t6i++) {
        var cn6 = tableau[t6i].name || tableau[t6i];
        if (!cn6) continue;
        if (corpYSet.has(cn6)) { synCount++; continue; }
        var cd6 = ratings[cn6];
        if (cd6 && cd6.y) {
          for (var y6i = 0; y6i < cd6.y.length; y6i++) {
            if (cd6.y[y6i][0] === myCorp) { synCount++; break; }
          }
        }
        if (isReqCorp && !corpYSet.has(cn6) && cardEffects) {
          var fx6 = cardEffects[cn6];
          if (fx6 && (fx6.minG != null || fx6.maxG != null)) synCount++;
        }
      }
      if (tableau.length > 0) {
        var synPct = Math.round(synCount / tableau.length * 100);
        insights.push({
          icon: '🔗',
          text: myCorp.split(' ')[0] + ' синергия: ' + synCount + '/' + tableau.length + ' карт (' + synPct + '%)',
          color: synPct >= 30 ? '#2ecc71' : '#f39c12'
        });
      }
    }

    var summary = iWon ? 'Победа на ' + vpDiff + ' VP' : 'Проигрыш на ' + vpDiff + ' VP';
    if (Math.abs(maGap) >= 5) {
      if (iWon && maGap < 0) summary += ' — M&A gap ' + maGap + ' VP преодолён';
      else if (iWon && maGap > 0) summary += ' — M&A gap +' + maGap + ' VP помог';
      else if (!iWon && maGap < 0) summary += ' — M&A gap ' + maGap + ' VP решил игру';
      else summary += ' — M&A gap +' + maGap + ' VP не хватило';
    }

    var cardEfficiency = [];
    if (pv.thisPlayer.tableau && cardEffects) {
      var _ceTagCount = function(plr, tag) {
        return typeof getPlayerTagCount === 'function' ? getPlayerTagCount(plr, tag) : 0;
      };
      for (var cei = 0; cei < pv.thisPlayer.tableau.length; cei++) {
        var ceCard = pv.thisPlayer.tableau[cei];
        var ceName = cardN(ceCard);
        if (!ceName) continue;
        var isCeCorpCard = (ceCard.cardType === 'corp') || (corps && corps[ceName]);
        if (isCeCorpCard) continue;
        var ceFx = cardEffects[ceName];
        var isCePrelude = (ceCard.cardType === 'prelude') || (ceFx && ceFx.c === 0 && !ceFx.mp && !ceFx.sp && !ceFx.tp && !ceFx.ep && !ceFx.hp && !ceFx.pp && ceCard.cardType !== 'automated' && ceCard.cardType !== 'active' && ceCard.cardType !== 'event');
        if (isCePrelude && ratings && ratings[ceName] && ceCard.cardType && ceCard.cardType !== 'prelude') isCePrelude = false;
        if (isCePrelude) continue;

        var cePrintedCost = ceFx ? (ceFx.c || 0) : 0;
        if (!ceFx && ceCard.calculatedCost != null) cePrintedCost = ceCard.calculatedCost;
        var ceTotalCost = cePrintedCost + 3;

        var ceVP = 0;
        var ceVpDef = cardVp && typeof lookupCardData === 'function' ? lookupCardData(cardVp, ceName) : null;
        if (ceVpDef) {
          if (ceVpDef.type === 'static') {
            ceVP = ceVpDef.vp || 0;
          } else if (ceVpDef.type === 'per_tag') {
            ceVP = Math.floor(_ceTagCount(pv.thisPlayer, ceVpDef.tag) / (ceVpDef.per || 1));
          } else if (ceVpDef.type === 'per_resource' && ceCard.resources > 0) {
            ceVP = Math.floor(ceCard.resources / (ceVpDef.per || 1));
          } else if (ceVpDef.type === 'per_city') {
            var ceTotalCities = 0;
            if (pv.players) for (var cci = 0; cci < pv.players.length; cci++) ceTotalCities += (pv.players[cci].citiesCount || 0);
            ceVP = Math.floor(ceTotalCities / (ceVpDef.per || 3));
          } else if (ceVpDef.type === 'per_colony') {
            var ceTotalCol = 0;
            if (pv.players) for (var ccli = 0; ccli < pv.players.length; ccli++) ceTotalCol += (pv.players[ccli].coloniesCount || 0);
            ceVP = Math.floor(ceTotalCol / (ceVpDef.per || 3));
          }
        }
        if (!ceVpDef && ceCard.resources && ceCard.resources > 0) {
          var ceFxVp = typeof getFx === 'function' ? getFx(ceName) : null;
          if (ceFxVp && ceFxVp.vpAcc) ceVP = Math.floor(ceCard.resources / (ceFxVp.vpPer || 1));
        }
        if (!ceVpDef && ceFx && ceFx.vp && typeof ceFx.vp === 'number') ceVP = ceFx.vp;
        if (ceVP === 0 && ceCard.victoryPoints !== undefined && ceCard.victoryPoints !== 0) {
          if (typeof ceCard.victoryPoints === 'number') ceVP = ceCard.victoryPoints;
          else if (ceCard.victoryPoints && typeof ceCard.victoryPoints.points === 'number') ceVP = ceCard.victoryPoints.points;
        }

        var ceEff = ceTotalCost > 0 ? (ceVP / ceTotalCost) : 0;
        cardEfficiency.push({ name: ceName, vp: ceVP, cost: ceTotalCost, printedCost: cePrintedCost, eff: ceEff });
      }
      cardEfficiency.sort(function(a, b) { return b.eff - a.eff; });
    }

    return {
      insights: insights,
      summary: summary,
      iWon: iWon,
      myTotal: myBP.total,
      winner: winner,
      allBPs: allBPs,
      cardEfficiency: cardEfficiency
    };
  }

  function clearPostGameInsights() {
    if (_postGameInsightsEl) {
      _postGameInsightsEl.remove();
      _postGameInsightsEl = null;
    }
  }

  function showPostGameInsights(input) {
    var documentObj = input && input.documentObj;
    var escHtml = input && input.escHtml;
    var ruName = input && input.ruName;
    var data = generatePostGameInsights(input);
    if (!data || !documentObj || typeof documentObj.createElement !== 'function' || typeof escHtml !== 'function') return null;
    if (typeof ruName !== 'function') ruName = function(name) { return name || ''; };

    clearPostGameInsights();
    _postGameInsightsEl = documentObj.createElement('div');
    _postGameInsightsEl.className = 'tm-postgame-overlay';

    var html = '<div class="tm-postgame-inner">';
    html += '<div class="tm-postgame-title">' + (data.iWon ? '🎉 Победа!' : '😤 Поражение') + '</div>';
    html += '<div class="tm-postgame-summary" style="color:' + (data.iWon ? '#2ecc71' : '#e74c3c') + '">' + escHtml(data.summary) + '</div>';

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

    var vpCats = [
      { key: 'tr', label: 'TR', color: '#3498db' },
      { key: 'greenery', label: 'Озеленение', color: '#27ae60' },
      { key: 'city', label: 'Города', color: '#95a5a6' },
      { key: 'cards', label: 'Карты', color: '#e67e22' },
      { key: 'milestones', label: 'Вехи', color: '#f1c40f' },
      { key: 'awards', label: 'Награды', color: '#9b59b6' }
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

    for (var i2 = 0; i2 < data.insights.length; i2++) {
      var ins = data.insights[i2];
      html += '<div style="font-size:13px;color:' + ins.color + ';padding:3px 0">' + ins.icon + ' ' + escHtml(ins.text) + '</div>';
    }

    if (data.cardEfficiency && data.cardEfficiency.length > 0) {
      html += '<div style="margin:12px 0;font-size:12px">';
      html += '<div style="font-weight:bold;margin-bottom:6px;color:#ccc">📊 Эффективность карт</div>';

      var bestCards = data.cardEfficiency.filter(function(c) { return c.vp > 0; }).slice(0, 5);
      if (bestCards.length > 0) {
        html += '<div style="color:#2ecc71;margin-bottom:4px;font-size:11px">Лучшие:</div>';
        for (var bci = 0; bci < bestCards.length; bci++) {
          var bc = bestCards[bci];
          var bcDisplay = ruName(bc.name) || bc.name;
          var bcEff = bc.eff.toFixed(2);
          html += '<div style="display:flex;justify-content:space-between;padding:1px 6px;color:#aaa;font-size:11px">';
          html += '<span>' + escHtml(bcDisplay) + '</span>';
          html += '<span style="color:#2ecc71">' + bc.vp + ' VP / ' + bc.cost + ' MC = ' + bcEff + '</span>';
          html += '</div>';
        }
      }

      var worstCards = data.cardEfficiency.filter(function(c) { return c.vp === 0 && c.cost > 0; });
      worstCards.sort(function(a, b) { return b.cost - a.cost; });
      worstCards = worstCards.slice(0, 5);
      if (worstCards.length > 0) {
        html += '<div style="color:#e74c3c;margin-bottom:4px;margin-top:6px;font-size:11px">Худшие (0 VP):</div>';
        for (var wci = 0; wci < worstCards.length; wci++) {
          var wc = worstCards[wci];
          var wcDisplay = ruName(wc.name) || wc.name;
          html += '<div style="display:flex;justify-content:space-between;padding:1px 6px;color:#888;font-size:11px">';
          html += '<span>' + escHtml(wcDisplay) + '</span>';
          html += '<span style="color:#e74c3c">0 VP / ' + wc.cost + ' MC</span>';
          html += '</div>';
        }
      }

      html += '</div>';
    }

    html += '<button class="tm-postgame-close">Закрыть</button>';
    html += '</div>';

    _postGameInsightsEl.innerHTML = html;
    documentObj.body.appendChild(_postGameInsightsEl);
    _postGameInsightsEl.querySelector('.tm-postgame-close').addEventListener('click', clearPostGameInsights);
    return _postGameInsightsEl;
  }

  global.TM_CONTENT_POSTGAME = {
    clearPostGameInsights: clearPostGameInsights,
    detectVPEngines: detectVPEngines,
    generatePostGameInsights: generatePostGameInsights,
    showPostGameInsights: showPostGameInsights
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
