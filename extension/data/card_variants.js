/**
 * Variant card rating overrides and expansion variant rules.
 * Single source of truth — used by content.js, tm-brain.js, popup.js.
 */

// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
var TM_CARD_VARIANT_RULES = [
  { suffix: ':u', option: 'underworldExpansion' },
  { suffix: ':Pathfinders', option: 'pathfindersExpansion' },
  { suffix: ':ares', option: 'ares' },
  { suffix: ':promo', option: 'promoCardsOption' },
];
