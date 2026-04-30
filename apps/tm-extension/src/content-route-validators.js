// TM Tier Overlay - route validators for draft and opening corp scoring.
(function(global) {
  'use strict';

  function lookupCardMapEntry(map, name) {
    if (!map || !name) return null;
    return map[name] || null;
  }

  function lookupCardTagsEntry(cardTagsData, ratings, name) {
    if (!name) return [];
    var rawTags = lookupCardMapEntry(cardTagsData, name);
    if (!rawTags && ratings) {
      var rating = lookupCardMapEntry(ratings, name);
      rawTags = rating && rating.g ? rating.g : null;
    }
    if (!rawTags) return [];
    if (Array.isArray(rawTags)) {
      return rawTags.map(function(tag) { return String(tag || '').toLowerCase(); });
    }
    return String(rawTags).split(/[,;\s]+/).map(function(tag) { return tag.toLowerCase(); }).filter(Boolean);
  }

  function hasBuildingTagForRoute(cardTagsData, ratings, name) {
    var tags = lookupCardTagsEntry(cardTagsData, ratings, name);
    return tags.indexOf('building') >= 0;
  }

  function hasRouteTag(cardTagsData, ratings, name, tag) {
    var tags = lookupCardTagsEntry(cardTagsData, ratings, name);
    return tags.indexOf(tag) >= 0;
  }

  function hasPersistentRouteTag(cardTagsData, ratings, name, tag) {
    var tags = lookupCardTagsEntry(cardTagsData, ratings, name);
    return tags.indexOf(tag) >= 0 && tags.indexOf('event') < 0;
  }

  function getCtxGlobalParam(ctx, param) {
    var gp = ctx && ctx.globalParams ? ctx.globalParams : {};
    if (param === 'temperature') {
      if (typeof gp.temp === 'number') return gp.temp;
      if (typeof gp.temperature === 'number') return gp.temperature;
      return -30;
    }
    if (param === 'oxygen') {
      if (typeof gp.oxy === 'number') return gp.oxy;
      if (typeof gp.oxygen === 'number') return gp.oxygen;
      return 0;
    }
    if (param === 'oceans') return typeof gp.oceans === 'number' ? gp.oceans : 0;
    if (param === 'venus') return typeof gp.venus === 'number' ? gp.venus : 0;
    return 0;
  }

  function getGlobalReqUnmetSteps(reqs, ctx) {
    if (!reqs) return 0;
    var total = 0;
    for (var param in reqs) {
      var req = reqs[param];
      if (!req || typeof req !== 'object') continue;
      var current = getCtxGlobalParam(ctx, param);
      var step = param === 'temperature' || param === 'venus' ? 2 : 1;
      if (typeof req.min === 'number' && current < req.min) {
        total += Math.max(1, Math.ceil((req.min - current) / step));
      }
      if (typeof req.max === 'number' && current > req.max) {
        total += Math.max(1, Math.ceil((current - req.max) / step));
      }
    }
    return total;
  }

  function cardTagRequirementsMet(tagReqs, ctx) {
    if (!tagReqs) return true;
    var tags = ctx && ctx.tags ? ctx.tags : {};
    var wild = getRouteRequirementWildCount(ctx);
    for (var tag in tagReqs) {
      if (typeof tagReqs[tag] === 'object') continue;
      var need = tagReqs[tag] || 0;
      var have = (tags[tag] || 0) + (tag === 'wild' ? 0 : wild);
      if (have < need) return false;
    }
    return true;
  }

  function formatTagGateLabel(tag) {
    if (!tag) return '';
    return String(tag).charAt(0).toUpperCase() + String(tag).slice(1);
  }

  function countRequirementTags(tagCounts, tag, wild) {
    if (!tagCounts || !tag) return wild || 0;
    var exact = tagCounts[tag] || 0;
    return exact + (tag === 'wild' ? 0 : (wild || 0));
  }

  function getPersistentHandTagCounts(myHand, excludedCardName, cardTagsData, ratings) {
    var counts = {};
    if (!Array.isArray(myHand)) return counts;
    for (var i = 0; i < myHand.length; i++) {
      var name = myHand[i];
      if (!name || name === excludedCardName) continue;
      var tags = lookupCardTagsEntry(cardTagsData, ratings, name);
      if (tags.indexOf('event') >= 0) continue;
      for (var j = 0; j < tags.length; j++) {
        if (tags[j] !== 'event') counts[tags[j]] = (counts[tags[j]] || 0) + 1;
      }
    }
    return counts;
  }

  function routeCardName(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return entry.name || entry.cardName || '';
  }

  function routeHasTableauName(ctx, name) {
    if (!ctx || !name) return false;
    if (ctx.tableauNames && ctx.tableauNames.has && ctx.tableauNames.has(name)) return true;
    if (Array.isArray(ctx.tableauNames)) return ctx.tableauNames.indexOf(name) >= 0;
    return false;
  }

  function getRouteXavierRequirementWildCount(ctx) {
    if (!ctx) return 0;
    if (typeof ctx._xavierRequirementWildCount === 'number') {
      return Math.max(0, ctx._xavierRequirementWildCount);
    }
    if (typeof ctx.xavierRequirementWildCount === 'number') {
      return Math.max(0, ctx.xavierRequirementWildCount);
    }

    var sawExplicitXavier = false;
    var lists = [];
    if (Array.isArray(ctx.tableau)) lists.push(ctx.tableau);
    if (Array.isArray(ctx.myTableau)) lists.push(ctx.myTableau);
    if (Array.isArray(ctx.tableauCards)) lists.push(ctx.tableauCards);
    for (var li = 0; li < lists.length; li++) {
      for (var i = 0; i < lists[li].length; i++) {
        var entry = lists[li][i];
        if (routeCardName(entry) !== 'Xavier') continue;
        sawExplicitXavier = true;
        if (entry && typeof entry === 'object' && entry.isDisabled === true) continue;
        return 2;
      }
    }
    if (sawExplicitXavier) return 0;

    return routeHasTableauName(ctx, 'Xavier') ? 2 : 0;
  }

  function getRouteRequirementWildCount(ctx) {
    var tags = ctx && ctx.tags ? ctx.tags : {};
    return (tags.wild || 0) + getRouteXavierRequirementWildCount(ctx);
  }

  function getHandTagSupport(ctx, tag, haveNow, directHandCounts) {
    var support = 0;
    var handCounts = ctx && Object.prototype.hasOwnProperty.call(ctx, '_persistentHandTagCounts')
      ? ctx._persistentHandTagCounts
      : (ctx ? ctx._handTagCounts : null);
    var projectedTags = ctx && Object.prototype.hasOwnProperty.call(ctx, 'tagsWithPersistentHand')
      ? ctx.tagsWithPersistentHand
      : (ctx ? ctx.tagsWithHand : null);
    if (directHandCounts) {
      support = Math.max(support, countRequirementTags(directHandCounts, tag, 0));
      return support;
    }
    if (handCounts) support = Math.max(support, countRequirementTags(handCounts, tag, 0));
    if (projectedTags) {
      var projectedHave = countRequirementTags(projectedTags, tag, 0);
      support = Math.max(support, Math.max(0, projectedHave - haveNow));
    }
    return support;
  }

  function isCheapPlayableTagSupport(targetName, sourceCardName, tag, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs) {
    if (!targetName || targetName === sourceCardName) return false;
    if (!hasPersistentRouteTag(cardTagsData, ratings, targetName, tag)) return false;
    var fx = lookupCardMapEntry(cardEffects, targetName) || {};
    var cost = typeof fx.c === 'number' ? fx.c : 99;
    if (cost > 12) return false;
    if (getGlobalReqUnmetSteps(lookupCardMapEntry(cardGlobalReqs, targetName), ctx) > 0) return false;
    if (!cardTagRequirementsMet(lookupCardMapEntry(cardTagReqs, targetName), ctx)) return false;
    return true;
  }

  function getTagGateRouteSupport(cardName, tag, myHand, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs) {
    if (!Array.isArray(myHand)) return 0;
    var supportCount = 0;
    for (var i = 0; i < myHand.length; i++) {
      if (isCheapPlayableTagSupport(myHand[i], cardName, tag, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs)) {
        supportCount++;
      }
    }
    return Math.min(2, supportCount);
  }

  function scoreTagGateRoute(cardName, myHand, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs) {
    var tagReqs = lookupCardMapEntry(cardTagReqs, cardName);
    if (!tagReqs || !ctx) return null;

    var tags = ctx.tags || {};
    var wild = getRouteRequirementWildCount(ctx);
    var directHandCounts = getPersistentHandTagCounts(myHand, cardName, cardTagsData, ratings);
    var worst = null;
    for (var tag in tagReqs) {
      if (typeof tagReqs[tag] === 'object') continue;
      var need = tagReqs[tag] || 0;
      if (need <= 0) continue;
      var haveNow = countRequirementTags(tags, tag, tag === 'wild' ? 0 : wild);
      var missingNow = Math.max(0, need - haveNow);
      if (missingNow <= 0) continue;

      var handSupport = getHandTagSupport(ctx, tag, haveNow, directHandCounts);
      if (handSupport <= 0 || haveNow + handSupport < need) continue;

      var penalty = -Math.min(14, Math.max(6, missingNow * 4));
      var candidate = {
        tag: tag,
        need: need,
        handSupport: handSupport,
        penalty: penalty,
        missingNow: missingNow,
        routeSupport: getTagGateRouteSupport(cardName, tag, myHand, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs)
      };
      if (!worst || candidate.penalty < worst.penalty) worst = candidate;
    }

    if (!worst) return null;
    var label = formatTagGateLabel(worst.tag);
    var reasons = [
      'Tag gate ' + label + ': need ' + worst.need + ' on table (hand +' + worst.handSupport + ') ' + worst.penalty
    ];
    if (worst.routeSupport > 0) {
      reasons.push('Tag route ' + label + ' support +' + worst.routeSupport);
    }
    return {
      adj: worst.penalty + worst.routeSupport,
      bonus: worst.penalty + worst.routeSupport,
      reasons: reasons
    };
  }

  function isStrongGlobalRequirementCheatTarget(targetName, fx) {
    var namedStrong = {
      'Kelp Farming': true,
      'Trees': true,
      'Bushes': true,
      'Farming': true,
      'Penguins': true,
      'Fish': true,
      'Livestock': true,
      'Nitrogen-Rich Asteroid': true
    };
    if (namedStrong[targetName]) return true;
    if (!fx) return false;
    if ((fx.mp || 0) < 0 || (fx.pOpp || 0) > 0) return false;
    if ((fx.pp || 0) >= 2) return true;
    if ((fx.vpAcc || 0) > 0) return true;
    if ((fx.mp || 0) >= 2 && (fx.pp || 0) >= 1) return true;
    if ((fx.tr || 0) >= 2 && (fx.pp || 0) >= 1) return true;
    return false;
  }

  function findGlobalRequirementCheatRouteTarget(cardNames, ctx, ratings, cardEffects, cardGlobalReqs, cardTagReqs) {
    if (!Array.isArray(cardNames) || !ctx) return {best: null, bestWeak: null};
    var best = null;
    var bestWeak = null;
    for (var i = 0; i < cardNames.length; i++) {
      var targetName = cardNames[i];
      if (!targetName) continue;
      var globalReqs = lookupCardMapEntry(cardGlobalReqs, targetName);
      var unmetSteps = getGlobalReqUnmetSteps(globalReqs, ctx);
      if (unmetSteps <= 0) continue;

      var tagReqs = lookupCardMapEntry(cardTagReqs, targetName);
      if (!cardTagRequirementsMet(tagReqs, ctx)) continue;

      var fx = lookupCardMapEntry(cardEffects, targetName) || {};
      var rating = lookupCardMapEntry(ratings, targetName) || {};
      var ratingScore = typeof rating.s === 'number' ? rating.s : 55;
      var strongTarget = isStrongGlobalRequirementCheatTarget(targetName, fx);
      var quality = 0;
      quality += Math.max(0, ratingScore - 60) / 6;
      quality += Math.max(0, fx.pp || 0) * 1.8;
      quality += Math.max(0, fx.mp || 0) * 1.2;
      quality += Math.max(0, fx.vpAcc || 0) * (ctx.gensLeft >= 6 ? 2.5 : 1.5);
      quality += Math.max(0, fx.vp || 0) * 0.7;
      quality += Math.min(4, unmetSteps * 0.5);
      quality -= Math.max(0, (fx.c || 0) - 15) * 0.15;

      if (!strongTarget) {
        if (!bestWeak || quality > bestWeak.quality) bestWeak = {name: targetName, quality: quality};
        continue;
      }

      if (!best || quality > best.quality) {
        best = {name: targetName, quality: quality};
      }
    }
    return {best: best, bestWeak: bestWeak};
  }

  function scoreGlobalRequirementCheatRoute(reasonPrefix, cardNames, ctx, ratings, cardEffects, cardGlobalReqs, cardTagReqs) {
    var route = findGlobalRequirementCheatRouteTarget(cardNames, ctx, ratings, cardEffects, cardGlobalReqs, cardTagReqs);
    var best = route.best;
    var bestWeak = route.bestWeak;

    if (!best) {
      if (bestWeak) {
        return {adj: -18, bonus: -18, reasons: [reasonPrefix + ' weak target ' + bestWeak.name + ' -18']};
      }
      return {adj: -24, bonus: -24, reasons: [reasonPrefix + ' no target -24']};
    }

    var adj = best.quality >= 12 ? 7 : best.quality >= 9 ? 5 : best.quality >= 6 ? 2 : -12;
    if (adj <= 0) {
      return {adj: adj, bonus: adj, reasons: [reasonPrefix + ' weak target ' + best.name + ' ' + adj]};
    }
    return {adj: adj, bonus: adj, reasons: [reasonPrefix + ' target ' + best.name + ' +' + adj]};
  }

  function scoreEcologyExpertsTarget(cardName, myHand, ctx, ratings, cardEffects, cardGlobalReqs, cardTagReqs) {
    if (cardName !== 'Ecology Experts' || !Array.isArray(myHand) || !ctx) return null;
    var targetNames = myHand.filter(function(name) { return name && name !== cardName; });
    return scoreGlobalRequirementCheatRoute('Ecology', targetNames, ctx, ratings, cardEffects, cardGlobalReqs, cardTagReqs);
  }

  function isValuableGasesRouteCard(cardName) {
    return cardName === 'Valuable Gases' || cardName === 'Valuable Gases:Pathfinders';
  }

  function isActiveFloaterRouteTarget(targetName, fx, cardTagsData, ratings) {
    if (!targetName || !fx) return false;
    if (fx.res === 'floater' || fx.resourceType === 'floater') return true;
    if (fx.tg === 'venus' && hasRouteTag(cardTagsData, ratings, targetName, 'venus')) return true;
    return false;
  }

  function scoreFloaterRouteTargetQuality(targetName, fx, ratings, ctx) {
    var rating = lookupCardMapEntry(ratings, targetName) || {};
    var ratingScore = typeof rating.s === 'number' ? rating.s : 55;
    var quality = 0;
    quality += Math.max(0, ratingScore - 58) / 7;
    quality += Math.min(5, Math.max(0, fx.c || 0) * 0.25);
    quality += Math.max(0, fx.vpAcc || 0) * (ctx && ctx.gensLeft >= 5 ? 4 : 2.5);
    quality += Math.max(0, fx.vp || 0) * 0.8;
    quality += Math.max(0, fx.cd || 0) * 1.2;
    if (fx.res === 'floater' || fx.resourceType === 'floater') quality += 2.5;

    var namedPremium = {
      'Dirigibles': true,
      'Floating Habs': true,
      'Aerial Mappers': true,
      'Stratopolis': true,
      'Titan Shuttles': true
    };
    if (namedPremium[targetName]) quality += 2;
    return quality;
  }

  function scoreValuableGasesTarget(cardName, myHand, ctx, ratings, cardEffects, cardTagsData) {
    if (!isValuableGasesRouteCard(cardName) || !Array.isArray(myHand) || !ctx) return null;
    var best = null;
    var bestWeak = null;
    for (var i = 0; i < myHand.length; i++) {
      var targetName = myHand[i];
      if (!targetName || targetName === cardName) continue;
      var fx = lookupCardMapEntry(cardEffects, targetName) || {};
      if (!isActiveFloaterRouteTarget(targetName, fx, cardTagsData, ratings)) continue;
      var quality = scoreFloaterRouteTargetQuality(targetName, fx, ratings, ctx);
      if (quality >= 6) {
        if (!best || quality > best.quality) best = {name: targetName, quality: quality};
      } else if (!bestWeak || quality > bestWeak.quality) {
        bestWeak = {name: targetName, quality: quality};
      }
    }

    if (best) {
      var adj = best.quality >= 7 ? 7 : 4;
      return {adj: adj, bonus: adj, reasons: ['Valuable Gases floater target ' + best.name + ' +' + adj]};
    }
    if (bestWeak) {
      return {adj: -10, bonus: -10, reasons: ['Valuable Gases weak floater target ' + bestWeak.name + ' -10']};
    }
    return {adj: -16, bonus: -16, reasons: ['Valuable Gases no floater target -16']};
  }

  function scoreRogersTarget(cardName, myHand, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs) {
    if (cardName !== 'Rogers' || !Array.isArray(myHand) || !ctx) return null;
    var best = null;
    var bestWeak = null;
    for (var i = 0; i < myHand.length; i++) {
      var targetName = myHand[i];
      if (!targetName || targetName === cardName) continue;
      if (!hasRouteTag(cardTagsData, ratings, targetName, 'venus')) continue;

      var tagReqs = lookupCardMapEntry(cardTagReqs, targetName);
      if (!cardTagRequirementsMet(tagReqs, ctx)) continue;

      var fx = lookupCardMapEntry(cardEffects, targetName) || {};
      var globalReqs = lookupCardMapEntry(cardGlobalReqs, targetName);
      var unmetSteps = getGlobalReqUnmetSteps(globalReqs, ctx);
      var rating = lookupCardMapEntry(ratings, targetName) || {};
      var ratingScore = typeof rating.s === 'number' ? rating.s : 55;
      var quality = 1.5; // 3 MC Venus-tag discount, converted to score-scale route value.
      quality += Math.min(5, unmetSteps * 0.8);
      quality += Math.max(0, ratingScore - 60) / 7;
      quality += Math.max(0, fx.vpAcc || 0) * (ctx.gensLeft >= 5 ? 4 : 2.5);
      quality += Math.max(0, fx.vp || 0) * 0.8;
      quality += Math.max(0, fx.mp || 0) * 0.8;
      quality += Math.max(0, fx.pp || 0) * 1.0;
      quality += Math.max(0, fx.cd || 0) * 1.0;

      var namedStrong = {
        'Venusian Animals': true,
        'Stratopolis': true,
        'Sulphur-Eating Bacteria': true,
        'Dirigibles': true
      };
      if (namedStrong[targetName]) quality += 2;

      if (quality >= 6) {
        if (!best || quality > best.quality) best = {name: targetName, quality: quality};
      } else if (!bestWeak || quality > bestWeak.quality) {
        bestWeak = {name: targetName, quality: quality};
      }
    }

    if (best) {
      var adj = best.quality >= 9 ? 6 : 4;
      return {adj: adj, bonus: adj, reasons: ['Rogers Venus route ' + best.name + ' +' + adj]};
    }
    if (bestWeak) {
      return {adj: -4, bonus: -4, reasons: ['Rogers weak Venus route ' + bestWeak.name + ' -4']};
    }
    return {adj: -12, bonus: -12, reasons: ['Rogers no Venus route -12']};
  }

  function isProductionCopyEnabler(cardName) {
    return cardName === 'Robotic Workforce' ||
      cardName === 'Robotic Workforce (P2)' ||
      cardName === 'Mining Robots Manuf. Center' ||
      cardName === 'Cyberia Systems';
  }

  function productionCopyValue(fx) {
    if (!fx) return 0;
    return (fx.mp || 0) * 1 +
      (fx.sp || 0) * 1.6 +
      (fx.tp || 0) * 2.5 +
      (fx.pp || 0) * 2.0 +
      (fx.ep || 0) * 1.5 +
      (fx.hp || 0) * 0.8;
  }

  function scoreProductionCopyRoute(cardName, myTableau, myHand, ctx, ratings, cardEffects, cardTagsData, cardGlobalReqs, cardTagReqs) {
    if (!isProductionCopyEnabler(cardName) || !ctx) return null;
    var candidates = [];
    var seen = {};

    function addCandidate(name, played) {
      if (!name || name === cardName || seen[name]) return;
      seen[name] = true;
      candidates.push({ name: name, played: !!played });
    }

    var tableauNames = Array.isArray(myTableau) ? myTableau : [];
    var handNames = Array.isArray(myHand) ? myHand : [];
    for (var ti = 0; ti < tableauNames.length; ti++) addCandidate(tableauNames[ti], true);
    for (var hi = 0; hi < handNames.length; hi++) addCandidate(handNames[hi], false);

    var copyCount = cardName === 'Cyberia Systems' ? 2 : 1;
    var strongTargets = [];
    var bestWeak = null;

    for (var ci = 0; ci < candidates.length; ci++) {
      var candidate = candidates[ci];
      if (!hasBuildingTagForRoute(cardTagsData, ratings, candidate.name)) continue;

      if (!candidate.played) {
        var globalReqs = lookupCardMapEntry(cardGlobalReqs, candidate.name);
        if (getGlobalReqUnmetSteps(globalReqs, ctx) > 0) {
          if (!bestWeak) bestWeak = { name: candidate.name, value: 0 };
          continue;
        }
        var tagReqs = lookupCardMapEntry(cardTagReqs, candidate.name);
        if (!cardTagRequirementsMet(tagReqs, ctx)) {
          if (!bestWeak) bestWeak = { name: candidate.name, value: 0 };
          continue;
        }
      }

      var fx = lookupCardMapEntry(cardEffects, candidate.name) || {};
      var value = productionCopyValue(fx);
      if (value >= 3) {
        strongTargets.push({ name: candidate.name, value: value });
      } else if (value > 0 && (!bestWeak || value > bestWeak.value)) {
        bestWeak = { name: candidate.name, value: value };
      }
    }

    strongTargets.sort(function(a, b) { return b.value - a.value; });
    if (strongTargets.length > 0) {
      var picked = strongTargets.slice(0, copyCount);
      var totalValue = 0;
      var names = [];
      for (var pi = 0; pi < picked.length; pi++) {
        totalValue += picked[pi].value;
        names.push(picked[pi].name);
      }
      var adj = Math.min(6 * copyCount, Math.max(3, Math.round(totalValue)));
      return { adj: adj, bonus: adj, reasons: ['Copy target ' + names.join('+') + ' +' + adj] };
    }

    if (bestWeak) {
      return { adj: -14, bonus: -14, reasons: ['Copy weak target ' + bestWeak.name + ' -14'] };
    }

    return { adj: -16, bonus: -16, reasons: ['Copy no target -16'] };
  }

  var DRAFT_ROUTE_VALIDATORS = [
    function(input) {
      return scoreEcologyExpertsTarget(
        input.cardName,
        input.myHand,
        input.ctx,
        input.ratings,
        input.cardEffects,
        input.cardGlobalReqs,
        input.cardTagReqs
      );
    },
    function(input) {
      return scoreValuableGasesTarget(
        input.cardName,
        input.myHand,
        input.ctx,
        input.ratings,
        input.cardEffects,
        input.cardTagsData
      );
    },
    function(input) {
      return scoreRogersTarget(
        input.cardName,
        input.myHand,
        input.ctx,
        input.ratings,
        input.cardEffects,
        input.cardTagsData,
        input.cardGlobalReqs,
        input.cardTagReqs
      );
    },
    function(input) {
      return scoreProductionCopyRoute(
        input.cardName,
        input.myTableau,
        input.myHand,
        input.ctx,
        input.ratings,
        input.cardEffects,
        input.cardTagsData,
        input.cardGlobalReqs,
        input.cardTagReqs
      );
    },
    function(input) {
      return scoreTagGateRoute(
        input.cardName,
        input.myHand,
        input.ctx,
        input.ratings,
        input.cardEffects,
        input.cardTagsData,
        input.cardGlobalReqs,
        input.cardTagReqs
      );
    }
  ];

  function scoreDraftRouteValidators(input) {
    var results = [];
    for (var i = 0; i < DRAFT_ROUTE_VALIDATORS.length; i++) {
      var result = DRAFT_ROUTE_VALIDATORS[i](input);
      if (result) results.push(result);
    }
    return results;
  }

  function scoreAnubisCorpRoute(input) {
    if (!input || input.corpName !== 'Anubis Securities') return null;
    return scoreGlobalRequirementCheatRoute(
      'Anubis',
      input.projectNames,
      input.ctx,
      input.ratingsRaw,
      input.cardEffects,
      input.cardGlobalReqs,
      input.cardTagReqs
    );
  }

  var CORP_ROUTE_VALIDATORS = [
    scoreAnubisCorpRoute
  ];

  function scoreCorpRouteValidators(input) {
    var results = [];
    for (var i = 0; i < CORP_ROUTE_VALIDATORS.length; i++) {
      var result = CORP_ROUTE_VALIDATORS[i](input);
      if (result) results.push(result);
    }
    return results;
  }

  global.TM_CONTENT_ROUTE_VALIDATORS = {
    scoreDraftRouteValidators: scoreDraftRouteValidators,
    scoreCorpRouteValidators: scoreCorpRouteValidators
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
