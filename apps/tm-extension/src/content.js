// TM Tier Overlay — Content Script v2.0
// Full feature set: badges, tooltips, combos, dimming, draft summary, corp synergy,
// search, M/A advisor, recommendations, opponent intel, hand sort, toasts,
// dynamic value calc, milestone race, card comparison, income projection,
// draft filter, generation timer, panel persistence, buying power,
// standard projects, settings import/export

var _TM_RATINGS_GLOBAL = (typeof TM_RATINGS !== 'undefined') ? TM_RATINGS : {};
var TM_CONTENT_BADGES = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_BADGES) ? globalThis.TM_CONTENT_BADGES : null;
var TM_CONTENT_CARD_STATS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_CARD_STATS) ? globalThis.TM_CONTENT_CARD_STATS : null;
var TM_CONTENT_CYCLE = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_CYCLE) ? globalThis.TM_CONTENT_CYCLE : null;
var TM_CONTENT_DRAFT_INTEL = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_DRAFT_INTEL) ? globalThis.TM_CONTENT_DRAFT_INTEL : null;
var TM_CONTENT_DRAFT_HISTORY = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_DRAFT_HISTORY) ? globalThis.TM_CONTENT_DRAFT_HISTORY : null;
var TM_CONTENT_DRAFT_POLLER = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_DRAFT_POLLER) ? globalThis.TM_CONTENT_DRAFT_POLLER : null;
var TM_CONTENT_DRAFT_RECOMMENDATIONS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_DRAFT_RECOMMENDATIONS) ? globalThis.TM_CONTENT_DRAFT_RECOMMENDATIONS : null;
var TM_CONTENT_DRAFT_TRACKER = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_DRAFT_TRACKER) ? globalThis.TM_CONTENT_DRAFT_TRACKER : null;
var TM_CONTENT_GEN_TIMER = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_GEN_TIMER) ? globalThis.TM_CONTENT_GEN_TIMER : null;
var TM_CONTENT_HAND_SCORES = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_HAND_SCORES) ? globalThis.TM_CONTENT_HAND_SCORES : null;
var TM_CONTENT_HAND_UI = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_HAND_UI) ? globalThis.TM_CONTENT_HAND_UI : null;
var TM_CONTENT_LOG_UI = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_LOG_UI) ? globalThis.TM_CONTENT_LOG_UI : null;
var TM_CONTENT_OVERLAYS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_OVERLAYS) ? globalThis.TM_CONTENT_OVERLAYS : null;
var TM_CONTENT_PLAY_PRIORITY = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_PLAY_PRIORITY) ? globalThis.TM_CONTENT_PLAY_PRIORITY : null;
var TM_CONTENT_PLAYER_META = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_PLAYER_META) ? globalThis.TM_CONTENT_PLAYER_META : null;
var TM_CONTENT_PLAYER_VIEW = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_PLAYER_VIEW) ? globalThis.TM_CONTENT_PLAYER_VIEW : null;
var TM_CONTENT_POSTGAME = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_POSTGAME) ? globalThis.TM_CONTENT_POSTGAME : null;
var TM_CONTENT_PRELUDE_PACKAGE = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_PRELUDE_PACKAGE) ? globalThis.TM_CONTENT_PRELUDE_PACKAGE : null;
var TM_CONTENT_RUNTIME_STATUS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_RUNTIME_STATUS) ? globalThis.TM_CONTENT_RUNTIME_STATUS : null;
var TM_CONTENT_STANDARD_PROJECTS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_STANDARD_PROJECTS) ? globalThis.TM_CONTENT_STANDARD_PROJECTS : null;
var TM_CONTENT_TOAST = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_TOAST) ? globalThis.TM_CONTENT_TOAST : null;
var TM_CONTENT_TOOLTIP = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_TOOLTIP) ? globalThis.TM_CONTENT_TOOLTIP : null;
var TM_CONTENT_TOOLTIP_STATE = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_TOOLTIP_STATE) ? globalThis.TM_CONTENT_TOOLTIP_STATE : null;
var TM_CONTENT_VP_BREAKDOWN = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_VP_BREAKDOWN) ? globalThis.TM_CONTENT_VP_BREAKDOWN : null;
var TM_CONTENT_VP_OVERLAYS = (typeof globalThis !== 'undefined' && globalThis.TM_CONTENT_VP_OVERLAYS) ? globalThis.TM_CONTENT_VP_OVERLAYS : null;

(function () {
  'use strict';

  let enabled = true;
  let debugMode = false;
  let _tmAudioCtx = null;
  // Raw ratings object (before Proxy wrapping) — used in lookup functions to avoid Proxy recursion
  var _TM_RATINGS_RAW = _TM_RATINGS_GLOBAL;
  // Variant data loaded from data/card_variants.js (TM_VARIANT_RATING_OVERRIDES, TM_CARD_VARIANT_RULES)
  var _VARIANT_RATING_OVERRIDES = (typeof TM_VARIANT_RATING_OVERRIDES !== 'undefined') ? TM_VARIANT_RATING_OVERRIDES : {};
  var _CARD_VARIANT_RULES = (typeof TM_CARD_VARIANT_RULES !== 'undefined') ? TM_CARD_VARIANT_RULES : [];

  // Shared utils from data/card_variants.js: tmBaseCardName, tmIsVariantOptionEnabled
  var _baseCardName = (typeof tmBaseCardName !== 'undefined') ? tmBaseCardName : function(n) { return n; };
  var _CARD_NAME_ALIASES = {
    'allied banks': 'Allied Bank'
  };

  function _resolveAliasedCardName(name) {
    if (!name) return name;
    return _CARD_NAME_ALIASES[String(name).toLowerCase()] || name;
  }

  function _isVariantOptionEnabled(rule, pv, opts) {
    var game = pv && pv.game;
    return tmIsVariantOptionEnabled(rule, game, opts);
  }

  function _resolveVariantCardName(name) {
    name = _resolveAliasedCardName(name);
    if (!name) return name;
    if (/:u$|:Pathfinders$|:promo$|:ares$/.test(name)) return name;
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var opts = pv && pv.game && pv.game.gameOptions;
    if (!opts && !(pv && pv.game)) return name;
    for (var i = 0; i < _CARD_VARIANT_RULES.length; i++) {
      var rule = _CARD_VARIANT_RULES[i];
      if (!_isVariantOptionEnabled(rule, pv, opts)) continue;
      var variantName = name + rule.suffix;
      if ((typeof TM_CARD_TAGS !== 'undefined' && TM_CARD_TAGS[variantName]) ||
          (typeof TM_CARD_DATA !== 'undefined' && TM_CARD_DATA[variantName]) ||
          (typeof TM_CARD_VP !== 'undefined' && TM_CARD_VP[variantName]) ||
          (typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[variantName])) {
        return variantName;
      }
    }
    return name;
  }

  function _lookupCardData(map, name) {
    if (!map) return null;
    name = _resolveAliasedCardName(name);
    var resolvedName = _resolveVariantCardName(name);
    return map[resolvedName] || map[name] || map[_baseCardName(name)] || null;
  }

  function _getRatingKeyByCardName(name) {
    if (!name) return null;
    name = _resolveAliasedCardName(name);
    var raw = _TM_RATINGS_RAW;
    if (!raw) return null;
    var resolvedName = _resolveVariantCardName(name);
    var baseName = _baseCardName(resolvedName || name);
    return (resolvedName && (_VARIANT_RATING_OVERRIDES[resolvedName] || raw[resolvedName])) ? resolvedName
      : raw[name] ? name
      : raw[baseName] ? baseName
      : null;
  }

  function _getRatingByCardName(name) {
    var key = _getRatingKeyByCardName(name);
    if (!key) return null;
    var raw = _TM_RATINGS_RAW;
    var baseKey = _baseCardName(key);
    var baseRating = raw[key] || raw[baseKey] || null;
    var override = _VARIANT_RATING_OVERRIDES[key];
    return override ? Object.assign({}, baseRating || {}, override) : baseRating;
  }

  var TM_RATINGS = new Proxy(_TM_RATINGS_RAW, {
    get: function(target, prop, receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      var resolvedKey = _getRatingKeyByCardName(prop);
      return resolvedKey ? target[resolvedKey] : undefined;
    }
  });

  // Pathfinder card names — filter from synergy recommendations when PF expansion is off
  var _PF_CARDS=new Set(["Adhai High Orbit Constructions","Advanced Power Grid","Agro-Drones","Ambient","Anthozoa","Asteroid Resources","Aurorai","Bio-Sol","Botanical Experience","Breeding Farms","Cassini Station","Ceres Spaceport","Charity Donation","Chimera","Collegium Copernicus","Communication Center","Controlled Bloom","Coordinated Raid","Crashlanding","Crew Training","Cryptocurrency","Cultivation of Venus","Cyanobacteria","Data Leak","Declaration of Independence","Deep Space Operations","Design Company","Designed Organisms","Dust Storm","Dyson Screens","Early Expedition","Economic Espionage","Economic Help","Expedition to the Surface - Venus","Experienced Martians","Flat Mars Theory","Floater-Urbanism","Gagarin Mobile Base","Geological Expedition","Habitat Marte","Huygens Observatory","Hydrogen Bombardment","Hydrogen Processing Plant","Interplanetary Transport","Kickstarter","Last Resort Ingenuity","Lobby Halls","Lunar Embassy","Luxury Estate","Mars Direct","Mars Maths","Martian Culture","Martian Dust Processing Plant","Martian Insurance Group","Martian Monuments","Martian Nature Wonders","Martian Repository","Microbiology Patents","Mind Set Mars","Museum of Early Colonisation","New Venice","Nobel Labs","Odyssey","Orbital Laboratories","Oumuamua Type Object Survey","Ozone Generators","Personal Agenda","Polaris","Pollinators","Power Plant","Prefabrication of Human Habitats","Private Security","Public Sponsored Grant","Rare-Earth Elements","Red City","Research Grant","Return to Abandoned Technology","Rich Deposits","Ringcom","Robin Haulings","Secret Labs","Small Comet","Small Open Pit Mine","Social Events","Soil Detoxification","SolBank","Solar Storm","Solarpedia","Soylent Seedling Systems","Space Debris Cleaning Operation","Space Relay","Specialized Settlement","Steelaris","Survey Mission","Terraforming Control Station","Terraforming Robots","The New Space Race","Think Tank","Valuable Gases","Venera Base","Venus First","Vital Colony","Wetlands"]);
  // Moon expansion card names — filter when Moon expansion is off
  var _MOON_CARDS=new Set(["Ancient Shipyards","Aristarchus Road Network","Basic Infrastructure","Copernicus Tower","Core Mine","Cosmic Radiation","Crescent Research Association","Darkside Incubation Plant","Darkside Mining Syndicate","Deep Lunar Mining","Earth Embassy","First Lunar Settlement","Geodesic Tents","Grand Luna Academy","HE3 Fusion Plant","HE3 Lobbyists","HE3 Production Quotas","HE3 Refinery","Habitat 14","Hostile Takeover","Improved Moon Concrete","Intragen Sanctuary Headquarters","L.T.F. Privileges","Luna Archives","Luna Conference","Luna Ecumenopolis","Luna First Incorporated","Luna Hyperloop Corporation","Luna Political Institute","Luna Resort","Luna Senate","Luna Staging Station","Luna Trade Federation","Luna Trade Station","Lunar Mine Urbanization","Lunar Planning Office","Lunar Security Stations","Lunar Steel","Lunar Trade Fleet","Mare Imbrium Mine","Mare Nectaris Mine","Mare Nubium Mine","Mare Serenitatis Mine","Martian Embassy","Mining Complex","Moon Tether","Nanotech Industries","New Colony Planning Initiatives","Preliminary Darkside","Processor Factory","Revolting Colonists","Road Piracy","Rover Drivers Union","Sinus Irdium Road Network","Small Duty Rovers","Solar Panel Foundry","Sphere Habitats","Subterranean Habitats","The Darkside of The Moon Syndicate","The Grand Luna Capital Group","The Womb","Thorium Rush","Tycho Road Network","Undermoon Drug Lords Network","Water Treatment Complex"]);
  // Underworld expansion card names — filter when Underworld expansion is off
  var _UNDERWORLD_CARDS=new Set(["Acidizing","Aeron Genomics","Anti-trust Crackdown","Anubis Securities","Arborist Collective","Artesian Aquifer","Battery Factory","Battery Shipment","Behemoth Excavator","Biobatteries","Canyon Survey","Casino","Cave City","Central Reservoir","Chemical Factory","Class-action Lawsuit","Cloud Vortex Outpost","Corporate Blackmail","Corporate Theft","Crater Survey","Cut-throat Budgeting","Deep Foundations","Deepmining","Deepnuking","Deepwater Dome","Demetron Labs","Detective TV Series","Earthquake Machine","Election Sponsorship","Excavator Leasing","Expedition Vehicles","Exploitation Of Venus","Export Convoy","Fabricated Scandal","Family Connections","Forest Tunnels","Free Trade Port","Friends in High Places","Gaia City","Ganymede Trading Company","Gas Trust","Geological Expertise","Geologist Team","Geoscan Satellite","Geothermal Network","Global Audit","Grey Market Exploitation","Guerilla Ecologists","Hackers:u","Hadesphere","Hecate Speditions","Henkei Genetics","Hired Raiders:u","Hyperspace Drive Prototype","Imported Heavy Machinery","Induced Tremor","Infrastructure Overload","Inherited Fortune","Investigative Journalism","Investor Plaza","Jenson-Boyle & Co","Keplertec","Kingdom of Tauraro","Labor Trafficking","Landfill","Lobbying Network","Man-made Volcano","Martian Express","Media Frenzy","Mercenary Squad","Micro-Geodesics","Microgravimetry","Microprobing Technology","Mining Market Insider","Monopoly","Nanofoundry","Narrative Spin","Neutrinograph","Nightclubs","Off-World Tax Haven","Old World Mafia","Orbital Laser Drill","Patent Manipulation","Personal Spacecruiser","Planetary Rights Buyout","Plant Tax","Price Wars","Private Investigator","Private Military Contractor","Private Resorts","Prospecting","Public Spaceline","Racketeering","Reckless Detonation","Research & Development Hub","Robot Moles","Scapegoat","Search for Life Underground","Secret Research","Server Sabotage","Soil Export","Space Privateers","Space Wargames","Staged Protests","Star Vegas","Stem Field Subsidies","Sting Operation","Subnautic Pirates","Subterranean Sea","Syndicate Pirate Raids","Thiolava Vents","Titan Manufacturing Colony","Tunnel Boring Machine","Tunneling Loophole","Tunneling Operation","Tunneling Subcontractor","Underground Amusement Park","Underground Habitat","Underground Railway","Underground Research Center","Underground Settlement","Underground Shelters","Underground Smuggling Ring","Voltagon","Voltaic Metallurgy","Volunteer Mining Initiative","Whales"]);
  function _isMoonExpansionOn() {
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    return pv && pv.game && pv.game.gameOptions && pv.game.gameOptions.moonExpansion;
  }
  function _isPfExpansionOn() {
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    return pv && pv.game && pv.game.gameOptions && pv.game.gameOptions.pathfindersExpansion;
  }
  function _isUnderworldExpansionOn() {
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    return pv && pv.game && pv.game.gameOptions && pv.game.gameOptions.underworldExpansion;
  }
  var SC = TM_SCORING_CONFIG;

  // ── Tile type helpers (API returns number or string) ──
  function isCityTile(t) { return t === 0 || t === 'city' || t === 5 || t === 'capital'; }
  function isGreeneryTile(t) { return t === 1 || t === 'greenery'; }
  function isOceanTile(t) { return t === 2 || t === 'ocean'; }

  // ── Internal logging stubs ──
  var _lastProcessAllMs = 0;

  function tmLog(category, msg, data) {
    return;
  }

  function tmWarn(category, msg, data) {
    return;
  }

  var safeStorage = TM_UTILS.safeStorage;
  let tierFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

  // ── Reusable DOM selectors ──
  const SEL_HAND = '.player_home_block--hand .card-container[data-tm-card]';
  const SEL_TABLEAU = '.player_home_block--cards .card-container[data-tm-card]';
  const SEL_DRAFT = '.wf-component--select-card .card-container[data-tm-card]';

  // ── Weighted y helpers ──
  // y entries can be "CardName" (legacy, weight=default) or ["CardName", weight]
  function yName(entry) { return Array.isArray(entry) ? entry[0] : entry; }
  function yWeight(entry) { return Array.isArray(entry) ? entry[1] : 0; }
  function reasonCardLabel(name) {
    var label = (name || '').trim();
    if (!label) return '';
    if (label.length <= 28) return label;
    return label.substring(0, 27) + '…';
  }
  function describeNamedSynergy(name) {
    var label = reasonCardLabel(name);
    if (!label) return '';
    if (name === 'Electro Catapult') return label + ': steel→7 MC';
    if (name === 'Mining Colony') return label + ': colony + ti-prod';
    if (name === 'Sky Docks') return label + ': скидка на карты';
    return label;
  }
  function describeTradeChain(name) {
    var label = describeNamedSynergy(name);
    if (!label) return '';
    return label + ' → trade';
  }

  function describeCorpBoostReason(corpName, cardName, corpBoost) {
    var label = reasonCardLabel(corpName);
    var sign = corpBoost > 0 ? '+' : '';
    if (cardName === 'Heat Trappers') {
      if (corpName === 'Thorgate') return 'Thorgate: cheap power ' + sign + corpBoost;
      if (corpName === 'Cheung Shing MARS') return 'Cheung: cheap building ' + sign + corpBoost;
    }
    if (cardName === 'Suitable Infrastructure') {
      if (corpName === 'Robinson Industries') return 'Robinson: prod action ' + sign + corpBoost;
      if (corpName === 'Manutech') return 'Manutech: prod cashout ' + sign + corpBoost;
    }
    return label + ' ' + sign + corpBoost;
  }
  function cardN(c) { return c.name || c; } // Vue tableau entries: object {name} or string
  function corpName(p) { var raw = typeof p.corporationCard === 'string' ? p.corporationCard : (p.corporationCard.name || ''); return resolveCorpName(raw); }
  function getFx(name) { return typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[name] ? TM_CARD_EFFECTS[name] : null; }
  function getCardTagsForName(name) {
    if (typeof TM_CARD_TAGS === 'undefined') return [];
    return _lookupCardData(TM_CARD_TAGS, name) || [];
  }
  function getCardTextForSynergy(name) {
    var parts = [];
    var rating = _getRatingByCardName(name);
    if (rating) {
      if (rating.e) parts.push(String(rating.e).toLowerCase());
      if (rating.w) parts.push(String(rating.w).toLowerCase());
    }
    if (typeof TM_CARD_DESCRIPTIONS !== 'undefined') {
      var desc = _lookupCardData(TM_CARD_DESCRIPTIONS, name);
      if (typeof desc === 'string' && desc) parts.push(desc.toLowerCase());
    }
    return parts.join(' ');
  }
  function getColonyBehaviorByName(name) {
    if (typeof TM_CARD_DATA === 'undefined') return null;
    var data = _lookupCardData(TM_CARD_DATA, name);
    var behavior = data && data.behavior ? data.behavior : null;
    if (!behavior) return null;
    if (behavior.colonies) return behavior.colonies;
    var legacy = {};
    if (behavior.colony) legacy.buildColony = behavior.colony;
    if (typeof behavior.tradeFleet === 'number') legacy.addTradeFleet = behavior.tradeFleet;
    return Object.keys(legacy).length > 0 ? legacy : null;
  }
  function cardBuildsColonyByName(name) {
    var colonies = getColonyBehaviorByName(name);
    return !!(colonies && colonies.buildColony);
  }
  function cardHasTradeEngineByName(name) {
    var colonies = getColonyBehaviorByName(name);
    return !!(colonies && (
      (colonies.addTradeFleet || 0) > 0 ||
      typeof colonies.tradeDiscount === 'number' ||
      typeof colonies.tradeOffset === 'number' ||
      typeof colonies.tradeMC === 'number'
    ));
  }
  function cardIsColonyRelatedByName(name) {
    if (!name) return false;
    if (cardBuildsColonyByName(name) || cardHasTradeEngineByName(name)) return true;
    var text = getCardTextForSynergy(name);
    return text.includes('place a colony') ||
      text.includes('colony in play') ||
      text.includes('colony bonus') ||
      text.includes('your colonies') ||
      text.includes('when you trade') ||
      text.includes('trade bonus') ||
      text.includes('trade income') ||
      text.includes('trade fleet') ||
      text.includes('colony tile track') ||
      text.includes('колон') ||
      text.includes('торгов') ||
      text.includes('флот');
  }
  function cardIsColonyBenefitByName(name) {
    if (!name) return false;
    if (cardHasTradeEngineByName(name)) return true;
    var text = getCardTextForSynergy(name);
    return text.includes('colony in play') ||
      text.includes('colony bonus') ||
      text.includes('your colonies') ||
      text.includes('when you trade') ||
      text.includes('trade bonus') ||
      text.includes('trade income') ||
      text.includes('trade fleet') ||
      text.includes('colony tile track') ||
      text.includes('колон') ||
      text.includes('торгов') ||
      text.includes('флот');
  }
  function getCardTypeByName(name) {
    if (!name) return '';
    var rating = _getRatingByCardName(name);
    if (rating && rating.type) return String(rating.type).toLowerCase();
    var data = (typeof TM_CARD_DATA !== 'undefined') ? _lookupCardData(TM_CARD_DATA, name) : null;
    if (data && data.type) return String(data.type).toLowerCase();
    return '';
  }
  function isPreludeOrCorpName(name) {
    if (!name) return false;
    var type = getCardTypeByName(name);
    if (type === 'prelude' || type === 'corporation' || type === 'corp') return true;
    if (typeof getVisiblePreludeNames === 'function' && getVisiblePreludeNames().indexOf(name) >= 0) return true;
    if (typeof detectMyCorps === 'function' && detectMyCorps().indexOf(name) >= 0) return true;
    if (typeof TM_CORPS !== 'undefined' && _lookupCardData(TM_CORPS, name)) return true;
    return false;
  }
  function cardHasRequirementsByName(name) {
    var fx = typeof TM_CARD_EFFECTS !== 'undefined' ? _lookupCardData(TM_CARD_EFFECTS, name) : null;
    if (fx && (fx.minG != null || fx.maxG != null || fx.minT != null || fx.maxT != null)) return true;
    var data = typeof TM_CARD_DATA !== 'undefined' ? _lookupCardData(TM_CARD_DATA, name) : null;
    return !!(data && data.requirements && data.requirements.length > 0);
  }
  function cardMatchesDiscountEntry(name, discountEntry) {
    if (!name || !discountEntry || isPreludeOrCorpName(name)) return false;
    if (discountEntry._all) return true;
    if (discountEntry._req) return cardHasRequirementsByName(name);
    var tags = getCardTagsForName(name);
    for (var tag in discountEntry) {
      if (!Object.prototype.hasOwnProperty.call(discountEntry, tag)) continue;
      if (tag.charAt(0) === '_') continue;
      if (tags.indexOf(tag) >= 0) return true;
    }
    return false;
  }
  function getDiscountTargetLabel(discountEntry) {
    if (!discountEntry) return 'discount';
    if (discountEntry._req) return 'req';
    if (discountEntry._all) return 'card';
    var tags = Object.keys(discountEntry).filter(function(key) { return key && key.charAt(0) !== '_'; });
    if (tags.length === 1) return getRequirementTagReasonLabel(tags[0]);
    return 'discount';
  }
  function formatDiscountTargetReason(discountEntry, targets, bonusValue) {
    if (!discountEntry || !Array.isArray(targets) || targets.length === 0) return '';
    var label = getDiscountTargetLabel(discountEntry);
    var noun = targets.length === 1 ? 'target' : 'targets';
    var shown = targets.slice(0, 2).map(reasonCardLabel).join(', ');
    var extra = targets.length > 2 ? ', +' + (targets.length - 2) : '';
    var rounded = Math.round((bonusValue || 0) * 10) / 10;
    var head = targets.length + ' ' + label + ' discount ' + noun + ' +' + rounded;
    return shown ? (head + ' (' + shown + extra + ')') : head;
  }
  function globalParamRaises(g) {
    var tempLeft = g.temperature != null ? Math.max(0, (SC.tempMax - g.temperature) / SC.tempStep) : 0;
    var oxyLeft = g.oxygenLevel != null ? Math.max(0, SC.oxyMax - g.oxygenLevel) : 0;
    var oceanLeft = g.oceans != null ? Math.max(0, SC.oceansMax - g.oceans) : 0;
    return { temp: tempLeft, oxy: oxyLeft, ocean: oceanLeft, total: tempLeft + oxyLeft + oceanLeft };
  }
  function estimateGensLeft(pv) {
    // Delegate to TM_BRAIN.estimateGensLeft for unified calculation
    if (typeof TM_ADVISOR !== 'undefined' && TM_ADVISOR.estimateGensLeft && pv) {
      return TM_ADVISOR.estimateGensLeft(pv);
    }
    // Fallback: gen-based estimate adapted to player count
    var gen = detectGeneration();
    var maxGen = SC.maxGenerations || 9;
    // Adjust for player count and WGT
    if (pv && pv.game) {
      var plCount = (pv.game.players || []).length || 3;
      var wgt = pv.game.gameOptions && pv.game.gameOptions.solarPhaseOption;
      if (plCount >= 4) maxGen = wgt ? 12 : 14;
      else if (plCount <= 2) maxGen = wgt ? 10 : 14;
      else maxGen = wgt ? 10 : 12;
    }
    var glByGen = Math.max(1, maxGen - gen);
    if (pv && pv.game) {
      var raises = globalParamRaises(pv.game);
      var glByRaises = Math.max(1, Math.ceil(raises.total / SC.genParamDivisor));
      return Math.min(glByRaises, glByGen);
    }
    return glByGen;
  }
  // 0 = use default tableauSynergyPer; explicit weight overrides

  // ── Visibility Guard — pause processing when tab is hidden ──
  let _tabVisible = !document.hidden;
  document.addEventListener('visibilitychange', function() {
    _tabVisible = !document.hidden;
    if (_tabVisible && enabled) debouncedProcess();
  });

  // Panel state keys for persistence
  const PANEL_DEFAULTS = {
    enabled: true, tierFilter: tierFilter,
    panel_min_state: '{}',
  };

  function savePanelState() {
    safeStorage((s) => s.local.set({
      panel_min_state: JSON.stringify(panelMinState),
    }));
  }

  // ── Panel minimize state ──
  var panelMinState = {}; // panelId → boolean
  function minBtn(panelId) {
    var sym = panelMinState[panelId] ? '▼' : '▲';
    return '<button class="tm-minimize-btn" data-minimize="' + panelId + '" title="Свернуть/развернуть">' + sym + '</button>';
  }
  function applyMinState(el, panelId) {
    if (!el) return;
    if (panelMinState[panelId]) el.classList.add('tm-panel-minimized');
    else el.classList.remove('tm-panel-minimized');
  }
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-minimize]');
    if (!btn) return;
    var id = btn.getAttribute('data-minimize');
    panelMinState[id] = !panelMinState[id];
    var panel = btn.closest('.tm-log-panel');
    if (panel) {
      panel.classList.toggle('tm-panel-minimized');
      btn.textContent = panelMinState[id] ? '▼' : '▲';
    }
    savePanelState();
  });

  // Load settings
  safeStorage((s) => {
    s.local.get(PANEL_DEFAULTS, (r) => {
      enabled = r.enabled;
      tierFilter = r.tierFilter;
      if (r.panel_min_state) {
        try { panelMinState = JSON.parse(r.panel_min_state); } catch(e) { tmWarn('init', 'panelMinState parse failed', e); }
      }
      if (TM_CONTENT_CARD_STATS && TM_CONTENT_CARD_STATS.preloadCardStats) {
        TM_CONTENT_CARD_STATS.preloadCardStats({ safeStorage: safeStorage });
      }
      if (enabled) processAll();
    });

    s.onChanged.addListener((changes) => {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
        enabled ? processAll() : removeAll();
      }
      if (changes.tierFilter) {
        tierFilter = changes.tierFilter.newValue;
        reapplyFilter();
      }
    });
  });

  // Kebab lookup: "arctic-algae" → "Arctic Algae"
  const kebabLookup = {};
  // Lowercase lookup: "arctic algae" → "Arctic Algae" (for log matching)
  const lowerLookup = {};
  for (const name in TM_RATINGS) {
    kebabLookup[name.toLowerCase().replace(/ /g, '-')] = name;
    lowerLookup[name.toLowerCase()] = name;
  }

  var ruName = TM_UTILS.ruName;

  // ── Card name extraction ──

  function getCardName(cardEl) {
    for (const cls of cardEl.classList) {
      if (
        cls.startsWith('card-') &&
        cls !== 'card-container' &&
        cls !== 'card-unavailable' &&
        cls !== 'card-standard-project' &&
        cls !== 'card-hide'
      ) {
        const kebab = cls.slice(5);
        if (kebabLookup[kebab]) return kebabLookup[kebab];
      }
    }

    const titleEl = cardEl.querySelector('.card-title');
    if (titleEl) {
      const textEls = titleEl.querySelectorAll(
        'div:not(.prelude-label):not(.corporation-label):not(.ceo-label)'
      );
      for (const el of textEls) {
        const text = el.textContent.trim().split(':')[0].trim();
        if (text && _getRatingByCardName(text)) return _getRatingKeyByCardName(text);
        if (text) {
          const lowered = lowerLookup[text.toLowerCase()];
          if (lowered) return lowered;
        }
        var resolved = typeof resolveCorpName === 'function' ? resolveCorpName(text) : text;
        if (resolved && resolved !== text && _getRatingByCardName(resolved)) return _getRatingKeyByCardName(resolved);
      }
      const directText = titleEl.textContent.trim().split(':')[0].trim();
      if (directText && _getRatingByCardName(directText)) return _getRatingKeyByCardName(directText);
      if (directText) {
        const loweredDirect = lowerLookup[directText.toLowerCase()];
        if (loweredDirect) return loweredDirect;
      }
      var resolvedDirect = typeof resolveCorpName === 'function' ? resolveCorpName(directText) : directText;
      if (resolvedDirect && resolvedDirect !== directText && _getRatingByCardName(resolvedDirect)) return _getRatingKeyByCardName(resolvedDirect);
    }
    return null;
  }

  function getProductionFloorStatus(cardName, ctx) {
    var result = { unplayable: false, reasons: [] };
    if (!cardName || !ctx || !ctx.prod || typeof TM_CARD_EFFECTS === 'undefined') return result;
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx) return result;

    var checks = [
      { fxKey: 'ep', prodKey: 'energy', label: 'energy' },
      { fxKey: 'sp', prodKey: 'steel', label: 'steel' },
      { fxKey: 'tp', prodKey: 'ti', label: 'titanium' },
      { fxKey: 'pp', prodKey: 'plants', label: 'plants' },
      { fxKey: 'hp', prodKey: 'heat', label: 'heat' },
    ];

    for (var i = 0; i < checks.length; i++) {
      var check = checks[i];
      var delta = fx[check.fxKey] || 0;
      if (delta >= 0) continue;
      var current = Number(ctx.prod[check.prodKey] || 0);
      var after = current + delta;
      if (after < 0) {
        result.unplayable = true;
        result.reasons.push('Невозможно сыграть: ' + check.label + ' prod ' + current + '→' + after);
      }
    }

    return result;
  }

  function detectCardTypeForScoring(cardEl, cardTags, eLower) {
    var tags = cardTags || new Set();
    var text = (eLower || '').toLowerCase();
    if (cardEl) {
      if (cardEl.classList.contains('card-type--active') ||
          cardEl.querySelector('.card-content--blue, .blue-action, [class*="blue"]')) {
        return 'blue';
      }
      if (tags.has('event') ||
          cardEl.classList.contains('card-type--event') ||
          cardEl.querySelector('.card-content--red')) {
        return 'red';
      }
    } else if (tags.has('event')) {
      return 'red';
    } else if (text.includes('action')) {
      return 'blue';
    }
    return 'green';
  }

  // ── Badge injection ──

  function injectBadge(cardEl) {
    if (TM_CONTENT_BADGES && typeof TM_CONTENT_BADGES.injectBadge === 'function') {
      TM_CONTENT_BADGES.injectBadge({
        cardEl: cardEl,
        getCardName: getCardName,
        getRatingByCardName: _getRatingByCardName,
        hideTooltip: hideTooltip,
        showTooltip: showTooltip,
        tierFilter: tierFilter
      });
      return;
    }
  }

  function revealPendingContextBadge(badge) {
    if (TM_CONTENT_BADGES && typeof TM_CONTENT_BADGES.revealPendingContextBadge === 'function') {
      TM_CONTENT_BADGES.revealPendingContextBadge(badge);
      return;
    }
  }

  function revealPendingWorkflowBadges(scope) {
    if (TM_CONTENT_BADGES && typeof TM_CONTENT_BADGES.revealPendingWorkflowBadges === 'function') {
      TM_CONTENT_BADGES.revealPendingWorkflowBadges(scope);
      return;
    }
  }

  // ── Context building helpers (shared between getPlayerContext & buildOpponentContext) ──

  function forEachPlayerTag(tagsData, cb) {
    if (!tagsData || typeof cb !== 'function') return;
    if (Array.isArray(tagsData)) {
      for (var i = 0; i < tagsData.length; i++) {
        var arrTagName = (tagsData[i].tag || '').toLowerCase();
        var arrTagCount = tagsData[i].count || 0;
        if (arrTagName && arrTagCount > 0) cb(arrTagName, arrTagCount);
      }
      return;
    }
    if (typeof tagsData !== 'object') return;
    for (var rawTagName in tagsData) {
      if (!Object.prototype.hasOwnProperty.call(tagsData, rawTagName)) continue;
      var mapTagName = (rawTagName || '').toLowerCase();
      var mapTagCount = tagsData[rawTagName] || 0;
      if (mapTagName && mapTagCount > 0) cb(mapTagName, mapTagCount);
    }
  }

  function getPlayerTagCount(playerLike, tagName) {
    if (!playerLike || !playerLike.tags || !tagName) return 0;
    var wantedTag = String(tagName).toLowerCase();
    var foundCount = 0;
    forEachPlayerTag(playerLike.tags, function(tag, count) {
      if (tag === wantedTag) foundCount = count;
    });
    return foundCount;
  }

  function extractPlayerTags(tagsData, ctx) {
    forEachPlayerTag(tagsData, function(tagName, count) {
      ctx.tags[tagName] = count;
      ctx.uniqueTagCount++;
    });
  }

  function applyCorpDiscounts(corpsArray, ctx) {
    if (typeof CORP_DISCOUNTS === 'undefined') return;
    for (var i = 0; i < corpsArray.length; i++) {
      var cd = CORP_DISCOUNTS[corpsArray[i]];
      if (cd) {
        for (var tag in cd) {
          ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
        }
      }
    }
  }

  function applyCardDiscounts(ctx) {
    if (typeof CARD_DISCOUNTS === 'undefined') return;
    for (var cardName in CARD_DISCOUNTS) {
      if (ctx.tableauNames.has(cardName)) {
        var cd = CARD_DISCOUNTS[cardName];
        for (var tag in cd) {
          ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
        }
      }
    }
  }

  function applyTagTriggers(ctx, corpsToCheck) {
    if (typeof TAG_TRIGGERS === 'undefined') return;
    for (var name in TAG_TRIGGERS) {
      if (ctx.tableauNames.has(name) || corpsToCheck.indexOf(name) >= 0) {
        var trigs = TAG_TRIGGERS[name];
        for (var i = 0; i < trigs.length; i++) {
          ctx.tagTriggers.push(trigs[i]);
        }
      }
    }
  }

  function computeBoardState(pv, ctx) {
    if (!pv || !pv.game || !pv.game.spaces) return;
    for (var i = 0; i < pv.game.spaces.length; i++) {
      var sp = pv.game.spaces[i];
      if (sp.spaceType === 'land' || sp.spaceType === 'ocean') {
        if (sp.tileType != null) {
          ctx.totalOccupied++;
          if (isOceanTile(sp.tileType)) ctx.oceansOnBoard++;
        } else {
          ctx.emptySpaces++;
        }
      }
    }
    ctx.boardFullness = (ctx.emptySpaces + ctx.totalOccupied) > 0
      ? ctx.totalOccupied / (ctx.emptySpaces + ctx.totalOccupied) : 0;
  }

  function extractColonies(pv, playerColor, ctx) {
    if (!pv || !pv.game || !pv.game.colonies) return;
    ctx.colonyWorldCount = pv.game.colonies.length;
    var trackSum = 0, trackCount = 0;
    for (var i = 0; i < pv.game.colonies.length; i++) {
      var col = pv.game.colonies[i];
      if (col.colonies) {
        ctx.totalColonies += col.colonies.length;
        for (var j = 0; j < col.colonies.length; j++) {
          if (col.colonies[j].player === playerColor) ctx.coloniesOwned++;
        }
      }
      if (col.trackPosition != null) { trackSum += col.trackPosition; trackCount++; }
    }
    ctx.avgTrackPosition = trackCount > 0 ? trackSum / trackCount : 0;
  }

  // MA proximity — milestone/award proximity computation for any player
  function processMAProximity(player, playerColor, pv, ctx) {
    if (typeof MA_DATA === 'undefined') return;
    var activeNames = detectActiveMA();
    var maEntries = Object.entries(MA_DATA);
    for (var mai = 0; mai < maEntries.length; mai++) {
      var maName = maEntries[mai][0];
      var ma = maEntries[mai][1];
      if (activeNames.length > 0 && !activeNames.some(function(n) { return n.includes(maName); })) continue;

      var current = computeMAValueForPlayer(ma, player, pv);
      var target = ma.target || 0;
      var pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      ctx.activeMA.push({ name: maName, type: ma.type, check: ma.check, tag: ma.tag, target: target, current: current, pct: pct, resource: ma.resource });

      // Milestone tag proximity
      if (ma.type === 'milestone' && ma.check === 'tags' && ma.tag && target > 0) {
        var need = target - current;
        if (need > 0 && need <= 3) {
          var prev = ctx.milestoneNeeds[ma.tag];
          if (prev === undefined || need < prev) ctx.milestoneNeeds[ma.tag] = need;
        }
      }
      if (ma.type === 'milestone' && ma.check === 'bioTags' && target > 0) {
        // Milestones check tableau only
        var bioCnt = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
        var bioNeed = target - bioCnt;
        if (bioNeed > 0 && bioNeed <= 3) {
          var bioTags = ['plant', 'microbe', 'animal'];
          for (var bti = 0; bti < bioTags.length; bti++) {
            var bPrev = ctx.milestoneNeeds[bioTags[bti]];
            if (bPrev === undefined || bioNeed < bPrev) ctx.milestoneNeeds[bioTags[bti]] = bioNeed;
          }
        }
      }
      if (ma.type === 'milestone' && target > 0 && ma.check !== 'tags' && ma.check !== 'bioTags') {
        var msNeed = target - current;
        if (msNeed > 0 && msNeed <= 3) {
          var msKey = ma.check + (ma.resource ? '_' + ma.resource : '');
          var msPrev = ctx.milestoneSpecial[msKey];
          if (msPrev === undefined || msNeed < msPrev) ctx.milestoneSpecial[msKey] = { need: msNeed, name: maName };
        }
      }
      if (ma.type === 'award' && ma.check === 'tags' && ma.tag) {
        ctx.awardTags[ma.tag] = true;
      }

      // Award racing
      if (ma.type === 'award' && pv && pv.game && pv.game.awards && pv.game.players) {
        var funded = null;
        for (var afi = 0; afi < pv.game.awards.length; afi++) {
          var aw = pv.game.awards[afi];
          if (((aw.name || '').toLowerCase().indexOf(maName.toLowerCase()) >= 0) ||
              (maName.toLowerCase().indexOf((aw.name || '').toLowerCase()) >= 0)) {
            funded = aw; break;
          }
        }
        if (funded && (funded.playerName || funded.player || funded.color)) {
          var bestOpp = 0;
          for (var opi = 0; opi < pv.game.players.length; opi++) {
            var rOpp = pv.game.players[opi];
            if (rOpp.color === playerColor) continue;
            var rScore = computeMAValueForPlayer(ma, rOpp, pv);
            if (rScore > bestOpp) bestOpp = rScore;
          }
          ctx.awardRacing[maName] = {
            myScore: current,
            bestOpp: bestOpp,
            delta: current - bestOpp,
            gap: Math.max(0, bestOpp - current),
            leading: current >= bestOpp,
            check: ma.check,
            tag: ma.tag || '',
            resource: ma.resource || ''
          };
        }
      }
    }
  }

  // ── Opponent strategy classifier ──
  // Returns array of {id, icon, label} for detected archetypes
  var _OPP_STRAT_DEFS = [
    { id: 'venus',   icon: '\u2640', label: 'Venus',       corps: ['Morning Star Inc.', 'Celestic', 'Aphrodite'], tagKey: 'venus',   tagMin: 3 },
    { id: 'plant',   icon: '\uD83C\uDF3F', label: 'Plant engine', corps: ['Ecoline'], tagKey: 'plant',   tagMin: 3, prodKey: 'plantProduction', prodMin: 3 },
    { id: 'heat',    icon: '\uD83D\uDD25', label: 'Heat/Temp',    corps: ['Helion', 'Stormcraft Incorporated'], tagKey: null,      tagMin: 0, prodKey: 'heatProduction', prodMin: 5 },
    { id: 'colony',  icon: '\uD83D\uDE80', label: 'Colony',       corps: ['Poseidon', 'Aridor', 'Polyphemos', 'Arklight'], countKey: 'coloniesCount', countMin: 3 },
    { id: 'city',    icon: '\uD83C\uDFD9', label: 'City',         corps: ['Tharsis Republic', 'Philares'], countKey: 'citiesCount', countMin: 3 },
    { id: 'science', icon: '\uD83D\uDD2C', label: 'Science',      corps: [], tagKey: 'science', tagMin: 3, cards: ['Earth Catapult', 'Anti-Gravity Technology', 'Cutting Edge Technology', 'Research Outpost'] },
    { id: 'jovian',  icon: '\uD83E\uDE90', label: 'Jovian VP',    corps: ['Saturn Systems', 'Phobolog'], tagKey: 'jovian',  tagMin: 3 },
    { id: 'animal',  icon: '\uD83D\uDC3E', label: 'Animal VP',    corps: ['Arklight'], tagKey: 'animal', tagMin: 2, cards: ['Birds', 'Fish', 'Livestock', 'Predators', 'Ecological Zone', 'Small Animals'] },
    { id: 'event',   icon: '\u26A1', label: 'Event spam',   corps: ['Interplanetary Cinematics'], tagKey: 'event',  tagMin: 5 }
  ];

  function classifyOppStrategy(opp, oppCards, ctx) {
    // Build tag map for this opponent: {venus: 3, science: 2, ...}
    var tagMap = {};
    forEachPlayerTag(opp.tags, function(tagName, count) {
      tagMap[tagName] = (tagMap[tagName] || 0) + count;
    });
    // Find opponent corp name (from ctx.oppCorpToPlayer or tableau)
    var oppName = opp.name || opp.color;
    var oppCorpName = '';
    for (var ck in ctx.oppCorpToPlayer) {
      if (ctx.oppCorpToPlayer[ck] === oppName) { oppCorpName = ck; break; }
    }
    // Also check tableau for corp
    if (!oppCorpName && opp.tableau) {
      for (var ci = 0; ci < opp.tableau.length; ci++) {
        var ce = opp.tableau[ci];
        if (ce.cardType === 'corp' || (TM_RATINGS[cardN(ce)] && TM_RATINGS[cardN(ce)].t === 'corp')) {
          oppCorpName = cardN(ce);
          break;
        }
      }
    }
    // Build card set for quick lookup
    var cardSet = {};
    for (var cci = 0; cci < oppCards.length; cci++) cardSet[oppCards[cci]] = true;

    var detected = [];
    for (var di = 0; di < _OPP_STRAT_DEFS.length; di++) {
      var def = _OPP_STRAT_DEFS[di];
      var matched = false;
      // Check corp match
      if (oppCorpName) {
        for (var cri = 0; cri < def.corps.length; cri++) {
          if (oppCorpName.indexOf(def.corps[cri]) !== -1) { matched = true; break; }
        }
      }
      // Check tag threshold
      if (!matched && def.tagKey && def.tagMin > 0) {
        if ((tagMap[def.tagKey] || 0) >= def.tagMin) matched = true;
      }
      // Check production threshold
      if (!matched && def.prodKey && def.prodMin > 0) {
        if ((opp[def.prodKey] || 0) >= def.prodMin) matched = true;
      }
      // Check count threshold (cities, colonies)
      if (!matched && def.countKey && def.countMin > 0) {
        if ((opp[def.countKey] || 0) >= def.countMin) matched = true;
      }
      // Check specific cards in tableau (need 2+ matches)
      if (!matched && def.cards && def.cards.length > 0) {
        var cardHits = 0;
        for (var sci = 0; sci < def.cards.length; sci++) {
          if (cardSet[def.cards[sci]]) cardHits++;
        }
        if (cardHits >= 2) matched = true;
      }
      if (matched) detected.push({ id: def.id, icon: def.icon, label: def.label });
    }
    return detected;
  }

  // Opponent scanning — detect opponent corps, take-that, attacks
  function scanOpponents(pv, myColor, ctx) {
    ctx.oppCorps = [];
    ctx.oppCorpToPlayer = {}; // corp name → player name
    ctx.oppHasTakeThat = false;
    ctx.oppHasAnimalAttack = false;
    ctx.oppHasPlantAttack = false;
    ctx.oppHasSolarLogistics = false;
    ctx.oppHasEarthCatapult = false;
    ctx.oppAnimalTargets = 0;
    ctx.oppMicrobeTargets = 0;
    if (!pv || !pv.game || !pv.game.players) return;
    for (var i = 0; i < pv.game.players.length; i++) {
      var opp = pv.game.players[i];
      if (opp.color === myColor) continue;
      if (opp.tableau) {
        for (var j = 0; j < opp.tableau.length; j++) {
          var cn = cardN(opp.tableau[j]);
          if (opp.tableau[j].cardType === 'corp' || (TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp')) {
            ctx.oppCorps.push(cn);
          }
          if (TAKE_THAT_CARDS[cn]) ctx.oppHasTakeThat = true;
          if (cn === 'Predators' || cn === 'Ants') ctx.oppHasAnimalAttack = true;
          if (cn === 'Virus' || cn === 'Giant Ice Asteroid' || cn === 'Deimos Down' || cn === 'Comet') ctx.oppHasPlantAttack = true;
          if (ANIMAL_TARGETS.has(cn)) ctx.oppAnimalTargets++;
          if (MICROBE_TARGETS.has(cn)) ctx.oppMicrobeTargets++;
          if (cn === 'Solar Logistics') ctx.oppHasSolarLogistics = true;
          if (cn === 'Earth Catapult') ctx.oppHasEarthCatapult = true;
        }
      }
      if (opp.corporationCard) {
        var oc = corpName(opp);
        if (oc) {
          ctx.oppCorps.push(oc);
          ctx.oppCorpToPlayer[oc] = opp.name || opp.color;
        }
      }
      // Track opponent tableau for strategy detection
      if (!ctx.oppTableau) ctx.oppTableau = {};
      var oppCards = [];
      if (opp.tableau) {
        for (var _otk = 0; _otk < opp.tableau.length; _otk++) {
          oppCards.push(cardN(opp.tableau[_otk]));
        }
      }
      ctx.oppTableau[opp.name || opp.color] = oppCards;

      // Classify opponent strategy from tags, production, corps and tableau
      if (!ctx.oppStrategies) ctx.oppStrategies = {};
      ctx.oppStrategies[opp.name || opp.color] = classifyOppStrategy(opp, oppCards, ctx);

      // Track opponent TR and strategy signals
      var oppTR = opp.terraformRating || 0;
      if (!ctx.oppMaxTR || oppTR > ctx.oppMaxTR) {
        ctx.oppMaxTR = oppTR;
        ctx.oppLeader = opp.name || opp.color;
      }
      // Track opponent tags for deny-draft and award competition
      if (opp.tags) {
        if (!ctx.oppTags) ctx.oppTags = {};
        forEachPlayerTag(opp.tags, function(tagName, count) {
          ctx.oppTags[tagName] = (ctx.oppTags[tagName] || 0) + count;
        });
      }
    }
    ctx.oppTRGap = (ctx.oppMaxTR || 0) - (ctx.tr || 0);
  }

  // Global params extraction
  function extractGlobalParams(pv, ctx) {
    ctx.globalParams = { temp: -30, oxy: 0, oceans: 0, venus: 0 };
    if (!pv || !pv.game) return;
    var g = pv.game;
    if (g.temperature != null) ctx.globalParams.temp = g.temperature;
    if (g.oxygenLevel != null) ctx.globalParams.oxy = g.oxygenLevel;
    if (g.oceans != null) ctx.globalParams.oceans = g.oceans;
    // Fallback: count oceans from board spaces if g.oceans is missing/zero
    if (!ctx.globalParams.oceans && g.spaces) {
      var oceanCount = 0;
      for (var si = 0; si < g.spaces.length; si++) {
        var tt = g.spaces[si].tileType;
        if (tt === 'ocean' || tt === 2 || tt === 20 || tt === 21 || tt === 22) oceanCount++;
      }
      if (oceanCount > 0) ctx.globalParams.oceans = oceanCount;
    }
    if (g.venusScaleLevel != null) ctx.globalParams.venus = g.venusScaleLevel;
  }

  // Fetch funded awards AND claimed milestones from game API
  var _gameMACache = { gameId: null, gen: 0, awards: new Set(), milestones: new Set(), claimedCount: 0, fetching: false };
  function _fetchGameMA(gameId, ctx) {
    var curGen = ctx.gen || 0;
    if (_gameMACache.gameId === gameId && _gameMACache.gen === curGen) {
      _gameMACache.awards.forEach(function(a) { ctx.awards.add(a); });
      // Re-enable unclaimed milestones if <3 claimed
      if (_gameMACache.claimedCount < 3) {
        _gameMACache.milestones.forEach(function(m) { ctx.milestones.add(m); });
      }
      ctx._awardsLoaded = true;
      return;
    }
    if (_gameMACache.fetching) return;
    _gameMACache.fetching = true;
    var url = window.location.origin + '/api/game?id=' + gameId;
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      _gameMACache.gameId = gameId;
      _gameMACache.gen = curGen;
      _gameMACache.awards = new Set();
      _gameMACache.milestones = new Set();
      _gameMACache.claimedCount = 0;
      if (data.awards) {
        data.awards.forEach(function(a) {
          if (a.funder_name || a.funder_color || a.fundedByPlayer) {
            _gameMACache.awards.add(a.name);
          }
        });
      }
      if (data.milestones) {
        data.milestones.forEach(function(m) {
          if (m.owner_name || m.owner_color) {
            _gameMACache.claimedCount++;
          } else {
            _gameMACache.milestones.add(m.name);
          }
        });
      }
      _gameMACache.fetching = false;
    }).catch(function() { _gameMACache.fetching = false; });
  }

  // Map + milestones/awards + terraform rate
  function extractMapAndRate(pv, ctx) {
    ctx.mapName = '';
    ctx.milestones = new Set();
    ctx.awards = new Set();
    ctx.terraformRate = 0;
    if (!pv || !pv.game) return;
    ctx.mapName = detectMap(pv.game);
    // Milestones + Awards: fetched from game API (playerView has no claim/fund status)
    // Milestones: only unclaimed ones added (if <3 claimed)
    // Awards: only funded ones added
    if (!ctx._awardsLoaded && pv.game.id) {
      _fetchGameMA(pv.game.id, ctx);
    }
    if (ctx.gen > 1) {
      var trTotal = 0;
      var gm = pv.game;
      if (typeof gm.temperature === 'number') trTotal += (gm.temperature + 30) / 2;
      if (typeof gm.oxygenLevel === 'number') trTotal += gm.oxygenLevel;
      if (typeof gm.oceans === 'number') trTotal += gm.oceans;
      ctx.terraformRate = trTotal / (ctx.gen - 1);
    }
  }

  // Turmoil context for a player
  function extractTurmoil(pv, playerColor, playerInfluence, ctx) {
    ctx.turmoilActive = false;
    ctx.rulingParty = '';
    ctx.myDelegates = 0;
    ctx.myInfluence = 0;
    ctx.dominantParty = '';
    if (!pv || !pv.game || !pv.game.turmoil) return;
    ctx.turmoilActive = true;
    var turm = pv.game.turmoil;
    if (turm.rulingParty) ctx.rulingParty = turm.rulingParty;
    ctx.dominantParty = turm.dominant || turm.dominantParty || '';
    ctx.myInfluence = playerInfluence || 0;
    if (turm.parties) {
      for (var i = 0; i < turm.parties.length; i++) {
        var party = turm.parties[i];
        if (!party.delegates) continue;
        for (var j = 0; j < party.delegates.length; j++) {
          var d = party.delegates[j];
          if (d === playerColor || (d && d.color === playerColor)) ctx.myDelegates++;
        }
      }
    }
    // Track coming/distant events for card scoring awareness
    ctx.comingEvent = turm.coming || '';
    ctx.distantEvent = turm.distant || '';
  }

  // ── Floater card detection via structured data ──

  function isFloaterCardByFx(cardName) {
    if (typeof TM_CARD_EFFECTS === 'undefined') return false;
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx) return false;
    var placeTypes = fx.places ? (Array.isArray(fx.places) ? fx.places : [fx.places]) : [];
    return fx.res === 'floater' || placeTypes.indexOf('floater') !== -1;
  }

  function isPlantEngineCardByFx(cardName, eLower) {
    var fx = getFx(cardName);
    if (fx) {
      var placeTypes = fx.places ? (Array.isArray(fx.places) ? fx.places : [fx.places]) : [];
      return !!(fx.pp || fx.pl || fx.grn || placeTypes.indexOf('plant') !== -1);
    }
    return !!(eLower && (
      eLower.includes('greenery') ||
      eLower.includes('озелен') ||
      eLower.includes('plant production') ||
      eLower.includes('раст')
    ));
  }

  function isMeltworksLastGenCashout(cardName, myHand, ctx) {
    if (cardName !== 'Meltworks' || !ctx || ctx.gensLeft > 1 || !ctx.globalParams || ctx.globalParams.temp < SC.tempMax) return false;
    if (ctx.tableauNames && (ctx.tableauNames.has('Electro Catapult') || ctx.tableauNames.has('Space Elevator'))) return true;
    if (!Array.isArray(myHand) || myHand.length === 0) return false;
    for (var i = 0; i < myHand.length; i++) {
      var otherName = myHand[i];
      if (!otherName || otherName === cardName) continue;
      var otherTags = getCardTagsForName(otherName);
      if (otherTags && otherTags.indexOf('building') !== -1) return true;
    }
    return false;
  }

  function hasSelfFloaterSource(cardName) {
    if (typeof TM_CARD_DATA === 'undefined') return false;
    var data = TM_CARD_DATA[cardName];
    if (!data) return false;
    return String(data.resourceType || '').toLowerCase() === 'floater' &&
      !!(data.action && data.action.addResources);
  }

  // ── Card owner detection (my card vs opponent's) ──

  function detectCardOwner(cardName, pvOverride) {
    var pv = pvOverride || getPlayerVueData();
    if (!pv) return null;
    // My tableau — return null (own card)
    if (pv.thisPlayer && pv.thisPlayer.tableau) {
      for (var i = 0; i < pv.thisPlayer.tableau.length; i++) {
        if ((cardN(pv.thisPlayer.tableau[i])) === cardName) return null;
      }
    }
    // Search opponent tableaus
    if (pv.game && pv.game.players) {
      var myColor = pv.thisPlayer ? pv.thisPlayer.color : null;
      for (var j = 0; j < pv.game.players.length; j++) {
        var opp = pv.game.players[j];
        if (opp.color === myColor) continue;
        if (opp.tableau) {
          for (var k = 0; k < opp.tableau.length; k++) {
            if ((cardN(opp.tableau[k])) === cardName) return opp;
          }
        }
      }
    }
    return null; // not in any tableau (draft/hand/shop)
  }

  // ── Opponent context cache ──
  var _oppCtxCache = {};   // color → { ctx, time }
  var _oppCtxCacheGen = 0; // reset when generation changes

  // Score a card from an opponent's perspective (reusable DRY helper)
  function scoreFromOpponentPerspective(cardName, oppPlayer, cardEl, pv, oppCtxOverride) {
    var oCtx = oppCtxOverride || getCachedOpponentContext(oppPlayer, pv);
    var oppTab = oCtx._allMyCards || [];
    var oCorp = oCtx._myCorps && oCtx._myCorps.length > 0 ? oCtx._myCorps[0] : '';
    return scoreDraftCard(cardName, oppTab, [], oCorp, cardEl, oCtx);
  }

  function getCachedOpponentContext(oppPlayer, pv) {
    var color = oppPlayer.color;
    var gen = detectGeneration();
    if (gen !== _oppCtxCacheGen) { _oppCtxCache = {}; _oppCtxCacheGen = gen; }
    var cached = _oppCtxCache[color];
    if (cached && Date.now() - cached.time < 5000) return cached.ctx;
    var ctx = buildOpponentContext(oppPlayer, pv);
    _oppCtxCache[color] = { ctx: ctx, time: Date.now() };
    return ctx;
  }

  function buildOpponentContext(oppPlayer, pv) {
    var gen = detectGeneration();
    var gensLeft = estimateGensLeft(pv);

    // Detect opponent corp from tableau
    var oppCorps = [];
    if (oppPlayer.tableau) {
      for (var i = 0; i < oppPlayer.tableau.length; i++) {
        var cn = cardN(oppPlayer.tableau[i]);
        if (oppPlayer.tableau[i].cardType === 'corp' || (TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp')) {
          oppCorps.push(cn);
        }
      }
    }
    if (oppCorps.length === 0 && oppPlayer.corporationCard) {
      var corpN = corpName(oppPlayer);
      if (corpN) oppCorps.push(corpN);
    }
    // Normalize opponent corp names via resolver
    for (var ri = 0; ri < oppCorps.length; ri++) oppCorps[ri] = resolveCorpName(oppCorps[ri]);

    var ctx = {
      gen: gen,
      gensLeft: gensLeft,
      tags: {},
      discounts: {},
      tagTriggers: [],
      mc: oppPlayer.megaCredits || 0,
      steel: oppPlayer.steel || 0,
      steelVal: oppPlayer.steelValue || SC.defaultSteelVal,
      titanium: oppPlayer.titanium || 0,
      tiVal: oppPlayer.titaniumValue || SC.defaultTiVal,
      heat: oppPlayer.heat || 0,
      colonies: oppPlayer.coloniesCount || 0,
      fleetSize: oppPlayer.fleetSize || 1,
      tradesUsed: oppPlayer.tradesThisGeneration || 0,
      tradesLeft: 0,
      coloniesOwned: 0,
      totalColonies: 0,
      colonyWorldCount: 0,
      prod: {
        mc: oppPlayer.megaCreditProduction || 0,
        steel: oppPlayer.steelProduction || 0,
        ti: oppPlayer.titaniumProduction || 0,
        plants: oppPlayer.plantProduction || 0,
        energy: oppPlayer.energyProduction || 0,
        heat: oppPlayer.heatProduction || 0,
      },
      tr: oppPlayer.terraformRating || 0,
      // M/A — skip for opponents (complex, low ROI)
      activeMA: [],
      milestoneNeeds: {},
      milestoneSpecial: {},
      awardTags: {},
      awardRacing: {},
      // Board state
      cities: 0,
      greeneries: 0,
      events: 0,
      handSize: oppPlayer.cardsInHandNbr || 0,
      tableauSize: oppPlayer.tableau ? oppPlayer.tableau.length : 0,
      uniqueTagCount: 0,
      tableauNames: new Set(),
      // Board spaces (shared)
      emptySpaces: 0,
      totalOccupied: 0,
      oceansOnBoard: 0,
      boardFullness: 0,
      // Resource accum
      microbeAccumRate: 0,
      floaterAccumRate: 0,
      animalAccumRate: 0,
      hasEnergyConsumers: false,
      floaterTargetCount: 0,
      animalTargetCount: 0,
      microbeTargetCount: 0,
      // Cached
      _myCorps: oppCorps,
      bestSP: null,
    };

    ctx.tradesLeft = Math.max(0, ctx.fleetSize - ctx.tradesUsed);

    // Colonies
    extractColonies(pv, oppPlayer.color, ctx);

    // Cities/greeneries
    if (pv && pv.game && pv.game.playerTiles && oppPlayer.color && pv.game.playerTiles[oppPlayer.color]) {
      ctx.cities = pv.game.playerTiles[oppPlayer.color].cities || 0;
      ctx.greeneries = pv.game.playerTiles[oppPlayer.color].greeneries || 0;
    }

    // Single-pass tableau scan: events, tableauNames, resource accum, energy, targets
    if (oppPlayer.tableau) scanTableauForContext(oppPlayer.tableau, ctx);

    // Tags, discounts, triggers, board
    extractPlayerTags(oppPlayer.tags, ctx);
    applyCorpDiscounts(oppCorps, ctx);
    applyCardDiscounts(ctx);
    applyTagTriggers(ctx, oppCorps);
    computeBoardState(pv, ctx);

    // Global params, map, MA proximity, opponent scanning, turmoil
    extractGlobalParams(pv, ctx);
    extractMapAndRate(pv, ctx);
    processMAProximity(oppPlayer, oppPlayer.color, pv, ctx);
    scanOpponents(pv, oppPlayer.color, ctx);
    extractTurmoil(pv, oppPlayer.color, oppPlayer.influence || 0, ctx);

    // ── Reference anchors ──
    var spResult = computeAllSP(pv, ctx.gensLeft);
    ctx.bestSP = spResult ? spResult.best : null;
    ctx.allSP = spResult ? spResult.all : [];

    // Pre-cache fields for scoreDraftCard (single pass)
    ctx._playedEvents = new Set();
    var oppTableauArr = [];
    if (oppPlayer.tableau) {
      for (var oti = 0; oti < oppPlayer.tableau.length; oti++) {
        var ocn = cardN(oppPlayer.tableau[oti]);
        oppTableauArr.push(ocn);
        var od = _getRatingByCardName(ocn);
        if (od && od.t === 'event') ctx._playedEvents.add(ocn);
      }
    }
    ctx._allMyCards = oppTableauArr;
    ctx._allMyCardsSet = new Set(oppTableauArr);
    ctx._handTagCounts = {};

    return ctx;
  }

  // ── Reason classification (positive vs negative) ──

  // ── Tooltip panel ──

  let tooltipEl = null;
  let tooltipHideTimer = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.createTooltipPanel === 'function') {
      tooltipEl = TM_CONTENT_TOOLTIP.createTooltipPanel(
        function() {
          if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
        },
        function() { scheduleHideTooltip(200); }
      );
      return tooltipEl;
    }
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tm-tooltip-panel';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => {
      if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    });
    tooltipEl.addEventListener('mouseleave', () => scheduleHideTooltip(200));
    return tooltipEl;
  }

  // Build trigger hits HTML for tooltip (mine or opponent's tableau)
  function buildTriggerHtml(cardEl, isOppCard, oppOwner, oppCtx, pv) {
    var triggerState = TM_CONTENT_TOOLTIP_STATE && typeof TM_CONTENT_TOOLTIP_STATE.resolveTooltipTriggerState === 'function'
      ? TM_CONTENT_TOOLTIP_STATE.resolveTooltipTriggerState({
        cardEl: cardEl,
        cardN: cardN,
        detectMyCorps: detectMyCorps,
        getCardTags: getCardTags,
        isOppCard: isOppCard,
        oppCtx: oppCtx,
        oppOwner: oppOwner,
        pv: pv,
        tagTriggers: TAG_TRIGGERS
      })
      : null;
    var hits = triggerState ? triggerState.hits : [];
    var isOpponent = triggerState ? triggerState.isOpponent : isOppCard;
    if (hits.length === 0) return '';
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildTriggerHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildTriggerHtml({
        escHtml: escHtml,
        hits: hits,
        isOpponent: isOpponent
      });
    }
    var cls = isOpponent ? 'tm-tip-row--trigger-opp' : 'tm-tip-row--trigger';
    return '<div class="tm-tip-row ' + cls + '">\u26A1 ' + hits.map(escHtml).join(', ') + '</div>';
  }

  // Build unmet requirements HTML for tooltip
  function buildReqCheckHtml(cardEl, pv) {
    var requirementState = TM_CONTENT_TOOLTIP_STATE && typeof TM_CONTENT_TOOLTIP_STATE.resolveTooltipRequirementState === 'function'
      ? TM_CONTENT_TOOLTIP_STATE.resolveTooltipRequirementState({
        cardEl: cardEl,
        detectMyCorps: detectMyCorps,
        evaluateBoardRequirements: evaluateBoardRequirements,
        getBoardRequirementStatusLabel: getBoardRequirementStatusLabel,
        getCachedPlayerContext: getCachedPlayerContext,
        getRequirementFlexSteps: getRequirementFlexSteps,
        pv: pv
      })
      : null;
    var checks = requirementState ? requirementState.checks : [];
    if (checks.length === 0) return '';
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildRequirementHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildRequirementHtml({
        checks: checks
      });
    }
    return '<div class="tm-tip-row tm-tip-row--error">\u2717 ' + checks.join(' | ') + '</div>';
  }

  // Split reasons into positive/negative and render as column
  function buildReasonsHtml(tipReasons) {
    if (!tipReasons) return '';
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildReasonsHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildReasonsHtml(tipReasons, escHtml);
    }
    return '';
  }

  function reasonTextPayload(reason) {
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.reasonText === 'function') {
      return TM_CONTENT_TOOLTIP.reasonText(reason);
    }
    if (typeof reason === 'string') return reason;
    if (reason && typeof reason.text === 'string') return reason.text;
    return '';
  }

  function normalizeReasonRowsPayload(reasonInput) {
    if (!reasonInput) return [];
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.normalizeReasonRows === 'function') {
      return TM_CONTENT_TOOLTIP.normalizeReasonRows(reasonInput);
    }
    var rows = Array.isArray(reasonInput) ? reasonInput : (typeof reasonInput === 'string' ? reasonInput.split('|') : []);
    return rows
      .map(function(reason) {
        var text = reasonTextPayload(reason).trim();
        if (!text) return null;
        return { tone: 'positive', text: text };
      })
      .filter(function(reason) { return !!reason; });
  }

  function mergeReasonRows(baseRows, overrideRows) {
    if (!overrideRows || overrideRows.length === 0) return baseRows;
    var overrideByText = new Map();
    for (var oi = 0; oi < overrideRows.length; oi++) {
      overrideByText.set(reasonTextPayload(overrideRows[oi]), overrideRows[oi]);
    }
    var merged = [];
    var seen = new Set();
    for (var bi = 0; bi < baseRows.length; bi++) {
      var baseText = reasonTextPayload(baseRows[bi]);
      var row = overrideByText.get(baseText) || baseRows[bi];
      merged.push(row);
      seen.add(reasonTextPayload(row));
    }
    for (var oi2 = 0; oi2 < overrideRows.length; oi2++) {
      var overrideText = reasonTextPayload(overrideRows[oi2]);
      if (!seen.has(overrideText)) {
        merged.push(overrideRows[oi2]);
        seen.add(overrideText);
      }
    }
    return merged;
  }

  function getReasonRowsFromSource(source) {
    if (!source) return [];
    if (typeof source === 'object' && !Array.isArray(source) && !source.text && (source.reasons || source.reasonRows)) {
      var baseRows = normalizeReasonRowsPayload(source.reasons || []);
      var explicitRows = normalizeReasonRowsPayload(source.reasonRows || []);
      return mergeReasonRows(baseRows, explicitRows);
    }
    return normalizeReasonRowsPayload(source);
  }

  function serializeReasonRowsPayload(reasonRows) {
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.serializeReasonRows === 'function') {
      return TM_CONTENT_TOOLTIP.serializeReasonRows(reasonRows);
    }
    try {
      return JSON.stringify(normalizeReasonRowsPayload(reasonRows));
    } catch (e) {
      return '';
    }
  }

  function parseReasonRowsPayload(raw) {
    if (!raw) return [];
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.parseReasonRows === 'function') {
      return TM_CONTENT_TOOLTIP.parseReasonRows(raw);
    }
    try {
      return normalizeReasonRowsPayload(JSON.parse(raw));
    } catch (e) {
      return [];
    }
  }

  function clearReasonPayload(el) {
    if (!el) return;
    el.removeAttribute('data-tm-reasons');
    el.removeAttribute('data-tm-reason-rows');
  }

  function setReasonPayload(el, source) {
    if (!el) return;
    var reasonRows = getReasonRowsFromSource(source);
    var cleanedReqPayload = cleanupRequirementReasons(reasonRows.map(reasonTextPayload), reasonRows);
    reasonRows = cleanedReqPayload.reasonRows;
    if (reasonRows.length === 0) {
      clearReasonPayload(el);
      return;
    }
    el.setAttribute('data-tm-reasons', reasonRows.map(reasonTextPayload).join('|'));
    el.setAttribute('data-tm-reason-rows', serializeReasonRowsPayload(reasonRows));
  }

  // ROI line: value − cost = profit (with tableau discounts)
  function buildROIHtml(name, isOppCard, oppCtx, valueState) {
    var ctx0 = valueState ? valueState.ctx : (isOppCard && oppCtx ? oppCtx : getCachedPlayerContext());
    var fx0 = valueState ? valueState.fx : getFx(name);
    if (!fx0 || !ctx0) return '';
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildROIHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildROIHtml({
        computeCardValue: computeCardValue,
        ctx: ctx0,
        draftCost: SC.draftCost,
        effectTags: valueState ? valueState.effectTags : (fx0 && fx0.tags ? fx0.tags : ((typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[name] && TM_CARD_EFFECTS[name].tags) ? TM_CARD_EFFECTS[name].tags : [])),
        fx: fx0,
        getEffectiveCost: getEffectiveCost,
        ratingGroups: valueState ? valueState.ratingGroups : (_getRatingByCardName(name) && _getRatingByCardName(name).g)
      });
    }
    return '';
  }

  // EV line: TM_BRAIN.scoreCard expected value
  function buildEVHtml(name, cardEl, isOppCard, oppCtx, pv, valueState) {
    if (typeof TM_BRAIN === 'undefined' || typeof TM_BRAIN.scoreCard !== 'function') return '';
    var ctx0 = valueState ? valueState.ctx : (isOppCard && oppCtx ? oppCtx : getCachedPlayerContext());
    if (!ctx0) return '';

    // Extract card cost from DOM or data
    var cardCost = valueState && typeof valueState.cardCost === 'number' ? valueState.cardCost : 0;
    if ((!valueState || typeof valueState.cardCost !== 'number') && cardEl) {
      var costEl = cardEl.querySelector('.card-number, .card-cost');
      if (costEl) cardCost = parseInt(costEl.textContent) || 0;
    }

    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildEVHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildEVHtml({
        cardCost: cardCost,
        ctx: ctx0,
        name: name,
        pv: pv,
        scoreCard: TM_BRAIN.scoreCard
      });
    }

    // Map content.js ctx → tm-brain state format
    var gp = ctx0.globalParams || {};
    var state = {
      game: {
        generation: ctx0.gen || 5,
        temperature: typeof gp.temp === 'number' ? gp.temp : -30,
        oxygenLevel: typeof gp.oxy === 'number' ? gp.oxy : 0,
        oceans: typeof gp.oceans === 'number' ? gp.oceans : 0,
        venusScaleLevel: typeof gp.venus === 'number' ? gp.venus : 0,
        gameOptions: (pv && pv.game && pv.game.gameOptions) || {}
      },
      players: (pv && pv.game && pv.game.players) || [{}, {}, {}],
      thisPlayer: {
        tags: ctx0.tags || {},
        megacredits: ctx0.mc || 0,
        megaCreditProduction: ctx0.prod ? ctx0.prod.mc : 0,
        steel: ctx0.steel || 0,
        steelValue: ctx0.steelVal || 2,
        steelProduction: ctx0.prod ? ctx0.prod.steel : 0,
        titanium: ctx0.titanium || 0,
        titaniumValue: ctx0.tiVal || 3,
        titaniumProduction: ctx0.prod ? ctx0.prod.ti : 0,
        energy: (pv && pv.thisPlayer) ? (pv.thisPlayer.energy || 0) : 0,
        energyProduction: ctx0.prod ? ctx0.prod.energy : 0,
        heat: ctx0.heat || ((pv && pv.thisPlayer) ? (pv.thisPlayer.heat || 0) : 0),
        heatProduction: ctx0.prod ? ctx0.prod.heat : 0,
        plants: (pv && pv.thisPlayer) ? (pv.thisPlayer.plants || 0) : 0,
        plantProduction: ctx0.prod ? ctx0.prod.plants : 0,
        cardsInHand: (pv && pv.thisPlayer && pv.thisPlayer.cardsInHand) ? pv.thisPlayer.cardsInHand : [],
        tableau: ctx0.tableauNames ? Array.from(ctx0.tableauNames).map(function(n) { return { name: n }; }) : []
      }
    };

    // Populate players array from pv for accurate ratePerGen
    if (pv && pv.players) {
      state.players = pv.players.map(function() { return {}; });
    }

    var card = { name: name, calculatedCost: cardCost };
    try {
      var result = TM_BRAIN.scoreCard(card, state);
      if (result == null || isNaN(result)) return '';

      // scoreCard already returns net EV (ev - cost)
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

  // Personal play stats from Dynamic Card Ratings
  function buildPersonalStatsHtml(name) {
    var cs = TM_CONTENT_CARD_STATS && TM_CONTENT_CARD_STATS.getCardStats
      ? TM_CONTENT_CARD_STATS.getCardStats(name)
      : null;
    if (!cs) return '';
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.buildPersonalStatsHtml === 'function') {
      return TM_CONTENT_TOOLTIP.buildPersonalStatsHtml(cs);
    }
    return '';
  }

  // Position tooltip near source element
  function positionTooltip(tip, srcEl) {
    if (TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.positionTooltip === 'function') {
      TM_CONTENT_TOOLTIP.positionTooltip(tip, srcEl);
      return;
    }
    if (!srcEl) return;
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

  function showTooltip(e, name, data) {
    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    const tip = ensureTooltip();
    const cardEl = e.target.closest('.card-container');
    var pv = getPlayerVueData();

    var baseS = data.s;
    var baseT = data.t;
    var sectionsState = TM_CONTENT_TOOLTIP_STATE && typeof TM_CONTENT_TOOLTIP_STATE.resolveTooltipSectionsState === 'function'
      ? TM_CONTENT_TOOLTIP_STATE.resolveTooltipSectionsState({
        baseScore: baseS,
        baseTier: baseT,
        cardEl: cardEl,
        cardEffects: (typeof TM_CARD_EFFECTS !== 'undefined') ? TM_CARD_EFFECTS : null,
        data: data,
        descriptions: (typeof TM_CARD_DESCRIPTIONS !== 'undefined') ? TM_CARD_DESCRIPTIONS : null,
        detectCardOwner: detectCardOwner,
        detectMyCorps: detectMyCorps,
        getCachedOpponentContext: getCachedOpponentContext,
        getCachedPlayerContext: getCachedPlayerContext,
        getFx: getFx,
        getMyHandNames: getMyHandNames,
        getRatingByCardName: _getRatingByCardName,
        isMoonExpansionOn: _isMoonExpansionOn,
        isPfExpansionOn: _isPfExpansionOn,
        isUnderworldExpansionOn: _isUnderworldExpansionOn,
        name: name,
        normalizeReasonRows: normalizeReasonRowsPayload,
        parseReasonRows: parseReasonRowsPayload,
        pv: pv,
        ruName: ruName,
        scoreFromOpponentPerspective: scoreFromOpponentPerspective,
        scoreToTier: scoreToTier,
        takeThatCards: TAKE_THAT_CARDS
      })
      : null;

    // === 0. Detect card owner (mine vs opponent's) ===
    var oppOwner = sectionsState ? sectionsState.oppOwner : detectCardOwner(name, pv);
    var isOppCard = sectionsState ? sectionsState.isOppCard : !!oppOwner;
    var oppCtx = sectionsState ? sectionsState.oppCtx : null;
    var oppScoreResult = sectionsState ? sectionsState.oppScoreResult : null;
    if (!sectionsState && isOppCard) {
      oppCtx = getCachedOpponentContext(oppOwner, pv);
      oppScoreResult = scoreFromOpponentPerspective(name, oppOwner, cardEl, pv, oppCtx);
    }

    // === 1. Header: dual score (COTD + EV) + cost + name ===
    // EV score removed — not useful in practice
    // Context-adjusted score (from badge with bonuses applied)
    var tipReasons = sectionsState ? sectionsState.tipReasons : (cardEl ? (cardEl.getAttribute('data-tm-reasons') || '') : '');
    var tipReasonRows = sectionsState ? sectionsState.tipReasonRows : (cardEl ? parseReasonRowsPayload(cardEl.getAttribute('data-tm-reason-rows') || '') : []);
    var ctxScore = sectionsState ? sectionsState.ctxScore : baseS;
    var ctxTier = sectionsState ? sectionsState.ctxTier : baseT;

    var cardState = sectionsState ? sectionsState.cardState : null;
    var cardCost = cardState ? cardState.cardCost : null;
    var localizedName = cardState ? cardState.localizedName : (ruName(name) || name);
    var localizedDesc = cardState ? cardState.localizedDesc : (data && data.dr ? data.dr : '');
    var fallbackDesc = cardState ? cardState.fallbackDesc : ((typeof TM_CARD_DESCRIPTIONS !== 'undefined' && TM_CARD_DESCRIPTIONS[name]) ? TM_CARD_DESCRIPTIONS[name] : '');
    var valueState = sectionsState ? sectionsState.valueState : null;
    var analysisState = sectionsState ? sectionsState.analysisState : null;
    var isInHand = analysisState ? analysisState.isInHand : (cardState ? cardState.isInHand : !!(cardEl && cardEl.closest('.cards-in-hand, [class*="hand"]')));
    var synergyState = sectionsState ? sectionsState.synergyState : null;

    // === 4. Synergies (compact: corp + hand combos + key synergies) ===
    var synHtml = formatTooltipSynergies(name, data, isOppCard, oppCtx, pv, synergyState);

    var metaRowsState = sectionsState ? sectionsState.metaRowsState : null;

    // === 6. Triggers from tableau (mine or opponent's) ===
    var triggerHtml = buildTriggerHtml(cardEl, isOppCard, oppOwner, oppCtx, pv);

    // === 7. Requirements check (only if unmet) ===
    var requirementHtml = buildReqCheckHtml(cardEl, pv);

    var cardStats = TM_CONTENT_CARD_STATS && TM_CONTENT_CARD_STATS.getCardStats
      ? TM_CONTENT_CARD_STATS.getCardStats(name)
      : null;
    var html = TM_CONTENT_TOOLTIP && typeof TM_CONTENT_TOOLTIP.renderTooltipSections === 'function'
      ? TM_CONTENT_TOOLTIP.renderTooltipSections({
        analysisText: analysisState ? analysisState.analysisText : data.e,
        baseScore: baseS,
        baseTier: baseT,
        cardCost: cardCost,
        cardStats: cardStats,
        ctxScore: ctxScore,
        ctxTier: ctxTier,
        escHtml: escHtml,
        evInput: {
          cardCost: valueState && typeof valueState.cardCost === 'number' ? valueState.cardCost : (typeof cardCost === 'number' ? cardCost : 0),
          ctx: valueState ? valueState.ctx : null,
          name: name,
          pv: pv,
          scoreCard: (typeof TM_BRAIN !== 'undefined') ? TM_BRAIN.scoreCard : null
        },
        fallbackDesc: fallbackDesc,
        isInHand: !!isInHand,
        isOppCard: isOppCard,
        localizedDesc: localizedDesc,
        localizedName: localizedName,
        metaRowsState: metaRowsState,
        name: name,
        opponentName: oppOwner && oppOwner.name,
        requirementHtml: requirementHtml,
        roiInput: valueState ? {
          computeCardValue: computeCardValue,
          ctx: valueState.ctx,
          draftCost: SC.draftCost,
          effectTags: valueState.effectTags,
          fx: valueState.fx,
          getEffectiveCost: getEffectiveCost,
          ratingGroups: valueState.ratingGroups
        } : null,
        synHtml: synHtml,
        tipReasons: tipReasons,
        tipReasonRows: tipReasonRows,
        triggerHtml: triggerHtml,
        whenText: analysisState ? analysisState.whenText : data.w
      })
      : '';

    tip.innerHTML = html;
    tip.style.display = 'block';

    positionTooltip(tip, cardEl || e.currentTarget);
  }

  function scheduleHideTooltip(delay) {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
      if (tooltipEl) tooltipEl.style.display = 'none';
      tooltipHideTimer = null;
    }, delay || 400);
  }

  function hideTooltip() {
    scheduleHideTooltip(400);
  }

  var escHtml = TM_UTILS.escHtml;

  // ── Generation detection & dynamic value ──

  let cachedGen = 1;
  let genCacheTime = 0;

  function detectGeneration() {
    if (Date.now() - genCacheTime < 2000) return cachedGen;
    genCacheTime = Date.now();

    // Try Vue data first
    const pv = getPlayerVueData();
    if (pv && pv.game && pv.game.generation) {
      cachedGen = pv.game.generation;
      return cachedGen;
    }

    // Fallback: DOM
    const genEl = document.querySelector('.gen_marker.active, .log-gen-num.active');
    if (genEl) {
      const n = parseInt(genEl.textContent);
      if (n > 0) cachedGen = n;
    }
    return cachedGen;
  }

  // ── For The Nerd value table (gensLeft → [tr, prod, vp] in MC) ──

  var FTN_TABLE = TM_FTN_TABLE;
  var FTN_FALLBACK = [7, 5, 5]; // safe defaults: tr=7, prod=5, vp=5
  function ftnRow(gl) { return FTN_TABLE[gl] || FTN_TABLE[FTN_TABLE.length - 1] || FTN_FALLBACK; }

  const PROD_MUL = SC.prodMul;
  const RES_VAL = SC.resVal;

  function computeCardValue(fx, gensLeft, opts) {
    const gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    const row = ftnRow(gl);
    const trVal = row[0];
    const prod = row[1];
    const vpVal = row[2];
    var o2Maxed = opts && opts.o2Maxed;
    var tempMaxed = opts && opts.tempMaxed;

    let v = 0;

    // Production
    for (const k of ['mp', 'sp', 'tp', 'pp', 'ep', 'hp']) {
      if (fx[k]) v += fx[k] * prod * PROD_MUL[k];
    }

    // Immediate resources
    for (const k of ['mc', 'st', 'ti', 'pl', 'he', 'en', 'cd']) {
      if (fx[k]) v += fx[k] * RES_VAL[k];
    }

    // TR
    if (fx.tr) v += fx.tr * trVal;

    // VP
    if (fx.vp) v += fx.vp * vpVal;

    // Global param raises (skip if param is maxed)
    if (fx.tmp && !tempMaxed) v += fx.tmp * trVal;
    if (fx.o2 && !o2Maxed) v += fx.o2 * trVal;
    if (fx.oc) v += fx.oc * (trVal + 3);  // ocean = TR + placement bonus
    if (fx.vn) v += fx.vn * trVal;

    // Tiles
    if (fx.grn) v += fx.grn * ((o2Maxed ? 0 : trVal) + vpVal + 3);  // greenery = O2 TR (if open) + 1VP + placement
    if (fx.city) v += fx.city * (3 + vpVal * 2);     // city = placement bonus + ~2VP adjacency

    // Take-that (halved for 3P — benefits third player)
    if (fx.rmPl) v += fx.rmPl * 1.6 * 0.5;
    if (fx.pOpp) v += Math.abs(fx.pOpp) * prod * 0.5;

    // VP accumulator (action: add resource, 1VP per N — VP value depends on game timing)
    if (fx.vpAcc) v += fx.vpAcc * gl * vpVal / Math.max(1, fx.vpPer || 1);

    // Blue action cards
    if (fx.actMC) v += fx.actMC * gl;
    if (fx.actTR) v += fx.actTR * gl * trVal;
    if (fx.actOc) v += fx.actOc * gl * (trVal + 4);  // action: ocean = TR + placement (~4 MC, ~11 total)
    if (fx.actCD) v += fx.actCD * gl * 3;

    return v;
  }

  // Deny-draft advisor — flag high-value cards that synergize with opponent corps
  // Returns reason string or null
  function checkDenyDraft(data, currentScore, ctx, cardTags, cardName, eLower) {
    if (!ctx || !ctx.oppCorps || ctx.oppCorps.length === 0 || !data) return null;
    if (!eLower) eLower = (data.e || '').toLowerCase();
    if (currentScore < SC.denyScoreThreshold && data.t !== 'S' && data.t !== 'A') return null;
    for (var oi = 0; oi < ctx.oppCorps.length; oi++) {
      var oc = ctx.oppCorps[oi];
      var ocShort = oc.substring(0, 12);

      // Layer A: CORP_ABILITY_SYNERGY — tag/keyword match
      var ocSyn = CORP_ABILITY_SYNERGY[oc];
      if (ocSyn) {
        var synMatch = false;
        if (cardTags && ocSyn.tags) {
          for (var ti = 0; ti < ocSyn.tags.length; ti++) {
            if (cardTags.has(ocSyn.tags[ti])) { synMatch = true; break; }
          }
        }
        if (!synMatch && eLower && ocSyn.kw) {
          for (var ki = 0; ki < ocSyn.kw.length; ki++) {
            if (eLower.includes(ocSyn.kw[ki])) { synMatch = true; break; }
          }
        }
        if (synMatch) {
          var oppName = ctx.oppCorpToPlayer && ctx.oppCorpToPlayer[oc] ? ctx.oppCorpToPlayer[oc] : ocShort;
          return '\u2702 Deny: ' + oppName + ' (' + ocShort + ')';
        }
      }

      // Layer B: getCorpBoost from opponent perspective
      if (cardName && data.e) {
        var oppBoost = getCorpBoost(oc, { eLower: eLower, cardTags: cardTags, cardCost: data.c || 0, cardName: cardName });
        if (oppBoost >= SC.denyCorpBoostThreshold) {
          return '\u2702 Deny: ' + ocShort + ' +' + oppBoost;
        }
      }

      // Layer C: card's y-list mentions opponent corp
      if (data.y) {
        for (var yi = 0; yi < data.y.length; yi++) {
          if (data.y[yi][0] === oc) return '\u2702 Deny: syn ' + ocShort;
        }
      }

      // Layer D: opponent corp's y-list mentions this card
      if (cardName) {
        var ocData = TM_RATINGS[oc];
        if (ocData && ocData.y) {
          for (var yj = 0; yj < ocData.y.length; yj++) {
            if (ocData.y[yj][0] === cardName) return '\u2702 Deny: ' + ocShort + ' wants';
          }
        }
      }
    }

    // Layer E: card synergizes with opponent's tableau cards (placer→accumulator, combo)
    if (ctx.oppTableau && cardName && typeof TM_CARD_EFFECTS !== 'undefined') {
      var cardFx = TM_CARD_EFFECTS[cardName];
      if (cardFx && (cardFx.places || cardFx.vpAcc)) {
        for (var oppName in ctx.oppTableau) {
          var oppCards = ctx.oppTableau[oppName];
          for (var _eti = 0; _eti < oppCards.length; _eti++) {
            var oppFx = TM_CARD_EFFECTS[oppCards[_eti]];
            if (!oppFx) continue;
            // Card feeds opponent's VP accumulator
            var cardPlaceTypes = cardFx.places ? (Array.isArray(cardFx.places) ? cardFx.places : [cardFx.places]) : [];
            var oppPlaceTypes = oppFx.places ? (Array.isArray(oppFx.places) ? oppFx.places : [oppFx.places]) : [];
            if (cardPlaceTypes.length && oppFx.vpAcc && cardPlaceTypes.indexOf(oppFx.res) !== -1) {
              return '\u2702 Deny: кормит ' + oppName + ' ' + oppCards[_eti];
            }
            // Card IS a VP accumulator that opponent can feed
            if (cardFx.vpAcc && oppPlaceTypes.length && oppPlaceTypes.indexOf(cardFx.res) !== -1) {
              return '\u2702 Deny: ' + oppName + ' кормит это';
            }
          }
        }
      }
    }

    return null;
  }

  // Hate-draft detection: card is weak for us but amazing for opponent's strategy
  // Returns { label: string, oppName: string } or null
  var _HATE_STRAT_TAGS = {
    venus:   ['venus'],
    plant:   ['plant'],
    animal:  ['animal'],
    science: ['science'],
    jovian:  ['jovian'],
    event:   ['event'],
    colony:  ['space'],   // colony strats often want space cards
    heat:    ['power']    // heat strats use power tags (energy→heat)
  };
  function checkHateDraft(cardName, currentScore, ctx, cardTags) {
    // Only flag cards that are mediocre/bad for us
    if (currentScore >= 60) return null;
    if (!ctx || !ctx.oppStrategies) return null;
    if (!cardTags || cardTags.size === 0) return null;
    var data = TM_RATINGS[cardName];
    // Card must be objectively good (base S/A tier) — otherwise not worth hate-drafting
    if (!data || (data.t !== 'S' && data.t !== 'A')) return null;

    for (var oppKey in ctx.oppStrategies) {
      var strats = ctx.oppStrategies[oppKey];
      if (!strats || strats.length === 0) continue;
      for (var si = 0; si < strats.length; si++) {
        var stratId = strats[si].id;
        var matchTags = _HATE_STRAT_TAGS[stratId];
        if (!matchTags) continue;
        for (var ti = 0; ti < matchTags.length; ti++) {
          if (cardTags.has(matchTags[ti])) {
            var displayName = ctx.oppCorpToPlayer
              ? (function() { for (var ck in ctx.oppCorpToPlayer) { if (ctx.oppCorpToPlayer[ck] === oppKey) return ck.substring(0, 10); } return oppKey; })()
              : oppKey;
            return { label: strats[si].icon + displayName, oppName: oppKey };
          }
        }
        // Also check: card is in opponent corp's synergy list
        if (data.y) {
          for (var oi = 0; oi < ctx.oppCorps.length; oi++) {
            var oc = ctx.oppCorps[oi];
            for (var yi = 0; yi < data.y.length; yi++) {
              if (yName(data.y[yi]) === oc) {
                var dn = oc.substring(0, 10);
                return { label: strats[si].icon + dn, oppName: oppKey };
              }
            }
          }
        }
      }
    }

    // Fallback: check CORP_ABILITY_SYNERGY directly (opponent corp wants this card's tags)
    if (ctx.oppCorps) {
      for (var ci = 0; ci < ctx.oppCorps.length; ci++) {
        var corpName = ctx.oppCorps[ci];
        var corpSyn = CORP_ABILITY_SYNERGY[corpName];
        if (!corpSyn || !corpSyn.tags) continue;
        for (var cti = 0; cti < corpSyn.tags.length; cti++) {
          if (cardTags.has(corpSyn.tags[cti])) {
            var cdn = corpName.substring(0, 10);
            return { label: '\u{1F6AB}' + cdn, oppName: corpName };
          }
        }
      }
    }
    return null;
  }

  // Production break-even timer — penalty when production card won't pay off in remaining gens
  // Returns { penalty: number, reason: string|null }
  function scoreBreakEvenTiming(cardName, ctx, cardTags) {
    if (!ctx || !ctx.gensLeft || typeof TM_CARD_EFFECTS === 'undefined') return { penalty: 0, reason: null };
    // Skip during initial draft — gensLeft is full game, break-even always passes
    if (!ctx.tableauNames || ctx.tableauNames.size === 0) return { penalty: 0, reason: null };
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx) return { penalty: 0, reason: null };
    // If card has VP and we're in last 1-2 gens, skip break-even penalty entirely:
    // VP is immediate value, production is just bonus on top. Don't penalize cheap VP cards.
    if (fx.vp && fx.vp >= 1 && ctx.gensLeft <= 2) return { penalty: 0, reason: null };
    var totalProdPerGen = (fx.mp || 0) + (fx.sp || 0) * 2 + (fx.tp || 0) * 3 +
      (fx.pp || 0) * 2.0 + (fx.ep || 0) * 2.0 + (fx.hp || 0) * 0.5;
    if (totalProdPerGen <= 0) return { penalty: 0, reason: null };
    var printedCost = fx.c || 0;
    // Account for steel/titanium discounts (building/space tags)
    if (cardTags && cardTags.has('building') && ctx.steel > 0) {
      var stV = ctx.steelVal || SC.defaultSteelVal;
      printedCost = Math.max(0, printedCost - ctx.steel * stV);
    } else if (cardTags && cardTags.has('space') && ctx.titanium > 0) {
      var tiV = ctx.tiVal || SC.defaultTiVal;
      printedCost = Math.max(0, printedCost - ctx.titanium * tiV);
    }
    var effectiveCost = printedCost + SC.draftCost;
    // Subtract VP value (VP is immediate, not production — reduces effective cost)
    if (fx.vp) {
      var vpVal = fx.vp * (ctx.gensLeft <= 2 ? 7 : ctx.gensLeft <= 4 ? 5 : 3);
      effectiveCost = Math.max(0, effectiveCost - vpVal);
    }
    // Subtract TR value
    if (fx.tr) effectiveCost = Math.max(0, effectiveCost - fx.tr * 7);
    // Cards that immediately place resources on existing targets are not
    // "pure payback" production. Reduce effective cost by the best live target.
    if (fx.places) {
      var placeTypesBE = Array.isArray(fx.places) ? fx.places : [fx.places];
      var placeCountBE = Math.max(1, fx.placesN || 1);
      var bestPlaceValueBE = 0;
      for (var pbi = 0; pbi < placeTypesBE.length; pbi++) {
        var placeTypeBE = placeTypesBE[pbi];
        var targetCountBE = 0;
        if (placeTypeBE === 'microbe') targetCountBE = ctx.microbeTargetCount || 0;
        else if (placeTypeBE === 'animal') targetCountBE = ctx.animalTargetCount || 0;
        else if (placeTypeBE === 'floater') targetCountBE = ctx.floaterTargetCount || 0;
        if (targetCountBE <= 0) continue;
        var perPlaceBE = 0;
        if (placeTypeBE === 'animal') perPlaceBE = ctx.gensLeft <= 2 ? 2.5 : ctx.gensLeft <= 4 ? 2.0 : 1.5;
        else if (placeTypeBE === 'microbe') perPlaceBE = ctx.gensLeft <= 2 ? 2.0 : ctx.gensLeft <= 4 ? 1.5 : 1.0;
        else if (placeTypeBE === 'floater') perPlaceBE = ctx.gensLeft <= 2 ? 1.5 : 1.0;
        var placeValueBE = Math.min(6, placeCountBE * perPlaceBE + (targetCountBE >= 2 ? 1 : 0));
        if (placeValueBE > bestPlaceValueBE) bestPlaceValueBE = placeValueBE;
      }
      if (bestPlaceValueBE > 0) {
        effectiveCost = Math.max(0, effectiveCost - bestPlaceValueBE);
      }
    }
    var breakEvenGens = Math.ceil(effectiveCost / Math.max(0.5, totalProdPerGen));
    if (breakEvenGens > ctx.gensLeft) {
      var penalty = Math.min(SC.breakEvenCap, (breakEvenGens - ctx.gensLeft) * SC.breakEvenMul);
      return { penalty: penalty, reason: 'Окупаем. ' + breakEvenGens + ' пок. (ост. ' + ctx.gensLeft + ') −' + penalty };
    }
    if (breakEvenGens === ctx.gensLeft && ctx.gensLeft <= 3) {
      return { penalty: 0, reason: 'Окуп. впритык (' + breakEvenGens + ' пок.)' };
    }
    return { penalty: 0, reason: null };
  }

  // Format tooltip synergies section (corps, hand combos, key synergies)
  // Returns HTML string or empty string
  function formatTooltipSynergies(cardName, data, isOppCard, oppCtx, pv, synergyState) {
    var myCorpsTip = synergyState ? synergyState.myCorpsTip : (isOppCard && oppCtx ? oppCtx._myCorps : detectMyCorps());
    var synParts = [];
    // Corp synergy
    for (var tci = 0; tci < myCorpsTip.length; tci++) {
      var tipCorp = myCorpsTip[tci];
      if (data.y && data.y.some(function(syn) { return yName(syn) === tipCorp; })) {
        synParts.push('\u2605 ' + escHtml(tipCorp));
      }
    }
    // Hand card combos (skip for opponent)
    var handNames = synergyState ? synergyState.handNames : (isOppCard ? [] : getMyHandNames());
    if (handNames.length > 0 && data.y) {
      for (var hni = 0; hni < handNames.length; hni++) {
        var hName = handNames[hni];
        if (hName === cardName) continue;
        var hData = TM_RATINGS[hName];
        var thisMentions = data.y.some(function(s) { return yName(s).toLowerCase().includes(hName.toLowerCase()); });
        var handMentions = hData && hData.y && hData.y.some(function(s) { return yName(s).toLowerCase().includes(cardName.toLowerCase()); });
        if (thisMentions || handMentions) synParts.push('\uD83D\uDD17 ' + escHtml(describeNamedSynergy(hName)));
      }
    }
    // Other synergies (max 3, skip already shown + skip taken milestones)
    if (data.y && data.y.length && yName(data.y[0]) !== 'None significant') {
      var claimedMs = new Set(synergyState ? synergyState.claimedMilestones : []);
      var msAllFull = synergyState ? synergyState.msAllFull : false;
      if (!synergyState && pv && pv.game && pv.game.milestones) {
        var claimedCount = 0;
        for (var mi = 0; mi < pv.game.milestones.length; mi++) {
          var ms = pv.game.milestones[mi];
          if (ms.playerName || ms.color) {
            claimedMs.add((ms.name || '').toLowerCase());
            claimedCount++;
          }
        }
        msAllFull = claimedCount >= 3;
      }
      var shown = 0;
      var pfOn = synergyState ? synergyState.pfOn : _isPfExpansionOn();
      var moonOn = synergyState ? synergyState.moonOn : _isMoonExpansionOn();
      var underworldOn = synergyState ? synergyState.underworldOn : _isUnderworldExpansionOn();
      for (var ei = 0; ei < data.y.length; ei++) {
        if (shown >= 3) break;
        var syn = yName(data.y[ei]);
        if (myCorpsTip.indexOf(syn) !== -1) continue;
        if (handNames.some(function(h) { return syn.toLowerCase().includes(h.toLowerCase()); })) continue;
        // Filter Pathfinder/Moon/Underworld cards when expansion is off
        if (!pfOn && _PF_CARDS.has(syn)) continue;
        if (!moonOn && _MOON_CARDS.has(syn)) continue;
        if (!underworldOn && _UNDERWORLD_CARDS.has(syn)) continue;
        if (/вэха|milestone/i.test(syn)) {
          if (msAllFull) continue;
          var msNameMatch = syn.match(/(?:вэха|milestone)\s+(.+)/i);
          if (msNameMatch && claimedMs.has(msNameMatch[1].toLowerCase().trim())) continue;
        }
        synParts.push(escHtml(describeNamedSynergy(syn)));
        shown++;
      }
    }
    if (synParts.length === 0) return '';
    return '<div class="tm-tip-row">' + synParts.join(', ') + '</div>';
  }

  // Tag synergies — density, hand affinity, auto-synergy, corp ability, Pharmacy Union
  // Returns { bonus: number, reasons: string[] }
  function scoreTagSynergies(cardName, cardTags, cardType, cardCost, tagDecay, eLower, data, myCorps, ctx, pv) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var suppressHarvestPlantDensity = cardName === 'Harvest' && ctx && ctx.gen <= 2 && (ctx.greeneries || 0) === 0;

    // 5. Tag density bonus — rare tags get bonus at lower counts
    // Event cards: tags go face-down, so no persistent tag density value
    // Space/Building: common tags, no density synergy (unlike Science/Jovian/Venus)
    if (cardTags.size > 0 && cardType !== 'red') {
      let bestBonus = 0;
      let bestTag = '';
      let bestCount = 0;
      for (const tag of cardTags) {
        const count = (ctx.tagsWithHand ? ctx.tagsWithHand[tag] : ctx.tags[tag]) || 0;
        const rarity = SC.tagRarity[tag] || 1;
        if (rarity <= 0) continue;
        let db = 0;
        if (count >= 6) db = SC.tagDensity6;
        else if (count >= 4) db = SC.tagDensity4;
        else if (count >= 2 && rarity >= 3) db = SC.tagDensity2Rare;
        else if (count >= 1 && rarity >= 5) db = SC.tagDensity1Epic;
        if (db > bestBonus) { bestBonus = db; bestTag = tag; bestCount = count; }
      }
      // Cap density bonus for cheap one-shot cards (e.g. Lagrange Observatory)
      if (bestBonus > 1 && cardCost != null && cardCost <= SC.tagDensityCheapCost) {
        var hasOngoing = eLower && (eLower.includes('action') || eLower.includes('действ') || eLower.includes('prod') || eLower.includes('прод'));
        if (!hasOngoing) bestBonus = SC.tagDensityCheapCap;
      }
      if (suppressHarvestPlantDensity && bestTag === 'plant') bestBonus = 0;
      if (bestBonus > 0) {
        var decayedDensity = Math.round(bestBonus * tagDecay);
        if (decayedDensity > 0) {
          bonus += decayedDensity;
          pushStructuredReason(reasons, reasonRows, bestCount + ' ' + getRequirementTagReasonLabel(bestTag) + ' тегов в руке' + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''), decayedDensity);
        }
      }
    }

    // 5a2. Hand tag affinity — rare tags matching concentrated tags in hand
    if (cardTags.size > 0 && ctx && ctx._handTagCounts) {
      var htRarity = SC.tagRarity || {};
      var bestHtBonus = 0;
      var bestHtTag = '';
      var bestHtCount = 0;
      for (var htTag of cardTags) {
        var htCount = ctx._handTagCounts[htTag] || 0;
        var htR = htRarity[htTag] || 0;
        if (htR <= 0 || htCount < 2) continue;
        var htB = htCount >= 3 ? 2 : 1;
        if (htR >= 3) htB += 1;
        if (htB > bestHtBonus) { bestHtBonus = htB; bestHtTag = htTag; bestHtCount = htCount; }
      }
      if (suppressHarvestPlantDensity && bestHtTag === 'plant') bestHtBonus = 0;
      if (bestHtBonus > 0) {
        var decayedHt = Math.round(bestHtBonus * tagDecay);
        if (decayedHt > 0) {
          bonus += decayedHt;
          pushStructuredReason(reasons, reasonRows, 'рука ' + bestHtTag + ' ×' + bestHtCount + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''), decayedHt);
        }
      }
    }

    // 5b. Auto-synergy: card shares rare tags with corp/tableau trigger sources
    if (cardTags.size > 0 && myCorps.length > 0) {
      const RARE_TAG_VAL = SC.rareTagVal;
      let autoSynVal = 0;
      const corpTrigTags = new Set();
      for (var cci = 0; cci < myCorps.length; cci++) {
        var cc = myCorps[cci];
        if (TAG_TRIGGERS[cc]) {
          for (const tr of TAG_TRIGGERS[cc]) {
            for (const t of tr.tags) corpTrigTags.add(t);
          }
        }
        if (CORP_DISCOUNTS[cc]) {
          for (const t in CORP_DISCOUNTS[cc]) {
            if (t !== '_all' && t !== '_req' && t !== '_ocean') corpTrigTags.add(t);
          }
        }
      }
      for (const tag of cardTags) {
        if (RARE_TAG_VAL[tag] && corpTrigTags.has(tag)) {
          autoSynVal += RARE_TAG_VAL[tag];
        }
      }
      // Skip if CORP_ABILITY_SYNERGY will match this card (5c handles corp synergy)
      let alreadyHasCAS = false;
      for (var ami = 0; ami < myCorps.length; ami++) {
        var casChk = CORP_ABILITY_SYNERGY[myCorps[ami]];
        if (!casChk || casChk.b <= 0) continue;
        for (var cti = 0; cti < casChk.tags.length; cti++) {
          if (cardTags.has(casChk.tags[cti])) { alreadyHasCAS = true; break; }
        }
        if (!alreadyHasCAS && casChk.kw.length > 0 && data.e) {
          for (var kwi = 0; kwi < casChk.kw.length; kwi++) {
            if (eLower.includes(casChk.kw[kwi])) { alreadyHasCAS = true; break; }
          }
        }
        if (alreadyHasCAS) break;
      }
      if (autoSynVal >= SC.autoSynThreshold && !alreadyHasCAS) {
        var autoSynBonus = Math.min(SC.autoSynCap, autoSynVal);
        bonus += autoSynBonus;
        pushStructuredReason(reasons, reasonRows, 'Авто-синерг', autoSynBonus);
      }
    }

    // 5c. Corp ability synergy — tag/keyword matching (works during initial draft without game state)
    for (var casIdx = 0; casIdx < myCorps.length; casIdx++) {
      var casCorp = myCorps[casIdx];
      var cas = CORP_ABILITY_SYNERGY[casCorp];
      if (!cas || cas.b <= 0) continue;
      let casMatched = false;
      if (cas.tags.length > 0 && cardTags.size > 0) {
        for (const t of cas.tags) {
          if (cardTags.has(t)) { casMatched = true; break; }
        }
      }
      if (!casMatched && cas.kw.length > 0 && data.e) {
        for (const kw of cas.kw) {
          if (eLower.includes(kw)) {
            if ((kw === 'production' || kw === 'прод') && typeof TM_CARD_EFFECTS !== 'undefined') {
              var kwFx = TM_CARD_EFFECTS[cardName];
              if (kwFx) {
                var kwHasPosProd = (kwFx.mp > 0 || kwFx.sp > 0 || kwFx.tp > 0 || kwFx.pp > 0 || kwFx.ep > 0 || kwFx.hp > 0);
                if (!kwHasPosProd) continue;
              }
            }
            casMatched = true; break;
          }
        }
      }
      // Don't double-count with auto-synergy (5b) or TAG_TRIGGERS (4)
      const alreadyAutoSyn5c = (bonus > 0 && reasons.some(function(r) { return r.indexOf('Авто-синерг') !== -1; }));
      // Skip: getCorpBoost (step 33) handles per-corp scoring more precisely
      // CORP_ABILITY_SYNERGY only adds a bare corp label when no numeric corp boost exists
      if (casMatched && !alreadyAutoSyn5c) {
        var corpShort5c = reasonCardLabel(casCorp);
        var alreadyInReasons5c = reasons.some(function(r) { return r.indexOf(corpShort5c) !== -1; });
        var corpPreviewBoost5c = getCorpBoost(casCorp, { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx, globalParams: ctx ? ctx.globalParams : null });
        if (!alreadyInReasons5c && corpPreviewBoost5c === 0) pushStructuredReason(reasons, reasonRows, 'Корп: ' + corpShort5c, null, 'positive');
        // Don't add bonus — getCorpBoost already handles numeric scoring
      }
    }

    // 5d. Pharmacy Union specific — science tags cure/add disease, microbe generators help cure
    if (ctx.tableauNames && (ctx.tableauNames.has('Pharmacy Union') || myCorps.indexOf('Pharmacy Union') !== -1)) {
      var puDiseases = 0;
      if (pv && pv.thisPlayer && pv.thisPlayer.tableau) {
        for (var ti = 0; ti < pv.thisPlayer.tableau.length; ti++) {
          var tc = pv.thisPlayer.tableau[ti];
          if ((tc.name || tc) === 'Pharmacy Union') { puDiseases = tc.resources || 0; break; }
        }
      }
      var hasScienceTag = cardTags.has('science');
      var generatesMicrobes = eLower.includes('microbe') || eLower.includes('микроб') || eLower.includes('add 1 microbe') || eLower.includes('add 2 microbe');
      if (hasScienceTag) {
        if (puDiseases > 0) {
          bonus += SC.puCureBonus;
          pushStructuredReason(reasons, reasonRows, 'PU cure +3MC (' + puDiseases + ' dis.)', SC.puCureBonus);
        } else {
          bonus -= SC.puDiseasePenalty;
          pushStructuredReason(reasons, reasonRows, 'PU disease! −4MC', -SC.puDiseasePenalty);
        }
      }
      if (generatesMicrobes && puDiseases > 0) {
        bonus += SC.puMicrobeBonus;
        pushStructuredReason(reasons, reasonRows, 'PU microbe→cure', SC.puMicrobeBonus);
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Opponent awareness — plant/animal protection, take-that value, opponent advantage penalty
  // Returns { bonus: number, reasons: string[] }
  function scoreOpponentAwareness(cardName, eLower, data, cardTags, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 24b. Protected Habitats/Asteroid Deflection more valuable if opponent has attacks
    if (ctx.oppHasPlantAttack && (cardName === 'Protected Habitats' || cardName === 'Asteroid Deflection System')) {
      bonus += SC.plantProtect;
      pushStructuredReason(reasons, reasonRows, 'Защита от атак опп.', SC.plantProtect);
    }
    // Animal cards less valuable if opponent has Predators/Ants
    if (ctx.oppHasAnimalAttack && ANIMAL_TARGETS.has(cardName)) {
      bonus -= SC.animalAttackPenalty;
      pushStructuredReason(reasons, reasonRows, 'Опп. атакует жив. −' + SC.animalAttackPenalty, -SC.animalAttackPenalty);
    }
    // Take-that cards slightly more valuable if opponents have strong engines
    if (TAKE_THAT_CARDS[cardName] && ctx.oppCorps && ctx.oppCorps.length > 0) {
      var hasStrongOpp = ctx.oppCorps.some(function(c) { return TM_STRONG_ENGINE_CORPS[c]; });
      if (hasStrongOpp) {
        bonus += SC.takeThatDenyBonus;
        pushStructuredReason(reasons, reasonRows, 'Опп. сильный engine', SC.takeThatDenyBonus);
      }
    }

    // 41. Opponent advantage penalty — cards that help opponent corps
    if (ctx.oppCorps && ctx.oppCorps.length > 0 && data.e) {
      var oppPenalty = 0;
      for (var oci = 0; oci < ctx.oppCorps.length; oci++) {
        var oc = ctx.oppCorps[oci];
        var gVuln = TM_OPP_CORP_VULN_GLOBAL[oc];
        if (gVuln) {
          for (var gk = 0; gk < gVuln.length; gk++) {
            if (eLower.includes(gVuln[gk])) {
              oppPenalty = Math.max(oppPenalty, SC.oppAdvantagePenalty);
              break;
            }
          }
        }
        var iVuln = TM_OPP_CORP_VULN_INDIRECT[oc];
        if (iVuln) {
          for (var ik = 0; ik < iVuln.length; ik++) {
            if (eLower.includes(iVuln[ik])) {
              oppPenalty = Math.max(oppPenalty, Math.ceil(SC.oppAdvantagePenalty / 2));
              break;
            }
          }
        }
      }
      if (oppPenalty > 0) {
        bonus -= oppPenalty;
        pushStructuredReason(reasons, reasonRows, 'Помогает опп. −' + oppPenalty, -oppPenalty);
      }
    }

    // 36b. Solar Logistics opponent
    if (ctx.oppHasSolarLogistics && cardTags.has('space') && cardTags.has('event')) {
      bonus -= SC.oppSolarLogistics;
      pushStructuredReason(reasons, reasonRows, 'Solar Logistics opp −' + SC.oppSolarLogistics, -SC.oppSolarLogistics);
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Post-context checks — resource conversion, draw/hand optimizer, endgame chain,
  // floater trap, city adjacency, delegate leadership, CEO ability
  // Returns { bonus: number, reasons: string[] }
  function scorePostContextChecks(cardName, cardEl, eLower, data, cardTags, ctx, pv, myHand) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var psychrophilesClosed = !!(cardName === 'Psychrophiles' && ctx && ctx.globalParams && ctx.globalParams.temp > -20);
    var extremeColdFungusClosed = !!(cardName === 'Extreme-Cold Fungus' && ctx && ctx.globalParams && ctx.globalParams.temp > -10);
    var microbeWindowClosed = psychrophilesClosed || extremeColdFungusClosed;

    // 38. Resource conversion synergy — cards that enable or improve conversions
    if (ctx && data.e) {
      // Plants→greenery: if player has high plant production but O₂ not maxed
      if (ctx.prod.plants >= 4 && ctx.globalParams && ctx.globalParams.oxy < SC.oxyMax) {
        if (isPlantEngineCardByFx(cardName, eLower)) {
          bonus += SC.plantEngineConvBonus;
          pushStructuredReason(reasons, reasonRows, 'Plant engine +' + SC.plantEngineConvBonus, SC.plantEngineConvBonus);
        }
      }
      // Heat conversion: cards that give heat when temp not maxed
      if (ctx.globalParams && ctx.globalParams.temp < SC.tempMax && ctx.prod.heat >= 4) {
        if (eLower.includes('heat') || eLower.includes('тепл')) {
          bonus += SC.heatConvBonus;
          pushStructuredReason(reasons, reasonRows, 'Heat→TR +' + SC.heatConvBonus, SC.heatConvBonus);
        }
      }
      // Microbe→TR: cards that place microbes when player has converters
      if (ctx.microbeAccumRate > 0) {
        if ((eLower.includes('microbe') || eLower.includes('микроб')) && !microbeWindowClosed) {
          bonus += SC.microbeEngineBonus;
          pushStructuredReason(reasons, reasonRows, 'Микроб engine +' + SC.microbeEngineBonus, SC.microbeEngineBonus);
        }
      }
      // Floater accumulation when player has floater VP cards
      if (ctx.floaterAccumRate > 0) {
        if (isFloaterCardByFx(cardName)) {
          bonus += SC.floaterEngineBonus;
          pushStructuredReason(reasons, reasonRows, 'Флоатер engine +' + SC.floaterEngineBonus, SC.floaterEngineBonus);
        }
      }
      // Resource target synergy — placement cards more valuable with more targets in tableau
      if (FLOATER_TARGETS.has(cardName) && ctx.floaterTargetCount >= SC.resNetThreshold) {
        bonus += SC.resNetBonus;
        pushStructuredReason(reasons, reasonRows, 'Флоат. сеть (' + ctx.floaterTargetCount + ')', SC.resNetBonus);
      }
      if (ANIMAL_TARGETS.has(cardName) && ctx.animalTargetCount >= SC.resNetThreshold) {
        bonus += SC.resNetBonus;
        pushStructuredReason(reasons, reasonRows, 'Жив. сеть (' + ctx.animalTargetCount + ')', SC.resNetBonus);
      }
      if (MICROBE_TARGETS.has(cardName) && ctx.microbeTargetCount >= SC.resNetThreshold && !microbeWindowClosed) {
        bonus += SC.resNetBonus;
        pushStructuredReason(reasons, reasonRows, 'Микроб. сеть (' + ctx.microbeTargetCount + ')', SC.resNetBonus);
      }
    }

    // 40. Draw/Play hand size optimizer — draw cards penalty when hand full, bonus when empty
    // Skip during draft phase: hand size is irrelevant when buying cards
    if (ctx && data.e && !(ctx.gen <= 1 && (!myHand || myHand.length === 0))) {
      var isDrawCard40 = (eLower.includes('draw') || eLower.includes('рисуй') || eLower.includes('вытяни')) && !eLower.includes('withdraw');
      if (isDrawCard40) {
        var handSize = myHand ? myHand.length : 0;
        if (handSize >= SC.handFullThreshold) {
          bonus -= SC.handFullPenalty;
          pushStructuredReason(reasons, reasonRows, 'Рука полна −' + SC.handFullPenalty, -SC.handFullPenalty);
        } else if (handSize <= SC.handEmptyThreshold) {
          bonus += SC.handEmptyBonus;
          pushStructuredReason(reasons, reasonRows, 'Мало карт +' + SC.handEmptyBonus, SC.handEmptyBonus);
        }
      }
    }

    // 42. Endgame conversion chain — greenery cards before heat in final gen
    if (ctx && ctx.gensLeft <= 1 && data.e) {
      var isGreenerySource = eLower.includes('green') || eLower.includes('озелен') || eLower.includes('plant') || eLower.includes('раст');
      var isHeatSource = eLower.includes('heat') || eLower.includes('тепл');
      if (isGreenerySource && ctx.globalParams && ctx.globalParams.oxy < SC.oxyMax) {
        bonus += SC.endgameGreeneryBonus;
        pushStructuredReason(reasons, reasonRows, 'Финал: озелен. +O₂ +' + SC.endgameGreeneryBonus, SC.endgameGreeneryBonus);
      }
      if (isHeatSource && ctx.globalParams && ctx.globalParams.temp >= SC.tempMax) {
        bonus -= SC.endgameHeatPenalty;
        pushStructuredReason(reasons, reasonRows, 'Темп. закрыта −' + SC.endgameHeatPenalty, -SC.endgameHeatPenalty);
      }
    }

    // 42b. Floater trap detector (MCP: expensive floater cards rarely pay off in 3P)
    if (ctx) {
      var isFloaterCard42 = isFloaterCardByFx(cardName);
      var selfFloaterSource42 = hasSelfFloaterSource(cardName);
      var cost42b = data.c || 0;
      if (TM_FLOATER_TRAPS[cardName] && ctx.floaterTargetCount < 2) {
        bonus -= SC.floaterTrapKnown;
        pushStructuredReason(reasons, reasonRows, '⚠ Floater trap −' + SC.floaterTrapKnown, -SC.floaterTrapKnown);
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && !ctx.floaterAccumRate && ctx.floaterTargetCount === 0 && !selfFloaterSource42) {
        bonus -= SC.floaterTrapExpensive;
        pushStructuredReason(reasons, reasonRows, 'Флоатер: 0 целей, нет engine −' + SC.floaterTrapExpensive, -SC.floaterTrapExpensive);
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && !ctx.floaterAccumRate && !selfFloaterSource42) {
        var floaterMidPenalty = Math.ceil(SC.floaterTrapExpensive / 2);
        bonus -= floaterMidPenalty;
        pushStructuredReason(reasons, reasonRows, 'Флоатер дорого без engine −' + floaterMidPenalty, -floaterMidPenalty);
      } else if (isFloaterCard42 && cost42b >= SC.floaterCostThreshold && ctx.gensLeft && ctx.gensLeft <= 3) {
        bonus -= SC.floaterTrapLate;
        pushStructuredReason(reasons, reasonRows, 'Флоат.action поздно −' + SC.floaterTrapLate, -SC.floaterTrapLate);
      }
    }

    // 44. City adjacency planning — city cards better with greenery engine
    if (ctx && data.e) {
      if (eLower.includes('city') || eLower.includes('город')) {
        var myGreeneries = 0;
        if (pv && pv.game && pv.game.spaces && pv.thisPlayer) {
          for (var si = 0; si < pv.game.spaces.length; si++) {
            var sp = pv.game.spaces[si];
            if (sp.color === pv.thisPlayer.color && (isGreeneryTile(sp.tileType))) myGreeneries++;
          }
        }
        if (myGreeneries >= SC.cityGreeneryThreshold || ctx.prod.plants >= 4) {
          bonus += SC.cityAdjacencyBonus;
          pushStructuredReason(reasons, reasonRows, 'Город+озелен. +' + SC.cityAdjacencyBonus, SC.cityAdjacencyBonus);
        } else if (ctx.gensLeft <= 1 && myGreeneries < 2) {
          bonus -= SC.cityAdjacencyPenalty;
          pushStructuredReason(reasons, reasonRows, 'Мало озелен. −' + SC.cityAdjacencyPenalty, -SC.cityAdjacencyPenalty);
        }
      }
    }

    // 45. Delegate leadership opportunity
    if (ctx && ctx.turmoilActive && data.e) {
      if (eLower.includes('delegate') || eLower.includes('делегат')) {
        if (pv && pv.game && pv.game.turmoil && pv.game.turmoil.parties) {
          var leaderOpportunity = false;
          for (var pi = 0; pi < pv.game.turmoil.parties.length; pi++) {
            var party = pv.game.turmoil.parties[pi];
            if (!party.delegates) continue;
            var myDels = 0, maxOppDels = 0;
            for (var di = 0; di < party.delegates.length; di++) {
              var d = party.delegates[di];
              var dColor = d.color || d;
              if (dColor === (pv.thisPlayer && pv.thisPlayer.color)) myDels += (d.number || 1);
              else maxOppDels = Math.max(maxOppDels, d.number || 1);
            }
            if (myDels > 0 && myDels + 1 > maxOppDels) {
              leaderOpportunity = true;
              break;
            }
          }
          if (leaderOpportunity) {
            bonus += SC.delegateLeadershipBonus;
            pushStructuredReason(reasons, reasonRows, 'Лидерство партии +' + SC.delegateLeadershipBonus, SC.delegateLeadershipBonus);
          }
        }
      }
    }

    // 46. CEO card permanent ability value
    if (cardEl && cardEl.querySelector('.ceo-label')) {
      var gLeft = ctx ? (ctx.gensLeft || 5) : 5;
      var ceoBonus = 0;
      if (data.e) {
        var ceoE = data.e.toLowerCase();
        if (ceoE.includes('draw') || ceoE.includes('card') || ceoE.includes('рисуй')) ceoBonus = Math.min(SC.ceoDrawCap, gLeft);
        else if (ceoE.includes('discount') || ceoE.includes('скидк') || ceoE.includes('-') && ceoE.includes('mc')) ceoBonus = Math.min(SC.ceoDiscountCap, gLeft);
        else if (ceoE.includes('prod') || ceoE.includes('прод')) ceoBonus = Math.min(SC.ceoProdCap, Math.round(gLeft * SC.ceoProdMul));
        else if (ceoE.includes('vp') || ceoE.includes('vp per')) ceoBonus = Math.min(SC.ceoVPCap, Math.round(gLeft * SC.ceoVPMul));
        else if (ceoE.includes('action')) ceoBonus = Math.min(SC.ceoActionCap, gLeft);
        else ceoBonus = Math.min(SC.ceoGenericCap, Math.round(gLeft * SC.ceoGenericMul));
      }
      if (ceoBonus > 0) {
        bonus += ceoBonus;
        pushStructuredReason(reasons, reasonRows, 'CEO ongoing ' + gLeft + ' ген +' + ceoBonus, ceoBonus);
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Positional factors — stall, saturation, feasibility, std project comparison,
  // board fullness, resource accum VP, strategy detection, draw timing, stockpile
  // Returns { bonus: number, reasons: string[] }
  function scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet, reqPenaltyPresent, isPreludeOrCorpLike) {
    var bonus = 0;
    var reasons = [];

    // 23. Stall value — cheap action cards are underrated (extra action = delay round end)
    if (cardType === 'blue' && cardCost != null && cardCost <= SC.stallCostMax) {
      if (ctx.gensLeft >= 4) {
        bonus += SC.stallValue;
        reasons.push('Столл');
      } else if (ctx.gensLeft <= 2) {
        // Late game stall: extra action delays opponents from converting plants/greeneries first
        var fx23 = getFx(cardName);
        var hasUsefulAction23 = fx23 && (fx23.actTR || fx23.actMC || fx23.vpAcc || fx23.actCD || fx23.actOc);
        if (hasUsefulAction23) {
          bonus += 2;
          reasons.push('Столл late +2');
        }
      }
    }

    // 23b. Tableau saturation — blue cards less valuable when tableau is full late game
    if (cardType === 'blue' && ctx.tableauSize >= SC.tableauSatThreshold && ctx.gensLeft <= 2) {
      bonus -= SC.tableauSaturation;
      reasons.push('Табло полно −' + SC.tableauSaturation);
    }

    // 25. Parameter saturation — proportional penalty based on lost value fraction
    var sat25 = computeParamSaturation(cardName, ctx, baseScore);
    if (sat25.penalty > 0) {
      bonus -= sat25.penalty;
      reasons.push(sat25.reason);
    }

    // 26. Requirements feasibility — penalty if card can't be played anytime soon.
    // Skip when centralized requirement scoring already added a req penalty/reason.
    if (typeof TM_CARD_EFFECTS !== 'undefined' && !reqMet && !reqPenaltyPresent) {
      var fx26 = TM_CARD_EFFECTS[cardName];
      if (fx26 && fx26.minG) {
        // Scale minG by game length: longer games → minG pushed later
        var scaledMinG = fx26.minG;
        if (ctx.gensLeft > 8) scaledMinG = Math.round(fx26.minG * 1.3); // 4P no WGT
        var gensUntilPlayable = Math.max(0, scaledMinG - ctx.gen);
        if (gensUntilPlayable >= 2) {
          var _genScale26 = ctx.gen <= 1 ? 0.1 : ctx.gen <= 2 ? 0.3 : ctx.gen <= 3 ? 0.5 : 1.0;
          var reqPenalty = Math.round(Math.min(SC.reqFarCap + 3, Math.round(gensUntilPlayable * 1.5)) * _genScale26);
          if (reqPenalty > 0) { bonus -= reqPenalty; reasons.push('Req далеко −' + reqPenalty); }
        }
      }
    }

    // 27. Board fullness — placement cards penalized when board is filling up
    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx28 = TM_CARD_EFFECTS[cardName];
      if (fx28 && (fx28.city || fx28.grn)) {
        if (ctx.boardFullness > SC.boardFullThreshold) {
          bonus -= SC.boardFullPenalty;
          reasons.push('Доска полна −' + SC.boardFullPenalty);
        } else if (ctx.emptySpaces <= SC.boardTightThreshold) {
          bonus -= SC.boardTightPenalty;
          reasons.push('Мало мест −' + SC.boardTightPenalty);
        }
      }
    }

    // 29. Resource accumulation VP bonus — VP-per-resource cards better when accum rate > 0
    if (data.e) {
      var namedReqDelay29 = getNamedRequirementDelayProfile(cardName, ctx);
      if (eLower.includes('vp') || eLower.includes('1 vp')) {
        if (eLower.includes('animal') && ctx.animalAccumRate > 0 && !namedReqDelay29.suppressAccumulatorBonus) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.animalAccumRate * 2);
          reasons.push('Жив. VP +' + Math.min(SC.resourceAccumVPCap, ctx.animalAccumRate * 2));
        }
        if (eLower.includes('microb') && ctx.microbeAccumRate > 0) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.microbeAccumRate * 2);
          reasons.push('Мик. VP +' + Math.min(SC.resourceAccumVPCap, ctx.microbeAccumRate * 2));
        }
        if (isFloaterCardByFx(cardName) && ctx.floaterAccumRate > 0) {
          bonus += Math.min(SC.resourceAccumVPCap, ctx.floaterAccumRate * 2);
          reasons.push('Флоат. VP +' + Math.min(SC.resourceAccumVPCap, ctx.floaterAccumRate * 2));
        }
      }
    }

    // 30. Strategy detection — committed directions get bonus
    // Uses tagsWithHand: cards in hand show strategic commitment too
    if (cardTags.size > 0) {
      for (var tag of cardTags) {
        var threshold = SC.strategyThresholds[tag];
        var tagCountStrat = (ctx.tagsWithHand ? ctx.tagsWithHand[tag] : ctx.tags[tag]) || 0;
        if (threshold && tagCountStrat >= threshold) {
          var depth = tagCountStrat - threshold;
          var stratBonusRaw = Math.min(SC.strategyCap, SC.strategyBase + depth);
          var stratBonus = Math.round(stratBonusRaw * tagDecay);
          if (stratBonus > 0) {
            bonus += stratBonus;
            reasons.push(tag + ' стратегия +' + stratBonus + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''));
          }
          break;
        }
      }
    }

    // 31. Card draw engine timing — draw cards valuable early, dead late
    if (data.e && !isPreludeOrCorpLike) {
      var isDrawCard = (eLower.includes('draw') || eLower.includes('рисуй') || eLower.includes('вытяни')) && !eLower.includes('withdraw');
      var isNonProjectDraw = eLower.includes('prelude') || eLower.includes('прелюд') || eLower.includes('corporation') || eLower.includes('корпорац') || eLower.includes('ceo');
      if (isDrawCard && !isNonProjectDraw) {
        if (ctx.gensLeft >= 5) {
          bonus += SC.drawEarlyBonus;
          reasons.push('Рисовка рано +' + SC.drawEarlyBonus);
        } else if (ctx.gensLeft >= 3) {
          bonus += SC.drawMidBonus;
          reasons.push('Рисовка mid +' + SC.drawMidBonus);
        } else if (ctx.gensLeft <= 1) {
          // Last gen: drawn cards can't be played (no MC, no time) — heavy penalty
          bonus -= 8;
          reasons.push('Рисовка last gen −8');
        } else if (ctx.gensLeft <= 2) {
          bonus -= SC.drawLatePenalty;
          reasons.push('Рисовка поздно −' + SC.drawLatePenalty);
        }
      }
    }

    // 31b. MC-only effects in last gen — MC without VP conversion = wasted
    if (ctx.gensLeft <= 1 && data.e) {
      var fx31b = getFx(cardName);
      var meltworksHand31b = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
      var meltworksCashout31b = isMeltworksLastGenCashout(cardName, meltworksHand31b, ctx);
      if (fx31b) {
        var isMCOnly = (fx31b.actMC > 0 || fx31b.mp > 0) && !fx31b.vp && !fx31b.vpAcc && !fx31b.tr && !fx31b.tmp && !fx31b.o2 && !fx31b.oc && !fx31b.vn && !fx31b.grn && !fx31b.city;
        if (isMCOnly && !meltworksCashout31b && !eLower.includes('vp') && !eLower.includes('вп')) {
          bonus -= 5;
          reasons.push('MC бесполезны last gen −5');
        }
      }
      if (meltworksCashout31b) {
        var meltworksBonus = Math.max(2, Math.min(6, Math.round(3 * (ctx.steelVal || SC.defaultSteelVal) - 4)));
        bonus += meltworksBonus;
        reasons.push('Heat→steel cashout +' + meltworksBonus);
      }
    }

    // 32. Steel/Titanium resource stockpile — building/space cards cheaper when resources available
    if (cardTags.has('building') && ctx.steel >= SC.steelStockpileThreshold) {
      var stBonus32 = Math.min(SC.steelStockpileCap, Math.floor(ctx.steel / SC.steelStockpileDivisor));
      bonus += stBonus32;
      reasons.push('Steel ' + ctx.steel + ' +' + stBonus32);
    }
    if (cardTags.has('space') && ctx.titanium >= SC.tiStockpileThreshold) {
      var tiBonus32 = Math.min(SC.tiStockpileCap, Math.floor(ctx.titanium / SC.tiStockpileDivisor));
      bonus += tiBonus32;
      reasons.push('Ti ' + ctx.titanium + ' +' + tiBonus32);
    }

    // 32b. Space card penalty when 0 titanium — must pay full MC
    if (cardTags.has('space') && ctx.titanium === 0 && cardCost != null && cardCost >= SC.tiPenaltyCostThreshold) {
      var tiCap32 = cardCost >= SC.tiPenaltyCostHigh ? SC.tiPenaltyCapHigh : SC.tiPenaltyCapLow;
      var tiPenalty32 = Math.min(tiCap32, Math.ceil(cardCost / SC.tiPenaltyDivisor));
      bonus -= tiPenalty32;
      reasons.push('0 Ti −' + tiPenalty32);
    }

    return { bonus: bonus, reasons: reasons };
  }

  // Card economy in context — multi-tag, production timing, action ROI, event tags,
  // steel/ti prod synergy, diminishing returns, VP accumulation, affordability
  // Returns { bonus: number, reasons: string[] }
  function scoreCardEconomyInContext(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, skipCrudeTiming) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 0-0b. Requirement penalties and Req✓ bonus are handled centrally in scoreCardRequirements().

    // 0b2. Maxed-global waste is handled centrally in scoreCardSaturationPenalty().
    // Keeping a second blunt penalty here double-counts cards like Convoy From Europa.

    // 0c. N-dependent production scaling — cards whose prod depends on tag/tile count
    // FTN sees flat mp:1, but real value = N × gensLeft. Bonus = (N-1) × prodValue × gensLeft
    if (ctx && ctx.gensLeft >= 1) {
      var _SCALING = {
        'Interplanetary Trade':   { type: 'uniqueTags', prodPerN: 1 },
        'Community Services':     { type: 'noTagCards', prodPerN: 1 },
        'Satellites':             { type: 'tag', tag: 'space', prodPerN: 1 },
        'Worms':                  { type: 'tag', tag: 'microbe', prodPerN: 0.5 },
        'Gyropolis':              { type: 'tags', tags: ['venus', 'earth'], prodPerN: 1 },
        'Energy Saving':          { type: 'allCities', prodPerN: 1 },
        'Immigration Shuttles':   { type: 'allCities', vpPer: 3 },
        // Tag-count production cards
        'Cartel':                 { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Miranda Resort':         { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Luna Metropolis':        { type: 'tag', tag: 'earth', prodPerN: 1 },
        'Insects':                { type: 'tag', tag: 'plant', prodPerN: 1 },
        'Power Grid':             { type: 'tag', tag: 'power', prodPerN: 1 },
        'Advanced Power Grid':    { type: 'tag', tag: 'power', prodPerN: 1 },
        'Medical Lab':            { type: 'tag', tag: 'building', prodPerN: 0.5 },
        'Parliament Hall':        { type: 'tag', tag: 'building', prodPerN: 0.33 },
        'Sulphur Exports':        { type: 'tag', tag: 'venus', prodPerN: 1 },
        'Martian Monuments':      { type: 'tag', tag: 'mars', prodPerN: 1 },
        'Racketeering':           { type: 'tag', tag: 'crime', prodPerN: 1 },
        'Lunar Mining':           { type: 'tag', tag: 'earth', prodPerN: 0.5 },
        'Zeppelins':              { type: 'allCities', prodPerN: 1 },
        // TR/resource scaling
        'Terraforming Ganymede':  { type: 'tag', tag: 'jovian', trPerN: 1 },
        'Social Events':          { type: 'tag', tag: 'mars', trPerN: 0.5 },
        // Colony scaling
        'Ecology Research':       { type: 'colonies', prodPerN: 1 },
        'Quantum Communications': { type: 'allColonies', prodPerN: 1 },
        'Cassini Station':        { type: 'allColonies', prodPerN: 1 },
        'Microgravity Nutrition': { type: 'colonies', prodPerN: 1 },
        // Instant MC scaling
        'Toll Station':           { type: 'oppTag', tag: 'space', mcPerN: 1 },
        'Flat Mars Theory':       { type: 'generation', prodPerN: 1 },
      };
      var _sc = _SCALING[cardName];
      if (_sc) {
        var _N = 0;
        if (_sc.type === 'uniqueTags') _N = (ctx.uniqueTagCount || 0) + 1; // +1 for this card's space tag
        else if (_sc.type === 'noTagCards') {
          // Count no-tag cards in tableau
          if (ctx.tableauNames) {
            var _ntCT = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
            ctx.tableauNames.forEach(function(tn) { if (!_ntCT[tn] || _ntCT[tn].length === 0) _N++; });
          }
          _N++; // this card itself has no tags
        }
        else if (_sc.type === 'tag') _N = (ctx.tags[_sc.tag] || 0) + (ctx.tags.wild || 0) + (cardTags.has(_sc.tag) ? 1 : 0);
        else if (_sc.type === 'tags') {
          for (var _sti = 0; _sti < _sc.tags.length; _sti++) _N += (ctx.tags[_sc.tags[_sti]] || 0);
          for (var _stj = 0; _stj < _sc.tags.length; _stj++) { if (cardTags.has(_sc.tags[_stj])) _N++; }
          _N += (ctx.tags.wild || 0);
        }
        else if (_sc.type === 'cities') _N = ctx.citiesCount || 0;
        else if (_sc.type === 'allCities') {
          _N = (ctx.citiesCount || 0) + Math.max(2, Math.round((ctx.gen || 1) * 0.6));
        }
        else if (_sc.type === 'colonies') _N = ctx.coloniesOwned || 0;
        else if (_sc.type === 'allColonies') {
          _N = (ctx.coloniesOwned || 0) + Math.max(2, Math.round((ctx.gen || 1) * 0.4));
        }
        else if (_sc.type === 'oppTag') {
          // Count tag across all opponents
          if (ctx.oppTags) _N = ctx.oppTags[_sc.tag] || 0;
          else _N = Math.round((ctx.gen || 1) * 0.8); // estimate
        }
        else if (_sc.type === 'generation') _N = ctx.gen || 1;

        if (_sc.prodPerN && _N > 1) {
          // FTN already counted 1 prod unit. Bonus = (N-1) × value per gen
          var _extraProd = (_N - 1) * _sc.prodPerN;
          var _scalingVal = Math.round(_extraProd * Math.min(ctx.gensLeft, 6));
          var _scalingBonus = Math.min(20, Math.round(_scalingVal * 0.4));
          bonus += _scalingBonus;
          pushStructuredReason(reasons, reasonRows, _N + '× прод +' + _scalingBonus, _scalingBonus);
        }
        if (_sc.vpPer && _N >= _sc.vpPer) {
          var _vpFromN = Math.floor(_N / _sc.vpPer);
          var _vpBonus = Math.min(8, _vpFromN * 2);
          bonus += _vpBonus;
          pushStructuredReason(reasons, reasonRows, _N + '→' + _vpFromN + ' VP +' + _vpBonus, _vpBonus);
        }
        if (_sc.trPerN && _N > 1) {
          var _extraTR = (_N - 1) * _sc.trPerN;
          var _trBonus = Math.min(15, Math.round(_extraTR * 3));
          bonus += _trBonus;
          pushStructuredReason(reasons, reasonRows, _N + '× TR +' + _trBonus, _trBonus);
        }
        if (_sc.mcPerN && _N > 0) {
          var _mcBonus = Math.min(10, Math.round(_N * _sc.mcPerN * 0.5));
          if (_mcBonus > 0) { bonus += _mcBonus; pushStructuredReason(reasons, reasonRows, _N + '× MC +' + _mcBonus, _mcBonus); }
        }
      }
    }

    // 16. Multi-tag bonus — cards with 2+ tags fire more triggers & help more M/A
    if (cardTags.size >= 2) {
      // Only give bonus if there are active triggers/awards that benefit
      var multiHits = 0;
      for (var tag of cardTags) {
        if (ctx.awardTags[tag]) multiHits++;
        if (ctx.milestoneNeeds[tag] !== undefined) multiHits++;
        for (var ti = 0; ti < ctx.tagTriggers.length; ti++) {
          if (ctx.tagTriggers[ti].tags.includes(tag) && !(ctx.tagTriggers[ti].eventOnly && cardType !== 'red')) { multiHits++; break; }
        }
      }
      if (multiHits >= 2) {
        var mtBonusRaw = Math.min(SC.multiTagCap, multiHits);
        var mtBonus = Math.round(mtBonusRaw * tagDecay);
        if (mtBonus > 0) {
          bonus += mtBonus;
          pushStructuredReason(reasons, reasonRows, cardTags.size + ' тегов' + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''), mtBonus);
        }
      }
    }

    // 17. Late production penalty — production cards lose value as game ends
    if (!skipCrudeTiming && data.e) {
      var gl17 = ctx.gensLeft || 1;
      if (gl17 <= 4) {
        var isProd17 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        var isVP17 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        var isAction17 = eLower.includes('action') || eLower.includes('действие');
        if (isProd17 && !isVP17 && !isAction17) {
          var penaltyVal = gl17 <= 1 ? SC.lateProdGen9 : gl17 <= 2 ? SC.lateProdGen8 : gl17 <= 3 ? SC.lateProdGen7 : SC.lateProdGen6;
          bonus += penaltyVal;
          pushStructuredReason(reasons, reasonRows, 'Позд. прод. ' + penaltyVal + ' (' + gl17 + ' пок.)', penaltyVal);
        }
      }
    }

    // 18. Action card ROI — blue cards: gensLeft × value per activation
    if (cardType === 'blue' && ctx.gensLeft >= 1) {
      var fx18 = getFx(cardName);
      var actVal = fx18 ? ((fx18.actMC || 0) + (fx18.actTR || 0) * SC.actionROITRMul + (fx18.actOc || 0) * SC.actionROIOcMul + (fx18.actCD || 0) * SC.actionROICDMul) : 0;
      if (actVal > 0) {
        var totalROI = actVal * ctx.gensLeft;
        var roiAdj = ctx.gensLeft <= 2
          ? -Math.min(SC.actionROIPenCap, Math.round(actVal))
          : Math.min(SC.actionROIBonCap, Math.round(totalROI / SC.actionROIDivisor));
        if (roiAdj !== 0) {
          bonus += roiAdj;
          pushStructuredReason(reasons, reasonRows, 'ROI ' + Math.round(actVal) + '×' + ctx.gensLeft + (roiAdj > 0 ? ' +' : ' ') + roiAdj, roiAdj);
        }
      } else if (!skipCrudeTiming) {
        if (ctx.gensLeft >= 6) { bonus += SC.crudeActionEarly; pushStructuredReason(reasons, reasonRows, 'Ранний action +' + SC.crudeActionEarly, SC.crudeActionEarly); }
        else if (ctx.gensLeft >= 4) { bonus += SC.crudeActionMid; pushStructuredReason(reasons, reasonRows, 'Action +' + SC.crudeActionMid, SC.crudeActionMid); }
        else if (ctx.gensLeft <= 2) { bonus += SC.crudeActionLate; pushStructuredReason(reasons, reasonRows, 'Поздн. action ' + SC.crudeActionLate, SC.crudeActionLate); }
      }
    }

    // 19. Event tag: does NOT persist in tableau → doesn't help tag milestones/awards
    if (cardType === 'red' && cardTags.has('event')) {
      var eventPenalty = 0;
      for (var tag2 of cardTags) {
        if (tag2 === 'event') continue;
        if (ctx.milestoneNeeds[tag2] !== undefined) eventPenalty += SC.eventMilestonePenalty;
        if (ctx.awardTags[tag2]) eventPenalty += SC.eventAwardPenalty;
      }
      if (eventPenalty > 0) {
        bonus -= Math.min(SC.eventPenaltyCap, eventPenalty);
        pushStructuredReason(reasons, reasonRows, 'Event: теги уйдут −' + Math.min(SC.eventPenaltyCap, eventPenalty), -Math.min(SC.eventPenaltyCap, eventPenalty));
      }
    }

    // 20. Steel/Titanium PRODUCTION synergy — scales with gensLeft
    var gl20 = ctx.gensLeft || 4;
    var prodTimeMul = Math.min(1.0, gl20 / 4); // full value at 4+ gens, scales down
    if (cardTags.has('building') && ctx.prod.steel >= 2) {
      var stProdBonus = Math.round(Math.min(SC.steelProdSynCap, Math.floor(ctx.prod.steel / 2)) * prodTimeMul);
      if (stProdBonus > 0) { bonus += stProdBonus; pushStructuredReason(reasons, reasonRows, 'Стл.прод ' + ctx.prod.steel + '/пок', stProdBonus); }
    }
    if (cardTags.has('space') && ctx.prod.ti >= 1) {
      var tiProdBonus = Math.round(Math.min(SC.tiProdSynCap, ctx.prod.ti * 2) * prodTimeMul);
      if (tiProdBonus > 0) { bonus += tiProdBonus; pushStructuredReason(reasons, reasonRows, 'Ti.прод ' + ctx.prod.ti + '/пок', tiProdBonus); }
    }

    // 20b. Production diminishing returns — high prod makes more prod less impactful
    if (data.e && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx20 = TM_CARD_EFFECTS[cardName];
      if (fx20 && fx20.mp && fx20.mp > 0 && ctx.prod.mc >= SC.mcProdExcessThreshold) {
        bonus -= SC.mcProdExcessPenalty;
        pushStructuredReason(reasons, reasonRows, 'Прод. избыток −' + SC.mcProdExcessPenalty, -SC.mcProdExcessPenalty);
      }
      if (fx20 && fx20.hp && fx20.hp > 0 && ctx.globalParams) {
        var tempStepsLeft20 = Math.max(0, (SC.tempMax - ctx.globalParams.temp) / SC.tempStep);
        if (tempStepsLeft20 <= 0) {
          // Temp maxed: heat is dead weight unless Helion/Insulation
          var hasHeatConv20 = ctx.tableauNames && (ctx.tableauNames.has('Helion') || ctx.tableauNames.has('Insulation') || ctx.tableauNames.has('Caretaker Contract'));
          var hpPen20 = hasHeatConv20 ? -3 : -6;
          bonus += hpPen20;
          pushStructuredReason(reasons, reasonRows, 'Темп. макс ' + hpPen20, hpPen20);
        } else if (tempStepsLeft20 <= 2) {
          // Temp almost maxed: heat-prod will barely be useful
          bonus -= 2;
          pushStructuredReason(reasons, reasonRows, 'Темп. ≈макс −2', -2);
        }
      }
    }

    var namedReqDelay21 = getNamedRequirementDelayProfile(cardName, ctx);

    // 21. VP-per-resource timing — accumulator cards are better early
    if (!skipCrudeTiming && data.e) {
      var isAccumulator = (eLower.includes('1 vp per') || eLower.includes('1 vp за') ||
                           eLower.includes('vp per') || eLower.includes('vp за'));
      if (isAccumulator && !namedReqDelay21.suppressAccumulatorBonus) {
        if (ctx.gensLeft >= 5) {
          bonus += SC.vpAccumEarly;
          pushStructuredReason(reasons, reasonRows, 'VP-копилка рано +' + SC.vpAccumEarly, SC.vpAccumEarly);
        } else if (ctx.gensLeft >= 3) {
          bonus += SC.vpAccumMid;
          pushStructuredReason(reasons, reasonRows, 'VP-копилка +' + SC.vpAccumMid, SC.vpAccumMid);
        } else if (ctx.gensLeft <= 1) {
          bonus -= SC.vpAccumLate;
          pushStructuredReason(reasons, reasonRows, 'VP-копилка поздно −' + SC.vpAccumLate, -SC.vpAccumLate);
        }
      }
    }

    // 21b. VP multiplier projection — actual expected VP vs base score assumption
    // Accounts for: tags on tableau, self-tag, tags in hand, projected future tags from drafts
    if (typeof TM_VP_MULTIPLIERS !== 'undefined') {
      var mult = TM_VP_MULTIPLIERS[cardName];
      if (mult && mult.vpPer) {
        var projectedVP = 0;
        var skipVpProjection = false;
        if (mult.vpPer === 'jovian' || mult.vpPer === 'science' || mult.vpPer === 'space' || mult.vpPer === 'earth' || mult.vpPer === 'venus') {
          var targetTag = mult.vpPer;
          // Self-contribution (does this card add the target tag?)
          var selfAdded = 0;
          if (mult.selfTags) {
            for (var si21 = 0; si21 < mult.selfTags.length; si21++) {
              if (mult.selfTags[si21] === targetTag) selfAdded++;
            }
          }
          // Use pre-computed projected tags (tableau + hand + future drafts)
          var baseTagCount = (ctx.tagsProjected ? ctx.tagsProjected[targetTag] : ctx.tags[targetTag]) || 0;
          var totalTags = baseTagCount + selfAdded;
          projectedVP = totalTags * (mult.rate || 1);
        } else if (mult.vpPer === 'all_cities') {
          // Total cities on board for all players
          var totalCities = 0;
          if (pv && pv.game && pv.game.playerTiles) {
            for (var pc in pv.game.playerTiles) {
              totalCities += (pv.game.playerTiles[pc].cities || 0);
            }
          }
          // Estimate 1-2 more cities by end
          totalCities += 2;
          projectedVP = Math.floor(totalCities / (mult.divisor || 3));
        } else if (mult.vpPer === 'self_resource') {
          // VP from resources accumulated on the card via action
          // Realistic estimate: -1 gen for play delay, 0.8x for action slot competition
          if (namedReqDelay21.suppressAccumulatorBonus) {
            skipVpProjection = true;
          } else {
            var gLeft21b = ctx.gensLeft || 3;
            var activeGens = Math.max(0, gLeft21b - 1); // delay: must play card first
            var estResources = Math.round(Math.min(activeGens, 8) * 0.8); // 80% activation rate
            projectedVP = Math.floor(estResources / (mult.divisor || 1));
            if (namedReqDelay21.selfResourceFactor < 1) {
              projectedVP = Math.floor(projectedVP * namedReqDelay21.selfResourceFactor);
            }
          }
        }
        if (!skipVpProjection) {
          // Compare projected VP with baseline assumption
          var vpDelta21b = projectedVP - SC.vpMultBaseline;
          var vpMultBonus = Math.round(vpDelta21b * SC.vpMultScale);
          vpMultBonus = Math.max(vpMultBonus, -SC.vpMultCap);
          vpMultBonus = Math.min(vpMultBonus, SC.vpMultCap);
          if (vpMultBonus !== 0) {
            bonus += vpMultBonus;
            var vpReasonText = 'VP\u00d7' + mult.vpPer + ': ~' + projectedVP + ' VP';
            if (mult.vpPer === 'self_resource') vpReasonText = 'VP от своих ресурсов ~' + projectedVP;
            pushStructuredReason(reasons, reasonRows, vpReasonText, vpMultBonus);
          }
        }
      }
    }

    if (namedReqDelay21.penalty < 0) {
      bonus += namedReqDelay21.penalty;
      pushStructuredReason(reasons, reasonRows, namedReqDelay21.reason, namedReqDelay21.penalty);
    }

    // 22. Affordability check — removed: server validates payment,
    // draft cards are speculative, and false "Дорого" penalties hurt more than help.
    if (false) {
    }

    // Hospitals / per-tag VP cards — dynamic VP based on tag count
    if (cardName === 'Hospitals' && ctx.tags) {
      var bldTags = (ctx.tags['building'] || 0) + 2; // current + this card + ~1 future
      var hospitalVP = Math.floor(bldTags / 2);
      var extraVP = hospitalVP - 1; // card_effects already counts 1 static VP
      if (extraVP > 0) {
        var vpBonus = Math.round(extraVP * (ctx.gensLeft >= 4 ? 5 : 7));
        bonus += vpBonus;
        pushStructuredReason(reasons, reasonRows, bldTags + ' building → ' + hospitalVP + ' VP (+' + vpBonus + ')', vpBonus);
      }
    }

    // Only cards that strictly require adjacency to an existing city should be penalized here.
    var NEEDS_CITY = { 'Industrial Center': true, 'Commercial District': true };
    if (NEEDS_CITY[cardName] && ctx.globalParams) {
      var totalCities = 0;
      var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (pv && pv.game && pv.game.spaces) {
        for (var _ci = 0; _ci < pv.game.spaces.length; _ci++) {
          var _tt = pv.game.spaces[_ci].tileType;
          if (_tt === 'city' || _tt === 0 || _tt === 'capital' || _tt === 5) totalCities++;
        }
      }
      if (totalCities === 0) {
        bonus -= 8;
        pushStructuredReason(reasons, reasonRows, 'Нет городов на карте (−8)', -8);
      }
    }

    // Arctic Algae penalty — discount value based on already-placed oceans
    if (cardName === 'Arctic Algae' && ctx.globalParams) {
      var oceansPlaced = ctx.globalParams.oceans || 0;
      if (oceansPlaced > 0) {
        // Each placed ocean = 2 plants lost (won't trigger). 0.75 MC per plant.
        var lostValue = Math.round(oceansPlaced * 2 * 0.75);
        bonus -= lostValue;
        pushStructuredReason(reasons, reasonRows, '−' + oceansPlaced + ' океанов уже (−' + lostValue + ')', -lostValue);
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Milestone/Award proximity — tag-based and non-tag M/A scoring with racing
  // Returns { bonus: number, reasons: string[] }
  function scoreMilestoneAwardProximity(cardTags, cardType, eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 9. Milestone proximity — tag-based
    if (cardTags.size > 0 && cardType !== 'red') {
      for (var tag of cardTags) {
        if (tag === 'event') continue;
        var need = ctx.milestoneNeeds[tag];
        if (need !== undefined) {
          var msBonus = need === 1 ? SC.milestoneNeed1 : need === 2 ? SC.milestoneNeed2 : SC.milestoneNeed3;
          bonus += msBonus;
          var maEntries = TAG_TO_MA[tag] || [];
          var msName = maEntries.find(function(m) { return m.type === 'milestone'; });
          pushStructuredReason(reasons, reasonRows, 'до ' + (msName ? msName.name : 'вехи') + ' ещё ' + need, msBonus);
          break;
        }
      }
    }

    // 9b. Non-tag milestone proximity (cities, greeneries, events, TR, prod)
    if (data.e) {
      for (var key in ctx.milestoneSpecial) {
        var ms = ctx.milestoneSpecial[key];
        var helps = false;
        if (key === 'cities' && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps = true;
        if (key === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps = true;
        if (key === 'events' && cardType === 'red') helps = true;
        if (key === 'tr' && (eLower.includes('tr') || eLower.includes('terraform'))) helps = true;
        if (key.startsWith('prod_') && eLower.includes('prod')) helps = true;
        if (key === 'prod_energy' && (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power'))) helps = true;
        if (helps) {
          var msBonus2 = ms.need === 1 ? SC.milestoneNeed1 : ms.need === 2 ? SC.milestoneNeed2 : SC.milestoneNeed3;
          bonus += msBonus2;
          pushStructuredReason(reasons, reasonRows, 'до ' + ms.name + ' ещё ' + ms.need, msBonus2);
          break;
        }
      }
    }

    // 10. Award tag positioning
    if (cardTags.size > 0 && cardType !== 'red') {
      for (var tag2 of cardTags) {
        if (tag2 === 'event') continue;
        if (ctx.awardTags[tag2]) {
          var myCount = ctx.tags[tag2] || 0;  // awards count tableau tags only
          var racingMod = 0;
          var racingInfo = '';
          for (var awName in ctx.awardRacing) {
            var race = ctx.awardRacing[awName];
            var maEntry = MA_DATA[awName];
            if (maEntry && maEntry.tag && (maEntry.tag === tag2 || (maEntry.tag.indexOf('+') >= 0 && maEntry.tag.split('+').indexOf(tag2) >= 0))) {
              if (race.leading && race.delta >= 2) {
                racingMod = SC.racingLeadBig;
                racingInfo = ' лидер +' + race.delta;
              } else if (race.leading) {
                racingMod = SC.racingLeadSmall;
                racingInfo = ' лидер +' + race.delta;
              } else if (race.delta >= -1) {
                racingMod = SC.racingClose;
                racingInfo = ' −' + Math.abs(race.delta);
              } else {
                racingMod = SC.racingFar;
                racingInfo = ' −' + Math.abs(race.delta) + ' далеко';
              }
              break;
            }
          }
          var baseBonus = myCount >= 4 ? SC.awardBaseHigh : myCount >= 2 ? SC.awardBaseMid : SC.awardBaseLow;
          var awBonus = Math.max(0, baseBonus + racingMod);
          if (awBonus > 0) {
            bonus += awBonus;
            pushStructuredReason(reasons, reasonRows, 'Награда: ' + tag2 + racingInfo, awBonus);
          }
          break;
        }
      }
    }

    // 10b. Non-tag award racing
    if (data.e) {
      for (var awName2 in ctx.awardRacing) {
        var race2 = ctx.awardRacing[awName2];
        var maEntry2 = MA_DATA[awName2];
        if (!maEntry2 || (maEntry2.check === 'tags' && maEntry2.tag)) continue;
        var helps2 = false;
        if ((maEntry2.check === 'tiles' || maEntry2.check === 'cities') && (eLower.includes('city') || eLower.includes('город') || cardTags.has('city'))) helps2 = true;
        if (maEntry2.check === 'greeneries' && (eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('plant'))) helps2 = true;
        if (maEntry2.check === 'greenCards' && cardType === 'green') helps2 = true;
        if (maEntry2.check === 'prod') {
          var prodRes = maEntry2.resource || '';
          if (prodRes === 'megacredits' && eLower.includes('mc') && eLower.includes('prod')) helps2 = true;
          else if (prodRes === 'plants' && (eLower.includes('plant') && eLower.includes('prod'))) helps2 = true;
          else if (prodRes.indexOf('+') >= 0) {
            // Compound: steel+titanium, energy+heat, etc.
            var resParts = prodRes.split('+');
            var fx2prod = getFx(cardName);
            if (fx2prod) {
              var prodMap = { steel: 'sp', titanium: 'tp', energy: 'ep', heat: 'hp', plants: 'pp', megacredits: 'mp' };
              for (var _rpi = 0; _rpi < resParts.length; _rpi++) {
                if (fx2prod[prodMap[resParts[_rpi]]]) { helps2 = true; break; }
              }
            }
          }
          else if (prodRes === '' && eLower.includes('prod')) helps2 = true; // generic prod match
        }
        if (maEntry2.check === 'tr') {
          // Benefactor: ANY terraforming action raises TR (temp, oxy, ocean, venus, greenery)
          var fx2tr = getFx(cardName);
          if (fx2tr && (fx2tr.tr || fx2tr.tmp || fx2tr.o2 || fx2tr.oc || fx2tr.vn || fx2tr.grn)) helps2 = true;
          if (eLower.includes('tr') || eLower.includes('terraform') || eLower.includes('temperature') ||
              eLower.includes('oxygen') || eLower.includes('ocean') || eLower.includes('venus')) helps2 = true;
        }
        if (maEntry2.check === 'resource' && maEntry2.resource === 'heat' && (eLower.includes('heat') || eLower.includes('тепл'))) helps2 = true;
        if (maEntry2.check === 'steelTi' && (cardTags.has('building') || cardTags.has('space') || eLower.includes('steel') || eLower.includes('titan'))) helps2 = true;
        if (maEntry2.check === 'cardResources' && (eLower.includes('resource') || eLower.includes('animal') || eLower.includes('microbe') || eLower.includes('floater'))) helps2 = true;
        if (helps2) {
          var racingMod2 = 0;
          if (race2.leading && race2.delta >= 2) racingMod2 = SC.racingLeadBig;
          else if (race2.leading) racingMod2 = SC.racingLeadSmall;
          else if (race2.delta >= -1) racingMod2 = 0;
          else racingMod2 = SC.racingFar;
          var awBonus2 = Math.max(0, SC.awardNonTagBase + racingMod2);
          if (awBonus2 > 0) {
            var sign = race2.delta > 0 ? '+' : '';
            bonus += awBonus2;
            pushStructuredReason(reasons, reasonRows, awName2 + ' ' + sign + race2.delta, awBonus2);
          }
          break;
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Crude timing — early production bonus, late production/VP/action/discount penalties
  // Returns { bonus: number, reasons: string[] }
  function scoreCrudeTiming(cardName, eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 7. Early production bonus
    if (ctx.gen <= SC.earlyProdMaxGen && data.e) {
      var isProd = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isProd) {
        bonus += SC.earlyProdBonus;
        pushStructuredReason(reasons, reasonRows, 'Ранняя прод.', SC.earlyProdBonus);
      }
    }

    // 7b. Late production penalty
    if (ctx.gensLeft <= 3 && data.e) {
      var isProd2 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isVP2 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isAction2 = eLower.includes('action') || eLower.includes('действие');
      if (isProd2 && !isVP2 && !isAction2) {
        var prodPenalty = ctx.gensLeft <= 1 ? SC.lateProdGL1 : ctx.gensLeft <= 2 ? SC.lateProdGL2 : SC.lateProdGL3;
        bonus += prodPenalty;
        pushStructuredReason(reasons, reasonRows, 'Позд. прод. ' + prodPenalty, prodPenalty);
      }
    }

    // 8. Late VP bonus (based on remaining gens, not absolute gen number)
    var gl8 = ctx.gensLeft || 1;
    if ((gl8 <= 4 || ctx.gen >= SC.lateVPMinGen) && data.e) {
      var isVP3 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      var isProd3 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isVP3 && !isProd3) {
        bonus += SC.lateVPBonus;
        pushStructuredReason(reasons, reasonRows, 'Поздний VP', SC.lateVPBonus);
      }
    }

    // 8b. Late VP burst
    if (ctx.gensLeft <= 3 && data.e) {
      if (eLower.includes('vp') || eLower.includes('вп') || eLower.includes('victory')) {
        var isProd4 = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
        if (!isProd4) {
          var vpBurst = ctx.gensLeft <= 1 ? SC.vpBurstGL1 : ctx.gensLeft <= 2 ? SC.vpBurstGL2 : SC.vpBurstGL3;
          bonus += vpBurst;
          pushStructuredReason(reasons, reasonRows, 'VP burst +' + vpBurst, vpBurst);
        }
      }
    }

    // 8c. Action cards late game
    if (ctx.gensLeft <= 2 && data.e) {
      var isAction3 = eLower.includes('action') || eLower.includes('действие');
      var isVP4 = VP_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
      if (isAction3 && !isVP4) {
        var actPenalty = ctx.gensLeft <= 1 ? SC.actionLateGL1 : SC.actionLateGL2;
        bonus += actPenalty;
        pushStructuredReason(reasons, reasonRows, 'Поздн. действие ' + actPenalty, actPenalty);
      } else if (isAction3 && isVP4 && ctx.gensLeft <= 1) {
        bonus += SC.actionVPLate;
        pushStructuredReason(reasons, reasonRows, 'Мало активаций ' + SC.actionVPLate, SC.actionVPLate);
      }
    }

    // 8d. Discount sources late game
    if (ctx.gensLeft <= 2 && CARD_DISCOUNTS && CARD_DISCOUNTS[cardName]) {
      var discPenalty = ctx.gensLeft <= 1 ? SC.discountLateGL1 : SC.discountLateGL2;
      bonus += discPenalty;
      pushStructuredReason(reasons, reasonRows, 'Скидка бесполезна ' + discPenalty, discPenalty);
    }

    // 8e. TR chase — if behind on TR, terraforming cards get bonus
    if (ctx.oppTRGap > 0 && data.e) {
      var fx8e = getFx(cardName);
      if (fx8e && (fx8e.tr || fx8e.tmp || fx8e.o2 || fx8e.oc || fx8e.vn)) {
        var trSteps = (fx8e.tr || 0) + (fx8e.tmp || 0) + (fx8e.o2 || 0) + (fx8e.oc || 0) + (fx8e.vn || 0);
        var chaseBonus = Math.min(4, Math.round(ctx.oppTRGap * 0.3 * trSteps));
        if (chaseBonus > 0) {
          bonus += chaseBonus;
          pushStructuredReason(reasons, reasonRows, 'TR chase −' + ctx.oppTRGap + ' +' + chaseBonus, chaseBonus);
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Resource synergies — energy consumers/pipeline, plant engine, heat conversion
  // Returns { bonus: number, reasons: string[] }
  function scoreResourceSynergies(eLower, data, cardTags, ctx, cardName) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 13. Energy consumers — action-based cards that spend energy
    var ACTION_ENERGY_HOGS = { 'Ironworks': 4, 'Steelworks': 4, 'Water Splitting Plant': 3,
      'Ore Processor': 4, 'Physics Complex': 6, 'Venus Magnetizer': 4, 'Electro Catapult': 1 };
    var isActionEnergyConsumer = !!ACTION_ENERGY_HOGS[cardName || ''];
    if (ctx.prod.energy >= 2) {
      var isEnergyConsumer = isActionEnergyConsumer;
      if (!isEnergyConsumer && data.e) {
        if ((eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power')) &&
            (eLower.includes('decrease') || eLower.includes('spend') || eLower.includes('снизь') || eLower.includes('-'))) {
          isEnergyConsumer = true;
        }
      }
      if (isEnergyConsumer) {
        var enBonus = Math.min(SC.energyConsumerCap, Math.floor(ctx.prod.energy / 2));
        if (enBonus > 0) {
          bonus += enBonus;
          pushStructuredReason(reasons, reasonRows, 'Энерг: ' + ctx.prod.energy, enBonus);
        }
      }
    }

    // 13b. Energy pipeline — surplus energy without consumers
    if (ctx.prod.energy >= 3 && !ctx.hasEnergyConsumers) {
      var consumesEnergy = isActionEnergyConsumer;
      if (!consumesEnergy && data.e) {
        consumesEnergy = eLower.includes('spend') || eLower.includes('decrease energy') || eLower.includes('−energy') || eLower.includes('energy-prod');
      }
      if (consumesEnergy) {
        bonus += SC.energySinkBonus;
        pushStructuredReason(reasons, reasonRows, 'Энерг. сток +' + SC.energySinkBonus, SC.energySinkBonus);
      }
      if (!isActionEnergyConsumer && cardTags.has('power') && data.e) {
        if (eLower.includes('energy-prod') || eLower.includes('энерг-прод') || (eLower.includes('energy') && eLower.includes('prod'))) {
          bonus -= SC.energySurplusPenalty;
          pushStructuredReason(reasons, reasonRows, 'Избыток энерг. −' + SC.energySurplusPenalty, -SC.energySurplusPenalty);
        }
      }
    }

    // 14. Plant engine — high plant prod + O2 awareness
    if (ctx.prod.plants >= 2 && data.e) {
      if (isPlantEngineCardByFx(cardName, eLower)) {
        var o2Maxed = ctx.globalParams && ctx.globalParams.oxy >= SC.oxyMax;
        var greenPerGen = Math.floor(ctx.prod.plants / SC.plantsPerGreenery);
        var plBonus;
        if (greenPerGen >= 1 && !o2Maxed) {
          plBonus = Math.min(SC.plantEngineCapStrong, greenPerGen * 2 + Math.floor(ctx.prod.plants / 3));
        } else if (greenPerGen >= 1 && o2Maxed) {
          plBonus = Math.min(SC.plantEngineCapWeak, greenPerGen + 1);
        } else {
          plBonus = Math.min(SC.plantEngineCapWeak, Math.floor(ctx.prod.plants / 3));
        }
        if (plBonus > 0) {
          bonus += plBonus;
          pushStructuredReason(reasons, reasonRows, 'Раст ' + ctx.prod.plants + (o2Maxed ? ' (O₂ макс)' : '') + ' +' + plBonus, plBonus);
        }
      }
    }

    // 15. Heat synergy — heat → TR conversion + temp saturation
    if ((ctx.heat >= SC.heatPerTR || ctx.prod.heat >= 3) && data.e) {
      var tempMaxed = ctx.globalParams && ctx.globalParams.temp >= SC.tempMax;
      if (eLower.includes('heat') || eLower.includes('тепл')) {
        if (tempMaxed) {
          if (eLower.includes('prod') || eLower.includes('прод')) {
            bonus -= SC.heatProdMaxedPenalty;
            pushStructuredReason(reasons, reasonRows, 'Темп. макс −' + SC.heatProdMaxedPenalty, -SC.heatProdMaxedPenalty);
          } else if (ctx.heat >= SC.heatPerTR * 2) {
            bonus += SC.heatConverterValue;
            pushStructuredReason(reasons, reasonRows, 'Тепло ' + ctx.heat, SC.heatConverterValue);
          }
        } else {
          var trFromHeat = Math.floor(ctx.heat / SC.heatPerTR);
          if (trFromHeat >= 1) {
            var heatTrBonus = Math.min(SC.heatToTRCap, trFromHeat + 1);
            bonus += heatTrBonus;
            pushStructuredReason(reasons, reasonRows, 'Тепло→TR ' + trFromHeat, heatTrBonus);
          } else if (ctx.prod.heat >= 4) {
            bonus += SC.heatProdBonus;
            pushStructuredReason(reasons, reasonRows, 'Тепло-прод ' + ctx.prod.heat, SC.heatProdBonus);
          }
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // FTN timing delta + ocean-dependent action penalty
  // Returns { bonus: number, reasons: string[], skipCrudeTiming: boolean }
  function scoreFTNTiming(cardName, ctx, opts) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var skipCrudeTiming = false;
    var meltworksCashout = isMeltworksLastGenCashout(cardName, opts && opts.myHand, ctx);

    // Preludes and corps all play at gen 1 simultaneously — timing is constant, skip it
    if (opts && opts.isPreludeOrCorp) {
      return { bonus: 0, reasons: [], reasonRows: [], skipCrudeTiming: true };
    }

    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx = TM_CARD_EFFECTS[cardName];
      if (fx) {
        var isFixedTiming = fx.c === 0;
        if (!isFixedTiming) {
          // Dynamic reference gensLeft based on game format
          var REFERENCE_GL = SC.ftnReferenceGL;
          if (ctx.gensLeft > 8) REFERENCE_GL = Math.min(10, ctx.gensLeft); // longer games = higher reference
          var hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
          var hasVP = fx.vp || fx.vpAcc;
          var hasAction = fx.actMC || fx.actTR || fx.actOc || fx.actCD;
          var hasTR = fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn;
          var hasPlacementValue = !!fx.places;
          var isPureProduction = hasProd && !hasVP && !hasAction && !hasTR && !fx.city && !fx.grn && !hasPlacementValue;
          var SCALE = isPureProduction ? SC.ftnScaleProd : SC.ftnScaleOther;
          var CAP = isPureProduction ? SC.ftnCapProd : SC.ftnCapOther;
          // VP cards in last 2 gens: production is just bonus, cap negative timing penalty
          if (hasVP && ctx.gensLeft <= 2) {
            CAP = Math.min(CAP, 5); // don't let timing penalty dominate VP card value
          }
          var maxGL = fx.minG ? Math.max(0, 9 - fx.minG) : 13;
          var costDelay = 0;
          if (fx.c > SC.ftnCostFree) {
            costDelay = Math.floor((fx.c - SC.ftnCostFree) / SC.ftnCostPerGen);
          }
          var effectiveGL = Math.max(0, Math.min(ctx.gensLeft, maxGL) - costDelay);
          var refGL = Math.min(REFERENCE_GL, maxGL);
          var cvOpts = null;
          if (ctx.globalParams) {
            cvOpts = { o2Maxed: ctx.globalParams.oxy >= SC.oxyMax, tempMaxed: ctx.globalParams.temp >= SC.tempMax };
          }
          var delta = computeCardValue(fx, effectiveGL, cvOpts) - computeCardValue(fx, refGL);
          var adj = Math.max(-CAP, Math.min(CAP, Math.round(delta * SCALE)));
          if (meltworksCashout && adj < -4) adj = -4;
          if (Math.abs(adj) >= 1) {
            bonus += adj;
            pushStructuredReason(reasons, reasonRows, (isPureProduction ? 'Прод. тайминг ' : 'Тайминг ') + (adj > 0 ? '+' : '') + adj, adj);
          }
        }
        skipCrudeTiming = true;
      }
    }

    // 6c. Ocean-dependent action penalty
    if (typeof TM_CARD_EFFECTS !== 'undefined' && ctx.globalParams) {
      var fxOc = TM_CARD_EFFECTS[cardName];
      if (fxOc && fxOc.actOc) {
        var oceansPlaced = ctx.globalParams.oceans || 0;
        var oceansRemaining = Math.max(0, SC.oceansMax - oceansPlaced);
        var usableOceans = Math.min(oceansRemaining, ctx.gensLeft);
        if (usableOceans <= 2) {
          var ocPenalty = usableOceans <= 0 ? SC.oceanPen0 : usableOceans <= 1 ? SC.oceanPen1 : SC.oceanPen2;
          bonus += ocPenalty;
          pushStructuredReason(reasons, reasonRows, 'Океанов ост. ' + oceansRemaining + ' ' + ocPenalty, ocPenalty);
        }
      }
    }

    // 6d. Ocean-event-dependent cards: value comes from future ocean placements
    if (ctx.globalParams) {
      // Cards whose value depends on FUTURE ocean placements (by anyone).
      // NOT cards that place oceans (handled by actOc/FTN) or require oceans (handled by rule 0).
      var _OCEAN_DEP = {
        'Neptunian Power Consultants': true, // gains resources on ocean placement
        'Arctic Algae': true,                // gains plants on ocean placement
        'Lakefront Resorts': true            // MC prod from ocean adjacency
      };
      if (_OCEAN_DEP[cardName]) {
        var _ocRem = Math.max(0, SC.oceansMax - (ctx.globalParams.oceans || 0));
        if (_ocRem <= 0) {
          bonus += -20;
          pushStructuredReason(reasons, reasonRows, 'Океаны макс. −20', -20);
        } else if (_ocRem <= 2) {
          bonus += -8;
          pushStructuredReason(reasons, reasonRows, 'Океанов ' + _ocRem + ' −8', -8);
        }
      }
    }

    // 6e/6f moved to scoreCardEconomyInContext (rules 0 and 0b) where they reliably fire

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows, skipCrudeTiming: skipCrudeTiming };
  }

  // Turmoil synergy — delegates, influence, party policy, dominant party
  // Returns { bonus: number, reasons: string[] }
  function scoreTurmoilSynergy(eLower, data, cardTags, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    if (!ctx.turmoilActive || !data.e) return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };

    var isDelegateCard = eLower.includes('delegate') || eLower.includes('делегат');
    var isInfluenceCard = eLower.includes('influence') || eLower.includes('влияние');

    if (isDelegateCard || isInfluenceCard) {
      var delBase = ctx.myDelegates < 2 ? SC.delegateFew : ctx.myDelegates < 4 ? SC.delegateMid : SC.delegateMany;
      var delCount = 1;
      var delM = eLower.match(/(\d+)\s*delegate/);
      if (delM) delCount = parseInt(delM[1]) || 1;
      if (delCount >= 2) delBase += SC.delegateMulti;
      if (isInfluenceCard && !isDelegateCard) {
        delBase = Math.min(delBase, SC.influenceCap);
      }
      bonus += delBase;
      pushStructuredReason(reasons, reasonRows, 'Делегаты +' + delBase + ' (' + ctx.myDelegates + ' дел.)', delBase);
    }

    if (eLower.includes('chairman') || eLower.includes('party leader') || eLower.includes('лидер партии')) {
      bonus += SC.chairmanBonus;
      pushStructuredReason(reasons, reasonRows, 'Лидер/Председатель +' + SC.chairmanBonus, SC.chairmanBonus);
    }

    // 39. Party policy synergy
    if (ctx.rulingParty) {
      var partyBonus = 0;
      var rp = ctx.rulingParty;
      if (rp === 'Mars First') {
        if (cardTags.has('building') || cardTags.has('mars') || eLower.includes('city') || eLower.includes('город')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Scientists') {
        if (cardTags.has('science')) partyBonus = SC.partyMatchBonus;
        if (eLower.includes('draw') || eLower.includes('рисуй')) partyBonus += SC.scientistsDrawBonus;
      } else if (rp === 'Unity') {
        if (cardTags.has('jovian') || cardTags.has('venus') || cardTags.has('earth') || cardTags.has('space')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Greens') {
        if (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal') || eLower.includes('green') || eLower.includes('озелен')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Kelvinists') {
        if (eLower.includes('heat') || eLower.includes('тепл') || eLower.includes('energy') || eLower.includes('энерг')) partyBonus = SC.partyMatchBonus;
      } else if (rp === 'Reds') {
        if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean') || eLower.includes('tr ') || eLower.includes('+1 tr') || eLower.includes('terraform')) {
          partyBonus = -SC.redsBasePenalty;
          var trCount = 0;
          var trM = eLower.match(/(\d+)\s*tr/);
          if (trM) trCount = parseInt(trM[1]) || 1;
          if (eLower.includes('temperature') || eLower.includes('oxygen') || eLower.includes('ocean')) trCount = Math.max(trCount, 1);
          if (trCount >= 2) partyBonus = -SC.redsMultiPenalty;
        }
      }
      if (partyBonus !== 0) {
        bonus += partyBonus;
        pushStructuredReason(reasons, reasonRows, rp + (partyBonus > 0 ? ' +' : ' ') + partyBonus, partyBonus);
      }
    }

    // 39b. Dominant party alignment
    if (ctx.dominantParty) {
      var dom = ctx.dominantParty;
      if (dom !== ctx.rulingParty) {
        var domBonus = 0;
        if (dom === 'Mars First' && (cardTags.has('building') || eLower.includes('city'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Scientists' && cardTags.has('science')) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Unity' && (cardTags.has('space') || cardTags.has('venus') || cardTags.has('earth'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Greens' && (cardTags.has('plant') || cardTags.has('microbe') || cardTags.has('animal'))) domBonus = SC.dominantPartyBonus;
        else if (dom === 'Kelvinists' && (eLower.includes('heat') || eLower.includes('energy'))) domBonus = SC.dominantPartyBonus;
        if (domBonus > 0) {
          bonus += domBonus;
          pushStructuredReason(reasons, reasonRows, 'Дом. ' + reasonCardLabel(dom) + ' +1', domBonus);
        }
      }
    }

    // Coming event awareness — penalize tags that upcoming events punish
    if (ctx.comingEvent) {
      var _evPenTags = {
        'Pandemic': 'building', 'GlobalDustStorm': 'building',
        'SolarFlare': 'space', 'MinersOnStrike': 'jovian',
      };
      var _evBonTags = {
        'SpinoffProducts': 'science', 'InterplanetaryTrade': 'space',
        'HomeworldSupport': 'earth', 'CelebrityLeaders': 'event',
        'VenusInfrastructure': 'venus', 'AsteroidMining': 'jovian',
      };
      var penTag = _evPenTags[ctx.comingEvent];
      if (penTag && cardTags.has(penTag)) {
        bonus -= 1;
        pushStructuredReason(reasons, reasonRows, '⚡ ' + ctx.comingEvent.replace(/([A-Z])/g, ' $1').trim() + ' −1', -1);
      }
      var bonTag = _evBonTags[ctx.comingEvent];
      if (bonTag && cardTags.has(bonTag)) {
        bonus += 1;
        pushStructuredReason(reasons, reasonRows, '⚡ ' + ctx.comingEvent.replace(/([A-Z])/g, ' $1').trim() + ' +1', 1);
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Colony synergy — colony/trade/fleet keywords + infrastructure context
  // TR gap awareness — if behind on TR, terraforming cards more valuable
  // (embedded in scoreTurmoilSynergy return, added after event awareness)

  // Returns { bonus: number, reasons: string[] }
  function scoreColonySynergy(cardName, eLower, data, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    if (!data.e) return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
    var playableNow = isCardPlayableNowByStaticRequirements(cardName, ctx);
    var colonyBehavior = getColonyBehaviorByName(cardName);
    var hasBuildColony = !!(colonyBehavior && colonyBehavior.buildColony);
    var hasTradeEngine = !!(colonyBehavior && (
      (colonyBehavior.addTradeFleet || 0) > 0 ||
      typeof colonyBehavior.tradeDiscount === 'number' ||
      typeof colonyBehavior.tradeOffset === 'number' ||
      typeof colonyBehavior.tradeMC === 'number'
    ));

    var isColonyCard = !!colonyBehavior ||
      eLower.includes('colon') || eLower.includes('trade') || eLower.includes('колон') || eLower.includes('торгов') || eLower.includes('fleet') || eLower.includes('флот');

    if (isColonyCard) {
      // Colony synergy: colonies owned + track position bonus. Scale by gensLeft.
      if (ctx.coloniesOwned > 0) {
        var colGLScale = ctx.gensLeft >= 4 ? 1.0 : ctx.gensLeft >= 2 ? 0.6 : 0.3;
        var trackBonus = ctx.avgTrackPosition >= 3 ? 2 : ctx.avgTrackPosition >= 2 ? 1 : 0;
        var colonyBonus = Math.round(Math.min(SC.colonyCap, ctx.coloniesOwned * SC.colonyPerOwned + ctx.tradesLeft * SC.colonyPerTrade + trackBonus) * colGLScale);
        bonus += colonyBonus;
        var colParts = [ctx.coloniesOwned + ' колон.'];
        if (ctx.tradesLeft > 0) colParts.push(ctx.tradesLeft + ' флот');
        if (trackBonus > 0) colParts.push('track ' + Math.round(ctx.avgTrackPosition));
        pushStructuredReason(reasons, reasonRows, colParts.join(', ') + ' → +' + colonyBonus, colonyBonus);
      }

      if (hasTradeEngine || eLower.includes('fleet') || eLower.includes('флот') || eLower.includes('trade fleet')) {
        // Fleet value depends on colonies owned — extra fleet with 0 colonies is useless
        if (ctx.coloniesOwned >= 2) {
          var fleetVal = Math.min(SC.fleetCap, (ctx.coloniesOwned - 1) * SC.fleetPerColony + SC.fleetBase);
          bonus += fleetVal;
          var fleetCount = colonyBehavior && colonyBehavior.addTradeFleet ? colonyBehavior.addTradeFleet : 1;
          pushStructuredReason(reasons, reasonRows, '+' + fleetCount + ' Trade Fleet +' + fleetVal + ' (' + ctx.coloniesOwned + ' кол.)', fleetVal);
        } else if (ctx.coloniesOwned === 0) {
          bonus -= 2;
          pushStructuredReason(reasons, reasonRows, 'Trade Fleet −2 (0 кол.)', -2);
        }
        // 1 colony: fleet is marginal, no bonus/penalty
      }

      if (hasBuildColony || ((eLower.includes('place') || eLower.includes('build')) && eLower.includes('colon'))) {
        if (ctx.coloniesOwned < SC.colonySlotMax) {
          var colonyPlacementBonus = SC.colonyPlacement;
          // Recommend best colony to build on
          var bestBuild = '';
          var _pvCol = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
          if (typeof TM_COLONY_DATA !== 'undefined' && _pvCol && _pvCol.game && _pvCol.game.colonies) {
            var bestBuildVal = 0;
            var colonyBuildPriority = {
              'Pluto': 9, 'Luna': 9, 'Triton': 9,
              'Ceres': 7, 'Ganymede': 7,
              'Titan': 5, 'Callisto': 5, 'Io': 5, 'Miranda': 5,
              'Enceladus': 4, 'Europa': 2,
            };
            var colonyBuildAdjust = {
              'Pluto': 1, 'Luna': 1, 'Triton': 1,
              'Ceres': 0, 'Ganymede': 0,
              'Titan': 0, 'Callisto': 0, 'Io': 0, 'Miranda': 0,
              'Enceladus': -1, 'Europa': -1,
            };
            for (var _bci = 0; _bci < _pvCol.game.colonies.length; _bci++) {
              var _bc = _pvCol.game.colonies[_bci];
              if (!_bc.name) continue;
              var _bcd = TM_COLONY_DATA[_bc.name];
              if (!_bcd) continue;
              // Check if colony has free slots
              var _bcSlots = (_bc.colonies || []).length;
              if (_bcSlots >= 3) continue; // full
              // Estimate build bonus MC value
              var _bcVal = colonyBuildPriority[_bc.name] != null
                ? colonyBuildPriority[_bc.name]
                : _bcd.build.includes('production') ? 6 : _bcd.build.includes('TR') ? 7 : _bcd.build.includes('ocean') ? 3 : 4;
              if (_bcVal > bestBuildVal) { bestBuildVal = _bcVal; bestBuild = _bc.name; }
            }
            if (bestBuild && colonyBuildAdjust[bestBuild] != null) colonyPlacementBonus += colonyBuildAdjust[bestBuild];
          }
          bonus += colonyPlacementBonus;
          var colonyReasonLabel = 'Колония';
          if (bestBuild) {
            var colonyTargetLabels = {
              'Pluto': 'Колония на Pluto: добор/торг',
              'Luna': 'Колония на Luna: MC/торг',
              'Triton': 'Колония на Triton: ti/торг',
              'Ceres': 'Колония на Ceres: steel/торг',
              'Ganymede': 'Колония на Ganymede: карты/торг',
              'Titan': 'Колония на Titan: floaters/торг',
              'Callisto': 'Колония на Callisto: energy/торг',
              'Io': 'Колония на Io: heat/торг',
              'Miranda': 'Колония на Miranda: animals/торг',
              'Enceladus': 'Колония на Enceladus: microbes/торг',
              'Europa': 'Колония на Europa: ocean/торг',
            };
            colonyReasonLabel = colonyTargetLabels[bestBuild] || ('Колония на ' + bestBuild);
          }
          pushStructuredReason(reasons, reasonRows, colonyReasonLabel + ' +' + colonyPlacementBonus, colonyPlacementBonus);
        }
      }

      if (ctx.totalColonies !== undefined && ctx.colonyWorldCount > 0 && ctx.gen >= 3) {
        // For "gain bonus of YOUR colonies" cards (Productive Outpost), use own colonies
        var isMyColonyCard = eLower.includes('colony bonus') || eLower.includes('each of your colon') || eLower.includes('бонус.*колон');
        var relevantCount = isMyColonyCard ? ctx.coloniesOwned : ctx.totalColonies;
        var maxPossible = ctx.colonyWorldCount * SC.colonySlotsPerWorld;
        var saturation = ctx.totalColonies / maxPossible;
        if (isMyColonyCard) {
          // Productive Outpost etc: value = own colonies count, not market saturation
          if (ctx.coloniesOwned >= 3) {
            var myColBonusHigh = SC.colonySatBonus + 2;
            bonus += myColBonusHigh;
            pushStructuredReason(reasons, reasonRows, 'Мои колонии ' + ctx.coloniesOwned, myColBonusHigh);
          } else if (ctx.coloniesOwned >= 2) {
            bonus += SC.colonySatBonus;
            pushStructuredReason(reasons, reasonRows, 'Мои колонии ' + ctx.coloniesOwned, SC.colonySatBonus);
          }
        } else if (saturation < SC.colonySatLow && ctx.totalColonies <= SC.colonySatLowMax) {
          bonus -= SC.colonySatPenalty;
          pushStructuredReason(reasons, reasonRows, 'Мало колоний ' + ctx.totalColonies + '/' + ctx.colonyWorldCount, -SC.colonySatPenalty);
        } else if (saturation >= SC.colonySatHigh) {
          bonus += SC.colonySatBonus;
          pushStructuredReason(reasons, reasonRows, 'Много колоний ' + ctx.totalColonies, SC.colonySatBonus);
        }
      }
    }

    if (hasTradeEngine || eLower.includes('trade income') || eLower.includes('trade bonus') || eLower.includes('when you trade') || eLower.includes('торговый бонус')) {
      var tradesLeftNow = Math.max(0, ctx.tradesLeft || 0);
      if (tradesLeftNow > 0 && playableNow) {
        var immediateTradeBoost = 0;
        var specificTradeReason = false;
        if (colonyBehavior && typeof colonyBehavior.tradeMC === 'number' && colonyBehavior.tradeMC > 0) {
          var tradeMcPerTrade = Math.max(1, Math.round(colonyBehavior.tradeMC * 0.67));
          var tradeMcBonus = Math.min(4, tradesLeftNow * tradeMcPerTrade);
          if (tradeMcBonus > 0) {
            immediateTradeBoost += tradeMcBonus;
            specificTradeReason = true;
            pushStructuredReason(reasons, reasonRows, 'trade: +' + colonyBehavior.tradeMC + ' MC ×' + tradesLeftNow + ' +' + tradeMcBonus, tradeMcBonus);
          }
        }
        if (colonyBehavior && typeof colonyBehavior.tradeDiscount === 'number' && colonyBehavior.tradeDiscount > 0) {
          var tradeDiscountBonus = Math.min(SC.tradeBonusCap, tradesLeftNow * colonyBehavior.tradeDiscount);
          if (tradeDiscountBonus > 0) {
            immediateTradeBoost += tradeDiscountBonus;
            specificTradeReason = true;
            pushStructuredReason(reasons, reasonRows, 'trade: скидка −' + colonyBehavior.tradeDiscount + ' ×' + tradesLeftNow + ' +' + tradeDiscountBonus, tradeDiscountBonus);
          }
        }
        if (colonyBehavior && typeof colonyBehavior.tradeOffset === 'number' && colonyBehavior.tradeOffset > 0) {
          var tradeOffsetBonus = Math.min(4, tradesLeftNow * colonyBehavior.tradeOffset);
          if (tradeOffsetBonus > 0) {
            immediateTradeBoost += tradeOffsetBonus;
            specificTradeReason = true;
            pushStructuredReason(reasons, reasonRows, 'trade: трек +' + colonyBehavior.tradeOffset + ' ×' + tradesLeftNow + ' +' + tradeOffsetBonus, tradeOffsetBonus);
          }
        }
        if (!specificTradeReason) {
          immediateTradeBoost = (cardName === 'Venus Trade Hub' || cardName === 'L1 Trade Terminal')
            ? Math.min(4, tradesLeftNow * 2)
            : Math.min(SC.tradeBonusCap, tradesLeftNow);
        }
        if (immediateTradeBoost > 0) {
          bonus += immediateTradeBoost;
          if (!specificTradeReason) pushStructuredReason(reasons, reasonRows, tradesLeftNow + ' trade сейчас +' + immediateTradeBoost, immediateTradeBoost);
        }
      } else if (ctx.coloniesOwned > 0) {
        var tradeBoost = Math.min(SC.tradeBonusCap, ctx.coloniesOwned * SC.tradeBonusPerColony);
        bonus += tradeBoost;
        var tradeReason = 'Trade-бонус +' + tradeBoost;
        if (colonyBehavior && typeof colonyBehavior.tradeMC === 'number' && colonyBehavior.tradeMC > 0) tradeReason = 'trade: +' + colonyBehavior.tradeMC + ' MC позже +' + tradeBoost;
        else if (colonyBehavior && typeof colonyBehavior.tradeOffset === 'number' && colonyBehavior.tradeOffset > 0) tradeReason = 'trade: трек +' + colonyBehavior.tradeOffset + ' позже +' + tradeBoost;
        else if (colonyBehavior && typeof colonyBehavior.tradeDiscount === 'number' && colonyBehavior.tradeDiscount > 0) tradeReason = 'trade: скидка −' + colonyBehavior.tradeDiscount + ' позже +' + tradeBoost;
        pushStructuredReason(reasons, reasonRows, tradeReason, tradeBoost);
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // Board-state modifiers — energy deficit, plant vulnerability, prod-copy, floater engine, colony density
  // Returns { bonus: number, reasons: string[] }
  function scoreBoardStateModifiers(cardName, data, eLower, ctx) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    if (!ctx || typeof TM_CARD_EFFECTS === 'undefined') return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
    var fx = TM_CARD_EFFECTS[cardName];

    var prodFloor = getProductionFloorStatus(cardName, ctx);
    if (prodFloor.unplayable) {
      var openingLike = !!(ctx && (ctx._openingHand || (ctx.gensLeft != null && ctx.gensLeft >= 6)));
      if (openingLike) {
        var softPenalty = Math.min(12, 8 + prodFloor.reasons.length * 2);
        bonus -= softPenalty;
        for (var pfi = 0; pfi < prodFloor.reasons.length; pfi++) {
          pushStructuredReason(reasons, reasonRows, prodFloor.reasons[pfi].replace('Невозможно сыграть', 'Не сейчас') + ' −' + softPenalty, -softPenalty);
        }
      } else {
        bonus -= SC.ppUnplayable;
        for (var pfi2 = 0; pfi2 < prodFloor.reasons.length; pfi2++) {
          pushStructuredReason(reasons, reasonRows, prodFloor.reasons[pfi2], -SC.ppUnplayable);
        }
        return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
      }
    }

    // 47a. Energy deficit
    if (fx && fx.ep && fx.ep < 0) {
      var energyAfter = ctx.prod.energy + fx.ep;
      if (energyAfter < -2) {
        bonus -= SC.energyDeepDeficit;
        pushStructuredReason(reasons, reasonRows, 'Энерг. дефицит ' + ctx.prod.energy + '→' + energyAfter + ' −' + SC.energyDeepDeficit, -SC.energyDeepDeficit);
      } else if (energyAfter < 0 && ctx.prod.energy <= 0) {
        bonus -= SC.energyDeficitPenalty;
        pushStructuredReason(reasons, reasonRows, 'Нет энергии ' + ctx.prod.energy + ' −' + SC.energyDeficitPenalty, -SC.energyDeficitPenalty);
      }
    }

    // 47c. Plant production vulnerability
    if (ctx.oppHasPlantAttack && fx && fx.pp && fx.pp > 0) {
      bonus -= SC.plantProdVulnPenalty;
      pushStructuredReason(reasons, reasonRows, 'Раст. прод. под атакой −' + SC.plantProdVulnPenalty, -SC.plantProdVulnPenalty);
    }

    // 47d. Production-copy cards (Robotic Workforce copies 1, Cyberia Systems copies 2)
    var isCopyCard = cardName === 'Robotic Workforce' || cardName === 'Mining Robots Manuf. Center' ||
        cardName === 'Robotic Workforce (P2)' || cardName === 'Cyberia Systems';
    if (isCopyCard) {
      var copyCount = (cardName === 'Cyberia Systems') ? 2 : 1;
      var buildProds = [];
      for (var tbName of ctx.tableauNames) {
        var tbFx = TM_CARD_EFFECTS[tbName];
        if (!tbFx) continue;
        var tbData = TM_RATINGS[tbName];
        if (!tbData || !tbData.g || tbData.g.indexOf('Building') === -1) continue;
        var prodVal = (tbFx.sp || 0) * 2 + (tbFx.tp || 0) * 3 + (tbFx.mp || 0) +
          (tbFx.pp || 0) * 2.0 + (tbFx.ep || 0) * 2.0 + (tbFx.hp || 0) * 0.5;
        if (prodVal > 0) buildProds.push({ name: tbName, val: prodVal });
      }
      buildProds.sort(function(a, b) { return b.val - a.val; });
      var topTargets = buildProds.slice(0, copyCount);
      var totalCopyVal = 0;
      var copyNames = [];
      for (var ci47 = 0; ci47 < topTargets.length; ci47++) {
        totalCopyVal += topTargets[ci47].val;
        copyNames.push(reasonCardLabel(topTargets[ci47].name));
      }
      if (totalCopyVal >= SC.prodCopyMinVal) {
        var copyBonus = Math.min(SC.prodCopyBonusCap * copyCount, Math.round(totalCopyVal));
        bonus += copyBonus;
        pushStructuredReason(reasons, reasonRows, 'Копия ' + copyNames.join('+') + ' +' + copyBonus, copyBonus);
      }
    }

    // 47e. Floater engine
    if (fx && isFloaterCardByFx(cardName) && data.e) {
      var needsFloaters = eLower.includes('spend') || eLower.includes('remove') || eLower.includes('req');
      var selfFloaterSource = hasSelfFloaterSource(cardName);
      if (needsFloaters && ctx.floaterAccumRate > 0) {
        bonus += SC.floaterHasEngine;
        pushStructuredReason(reasons, reasonRows, 'Флоат. engine +' + SC.floaterHasEngine, SC.floaterHasEngine);
      } else if (needsFloaters && ctx.floaterAccumRate === 0 && !selfFloaterSource && !eLower.includes('add')) {
        bonus -= SC.floaterNoEngine;
        pushStructuredReason(reasons, reasonRows, 'Нет флоат. src −' + SC.floaterNoEngine, -SC.floaterNoEngine);
      }
    }

    // 47f. Colony trade density
    if (ctx.coloniesOwned >= 3 && data.e) {
      if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('колон') || eLower.includes('торг')) {
        var ctdBonus = Math.min(SC.colonyTradeCap, (ctx.coloniesOwned - 2) * SC.colonyTradeDensity);
        if (ctdBonus > 0) {
          bonus += ctdBonus;
          pushStructuredReason(reasons, reasonRows, 'Колонии ' + ctx.coloniesOwned + ' +' + ctdBonus, ctdBonus);
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  function getRequirementHardness(paramName, threshold) {
    if (paramName === 'temperature') {
      if (threshold >= 0) return 4;
      if (threshold >= -10) return 3;
      if (threshold >= -20) return 2;
      return 1;
    }
    if (paramName === 'oxygen') {
      if (threshold >= 7) return 4;
      if (threshold >= 4) return 3;
      return threshold >= 2 ? 2 : 1;
    }
    if (paramName === 'oceans') return threshold >= 6 ? 4 : threshold >= 3 ? 3 : threshold >= 2 ? 2 : 1;
    if (paramName === 'venus') return threshold >= 20 ? 4 : threshold >= 10 ? 3 : threshold >= 6 ? 2 : 1;
    return 0;
  }

  function getNamedRequirementDelayProfile(cardName, ctx) {
    var profile = { penalty: 0, reason: '', suppressAccumulatorBonus: false, selfResourceFactor: 1 };
    if (!ctx || !ctx.globalParams) return profile;

    var oxy = typeof ctx.globalParams.oxy === 'number' ? ctx.globalParams.oxy : 0;
    var temp = typeof ctx.globalParams.temp === 'number'
      ? ctx.globalParams.temp
      : (typeof ctx.globalParams.temperature === 'number' ? ctx.globalParams.temperature : -30);

    if (cardName === 'Birds') {
      var birdsGap = Math.max(0, 13 - oxy);
      if (birdsGap >= 11) {
        profile.penalty = -10;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.15;
      } else if (birdsGap >= 9) {
        profile.penalty = -8;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.25;
      } else if (birdsGap >= 7) {
        profile.penalty = -6;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.4;
      } else if (birdsGap >= 5) {
        profile.penalty = -3;
        profile.selfResourceFactor = 0.65;
      }
      if (profile.penalty < 0) profile.reason = 'Birds ждут O₂ −' + Math.abs(profile.penalty);
      return profile;
    }

    if (cardName === 'Fish') {
      var fishGap = Math.max(0, 2 - temp);
      if (fishGap >= 24) {
        profile.penalty = -10;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.15;
      } else if (fishGap >= 18) {
        profile.penalty = -8;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.25;
      } else if (fishGap >= 12) {
        profile.penalty = -6;
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0.4;
      } else if (fishGap >= 8) {
        profile.penalty = -3;
        profile.selfResourceFactor = 0.65;
      }
      if (profile.penalty < 0) profile.reason = 'Fish ждут temp −' + Math.abs(profile.penalty);
      return profile;
    }

    if (cardName === 'Insects') {
      var insectsGap = Math.max(0, 6 - oxy);
      if (insectsGap >= 6) profile.penalty = -5;
      else if (insectsGap >= 5) profile.penalty = -4;
      else if (insectsGap >= 4) profile.penalty = -3;
      if (profile.penalty < 0) profile.reason = 'Insects ждут O₂ −' + Math.abs(profile.penalty);
      return profile;
    }

    if (cardName === 'Psychrophiles') {
      var psychrophilesClosedSteps = Math.max(0, Math.ceil((temp - (-20)) / 2));
      if (psychrophilesClosedSteps >= 1) {
        profile.penalty = -(12 + Math.min(8, psychrophilesClosedSteps * 2));
        profile.reason = 'Psychrophiles: окно закрыто −' + Math.abs(profile.penalty);
        profile.suppressAccumulatorBonus = true;
        profile.selfResourceFactor = 0;
        return profile;
      }
      var psychrophilesStepsUntilClosed = Math.floor(((-20 - temp) / 2)) + 1;
      if (psychrophilesStepsUntilClosed <= 1) {
        profile.penalty = -4;
        profile.reason = 'Psychrophiles: окно почти закрыто −' + Math.abs(profile.penalty);
      } else if (psychrophilesStepsUntilClosed === 2) {
        profile.penalty = -2;
        profile.reason = 'Psychrophiles: мало окна −' + Math.abs(profile.penalty);
      }
      return profile;
    }

    if (cardName === 'Caretaker Contract') {
      var caretakerGap = Math.max(0, Math.ceil((0 - temp) / 2));
      if (caretakerGap >= 14) profile.penalty = -6;
      else if (caretakerGap >= 11) profile.penalty = -5;
      else if (caretakerGap >= 8) profile.penalty = -3;
      if (profile.penalty < 0) profile.reason = 'Caretaker ждёт 0°C −' + Math.abs(profile.penalty);
      return profile;
    }

    return profile;
  }

  function getRequirementHandTagCounts(cardName) {
    var handTags = {};
    var handCards = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
    var cardTags = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
    for (var hi = 0; hi < handCards.length; hi++) {
      if (handCards[hi] === cardName) continue;
      var tags = cardTags[handCards[hi]] || [];
      for (var tj = 0; tj < tags.length; tj++) {
        if (tags[tj] !== 'event') handTags[tags[tj]] = (handTags[tags[tj]] || 0) + 1;
      }
    }
    return handTags;
  }

  function getRequirementFlexSteps(cardName, corpsArray) {
    var flex = { any: 0, venus: 0 };
    if (!cardName || !corpsArray || corpsArray.length === 0) return flex;

    var globalReqs = (typeof TM_CARD_GLOBAL_REQS !== 'undefined')
      ? (_lookupCardData ? _lookupCardData(TM_CARD_GLOBAL_REQS, cardName) : TM_CARD_GLOBAL_REQS[cardName])
      : null;
    if (!globalReqs) return flex;

    for (var i = 0; i < corpsArray.length; i++) {
      var corp = corpsArray[i];
      if (corp === 'Inventrix') flex.any = Math.max(flex.any, 2);
      if (corp === 'Morning Star Inc.' && globalReqs.venus && (globalReqs.venus.min != null || globalReqs.venus.max != null)) {
        flex.venus = Math.max(flex.venus, 2);
      }
    }
    return flex;
  }

  function getBoardRequirementCounts(ctx, pv) {
    var counts = { colonies: 0, city: 0, greenery: 0 };
    if (ctx) {
      counts.colonies = ctx.coloniesOwned != null ? ctx.coloniesOwned : (ctx.colonies || 0);
      counts.city = ctx.cities || 0;
      counts.greenery = ctx.greeneries || 0;
    }
    if (pv && pv.thisPlayer) {
      if (!counts.colonies && pv.thisPlayer.coloniesCount != null) counts.colonies = pv.thisPlayer.coloniesCount || 0;
      if (pv.game && pv.game.playerTiles && pv.thisPlayer.color && pv.game.playerTiles[pv.thisPlayer.color]) {
        var myTiles = pv.game.playerTiles[pv.thisPlayer.color];
        if (!counts.city && myTiles.cities != null) counts.city = myTiles.cities || 0;
        if (!counts.greenery && myTiles.greeneries != null) counts.greenery = myTiles.greeneries || 0;
      }
    }
    return counts;
  }

  function getBoardRequirementDisplayName(key, missingCount) {
    if (key === 'colonies') return missingCount === 1 ? 'колонию' : 'колонии';
    if (key === 'city') return missingCount === 1 ? 'город' : 'города';
    if (key === 'greenery') return missingCount === 1 ? 'озеленение' : 'озеленения';
    return key;
  }

  function getBoardRequirementStatusLabel(key) {
    if (key === 'colonies') return 'Колонии';
    if (key === 'city') return 'Города';
    if (key === 'greenery') return 'Озеленения';
    return key;
  }

  function getRequirementParamReasonLabel(paramName) {
    if (paramName === 'oxygen') return 'O₂';
    if (paramName === 'temperature') return 'temp';
    if (paramName === 'oceans') return 'oceans';
    if (paramName === 'venus') return 'Venus';
    return paramName;
  }

  function getRequirementTagReasonLabel(tagName) {
    if (!tagName) return '';
    if (tagName === 'venus') return 'Venus';
    if (tagName === 'jovian') return 'Jovian';
    if (tagName === 'science') return 'science';
    if (tagName === 'earth') return 'Earth';
    if (tagName === 'building') return 'building';
    if (tagName === 'space') return 'space';
    if (tagName === 'plant') return 'plant';
    if (tagName === 'microbe') return 'microbe';
    if (tagName === 'animal') return 'animal';
    if (tagName === 'power') return 'power';
    if (tagName === 'city') return 'city';
    if (tagName === 'mars') return 'Mars';
    if (tagName === 'wild') return 'wild';
    return tagName;
  }

  function getRequirementReasonParam(text) {
    if (!text) return '';
    var m = text.match(/^Req (?:\d+ шагов|далеко) ([a-z]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function isSpecificRequirementReasonText(text) {
    if (!text) return false;
    return /^Req \d+ шагов /.test(text) ||
      /^Req почти /.test(text) ||
      /^Req ~\d+ пок\./.test(text) ||
      text.indexOf('Нет ') === 0 ||
      text.indexOf('Нужно ') === 0 ||
      text.indexOf('Окно') === 0 ||
      text.indexOf('Окно закрыто') !== -1;
  }

  function isGenericFarRequirementReasonText(text) {
    if (!text) return false;
    return /^Req далеко(?: [a-z]+)? /.test(text) || /^Req далеко \(/.test(text);
  }

  function cleanupRequirementReasons(reasons, reasonRows) {
    if (!reasons || reasons.length === 0) return { reasons: reasons || [], reasonRows: reasonRows || [] };
    var specificReqReasons = reasons.filter(isSpecificRequirementReasonText);
    if (specificReqReasons.length === 0) return { reasons: reasons, reasonRows: reasonRows || [] };

    var specificReqParams = new Set();
    for (var sri = 0; sri < specificReqReasons.length; sri++) {
      var reqParam = getRequirementReasonParam(specificReqReasons[sri]);
      if (reqParam) specificReqParams.add(reqParam);
    }

    function shouldDropReasonText(text) {
      if (!isGenericFarRequirementReasonText(text)) return false;
      var param = getRequirementReasonParam(text);
      if (!param) return true;
      return specificReqParams.size === 0 || specificReqParams.has(param);
    }

    return {
      reasons: reasons.filter(function(r) { return !shouldDropReasonText(r); }),
      reasonRows: (reasonRows || []).filter(function(row) { return !(row && row.text && shouldDropReasonText(row.text)); }),
    };
  }

  function isHardRequirementReasonText(text) {
    if (!text) return false;
    if (text.indexOf('Окно закрыто') >= 0 || text.indexOf('Req далеко') === 0 || text.indexOf('Нет ') === 0 || text.indexOf('Нужно ') === 0) return true;
    var stepM = text.match(/^Req (\d+) шагов /);
    return !!(stepM && parseInt(stepM[1], 10) >= 3);
  }

  function isSoftNearRequirementReasonText(text) {
    if (!text) return false;
    return /^Нужно 1 .+ сейчас [\-−]\d+/.test(text);
  }

  function parseBoardRequirements(reqText) {
    var text = (reqText || '').toLowerCase();
    if (!text) return [];

    var reqs = [];
    function addReq(key, need) {
      if (!(need > 0)) return;
      for (var i = 0; i < reqs.length; i++) {
        if (reqs[i].key === key) return;
      }
      reqs.push({ key: key, need: need });
    }

    var colonyM = text.match(/(\d+)\s*(?:colon(?:y|ies)|колон\w*)/i);
    if (colonyM) addReq('colonies', parseInt(colonyM[1], 10));

    var cityM = text.match(/(\d+)\s*(?:city|cities|город\w*)/i);
    if (cityM) {
      var cityFrag = text.slice(cityM.index, cityM.index + 32);
      if (!/\btag\b|тег/i.test(cityFrag)) addReq('city', parseInt(cityM[1], 10));
    }

    var greenM = text.match(/(\d+)\s*(?:greenery|greener(?:y|ies)|озелен\w*)/i);
    if (greenM) addReq('greenery', parseInt(greenM[1], 10));

    return reqs;
  }

  function evaluateBoardRequirements(reqText, ctx, pv) {
    var reqs = parseBoardRequirements(reqText);
    if (!reqs || reqs.length === 0) return null;

    var counts = getBoardRequirementCounts(ctx, pv);
    var unmet = [];
    var hardness = 0;
    var totalMissing = 0;

    for (var i = 0; i < reqs.length; i++) {
      var req = reqs[i];
      var have = counts[req.key] || 0;
      var missing = Math.max(0, req.need - have);
      hardness = Math.max(hardness, req.need + 1);
      if (missing > 0) {
        unmet.push({ key: req.key, need: req.need, have: have, missing: missing });
        totalMissing += missing;
      }
    }

    return {
      reqs: reqs,
      counts: counts,
      unmet: unmet,
      hardness: hardness,
      totalMissing: totalMissing,
      metNow: unmet.length === 0
    };
  }

  function isCardPlayableNowByStaticRequirements(cardName, ctx) {
    if (!cardName || !ctx) return true;

    var globalReqs = (typeof TM_CARD_GLOBAL_REQS !== 'undefined')
      ? (_lookupCardData ? _lookupCardData(TM_CARD_GLOBAL_REQS, cardName) : TM_CARD_GLOBAL_REQS[cardName])
      : null;
    var tagReqs = (typeof TM_CARD_TAG_REQS !== 'undefined')
      ? (_lookupCardData ? _lookupCardData(TM_CARD_TAG_REQS, cardName) : TM_CARD_TAG_REQS[cardName])
      : null;
    var gp = ctx.globalParams || {};
    var reqFlexCorps = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
    var reqFlex = getRequirementFlexSteps(cardName, reqFlexCorps);
    var paramMap = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };

    if (globalReqs) {
      for (var reqParam in paramMap) {
        var reqObj = globalReqs[reqParam];
        if (!reqObj) continue;
        var curVal = gp[paramMap[reqParam]] || 0;
        var step = reqParam === 'temperature' ? 2 : (reqParam === 'venus' ? 2 : 1);
        var flexSteps = reqFlex.any + (reqParam === 'venus' ? reqFlex.venus : 0);

        if (reqObj.min != null && curVal < (reqObj.min - flexSteps * step)) return false;
        if (reqObj.max != null && curVal > (reqObj.max + flexSteps * step)) return false;
      }
    }

    if (tagReqs) {
      var myTags = ctx.tags || {};
      for (var reqTag in tagReqs) {
        if (typeof tagReqs[reqTag] === 'object') continue;
        if ((myTags[reqTag] || 0) < tagReqs[reqTag]) return false;
      }
    }

    return true;
  }

  // Requirement feasibility penalty + MET bonus
  // Returns { bonus: number, reasons: string[] } or null
  function scoreCardRequirements(cardEl, ctx, cardName) {
    if (!ctx || !ctx.globalParams || !cardName) return null;

    var reqEl = cardEl ? cardEl.querySelector('.card-requirements, .card-requirement') : null;
    var reqText = reqEl ? ((reqEl.textContent || '').trim()) : '';
    var gp = ctx.globalParams;
    var globalReqs = (typeof TM_CARD_GLOBAL_REQS !== 'undefined') ? TM_CARD_GLOBAL_REQS[cardName] : null;
    var tagReqs = (typeof TM_CARD_TAG_REQS !== 'undefined') ? TM_CARD_TAG_REQS[cardName] : null;
    var boardReqs = evaluateBoardRequirements(reqText, ctx, null);
    if (!globalReqs && !tagReqs && !reqText) return null;

    var reqFlexCorps = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
    var reqFlex = getRequirementFlexSteps(cardName, reqFlexCorps);
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var hardness = 0;
    var metNow = true;
    var paramMap = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
    var handSteps = { temperature: 0, oxygen: 0, oceans: 0, venus: 0 };

    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var handCards0 = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
      for (var hi0 = 0; hi0 < handCards0.length; hi0++) {
        if (handCards0[hi0] === cardName) continue;
        var hfx0 = TM_CARD_EFFECTS[handCards0[hi0]];
        if (!hfx0) continue;
        if (hfx0.tmp) handSteps.temperature += hfx0.tmp;
        if (hfx0.o2) handSteps.oxygen += hfx0.o2;
        if (hfx0.oc) handSteps.oceans += hfx0.oc;
        if (hfx0.vn) handSteps.venus += hfx0.vn;
        if (hfx0.grn) handSteps.oxygen += hfx0.grn;
      }
    }

    if (globalReqs) {
      for (var reqParam in paramMap) {
        var reqObj = globalReqs[reqParam];
        if (!reqObj) continue;
        var curVal = gp[paramMap[reqParam]] || 0;
        var step = reqParam === 'temperature' ? 2 : (reqParam === 'venus' ? 2 : 1);
        var flexSteps = reqFlex.any + (reqParam === 'venus' ? reqFlex.venus : 0);

        if (reqObj.min != null) {
          hardness = Math.max(hardness, getRequirementHardness(reqParam, reqObj.min));
          var effectiveMin = reqObj.min - flexSteps * step;
          if (curVal < effectiveMin) {
            metNow = false;
            var gap = effectiveMin - curVal;
            var stepsNeeded = Math.ceil(gap / step);
            var netSteps = Math.max(0, stepsNeeded - (handSteps[reqParam] || 0));

            if (netSteps > 0) {
              var othersRate = 1;
              var pv0 = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
              if (pv0 && pv0.game && pv0.game.gameOptions) {
                var wgt0 = pv0.game.gameOptions.solarPhaseOption;
                var pl0 = (pv0.game.players || []).length || 3;
                othersRate = (wgt0 ? 1 : 0) + Math.max(0, (pl0 - 1) * 0.5);
              }
              var adjustedNet = Math.max(0, netSteps - Math.round(othersRate * ctx.gensLeft * 0.3));
              var genScale = ctx.gen <= 1 ? 0.2 : ctx.gen <= 2 ? 0.4 : ctx.gen <= 3 ? 0.6 : 1.0;

              if (ctx.gensLeft <= 1 && adjustedNet > 2) {
                bonus += -30;
                reasons.push('Req далеко ' + reqParam + ' −30');
              } else if (adjustedNet > ctx.gensLeft) {
                var distPen = Math.round(Math.min(15, Math.round(adjustedNet * 2.5)) * genScale);
                if (distPen > 0) { bonus += -distPen; reasons.push('Req далеко ' + reqParam + ' −' + distPen); }
              } else if (netSteps >= 3) {
                var slowFactor = reqParam === 'venus' ? 1.5 : 1.0;
                var gradPen = Math.round(Math.min(8, netSteps * slowFactor) * genScale);
                if ((reqParam === 'oxygen' || reqParam === 'venus') && stepsNeeded >= 5) {
                  var farReqFloor = ctx.gen <= 1 ? 3 : ctx.gen <= 2 ? 2 : 0;
                  if (farReqFloor > 0) gradPen = Math.max(gradPen, farReqFloor + Math.min(2, Math.floor((stepsNeeded - 1) / 4)));
                }
                if (gradPen > 0) { bonus += -gradPen; reasons.push('Req ' + stepsNeeded + ' шагов ' + reqParam + ' −' + gradPen); }
              } else {
                var rate = ctx.terraformRate > 0 ? ctx.terraformRate : SC.terraformRateDefault;
                var gensWait = Math.ceil((gap / step) / rate);
                var reqPenalty = -Math.min(SC.reqPenaltyMax, gensWait * SC.reqPenaltyPerGen);
                if (reqPenalty < 0) {
                  bonus += reqPenalty;
                  reasons.push('Req ~' + gensWait + ' пок.');
                }
              }
            }
          }
        }

        if (reqObj.max != null) {
          var effectiveMax = reqObj.max + flexSteps * step;
          if (curVal > effectiveMax) {
            metNow = false;
            bonus -= SC.reqInfeasible;
            pushStructuredReason(reasons, reasonRows, 'Окно закрыто!', -SC.reqInfeasible);
          } else {
            var stepsToMax = Math.floor((effectiveMax - curVal) / step);
            if (stepsToMax <= 2 && stepsToMax >= 0) {
              var urgPen = stepsToMax <= 0 ? -50 : stepsToMax === 1 ? -8 : -4;
              bonus += urgPen;
              reasons.push('Окно закрывается ' + reqParam + ' ' + urgPen);
            }
          }
        }
      }
    } else if (reqText) {
      var rtFallback = reqText.toLowerCase();
      var tmpFb = rtFallback.match(/([\-\d]+)\s*°/);
      var oxyFb = rtFallback.match(/(\d+)\s*%/);
      var oceFb = rtFallback.match(/(\d+)\s*ocean/i);
      var venFb = rtFallback.match(/(\d+)\s*%?\s*venus/i) || rtFallback.match(/venus\s*(\d+)/i);
      if (tmpFb) hardness = Math.max(hardness, getRequirementHardness('temperature', parseInt(tmpFb[1])));
      if (oxyFb) hardness = Math.max(hardness, getRequirementHardness('oxygen', parseInt(oxyFb[1])));
      if (oceFb) hardness = Math.max(hardness, getRequirementHardness('oceans', parseInt(oceFb[1])));
      if (venFb) hardness = Math.max(hardness, getRequirementHardness('venus', parseInt(venFb[1])));
    }

    if (boardReqs) {
      hardness = Math.max(hardness, boardReqs.hardness);
      if (!boardReqs.metNow) {
        metNow = false;
        for (var bri = 0; bri < boardReqs.unmet.length; bri++) {
          var breq = boardReqs.unmet[bri];
          var boardPerMissing = breq.key === 'colonies' ? 8 : breq.key === 'city' ? 6 : 5;
          var boardPenalty = ctx.gensLeft <= 1 ? Math.max(30, breq.missing * boardPerMissing) : breq.missing * boardPerMissing;
          bonus -= boardPenalty;
          pushStructuredReason(
            reasons,
            reasonRows,
            'Нужно ' + breq.missing + ' ' + getBoardRequirementDisplayName(breq.key, breq.missing) + ' (есть ' + breq.have + ')',
            -boardPenalty
          );
        }
      }
    }

    if (tagReqs) {
      var myTags = ctx.tags || {};
      var handTags0 = getRequirementHandTagCounts(cardName);
      var miss = 0;
      var totalReqs = 0;
      var missList = [];
      for (var reqTag in tagReqs) {
        if (typeof tagReqs[reqTag] === 'object') continue;
        totalReqs++;
        hardness = Math.max(hardness, tagReqs[reqTag]);
        var haveNow = myTags[reqTag] || 0;
        var haveSoon = haveNow + (handTags0[reqTag] || 0);
        var nowMiss = Math.max(0, tagReqs[reqTag] - haveNow);
        if (haveNow < tagReqs[reqTag]) metNow = false;
        if (nowMiss > 0 && haveSoon >= tagReqs[reqTag]) {
          var softNowPenalty = ctx.gensLeft <= 1 ? -20 : -Math.min(6, nowMiss * 3 + 1);
          bonus += softNowPenalty;
          reasons.push('Нужно ' + nowMiss + ' ' + getRequirementTagReasonLabel(reqTag) + ' сейчас ' + softNowPenalty);
        }
        if (haveSoon < tagReqs[reqTag]) {
          miss += (tagReqs[reqTag] - haveSoon);
          missList.push(reqTag);
        }
      }
      if (miss > 0 && totalReqs > 0) {
        var tagPenalty = ctx.gensLeft <= 1 ? -30 : Math.round(-8 * miss / Math.max(ctx.gensLeft * 0.5, 1));
        bonus += tagPenalty;
        reasons.push('Нет ' + missList.join('+') + ' ' + tagPenalty);
      }
    } else if (reqText && !(boardReqs && boardReqs.reqs && boardReqs.reqs.length > 0)) {
      var tagReqM = reqText.toLowerCase().match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i);
      if (tagReqM) {
        hardness = Math.max(hardness, parseInt(tagReqM[1]));
        var tagReqName = tagReqM[2].toLowerCase();
        var myTagCount = (ctx && ctx.tags) ? (ctx.tags[tagReqName] || 0) : 0;
        if (myTagCount < parseInt(tagReqM[1])) metNow = false;
      }
    }

    if (metNow && !reasons.some(function(r) { return r.includes('Req ~') || r.includes('Окно') || r.includes('Req далеко') || r.indexOf('Нет ') === 0; })) {
      if (hardness >= 4) { bonus += SC.reqMetHard; reasons.push('Req ✓ +' + SC.reqMetHard); }
      else if (hardness >= 3) { bonus += SC.reqMetMedium; reasons.push('Req ✓ +' + SC.reqMetMedium); }
      else if (hardness >= 2) { bonus += SC.reqMetEasy; reasons.push('Req ✓ +' + SC.reqMetEasy); }
    }

    return (bonus !== 0 || reasons.length > 0) ? { bonus: bonus, reasons: reasons, reasonRows: reasonRows } : null;
  }

  // Parameter saturation — penalty when card raises global params that are near/at max
  // Returns { penalty: number, reason: string|null }
  function computeParamSaturation(cardName, ctx, baseScore) {
    if (typeof TM_CARD_EFFECTS === 'undefined') return { penalty: 0, reason: null };
    var fx = TM_CARD_EFFECTS[cardName];
    if (!fx || !ctx.globalParams) return { penalty: 0, reason: null };

    var gl = Math.max(0, Math.min(13, ctx.gensLeft));
    var trVal = ftnRow(gl)[0];
    var lostMCVal = 0;
    var approachPenalty = 0;

    // Choice params: e.g., "tmp,vn" = pick one (Atmoscoop: temp+2 OR venus+2)
    var choiceKeys = fx.choice ? fx.choice.split(',') : null;
    var choiceLost = 0;
    var choiceAllMaxed = !!choiceKeys;

    // Per-param saturation check
    var params = [
      { key: 'tmp', val: fx.tmp, cur: ctx.globalParams.temp, max: SC.tempMax, step: 2, extra: 0, approachTh: 2 },
      { key: 'o2',  val: fx.o2,  cur: ctx.globalParams.oxy,  max: SC.oxyMax,  step: 1, extra: 0, approachTh: 2 },
      { key: 'oc',  val: fx.oc,  cur: ctx.globalParams.oceans, max: SC.oceansMax, step: 1, extra: 3, approachTh: 1 },
      { key: 'vn',  val: fx.vn,  cur: ctx.globalParams.venus, max: SC.venusMax, step: 2, extra: 0, approachTh: 2 }
    ];
    for (var pi = 0; pi < params.length; pi++) {
      var pm = params[pi];
      if (!pm.val) continue;
      var isChoice = choiceKeys && choiceKeys.indexOf(pm.key) >= 0;
      var mcPerUnit = trVal + pm.extra;
      if (pm.cur >= pm.max) {
        var loss = pm.val * mcPerUnit;
        if (isChoice) choiceLost += loss; else lostMCVal += loss;
      } else {
        var remaining = Math.max(0, (pm.max - pm.cur) / pm.step);
        var over = Math.max(0, pm.val - remaining);
        if (isChoice) {
          choiceLost += over * mcPerUnit;
          if (over === 0) choiceAllMaxed = false;
        } else {
          lostMCVal += over * mcPerUnit;
          if (remaining <= pm.approachTh && over === 0) approachPenalty += SC.approachPenalty;
        }
      }
    }

    // Choice resolution: only add loss if ALL choice branches are maxed
    if (choiceKeys && choiceAllMaxed) lostMCVal += choiceLost;

    if (lostMCVal > 0 || approachPenalty > 0) {
      var totalMCVal = computeCardValue(fx, ctx.gensLeft);
      var fractionLost = totalMCVal > 1 ? lostMCVal / totalMCVal : (lostMCVal > 0 ? 0.9 : 0);
      // Cap penalty: don't penalize more than the lost MC value itself (e.g. lost ocean = ~10 MC, not 56)
      // Cards with other valuable effects (animal/microbe targets, tags) shouldn't lose ALL value
      var rawPenalty = Math.round(baseScore * fractionLost);
      var satPenalty = Math.min(rawPenalty, Math.round(lostMCVal * 1.5)) + approachPenalty;
      if (satPenalty > 0) {
        var lostTRCount = Math.round(lostMCVal / trVal);
        var reason = lostTRCount > 0
          ? lostTRCount + ' TR потер. −' + satPenalty + ' (' + Math.round(fractionLost * 100) + '%)'
          : 'Парам. скоро макс −' + satPenalty;
        return { penalty: satPenalty, reason: reason };
      }
    }
    return { penalty: 0, reason: null };
  }

  // ── Corp synergy detection (Two Corps support) ──

  let cachedCorp = null;
  let cachedCorps = null;
  let corpCacheTime = 0;

  function detectMyCorps() {
    if (Date.now() - corpCacheTime < 3000 && cachedCorps !== null) return cachedCorps;
    corpCacheTime = Date.now();

    var corps = [];
    var pv = getPlayerVueData();

    // Source of truth: current player's tableau from API.
    // DOM selectors can include opponent cards on knightbyte layouts and leak чужие корпы.
    if (pv && pv.thisPlayer && Array.isArray(pv.thisPlayer.tableau)) {
      for (var pti = 0; pti < pv.thisPlayer.tableau.length; pti++) {
        var tableauName = resolveCorpName(cardN(pv.thisPlayer.tableau[pti]));
        if (!tableauName || tableauName === 'Merger') continue;
        if (TM_CORPS && TM_CORPS[tableauName] && corps.indexOf(tableauName) === -1) corps.push(tableauName);
      }
    }

    if (corps.length > 0) {
      cachedCorps = corps;
      cachedCorp = corps.length > 0 ? corps[0] : '';
      return cachedCorps;
    }

    var myCards = document.querySelectorAll(SEL_TABLEAU);

    // DOM detection: .is-corporation or .card-corporation-logo
    for (var i = 0; i < myCards.length; i++) {
      var el = myCards[i];
      var name = el.getAttribute('data-tm-card');
      if (!name) continue;
      var corpTitle = el.querySelector('.card-title.is-corporation, .card-corporation-logo');
      if (corpTitle && corps.indexOf(name) === -1) corps.push(name);
    }

    // Fallback: corporation-label
    if (corps.length === 0) {
      for (var j = 0; j < myCards.length; j++) {
        var el2 = myCards[j];
        var name2 = el2.getAttribute('data-tm-card');
        if (!name2) continue;
        var corpLabel = el2.querySelector('.corporation-label');
        if (corpLabel && corps.indexOf(name2) === -1) corps.push(name2);
      }
    }

    // Fallback: check TAG_TRIGGERS/CORP_DISCOUNTS/CORP_ABILITY_SYNERGY for tableau cards
    if (corps.length === 0) {
      if (pv && pv.thisPlayer && pv.thisPlayer.tableau) {
        for (var k = 0; k < pv.thisPlayer.tableau.length; k++) {
          var cn = cardN(pv.thisPlayer.tableau[k]);
          if (cn === 'Merger') continue; // Merger is a prelude, not a corp
          if (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn] || CORP_ABILITY_SYNERGY[cn]) {
            if (corps.indexOf(cn) === -1) corps.push(cn);
          }
        }
      }
    }

    // Normalize corp names via resolver (handles aliases from DOM)
    for (var ri = 0; ri < corps.length; ri++) corps[ri] = resolveCorpName(corps[ri]);
    cachedCorps = corps;
    cachedCorp = corps.length > 0 ? corps[0] : '';
    return cachedCorps;
  }

  function detectMyCorp() {
    detectMyCorps();
    return cachedCorp;
  }

  // Frozen scores cache: cardName → { html, className } — survives DOM re-renders
  var frozenScores = new Map();
  var _frozenGameId = null; // reset on new game
  var _oppTableauSizes = {}; // color → tableau length, for invalidation

  // Cached player context (light version for tag synergies)
  let cachedCtx = null;
  let ctxCacheTime = 0;

  function getCachedPlayerContext() {
    if (Date.now() - ctxCacheTime < 3000 && cachedCtx !== null) return cachedCtx;
    ctxCacheTime = Date.now();
    cachedCtx = getPlayerContext();
    return cachedCtx;
  }

  function enrichCtxForScoring(ctx, myTableau, myHand) {
    if (!ctx) return;
    ctx._playedEvents = getMyPlayedEventNames();
    ctx._allMyCards = [...myTableau, ...myHand];
    ctx._allMyCardsSet = new Set(ctx._allMyCards);
    ctx._handTagCounts = getHandTagCounts();
  }

  /**
   * Highlight cards that synergize with the player's corporation
   * + Tag-based soft synergies via TAG_TRIGGERS and CARD_DISCOUNTS
   */
  function highlightCorpSynergies() {
    var myCorpsHL = detectMyCorps();

    // Single querySelectorAll — clean up + compute in one pass
    var cardEls = document.querySelectorAll('.card-container[data-tm-card]');

    // Remove old highlights first
    cardEls.forEach(function(el) {
      el.classList.remove('tm-corp-synergy', 'tm-tag-synergy');
    });

    if (myCorpsHL.length === 0) return;

    // Pre-compute: corp synergy set (cards ANY corp lists as synergies)
    var corpSyns = new Set();
    var corpNameSet = new Set(myCorpsHL);
    for (var hi = 0; hi < myCorpsHL.length; hi++) {
      var corpData = TM_RATINGS[myCorpsHL[hi]];
      if (corpData && corpData.y) {
        for (var si = 0; si < corpData.y.length; si++) corpSyns.add(yName(corpData.y[si]));
      }
    }

    // Pre-compute: trigger tags from ALL corps + tableau
    var triggerTags = new Set();
    for (var tci = 0; tci < myCorpsHL.length; tci++) {
      var tc = myCorpsHL[tci];
      if (TAG_TRIGGERS[tc]) {
        TAG_TRIGGERS[tc].forEach(function(t) { t.tags.forEach(function(tag) { triggerTags.add(tag); }); });
      }
      if (CORP_DISCOUNTS[tc]) {
        for (var tag in CORP_DISCOUNTS[tc]) {
          if (!tag.startsWith('_')) triggerTags.add(tag);
        }
      }
    }
    var tableauNames = getMyTableauNames();
    for (var ti = 0; ti < tableauNames.length; ti++) {
      var tName = tableauNames[ti];
      if (TAG_TRIGGERS[tName]) {
        TAG_TRIGGERS[tName].forEach(function(t) { t.tags.forEach(function(tag) { triggerTags.add(tag); }); });
      }
      if (CARD_DISCOUNTS[tName]) {
        for (var ctag in CARD_DISCOUNTS[tName]) {
          if (!ctag.startsWith('_')) triggerTags.add(ctag);
        }
      }
    }

    // Single pass: apply both corp synergy + tag synergy
    cardEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name || corpNameSet.has(name)) return;

      // Corp synergy check: card listed by ANY corp, or card lists ANY corp
      var isCorpSyn = false;
      if (corpSyns.has(name)) {
        isCorpSyn = true;
      } else {
        var data = TM_RATINGS[name];
        if (data && data.y) {
          for (var i = 0; i < data.y.length; i++) {
            var yn = yName(data.y[i]);
            for (var k = 0; k < myCorpsHL.length; k++) {
              if (yn === myCorpsHL[k] || yn.indexOf(myCorpsHL[k]) !== -1) {
                isCorpSyn = true;
                break;
              }
            }
            if (isCorpSyn) break;
          }
        }
      }

      if (isCorpSyn) {
        el.classList.add('tm-corp-synergy');
      } else if (triggerTags.size > 0) {
        // Tag synergy (only if not already corp synergy)
        var tags = getCardTags(el);
        for (var j = 0; j < tags.length; j++) {
          if (triggerTags.has(tags[j])) {
            el.classList.add('tm-tag-synergy');
            break;
          }
        }
      }
    });
  }

  // ── Combo highlighting (with rating colors) ──

  function checkCombos() {
    if (typeof TM_COMBOS === 'undefined') return;

    var myNames = new Set();
    var nameToEls = {};
    var hasComboTip = new Set();
    var hasAntiTip = new Set();

    // Selectors for "my" cards only (tableau + hand + draft selection)
    var MY_CARD_SEL = SEL_TABLEAU + ', ' + SEL_HAND + ', ' + SEL_DRAFT;

    // Cleanup pass: remove combo classes from ALL cards (including opponent's)
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche', 'tm-combo-hint', 'tm-anti-combo');
      el.querySelectorAll('.tm-combo-tooltip, .tm-anti-combo-tooltip').forEach(function(t) { t.remove(); });
    });

    // Build name→elements map from MY cards only (no opponent tableau leaking in)
    document.querySelectorAll(MY_CARD_SEL).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) {
        myNames.add(name);
        if (!nameToEls[name]) nameToEls[name] = [];
        nameToEls[name].push(el);
      }
    });

    var ratingLabels = { godmode: 'GODMODE', great: 'Отлично', good: 'Хорошо', decent: 'Неплохо', niche: 'Ниша' };

    for (var ci = 0; ci < TM_COMBOS.length; ci++) {
      var combo = TM_COMBOS[ci];
      var matched = combo.cards.filter(function(c) { return myNames.has(c); });
      if (matched.length >= 2) {
        // Skip combos requiring a corp we don't own
        var _missingCombo = combo.cards.filter(function(c) { return !myNames.has(c); });
        var _corpDataC = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
        var _myCorpsC = detectMyCorps();
        var _skipCombo = false;
        for (var _mci = 0; _mci < _missingCombo.length; _mci++) {
          if (_corpDataC[_missingCombo[_mci]] && _myCorpsC.indexOf(_missingCombo[_mci]) === -1) { _skipCombo = true; break; }
        }
        if (_skipCombo) continue;

        var rating = combo.r || 'decent';
        var comboClass = 'tm-combo-' + rating;
        for (var mi = 0; mi < matched.length; mi++) {
          var cardName = matched[mi];
          var els = nameToEls[cardName] || [];
          for (var ei = 0; ei < els.length; ei++) {
            var el = els[ei];
            el.classList.add('tm-combo-highlight', comboClass);
            if (!hasComboTip.has(el)) {
              hasComboTip.add(el);
              var otherCards = combo.cards.filter(function(c) { return c !== cardName; }).join(' + ');
              el.setAttribute('data-tm-combo', (ratingLabels[rating] || rating) + ' [' + otherCards + ']: ' + combo.v);
            }
          }
        }
      } else if (matched.length === 1 && (combo.r === 'godmode' || combo.r === 'great' || combo.r === 'good')) {
        // One-sided combo hint
        var hintEls = nameToEls[matched[0]] || [];
        for (var hi = 0; hi < hintEls.length; hi++) {
          if (!hintEls[hi].classList.contains('tm-combo-highlight')) {
            hintEls[hi].classList.add('tm-combo-hint');
          }
        }
      }
    }

    // Anti-combos
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (var ai = 0; ai < TM_ANTI_COMBOS.length; ai++) {
        var anti = TM_ANTI_COMBOS[ai];
        var aMatched = anti.cards.filter(function(c) { return myNames.has(c); });
        if (aMatched.length >= 2) {
          for (var ami = 0; ami < aMatched.length; ami++) {
            var aEls = nameToEls[aMatched[ami]] || [];
            for (var aei = 0; aei < aEls.length; aei++) {
              var ael = aEls[aei];
              ael.classList.add('tm-anti-combo');
              if (!hasAntiTip.has(ael)) {
                hasAntiTip.add(ael);
                ael.setAttribute('data-tm-anti-combo', anti.v);
              }
            }
          }
        }
      }
    }
  }

  // ── Dynamic hand-combo detection ──
  // Pattern-based combos that can't be expressed as static card lists:
  // e.g. "Robotic Workforce + ANY building-tag production card in tableau"

  var HAND_COMBO_PATTERNS = [
    // Robotic Workforce + any building-tag card with significant production in tableau
    {
      trigger: 'Robotic Workforce',
      desc: '\uD83D\uDD17 Copy prod: ',
      matchFn: function(tableauNames, handSet, ctx) {
        var _eff = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : {};
        var _tags = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
        var best = null, bestVal = 0;
        for (var i = 0; i < tableauNames.length; i++) {
          var n = tableauNames[i];
          var t = _tags[n];
          if (!t || t.indexOf('building') < 0) continue;
          var fx = _eff[n];
          if (!fx) continue;
          var val = (fx.mp || 0) + (fx.sp || 0) * 1.6 + (fx.tp || 0) * 2.5 +
                    (fx.pp || 0) * 1.5 + (fx.ep || 0) * 1.2 + (fx.hp || 0) * 0.8;
          if (val > bestVal) { bestVal = val; best = n; }
        }
        if (best && bestVal >= 3) return { target: best, val: bestVal };
        return null;
      }
    },
    // Large Convoy + any animal card in tableau (placement target)
    {
      trigger: 'Large Convoy',
      desc: '\uD83D\uDD17 Animals \u2192 ',
      matchFn: function(tableauNames, handSet, ctx) {
        var _tags = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
        var _ratings = typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : {};
        var targets = [];
        for (var i = 0; i < tableauNames.length; i++) {
          var n = tableauNames[i];
          var t = _tags[n];
          if (!t || t.indexOf('animal') < 0) continue;
          var d = _ratings[n];
          // Check if the card has "VP per animal" type effect (animal resource target)
          if (d && d.e && (d.e.toLowerCase().indexOf('animal') >= 0 || d.e.toLowerCase().indexOf('vp per') >= 0)) {
            targets.push(n);
          }
        }
        if (targets.length > 0) return { target: targets[0], val: targets.length };
        return null;
      }
    },
    // Imported Hydrogen + any valid microbe/animal resource holder in tableau
    {
      trigger: 'Imported Hydrogen',
      desc: '\uD83D\uDD17 Place on ',
      matchFn: function(tableauNames, handSet, ctx) {
        var targets = [];
        for (var i = 0; i < tableauNames.length; i++) {
          var n = tableauNames[i];
          if (ANIMAL_TARGETS.has(n) || MICROBE_TARGETS.has(n)) {
            targets.push(n);
          }
        }
        if (targets.length > 0) return { target: targets[0], val: targets.length };
        return null;
      }
    },
    // Imported Nitrogen + any valid animal/microbe resource holder in tableau
    {
      trigger: 'Imported Nitrogen',
      desc: '\uD83D\uDD17 Place on ',
      matchFn: function(tableauNames, handSet, ctx) {
        var targets = [];
        for (var i = 0; i < tableauNames.length; i++) {
          var n = tableauNames[i];
          if (ANIMAL_TARGETS.has(n) || MICROBE_TARGETS.has(n)) {
            targets.push(n);
          }
        }
        if (targets.length > 0) return { target: targets[0], val: targets.length };
        return null;
      }
    },
    // Caretaker Contract with high heat production
    {
      trigger: 'Caretaker Contract',
      desc: '\uD83D\uDD17 CC + heat engine!',
      matchFn: function(tableauNames, handSet, ctx) {
        if (!ctx || !ctx.prod) return null;
        var totalHeat = ctx.prod.heat + ctx.prod.energy; // energy converts to heat
        if (totalHeat >= 6) return { target: 'heat=' + totalHeat, val: totalHeat };
        // Also check if hand has heat prod cards (Soletta, Solar Reflectors, etc.)
        var heatCards = ['Soletta', 'Solar Reflectors', 'Heat Trappers', 'GHG Factories', 'Mohole Area'];
        for (var i = 0; i < heatCards.length; i++) {
          if (handSet.has(heatCards[i])) return { target: heatCards[i], val: 6 };
        }
        return null;
      }
    },
    // Ecological Zone + any green-tag card in hand (animal generation)
    {
      trigger: 'Ecological Zone',
      desc: '\uD83D\uDD17 Green tags \u2192 animals',
      matchFn: function(tableauNames, handSet, ctx) {
        var _tags = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
        var greenCount = 0;
        handSet.forEach(function(n) {
          if (n === 'Ecological Zone') return;
          var t = _tags[n];
          if (t && (t.indexOf('plant') >= 0 || t.indexOf('animal') >= 0 || t.indexOf('microbe') >= 0)) {
            greenCount++;
          }
        });
        if (greenCount >= 2) return { target: greenCount + ' bio tags', val: greenCount };
        return null;
      }
    },
    // Optimal Aerobraking + multiple space events in hand
    {
      trigger: 'Optimal Aerobraking',
      desc: '\uD83D\uDD17 ',
      matchFn: function(tableauNames, handSet, ctx) {
        var _tags = typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : {};
        var spaceEvents = 0;
        handSet.forEach(function(n) {
          if (n === 'Optimal Aerobraking') return;
          var t = _tags[n];
          if (t && t.indexOf('space') >= 0 && t.indexOf('event') >= 0) spaceEvents++;
        });
        if (spaceEvents >= 2) return { target: spaceEvents + ' space events!', val: spaceEvents };
        return null;
      }
    }
  ];

  function detectHandCombos() {
    if (typeof TM_CARD_TAGS === 'undefined') return;

    var handNames = getMyHandNames();
    var tableauNames = getMyTableauNames();
    var handSet = new Set(handNames);
    var ctx = getCachedPlayerContext();

    // Clean up old hand-combo indicators
    document.querySelectorAll('.tm-hand-combo').forEach(function(el) { el.remove(); });

    if (handNames.length === 0) return;

    // Map card name → DOM elements in hand
    var handElMap = {};
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) {
        if (!handElMap[n]) handElMap[n] = [];
        handElMap[n].push(el);
      }
    });

    // Track which cards already got a combo indicator (max 1 per card)
    var comboMarked = new Set();

    // 1. Check dynamic pattern-based combos
    for (var pi = 0; pi < HAND_COMBO_PATTERNS.length; pi++) {
      var pat = HAND_COMBO_PATTERNS[pi];
      if (!handSet.has(pat.trigger)) continue;
      var result = pat.matchFn(tableauNames, handSet, ctx);
      if (!result) continue;

      var desc = pat.desc + (result.target || '');
      var els = handElMap[pat.trigger];
      if (els && !comboMarked.has(pat.trigger)) {
        comboMarked.add(pat.trigger);
        for (var ei = 0; ei < els.length; ei++) {
          _addHandComboIndicator(els[ei], desc);
        }
      }
    }

    // 2. Check static TM_COMBOS for cards that are ALL in hand (hand-only combos)
    //    checkCombos() already handles the outline/highlight; here we add a compact
    //    "🔗" label for hand-only combos that are fully completable from hand
    if (typeof TM_COMBOS !== 'undefined') {
      for (var ci = 0; ci < TM_COMBOS.length; ci++) {
        var combo = TM_COMBOS[ci];
        var inHand = 0, inTableau = 0;
        for (var cj = 0; cj < combo.cards.length; cj++) {
          if (handSet.has(combo.cards[cj])) inHand++;
          else if (tableauNames.indexOf(combo.cards[cj]) >= 0) inTableau++;
        }
        // Only mark "hand combo" if at least 2 pieces are in hand
        if (inHand >= 2 && (inHand + inTableau) >= combo.cards.length) {
          var rLabel = combo.r === 'godmode' ? 'GODMODE' : combo.r === 'great' ? '\u2B50' : '\uD83D\uDD17';
          for (var ck = 0; ck < combo.cards.length; ck++) {
            var cn = combo.cards[ck];
            if (!handSet.has(cn) || comboMarked.has(cn)) continue;
            comboMarked.add(cn);
            var cEls = handElMap[cn];
            if (cEls) {
              var others = combo.cards.filter(function(c) { return c !== cn; }).join(' + ');
              for (var cel = 0; cel < cEls.length; cel++) {
                _addHandComboIndicator(cEls[cel], rLabel + ' ' + others);
              }
            }
          }
        }
      }
    }
  }

  function _addHandComboIndicator(cardEl, text) {
    var existing = cardEl.querySelector('.tm-hand-combo');
    if (existing) {
      // Append second combo on new line
      existing.innerHTML += '<br>' + _escCombo(text);
      return;
    }
    var el = document.createElement('div');
    el.className = 'tm-hand-combo';
    el.innerHTML = _escCombo(text);
    cardEl.style.position = 'relative';
    cardEl.appendChild(el);
  }

  function _escCombo(s) {
    var d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Tier filter ──

  function reapplyFilter() {
    if (TM_CONTENT_BADGES && typeof TM_CONTENT_BADGES.reapplyFilter === 'function') {
      TM_CONTENT_BADGES.reapplyFilter({
        root: document,
        tierFilter: tierFilter
      });
      return;
    }
  }

  // ── Process / Remove ──

  // Dirty-check: skip expensive work if visible cards haven't changed
  var _prevVisibleHash = '';
  var _prevCorpName = '';
  var _processingNow = false; // flag to ignore self-mutations

  function getVisibleCardsHash() {
    // Lightweight: count + first/mid/last names instead of full sort
    var els = document.querySelectorAll('.card-container[data-tm-card]');
    if (els.length === 0) return '0';
    var first = els[0].getAttribute('data-tm-card') || '';
    var mid = els[Math.floor(els.length / 2)].getAttribute('data-tm-card') || '';
    var last = els[els.length - 1].getAttribute('data-tm-card') || '';
    return els.length + ':' + first + ':' + mid + ':' + last;
  }

  // ── Standard Project Rating ──

  var _spLastUpdate = 0;

  function detectSPType(cardEl) {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.detectSPType) {
      return TM_CONTENT_STANDARD_PROJECTS.detectSPType(cardEl);
    }
    var classes = cardEl.className || '';
    var title = (cardEl.querySelector('.card-title') || {}).textContent || '';
    title = title.trim().toLowerCase();

    if (classes.indexOf('sell-patents') !== -1 || title.indexOf('sell') !== -1 || title.indexOf('патент') !== -1) return 'sell';
    if (classes.indexOf('power-plant') !== -1 || (title.indexOf('power') !== -1 && title.indexOf('plant') !== -1) || title.indexOf('электростан') !== -1) return 'power';
    if (classes.indexOf('asteroid-standard') !== -1 || (title.indexOf('asteroid') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('астероид') !== -1) return 'asteroid';
    if (classes.indexOf('aquifer') !== -1 || title.indexOf('aquifer') !== -1 || title.indexOf('океан') !== -1 || title.indexOf('аквифер') !== -1) return 'aquifer';
    if (classes.indexOf('greenery') !== -1 || title.indexOf('greenery') !== -1 || title.indexOf('озеленен') !== -1) return 'greenery';
    if (classes.indexOf('city-standard') !== -1 || (title.indexOf('city') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('город') !== -1) return 'city';
    if (classes.indexOf('air-scrapping') !== -1 || title.indexOf('air scrap') !== -1 || title.indexOf('очистк') !== -1) return 'venus';
    if (classes.indexOf('buffer-gas') !== -1 || title.indexOf('buffer') !== -1 || title.indexOf('буфер') !== -1) return 'buffer';
    if (classes.indexOf('trade') !== -1 || title.indexOf('trade') !== -1 || title.indexOf('торг') !== -1) return 'trade';
    if (classes.indexOf('build-colony') !== -1 || (title.indexOf('colony') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('колон') !== -1) return 'colony';
    if (classes.indexOf('lobby') !== -1 || title.indexOf('lobby') !== -1 || title.indexOf('лобби') !== -1) return 'lobby';
    return null;
  }

  // Check if an SP helps reach a milestone or improve award position
  function checkSPMilestoneAward(spType, pv) {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.checkSPMilestoneAward) {
      return TM_CONTENT_STANDARD_PROJECTS.checkSPMilestoneAward({
        spType: spType,
        pv: pv,
        isGreeneryTile: isGreeneryTile,
        sc: SC
      });
    }
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var g = pv.game;
    var p = pv.thisPlayer;
    if (!g || !p) return { bonus: 0, reasons: [], reasonRows: [] };

    var myColor = p.color;

    // Check milestones (unclaimed, within reach)
    if (g.milestones) {
      var claimedCount = 0;
      for (var mi = 0; mi < g.milestones.length; mi++) {
        if (g.milestones[mi].playerName || g.milestones[mi].player) claimedCount++;
      }
      if (claimedCount < 3) {
        for (var mi = 0; mi < g.milestones.length; mi++) {
          var ms = g.milestones[mi];
          if (ms.playerName || ms.player) continue; // already claimed
          var msName = ms.name;

          // Greenery SP → Gardener (3 greeneries), Forester (3 greeneries)
          if (spType === 'greenery' && (msName === 'Gardener' || msName === 'Forester')) {
            var myGreens = 0;
            if (g.spaces) {
              for (var si = 0; si < g.spaces.length; si++) {
                if (g.spaces[si].color === myColor && (isGreeneryTile(g.spaces[si].tileType))) myGreens++;
              }
            }
            if (myGreens >= 2) { bonus += SC.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ ' + msName + '! (' + myGreens + '/3)', SC.spMilestoneReach); }
            else if (myGreens >= 1) { bonus += SC.spMilestoneClose; pushStructuredReason(reasons, reasonRows, msName + ' ' + myGreens + '/3', SC.spMilestoneClose); }
          }

          // City SP → Mayor (3 cities), Suburbian award
          if (spType === 'city' && msName === 'Mayor') {
            var myCities = p.citiesCount || 0;
            if (myCities >= 2) { bonus += SC.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Mayor! (' + myCities + '/3)', SC.spMilestoneReach); }
            else if (myCities >= 1) { bonus += SC.spMilestoneClose; pushStructuredReason(reasons, reasonRows, 'Mayor ' + myCities + '/3', SC.spMilestoneClose); }
          }

          // Power Plant → Specialist (10 prod), Energizer (6 energy prod)
          if (spType === 'power') {
            if (msName === 'Specialist') {
              var maxProd = Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
              var epAfter = (p.energyProduction || 0) + 1;
              if (epAfter >= 10 && maxProd < 10) { bonus += SC.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Specialist!', SC.spMilestoneReach); }
            }
            if (msName === 'Energizer') {
              var ep = p.energyProduction || 0;
              if (ep + 1 >= 6 && ep < 6) { bonus += SC.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Energizer!', SC.spMilestoneReach); }
              else if (ep >= 4) { bonus += SC.spMilestoneClose; pushStructuredReason(reasons, reasonRows, 'Energizer ' + ep + '/6', SC.spMilestoneClose); }
            }
          }
        }
      }
    }

    // Check awards (funded or fundable)
    if (g.awards) {
      for (var ai = 0; ai < g.awards.length; ai++) {
        var aw = g.awards[ai];
        var isFunded = !!(aw.playerName || aw.color);
        if (!isFunded) continue; // only check funded awards
        if (!aw.scores || aw.scores.length === 0) continue;

        var myScore = 0, bestOpp = 0;
        for (var si = 0; si < aw.scores.length; si++) {
          if (aw.scores[si].color === myColor) myScore = aw.scores[si].score;
          else bestOpp = Math.max(bestOpp, aw.scores[si].score);
        }

        // Greenery → Landscaper, Cultivator
        if (spType === 'greenery' && (aw.name === 'Landscaper' || aw.name === 'Cultivator')) {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardLead; pushStructuredReason(reasons, reasonRows, aw.name + ' ' + myScore + '→' + (myScore + 1), SC.spAwardLead); }
        }
        // City → Suburbian, Urbanist
        if (spType === 'city' && (aw.name === 'Suburbian' || aw.name === 'Urbanist')) {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardLead; pushStructuredReason(reasons, reasonRows, aw.name + ' ' + myScore + '→' + (myScore + 1), SC.spAwardLead); }
        }
        // Aquifer → Landlord (tile count)
        if (spType === 'aquifer' && aw.name === 'Landlord') {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardContrib; pushStructuredReason(reasons, reasonRows, 'Landlord +1', SC.spAwardContrib); }
        }
        // Asteroid/Aquifer/Greenery → Benefactor (TR)
        if ((spType === 'asteroid' || spType === 'aquifer' || spType === 'greenery' || spType === 'venus' || spType === 'buffer') && aw.name === 'Benefactor') {
          if (myScore >= bestOpp - 2) { bonus += SC.spAwardContrib; pushStructuredReason(reasons, reasonRows, 'Benefactor TR+1', SC.spAwardContrib); }
        }
        // Power Plant → Industrialist (steel+energy), Electrician
        if (spType === 'power' && (aw.name === 'Industrialist' || aw.name === 'Electrician')) {
          if (myScore >= bestOpp - 1) { bonus += SC.spAwardContrib; pushStructuredReason(reasons, reasonRows, aw.name + ' +1', SC.spAwardContrib); }
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  function isPreludeOrCorpCard(cardEl) {
    if (!cardEl) return false;
    var detectedName = getCardName(cardEl);
    return !!(
      cardEl.closest('.wf-component--select-prelude') ||
      cardEl.classList.contains('prelude-card') ||
      isPreludeOrCorpName(detectedName) ||
      !!cardEl.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
      !!cardEl.closest('.select-corporation') ||
      !!cardEl.closest('[class*="corporation"]')
    );
  }

  // Universal MA value computation — accepts any player object
  function computeMAValueForPlayer(ma, player, pv) {
    if (!player) return 0;
    var p = player;
    var pColor = p.color;
    switch (ma.check) {
      case 'tr': return p.terraformRating || 0;
      case 'cities': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && (isCityTile(sp.tileType))) c++;
          }
        }
        return c;
      }
      case 'greeneries': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && isGreeneryTile(sp.tileType)) c++;
          }
        }
        return c;
      }
      case 'tags': {
        return ma.tag ? getPlayerTagCount(p, ma.tag) : 0;
      }
      case 'hand': return p.cardsInHandNbr || (p.cardsInHand ? p.cardsInHand.length : 0);
      case 'tableau': return p.tableau ? p.tableau.length : 0;
      case 'events': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = cardN(p.tableau[i]);
            var d = TM_RATINGS[cn];
            if (d && d.t === 'event') c++;
          }
        }
        return c;
      }
      case 'uniqueTags': {
        var c = 0;
        forEachPlayerTag(p.tags, function() { c++; });
        return c;
      }
      case 'prod': {
        if (ma.resource) {
          var rn = ma.resource === 'megacredits' ? 'megaCreditProduction' : ma.resource + 'Production';
          return p[rn] || 0;
        }
        return 0;
      }
      case 'maxProd':
        return Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
      case 'generalist': {
        var c = 0;
        if ((p.megaCreditProduction || 0) > 0) c++;
        if ((p.steelProduction || 0) > 0) c++;
        if ((p.titaniumProduction || 0) > 0) c++;
        if ((p.plantProduction || 0) > 0) c++;
        if ((p.energyProduction || 0) > 0) c++;
        if ((p.heatProduction || 0) > 0) c++;
        return c;
      }
      case 'bioTags': {
        var b = 0;
        forEachPlayerTag(p.tags, function(tagName, count) {
          if (tagName === 'plant' || tagName === 'microbe' || tagName === 'animal') b += count;
        });
        return b;
      }
      case 'maxTag': {
        var mx = 0;
        forEachPlayerTag(p.tags, function(tagName, count) {
          if (tagName !== 'earth' && tagName !== 'event' && count > mx) mx = count;
        });
        return mx;
      }
      case 'manager': {
        var c = 0;
        if ((p.megaCreditProduction || 0) >= 2) c++;
        if ((p.steelProduction || 0) >= 2) c++;
        if ((p.titaniumProduction || 0) >= 2) c++;
        if ((p.plantProduction || 0) >= 2) c++;
        if ((p.energyProduction || 0) >= 2) c++;
        if ((p.heatProduction || 0) >= 2) c++;
        return c;
      }
      case 'reqCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = cardN(p.tableau[i]);
            var fx = getFx(cn);
            if (fx && fx.req) c++;
          }
        }
        return c;
      }
      case 'tiles': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            if (pv.game.spaces[i].color === pColor && pv.game.spaces[i].tileType != null) c++;
          }
        }
        return c;
      }
      case 'resource': return p[ma.resource] || 0;
      case 'steelTi': return (p.steel || 0) + (p.titanium || 0);
      case 'steelEnergy': return (p.steel || 0) + (p.energy || 0);
      case 'greenCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = cardN(p.tableau[i]);
            var d = TM_RATINGS[cn];
            if (d && d.t === 'green') c++;
          }
        }
        return c;
      }
      case 'expensiveCards': {
        var c = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            var cn = cardN(p.tableau[i]);
            var fx = getFx(cn);
            if (fx && fx.c >= 20) c++;
          }
        }
        return c;
      }
      case 'cardResources': {
        var t = 0;
        if (p.tableau) {
          for (var i = 0; i < p.tableau.length; i++) {
            if (p.tableau[i].resources) t += p.tableau[i].resources;
          }
        }
        return t;
      }
      case 'polar': {
        var c = 0;
        if (pv && pv.game && pv.game.spaces) {
          for (var i = 0; i < pv.game.spaces.length; i++) {
            var sp = pv.game.spaces[i];
            if (sp.color === pColor && sp.tileType != null && sp.y >= 7) c++;
          }
        }
        return c;
      }
      default: return 0;
    }
  }

  function _maPos(fx, key) {
    return fx && fx[key] && fx[key] > 0 ? fx[key] : 0;
  }

  function _maTagContrib(tagSpec, cardTags, isEvent) {
    if (!tagSpec || !cardTags) return 0;
    var wanted = String(tagSpec).toLowerCase().split('+');
    var count = 0;
    for (var i = 0; i < wanted.length; i++) {
      var tg = wanted[i];
      if (!tg) continue;
      if (tg === 'event') {
        if (isEvent) count++;
        continue;
      }
      if (isEvent) continue;
      if (cardTags.has(tg)) count++;
    }
    return count;
  }

  function _maProdContrib(resourceSpec, fx, eLow) {
    var prodMap = {
      megacredits: 'mp',
      steel: 'sp',
      titanium: 'tp',
      plants: 'pp',
      energy: 'ep',
      heat: 'hp',
    };
    if (!fx) fx = {};
    if (resourceSpec && resourceSpec.indexOf('+') >= 0) {
      var parts = resourceSpec.split('+');
      var sum = 0;
      for (var i = 0; i < parts.length; i++) {
        var key = prodMap[parts[i]];
        if (key) sum += _maPos(fx, key);
      }
      return sum;
    }
    if (resourceSpec && prodMap[resourceSpec]) return _maPos(fx, prodMap[resourceSpec]);
    return _maPos(fx, 'mp') + _maPos(fx, 'sp') + _maPos(fx, 'tp') + _maPos(fx, 'pp') + _maPos(fx, 'ep') + _maPos(fx, 'hp') + (eLow.includes('prod') ? 1 : 0);
  }

  function _maResourceGrowth(resourceSpec, fx, ctx) {
    var stockMap = {
      megacredits: 'm',
      steel: 'st',
      titanium: 'ti',
      plants: 'p',
      energy: 'e',
      heat: 'h',
    };
    var prodMap = {
      megacredits: 'mp',
      steel: 'sp',
      titanium: 'tp',
      plants: 'pp',
      energy: 'ep',
      heat: 'hp',
    };
    var horizon = Math.max(1, Math.min((ctx && ctx.gensLeft) || 3, 2));
    var calcOne = function(res) {
      if (!res) return 0;
      if (res === 'animal' || res === 'microbe' || res === 'floater') {
        if (_maPos(fx, 'placesN') > 0 && (((fx && fx.placesTag) || '') === res || ((fx && fx.res) || '') === res)) return _maPos(fx, 'placesN');
        return 0;
      }
      return _maPos(fx, stockMap[res]) + (_maPos(fx, prodMap[res]) * horizon);
    };
    if (!resourceSpec) return 0;
    if (resourceSpec.indexOf('+') >= 0) {
      var parts = resourceSpec.split('+');
      var sum = 0;
      for (var i = 0; i < parts.length; i++) sum += calcOne(parts[i]);
      return sum;
    }
    return calcOne(resourceSpec);
  }

  function estimateCardMAContribution(cardName, ma, cardTags, cardType, data, ctx) {
    if (!ma) return 0;
    var fx = getFx(cardName) || {};
    var eLow = data && data.e ? data.e.toLowerCase() : '';
    var isEvent = cardType === 'red' || (cardTags && cardTags.has && cardTags.has('event'));
    var cityCount = (cardTags && cardTags.has && cardTags.has('city')) || eLow.includes('city') || eLow.includes('город') ? 1 : 0;
    var greeneryCount = Math.max(_maPos(fx, 'grn'), (eLow.includes('greenery') || eLow.includes('озелен')) ? 1 : 0);
    var oceanCount = _maPos(fx, 'oc');
    var tileCount = cityCount + greeneryCount + oceanCount;
    switch (ma.check) {
      case 'tags':
        return _maTagContrib(ma.tag, cardTags, isEvent);
      case 'bioTags':
        if (isEvent || !cardTags) return 0;
        return (cardTags.has('plant') ? 1 : 0) + (cardTags.has('microbe') ? 1 : 0) + (cardTags.has('animal') ? 1 : 0);
      case 'cities':
        return cityCount;
      case 'greeneries':
        return greeneryCount;
      case 'tiles':
      case 'desertTiles':
      case 'oceanAdjacency':
      case 'nonOceanAdjTiles':
      case 'specialAdjacency':
        return tileCount > 0 ? tileCount : 0;
      case 'events':
        return isEvent ? 1 : 0;
      case 'tr': {
        var trGain = _maPos(fx, 'tr') + _maPos(fx, 'tmp') + _maPos(fx, 'o2') + _maPos(fx, 'oc') + _maPos(fx, 'vn') + greeneryCount;
        if (!trGain && (eLow.includes('terraform') || /\btr\b/.test(eLow))) trGain = 1;
        return trGain;
      }
      case 'prod':
        return _maProdContrib(ma.resource || '', fx, eLow);
      case 'resource':
        return _maResourceGrowth(ma.resource || '', fx, ctx);
      case 'steelTi':
        return _maResourceGrowth('steel+titanium', fx, ctx);
      case 'steelEnergy':
        return _maResourceGrowth('steel+energy', fx, ctx);
      case 'cardResources':
        return _maPos(fx, 'placesN');
      case 'greenCards':
        return cardType === 'green' ? 1 : 0;
      case 'blueCards':
        return cardType === 'blue' ? 1 : 0;
      case 'tableau':
        return isEvent ? 0 : 1;
      case 'expensiveCards':
        return fx.c != null && fx.c >= 20 ? 1 : 0;
      case 'colonies':
        return (eLow.includes('colony') || eLow.includes('колон')) ? 1 : 0;
      case 'coloniesCities':
        return cityCount + ((eLow.includes('colony') || eLow.includes('колон')) ? 1 : 0);
      case 'reqCards': {
        var hasReq = (typeof TM_CARD_GLOBAL_REQS !== 'undefined' && _lookupCardData(TM_CARD_GLOBAL_REQS, cardName)) ||
          (typeof TM_CARD_TAG_REQS !== 'undefined' && _lookupCardData(TM_CARD_TAG_REQS, cardName));
        return hasReq ? 1 : 0;
      }
      case 'generalist': {
        var prodKinds = [
          { fx: 'mp', ctx: 'mc' }, { fx: 'sp', ctx: 'steel' }, { fx: 'tp', ctx: 'ti' },
          { fx: 'pp', ctx: 'plants' }, { fx: 'ep', ctx: 'energy' }, { fx: 'hp', ctx: 'heat' },
        ];
        var count = 0;
        var fallback = 0;
        for (var gi = 0; gi < prodKinds.length; gi++) {
          if (_maPos(fx, prodKinds[gi].fx) <= 0) continue;
          fallback++;
          if (ctx && ctx.prod && !ctx.prod[prodKinds[gi].ctx]) count++;
        }
        return count || fallback;
      }
      case 'maxProd':
        return Math.max(_maPos(fx, 'mp'), _maPos(fx, 'sp'), _maPos(fx, 'tp'), _maPos(fx, 'pp'), _maPos(fx, 'ep'), _maPos(fx, 'hp'));
      case 'prodTypes': {
        var prodTypes = 0;
        if (_maPos(fx, 'sp') > 0) prodTypes++;
        if (_maPos(fx, 'tp') > 0) prodTypes++;
        if (_maPos(fx, 'pp') > 0) prodTypes++;
        if (_maPos(fx, 'ep') > 0) prodTypes++;
        if (_maPos(fx, 'hp') > 0) prodTypes++;
        if (_maPos(fx, 'mp') > 0) prodTypes++;
        return prodTypes;
      }
      case 'nonMcProd':
        return _maPos(fx, 'sp') + _maPos(fx, 'tp') + _maPos(fx, 'pp') + _maPos(fx, 'ep') + _maPos(fx, 'hp');
      case 'vpCards':
        return (_maPos(fx, 'vp') > 0 || _maPos(fx, 'vpAcc') > 0) ? 1 : 0;
      case 'cheapCards':
        return fx.c != null && fx.c <= 10 && !isEvent ? 1 : 0;
      case 'noTagCards':
        return cardTags && cardTags.size === 0 ? 1 : 0;
      default:
        return 0;
    }
  }

  function estimateMilestoneSwingBonus(msName, need, selfContrib, otherContrib, ctx) {
    if (need == null || selfContrib <= 0) return { bonus: 0, label: '' };
    var cashReady = !ctx || (ctx.mc || 0) >= 8;
    if (selfContrib >= need) return { bonus: Math.max(1, SC.milestoneClaimNow - (cashReady ? 0 : 1)), label: '→ ' + msName + (cashReady ? '!' : ' soon') };
    if ((selfContrib + Math.max(0, otherContrib || 0)) >= need) return { bonus: Math.max(1, SC.milestoneClaimHand - (cashReady ? 0 : 1)), label: '→ ' + msName + ' w/hand' };
    return { bonus: 0, label: '' };
  }

  function estimateAwardRaceBonus(awName, race, contrib, ctx) {
    if (!race || contrib <= 0) return { bonus: 0, label: '' };
    var gap = typeof race.gap === 'number' ? race.gap : Math.max(0, (race.bestOpp || 0) - (race.myScore || 0));
    if (gap > 0) {
      if (contrib > gap) return { bonus: SC.awardSwingLead, label: awName + ' flip' };
      if (contrib === gap) return { bonus: SC.awardSwingTie, label: awName + ' tie' };
      if ((gap - contrib) === 1) return { bonus: SC.awardSwingClose, label: awName + ' close' };
      return { bonus: 0, label: '' };
    }
    var lead = typeof race.delta === 'number' ? race.delta : ((race.myScore || 0) - (race.bestOpp || 0));
    if (lead <= 1) return { bonus: SC.awardDefendTight, label: awName + ' defend' };
    if (lead <= 3 && contrib >= 2) return { bonus: SC.awardDefendWide, label: awName + ' pad' };
    return { bonus: 0, label: '' };
  }

  function findMatchingMAEntry(entries, maName) {
    if (!entries || !maName) return null;
    var maLower = String(maName).toLowerCase();
    for (var i = 0; i < entries.length; i++) {
      var entryName = String(entries[i].name || '').toLowerCase();
      if (!entryName) continue;
      if (entryName === maLower || entryName.indexOf(maLower) >= 0 || maLower.indexOf(entryName) >= 0) {
        return entries[i];
      }
    }
    return null;
  }

  function scorePlayPriorityMA(cardName, data, cardTags, cardType, ctx, pv) {
    var bonus = 0;
    var reasons = [];
    if (!ctx || !pv || !pv.game || !ctx.activeMA || ctx.activeMA.length === 0) return { bonus: bonus, reasons: reasons };

    var milestones = pv.game.milestones || [];
    var awards = pv.game.awards || [];
    var claimedCount = 0;
    for (var ci = 0; ci < milestones.length; ci++) {
      var cMs = milestones[ci];
      if (cMs.playerName || cMs.playerColor || cMs.owner_name || cMs.owner_color || cMs.color || cMs.player) claimedCount++;
    }

    for (var i = 0; i < ctx.activeMA.length; i++) {
      var ma = ctx.activeMA[i];
      var contrib = estimateCardMAContribution(cardName, ma, cardTags, cardType, data, ctx);
      if (contrib <= 0) continue;

      if (ma.type === 'milestone') {
        if (claimedCount >= 3) continue;
        var msEntry = findMatchingMAEntry(milestones, ma.name);
        if (msEntry && (msEntry.playerName || msEntry.playerColor || msEntry.owner_name || msEntry.owner_color || msEntry.color || msEntry.player)) continue;
        var need = (ma.target || 0) - (ma.current || 0);
        if (need <= 0) continue;
        var msSwing = estimateMilestoneSwingBonus(ma.name, need, contrib, 0, ctx);
        if (msSwing.bonus > 0) {
          bonus += msSwing.bonus;
          if (reasons.length < 2) reasons.push(msSwing.label);
        } else if (need <= 2) {
          var nearBonus = Math.min(2, Math.max(1, contrib));
          bonus += nearBonus;
          if (reasons.length < 2) reasons.push(ma.name + ' near');
        }
      } else if (ma.type === 'award') {
        var awEntry = findMatchingMAEntry(awards, ma.name);
        if (!awEntry) continue;
        var race = ctx.awardRacing ? ctx.awardRacing[ma.name] : null;
        if (!race) continue;
        var awSwing = estimateAwardRaceBonus(ma.name, race, contrib, ctx);
        if (awSwing.bonus > 0) {
          bonus += awSwing.bonus;
          if (reasons.length < 2) reasons.push(awSwing.label);
        } else {
          var isFunded = !!(awEntry.playerName || awEntry.playerColor || awEntry.funder_name || awEntry.funder_color);
          if (!isFunded && ctx.gensLeft <= 2 && race.leading) {
            var pressureBonus = Math.min(2, Math.max(1, contrib));
            bonus += pressureBonus;
            if (reasons.length < 2) reasons.push(ma.name + ' pressure');
          }
        }
      }
    }

    if (bonus > 8) bonus = 8;
    return { bonus: bonus, reasons: reasons };
  }

  // Helper: count delegates for a player across all turmoil parties
  function countMyDelegates(g, playerColor) {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.countMyDelegates) {
      return TM_CONTENT_STANDARD_PROJECTS.countMyDelegates(g, playerColor);
    }
    var count = 0;
    if (g.turmoil && g.turmoil.parties) {
      for (var i = 0; i < g.turmoil.parties.length; i++) {
        var party = g.turmoil.parties[i];
        if (party.delegates) {
          for (var j = 0; j < party.delegates.length; j++) {
            var d = party.delegates[j];
            if ((d.color || d) === playerColor) count += (d.number || 1);
          }
        }
      }
    }
    return count;
  }

  function rateStandardProjects() {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.rateStandardProjects) {
      TM_CONTENT_STANDARD_PROJECTS.rateStandardProjects({
        documentObj: document,
        dateNow: Date.now,
        getPlayerVueData: getPlayerVueData,
        detectMyCorp: detectMyCorp,
        estimateGensLeft: estimateGensLeft,
        ftnRow: ftnRow,
        isGreeneryTile: isGreeneryTile,
        getLastPriorityMap: getLastPriorityMap,
        mergeReasonRows: mergeReasonRows,
        setReasonPayload: setReasonPayload,
        showTooltip: showTooltip,
        hideTooltip: hideTooltip,
        scoreToTier: scoreToTier,
        sc: SC
      });
      return;
    }
    var now = Date.now();
    if (now - _spLastUpdate < 2000) return;

    var spCards = document.querySelectorAll('.card-standard-project');
    if (spCards.length === 0) return;

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.game) return;

    var p = pv.thisPlayer;
    var g = pv.game;
    var mc = p.megaCredits || 0;
    var heat = p.heat || 0;
    var steel = p.steel || 0;
    var stVal = p.steelValue || SC.defaultSteelVal;
    var gen = g.generation || 1;
    var gensLeft = estimateGensLeft(pv);
    var myCorp = detectMyCorp();
    var isHelion = myCorp === 'Helion';
    var spBudget = mc + (isHelion ? heat : 0); // Helion can use heat as MC

    var raises = globalParamRaises(g);

    var gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0];
    var prodVal = row[1];
    var vpVal = row[2];

    var coloniesOwned = p.coloniesCount || 0;
    var fleetSize = p.fleetSize || 1;
    var tradesThisGen = p.tradesThisGeneration || 0;
    var tradesLeft = fleetSize - tradesThisGen;

    _spLastUpdate = now;

    spCards.forEach(function(cardEl) {
      var old = cardEl.querySelector('.tm-sp-badge');
      if (old) old.remove();

      var spType = detectSPType(cardEl);
      if (!spType) return;

      var label = '';
      var cls = 'tm-sp-bad';
      var net = 0;
      var canAfford = false;
      var badgeReasonRows = [];
      function addBadgeReason(text, tone, value) {
        if (!text) return;
        var row = { text: text, tone: tone || 'positive' };
        if (typeof value === 'number' && isFinite(value)) row.value = value;
        badgeReasonRows.push(row);
      }

      // Check milestone/award bonuses
      var maBonus = checkSPMilestoneAward(spType, pv);

      if (spType === 'sell') {
        label = '1 MC/карта';
        cls = 'tm-sp-ok';
        addBadgeReason('Продажа патента: +1 MC за карту', 'positive', 1);
      }
      else if (spType === 'power') {
        var powerCost = (myCorp === 'Thorgate') ? SC.thorgatePowerCost : SC.spCosts.power;
        var epValue = Math.round(prodVal * 1.5);
        net = epValue - powerCost;
        canAfford = spBudget >= powerCost;
        if (gensLeft <= 2) { label = 'Поздно'; cls = 'tm-sp-bad'; addBadgeReason('Поздно для Power Plant', 'negative'); }
        else {
          net += maBonus.bonus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -4 ? 'tm-sp-ok' : 'tm-sp-bad';
          addBadgeReason('Power Plant: прод ' + epValue + ' − ' + powerCost, net >= 0 ? 'positive' : 'negative', net);
        }
      }
      else if (spType === 'asteroid') {
        if (g.temperature != null && g.temperature >= SC.tempMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
          addBadgeReason('Температура уже закрыта', 'negative');
        } else {
          net = Math.round(trVal) - SC.spCosts.asteroid + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.asteroid;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          addBadgeReason('Asteroid: TR ' + Math.round(trVal) + ' − ' + SC.spCosts.asteroid, net >= 0 ? 'positive' : 'negative', net);
        }
      }
      else if (spType === 'aquifer') {
        if (g.oceans != null && g.oceans >= SC.oceansMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
          addBadgeReason('Океаны уже закрыты', 'negative');
        } else {
          net = Math.round(trVal + 2) - SC.spCosts.aquifer + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.aquifer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          addBadgeReason('Aquifer: TR+бонус ' + Math.round(trVal + 2) + ' − ' + SC.spCosts.aquifer, net >= 0 ? 'positive' : 'negative', net);
        }
      }
      else if (spType === 'greenery') {
        var sd = steelDiscount(SC.spCosts.greenery, steel, stVal);
        var o2open = g.oxygenLevel != null && g.oxygenLevel < SC.oxyMax;
        var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
        net = grEV - sd.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= SC.spCosts.greenery;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (sd.disc > 0) label += ' (⚒−' + sd.disc + ')';
        if (!o2open) label += ' VP';
        cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        addBadgeReason('Greenery: VP+TR ' + grEV + ' − ' + sd.eff + (sd.disc > 0 ? ' (сталь −' + sd.disc + ')' : ''), net >= 0 ? 'positive' : 'negative', net);
      }
      else if (spType === 'city') {
        var sd = steelDiscount(SC.spCosts.city, steel, stVal);
        var cityEV = Math.round(vpVal * 2 + 3);
        net = cityEV - sd.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= SC.spCosts.city;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (sd.disc > 0) label += ' (⚒−' + sd.disc + ')';
        cls = net >= 0 ? 'tm-sp-good' : net >= -6 ? 'tm-sp-ok' : 'tm-sp-bad';
        addBadgeReason('City: VP+прод ' + cityEV + ' − ' + sd.eff + (sd.disc > 0 ? ' (сталь −' + sd.disc + ')' : ''), net >= 0 ? 'positive' : 'negative', net);
      }
      else if (spType === 'venus') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= SC.venusMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
          addBadgeReason('Venus уже закрыта', 'negative');
        } else {
          net = Math.round(trVal) - SC.spCosts.venus + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.venus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          addBadgeReason('Venus: TR ' + Math.round(trVal) + ' − ' + SC.spCosts.venus, net >= 0 ? 'positive' : 'negative', net);
        }
      }
      else if (spType === 'buffer') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= SC.venusMax) {
          label = 'Закрыто'; cls = 'tm-sp-closed';
          addBadgeReason('Venus уже закрыта', 'negative');
        } else {
          net = Math.round(trVal) - SC.spCosts.buffer + maBonus.bonus;
          canAfford = spBudget >= SC.spCosts.buffer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : 'tm-sp-ok';
          addBadgeReason('Buffer Gas: TR ' + Math.round(trVal) + ' − ' + SC.spCosts.buffer, net >= 0 ? 'positive' : 'negative', net);
        }
      }
      else if (spType === 'trade') {
        if (tradesLeft > 0 && coloniesOwned > 0) {
          label = tradesLeft + ' trade, ' + coloniesOwned + ' кол.';
          cls = 'tm-sp-good';
          addBadgeReason('Trade: ' + tradesLeft + ' trade, ' + coloniesOwned + ' кол.', 'positive');
        } else if (tradesLeft > 0) {
          label = tradesLeft + ' trade';
          cls = 'tm-sp-ok';
          addBadgeReason('Trade без своих колоний', 'negative');
        } else {
          label = 'Нет trade'; cls = 'tm-sp-bad';
          addBadgeReason('Нет доступных trade', 'negative');
        }
      }
      else if (spType === 'colony') {
        if (coloniesOwned < 3) {
          label = (coloniesOwned + 1) + '-я кол.';
          cls = coloniesOwned === 0 ? 'tm-sp-good' : 'tm-sp-ok';
          addBadgeReason('Build Colony: будет ' + (coloniesOwned + 1) + '-я колония', coloniesOwned === 0 ? 'positive' : 'positive');
        } else {
          label = 'Макс. колоний'; cls = 'tm-sp-bad';
          addBadgeReason('Достигнут максимум колоний', 'negative');
        }
      }
      else if (spType === 'lobby') {
        var myDel = countMyDelegates(g, p.color || '');
        label = myDel + ' дел.';
        cls = myDel < 3 ? 'tm-sp-good' : myDel < 5 ? 'tm-sp-ok' : 'tm-sp-bad';
        addBadgeReason('Лобби: ' + myDel + ' делегатов сейчас', myDel < 5 ? 'positive' : 'negative');
      }

      // Append milestone/award reason to badge
      if (maBonus.reasons.length > 0) {
        label += ' ' + maBonus.reasons[0];
        if (maBonus.bonus >= 5) cls = 'tm-sp-good'; // milestone grab = always highlight
      }
      if (maBonus.reasonRows && maBonus.reasonRows.length > 0) {
        badgeReasonRows = mergeReasonRows(badgeReasonRows, maBonus.reasonRows);
      } else if (maBonus.reasons && maBonus.reasons.length > 0) {
        badgeReasonRows = mergeReasonRows(badgeReasonRows, maBonus.reasons.map(function(text) {
          return { text: text, tone: 'positive' };
        }));
      }

      if (!label) return;

      var badge = document.createElement('div');
      badge.className = 'tm-sp-badge ' + cls;
      badge.textContent = label;
      cardEl.style.position = 'relative';
      cardEl.appendChild(badge);
      if (badgeReasonRows.length > 0) {
        setReasonPayload(badge, { reasonRows: badgeReasonRows });
        setReasonPayload(cardEl, { reasonRows: badgeReasonRows });
      }

      // Store net EV on the badge element for SP-vs-hand comparison
      if (typeof net === 'number' && canAfford) {
        badge.setAttribute('data-sp-net', net);
        badge.setAttribute('data-sp-type', spType);
      }
    });

    // ── SP vs Hand comparison: mark best SP when it beats best playable hand card ──
    _annotateSPvsHand(spCards);
  }

  // Find best playable hand card net MC value and compare with each affordable SP
  function _annotateSPvsHand(spCards) {
    // Remove old markers
    document.querySelectorAll('.tm-sp-vs-hand').forEach(function(el) { el.remove(); });

    // Find best hand card net EV from priority map (only playable, affordable cards)
    var bestHandNet = -Infinity;
    var bestHandName = '';
    for (var cardName in _lastPriorityMap) {
      var info = _lastPriorityMap[cardName];
      if (info.type !== 'play') continue; // skip standard actions, blue actions
      if (info.unplayable) continue;
      if (!info.affordable) continue;
      var netVal = info.mcValue || 0;
      if (netVal > bestHandNet) {
        bestHandNet = netVal;
        bestHandName = cardName;
      }
    }

    // No playable hand cards — nothing to compare
    if (bestHandNet === -Infinity) return;

    // Check each SP badge — if SP net > best hand net, add marker
    spCards.forEach(function(cardEl) {
      var badge = cardEl.querySelector('.tm-sp-badge');
      if (!badge) return;
      var spNetStr = badge.getAttribute('data-sp-net');
      if (spNetStr === null) return;
      var spNet = parseFloat(spNetStr);
      var spType = badge.getAttribute('data-sp-type') || '';

      // SP beats best hand card by at least 1 MC
      if (spNet > bestHandNet + 1) {
        var marker = document.createElement('div');
        marker.className = 'tm-sp-vs-hand';
        var shortHand = bestHandName.length > 14 ? bestHandName.substring(0, 12) + '..' : bestHandName;
        marker.textContent = '\uD83C\uDFAF SP ' + (spNet >= 0 ? '+' : '') + spNet +
          ' > ' + shortHand + ' ' + (bestHandNet >= 0 ? '+' : '') + bestHandNet;
        marker.title = 'Стандартный проект выгоднее лучшей карты в руке (' + bestHandName + ')';
        cardEl.appendChild(marker);
      }
    });
  }

  // ── Steel discount helper ──
  function steelDiscount(baseCost, steel, stVal) {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.steelDiscount) {
      return TM_CONTENT_STANDARD_PROJECTS.steelDiscount(baseCost, steel, stVal);
    }
    var disc = Math.min(steel, Math.floor(baseCost / stVal)) * stVal;
    return { eff: baseCost - disc, disc: disc };
  }

  // ── Best SP / Delegate score (pure data, no DOM) ──

  var SP_NAMES = { power: 'Электростанция', asteroid: 'Астероид', aquifer: 'Океан', greenery: 'Озеленение', city: 'Город', venus: 'Очистка', buffer: 'Буфер', lobby: 'Лобби' };

  function spScore(type, net) {
    return Math.round(Math.min(SC.spScoreMax, Math.max(SC.spScoreMin, SC.spBases[type] + net * SC.spScales[type])));
  }

  var SP_ICONS = { power: '⚡', asteroid: '🌡', aquifer: '🌊', greenery: '🌿', city: '🏙', venus: '♀', buffer: '♀B', lobby: '🏛' };

  function computeAllSP(pv, gensLeft, myCorp) {
    if (TM_CONTENT_STANDARD_PROJECTS && TM_CONTENT_STANDARD_PROJECTS.computeAllSP) {
      return TM_CONTENT_STANDARD_PROJECTS.computeAllSP({
        pv: pv,
        gensLeft: gensLeft,
        myCorp: myCorp,
        ftnRow: ftnRow,
        isGreeneryTile: isGreeneryTile,
        sc: SC
      });
    }
    if (!pv || !pv.thisPlayer || !pv.game) return null;

    var p = pv.thisPlayer;
    var g = pv.game;
    var steel = p.steel || 0;
    var stVal = p.steelValue || SC.defaultSteelVal;
    var gl = Math.max(0, Math.min(SC.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0], prodVal = row[1], vpVal = row[2];

    var all = [];
    var best = null;
    function consider(type, net, detail) {
      var ma = checkSPMilestoneAward(type, pv);
      net += ma.bonus;
      var adjS = spScore(type, net);
      var detailText = detail || '';
      var reasonRows = [];
      if (detailText) {
        reasonRows.push({ text: detailText, tone: net >= 0 ? 'positive' : 'negative', value: net });
      }
      if (ma.bonus) {
        detailText += (detailText ? ', ' : '') + 'веха/нагр +' + ma.bonus;
      }
      if (ma.reasonRows && ma.reasonRows.length > 0) {
        reasonRows = mergeReasonRows(reasonRows, ma.reasonRows);
      }
      var entry = { type: type, name: SP_NAMES[type], icon: SP_ICONS[type], cost: SC.spCosts[type], adj: adjS, net: net, detail: detailText, reasons: reasonRows.map(reasonTextPayload), reasonRows: reasonRows };
      all.push(entry);
      if (!best || adjS > best.score) best = { name: SP_NAMES[type], net: net, score: adjS };
    }

    // Power Plant: 11 MC → +1 energy prod (Thorgate: 8 MC)
    if (gensLeft > 2) {
      var pwCost = (myCorp === 'Thorgate') ? SC.thorgatePowerCost : SC.spCosts.power;
      var pwVal = Math.round(prodVal * 1.5);
      var pwNet = pwVal - pwCost;
      consider('power', pwNet, 'прод ' + pwVal + ' − ' + pwCost);
    }

    // Asteroid: 14 MC → +1 TR (temp)
    if (g.temperature == null || g.temperature < SC.tempMax) {
      consider('asteroid', Math.round(trVal) - SC.spCosts.asteroid, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.asteroid);
    }

    // Aquifer: 18 MC → +1 TR + ocean
    if (g.oceans == null || g.oceans < SC.oceansMax) {
      var aqVal = Math.round(trVal + 2);
      consider('aquifer', aqVal - SC.spCosts.aquifer, 'TR+бонус ' + aqVal + ' − ' + SC.spCosts.aquifer);
    }

    // Greenery: 23 MC → VP + TR
    {
      var grSD = steelDiscount(SC.spCosts.greenery, steel, stVal);
      var o2open = g.oxygenLevel == null || g.oxygenLevel < SC.oxyMax;
      var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
      var grDetail = 'VP+TR ' + grEV + ' − ' + grSD.eff;
      if (grSD.disc > 0) grDetail += ' (сталь −' + grSD.disc + ')';
      consider('greenery', grEV - grSD.eff, grDetail);
    }

    // City: 25 MC → VP + MC-prod
    {
      var ciSD = steelDiscount(SC.spCosts.city, steel, stVal);
      var ciEV = Math.round(vpVal * 2 + 3);
      var ciDetail = 'VP+прод ' + ciEV + ' − ' + ciSD.eff;
      if (ciSD.disc > 0) ciDetail += ' (сталь −' + ciSD.disc + ')';
      consider('city', ciEV - ciSD.eff, ciDetail);
    }

    // Venus: 15 MC → +1 TR
    if (g.venusScaleLevel == null || g.venusScaleLevel < SC.venusMax) {
      consider('venus', Math.round(trVal) - SC.spCosts.venus, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.venus);
    }

    // Buffer Gas: 7 MC → +1 TR
    if (g.venusScaleLevel == null || g.venusScaleLevel < SC.venusMax) {
      consider('buffer', Math.round(trVal) - SC.spCosts.buffer, 'TR ' + Math.round(trVal) + ' − ' + SC.spCosts.buffer);
    }

    // Lobby: 5 MC → delegate
    if (g.turmoil) {
      var myDel = countMyDelegates(g, p.color || '');
      var delBonus = myDel < 3 ? 5 : myDel < 5 ? 3 : 1;
      consider('lobby', delBonus, 'влияние +' + delBonus);
    }

    // Sort by adjusted score descending
    all.sort(function(a, b) { return b.adj - a.adj; });

    return { all: all, best: best };
  }

  // Backward-compatible wrapper
  function processAll() {
    if (TM_CONTENT_CYCLE && TM_CONTENT_CYCLE.processAll) {
      TM_CONTENT_CYCLE.processAll({
        enabled: enabled,
        isProcessingNow: _processingNow,
        setProcessingNow: function(v) { _processingNow = v; },
        debugMode: debugMode,
        performanceObj: typeof performance !== 'undefined' ? performance : null,
        windowObj: window,
        documentObj: document,
        injectBadge: injectBadge,
        getVisibleCardsHash: getVisibleCardsHash,
        detectMyCorp: detectMyCorp,
        prevVisibleHash: _prevVisibleHash,
        prevCorpName: _prevCorpName,
        setPrevVisibleHash: function(v) { _prevVisibleHash = v; },
        setPrevCorpName: function(v) { _prevCorpName = v; },
        checkCombos: checkCombos,
        detectHandCombos: detectHandCombos,
        highlightCorpSynergies: highlightCorpSynergies,
        updateDraftRecommendations: updateDraftRecommendations,
        updateHandScores: updateHandScores,
        checkPreludePackage: checkPreludePackage,
        injectDiscardHints: injectDiscardHints,
        injectPlayPriorityBadges: injectPlayPriorityBadges,
        trackDraftHistory: trackDraftHistory,
        rateStandardProjects: rateStandardProjects,
        enhanceGameLog: enhanceGameLog,
        highlightPlayable: highlightPlayable,
        tmLog: tmLog,
        setLastProcessAllMs: function(v) { _lastProcessAllMs = v; }
      });
      return;
    }
    if (!enabled || _processingNow) return;
    _processingNow = true;
    var _t0 = debugMode ? performance.now() : 0;
    // Preserve scroll position to prevent jump on DOM changes
    var scrollY = window.scrollY;
    try {
      // Core: inject tier badges on cards
      var newCards = false;
      document.querySelectorAll('.card-container:not([data-tm-processed])').forEach(function(el) {
        injectBadge(el);
        el.setAttribute('data-tm-processed', '1');
        newCards = true;
      });
      // Expensive functions: only run if visible cards changed
      var curHash = getVisibleCardsHash();
      var curCorp = detectMyCorp() || '';
      var dirty = newCards || curHash !== _prevVisibleHash || curCorp !== _prevCorpName;
      _prevVisibleHash = curHash;
      _prevCorpName = curCorp;
      if (dirty) {
        var _tCombos = debugMode ? performance.now() : 0;
        // Core: combo highlights + corp synergy glow
        checkCombos();
        detectHandCombos();
        highlightCorpSynergies();
        var _tDraft = debugMode ? performance.now() : 0;
        // Core: draft scoring + draft history
        updateDraftRecommendations();
        // Refresh non-workflow cards immediately; otherwise fast chooser states can
        // sit on base scores until the background interval fires.
        updateHandScores();
        // Prelude package scoring
        checkPreludePackage();
        // Discard hints on hand cards
        injectDiscardHints();
        // Last-gen sell indicators
        // injectSellIndicators(); // disabled
        // Play priority badges
        injectPlayPriorityBadges();
        if (debugMode) {
          var _tEndDirty = performance.now();
          tmLog('perf', 'processAll breakdown: combos=' + (_tDraft - _tCombos).toFixed(1) + 'ms, draft+badges=' + (_tEndDirty - _tDraft).toFixed(1) + 'ms');
        }
      }
      trackDraftHistory();
      // Standard project ratings (throttled internally)
      rateStandardProjects();
      enhanceGameLog();
      // Playable card highlight (throttled to 2s internally)
      highlightPlayable();
    } finally {
      _processingNow = false;
      // Restore scroll if it jumped during DOM manipulation
      if (Math.abs(window.scrollY - scrollY) > 5) {
        window.scrollTo(0, scrollY);
      }
      if (debugMode) {
        _lastProcessAllMs = performance.now() - _t0;
        tmLog('perf', 'processAll ' + _lastProcessAllMs.toFixed(1) + 'ms, dirty=' + dirty);
      }
    }
  }

  // ── Enhanced Game Log ──

  function enhanceGameLog() {
    if (!TM_CONTENT_LOG_UI || !TM_CONTENT_LOG_UI.decorateLogCardScores) return;
    TM_CONTENT_LOG_UI.decorateLogCardScores({
      enabled: enabled,
      documentObj: document,
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null
    });
  }

  function refreshStoredDraftLog() {
    if (!TM_CONTENT_DRAFT_HISTORY || !TM_CONTENT_DRAFT_HISTORY.refreshStoredDraftLog) return;
    TM_CONTENT_DRAFT_HISTORY.refreshStoredDraftLog({
      safeStorage: typeof safeStorage === 'function' ? safeStorage : null,
      parseGameId: (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) ? TM_UTILS.parseGameId : null,
      chromeRuntime: (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null,
      documentObj: document,
      draftHistory: getDraftHistoryState(),
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      ruName: ruName,
      escHtml: escHtml,
      isNegativeReason: isNegativeReason
    });
  }

  function buildLogSearchBar(logPanel) {
    if (!TM_CONTENT_LOG_UI || !TM_CONTENT_LOG_UI.buildLogSearchBar) return;
    TM_CONTENT_LOG_UI.buildLogSearchBar({
      logPanel: logPanel,
      documentObj: document
    });
  }

  function buildLogFilterBar(logPanel) {
    if (!TM_CONTENT_LOG_UI || !TM_CONTENT_LOG_UI.buildLogFilterBar) return;
    TM_CONTENT_LOG_UI.buildLogFilterBar({
      logPanel: logPanel,
      documentObj: document
    });
  }

  function applyLogFilter(logPanel) {
    if (!TM_CONTENT_LOG_UI || !TM_CONTENT_LOG_UI.applyLogFilter) return;
    TM_CONTENT_LOG_UI.applyLogFilter(logPanel);
  }

  // Track hand cards to show what alternatives were when a card was played
  function trackHandChoices(logPanel) {
    if (!TM_CONTENT_LOG_UI || !TM_CONTENT_LOG_UI.trackHandChoices) return;
    TM_CONTENT_LOG_UI.trackHandChoices({
      logPanel: logPanel,
      getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
      cardN: cardN
    });
  }

  // ── Generation Summary ──

  let logSummaryGen = 0;

  function injectGenSummaries(logPanel) {
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.players) return;

    const curGen = pv.game.generation || detectGeneration();
    if (curGen <= 1 || curGen <= logSummaryGen) return;

    // Check if we already injected for this generation
    if (logPanel.querySelector('.tm-gen-summary[data-gen="' + (curGen - 1) + '"]')) {
      logSummaryGen = curGen;
      return;
    }

    // Generation summary disabled — clutters the game log
    logSummaryGen = curGen;
  }

  var getPlayerColor = TM_UTILS.playerColor;

  // ── Draft History Injection ──

  function injectDraftHistory(logPanel) {
    if (!TM_CONTENT_DRAFT_HISTORY || !TM_CONTENT_DRAFT_HISTORY.injectDraftHistory) return;
    TM_CONTENT_DRAFT_HISTORY.injectDraftHistory({
      logPanel: logPanel,
      draftHistory: getDraftHistoryState(),
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      ruName: ruName,
      escHtml: escHtml,
      isNegativeReason: isNegativeReason
    });
  }

  function removeAll() {
    if (TM_CONTENT_CYCLE && TM_CONTENT_CYCLE.removeAll) {
      TM_CONTENT_CYCLE.removeAll({
        documentObj: document,
        hideTooltip: hideTooltip
      });
      return;
    }
    // Remove injected elements
    document.querySelectorAll('.tm-tier-badge, .tm-combo-tooltip, .tm-anti-combo-tooltip, .tm-hand-combo, .tm-log-card-score').forEach((el) => el.remove());
    // Strip combo classes
    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    // Strip single-class markers (8 selectors → 1 querySelectorAll)
    document.querySelectorAll('.tm-dim, .tm-corp-synergy, .tm-tag-synergy, .tm-combo-hint, .tm-anti-combo, .tm-rec-best, .tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-dim', 'tm-corp-synergy', 'tm-tag-synergy', 'tm-combo-hint', 'tm-anti-combo', 'tm-rec-best', 'tm-playable', 'tm-unplayable');
    });
    // Clear data attributes
    document.querySelectorAll('[data-tm-processed]').forEach((el) => {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    document.querySelectorAll('[data-tm-reasons], [data-tm-reason-rows]').forEach((el) => clearReasonPayload(el));
    hideTooltip();
  }

  // ── Milestone/Award advisor ──

  // MA_DATA loaded from data/ma_data.json.js as TM_MA_DATA
  const MA_DATA = typeof TM_MA_DATA !== 'undefined' ? TM_MA_DATA : {};


  var _pvCache = null;
  var _pvCacheTime = 0;
  var _pvApiState = null;
  var _pvApiStateTime = 0;
  var _pvApiFetchInFlight = false;
  var _pvLastApiFetchAt = 0;
  var _pvGraceMs = 60000;
  var _pvApiFetchCooldownMs = 5000;

  function getBridgeTargets() {
    return [
      document.getElementById('game'),
      document.getElementById('app'),
      document.querySelector('[data-v-app]'),
      document.body,
    ];
  }

  function getBridgeHostEl() {
    var targets = getBridgeTargets();
    for (var i = 0; i < targets.length; i++) {
      if (targets[i]) return targets[i];
    }
    return document.body;
  }

  function normalizePlayerPayload(data) {
    if (!data || typeof data !== 'object') return data;
    if (data.thisPlayer) return data;
    if (data.playerView && data.playerView.thisPlayer) return data.playerView;
    if (data.player && data.player.thisPlayer) return data.player;
    if (data.player && data.player.game && data.player.color && !data.player.thisPlayer) {
      data = data.player;
    }
    if (data.game && data.players && data.color && !data.thisPlayer) {
      var wrapped = {
        thisPlayer: data,
        players: data.players || [],
        game: data.game || null,
        _source: data._source || 'legacy-api'
      };
      if (data.waitingFor) wrapped.waitingFor = data.waitingFor;
      if (data.waitingFor && !wrapped._waitingFor) wrapped._waitingFor = data.waitingFor;
      if (data.draftedCards) wrapped.draftedCards = data.draftedCards;
      if (data.dealtCorporationCards) wrapped.dealtCorporationCards = data.dealtCorporationCards;
      if (data.dealtPreludeCards) wrapped.dealtPreludeCards = data.dealtPreludeCards;
      if (data.pickedCorporationCard) wrapped.pickedCorporationCard = data.pickedCorporationCard;
      if (data.preludeCardsInHand) wrapped.preludeCardsInHand = data.preludeCardsInHand;
      if (data.dealtProjectCards) wrapped.dealtProjectCards = data.dealtProjectCards;
      return wrapped;
    }
    return data;
  }

  function requestPlayerViewApiFallback() {
    if (_pvApiFetchInFlight) return;
    if (Date.now() - _pvLastApiFetchAt < _pvApiFetchCooldownMs) return;
    if (typeof fetch === 'undefined') return;

    var gameId = (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) ? TM_UTILS.parseGameId() : null;
    if (!gameId) return;

    var endpoint = gameId.charAt(0).toLowerCase() === 'p'
      ? '/api/player?id=' + encodeURIComponent(gameId)
      : '/api/spectator?id=' + encodeURIComponent(gameId);

    _pvApiFetchInFlight = true;
    _pvLastApiFetchAt = Date.now();

    fetch(endpoint, { credentials: 'same-origin' })
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        data = normalizePlayerPayload(data);
        if (!data || (!data.thisPlayer && !data.players && !data.game)) return;
        var stamped = Object.assign({}, data);
        stamped._timestamp = Date.now();
        if (stamped.waitingFor && !stamped._waitingFor) stamped._waitingFor = stamped.waitingFor;
        _pvApiState = stamped;
        _pvApiStateTime = Date.now();
        _pvCache = stamped;
        _pvCacheTime = Date.now();
        try {
          var target = getBridgeHostEl();
          target.setAttribute('data-tm-vue-bridge', JSON.stringify(stamped));
          if (stamped._waitingFor) {
            target.setAttribute('data-tm-vue-wf', JSON.stringify(stamped._waitingFor));
          }
          target.setAttribute('data-tm-bridge-status', 'ok:api-fallback:' + new Date().toLocaleTimeString());
        } catch (e) {}
      })
      .catch(function(e) {
        tmWarn('api', 'API fallback failed', e);
      })
      .then(function() {
        _pvApiFetchInFlight = false;
      });
  }

  function getPlayerVueData() {
    if (TM_CONTENT_PLAYER_VIEW && TM_CONTENT_PLAYER_VIEW.getPlayerVueData) {
      return TM_CONTENT_PLAYER_VIEW.getPlayerVueData({
        documentObj: document,
        parseGameId: (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) ? TM_UTILS.parseGameId : function() { return null; },
        fetchFn: typeof fetch === 'function' ? fetch : null,
        tmWarn: tmWarn
      });
    }
    // Cached: avoid re-parsing large JSON on every call (tooltip calls 3-5x per hover)
    if (Date.now() - _pvCacheTime < 2000 && _pvCache !== null) return _pvCache;
    var bridgeTargets = getBridgeTargets();
    var bridgeData = null;
    for (var bi = 0; bi < bridgeTargets.length; bi++) {
      var bridgeEl = bridgeTargets[bi];
      if (!bridgeEl) continue;
      bridgeData = bridgeEl.getAttribute('data-tm-vue-bridge');
      if (bridgeData) break;
    }
    if (!bridgeData) {
      requestPlayerViewApiFallback();
      if (_pvApiState !== null && Date.now() - _pvApiStateTime < _pvGraceMs) return _pvApiState;
      if (_pvCache !== null && Date.now() - _pvCacheTime < _pvGraceMs) return _pvCache;
      _pvCache = null;
      return null;
    }
    try {
      var parsed = normalizePlayerPayload(JSON.parse(bridgeData));
      if (parsed._timestamp && Date.now() - parsed._timestamp > 15000) {
        requestPlayerViewApiFallback();
        if (_pvApiState !== null && Date.now() - _pvApiStateTime < _pvGraceMs) return _pvApiState;
        if (_pvCache !== null && Date.now() - _pvCacheTime < _pvGraceMs) return _pvCache;
        _pvCache = null;
        return null;
      }
      _pvCache = parsed;
      _pvCacheTime = Date.now();
      return _pvCache;
    } catch(e) {
      tmWarn('api', 'Vue data parse failed', e);
      requestPlayerViewApiFallback();
      if (_pvApiState !== null && Date.now() - _pvApiStateTime < _pvGraceMs) return _pvApiState;
      if (_pvCache !== null && Date.now() - _pvCacheTime < _pvGraceMs) return _pvCache;
      _pvCache = null;
      return null;
    }
  }

  function detectActiveMA() {
    // Read milestone/award names from the DOM
    const maNames = [];
    document.querySelectorAll('.ma-name, .milestone-award-inline').forEach((el) => {
      const text = el.textContent.trim();
      if (text) maNames.push(text);
    });
    return maNames;
  }

  // ── Toast notification system ──

  const toastQueue = [];
  let toastActive = false;
  let toastEl = null;

  function ensureToast() {
    if (TM_CONTENT_TOAST && TM_CONTENT_TOAST.ensureToast) {
      return TM_CONTENT_TOAST.ensureToast({ documentObj: document });
    }
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'tm-toast';
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg, type) {
    if (TM_CONTENT_TOAST && TM_CONTENT_TOAST.showToast) {
      TM_CONTENT_TOAST.showToast({ documentObj: document, msg: msg, type: type });
      return;
    }
    toastQueue.push({ msg, type: type || 'info' });
    if (!toastActive) drainToastQueue();
  }

  var TOAST_ICONS = { deny: '\u26D4', great: '\u2705', milestone: '\uD83C\uDFC6', gen: '\uD83D\uDD04', corp: '\uD83C\uDFED', info: '\u2139\uFE0F' };

  function drainToastQueue() {
    if (toastQueue.length === 0) { toastActive = false; return; }
    toastActive = true;
    const { msg, type } = toastQueue.shift();
    const el = ensureToast();
    var icon = TOAST_ICONS[type] || '';
    el.textContent = (icon ? icon + ' ' : '') + msg;
    el.className = 'tm-toast tm-toast-' + type + ' tm-toast-show';
    setTimeout(() => {
      el.classList.remove('tm-toast-show');
      setTimeout(drainToastQueue, 300);
    }, 2500);
  }

  // Rate limiter: max 1 toast per category per gen/round
  var toastShownKeys = {};
  function canShowToast(category, key) {
    if (TM_CONTENT_TOAST && TM_CONTENT_TOAST.canShowToast) {
      return TM_CONTENT_TOAST.canShowToast(category, key);
    }
    var k = category + ':' + key;
    if (toastShownKeys[k]) return false;
    toastShownKeys[k] = true;
    return true;
  }
  function resetToastKeys() {
    if (TM_CONTENT_TOAST && TM_CONTENT_TOAST.resetToastKeys) {
      TM_CONTENT_TOAST.resetToastKeys();
      return;
    }
    toastShownKeys = {};
  }

  // ── Draft recommendation engine ──

  var _cachedTableauNames = null, _tableauNamesTime = 0;
  function getMyTableauNames() {
    if (Date.now() - _tableauNamesTime < 2000 && _cachedTableauNames) return _cachedTableauNames;
    var names = [];
    document.querySelectorAll(SEL_TABLEAU).forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    _cachedTableauNames = names;
    _tableauNamesTime = Date.now();
    return names;
  }

  var _cachedHandNames = null, _handNamesTime = 0;
  function getMyHandNames() {
    if (Date.now() - _handNamesTime < 2000 && _cachedHandNames) return _cachedHandNames;
    var names = [];
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    _cachedHandNames = names;
    _handNamesTime = Date.now();
    return names;
  }

  // Hand + already-drafted cards this generation (for draft pick synergy)
  function getMyHandWithDrafted() {
    var hand = getMyHandNames().slice(); // copy to avoid mutating cache
    var pv = getPlayerVueData();
    if (pv && pv.draftedCards && pv.draftedCards.length > 0) {
      var handSet = new Set(hand);
      for (var i = 0; i < pv.draftedCards.length; i++) {
        var n = pv.draftedCards[i].name;
        if (n && !handSet.has(n)) hand.push(n);
      }
    }
    return hand;
  }

  // Detect played event card names in tableau (events are one-shot, no ongoing synergy)
  function getMyPlayedEventNames() {
    var evts = new Set();
    document.querySelectorAll(SEL_TABLEAU).forEach(function(el) {
      var hasEvt = false;
      el.querySelectorAll('[class*="tag-"]').forEach(function(t) {
        if (t.classList.contains('tag-event')) hasEvt = true;
      });
      // Also check card-type class
      if (!hasEvt && el.classList.contains('card-type--event')) hasEvt = true;
      if (hasEvt) {
        var n = el.getAttribute('data-tm-card');
        if (n) evts.add(n);
      }
    });
    return evts;
  }

  // Count tags from hand card DOM elements
  function getHandTagCounts() {
    var counts = {};
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var tags = getCardTags(el);
      tags.forEach(function(tag) { counts[tag] = (counts[tag] || 0) + 1; });
    });
    return counts;
  }

  // ── Player context for draft scoring ──

  var CORP_DISCOUNTS = TM_CORP_DISCOUNTS;
  var CARD_DISCOUNTS = TM_CARD_DISCOUNTS;
  var TAG_TRIGGERS = TM_TAG_TRIGGERS;
  var TAKE_THAT_CARDS = TM_TAKE_THAT_CARDS;
  var ANIMAL_TARGETS = new Set(TM_ANIMAL_TARGETS);
  var MICROBE_TARGETS = new Set(TM_MICROBE_TARGETS);
  var FLOATER_TARGETS = new Set(TM_FLOATER_TARGETS);

  // Keywords for detecting production/VP cards in the card description
  const PROD_KEYWORDS = ['прод', 'prod', 'production', 'increase'];
  const VP_KEYWORDS = ['VP', 'vp', 'ПО', 'victory point'];

  // Tag → which milestone/award it contributes to (tag: [{name, type, tag}])
  // Built from MA_DATA at init
  const TAG_TO_MA = {};
  for (const [maName, ma] of Object.entries(MA_DATA)) {
    if (ma.check === 'tags' && ma.tag) {
      if (!TAG_TO_MA[ma.tag]) TAG_TO_MA[ma.tag] = [];
      TAG_TO_MA[ma.tag].push({ name: maName, type: ma.type, target: ma.target || 0 });
    }
    if (ma.check === 'bioTags') {
      for (const bt of ['plant', 'microbe', 'animal']) {
        if (!TAG_TO_MA[bt]) TAG_TO_MA[bt] = [];
        TAG_TO_MA[bt].push({ name: maName, type: ma.type, target: ma.target || 0, bio: true });
      }
    }
  }

  // Single-pass tableau scan: events, names, resource rates/targets, energy consumers
  function scanTableauForContext(tableau, ctx) {
    for (var i = 0; i < tableau.length; i++) {
      var cn = cardN(tableau[i]);
      ctx.tableauNames.add(cn);
      // Events count
      var d = TM_RATINGS[cn];
      if (d && d.t === 'event') ctx.events++;
      // Resource accumulation + energy consumers
      var fx = getFx(cn);
      if (fx) {
        if (fx.vpAcc && fx.vpPer) {
          if (fx.res === 'microbe') ctx.microbeAccumRate += fx.vpAcc;
          else if (fx.res === 'floater') ctx.floaterAccumRate += fx.vpAcc;
          else if (fx.res === 'animal') ctx.animalAccumRate += fx.vpAcc;
          else if (d && d.e) {
            var eLow = d.e.toLowerCase();
            if (eLow.includes('microb')) ctx.microbeAccumRate += fx.vpAcc;
            if (eLow.includes('animal')) ctx.animalAccumRate += fx.vpAcc;
          }
        }
        if (!ctx.hasEnergyConsumers && fx.ep && fx.ep < 0) ctx.hasEnergyConsumers = true;
      }
      // Action-based energy consumers (spend energy per action, no ep field)
      if (!ctx.hasEnergyConsumers) {
        var ACTION_ENERGY_CONSUMERS = ['Steelworks', 'Ironworks', 'Water Splitting Plant',
          'Ore Processor', 'Physics Complex', 'Venus Magnetizer', 'Electro Catapult'];
        if (ACTION_ENERGY_CONSUMERS.indexOf(cn) >= 0) ctx.hasEnergyConsumers = true;
      }
      // Resource targets
      if (FLOATER_TARGETS.has(cn)) ctx.floaterTargetCount++;
      if (ANIMAL_TARGETS.has(cn)) ctx.animalTargetCount++;
      if (MICROBE_TARGETS.has(cn)) ctx.microbeTargetCount++;
    }
  }

  function getPlayerContext() {
    const pv = getPlayerVueData();
    const gen = detectGeneration();
    const gensLeft = estimateGensLeft(pv);
    const myCorp = detectMyCorp();

    const ctx = {
      gen: gen,
      gensLeft: gensLeft,
      tags: {},
      discounts: {},
      tagTriggers: [],
      mc: 0,
      steel: 0,
      steelVal: 2,
      titanium: 0,
      tiVal: 3,
      heat: 0,
      colonies: 0,
      prod: { mc: 0, steel: 0, ti: 0, plants: 0, energy: 0, heat: 0 },
      tr: 0,
      // Milestone/Award context
      activeMA: [],       // [{name, type, check, tag, target, current, pct}]
      milestoneNeeds: {},  // tag → how many more needed for closest milestone
      milestoneSpecial: {}, // check_type → need (e.g. 'cities' → 1, 'events' → 2)
      awardTags: {},       // tag → true if tag-based award is active
      awardRacing: {},     // award_name → { myScore, bestOpp, delta, leading }
      // Board state
      cities: 0,
      greeneries: 0,
      events: 0,
      handSize: 0,
      tableauSize: 0,
      uniqueTagCount: 0,
      tableauNames: new Set(),
    };

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;

      // Resources
      ctx.mc = p.megaCredits || 0;
      ctx.steel = p.steel || 0;
      ctx.steelVal = p.steelValue || SC.defaultSteelVal;
      ctx.titanium = p.titanium || 0;
      ctx.tiVal = p.titaniumValue || SC.defaultTiVal;
      ctx.heat = p.heat || 0;
      ctx.tr = p.terraformRating || 0;

      // Production
      ctx.prod.mc = p.megaCreditProduction || 0;
      ctx.prod.steel = p.steelProduction || 0;
      ctx.prod.ti = p.titaniumProduction || 0;
      ctx.prod.plants = p.plantProduction || 0;
      ctx.prod.energy = p.energyProduction || 0;
      ctx.prod.heat = p.heatProduction || 0;

      // Colonies + trade fleets
      ctx.colonies = p.coloniesCount || 0;
      ctx.fleetSize = p.fleetSize || 1;
      ctx.tradesUsed = p.tradesThisGeneration || 0;
      ctx.tradesLeft = Math.max(0, ctx.fleetSize - ctx.tradesUsed);
      ctx.coloniesOwned = 0;
      ctx.totalColonies = 0;
      ctx.colonyWorldCount = 0;
      extractColonies(pv, p.color, ctx);

      // Board state: cities, greeneries, events, hand, tableau
      ctx.handSize = p.cardsInHandNbr || (p.cardsInHand ? p.cardsInHand.length : 0);
      ctx.tableauSize = p.tableau ? p.tableau.length : 0;
      // Cities/greeneries from pre-aggregated playerTiles (vue-bridge)
      if (pv.game && pv.game.playerTiles && p.color && pv.game.playerTiles[p.color]) {
        ctx.cities = pv.game.playerTiles[p.color].cities || 0;
        ctx.greeneries = pv.game.playerTiles[p.color].greeneries || 0;
      }
      // Tags, corp discounts
      ctx.uniqueTagCount = 0;
      extractPlayerTags(p.tags, ctx);
      // Extended tag contexts: hand tags + projected future
      ctx.handTags = getHandTagCounts();
      ctx.tagsWithHand = {};
      ctx.tagsProjected = {};
      var tagDraftRates = { jovian: 0.3, science: 0.5, venus: 0.4, earth: 0.5, space: 1.0, building: 0.8, plant: 0.4, microbe: 0.3, animal: 0.3, power: 0.2, city: 0.2, event: 0.5 };
      for (var twh in ctx.tags) { ctx.tagsWithHand[twh] = ctx.tags[twh]; ctx.tagsProjected[twh] = ctx.tags[twh]; }
      var handTagDiscount = SC.handTagDiscount || 0.5; // not all hand cards will be played
      for (var tht in ctx.handTags) {
        ctx.tagsWithHand[tht] = (ctx.tagsWithHand[tht] || 0) + Math.round(ctx.handTags[tht] * handTagDiscount);
        ctx.tagsProjected[tht] = (ctx.tagsProjected[tht] || 0) + Math.round(ctx.handTags[tht] * handTagDiscount);
      }
      var futureGens = Math.max(0, gensLeft - 1);
      for (var tdr in tagDraftRates) {
        ctx.tagsProjected[tdr] = (ctx.tagsProjected[tdr] || 0) + Math.round(tagDraftRates[tdr] * futureGens);
      }
      var allCorpsCtx = detectMyCorps();
      applyCorpDiscounts(allCorpsCtx, ctx);

      // Board space tracking
      ctx.emptySpaces = 0;
      ctx.totalOccupied = 0;
      ctx.oceansOnBoard = 0;
      computeBoardState(pv, ctx);

      // Single-pass tableau scan: events, names, resource rates/targets, energy
      ctx.microbeAccumRate = 0;
      ctx.floaterAccumRate = 0;
      ctx.animalAccumRate = 0;
      ctx.floaterTargetCount = 0;
      ctx.animalTargetCount = 0;
      ctx.microbeTargetCount = 0;
      ctx.hasEnergyConsumers = false;
      if (p.tableau) scanTableauForContext(p.tableau, ctx);

      applyCardDiscounts(ctx);
      applyTagTriggers(ctx, allCorpsCtx);

      // MA proximity, global params, opponents, map, turmoil
      processMAProximity(pv.thisPlayer, pv.thisPlayer.color, pv, ctx);
      extractGlobalParams(pv, ctx);
      scanOpponents(pv, pv.thisPlayer.color, ctx);
      extractMapAndRate(pv, ctx);
      var myInfluence = pv.thisPlayer.politicalAgendasActionUsedCount != null ? 0 : (pv.thisPlayer.influence || 0);
      extractTurmoil(pv, pv.thisPlayer.color, myInfluence, ctx);
    }

    // Cache detected corps in ctx to avoid repeated detectMyCorps() in scoreDraftCard
    ctx._myCorps = detectMyCorps();

    var spResult2 = computeAllSP(pv, ctx.gensLeft, detectMyCorp());
    ctx.bestSP = spResult2 ? spResult2.best : null;
    ctx.allSP = spResult2 ? spResult2.all : [];

    if (debugMode) tmLog('ctx', 'Context: gen=' + ctx.gen + ' gensLeft=' + ctx.gensLeft + ' tr=' + ctx.tr + ' mc=' + ctx.mc + ' tags=' + JSON.stringify(ctx.tags));
    return ctx;
  }

  var CORP_ABILITY_SYNERGY = TM_CORP_ABILITY_SYNERGY;

  // Pre-built combo/anti-combo indexes (built once, cached)
  var _comboIndex = null;   // cardName → [{combo, otherCards}]
  var _antiComboIndex = null;
  function getComboIndex() {
    if (_comboIndex) return _comboIndex;
    _comboIndex = {};
    if (typeof TM_COMBOS !== 'undefined') {
      for (var i = 0; i < TM_COMBOS.length; i++) {
        var combo = TM_COMBOS[i];
        for (var j = 0; j < combo.cards.length; j++) {
          var cn = combo.cards[j];
          if (!_comboIndex[cn]) _comboIndex[cn] = [];
          _comboIndex[cn].push({ combo: combo, otherCards: combo.cards.filter(function(c) { return c !== cn; }) });
        }
      }
    }
    return _comboIndex;
  }
  function getAntiComboIndex() {
    if (_antiComboIndex) return _antiComboIndex;
    _antiComboIndex = {};
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (var i = 0; i < TM_ANTI_COMBOS.length; i++) {
        var anti = TM_ANTI_COMBOS[i];
        for (var j = 0; j < anti.cards.length; j++) {
          var cn = anti.cards[j];
          if (!_antiComboIndex[cn]) _antiComboIndex[cn] = [];
          _antiComboIndex[cn].push({ anti: anti, otherCards: anti.cards.filter(function(c) { return c !== cn; }) });
        }
      }
    }
    return _antiComboIndex;
  }

  // Cached card tags from DOM (avoids repeated querySelectorAll per card)
  var _cardTagsCache = new WeakMap();
  function getCachedCardTags(cardEl) {
    var cached = _cardTagsCache.get(cardEl);
    if (cached) return cached;
    var tags = getCardTags(cardEl);
    _cardTagsCache.set(cardEl, tags);
    return tags;
  }

  var SPLICE_OPENING_PLACERS = {
    'Symbiotic Fungus': 1,
    'Extreme-Cold Fungus': 1,
    'Imported Nitrogen': 1,
    'Controlled Bloom': 1,
    'Cyanobacteria': 1,
    'Bactoviral Research': 1,
    'Nobel Labs': 1,
    'Ecology Research': 1
  };

  function isSpliceOpeningPlacer(cardName) {
    var baseName = _baseCardName(cardName);
    return !!(SPLICE_OPENING_PLACERS[cardName] || SPLICE_OPENING_PLACERS[baseName]);
  }

  // ── Unified corp boost calculation (used by draft scoring + discard advice) ──
  // Returns numeric bonus for a card given a corp. Positive = synergy, negative = anti-synergy.
  // opts: { eLower, cardTags, cardCost, cardType, cardName, ctx }
  function getCorpBoost(corpName, opts) {
    var eLower = opts.eLower || '';
    var cardTags = opts.cardTags;
    var cardCost = opts.cardCost;
    if (opts.cardName === 'Heat Trappers') {
      if (corpName === 'Thorgate') return 4;
      if (corpName === 'Cheung Shing MARS') return 3;
      if (corpName === 'Factorum' || corpName === 'Mining Guild') return 0;
    }
    if (opts.cardName === 'Suitable Infrastructure') {
      if (corpName === 'Robinson Industries') return 3;
      if (corpName === 'Manutech') return 3;
      if (corpName === 'Factorum' || corpName === 'Cheung Shing MARS' || corpName === 'Mining Guild') return 0;
    }
    switch (corpName) {
      case 'Point Luna': return (eLower.includes('draw') || eLower.includes('card') || cardTags.has('earth')) ? 2 : 0;
      case 'EcoLine': {
        var ecoBoost = 0;
        // Plant cards are core strategy
        if (eLower.includes('plant') || eLower.includes('green') || eLower.includes('раст')) ecoBoost += 3;
        // Ocean cards: placement near greeneries for adjacency
        if (eLower.includes('ocean') || eLower.includes('океан')) ecoBoost += 2;
        // Plant production specifically
        if (eLower.includes('plant production') || eLower.includes('продукц') && eLower.includes('раст')) ecoBoost += 1;
        // Penalty: -MC production hurts card buying for plant engine
        if (eLower.includes('decrease') && eLower.includes('m€ production') || eLower.includes('decrease your m€')) ecoBoost -= 2;
        return ecoBoost;
      }
      case 'Tharsis Republic': return (eLower.includes('city') || eLower.includes('город')) ? 3 : 0;
      case 'Helion': return (eLower.includes('heat') || eLower.includes('тепл')) ? 2 : 0;
      case 'PhoboLog': return cardTags.has('space') ? 2 : 0;
      case 'Mining Guild': {
        var fxMG = (typeof TM_CARD_EFFECTS !== 'undefined' && opts.cardName) ? TM_CARD_EFFECTS[opts.cardName] : null;
        var raisesSteelProd =
          !!(fxMG && (
            (fxMG.sp && fxMG.sp > 0)
          ));
        var placesTile =
          !!(fxMG && (
            (fxMG.city && fxMG.city > 0) ||
            (fxMG.grn && fxMG.grn > 0) ||
            (fxMG.oc && fxMG.oc > 0)
          )) ||
          ((opts.eLower || '').includes('place') && ((opts.eLower || '').includes('tile') || (opts.eLower || '').includes('area'))) ||
          ((opts.eLower || '').includes('размест') && ((opts.eLower || '').includes('тайл') || (opts.eLower || '').includes('област')));
        return (raisesSteelProd || placesTile) ? 1 : 0;
      }
      case 'CrediCor': return (cardCost != null && cardCost >= 20) ? 2 : 0;
      case 'Interplanetary Cinematics': {
        var icBoost = cardTags.has('event') ? 2 : 0;
        if (opts.cardName === 'Media Group') icBoost += 2;
        if (opts.cardName === 'Optimal Aerobraking') {
          icBoost += 2;
          var icColonies = new Set(getVisibleColonyNames());
          if (icColonies.has('Triton')) icBoost += 1;
        }
        return icBoost;
      }
      case 'Arklight': return (cardTags.has('animal') || cardTags.has('plant')) ? 2 : 0;
      case 'Poseidon': return (eLower.includes('colon') || eLower.includes('колон')) ? 3 : 0;
      case 'Polyphemos': return (eLower.includes('draw') || eLower.includes('card')) ? -2 : 0;
      case 'Lakefront Resorts': {
        // No synergy if all oceans placed
        if (opts.globalParams && opts.globalParams.oceans >= 9) return 0;
        return (eLower.includes('ocean') || eLower.includes('океан')) ? 2 : 0;
      }
      case 'Splice':
        if (!cardTags.has('microbe')) return 0;
        if (opts.cardName === 'Decomposers' || opts.cardName === 'Urban Decomposers') return 1;
        return 2;
      case 'Celestic': return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0;
      case 'Robinson Industries': return 0;
      case 'Viron': return opts.cardType === 'blue' ? 2 : 0;
      case 'Recyclon': return cardTags.has('building') ? 1 : 0;
      case 'Stormcraft Incorporated': return (eLower.includes('floater') || eLower.includes('флоат')) ? 2 : 0;
      case 'Aridor':
        if (!opts.ctx || !opts.ctx.tags) return 0;
        var newType = false;
        cardTags.forEach(function(tag) { if ((opts.ctx.tags[tag] || 0) === 0) newType = true; });
        return newType ? 3 : 0;
      case 'Manutech':
        var fx = getFx(opts.cardName);
        if (fx) {
          var instantMC = 0;
          var sVal = opts.ctx ? (opts.ctx.steelVal || 2) : 2;
          var tVal = opts.ctx ? (opts.ctx.tiVal || 3) : 3;
          if (fx.sp > 0) instantMC += fx.sp * sVal;
          if (fx.tp > 0) instantMC += fx.tp * tVal;
          if (fx.mp > 0) instantMC += fx.mp;
          if (fx.pp > 0) instantMC += fx.pp * 2.0;
          if (fx.ep > 0) instantMC += fx.ep * 1.5;
          if (fx.hp > 0) instantMC += fx.hp;
          if (instantMC >= 13) return 5;
          if (instantMC >= 8) return 4;
          if (instantMC >= 4) return 3;
          if (instantMC > 0) return 2;
        }
        return (eLower.includes('prod') || eLower.includes('прод')) ? 2 : 0;

      // ── Additional corps (abilities from game source) ──
      case 'Aphrodite':
        return (cardTags.has('venus') || eLower.includes('venus')) ? 2 : 0;
      case 'Arcadian Communities':
        return (eLower.includes('city') || eLower.includes('город') || eLower.includes('tile') || eLower.includes('тайл')) ? 2 : 0;
      case 'Astrodrill':
        return cardTags.has('space') ? 1 : 0;
      case 'Cheung Shing MARS':
        return cardTags.has('building') ? 2 : 0;
      case 'EcoTec':
        return (cardTags.has('microbe') || cardTags.has('plant') || cardTags.has('animal')) ? 2 : 0;
      case 'Factorum':
        return cardTags.has('building') ? 1 : (eLower.includes('energy') || eLower.includes('энерг')) ? 1 : 0;
      case 'Inventrix': {
        var iFx = getFx(opts.cardName);
        return (iFx && (iFx.minG != null || iFx.maxG != null)) ? 2 : cardTags.has('science') ? 1 : 0;
      }
      case 'Kuiper Cooperative': {
        if (cardTags.has('space')) return 1;
        var colonyActionish = eLower.includes('trade') || eLower.includes('торг')
          || eLower.includes('build colony') || eLower.includes('place a colony')
          || eLower.includes('colony tile') || eLower.includes('colony track');
        return colonyActionish ? 1 : 0;
      }
      case 'Midas':
        return (cardCost != null && cardCost >= 20) ? 1 : 0;
      case 'Mars Direct':
        return cardTags.has('mars') ? 2 : 0;
      case 'Mons Insurance':
        // Mons pays 3 MC to victims when YOU attack — penalty for attack cards
        if (eLower.includes('decrease') || eLower.includes('steal') || eLower.includes('remove')
            || eLower.includes('снизить') || eLower.includes('украсть')) return -2;
        return 0;
      case 'Morning Star Inc.':
        return getRequirementFlexSteps(opts.cardName, [corpName]).venus > 0 ? 2 : 0;
      case 'Nirgal Enterprises': // free milestones/awards. Broad corp, no specific card-type boost.
        return 0;
      case 'Palladin Shipping':
        return (cardTags.has('space') && opts.cardType === 'event') ? 2 : cardTags.has('space') ? 1 : 0;
      case 'Pharmacy Union': // 2 starting diseases. Science → remove disease + 1 TR (or flip for 3 TR). Microbe → disease + -4 MC.
        return cardTags.has('science') ? 4 : cardTags.has('microbe') ? -3 : 0;
      case 'Philares':
        return (eLower.includes('city') || eLower.includes('город') || eLower.includes('greenery') || eLower.includes('озелен') || eLower.includes('tile') || eLower.includes('тайл')) ? 2 : 0;
      case 'Polaris': // any ocean → +1 MC-prod; OWN ocean → also +4 MC
        return (eLower.includes('ocean') || eLower.includes('океан')) ? 3 : 0;
      case 'PolderTECH Dutch':
        return (eLower.includes('ocean') || eLower.includes('океан') || eLower.includes('greenery') || eLower.includes('озелен')) ? 2 : cardTags.has('plant') ? 1 : 0;
      case 'Pristar': {
        // No TR this gen → +6 MC + 1 preservation (1 VP). Engine/VP without TR = ideal.
        var pFx = getFx(opts.cardName);
        if (pFx && (pFx.tr || pFx.actTR)) return -2; // TR costs bonus (~11 MC lost)
        if (pFx && (pFx.vp > 0 || pFx.vpAcc > 0)) return 2; // VP without TR = exactly what Pristar wants
        if (eLower.includes('prod') || eLower.includes('прод')) return 2; // production engine → more value per gen
        return 0;
      }
      case 'Sagitta Frontier Services': {
        // No-tag → +4 MC; exactly 1 tag → +1 MC. Events count as +1 tag.
        var sTagCount = cardTags.size || 0;
        if (opts.cardType === 'event') sTagCount++;
        return sTagCount === 0 ? 4 : sTagCount === 1 ? 1 : 0;
      }
      case 'Saturn Systems':
        return cardTags.has('jovian') ? 3 : 0;
      case 'Septem Tribus':
        return (eLower.includes('delegate') || eLower.includes('делегат') || eLower.includes('influence') || eLower.includes('влиян')) ? 2 : 0;
      case 'Spire': {
        var spTagCount = cardTags.size || 0;
        return spTagCount >= 2 ? 2 : 0;
      }
      case 'Teractor':
        return cardTags.has('earth') ? 3 : 0;
      case 'Terralabs Research':
        return (eLower.includes('draw') || eLower.includes('card') || eLower.includes('карт')) ? 2 : (cardCost != null && cardCost <= 12) ? 1 : 0;
      case 'Thorgate': // also -3 MC on Power Plant SP (not reflected in card boost)
        return cardTags.has('power') ? 3 : 0;
      case 'Tycho Magnetics':
        // Action: spend X energy → draw X, keep 1. Energy prod = better filtration
        if (cardTags.has('power') || eLower.includes('energy prod') || eLower.includes('энерг')) return 2;
        return 0;
      case 'United Nations Mars Initiative': {
        var uFx = getFx(opts.cardName);
        return (uFx && (uFx.tr || uFx.actTR)) ? 2 : 0;
      }
      case 'Utopia Invest':
        return (eLower.includes('prod') || eLower.includes('прод')) ? 1 : 0;
      case 'Valley Trust':
        return cardTags.has('science') ? 2 : 0;
      case 'Vitor': {
        var vFx = getFx(opts.cardName);
        return (vFx && (vFx.vp > 0 || vFx.vpAcc > 0)) ? 2 : 0;
      }
      case 'Gagarin Mobile Base':
        return (eLower.includes('tile') || eLower.includes('тайл') || eLower.includes('city') || eLower.includes('greenery')) ? 2 : 0;
      // Pathfinders corps
      case 'Ambient':
        // Action: when temp maxed, spend 8 heat → 1 TR (repeatable)
        return (eLower.includes('heat') || eLower.includes('тепл')) ? 2 : 0;
      case 'Mars Maths':
        // Action: take 2 extra actions per gen
        return opts.cardType === 'blue' ? 1 : 0; // more actions = more blue card activations
      case 'Bio-Sol':
        // Action: add 1 microbe to any card
        return cardTags.has('microbe') ? 2 : (eLower.includes('microbe') || eLower.includes('микроб')) ? 1 : 0;
      case 'Collegium Copernicus':
        // Action: spend 3 data → trade. Science tag corp
        return cardTags.has('science') ? 2 : 0;
      case 'Robin Haulings':
        // Action: remove 3 floaters → raise Venus or O₂
        return (eLower.includes('floater') || eLower.includes('venus')) ? 2 : 0;
      case 'Odyssey':
        // Action: replay event (≤16 MC). Events more valuable
        return opts.cardType === 'red' ? 2 : cardTags.has('event') ? 2 : 0;
      case 'Mind Set Mars':
        // Action: agenda resources ↔ delegates
        return (eLower.includes('delegate') || eLower.includes('делегат')) ? 2 : 0;
      // Underworld corps
      case 'Henkei Genetics':
        return cardTags.has('microbe') ? 2 : 0;
      case 'Arborist Collective':
        return cardTags.has('plant') ? 2 : (eLower.includes('plant') && eLower.includes('prod')) ? 1 : 0;
      case 'Keplertec':
        return cardTags.has('space') ? 1 : 0;
      case 'Voltagon':
        // Action: spend 8 energy → raise O₂ or Venus
        return (cardTags.has('power') || eLower.includes('energy prod')) ? 2 : 0;
      case 'Anubis Securities':
        return cardTags.has('crime') ? 2 : 0;
      // Moon corps
      case 'Nanotech Industries':
        // Action: add 1 science resource to any card
        return cardTags.has('science') ? 2 : (eLower.includes('resource') || eLower.includes('ресурс')) ? 1 : 0;
      case 'Luna Hyperloop Corporation':
        return (eLower.includes('road') || eLower.includes('moon')) ? 1 : cardTags.has('building') ? 1 : 0;
      case 'The Archaic Foundation Institute':
        return (eLower.includes('resource') || eLower.includes('ресурс')) ? 1 : 0;
      case 'Tempest Consultancy':
        return (eLower.includes('delegate') || cardTags.has('moon')) ? 1 : 0;
      case 'The Darkside of The Moon Syndicate':
        return cardTags.has('space') ? 1 : 0; // spend ti → fleet → steal MC
      case 'Hadesphere':
        return cardTags.has('building') ? 1 : 0; // excavation synergy
      case 'Demetron Labs':
        return cardTags.has('science') ? 1 : 0; // data → identify → claim
      case 'Jenson-Boyle & Co':
        return cardTags.has('crime') ? 2 : 0; // corruption synergy
      default: return 0;
    }
  }

  // ── Extracted scoring helpers for scoreDraftCard ──

  // 36. Map-aware Milestone/Award bonuses
  function _scoreMapMA(data, cardTags, cardCost, ctx, SC) {
    var bonus = 0, reasons = [];
    if ((!ctx.milestones || ctx.milestones.size === 0) && (!ctx.awards || ctx.awards.size === 0)) return { bonus: bonus, reasons: reasons };
    if (!cardTags || cardTags.size === 0) return { bonus: bonus, reasons: reasons };
    var eLow = data.e ? data.e.toLowerCase() : '';

    // Milestones
    if (ctx.milestones.has('Diversifier')) {
      // Skip on gen 1 — all tags are "new", bonus doesn't discriminate
      var uniqueTagCount = 0;
      // Milestones check tableau only (not hand) — milestone conditions are on-board
      if (ctx.tags) { for (var tk in ctx.tags) { if (ctx.tags[tk] > 0 && tk !== 'event') uniqueTagCount++; } }
      if (uniqueTagCount >= 3) {
        for (var tag of cardTags) { if ((ctx.tags[tag] || 0) === 0 && tag !== 'event') { bonus += SC.hellasDiversifier; reasons.push('Diversifier +' + SC.hellasDiversifier); break; } }
      }
    }
    if (ctx.milestones.has('Rim Settler') && cardTags.has('jovian')) { bonus += SC.hellasJovian; reasons.push('Rim Settler +' + SC.hellasJovian); }
    if (ctx.milestones.has('Energizer') && (cardTags.has('power') || eLow.includes('energy-prod'))) { bonus += SC.hellasEnergizer; reasons.push('Energizer +' + SC.hellasEnergizer); }
    if (ctx.milestones.has('Ecologist')) {
      var bioTags = ['plant', 'animal', 'microbe'];
      for (var bt = 0; bt < bioTags.length; bt++) { if (cardTags.has(bioTags[bt])) { bonus += SC.elysiumEcologist; reasons.push('Ecologist +' + SC.elysiumEcologist); break; } }
    }
    if (ctx.milestones.has('Legend') && cardTags.has('event')) { bonus += SC.elysiumLegend; reasons.push('Legend +' + SC.elysiumLegend); }
    if (ctx.milestones.has('Builder') && cardTags.has('building')) { bonus += SC.tharsisBuilder; reasons.push('Builder +' + SC.tharsisBuilder); }
    if (ctx.milestones.has('Mayor') && eLow.includes('city')) { bonus += SC.tharsisMayor; reasons.push('Mayor +' + SC.tharsisMayor); }
    var _ma = SC.maGenericBonus;
    if (ctx.milestones.has('Tactician') || ctx.milestones.has('Tactician4')) { if (data.w && data.w.toLowerCase().includes('req')) { bonus += _ma; reasons.push('Tactician +' + _ma); } }
    if (ctx.milestones.has('Hydrologist') || ctx.milestones.has('Polar Explorer')) { if (eLow.includes('ocean')) { bonus += _ma; reasons.push('Hydrologist +' + _ma); } }
    if (ctx.milestones.has('Gardener') && (eLow.includes('greenery') || eLow.includes('plant-prod'))) { bonus += _ma; reasons.push('Gardener +' + _ma); }
    if (ctx.milestones.has('Geologist') && (eLow.includes('steel-prod') || eLow.includes('ti-prod'))) { bonus += _ma; reasons.push('Geologist +' + _ma); }
    if (ctx.milestones.has('Terraformer') && eLow.includes('tr')) { bonus += _ma; reasons.push('Terraformer +' + _ma); }
    if (ctx.milestones.has('Planner') && (eLow.includes('card') || eLow.includes('draw'))) { bonus += _ma; reasons.push('Planner +' + _ma); }
    if (ctx.milestones.has('Generalist')) {
      var prodTypes = ['mc-prod', 'steel-prod', 'ti-prod', 'plant-prod', 'energy-prod', 'heat-prod'];
      for (var pi = 0; pi < prodTypes.length; pi++) { if (eLow.includes(prodTypes[pi])) { bonus += _ma; reasons.push('Generalist +' + _ma); break; } }
    }
    if (ctx.milestones.has('Briber') && (eLow.includes('delegate') || eLow.includes('influence'))) { bonus += _ma; reasons.push('Briber +' + _ma); }
    if (ctx.milestones.has('Terran') && cardTags.has('earth')) { bonus += _ma; reasons.push('Terran +' + _ma); }
    if (ctx.milestones.has('Architect') && cardTags.has('building')) { bonus += _ma; reasons.push('Architect +' + _ma); }
    if (ctx.milestones.has('T. Collector') && cardTags.size >= 2) { bonus += Math.round(_ma * 0.5); reasons.push('T.Coll +' + Math.round(_ma * 0.5)); }
    if (ctx.milestones.has('Tropicalist') && eLow.includes('ocean')) { bonus += _ma; reasons.push('Tropicalist +' + _ma); }

    // Awards
    if (ctx.awards.has('Scientist') && cardTags.has('science')) { bonus += _ma; reasons.push('Scientist +' + _ma); }
    if (ctx.awards.has('Celebrity') && cardCost != null && cardCost >= 15) { bonus += SC.elysiumCelebrity; reasons.push('Celebrity +' + SC.elysiumCelebrity); }
    if (ctx.awards.has('Banker') && eLow.includes('mc-prod')) { bonus += _ma; reasons.push('Banker +' + _ma); }
    if (ctx.awards.has('Manufacturer') || ctx.awards.has('Contractor')) {
      var awardName = ctx.awards.has('Manufacturer') ? 'Manufacturer' : 'Contractor';
      if (cardTags.has('building')) { bonus += _ma; reasons.push(awardName + ' +' + _ma); }
    }
    if (ctx.awards.has('Thermalist') && eLow.includes('heat')) { bonus += _ma; reasons.push('Thermalist +' + _ma); }
    if (ctx.awards.has('Miner') && (eLow.includes('steel') || eLow.includes('ti-prod') || eLow.includes('titanium'))) { bonus += _ma; reasons.push('Miner +' + _ma); }
    if (ctx.awards.has('Space Baron') && cardTags.has('space')) { bonus += _ma; reasons.push('Space Baron +' + _ma); }
    if (ctx.awards.has('Industrialist') && (eLow.includes('energy-prod') || eLow.includes('steel-prod'))) { bonus += _ma; reasons.push('Industrialist +' + _ma); }
    if (ctx.awards.has('Cultivator') && (eLow.includes('plant-prod') || eLow.includes('greenery'))) { bonus += _ma; reasons.push('Cultivator +' + _ma); }
    if (ctx.awards.has('Benefactor') && eLow.includes('tr')) { bonus += _ma; reasons.push('Benefactor +' + _ma); }

    return { bonus: bonus, reasons: reasons };
  }

  // 48. SYNERGY_RULES — placer/accumulator/eater mechanical synergies
  function _scoreSynergyRules(cardName, allMyCards, ctx, SC) {
    var bonus = 0, reasons = [];
    if (typeof TM_CARD_EFFECTS === 'undefined') return { bonus: bonus, reasons: reasons };
    var fx48 = TM_CARD_EFFECTS[cardName];
    if (!fx48) return { bonus: bonus, reasons: reasons };

    function canReach(placerFx, targetFx, targetName) {
      if (!placerFx.placesTag) return true;
      var tg = targetFx.tg;
      var tags = Array.isArray(tg) ? tg.slice() : (tg ? [tg] : []);
      if (targetName) {
        var targetCardTags = getCardTagsForName(targetName);
        for (var tgi48 = 0; tgi48 < targetCardTags.length; tgi48++) {
          if (tags.indexOf(targetCardTags[tgi48]) === -1) tags.push(targetCardTags[tgi48]);
        }
      }
      return tags.indexOf(placerFx.placesTag) !== -1;
    }
    function getPlaceCount(fx) {
      return Math.max(1, fx && fx.placesN ? fx.placesN : 1);
    }

    var synRulesBonus = 0;

    // 48a. Placer → accumulators in tableau
    if (fx48.places) {
      var placeTypes = Array.isArray(fx48.places) ? fx48.places : [fx48.places];
      var placeCount48 = getPlaceCount(fx48);
      for (var pt = 0; pt < placeTypes.length; pt++) {
        var targetCount = 0;
        for (var m = 0; m < allMyCards.length; m++) {
          var mfx = TM_CARD_EFFECTS[allMyCards[m]];
          if (mfx && mfx.res === placeTypes[pt] && canReach(fx48, mfx, allMyCards[m])) targetCount++;
        }
        if (targetCount > 0) {
          var placeCountMul48 = Math.min(1.8, 1 + (placeCount48 - 1) * 0.25);
          var placerBonus = Math.min(targetCount * SC.placerPerTarget * placeCountMul48, SC.placerTargetCap + Math.max(0, placeCount48 - 1));
          synRulesBonus += placerBonus;
          reasons.push(targetCount + ' ' + placeTypes[pt] + ' цель' + (placeCount48 > 1 ? ' ×' + placeCount48 : ''));
        }
      }
      // 48e. Placer без целей
      for (var pt48e = 0; pt48e < placeTypes.length; pt48e++) {
        var hasTarget = false;
        for (var m48e = 0; m48e < allMyCards.length; m48e++) {
          var mfx48e = TM_CARD_EFFECTS[allMyCards[m48e]];
          if (mfx48e && mfx48e.res === placeTypes[pt48e] && canReach(fx48, mfx48e, allMyCards[m48e])) { hasTarget = true; break; }
        }
        if (!hasTarget) {
          synRulesBonus -= SC.noTargetPenalty;
          reasons.push('Нет ' + placeTypes[pt48e] + ' целей −' + SC.noTargetPenalty);
        }
      }
    }

    // 48b. Accumulator → placers in tableau
    if (fx48.res) {
      var placerCount = 0;
      for (var m = 0; m < allMyCards.length; m++) {
        var mfx = TM_CARD_EFFECTS[allMyCards[m]];
        if (mfx && mfx.places) {
          var mpt = Array.isArray(mfx.places) ? mfx.places : [mfx.places];
          if (mpt.indexOf(fx48.res) !== -1 && canReach(mfx, fx48, cardName)) placerCount++;
        }
      }
      if (placerCount > 0) {
        var accumBonus = Math.min(placerCount, 2) * SC.accumWithPlacer;
        synRulesBonus += accumBonus;
        reasons.push(placerCount + ' placer для ' + fx48.res);
      }
      // 48c. Accumulator competition
      var competitorCount = 0;
      for (var mc = 0; mc < allMyCards.length; mc++) {
        var mfxc = TM_CARD_EFFECTS[allMyCards[mc]];
        if (mfxc && mfxc.res === fx48.res && allMyCards[mc] !== cardName) competitorCount++;
      }
      if (competitorCount >= 2) {
        synRulesBonus -= SC.accumCompete;
        reasons.push('конкуренция ' + fx48.res + ' (' + (competitorCount + 1) + ' шт)');
      }
    }

    // 48d. Resource eater
    if (fx48.eats) {
      var eatType = fx48.eats;
      var ownAccumCount = 0;
      for (var me = 0; me < allMyCards.length; me++) {
        var mfxe = TM_CARD_EFFECTS[allMyCards[me]];
        if (mfxe && mfxe.res === eatType && allMyCards[me] !== cardName) ownAccumCount++;
      }
      if (ownAccumCount > 0) {
        var eatPenalty = SC.eatsOwnPenalty * Math.min(ownAccumCount, 2);
        synRulesBonus -= eatPenalty;
        reasons.push('ест свои ' + eatType + ' (' + ownAccumCount + ') −' + eatPenalty);
      }
      if (ctx) {
        var oppTgt = eatType === 'animal' ? (ctx.oppAnimalTargets || 0) : eatType === 'microbe' ? (ctx.oppMicrobeTargets || 0) : 0;
        if (oppTgt > 0) {
          var eatBonus = Math.min(SC.eatsOppBonus + Math.min(oppTgt - 1, 2), SC.eatsOppBonus + 2);
          synRulesBonus += eatBonus;
          reasons.push('опп. ' + eatType + ' (' + oppTgt + ') +' + eatBonus);
        }
      }
    }

    bonus = Math.min(synRulesBonus, SC.synRulesCap);
    return { bonus: bonus, reasons: reasons };
  }

  // Prelude-specific scoring
  function _scorePrelude(cardName, data, cardEl, myCorp, ctx, SC) {
    var bonus = 0, reasons = [];
    var detectedName = cardEl ? getCardName(cardEl) : null;
    var isPrelude = cardEl && (
      cardEl.closest('.wf-component--select-prelude') ||
      cardEl.classList.contains('prelude-card') ||
      getCardTypeByName(detectedName) === 'prelude'
    );
    if (!isPrelude || !ctx) return { bonus: bonus, reasons: reasons };

    // Gen 1 production bonus
    if (ctx.gen <= 1) {
      var econLower = (data.e || '').toLowerCase();
      if (econLower.includes('прод') || econLower.includes('prod') || econLower.includes('production')) {
        bonus += SC.preludeEarlyProd; reasons.push('Прод ген.1 +' + SC.preludeEarlyProd);
      }
      if (econLower.includes('tr') || econLower.includes('terraform')) {
        bonus += SC.preludeEarlyTR; reasons.push('Ранний TR +' + SC.preludeEarlyTR);
      }
      if (econLower.includes('steel') || econLower.includes('стал') || econLower.includes('titanium') || econLower.includes('титан')) {
        bonus += SC.preludeEarlyResources; reasons.push('Ресурсы ген.1 +' + SC.preludeEarlyResources);
      }
    }
    // Tag value on prelude
    if (cardEl) {
      var pTags = getCardTags(cardEl);
      if (pTags.size > 0 && ctx.tagTriggers) {
        var tagBonus = 0;
        for (var trigger of ctx.tagTriggers) {
          if (trigger.eventOnly) continue; // preludes are never events
          for (var tTag of (trigger.tags || [])) { if (pTags.has(tTag)) tagBonus += trigger.value; }
        }
        if (tagBonus > 0) { bonus += Math.min(SC.preludeTagCap, tagBonus); reasons.push('Теги прел. +' + Math.min(SC.preludeTagCap, tagBonus)); }
      }
    }
    // Corp+prelude combo
    if (myCorp && typeof TM_COMBOS !== 'undefined') {
      for (var ci = 0; ci < TM_COMBOS.length; ci++) {
        var combo = TM_COMBOS[ci];
        if (!combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
        var ratingBonus = combo.r === 'godmode' ? SC.preludeCorpGodmode : combo.r === 'great' ? SC.preludeCorpGreat : combo.r === 'good' ? SC.preludeCorpGood : SC.preludeCorpDecent;
        bonus += ratingBonus; reasons.push('Комбо с ' + myCorp + ' +' + ratingBonus);
        break;
      }
    }
    if (cardName === 'Established Methods') {
      var premiumColonies = new Set(['Luna', 'Pluto', 'Titan', 'Ganymede', 'Europa', 'Ceres']);
      var visibleColonies = typeof getVisibleColonyNames === 'function' ? getVisibleColonyNames() : [];
      var colonyHits = 0;
      for (var vci = 0; vci < visibleColonies.length; vci++) {
        if (premiumColonies.has(visibleColonies[vci])) colonyHits++;
      }
      if (colonyHits >= 2) {
        bonus += 3;
        reasons.push('premium colonies +3');
      } else if (colonyHits === 1) {
        bonus += 1;
        reasons.push('premium colony +1');
      }
      if (myCorp === 'Poseidon') {
        bonus += 2;
        reasons.push('Poseidon colony SP +2');
      }
      if (myCorp === 'Thorgate') {
        bonus += 2;
        reasons.push('Thorgate power SP +2');
      }
      if (myCorp === 'CrediCor') {
        bonus += 2;
        reasons.push('CrediCor city/greenery SP +2');
      }
      var visibleCeos = typeof getVisibleCeoNames === 'function' ? getVisibleCeoNames() : [];
      if (visibleCeos.indexOf('Sagitta Frontier Services') >= 0) {
        bonus += 1;
        reasons.push('Sagitta +1');
      }
    }
    // Prelude-prelude synergy
    if (typeof TM_COMBOS !== 'undefined') {
      var preludeEls = document.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card]');
      var otherPreludes = [];
      preludeEls.forEach(function(pel) {
        var pName = pel.getAttribute('data-tm-card');
        if (!pName || pName === cardName) return;
        otherPreludes.push(pName);
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (combo.cards.includes(cardName) && combo.cards.includes(pName)) {
            var rBonus = combo.r === 'godmode' ? SC.preludePreludeGodmode : combo.r === 'great' ? SC.preludePreludeGreat : combo.r === 'good' ? SC.preludePreludeGood : SC.preludePreludeDecent;
            bonus += rBonus; reasons.push('Прел.+' + (ruName(pName) || pName).substring(0, 12) + ' +' + rBonus);
          }
        }
      });
      // Triple synergy
      if (myCorp && otherPreludes.length > 0) {
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (combo.cards.length < 3 || !combo.cards.includes(cardName) || !combo.cards.includes(myCorp)) continue;
          for (var oi = 0; oi < otherPreludes.length; oi++) {
            if (combo.cards.includes(otherPreludes[oi])) {
              var matched = 2; // cardName + myCorp already confirmed
              for (var mi = 0; mi < otherPreludes.length; mi++) {
                if (combo.cards.includes(otherPreludes[mi])) matched++;
              }
              if (matched >= combo.cards.length) {
                var triBonus = combo.r === 'godmode' ? SC.preludeTripleGodmode : combo.r === 'great' ? SC.preludeTripleGreat : combo.r === 'good' ? SC.preludeTripleGood : SC.preludeTripleDecent;
                bonus += triBonus; reasons.push('★ Тройное комбо! +' + triBonus);
              } else {
                var partialBonus = combo.r === 'godmode' ? SC.preludePartialGodmode : combo.r === 'great' ? SC.preludePartialGreat : SC.preludePartialDecent;
                bonus += partialBonus; reasons.push('Тройное частичное 3/' + combo.cards.length + ' +' + partialBonus);
              }
            }
          }
        }
        // Rare tag synergy
        for (var oi = 0; oi < otherPreludes.length; oi++) {
          var otherData = TM_RATINGS[otherPreludes[oi]];
          if (!otherData || !otherData.g || !data.g) continue;
          var sharedTags = data.g.filter(function(t) { return otherData.g && otherData.g.includes(t); });
          var rareShared = sharedTags.filter(function(t) { return ['Jovian','Science','Venus','Earth'].includes(t); });
          if (rareShared.length > 0) {
            bonus += SC.preludeRareTagSynergy; reasons.push('Прелюдии: ' + rareShared[0] + ' синергия +' + SC.preludeRareTagSynergy);
          }
        }
      }
    }
    return { bonus: bonus, reasons: reasons };
  }

  function pushStructuredReason(reasons, reasonRows, text, value, tone) {
    if (!text) return;
    reasons.push(text);
    if (!reasonRows) return;
    var row = {
      text: text,
      tone: tone || ((typeof value === 'number' && value < 0) ? 'negative' : 'positive')
    };
    if (typeof value === 'number' && isFinite(value)) row.value = value;
    reasonRows.push(row);
  }

  // Apply {bonus, reasons, reasonRows?} result to running totals
  function applyResult(result, bonus, reasons, reasonRows) {
    if (!result) return bonus;
    for (var i = 0; i < result.reasons.length; i++) reasons.push(result.reasons[i]);
    if (reasonRows && result.reasonRows && result.reasonRows.length > 0) {
      var mergedRows = mergeReasonRows(reasonRows, result.reasonRows);
      reasonRows.length = 0;
      for (var ri = 0; ri < mergedRows.length; ri++) reasonRows.push(mergedRows[ri]);
    }
    return bonus + result.bonus;
  }

  // Hand synergy: how well does this card pair with OTHER cards in hand (not tableau)
  // Captures enabler→payoff relationships that tableau synergy and combo index miss
  function scoreHandSynergy(cardName, myHand, ctx) {
    var bonus = 0;
    var descs = [];
    var forceHandReasonVisibility = false;
    if (!myHand || myHand.length === 0) return { bonus: 0, reasons: [], reasonRows: [] };
    if (isPreludeOrCorpName(cardName)) return { bonus: 0, reasons: [], reasonRows: [] };
    var gensLeft = ctx ? ctx.gensLeft : 5;
    var handSet = new Set(myHand);

    // Get card's tags
    var getCardTagsLocal = function(n) {
      if (typeof TM_CARD_TAGS !== 'undefined') {
        var tags = _lookupCardData(TM_CARD_TAGS, n);
        if (tags) return tags;
      }
      return [];
    };
    var cardTagsArr = getCardTagsLocal(cardName);
    var isEvent = cardTagsArr.indexOf('event') >= 0;
    var isSpaceEvent = isEvent && cardTagsArr.indexOf('space') >= 0;
    var _effData = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : {};
    var cardEff = _effData[cardName] || {};

    // Pre-build hand tag index (tag → count, card → tags cache)
    var handTagMap = {};   // tag → [cardName, ...]
    var handTagCache = {}; // cardName → tags[]
    for (var _hti = 0; _hti < myHand.length; _hti++) {
      var _htn = myHand[_hti];
      var _htTags = getCardTagsLocal(_htn);
      handTagCache[_htn] = _htTags;
      for (var _htj = 0; _htj < _htTags.length; _htj++) {
        var _htTag = _htTags[_htj];
        if (!handTagMap[_htTag]) handTagMap[_htTag] = [];
        handTagMap[_htTag].push(_htn);
      }
    }

    // Global headroom multipliers: reduce stacking bonus when globals are closing
    var gp = ctx && ctx.globalParams ? ctx.globalParams : {};
    var tempStepsLeft = typeof gp.temp === 'number' ? Math.max(0, (8 - gp.temp) / 2) : 19; // 19 total steps
    var oxyStepsLeft = typeof gp.oxy === 'number' ? Math.max(0, 14 - gp.oxy) : 14;
    var ocStepsLeft = ctx && typeof ctx.oceansOnBoard === 'number' ? Math.max(0, 9 - ctx.oceansOnBoard) : 9;
    var vnStepsLeft = typeof gp.venus === 'number' ? Math.max(0, (30 - gp.venus) / 2) : 15;
    // Headroom factor: 1.0 = fully open, 0.2 = nearly closed (enough for 1 card still)
    var tempHR = tempStepsLeft >= 3 ? 1.0 : Math.max(0.2, tempStepsLeft / 3);
    var plantHR = oxyStepsLeft >= 3 ? 1.0 : Math.max(0.2, oxyStepsLeft / 3);
    var ocHR = ocStepsLeft >= 2 ? 1.0 : Math.max(0.2, ocStepsLeft / 2);
    var vnHR = vnStepsLeft >= 3 ? 1.0 : Math.max(0.2, vnStepsLeft / 3);
    function getHandRequirementTiming(targetCardName) {
      var status = { metNow: true, playableSoon: true, softBlocked: false, hardBlocked: false };
      if (!ctx || !ctx.globalParams) return status;

      var globalReqsHS = (typeof TM_CARD_GLOBAL_REQS !== 'undefined')
        ? (_lookupCardData ? _lookupCardData(TM_CARD_GLOBAL_REQS, targetCardName) : TM_CARD_GLOBAL_REQS[targetCardName])
        : null;
      var tagReqsHS = (typeof TM_CARD_TAG_REQS !== 'undefined')
        ? (_lookupCardData ? _lookupCardData(TM_CARD_TAG_REQS, targetCardName) : TM_CARD_TAG_REQS[targetCardName])
        : null;
      if (!globalReqsHS && !tagReqsHS) return status;

      var reqFlexCorpsHS = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
      var reqFlexHS = getRequirementFlexSteps(targetCardName, reqFlexCorpsHS);
      var reqHandStepsHS = { temperature: 0, oxygen: 0, oceans: 0, venus: 0 };
      for (var rhs = 0; rhs < myHand.length; rhs++) {
        if (myHand[rhs] === targetCardName) continue;
        var rhsEff = _effData[myHand[rhs]];
        if (!rhsEff) continue;
        if (rhsEff.tmp) reqHandStepsHS.temperature += rhsEff.tmp;
        if (rhsEff.o2) reqHandStepsHS.oxygen += rhsEff.o2;
        if (rhsEff.oc) reqHandStepsHS.oceans += rhsEff.oc;
        if (rhsEff.vn) reqHandStepsHS.venus += rhsEff.vn;
        if (rhsEff.grn) reqHandStepsHS.oxygen += rhsEff.grn;
      }

      if (globalReqsHS) {
        var reqParamMapHS = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
        for (var reqParamHS in reqParamMapHS) {
          var reqObjHS = globalReqsHS[reqParamHS];
          if (!reqObjHS) continue;
          var curValHS = gp[reqParamMapHS[reqParamHS]] || 0;
          var stepHS = reqParamHS === 'temperature' ? 2 : (reqParamHS === 'venus' ? 2 : 1);
          var flexStepsHS = reqFlexHS.any + (reqParamHS === 'venus' ? reqFlexHS.venus : 0);

          if (reqObjHS.min != null) {
            var effectiveMinHS = reqObjHS.min - flexStepsHS * stepHS;
            if (curValHS < effectiveMinHS) {
              status.metNow = false;
              var gapHS = effectiveMinHS - curValHS;
              var stepsNeededHS = Math.ceil(gapHS / stepHS);
              var netStepsHS = Math.max(0, stepsNeededHS - (reqHandStepsHS[reqParamHS] || 0));
              if (netStepsHS > 0) {
                var othersRateHS = 1;
                var pvHS = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
                if (pvHS && pvHS.game && pvHS.game.gameOptions) {
                  var wgtHS = pvHS.game.gameOptions.solarPhaseOption;
                  var plHS = (pvHS.game.players || []).length || 3;
                  othersRateHS = (wgtHS ? 1 : 0) + Math.max(0, (plHS - 1) * 0.5);
                }
                var adjustedNetHS = Math.max(0, netStepsHS - Math.round(othersRateHS * ctx.gensLeft * 0.3));
                if ((ctx.gensLeft <= 1 && adjustedNetHS > 0) || adjustedNetHS > ctx.gensLeft || netStepsHS >= 3) status.hardBlocked = true;
                else status.softBlocked = true;
              } else {
                status.softBlocked = true;
              }
            }
          }

          if (reqObjHS.max != null) {
            var effectiveMaxHS = reqObjHS.max + flexStepsHS * stepHS;
            if (curValHS > effectiveMaxHS) {
              status.metNow = false;
              status.hardBlocked = true;
            }
          }
        }
      }

      if (tagReqsHS) {
        var myTagsHS = ctx.tags || {};
        var handTagsHS = getRequirementHandTagCounts(targetCardName);
        for (var reqTagHS in tagReqsHS) {
          if (typeof tagReqsHS[reqTagHS] === 'object') continue;
          var needHS = tagReqsHS[reqTagHS];
          var haveNowHS = myTagsHS[reqTagHS] || 0;
          var haveSoonHS = haveNowHS + (handTagsHS[reqTagHS] || 0);
          if (haveNowHS < needHS) {
            status.metNow = false;
            if (haveSoonHS < needHS) {
              if ((needHS - haveSoonHS) > 1 || ctx.gensLeft <= 1) status.hardBlocked = true;
              else status.softBlocked = true;
            } else {
              status.softBlocked = true;
            }
          }
        }
      }

      status.playableSoon = !status.hardBlocked;
      return status;
    }
    var reqTiming = getHandRequirementTiming(cardName);
    var supportTimingCache = Object.create(null);
    function isSupportPlayableSoon(supportCardName) {
      if (!supportCardName || !handSet.has(supportCardName)) return false;
      var cached = supportTimingCache[supportCardName];
      if (!cached) {
        cached = getHandRequirementTiming(supportCardName);
        supportTimingCache[supportCardName] = cached;
      }
      return !!cached.playableSoon;
    }
    var canUseLateVPNow = reqTiming.metNow || (gensLeft >= 2 && reqTiming.playableSoon);
    var canUseFundingNow = !reqTiming.hardBlocked;

    if (cardName === 'Harvest' && ctx && ctx.gen <= 2 && (ctx.greeneries || 0) === 0) {
      var HARVEST_RUSH_CARDS = {
        'Arctic Algae': true,
        'Kelp Farming': true,
        'Nitrogen-Rich Asteroid': true,
        'Bushes': true,
        'Trees': true,
        'Grass': true,
        'Farming': true,
        'Nitrophilic Moss': true,
        'Imported Hydrogen': true,
        'Imported Nitrogen': true,
        'Ecological Zone': true
      };
      var harvestRushHits = 0;
      for (var hri = 0; hri < myHand.length; hri++) {
        if (myHand[hri] === cardName) continue;
        if (HARVEST_RUSH_CARDS[myHand[hri]]) harvestRushHits++;
      }
      var harvestCorps = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
      if (harvestCorps.indexOf('EcoLine') >= 0) harvestRushHits++;
      if (harvestRushHits >= 3) {
        bonus += 2;
        forceHandReasonVisibility = true;
        descs.push('Harvest rush shell +2 (' + harvestRushHits + ')');
      } else if (harvestRushHits <= 1) {
        bonus -= 4;
        forceHandReasonVisibility = true;
        descs.push('Harvest rush shell weak -4');
      }
    }

    if (cardName === 'Soil Studies' && (isOpeningHandContext(ctx) || (ctx && ctx.gen <= 1))) {
      var soilBonus = 0;
      var soilReasons = [];
      var soilVisibleColonies = new Set(getVisibleColonyNames());
      var soilVisiblePreludes = getVisiblePreludeNames();
      var soilEngineColonies = ['Luna', 'Pluto', 'Triton', 'Ceres'];
      var soilVisibleEngine = [];
      var soilPlantSupport = 0;
      var soilVenusSupport = 0;
      var soilColonySupport = 0;
      var soilSupportNames = [];
      for (var sci = 0; sci < soilEngineColonies.length; sci++) {
        if (soilVisibleColonies.has(soilEngineColonies[sci])) soilVisibleEngine.push(soilEngineColonies[sci]);
      }
      for (var shi = 0; shi < myHand.length; shi++) {
        var soilSupportName = myHand[shi];
        if (!soilSupportName || soilSupportName === cardName) continue;
        soilSupportNames.push(soilSupportName);
      }
      for (var spi = 0; spi < soilVisiblePreludes.length; spi++) {
        if (soilVisiblePreludes[spi] && soilVisiblePreludes[spi] !== cardName) soilSupportNames.push(soilVisiblePreludes[spi]);
      }
      var soilSeenSupport = new Set();
      for (var ssi = 0; ssi < soilSupportNames.length; ssi++) {
        var soilName = soilSupportNames[ssi];
        if (!soilName || soilSeenSupport.has(soilName)) continue;
        soilSeenSupport.add(soilName);
        var soilTags = handTagCache[soilName];
        if (!soilTags) soilTags = getCardTagsForName(soilName);
        var soilTagSet = new Set(soilTags.map(function(t) { return String(t || '').toLowerCase(); }));
        if (soilTagSet.has('plant') || soilTagSet.has('wild')) soilPlantSupport++;
        if (soilTagSet.has('venus') || soilTagSet.has('wild')) soilVenusSupport++;
        var soilFx = getFx(soilName);
        if (soilFx && (soilFx.col > 0 || soilFx.colony > 0)) soilColonySupport++;
      }
      var soilSupportHits = soilPlantSupport + soilVenusSupport + soilColonySupport;
      if (soilSupportHits === 0) {
        soilBonus -= 4;
        soilReasons.push('Soil shell thin -4');
      } else if (soilSupportHits === 1) {
        soilBonus -= 2;
        soilReasons.push('Soil shell thin -2');
      } else if (soilSupportHits >= 3) {
        var soilShellBonus = Math.min(3, soilSupportHits - 2);
        soilBonus += soilShellBonus;
        soilReasons.push('Soil shell +' + soilShellBonus + ' (' + soilSupportHits + ')');
      }
      if (soilVisibleEngine.length >= 3 && soilSupportHits <= 2) {
        soilBonus -= 4;
        soilReasons.push(soilVisibleEngine.join('/') + ' engine start -4');
      } else if (soilVisibleEngine.length >= 2 && soilSupportHits <= 1) {
        soilBonus -= 3;
        soilReasons.push(soilVisibleEngine.join('/') + ' engine start -3');
      }
      if (handSet.has('Neptunian Power Consultants') && soilSupportHits <= 2) {
        soilBonus -= 1;
        soilReasons.push('NPC/engine opener -1');
      }
      if (soilBonus !== 0) {
        bonus += soilBonus;
        forceHandReasonVisibility = true;
        descs.push(soilReasons.join(', '));
      }
    }

    if (cardName === 'Sky Docks' && (isOpeningHandContext(ctx) || (ctx && ctx.gen <= 1))) {
      var skyBonus = 0;
      var skyReasons = [];
      var skyVisiblePreludes = getVisiblePreludeNames();
      var skyVisibleCeos = getVisibleCeoNames();
      var skyVisibleCorps = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
      var skySupportNames = [];
      for (var skh = 0; skh < myHand.length; skh++) {
        if (myHand[skh] && myHand[skh] !== cardName) skySupportNames.push(myHand[skh]);
      }
      for (var skp = 0; skp < skyVisiblePreludes.length; skp++) {
        if (skyVisiblePreludes[skp] && skyVisiblePreludes[skp] !== cardName) skySupportNames.push(skyVisiblePreludes[skp]);
      }
      for (var skc = 0; skc < skyVisibleCeos.length; skc++) {
        if (skyVisibleCeos[skc] && skyVisibleCeos[skc] !== cardName) skySupportNames.push(skyVisibleCeos[skc]);
      }
      var skySeenSupport = new Set();
      var skyEarthSupport = 0;
      for (var ssi2 = 0; ssi2 < skySupportNames.length; ssi2++) {
        var skyName = skySupportNames[ssi2];
        if (!skyName || skySeenSupport.has(skyName)) continue;
        skySeenSupport.add(skyName);
        var skyTags = handTagCache[skyName];
        if (!skyTags) skyTags = getCardTagsForName(skyName);
        var skyTagSet = new Set(skyTags.map(function(t) { return String(t || '').toLowerCase(); }));
        if (skyTagSet.has('earth') || skyTagSet.has('wild')) skyEarthSupport++;
      }
      if (skyVisibleCorps.indexOf('Point Luna') >= 0 || skyVisibleCorps.indexOf('Teractor') >= 0) {
        skyEarthSupport += 1;
      }
      if (skyEarthSupport <= 0) {
        skyBonus -= 4;
        skyReasons.push('Sky Docks waits for Earth shell -4');
      } else if (skyEarthSupport === 1) {
        skyBonus -= 2;
        skyReasons.push('Sky Docks waits for Earth shell -2');
      }
      if (skyBonus !== 0) {
        bonus += skyBonus;
        forceHandReasonVisibility = true;
        descs.push(skyReasons.join(', '));
      }
    }

    // ── 1. REBATES & TAG TRIGGERS in hand boost this card ──

    // Rush space events: raise globals (temp/ocean/oxygen/venus/TR) → tempo + Opt Aero heat = more rush
    var RUSH_SPACE_EVENTS = {
      'Asteroid': 1, 'Big Asteroid': 1, 'Comet': 1, 'Comet for Venus': 1, 'Convoy From Europa': 1,
      'Deimos Down': 1, 'GHG Import From Venus': 1, 'Giant Ice Asteroid': 1, 'Hydrogen to Venus': 1,
      'Ice Asteroid': 1, 'Imported Hydrogen': 1, 'Imported Nitrogen': 1, 'Large Convoy': 1,
      'Metallic Asteroid': 1, 'Nitrogen-Rich Asteroid': 1, 'Small Asteroid': 1, 'Small Comet': 1,
      'Solar Storm': 1, 'Spin-Inducing Asteroid': 1, 'Towing A Comet': 1, 'Water to Venus': 1
    };
    var isRushSpaceEvent = isSpaceEvent && RUSH_SPACE_EVENTS[cardName];

    // Optimal Aerobraking: rebate +3 MC +3 heat. Rush events get extra (heat → tempo)
    if (isSpaceEvent && handSet.has('Optimal Aerobraking') && cardName !== 'Optimal Aerobraking') {
      bonus += 3; // base rebate: +3 MC +3 heat always
      if (isRushSpaceEvent) { bonus += 1.5; descs.push('OptAero +4.5 rush'); }
      else { descs.push('OptAero +3'); }
    }
    // This card IS Optimal Aerobraking → count space events in hand
    if (cardName === 'Optimal Aerobraking') {
      var rushCount = 0, nonRushCount = 0;
      for (var oai = 0; oai < myHand.length; oai++) {
        var oaTags = handTagCache[myHand[oai]] || [];
        if (oaTags.indexOf('event') >= 0 && oaTags.indexOf('space') >= 0 && myHand[oai] !== cardName) {
          if (RUSH_SPACE_EVENTS[myHand[oai]]) rushCount++; else nonRushCount++;
        }
      }
      var total = rushCount + nonRushCount;
      if (total > 0) {
        bonus += Math.min(total * 2 + rushCount * 0.5, 8); // capped
        var oaDesc = total + ' space ev';
        if (rushCount > 0) oaDesc += ' (' + rushCount + ' rush)';
        descs.push(oaDesc);
      }
      if (isOpeningHandContext(ctx)) {
        var openerBoost = 0;
        var openerPieces = [];
        var visibleColonySet = new Set(getVisibleColonyNames());
        if (visibleColonySet.has('Triton')) {
          openerBoost += 1.5;
          openerPieces.push('Triton');
        }
        var visiblePreludes = getVisiblePreludeNames();
        if (visiblePreludes.indexOf('Experimental Forest') >= 0) {
          openerBoost += 1;
          openerPieces.push('ExpForest');
        }
        var visibleCeos = getVisibleCeoNames();
        if (visibleCeos.indexOf('Clarke') >= 0) {
          openerBoost += 1;
          openerPieces.push('Clarke');
        }
        if (handSet.has('Media Group')) {
          openerBoost += 1.5;
          openerPieces.push('Media');
        }
        if (openerBoost > 0) {
          bonus += Math.min(openerBoost, 5);
          descs.push('opener ' + openerPieces.join('+'));
        }
      }
    }

    // Media Group: this card is an event → +1.5 MC from Media trigger
    if (isEvent && handSet.has('Media Group') && cardName !== 'Media Group') {
      bonus += 1.5; descs.push('Media +1.5');
    }
    if (cardName === 'Media Group') {
      var eventsInHand = (handTagMap['event'] || []).length;
      if (eventsInHand > 0) { bonus += Math.min(eventsInHand * 1, 5); descs.push(eventsInHand + ' events'); }
    }

    if (cardName === 'Great Aquifer' && (isOpeningHandContext(ctx) || (ctx && ctx.gen <= 1))) {
      var gaBonus = 0;
      var gaReasons = [];
      var gaVisibleColonies = new Set(getVisibleColonyNames());
      var gaVisibleCorps = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
      var gaOceanPayoffs = ['Arctic Algae', 'Kelp Farming', 'Lakefront Resorts', 'Aquifer Pumping'];
      var gaEngineColonies = ['Luna', 'Pluto', 'Triton', 'Ceres'];
      var gaOceanHitCount = 0;
      var gaEngineHitCount = 0;
      for (var gai = 0; gai < gaOceanPayoffs.length; gai++) {
        if (handSet.has(gaOceanPayoffs[gai])) gaOceanHitCount++;
      }
      for (var gci = 0; gci < gaEngineColonies.length; gci++) {
        if (gaVisibleColonies.has(gaEngineColonies[gci])) gaEngineHitCount++;
      }
      if (gaOceanHitCount > 0) {
        var gaOceanBonus = Math.min(4, gaOceanHitCount * 2);
        gaBonus += gaOceanBonus;
        gaReasons.push(gaOceanHitCount + ' ocean payoffs +' + gaOceanBonus);
      }
      if (gaVisibleCorps.indexOf('EcoLine') >= 0) {
        gaBonus += 2;
        gaReasons.push('EcoLine ocean rush +2');
      }
      if (gaVisibleCorps.indexOf('Tharsis Republic') >= 0) {
        gaBonus += 1;
        gaReasons.push('Tharsis ocean spots +1');
      }
      if (gaEngineHitCount >= 4) {
        var gaEnginePenalty = 6;
        gaBonus -= gaEnginePenalty;
        gaReasons.push('Luna/Pluto/Triton/Ceres engine start -' + gaEnginePenalty);
      } else if (gaEngineHitCount >= 3) {
        var gaEnginePenalty = 5;
        gaBonus -= gaEnginePenalty;
        gaReasons.push('Luna/Pluto/Triton/Ceres engine start -' + gaEnginePenalty);
      } else if (gaEngineHitCount >= 2) {
        var gaEnginePenalty = 3;
        gaBonus -= gaEnginePenalty;
        gaReasons.push('Luna/Pluto/Triton/Ceres engine start -' + gaEnginePenalty);
      } else if (gaEngineHitCount === 1) {
        gaBonus -= 1;
        gaReasons.push('Luna/Pluto/Triton/Ceres engine start -1');
      }
      if (handSet.has('Neptunian Power Consultants')) {
        gaBonus -= 4;
        gaReasons.push('NPC wants future oceans -4');
        if (gaVisibleColonies.has('Europa')) {
          gaBonus -= 1;
          gaReasons.push('Europa may open oceans early -1');
        }
      }
      if (gaBonus !== 0) {
        bonus += gaBonus;
        descs.push(gaReasons.join(', '));
      }
    }

    // Earth Office: this card has earth tag → -3 MC
    if (cardTagsArr.indexOf('earth') >= 0 && handSet.has('Earth Office') && cardName !== 'Earth Office') {
      bonus += 3; descs.push('EarthOff скидка +3');
    }
    if (cardName === 'Earth Office') {
      var earthTargets = (handTagMap['earth'] || []).filter(function(n) { return n !== cardName && !isPreludeOrCorpName(n); });
      if (earthTargets.length > 0) {
        var earthOfficeBonus = Math.min(earthTargets.length * 1.5, 6);
        bonus += earthOfficeBonus;
        descs.push(formatDiscountTargetReason({ earth: 3 }, earthTargets, earthOfficeBonus));
      }
    }

    // ── 2. RESOURCE PLACEMENT ──
    var animalVPInHand = myHand.filter(function(n) { return TM_ANIMAL_VP_CARDS.indexOf(n) >= 0; });
    var microbeVPInHand = myHand.filter(function(n) { return TM_MICROBE_VP_CARDS.indexOf(n) >= 0; });

    // Animal placement cards boost animal VP targets in hand
    var animalPlacers = TM_ANIMAL_PLACERS;
    if (animalPlacers[cardName] && animalVPInHand.length > 0) {
      var vpPerA = gensLeft >= 4 ? 4 : 7;
      var aBonus = Math.min(animalPlacers[cardName] * vpPerA, 14) * 0.5;
      bonus += aBonus;
      descs.push(reasonCardLabel(animalVPInHand[0]) + ' +' + animalPlacers[cardName] + 'a');
    }
    // This card IS an animal VP card → count animal placers in hand
    if (TM_ANIMAL_VP_CARDS.indexOf(cardName) >= 0) {
      var placersInHand = 0;
      for (var pn in animalPlacers) {
        if (handSet.has(pn)) placersInHand += animalPlacers[pn];
      }
      if (placersInHand > 0) {
        var apBonus = Math.min(placersInHand * (gensLeft >= 4 ? 4 : 7), 14) * 0.4;
        bonus += apBonus;
        descs.push('+' + placersInHand + ' animal placers');
      }
    }

    // Viral Enhancers: bio tags in hand → extra resources
    if (cardName === 'Viral Enhancers') {
      var bioTags = ['plant', 'animal', 'microbe'];
      var bioFeeders = myHand.filter(function(n) {
        var t = handTagCache[n] || [];
        for (var bi = 0; bi < bioTags.length; bi++) { if (t.indexOf(bioTags[bi]) >= 0) return true; }
        return false;
      }).length;
      if (bioFeeders > 0 && (animalVPInHand.length > 0 || microbeVPInHand.length > 0)) {
        bonus += Math.min(bioFeeders * 1.5, 8);
        descs.push(bioFeeders + ' bio feeders');
      }
    }
    if (handSet.has('Viral Enhancers') && cardName !== 'Viral Enhancers') {
      var hasBioTag = ['plant', 'animal', 'microbe'].some(function(t) { return cardTagsArr.indexOf(t) >= 0; });
      if (hasBioTag && (animalVPInHand.length > 0 || microbeVPInHand.length > 0)) {
        bonus += 1.5; descs.push('Viral +res');
      }
    }

    // Imported Nitrogen also places 3 microbes on microbe VP cards
    if (cardName === 'Imported Nitrogen' && microbeVPInHand.length > 0) {
      var mVP = gensLeft >= 4 ? 4 : 7;
      bonus += Math.min(3 * mVP * 0.4, 8);
      descs.push(reasonCardLabel(microbeVPInHand[0]) + ' +3m');
    }
    if (TM_MICROBE_VP_CARDS.indexOf(cardName) >= 0 && handSet.has('Imported Nitrogen')) {
      bonus += Math.min(3 * (gensLeft >= 4 ? 4 : 7) * 0.3, 6);
      descs.push('ImpNitro +3m');
    }

    // ── 3. SHUTTLES: -2 MC on space cards ──
    if (cardTagsArr.indexOf('space') >= 0 && handSet.has('Shuttles') && cardName !== 'Shuttles' && isSupportPlayableSoon('Shuttles')) {
      bonus += 2; descs.push('Shuttles скидка +2');
    }
    if (cardName === 'Shuttles') {
      var shuttlesTargets = (handTagMap['space'] || []).filter(function(n) { return n !== 'Shuttles' && !isPreludeOrCorpName(n); });
      if (shuttlesTargets.length > 0) {
        var shuttlesBonus = Math.min(shuttlesTargets.length * 1.5, 8);
        bonus += shuttlesBonus;
        descs.push(formatDiscountTargetReason({ space: 2 }, shuttlesTargets, shuttlesBonus));
      }
    }

    // ── 4. TAG DENSITY: per-tag production/VP cards + matching tags in hand ──
    var perTagCards = {
      'Medical Lab': { tag: 'building', per: 2, val: 1.5 },
      'Parliament Hall': { tag: 'building', per: 3, val: 1.5 },
      'Cartel': { tag: 'earth', per: 1, val: 1.5 },
      'Satellites': { tag: 'space', per: 1, val: 1.5 },
      'Insects': { tag: 'plant', per: 1, val: 1.5 },
      'Worms': { tag: 'microbe', per: 1, val: 1.5 },
      // Physics Complex removed — handled in energy chain (section 7)
    };
    if (perTagCards[cardName]) {
      var ptDef = perTagCards[cardName];
      var handTagCnt = (handTagMap[ptDef.tag] || []).filter(function(n) { return n !== cardName; }).length +
        (handTagMap['wild'] || []).filter(function(n) { return n !== cardName; }).length;
      if (handTagCnt > 0) {
        var extraVal = Math.min(Math.floor(handTagCnt / ptDef.per) * ptDef.val, 6);
        if (extraVal > 0) { bonus += extraVal; descs.push(handTagCnt + ' ' + getRequirementTagReasonLabel(ptDef.tag) + ' tag'); }
      }
    }
    // Reverse: card has tag that matches a per-tag card in hand
    for (var ptcName in perTagCards) {
      if (ptcName === cardName || !handSet.has(ptcName)) continue;
      var ptcDef = perTagCards[ptcName];
      if (cardTagsArr.indexOf(ptcDef.tag) >= 0 || cardTagsArr.indexOf('wild') >= 0) {
        bonus += ptcDef.val * 0.5;
        descs.push(reasonCardLabel(ptcName) + ' +tag');
      }
    }

    // ── 5. SCIENCE CHAIN: Research, Olympus Conference, Invention Contest + science tags ──
    // Tag triggers fire PER TAG (Research has 2 science → triggers engines 2x)
    var scienceEngines = { 'Research': 2, 'Olympus Conference': 1.5, 'Invention Contest': 1, 'Mars University': 1 };
    var mySciCount = 0;
    for (var _scc = 0; _scc < cardTagsArr.length; _scc++) { if (cardTagsArr[_scc] === 'science') mySciCount++; }
    if (mySciCount > 0) {
      var sciChainB = 0;
      for (var seName in scienceEngines) {
        if (handSet.has(seName) && cardName !== seName) {
          sciChainB += scienceEngines[seName] * mySciCount;
          descs.push(reasonCardLabel(seName) + ' +sci' + (mySciCount > 1 ? '×' + mySciCount : ''));
        }
      }
      bonus += Math.min(sciChainB, 6);
    }
    if (scienceEngines[cardName]) {
      var sciInHand = (handTagMap['science'] || []).filter(function(n) { return n !== cardName; }).length;
      if (sciInHand > 0) { bonus += Math.min(sciInHand * scienceEngines[cardName] * 0.5, 6); descs.push(sciInHand + ' sci in hand'); }
    }

    // ── 6. DISCOUNT CHAIN (data-driven from TM_CARD_DISCOUNTS) ──
    var _cdData = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
    var _cdSkip = { 'Earth Office': 1, 'Shuttles': 1, 'Media Archives': 1, 'Science Fund': 1 }; // handled elsewhere
    // This card benefits from discount engines in hand (stack all applicable)
    var discountDescs = [];
    for (var deName in _cdData) {
      if (deName === cardName || !handSet.has(deName) || _cdSkip[deName]) continue;
      if (!isSupportPlayableSoon(deName)) continue;
      var deEntry = _cdData[deName];
      for (var deTag in deEntry) {
        var deVal = deEntry[deTag];
        if (deVal <= 0) continue;
        var reqMatch = deTag === '_req' && cardHasRequirementsByName(cardName);
        if (!isPreludeOrCorpName(cardName) && (deTag === '_all' || reqMatch || cardTagsArr.indexOf(deTag) >= 0)) {
          bonus += deVal; discountDescs.push(reasonCardLabel(deName) + ' скидка +' + deVal);
          break; // one match per discount card
        }
      }
    }
    if (discountDescs.length > 0) descs.push(discountDescs.slice(0, 2).join(', '));
    // Reverse: this card IS a discount engine → count matching cards in hand
    if (_cdData[cardName] && !_cdSkip[cardName]) {
      var de2Entry = _cdData[cardName];
      var de2Val = de2Entry[Object.keys(de2Entry)[0]] || 0;
      if (de2Val > 0) {
        var de2Targets = myHand.filter(function(n) {
          return n !== cardName && cardMatchesDiscountEntry(n, de2Entry);
        });
        if (de2Targets.length > 0) {
          var de2Bonus = de2Targets.length * de2Val * 0.3;
          bonus += de2Bonus;
          descs.push(formatDiscountTargetReason(de2Entry, de2Targets, de2Bonus));
        }
      }
    }
    // Advanced Alloys: +1 steel & +1 titanium value → building & space cards
    if (handSet.has('Advanced Alloys') && cardName !== 'Advanced Alloys') {
      if (cardTagsArr.indexOf('building') >= 0) { bonus += 1.5; descs.push('AdvAlloys +steel'); }
      else if (cardTagsArr.indexOf('space') >= 0) { bonus += 1.5; descs.push('AdvAlloys +ti'); }
    }
    if (cardName === 'Advanced Alloys') {
      var aaBld = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      var aaSpc = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (aaBld + aaSpc > 0) {
        bonus += (aaBld + aaSpc) * 0.5;
        descs.push((aaBld + aaSpc) + ' bld/spc +value');
      }
    }

    // ── 6b. TAG TRIGGER ENGINES (data-driven from TM_TAG_TRIGGERS) ──
    // Skip: corps (on tableau from gen 1), cards already handled explicitly above
    var _ttSkip = {
      'Optimal Aerobraking': 1, 'Earth Office': 1, 'Media Group': 1, 'Viral Enhancers': 1,   // section 1
      'Olympus Conference': 1, 'Mars University': 1,                                           // section 5 (science chain)
      'Space Station': 1, 'Quantum Extractor': 1, 'Mass Converter': 1, 'Warp Drive': 1,       // section 6
      'Anti-Gravity Technology': 1, 'Earth Catapult': 1, 'Research Outpost': 1,                 // section 6
      'Dirigibles': 1, 'Venus Waystation': 1, 'Shuttles': 1, 'Advanced Alloys': 1,              // section 6
      'Titan Floating Launch-pad': 1,                                                            // section 9 (floater)
    };
    var _ttCorps = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
    var _ttData = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
    // This card triggers engines in hand — count per TAG (double tags = 2x trigger)
    var triggerDescs = [];
    for (var ttName in _ttData) {
      if (ttName === cardName || !handSet.has(ttName) || _ttSkip[ttName] || _ttCorps[ttName]) continue;
      var ttEntries = _ttData[ttName];
      for (var tti = 0; tti < ttEntries.length; tti++) {
        var tte = ttEntries[tti];
        if (tte.eventOnly && !isEvent) continue;
        // Count how many of card's tags match this trigger (Research science×2 = 2 triggers)
        var ttTagHits = 0;
        for (var _tth = 0; _tth < cardTagsArr.length; _tth++) {
          if (tte.tags.indexOf(cardTagsArr[_tth]) >= 0) ttTagHits++;
        }
        if (ttTagHits > 0) {
          bonus += tte.value * 0.5 * ttTagHits;
          triggerDescs.push(reasonCardLabel(ttName) + (ttTagHits > 1 ? '×' + ttTagHits : ''));
          break; // one match per trigger card
        }
      }
    }
    if (triggerDescs.length > 0) descs.push(triggerDescs.slice(0, 3).join('+') + ' trigger');
    // Reverse: this card IS a tag trigger → count matching tags in hand (including double tags)
    if (_ttData[cardName] && !_ttSkip[cardName] && !_ttCorps[cardName]) {
      var ttMyEntries = _ttData[cardName];
      var ttMatchCount = 0;
      var ttBestVal = 0;
      for (var ttmi = 0; ttmi < myHand.length; ttmi++) {
        if (myHand[ttmi] === cardName) continue;
        var ttmTags = handTagCache[myHand[ttmi]] || [];
        var ttmIsEvt = ttmTags.indexOf('event') >= 0;
        for (var ttei = 0; ttei < ttMyEntries.length; ttei++) {
          var ttme = ttMyEntries[ttei];
          if (ttme.eventOnly && !ttmIsEvt) continue;
          // Count per tag (double tags = 2 triggers)
          var ttmHits = 0;
          for (var _ttmh = 0; _ttmh < ttmTags.length; _ttmh++) {
            if (ttme.tags.indexOf(ttmTags[_ttmh]) >= 0) ttmHits++;
          }
          if (ttmHits > 0) {
            ttMatchCount += ttmHits; if (ttme.value > ttBestVal) ttBestVal = ttme.value;
            break;
          }
        }
      }
      if (ttMatchCount > 0) { bonus += Math.min(ttMatchCount * ttBestVal * 0.3, 6); descs.push(ttMatchCount + ' tag triggers'); }
    }

    // ── 7. ENERGY CHAIN: energy producers + energy consumers ──
    var energyProducers = TM_ENERGY_PRODUCERS;
    var energyConsumers = TM_ENERGY_CONSUMERS;
    if (energyProducers.indexOf(cardName) >= 0) {
      var consumers = myHand.filter(function(n) { return energyConsumers.indexOf(n) >= 0; }).length;
      if (consumers > 0) { bonus += Math.min(consumers * 2, 6); descs.push(consumers + ' energy consumer' + (consumers > 1 ? 's' : '')); }
    }
    if (energyConsumers.indexOf(cardName) >= 0) {
      var producers = myHand.filter(function(n) { return energyProducers.indexOf(n) >= 0; }).length;
      if (producers > 0) { bonus += Math.min(producers * 2, 6); descs.push(producers + ' energy prod'); }
    }

    // ── 8. JOVIAN VP CHAIN: jovian VP multipliers + jovian tags in hand ──
    var jovianVPCards = TM_JOVIAN_VP_CARDS;
    var isJovian = cardTagsArr.indexOf('jovian') >= 0;
    if (isJovian) {
      var jvpInHand = myHand.filter(function(n) { return n !== cardName && jovianVPCards.indexOf(n) >= 0; }).length;
      if (jvpInHand > 0) {
        // Each jovian tag → +1 VP on each jovian VP card
        var jBonus = Math.min(jvpInHand * (gensLeft >= 4 ? 4 : 6), 8);
        bonus += jBonus; descs.push(jvpInHand + ' jovian VP card' + (jvpInHand > 1 ? 's' : ''));
      }
    }
    if (jovianVPCards.indexOf(cardName) >= 0) {
      var jovianInHand = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
      if (jovianInHand > 0) {
        bonus += Math.min(jovianInHand * (gensLeft >= 4 ? 3 : 5), 8);
        descs.push(jovianInHand + ' jovian in hand');
      }
    }

    // ── 9. FLOATER ENGINE: floater generators + floater consumers ──
    var floaterGenerators = TM_FLOATER_GENERATORS;
    var floaterConsumers = TM_FLOATER_CONSUMERS;
    if (floaterGenerators.indexOf(cardName) >= 0) {
      var fConsumers = myHand.filter(function(n) { return n !== cardName && floaterConsumers.indexOf(n) >= 0; }).length;
      if (fConsumers > 0) { bonus += fConsumers * 2; descs.push(fConsumers + ' floater target' + (fConsumers > 1 ? 's' : '')); }
    }
    if (floaterConsumers.indexOf(cardName) >= 0) {
      var fGens = myHand.filter(function(n) { return n !== cardName && floaterGenerators.indexOf(n) >= 0; }).length;
      if (fGens > 0) { bonus += fGens * 2; descs.push(fGens + ' floater source' + (fGens > 1 ? 's' : '')); }
    }
    // Titan Floating Launch-pad: jovian tags in hand = more floaters
    if (cardName === 'Titan Floating Launch-pad') {
      var jovianCards = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
      if (jovianCards > 0) { bonus += jovianCards * 1.5; descs.push(jovianCards + ' jovian→floater'); }
    }
    if (handSet.has('Titan Floating Launch-pad') && cardName !== 'Titan Floating Launch-pad' && isJovian) {
      bonus += 1.5; descs.push('TitanLpad +floater');
    }

    // ── 10. COLONY DENSITY: colony build cards + trade/colony benefit cards ──
    if (cardIsColonyRelatedByName(cardName)) {
      var colBenefits = myHand.filter(function(n) { return n !== cardName && cardIsColonyBenefitByName(n); }).length;
      var otherBuilders = myHand.filter(function(n) { return n !== cardName && cardIsColonyRelatedByName(n); }).length;
      if (colBenefits > 0) { bonus += colBenefits * 1.5; descs.push(colBenefits + ' colony benefit'); }
      if (otherBuilders >= 2) { bonus += 2; descs.push('colony chain'); }
    }

    // ── 11. Protected Habitats: mainly protects plants from removal (Ants, Birds, -plant attacks) ──
    if (cardName === 'Protected Habitats') {
      // Plant production/plant cards in hand → plants are the main target of removal
      var plantCardsInHand = (handTagMap['plant'] || []).filter(function(n) { return n !== cardName; }).length;
      var plantProdCards = ['Nitrophilic Moss', 'Arctic Algae', 'Bushes', 'Trees', 'Grass',
        'Kelp Farming', 'Farming', 'Greenhouses', 'Greenhouse'];
      var plantProducers = myHand.filter(function(n) { return plantProdCards.indexOf(n) >= 0; }).length;
      var protBonus = plantCardsInHand * 1 + plantProducers * 2 + animalVPInHand.length * 1;
      if (protBonus > 0) { bonus += protBonus; descs.push('protect plants' + (animalVPInHand.length > 0 ? '+animals' : '')); }
    }

    // ── 12. STEEL/TI PRODUCTION SYNERGY: steel prod + building cards, ti prod + space cards ──
    // Steel prod card + building cards in hand = steel won't waste
    if (cardEff.sp && cardEff.sp > 0) {
      var bldInHand = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldInHand > 0) {
        var steelProdHandBonus = Math.round(Math.min(cardEff.sp * bldInHand * 0.8, 5) * 10) / 10;
        bonus += steelProdHandBonus;
        descs.push('steel prod +' + steelProdHandBonus + ' (' + bldInHand + ' bld)');
      }
    }
    // Building card + steel prod cards in hand = cheaper to play
    if (cardTagsArr.indexOf('building') >= 0) {
      var steelProdTotal = 0;
      for (var spi = 0; spi < myHand.length; spi++) {
        if (myHand[spi] === cardName) continue;
        var spEff = _effData[myHand[spi]];
        if (spEff && spEff.sp > 0) steelProdTotal += spEff.sp;
      }
      if (steelProdTotal > 0) {
        var steelProdAvailBonus = Math.round(Math.min(steelProdTotal * 0.7, 4) * 10) / 10;
        bonus += steelProdAvailBonus;
        descs.push('steel prod +' + steelProdAvailBonus + ' (' + steelProdTotal + ')');
      }
    }
    // Titanium prod card + space cards in hand
    if (cardEff.tp && cardEff.tp > 0) {
      var spcInHand = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcInHand > 0) {
        var tiProdHandBonus = Math.round(Math.min(cardEff.tp * spcInHand * 1.0, 6) * 10) / 10;
        bonus += tiProdHandBonus;
        descs.push('ti prod +' + tiProdHandBonus + ' (' + spcInHand + ' spc)');
      }
    }
    // Space card + titanium prod cards in hand
    if (cardTagsArr.indexOf('space') >= 0) {
      var tiProdTotal = 0;
      for (var tpi = 0; tpi < myHand.length; tpi++) {
        if (myHand[tpi] === cardName) continue;
        var tpEff = _effData[myHand[tpi]];
        if (tpEff && tpEff.tp > 0) tiProdTotal += tpEff.tp;
      }
      if (tiProdTotal > 0) {
        var tiProdAvailBonus = Math.round(Math.min(tiProdTotal * 0.9, 5) * 10) / 10;
        bonus += tiProdAvailBonus;
        descs.push('ti prod +' + tiProdAvailBonus + ' (' + tiProdTotal + ')');
      }
    }

    // ── 13-14, 16, 19-20, 29. PRODUCTION/PARAM STACKING (from TM_STACKING_RULES) ──
    var _hrMap = { plant: plantHR, temp: tempHR, venus: vnHR, ocean: ocHR };
    for (var _sti = 0; _sti < TM_STACKING_RULES.length; _sti++) {
      var sr = TM_STACKING_RULES[_sti];
      var srHR = sr.hrKey ? (_hrMap[sr.hrKey] || 1.0) : 1.0;
      if (cardEff[sr.field] && cardEff[sr.field] > 0) {
        var srOther = 0;
        for (var _stj = 0; _stj < myHand.length; _stj++) {
          if (myHand[_stj] === cardName) continue;
          var srEff = _effData[myHand[_stj]];
          if (srEff && srEff[sr.field] > 0) srOther += srEff[sr.field];
        }
        var srMin = sr.minOther || 0;
        if (srOther > srMin) {
          bonus += Math.min(srOther * sr.coeff * srHR, sr.cap);
          descs.push(sr.desc + ' +' + srOther + (sr.suffix || '') + (srHR < 1 ? ' ' + sr.hrLabel : ''));
        }
      }
    }

    // ── 15. MICROBE ENGINE: microbe VP targets + microbe generators + Decomposers ──
    var MICROBE_VP_ALL = { 'Decomposers': 3, 'Ants': 2, 'Tardigrades': 4, 'Extremophiles': 3, 'Extreme-Cold Fungus': 0 };
    var MICROBE_GENERATORS = { 'Symbiotic Fungus': 1, 'Extreme-Cold Fungus': 2, 'Bactoviral Research': 1 };
    // Decomposers + bio tags in hand: each plant/animal/microbe tag → +1 microbe
    if (cardName === 'Decomposers' || cardName === 'Urban Decomposers') {
      var bioTagCount = 0;
      for (var dci = 0; dci < myHand.length; dci++) {
        if (myHand[dci] === cardName) continue;
        var dcTags = handTagCache[myHand[dci]] || [];
        if (['plant', 'animal', 'microbe'].some(function(t) { return dcTags.indexOf(t) >= 0; })) bioTagCount++;
      }
      if (bioTagCount > 0) {
        var dcVal = cardName === 'Decomposers' ? bioTagCount * 1.5 : bioTagCount * 0.8;
        bonus += Math.min(dcVal, 8); descs.push(bioTagCount + ' bio→microbe');
      }
      if (isOpeningHandContext(ctx)) {
        var decompColonies = new Set(getVisibleColonyNames());
        var hasEnceladus = decompColonies.has('Enceladus');
        if (hasEnceladus) {
          bonus += 1.5;
          descs.push('Enceladus');
        }
        var openerMicrobePlacers = 0;
        for (var dcp = 0; dcp < myHand.length; dcp++) {
          if (myHand[dcp] === cardName) continue;
          openerMicrobePlacers += MICROBE_GENERATORS[myHand[dcp]] || 0;
        }
        if (!hasEnceladus && openerMicrobePlacers === 0 && bioTagCount <= 1) {
          bonus -= 2.5;
          descs.push('slow opener');
        }
      }
    }
    // Reverse: bio-tagged card + Decomposers in hand = extra microbe
    if (handSet.has('Decomposers') && cardName !== 'Decomposers' && isSupportPlayableSoon('Decomposers')) {
      if (['plant', 'animal', 'microbe'].some(function(t) { return cardTagsArr.indexOf(t) >= 0; })) {
        bonus += 1; descs.push('Decomp +1m');
      }
    }
    // Microbe generators + microbe VP targets in hand
    if (MICROBE_GENERATORS[cardName] && !(cardName === 'Extreme-Cold Fungus' && ctx && ctx.globalParams && ctx.globalParams.temp > -10)) {
      var mTargets = myHand.filter(function(n) { return n !== cardName && MICROBE_VP_ALL[n] && MICROBE_VP_ALL[n] > 0; });
      if (mTargets.length > 0) {
        bonus += mTargets.length * MICROBE_GENERATORS[cardName] * 1.5;
        descs.push(mTargets.length + ' microbe VP target');
      }
    }
    // Reverse: microbe VP card + generators in hand
    if (MICROBE_VP_ALL[cardName] && MICROBE_VP_ALL[cardName] > 0) {
      var mGens = 0;
      for (var mgi = 0; mgi < myHand.length; mgi++) {
        if (myHand[mgi] === cardName) continue;
        if (MICROBE_GENERATORS[myHand[mgi]]) mGens += MICROBE_GENERATORS[myHand[mgi]];
      }
      if (mGens > 0) {
        bonus += mGens * 1.5; descs.push('+' + mGens + ' microbe/gen');
      }
    }

    // (16. venus stacking → moved to STACKING_RULES above)

    // ── 17. CITY CHAIN: multiple city cards → Mayor milestone + synergy cards ──
    var isCityCard = cardTagsArr.indexOf('city') >= 0;
    if (isCityCard) {
      var otherCities = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (otherCities >= 1) {
        var hasMayor = ctx && ctx.milestones && (ctx.milestones.has('Mayor') || ctx.milestones.has('Mayor3'));
        var cityBonus = otherCities >= 2 ? (hasMayor ? 3 : 1.5) : (hasMayor ? 1.5 : 0.5);
        bonus += cityBonus; descs.push(otherCities + ' cities' + (hasMayor ? '→Mayor' : ''));
      }
      // Rover Construction in hand: +2 MC per city placed
      if (handSet.has('Rover Construction') && cardName !== 'Rover Construction') {
        bonus += 2; descs.push('Rover +2');
      }
    }
    // Rover Construction + city cards in hand
    if (cardName === 'Rover Construction') {
      var cityCount = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (cityCount > 0) {
        bonus += cityCount * 1.5; descs.push(cityCount + ' cities');
      }
    }

    // ── 18. EVENT MASS: many events → Legend milestone + compound with Media/OptAero ──
    if (isEvent) {
      var otherEvents = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
      // 3+ events in hand → Legend milestone becomes reachable (needs 5 total played)
      // Only if Legend milestone exists in this game
      if (otherEvents >= 2 && ctx.milestones && ctx.milestones.has('Legend')) {
        bonus += 1.5; descs.push('Legend potential');
      }
      // Compound: Media Group + Opt Aero both in hand → events get double value
      var hasMedia = handSet.has('Media Group');
      var hasOptAero = handSet.has('Optimal Aerobraking');
      if (hasMedia && hasOptAero && isSpaceEvent && cardName !== 'Media Group' && cardName !== 'Optimal Aerobraking') {
        bonus += 1; descs.push('Media+OptA combo');
      }
    }

    // (19-20. temp/ocean stacking → moved to STACKING_RULES above)

    // ── 21. TR RUSH: 3+ TR-raising cards → cohesive rush strategy ──
    var cardTR = (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.oc || 0) + (cardEff.vn ? Math.ceil(cardEff.vn / 2) : 0);
    if (cardTR > 0) {
      var handTR = 0;
      for (var tri = 0; tri < myHand.length; tri++) {
        if (myHand[tri] === cardName) continue;
        var trEff = _effData[myHand[tri]];
        if (!trEff) continue;
        handTR += (trEff.tr || 0) + (trEff.tmp || 0) + (trEff.oc || 0) + (trEff.vn ? Math.ceil(trEff.vn / 2) : 0);
      }
      if (handTR >= 4) {
        bonus += Math.min(handTR * 0.3, 3);
        descs.push('TR rush ' + handTR);
      }
    }

    // ── 22. ROBOTIC WORKFORCE: copies building production → synergy with high-prod buildings ──
    if (cardName === 'Robotic Workforce') {
      var bestProd = 0, bestProdName = '';
      for (var rwi = 0; rwi < myHand.length; rwi++) {
        if (myHand[rwi] === cardName) continue;
        var rwTags = handTagCache[myHand[rwi]] || [];
        if (rwTags.indexOf('building') < 0) continue;
        var rwE = _effData[myHand[rwi]] || {};
        var rwVal = (rwE.mp||0)*1 + (rwE.sp||0)*1.6 + (rwE.tp||0)*2.5 + (rwE.pp||0)*2.0 + (rwE.ep||0)*1.5 + (rwE.hp||0)*0.8;
        if (rwVal > bestProd) { bestProd = rwVal; bestProdName = myHand[rwi]; }
      }
      if (bestProd >= 3) {
        bonus += Math.min(bestProd * 0.8, 6);
        descs.push('copy ' + reasonCardLabel(bestProdName));
      }
    }
    // Reverse: building prod card + Robotic Workforce in hand
    if (handSet.has('Robotic Workforce') && cardName !== 'Robotic Workforce' && cardTagsArr.indexOf('building') >= 0) {
      var rwMyE = cardEff;
      var rwMyVal = (rwMyE.mp||0)*1 + (rwMyE.sp||0)*1.6 + (rwMyE.tp||0)*2.5 + (rwMyE.pp||0)*2.0 + (rwMyE.ep||0)*1.5 + (rwMyE.hp||0)*0.8;
      if (rwMyVal >= 3) {
        bonus += Math.min(rwMyVal * 0.4, 3);
        descs.push('RoboWork copy');
      }
    }

    // ── 23. REGO PLASTICS / ADVANCED ALLOYS: steel/ti value boost + resource cards ──
    // Rego Plastics (+1 steel value) + building cards
    if (cardName === 'Rego Plastics') {
      var bldCount = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldCount > 0) { bonus += Math.min(bldCount * 1, 4); descs.push(bldCount + ' bld +steel'); }
    }
    if (handSet.has('Rego Plastics') && cardName !== 'Rego Plastics' && cardTagsArr.indexOf('building') >= 0) {
      bonus += 1; descs.push('Rego +1 steel');
    }

    // ── 24-28, 30-31. NAMED CARD COMBOS (from TM_NAMED_EFF_COMBOS / TM_NAMED_TAG_COMBOS) ──
    for (var _nci = 0; _nci < TM_NAMED_EFF_COMBOS.length; _nci++) {
      var nc = TM_NAMED_EFF_COMBOS[_nci];
      if (cardName === nc.n) {
        var ncTotal = 0;
        for (var _ncj = 0; _ncj < myHand.length; _ncj++) {
          if (myHand[_ncj] === cardName) continue;
          var ncEff = _effData[myHand[_ncj]];
          if (ncEff && ncEff[nc.f] > 0) ncTotal += ncEff[nc.f];
        }
        if (ncTotal > (nc.fM || 0)) {
          bonus += Math.min(ncTotal * nc.fc, nc.fC);
          descs.push(ncTotal + ' ' + nc.fd);
        }
      }
      if (handSet.has(nc.n) && cardName !== nc.n && cardEff[nc.f] && cardEff[nc.f] > 0) {
        if (nc.rf > 0) {
          bonus += nc.rf; descs.push(nc.rd);
        } else if (nc.rc > 0) {
          bonus += Math.min(cardEff[nc.f] * nc.rc, nc.rC);
          descs.push(nc.rd + (nc.rm ? ' +' + (cardEff[nc.f] * nc.rm) + 'pl' : ''));
        }
      }
    }
    for (var _ntci = 0; _ntci < TM_NAMED_TAG_COMBOS.length; _ntci++) {
      var ntc = TM_NAMED_TAG_COMBOS[_ntci];
      if (cardName === ntc.n) {
        var ntcCount = 0;
        for (var _ntcj = 0; _ntcj < myHand.length; _ntcj++) {
          if (myHand[_ntcj] === cardName) continue;
          var ntcTags = handTagCache[myHand[_ntcj]] || [];
          for (var _ntct = 0; _ntct < ntc.tags.length; _ntct++) {
            if (ntcTags.indexOf(ntc.tags[_ntct]) >= 0) { ntcCount++; break; }
          }
        }
        if (ntcCount > 0) {
          bonus += Math.min(ntcCount * ntc.fc, ntc.fC);
          descs.push(ntcCount + ' ' + ntc.fd);
        }
      }
      if (handSet.has(ntc.n) && cardName !== ntc.n) {
        var ntcMatch = false;
        for (var _ntct2 = 0; _ntct2 < ntc.tags.length; _ntct2++) {
          if (cardTagsArr.indexOf(ntc.tags[_ntct2]) >= 0) { ntcMatch = true; break; }
        }
        if (ntcMatch) {
          bonus += ntc.rb; descs.push(ntc.rd);
        }
      }
    }

    // ── 32. ACTION CARD DIMINISHING RETURNS: 4+ action cards → not enough actions/gen ──
    var isAction = !!(cardEff.actTR || cardEff.actMC || cardEff.vpAcc);
    if (isAction) {
      var actionsInHand = 0;
      for (var aci = 0; aci < myHand.length; aci++) {
        if (myHand[aci] === cardName) continue;
        var acEff = _effData[myHand[aci]];
        if (acEff && (acEff.actTR || acEff.actMC || acEff.vpAcc)) actionsInHand++;
      }
      // 4+ action cards = too many for limited actions per gen
      if (actionsInHand >= 3) {
        var actPenalty = (actionsInHand - 2) * -0.8;
        bonus += Math.max(actPenalty, -3);
        descs.push(actionsInHand + ' actions compete');
      }
    }

    // ── 33. EXISTING PRODUCTION AMPLIFIER: new prod card joins running engine ──
    var _existProd = ctx && ctx.prod ? ctx.prod : {};
    // Steel prod card + existing steel prod + building cards in hand
    if (cardEff.sp && cardEff.sp > 0 && (_existProd.steel || 0) >= 1) {
      var bldForExist = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldForExist > 0) {
        bonus += Math.min((_existProd.steel || 0) * 0.3, 1.5);
        descs.push('steel engine ×' + _existProd.steel);
      }
    }
    // Ti prod card + existing ti prod + space cards in hand
    if (cardEff.tp && cardEff.tp > 0 && (_existProd.ti || 0) >= 1) {
      var spcForExist = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcForExist > 0) {
        bonus += Math.min((_existProd.ti || 0) * 0.4, 2);
        descs.push('ti engine ×' + _existProd.ti);
      }
    }
    // Plant prod card + existing plant prod ≥2 → greenery threshold closer
    if (cardEff.pp && cardEff.pp > 0 && (_existProd.plants || 0) >= 2) {
      bonus += Math.min((_existProd.plants || 0) * 0.2 * plantHR, 1.5);
      descs.push('plant engine ×' + _existProd.plants);
    }
    // Heat prod card + existing heat prod ≥3 → temp raise threshold closer
    if (cardEff.hp && cardEff.hp > 0 && (_existProd.heat || 0) >= 3) {
      bonus += Math.min((_existProd.heat || 0) * 0.15 * tempHR, 1.5);
      descs.push('heat engine ×' + _existProd.heat);
    }

    // ── 34. ENERGY CONSUMER + EXISTING ENERGY PROD (no producer in hand needed) ──
    if (TM_ENERGY_CONSUMERS.indexOf(cardName) >= 0 && (_existProd.energy || 0) >= 1) {
      // Check if there's already an energy producer in hand (section 7 handles that case)
      var hasEProdInHand = false;
      for (var epi = 0; epi < myHand.length; epi++) {
        if (TM_ENERGY_PRODUCERS.indexOf(myHand[epi]) >= 0) { hasEProdInHand = true; break; }
      }
      if (!hasEProdInHand) {
        bonus += Math.min((_existProd.energy || 0) * 1, 3);
        descs.push('existing ep ' + _existProd.energy);
      }
    }

    // ── 35. CORP-SPECIFIC HAND SYNERGY: cards compound when corp ability multiplies them ──
    var _myCorpsHand = ctx && ctx._myCorps ? ctx._myCorps : [];
    if (_myCorpsHand.length > 0) {
      var corpSet = new Set(_myCorpsHand);
      var corpSynB = 0;

      // Point Luna: each earth tag draws a card → multiple earth cards in hand = compound draw engine
      if (corpSet.has('Point Luna')) {
        var earthInHand = (handTagMap['earth'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('earth') >= 0 && earthInHand >= 1) {
          // Drawn cards may chain into more earth — compound value
          corpSynB += Math.min(earthInHand * 0.8, 3);
          descs.push('PtLuna earth×' + (earthInHand + 1));
        }
      }

      // Interplanetary Cinematics: +2 MC per event → mass events = large MC burst
      if (corpSet.has('Interplanetary Cinematics')) {
        var eventsInHand = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
        if (isEvent && eventsInHand >= 2) {
          corpSynB += Math.min(eventsInHand * 0.5, 2.5);
          descs.push('IC events×' + (eventsInHand + 1));
        }
        if (cardName === 'Media Group') {
          var mediaEvents = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
          corpSynB += Math.min(1.5 + mediaEvents * 0.4, 3);
          descs.push('IC→Media');
        }
        if (cardName === 'Optimal Aerobraking') {
          var icSpaceEvents = 0;
          for (var icei = 0; icei < myHand.length; icei++) {
            if (myHand[icei] === cardName) continue;
            var icTags = handTagCache[myHand[icei]] || [];
            if (icTags.indexOf('event') >= 0 && icTags.indexOf('space') >= 0) icSpaceEvents++;
          }
          var optAeroCorpBoost = 1.5 + Math.min(icSpaceEvents * 0.75, 2.5);
          if (handSet.has('Media Group')) optAeroCorpBoost += 0.5;
          corpSynB += optAeroCorpBoost;
          descs.push('IC→OptA');
        }
      }

      // Splice: +2 MC per microbe tag → mass microbe = MC engine
      if (corpSet.has('Splice')) {
        var micInHand = (handTagMap['microbe'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('microbe') >= 0 && micInHand >= 1) {
          corpSynB += Math.min(micInHand * 0.5, 2);
          descs.push('Splice mic×' + (micInHand + 1));
        }
      }

      // Arklight: +1 MC prod per animal/plant tag → bio mass = compound prod
      if (corpSet.has('Arklight')) {
        var bioInHand = ((handTagMap['animal'] || []).concat(handTagMap['plant'] || [])).filter(function(n) { return n !== cardName; }).length;
        var myBio = 0;
        for (var _abk = 0; _abk < cardTagsArr.length; _abk++) {
          if (cardTagsArr[_abk] === 'animal' || cardTagsArr[_abk] === 'plant') myBio++;
        }
        if (myBio > 0 && bioInHand >= 1) {
          corpSynB += Math.min(bioInHand * 0.6, 3);
          descs.push('Arklight bio×' + (bioInHand + myBio));
        }
      }

      // Tharsis Republic: +1 MC prod per city → multiple cities = compound prod
      if (corpSet.has('Tharsis Republic')) {
        var citiesInHand = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('city') >= 0 && citiesInHand >= 1) {
          corpSynB += Math.min(citiesInHand * 0.7, 2.5);
          descs.push('Tharsis city×' + (citiesInHand + 1));
        }
      }

      // Saturn Systems: +1 MC prod per jovian → multiple jovians = compound prod
      if (corpSet.has('Saturn Systems')) {
        var jovInHand = (handTagMap['jovian'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('jovian') >= 0 && jovInHand >= 1) {
          corpSynB += Math.min(jovInHand * 0.7, 3);
          descs.push('Saturn jov×' + (jovInHand + 1));
        }
      }

      // CrediCor: -4 MC refund on cards costing 20+ → multiple expensive cards = tempo burst
      if (corpSet.has('CrediCor')) {
        var myCost = cardEff.c || 0;
        if (myCost >= 20) {
          var expensiveInHand = 0;
          for (var _cri = 0; _cri < myHand.length; _cri++) {
            if (myHand[_cri] === cardName) continue;
            var _crEff = _effData[myHand[_cri]];
            if (_crEff && (_crEff.c || 0) >= 20) expensiveInHand++;
          }
          if (expensiveInHand >= 1) {
            corpSynB += Math.min(expensiveInHand * 0.6, 2.5);
            descs.push('CrediCor 20+×' + (expensiveInHand + 1));
          }
        }
      }

      // Helion: heat = MC → heat prod cards compound value (convert excess heat freely)
      if (corpSet.has('Helion')) {
        var heatPInHand = 0;
        for (var _hli = 0; _hli < myHand.length; _hli++) {
          if (myHand[_hli] === cardName) continue;
          var _hlEff = _effData[myHand[_hli]];
          if (_hlEff && _hlEff.hp > 0) heatPInHand += _hlEff.hp;
        }
        if (cardEff.hp && cardEff.hp > 0 && heatPInHand >= 2) {
          corpSynB += Math.min(heatPInHand * 0.4, 2);
          descs.push('Helion heat→MC ×' + heatPInHand);
        }
      }

      // Mining Guild: +1 steel prod per steel/ti placement → building cards compound
      if (corpSet.has('Mining Guild')) {
        var bldInHand = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('building') >= 0 && bldInHand >= 2) {
          corpSynB += Math.min((bldInHand - 1) * 0.5, 2);
          descs.push('MiningG bld×' + (bldInHand + 1));
        }
      }

      // Thorgate: -3 MC per power tag → multiple power cards = discount burst
      if (corpSet.has('Thorgate')) {
        var pwrInHand = (handTagMap['power'] || []).filter(function(n) { return n !== cardName; }).length;
        if (cardTagsArr.indexOf('power') >= 0 && pwrInHand >= 1) {
          corpSynB += Math.min(pwrInHand * 0.6, 2);
          descs.push('Thorgate pwr×' + (pwrInHand + 1));
        }
      }

      bonus += Math.min(corpSynB, 4);
    }

    // ── 36. MILESTONE DELTA: multiple cards pushing toward same milestone = compound value ──
    var _msNeeds = ctx && ctx.milestoneNeeds ? ctx.milestoneNeeds : {};
    var _msSpecial = ctx && ctx.milestoneSpecial ? ctx.milestoneSpecial : {};
    var msBonusTotal = 0;
    // Tag-based milestones (Builder, Scientist, Mayor, etc.)
    // Events don't persist in tableau — skip tag milestone bonus for event cards entirely
    if (!isEvent) for (var _mst = 0; _mst < cardTagsArr.length; _mst++) {
      var msTag = cardTagsArr[_mst];
      if (msTag === 'event') continue; // event tag doesn't count for milestones
      if (_msNeeds[msTag] !== undefined) {
        var msNeed = _msNeeds[msTag]; // tags still needed for milestone
        // Count how many OTHER cards in hand also contribute this tag
        var msOthers = (handTagMap[msTag] || []).filter(function(n) { return n !== cardName; });
        // Filter out events (they don't contribute to tag milestones)
        var msContributors = 0;
        for (var _msc = 0; _msc < msOthers.length; _msc++) {
          var msOTags = handTagCache[msOthers[_msc]] || [];
          if (msOTags.indexOf('event') < 0) msContributors++;
        }
        if (msContributors >= 1 && msNeed <= 3) {
          // The closer to milestone AND the more contributors, the bigger the compound
          // need=1 → almost there, need 2-3 = buying last pieces
          var msVal = msContributors >= msNeed ? 2.5 : msContributors * (1.0 / msNeed);
          msBonusTotal += msVal;
          descs.push('milestone −' + msNeed + ' w/' + msContributors + ' help');
        }
      }
    }
    // Special milestones: cities (Mayor), events (Legend), MC prod (Banker)
    if (_msSpecial.cities) {
      var cityNeed = _msSpecial.cities.need;
      if (cardTagsArr.indexOf('city') >= 0 && cityNeed <= 2) {
        var otherCitiesMs = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
        if (otherCitiesMs >= 1 && otherCitiesMs >= cityNeed) {
          msBonusTotal += 2;
          descs.push(_msSpecial.cities.name + ' −' + cityNeed);
        }
      }
    }
    if (_msSpecial.events) {
      var evNeed = _msSpecial.events.need;
      if (isEvent && evNeed <= 3) {
        var otherEventsMs = (handTagMap['event'] || []).filter(function(n) { return n !== cardName; }).length;
        if (otherEventsMs >= 1 && otherEventsMs >= evNeed) {
          msBonusTotal += 1.5;
          descs.push(_msSpecial.events.name + ' −' + evNeed);
        }
      }
    }
    bonus += Math.min(msBonusTotal, 4);

    // ── 37. AWARD RACING SYNERGY: hand cards that push a funded award I'm leading/contesting ──
    var _awRacing = ctx && ctx.awardRacing ? ctx.awardRacing : {};
    var _awTags = ctx && ctx.awardTags ? ctx.awardTags : {};
    var awBonusTotal = 0;
    for (var awName in _awRacing) {
      var aw = _awRacing[awName];
      if (!aw || aw.delta < -3) continue; // too far behind, not worth chasing
      // Identify which tags contribute to this award
      var awContribTags = [];
      for (var _awt in _awTags) {
        // Simple heuristic: if this tag is tracked as an award tag, it's relevant
        awContribTags.push(_awt);
      }
      // Count my card's contribution to relevant award tags
      for (var _awc = 0; _awc < cardTagsArr.length; _awc++) {
        if (isEvent && cardTagsArr[_awc] !== 'event') continue; // events don't persist for tag awards
        if (_awTags[cardTagsArr[_awc]]) {
          // Count other cards in hand with same tag
          var awOthers = (handTagMap[cardTagsArr[_awc]] || []).filter(function(n) { return n !== cardName; });
          var awNonEvent = 0;
          for (var _awe = 0; _awe < awOthers.length; _awe++) {
            var awOTags = handTagCache[awOthers[_awe]] || [];
            if (awOTags.indexOf('event') < 0) awNonEvent++;
          }
          if (awNonEvent >= 1) {
            // Leading = compound defense, behind = compound chase
            var awVal = aw.leading ? Math.min(awNonEvent * 0.6, 2) : Math.min(awNonEvent * 0.4, 1.5);
            awBonusTotal += awVal;
            descs.push(awName + (aw.leading ? ' lead' : ' chase') + ' w/' + awNonEvent);
            break; // one award contribution per card
          }
        }
      }
    }
    bonus += Math.min(awBonusTotal, 3);

    // ── 38. LATE-GAME VP BURST: hand full of VP/TR cards at gensLeft ≤ 2 = compound play ──
    if (gensLeft <= 2 && canUseLateVPNow) {
      // vpAcc cards (Birds, Fish, etc.) ARE VP cards at endgame — they still accumulate 1-2 VP
      var myVP = (cardEff.vp || 0) + (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.vn || 0) + (cardEff.oc || 0) + (cardEff.vpAcc > 0 ? 1 : 0);
      if (myVP > 0) {
        var otherVPCards = 0;
        for (var _vbi = 0; _vbi < myHand.length; _vbi++) {
          if (myHand[_vbi] === cardName) continue;
          var _vbEff = _effData[myHand[_vbi]];
          if (_vbEff) {
            var otherVP = (_vbEff.vp || 0) + (_vbEff.tr || 0) + (_vbEff.tmp || 0) + (_vbEff.vn || 0) + (_vbEff.oc || 0) + (_vbEff.vpAcc > 0 ? 1 : 0);
            if (otherVP > 0) otherVPCards++;
          }
        }
        // 3+ VP/TR cards in hand at endgame = can dump them all for massive finish
        // Scale by THIS card's VP contribution (1 VP card gets less burst than 3 VP card)
        if (otherVPCards >= 2) {
          var vpScale = Math.min(myVP, 3) / 2; // 1VP=0.5x, 2VP=1.0x, 3VP=1.5x
          var burstVal = gensLeft <= 1 ? Math.min(otherVPCards * 0.8 * vpScale, 5) : Math.min(otherVPCards * 0.4 * vpScale, 2);
          bonus += burstVal;
          descs.push('VP burst ×' + (otherVPCards + 1) + (gensLeft <= 1 ? ' FINAL' : ''));
        }
      }
    }

    // ── 39. COLONY TRADE ENGINE: trade fleet cards + colony placement = compound income ──
    var isColBuilder = cardBuildsColonyByName(cardName);
    var isFleetCard = cardHasTradeEngineByName(cardName);
    if (isColBuilder || isFleetCard) {
      var colOthers = 0;
      var fleetOthers = 0;
      for (var _cli = 0; _cli < myHand.length; _cli++) {
        if (myHand[_cli] === cardName) continue;
        if (cardBuildsColonyByName(myHand[_cli])) colOthers++;
        if (cardHasTradeEngineByName(myHand[_cli])) fleetOthers++;
      }
      var namedColonyPartner = '';
      var namedFleetPartner = '';
      for (var _clj = 0; _clj < myHand.length; _clj++) {
        if (myHand[_clj] === cardName) continue;
        if (!namedColonyPartner && cardBuildsColonyByName(myHand[_clj])) namedColonyPartner = myHand[_clj];
        if (!namedFleetPartner && cardHasTradeEngineByName(myHand[_clj])) namedFleetPartner = myHand[_clj];
      }
      var colSynB = 0;
      // Colony builder + fleet card = trade more often with more colonies
      if (isColBuilder && fleetOthers >= 1) {
        colSynB += Math.min(fleetOthers * 1.0, 2);
        if (fleetOthers === 1 && namedFleetPartner) descs.push(describeTradeChain(namedFleetPartner));
        else descs.push('trade engine ×' + fleetOthers);
      }
      // Fleet card + colony builders = more colonies to trade at
      if (isFleetCard && colOthers >= 1) {
        colSynB += Math.min(colOthers * 0.8, 2.5);
        if (colOthers === 1 && namedColonyPartner) descs.push(describeTradeChain(namedColonyPartner));
        else descs.push('colony shell ×' + colOthers);
      }
      // Multiple colony builders = colony density bonus (more trade targets)
      if (isColBuilder && colOthers >= 2) {
        colSynB += Math.min((colOthers - 1) * 0.5, 1.5);
        descs.push(colOthers + ' col stack');
      }
      bonus += Math.min(colSynB, 4);
    }

    // ── 40. TURMOIL PARTY SYNERGY: ruling/dominant party boosts certain tags in hand ──
    var _ruling = ctx && ctx.rulingParty ? ctx.rulingParty : '';
    var _dominant = ctx && ctx.dominantParty ? ctx.dominantParty : '';
    var partyTagMap = {
      'Mars First': ['mars'],
      'Scientists': ['science'],
      'Unity': ['venus', 'earth', 'jovian'],
      'Greens': ['plant', 'microbe', 'animal'],
      'Kelvinists': ['_heat'] // special: heat prod cards, not a tag
    };
    // Reds anti-synergy: TR raising cards penalized
    var partiesToCheck = [];
    if (_ruling && _ruling !== 'Reds') partiesToCheck.push({ name: _ruling, mult: 1.0 });
    if (_dominant && _dominant !== _ruling && _dominant !== 'Reds') partiesToCheck.push({ name: _dominant, mult: 0.5 });
    var turSynB = 0;
    for (var _tpi = 0; _tpi < partiesToCheck.length; _tpi++) {
      var partyInfo = partiesToCheck[_tpi];
      var partyTags = partyTagMap[partyInfo.name];
      if (!partyTags) continue;
      // Special: Kelvinists boost heat prod
      if (partyInfo.name === 'Kelvinists') {
        if (cardEff.hp && cardEff.hp > 0) {
          var hpOthers = 0;
          for (var _kli = 0; _kli < myHand.length; _kli++) {
            if (myHand[_kli] === cardName) continue;
            var _klEff = _effData[myHand[_kli]];
            if (_klEff && _klEff.hp > 0) hpOthers++;
          }
          if (hpOthers >= 1) {
            turSynB += Math.min(hpOthers * 0.5 * partyInfo.mult, 2);
            descs.push('Kelvin heat×' + (hpOthers + 1));
          }
        }
        continue;
      }
      // Tag-based parties
      var myPartyHits = 0;
      for (var _ptc = 0; _ptc < cardTagsArr.length; _ptc++) {
        if (partyTags.indexOf(cardTagsArr[_ptc]) >= 0) myPartyHits++;
      }
      if (myPartyHits > 0) {
        var partyOthers = 0;
        for (var _pto = 0; _pto < partyTags.length; _pto++) {
          var tagCards = (handTagMap[partyTags[_pto]] || []).filter(function(n) { return n !== cardName; });
          partyOthers += tagCards.length;
        }
        if (partyOthers >= 1) {
          turSynB += Math.min(partyOthers * 0.4 * partyInfo.mult * myPartyHits, 2.5);
          descs.push(reasonCardLabel(partyInfo.name) + ' party ×' + (partyOthers + myPartyHits));
        }
      }
      // Policy-specific compound bonuses (beyond tag matching)
      // Greens policy: +4 MC per greenery/city placement → plant prod and city cards extra valuable
      if (partyInfo.name === 'Greens') {
        if (cardEff.pp && cardEff.pp > 0) {
          var ppOthersGrn = 0;
          for (var _gpi = 0; _gpi < myHand.length; _gpi++) {
            if (myHand[_gpi] === cardName) continue;
            var _gpEff = _effData[myHand[_gpi]];
            if (_gpEff && _gpEff.pp > 0) ppOthersGrn++;
          }
          if (ppOthersGrn >= 1) {
            turSynB += Math.min((ppOthersGrn + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('Greens pp×' + (ppOthersGrn + 1));
          }
        }
        if (cardTagsArr.indexOf('city') >= 0) {
          turSynB += 0.4 * partyInfo.mult;
          descs.push('Greens city');
        }
      }
      // Mars First policy: -2 MC per building tag card → building cards compound
      if (partyInfo.name === 'Mars First') {
        if (cardTagsArr.indexOf('building') >= 0) {
          var buildOthersMF = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
          if (buildOthersMF >= 1) {
            turSynB += Math.min((buildOthersMF + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('MarsFirst build×' + (buildOthersMF + 1));
          }
        }
      }
      // Scientists policy: draw 1 card per science tag played → ~3-4 MC per science card
      if (partyInfo.name === 'Scientists') {
        if (cardTagsArr.indexOf('science') >= 0) {
          var sciOthersSci = (handTagMap['science'] || []).filter(function(n) { return n !== cardName; }).length;
          if (sciOthersSci >= 1) {
            turSynB += Math.min((sciOthersSci + 1) * 0.4 * partyInfo.mult, 2);
            descs.push('Sci draw×' + (sciOthersSci + 1));
          }
        }
      }
      // Unity policy: +2 MC per space tag played → space cards cheaper
      if (partyInfo.name === 'Unity') {
        if (cardTagsArr.indexOf('space') >= 0) {
          var spcOthersUni = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
          if (spcOthersUni >= 1) {
            turSynB += Math.min((spcOthersUni + 1) * 0.3 * partyInfo.mult, 1.5);
            descs.push('Unity space×' + (spcOthersUni + 1));
          }
        }
      }
    }
    // Reds penalty: TR-raising cards less valuable when Reds rule
    if (_ruling === 'Reds') {
      var trValue = (cardEff.tr || 0) + (cardEff.tmp || 0) + (cardEff.vn || 0) + (cardEff.oc || 0);
      if (trValue > 0) {
        var otherTR = 0;
        for (var _rdi = 0; _rdi < myHand.length; _rdi++) {
          if (myHand[_rdi] === cardName) continue;
          var _rdEff = _effData[myHand[_rdi]];
          if (_rdEff) otherTR += (_rdEff.tr || 0) + (_rdEff.tmp || 0) + (_rdEff.vn || 0) + (_rdEff.oc || 0);
        }
        if (otherTR > 0) {
          // Multiple TR cards under Reds = all more expensive (-3 MC each)
          turSynB -= Math.min(otherTR * 0.3, 2);
          descs.push('Reds tax TR×' + (otherTR + trValue));
        }
      }
    }
    bonus += Math.max(Math.min(turSynB, 3), -3);

    // ── 41. ANTI-SYNERGY: cards that conflict within the same hand ──
    // Plant prod + SELF plant-prod reduction in same hand = real conflict
    // Birds/Herbivores target opponent's plant prod, so NOT anti-synergy with own plant prod
    if (cardEff.pp && cardEff.pp > 0) {
      var selfPlantEaters = ['Food Factory', 'Biomass Combustors'];
      for (var _pai = 0; _pai < selfPlantEaters.length; _pai++) {
        if (handSet.has(selfPlantEaters[_pai]) && cardName !== selfPlantEaters[_pai]) {
          bonus -= 1;
          descs.push(reasonCardLabel(selfPlantEaters[_pai]) + ' eats own pp');
          break;
        }
      }
    }
    // Energy prod consumed by own consumer = less energy for other uses
    if (cardEff.ep && cardEff.ep > 0) {
      var energyHogs = ['Steelworks', 'Ironworks', 'Water Splitting Plant'];
      var hogsInHand = 0;
      for (var _ehi = 0; _ehi < energyHogs.length; _ehi++) {
        if (handSet.has(energyHogs[_ehi]) && cardName !== energyHogs[_ehi]) hogsInHand++;
      }
      // 2+ energy consumers competing for same energy = diminishing returns (section 7 handles pairing, this handles excess)
      if (hogsInHand >= 2) {
        bonus -= Math.min((hogsInHand - 1) * 0.5, 1.5);
        descs.push(hogsInHand + ' ep consumers fight');
      }
    }

    // 41b. Energy-consuming actions compete with colony trading
    if (ctx && ctx.coloniesOwned > 0 && ctx.fleetSize > 0) {
      var ENERGY_HOGS = { 'Ironworks': 4, 'Steelworks': 4, 'Water Splitting Plant': 3,
        'Ore Processor': 4, 'Physics Complex': 6, 'Venus Magnetizer': 4 };
      var hogCost = ENERGY_HOGS[cardName];
      if (hogCost) {
        // Trading uses 3 energy and gives ~8-12 MC value — usually better than converting
        var tradePenalty = Math.min(4, Math.round(ctx.coloniesOwned * 1.5));
        bonus -= tradePenalty;
        descs.push('Торговля лучше −' + tradePenalty);
      }
    }

    // ── 42. OPPONENT-AWARE HAND PENALTY: opp attacks devalue vulnerable cards in hand ──
    var _oppAnAtk = ctx && ctx.oppHasAnimalAttack;
    var _oppPlAtk = ctx && ctx.oppHasPlantAttack;
    // If opponent has Predators/Ants, animal VP accumulators in my hand are riskier
    if (_oppAnAtk && (cardEff.vpAcc || cardTagsArr.indexOf('animal') >= 0)) {
      var animalBuddies = (handTagMap['animal'] || []).filter(function(n) { return n !== cardName; }).length;
      if (animalBuddies >= 1) {
        // Multiple animal targets = opponent can only hit one per turn, but still devalues all
        bonus -= Math.min(animalBuddies * 0.4, 1.5);
        descs.push('opp Pred/Ants ×' + (animalBuddies + 1) + ' animals');
      }
    }
    // If opponent has plant attacks and I'm investing in plant prod, discount stacking
    if (_oppPlAtk && cardEff.pp && cardEff.pp > 0) {
      var ppBuddies = 0;
      for (var _oppi = 0; _oppi < myHand.length; _oppi++) {
        if (myHand[_oppi] === cardName) continue;
        var _oppEff = _effData[myHand[_oppi]];
        if (_oppEff && _oppEff.pp > 0) ppBuddies++;
      }
      if (ppBuddies >= 2) {
        bonus -= Math.min(ppBuddies * 0.3, 1);
        descs.push('opp plant atk risky');
      }
    }

    // ── 43. PRODUCTION DIVERSITY: hand gives 3+ different prod types → Generalist potential ──
    // Only apply when Generalist milestone is actually in play (random milestones)
    var hasGeneralistMilestone = ctx && ctx.milestones && ctx.milestones.has('Generalist');
    var prodTypes = {};
    if (cardEff.mp && cardEff.mp > 0) prodTypes.mc = true;
    if (cardEff.sp && cardEff.sp > 0) prodTypes.steel = true;
    if (cardEff.tp && cardEff.tp > 0) prodTypes.ti = true;
    if (cardEff.pp && cardEff.pp > 0) prodTypes.plants = true;
    if (cardEff.ep && cardEff.ep > 0) prodTypes.energy = true;
    if (cardEff.hp && cardEff.hp > 0) prodTypes.heat = true;
    var myProdCount = Object.keys(prodTypes).length;
    if (hasGeneralistMilestone && myProdCount >= 1) {
      var handProdTypes = {};
      for (var _pdi = 0; _pdi < myHand.length; _pdi++) {
        if (myHand[_pdi] === cardName) continue;
        var _pdEff = _effData[myHand[_pdi]];
        if (!_pdEff) continue;
        if (_pdEff.mp > 0) handProdTypes.mc = true;
        if (_pdEff.sp > 0) handProdTypes.steel = true;
        if (_pdEff.tp > 0) handProdTypes.ti = true;
        if (_pdEff.pp > 0) handProdTypes.plants = true;
        if (_pdEff.ep > 0) handProdTypes.energy = true;
        if (_pdEff.hp > 0) handProdTypes.heat = true;
      }
      var combinedProdTypes = 0;
      for (var _cpt in prodTypes) { combinedProdTypes++; }
      for (var _cpt2 in handProdTypes) { if (!prodTypes[_cpt2]) combinedProdTypes++; }
      // 4+ different prod types together = Generalist potential (+5 VP milestone)
      if (combinedProdTypes >= 4) {
        var divBonus = combinedProdTypes >= 6 ? 2 : combinedProdTypes >= 5 ? 1.5 : 1;
        bonus += divBonus;
        descs.push(combinedProdTypes + ' prod types→Generalist');
      }
    }

    // ── 44. OPPONENT CORP GLOBAL PENALTY: raising params that help opp corps ──
    var _oppCorpsHand = ctx && ctx.oppCorps ? ctx.oppCorps : [];
    if (_oppCorpsHand.length > 0) {
      var oppGlobVuln = typeof TM_OPP_CORP_VULN_GLOBAL !== 'undefined' ? TM_OPP_CORP_VULN_GLOBAL : {};
      // Check if my card raises a global that benefits an opponent corp
      var raisesPenalty = 0;
      for (var _ogi = 0; _ogi < _oppCorpsHand.length; _ogi++) {
        var oppVuln = oppGlobVuln[_oppCorpsHand[_ogi]];
        if (!oppVuln) continue;
        // Polaris: ocean cards help them
        if (_oppCorpsHand[_ogi] === 'Polaris' && cardEff.oc && cardEff.oc > 0) {
          var otherOc = 0;
          for (var _ocj = 0; _ocj < myHand.length; _ocj++) {
            if (myHand[_ocj] === cardName) continue;
            var _ocEff = _effData[myHand[_ocj]];
            if (_ocEff && _ocEff.oc > 0) otherOc++;
          }
          if (otherOc >= 1) {
            raisesPenalty += Math.min(otherOc * 0.4, 1.5);
            descs.push('opp Polaris oc×' + (otherOc + 1));
          }
        }
        // Aphrodite: venus raises help them
        if (_oppCorpsHand[_ogi] === 'Aphrodite' && cardEff.vn && cardEff.vn > 0) {
          var otherVn = 0;
          for (var _vnj = 0; _vnj < myHand.length; _vnj++) {
            if (myHand[_vnj] === cardName) continue;
            var _vnEff = _effData[myHand[_vnj]];
            if (_vnEff && _vnEff.vn > 0) otherVn++;
          }
          if (otherVn >= 1) {
            raisesPenalty += Math.min(otherVn * 0.3, 1);
            descs.push('opp Aphrodite vn×' + (otherVn + 1));
          }
        }
      }
      bonus -= Math.min(raisesPenalty, 2);
    }

    // ── 45. TIMING COHESION: hand of all-prod early or all-VP late = strategic coherence ──
    var isProdCard = (cardEff.mp > 0 || cardEff.sp > 0 || cardEff.tp > 0 || cardEff.pp > 0 || cardEff.ep > 0 || cardEff.hp > 0);
    var isVPCard = (cardEff.vp > 0 || cardEff.vpAcc || cardEff.tr > 0);
    var isTimingPureProdCard = isProdCard && !isVPCard && !cardEff.places;
    if (isProdCard && gensLeft >= 5) {
      var otherProd = 0;
      for (var _tci = 0; _tci < myHand.length; _tci++) {
        if (myHand[_tci] === cardName) continue;
        var _tcEff = _effData[myHand[_tci]];
        if (_tcEff && (_tcEff.mp > 0 || _tcEff.sp > 0 || _tcEff.tp > 0 || _tcEff.pp > 0 || _tcEff.ep > 0 || _tcEff.hp > 0)) otherProd++;
      }
      // 3+ prod cards early = production rush, all compound in value
      if (otherProd >= 3) {
        bonus += Math.min((otherProd - 2) * 0.5, 1.5);
      }
    }
    if (isVPCard && gensLeft === 3) { // gensLeft ≤ 2 handled by VP burst (section 38)
      var otherVP = 0;
      for (var _tcv = 0; _tcv < myHand.length; _tcv++) {
        if (myHand[_tcv] === cardName) continue;
        var _tcvEff = _effData[myHand[_tcv]];
        if (_tcvEff && ((_tcvEff.vp || 0) > 0 || _tcvEff.vpAcc || (_tcvEff.tr || 0) > 0)) otherVP++;
      }
      if (otherVP >= 2) {
        bonus += Math.min((otherVP - 1) * 0.5, 2);
        descs.push('VP cohesion ×' + (otherVP + 1));
      }
    }

    // ── 46. WILD TAG COMPOUND: wild tags count as any tag → amplify all triggers/discounts ──
    var hasWild = cardTagsArr.indexOf('wild') >= 0;
    if (hasWild) {
      // Wild tag benefits from ALL tag triggers and discounts in hand
      var wildTriggerBonus = 0;
      var _ttData = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
      for (var _wti = 0; _wti < myHand.length; _wti++) {
        if (myHand[_wti] === cardName) continue;
        if (_ttData[myHand[_wti]]) wildTriggerBonus += 0.5; // each trigger card = some value
      }
      var _cdData = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
      for (var _wdi = 0; _wdi < myHand.length; _wdi++) {
        if (myHand[_wdi] === cardName) continue;
        if (_cdData[myHand[_wdi]]) wildTriggerBonus += 0.3;
      }
      if (wildTriggerBonus > 0) {
        bonus += Math.min(wildTriggerBonus, 3);
        descs.push('wild amplifies triggers');
      }
    }
    // Cards with wild tag in hand amplify OTHER cards' trigger matches
    var wildInHand = (handTagMap['wild'] || []).filter(function(n) { return n !== cardName; }).length;
    if (wildInHand >= 1 && cardTagsArr.length > 0 && !isEvent) {
      // Each wild in hand potentially fires an extra trigger for this card
      var _ttData2 = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
      var triggerCount = 0;
      for (var _wt2 = 0; _wt2 < myHand.length; _wt2++) {
        if (myHand[_wt2] === cardName) continue;
        if (_ttData2[myHand[_wt2]]) triggerCount++;
      }
      if (triggerCount >= 1) {
        bonus += Math.min(wildInHand * 0.3, 1);
        descs.push(wildInHand + ' wild in hand');
      }
    }

    // ── 47. STEEL/TI STOCKPILE COMPOUND: resources + matching cards = play more cheaply ──
    var _stk = ctx || {};
    var stStockpile = _stk.steel || 0;
    var tiStockpile = _stk.titanium || 0;
    if (stStockpile >= 3 && cardTagsArr.indexOf('building') >= 0) {
      var bldBuddies = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldBuddies >= 2) {
        // Many building cards + steel stockpile = can afford to play multiple → compound
        bonus += Math.min(bldBuddies * 0.4, 2);
        descs.push('steel ' + stStockpile + '+' + (bldBuddies + 1) + ' bld');
      }
    }
    if (tiStockpile >= 2 && cardTagsArr.indexOf('space') >= 0) {
      var spcBuddies = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcBuddies >= 2) {
        bonus += Math.min(spcBuddies * 0.5, 2.5);
        descs.push('ti ' + tiStockpile + '+' + (spcBuddies + 1) + ' spc');
      }
    }

    // ── 48. DRAW ENGINE COMPOUND: multiple card-draw sources = hand refill engine ──
    var drawCards = {
      'Research': 2, 'Invention Contest': 1, 'Mars University': 1, 'Olympus Conference': 1,
      'Business Network': 1, 'Restricted Area': 1, 'AI Central': 2, 'Rover Construction': 0,
      'Media Archives': 1, 'Orbital Laboratories': 1, 'Development Center': 1,
      'Designed Microorganisms': 0, 'Search For Life': 1, 'Aerial Mappers': 1
    };
    var myDrawVal = drawCards[cardName];
    if (myDrawVal !== undefined && myDrawVal > 0) {
      var otherDraws = 0;
      for (var _dri = 0; _dri < myHand.length; _dri++) {
        if (myHand[_dri] === cardName) continue;
        if (drawCards[myHand[_dri]] !== undefined && drawCards[myHand[_dri]] > 0) otherDraws++;
      }
      // 2+ draw sources = card advantage engine
      if (otherDraws >= 1) {
        bonus += Math.min(otherDraws * 0.6, 2);
        descs.push('draw engine ×' + (otherDraws + 1));
      }
    }

    // ── 49. HAND COST TEMPO: cheap cohesive hand = play 3-4 cards/gen vs 1-2 ──
    if (cardEff.c && cardEff.c <= 14 && myHand.length >= 4) {
      var cheapCount = 0;
      for (var _cti = 0; _cti < myHand.length; _cti++) {
        var ctEff = _effData[myHand[_cti]];
        if (ctEff && ctEff.c && ctEff.c <= 14) cheapCount++;
      }
      // 3+ cheap cards (≤14 MC) = tempo advantage: play them all in one gen
      if (cheapCount >= 3) {
        bonus += Math.min((cheapCount - 2) * 0.8, 3);
      }
    }

    // Suitable Infrastructure wants frequent production bumps, not generic building density.
    if (cardName === 'Suitable Infrastructure') {
      var prodBumpCount = 0;
      var cheapProdBumpCount = 0;
      for (var _sii = 0; _sii < myHand.length; _sii++) {
        var siName = myHand[_sii];
        if (siName === cardName) continue;
        var siEff = _effData[siName];
        if (!siEff) continue;
        var siProdSteps =
          Math.max(0, siEff.mp || 0) +
          Math.max(0, siEff.sp || 0) +
          Math.max(0, siEff.tp || 0) +
          Math.max(0, siEff.pp || 0) +
          Math.max(0, siEff.ep || 0) +
          Math.max(0, siEff.hp || 0);
        if (siProdSteps <= 0) continue;
        prodBumpCount++;
        var siCost = siEff.c;
        if (siCost == null) {
          var siRating = _getRatingByCardName(siName);
          if (siRating && typeof siRating.c === 'number') siCost = siRating.c;
        }
        if ((siCost || 99) <= 12) cheapProdBumpCount++;
      }
      if (prodBumpCount > 0) {
        var suitableProdBonus = Math.min(3.5, prodBumpCount * 0.8 + cheapProdBumpCount * 0.4);
        bonus += suitableProdBonus;
        descs.push(prodBumpCount + ' prod bumps' + (cheapProdBumpCount > 0 ? ' (cheap ×' + cheapProdBumpCount + ')' : ''));
      }
      var suitableCorps = ctx && ctx._myCorps ? ctx._myCorps : [];
      if (suitableCorps.indexOf('Robinson Industries') !== -1) {
        bonus += 2;
        descs.push('Robinson prod action');
      }
      descs = descs.filter(function(desc) {
        if (!desc) return false;
        if (/Sky Docks скидка \+\d/.test(desc)) return false;
        if (/^\d+ building тегов в руке(?: ×\d\.\d)?$/.test(desc)) return false;
        if (/steel avail \+\d/.test(desc)) return false;
        return true;
      });
    }

    if (cardName === 'Caretaker Contract' && (isOpeningHandContext(ctx) || (ctx && ctx.gen <= 2))) {
      var caretakerBonus = 0;
      var caretakerReasons = [];
      var caretakerTemp = ctx && ctx.globalParams
        ? (typeof ctx.globalParams.temp === 'number'
          ? ctx.globalParams.temp
          : (typeof ctx.globalParams.temperature === 'number' ? ctx.globalParams.temperature : -30))
        : -30;
      var caretakerGap = Math.max(0, Math.ceil((0 - caretakerTemp) / 2));
      var caretakerSupportNames = [];
      var caretakerPreludeNames = getVisiblePreludeNames();
      for (var cci = 0; cci < myHand.length; cci++) {
        if (myHand[cci] && myHand[cci] !== cardName) caretakerSupportNames.push(myHand[cci]);
      }
      for (var ccp = 0; ccp < caretakerPreludeNames.length; ccp++) {
        if (caretakerPreludeNames[ccp] && caretakerPreludeNames[ccp] !== cardName) caretakerSupportNames.push(caretakerPreludeNames[ccp]);
      }
      var caretakerSeen = new Set();
      var caretakerHeatShell = 0;
      for (var ccs = 0; ccs < caretakerSupportNames.length; ccs++) {
        var caretakerName = caretakerSupportNames[ccs];
        if (!caretakerName || caretakerSeen.has(caretakerName)) continue;
        caretakerSeen.add(caretakerName);
        var caretakerFx = _effData[caretakerName] || getFx(caretakerName);
        if (!caretakerFx) continue;
        if ((caretakerFx.hp || 0) > 0 || (caretakerFx.tmp || 0) > 0) caretakerHeatShell++;
      }
      var caretakerCorps = ctx && ctx._myCorps ? ctx._myCorps : [];
      if (caretakerCorps.indexOf('Helion') !== -1) caretakerHeatShell++;

      if (caretakerGap >= 10 && caretakerHeatShell <= 1) {
        caretakerBonus -= 3;
        caretakerReasons.push('Caretaker heat shell thin -3');
      } else if (caretakerGap >= 8 && caretakerHeatShell === 0) {
        caretakerBonus -= 2;
        caretakerReasons.push('Caretaker heat shell thin -2');
      }

      if (caretakerBonus !== 0) {
        bonus += caretakerBonus;
        forceHandReasonVisibility = true;
        descs.push(caretakerReasons.join(', '));
      }
    }

    if (cardName === 'Heat Trappers') {
      if (handSet.has('Neptunian Power Consultants')) {
        bonus -= 1;
        descs.push('NPC anti -1');
      }
      descs = descs.filter(function(desc) {
        if (!desc) return false;
        if (/^Thorgate pwr×/.test(desc)) return false;
        return true;
      });
    }
    // ── 50. MICROBE PLACEMENT: Imported Nitrogen microbes + microbe VP targets not in section 2 ──
    // (section 2 covers animal placement; microbe placement for Symbiotic Fungus etc. covered in section 15)

    // ── 51. DOUBLE TAG EXTRA TRIGGERS: cards with 2+ of same tag fire triggers twice ──
    // Research (sci×2), Luna Governor (earth×2), Mining Guild (building×2) etc.
    // Section 5 handles science chain; this catches earth/building/venus double-tags with triggers
    if (cardTagsArr.length >= 2) {
      var tagCounts = {};
      for (var _dti = 0; _dti < cardTagsArr.length; _dti++) {
        tagCounts[cardTagsArr[_dti]] = (tagCounts[cardTagsArr[_dti]] || 0) + 1;
      }
      for (var dtTag in tagCounts) {
        if (tagCounts[dtTag] < 2 || dtTag === 'science') continue; // science already in section 5
        // Check if any trigger card in hand fires on this tag
        for (var _dtj = 0; _dtj < myHand.length; _dtj++) {
          if (myHand[_dtj] === cardName) continue;
          var dtTrigger = TM_TAG_TRIGGERS[myHand[_dtj]];
          if (!dtTrigger) continue;
          for (var _dtk = 0; _dtk < dtTrigger.length; _dtk++) {
            if (dtTrigger[_dtk].tags.indexOf(dtTag) >= 0) {
              // This card fires trigger X times instead of 1
              var dtExtra = (tagCounts[dtTag] - 1) * dtTrigger[_dtk].value * 0.3;
              bonus += Math.min(dtExtra, 2);
              descs.push(reasonCardLabel(myHand[_dtj]) + ' +' + dtTag + '×' + tagCounts[dtTag]);
              break;
            }
          }
        }
      }
    }

    // ── 52. NO-TAG PENALTY: cards without tags miss all trigger/discount synergies ──
    if (!isEvent && cardTagsArr.length === 0) {
      // Count how many trigger/discount sources are in hand that this card can't benefit from
      var missedSources = 0;
      for (var _nti = 0; _nti < myHand.length; _nti++) {
        if (myHand[_nti] === cardName) continue;
        if (TM_TAG_TRIGGERS[myHand[_nti]] || TM_CARD_DISCOUNTS[myHand[_nti]]) missedSources++;
      }
      if (missedSources >= 1) {
        bonus -= Math.min(missedSources * 0.6, 2);
        descs.push('no tag: miss ' + missedSources + ' trigger/disc');
      }
    }

    // ── 53. VP ACCUMULATOR TIMING: early vpAcc cards = more gens to grow ──
    if (cardEff.vpAcc && cardEff.vpAcc > 0 && gensLeft >= 4 && canUseLateVPNow) {
      // vpAcc cards generate VP per action over time; more gens left = more VP
      var vpAccOther = 0;
      for (var _vai = 0; _vai < myHand.length; _vai++) {
        if (myHand[_vai] === cardName) continue;
        var vaEff = _effData[myHand[_vai]];
        if (vaEff && vaEff.vpAcc > 0) vpAccOther++;
      }
      // 2+ VP accumulators early = "VP engine" setup
      if (vpAccOther >= 1 && gensLeft >= 5) {
        bonus += Math.min(vpAccOther * 0.5, 1.5);
        descs.push('VP engine ×' + (vpAccOther + 1) + ' early');
      }
    }

    // ── 54. GLOBAL PARAM RUSH: hand all-in on one param = closing bonus ──
    // 3+ cards raising same param = dedicated rush → first to close gets bonus tiles, deny opp TR
    var paramCounts = { tmp: 0, oc: 0, vn: 0 };
    for (var _gri = 0; _gri < myHand.length; _gri++) {
      var grEff = _effData[myHand[_gri]];
      if (!grEff) continue;
      if (grEff.tmp > 0) paramCounts.tmp += grEff.tmp;
      if (grEff.oc > 0) paramCounts.oc += grEff.oc;
      if (grEff.vn > 0) paramCounts.vn += grEff.vn;
    }
    // Check if this card contributes to the rush
    var rushParams = [];
    if (cardEff.tmp > 0 && paramCounts.tmp >= 4) rushParams.push({ p: 'temp', total: paramCounts.tmp, hr: tempHR });
    if (cardEff.oc > 0 && paramCounts.oc >= 3) rushParams.push({ p: 'ocean', total: paramCounts.oc, hr: ocHR });
    if (cardEff.vn > 0 && paramCounts.vn >= 4) rushParams.push({ p: 'venus', total: paramCounts.vn, hr: vnHR });
    for (var _grj = 0; _grj < rushParams.length; _grj++) {
      var rp = rushParams[_grj];
      // Rush bonus scaled by headroom (more room = more value in rushing)
      var rushVal = Math.min(rp.total * 0.2 * rp.hr, 1.5);
      if (rushVal > 0.3) {
        bonus += rushVal;
        descs.push(rp.p + ' rush ×' + rp.total);
      }
    }

    // ── 55. TAG DENSITY BONUS: 4+ cards with same tag → milestone proximity ──
    // Complements section 36 (milestone delta) which needs ctx.milestoneNeeds
    var tagDensity = {};
    for (var _tdi = 0; _tdi < myHand.length; _tdi++) {
      var tdTags = handTagCache[myHand[_tdi]] || [];
      for (var _tdj = 0; _tdj < tdTags.length; _tdj++) {
        var tdt = tdTags[_tdj];
        if (tdt === 'event') continue; // events don't persist
        tagDensity[tdt] = (tagDensity[tdt] || 0) + 1;
      }
    }
    // This card's tags benefit from density
    for (var _tdk = 0; _tdk < cardTagsArr.length; _tdk++) {
      var myTag = cardTagsArr[_tdk];
      if (myTag === 'event') continue;
      var tdCount = tagDensity[myTag] || 0;
      if (tdCount >= 4) {
        // 4+ same tag = Builder (building 8), Scientist (science 3), etc.
        bonus += Math.min((tdCount - 3) * 0.4, 1.5);
        descs.push(tdCount + ' ' + getRequirementTagReasonLabel(myTag) + ' тегов в руке');
        break; // only count highest density
      }
    }

    // ── 56. COST OVERLOAD PENALTY: hand of expensive cards = can't play multiple per gen ──
    // Typical gen budget ~40-50 MC. Hand of 5 cards at 30 MC each = only play 1-2.
    if (cardEff.c && cardEff.c > 20 && myHand.length >= 4) {
      var expensiveCount = 0, totalHandCost = 0;
      for (var _coi = 0; _coi < myHand.length; _coi++) {
        var coEff = _effData[myHand[_coi]];
        if (coEff && coEff.c) {
          totalHandCost += coEff.c;
          if (coEff.c > 20) expensiveCount++;
        }
      }
      var avgHandCost = totalHandCost / myHand.length;
      // Penalty when 3+ expensive cards and avg > 22 MC — can't play them all
      if (expensiveCount >= 3 && avgHandCost > 22) {
        var overloadPen = -Math.min((avgHandCost - 22) * 0.15, 2.5);
        bonus += overloadPen;
        descs.push('costly hand avg' + Math.round(avgHandCost));
      }
    }

    // ── 57. ENERGY→HEAT PIPELINE: energy prod residual becomes heat next gen ──
    // Energy not consumed by actions becomes heat. With heat strategy cards, this is hidden synergy.
    if (cardEff.ep && cardEff.ep > 0) {
      // Check if there are heat-benefit cards in hand (heat prod, temp raise, Insulation)
      var heatBenefitCards = 0;
      for (var _ehi = 0; _ehi < myHand.length; _ehi++) {
        if (myHand[_ehi] === cardName) continue;
        var ehEff = _effData[myHand[_ehi]];
        if (!ehEff) continue;
        if (ehEff.hp > 0 || ehEff.tmp > 0) heatBenefitCards++;
        if (myHand[_ehi] === 'Insulation' || myHand[_ehi] === 'Caretaker Contract') heatBenefitCards++;
      }
      // Also check if there's NO energy consumer in hand (section 7 handles that)
      var hasConsumer = false;
      for (var _ehj = 0; _ehj < myHand.length; _ehj++) {
        if (TM_ENERGY_CONSUMERS.indexOf(myHand[_ehj]) >= 0 && myHand[_ehj] !== cardName) { hasConsumer = true; break; }
      }
      // If no consumer, energy → heat. With heat strategy, that's a bonus.
      if (!hasConsumer && heatBenefitCards >= 2) {
        // Higher bonus when heat synergy is dense (3+ heat benefit cards)
        var heatDensity57 = heatBenefitCards >= 3 ? 0.6 : 0.4;
        var pipeVal = Math.min(cardEff.ep * heatDensity57 * tempHR, 2.0);
        if (pipeVal > 0.2) {
          bonus += pipeVal;
          descs.push('ep→heat pipe ×' + heatBenefitCards);
        }
      }
    }

    // ── 58. MC CONVERSION ENABLERS: Insulation/Power Infra/Caretaker compound with production ──
    // These cards convert resources to MC or TR; value scales with matching production in hand
    var MC_CONVERTERS = {
      'Insulation': { src: 'hp', label: 'heat→MC', perProd: 0.6, cap: 5 },
      'Power Infrastructure': { src: 'ep', label: 'energy→MC', perProd: 0.8, cap: 5 },
      'Caretaker Contract': { src: 'hp', label: 'heat→TR', perProd: 0.6, cap: 5 },
    };
    var mcConv = MC_CONVERTERS[cardName];
    if (mcConv) {
      var convProdTotal = 0;
      for (var _mci = 0; _mci < myHand.length; _mci++) {
        if (myHand[_mci] === cardName) continue;
        var mcEff = _effData[myHand[_mci]];
        if (mcEff && mcEff[mcConv.src] > 0) convProdTotal += mcEff[mcConv.src];
      }
      // Section 24 (NAMED_EFF_COMBOS) already covers Insulation→hp, but this adds the converter's own perspective
      if (convProdTotal >= 3) {
        var convVal = Math.min(convProdTotal * mcConv.perProd, mcConv.cap);
        bonus += convVal;
        descs.push(mcConv.label + ' ×' + convProdTotal + ' prod');
      }
    }
    // Reverse: production card + converter in hand
    if (cardEff.hp && cardEff.hp > 0 && (handSet.has('Caretaker Contract') || handSet.has('Power Infrastructure'))) {
      // Only add if NOT already covered by Insulation in NAMED_EFF_COMBOS
      if (!handSet.has('Insulation')) {
        var convName = handSet.has('Caretaker Contract') ? 'Caretaker' : 'PwrInfra';
        bonus += Math.min(cardEff.hp * 0.4, 2);
        descs.push(convName + ' convert');
      }
    }
    if (cardEff.ep && cardEff.ep > 0 && handSet.has('Power Infrastructure')) {
      bonus += Math.min(cardEff.ep * 0.5, 2.5);
      descs.push('PwrInfra ×' + cardEff.ep + 'ep');
    }

    // ── 59. (removed — Predators eating own animals is VP-neutral, not a penalty) ──

    // ── 62. IMMEDIATE RESOURCES: cards giving steel/ti + building/space cards = instant use ──
    // If hand gives immediate steel and has building cards, that steel gets used right away
    if (cardEff.st && cardEff.st > 0) {
      var bldForSteel = (handTagMap['building'] || []).filter(function(n) { return n !== cardName; }).length;
      if (bldForSteel > 0) {
        var steelUseBonus = Math.round(Math.min(cardEff.st * 0.5, 2.5) * 10) / 10;
        bonus += steelUseBonus;
        descs.push(cardEff.st + ' steel avail +' + steelUseBonus + ' (' + bldForSteel + ' bld)');
      }
    }
    // Building card + cards giving immediate steel in hand
    if (cardTagsArr.indexOf('building') >= 0) {
      var steelFromHand = 0;
      for (var _isi = 0; _isi < myHand.length; _isi++) {
        if (myHand[_isi] === cardName) continue;
        var isEff = _effData[myHand[_isi]];
        if (isEff && isEff.st > 0) steelFromHand += isEff.st;
      }
      if (steelFromHand >= 3) {
        var steelAvailBonus = Math.round(Math.min(steelFromHand * 0.3, 1.5) * 10) / 10;
        bonus += steelAvailBonus;
        descs.push(steelFromHand + ' steel avail +' + steelAvailBonus);
      }
    }
    // Immediate titanium + space cards
    if (cardEff.ti && cardEff.ti > 0) {
      var spcForTi = (handTagMap['space'] || []).filter(function(n) { return n !== cardName; }).length;
      if (spcForTi > 0) {
        var tiUseBonus = Math.round(Math.min(cardEff.ti * 0.7, 3) * 10) / 10;
        bonus += tiUseBonus;
        descs.push(cardEff.ti + ' ti avail +' + tiUseBonus + ' (' + spcForTi + ' spc)');
      }
    }
    // Space card + cards giving immediate titanium in hand
    if (cardTagsArr.indexOf('space') >= 0) {
      var tiFromHand = 0;
      for (var _iti = 0; _iti < myHand.length; _iti++) {
        if (myHand[_iti] === cardName) continue;
        var itEff = _effData[myHand[_iti]];
        if (itEff && itEff.ti > 0) tiFromHand += itEff.ti;
      }
      if (tiFromHand >= 2) {
        var tiAvailBonus = Math.round(Math.min(tiFromHand * 0.4, 2) * 10) / 10;
        bonus += tiAvailBonus;
        descs.push(tiFromHand + ' ti avail +' + tiAvailBonus);
      }
    }

    // ── 63. DELEGATE COMPOUND: multiple delegate cards = political control ──
    // 3+ delegates from hand = party leader, 5+ = chairman → influence + TR/gen
    var _delCards = typeof TM_DELEGATE_CARDS !== 'undefined' ? TM_DELEGATE_CARDS : {};
    if (_delCards[cardName]) {
      var totalDelegates = 0;
      var delCardCount = 0;
      for (var _dli = 0; _dli < myHand.length; _dli++) {
        if (myHand[_dli] === cardName) continue;
        if (_delCards[myHand[_dli]]) {
          totalDelegates += _delCards[myHand[_dli]];
          delCardCount++;
        }
      }
      var allDelegates = totalDelegates + _delCards[cardName];
      if (delCardCount >= 1 && totalDelegates >= 2) {
        // Non-linear: 3-4 = party leader (+0.5/del), 5-6 = chairman likely (+0.7/del), 7+ = chairman lock (+0.9/del)
        var delCoeff = allDelegates >= 7 ? 0.9 : allDelegates >= 5 ? 0.7 : 0.5;
        var delVal = Math.min(totalDelegates * delCoeff, 5);
        bonus += delVal;
        descs.push(allDelegates + ' delegates');
      }
    }

    // ── 60. STANDARD TECHNOLOGY: -3 MC on standard projects ──
    // StdTech is good with MC production (more budget to dump into SPs).
    // Plant/heat/energy prod REDUCE SP need (you greenery via plants, temp via heat, etc.).
    if (cardName === 'Standard Technology') {
      var stMCProd = 0;
      for (var _sti2 = 0; _sti2 < myHand.length; _sti2++) {
        if (myHand[_sti2] === cardName) continue;
        var stEff = _effData[myHand[_sti2]];
        if (!stEff) continue;
        // MC production = more budget for SPs → each SP saves 3 MC
        if (stEff.mp > 0) stMCProd += stEff.mp;
      }
      if (stMCProd >= 3) {
        bonus += Math.min(stMCProd * 0.3, 2);
        descs.push('StdTech +' + stMCProd + 'MC→SP');
      }
    }
    // Reverse: MC production card with Standard Technology in hand
    if (handSet.has('Standard Technology') && cardName !== 'Standard Technology') {
      if (cardEff.mp && cardEff.mp > 0) {
        bonus += 0.5;
        descs.push('StdTech -3 SP');
      }
    }

    // ── 61. GREENERY PIPELINE: 6+ total plant prod in hand + O2 headroom = TR engine ──
    // Not just plant stacking (section 13) — this captures the full plant→greenery→O2→TR pipeline
    if (cardEff.pp && cardEff.pp > 0 && plantHR > 0.5) {
      var totalPP = 0;
      for (var _gpi = 0; _gpi < myHand.length; _gpi++) {
        var gpEff = _effData[myHand[_gpi]];
        if (gpEff && gpEff.pp > 0) totalPP += gpEff.pp;
      }
      // 6+ total plant prod = ~1 greenery per gen = sustained TR engine
      if (totalPP >= 6 && gensLeft >= 4) {
        var greeneryRate = totalPP / 8; // greeneries per gen
        var pipelineVal = Math.min(greeneryRate * 0.6 * plantHR, 1.5);
        if (pipelineVal > 0.3) {
          bonus += pipelineVal;
          descs.push('greenery engine ' + totalPP + 'pp');
        }
      }
    }

    // ── 64. MULTI-DISCOUNT COMPOUND: 3+ discount sources = massive savings ──
    // When 2+ discount cards in hand, each additional card in hand benefits from ALL discounts
    // The compound effect: each new card added saves more because multiple discounts stack
    if (!isEvent) {
      var totalDiscount = 0;
      var discountSources = 0;
      var _cdDataMD = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
      for (var _mdi = 0; _mdi < myHand.length; _mdi++) {
        if (myHand[_mdi] === cardName) continue;
        var mdEntry = _cdDataMD[myHand[_mdi]];
        if (!mdEntry) continue;
        for (var mdTag in mdEntry) {
          if (mdEntry[mdTag] <= 0) continue;
          if (mdTag === '_all' || mdTag === '_req' || cardTagsArr.indexOf(mdTag) >= 0) {
            totalDiscount += mdEntry[mdTag];
            discountSources++;
            break;
          }
        }
      }
      // 2+ discount sources stacking on this card = compound savings
      if (discountSources >= 2 && totalDiscount >= 4) {
        var compoundVal = Math.min((discountSources - 1) * 0.5, 1.5);
        bonus += compoundVal;
        descs.push(discountSources + ' disc stack -' + totalDiscount);
      }
    }

    // ── 65. CITY + GREENERY ADJACENCY: city cards + plant production = adjacency MC ──
    // Each city adjacent to greeneries gets +1 MC per adjacent greenery.
    // If hand has city cards and plant production, the greeneries will be placed next to cities.
    var isCityCardAdj = cardTagsArr.indexOf('city') >= 0;
    if (isCityCardAdj && gensLeft >= 3) {
      var ppForAdj = 0;
      for (var _adi = 0; _adi < myHand.length; _adi++) {
        if (myHand[_adi] === cardName) continue;
        var adEff = _effData[myHand[_adi]];
        if (adEff && adEff.pp > 0) ppForAdj += adEff.pp;
      }
      // 4+ plant prod = ~1 greenery/gen to place adjacent to this city → +1 MC/gen
      if (ppForAdj >= 4) {
        var adjVal = Math.min(ppForAdj / 8 * gensLeft * 0.15, 1.5);
        if (adjVal > 0.3) {
          bonus += adjVal;
          descs.push('adj greenery ' + ppForAdj + 'pp');
        }
      }
    }
    // Reverse: plant prod card + city cards in hand = greeneries have good placement
    if (cardEff.pp && cardEff.pp > 0 && gensLeft >= 3) {
      var citiesForAdj = (handTagMap['city'] || []).filter(function(n) { return n !== cardName; }).length;
      if (citiesForAdj >= 1) {
        bonus += Math.min(citiesForAdj * 0.4, 1);
        descs.push(citiesForAdj + ' city adj');
      }
    }

    // ── 66. PREREQ ENABLERS: exact unlock-chain reasons for global requirements ──
    var _globalReqs = typeof TM_CARD_GLOBAL_REQS !== 'undefined' ? TM_CARD_GLOBAL_REQS : {};
    var _tagReqs = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
    var paramMap = { tmp: 'temperature', oc: 'oceans', o2: 'oxygen', vn: 'venus' };
    var paramStep = { tmp: 2, oc: 1, o2: 1, vn: 2 };
    var reqFlexCorpsHS2 = (ctx && ctx._myCorps && ctx._myCorps.length) ? ctx._myCorps : detectMyCorps();
    var ctxTagsHS = {};
    if (ctx && ctx.tags) {
      for (var ctxTagNameHS in ctx.tags) {
        if (!Object.prototype.hasOwnProperty.call(ctx.tags, ctxTagNameHS)) continue;
        ctxTagsHS[ctxTagNameHS] = ctx.tags[ctxTagNameHS];
      }
    }
    if (ctx && ctx._allMyCards && Array.isArray(ctx._allMyCards) && Array.isArray(myHand)) {
      var inferredTableauCountHS = Math.max(0, ctx._allMyCards.length - myHand.length);
      for (var _ctxi = 0; _ctxi < inferredTableauCountHS; _ctxi++) {
        var inferredTagsHS = getCardTagsLocal(ctx._allMyCards[_ctxi]);
        for (var _ctti = 0; _ctti < inferredTagsHS.length; _ctti++) {
          var inferredTagNameHS = inferredTagsHS[_ctti];
          if (inferredTagNameHS === 'event') continue;
          ctxTagsHS[inferredTagNameHS] = (ctxTagsHS[inferredTagNameHS] || 0) + 1;
        }
      }
    }
    var globalUnlockSeen = new Set();
    var tagUnlockSeen = new Set();
    var globalUnlockFallback = 0;
    var tagUnlockFallback = 0;
    var immediateGlobalUnlocks = 0;
    var nearGlobalUnlocks = 0;
    var immediateTagUnlocks = 0;
    var nearTagUnlocks = 0;

    function getUnlockScoreWeight(targetName) {
      var targetRating = TM_RATINGS[targetName];
      var targetScore = targetRating && typeof targetRating.s === 'number' ? targetRating.s : 60;
      if (targetScore >= 80) return 1.5;
      if (targetScore >= 72) return 1.2;
      if (targetScore >= 60) return 1.0;
      return 0.7;
    }

    function countCardTagCopies(tagsArr, tagName) {
      var count = 0;
      for (var cti = 0; cti < tagsArr.length; cti++) {
        if (tagsArr[cti] === tagName) count++;
      }
      return count;
    }

    function getRaiseStepsFromCard(cardNameLocal, pmKeyLocal, effLocal) {
      var steps = effLocal && effLocal[pmKeyLocal] ? effLocal[pmKeyLocal] : 0;
      if (pmKeyLocal === 'o2' && effLocal && effLocal.grn) steps += effLocal.grn;
      if (steps > 0) return steps;

      var descLocal = '';
      if (typeof TM_CARD_DESCRIPTIONS !== 'undefined') {
        var directDescLocal = _lookupCardData ? _lookupCardData(TM_CARD_DESCRIPTIONS, cardNameLocal) : TM_CARD_DESCRIPTIONS[cardNameLocal];
        if (typeof directDescLocal === 'string' && directDescLocal) descLocal = directDescLocal.toLowerCase();
      }
      if (!descLocal) {
        var cardDataLocal = (typeof TM_CARD_DATA !== 'undefined')
          ? (_lookupCardData ? _lookupCardData(TM_CARD_DATA, cardNameLocal) : TM_CARD_DATA[cardNameLocal])
          : null;
        if (cardDataLocal) {
          if (typeof cardDataLocal.description === 'string') descLocal = cardDataLocal.description.toLowerCase();
          else if (cardDataLocal.description && typeof cardDataLocal.description.message === 'string') descLocal = cardDataLocal.description.message.toLowerCase();
        }
      }
      if (!descLocal) return 0;

      function matchStep(re) {
        var m = descLocal.match(re);
        return m ? parseInt(m[1], 10) : 0;
      }

      if (pmKeyLocal === 'tmp') return matchStep(/raise\s+(?:the\s+)?temperature\s+(\d+)\s+step/i) || (descLocal.indexOf('raise temperature') >= 0 ? 1 : 0);
      if (pmKeyLocal === 'o2') return matchStep(/raise\s+(?:the\s+)?oxygen\s+(\d+)\s+step/i) || (descLocal.indexOf('raise oxygen') >= 0 ? 1 : 0);
      if (pmKeyLocal === 'oc') return matchStep(/place\s+(\d+)\s+ocean/i) || matchStep(/(\d+)\s+ocean/i);
      if (pmKeyLocal === 'vn') return matchStep(/raise\s+venus\s+(\d+)\s+step/i) || (descLocal.indexOf('raise venus') >= 0 ? 1 : 0);
      return 0;
    }

    function isTargetOtherwiseReady(targetName, excludeParamName, addedTagCounts, excludeTagName) {
      var targetGlobalReqs = _lookupCardData ? _lookupCardData(_globalReqs, targetName) : _globalReqs[targetName];
      var targetTagReqs = _lookupCardData ? _lookupCardData(_tagReqs, targetName) : _tagReqs[targetName];
      var targetFlex = getRequirementFlexSteps(targetName, reqFlexCorpsHS2);
      var targetGp = ctx && ctx.globalParams ? ctx.globalParams : {};

      if (targetGlobalReqs) {
        var targetParamMap = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
        for (var targetParam in targetParamMap) {
          if (targetParam === excludeParamName) continue;
          var targetReqObj = targetGlobalReqs[targetParam];
          if (!targetReqObj) continue;
          var targetCur = targetGp[targetParamMap[targetParam]];
          if (typeof targetCur !== 'number') targetCur = 0;
          var targetStep = targetParam === 'temperature' ? 2 : (targetParam === 'venus' ? 2 : 1);
          var targetFlexSteps = targetFlex.any + (targetParam === 'venus' ? targetFlex.venus : 0);
          if (targetReqObj.min != null && targetCur < targetReqObj.min - targetFlexSteps * targetStep) return false;
          if (targetReqObj.max != null && targetCur > targetReqObj.max + targetFlexSteps * targetStep) return false;
        }
      }

      if (targetTagReqs) {
        for (var targetTag in targetTagReqs) {
          if (targetTag === excludeTagName) continue;
          if (typeof targetTagReqs[targetTag] === 'object') continue;
          var haveTargetTag = ctxTagsHS[targetTag] || 0;
          if (addedTagCounts && addedTagCounts[targetTag]) haveTargetTag += addedTagCounts[targetTag];
          if (haveTargetTag < targetTagReqs[targetTag]) return false;
        }
      }

      return true;
    }

    for (var pmKey in paramMap) {
      var raiseSteps = getRaiseStepsFromCard(cardName, pmKey, cardEff);
      if (!raiseSteps || raiseSteps <= 0) continue;
      var pmName = paramMap[pmKey];
      var pmLabel = getRequirementParamReasonLabel(pmName);
      for (var _rei = 0; _rei < myHand.length; _rei++) {
        if (myHand[_rei] === cardName) continue;
        var targetReqData = _lookupCardData ? _lookupCardData(_globalReqs, myHand[_rei]) : _globalReqs[myHand[_rei]];
        if (!targetReqData || !targetReqData[pmName] || targetReqData[pmName].min == null) continue;

        var targetReqObj2 = targetReqData[pmName];
        var targetFlex2 = getRequirementFlexSteps(myHand[_rei], reqFlexCorpsHS2);
        var curParam2 = gp[pmName === 'oxygen' ? 'oxy' : pmName];
        if (typeof curParam2 !== 'number') curParam2 = 0;
        var effectiveMin2 = targetReqObj2.min - (targetFlex2.any + (pmName === 'venus' ? targetFlex2.venus : 0)) * paramStep[pmKey];
        var gapValue2 = effectiveMin2 - curParam2;
        if (gapValue2 <= 0) continue;
        var gapSteps2 = Math.ceil(gapValue2 / paramStep[pmKey]);
        var afterGapSteps2 = gapSteps2 - raiseSteps;
        var addedTagCounts2 = {};
        for (var cti2 = 0; cti2 < cardTagsArr.length; cti2++) {
          var tagName2 = cardTagsArr[cti2];
          if (tagName2 === 'event') continue;
          addedTagCounts2[tagName2] = (addedTagCounts2[tagName2] || 0) + 1;
        }
        if (!isTargetOtherwiseReady(myHand[_rei], pmName, addedTagCounts2)) continue;

        var targetLabel2 = reasonCardLabel(myHand[_rei]);
        var targetWeight2 = getUnlockScoreWeight(myHand[_rei]);
        if (afterGapSteps2 <= 0) {
          var globalKey = 'open:' + myHand[_rei] + ':' + pmName;
          if (!globalUnlockSeen.has(globalKey)) {
            globalUnlockSeen.add(globalKey);
            immediateGlobalUnlocks++;
            bonus += 1.0 + targetWeight2 * 0.9;
            descs.push('Открывает ' + targetLabel2 + ' через ' + pmLabel);
          }
        } else if (afterGapSteps2 === 1) {
          var nearKey = 'near:' + myHand[_rei] + ':' + pmName;
          if (!globalUnlockSeen.has(nearKey)) {
            globalUnlockSeen.add(nearKey);
            nearGlobalUnlocks++;
            bonus += 0.5 + targetWeight2 * 0.45;
            descs.push('Ещё 1 ' + pmLabel + ' до ' + targetLabel2);
          }
        } else {
          globalUnlockFallback++;
        }
      }
    }

    var myReqs = _lookupCardData ? _lookupCardData(_globalReqs, cardName) : _globalReqs[cardName];
    if (myReqs) {
      for (var pmKey2 in paramMap) {
        var pmName2 = paramMap[pmKey2];
        if (!myReqs[pmName2] || myReqs[pmName2].min == null) continue;
        var myFlex2 = getRequirementFlexSteps(cardName, reqFlexCorpsHS2);
        var curParam3 = gp[pmName2 === 'oxygen' ? 'oxy' : pmName2];
        if (typeof curParam3 !== 'number') curParam3 = 0;
        var neededMin3 = myReqs[pmName2].min - (myFlex2.any + (pmName2 === 'venus' ? myFlex2.venus : 0)) * paramStep[pmKey2];
        var missingValue3 = neededMin3 - curParam3;
        if (missingValue3 <= 0) continue;
        var missingSteps3 = Math.ceil(missingValue3 / paramStep[pmKey2]);
        for (var _rej = 0; _rej < myHand.length; _rej++) {
          if (myHand[_rej] === cardName) continue;
          var enablerEff = _effData[myHand[_rej]];
          if (!enablerEff) continue;
          var providedSteps3 = getRaiseStepsFromCard(myHand[_rej], pmKey2, enablerEff);
          if (!providedSteps3) continue;
          var enablerLabel3 = reasonCardLabel(myHand[_rej]);
          var reqLabel3 = getRequirementParamReasonLabel(pmName2);
          var revKey3 = 'rev:' + cardName + ':' + myHand[_rej] + ':' + pmName2;
          if (providedSteps3 >= missingSteps3) {
            if (!globalUnlockSeen.has(revKey3)) {
              globalUnlockSeen.add(revKey3);
              bonus += 0.6 + getUnlockScoreWeight(myHand[_rej]) * 0.35;
              descs.push('Открывается ' + enablerLabel3 + ' по ' + reqLabel3);
            }
          } else if (providedSteps3 === missingSteps3 - 1) {
            var nearRevKey3 = revKey3 + ':near';
            if (!globalUnlockSeen.has(nearRevKey3)) {
              globalUnlockSeen.add(nearRevKey3);
              bonus += 0.3 + getUnlockScoreWeight(myHand[_rej]) * 0.2;
              descs.push('Req: ещё 1 ' + reqLabel3);
            }
          }
        }
      }
    }

    // ── 67. MAX-REQ ANTI-SYNERGY: param-raising cards conflict with max-requirement cards ──
    // Cards with max-requirement (e.g., max temp -18) get WORSE when hand raises that param.
    if (myReqs) {
      var antiEnablers = 0;
      for (var pmKey3 in paramMap) {
        var pmName3 = paramMap[pmKey3];
        if (!myReqs[pmName3] || !myReqs[pmName3].max) continue;
        for (var _rek = 0; _rek < myHand.length; _rek++) {
          if (myHand[_rek] === cardName) continue;
          var aekEff = _effData[myHand[_rek]];
          if (aekEff && aekEff[pmKey3] && aekEff[pmKey3] > 0) antiEnablers++;
        }
      }
      if (antiEnablers >= 1) {
        bonus -= Math.min(antiEnablers * 0.4, 1);
        descs.push(antiEnablers + ' raise vs max-req');
      }
    }

    // ── 70. TAG REQUIREMENT ENABLERS: exact unlock-chain reasons for tag gates ──
    var myTagReq = _tagReqs[cardName];
    if (myTagReq) {
      for (var trTag in myTagReq) {
        var trNeeded = myTagReq[trTag];
        if (typeof trNeeded === 'object') continue;
        var haveTagNow = ctxTagsHS[trTag] || 0;
        var needTagGap = trNeeded - haveTagNow;
        if (needTagGap <= 0) continue;
        for (var _tri = 0; _tri < myHand.length; _tri++) {
          if (myHand[_tri] === cardName) continue;
          var trTags = getCardTagsLocal(myHand[_tri]);
          var tagCopies = countCardTagCopies(trTags, trTag);
          if (!tagCopies) continue;
          var forwardKey = 'tag-forward:' + cardName + ':' + myHand[_tri] + ':' + trTag;
          var tagLabel = getRequirementTagReasonLabel(trTag);
          var targetLabel = reasonCardLabel(myHand[_tri]);
          if (!isTargetOtherwiseReady(cardName, null, null, trTag)) continue;
          if (tagCopies >= needTagGap) {
            if (!tagUnlockSeen.has(forwardKey)) {
              tagUnlockSeen.add(forwardKey);
              immediateTagUnlocks++;
              bonus += 0.8 + getUnlockScoreWeight(myHand[_tri]) * 0.4;
              descs.push('Открывается ' + targetLabel + ' по ' + tagLabel);
            }
          } else if (tagCopies === needTagGap - 1) {
            var forwardNearKey = forwardKey + ':near';
            if (!tagUnlockSeen.has(forwardNearKey)) {
              tagUnlockSeen.add(forwardNearKey);
              nearTagUnlocks++;
              bonus += 0.35 + getUnlockScoreWeight(myHand[_tri]) * 0.2;
              descs.push('Req: ещё 1 ' + tagLabel);
            }
          }
        }
      }
    }
    // Reverse: this card's tags open or nearly open other hand cards with tag requirements.
    if (!isEvent && cardTagsArr.length > 0) {
      for (var _trj = 0; _trj < myHand.length; _trj++) {
        if (myHand[_trj] === cardName) continue;
        var trReq = _lookupCardData ? _lookupCardData(_tagReqs, myHand[_trj]) : _tagReqs[myHand[_trj]];
        if (!trReq) continue;
        for (var trTag2 in trReq) {
          if (typeof trReq[trTag2] === 'object') continue;
          var thisTagCopies = countCardTagCopies(cardTagsArr, trTag2);
          if (!thisTagCopies) continue;
          var haveBefore2 = ctxTagsHS[trTag2] || 0;
          var needBefore2 = trReq[trTag2];
          if (haveBefore2 >= needBefore2) continue;
          var haveAfter2 = haveBefore2 + thisTagCopies;
          var addedTagCounts4 = {};
          addedTagCounts4[trTag2] = thisTagCopies;
          if (!isTargetOtherwiseReady(myHand[_trj], null, addedTagCounts4, trTag2)) continue;
          var reverseKey = 'tag-reverse:' + myHand[_trj] + ':' + trTag2;
          var tagLabel2 = getRequirementTagReasonLabel(trTag2);
          var targetLabel4 = reasonCardLabel(myHand[_trj]);
          if (haveAfter2 >= needBefore2) {
            if (!tagUnlockSeen.has(reverseKey)) {
              tagUnlockSeen.add(reverseKey);
              immediateTagUnlocks++;
              bonus += 1.0 + getUnlockScoreWeight(myHand[_trj]) * 0.55;
              descs.push('Открывает ' + targetLabel4 + ' по ' + tagLabel2);
            }
          } else if (haveAfter2 === needBefore2 - 1) {
            var reverseNearKey = reverseKey + ':near';
            if (!tagUnlockSeen.has(reverseNearKey)) {
              tagUnlockSeen.add(reverseNearKey);
              nearTagUnlocks++;
              bonus += 0.45 + getUnlockScoreWeight(myHand[_trj]) * 0.25;
              descs.push('Ещё 1 ' + tagLabel2 + ' до ' + targetLabel4);
            }
          } else {
            tagUnlockFallback++;
          }
          break;
        }
      }
    }

    if (!isEvent && cardTagsArr.indexOf('science') >= 0) {
      var scienceReqTargets = 0;
      var scienceReqWeight = 0;
      var scienceTagCopies = countCardTagCopies(cardTagsArr, 'science');
      var scienceHaveNow = ctxTagsHS.science || 0;
      for (var _srt = 0; _srt < myHand.length; _srt++) {
        if (myHand[_srt] === cardName) continue;
        var scienceReq = _lookupCardData ? _lookupCardData(_tagReqs, myHand[_srt]) : _tagReqs[myHand[_srt]];
        if (!scienceReq || typeof scienceReq.science !== 'number') continue;
        if (scienceHaveNow >= scienceReq.science) continue;
        var scienceAfter = scienceHaveNow + scienceTagCopies;
        if (scienceAfter <= scienceHaveNow) continue;
        var scienceAddedCounts = { science: scienceTagCopies };
        if (!isTargetOtherwiseReady(myHand[_srt], null, scienceAddedCounts, 'science')) continue;
        scienceReqTargets++;
        scienceReqWeight += getUnlockScoreWeight(myHand[_srt]);
      }
      if (scienceReqTargets > 0) {
        var cheapScienceTag = (cardEff.c || 0) <= 6;
        var scienceReqBonus = Math.min(
          scienceReqTargets * (cheapScienceTag ? 1.25 : 0.8) + scienceReqWeight * 0.35,
          cheapScienceTag ? 4.5 : 3.0
        );
        if (scienceReqBonus > 0) {
          bonus += scienceReqBonus;
          descs.push((cheapScienceTag ? 'cheap science→req ×' : 'science→req ×') + scienceReqTargets);
        }
      }
    }

    if (globalUnlockFallback > 0 && immediateGlobalUnlocks + nearGlobalUnlocks === 0) {
      bonus += Math.min(globalUnlockFallback * 0.25, 0.8);
      descs.push('req chain ×' + globalUnlockFallback);
    }
    if (tagUnlockFallback > 0 && immediateTagUnlocks + nearTagUnlocks === 0) {
      bonus += Math.min(tagUnlockFallback * 0.2, 0.6);
      descs.push('tag chain ×' + tagUnlockFallback);
    }

    // ── 71. TRIPLE RESOURCE CHAIN: energy→heat→MC/TR pipeline compound ──
    // If hand has energy prod + heat prod/converter + MC converter (Insulation/Power Infra/Caretaker),
    // energy cards get extra bonus: energy→heat(residual)→MC is a triple chain.
    var _mcConverters = ['Insulation', 'Power Infrastructure', 'Caretaker Contract'];
    var hasMCConverter = false;
    var hasHeatProd = false;
    var hasEnergyProd = false;
    for (var _rci = 0; _rci < myHand.length; _rci++) {
      if (myHand[_rci] === cardName) continue;
      if (_mcConverters.indexOf(myHand[_rci]) >= 0) hasMCConverter = true;
      var rcEff = _effData[myHand[_rci]];
      if (rcEff && rcEff.hp > 0) hasHeatProd = true;
      if (rcEff && rcEff.ep > 0) hasEnergyProd = true;
    }
    // Energy prod card in hand with heat prod + MC converter = triple chain
    if (cardEff.ep && cardEff.ep > 0 && (hasHeatProd || hasMCConverter) && (hasHeatProd && hasMCConverter)) {
      bonus += Math.min(cardEff.ep * 0.6, 1.5);
      descs.push('ep→hp→MC chain');
    }
    // MC converter card in hand with both energy + heat prod = triple chain receiving end
    if (_mcConverters.indexOf(cardName) >= 0 && hasEnergyProd && hasHeatProd) {
      bonus += 1;
      descs.push('triple chain sink');
    }

    // ── 68. TIMING MISMATCH: prod cards late game or VP-only cards early = diminished value ──
    // Production cards at gensLeft ≤ 2 barely pay back; pure VP cards at gensLeft >= 7 are too early.
    if (isTimingPureProdCard && gensLeft <= 2) {
      var lateOtherProd = 0;
      for (var _tmi = 0; _tmi < myHand.length; _tmi++) {
        if (myHand[_tmi] === cardName) continue;
        var tmEff = _effData[myHand[_tmi]];
        if (tmEff && (tmEff.mp > 0 || tmEff.sp > 0 || tmEff.tp > 0 || tmEff.pp > 0 || tmEff.ep > 0 || tmEff.hp > 0)
            && !(tmEff.vp > 0 || tmEff.vpAcc || tmEff.tr > 0 || tmEff.places)) lateOtherProd++;
      }
      if (lateOtherProd >= 2) {
        var lateProdPen = -Math.min((lateOtherProd - 1) * 0.5, 1.5);
        bonus += lateProdPen;
        descs.push('late prod ×' + (lateOtherProd + 1));
      }
    }

    // ── 69. SHARED RESOURCE COMPETITION: multiple animal VP accumulators compete for placements ──
    // If 3+ animal VP accumulators, they compete for limited animal placement from Large Convoy etc.
    if (cardEff.vpAcc && cardTagsArr.indexOf('animal') >= 0) {
      var animalAccCount = 0;
      for (var _arc = 0; _arc < myHand.length; _arc++) {
        if (myHand[_arc] === cardName) continue;
        var arcEff = _effData[myHand[_arc]];
        var arcTags = getCardTagsLocal(myHand[_arc]);
        if (arcEff && arcEff.vpAcc && arcTags.indexOf('animal') >= 0) animalAccCount++;
      }
      // 3+ competing accumulators = diminishing returns on placement
      if (animalAccCount >= 2) {
        bonus -= Math.min((animalAccCount - 1) * 0.4, 1);
        descs.push((animalAccCount + 1) + ' animal VP compete');
      }
    }

    // ── 72. EVENT BENEFIT COMPOUND: event-boosting cards + multiple events in hand ──
    // Media Group (+3 MC per event), Media Archives (similar), Optimal Aerobraking (heat+plants per space event)
    var _eventBenefitCards = { 'Media Group': 3, 'Media Archives': 3, 'Optimal Aerobraking': 3 };
    var eventsInHandCount = (handTagMap['event'] || []).length;
    if (_eventBenefitCards[cardName]) {
      var evOthers = eventsInHandCount - (cardTagsArr.indexOf('event') >= 0 ? 1 : 0);
      if (evOthers >= 2) {
        var evBenVal = Math.min((evOthers - 1) * _eventBenefitCards[cardName] / 7, 2);
        bonus += evBenVal;
        descs.push(evOthers + ' events +' + _eventBenefitCards[cardName] + 'ea');
      }
    }
    if (cardTagsArr.indexOf('event') >= 0) {
      var evBenCount = 0;
      for (var _ebi = 0; _ebi < myHand.length; _ebi++) {
        if (myHand[_ebi] === cardName) continue;
        if (_eventBenefitCards[myHand[_ebi]]) evBenCount++;
      }
      if (evBenCount >= 1) {
        bonus += Math.min(evBenCount * 0.5, 1);
        descs.push(evBenCount + ' event benefiter' + (evBenCount > 1 ? 's' : ''));
      }
    }

    // ── 73. TERRAFORM SPREAD: hand covers multiple global parameters efficiently ──
    // Raising 3+ different params = flexible terraforming, no wasted standard project actions
    // Also count grn (greenery→o2) and actOc (action ocean) as param coverage
    var paramsCovered = {};
    for (var _tsi = 0; _tsi < myHand.length; _tsi++) {
      var tsEff = _effData[myHand[_tsi]];
      if (!tsEff) continue;
      if (tsEff.tmp > 0) paramsCovered['tmp'] = true;
      if (tsEff.oc > 0 || tsEff.actOc > 0) paramsCovered['oc'] = true;
      if (tsEff.o2 > 0 || tsEff.grn > 0) paramsCovered['o2'] = true;
      if (tsEff.vn > 0) paramsCovered['vn'] = true;
    }
    var paramTypes = Object.keys(paramsCovered).length;
    var myParamContrib = 0;
    if (cardEff.tmp > 0) myParamContrib++;
    if (cardEff.oc > 0 || cardEff.actOc > 0) myParamContrib++;
    if (cardEff.o2 > 0 || cardEff.grn > 0) myParamContrib++;
    if (cardEff.vn > 0) myParamContrib++;
    if (paramTypes >= 3 && myParamContrib >= 1) {
      // 3 params = +0.9, 4 params = +1.8; multi-param card bonus handled in section 93
      var tfSpreadBase = Math.min((paramTypes - 2) * 0.9, 2.0);
      bonus += tfSpreadBase;
      descs.push('terraform ' + paramTypes + ' params');
    }

    // ── 74. CONVERSION FLEXIBILITY: energy prod + 2+ different converters = adaptive engine ──
    // Having multiple energy sinks means you choose the best one each turn
    var _energyConverterMap = {
      'Steelworks': 'steel', 'Ironworks': 'steel', 'Water Splitting Plant': 'ocean',
      'Electro Catapult': 'MC', 'Power Infrastructure': 'MC',
      'Caretaker Contract': 'TR', 'Insulation': 'heat→MC'
    };
    if (cardEff.ep && cardEff.ep > 0) {
      var convTypes = {};
      for (var _cfi = 0; _cfi < myHand.length; _cfi++) {
        if (myHand[_cfi] === cardName) continue;
        var convType = _energyConverterMap[myHand[_cfi]];
        if (convType) convTypes[convType] = true;
      }
      var convCount = Object.keys(convTypes).length;
      if (convCount >= 2) {
        bonus += Math.min((convCount - 1) * 0.5, 1.5);
        descs.push(convCount + ' conv options');
      }
    }
    if (_energyConverterMap[cardName]) {
      var otherConvTypes = {};
      var hasEpForConv = false;
      for (var _cfj = 0; _cfj < myHand.length; _cfj++) {
        if (myHand[_cfj] === cardName) continue;
        var cfjEff = _effData[myHand[_cfj]];
        if (cfjEff && cfjEff.ep > 0) hasEpForConv = true;
        var cfjConv = _energyConverterMap[myHand[_cfj]];
        if (cfjConv && cfjConv !== _energyConverterMap[cardName]) otherConvTypes[cfjConv] = true;
      }
      if (hasEpForConv && Object.keys(otherConvTypes).length >= 1) {
        bonus += 0.4;
        descs.push('conv flex');
      }
    }

    // ── 75. AFFORDABILITY TENSION: too many expensive cards compete for limited MC ──
    // 4+ cards costing ≥20 MC = can't play them all, hand has internal tension
    if (cardEff.c && cardEff.c >= 20) {
      var expensiveOthers = 0;
      for (var _ati = 0; _ati < myHand.length; _ati++) {
        if (myHand[_ati] === cardName) continue;
        var atEff = _effData[myHand[_ati]];
        if (atEff && atEff.c >= 20) expensiveOthers++;
      }
      if (expensiveOthers >= 3) {
        bonus -= Math.min((expensiveOthers - 2) * 0.4, 1.2);
        descs.push('MC crunch ×' + (expensiveOthers + 1));
      }
    }

    // ── 80. HEAT-ONLY TR ENGINE: high heat prod → temp via standard project = implicit TR ──
    // Without temp raisers or MC converters (Insulation/PowerInfra), heat → temperature for free
    if (cardEff.hp && cardEff.hp > 0) {
      var totalHp80 = cardEff.hp;
      var hasTmpCards80 = false;
      var hasMCSink80 = false;
      for (var _hoi = 0; _hoi < myHand.length; _hoi++) {
        if (myHand[_hoi] === cardName) continue;
        var hoEff80 = _effData[myHand[_hoi]];
        if (hoEff80 && hoEff80.hp > 0) totalHp80 += hoEff80.hp;
        if (hoEff80 && hoEff80.tmp > 0) hasTmpCards80 = true;
        if (myHand[_hoi] === 'Insulation' || myHand[_hoi] === 'Power Infrastructure') hasMCSink80 = true;
      }
      // Section 78 handles heat+tmp; section 58 handles heat+converters. This handles heat-only.
      if (!hasTmpCards80 && !hasMCSink80 && totalHp80 >= 8) {
        var trPerGen80 = totalHp80 / 8;
        bonus += Math.min(trPerGen80 * 0.5, 1.5);
        descs.push('heat→temp ' + (Math.round(trPerGen80 * 10) / 10) + '/gen');
      }
    }

    // ── 78. HEAT→TEMP COMPOUND: heat prod + temp raisers both push temperature ──
    // High heat prod = implicit temp raises via conversion (8 heat → 1 temp → 1 TR).
    // Combined with direct temp cards = accelerated TR engine.
    var totalHpHand78 = 0;
    var totalTmpHand78 = 0;
    for (var _hti = 0; _hti < myHand.length; _hti++) {
      if (myHand[_hti] === cardName) continue;
      var htEff78 = _effData[myHand[_hti]];
      if (!htEff78) continue;
      if (htEff78.hp > 0) totalHpHand78 += htEff78.hp;
      if (htEff78.tmp > 0) totalTmpHand78 += htEff78.tmp;
    }
    // Heat prod card + temp raisers in hand: both push temperature
    if (cardEff.hp && cardEff.hp > 0 && totalTmpHand78 >= 1) {
      bonus += Math.min(totalTmpHand78 * 0.4, 2);
      descs.push('hp+tmp×' + totalTmpHand78);
    }
    // Temp raiser + high heat prod: heat also pushes temp
    if (cardEff.tmp && cardEff.tmp > 0 && totalHpHand78 >= 6) {
      var implicitTempTR = totalHpHand78 / 8;
      bonus += Math.min(implicitTempTR * 0.8, 2);
      descs.push('tmp+' + totalHpHand78 + 'hp');
    }

    // ── 79. PLANT→O2 COMPOUND: plant prod + greenery/oxygen raisers both push oxygen ──
    // High plant prod = greeneries = oxygen raises. Direct o2/grn cards compound with plant prod.
    var totalPpHand79 = 0;
    var totalO2Hand79 = 0;
    for (var _poi = 0; _poi < myHand.length; _poi++) {
      if (myHand[_poi] === cardName) continue;
      var poEff79 = _effData[myHand[_poi]];
      if (!poEff79) continue;
      if (poEff79.pp > 0) totalPpHand79 += poEff79.pp;
      if (poEff79.o2 > 0 || poEff79.grn > 0) totalO2Hand79 += (poEff79.o2 || 0) + (poEff79.grn || 0);
    }
    // Plant prod card + o2/greenery cards: both push oxygen
    if (cardEff.pp && cardEff.pp > 0 && totalO2Hand79 >= 1) {
      bonus += Math.min(totalO2Hand79 * 0.4, 1.5);
      descs.push('pp+o2×' + totalO2Hand79);
    }
    // O2/greenery card + high plant prod: plants also push oxygen via greenery
    if ((cardEff.o2 > 0 || cardEff.grn > 0) && totalPpHand79 >= 4) {
      var implicitO2 = totalPpHand79 / 8;
      bonus += Math.min(implicitO2 * 0.6, 1.5);
      descs.push('o2+' + totalPpHand79 + 'pp');
    }

    // ── 76. WILD TAG FLEXIBILITY: wild tags count as any tag for stacking/requirements ──
    var isWildCard = cardTagsArr.indexOf('wild') >= 0;
    if (isWildCard) {
      // Wild tag = can be any tag. Most valuable when hand has concentrated tag demand.
      var handTagDemand = {};
      var _tagReqsWild = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
      // Demand from tag requirements
      for (var _wi = 0; _wi < myHand.length; _wi++) {
        if (myHand[_wi] === cardName) continue;
        var wrReq = _tagReqsWild[myHand[_wi]];
        if (wrReq) {
          for (var wrTag in wrReq) handTagDemand[wrTag] = (handTagDemand[wrTag] || 0) + 2;
        }
      }
      // Demand from tag stacking (2+ of same tag = stacking is active)
      var _stackTags = ['science', 'earth', 'venus', 'jovian', 'plant', 'microbe', 'animal', 'building', 'space'];
      for (var _wj = 0; _wj < _stackTags.length; _wj++) {
        var stCount = (handTagMap[_stackTags[_wj]] || []).filter(function(n) { return n !== cardName; }).length;
        if (stCount >= 2) handTagDemand[_stackTags[_wj]] = (handTagDemand[_stackTags[_wj]] || 0) + stCount;
      }
      var maxDemand = 0;
      for (var _wk in handTagDemand) {
        if (handTagDemand[_wk] > maxDemand) maxDemand = handTagDemand[_wk];
      }
      if (maxDemand >= 2) {
        bonus += Math.min(maxDemand * 0.3, 1.5);
        descs.push('wild→' + Object.keys(handTagDemand).length + ' tags');
      }
    }
    // Reverse: wild tags in hand help satisfy this card's tag requirements
    if (!isWildCard) {
      var wildInHand = (handTagMap['wild'] || []).filter(function(n) { return n !== cardName; }).length;
      var _tagReqsWild2 = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
      if (wildInHand >= 1 && _tagReqsWild2[cardName]) {
        bonus += Math.min(wildInHand * 0.4, 1);
        descs.push(wildInHand + ' wild for req');
      }
    }

    // ── 81. ACTION STALL COMPOUND: 2-3 action cards = stall value (delay round end) ──
    // Section 32 penalizes 4+ actions. But 2-3 is the sweet spot: each extra action = ~1 MC stall value.
    // Only fires at gensLeft >= 3 (stall matters when game is contested, not in final push).
    var isAction81 = !!(cardEff.actTR || cardEff.actMC || cardEff.vpAcc || cardEff.actCD || cardEff.actOc);
    if (isAction81 && gensLeft >= 3) {
      var actionsOther81 = 0;
      for (var _as81 = 0; _as81 < myHand.length; _as81++) {
        if (myHand[_as81] === cardName) continue;
        var asEff81 = _effData[myHand[_as81]];
        if (asEff81 && (asEff81.actTR || asEff81.actMC || asEff81.vpAcc || asEff81.actCD || asEff81.actOc)) actionsOther81++;
      }
      // 2-3 action cards = stall bonus; 4+ already penalized by section 32
      if (actionsOther81 >= 1 && actionsOther81 <= 2) {
        bonus += Math.min((actionsOther81 + 1) * 0.3, 0.9);
        descs.push((actionsOther81 + 1) + ' actions stall');
      }
    }

    // ── 82. MC PROD SELF-FUNDING: MC-prod cards offset cost of expensive cards in hand ──
    // A hand with both MC-prod and expensive cards is more coherent: the engine funds the payoffs.
    var totalMpHand82 = 0;
    for (var _sf82 = 0; _sf82 < myHand.length; _sf82++) {
      if (myHand[_sf82] === cardName) continue;
      var sfEff82 = _effData[myHand[_sf82]];
      if (sfEff82 && sfEff82.mp > 0) totalMpHand82 += sfEff82.mp;
    }
    if (canUseFundingNow && cardEff.c && cardEff.c >= 15 && totalMpHand82 >= 3) {
      // Expensive card with good MC prod support = easier to afford
      bonus += Math.min(totalMpHand82 * 0.2, 1.2);
      descs.push('funded by ' + totalMpHand82 + 'mp');
    }
    if (canUseFundingNow && cardEff.mp && cardEff.mp > 0) {
      // MC prod card with expensive cards in hand = funding role
      var expensiveInHand82 = 0;
      for (var _sf82b = 0; _sf82b < myHand.length; _sf82b++) {
        if (myHand[_sf82b] === cardName) continue;
        var sfEff82b = _effData[myHand[_sf82b]];
        if (sfEff82b && sfEff82b.c >= 15) expensiveInHand82++;
      }
      if (expensiveInHand82 >= 2) {
        // Scale with both expensive card count AND mp amount
        var fundVal82 = Math.min(expensiveInHand82 * 0.15 + cardEff.mp * 0.2, 2.0);
        bonus += fundVal82;
        descs.push('funds ' + expensiveInHand82 + ' ×' + cardEff.mp + 'mp');
      }
    }

    // ── 83. VP DENSITY LATE: 3+ VP cards at gensLeft ≤ 3 = VP sprint bonus ──
    // Late game, VP cards convert MC directly to points. Dense VP hands maximize final push.
    if (isVPCard && gensLeft <= 3 && gensLeft >= 1 && canUseLateVPNow) {
      var vpOthers83 = 0;
      var totalVPValue83 = 0;
      for (var _vd83 = 0; _vd83 < myHand.length; _vd83++) {
        if (myHand[_vd83] === cardName) continue;
        var vdEff83 = _effData[myHand[_vd83]];
        if (vdEff83 && ((vdEff83.vp || 0) > 0 || vdEff83.vpAcc || (vdEff83.tr || 0) > 0)) {
          vpOthers83++;
          totalVPValue83 += (vdEff83.vp || 0) + (vdEff83.tr || 0) * 2;
        }
      }
      // 3+ VP cards in late game = sprint is on
      // Scale by this card's VP (1 VP gets less sprint than 3 VP)
      if (vpOthers83 >= 2) {
        var myVP83 = (cardEff.vp || 0) + (cardEff.tr || 0);
        var vpScale83 = Math.min(myVP83, 3) / 2; // 1VP=0.5x, 2VP=1.0x, 3VP=1.5x
        var sprintMult83 = (4 - gensLeft) * 0.4 * Math.max(vpScale83, 0.3);
        bonus += Math.min(vpOthers83 * sprintMult83, 4);
        descs.push('VP sprint ×' + (vpOthers83 + 1));
      }
    }

    // ── 77. MULTI-PARAM CARD BONUS: cards that raise 2+ different params are more versatile ──
    // Comet (tmp+oc), Giant Ice Asteroid (tmp+oc), Towing A Comet (oc+o2) etc.
    // (Section 77 merged into section 93 — multi-param intrinsic bonus)

    // ── 84. DISCOUNT AMPLIFIER: multiple discounters = compound savings ──
    // Each discount card saves MC per play. 2+ discounters = play more cards per gen = compound.
    var _discData84 = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
    var myDisc84 = _discData84[cardName];
    if (myDisc84) {
      var otherDisc84 = 0;
      var matchingTagCards84 = 0;
      for (var _d84 = 0; _d84 < myHand.length; _d84++) {
        if (myHand[_d84] === cardName) continue;
        if (isPreludeOrCorpName(myHand[_d84])) continue;
        if (_discData84[myHand[_d84]]) otherDisc84++;
        if (cardMatchesDiscountEntry(myHand[_d84], myDisc84)) matchingTagCards84++;
      }
      if (otherDisc84 >= 1 && matchingTagCards84 >= 2) {
        bonus += Math.min(otherDisc84 * 0.4 + matchingTagCards84 * 0.15, 1.5);
        var discLabel84 = getDiscountTargetLabel(myDisc84);
        descs.push((otherDisc84 + 1) + ' discount engines + ' + matchingTagCards84 + ' ' + discLabel84 + ' targets');
      }
    }
    // Reverse: card benefits from discounters in hand
    if (!myDisc84) {
      var discSavings84 = 0;
      for (var _d84r = 0; _d84r < myHand.length; _d84r++) {
        if (myHand[_d84r] === cardName) continue;
        if (!isSupportPlayableSoon(myHand[_d84r])) continue;
        var rd84 = _discData84[myHand[_d84r]];
        if (!rd84) continue;
        if (rd84._all || rd84._req) { discSavings84 += (rd84._all || rd84._req); continue; }
        for (var rd84k in rd84) {
          if (rd84k.charAt(0) === '_') continue; // skip meta keys
          if (cardTagsArr.indexOf(rd84k) >= 0) { discSavings84 += rd84[rd84k]; break; }
        }
      }
      if (discSavings84 >= 3) {
        bonus += Math.min(discSavings84 * 0.15, 1);
        descs.push('disc +' + discSavings84 + ' MC');
      }
    }

    // ── 85. RESOURCE GENERATOR COMPOUND: resource generators + VP accumulators of same type ──
    // Symbiotic Fungus generates microbes → Decomposers accumulates VP from microbes. Same for animals/floaters.
    if (cardEff.vpAcc && cardEff.res) {
      var resType85 = cardEff.res;
      var generators85 = 0;
      for (var _rg85 = 0; _rg85 < myHand.length; _rg85++) {
        if (myHand[_rg85] === cardName) continue;
        var rgEff85 = _effData[myHand[_rg85]];
        if (!rgEff85) continue;
        // Cards that generate this resource type (have res field but are generators, not just accumulators)
        if (rgEff85.res === resType85 && !rgEff85.vpAcc) generators85++;
      }
      if (generators85 >= 1) {
        bonus += Math.min(generators85 * 0.5, 1.5);
        descs.push(generators85 + ' ' + resType85 + ' gen');
      }
    }
    // Reverse: generator with VP accumulators in hand
    if (cardEff.res && !cardEff.vpAcc) {
      var resType85r = cardEff.res;
      var accumulators85 = 0;
      for (var _rg85r = 0; _rg85r < myHand.length; _rg85r++) {
        if (myHand[_rg85r] === cardName) continue;
        var rgEff85r = _effData[myHand[_rg85r]];
        if (rgEff85r && rgEff85r.vpAcc && rgEff85r.res === resType85r) accumulators85++;
      }
      if (accumulators85 >= 1) {
        bonus += Math.min(accumulators85 * 0.4, 1);
        descs.push(accumulators85 + ' ' + resType85r + ' VP sink');
      }
    }

    // ── 86. TRIGGER CHAIN AMPLIFIER: 2+ trigger cards + dense matching tags = compound draw ──
    // Mars Uni + Olympus Conf in a 4-science hand = double card draw per science played.
    var _ttDataTCA = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
    var isTriggerCard86 = !!_ttDataTCA[cardName];
    if (isTriggerCard86) {
      var otherTriggers86 = 0;
      var triggerTagPool86 = {};
      // Collect tags that fire triggers from all trigger cards
      var myTrigEntries86 = _ttDataTCA[cardName] || [];
      for (var _t86a = 0; _t86a < myTrigEntries86.length; _t86a++) {
        var t86tags = myTrigEntries86[_t86a].tags;
        for (var _t86b = 0; _t86b < t86tags.length; _t86b++) triggerTagPool86[t86tags[_t86b]] = true;
      }
      for (var _t86c = 0; _t86c < myHand.length; _t86c++) {
        if (myHand[_t86c] === cardName) continue;
        if (_ttDataTCA[myHand[_t86c]]) {
          otherTriggers86++;
          var otEntries86 = _ttDataTCA[myHand[_t86c]];
          for (var _t86d = 0; _t86d < otEntries86.length; _t86d++) {
            var ot86tags = otEntries86[_t86d].tags;
            for (var _t86e = 0; _t86e < ot86tags.length; _t86e++) triggerTagPool86[ot86tags[_t86e]] = true;
          }
        }
      }
      // Count hand cards matching any trigger tag (excluding trigger cards themselves)
      if (otherTriggers86 >= 1) {
        var matchingCards86 = 0;
        for (var _t86f = 0; _t86f < myHand.length; _t86f++) {
          if (myHand[_t86f] === cardName) continue;
          if (_ttDataTCA[myHand[_t86f]]) continue;
          var ftags86 = getCardTagsLocal(myHand[_t86f]);
          for (var _t86g = 0; _t86g < ftags86.length; _t86g++) {
            if (triggerTagPool86[ftags86[_t86g]]) { matchingCards86++; break; }
          }
        }
        if (matchingCards86 >= 2) {
          bonus += Math.min(otherTriggers86 * matchingCards86 * 0.2, 1.5);
          descs.push((otherTriggers86 + 1) + ' triggers×' + matchingCards86);
        }
      }
    }

    // ── 87. TIMING DAMPENER: at gensLeft ≤ 2, reduce production-centric synergies ──
    // Generalist milestone, prod diversity, steel/ti availability — all lose value in final gens.
    // This doesn't replace section 68 (which directly penalizes late prod), it dampens compounding bonuses.
    if (isTimingPureProdCard && gensLeft <= 2 && bonus > 2) {
      var dampFactor87 = 0.7; // reduce 30% of non-VP prod synergy excess
      var excessBonus87 = bonus - 2;
      bonus = 2 + excessBonus87 * dampFactor87;
      descs.push('late damp');
    }

    // ── 88. CITY ADJACENCY COMPOUND: 3+ city cards = adjacency VP compound ──
    // Each city adjacent to another city = 1 VP. 3 cities = up to 3-6 VP from adjacency alone.
    if (cardTagsArr.indexOf('city') >= 0 && gensLeft >= 3) {
      var citiesOther88 = 0;
      for (var _ca88 = 0; _ca88 < myHand.length; _ca88++) {
        if (myHand[_ca88] === cardName) continue;
        var caTags88 = getCardTagsLocal(myHand[_ca88]);
        if (caTags88.indexOf('city') >= 0) citiesOther88++;
      }
      // 3+ cities = adjacency planning becomes viable
      if (citiesOther88 >= 2) {
        bonus += Math.min(citiesOther88 * 0.4, 1.2);
        descs.push((citiesOther88 + 1) + ' city adj');
      }
    }

    // ── 89. SOLE CONVERTER KEYSTONE: only converter for 10+ production = keystone card ──
    // If this card is the only way to monetize a large production base, it's irreplaceable.
    // Caretaker with 15hp and no Insulation = keystone; Insulation with 15hp and no Caretaker = keystone.
    if (mcConv) {
      var otherConverters89 = 0;
      for (var _sk89 = 0; _sk89 < myHand.length; _sk89++) {
        if (myHand[_sk89] === cardName) continue;
        if (MC_CONVERTERS[myHand[_sk89]] && MC_CONVERTERS[myHand[_sk89]].src === mcConv.src) otherConverters89++;
      }
      // Also count Helion as a heat converter (heat=MC inherently)
      if (mcConv.src === 'hp' && ctx._myCorps) {
        for (var _hc89 = 0; _hc89 < ctx._myCorps.length; _hc89++) {
          if (ctx._myCorps[_hc89] === 'Helion') otherConverters89++;
        }
      }
      var convProd89 = 0;
      for (var _sp89 = 0; _sp89 < myHand.length; _sp89++) {
        if (myHand[_sp89] === cardName) continue;
        var sp89Eff = _effData[myHand[_sp89]];
        if (sp89Eff && sp89Eff[mcConv.src] > 0) convProd89 += sp89Eff[mcConv.src];
      }
      if (otherConverters89 === 0 && convProd89 >= 10) {
        var keystoneVal = Math.min((convProd89 - 8) * 0.3, 1.5);
        bonus += keystoneVal;
        descs.push('sole ' + mcConv.label.split('→')[1] + ' conv');
      }
    }

    // ── 90. AWARD RACING SYNERGY: cards that help win a contested award ──
    // ctx.awardRacing = { 'Thermalist': 2, 'Miner': 1 } → distance to 1st place
    // Cards whose effects/tags push toward winning an award get a bonus.
    if (ctx.awardRacing) {
      var _awardMap90 = {
        'Thermalist': { res: 'hp', immediate: 'h' },  // heat resource + heat prod
        'Miner': { res: 'sp', res2: 'tp' },            // steel + ti prod
        'Banker': { res: 'mp' },                        // MC prod
        'Scientist': { tag: 'science' },
        'Landlord': { tag: 'plant', eff: 'grn' },      // greenery tiles
        'Cultivator': { eff: 'grn', eff2: 'pp' },      // greenery tiles + plant prod
        'Celebrity': {},                                 // 20+ cost cards (handled separately)
        'Industrialist': { res: 'sp', res2: 'ep' },    // steel + energy
        'Desert Settler': { eff: 'oc' },                // oceans
        'Estate Dealer': { eff: 'oc' },                 // oceans (adjacent)
        'Venuphile': { tag: 'venus' },
        'Contractor': { tag: 'building' },
        'Promoter': { tag: 'event' },
      };
      for (var aw90 in ctx.awardRacing) {
        var awDist90 = ctx.awardRacing[aw90];
        if (awDist90 > 5) continue; // Too far to matter
        var awDef90 = _awardMap90[aw90];
        if (!awDef90) continue;
        var awContrib90 = 0;
        // Tag match
        if (awDef90.tag && cardTagsArr.indexOf(awDef90.tag) >= 0) awContrib90 += cardTagsArr.filter(function(t) { return t === awDef90.tag; }).length;
        // Production match
        if (awDef90.res && cardEff[awDef90.res] && cardEff[awDef90.res] > 0) awContrib90 += cardEff[awDef90.res];
        if (awDef90.res2 && cardEff[awDef90.res2] && cardEff[awDef90.res2] > 0) awContrib90 += cardEff[awDef90.res2];
        // Effect match
        if (awDef90.eff && cardEff[awDef90.eff] && cardEff[awDef90.eff] > 0) awContrib90 += cardEff[awDef90.eff];
        if (awDef90.eff2 && cardEff[awDef90.eff2] && cardEff[awDef90.eff2] > 0) awContrib90 += 1;
        // Immediate resources
        if (awDef90.immediate && cardEff[awDef90.immediate] && cardEff[awDef90.immediate] > 0) awContrib90 += 1;
        if (awContrib90 > 0) {
          // Closer to winning = bigger bonus; distance 0-1 = very close, 2-3 = medium, 4-5 = far
          var awMul90 = awDist90 <= 1 ? 1.0 : (awDist90 <= 3 ? 0.6 : 0.3);
          var awVal90 = Math.min(awContrib90 * awMul90, 2);
          bonus += awVal90;
          descs.push(aw90 + ' award +' + awContrib90);
        }
      }
    }

    // ── 91. COLONY FLEET DENSITY: 4+ colony cards amplify trade fleet value ──
    // With 4+ colonies in hand, each trade fleet card unlocks significantly more income per trade
    var colCount91 = 0;
    var isFleet91 = cardHasTradeEngineByName(cardName);
    var isCol91 = cardIsColonyRelatedByName(cardName);
    if (isFleet91 || isCol91) {
      for (var _c91 = 0; _c91 < myHand.length; _c91++) {
        if (cardIsColonyRelatedByName(myHand[_c91])) colCount91++;
      }
      if (colCount91 >= 4) {
        var colDensity91 = Math.min((colCount91 - 3) * 0.6, 1.5);
        bonus += colDensity91;
        descs.push(colCount91 + ' col density');
      }
    }

    // ── 92. CHAIRMAN CONTROL PREMIUM: 7+ delegates = chairman lock, compound political power ──
    // Chairman gives +1 TR/gen and party control — 7+ delegates makes it very likely
    if (_delCards[cardName]) {
      var totalDel92 = 0;
      for (var _d92 = 0; _d92 < myHand.length; _d92++) {
        if (_delCards[myHand[_d92]]) totalDel92 += _delCards[myHand[_d92]];
      }
      if (totalDel92 >= 7) {
        // Chairman lock premium: +1 TR/gen is worth ~7 MC/gen; each delegate above 6 solidifies control
        var chairBonus92 = Math.min((totalDel92 - 6) * 0.5, 2.0);
        bonus += chairBonus92;
        descs.push('chairman lock');
      }
    }

    // ── 93. MULTI-PARAM INTRINSIC: cards raising 2+ different global params = efficient TR ──
    // A card like Comet (tmp+oc) gives 2 TR from one play — intrinsically efficient.
    // Also scales with other param cards in hand (compound flex from old section 77).
    if (myParamContrib >= 2) {
      var mpBase93 = Math.min((myParamContrib - 1) * 0.6, 1.2);
      var otherParamCards93 = 0;
      for (var _mp93 = 0; _mp93 < myHand.length; _mp93++) {
        if (myHand[_mp93] === cardName) continue;
        var mp93Eff = _effData[myHand[_mp93]];
        if (!mp93Eff) continue;
        if (mp93Eff.tmp > 0 || mp93Eff.oc > 0 || mp93Eff.actOc > 0 || mp93Eff.o2 > 0 || mp93Eff.grn > 0 || mp93Eff.vn > 0) otherParamCards93++;
      }
      // Extra for compound with other param cards
      if (otherParamCards93 >= 2) mpBase93 += Math.min(otherParamCards93 * 0.15, 0.6);
      bonus += mpBase93;
      descs.push(myParamContrib + '-param card');
    }

    // ── 94. TAG DIVERSITY FOR MILESTONES: 7+ unique tag types in hand = Diversifier proximity ──
    // Only applies if Diversifier milestone is actually in the game
    var hasDiversifierMS = ctx.milestones && ctx.milestones.has('Diversifier');
    var uniqueTagTypes94 = {};
    for (var _t94 = 0; _t94 < myHand.length; _t94++) {
      var t94Tags = getCardTagsLocal(myHand[_t94]);
      for (var _t94j = 0; _t94j < t94Tags.length; _t94j++) {
        if (t94Tags[_t94j] !== 'event' && t94Tags[_t94j] !== 'wild') uniqueTagTypes94[t94Tags[_t94j]] = true;
      }
    }
    var tagDiversity94 = Object.keys(uniqueTagTypes94).length;
    if (hasDiversifierMS && tagDiversity94 >= 7 && cardTagsArr.length > 0) {
      // Check if this card contributes a unique tag not provided by others
      var myUniqueTags94 = 0;
      for (var _t94k = 0; _t94k < cardTagsArr.length; _t94k++) {
        if (cardTagsArr[_t94k] === 'event' || cardTagsArr[_t94k] === 'wild') continue;
        // Would removing this card lose this tag type?
        var otherHasTag94 = false;
        for (var _t94m = 0; _t94m < myHand.length; _t94m++) {
          if (myHand[_t94m] === cardName) continue;
          var t94mTags = getCardTagsLocal(myHand[_t94m]);
          if (t94mTags.indexOf(cardTagsArr[_t94k]) >= 0) { otherHasTag94 = true; break; }
        }
        if (!otherHasTag94) myUniqueTags94++;
      }
      if (myUniqueTags94 > 0) {
        bonus += Math.min(myUniqueTags94 * 0.5, 1.0);
        descs.push('Diversifier ' + tagDiversity94 + ' tags');
      }
    }

    // ── 95. ACTION + VP ACCUMULATOR WINDOW: action VP cards need gens to accumulate ──
    // When hand has multiple action cards that accumulate VP (vpAcc), enough gensLeft amplifies their value.
    if (cardEff.vpAcc && !(cardEff.actMC > 0) && gensLeft >= 4) {
      var otherVpAcc95 = 0;
      for (var _v95 = 0; _v95 < myHand.length; _v95++) {
        if (myHand[_v95] === cardName) continue;
        var v95Eff = _effData[myHand[_v95]];
        if (v95Eff && v95Eff.vpAcc) otherVpAcc95++;
      }
      // 2+ vpAcc cards = VP accumulation engine; more gens = more VP
      if (otherVpAcc95 >= 1) {
        var vpAccBonus95 = Math.min(otherVpAcc95 * 0.3 * Math.min(gensLeft / 5, 1.5), 1.5);
        bonus += vpAccBonus95;
        descs.push(otherVpAcc95 + 1 + ' VP accum ×' + gensLeft + 'g');
      }
    }

    // ── 96. ENERGY FULL CHAIN VALUE: ep without consumer in heat-heavy hand ──
    // When energy prod has no consumer but the hand is fully heat-committed (heat prod + heat use),
    // each energy prod generates heat that integrates into the heat chain at full value.
    if (cardEff.ep && cardEff.ep > 0) {
      var hasConsumer96 = false;
      var heatTotal96 = 0;
      var heatUse96 = 0; // heat converters or temp raisers
      for (var _ec96 = 0; _ec96 < myHand.length; _ec96++) {
        if (myHand[_ec96] === cardName) continue;
        if (TM_ENERGY_CONSUMERS.indexOf(myHand[_ec96]) >= 0) hasConsumer96 = true;
        var ec96Eff = _effData[myHand[_ec96]];
        if (ec96Eff) {
          if (ec96Eff.hp > 0) heatTotal96 += ec96Eff.hp;
          if (ec96Eff.tmp > 0) heatUse96++;
        }
        if (myHand[_ec96] === 'Insulation' || myHand[_ec96] === 'Caretaker Contract') heatUse96++;
      }
      // Temp headroom counts as a heat use path (standard project heat→temp)
      if (tempHR > 0.5) heatUse96++;
      // No consumer + high heat + heat use = energy fully integrates into heat chain
      if (!hasConsumer96 && heatTotal96 >= 8 && heatUse96 >= 1) {
        var chainVal96 = Math.min(cardEff.ep * 0.3, 1.0);
        bonus += chainVal96;
        descs.push('ep→heat chain ' + heatTotal96 + 'hp');
      }
    }

    // ── 97. HAND TAG DENSITY: 10+ total tags from 5 cards = flexible for requirements ──
    // Dense tag hands satisfy more requirements, contribute to more milestones/awards.
    var totalTagCount97 = 0;
    for (var _td97 = 0; _td97 < myHand.length; _td97++) {
      var td97Tags = getCardTagsLocal(myHand[_td97]);
      totalTagCount97 += td97Tags.length;
    }
    if (totalTagCount97 >= 10 && cardTagsArr.length >= 2) {
      // Cards with 2+ tags in a tag-dense hand contribute disproportionately
      var tagDenseVal97 = Math.min((cardTagsArr.length - 1) * 0.3, 0.9);
      bonus += tagDenseVal97;
    }

    // ── 98. EARLY PROD AMPLIFIER: production at gensLeft >= 7 compounds extra ──
    // Each gen of production adds cumulative value. At 7+ gens left, prod cards get timing premium.
    if (isProdCard && !isVPCard && gensLeft >= 7) {
      var earlyProdVal98 = Math.min((gensLeft - 6) * 0.3, 0.9);
      bonus += earlyProdVal98;
    }

    // ── 99. MC CRUNCH RELIEF: steel/ti prod offsets expensive building/space cards ──
    // When the hand has MC crunch (4+ expensive cards) but also steel/ti production,
    // the crunch is partially relieved for building/space cards.
    if (cardEff.c && cardEff.c >= 20) {
      var reliefProd99 = 0;
      var expCount99 = 0;
      for (var _cr99 = 0; _cr99 < myHand.length; _cr99++) {
        if (myHand[_cr99] === cardName) continue;
        var cr99Eff = _effData[myHand[_cr99]];
        if (!cr99Eff) continue;
        if (cr99Eff.c >= 20) expCount99++;
        if (cardTagsArr.indexOf('building') >= 0 && cr99Eff.sp > 0) reliefProd99 += cr99Eff.sp * 2;
        if (cardTagsArr.indexOf('space') >= 0 && cr99Eff.tp > 0) reliefProd99 += cr99Eff.tp * 3;
      }
      if (expCount99 >= 3 && reliefProd99 >= 4) {
        var reliefVal99 = Math.min(reliefProd99 * 0.08, 0.8);
        bonus += reliefVal99;
        descs.push('crunch relief ' + reliefProd99 + ' res');
      }
    }

    // ── 100. STALL + VP ACCUMULATOR COMPOUND: action VP + stall = VP/gen while delaying ──
    // When action vpAcc cards also have stall value (2-3 actions), each stall action generates VP.
    if (cardEff.vpAcc && isAction81 && gensLeft >= 4) {
      var otherActions100 = 0;
      var otherVpAcc100 = 0;
      for (var _sv100 = 0; _sv100 < myHand.length; _sv100++) {
        if (myHand[_sv100] === cardName) continue;
        var sv100Eff = _effData[myHand[_sv100]];
        if (!sv100Eff) continue;
        if (sv100Eff.actTR || sv100Eff.actMC || sv100Eff.vpAcc || sv100Eff.actCD || sv100Eff.actOc) otherActions100++;
        if (sv100Eff.vpAcc) otherVpAcc100++;
      }
      // 2+ total actions AND 1+ other vpAcc = stalling while accumulating VP
      if (otherActions100 >= 1 && otherVpAcc100 >= 1) {
        var stallVP100 = Math.min(otherVpAcc100 * 0.4, 1.2);
        bonus += stallVP100;
        descs.push('stall+VP ×' + (otherVpAcc100 + 1));
      }
    }

    // ── 101. VENUS STRATEGY COMPOUND: 4+ venus tags = Venus Governor/Venuphile proximity ──
    // Dense venus hands amplify venus-specific discounts, milestones, and venus raise cards.
    var venusTagCount101 = 0;
    var venusRaisers101 = 0;
    var isVenusTag101 = cardTagsArr.indexOf('venus') >= 0;
    if (isVenusTag101) {
      for (var _v101 = 0; _v101 < myHand.length; _v101++) {
        var v101Tags = getCardTagsLocal(myHand[_v101]);
        if (v101Tags.indexOf('venus') >= 0) venusTagCount101++;
        var v101Eff = _effData[myHand[_v101]];
        if (v101Eff && v101Eff.vn > 0) venusRaisers101++;
      }
      // 4+ venus tags = Venus Governor proximity (req 3 venus tags on map)
      // Each additional venus tag beyond 3 = more milestone/award coverage
      if (venusTagCount101 >= 4) {
        var venusDensity101 = Math.min((venusTagCount101 - 3) * 0.4, 1.2);
        // Extra if hand also raises venus (venus raisers + venus tags = full venus strategy)
        if (venusRaisers101 >= 2) venusDensity101 += Math.min(venusRaisers101 * 0.2, 0.6);
        bonus += venusDensity101;
        descs.push('venus ' + venusTagCount101 + ' tags');
      }
    }

    // ── 102. RESOURCE PLACEMENT CROSS-AMPLIFIER: places:X card + 3+ res:X cards = keystone ──
    // Cards with places:"floater"/"animal"/"microbe" place resources on ANY card of that type.
    // With 3+ matching resource cards, the placer amplifies multiple VP/TR sinks at once.
    var _placesField102 = cardEff.places;
    if (_placesField102) {
      var _placeTypes102 = Array.isArray(_placesField102) ? _placesField102 : [_placesField102];
      var _placeCount102 = Math.max(1, cardEff.placesN || 1);
      for (var _pt102 = 0; _pt102 < _placeTypes102.length; _pt102++) {
        var _placeType102 = _placeTypes102[_pt102];
        var matchingRes102 = 0;
        for (var _rp102 = 0; _rp102 < myHand.length; _rp102++) {
          if (myHand[_rp102] === cardName) continue;
          var rp102Eff = _effData[myHand[_rp102]];
          if (rp102Eff && rp102Eff.res === _placeType102) matchingRes102++;
        }
        // Multi-placement cards become keystones with slightly fewer matching targets.
        if (matchingRes102 >= 3 || (_placeCount102 >= 2 && matchingRes102 >= 2)) {
          var placeAmp102 = Math.min(((matchingRes102 - 2) * 0.5) + ((_placeCount102 - 1) * 0.25), 1.8);
          bonus += placeAmp102;
          descs.push('place ' + _placeType102 + ' ×' + matchingRes102 + (_placeCount102 > 1 ? ' ×' + _placeCount102 : ''));
        }
      }
    }
    // Reverse: res:X card with places:X cards in hand = gets extra resources
    if (cardEff.res && !cardEff.places) {
      var placers102 = 0;
      for (var _rp102r = 0; _rp102r < myHand.length; _rp102r++) {
        if (myHand[_rp102r] === cardName) continue;
        var rp102rEff = _effData[myHand[_rp102r]];
        if (rp102rEff && rp102rEff.places) {
          var rp102rTypes = Array.isArray(rp102rEff.places) ? rp102rEff.places : [rp102rEff.places];
          if (rp102rTypes.indexOf(cardEff.res) !== -1) {
            placers102 += Math.max(1, (rp102rEff.placesN || 1) >= 3 ? 2 : 1);
          }
        }
      }
      // 2+ placers = this card gets resources from multiple sources
      if (placers102 >= 2) {
        var receiveAmp102 = Math.min(placers102 * 0.4, 1.2);
        bonus += receiveAmp102;
        descs.push(placers102 + ' ' + cardEff.res + ' placers');
      }
    }

    // ── 103. ACTION REVENUE DIVERSITY: 3+ action cards with different revenue types ──
    // When action cards produce MC, TR, cards, and oceans from different sources,
    // the hand has diversified income = lower variance, more flexible per-gen decisions.
    var isAction103 = cardEff.actTR > 0 || cardEff.actMC > 0 || cardEff.actCD > 0 || cardEff.actOc > 0 || cardEff.vpAcc;
    if (isAction103) {
      var revenueTypes103 = {};
      var actionCount103 = 0;
      for (var _ar103 = 0; _ar103 < myHand.length; _ar103++) {
        var ar103Eff = _effData[myHand[_ar103]];
        if (!ar103Eff) continue;
        var hasAct103 = false;
        if (ar103Eff.actTR > 0) { revenueTypes103['TR'] = true; hasAct103 = true; }
        if (ar103Eff.actMC > 0) { revenueTypes103['MC'] = true; hasAct103 = true; }
        if (ar103Eff.actCD > 0) { revenueTypes103['CD'] = true; hasAct103 = true; }
        if (ar103Eff.actOc > 0) { revenueTypes103['OC'] = true; hasAct103 = true; }
        if (ar103Eff.vpAcc) { revenueTypes103['VP'] = true; hasAct103 = true; }
        if (hasAct103) actionCount103++;
      }
      var revTypes103 = Object.keys(revenueTypes103).length;
      // 3+ different revenue types from 3+ action cards = diversified action income
      if (revTypes103 >= 3 && actionCount103 >= 3) {
        var divBonus103 = Math.min((revTypes103 - 2) * 0.4, 1.2);
        bonus += divBonus103;
        descs.push(revTypes103 + ' act revenue');
      }
    }

    if (cardName === 'Suitable Infrastructure') {
      descs = descs.filter(function(desc) {
        if (!desc) return false;
        if (/Sky Docks скидка \+\d/.test(desc)) return false;
        if (/^\d+ building тегов в руке(?: ×\d\.\d)?$/.test(desc)) return false;
        if (/steel avail \+\d/.test(desc)) return false;
        return true;
      });
    }

    if (bonus !== 0 || forceHandReasonVisibility) {
      // Soft cap: diminishing returns above 8, hard cap at 12
      if (bonus > 8) bonus = 8 + (bonus - 8) * 0.5;
      bonus = Math.max(Math.min(bonus, 12), -5);
      var topDescs = descs.slice(0, 4);
      if (descs.length > 4) topDescs.push('+' + (descs.length - 4));
      // Split positive/negative descs into separate reason lines
      var posDescs = topDescs.filter(function(d) { return !/[\-−]\d/.test(d); });
      var negDescs = topDescs.filter(function(d) { return /[\-−]\d/.test(d); });
      var handReasons = [];
      var handReasonRows = [];
      if (posDescs.length > 0) handReasons.push('Hand: ' + posDescs.join(', '));
      if (posDescs.length > 0) handReasonRows.push({ tone: 'positive', text: 'Hand: ' + posDescs.join(', ') });
      if (negDescs.length > 0) handReasons.push('Hand: ' + negDescs.join(', '));
      if (negDescs.length > 0) handReasonRows.push({ tone: 'negative', text: 'Hand: ' + negDescs.join(', ') });
      return { bonus: Math.round(bonus * 10) / 10, reasons: handReasons, reasonRows: handReasonRows };
    }
    return { bonus: 0, reasons: [], reasonRows: [] };
  }

  function formatTableauSynergyReason(cardName, targetName, weight, reverse) {
    var label = describeNamedSynergy(targetName);
    if (cardName === 'Project Inspection' && !reverse) {
      return 'Повтор ' + label + ' +' + weight;
    }
    return label + ' ' + (weight < 0 ? weight : ('+' + weight));
  }

  function isSpentTableauSynergy(cardName, targetName) {
    if (!cardName || !targetName) return false;
    var cardTags = getCardTagsForName(cardName);
    if (!cardTags || cardTags.length === 0) return false;
    var hasWildcard = cardTags.indexOf('wild') >= 0;
    var spentTagPayoffs = {
      'Cartel': ['earth'],
      'Miranda Resort': ['earth'],
      'Luna Metropolis': ['earth'],
      'Lunar Mining': ['earth'],
      'Gyropolis': ['earth', 'venus'],
      'Satellites': ['space'],
      'Insects': ['plant'],
      'Worms': ['microbe'],
      'Power Grid': ['power'],
      'Advanced Power Grid': ['power'],
      'Medical Lab': ['building'],
      'Parliament Hall': ['building'],
      'Sulphur Exports': ['venus'],
      'Martian Monuments': ['mars'],
      'Racketeering': ['crime'],
      'Terraforming Ganymede': ['jovian'],
      'Social Events': ['mars']
    };
    var payoffTags = spentTagPayoffs[targetName];
    if (payoffTags) {
      for (var pti = 0; pti < payoffTags.length; pti++) {
        if (hasWildcard || cardTags.indexOf(payoffTags[pti]) >= 0) return true;
      }
    }
    if (typeof TM_CARD_TAG_REQS !== 'undefined') {
      var tagReqs = _lookupCardData ? _lookupCardData(TM_CARD_TAG_REQS, targetName) : TM_CARD_TAG_REQS[targetName];
      if (tagReqs) {
        for (var reqTag in tagReqs) {
          if (!Object.prototype.hasOwnProperty.call(tagReqs, reqTag)) continue;
          if (typeof tagReqs[reqTag] !== 'number') continue;
          if (hasWildcard || cardTags.indexOf(reqTag) >= 0) return true;
        }
      }
    }
    return false;
  }

  // Synergy with tableau cards — forward (data.y) + reverse lookup
  function scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet, playedEvents) {
    let synTotal = 0;
    let synCount = 0;
    let synDescs = [];
    let directPartners = new Set();
    // Skip corps — already scored in corp synergy (5c), avoid double-count
    var _corpSet = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
    if (data.y) {
      for (const entry of data.y) {
        var sn = yName(entry);
        var sw = yWeight(entry) || SC.tableauSynergyPer;
        if (playedEvents.has(sn)) continue;
        if (_corpSet[sn]) continue; // corp already handled in 5c
        if (isSpentTableauSynergy(cardName, sn)) continue;
        if (allMyCardsSet.has(sn) && synCount < SC.tableauSynergyMax) {
          synCount++;
          synTotal += sw;
          directPartners.add(sn);
          var directReason = formatTableauSynergyReason(cardName, sn, sw, false);
          if (directReason) synDescs.push(directReason);
        }
      }
    }
    // Reverse lookup: tableau card lists THIS card as synergy
    // Lower weight — "X benefits from me" ≠ "I benefit from X"
    var reverseScale = 0.5;
    for (const myCard of allMyCards) {
      if (playedEvents.has(myCard)) continue;
      if (_corpSet[myCard]) continue; // corp already handled in 5c
      const myData = TM_RATINGS[myCard];
      if (!myData || !myData.y) continue;
      if (directPartners.has(myCard)) continue;
      for (const re of myData.y) {
        if (yName(re) === cardName && synCount < SC.tableauSynergyMax) {
          if (isSpentTableauSynergy(cardName, myCard)) break;
          var rw = Math.round(((yWeight(re) || SC.tableauSynergyPer) * reverseScale) * 10) / 10;
          synCount++;
          synTotal += rw;
          var reverseReason = formatTableauSynergyReason(cardName, myCard, rw, true);
          if (reverseReason) synDescs.push(reverseReason);
          break;
        }
      }
    }
    if (synTotal !== 0) {
      return { bonus: synTotal, reasons: [synDescs.slice(0, 2).join(', ')] };
    }
    return { bonus: 0, reasons: [] };
  }

  // Combo + anti-combo potential (indexed lookup with timing)
  function scoreComboPotential(cardName, eLower, allMyCardsSet, ctx) {
    var bonus = 0;
    var reasons = [];
    var comboIdx = getComboIndex();
    if (comboIdx[cardName]) {
      let bestComboBonus = 0;
      let bestComboDesc = '';
      for (const entry of comboIdx[cardName]) {
        const combo = entry.combo;
        const otherCards = entry.otherCards;
        const matchCount = otherCards.filter(function(c) { return allMyCardsSet.has(c); }).length;
        if (matchCount === 0) continue;

        // Check if missing cards include a corporation we don't own — combo is impossible
        var _missingCards = otherCards.filter(function(c) { return !allMyCardsSet.has(c); });
        var _corpData = typeof TM_CORPS !== 'undefined' ? TM_CORPS : {};
        var _myCorpsCombo = ctx && ctx._myCorps ? ctx._myCorps : [];
        var _hasMissingCorp = false;
        for (var _mc = 0; _mc < _missingCards.length; _mc++) {
          if (_corpData[_missingCards[_mc]] && _myCorpsCombo.indexOf(_missingCards[_mc]) === -1) {
            _hasMissingCorp = true; break;
          }
        }
        if (_hasMissingCorp) continue; // combo requires a corp we don't have — skip

        // Penalize combo if partner cards have unmet global requirements
        var _gReqs = typeof TM_CARD_GLOBAL_REQS !== 'undefined' ? TM_CARD_GLOBAL_REQS : {};
        var _gp = ctx && ctx.globalParams ? ctx.globalParams : {};
        var reqPenalty = 1.0;
        for (var _ri = 0; _ri < otherCards.length; _ri++) {
          if (!allMyCardsSet.has(otherCards[_ri])) continue;
          var _pr = _gReqs[otherCards[_ri]];
          if (!_pr) continue;
          var reqFar = false;
          if (_pr.oxy && _gp.oxy !== undefined && _gp.oxy < _pr.oxy) reqFar = true;
          if (_pr.temp && _gp.temp !== undefined && _gp.temp < _pr.temp) reqFar = true;
          if (_pr.venus && _gp.venus !== undefined && _gp.venus < _pr.venus) reqFar = true;
          if (_pr.oceans && _gp.oceans !== undefined && _gp.oceans < _pr.oceans) reqFar = true;
          if (reqFar) { reqPenalty = 0.3; break; }
        }

        const baseBonus = combo.r === 'godmode' ? SC.comboGodmode : combo.r === 'great' ? SC.comboGreat : combo.r === 'good' ? SC.comboGood : SC.comboDecent;
        const completionRate = (matchCount + 1) / combo.cards.length;
        let comboBonus = Math.round(baseBonus * (1 + completionRate) * reqPenalty);

        if (ctx) {
          let timingMul = 1.0;
          if (ctx.gensLeft !== undefined) {
            const cardIsBlue = eLower.includes('action');
            const isProd = PROD_KEYWORDS.some(function(kw) { return eLower.includes(kw); });
            const isVPBurst = eLower.includes('vp') && !isProd && !cardIsBlue;
            const isAccum = eLower.includes('vp per') || eLower.includes('vp за');

            if (cardIsBlue) {
              timingMul = ctx.gensLeft >= 6 ? SC.timingBlue6 : ctx.gensLeft >= 4 ? SC.timingBlue4 : ctx.gensLeft >= 2 ? SC.timingBlue2 : SC.timingBlue1;
            } else if (isProd) {
              timingMul = ctx.gensLeft >= 5 ? SC.timingProd5 : ctx.gensLeft >= 3 ? SC.timingProd3 : SC.timingProd1;
            } else if (isVPBurst) {
              timingMul = ctx.gensLeft <= 2 ? SC.timingVPBurst2 : ctx.gensLeft <= 4 ? SC.timingVPBurst4 : SC.timingVPBurstHi;
            } else if (isAccum) {
              timingMul = ctx.gensLeft >= 5 ? SC.timingAccum5 : ctx.gensLeft >= 3 ? SC.timingAccum3 : SC.timingAccum1;
            }
          }
          comboBonus = Math.round(comboBonus * timingMul);
        }

        if (comboBonus > bestComboBonus) {
          bestComboBonus = comboBonus;
          bestComboDesc = combo.v + ' (' + (matchCount + 1) + '/' + combo.cards.length + ')';
        }
      }
      if (bestComboBonus > 0) {
        bonus += bestComboBonus;
        reasons.push('Комбо: ' + bestComboDesc);
      }
    }
    var antiIdx = getAntiComboIndex();
    if (antiIdx[cardName]) {
      for (const entry of antiIdx[cardName]) {
        if (entry.otherCards.some(function(c) { return allMyCardsSet.has(c); })) {
          bonus -= SC.antiCombo;
          reasons.push('Конфликт: ' + entry.anti.v);
          break;
        }
      }
    }
    return { bonus: bonus, reasons: reasons };
  }

  // ── Discounts, material payments, and tag triggers ──

  function scoreDiscountsAndPayments(cardTags, cardCost, cardType, ctx, tagDecay) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];

    // 1. Tag discounts from corp/cards
    if (cardCost != null && cardTags.size > 0) {
      var totalDiscount = cardCost - getEffectiveCost(cardCost, cardTags, ctx.discounts);
      if (totalDiscount >= 2) {
        var discountBonus = Math.min(SC.discountCap, totalDiscount);
        bonus += discountBonus;
        pushStructuredReason(reasons, reasonRows, 'Скидка −' + totalDiscount + ' MC', discountBonus);
      }
      // Discount stacking bonus: 2+ sources = extra synergy
      if (totalDiscount >= 4) {
        var discountSources = 1;
        for (var tag of cardTags) {
          if (ctx.discounts[tag] > 0) discountSources++;
        }
        if (discountSources >= 2) {
          var stackBonus = Math.min(SC.discountStackMax, discountSources);
          bonus += stackBonus;
          pushStructuredReason(reasons, reasonRows, 'Стак скидок ×' + discountSources, stackBonus);
        }
      }
    }

    // 2. Steel payment (building tag)
    if (cardTags.has('building') && ctx.steel > 0) {
      var steelUsable = cardCost != null ? Math.min(ctx.steel, Math.ceil(cardCost / ctx.steelVal)) : ctx.steel;
      var steelMC = Math.min(steelUsable * ctx.steelVal, cardCost != null ? cardCost : steelUsable * ctx.steelVal);
      var steelBonus = Math.min(SC.steelPayCap, Math.round(steelMC / SC.steelPayDivisor));
      if (steelBonus > 0) {
        bonus += steelBonus;
        pushStructuredReason(reasons, reasonRows, 'Сталь −' + steelMC + ' MC', steelBonus);
      }
    }

    // 3. Titanium payment (space tag)
    if (cardTags.has('space') && ctx.titanium > 0) {
      var tiUsable = cardCost != null ? Math.min(ctx.titanium, Math.ceil(cardCost / ctx.tiVal)) : ctx.titanium;
      var tiMC = Math.min(tiUsable * ctx.tiVal, cardCost != null ? cardCost : tiUsable * ctx.tiVal);
      var tiBonus = Math.min(SC.tiPayCap, Math.round(tiMC / SC.tiPayDivisor));
      if (tiBonus > 0) {
        bonus += tiBonus;
        pushStructuredReason(reasons, reasonRows, 'Титан −' + tiMC + ' MC', tiBonus);
      }
    }

    // 4. Tag triggers from tableau cards
    if (cardTags.size > 0 && ctx.tagTriggers.length > 0) {
      var triggerTotal = 0;
      var triggerDescs = [];
      for (var ti = 0; ti < ctx.tagTriggers.length; ti++) {
        var trigger = ctx.tagTriggers[ti];
        for (var tti = 0; tti < trigger.tags.length; tti++) {
          if (cardTags.has(trigger.tags[tti])) {
            if (trigger.eventOnly && cardType !== 'red') break; // e.g. Optimal Aerobraking: space events only
            triggerTotal += trigger.value;
            triggerDescs.push(trigger.desc);
            break;
          }
        }
      }
      if (triggerTotal > 0) {
        var decayedTrigger = Math.round(Math.min(SC.triggerCap, triggerTotal) * tagDecay);
        if (decayedTrigger > 0) {
          bonus += decayedTrigger;
          pushStructuredReason(reasons, reasonRows, triggerDescs.slice(0, 2).join(', ') + (tagDecay < 1 ? ' ×' + tagDecay.toFixed(1) : ''), decayedTrigger);
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  // ── Terraform rate awareness (fast/slow game) ──

  function scoreTerraformRate(ctx, eLower, data) {
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    if (!ctx || ctx.terraformRate <= 0 || ctx.gen < 3 || !data.e) return { bonus: 0, reasons: [], reasonRows: [] };

    var isFastGame = ctx.terraformRate >= SC.terraformFastThreshold;
    var isSlowGame = ctx.terraformRate <= SC.terraformSlowThreshold;
    var isProd = eLower.includes('prod') || eLower.includes('прод');
    var isVP = eLower.includes('vp') || eLower.includes('вп');

    if (isFastGame && isProd && !isVP) {
      bonus -= SC.terraformFastProdPenalty;
      pushStructuredReason(reasons, reasonRows, 'Быстр. игра −' + SC.terraformFastProdPenalty, -SC.terraformFastProdPenalty);
    }
    if (isSlowGame && isProd && !isVP && ctx.gensLeft >= 4) {
      bonus += SC.terraformSlowProdBonus;
      pushStructuredReason(reasons, reasonRows, 'Медл. игра +' + SC.terraformSlowProdBonus, SC.terraformSlowProdBonus);
    }
    if (isFastGame && isVP) {
      bonus += SC.terraformFastVPBonus;
      pushStructuredReason(reasons, reasonRows, 'Быстр. → VP +' + SC.terraformFastVPBonus, SC.terraformFastVPBonus);
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  function scoreDraftCard(cardName, myTableau, myHand, myCorp, cardEl, ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreDraftCard) {
      return TM_CONTENT_PLAY_PRIORITY.scoreDraftCard({
        cardName: cardName,
        myTableau: myTableau,
        myHand: myHand,
        myCorp: myCorp,
        cardEl: cardEl,
        ctx: ctx,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        getPlayerVueData: getPlayerVueData,
        detectMyCorps: detectMyCorps,
        getOpeningHandBias: getOpeningHandBias,
        sc: SC,
        applyResult: applyResult,
        scoreTableauSynergy: scoreTableauSynergy,
        scoreComboPotential: scoreComboPotential,
        scoreHandSynergy: scoreHandSynergy,
        getCachedCardTags: getCachedCardTags,
        getCardCost: getCardCost,
        cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
        scoreCardRequirements: scoreCardRequirements,
        isPreludeOrCorpCard: isPreludeOrCorpCard,
        scoreDiscountsAndPayments: scoreDiscountsAndPayments,
        scoreTagSynergies: scoreTagSynergies,
        scoreColonySynergy: scoreColonySynergy,
        scoreTurmoilSynergy: scoreTurmoilSynergy,
        scoreFTNTiming: scoreFTNTiming,
        scoreCrudeTiming: scoreCrudeTiming,
        scoreMilestoneAwardProximity: scoreMilestoneAwardProximity,
        scoreResourceSynergies: scoreResourceSynergies,
        scoreCardEconomyInContext: scoreCardEconomyInContext,
        scoreOpponentAwareness: scoreOpponentAwareness,
        scorePositionalFactors: scorePositionalFactors,
        getCorpBoost: getCorpBoost,
        combos: typeof TM_COMBOS !== 'undefined' ? TM_COMBOS : null,
        scoreMapMA: _scoreMapMA,
        scoreTerraformRate: scoreTerraformRate,
        scorePostContextChecks: scorePostContextChecks,
        scoreBoardStateModifiers: scoreBoardStateModifiers,
        scoreSynergyRules: _scoreSynergyRules,
        scorePrelude: _scorePrelude,
        scoreBreakEvenTiming: scoreBreakEvenTiming,
        checkDenyDraft: checkDenyDraft,
        checkHateDraft: checkHateDraft,
        debugMode: debugMode,
        tmLog: tmLog
      });
    }
    const data = TM_RATINGS[cardName];
    if (!data) return { total: 0, reasons: [] };

    var pv = getPlayerVueData();
    let bonus = 0;
    const reasons = [];
    var reasonRows = [];
    const eLower = data.e ? data.e.toLowerCase() : '';

    // Two Corps support: use cached corps from ctx or detect once
    var myCorps = ctx && ctx._myCorps ? ctx._myCorps : [];
    if (myCorps.length === 0) {
      if (myCorp) myCorps.push(myCorp);
      var allDetected = detectMyCorps();
      for (var ci = 0; ci < allDetected.length; ci++) {
        if (allDetected[ci] && myCorps.indexOf(allDetected[ci]) === -1) myCorps.push(allDetected[ci]);
      }
    }

    // Base score: always COTD expert rating (EV shown alongside)
    var baseScore = data.s;
    var openingBias = getOpeningHandBias(cardName, data, ctx);
    if (openingBias) {
      baseScore += openingBias;
      reasons.push('старт ' + (openingBias > 0 ? '+' : '') + openingBias);
    }

    // Tag value decay — tags lose value toward endgame (fewer cards left to play)
    var tagDecay = (ctx.gensLeft >= SC.tagDecayFullAt) ? 1.0
      : Math.max(SC.tagDecayMin, ctx.gensLeft / SC.tagDecayFullAt);

    // Corp boosts handled by getCorpBoost + CORP_ABILITY_SYNERGY

    // Synergy with tableau cards (weighted y) + reverse lookup
    const allMyCards = ctx && ctx._allMyCards ? ctx._allMyCards : [...myTableau, ...myHand];
    const allMyCardsSet = ctx && ctx._allMyCardsSet ? ctx._allMyCardsSet : new Set(allMyCards);
    var playedEvents = ctx && ctx._playedEvents ? ctx._playedEvents : new Set();
    bonus = applyResult(scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet, playedEvents), bonus, reasons, reasonRows);

    // Combo + anti-combo potential (indexed lookup with timing)
    bonus = applyResult(scoreComboPotential(cardName, eLower, allMyCardsSet, ctx), bonus, reasons, reasonRows);

    // Hand synergy: enablers, resource placement, tag density between cards in hand
    var handSyn = scoreHandSynergy(cardName, myHand, ctx);
    bonus = applyResult(handSyn, bonus, reasons, reasonRows);

    // Detect card tags and cost from DOM (used by context scoring and post-context checks)
    let cardTags = new Set();
    if (cardEl) {
      cardTags = getCachedCardTags(cardEl);
    }
    let cardCost = null;
    if (cardEl) {
      cardCost = getCardCost(cardEl);
    }
    // Fallback: get cost from card_effects data if DOM parsing failed
    if (cardCost == null && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fxCost = TM_CARD_EFFECTS[cardName];
      if (fxCost && fxCost.c != null) cardCost = fxCost.c;
    }

    // ── Context-aware scoring (requires ctx and optionally cardEl) ──
    if (ctx) {

      // 0. Requirement feasibility + MET bonus
      var reqResult = scoreCardRequirements(cardEl, ctx, cardName);
      if (reqResult) {
        bonus = applyResult(reqResult, bonus, reasons, reasonRows);
      }

      // Detect card type: blue (active/action), red (event), green (automated)
      let cardType = 'green';
      if (cardEl) {
        if (cardEl.classList.contains('card-type--active') ||
            cardEl.querySelector('.card-content--blue, .blue-action, [class*="blue"]')) {
          cardType = 'blue';
        } else if (cardTags.has('event') ||
                   cardEl.classList.contains('card-type--event') ||
                   cardEl.querySelector('.card-content--red')) {
          cardType = 'red';
        }
      } else if (cardTags.has('event')) {
        cardType = 'red';
      } else if (eLower.includes('action')) {
        cardType = 'blue';
      }

      // Detect prelude/corp early — preludes are free, discounts don't apply
      var _isPreludeOrCorpEarly = isPreludeOrCorpCard(cardEl);

      // 1-4. Discounts, material payments, tag triggers (skip for preludes — they cost 0 MC)
      if (!_isPreludeOrCorpEarly) {
        bonus = applyResult(scoreDiscountsAndPayments(cardTags, cardCost, cardType, ctx, tagDecay), bonus, reasons, reasonRows);
      }

      // 5-5d. Tag synergies — density, hand affinity, auto-synergy, corp ability, Pharmacy Union
      var tagSyn = scoreTagSynergies(cardName, cardTags, cardType, cardCost, tagDecay, eLower, data, myCorps, ctx, pv);
      bonus = applyResult(tagSyn, bonus, reasons, reasonRows);

      // 6. Colony synergy
      var colSyn = scoreColonySynergy(cardName, eLower, data, ctx);
      bonus = applyResult(colSyn, bonus, reasons, reasonRows);

      // 6b. Turmoil synergy
      var turSyn = scoreTurmoilSynergy(eLower, data, cardTags, ctx);
      bonus = applyResult(turSyn, bonus, reasons, reasonRows);

      // FTN timing delta + ocean-dependent action penalty
      // Detect prelude/corp — skip timing (all play at gen 1 simultaneously)
      var _isPreludeOrCorp = isPreludeOrCorpCard(cardEl);
      var ftnResult = scoreFTNTiming(cardName, ctx, { isPreludeOrCorp: !!_isPreludeOrCorp, myHand: myHand });
      bonus = applyResult(ftnResult, bonus, reasons, reasonRows);
      var skipCrudeTiming = ftnResult.skipCrudeTiming;

      // 7-8d. Crude timing (skipped when FTN timing available)
      if (!skipCrudeTiming) {
        var ctResult = scoreCrudeTiming(cardName, eLower, data, ctx);
        bonus = applyResult(ctResult, bonus, reasons, reasonRows);
      }

      // 9-10b. Milestone/Award proximity
      var maProx = scoreMilestoneAwardProximity(cardTags, cardType, eLower, data, ctx);
      bonus = applyResult(maProx, bonus, reasons, reasonRows);

      // 13-15. Resource synergies — energy, plants, heat
      var resSyn = scoreResourceSynergies(eLower, data, cardTags, ctx, cardName);
      bonus = applyResult(resSyn, bonus, reasons, reasonRows);

      // 16-22. Card economy in context
      var econCtx = scoreCardEconomyInContext(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, skipCrudeTiming);
      bonus = applyResult(econCtx, bonus, reasons, reasonRows);

      // 24b + 41. Opponent awareness
      var oppAw = scoreOpponentAwareness(cardName, eLower, data, cardTags, ctx);
      bonus = applyResult(oppAw, bonus, reasons, reasonRows);

      // 23-32b. Positional factors
      var reqMet = reasons.some(function(r) { return r.includes('Req ✓'); });
      var reqPenaltyPresent = reasons.some(function(r) {
        return r.indexOf('Req ') === 0 || r.includes('Окно') || r.indexOf('Нет ') === 0 || r.indexOf('Нужно ') === 0;
      });
      var posFact = scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet, reqPenaltyPresent, _isPreludeOrCorp);
      bonus = applyResult(posFact, bonus, reasons, reasonRows);

      // 33. Corporation-specific scoring via unified getCorpBoost()
      if (!_isPreludeOrCorp && myCorp && data.e) {
        var cbOpts = { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx, globalParams: ctx.globalParams };
        for (var cbi = 0; cbi < myCorps.length; cbi++) {
          var cbCorp = myCorps[cbi];
          var corpBoost = getCorpBoost(cbCorp, cbOpts);
          if (corpBoost !== 0) {
            bonus += corpBoost;
            reasons.push(describeCorpBoostReason(cbCorp, cardName, corpBoost));
          }
        }
      }

      // 34. 3+ card combo chain — enhanced bonus for closing multi-card combos
      if (typeof TM_COMBOS !== 'undefined') {
        for (const combo of TM_COMBOS) {
          if (!combo.cards.includes(cardName)) continue;
          const otherCards = combo.cards.filter(function(c) { return c !== cardName; });
          const matchCount = otherCards.filter(function(c) { return allMyCardsSet.has(c); }).length;
          if (matchCount >= 2) {
            const chainRating = combo.r === 'godmode' ? SC.chainGodmode : combo.r === 'great' ? SC.chainGreat : SC.chainDecent;
            bonus += chainRating;
            reasons.push('Цепь ' + (matchCount + 1) + '/' + combo.cards.length + ' +' + chainRating);
            break;
          }
        }
      }

      // 35. Trade value by colony track positions
      if (ctx.tradesLeft > 0 && data.e && isCardPlayableNowByStaticRequirements(cardName, ctx)) {

        if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('торг') || eLower.includes('колон')) {
          if (pv && pv.game && pv.game.colonies) {
            let bestTrackVal = 0;
            for (const col of pv.game.colonies) {
              if (col.isActive !== false && col.trackPosition != null) {
                bestTrackVal = Math.max(bestTrackVal, col.trackPosition);
              }
            }
            if (bestTrackVal >= SC.tradeTrackThreshold) {
              const tradeBonus = Math.min(SC.tradeTrackCap, Math.floor(bestTrackVal / 2));
              bonus += tradeBonus;
              reasons.push('Трек ' + bestTrackVal + ' +' + tradeBonus);
            }
          }
        }
      }

      // 36. Milestone/Award-specific card bonuses — extracted to _scoreMapMA()
      var maResult = _scoreMapMA(data, cardTags, cardCost, ctx, SC);
      bonus = applyResult(maResult, bonus, reasons, reasonRows);

      // 37. Terraform rate awareness — fast game = less time for engine
      bonus = applyResult(scoreTerraformRate(ctx, eLower, data), bonus, reasons, reasonRows);
    }

    // 38-46. Post-context checks
    var postCtx = scorePostContextChecks(cardName, cardEl, eLower, data, cardTags, ctx, pv, myHand);
    bonus = applyResult(postCtx, bonus, reasons, reasonRows);

    // 47. Board-state modifiers
    var bsm = scoreBoardStateModifiers(cardName, data, eLower, ctx);
    bonus = applyResult(bsm, bonus, reasons, reasonRows);

    // 48. SYNERGY_RULES — extracted to _scoreSynergyRules()
    var srResult = _scoreSynergyRules(cardName, allMyCards, ctx, SC);
    bonus = applyResult(srResult, bonus, reasons, reasonRows);

    // Prelude-specific scoring — extracted to _scorePrelude()
    var preResult = _scorePrelude(cardName, data, cardEl, myCorp, ctx, SC);
    bonus = applyResult(preResult, bonus, reasons, reasonRows);

    // Smart vs SP: compare card with RELEVANT standard project only
    if (ctx && ctx.allSP && typeof TM_CARD_EFFECTS !== 'undefined') {
      var cfx = TM_CARD_EFFECTS[cardName];
      var relevantSP = null;
      if (cfx) {
        // Production cards → compare with Power Plant
        if ((cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp) && !cfx.tr) {
          relevantSP = ctx.allSP.find(function(sp) { return sp.type === 'power'; });
        }
        // TR-raising cards (no production) → compare with cheapest TR SP
        else if (cfx.tr && !(cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp)) {
          var trSPs = ctx.allSP.filter(function(sp) { return sp.type === 'asteroid' || sp.type === 'aquifer' || sp.type === 'venus' || sp.type === 'buffer'; });
          if (trSPs.length > 0) relevantSP = trSPs.reduce(function(best, sp) { return sp.adj > best.adj ? sp : best; });
        }
      }
      if (relevantSP) {
        var spDiff = (baseScore + bonus) - relevantSP.adj;
        if (spDiff < -5) {
          reasons.push('vs ' + relevantSP.name + ' ' + spDiff);
        }
      }
    }

    // Negative VP warning (MCP knowledge: negative VP cards lose games when trailing)
    if (typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx = TM_CARD_EFFECTS[cardName];
      if (fx && fx.vp && fx.vp < 0) {
        reasons.push('⚠ ' + fx.vp + ' VP');
      }
    }

    // Production break-even timer
    var be = scoreBreakEvenTiming(cardName, ctx, cardTags);
    if (be.penalty > 0) { bonus -= be.penalty; }
    if (be.reason) reasons.push(be.reason);

    // Deny-draft advisor — also boost score for high-deny cards
    var denyReason = checkDenyDraft(data, baseScore + bonus, ctx, cardTags, cardName, eLower);
    if (denyReason) {
      reasons.push(denyReason);
      // If the card is mediocre for us but great for opponent, boost score
      var currentTotal = baseScore + bonus;
      if (currentTotal < 75 && data.s >= 70) {
        var denyBoost = Math.min(8, Math.round((data.s - currentTotal) * 0.3));
        if (denyBoost > 0) { bonus += denyBoost; reasons.push('Deny ↑' + denyBoost); }
      }
    }

    // Hate-draft detection: card is bad for us but great for opponent
    var hateDraft = null;
    if (!denyReason) {
      hateDraft = checkHateDraft(cardName, baseScore + bonus, ctx, cardTags);
      if (hateDraft) {
        reasons.push('\uD83D\uDEAB Hate: ' + hateDraft.label);
      }
    }

    // Fallback: if no contextual reasons, don't add fake positive reasons
    // Economy/when text is shown in tooltip body, not in +/- reasons list

    var cleanedReqPayload = cleanupRequirementReasons(reasons, reasonRows);
    reasons = cleanedReqPayload.reasons;
    reasonRows = cleanedReqPayload.reasonRows;

    // Hard cap: unplayable cards (permanently missed requirements) → max D-tier
    var isUnplayable = reasons.some(function(r) {
      return r.indexOf('Невозможно сыграть') !== -1 || r.indexOf('Окно закрыто') !== -1;
    });
    // Cap total score at 100 — S-tier ceiling
    var uncappedTotal = baseScore + bonus;
    var finalScore = Math.min(100, uncappedTotal);
    if (isUnplayable && !(ctx && (ctx._openingHand || (ctx.gensLeft != null && ctx.gensLeft >= 6))) && finalScore > 54) finalScore = 54; // D-tier max
    if (debugMode) tmLog('score', cardName + ': ' + baseScore + ' \u2192 ' + finalScore + ' (' + reasons.join(', ') + ')');
    return { total: finalScore, uncappedTotal: uncappedTotal, reasons, reasonRows: reasonRows, hateDraft: hateDraft };
  }

  function scoreToTier(score) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreToTier) {
      return TM_CONTENT_PLAY_PRIORITY.scoreToTier(score);
    }
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  var tierColor = TM_UTILS.tierColor;

  // ── Synergy indicators: compact icons below the score badge ──
  // Returns array of max 2 short strings like "🔨5st", "⭐PL", "⭐M"
  var _CORP_SHORT_LABELS = {
    'Point Luna': 'PL', 'Manutech': 'M', 'EcoLine': 'Eco', 'Teractor': 'Ter',
    'PhoboLog': 'Pho', 'Helion': 'Hel', 'Thorgate': 'Tho', 'Arklight': 'Ark',
    'Splice': 'Spl', 'Saturn Systems': 'SS', 'Interplanetary Cinematics': 'IC',
    'Mining Guild': 'MG', 'Cheung Shing MARS': 'CS', 'Morning Star Inc.': 'MS',
    'Poseidon': 'Pos', 'Celestic': 'Cel', 'Tharsis Republic': 'TR',
    'Aphrodite': 'Aph', 'Stormcraft Incorporated': 'SC', 'Vitor': 'Vit',
    'Polaris': 'Pol', 'Robinson Industries': 'Rob', 'Viron': 'Vir',
    'Recyclon': 'Rec', 'Inventrix': 'Inv', 'Factorum': 'Fac',
  };
  function getSynergyIndicators(cardName, cardEl, ctx, myCorps) {
    var indicators = [];
    if (!ctx || !cardEl) return indicators;
    var cardTags = getCachedCardTags(cardEl);
    var data = TM_RATINGS[cardName];
    var eLower = data && data.e ? data.e.toLowerCase() : '';

    // 1. Steel payable — Building tag + steel stockpile >= 3
    if (cardTags.has('building') && ctx.steel >= 3) {
      indicators.push('\uD83D\uDD28' + ctx.steel + 'st');
    }
    // 2. Titanium payable — Space tag + titanium stockpile >= 2
    if (cardTags.has('space') && ctx.titanium >= 2) {
      indicators.push('\uD83D\uDE80' + ctx.titanium + 'ti');
    }

    // 3. Corp ability synergy — matching tag or keyword
    for (var ci = 0; ci < myCorps.length && indicators.length < 2; ci++) {
      var corp = myCorps[ci];
      var cas = CORP_ABILITY_SYNERGY[corp];
      if (!cas || cas.b <= 0) continue;
      var matched = false;
      if (cas.tags.length > 0) {
        for (var ti = 0; ti < cas.tags.length; ti++) {
          if (cardTags.has(cas.tags[ti])) { matched = true; break; }
        }
      }
      if (!matched && cas.kw.length > 0 && eLower) {
        for (var ki = 0; ki < cas.kw.length; ki++) {
          if (eLower.includes(cas.kw[ki])) { matched = true; break; }
        }
      }
      if (matched) {
        var label = _CORP_SHORT_LABELS[corp] || corp.split(' ')[0].substring(0, 3);
        indicators.push('\u2B50' + label);
      }
    }

    return indicators.slice(0, 2);
  }

  // Shared badge rendering: origTier/origScore → newTier/adjTotal with colored delta
  function updateBadgeScore(badge, origTier, origScore, total, extraClass, displayTotal, forceContextDisplay) {
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.updateBadgeScore) {
      return TM_CONTENT_OVERLAYS.updateBadgeScore({
        badge: badge,
        origTier: origTier,
        origScore: origScore,
        total: total,
        extraClass: extraClass,
        displayTotal: displayTotal,
        forceContextDisplay: forceContextDisplay,
        scoreToTier: scoreToTier
      });
    }
    var adjTotal = Math.round(total * 10) / 10;
    var shownTotal = Math.round((displayTotal != null ? displayTotal : total) * 10) / 10;
    var delta = Math.round((adjTotal - origScore) * 10) / 10;
    var newTier = scoreToTier(adjTotal);
    if (delta === 0) {
      if (forceContextDisplay) {
        badge.innerHTML = origTier + origScore +
          '<span class="tm-badge-arrow">\u2192</span>' +
          newTier + shownTotal;
      } else {
        badge.innerHTML = newTier + ' ' + shownTotal;
      }
    } else {
      var cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
      var sign = delta > 0 ? '+' : '';
      badge.innerHTML = origTier + origScore +
        '<span class="tm-badge-arrow">\u2192</span>' +
        newTier + shownTotal +
        ' <span class="' + cls + '">' + sign + delta + '</span>';
    }
    badge.className = 'tm-tier-badge tm-tier-' + newTier + (extraClass || '');
    return newTier;
  }

  // Detect corps offered during initial draft (3 fallback levels)
  function detectOfferedCorps() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.detectOfferedCorps) {
      return TM_CONTENT_PLAY_PRIORITY.detectOfferedCorps({
        documentObj: document,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        tagTriggers: TAG_TRIGGERS,
        corpDiscounts: CORP_DISCOUNTS
      });
    }
    var offeredCorps = [];
    // Level 1: DOM heuristic — corporation-specific styling
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (!cn) return;
      if (el.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
          (el.closest('.select-corporation') || el.closest('[class*="corporation"]'))) {
        offeredCorps.push(cn);
      }
    });
    if (offeredCorps.length > 0) return offeredCorps;

    // Level 2: Known corp patterns in ratings
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (!cn) return;
      var d = TM_RATINGS[cn];
      if (d && d.e && (d.e.includes('Корп') || d.e.includes('Corp') || d.e.includes('Стартовый') || d.e.includes('Start'))) {
        offeredCorps.push(cn);
      }
    });
    if (offeredCorps.length > 0) return offeredCorps;

    // Level 3: Check TAG_TRIGGERS/CORP_DISCOUNTS
    document.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && (TAG_TRIGGERS[cn] || CORP_DISCOUNTS[cn])) {
        offeredCorps.push(cn);
      }
    });
    return offeredCorps;
  }

  function isKeepLikeActionCardChoice(selectCards) {
    if (!selectCards || selectCards.length === 0) return false;
    var titleTexts = [];
    selectCards.forEach(function(section) {
      var titleEl = section.querySelector('.wf-component-title');
      if (titleEl && titleEl.textContent) titleTexts.push(titleEl.textContent.trim().toLowerCase());
    });
    var text = titleTexts.join(' | ');
    if (!text) return false;
    return /\bkeep\b|\bbuy\b|return to your hand|choose one to play|discard the rest|сохран|остав|куп/i.test(text);
  }

  function getInitialDraftRatingScore(name, fallback) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getInitialDraftRatingScore) {
      return TM_CONTENT_PLAY_PRIORITY.getInitialDraftRatingScore({
        name: name,
        fallback: fallback,
        resolveCorpName: resolveCorpName,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        ratingsRaw: _TM_RATINGS_RAW,
        baseCardName: _baseCardName,
        normalizeOpeningHandBias: normalizeOpeningHandBias,
        getCardTypeByName: getCardTypeByName
      });
    }
    var resolved = resolveCorpName(name) || name;
    var raw = TM_RATINGS[resolved] || TM_RATINGS[_baseCardName(resolved)] || _TM_RATINGS_RAW[resolved] || _TM_RATINGS_RAW[_baseCardName(resolved)];
    if (raw && typeof raw.s === 'number') {
      var openingBias = getCardTypeByName(resolved) === 'prelude' ? 0 : normalizeOpeningHandBias(raw.o);
      return raw.s + openingBias;
    }
    return fallback == null ? 55 : fallback;
  }

  function normalizeOpeningHandBias(rawBias) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.normalizeOpeningHandBias) {
      return TM_CONTENT_PLAY_PRIORITY.normalizeOpeningHandBias(rawBias);
    }
    if (typeof rawBias !== 'number' || !isFinite(rawBias) || rawBias === 0) return 0;
    var scaled = Math.round(rawBias * 0.6);
    if (scaled === 0) scaled = rawBias > 0 ? 1 : -1;
    return Math.max(-5, Math.min(5, scaled));
  }

  function isOpeningHandContext(ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.isOpeningHandContext) {
      return TM_CONTENT_PLAY_PRIORITY.isOpeningHandContext({
        ctx: ctx,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null
      });
    }
    if (ctx && ctx._openingHand != null) return !!ctx._openingHand;
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var phase = pv && pv.game ? pv.game.phase : '';
    return phase === 'initial_drafting' || phase === 'corporationsDrafting';
  }

  function getOpeningHandBias(cardNameOrData, dataOrCtx, maybeCtx) {
    var cardName = null;
    var data = cardNameOrData;
    var ctx = dataOrCtx;
    if (typeof cardNameOrData === 'string') {
      cardName = cardNameOrData;
      data = dataOrCtx;
      ctx = maybeCtx;
    }
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getOpeningHandBias) {
      return TM_CONTENT_PLAY_PRIORITY.getOpeningHandBias({
        cardName: cardName,
        data: data,
        ctx: ctx,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        getCardTypeByName: getCardTypeByName
      });
    }
    if (cardName && getCardTypeByName(cardName) === 'prelude') return 0;
    if (!data || typeof data.o !== 'number') return 0;
    return isOpeningHandContext(ctx) ? normalizeOpeningHandBias(data.o) : 0;
  }

  function getInitialDraftInfluence(score, minWeight, maxWeight) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getInitialDraftInfluence) {
      return TM_CONTENT_PLAY_PRIORITY.getInitialDraftInfluence({
        score: score,
        minWeight: minWeight,
        maxWeight: maxWeight
      });
    }
    var safeScore = typeof score === 'number' ? score : 55;
    var clamped = Math.max(45, Math.min(85, safeScore));
    var ratio = (clamped - 45) / 40;
    return minWeight + (maxWeight - minWeight) * ratio;
  }

  function withForcedCorpContext(baseCtx, corpName) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.withForcedCorpContext) {
      return TM_CONTENT_PLAY_PRIORITY.withForcedCorpContext({
        baseCtx: baseCtx,
        corpName: corpName
      });
    }
    if (!baseCtx) return baseCtx;
    var cloned = Object.assign({}, baseCtx);
    cloned._myCorps = corpName ? [corpName] : [];
    return cloned;
  }

  function getVisiblePreludeNames() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getVisiblePreludeNames) {
      return TM_CONTENT_PLAY_PRIORITY.getVisiblePreludeNames({
        getPlayerVueData: getPlayerVueData,
        cardN: cardN,
        documentObj: document
      });
    }
    var preludes = [];
    var seen = new Set();
    function remember(name) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      preludes.push(name);
    }
    function rememberList(cards) {
      if (!Array.isArray(cards)) return;
      for (var i = 0; i < cards.length; i++) remember(cardN(cards[i]));
    }

    var pv = getPlayerVueData();
    if (pv) {
      rememberList(pv.dealtPreludeCards);
      rememberList(pv.preludeCardsInHand);
    }
    if (preludes.length > 0) return preludes;

    document.querySelectorAll('.wf-component--select-prelude .card-container[data-tm-card], .cardbox .card-container[data-tm-card]').forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      if (el.closest('.wf-component--select-prelude') || el.querySelector('.prelude-label')) remember(name);
    });
    return preludes;
  }

  function getVisibleCeoNames() {
    var ceos = [];
    var seen = new Set();
    function remember(name) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      ceos.push(name);
    }
    function rememberList(cards) {
      if (!Array.isArray(cards)) return;
      for (var i = 0; i < cards.length; i++) remember(cardN(cards[i]));
    }

    var pv = getPlayerVueData();
    if (pv) {
      rememberList(pv.dealtCeoCards);
      rememberList(pv.ceoCardsInHand);
    }
    if (ceos.length > 0) return ceos;

    document.querySelectorAll('.wf-component--select-ceo .card-container[data-tm-card], .cardbox .card-container[data-tm-card]').forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      if (el.closest('.wf-component--select-ceo') || el.querySelector('.ceo-label')) remember(name);
    });
    return ceos;
  }

  function getVisibleColonyNames(activeOnly) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getVisibleColonyNames) {
      return TM_CONTENT_PLAY_PRIORITY.getVisibleColonyNames({
        activeOnly: activeOnly,
        getPlayerVueData: getPlayerVueData
      });
    }
    var colonies = [];
    var seen = new Set();
    function remember(name) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      colonies.push(name);
    }

    var pv = getPlayerVueData();
    if (pv && pv.game && Array.isArray(pv.game.colonies)) {
      for (var i = 0; i < pv.game.colonies.length; i++) {
        var col = pv.game.colonies[i];
        if (!col || !col.name) continue;
        if (activeOnly && col.isActive === false) continue;
        remember(col.name);
      }
    }
    return colonies;
  }

  function getVisibleActiveColonyNames() {
    return getVisibleColonyNames(true);
  }

  // Render inline overlay on a draft card
  function renderCardOverlay(item, scored) {
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.renderCardOverlay) {
      return TM_CONTENT_OVERLAYS.renderCardOverlay({
        item: item,
        scored: scored,
        getCardCost: getCardCost,
        getCachedPlayerContext: getCachedPlayerContext,
        getCardTags: getCardTags,
        getEffectiveCost: getEffectiveCost,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        tmBrain: typeof TM_BRAIN !== 'undefined' ? TM_BRAIN : null,
        cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        ruName: ruName,
        yName: yName
      });
    }
    var adjTotal28 = Math.round(item.total * 10) / 10;
    var rec28, recClass28;
    if (adjTotal28 >= 70) { rec28 = '\u0411\u0415\u0420\u0418'; recClass28 = 'tm-iov-take'; }
    else if (adjTotal28 >= 55) { rec28 = 'OK'; recClass28 = 'tm-iov-ok'; }
    else { rec28 = '\u041F\u0410\u0421\u0421'; recClass28 = 'tm-iov-skip'; }

    var overlay28 = document.createElement('div');
    overlay28.className = 'tm-inline-overlay';
    var ovHTML = '<div class="tm-iov-rec ' + recClass28 + '">' + rec28 + '</div>';

    var rank28 = scored.indexOf(item) + 1;
    if (rank28 === 0) {
      rank28 = scored.findIndex(function(entry) {
        if (!entry || !item) return false;
        if (entry.el && item.el && entry.el === item.el) return true;
        return !!entry.name && !!item.name && entry.name === item.name;
      }) + 1;
    }
    if (rank28 === 1) {
      ovHTML += '<div class="tm-iov-rank">#1</div>';
      ovHTML += '<div class="tm-iov-botpick">\uD83E\uDD16 Bot pick</div>';
    }
    else if (rank28 === 2) ovHTML += '<div class="tm-iov-rank tm-iov-rank2">#2</div>';

    var cost28 = getCardCost(item.el);
    if (cost28 != null) {
      var ctx28 = getCachedPlayerContext();
      var disc28 = ctx28 && ctx28.discounts ? ctx28.discounts : {};
      var tags28 = getCardTags(item.el);
      var effCost28 = getEffectiveCost(cost28, tags28, disc28);
      var costStr28 = effCost28 < cost28 ? effCost28 + '/<s>' + cost28 + '</s>' : '' + cost28;
      ovHTML += '<div class="tm-iov-cost">' + costStr28 + ' MC</div>';
    }

    // EV from TM_BRAIN.scoreCard — always show
    if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.scoreCard && cost28 != null) {
      var _pvEv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (_pvEv) {
        var _evState = { game: _pvEv.game, thisPlayer: _pvEv.thisPlayer, players: (_pvEv.game && _pvEv.game.players) || [] };
        var _evVal = TM_BRAIN.scoreCard({ name: item.name, calculatedCost: cost28 }, _evState);
        var _evColor = _evVal > 5 ? '#2ecc71' : _evVal > 0 ? '#f1c40f' : '#e74c3c';
        ovHTML += '<div style="font-size:10px;color:' + _evColor + '">EV ' + (_evVal > 0 ? '+' : '') + Math.round(_evVal) + ' MC</div>';
      }
    }

    // VP/MC efficiency for last gen
    var ctx28vp = getCachedPlayerContext();
    if (ctx28vp && ctx28vp.gensLeft <= 1 && cost28 != null && typeof TM_CARD_EFFECTS !== 'undefined') {
      var fx28vp = TM_CARD_EFFECTS[item.name];
      if (fx28vp) {
        var vpTotal28 = (fx28vp.vp || 0) + (fx28vp.tr || 0) + (fx28vp.tmp || 0) + (fx28vp.o2 || 0) + (fx28vp.oc || 0) + (fx28vp.vn || 0);
        if (fx28vp.grn) vpTotal28 += fx28vp.grn * (ctx28vp.globalParams && ctx28vp.globalParams.oxy < 14 ? 2 : 1);
        if (vpTotal28 > 0) {
          var effCost28vp = cost28 + 3; // include draft cost
          var ratio28 = Math.round(effCost28vp / vpTotal28 * 10) / 10;
          ovHTML += '<div class="tm-iov-vp">' + vpTotal28 + ' VP за ' + effCost28vp + ' MC (' + ratio28 + '/VP)</div>';
        }
      }
    }

    var reasons28 = item.reasons.slice(0, 3);
    if (reasons28.length > 0) {
      ovHTML += '<div class="tm-iov-reasons">';
      for (var ri28 = 0; ri28 < reasons28.length; ri28++) {
        var rText = reasons28[ri28];
        if (rText.length > 30) rText = rText.substring(0, 30) + '\u2026';
        ovHTML += '<div class="tm-iov-reason">' + rText + '</div>';
      }
      ovHTML += '</div>';
    }

    var rData28 = TM_RATINGS[item.name];
    if (rData28 && rData28.y && rData28.y.length > 0) {
      var synName28 = yName(rData28.y[0]);
      var synShort28 = synName28.split(' ')[0];
      var alreadyInReasons28 = item.reasons.some(function(r) { return r.indexOf(synShort28) !== -1; });
      if (!alreadyInReasons28) {
        if (synName28.length > 20) synName28 = synName28.substring(0, 20) + '\u2026';
        ovHTML += '<div class="tm-iov-syn">\uD83D\uDD17 ' + synName28 + '</div>';
      }
    }

    // Hate-draft indicator
    if (item.hateDraft) {
      var hateLabel = '\uD83D\uDEAB' + item.hateDraft.label;
      if (hateLabel.length > 22) hateLabel = hateLabel.substring(0, 22) + '\u2026';
      ovHTML += '<div class="tm-iov-hate" style="font-size:9px;color:#e67e22;font-weight:bold;margin-top:2px">' + hateLabel + '</div>';
    }

    overlay28.innerHTML = ovHTML;
    return overlay28;
  }

  // Score card against multiple offered corps (initial draft), pick best
  function scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreCardAgainstCorps) {
      return TM_CONTENT_PLAY_PRIORITY.scoreCardAgainstCorps({
        name: name,
        el: el,
        myTableau: myTableau,
        myHand: myHand,
        offeredCorps: offeredCorps,
        myCorp: myCorp,
        ctx: ctx,
        scoreDraftCard: scoreDraftCard,
        withForcedCorpContext: withForcedCorpContext,
        getInitialDraftRatingScore: getInitialDraftRatingScore,
        getInitialDraftInfluence: getInitialDraftInfluence
      });
    }
    if (!myCorp && offeredCorps.length > 0 && !offeredCorps.includes(name)) {
      var corpResults = [];
      for (var ci = 0; ci < offeredCorps.length; ci++) {
        var offeredCorp = offeredCorps[ci];
        corpResults.push({
          corp: offeredCorp,
          result: scoreDraftCard(name, myTableau, myHand, offeredCorp, el, withForcedCorpContext(ctx, offeredCorp)),
          corpScore: getInitialDraftRatingScore(offeredCorp, 55),
        });
      }
      var noCorp = scoreDraftCard(name, myTableau, myHand, '', el, withForcedCorpContext(ctx, ''));
      if (corpResults.length === 0) return noCorp;

      corpResults.sort(function(a, b) {
        var aRank = a.result.uncappedTotal != null ? a.result.uncappedTotal : a.result.total;
        var bRank = b.result.uncappedTotal != null ? b.result.uncappedTotal : b.result.total;
        return bRank - aRank;
      });

      var baseRank = noCorp.uncappedTotal != null ? noCorp.uncappedTotal : noCorp.total;
      var best = corpResults[0];
      var second = corpResults.length > 1 ? corpResults[1] : null;
      var bestRank = best.result.uncappedTotal != null ? best.result.uncappedTotal : best.result.total;
      var bestDelta = Math.max(0, bestRank - baseRank);
      if (bestDelta <= 0) return noCorp;

      var bestWeight = getInitialDraftInfluence(best.corpScore, 0.55, 1.0);
      var weightedRank = baseRank + bestDelta * bestWeight;
      var weightedTotal = noCorp.total + Math.max(0, best.result.total - noCorp.total) * bestWeight;
      var secondLabel = '';
      if (second) {
        var secondRank = second.result.uncappedTotal != null ? second.result.uncappedTotal : second.result.total;
        var secondDelta = Math.max(0, secondRank - baseRank);
        if (secondDelta > 0) {
          var secondWeight = getInitialDraftInfluence(second.corpScore, 0.15, 0.45);
          weightedRank += secondDelta * secondWeight;
          weightedTotal += Math.max(0, second.result.total - noCorp.total) * secondWeight;
          secondLabel = second.corp;
        }
      }

      var result = {
        total: Math.round(weightedTotal),
        uncappedTotal: Math.round(weightedRank),
        reasons: best.result.reasons.slice(),
      };
      if (best.corp && bestRank >= baseRank + 3) {
        var corpShort = best.corp.split(' ')[0];
        if (!result.reasons.some(function(r) { return r.indexOf(corpShort) !== -1; })) {
          result.reasons.push('лучше с ' + best.corp);
        }
      }
      if (secondLabel) {
        var secondShort = secondLabel.split(' ')[0];
        if (!result.reasons.some(function(r) { return r.indexOf(secondShort) !== -1; })) {
          result.reasons.push('ещё ок с ' + secondLabel);
        }
      }
      return result;
    }
    return scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
  }

  // Research phase buy/skip adjustment — EV-based
  function adjustForResearch(result, el, myHand, ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.adjustForResearch) {
      TM_CONTENT_PLAY_PRIORITY.adjustForResearch({
        result: result,
        el: el,
        myHand: myHand,
        ctx: ctx,
        getCardCost: getCardCost,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        tmBrain: typeof TM_BRAIN !== 'undefined' ? TM_BRAIN : null,
        cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null
      });
      return;
    }
    var adj = 0;
    var handSize = myHand ? myHand.length : 0;
    var cardName = el.getAttribute('data-tm-card') || '';
    var cardCost = getCardCost(el);
    var myMC = ctx ? (ctx.mc || 0) : 0;
    var gensLeft = ctx ? (ctx.gensLeft || 3) : 3;

    // EV comparison: is card worth 3 MC draft cost?
    // Use TM_BRAIN.scoreCard if available for precise EV
    var cardEV = 0;
    if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.scoreCard && cardName) {
      var pv_r = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (pv_r) {
        var brainState = { game: pv_r.game, thisPlayer: pv_r.thisPlayer, players: (pv_r.game && pv_r.game.players) || [] };
        cardEV = TM_BRAIN.scoreCard({ name: cardName, calculatedCost: cardCost || 0 }, brainState);
      }
    }

    // Strong EV or high score → buy
    if (cardEV > 5 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 80) adj += 5;
    else if (cardEV > 0 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 70) adj += 3;
    else if (cardCost !== null && cardCost <= 10 && result.reasons.length >= 2) adj += 2;

    // Negative EV or weak score → skip
    if (cardEV < -10 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) < 45) adj -= 6;
    else if (cardEV < -5 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) < 55) adj -= 3;

    // Expensive + unaffordable → skip
    if (cardCost !== null && cardCost > 20 && myMC < cardCost * 0.5) adj -= 5;

    // Hand bloat: more than 2× gensLeft cards → diminishing returns
    if (handSize > gensLeft * 2) adj -= Math.min(4, Math.round((handSize - gensLeft * 2) * 1.5));

    // Last gen: only VP/TR cards worth 3 MC
    if (gensLeft <= 1) {
      var fx = typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS[cardName] : null;
      var hasVP = fx && (fx.vp || fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn || fx.grn);
      if (!hasVP) adj -= 8;
    }

    var reqHardBlockDraft = result.reasons.some(function(r) { return isHardRequirementReasonText(r); });
    var reqSoftNearDraft = result.reasons.some(function(r) { return isSoftNearRequirementReasonText(r); });
    if (reqHardBlockDraft) {
      adj -= reqSoftNearDraft ? (gensLeft <= 2 ? 2 : 1) : (gensLeft <= 2 ? 6 : 3);
    }

    result.total += adj;
    if (result.uncappedTotal != null) result.uncappedTotal += adj;
    // Show clear recommendation with reason
    var preferReqLaterLabel = reqHardBlockDraft && reqSoftNearDraft && (result.total >= 55 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 55);
    if (adj <= -4) {
      if (preferReqLaterLabel) result.reasons.push('Позже (req)');
      else result.reasons.push('Skip (' + (cardEV < 0 ? 'EV ' + Math.round(cardEV) : 'слабая') + ')');
    }
    else if (adj >= 4 && !reqHardBlockDraft) result.reasons.push('Buy! (' + (cardEV > 0 ? 'EV +' + Math.round(cardEV) : 'сильная') + ')');
    else if (adj <= -2) result.reasons.push(preferReqLaterLabel ? 'Позже (req)' : 'Skip');
    else if (adj >= 2 && !reqHardBlockDraft) result.reasons.push('Buy');
    else if (adj >= 2 && reqHardBlockDraft) result.reasons.push('Позже (req)');
    else if (preferReqLaterLabel) result.reasons.push('Позже (req)');
  }

  function resetDraftOverlays() {
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.resetDraftOverlays) {
      TM_CONTENT_OVERLAYS.resetDraftOverlays({
        revealPendingContextBadge: revealPendingContextBadge,
        clearReasonPayload: clearReasonPayload
      });
      return;
    }
    var intelBanner = document.querySelector('.tm-draft-intel');
    if (intelBanner) intelBanner.remove();
    document.querySelectorAll('.tm-rec-best').forEach(function(el) { el.classList.remove('tm-rec-best'); });
    document.querySelectorAll('[data-tm-reasons]:not(.card-standard-project):not(.tm-sp-badge), [data-tm-reason-rows]:not(.card-standard-project):not(.tm-sp-badge)').forEach(function(el) { clearReasonPayload(el); });
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach(function(badge) {
      badge.textContent = badge.getAttribute('data-tm-original');
      badge.removeAttribute('data-tm-original');
      revealPendingContextBadge(badge);
      var origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) {
        badge.className = 'tm-tier-badge tm-tier-' + origTier;
        badge.removeAttribute('data-tm-orig-tier');
      }
    });
  }

  function scoreHandCardsInPlace() {
    if (TM_CONTENT_DRAFT_RECOMMENDATIONS && TM_CONTENT_DRAFT_RECOMMENDATIONS.scoreHandCardsInPlace) {
      TM_CONTENT_DRAFT_RECOMMENDATIONS.scoreHandCardsInPlace({
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getMyHandNames: getMyHandNames,
        getCachedPlayerContext: getCachedPlayerContext,
        enrichCtxForScoring: enrichCtxForScoring,
        documentObj: document,
        selHand: SEL_HAND,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        scoreDraftCard: scoreDraftCard,
        updateBadgeScore: updateBadgeScore,
        setReasonPayload: setReasonPayload
      });
      return;
    }
    var myCorp = detectMyCorp();
    if (!myCorp) return;
    var myTableau = getMyTableauNames();
    var myHand = getMyHandNames();
    var ctx = getCachedPlayerContext();
    enrichCtxForScoring(ctx, myTableau, myHand);
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name || !TM_RATINGS[name]) return;
      var origData = TM_RATINGS[name];
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      if (!badge.hasAttribute('data-tm-original')) {
        badge.setAttribute('data-tm-original', badge.textContent);
        badge.setAttribute('data-tm-orig-tier', origData.t);
      }
      var newTier = updateBadgeScore(badge, origData.t, origData.s, result.total, '', result.uncappedTotal);
      // Dim low-value hand cards (sell candidates)
      if (newTier === 'D' || newTier === 'F') {
        el.classList.add('tm-dim');
      } else {
        el.classList.remove('tm-dim');
      }
      setReasonPayload(el, result);
    });
  }

  function updateDraftRecommendations() {
    if (TM_CONTENT_DRAFT_RECOMMENDATIONS && TM_CONTENT_DRAFT_RECOMMENDATIONS.updateDraftRecommendations) {
      TM_CONTENT_DRAFT_RECOMMENDATIONS.updateDraftRecommendations({
        enabled: enabled,
        documentObj: document,
        resetDraftOverlays: resetDraftOverlays,
        prepareDraftRecommendationContext: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.prepareDraftRecommendationContext
          ? TM_CONTENT_OVERLAYS.prepareDraftRecommendationContext
          : null,
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getMyHandNames: getMyHandNames,
        getMyHandWithDrafted: getMyHandWithDrafted,
        getCachedPlayerContext: getCachedPlayerContext,
        enrichCtxForScoring: enrichCtxForScoring,
        detectGeneration: detectGeneration,
        detectOfferedCorps: detectOfferedCorps,
        detectResearchPhase: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.detectResearchPhase
          ? TM_CONTENT_OVERLAYS.detectResearchPhase
          : null,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        shouldSkipDraftRecommendationSelection: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.shouldSkipDraftRecommendationSelection
          ? TM_CONTENT_OVERLAYS.shouldSkipDraftRecommendationSelection
          : null,
        isKeepLikeActionCardChoice: isKeepLikeActionCardChoice,
        revealPendingWorkflowBadges: revealPendingWorkflowBadges,
        collectDraftRecommendationScores: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.collectDraftRecommendationScores
          ? TM_CONTENT_OVERLAYS.collectDraftRecommendationScores
          : null,
        scoreCardAgainstCorps: scoreCardAgainstCorps,
        adjustForResearch: adjustForResearch,
        buildDraftScoreSnapshot: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.buildDraftScoreSnapshot
          ? TM_CONTENT_OVERLAYS.buildDraftScoreSnapshot
          : null,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        scoreToTier: scoreToTier,
        setLastDraftScoresState: setLastDraftScoresState,
        prepareDraftRecommendationDisplayState: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.prepareDraftRecommendationDisplayState
          ? TM_CONTENT_OVERLAYS.prepareDraftRecommendationDisplayState
          : null,
        applyDraftRecommendationCardUi: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.applyDraftRecommendationCardUi
          ? TM_CONTENT_OVERLAYS.applyDraftRecommendationCardUi
          : null,
        revealPendingContextBadge: revealPendingContextBadge,
        updateBadgeScore: updateBadgeScore,
        renderCardOverlay: renderCardOverlay,
        notifyDraftRecommendationToasts: TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.notifyDraftRecommendationToasts
          ? TM_CONTENT_OVERLAYS.notifyDraftRecommendationToasts
          : null,
        canShowToast: canShowToast,
        showToast: showToast,
        syncDraftIntelBanner: TM_CONTENT_DRAFT_INTEL && TM_CONTENT_DRAFT_INTEL.syncDraftIntelBanner
          ? TM_CONTENT_DRAFT_INTEL.syncDraftIntelBanner
          : null,
        getDraftIntel: getDraftIntel,
        playerColor: typeof TM_UTILS !== 'undefined' ? TM_UTILS.playerColor : null,
        ruName: ruName,
        selHand: SEL_HAND,
        scoreDraftCard: scoreDraftCard,
        setReasonPayload: setReasonPayload,
        clearReasonPayload: clearReasonPayload,
        serializeReasonRowsPayload: serializeReasonRowsPayload
      });
      return;
    }
    if (!enabled) return;

    resetDraftOverlays();

    const selectCards = document.querySelectorAll('.wf-component--select-card, .wf-component--select-prelude');
    if (selectCards.length === 0) {
      scoreHandCardsInPlace();
      return;
    }

    var prep = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.prepareDraftRecommendationContext
      ? TM_CONTENT_OVERLAYS.prepareDraftRecommendationContext({
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getMyHandWithDrafted: getMyHandWithDrafted,
        getCachedPlayerContext: getCachedPlayerContext,
        enrichCtxForScoring: enrichCtxForScoring,
        detectGeneration: detectGeneration,
        detectOfferedCorps: detectOfferedCorps
      })
      : null;

    let myCorp = prep ? prep.myCorp : detectMyCorp();
    const myTableau = prep ? prep.myTableau : getMyTableauNames();
    const myHand = prep ? prep.myHand : getMyHandWithDrafted(); // includes already-drafted cards this gen
    const ctx = prep ? prep.ctx : getCachedPlayerContext();
    if ((!prep || !prep.ctx) && ctx) enrichCtxForScoring(ctx, myTableau, myHand);

    // Initial draft detection: detect offered corps when no corp chosen yet
    var gen = prep ? prep.gen : detectGeneration();
    var offeredCorps = prep ? prep.offeredCorps : ((!myCorp && gen <= 1) ? detectOfferedCorps() : []);
    if (!prep && ctx) ctx._openingHand = gen <= 1 && offeredCorps.length > 0;

    // Detect research phase (gen >= 2, 4 cards with buy/skip checkboxes, not prelude)
    var isResearchPhase = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.detectResearchPhase
      ? TM_CONTENT_OVERLAYS.detectResearchPhase({ gen: gen, root: document })
      : false;
    if (!TM_CONTENT_OVERLAYS || !TM_CONTENT_OVERLAYS.detectResearchPhase) {
      if (gen >= 2) {
        var cardCount = document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]').length;
        // Research = 4 cards shown for buying, not during draft (draft has smaller sets rotating)
        var hasCheckboxes = document.querySelectorAll('.wf-component--select-card input[type="checkbox"]').length > 0;
        isResearchPhase = cardCount === 4 && hasCheckboxes;
      }
    }

    // Skip scoring for action-target selections (e.g. Ants choosing microbe target)
    // Detection: action phase + shown cards are NOT in player's hand
    var shouldSkipSelection = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.shouldSkipDraftRecommendationSelection
      ? TM_CONTENT_OVERLAYS.shouldSkipDraftRecommendationSelection({
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        myHand: myHand,
        selectCards: Array.from(selectCards),
        isKeepLikeActionCardChoice: isKeepLikeActionCardChoice
      })
      : false;
    if (!TM_CONTENT_OVERLAYS || !TM_CONTENT_OVERLAYS.shouldSkipDraftRecommendationSelection) {
      var pv0_check = getPlayerVueData();
      var phase0_check = pv0_check && pv0_check.game ? pv0_check.game.phase : null;
      if (phase0_check === 'action') {
        var handSet0 = new Set(myHand);
        var allShownNames0 = [];
        var keepLikeChoice0 = isKeepLikeActionCardChoice(selectCards);
        selectCards.forEach(function(sec) {
          sec.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
            var n = el.getAttribute('data-tm-card');
            if (n) allShownNames0.push(n);
          });
        });
        var handCardsShown0 = allShownNames0.filter(function(n) { return handSet0.has(n); });
        shouldSkipSelection = allShownNames0.length > 0 && handCardsShown0.length === 0 && !keepLikeChoice0;
      }
    }
    if (shouldSkipSelection) {
      // All shown cards are outside hand → action target selection, skip scoring
      revealPendingWorkflowBadges(selectCards);
      return;
    }

    // Score each card in selection
    let scored = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.collectDraftRecommendationScores
      ? TM_CONTENT_OVERLAYS.collectDraftRecommendationScores({
        selectCards: Array.from(selectCards),
        myTableau: myTableau,
        myHand: myHand,
        offeredCorps: offeredCorps,
        myCorp: myCorp,
        ctx: ctx,
        isResearchPhase: isResearchPhase,
        scoreCardAgainstCorps: scoreCardAgainstCorps,
        adjustForResearch: adjustForResearch
      })
      : null;
    if (!TM_CONTENT_OVERLAYS || !TM_CONTENT_OVERLAYS.collectDraftRecommendationScores) {
      scored = [];
      selectCards.forEach((section) => {
        section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
          const name = el.getAttribute('data-tm-card');
          if (!name) return;

          var result = scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx);

          if (isResearchPhase) adjustForResearch(result, el, myHand, ctx);

          scored.push({ el, name, ...result });
        });
      });
    }

    if (scored.length === 0) {
      revealPendingWorkflowBadges(selectCards);
      return;
    }

    // Save scores for draft history logging
    var draftScoreSnapshot = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.buildDraftScoreSnapshot
      ? TM_CONTENT_OVERLAYS.buildDraftScoreSnapshot({
        scored: scored,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        scoreToTier: scoreToTier
      })
      : {};
    if (!TM_CONTENT_OVERLAYS || !TM_CONTENT_OVERLAYS.buildDraftScoreSnapshot) {
      scored.forEach((item) => {
        const d = TM_RATINGS[item.name];
        var rankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
        draftScoreSnapshot[item.name] = { total: rankScore, displayTotal: item.total, tier: scoreToTier(item.total), baseTier: d ? d.t : '?', baseScore: d ? d.s : 0, reasons: item.reasons.slice(0, 3) };
      });
    }
    setLastDraftScoresState(draftScoreSnapshot);

    var displayState = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.prepareDraftRecommendationDisplayState
      ? TM_CONTENT_OVERLAYS.prepareDraftRecommendationDisplayState({
        scored: scored,
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        selectCards: Array.from(selectCards),
        isResearchPhase: isResearchPhase,
        myCorp: myCorp,
        detectGeneration: detectGeneration
      })
      : null;
    if (displayState) {
      scored = displayState.scored;
    } else {
      scored.sort((a, b) => (b.uncappedTotal != null ? b.uncappedTotal : b.total) - (a.uncappedTotal != null ? a.uncappedTotal : a.total));
    }
    const bestScore = displayState
      ? displayState.bestScore
      : (scored[0].uncappedTotal != null ? scored[0].uncappedTotal : scored[0].total);

    // Detect draft/research phase once (not per-card)
    var isDraftOrResearch28 = displayState ? displayState.isDraftOrResearch : false;
    if (!displayState) {
      var pv28 = getPlayerVueData();
      var gamePhase28 = pv28 && pv28.game ? pv28.game.phase : null;
      if (gamePhase28) {
        isDraftOrResearch28 = gamePhase28 === 'drafting' || gamePhase28 === 'research'
          || gamePhase28 === 'initial_drafting' || gamePhase28 === 'corporationsDrafting';
      } else {
        // Fallback: heuristics, but exclude blue-card action selection
        var hasBlueAction = false;
        selectCards.forEach(function(sec) {
          if (sec.querySelector('.card-content--blue, .blue-action, .card-content-wrapper[class*="blue"]')) hasBlueAction = true;
        });
        isDraftOrResearch28 = !hasBlueAction && (isResearchPhase || (!myCorp && scored.length <= 10));
      }
    }

    // Update badge on every card in draft with calculated score
    scored.forEach((item) => {
      if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.applyDraftRecommendationCardUi) {
        TM_CONTENT_OVERLAYS.applyDraftRecommendationCardUi({
          item: item,
          scored: scored,
          bestScore: bestScore,
          isDraftOrResearch: isDraftOrResearch28,
          ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
          revealPendingContextBadge: revealPendingContextBadge,
          scoreToTier: scoreToTier,
          overlayInput: {
            getCardCost: getCardCost,
            getCachedPlayerContext: getCachedPlayerContext,
            getCardTags: getCardTags,
            getEffectiveCost: getEffectiveCost,
            getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
            tmBrain: typeof TM_BRAIN !== 'undefined' ? TM_BRAIN : null,
            cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
            ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
            ruName: ruName,
            yName: yName
          }
        });
        return;
      }
      const itemRankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
      const isBest = itemRankScore >= bestScore - 5;
      const hasBonus = item.reasons.length > 0;

      // Highlight top picks
      if (isBest && hasBonus) {
        item.el.classList.add('tm-rec-best');
      }

      // Update existing badge with calculated score
      const badge = item.el.querySelector('.tm-tier-badge');
      if (badge) {
        const origData = TM_RATINGS[item.name];
        const origTier = origData ? origData.t : 'C';
        const origScore = origData ? origData.s : 0;

        if (!badge.hasAttribute('data-tm-original')) {
          badge.setAttribute('data-tm-original', badge.textContent);
          badge.setAttribute('data-tm-orig-tier', origTier);
        }

        const newTier = updateBadgeScore(badge, origTier, origScore, item.total, '', item.uncappedTotal, true);
        revealPendingContextBadge(badge);

        // Sync tm-dim with adjusted tier (not base tier)
        if (newTier === 'D' || newTier === 'F') {
          item.el.classList.add('tm-dim');
        } else {
          item.el.classList.remove('tm-dim');
        }
      }

      // Store reasons on card element for tooltip display
      setReasonPayload(item.el, item);

      // Inline overlay — only during draft/research
      var oldOverlay = item.el.querySelector('.tm-inline-overlay');
      if (oldOverlay) oldOverlay.remove();
      if (!isDraftOrResearch28) return;
      item.el.appendChild(renderCardOverlay(item, scored));
    });

    var gen28 = displayState ? displayState.gen : detectGeneration();
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.notifyDraftRecommendationToasts) {
      TM_CONTENT_OVERLAYS.notifyDraftRecommendationToasts({
        isDraftOrResearch: isDraftOrResearch28,
        scored: scored,
        bestScore: bestScore,
        gen: gen28,
        canShowToast: canShowToast,
        showToast: showToast
      });
    } else if (isDraftOrResearch28) {
      // Deny toast: alert when a non-best card is a strong deny pick
      for (var di = 0; di < scored.length; di++) {
        var dItem = scored[di];
        if (dItem.total >= bestScore - 5) continue; // skip top picks
        for (var ri = 0; ri < dItem.reasons.length; ri++) {
          if (dItem.reasons[ri].indexOf('\u2702') === 0 && canShowToast('deny', gen28 + '-' + dItem.name)) {
            showToast(dItem.reasons[ri] + ': ' + dItem.name, 'deny');
            break;
          }
        }
      }

      // S-tier / GODMODE card alert
      for (var si28 = 0; si28 < scored.length; si28++) {
        var sItem = scored[si28];
        if (sItem.total >= 90 && canShowToast('great', gen28 + '-' + sItem.name)) {
          showToast('⭐ S-tier: ' + sItem.name + ' (' + sItem.total + ')', 'great');
        }
        // GODMODE combo alert
        for (var sri = 0; sri < sItem.reasons.length; sri++) {
          if (sItem.reasons[sri].indexOf('GODMODE') >= 0 && canShowToast('godmode', gen28 + '-' + sItem.name)) {
            showToast('🔥 GODMODE: ' + sItem.name + ' — ' + sItem.reasons[sri], 'great');
          }
        }
      }
    }

    // Draft intel banner: show what the passing player kept/passed to us
    if (TM_CONTENT_DRAFT_INTEL && TM_CONTENT_DRAFT_INTEL.syncDraftIntelBanner) {
      TM_CONTENT_DRAFT_INTEL.syncDraftIntelBanner({
        scored: displayState ? displayState.intelScored : ((isDraftOrResearch28 && !isResearchPhase) ? scored : []),
        getDraftIntel: getDraftIntel,
        playerColor: typeof TM_UTILS !== 'undefined' ? TM_UTILS.playerColor : null,
        ruName: ruName,
        documentObj: document
      });
    }
  }

  // ── Draft Intel: infer what the passer kept ──

  function getDraftIntel(currentCardNames) {
    if (!TM_CONTENT_DRAFT_INTEL || !TM_CONTENT_DRAFT_INTEL.getDraftIntel) return null;
    return TM_CONTENT_DRAFT_INTEL.getDraftIntel({
      currentCardNames: currentCardNames,
      getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
      detectGeneration: typeof detectGeneration === 'function' ? detectGeneration : null,
      draftHistory: getDraftHistoryState(),
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null
    });
  }

  // ── Prelude Package Scoring ──

  function checkPreludePackage() {
    if (!TM_CONTENT_PRELUDE_PACKAGE || !TM_CONTENT_PRELUDE_PACKAGE.checkPreludePackage) return;
    TM_CONTENT_PRELUDE_PACKAGE.checkPreludePackage({
      enabled: enabled,
      documentObj: document,
      detectMyCorp: typeof detectMyCorp === 'function' ? detectMyCorp : null,
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      combos: typeof TM_COMBOS !== 'undefined' ? TM_COMBOS : null,
      ruName: ruName,
      showToast: showToast
    });
  }


  // VP Engine detection — finds cards with vpAcc in a player's tableau
  function detectVPEngines(tableau, gensLeft) {
    if (!TM_CONTENT_POSTGAME || !TM_CONTENT_POSTGAME.detectVPEngines) return [];
    return TM_CONTENT_POSTGAME.detectVPEngines({
      tableau: tableau,
      gensLeft: gensLeft,
      cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null
    });
  }



  // Draft history tracking
  const _draftHistoryFallback = []; // [{round, offered: [{name, total, tier}], taken: string|null, passed: [...], passedTo: string}]
  const _oppPredictedCardsFallback = {}; // color → Set of card names we passed to them
  let _lastDraftScoresFallback = {}; // name → {total, tier, reasons}
  let _lastDraftIsDraftFallback = false; // true only for real draft, not card-play selection

  function getDraftHistoryState() {
    return TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.getDraftHistory
      ? TM_CONTENT_DRAFT_TRACKER.getDraftHistory()
      : _draftHistoryFallback;
  }

  function getOppPredictedCardsState() {
    return TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.getOppPredictedCards
      ? TM_CONTENT_DRAFT_TRACKER.getOppPredictedCards()
      : _oppPredictedCardsFallback;
  }

  function getLastDraftScoresState() {
    return TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.getLastDraftScores
      ? TM_CONTENT_DRAFT_TRACKER.getLastDraftScores()
      : _lastDraftScoresFallback;
  }

  function setLastDraftScoresState(scores) {
    if (TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.setLastDraftScores) {
      TM_CONTENT_DRAFT_TRACKER.setLastDraftScores(scores);
      return;
    }
    _lastDraftScoresFallback = scores || {};
  }

  function isLastDraftActive() {
    return TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.isLastDraftActive
      ? TM_CONTENT_DRAFT_TRACKER.isLastDraftActive()
      : _lastDraftIsDraftFallback;
  }

  function registerDraftClick(cardName) {
    if (TM_CONTENT_DRAFT_TRACKER && TM_CONTENT_DRAFT_TRACKER.registerDraftClick) {
      TM_CONTENT_DRAFT_TRACKER.registerDraftClick(cardName);
    }
  }

  // Click listener to capture which draft card was clicked
  document.addEventListener('click', function(e) {
    var cardEl = e.target.closest(SEL_DRAFT);
    if (cardEl && isLastDraftActive()) {
      registerDraftClick(cardEl.getAttribute('data-tm-card'));
    }
  }, true); // capture phase

  function trackDraftHistory() {
    if (!TM_CONTENT_DRAFT_TRACKER || !TM_CONTENT_DRAFT_TRACKER.trackDraftHistory) return;
    TM_CONTENT_DRAFT_TRACKER.trackDraftHistory({
      documentObj: document,
      selectDraftSelector: SEL_DRAFT,
      getMyHandNames: typeof getMyHandNames === 'function' ? getMyHandNames : null,
      getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      setTimeoutFn: typeof setTimeout === 'function' ? setTimeout : null
    });
  }


  // ── Helpers for computePlayPriorities ──

  // Requirement feasibility: returns {penalty, unplayable, reasons[]}
  function computeReqPriority(cardEl, pv, ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.computeReqPriority) {
      return TM_CONTENT_PLAY_PRIORITY.computeReqPriority({
        cardEl: cardEl,
        pv: pv,
        ctx: ctx,
        getProductionFloorStatus: getProductionFloorStatus,
        evaluateBoardRequirements: evaluateBoardRequirements,
        detectMyCorps: detectMyCorps,
        getRequirementFlexSteps: getRequirementFlexSteps,
        getBoardRequirementDisplayName: getBoardRequirementDisplayName,
        sc: SC
      });
    }
    var result = { penalty: 0, unplayable: false, hardBlocked: false, reasons: [] };
    if (!cardEl || !pv || !pv.game) return result;
    var cardName0 = cardEl.getAttribute('data-tm-card') || '';
    var prodFloor = getProductionFloorStatus(cardName0, ctx);
    if (prodFloor.unplayable) {
      result.unplayable = true;
      for (var pfi0 = 0; pfi0 < prodFloor.reasons.length; pfi0++) {
        result.reasons.push(prodFloor.reasons[pfi0].replace('Невозможно сыграть: ', 'Не сейчас: '));
      }
    }
    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return result;

    var reqText = (reqEl.textContent || '').trim();
    var boardReqs = evaluateBoardRequirements(reqText, ctx, pv);
    var isMaxReq = /max/i.test(reqText);
    var gTemp = pv.game.temperature;
    var gOxy = pv.game.oxygenLevel;
    var gVenus = pv.game.venusScaleLevel;
    var gOceans = pv.game.oceans;

    // Requirement flexibility from Inventrix / Morning Star Inc.
    var myCorpsReq = detectMyCorps();
    var reqFlex = getRequirementFlexSteps(cardName0, myCorpsReq);
    var reqBonus = reqFlex.any;
    var venusReqBonus = reqFlex.any + reqFlex.venus;

    if (isMaxReq) {
      var tmM = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM = reqText.match(/(\d+)\s*%?\s*O/i);
      var vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
      if (tmM && typeof gTemp === 'number' && gTemp > parseInt(tmM[1]) + reqBonus * 2) { result.unplayable = true; result.hardBlocked = true; }
      if (oxM && typeof gOxy === 'number' && gOxy > parseInt(oxM[1]) + reqBonus) { result.unplayable = true; result.hardBlocked = true; }
      if (vnM && gVenus != null && gVenus > parseInt(vnM[1]) + venusReqBonus * 2) { result.unplayable = true; result.hardBlocked = true; }
    } else {
      var tmM2 = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM2 = reqText.match(/(\d+)\s*%?\s*O/i);
      var ocM2 = reqText.match(/(\d+)\s*ocean/i);
      var vnM2 = reqText.match(/(\d+)\s*%?\s*Venus/i);

      var maxGap = 0;
      if (tmM2 && typeof gTemp === 'number') { var need = parseInt(tmM2[1]) - reqBonus * 2; var gap = (need - gTemp) / 2; if (gap > maxGap) maxGap = gap; }
      if (oxM2 && typeof gOxy === 'number') { var need2 = parseInt(oxM2[1]) - reqBonus; var gap2 = need2 - gOxy; if (gap2 > maxGap) maxGap = gap2; }
      if (ocM2 && typeof gOceans === 'number') { var need3 = parseInt(ocM2[1]); var gap3 = need3 - gOceans; if (gap3 > maxGap) maxGap = gap3; }
      if (vnM2 && gVenus != null) { var need4 = parseInt(vnM2[1]) - venusReqBonus * 2; var gap4 = (need4 - gVenus) / 2; if (gap4 > maxGap) maxGap = gap4; }

      if (maxGap > 0) {
        result.penalty += Math.min(SC.ppReqGapCap, Math.round(maxGap * SC.ppReqGapMul));
        if (maxGap <= 1) result.reasons.push('Req почти (' + Math.ceil(maxGap) + ' подн.)');
        else result.reasons.push('Req далеко (' + Math.ceil(maxGap) + ' подн.)');
      }

      // Tag-based requirements
      var tagReqM = (!(boardReqs && boardReqs.reqs && boardReqs.reqs.length > 0))
        ? reqText.match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i)
        : null;
      if (tagReqM) {
        var tagReqCount = parseInt(tagReqM[1]);
        var tagReqName = tagReqM[2].toLowerCase();
        // Use tagsWithHand for real gap (can you play it soon?), tagsProjected to soften penalty
        var realCount = (ctx && ctx.tagsWithHand) ? (ctx.tagsWithHand[tagReqName] || 0) : ((ctx && ctx.tags) ? (ctx.tags[tagReqName] || 0) : 0);
        var projCount = (ctx && ctx.tagsProjected) ? (ctx.tagsProjected[tagReqName] || 0) : realCount;
        var tagGap = tagReqCount - realCount;
        if (tagGap > 0) {
          var projGap = Math.max(0, tagReqCount - projCount);
          // If projected says we'll get there, soften penalty by 50%
          var penaltyMul = (projGap <= 0) ? 0.5 : 1.0;
          result.penalty += Math.round(Math.min(SC.ppTagReqCap, tagGap * SC.ppTagReqMul) * penaltyMul);
          result.reasons.push('Нужно ' + tagGap + ' ' + tagReqName + ' тег(ов)' + (projGap <= 0 ? ' (прогноз ок)' : ''));
        }
      }
    }

    if (boardReqs && !boardReqs.metNow) {
      result.unplayable = true;
      for (var bri = 0; bri < boardReqs.unmet.length; bri++) {
        var breq = boardReqs.unmet[bri];
        var boardPrioPenalty = breq.missing * (breq.key === 'colonies' ? 8 : breq.key === 'city' ? 6 : 5);
        result.penalty += boardPrioPenalty;
        result.reasons.push('Не сейчас: нужно ' + breq.missing + ' ' + getBoardRequirementDisplayName(breq.key, breq.missing) + ' (есть ' + breq.have + ')');
      }
    }

    if (result.unplayable) {
      if (result.hardBlocked) {
        result.penalty += SC.ppUnplayable;
        result.reasons.push('Нельзя сыграть!');
      } else {
        result.penalty += Math.min(18, 6 + result.reasons.length * 2);
        if (!result.reasons.some(function(r) { return r.indexOf('Не сейчас') === 0; })) result.reasons.push('Не сейчас');
      }
    }
    return result;
  }

  // Blue card actions from tableau — returns scored items array
  function scoreBlueActions(tableauCards, pv, paramMaxed) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreBlueActions) {
      return TM_CONTENT_PLAY_PRIORITY.scoreBlueActions({
        tableauCards: tableauCards,
        pv: pv,
        paramMaxed: paramMaxed,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        getFx: getFx
      });
    }
    var scored = [];
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var myTi = tp ? (tp.titanium || 0) : 0;

    for (var ti = 0; ti < tableauCards.length; ti++) {
      var tName = tableauCards[ti];
      var tData = TM_RATINGS[tName];
      if (!tData) continue;
      var tEcon = (tData.e || '').toLowerCase();
      if (!tEcon.includes('action') && !tEcon.includes('действие')) continue;

      var aPriority = 45;
      var aReasons = [];
      var aMCValue = 0;

      var fx = getFx(tName);
      if (fx) {
        if (fx.actMC) { aMCValue += fx.actMC; if (fx.actMC > 0) aReasons.push('+' + fx.actMC + ' MC'); }
        if (fx.actTR) { var trVal = fx.actTR * 7.2; aMCValue += trVal; aReasons.push('+' + fx.actTR + ' TR (~' + Math.round(trVal) + ' MC)'); }
        if (fx.actCD) { aMCValue += fx.actCD * 3.5; aReasons.push('+' + fx.actCD + ' карт'); }
        if (fx.actOc && !paramMaxed.oceans) { aMCValue += 18; aReasons.push('Океан!'); }
        if (fx.vpAcc) { aMCValue += fx.vpAcc * 5; aReasons.push('+' + fx.vpAcc + ' VP'); }
      }

      if (!fx) {
        if (tEcon.includes('vp') || tEcon.includes('вп')) { aPriority += 10; aMCValue += 5; aReasons.push('VP действие'); }
        if (tEcon.includes('microbe') || tEcon.includes('микроб') || tEcon.includes('animal') || tEcon.includes('животн') || tEcon.includes('floater') || tEcon.includes('флоатер')) { aPriority += 5; aMCValue += 3; aReasons.push('Ресурс'); }
        if (tEcon.includes('mc') && (tEcon.includes('gain') || tEcon.includes('получ'))) { aPriority += 8; aMCValue += 4; aReasons.push('MC'); }
      }

      var isVenusAction = tEcon.includes('venus') || tEcon.includes('венер') || tEcon.includes('флоатер') || tEcon.includes('floater');
      if (isVenusAction && paramMaxed.venus) {
        if (fx && fx.actTR) aMCValue -= fx.actTR * 7.2;
        aPriority -= 20;
        aReasons.push('Venus max!');
      }

      if ((tEcon.includes('titanium') || tEcon.includes('титан')) && myTi < 1) {
        aPriority -= 15;
        aReasons.push('Нет титана');
      }

      aPriority += Math.min(20, Math.round(aMCValue * 1.5));
      scored.push({ name: '⚡ ' + tName, priority: aPriority, reasons: aReasons, tier: tData.t || '?', score: tData.s || 0, type: 'action', mcValue: aMCValue });
    }
    return scored;
  }

  // ── Standard conversion actions (heat/plants/trade) ──

  function scoreStandardActions(tp, pv, ctx, saturation) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreStandardActions) {
      return TM_CONTENT_PLAY_PRIORITY.scoreStandardActions({
        tp: tp,
        pv: pv,
        ctx: ctx,
        saturation: saturation,
        sc: SC,
        detectMyCorps: detectMyCorps,
        brain: typeof TM_BRAIN !== 'undefined' ? TM_BRAIN : null,
        fundedAwardsCache: typeof _fundedAwardsCache !== 'undefined' ? _fundedAwardsCache : null
      });
    }
    var items = [];
    var plantCost = SC.plantsPerGreenery;
    var myCorpsP = detectMyCorps();
    if (myCorpsP.indexOf('EcoLine') !== -1) plantCost = SC.plantsPerGreenery - 1;
    var myHeat = tp.heat || 0;
    var myPlants = tp.plants || 0;

    // Heat → Temperature (1 TR = 7.2 MC)
    if (myHeat >= SC.heatPerTR && !saturation.temp) {
      var heatConvs = Math.floor(myHeat / SC.heatPerTR);
      var heatReasons = heatConvs > 1 ? [myHeat + ' heat (' + heatConvs + 'x)'] : [myHeat + ' heat'];
      items.push({ name: '🔥 Тепло → Темп', priority: 35, reasons: heatReasons, tier: '-', score: 0, type: 'standard', mcValue: 7.2 });
    }

    // Plants → Greenery (1 TR if oxy not maxed + VP)
    if (myPlants >= plantCost) {
      var greenMC = saturation.oxy ? 4 : 11;
      var greenPrio = saturation.oxy ? 20 : 25;
      items.push({ name: '🌿 Озеленение', priority: greenPrio, reasons: [myPlants + ' растений' + (saturation.oxy ? ', O₂ max' : '')], tier: '-', score: 0, type: 'standard', mcValue: greenMC });
    }

    // Trade action (if fleets available) — use TM_BRAIN.scoreColonyTrade if available
    if (ctx && ctx.tradesLeft > 0 && pv.game && pv.game.colonies) {
      var colReasons = [ctx.tradesLeft + ' флот(ов)'];
      var scoredCols = [];
      var brainState = { game: pv.game, thisPlayer: pv.thisPlayer, players: pv.game.players || [] };
      for (var ci = 0; ci < pv.game.colonies.length; ci++) {
        var col = pv.game.colonies[ci];
        if (!col.isActive && col.isActive !== undefined) continue;
        if (col.visitor) continue;
        var val = 0;
        if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.scoreColonyTrade) {
          val = Math.round(TM_BRAIN.scoreColonyTrade(col, brainState));
        } else {
          // Fallback: simple track position estimate
          val = (col.trackPosition || 0) * 2 + 3;
        }
        if (val > 0) scoredCols.push({ name: col.name, val: val });
      }
      scoredCols.sort(function(a, b) { return b.val - a.val; });
      var topCols = scoredCols.slice(0, 3);
      if (topCols.length > 0) {
        colReasons.push(topCols.map(function(c) { return c.name + ' ~' + c.val + ' MC'; }).join(' | '));
      }
      var bestColVal = topCols.length > 0 ? topCols[0].val : 0;
      items.push({ name: '🚀 Торговля', priority: 40, reasons: colReasons, tier: '-', score: 0, type: 'standard', mcValue: Math.max(8, bestColVal) });
    }

    // Milestone claiming — always top priority if claimable
    if (pv.game && pv.game.milestones && tp && (tp.megaCredits || 0) >= 8) {
      var claimedMs = 0;
      pv.game.milestones.forEach(function(ms) {
        if (ms.owner_name || ms.owner_color) claimedMs++;
      });
      if (claimedMs < 3) {
        // Use evaluateMilestone from tm-brain if available, or check scores from API
        pv.game.milestones.forEach(function(ms) {
          if (ms.owner_name || ms.owner_color) return; // already claimed
          if (ms.scores) {
            var myMsScore = 0, msThr = ms.threshold || 0;
            for (var msi = 0; msi < ms.scores.length; msi++) {
              if (ms.scores[msi].color === tp.color) myMsScore = ms.scores[msi].score;
            }
            if (msThr > 0 && myMsScore >= msThr) {
              items.push({ name: '⭐ ' + ms.name, priority: 80, reasons: ['5 VP за 8 MC!', myMsScore + '/' + msThr], tier: '-', score: 0, type: 'standard', mcValue: 32 });
            }
          }
        });
      }
    }

    // Award funding advisor — analyze each unfunded award
    if (pv.game && pv.game.awards && tp) {
      var myColor = tp.color;
      var fundedCount = 0;
      var fundCosts = [8, 14, 20];
      pv.game.awards.forEach(function(aw) {
        if (aw.funder_name || aw.funder_color || (aw.scores && aw.scores.some(function(s) { return s.claimable; }))) fundedCount++;
      });
      // Check funded count from cache too
      if (typeof _fundedAwardsCache !== 'undefined' && _fundedAwardsCache && _fundedAwardsCache.awards) fundedCount = Math.max(fundedCount, _fundedAwardsCache.awards.size);
      if (fundedCount < 3) {
        var fundCost = fundCosts[Math.min(fundedCount, 2)];
        if ((tp.megaCredits || 0) >= fundCost) {
          pv.game.awards.forEach(function(aw) {
            if (!aw.scores || aw.scores.length === 0) return;
            var isFunded = typeof _fundedAwardsCache !== 'undefined' && _fundedAwardsCache && _fundedAwardsCache.awards && _fundedAwardsCache.awards.has(aw.name);
            if (isFunded) return;
            var myScore = 0, bestOpp = 0;
            for (var si = 0; si < aw.scores.length; si++) {
              if (aw.scores[si].color === myColor) myScore = aw.scores[si].score;
              else bestOpp = Math.max(bestOpp, aw.scores[si].score);
            }
            if (myScore <= 0) return;
            var lead = myScore - bestOpp;
            var vpExpected = lead > 0 ? 5 : lead === 0 ? 3.5 : lead >= -2 ? 2 : 0;
            var ev = vpExpected * 8 - fundCost; // VP in MC equivalent minus cost
            if (ev > 0 && lead >= -2) {
              var prio = lead > 0 ? 30 : 20;
              var awReasons = [myScore + ' vs ' + bestOpp + (lead > 0 ? ' лидер' : lead === 0 ? ' равны' : ' −' + Math.abs(lead))];
              awReasons.push(fundCost + ' MC, EV ' + Math.round(ev) + ' MC');
              items.push({ name: '🏆 ' + aw.name, priority: prio, reasons: awReasons, tier: '-', score: 0, type: 'standard', mcValue: ev });
            }
          });
        }
      }
    }

    return items;
  }

  // Shared play priority scorer — used by panel and hand sort
  function computePlayPriorities() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.computePlayPriorities) {
      return TM_CONTENT_PLAY_PRIORITY.computePlayPriorities({
        getMyHandNames: getMyHandNames,
        detectGeneration: detectGeneration,
        getPlayerVueData: getPlayerVueData,
        estimateGensLeft: estimateGensLeft,
        getCachedPlayerContext: getCachedPlayerContext,
        getMyTableauNames: getMyTableauNames,
        documentObj: document,
        selHand: SEL_HAND,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        cardTagsData: typeof TM_CARD_TAGS !== 'undefined' ? TM_CARD_TAGS : null,
        lookupCardData: _lookupCardData,
        detectCardTypeForScoring: detectCardTypeForScoring,
        cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
        computeCardValue: computeCardValue,
        cardDiscounts: CARD_DISCOUNTS,
        getCardCost: getCardCost,
        sc: SC,
        computeReqPriority: computeReqPriority,
        scorePlayPriorityMA: scorePlayPriorityMA,
        scoreBlueActions: scoreBlueActions,
        scoreStandardActions: scoreStandardActions,
        yName: yName
      });
    }
    const handCards = getMyHandNames();
    if (handCards.length === 0) return [];

    const gen = detectGeneration();
    const pv = getPlayerVueData();
    const gensLeft = estimateGensLeft(pv);
    const ctx = getCachedPlayerContext();
    const myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    const myTableau = getMyTableauNames();

    // Pre-build name→element map (avoids O(N²) querySelector in discount loop)
    const handElMap = new Map();
    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      handElMap.set(el.getAttribute('data-tm-card'), el);
    });

    const scored = [];
    for (const name of handCards) {
      const data = TM_RATINGS[name];
      if (!data) { scored.push({ name, priority: SC.ppBase, reasons: [], tier: '?', score: 0 }); continue; }

      let priority = SC.ppBase;
      const reasons = [];
      const econ = (data.e || '').toLowerCase();
      const when = (data.w || '').toLowerCase();
      const cardEl = handElMap.get(name);
      const cardTagsArr = (typeof TM_CARD_TAGS !== 'undefined' ? _lookupCardData(TM_CARD_TAGS, name) : null) || [];
      const cardTags = new Set((cardTagsArr || []).map(function(t) { return String(t).toLowerCase(); }));
      const cardType = detectCardTypeForScoring(cardEl, cardTags, econ + ' ' + when);

      // FTN timing: use card_effects if available
      var cardMCValue = 0;
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[name];
        if (fx) {
          var mcNow = computeCardValue(fx, gensLeft);
          var mcLater = computeCardValue(fx, Math.max(0, gensLeft - 2));
          var urgency = mcNow - mcLater; // how much value lost by waiting 2 gens
          cardMCValue = mcNow - (fx.c || 0) - 3; // net value = FTN value - cost - draft cost
          if (urgency > 5) { priority += Math.min(20, Math.round(urgency)); reasons.push('Срочно (' + Math.round(urgency) + ' MC потерь)'); }
          else if (urgency > 2) { priority += Math.round(urgency); reasons.push('Лучше раньше'); }
          else if (urgency < -2) { priority += Math.round(urgency); reasons.push('Можно позже'); }
        }
      }

      // Production cards: play early for more generations of benefit
      if (econ.includes('prod') && !econ.includes('vp only')) {
        priority += gensLeft * SC.ppProdMul;
        reasons.push('Продукция');
      }

      // Action cards: play early for more activations
      if (econ.includes('action') || when.includes('action')) {
        priority += gensLeft * SC.ppActionMul;
        reasons.push('Действие');
      }

      // Discount sources: play before expensive cards
      if (CARD_DISCOUNTS[name]) {
        var expensiveInHand = 0;
        for (var hi = 0; hi < handCards.length; hi++) {
          if (handCards[hi] === name) continue;
          var hEl = handElMap.get(handCards[hi]);
          if (hEl) { var hCost = getCardCost(hEl); if (hCost !== null && hCost >= 12) expensiveInHand++; }
        }
        if (expensiveInHand > 0) {
          priority += expensiveInHand * SC.ppDiscountMul;
          reasons.push('Скидка → ' + expensiveInHand + ' карт');
        }
      }

      // TR cards: moderate priority
      if (econ.includes('tr') && !econ.includes('prod')) {
        priority += SC.ppTrBoost;
        reasons.push('TR');
      }

      // Cards that enable other hand cards (synergy prereqs)
      let enablesOthers = 0;
      for (const other of handCards) {
        if (other === name) continue;
        const od = TM_RATINGS[other];
        if (od && od.y && od.y.some(function(e) { return yName(e) === name; })) enablesOthers++;
      }
      if (enablesOthers > 0) {
        priority += enablesOthers * SC.ppEnablesMul;
        reasons.push('Активирует ' + enablesOthers);
      }

      // Cards that need other hand cards — play after
      let needsOthers = 0;
      if (data.y) {
        for (const entry of data.y) {
          if (handCards.includes(yName(entry))) needsOthers++;
        }
      }
      if (needsOthers > 0) {
        priority -= needsOthers * SC.ppNeedsMul;
        reasons.push('После синергии');
      }

      // VP-only: low priority (no ongoing value until game end)
      if (econ.includes('vp') && !econ.includes('prod') && !econ.includes('action')) {
        priority -= gensLeft * SC.ppVpMul;
        reasons.push('Только VP');
      }

      // Affordability: can't afford now = lower priority
      if (cardEl) {
        var cardCost = getCardCost(cardEl);
        if (cardCost !== null && cardCost > myMC) {
          priority -= Math.min(SC.ppAffordCap, Math.round((cardCost - myMC) / SC.ppAffordDiv));
          reasons.push('Дорого (' + cardCost + ' MC)');
        }
      }

      // Requirement feasibility
      var reqResult = computeReqPriority(cardEl, pv, ctx);
      var reqUnplayable = reqResult.unplayable;
      priority -= reqResult.penalty;
      for (var rqi = 0; rqi < reqResult.reasons.length; rqi++) reasons.push(reqResult.reasons[rqi]);

      var maPriority = scorePlayPriorityMA(name, data, cardTags, cardType, ctx, pv);
      priority += maPriority.bonus;
      for (var mai = 0; mai < maPriority.reasons.length; mai++) reasons.push(maPriority.reasons[mai]);

      scored.push({ name, priority, reasons, tier: data.t || '?', score: data.s || 0, type: 'play', mcValue: cardMCValue > 0 ? cardMCValue : 0, unplayable: reqUnplayable });
    }

    // ── Global params for saturation checks ──
    var _tempMaxed = false, _oxyMaxed = false, _venusMaxed = false, _oceansMaxed = false;
    if (pv && pv.game) {
      _tempMaxed = typeof pv.game.temperature === 'number' && pv.game.temperature >= SC.tempMax;
      _oxyMaxed = typeof pv.game.oxygenLevel === 'number' && pv.game.oxygenLevel >= SC.oxyMax;
      _venusMaxed = pv.game.venusScaleLevel != null && pv.game.venusScaleLevel >= SC.venusMax;
      _oceansMaxed = typeof pv.game.oceans === 'number' && pv.game.oceans >= SC.oceansMax;
    }

    // ── Blue card actions from tableau ──
    var tableauCards = getMyTableauNames();
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var saturation = { temp: _tempMaxed, oxy: _oxyMaxed, venus: _venusMaxed, oceans: _oceansMaxed };
    var blueActions = scoreBlueActions(tableauCards, pv, saturation);
    for (var bai = 0; bai < blueActions.length; bai++) scored.push(blueActions[bai]);

    // Standard conversion actions: heat/plants/trade
    if (tp) {
      var stdActions = scoreStandardActions(tp, pv, ctx, saturation);
      for (var sai = 0; sai < stdActions.length; sai++) scored.push(stdActions[sai]);
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored;
  }


  // ── Play Priority Badges + Hand Sort ──
  var _lastPriorityMap = {}; // name → {rank, reasons, priority, affordable, useless}

  function getLastPriorityMap() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getLastPriorityMap) {
      return TM_CONTENT_PLAY_PRIORITY.getLastPriorityMap();
    }
    return _lastPriorityMap;
  }

  function injectPlayPriorityBadges() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.injectPlayPriorityBadges) {
      TM_CONTENT_PLAY_PRIORITY.injectPlayPriorityBadges({
        documentObj: document,
        selHand: SEL_HAND,
        selDraft: SEL_DRAFT
      });
      return;
    }
    _lastPriorityMap = {};
    // Disabled: play-order markers and highlights were too noisy and unreliable.
    _applyPriorityBadges(SEL_HAND);
    _applyPriorityBadges(SEL_DRAFT);
  }

  function _applyPriorityBadges(selector) {
    document.querySelectorAll(selector).forEach(function(el) {
      var old = el.querySelector('.tm-priority-badge');
      if (old) old.remove();
      var oldMark = el.querySelector('.tm-play-mark');
      if (oldMark) oldMark.remove();
      el.classList.remove('tm-play-top1', 'tm-play-top2');
      el.removeAttribute('data-tm-priority');
    });
  }

  // ── Discard Advisor ──

  function getDiscardAdvice() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.getDiscardAdvice) {
      return TM_CONTENT_PLAY_PRIORITY.getDiscardAdvice({
        getMyHandNames: getMyHandNames,
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getCachedPlayerContext: getCachedPlayerContext,
        getPlayerVueData: getPlayerVueData,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        yName: yName,
        documentObj: document,
        getCardCost: getCardCost,
        getCardTags: getCardTags,
        getCorpBoost: getCorpBoost,
        combos: typeof TM_COMBOS !== 'undefined' ? TM_COMBOS : null
      });
    }
    const handCards = getMyHandNames();
    if (handCards.length < 6) return null;

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const ctx = getCachedPlayerContext();
    const allCards = [...myTableau, ...handCards];
    const pv = getPlayerVueData();
    const myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;

    const scored = [];
    for (var i = 0; i < handCards.length; i++) {
      var name = handCards[i];
      var data = TM_RATINGS[name];
      if (!data) continue;

      var keepScore = data.s || 50;
      var keepReasons = [];

      // Synergy with tableau
      var synCount = 0;
      if (data.y) {
        for (var j = 0; j < data.y.length; j++) {
          if (myTableau.includes(yName(data.y[j]))) synCount++;
        }
      }
      for (var j = 0; j < myTableau.length; j++) {
        var td = TM_RATINGS[myTableau[j]];
        if (td && td.y && td.y.some(function(e) { return yName(e) === name; })) synCount++;
      }
      if (synCount > 0) {
        keepScore += synCount * 5;
        keepReasons.push(synCount + ' синерг.');
      }

      // Synergy with other hand cards
      var handSyn = 0;
      for (var j = 0; j < handCards.length; j++) {
        if (handCards[j] === name) continue;
        var hd = TM_RATINGS[handCards[j]];
        if (hd && hd.y && hd.y.some(function(e) { return yName(e) === name; })) handSyn++;
        if (data.y && data.y.some(function(e) { return yName(e) === handCards[j]; })) handSyn++;
      }
      if (handSyn > 0) {
        keepScore += handSyn * 3;
        keepReasons.push('связь с ' + handSyn + ' в руке');
      }

      // Affordability — can I play this?
      var cardCost = null;
      var cardEls = document.querySelectorAll('.card-container[data-tm-card="' + name + '"]');
      if (cardEls.length > 0) cardCost = getCardCost(cardEls[0]);
      if (cardCost !== null && cardCost > myMC * 1.5 && ctx && ctx.gensLeft <= 2) {
        keepScore -= 15;
        keepReasons.push('не потянуть');
      }

      // Timing
      if (data.e) {
        var eL = data.e.toLowerCase();
        var isProd = eL.includes('prod') || eL.includes('прод');
        if (isProd && ctx && ctx.gensLeft <= 1) {
          keepScore -= 10;
          keepReasons.push('поздно для прод');
        }
      }

      // Corp synergy
      if (myCorp && data.y && data.y.some(function(e) { return yName(e) === myCorp; })) {
        keepScore += 5;
        keepReasons.push('корп.');
      }

      // Corp-specific boosts via unified getCorpBoost()
      // Iterate ALL corps (Two Corps / Merger support)
      var allCorpsHand = ctx && ctx._myCorps ? ctx._myCorps : (myCorp ? [myCorp] : []);
      if (data.e && cardEls.length > 0) {
        var cTags = getCardTags(cardEls[0]);
        var cType = 'green';
        if (cardEls[0].querySelector('.card-content--blue, .blue-action, [class*="blue"]')) cType = 'blue';
        var cbOpts2 = { eLower: data.e.toLowerCase(), cardTags: cTags, cardCost: cardCost, cardType: cType, cardName: name, ctx: ctx, globalParams: ctx ? ctx.globalParams : null };
        for (var hci = 0; hci < allCorpsHand.length; hci++) {
          var hcCorp = allCorpsHand[hci];
          var cb = getCorpBoost(hcCorp, cbOpts2);
          if (cb !== 0) {
            keepScore += cb;
            keepReasons.push(describeCorpBoostReason(hcCorp, name, cb));
          }
        }
      }

      // Combo bonus with corp or tableau
      if (typeof TM_COMBOS !== 'undefined') {
        var bestCb = 0;
        for (var ci = 0; ci < TM_COMBOS.length; ci++) {
          var combo = TM_COMBOS[ci];
          if (!combo.cards.includes(name)) continue;
          var otherCards = combo.cards.filter(function(c) { return c !== name; });
          var matchCount = otherCards.filter(function(c) { return c === myCorp || myTableau.includes(c) || handCards.includes(c); }).length;
          if (matchCount > 0) {
            var cbonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
            if (cbonus > bestCb) bestCb = cbonus;
          }
        }
        if (bestCb > 0) {
          keepScore += bestCb;
          keepReasons.push('комбо +' + bestCb);
        }
      }

      scored.push({ name: name, keepScore: keepScore, tier: data.t, reasons: keepReasons });
    }

    scored.sort(function(a, b) { return b.keepScore - a.keepScore; });
    return scored;
  }

  // ── Context-aware scores on hand cards ──
  // Known corp names for initial draft detection (canonical source: TM_CORPS)
  var _knownCorps = typeof TM_CORPS !== 'undefined' ? new Set(Object.keys(TM_CORPS)) : new Set();

  // Debug: validate ALL hardcoded names against canonical sources
  (function() {
    // Corp names → TM_CORPS
    if (typeof TM_CORPS !== 'undefined') {
      var corpMaps = { CORP_DISCOUNTS: CORP_DISCOUNTS, CORP_ABILITY_SYNERGY: CORP_ABILITY_SYNERGY };
      for (var mapName in corpMaps) {
        for (var k in corpMaps[mapName]) {
          if (!TM_CORPS[k]) tmWarn('init', mapName + ' key "' + k + '" not in TM_CORPS');
        }
      }
    }
    // Card names → TM_RATINGS (canonical card list)
    if (typeof TM_RATINGS !== 'undefined') {
      var cardMaps = { CARD_DISCOUNTS: CARD_DISCOUNTS, TAG_TRIGGERS: TAG_TRIGGERS, TAKE_THAT_CARDS: TAKE_THAT_CARDS };
      for (var cm in cardMaps) {
        for (var ck in cardMaps[cm]) {
          if (!TM_RATINGS[ck] && !(_knownCorps.has && _knownCorps.has(ck))) {
            tmWarn('init', cm + ' key "' + ck + '" not in TM_RATINGS');
          }
        }
      }
      var cardSets = { ANIMAL_TARGETS: ANIMAL_TARGETS, MICROBE_TARGETS: MICROBE_TARGETS, FLOATER_TARGETS: FLOATER_TARGETS };
      for (var cs in cardSets) {
        cardSets[cs].forEach(function(val) {
          if (!TM_RATINGS[val] && !(_knownCorps.has && _knownCorps.has(val))) {
            tmWarn('init', cs + ' "' + val + '" not in TM_RATINGS');
          }
        });
      }
      // TM_CARD_EFFECTS keys → TM_RATINGS
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        for (var ce in TM_CARD_EFFECTS) {
          if (!TM_RATINGS[ce]) tmWarn('init', 'TM_CARD_EFFECTS key "' + ce + '" not in TM_RATINGS');
        }
      }
      // TM_COMBOS card names → TM_RATINGS or TM_CORPS (colonies are valid non-card names)
      if (typeof TM_COMBOS !== 'undefined') {
        var _colonyNames = { 'Pluto Colony':1, 'Luna Colony':1, 'Enceladus Colony':1, 'Miranda Colony':1,
          'Titan Colony':1, 'Ceres Colony':1, 'Ganymede Colony':1, 'Callisto Colony':1, 'Europa Colony':1,
          'Io Colony':1, 'Triton Colony':1 };
        for (var cbi = 0; cbi < TM_COMBOS.length; cbi++) {
          var combo = TM_COMBOS[cbi];
          for (var cbj = 0; cbj < combo.cards.length; cbj++) {
            var cn = combo.cards[cbj];
            if (!TM_RATINGS[cn] && !(_knownCorps.has && _knownCorps.has(cn)) && !_colonyNames[cn]) {
              tmWarn('init', 'TM_COMBOS[' + cbi + '] card "' + cn + '" not in TM_RATINGS/TM_CORPS');
            }
          }
        }
      }
    }
  })();

  // ── Invalidate stale frozen scores on game change / opponent tableau change ──

  function invalidateStaleScores() {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.invalidateStaleScores) {
      var staleState = TM_CONTENT_PLAY_PRIORITY.invalidateStaleScores({
        getPlayerVueData: getPlayerVueData,
        frozenScores: frozenScores,
        frozenGameId: _frozenGameId,
        oppTableauSizes: _oppTableauSizes,
        oppCtxCache: _oppCtxCache
      });
      if (staleState) {
        _frozenGameId = staleState.frozenGameId;
        _oppTableauSizes = staleState.oppTableauSizes || _oppTableauSizes;
      }
      return;
    }
    var pvf = getPlayerVueData();
    var curGameId = pvf && pvf.game ? (pvf.game.id || '') : '';
    if (curGameId && curGameId !== _frozenGameId) {
      frozenScores.clear();
      _frozenGameId = curGameId;
      _oppTableauSizes = {};
    }
    if (pvf && pvf.game && pvf.game.players && pvf.thisPlayer) {
      var myCol = pvf.thisPlayer.color;
      for (var opi = 0; opi < pvf.game.players.length; opi++) {
        var opp = pvf.game.players[opi];
        if (opp.color === myCol) continue;
        var newSize = opp.tableau ? opp.tableau.length : 0;
        var oldSize = _oppTableauSizes[opp.color] || 0;
        if (newSize !== oldSize) {
          _oppTableauSizes[opp.color] = newSize;
          var prefix = 'opp:' + opp.color + ':';
          frozenScores.forEach(function(v, k) {
            if (k.indexOf(prefix) === 0) frozenScores.delete(k);
          });
          if (_oppCtxCache[opp.color]) delete _oppCtxCache[opp.color];
        }
      }
    }
  }

  // Score a corporation against visible project cards during initial draft
  function scoreCorpByVisibleCards(corpName, visibleCardEls, ctx) {
    if (TM_CONTENT_PLAY_PRIORITY && TM_CONTENT_PLAY_PRIORITY.scoreCorpByVisibleCards) {
      return TM_CONTENT_PLAY_PRIORITY.scoreCorpByVisibleCards({
        corpName: corpName,
        visibleCardEls: visibleCardEls,
        ctx: ctx,
        ratingsRaw: _TM_RATINGS_RAW,
        baseCardName: _baseCardName,
        getVisiblePreludeNames: getVisiblePreludeNames,
        knownCorps: _knownCorps,
        resolveCorpName: resolveCorpName,
        getCachedCardTags: getCachedCardTags,
        getCardCost: getCardCost,
        isSpliceOpeningPlacer: isSpliceOpeningPlacer,
        getCorpBoost: getCorpBoost,
        getInitialDraftInfluence: getInitialDraftInfluence,
        getInitialDraftRatingScore: getInitialDraftRatingScore,
        ruName: TM_UTILS.ruName,
        getVisibleColonyNames: getVisibleColonyNames,
        getPlayerVueData: getPlayerVueData
      });
    }
    var bonus = 0;
    var reasons = [];
    var synergyData = _TM_RATINGS_RAW[corpName];
    var synergyCards = synergyData && synergyData.y ? synergyData.y : [];
    var synergySet = new Set();
    for (var sc = 0; sc < synergyCards.length; sc++) {
      var entry = synergyCards[sc];
      if (Array.isArray(entry)) {
        for (var sj = 0; sj < entry.length; sj++) {
          if (!entry[sj]) continue;
          synergySet.add(entry[sj]);
          synergySet.add(_baseCardName(entry[sj]));
        }
      } else if (entry) {
        synergySet.add(entry);
        synergySet.add(_baseCardName(entry));
      }
    }

    var visiblePreludeSet = new Set(getVisiblePreludeNames());
    var preludeEntries = [];
    var projectBoostTotal = 0;
    var projectHitCount = 0;
    var spliceMicrobeCards = 0;
    var splicePlacers = 0;

    for (var i = 0; i < visibleCardEls.length; i++) {
      var el = visibleCardEls[i];
      var cardName = el.getAttribute('data-tm-card');
      if (!cardName || _knownCorps.has(cardName) || _knownCorps.has(resolveCorpName(cardName))) continue;

      var rawBonus = 0;
      if (synergySet.has(cardName) || synergySet.has(_baseCardName(cardName))) rawBonus += 3;

      var cardTags = getCachedCardTags(el);
      var cardData = _TM_RATINGS_RAW[cardName] || _TM_RATINGS_RAW[_baseCardName(cardName)];
      var eLower = cardData && cardData.e ? cardData.e.toLowerCase() : '';
      var cardCost = getCardCost(el);
      var cardType = cardTags.has('event') ? 'event' : el.closest('.automated-card, [class*="auto"]') ? 'auto' : 'blue';
      if (corpName === 'Splice') {
        if (cardTags.has('microbe')) spliceMicrobeCards++;
        if (isSpliceOpeningPlacer(cardName)) splicePlacers++;
      }
      rawBonus += getCorpBoost(corpName, { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx, globalParams: ctx ? ctx.globalParams : null });
      if (rawBonus === 0) continue;

      var cardWeight = getInitialDraftInfluence(getInitialDraftRatingScore(cardName, 55), 0.25, 0.7);
      var weightedBonus = rawBonus >= 0 ? rawBonus * cardWeight : rawBonus * Math.max(0.15, cardWeight * 0.5);
      if (visiblePreludeSet.has(cardName)) {
        preludeEntries.push({name: cardName, weighted: weightedBonus, raw: rawBonus});
      } else {
        projectBoostTotal += weightedBonus;
        projectHitCount++;
      }
    }

    if (projectBoostTotal !== 0) {
      var scaledProjectBoost = Math.round(Math.max(-10, Math.min(12, projectBoostTotal)));
      bonus += scaledProjectBoost;
      if (scaledProjectBoost > 0) reasons.push(projectHitCount + ' карт к драфту +' + scaledProjectBoost);
      else reasons.push(projectHitCount + ' карт к драфту ' + scaledProjectBoost);
    }

    if (preludeEntries.length > 0) {
      preludeEntries.sort(function(a, b) { return b.weighted - a.weighted; });
      var topPrelude = preludeEntries[0];
      var secondPrelude = preludeEntries.length > 1 ? preludeEntries[1] : null;
      var preludeBonus = topPrelude.weighted;
      if (secondPrelude) preludeBonus += secondPrelude.weighted * (secondPrelude.weighted >= 0 ? 0.4 : 0.15);
      var scaledPreludeBonus = Math.round(Math.max(-6, Math.min(10, preludeBonus)));
      bonus += scaledPreludeBonus;

      var topPreludeName = reasonCardLabel(TM_UTILS.ruName(topPrelude.name) || topPrelude.name);
      reasons.push('лучшая прел. ' + topPreludeName + ' ' + (Math.round(topPrelude.weighted) >= 0 ? '+' : '') + Math.round(topPrelude.weighted));
      if (secondPrelude && Math.abs(secondPrelude.weighted) >= 1) {
        var secondPreludeName = reasonCardLabel(TM_UTILS.ruName(secondPrelude.name) || secondPrelude.name);
        var secondShown = Math.round(secondPrelude.weighted * (secondPrelude.weighted >= 0 ? 0.4 : 0.15));
        reasons.push('2-я прел. ' + secondPreludeName + ' ' + (secondShown >= 0 ? '+' : '') + secondShown);
      }
    }

    if (corpName === 'Splice') {
      var spliceShellBonus = 0;
      var spliceColonies = new Set(getVisibleColonyNames());
      if (spliceMicrobeCards >= 2) spliceShellBonus += 1;
      if (spliceMicrobeCards >= 4) spliceShellBonus += 1;
      if (splicePlacers > 0) spliceShellBonus += Math.min(2, splicePlacers);
      if (spliceColonies.has('Enceladus')) spliceShellBonus += 2;
      if (spliceShellBonus > 0) {
        bonus += spliceShellBonus;
        reasons.push('microbe shell +' + spliceShellBonus);
      }
    }

    var pvDraft = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var playerCount = (pvDraft && pvDraft.game && pvDraft.game.players) ? pvDraft.game.players.length : 3;
    var hasWGT = !!(pvDraft && pvDraft.game && pvDraft.game.gameOptions && pvDraft.game.gameOptions.solarPhaseOption);
    if (corpName === 'Nirgal Enterprises' && playerCount >= 4) {
      var nirgalPenalty = hasWGT ? 2 : 3;
      bonus -= nirgalPenalty;
      reasons.push(playerCount + 'P M&A race −' + nirgalPenalty);
    }

    return { total: (synergyData ? synergyData.s : 0) + bonus, reasons: reasons };
  }

  function updateHandScores() {
    if (TM_CONTENT_HAND_SCORES && TM_CONTENT_HAND_SCORES.updateHandScores) {
      TM_CONTENT_HAND_SCORES.updateHandScores({
        enabled: enabled,
        windowObj: window,
        documentObj: document,
        selCards: '.card-container[data-tm-card]',
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getMyHandWithDrafted: getMyHandWithDrafted,
        getCachedPlayerContext: getCachedPlayerContext,
        enrichCtxForScoring: enrichCtxForScoring,
        detectGeneration: detectGeneration,
        invalidateStaleScores: invalidateStaleScores,
        resolveCorpName: resolveCorpName,
        knownCorps: _knownCorps,
        ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
        scoreCorpByVisibleCards: scoreCorpByVisibleCards,
        scoreCardAgainstCorps: scoreCardAgainstCorps,
        updateBadgeScore: updateBadgeScore,
        detectCardOwner: detectCardOwner,
        frozenScores: frozenScores,
        scoreFromOpponentPerspective: scoreFromOpponentPerspective,
        getPlayerVueData: getPlayerVueData,
        scoreDraftCard: scoreDraftCard,
        getSynergyIndicators: getSynergyIndicators,
        setReasonPayload: setReasonPayload,
        clearReasonPayload: clearReasonPayload,
        serializeReasonRowsPayload: serializeReasonRowsPayload
      });
      return;
    }
    if (!enabled) return;
    // Only score cards in-game (player page). Cards List page = no game context → base score only
    var isCardsListPage = /\/cards\b/.test(window.location.pathname);
    if (isCardsListPage) return;
    // Score ALL visible cards with badges — hand, draft, selection, any context
    var allCards = document.querySelectorAll('.card-container[data-tm-card]');
    if (allCards.length === 0) return;

    var myCorp = detectMyCorp();
    var myTableau = getMyTableauNames();
    var myHand = getMyHandWithDrafted(); // includes already-drafted cards this gen
    var ctx = getCachedPlayerContext();
    // Pre-cache allMyCards in ctx for scoreDraftCard
    enrichCtxForScoring(ctx, myTableau, myHand);

    // During initial draft (no corp): detect offered corps from visible cards
    var offeredCorps = [];
    var gen = detectGeneration();
    ctx._openingHand = false;

    // Reset frozen scores on new game + invalidate stale opponent scores
    invalidateStaleScores();

    if (!myCorp && gen <= 1) {
      allCards.forEach(function(el) {
        var cn = resolveCorpName(el.getAttribute('data-tm-card'));
        if (cn && _knownCorps.has(cn)) {
          offeredCorps.push(cn);
        }
      });
      ctx._openingHand = offeredCorps.length > 0;
    }

    // Collect other visible card names for inter-card synergy
    var visibleNames = [];
    allCards.forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && !_knownCorps.has(cn) && !_knownCorps.has(resolveCorpName(cn))) visibleNames.push(cn);
    });

    allCards.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      // Selection workflow cards are owned by updateDraftRecommendations().
      // Re-scoring them here causes visible triple transitions:
      // base rating -> draft/research-adjusted -> hand-score overwrite.
      if (el.closest('.wf-component--select-card') || el.closest('.wf-component--select-prelude')) return;
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var data = TM_RATINGS[name];
      if (!data) return;
      // Corp cards: score against visible project cards during initial draft
      var isCorp = _knownCorps.has(name) || _knownCorps.has(resolveCorpName(name));
      if (isCorp) {
        if (!myCorp && offeredCorps.length > 0 && visibleNames.length > 0) {
          var corpResult = scoreCorpByVisibleCards(resolveCorpName(name) || name, allCards, ctx);
          updateBadgeScore(badge, data.t, data.s, corpResult.total, '', undefined, true);
          setReasonPayload(el, corpResult);
        }
        return;
      }

      // Tableau cards (already played): freeze score in JS Map, survives DOM re-renders
      var isInTableau = !!el.closest('.player_home_block--cards, .player_home_block--tableau, .cards-wrapper');

      // Detect opponent card for tableau scoring
      var cardOpp = null;
      if (isInTableau) {
        cardOpp = detectCardOwner(name);
      }

      if (isInTableau) {
        // Use color-prefixed key for opponent cards to avoid collisions
        var frozenKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        var frozen = frozenScores.get(frozenKey);
        if (frozen) {
          // Restore from cache — don't re-score
          badge.innerHTML = frozen.html;
          badge.className = frozen.className;
          setReasonPayload(el, { reasons: frozen.reasons || '', reasonRows: frozen.reasonRows || '' });
          if (frozen.dimClass) el.classList.add('tm-dim'); else el.classList.remove('tm-dim');
          return;
        }
      }

      var result;
      if (cardOpp) {
        // Opponent tableau card: score from their perspective
        result = scoreFromOpponentPerspective(name, cardOpp, el, getPlayerVueData());
      } else if (!myCorp && offeredCorps.length > 0) {
        result = scoreCardAgainstCorps(name, el, myTableau, visibleNames, offeredCorps, myCorp, ctx);
      } else {
        result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      }

      var showContextDisplay = !cardOpp && !myCorp && offeredCorps.length > 0;
      var newTier = updateBadgeScore(badge, data.t, data.s, result.total, cardOpp ? ' tm-opp-badge' : '', result.uncappedTotal, showContextDisplay);

      // Synergy indicators — compact icons below the badge (skip opponent cards)
      var oldHint = el.querySelector('.tm-synergy-hint');
      if (oldHint) oldHint.remove();
      if (!cardOpp && ctx) {
        var myCorpsHint = ctx._myCorps || [];
        if (myCorpsHint.length === 0 && myCorp) myCorpsHint = [myCorp];
        var hints = getSynergyIndicators(name, el, ctx, myCorpsHint);
        if (hints.length > 0) {
          var hintEl = document.createElement('div');
          hintEl.className = 'tm-synergy-hint';
          hintEl.textContent = hints.join(' ');
          badge.parentNode.insertBefore(hintEl, badge.nextSibling);
        }
      }

      // Sync tm-dim with adjusted tier
      if (newTier === 'D' || newTier === 'F') {
        el.classList.add('tm-dim');
      } else {
        el.classList.remove('tm-dim');
      }

      setReasonPayload(el, result);

      // Freeze tableau card score in JS Map (survives DOM re-renders)
      if (isInTableau) {
        var fKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        frozenScores.set(fKey, {
          html: badge.innerHTML,
          className: badge.className,
          reasons: result.reasons.length > 0 ? result.reasons.join('|') : '',
          reasonRows: result.reasonRows && result.reasonRows.length > 0 ? serializeReasonRowsPayload(result.reasonRows) : '',
          dimClass: newTier === 'D' || newTier === 'F'
        });
      }
    });
  }

  function injectDiscardHints() {
    if (TM_CONTENT_HAND_UI && TM_CONTENT_HAND_UI.injectDiscardHints) {
      TM_CONTENT_HAND_UI.injectDiscardHints({
        enabled: enabled,
        getDiscardAdvice: getDiscardAdvice,
        documentObj: document,
        selHand: SEL_HAND
      });
      return;
    }
    if (!enabled) return;
    var advice = getDiscardAdvice();
    if (!advice || advice.length < 6) return;

    // Mark bottom 2-3 cards in hand with discard hint — only if score < C55
    var threshold = advice.length >= 8 ? 3 : 2;
    var discardSet = new Set();
    for (var i = Math.max(0, advice.length - threshold); i < advice.length; i++) {
      if (advice[i].keepScore !== undefined && advice[i].keepScore >= 55) continue; // don't mark C+ cards
      discardSet.add(advice[i].name);
    }

    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      // Remove old hints
      var oldHint = el.querySelector('.tm-discard-hint');
      if (oldHint) oldHint.remove();

      if (discardSet.has(name)) {
        var hint = document.createElement('div');
        hint.className = 'tm-discard-hint';
        hint.textContent = '📤 продать';
        hint.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:9px;color:#ff9800;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;z-index:5;pointer-events:none';
        el.style.position = 'relative';
        el.appendChild(hint);
      }
    });
  }


  // ── Last-gen sell indicators ──
  // In the last generation, unplayable cards should be sold for 1 MC each.
  // Marks hand cards with SELL badge when their last-gen EV < sell value (1 MC).

  function injectSellIndicators() {
    if (TM_CONTENT_RUNTIME_STATUS && TM_CONTENT_RUNTIME_STATUS.injectSellIndicators) {
      TM_CONTENT_RUNTIME_STATUS.injectSellIndicators({
        enabled: enabled,
        documentObj: document,
        getCachedPlayerContext: getCachedPlayerContext,
        getPlayerVueData: getPlayerVueData,
        selHand: SEL_HAND,
        getCardCost: getCardCost,
        getCachedCardTags: getCachedCardTags,
        getEffectiveCost: getEffectiveCost,
        computeCardValue: computeCardValue,
        contentOverlays: TM_CONTENT_OVERLAYS
      });
      return;
    }
    if (!enabled) return;
    var ctx = getCachedPlayerContext();
    if (!ctx || ctx.gensLeft > 1) {
      // Not last gen — remove any stale sell indicators
      document.querySelectorAll('.tm-sell-hint, .tm-sell-summary').forEach(function(el) { el.remove(); });
      return;
    }

    var pv = getPlayerVueData();
    var myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    var handEls = document.querySelectorAll(SEL_HAND);
    if (handEls.length === 0) return;

    // Global param state for computeCardValue opts
    var o2Maxed = ctx.globalParams && ctx.globalParams.oxy >= 14;
    var tempMaxed = ctx.globalParams && ctx.globalParams.temp >= 8;
    var cvOpts = { o2Maxed: o2Maxed, tempMaxed: tempMaxed };

    var sellCount = 0;
    var playCards = [];

    handEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      // Remove old sell hints
      var oldHint = el.querySelector('.tm-sell-hint');
      if (oldHint) oldHint.remove();
      if (!name) return;

      var fx = (typeof TM_CARD_EFFECTS !== 'undefined') ? TM_CARD_EFFECTS[name] : null;

      // Get card cost
      var cardCost = getCardCost(el);
      if (cardCost == null && fx && fx.c != null) cardCost = fx.c;

      // Apply discounts
      var effCost = cardCost || 0;
      if (ctx.discounts && cardCost != null) {
        var cardTags = getCachedCardTags(el);
        effCost = getEffectiveCost(cardCost, cardTags, ctx.discounts);
        // Steel/titanium payment — reduce effective cost
        if (cardTags.has('building') && ctx.steel > 0) {
          effCost = Math.max(0, effCost - ctx.steel * ctx.steelVal);
        } else if (cardTags.has('space') && ctx.titanium > 0) {
          effCost = Math.max(0, effCost - ctx.titanium * ctx.tiVal);
        }
      }

      // Can't afford at all → sell
      if (effCost > myMC) {
        sellCount++;
        _addSellBadge(el, 'нет MC');
        return;
      }

      // Compute last-gen value (gensLeft=0 means production is worthless)
      if (fx) {
        var playValue = computeCardValue(fx, 0, cvOpts);
        var netEV = playValue - effCost;

        if (netEV < 1) {
          // Card loses MC compared to selling for 1 MC
          sellCount++;
          _addSellBadge(el, netEV < -5 ? 'EV ' + Math.round(netEV) : null);
        } else {
          // Worth playing — mark as PLAY with MC gain
          playCards.push({ name: name, ev: Math.round(netEV) });
          _addPlayBadge(el, Math.round(netEV));
        }
      } else {
        // No effect data — use badge score as fallback
        var badge = el.querySelector('.tm-tier-badge');
        if (badge) {
          var scoreText = badge.textContent || '';
          var scoreMatch = scoreText.match(/(\d+\.?\d*)$/);
          var adjScore = scoreMatch ? parseFloat(scoreMatch[1]) : 50;
          // D/F tier in last gen → sell
          if (adjScore < 55) {
            sellCount++;
            _addSellBadge(el);
          }
        }
      }
    });

    // Summary banner
    var oldSummary = document.querySelector('.tm-sell-summary');
    if (oldSummary) oldSummary.remove();
    if (sellCount > 0) {
      var handBlock = document.querySelector('.player_home_block--hand');
      if (handBlock) {
        var summary = TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.createSellSummary
          ? TM_CONTENT_OVERLAYS.createSellSummary({ sellCount: sellCount })
          : null;
        if (!summary) {
          summary = document.createElement('div');
          summary.className = 'tm-sell-summary';
          summary.innerHTML = '\uD83D\uDCB0 Продать ' + sellCount + ' карт = ' + sellCount + ' MC';
          summary.style.cssText = 'color:#aaa;font-size:11px;text-align:center;padding:2px 0;background:rgba(0,0,0,0.3);border-radius:4px;margin:2px 8px';
        }
        handBlock.insertBefore(summary, handBlock.firstChild);
      }
    }
  }

  function _addSellBadge(el, detail) {
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.addSellBadge) {
      TM_CONTENT_OVERLAYS.addSellBadge({ el: el, detail: detail });
      return;
    }
    var hint = document.createElement('div');
    hint.className = 'tm-sell-hint';
    var text = 'SELL \uD83D\uDCB0 1MC';
    if (detail) text += ' (' + detail + ')';
    hint.textContent = text;
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#999;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #666';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  function _addPlayBadge(el, ev) {
    if (TM_CONTENT_OVERLAYS && TM_CONTENT_OVERLAYS.addPlayBadge) {
      TM_CONTENT_OVERLAYS.addPlayBadge({ el: el, ev: ev });
      return;
    }
    var hint = document.createElement('div');
    hint.className = 'tm-sell-hint'; // same class for cleanup
    hint.textContent = '\u25B6 PLAY +' + ev + ' MC';
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#4caf50;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #4caf50';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  // (updateActionReminder removed in v52 — dead code, no callers)

  // ── Generation Timer ──

  let genStartTime = Date.now();
  let gameStartTime = Date.now();
  let lastTrackedGen = 0;
  let genTimes = [];

  function updateGenTimer() {
    if (TM_CONTENT_GEN_TIMER && TM_CONTENT_GEN_TIMER.updateGenTimer) {
      TM_CONTENT_GEN_TIMER.updateGenTimer({
        detectGeneration: detectGeneration,
        canShowToast: canShowToast,
        getPlayerVueData: getPlayerVueData,
        showToast: showToast,
        resetToastKeys: resetToastKeys,
        estimateGensLeft: estimateGensLeft,
        tmBrain: (typeof TM_BRAIN !== 'undefined') ? TM_BRAIN : null,
        dateNow: Date.now
      });
      return;
    }
    const gen = detectGeneration();

    if (gen !== lastTrackedGen && gen > 0) {
      if (lastTrackedGen > 0) {
        genTimes.push({ gen: lastTrackedGen, duration: Date.now() - genStartTime });
      }
      // Gen summary toast (skip gen 1)
      if (lastTrackedGen > 0 && canShowToast('gen', gen)) {
        var pvGen = getPlayerVueData();
        if (pvGen && pvGen.thisPlayer) {
          var p = pvGen.thisPlayer;
          var tr = p.terraformRating || 0;
          var cards = p.playedCards ? p.playedCards.length : 0;
          var mc = p.megaCredits || 0;
          showToast('Gen ' + gen + ' | TR ' + tr + ' | ' + cards + ' карт | ' + mc + ' MC', 'gen');
        }
      }
      genStartTime = Date.now();
      lastTrackedGen = gen;
      resetToastKeys();

      // Opponent lead warning — use TM_BRAIN.vpLead if available for VP-based comparison
      var pvLead = getPlayerVueData();
      if (pvLead && pvLead.thisPlayer) {
        var leadInfo = null;
        if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.vpLead) {
          leadInfo = TM_BRAIN.vpLead({ game: pvLead.game, thisPlayer: pvLead.thisPlayer, players: (pvLead.game && pvLead.game.players) || [] });
        }
        if (leadInfo && !leadInfo.winning && leadInfo.margin > 5) {
          showToast(leadInfo.bestOppName + ' лидирует: VP ' + leadInfo.bestOppScore + ' (ты ' + leadInfo.myScore + ', −' + leadInfo.margin + ')', 'info');
        } else if (!leadInfo && pvLead.game && pvLead.game.players) {
          // Fallback: TR comparison
          var myTR = pvLead.thisPlayer.terraformRating || 0;
          var oppLeader = null, oppMaxTR = 0;
          for (var oli = 0; oli < pvLead.game.players.length; oli++) {
            var opl = pvLead.game.players[oli];
            if (opl.color === pvLead.thisPlayer.color) continue;
            var oplTR = opl.terraformRating || 0;
            if (oplTR > oppMaxTR) { oppMaxTR = oplTR; oppLeader = opl.name; }
          }
          if (oppLeader && oppMaxTR > myTR + 5) {
            showToast(oppLeader + ' лидирует: TR ' + oppMaxTR + ' (ты ' + myTR + ', −' + (oppMaxTR - myTR) + ')', 'info');
          }
        }
      }

      // Hand bloat warning
      var pvHand = pvLead || getPlayerVueData();
      if (pvHand && pvHand.thisPlayer) {
        var handSize = pvHand.thisPlayer.cardsInHandNbr || 0;
        var gl = estimateGensLeft(pvHand);
        if (handSize > gl * 4 + 2 && gl <= 3) {
          showToast(handSize + ' карт в руке, ~' + gl + ' ген(ов) — не успеешь сыграть все', 'info');
        }
      }

    }
  }


  const MAP_MILESTONES = {
    'Tharsis': ['Terraformer', 'Mayor', 'Gardener', 'Builder', 'Planner'],
    'Hellas':  ['Diversifier', 'Tactician', 'Polar Explorer', 'Energizer', 'Rim Settler'],
    'Elysium': ['Generalist', 'Specialist', 'Ecologist', 'Tycoon', 'Legend'],
  };

  function detectMap(game) {
    if (!game || !game.milestones) return '';
    const msNames = game.milestones.map(function(m) { return m.name; });
    for (const mapName in MAP_MILESTONES) {
      const expected = MAP_MILESTONES[mapName];
      if (expected.some(function(n) { return msNames.indexOf(n) >= 0; })) return mapName;
    }
    return '';
  }


  // ── Playable Card Highlight ──


  function getCardTags(cardEl) {
    const tags = new Set();
    cardEl.querySelectorAll('[class*="tag-"]').forEach((el) => {
      for (const cls of el.classList) {
        if (cls.startsWith('tag-') && cls !== 'tag-count') {
          tags.add(cls.replace('tag-', ''));
        }
      }
    });
    return tags;
  }

  function getCardCost(cardEl) {
    if (!cardEl || typeof cardEl.querySelector !== 'function') return null;
    const costEl = cardEl.querySelector('.card-number');
    if (costEl) {
      const num = parseInt(costEl.textContent);
      if (!isNaN(num)) return num;
    }
    return null;
  }

  function getEffectiveCost(cost, tags, discounts) {
    var d = discounts['_all'] || 0;
    tags.forEach(function(t) { d += discounts[t] || 0; });
    return Math.max(0, cost - d);
  }

  // ── Lightweight playable/unplayable highlight ──
  var _lastPlayableCheck = 0;

  function highlightPlayable() {
    if (TM_CONTENT_HAND_UI && TM_CONTENT_HAND_UI.highlightPlayable) {
      TM_CONTENT_HAND_UI.highlightPlayable({
        dateNow: Date.now,
        documentObj: document,
        getPlayerVueData: getPlayerVueData,
        defaultSteelVal: SC.defaultSteelVal,
        defaultTiVal: SC.defaultTiVal,
        getCachedPlayerContext: getCachedPlayerContext,
        getCardCost: getCardCost,
        getCardTags: getCardTags,
        getEffectiveCost: getEffectiveCost,
        cardGlobalReqs: (typeof TM_CARD_GLOBAL_REQS !== 'undefined') ? TM_CARD_GLOBAL_REQS : null,
        cardTagReqs: (typeof TM_CARD_TAG_REQS !== 'undefined') ? TM_CARD_TAG_REQS : null,
        getRequirementFlexSteps: getRequirementFlexSteps,
        detectMyCorps: detectMyCorps,
        evaluateBoardRequirements: evaluateBoardRequirements,
        getProductionFloorStatus: getProductionFloorStatus,
        selHand: SEL_HAND
      });
      return;
    }
    var now = Date.now();
    if (now - _lastPlayableCheck < 2000) return;
    _lastPlayableCheck = now;

    // Clear old classes
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach(function(el) {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    var p = pv.thisPlayer;
    var mc = p.megaCredits || 0;
    var steel = p.steel || 0, steelVal = p.steelValue || SC.defaultSteelVal;
    var ti = p.titanium || 0, tiVal = p.titaniumValue || SC.defaultTiVal;
    var heat = p.heat || 0;
    // Helion: heat as MC
    var isHelion = false;
    if (p.tableau) {
      for (var i = 0; i < p.tableau.length; i++) {
        if (((p.tableau[i].name || '') + '').toLowerCase() === 'helion') { isHelion = true; break; }
      }
    }
    var heatMC = isHelion ? heat : 0;

    // Discount-aware: apply corp/card discounts from cached context
    var ctx = getCachedPlayerContext();
    var discounts = (ctx && ctx.discounts) ? ctx.discounts : {};

    document.querySelectorAll(SEL_HAND).forEach(function(el) {
      var cost = getCardCost(el);
      if (cost == null) return;
      var tags = getCardTags(el);
      var effectiveCost = getEffectiveCost(cost, tags, discounts);
      var bp = mc + heatMC;
      if (tags.has('building')) bp += steel * steelVal;
      if (tags.has('space')) bp += ti * tiVal;
      // Check global requirements (unplayable even if affordable)
      var reqMet = true;
      var cardName = el.getAttribute('data-tm-card');
      if (cardName && typeof TM_CARD_GLOBAL_REQS !== 'undefined') {
        var greq = TM_CARD_GLOBAL_REQS[cardName];
        if (greq && pv.game) {
          var gp = { oxy: pv.game.oxygenLevel, temp: pv.game.temperature, oceans: pv.game.oceans, venus: pv.game.venusScaleLevel };
          var pm = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
          var reqFlex = getRequirementFlexSteps(cardName, detectMyCorps());
          for (var rk in pm) {
            if (greq[rk]) {
              var cv = gp[pm[rk]];
              if (cv == null) continue;
              var step = rk === 'temperature' ? 2 : (rk === 'venus' ? 2 : 1);
              var flexSteps = reqFlex.any + (rk === 'venus' ? reqFlex.venus : 0);
              var effectiveMax = greq[rk].max != null ? greq[rk].max + flexSteps * step : null;
              var effectiveMin = greq[rk].min != null ? greq[rk].min - flexSteps * step : null;
              if (effectiveMax != null && cv > effectiveMax) reqMet = false;
              if (effectiveMin != null && cv < effectiveMin) reqMet = false;
            }
          }
        }
      }
      // Check tag requirements
      if (reqMet && cardName && typeof TM_CARD_TAG_REQS !== 'undefined') {
        var treq = TM_CARD_TAG_REQS[cardName];
        if (treq) {
          var myTags = (ctx && ctx.tags) ? ctx.tags : {};
          for (var tk in treq) {
            if (typeof treq[tk] === 'object') continue;
            if ((myTags[tk] || 0) < treq[tk]) { reqMet = false; break; }
          }
        }
      }
      // Check board/state requirements (e.g. own city / colony / greenery counts)
      if (reqMet) {
        var reqNode = el.querySelector('.card-requirements, .card-requirement');
        var reqText = reqNode ? (reqNode.textContent || '').trim() : '';
        var boardReqs = evaluateBoardRequirements(reqText, ctx, pv);
        if (boardReqs && !boardReqs.metNow) reqMet = false;
      }
      if (reqMet && cardName) {
        var prodFloorStatus = getProductionFloorStatus(cardName, ctx);
        if (prodFloorStatus.unplayable) reqMet = false;
      }
      if (bp >= effectiveCost && reqMet) {
        el.classList.add('tm-playable');
      } else {
        el.classList.add('tm-unplayable');
      }
    });
  }

  // ── VP Breakdown (used by post-game insights, card stats) ──

  function computeVPBreakdown(player, pv) {
    if (!TM_CONTENT_VP_BREAKDOWN || !TM_CONTENT_VP_BREAKDOWN.computeVPBreakdown) {
      return { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };
    }
    return TM_CONTENT_VP_BREAKDOWN.computeVPBreakdown({
      player: player,
      pv: pv,
      isGreeneryTile: isGreeneryTile,
      isCityTile: isCityTile,
      getPlayerTagCount: getPlayerTagCount,
      cardN: cardN,
      lookupCardData: _lookupCardData,
      cardVp: typeof TM_CARD_VP !== 'undefined' ? TM_CARD_VP : null,
      getFx: getFx
    });
  }

  // ── Game End Stats ──

  // ── Dynamic Card Ratings — personal stats ──

  function loadCardStats(callback) {
    if (!TM_CONTENT_CARD_STATS || !TM_CONTENT_CARD_STATS.loadCardStats) return;
    TM_CONTENT_CARD_STATS.loadCardStats({
      callback: callback,
      safeStorage: safeStorage
    });
  }

  function saveCardStats(stats) {
    if (!TM_CONTENT_CARD_STATS || !TM_CONTENT_CARD_STATS.saveCardStats) return;
    TM_CONTENT_CARD_STATS.saveCardStats({
      stats: stats,
      safeStorage: safeStorage
    });
  }

  function recordGameStats() {
    if (!TM_CONTENT_CARD_STATS || !TM_CONTENT_CARD_STATS.recordGameStats) return;
    TM_CONTENT_CARD_STATS.recordGameStats({
      getPlayerVueData: getPlayerVueData,
      computeVPBreakdown: computeVPBreakdown,
      getFx: getFx,
      safeStorage: safeStorage,
      tmLog: tmLog
    });
  }

  let gameEndNotified = false;

  function generatePostGameInsights(pv) {
    if (!TM_CONTENT_POSTGAME || !TM_CONTENT_POSTGAME.generatePostGameInsights) return null;
    return TM_CONTENT_POSTGAME.generatePostGameInsights({
      pv: pv,
      detectGeneration: typeof detectGeneration === 'function' ? detectGeneration : null,
      computeVPBreakdown: computeVPBreakdown,
      estimateGensLeft: typeof estimateGensLeft === 'function' ? estimateGensLeft : null,
      detectMyCorp: typeof detectMyCorp === 'function' ? detectMyCorp : null,
      getPlayerTagCount: typeof getPlayerTagCount === 'function' ? getPlayerTagCount : null,
      cardN: typeof cardN === 'function' ? cardN : null,
      getFx: typeof getFx === 'function' ? getFx : null,
      lookupCardData: typeof _lookupCardData === 'function' ? _lookupCardData : null,
      draftIntel: TM_CONTENT_DRAFT_INTEL,
      draftHistory: getDraftHistoryState(),
      oppPredictedCards: getOppPredictedCardsState(),
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
      cardVp: typeof TM_CARD_VP !== 'undefined' ? TM_CARD_VP : null,
      corps: typeof TM_CORPS !== 'undefined' ? TM_CORPS : null,
      ruName: ruName
    });
  }

  function showPostGameInsights(pv) {
    if (!TM_CONTENT_POSTGAME || !TM_CONTENT_POSTGAME.showPostGameInsights) return null;
    return TM_CONTENT_POSTGAME.showPostGameInsights({
      pv: pv,
      documentObj: document,
      escHtml: escHtml,
      ruName: ruName,
      detectGeneration: typeof detectGeneration === 'function' ? detectGeneration : null,
      computeVPBreakdown: computeVPBreakdown,
      estimateGensLeft: typeof estimateGensLeft === 'function' ? estimateGensLeft : null,
      detectMyCorp: typeof detectMyCorp === 'function' ? detectMyCorp : null,
      getPlayerTagCount: typeof getPlayerTagCount === 'function' ? getPlayerTagCount : null,
      cardN: typeof cardN === 'function' ? cardN : null,
      getFx: typeof getFx === 'function' ? getFx : null,
      lookupCardData: typeof _lookupCardData === 'function' ? _lookupCardData : null,
      draftIntel: TM_CONTENT_DRAFT_INTEL,
      draftHistory: getDraftHistoryState(),
      oppPredictedCards: getOppPredictedCardsState(),
      ratings: typeof TM_RATINGS !== 'undefined' ? TM_RATINGS : null,
      cardEffects: typeof TM_CARD_EFFECTS !== 'undefined' ? TM_CARD_EFFECTS : null,
      cardVp: typeof TM_CARD_VP !== 'undefined' ? TM_CARD_VP : null,
      corps: typeof TM_CORPS !== 'undefined' ? TM_CORPS : null
    });
  }

  function checkGameEnd() {
    if (TM_CONTENT_RUNTIME_STATUS && TM_CONTENT_RUNTIME_STATUS.checkGameEnd) {
      var _localStorage = null;
      try { _localStorage = localStorage; } catch (e) {}
      TM_CONTENT_RUNTIME_STATUS.checkGameEnd({
        getPlayerVueData: getPlayerVueData,
        detectGeneration: detectGeneration,
        dateNow: Date.now,
        showToast: showToast,
        postgameHelpers: TM_CONTENT_POSTGAME,
        recordGameStats: recordGameStats,
        localStorageObj: _localStorage
      });
      return;
    }
    if (gameEndNotified) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;

    // Only trigger when game is truly over (phase === 'end'), not just parameters maxed
    if (pv.game.phase !== 'end') return;

    gameEndNotified = true;

    // Check if we already processed this game end (survives page reload)
    var gameId = (pv.game.id || pv.id || '').replace(/^[pg]/, '');
    var exportKey = 'tm_exported_' + gameId;
    var alreadyExported = false;
    try { alreadyExported = !!localStorage.getItem(exportKey); } catch(e) { /* localStorage may be disabled */ }

    // Skip everything if reopening a finished game — no toast, no overlay, no export
    if (alreadyExported) return;

    const gen = detectGeneration();
    const elapsed = Date.now() - gameStartTime;
    const p = pv.thisPlayer;
    const tr = p.terraformRating || 0;
    const cardsPlayed = p.tableau ? p.tableau.length : 0;
    const mins = Math.round(elapsed / 60000);
    showToast('Конец игры! Пок. ' + gen + ' | TR ' + tr + ' | ' + cardsPlayed + ' карт | ' + mins + ' мин', 'great');
    if (TM_CONTENT_POSTGAME && TM_CONTENT_POSTGAME.clearPostGameInsights) {
      TM_CONTENT_POSTGAME.clearPostGameInsights();
    }

    // Record card stats for Dynamic Ratings (Feature 6)
    setTimeout(function() { recordGameStats(); }, 5000);

    // Game logging removed — server handles it
    try { localStorage.setItem(exportKey, '1'); } catch(e) { /* localStorage may be disabled */ }
  }

  // ── VP Overlay — calculated VP for all players ──
  // Shows calculated VP badge next to every player's VP tag (even when visible).
  // TM DOM: .tag-vp is the VP icon, sibling <span> has the count ("?" or number).
  // Player containers have class "player_bg_color_<color>" on a parent element.

  function ensureVpCalcAnchor(vpTag) {
    if (TM_CONTENT_VP_OVERLAYS && TM_CONTENT_VP_OVERLAYS.ensureVpCalcAnchor) {
      TM_CONTENT_VP_OVERLAYS.ensureVpCalcAnchor({ vpTag: vpTag, windowObj: window });
      return;
    }
    if (!vpTag || !vpTag.style) return;
    var computedPosition = '';
    try {
      computedPosition = window.getComputedStyle(vpTag).position || '';
    } catch (e) {}
    if (!computedPosition || computedPosition === 'static') {
      vpTag.style.position = 'relative';
    }
    vpTag.style.overflow = 'visible';
  }

  function updateVPOverlays() {
    if (TM_CONTENT_VP_OVERLAYS && TM_CONTENT_VP_OVERLAYS.updateVPOverlays) {
      TM_CONTENT_VP_OVERLAYS.updateVPOverlays({
        getPlayerVueData: getPlayerVueData,
        computeVPBreakdown: computeVPBreakdown,
        documentObj: document,
        windowObj: window
      });
      return;
    }
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    if (!pv || !pv.players) return;

    // Build color → VP map
    var vpByColor = {};
    for (var pi = 0; pi < pv.players.length; pi++) {
      var p = pv.players[pi];
      if (!p.color) continue;
      var bp = computeVPBreakdown(p, pv);
      vpByColor[p.color] = bp;
    }

    // Find all VP tag elements: TM renders class="tag-count tag-vp tag-size-big tag-type-main"
    var vpTags = document.querySelectorAll('.tag-vp');

    for (var vi = 0; vi < vpTags.length; vi++) {
      var vpTag = vpTags[vi];
      // Walk up to find player color from ancestor class
      // TM uses player_bg_color_X or player_translucent_bg_color_X
      var ancestor = vpTag.closest('[class*="player_bg_color_"], [class*="player_translucent_bg_color_"]');
      if (!ancestor) {
        var el = vpTag;
        for (var up = 0; up < 15 && el; up++) {
          el = el.parentElement;
          if (el && el.className && /player_(?:translucent_)?bg_color_/.test(el.className)) { ancestor = el; break; }
        }
      }
      if (!ancestor) continue;

      // Extract color from class (both variants)
      var colorMatch = ancestor.className.match(/player_(?:translucent_)?bg_color_(\w+)/);
      if (!colorMatch) continue;
      var color = colorMatch[1];
      var bp = vpByColor[color];
      if (!bp || bp.total <= 0) continue;

      // Find the container of the VP tag (parent div that holds tag icon + count span)
      var tagContainer = vpTag.parentElement;
      if (!tagContainer) continue;

      // Check if badge already exists
      var existing = tagContainer.querySelector('.tm-vp-calc');
      if (existing) {
        ensureVpCalcAnchor(vpTag);
        if (existing.parentElement !== vpTag) vpTag.appendChild(existing);
        // Update value
        if (existing.textContent !== String(bp.total)) {
          existing.textContent = bp.total;
          existing.title = vpTooltip(bp);
        }
        continue;
      }

      // Inject calculated VP badge after the count span
      var badge = document.createElement('span');
      badge.className = 'tm-vp-calc';
      badge.textContent = bp.total;
      badge.title = vpTooltip(bp);
      badge.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;min-width:18px;text-align:center;background:rgba(90,74,30,0.96);color:#ffd700;font-weight:bold;font-size:10px;padding:0 3px;border-radius:10px;cursor:help;border:1px solid #8d6e2e;line-height:1.2;z-index:3;pointer-events:auto;';
      ensureVpCalcAnchor(vpTag);
      vpTag.appendChild(badge);
    }
  }

  function vpTooltip(bp) {
    if (TM_CONTENT_VP_OVERLAYS && TM_CONTENT_VP_OVERLAYS.vpTooltip) {
      return TM_CONTENT_VP_OVERLAYS.vpTooltip(bp);
    }
    var s = 'VP (calc): TR=' + bp.tr + ' | green=' + bp.greenery + ' | city=' + bp.city + ' | cards=' + bp.cards + ' | ms=' + bp.milestones + ' | aw=' + bp.awards;
    if (bp.escapeVelocity) s += ' | esc=' + bp.escapeVelocity;
    return s + ' | total=' + bp.total;
  }

  // ── Elo cleanup only — native client owns Elo UI ──

  function updateEloBadges() {
    if (TM_CONTENT_PLAYER_META && TM_CONTENT_PLAYER_META.updateEloBadges) {
      TM_CONTENT_PLAYER_META.updateEloBadges({ documentObj: document });
      return;
    }
    removeEloBadges();
  }

  function removeEloBadges() {
    if (TM_CONTENT_PLAYER_META && TM_CONTENT_PLAYER_META.removeEloBadges) {
      TM_CONTENT_PLAYER_META.removeEloBadges({ documentObj: document });
      return;
    }
    var badges = document.querySelectorAll('.tm-elo-badge');
    for (var i = 0; i < badges.length; i++) badges[i].remove();
    cleanupPlayerEloHosts();
    cleanupEmptyVpMetaLanes();
  }

  function cleanupEmptyVpMetaLanes() {
    if (TM_CONTENT_PLAYER_META && TM_CONTENT_PLAYER_META.cleanupEmptyVpMetaLanes) {
      TM_CONTENT_PLAYER_META.cleanupEmptyVpMetaLanes({ documentObj: document });
      return;
    }
    var lanes = document.querySelectorAll('.tm-vp-meta-lane');
    for (var i = 0; i < lanes.length; i++) {
      if (!lanes[i].children.length) lanes[i].remove();
    }
  }

  function cleanupPlayerEloHosts() {
    if (TM_CONTENT_PLAYER_META && TM_CONTENT_PLAYER_META.cleanupPlayerEloHosts) {
      TM_CONTENT_PLAYER_META.cleanupPlayerEloHosts({ documentObj: document });
      return;
    }
    var hosts = document.querySelectorAll('.tm-player-elo-host');
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

  // ── MutationObserver ──

  function debounce(fn, ms) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function isTmManagedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    var el = node;
    if (el.id && el.id.indexOf('tm-') === 0) return true;
    if (typeof el.className === 'string' && /(^|\s)tm-/.test(el.className)) return true;
    if (el.closest && el.closest('[id^="tm-"], [class*="tm-"]')) return true;
    return false;
  }

  function hasRelevantMutations(records) {
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (!isTmManagedNode(record.target)) return true;
      for (var j = 0; j < record.addedNodes.length; j++) {
        if (!isTmManagedNode(record.addedNodes[j])) return true;
      }
    }
    return false;
  }

  function getAudioContext() {
    if (_tmAudioCtx && _tmAudioCtx.state !== 'closed') return _tmAudioCtx;
    try {
      _tmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return _tmAudioCtx;
    } catch (e) {
      return null;
    }
  }

  const debouncedProcess = debounce(processAll, 350);
  const observer = new MutationObserver(function(records) {
    if (!_processingNow && _tabVisible && hasRelevantMutations(records)) debouncedProcess();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Extension no longer renders Elo badges in-game. Only clean up old injected nodes.
  removeEloBadges();

  // Generation timer: update every second
  setInterval(function() {
    if (!_tabVisible) return;
    if (enabled) {
      updateGenTimer();
      checkGameEnd();
      updateVPOverlays();
      removeEloBadges();
    }
  }, 1000);

  // Context-aware hand/draft scores: separate slow interval (not on every mutation)
  setInterval(function() {
    if (!_tabVisible) return;
    if (enabled && !_processingNow) {
      _processingNow = true;
      try {
        // Retry draft/research scoring if selection dialog is open
        if (document.querySelector('.wf-component--select-card .card-container')) {
          updateDraftRecommendations();
        }
        updateHandScores();
      } finally { _processingNow = false; }
    }
  }, 3000);

  processAll();

  // ── Opponent Draft Poller ──
  // Fetch other players' draft picks directly from /api/player
  (function() {
    if (TM_CONTENT_DRAFT_POLLER && TM_CONTENT_DRAFT_POLLER.startOpponentDraftPoller) {
      TM_CONTENT_DRAFT_POLLER.startOpponentDraftPoller({
        getPlayerVueData: typeof getPlayerVueData === 'function' ? getPlayerVueData : null,
        fetchFn: typeof fetch === 'function' ? fetch : null,
        localStorageObj: typeof localStorage !== 'undefined' ? localStorage : null,
        setTimeoutFn: typeof setTimeout === 'function' ? setTimeout : null
      });
      return;
    }

    var _oppDraftState = {};
    var _oppDraftInited = false;

    function resolveOppDraftGameId(pv) {
      var gameId = pv && pv.game ? (pv.game.id || '') : '';
      if (gameId) return gameId;
      if (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) {
        var parsedId = TM_UTILS.parseGameId() || '';
        if (/^g/i.test(parsedId)) return parsedId;
        if (/^[ps]/i.test(parsedId)) return parsedId.replace(/^[ps]/i, 'g');
      }
      var playerId = pv && pv.id ? pv.id : '';
      return playerId ? playerId.replace(/^p/i, 'g') : '';
    }

    function initOppDraftPoller() {
      if (_oppDraftInited) return;
      var pv0 = getPlayerVueData();
      if (!pv0 || !pv0.id) return;
      var myPlayerId = pv0.id;
      var gameId = resolveOppDraftGameId(pv0);
      if (!gameId) return;
      fetch('/api/game?id=' + gameId)
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (!data || !data.players) return;
          _oppDraftInited = true;
          data.players.forEach(function(p) {
            if (p.id === myPlayerId) return;
            _oppDraftState[p.id] = { name: p.name, color: p.color, prevDrafted: [], draftLog: [], draftRound: 0 };
          });
          pollOppDrafts();
        })
        .catch(function() {});
    }

    function pollOppDrafts() {
      var pids = Object.keys(_oppDraftState);
      if (pids.length === 0) return;
      var pv1 = getPlayerVueData();
      var phase = pv1 && pv1.game ? pv1.game.phase : '';
      // Only poll during draft/research phases
      if (phase !== 'initial_drafting' && phase !== 'drafting' && phase !== 'research') {
        setTimeout(pollOppDrafts, 10000);
        return;
      }
      Promise.all(pids.map(function(pid) {
        return fetch('/api/player?id=' + pid)
          .then(function(r) { return r.ok ? r.json() : null; })
          .catch(function() { return null; });
      })).then(function(results) {
        results.forEach(function(data, i) {
          if (!data) return;
          var pid = pids[i];
          var opp = _oppDraftState[pid];
          var curDrafted = (data.draftedCards || []).map(function(c) { return c.name; });
          // Detect new pick
          if (curDrafted.length > opp.prevDrafted.length) {
            var prevSet = new Set(opp.prevDrafted);
            curDrafted.forEach(function(cn) {
              if (!prevSet.has(cn)) {
                opp.draftRound++;
                opp.draftLog.push({ round: opp.draftRound, taken: cn });
              }
            });
          }
          opp.prevDrafted = curDrafted;
          if (!opp.corp && data.thisPlayer && data.thisPlayer.tableau && data.thisPlayer.tableau.length > 0) {
            opp.corp = data.thisPlayer.tableau[0].name || '';
          }
        });
        // Save to localStorage for draft tab
        var allDrafts = {};
        for (var pid2 in _oppDraftState) {
          var o2 = _oppDraftState[pid2];
          if (o2.draftLog.length > 0) {
            allDrafts[o2.color] = { name: o2.name, corp: o2.corp || '', draftLog: o2.draftLog };
          }
        }
        if (Object.keys(allDrafts).length > 0) {
          try { localStorage.setItem('tm_watcher_drafts', JSON.stringify(allDrafts)); } catch(e) {}
        }
        setTimeout(pollOppDrafts, 3000);
      });
    }

    // Start after 5 sec delay
    setTimeout(initOppDraftPoller, 5000);
  })();

})();

// ═══════════════════════════════════════════════════════════════════
// Game Creation Auto-Fill — сохраняет и восстанавливает настройки
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STORAGE_KEY = 'tm_create_game_settings';

  var safeStorage = TM_UTILS.safeStorage;

  // Auto-save when bridge signals game was created (fetch intercepted in MAIN world)
  var _lastCgEvent = '';
  function checkAutoSave() {
    var ev = document.body.getAttribute('data-tm-cg-event') || '';
    if (ev !== _lastCgEvent && ev.startsWith('autosaved:')) {
      _lastCgEvent = ev;
      var raw = document.body.getAttribute('data-tm-cg-settings');
      if (raw) {
        try {
          var settings = JSON.parse(raw);
          safeStorage(function(storage) {
            storage.local.set({ [STORAGE_KEY]: settings });
          });
        } catch(e) {}
      }
    }
    _lastCgEvent = ev;
  }

  var obs = new MutationObserver(function() {
    checkAutoSave();
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tm-cg-event'] });
})();
