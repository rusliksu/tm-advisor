#!/usr/bin/env node
/**
 * meta-analysis.js — Глубокий анализ мета-данных из fetched игр
 *
 * Сравнивает реальные winrates с тир-листом, находит оверперформеров и ловушки.
 *
 * Usage: node scripts/meta-analysis.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadJsonJs(relPath, varName) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return {};
  const raw = fs.readFileSync(full, 'utf8');
  const fn = new Function(raw.replace(/^const /, 'var ').replace(/^var /, 'var ') + `\nreturn ${varName};`);
  return fn();
}

const RATINGS = loadJsonJs('extension/data/ratings.json.js', 'TM_RATINGS');
const FX = loadJsonJs('extension/data/card_effects.json.js', 'TM_CARD_EFFECTS');

let ALL_CARDS = {};
const allCardsPath = path.join(ROOT, 'data', 'all_cards.json');
if (fs.existsSync(allCardsPath)) {
  const arr = JSON.parse(fs.readFileSync(allCardsPath, 'utf8'));
  for (const c of arr) ALL_CARDS[c.name] = c;
}

function getRating(name) {
  const r = RATINGS[name];
  return r ? { score: r.s, tier: r.t } : null;
}

function cardType(name) { return ALL_CARDS[name]?.type || null; }

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
};

function pad(s, n) { return String(s).padStart(n); }
function padR(s, n) { return String(s).padEnd(n); }

// ──────────────────────────────────────────────────
// Load all fetched games
// ──────────────────────────────────────────────────

function loadGames() {
  const logsDir = path.join(ROOT, 'data', 'game_logs');
  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('tm-fetch-') && f.endsWith('.json'))
    .map(f => path.join(logsDir, f));

  const games = [];

  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      const playerData = raw._combined ? raw.players : [raw];

      const players = [];
      for (const pd of playerData) {
        const me = pd.players.find(p => p.isMe);
        const myColor = pd.myColor;
        const lastGenKey = Object.keys(pd.generations || {}).map(Number).sort((a, b) => b - a)[0];
        const snap = pd.generations?.[lastGenKey]?.snapshot;
        const mySnap = snap?.players?.[myColor];

        // Final scores
        const allFinal = pd.finalScores || {};
        const myFinal = allFinal[myColor];

        // VP breakdown
        const vpBreakdown = myFinal || {};

        players.push({
          name: me?.name || '?',
          color: myColor,
          corp: me?.corp || pd.myCorp || '',
          tableau: mySnap?.tableau || [],
          vp: vpBreakdown.total || 0,
          tr: vpBreakdown.tr || 0,
          greenery: vpBreakdown.greenery || 0,
          city: vpBreakdown.city || 0,
          cards: vpBreakdown.cards || 0,
          milestones: vpBreakdown.milestones || 0,
          awards: vpBreakdown.awards || 0,
          mcProd: mySnap?.mcProd || 0,
          steelProd: mySnap?.steelProd || 0,
          tiProd: mySnap?.tiProd || 0,
          plantProd: mySnap?.plantProd || 0,
          energyProd: mySnap?.energyProd || 0,
          heatProd: mySnap?.heatProd || 0,
          tableauSize: (mySnap?.tableau || []).length,
        });
      }

      // Determine places
      const sorted = [...players].sort((a, b) => b.vp - a.vp);
      sorted.forEach((p, i) => { p.place = i + 1; });
      // Apply places back
      for (const p of players) {
        const sp = sorted.find(s => s.color === p.color);
        p.place = sp ? sp.place : 0;
      }

      games.push({
        gameId: raw.gameId,
        map: raw.map || playerData[0]?.map || '?',
        endGen: raw.endGen || playerData[0]?.endGen || 0,
        playerCount: players.length,
        players,
      });
    } catch (e) {
      // skip
    }
  }

  return games;
}

// ──────────────────────────────────────────────────
// Analysis functions
// ──────────────────────────────────────────────────

function analyzeCorpVsTierlist(games) {
  const corpData = {};

  for (const g of games) {
    for (const p of g.players) {
      if (!p.corp) continue;
      if (!corpData[p.corp]) corpData[p.corp] = { games: 0, wins: 0, totalVP: 0, vpList: [], places: [] };
      corpData[p.corp].games++;
      corpData[p.corp].totalVP += p.vp;
      corpData[p.corp].vpList.push(p.vp);
      corpData[p.corp].places.push(p.place);
      if (p.place === 1) corpData[p.corp].wins++;
    }
  }

  const corps = Object.entries(corpData)
    .map(([name, d]) => {
      const r = getRating(name);
      return {
        name,
        games: d.games,
        wins: d.wins,
        wr: d.games > 0 ? d.wins / d.games : 0,
        avgVP: d.games > 0 ? Math.round(d.totalVP / d.games) : 0,
        avgPlace: d.games > 0 ? (d.places.reduce((a, b) => a + b, 0) / d.places.length).toFixed(1) : '?',
        tierScore: r?.score || 0,
        tier: r?.tier || '?',
        vpList: d.vpList,
      };
    })
    .sort((a, b) => b.games - a.games);

  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  Corp vs Tier List — ${corps.length} корпораций из ${games.length} игр${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  console.log(`  ${C.dim}${padR('Корпорация', 26)} │ Игр │  WR% │ AvgVP │ AvgPl │ Tier │ Score │ Δ${C.reset}`);
  console.log(`  ${'─'.repeat(75)}`);

  // Expected WR based on player count (mostly 3p = 33%, some 2p = 50%)
  const avgExpectedWR = 0.35; // weighted average

  for (const c of corps) {
    const wrColor = c.wr >= 0.5 ? C.green : c.wr >= 0.3 ? C.yellow : C.red;
    const wrPct = Math.round(c.wr * 100);

    // Delta: actual performance vs tier expectation
    // Higher tier should win more. Normalize: S=90+ expect 50%+, D=35-54 expect <20%
    const expectedWR = c.tierScore > 0 ? 0.15 + (c.tierScore / 100) * 0.45 : avgExpectedWR;
    const delta = c.wr - expectedWR;
    const deltaStr = delta > 0.15 ? `${C.green}▲▲${C.reset}` :
                     delta > 0.05 ? `${C.green}▲${C.reset}` :
                     delta < -0.15 ? `${C.red}▼▼${C.reset}` :
                     delta < -0.05 ? `${C.red}▼${C.reset}` : `${C.gray}─${C.reset}`;

    console.log(`  ${padR(c.name.slice(0, 26), 26)} │ ${pad(c.games, 3)} │ ${wrColor}${pad(wrPct, 3)}%${C.reset} │ ${pad(c.avgVP, 5)} │ ${pad(c.avgPlace, 5)} │ ${pad(c.tier, 4)} │ ${pad(c.tierScore, 5)} │ ${deltaStr}`);
  }
  console.log('');

  // Overperformers & Underperformers
  const withEnoughGames = corps.filter(c => c.games >= 2);

  const overperformers = withEnoughGames
    .filter(c => c.tierScore <= 70 && c.wr >= 0.5)
    .sort((a, b) => b.wr - a.wr);

  const underperformers = withEnoughGames
    .filter(c => c.tierScore >= 75 && c.wr === 0)
    .sort((a, b) => b.tierScore - a.tierScore);

  if (overperformers.length > 0) {
    console.log(`  ${C.green}${C.bold}Оверперформеры${C.reset} ${C.dim}(low tier, high WR):${C.reset}`);
    for (const c of overperformers) {
      console.log(`    ${C.green}▲${C.reset} ${c.name} — ${c.tier}${c.tierScore}, но WR ${Math.round(c.wr * 100)}% (${c.wins}/${c.games}), avg ${c.avgVP} VP`);
    }
    console.log('');
  }

  if (underperformers.length > 0) {
    console.log(`  ${C.red}${C.bold}Андерперформеры${C.reset} ${C.dim}(high tier, 0 wins):${C.reset}`);
    for (const c of underperformers) {
      console.log(`    ${C.red}▼${C.reset} ${c.name} — ${c.tier}${c.tierScore}, но 0 побед из ${c.games}, avg ${c.avgVP} VP`);
    }
    console.log('');
  }

  return corps;
}

function analyzeCardWinrates(games) {
  const cardData = {};

  for (const g of games) {
    for (const p of g.players) {
      for (const card of p.tableau) {
        const t = cardType(card);
        if (t === 'corporation' || t === 'prelude') continue;

        if (!cardData[card]) cardData[card] = { count: 0, wins: 0, totalVP: 0, places: [] };
        cardData[card].count++;
        cardData[card].totalVP += p.vp;
        cardData[card].places.push(p.place);
        if (p.place === 1) cardData[card].wins++;
      }
    }
  }

  const cards = Object.entries(cardData)
    .map(([name, d]) => {
      const r = getRating(name);
      return {
        name,
        count: d.count,
        wins: d.wins,
        wr: d.count > 0 ? d.wins / d.count : 0,
        avgVP: d.count > 0 ? Math.round(d.totalVP / d.count) : 0,
        avgPlace: d.count > 0 ? (d.places.reduce((a, b) => a + b, 0) / d.places.length).toFixed(1) : '?',
        tierScore: r?.score || 0,
        tier: r?.tier || '?',
      };
    });

  // Filter to cards with enough games
  const frequent = cards.filter(c => c.count >= 4);

  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  Card Performance — ${cards.length} уникальных карт${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  // Top win rate cards (min 4 games)
  const topWR = [...frequent].sort((a, b) => b.wr - a.wr).slice(0, 15);
  console.log(`  ${C.bold}${C.green}Лучший WR% (4+ игр):${C.reset}`);
  console.log(`  ${C.dim}${padR('Карта', 30)} │ Раз │  WR% │ AvgVP │ Tier │ Score${C.reset}`);
  console.log(`  ${'─'.repeat(65)}`);
  for (const c of topWR) {
    const wrColor = c.wr >= 0.6 ? C.green : c.wr >= 0.4 ? C.yellow : C.gray;
    console.log(`  ${padR(c.name.slice(0, 30), 30)} │ ${pad(c.count, 3)} │ ${wrColor}${pad(Math.round(c.wr * 100), 3)}%${C.reset} │ ${pad(c.avgVP, 5)} │ ${pad(c.tier, 4)} │ ${pad(c.tierScore, 5)}`);
  }
  console.log('');

  // Worst win rate (min 4 games)
  const worstWR = [...frequent].sort((a, b) => a.wr - b.wr).slice(0, 10);
  console.log(`  ${C.bold}${C.red}Худший WR% (4+ игр):${C.reset}`);
  console.log(`  ${C.dim}${padR('Карта', 30)} │ Раз │  WR% │ AvgVP │ Tier │ Score${C.reset}`);
  console.log(`  ${'─'.repeat(65)}`);
  for (const c of worstWR) {
    const wrColor = c.wr >= 0.4 ? C.yellow : c.wr > 0 ? C.red : C.gray;
    console.log(`  ${padR(c.name.slice(0, 30), 30)} │ ${pad(c.count, 3)} │ ${wrColor}${pad(Math.round(c.wr * 100), 3)}%${C.reset} │ ${pad(c.avgVP, 5)} │ ${pad(c.tier, 4)} │ ${pad(c.tierScore, 5)}`);
  }
  console.log('');

  // Overperformers: low tier + high WR
  const cardOver = frequent
    .filter(c => c.tierScore <= 60 && c.wr >= 0.5)
    .sort((a, b) => b.wr - a.wr);

  if (cardOver.length > 0) {
    console.log(`  ${C.green}${C.bold}Карты-оверперформеры${C.reset} ${C.dim}(tier D/C-low, WR 50%+):${C.reset}`);
    for (const c of cardOver.slice(0, 10)) {
      console.log(`    ${C.green}▲${C.reset} ${c.name} — ${c.tier}${c.tierScore}, но WR ${Math.round(c.wr * 100)}% (${c.wins}/${c.count})`);
    }
    console.log('');
  }

  // Underperformers: high tier + low WR
  const cardUnder = frequent
    .filter(c => c.tierScore >= 75 && c.wr <= 0.25)
    .sort((a, b) => a.wr - b.wr);

  if (cardUnder.length > 0) {
    console.log(`  ${C.red}${C.bold}Карты-ловушки${C.reset} ${C.dim}(tier B+, WR ≤25%):${C.reset}`);
    for (const c of cardUnder.slice(0, 10)) {
      console.log(`    ${C.red}▼${C.reset} ${c.name} — ${c.tier}${c.tierScore}, но WR ${Math.round(c.wr * 100)}% (${c.wins}/${c.count})`);
    }
    console.log('');
  }

  return cards;
}

function analyzeVPBreakdown(games) {
  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  VP Breakdown — что приносит победу?${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  const winners = [];
  const losers = [];

  for (const g of games) {
    for (const p of g.players) {
      if (p.vp === 0) continue;
      if (p.place === 1) winners.push(p);
      else losers.push(p);
    }
  }

  const avg = (arr, key) => arr.length > 0 ? Math.round(arr.reduce((s, p) => s + (p[key] || 0), 0) / arr.length) : 0;

  const metrics = ['vp', 'tr', 'greenery', 'city', 'cards', 'milestones', 'awards', 'mcProd', 'tableauSize'];
  const labels = {
    vp: 'Total VP', tr: 'TR VP', greenery: 'Greenery VP', city: 'City VP',
    cards: 'Cards VP', milestones: 'Milestones VP', awards: 'Awards VP',
    mcProd: 'MC Production', tableauSize: 'Tableau Size',
  };

  console.log(`  ${C.dim}${padR('Метрика', 18)} │ ${pad('Победители', 10)} │ ${pad('Проигравшие', 11)} │ ${pad('Δ', 5)} │ Вывод${C.reset}`);
  console.log(`  ${'─'.repeat(70)}`);

  for (const m of metrics) {
    const wAvg = avg(winners, m);
    const lAvg = avg(losers, m);
    const delta = wAvg - lAvg;
    const deltaColor = delta > 0 ? C.green : delta < 0 ? C.red : C.gray;
    const deltaSign = delta > 0 ? '+' : '';

    let insight = '';
    if (m === 'tr') insight = delta >= 10 ? 'TR — ключевой фактор' : '';
    if (m === 'greenery') insight = delta >= 5 ? 'Растительность решает' : '';
    if (m === 'awards') insight = delta >= 3 ? 'Эвордс важны' : '';
    if (m === 'milestones') insight = delta >= 3 ? 'Майлстоуны важны' : '';
    if (m === 'mcProd') insight = delta >= 5 ? 'Экономика решает' : '';
    if (m === 'tableauSize') insight = delta >= 3 ? 'Больше карт = лучше' : '';

    console.log(`  ${padR(labels[m], 18)} │ ${pad(wAvg, 10)} │ ${pad(lAvg, 11)} │ ${deltaColor}${pad(deltaSign + delta, 5)}${C.reset} │ ${insight}`);
  }
  console.log('');

  // Production correlation with winning
  console.log(`  ${C.bold}Финальный production (победители vs проигравшие):${C.reset}`);
  const prodMetrics = ['mcProd', 'steelProd', 'tiProd', 'plantProd', 'energyProd', 'heatProd'];
  const prodLabels = { mcProd: 'MC', steelProd: 'Steel', tiProd: 'Titanium', plantProd: 'Plant', energyProd: 'Energy', heatProd: 'Heat' };

  for (const m of prodMetrics) {
    const wAvg = (winners.reduce((s, p) => s + (p[m] || 0), 0) / winners.length).toFixed(1);
    const lAvg = (losers.reduce((s, p) => s + (p[m] || 0), 0) / losers.length).toFixed(1);
    console.log(`    ${padR(prodLabels[m], 10)}: winners ${C.green}${wAvg}${C.reset} vs losers ${C.red}${lAvg}${C.reset}`);
  }
  console.log('');
}

function analyzeMapMeta(games) {
  const mapData = {};

  for (const g of games) {
    const m = g.map;
    if (!mapData[m]) mapData[m] = { games: 0, avgGen: [], avgVP: [], corps: {}, topCards: {} };
    mapData[m].games++;
    mapData[m].avgGen.push(g.endGen);

    for (const p of g.players) {
      mapData[m].avgVP.push(p.vp);
      if (p.corp && p.place === 1) {
        mapData[m].corps[p.corp] = (mapData[m].corps[p.corp] || 0) + 1;
      }
      if (p.place === 1) {
        for (const card of p.tableau) {
          if (cardType(card) === 'corporation' || cardType(card) === 'prelude') continue;
          mapData[m].topCards[card] = (mapData[m].topCards[card] || 0) + 1;
        }
      }
    }
  }

  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  Map Meta — по картам${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  for (const [mapName, d] of Object.entries(mapData).sort((a, b) => b[1].games - a[1].games)) {
    if (d.games < 2) continue;

    console.log(`  ${C.bold}${C.cyan}${mapName}${C.reset} (${d.games} игр) — avg ${avg(d.avgGen).toFixed(1)} gen, avg ${Math.round(avg(d.avgVP))} VP`);

    // Winning corps
    const topCorps = Object.entries(d.corps).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topCorps.length > 0) {
      console.log(`    Побеждали: ${topCorps.map(([c, n]) => `${c} (${n}×)`).join(', ')}`);
    }

    // Top cards in winning tableaux
    const topCards = Object.entries(d.topCards).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topCards.length > 0) {
      const cardStr = topCards.map(([c, n]) => {
        const r = getRating(c);
        return `${c}${r ? ` (${r.tier}${r.score})` : ''} ${n}×`;
      });
      console.log(`    Топ карты победителей: ${cardStr.join(', ')}`);
    }
    console.log('');
  }
}

function analyzeVPSpread(games) {
  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  Конкурентность — разрывы в VP${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  const spreads = [];

  for (const g of games) {
    const sorted = [...g.players].sort((a, b) => b.vp - a.vp);
    if (sorted.length < 2) continue;

    const gap12 = sorted[0].vp - sorted[1].vp;
    const gap13 = sorted.length >= 3 ? sorted[0].vp - sorted[2].vp : null;

    spreads.push({
      gameId: g.gameId,
      map: g.map,
      gen: g.endGen,
      winner: sorted[0].name,
      winnerCorp: sorted[0].corp,
      winnerVP: sorted[0].vp,
      gap12,
      gap13,
      close: gap12 <= 5,
      blowout: gap12 >= 30,
    });
  }

  const closeGames = spreads.filter(s => s.close);
  const blowouts = spreads.filter(s => s.blowout);
  const avgGap = spreads.length > 0 ? Math.round(spreads.reduce((s, g) => s + g.gap12, 0) / spreads.length) : 0;

  console.log(`  Средний разрыв 1-2: ${C.bold}${avgGap} VP${C.reset}`);
  console.log(`  Близкие игры (≤5 VP): ${closeGames.length}/${spreads.length}`);
  console.log(`  Разгромы (30+ VP): ${blowouts.length}/${spreads.length}`);
  console.log('');

  if (closeGames.length > 0) {
    console.log(`  ${C.yellow}Близкие:${C.reset}`);
    for (const g of closeGames) {
      console.log(`    ${g.gameId.slice(0, 14)} — ${g.winner}/${g.winnerCorp.slice(0, 10)} ${g.winnerVP} VP, разрыв ${g.gap12} VP (${g.map})`);
    }
    console.log('');
  }

  if (blowouts.length > 0) {
    console.log(`  ${C.red}Разгромы:${C.reset}`);
    for (const g of blowouts) {
      console.log(`    ${g.gameId.slice(0, 14)} — ${g.winner}/${g.winnerCorp.slice(0, 10)} ${g.winnerVP} VP, разрыв ${g.gap12} VP (${g.map})`);
    }
    console.log('');
  }
}

function analyzeCorrelations(games) {
  console.log(`${C.bold}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  Корреляции — что коррелирует с победой?${C.reset}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log('');

  // Average tier of played cards → does higher tier tableau = more wins?
  const playerTierData = [];

  for (const g of games) {
    for (const p of g.players) {
      const scores = p.tableau
        .filter(c => cardType(c) !== 'corporation' && cardType(c) !== 'prelude')
        .map(c => getRating(c)?.score || 0)
        .filter(s => s > 0);

      if (scores.length === 0) continue;

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const highTier = scores.filter(s => s >= 75).length;
      const lowTier = scores.filter(s => s < 55).length;

      playerTierData.push({
        name: p.name,
        place: p.place,
        vp: p.vp,
        avgCardScore: Math.round(avgScore),
        highTierCount: highTier,
        lowTierCount: lowTier,
        tableauSize: scores.length,
        won: p.place === 1,
      });
    }
  }

  const winners = playerTierData.filter(p => p.won);
  const losers = playerTierData.filter(p => !p.won);
  const avg = (arr, key) => arr.length > 0 ? (arr.reduce((s, p) => s + p[key], 0) / arr.length).toFixed(1) : '?';

  console.log(`  ${C.bold}Средний score карт в tableau:${C.reset}`);
  console.log(`    Победители: ${C.green}${avg(winners, 'avgCardScore')}${C.reset} | Проигравшие: ${C.red}${avg(losers, 'avgCardScore')}${C.reset}`);
  console.log('');

  console.log(`  ${C.bold}Количество карт tier B+ (score 75+):${C.reset}`);
  console.log(`    Победители: ${C.green}${avg(winners, 'highTierCount')}${C.reset} | Проигравшие: ${C.red}${avg(losers, 'highTierCount')}${C.reset}`);
  console.log('');

  console.log(`  ${C.bold}Количество карт tier D/F (score <55):${C.reset}`);
  console.log(`    Победители: ${C.green}${avg(winners, 'lowTierCount')}${C.reset} | Проигравшие: ${C.red}${avg(losers, 'lowTierCount')}${C.reset}`);
  console.log('');

  console.log(`  ${C.bold}Размер tableau (без корп/прелюд):${C.reset}`);
  console.log(`    Победители: ${C.green}${avg(winners, 'tableauSize')}${C.reset} | Проигравшие: ${C.red}${avg(losers, 'tableauSize')}${C.reset}`);
  console.log('');

  // Tag analysis — which tags correlate with winning?
  const tagData = {};

  for (const g of games) {
    for (const p of g.players) {
      for (const card of p.tableau) {
        const c = ALL_CARDS[card];
        if (!c || !c.tags) continue;
        for (const tag of (Array.isArray(c.tags) ? c.tags : [c.tags])) {
          if (!tagData[tag]) tagData[tag] = { total: 0, wins: 0 };
          tagData[tag].total++;
          if (p.place === 1) tagData[tag].wins++;
        }
      }
    }
  }

  const tags = Object.entries(tagData)
    .filter(([_, d]) => d.total >= 10)
    .map(([tag, d]) => ({ tag, count: d.total, wins: d.wins, wr: d.wins / d.total }))
    .sort((a, b) => b.wr - a.wr);

  if (tags.length > 0) {
    console.log(`  ${C.bold}Теги и WR (10+ карт):${C.reset}`);
    console.log(`  ${C.dim}${padR('Тег', 14)} │ ${pad('Карт', 4)} │ ${pad('WR%', 4)}${C.reset}`);
    console.log(`  ${'─'.repeat(28)}`);
    for (const t of tags) {
      const wrColor = t.wr >= 0.45 ? C.green : t.wr >= 0.35 ? C.yellow : C.red;
      console.log(`  ${padR(t.tag, 14)} │ ${pad(t.count, 4)} │ ${wrColor}${pad(Math.round(t.wr * 100), 3)}%${C.reset}`);
    }
    console.log('');
  }
}

// ──────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────

function main() {
  const games = loadGames();
  console.log(`${C.dim}Загружено ${games.length} игр, ${games.reduce((s, g) => s + g.players.length, 0)} игроков${C.reset}`);
  console.log(`${C.dim}Ratings: ${Object.keys(RATINGS).length} | All Cards: ${Object.keys(ALL_CARDS).length}${C.reset}`);
  console.log('');

  analyzeCorpVsTierlist(games);
  analyzeCardWinrates(games);
  analyzeVPBreakdown(games);
  analyzeMapMeta(games);
  analyzeVPSpread(games);
  analyzeCorrelations(games);
}

main();
