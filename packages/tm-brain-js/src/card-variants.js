/**
 * Variant card rating overrides and expansion variant rules.
 * Canonical source — synced into runtime consumers.
 */
/* eslint-disable */
;(function(root) {
  'use strict';

  var TM_VARIANT_RATING_OVERRIDES = {
    "Hackers:u": {
      s: 52, t: "D",
      w: "Underworld-версия заметно лучше базы: нет Energy тега, зато Crime тег и более чистый disrupt-профиль. Всё ещё ситуативная attack-карта, но уже не такой мусор.",
      e: "3+3=6 MC за 2 MC-prod swing по оппоненту и -1 VP; без требования к energy shell",
    },
    "Hired Raiders:u": {
      s: 56, t: "C",
      w: "Underworld-версия ближе к узкому disrupt-tool, чем к базовому event. Брать под Crime/attack план или когда 5 MC swing реально ломает tempo лидеру.",
      e: "1 MC + 3 MC draft = 4 MC за чистый MC swing; без steel interaction базы",
    },
    "Standard Technology:u": {
      w: "Underworld replacement. По силе близка к базе, но это всё равно отдельная карта и отдельный rating-entry.",
    },
    "Valuable Gases:Pathfinders": {
      w: "Pathfinders replacement. По силе близка к базовой Valuable Gases, но хранится как отдельная карта.",
    },
    "Power Plant:Pathfinders": {
      s: 74, t: "B",
      w: "Pathfinders-версия ощутимо сильнее базы: даёт и энергию, и тепло, плюс набор тегов лучше конвертируется в синергии. Хороший ранний tempo play.",
      e: "13+3=16 MC за 1 energy-prod + 2 heat-prod и сильные теги Mars/Power/Building",
    },
    "Research Grant:Pathfinders": {
      s: 46, t: "D",
      w: "Pathfinders-версия всё ещё нишевая. Если не нужен именно Science shell, это плохая конверсия темпа даже с отдельным rating.",
      e: "14 MC immediate + 1 energy-prod; playable только в science/value shell",
    },
  };

  var TM_CARD_VARIANT_RULES = [
    { suffix: ':u', option: 'underworldExpansion' },
    { suffix: ':Pathfinders', option: 'pathfindersExpansion' },
    { suffix: ':ares', option: 'ares' },
    { suffix: ':promo', option: 'promoCardsOption' },
  ];

  var TM_VARIANT_SUFFIX_RE = /:u$|:Pathfinders$|:promo$|:ares$/;

  function tmBaseCardName(name) {
    if (!name) return name;
    return name
      .replace(TM_VARIANT_SUFFIX_RE, '')
      .replace(/\\+$/, '');
  }

  function tmIsVariantOptionEnabled(rule, game, opts) {
    if (!rule) return false;
    if (rule.option === 'ares') {
      return !!(
        (game && game.ares) ||
        (opts && opts.ares) ||
        (opts && opts.aresExtension) ||
        (opts && opts.aresExpansion) ||
        (opts && typeof opts.boardName === 'string' && opts.boardName.toLowerCase().indexOf('ares') >= 0)
      );
    }
    return !!(opts && opts[rule.option]);
  }

  var TM_CARD_VARIANTS = {
    TM_VARIANT_RATING_OVERRIDES: TM_VARIANT_RATING_OVERRIDES,
    TM_CARD_VARIANT_RULES: TM_CARD_VARIANT_RULES,
    TM_VARIANT_SUFFIX_RE: TM_VARIANT_SUFFIX_RE,
    tmBaseCardName: tmBaseCardName,
    tmIsVariantOptionEnabled: tmIsVariantOptionEnabled,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TM_CARD_VARIANTS;
  } else {
    // Browser: expose individual globals for backward compat
    root.TM_VARIANT_RATING_OVERRIDES = TM_VARIANT_RATING_OVERRIDES;
    root.TM_CARD_VARIANT_RULES = TM_CARD_VARIANT_RULES;
    root.TM_VARIANT_SUFFIX_RE = TM_VARIANT_SUFFIX_RE;
    root.tmBaseCardName = tmBaseCardName;
    root.tmIsVariantOptionEnabled = tmIsVariantOptionEnabled;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
