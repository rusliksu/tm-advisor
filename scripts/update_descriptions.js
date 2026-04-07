#!/usr/bin/env node
// Обновление описаний (w, e, y) для карт с изменёнными рейтингами
const fs = require('fs');
const path = require('path');
const {
  resolveGeneratedExtensionPath,
  writeGeneratedExtensionFile,
} = require('./lib/generated-extension-data');

const RATINGS_FILE = resolveGeneratedExtensionPath('ratings.json.js');

let src = fs.readFileSync(RATINGS_FILE, 'utf8');
const data = (new Function(src.replace(/^(const|let)\s+/gm, 'var ') + '\nreturn TM_RATINGS;'))();

// ═══════════════════════════════════════════════════
// ПРЕЛЮДИИ — обновлённые описания
// ═══════════════════════════════════════════════════
const updates = {

  'Great Aquifer': {
    y: ["Lakefront Resorts", "Arctic Algae", "Ocean placement bonuses", "Kelp Farming"],
    w: "Лучший прелюд в игре по данным TFMStats (rank 1, WR 45.4%). 2 океана = 2 TR + placement bonuses + immediate board presence. Берём всегда.",
    e: "2 океана = 2 TR (14 MC) + placement bonuses (4-8 MC steel/ti/plants/cards) = ~20-24 MC immediate"
  },

  'Eccentric Sponsor': {
    y: ["Дорогие карты (20+ MC)", "Cutting Edge Tech", "Anti-Gravity Tech", "любая стратегия"],
    w: "TFMStats rank 6, высший Elo gain (+1.59). Бесплатная карта gen 1 = tempo advantage. Особенно силён с дорогими картами в руке.",
    e: "Бесплатная карта = экономия cost + 3 MC (draft). При карте за 20 MC = ~23 MC value gen 1"
  },

  'Supply Drop': {
    y: ["Building-карты", "Space-карты", "любая стратегия", "Phobolog"],
    w: "TFMStats rank 2, WR 45%. Triple production (3 ti + 8 steel + 3 plants) = гибкость и tempo gen 1. Один из самых надёжных прелюдов.",
    e: "3 ti (9 MC) + 8 steel (16 MC) + 3 plants (6 MC) = ~31 MC immediate resources"
  },

  'Huge Asteroid': {
    y: ["Heat strategy", "Helion", "Temperature rush"],
    w: "TFMStats rank 15, Elo -0.26. One-shot ресурсы без production = слабее чем кажется. 5 heat и 1 TR — нормально, но не A-тир. Берём когда temperature close к max и нужен финальный push.",
    e: "1 TR (7 MC) + 5 heat (~4 MC) + temperature raise = ~13-15 MC total value. Ниже среднего прелюда (24.5 MC)"
  },

  'Power Generation': {
    y: ["Thorgate", "Colonies (trading)", "Energy consumers"],
    w: "TFMStats rank 31/35, WR 27.7%. Energy production trap: без потребителя энергия = heat ≈ 4 MC. Берём ТОЛЬКО с Thorgate или если 2+ energy consumers в руке.",
    e: "3 energy-prod без consumer = 3 heat-prod = 12 MC. С consumer лучше, но зависимость делает прелюд ненадёжным"
  },

  'Ecology Experts': {
    y: ["Ecoline", "Plant production cards", "Greenery strategy"],
    w: "TFMStats rank 20, WR 33.2%. Условный эффект нестабилен — нужен plant production уже gen 1. Без Ecoline или plant-стратегии — посредственный.",
    e: "Условный: с plant engine = хороший, без = слабый. Средний outcome ниже 24.5 MC benchmark"
  },

  'Early Settlement': {
    y: ["Tharsis Republic", "Mayor milestone (Tharsis)"],
    w: "TFMStats rank 32, WR 27.7%. City без MC-prod gen 1 = VP sink. Только на Tharsis для Mayor milestone или Olympus Mons на Elysium.",
    e: "1 plant-prod (8 MC) + city tile (~5-8 MC) = ~13-16 MC. Значительно ниже среднего прелюда"
  },

  'Acquired Space Agency': {
    y: ["Phobolog", "Space-карты", "Saturn Systems", "Titan colony"],
    w: "TFMStats rank 14. Хороший но не top-tier. 1 ti-prod сильна, draw 2 карты из Space/Science — зависит от удачи. Берём с Space-стратегией.",
    e: "1 ti-prod (12 MC) + 2 карты (~6-8 MC filtered) = ~18-20 MC"
  },

  'Supplier': {
    y: ["Thorgate", "Energy consumers", "Colonies (trading)"],
    w: "TFMStats rank 21, WR 32.7%. Energy production bias — без consumer = heat. 2 energy + 4 steel хуже чем кажется.",
    e: "2 energy-prod без consumer = 2 heat-prod (8 MC) + 4 steel (8 MC) = ~16 MC"
  },

  'Mohole': {
    y: ["Helion", "Robotic Workforce"],
    w: "TFMStats rank 28, худший Elo (-1.55). 3 heat-prod = 12 MC при 4 MC/heat = значительно ниже среднего. Только Helion (heat=MC) или Robotic Workforce target.",
    e: "3 heat-prod = 12 MC (at 4 MC/heat-prod) + 3 heat (~2 MC) = ~14 MC. Один из худших прелюдов"
  },

  'Biofuels': {
    y: ["Plant production synergy", "Ecoline"],
    w: "TFMStats rank 33, WR 24.9%. Один из худших прелюдов. Почти никогда не берём.",
    e: "1 plant-prod (8 MC) + 2 plants (4 MC) = ~12 MC. Значительно ниже среднего"
  },

  // ═══════════════════════════════════════════════════
  // PROJECT CARDS — обновлённые описания
  // ═══════════════════════════════════════════════════

  'Open City': {
    y: ["Tharsis Republic", "Mayor milestone", "Landlord award", "steel payment", "Immigrant City"],
    w: "Лучшая city-карта в base game. COTD -18.5 (мы занижали) + 59% WR. 4 MC-prod + city tile + 1 VP за 23 MC (steel payable). Берём при любом board state.",
    e: "23 MC (steel!) → 4 MC-prod (20-24 MC) + city tile (placement bonus) + 1 VP. Один из лучших rate в игре"
  },

  'Fish': {
    y: ["Large Convoy", "Imported Nitrogen", "Animal placement", "Ants", "Miranda colony"],
    w: "COTD -18.5 + 59% WR. Animal VP engine недооценён. 1 VP/gen автоматически (не action!). С animal placers — ceiling 8+ VP.",
    e: "9 MC total → 3-5 VP самостоятельно (gen 5-7). С animal placement — ceiling гораздо выше"
  },

  'Ecology Research': {
    y: ["Science tag synergy", "VP strategy", "Animal/Plant engines", "Research"],
    w: "COTD -20.5 + 60% WR, avg VP 127 в логах. Скрытая VP бомба — Animal + Microbe + Plant placers стакаются. Science тег бонусом.",
    e: "Cheap VP accumulator. 2+ VP source types → compound growth. Science тег = 2-3 MC added value"
  },

  'Diversity Support': {
    y: ["Multi-tag strategies", "Diversifier milestone", "Multi-tag корпорации"],
    w: "COTD -24.5 + 64% WR. Условие (9 разных тегов) выполняется чаще чем кажется. 1 TR за 4 MC = отличный rate когда срабатывает.",
    e: "4 MC → 1 TR (7 MC) = +3 MC net. Условие реально в ~60% игр mid-late game"
  },

  'Hi-Tech Lab': {
    y: ["Science tag synergy", "Card draw strategy", "Crescent Research", "AI Central"],
    w: "COTD S/A tier. Card advantage engine. Science req легко выполним. Repeatable card advantage = king (как card draw, только filtering).",
    e: "Cheap blue card. Каждая активация = filtered card draw (~4 MC value). Break-even за 2-3 активации"
  },

  'Immigrant City': {
    y: ["Tharsis Republic", "Mayor milestone", "City synergies", "Landlord award"],
    w: "COTD -19.5. Cheap city tile = tempo. -1 MC-prod и -2 energy-prod компенсируются city bonuses и MC-prod from city. Лучше с Tharsis Republic.",
    e: "13 MC total → city tile (placement bonus + ~2 MC from city income). Минусы prod терпимы для cheap city"
  },

  'Corporate Stronghold': {
    y: ["Steel payment", "Building tag synergy", "Tharsis Republic", "Mayor milestone"],
    w: "COTD -17.5. Steel-payable city + 3 MC-prod - 1 energy-prod. Building тег ценен. -2 VP компенсируется MC-prod over gens.",
    e: "14 MC (steel!) → city + 3 MC-prod (15-18 MC) - 2 VP. Net positive к gen 3"
  },

  'Floating Refinery': {
    y: ["Venus strategy", "Morning Star Inc", "Dirigibles", "Stratospheric Birds"],
    w: "51% WR, N=69 в логах. Venus engine — медленный но стабильный. Floater generation + conversion. Не floater trap — дешёвый и не требует condition.",
    e: "Дешёвый Venus engine. Floater accumulation → resource conversion. Стабильный value в Venus strategies"
  },

  'Virus': {
    y: ["Cheap attack", "Microbe тег", "Splice synergy", "Predators"],
    w: "COTD 'very strong'. 4 MC total = лучший rate для attack. В 3P take-that penalty минимален при такой стоимости. Microbe тег бонусом.",
    e: "1 MC + 3 MC draft = 4 MC total. Swing: удалить 5 plants (5 MC) или 2 animals (>5 MC VP). ROI положительный всегда"
  },

  'Solar Reflectors': {
    y: ["Helion (единственная хорошая синергия)"],
    w: "10% WR (1/10) в логах. Energy production trap: 5 heat-prod за 23 MC без тегов = ~20 MC value за 26 MC cost. No-tag penalty сверху. Avoid.",
    e: "23+3 = 26 MC → 5 heat-prod (20 MC at 4 MC/heat) - no tag penalty (-3 to -5) = negative EV"
  },

  'Sponsoring Nation': {
    y: ["Earth tag synergies", "Turmoil", "delegate strategy"],
    w: "0% WR (0/5) в логах. Req 4 Earth tags слишком жёсткий — в ~80% игр не выполняется. 3 TR сильны, но условие убивает карту.",
    e: "3 TR (21 MC) + 2 delegates (~4 MC) за 10 MC = отличный rate, но req 4 Earth = фактический infeasible penalty"
  },

  'Static Harvesting': {
    y: ["Thorgate", "Energy consumers", "Building tag synergy"],
    w: "24% WR, N=37. Energy component тянет вниз. 1 energy-prod без consumer = heat. Building тег хорош, но не спасает от energy trap.",
    e: "27 MC → 3 MC-prod (15-18) + 1 energy-prod (7 MC или 4 MC без consumer). Breakeven поздний"
  },

  'Noctis City': {
    y: ["Tharsis Republic", "Mayor milestone"],
    w: "COTD ниже + 26% WR, N=47. Привязка к Noctis = плохой placement. -1 energy-prod больно. Берём только для Mayor milestone.",
    e: "31 MC → city (фиксированный spot, часто плохой) + 2 MC-prod (10-12 MC) - 1 energy-prod. Переоценённая city-карта"
  },

  'Robotic Workforce': {
    y: ["Strip Mine", "Building tag production cards", "Great Dam"],
    w: "28% WR, N=53 в логах. Дупликация production хуже чем кажется — нужен Building tag + хорошая production карта уже в tableau. Условный = нестабильный.",
    e: "Бесплатная копия prod = от 0 (нет target) до 20+ MC (Strip Mine). Средний outcome ниже ожиданий"
  },

  'Advertising': {
    y: ["Event-heavy strategies"],
    w: "23% WR, N=56. No-tag penalty в действии. 1 MC-prod за играемые event не окупается — events разовые, advertising нужен ongoing поток.",
    e: "Зависит от event потока. Без тегов теряет все синергии. Средний value ~2-3 MC-prod total = слабо для 8 MC"
  }
};

// Применяем
let applied = 0;
for (const [name, upd] of Object.entries(updates)) {
  if (!data[name]) {
    console.error('NOT FOUND:', name);
    continue;
  }
  if (upd.y) data[name].y = upd.y;
  if (upd.w) data[name].w = upd.w;
  if (upd.e) data[name].e = upd.e;
  console.log(`✓ ${name}: synergies=${(upd.y||[]).length}, w=${upd.w?'updated':'—'}, e=${upd.e?'updated':'—'}`);
  applied++;
}

const output = 'const TM_RATINGS = ' + JSON.stringify(data) + ';\n';
const out = writeGeneratedExtensionFile('ratings.json.js', output, 'utf8');
console.log(`\n✓ Updated descriptions for ${applied} cards`);
console.log(`Canonical: ${out.canonicalPath}`);
console.log(`Legacy mirror: ${out.legacyPath}`);
