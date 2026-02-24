#!/usr/bin/env node
/**
 * clean-y-synergies.js
 *
 * Удаляет из поля `y` в ratings.json.js:
 * 1. Имена корпораций (теперь через CORP_ABILITY_SYNERGY + CORP_BOOSTS)
 * 2. Имена карт из TAG_TRIGGERS (теперь через ctx.tagTriggers)
 * 3. Имена карт, чьи эффекты ловятся ctx автоматически (steel/ti payment, discounts)
 * 4. Описательные строки с corp-синергиями ("Earth tag cards", "city карты" и т.п.)
 *
 * Оставляет: card↔card синергии (Robotic Workforce + Strip Mine, Fish + Large Convoy, etc.)
 */

const fs = require('fs');
const path = require('path');

const ratingsPath = path.join(__dirname, '..', 'extension', 'data', 'ratings.json.js');
const raw = fs.readFileSync(ratingsPath, 'utf8');

// Parse: "const TM_RATINGS={...};"  → extract JSON part
const match = raw.match(/^const TM_RATINGS\s*=\s*/);
if (!match) { console.error('Cannot parse ratings.json.js'); process.exit(1); }
const jsonStr = raw.slice(match[0].length).replace(/;\s*$/, '');
const ratings = JSON.parse(jsonStr);

// ── All corp names to remove from y ──
const CORP_NAMES = new Set([
  'Arklight','Aphrodite','Aridor','Arcadian Communities','Astrodrill',
  'Cheung Shing MARS','CrediCor','Celestic','EcoLine','EcoTec',
  'Factorum','Helion','Interplanetary Cinematics','Inventrix',
  'Kuiper Cooperative','Lakefront Resorts','Manutech','Mining Guild',
  'Mons Insurance','Morning Star Inc.','Morning Star Inc','Nirgal Enterprises',
  'Palladin Shipping','Pharmacy Union','Philares','PhoboLog','Point Luna',
  'Polaris','Polyphemos','Poseidon','Pristar','Recyclon','Robinson Industries',
  'Sagitta Frontier Services','Saturn Systems','Septem Tribus','Splice',
  'Spire','Stormcraft Incorporated','Stormcraft','Teractor','Terralabs Research',
  'Terralabs','Tharsis Republic','Thorgate','Tycho Magnetics',
  'United Nations Mars Initiative','Utopia Invest','Valley Trust','Viron','Vitor',
  'Mars Direct','Gagarin Mobility','Energia','Crescent Research',
]);

// ── TAG_TRIGGERS card names (already scored via ctx.tagTriggers) ──
const TAG_TRIGGER_CARDS = new Set([
  'Olympus Conference','Mars University','Crescent Research','High-Tech Lab',
  'Research Coordination','Science Fund',
  'Point Luna','Luna Mining','Teractor','Earth Office','Lunar Exports',
  'Media Group','Interplanetary Cinematics','Media Archives',
  'Saturn Systems','Titan Floating Launch-Pad','Jovian Embassy',
  'Splice','Topsoil Contract',
  'Morning Star Inc','Dirigibles','Celestic','Stratospheric Birds',
  'Arklight','Decomposers','Meat Industry','Ecological Zone',
  'Viral Enhancers','Ecology Experts',
  'Recyclon','Mining Guild','PhilAres','United Planetary Alliance',
  'Immigrant Community','Tharsis Republic','Rover Construction',
  'Optimal Aerobraking','Warp Drive','Mass Converter','Space Station','Shuttles',
  'Thorgate',
  'Earth Catapult','Anti-Gravity Technology',
]);

// ── CARD_DISCOUNTS (already scored via ctx discount stacking) ──
const CARD_DISCOUNT_CARDS = new Set([
  'Earth Office','Mass Converter','Space Station','Research Outpost',
  'Cutting Edge Technology','Anti-Gravity Technology','Earth Catapult',
  'Quantum Extractor','Shuttles','Warp Drive','Sky Docks',
  'Mercurian Alliances','Dirigibles','Luna Conference','Media Archives',
  'Science Fund','Recruited Scientists',
]);

// ── Ctx-covered cards: cards whose effects are caught by ctx automatically ──
// (steel/ti payment, energy consumers, etc.)
const CTX_COVERED_CARDS = new Set([
  'Advanced Alloys',        // steel/ti value → ctx.steelVal/tiVal
  'Fuel Factory',           // energy consumer → ctx energy
  'Ore Processor',          // energy consumer + ti
  'Power Infrastructure',   // energy → MC → ctx
  'Steelworks',            // energy consumer + steel
  'Ironworks',             // energy consumer + steel
  'Power Plant',           // energy producer → ctx
]);

// ── Descriptive patterns that describe corp/tag synergies (not specific card↔card) ──
const DESC_PATTERNS = [
  // Tag-based descriptions
  /earth tag/i, /science tag/i, /building tag/i, /space tag/i,
  /power tag/i, /venus tag/i, /jovian tag/i, /microbe tag/i,
  /animal tag/i, /plant tag/i, /event tag/i, /city tag/i,
  /mars tag/i, /wild tag/i, /bio.tag/i, /multi.tag/i,
  /tag cards?/i, /тег карт/i, /Space-тег/i,

  // Generic "X cards" / "X-heavy" / "X strategy"
  /\bcards?\b/i,  // any entry containing "card" or "cards"
  /\bкарт[аыу]?\b/i,  // карты/карта/карту
  /-heavy\b/i, /heavy\b/i,
  /\bstrateg/i, /\bстратег/i,
  /\bengine\b/i, /\bmovement\b/i,

  // Cost descriptions
  /дорог/i, /дешёв/i, /cheap/i, /expensive/i, /Expensive/i,

  // Standard projects
  /SP Greenery/i, /SP City/i, /SP Ocean/i,
  /Standard project/i, /Standard Technologies/i,

  // Milestones & Awards
  /milestone/i, /award/i,
  /Mayor/i, /Gardener/i, /Builder\b/i, /Planner/i, /Landlord/i,
  /Banker\b/i, /Scientist\b/i, /Scientists\b/i, /Thermalist/i, /Miner\b/i,
  /Benefactor/i, /Celebrity/i, /Legend\b/i, /Ecologist\b/i,
  /Diversifier/i, /Tactician/i, /Rim Settler/i, /Energizer/i,
  /Venuphile/i,

  // Production / payment / economy descriptors
  /production\b/i, /прод[ау]?к?ц?/i,
  /steel payment/i, /titanium payment/i,

  // Colony/trade descriptors
  /colony/i, /колон/i, /trade/i, /торгов/i,

  // Game phase descriptors
  /\bgames?\b/i, /\bgen \d/i, /late.game/i, /early.game/i, /mid.game/i,
  /\bhands?\b/i, /\bpool\b/i,

  // Board / map / spots
  /\bmap\b/i, /\bspot/i, /\bboard\b/i,

  // Turmoil
  /Turmoil/i, /party/i, /партия/i, /delegate/i, /делегат/i,

  // VP descriptors
  /\bVP\b/i, /victory/i, /побед/i,

  // Other descriptors
  /любая/i, /любой/i, /любую/i,
  /\bany\b/i, /\bAll\b/i,
  /Non-event/i, /non-terraforming/i, /Zero-production/i,
  /Quick flip/i, /Big\b/i,
  /\bprelude/i, /прелюд/i,
  /\brequirement/i, /\breq\b/i,
  /\bspecific\b/i, /\bdiverse\b/i,
  /\bfocused\b/i,

  // Reds / terraforming descriptors
  /Reds\b/i, /terraforming/i, /Terraform/i,

  // Resource-type descriptors (not card names)
  /Floater support/i, /Floater cards/i,
  /Microbe card/i, /Animal card/i, /Plant card/i,
  /Venus strategy/i, /Venus requirement/i,
  /Ocean synergy/i, /ocean strategy/i,
  /Plant strategy/i, /Plant protection/i,
  /NRA strategy/i,
  /Heat production/i, /Energy production/i, /Steel production/i,
  /Titanium production/i, /MC production/i,
  /Science engine/i, /science engine/i,
  /Energy-consuming/i, /energy.consuming/i,
  /Steel and titanium/i,
  /Asteroid card/i, /Space card/i, /City card/i, /Event card/i,

  // Descriptive Russian
  /синерг/i, /подход/i, /вариант/i,
  /О₂/i, /O2/i,
];

// Combined remove set
const REMOVE_NAMES = new Set([...CORP_NAMES, ...TAG_TRIGGER_CARDS, ...CARD_DISCOUNT_CARDS, ...CTX_COVERED_CARDS]);

// Build set of all known card names from ratings
const ALL_CARD_NAMES = new Set(Object.keys(ratings));

function shouldRemove(synEntry) {
  // Check exact match with remove set (corps, tag triggers, discounts, ctx-covered)
  if (REMOVE_NAMES.has(synEntry)) return true;

  // If it's a known card name in ratings AND not a corp → keep it (card↔card synergy)
  if (ALL_CARD_NAMES.has(synEntry) && !CORP_NAMES.has(synEntry)) return false;

  // Check descriptive patterns (generic "X cards", "strategy", etc.)
  for (const pat of DESC_PATTERNS) {
    if (pat.test(synEntry)) return true;
  }

  // If it's NOT a known card name → probably a description → remove
  if (!ALL_CARD_NAMES.has(synEntry)) return true;

  return false;
}

// ── Process ──
let totalRemoved = 0;
let totalKept = 0;
let cardsModified = 0;
const removedLog = [];

for (const [cardName, data] of Object.entries(ratings)) {
  if (!data.y || !Array.isArray(data.y) || data.y.length === 0) continue;

  const original = data.y.slice();
  const cleaned = data.y.filter(syn => {
    if (shouldRemove(syn)) {
      totalRemoved++;
      return false;
    }
    totalKept++;
    return true;
  });

  if (cleaned.length !== original.length) {
    const removed = original.filter(s => !cleaned.includes(s));
    removedLog.push({ card: cardName, removed, kept: cleaned });
    cardsModified++;

    if (cleaned.length === 0) {
      data.y = ['None significant'];
    } else {
      data.y = cleaned;
    }
  }
}

// ── Write back ──
const output = 'const TM_RATINGS=' + JSON.stringify(ratings) + ';';
fs.writeFileSync(ratingsPath, output, 'utf8');

// ── Report ──
console.log('\n=== Y-SYNERGY CLEANUP REPORT ===');
console.log(`Cards modified: ${cardsModified}`);
console.log(`Entries removed: ${totalRemoved}`);
console.log(`Entries kept: ${totalKept}`);
console.log('');

// Show first 30 modifications
for (const entry of removedLog.slice(0, 30)) {
  console.log(`${entry.card}:`);
  console.log(`  REMOVED: ${entry.removed.join(', ')}`);
  console.log(`  KEPT:    ${entry.kept.length > 0 ? entry.kept.join(', ') : '(none → "None significant")'}`);
}
if (removedLog.length > 30) {
  console.log(`... and ${removedLog.length - 30} more`);
}

// Full log
const logPath = path.join(__dirname, 'y-cleanup-log.json');
fs.writeFileSync(logPath, JSON.stringify(removedLog, null, 2), 'utf8');
console.log(`\nFull log: ${logPath}`);
