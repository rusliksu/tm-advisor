// Canonical corporation names for TM Tier Overlay
// Key = canonical name (matches TM_RATINGS key and DOM data-tm-card attribute)
// a = aliases (alternative spellings that resolve to canonical)
const TM_CORPS = {
  'Aphrodite': {},
  'Arcadian Communities': {},
  'Aridor': {},
  'Arklight': {},
  'Astrodrill': {},
  'Celestic': {},
  'Cheung Shing MARS': {},
  'CrediCor': { a: ['Credicor'] },
  'EcoLine': { a: ['Ecoline'] },
  'EcoTec': {},
  'Factorum': {},
  'Gagarin Mobile Base': { a: ['Gagarin Mobility'] },
  'Helion': {},
  'Interplanetary Cinematics': {},
  'Inventrix': {},
  'Kuiper Cooperative': {},
  'Lakefront Resorts': { a: ['Lakefront'] },
  'Manutech': {},
  'Mars Direct': {},
  'Midas': {},
  'Mining Guild': {},
  'Mons Insurance': {},
  'Morning Star Inc.': { a: ['Morning Star Inc'] },
  'Nirgal Enterprises': {},
  'Palladin Shipping': {},
  'Pharmacy Union': {},
  'Philares': { a: ['PhilAres'] },
  'PhoboLog': { a: ['Phobolog'] },
  'Point Luna': {},
  'Polaris': {},
  'PolderTECH Dutch': {},
  'Polyphemos': {},
  'Poseidon': {},
  'Pristar': {},
  'Recyclon': {},
  'Robinson Industries': {},
  'Sagitta Frontier Services': {},
  'Saturn Systems': {},
  'Septem Tribus': {},
  'Splice': {},
  'Spire': {},
  'Stormcraft Incorporated': { a: ['Stormcraft'] },
  'Teractor': {},
  'Terralabs Research': { a: ['Terralabs'] },
  'Tharsis Republic': {},
  'Thorgate': {},
  'Tycho Magnetics': {},
  'United Nations Mars Initiative': { a: ['UNMI'] },
  'Utopia Invest': {},
  'Valley Trust': {},
  'Viron': {},
  'Vitor': {},
};

// Global alias map + resolver — available to all scripts loaded after this file
var _corpAliasMap = {};
(function() {
  for (var cn in TM_CORPS) {
    _corpAliasMap[cn.toLowerCase()] = cn;
    if (TM_CORPS[cn].a) {
      for (var i = 0; i < TM_CORPS[cn].a.length; i++) {
        _corpAliasMap[TM_CORPS[cn].a[i].toLowerCase()] = cn;
      }
    }
  }
})();
var resolveCorpName = TM_UTILS.resolveCorpName;
