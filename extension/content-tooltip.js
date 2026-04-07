// TM Tier Overlay — Content tooltip DOM helpers
(function(global) {
  'use strict';

  var NEGATIVE_REASON_WORDS = ['Конфликт', 'закрыто', 'Поздн', 'Позд.', 'Мало ', 'Нет ',
    'disease', 'бесполезн', 'Табло полно', 'Доска полна',
    'Рука полна', 'Floater trap', 'Флоатер дорого', 'ест свои', 'Окупаем.',
    'Быстр. игра', 'Избыток', 'дефицит', 'Req ~', 'Req далеко',
    'Solar Logistics opp', 'Event не в табло', 'Прод. избыток',
    'Тепл. прод. бесп', 'Темп. макс', 'под атакой', 'Флоат.action поздно'];

  function isNegativeReason(reason) {
    if (/^(Скидка|Сталь|Титан)\s/.test(reason)) return false;
    if (reason.indexOf('\u2192 \u2212') >= 0 || reason.indexOf('-> -') >= 0) return false;
    if (/\s\u2212[123]$/.test(reason) && reason.length < 25) return false;
    if (reason.indexOf('\u2212') >= 0) return true;
    if (/[\s(]\-\d/.test(reason)) return true;
    for (var i = 0; i < NEGATIVE_REASON_WORDS.length; i++) {
      if (reason.indexOf(NEGATIVE_REASON_WORDS[i]) >= 0) return true;
    }
    if (/^(Опп\.|Помогает опп)/.test(reason)) return true;
    if (/[−\-]\d+$/.test(reason)) return true;
    return false;
  }

  function buildReasonsHtml(tipReasons, escHtml) {
    if (!tipReasons) return '';
    var allReasons = tipReasons.split('|');
    var positive = [];
    var negative = [];
    for (var i = 0; i < allReasons.length; i++) {
      if (isNegativeReason(allReasons[i])) negative.push(allReasons[i]);
      else positive.push(allReasons[i]);
    }

    var html = '';
    if (positive.length > 0) {
      html += '<div class="tm-tip-row tm-tip-row--positive' + (negative.length > 0 ? '' : ' tm-tip-row--divider') + '">';
      for (var pi = 0; pi < positive.length; pi++) {
        html += '<div>+ ' + escHtml(positive[pi]) + '</div>';
      }
      html += '</div>';
    }
    if (negative.length > 0) {
      html += '<div class="tm-tip-row tm-tip-row--negative tm-tip-row--divider">';
      for (var ni = 0; ni < negative.length; ni++) {
        html += '<div>\u2212 ' + escHtml(negative[ni]) + '</div>';
      }
      html += '</div>';
    }
    return html;
  }

  function buildROIHtml(input) {
    var ctx = input && input.ctx;
    var fx = input && input.fx;
    if (!ctx || !fx) return '';

    var mcVal = input.computeCardValue(fx, ctx.gensLeft);
    var baseCost = (fx.c || 0) + input.draftCost;
    var cardTagSet = new Set();

    if (input.effectTags) {
      for (var ti = 0; ti < input.effectTags.length; ti++) {
        cardTagSet.add(input.effectTags[ti]);
      }
    }

    if (cardTagSet.size === 0 && input.ratingGroups) {
      input.ratingGroups.split(',').forEach(function(tag) {
        cardTagSet.add(tag.trim().toLowerCase());
      });
    }

    var effectiveCost = (ctx.discounts && cardTagSet.size > 0)
      ? input.getEffectiveCost(fx.c || 0, cardTagSet, ctx.discounts) + input.draftCost
      : baseCost;
    var roi = mcVal - effectiveCost;
    var roiColor = roi >= 10 ? '#2ecc71' : roi >= 0 ? '#f1c40f' : '#e74c3c';
    var costStr = effectiveCost < baseCost
      ? '<s>' + baseCost + '</s> ' + effectiveCost
      : '' + effectiveCost;

    return '<div class="tm-tip-row tm-tip-row--divider">'
      + 'Ценность ' + Math.round(mcVal) + ' \u2212 Стоим. ' + costStr + ' = <span style="color:' + roiColor + '"><b>' + (roi >= 0 ? '+' : '') + Math.round(roi) + ' MC</b></span>'
      + '</div>';
  }

  function buildEVHtml(input) {
    if (!input || typeof input.scoreCard !== 'function') return '';
    var ctx = input.ctx;
    if (!ctx) return '';

    var pv = input.pv || {};
    var game = pv.game || {};
    var thisPlayer = pv.thisPlayer || {};
    var gp = ctx.globalParams || {};
    var state = {
      game: {
        generation: ctx.gen || 5,
        temperature: typeof gp.temp === 'number' ? gp.temp : -30,
        oxygenLevel: typeof gp.oxy === 'number' ? gp.oxy : 0,
        oceans: typeof gp.oceans === 'number' ? gp.oceans : 0,
        venusScaleLevel: typeof gp.venus === 'number' ? gp.venus : 0,
        gameOptions: game.gameOptions || {}
      },
      players: (game.players || [{}, {}, {}]).map(function() { return {}; }),
      thisPlayer: {
        tags: ctx.tags || {},
        megacredits: ctx.mc || 0,
        megaCreditProduction: ctx.prod ? ctx.prod.mc : 0,
        steel: ctx.steel || 0,
        steelValue: ctx.steelVal || 2,
        steelProduction: ctx.prod ? ctx.prod.steel : 0,
        titanium: ctx.titanium || 0,
        titaniumValue: ctx.tiVal || 3,
        titaniumProduction: ctx.prod ? ctx.prod.ti : 0,
        energy: thisPlayer.energy || 0,
        energyProduction: ctx.prod ? ctx.prod.energy : 0,
        heat: ctx.heat || thisPlayer.heat || 0,
        heatProduction: ctx.prod ? ctx.prod.heat : 0,
        plants: thisPlayer.plants || 0,
        plantProduction: ctx.prod ? ctx.prod.plants : 0,
        cardsInHand: thisPlayer.cardsInHand || [],
        tableau: ctx.tableauNames ? Array.from(ctx.tableauNames).map(function(name) { return {name: name}; }) : []
      }
    };

    var card = {
      name: input.name,
      calculatedCost: input.cardCost || 0
    };

    try {
      var result = input.scoreCard(card, state);
      if (result == null || isNaN(result)) return '';

      var net = Math.round(result);
      var netColor = net >= 10 ? '#2ecc71' : net >= 0 ? '#f1c40f' : '#e74c3c';

      return '<div class="tm-tip-row" style="font-size:12px;padding:3px 6px;background:rgba(156,39,176,0.08);border-left:2px solid #9c27b0;border-radius:3px">'
        + '<b style="color:#9c27b0">EV</b> '
        + '<span style="color:' + netColor + ';font-weight:bold">' + (net >= 0 ? '+' : '') + net + ' MC</span>'
        + '</div>';
    } catch (ex) {
      return '';
    }
  }

  function buildHeaderHtml(input) {
    if (!input) return '';
    var html = '<div class="tm-tip-header">';

    if (input.isOppCard) {
      html += '<span class="tm-tip-opp">Для: ' + input.escHtml(input.opponentName || '?') + '</span>';
    }

    if (input.ctxScore !== input.baseScore) {
      var delta = input.ctxScore - input.baseScore;
      html += '<span class="tm-tip-tier tm-tier-' + input.baseTier + '">' + input.baseTier + input.baseScore + '</span>';
      html += '<span style="color:#aaa;margin:0 3px">\u2192</span>';
      html += '<span class="tm-tip-tier tm-tier-' + input.ctxTier + '">' + input.ctxTier + input.ctxScore + '</span>';
      html += '<span style="color:' + (delta > 0 ? '#4caf50' : '#f44336') + ';font-weight:bold;margin-left:4px">' + (delta > 0 ? '+' : '') + delta + '</span> ';
    } else {
      html += '<span class="tm-tip-tier tm-tier-' + input.baseTier + '">' + input.baseTier + ' ' + input.baseScore + '</span> ';
    }

    if (typeof input.cardCost === 'number' && !isNaN(input.cardCost)) {
      html += '<span class="tm-tip-cost">' + input.cardCost + ' MC</span> ';
    }

    html += '<span class="tm-tip-name">' + input.escHtml(input.localizedName || input.name || '') + '</span>';
    if (input.localizedName && input.localizedName !== input.name) {
      html += '<br><span class="tm-tip-ru">' + input.escHtml(input.name) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function buildDescriptionHtml(input) {
    if (!input || !input.escHtml) return '';
    var description = input.localizedDesc || input.fallbackDesc || '';
    if (!description) return '';
    return '<div class="tm-tip-row tm-tip-row--desc">' + input.escHtml(description) + '</div>';
  }

  function buildAnalysisHtml(input) {
    if (!input || input.isInHand) return '';
    var html = '';
    if (input.analysisText) {
      html += '<div class="tm-tip-row">' + input.escHtml(input.analysisText) + '</div>';
    }
    if (input.whenText) {
      html += '<div class="tm-tip-row tm-tip-row--muted">' + input.escHtml(input.whenText) + '</div>';
    }
    return html;
  }

  function buildTooltipHtml(input) {
    if (!input || !Array.isArray(input.sections)) return '';
    var html = '';
    for (var i = 0; i < input.sections.length; i++) {
      if (input.sections[i]) html += input.sections[i];
    }
    return html;
  }

  function buildTriggerHtml(input) {
    if (!input || !input.hits || input.hits.length === 0) return '';
    var rowClass = input.isOpponent ? 'tm-tip-row--trigger-opp' : 'tm-tip-row--trigger';
    return '<div class="tm-tip-row ' + rowClass + '">\u26A1 ' + input.hits.map(input.escHtml).join(', ') + '</div>';
  }

  function buildRequirementHtml(input) {
    if (!input || !input.checks || input.checks.length === 0) return '';
    return '<div class="tm-tip-row tm-tip-row--error">\u2717 ' + input.checks.join(' | ') + '</div>';
  }

  function buildTakeThatHtml(input) {
    if (!input || !input.message) return '';
    return '<div class="tm-tip-row tm-tip-row--warning">\u26A0 ' + input.playerCountLabel + ': ' + input.escHtml(input.message) + '</div>';
  }

  function buildComboHtml(input) {
    if (!input || !input.comboText) return '';
    return '<div class="tm-tip-row tm-tip-row--combo">\uD83D\uDD17 ' + input.escHtml(input.comboText) + '</div>';
  }

  function buildConflictHtml(input) {
    if (!input || !input.conflictText) return '';
    return '<div class="tm-tip-row tm-tip-row--conflict">\u26A0 Конфликт: ' + input.escHtml(input.conflictText) + '</div>';
  }

  function buildPersonalStatsHtml(cardStats) {
    if (!cardStats || cardStats.timesPlayed < 3) return '';
    var avgVP = (cardStats.totalVP / cardStats.timesPlayed).toFixed(1);
    var avgPlace = typeof cardStats.avgPlaceScore === 'number' ? cardStats.avgPlaceScore.toFixed(2) : null;
    var html = '<div class="tm-tip-row" style="font-size:12px;padding:4px 6px;background:rgba(52,152,219,0.1);border-radius:3px;border-left:2px solid #3498db;margin-top:4px">';
    html += '<b style="color:#3498db">Твоя статистика</b><br>';
    html += cardStats.timesPlayed + ' игр | Avg VP: ' + avgVP + ' | Max: ' + cardStats.maxVP;
    if (avgPlace !== null) html += ' | Avg place: ' + avgPlace;
    if (cardStats.genPlayedSum && cardStats.timesPlayed > 0) {
      var avgGen = (cardStats.genPlayedSum / cardStats.timesPlayed).toFixed(1);
      html += ' | Avg gen: ' + avgGen;
    }

    var contextParts = [];
    if (cardStats.contexts.withColonies && cardStats.contexts.withColonies.count >= 2) {
      contextParts.push('Колонии: ' + (cardStats.contexts.withColonies.totalVP / cardStats.contexts.withColonies.count).toFixed(1) + ' VP (' + cardStats.contexts.withColonies.count + ')');
    }
    if (cardStats.contexts.withTurmoil && cardStats.contexts.withTurmoil.count >= 2) {
      contextParts.push('Турмоил: ' + (cardStats.contexts.withTurmoil.totalVP / cardStats.contexts.withTurmoil.count).toFixed(1) + ' VP (' + cardStats.contexts.withTurmoil.count + ')');
    }
    if (cardStats.contexts.withVenus && cardStats.contexts.withVenus.count >= 2) {
      contextParts.push('Венера: ' + (cardStats.contexts.withVenus.totalVP / cardStats.contexts.withVenus.count).toFixed(1) + ' VP (' + cardStats.contexts.withVenus.count + ')');
    }
    if (cardStats.contexts.withWGT && cardStats.contexts.withWGT.count >= 2) {
      contextParts.push('WGT: ' + (cardStats.contexts.withWGT.totalVP / cardStats.contexts.withWGT.count).toFixed(1) + ' VP (' + cardStats.contexts.withWGT.count + ')');
    }
    if (contextParts.length > 0) {
      html += '<br><span style="color:#888">' + contextParts.join(' | ') + '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderTooltipSections(input) {
    if (!input) return '';
    var metaRowsState = input.metaRowsState || {};
    return buildTooltipHtml({
      sections: [
        buildHeaderHtml({
          baseScore: input.baseScore,
          baseTier: input.baseTier,
          cardCost: input.cardCost,
          ctxScore: input.ctxScore,
          ctxTier: input.ctxTier,
          escHtml: input.escHtml,
          isOppCard: input.isOppCard,
          localizedName: input.localizedName,
          name: input.name,
          opponentName: input.opponentName
        }),
        buildDescriptionHtml({
          escHtml: input.escHtml,
          fallbackDesc: input.fallbackDesc,
          localizedDesc: input.localizedDesc
        }),
        buildReasonsHtml(input.tipReasons, input.escHtml),
        buildROIHtml(input.roiInput),
        buildEVHtml(input.evInput),
        buildAnalysisHtml({
          analysisText: input.analysisText,
          escHtml: input.escHtml,
          isInHand: input.isInHand,
          whenText: input.whenText
        }),
        input.synHtml || '',
        input.triggerHtml || '',
        input.requirementHtml || '',
        metaRowsState.takeThatMessage ? buildTakeThatHtml({
          escHtml: input.escHtml,
          message: metaRowsState.takeThatMessage,
          playerCountLabel: metaRowsState.playerCountLabel
        }) : '',
        metaRowsState.comboText ? buildComboHtml({
          comboText: metaRowsState.comboText,
          escHtml: input.escHtml
        }) : '',
        metaRowsState.conflictText ? buildConflictHtml({
          conflictText: metaRowsState.conflictText,
          escHtml: input.escHtml
        }) : '',
        buildPersonalStatsHtml(input.cardStats)
      ]
    });
  }

  function createTooltipPanel(onEnter, onLeave) {
    var tooltipEl = document.createElement('div');
    tooltipEl.className = 'tm-tooltip-panel';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', function() {
      if (typeof onEnter === 'function') onEnter();
    });
    tooltipEl.addEventListener('mouseleave', function() {
      if (typeof onLeave === 'function') onLeave();
    });
    return tooltipEl;
  }

  function positionTooltip(tip, srcEl) {
    if (!tip || !srcEl) return;
    var rect = srcEl.getBoundingClientRect();
    var tipW = tip.offsetWidth || 400;
    var tipH = tip.offsetHeight || 300;
    var left = rect.right + 10;
    var top = rect.top;
    if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 10;
    if (left < 8) left = 8;
    if (top + tipH > window.innerHeight - 8) top = window.innerHeight - tipH - 8;
    if (top < 8) top = 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  global.TM_CONTENT_TOOLTIP = {
    buildAnalysisHtml: buildAnalysisHtml,
    buildComboHtml: buildComboHtml,
    buildConflictHtml: buildConflictHtml,
    buildRequirementHtml: buildRequirementHtml,
    buildTooltipHtml: buildTooltipHtml,
    buildEVHtml: buildEVHtml,
    buildDescriptionHtml: buildDescriptionHtml,
    buildHeaderHtml: buildHeaderHtml,
    buildPersonalStatsHtml: buildPersonalStatsHtml,
    buildReasonsHtml: buildReasonsHtml,
    buildROIHtml: buildROIHtml,
    renderTooltipSections: renderTooltipSections,
    buildTriggerHtml: buildTriggerHtml,
    buildTakeThatHtml: buildTakeThatHtml,
    createTooltipPanel: createTooltipPanel,
    isNegativeReason: isNegativeReason,
    positionTooltip: positionTooltip
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
