const fs = require('fs');
const path = require('path');

const GAME_DATA_DIR = path.join(__dirname);
const OUTPUT_FILE = path.join(__dirname, 'analysis.json');
const MIN_FILE_SIZE = 5 * 1024; // 5KB

// ===== Утилиты =====

function isCorpCard(card, index, twoCorps) {
  // Корпорации: calculatedCost === 0 и идут в начале tableau
  // Для twoCorpsVariant: первые 2-3 карты (corp + corp + Merger)
  if (index === 0) return true;
  if (twoCorps && index <= 2 && card.calculatedCost === 0) return true;
  // CEO карты тоже имеют calculatedCost === 0 и идут после корпов
  // Прелюдии тоже calculatedCost === 0
  // Определяем по позиции и стоимости
  if (!twoCorps && index === 0) return true;
  return false;
}

// Более точное определение: корпорации и прелюдии в начале, calculatedCost === 0
// Но нам нужно отделить корпы от прелюдий/CEO
// Стратегия: собираем все карты с calculatedCost === 0 в начале,
// после первой карты с calculatedCost > 0 — всё остальное проект
function classifyTableau(tableau, twoCorps) {
  const corps = [];
  const preludes = [];
  const ceo = [];
  const projects = [];

  // Известные имена прелюдий и CEO определять сложно без списка
  // Используем простую эвристику: первые 1-2 карты с cost 0 = корпы,
  // следующие 2-3 с cost 0 = прелюдии/CEO, остальное = проекты

  let corpCount = 0;
  let preludeZone = false;
  let corpsDone = false;

  for (let i = 0; i < tableau.length; i++) {
    const card = tableau[i];

    if (!corpsDone) {
      if (card.calculatedCost === 0) {
        // "Merger" — спец карта для twoCorps варианта
        if (card.name === 'Merger') {
          corps.push(card.name);
          continue;
        }
        corpCount++;
        corps.push(card.name);
        if (!twoCorps && corpCount >= 1) {
          corpsDone = true;
        } else if (twoCorps && corpCount >= 2) {
          corpsDone = true;
        }
      } else {
        corpsDone = true;
        // Эта карта уже не корпорация
        // Прелюдии имеют calculatedCost === 0 обычно, но не всегда
        // Проверяем — если cost 0 и мы в зоне прелюдий
        projects.push(card);
      }
    } else if (card.calculatedCost === 0 && i < 6) {
      // Прелюдии и CEO — cost 0, идут сразу после корпов (позиции 1-5)
      preludes.push(card.name);
    } else {
      projects.push(card);
    }
  }

  return { corps, preludes, projects };
}

// ===== Основная логика =====

function analyzeGame(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  // Определяем структуру файла
  let game, players;
  if (data.game) {
    // Спектаторский формат: { game: {...}, players: [...] }
    game = data.game;
    players = data.players;
  } else if (data.players && data.phase) {
    // Прямой формат (маленькие файлы): { phase, players, ... }
    game = data;
    players = data.players;
  } else {
    return null; // Неизвестный формат
  }

  // Только завершённые игры
  if (game.phase !== 'end') {
    return null;
  }

  // Проверяем наличие tableau у игроков
  if (!players || !players.length || !players[0].tableau) {
    return null;
  }

  const gameId = data.id || path.basename(filePath, '.json');
  const mapName = game.gameOptions?.boardName || 'unknown';
  const generation = game.generation || 0;
  const twoCorps = game.gameOptions?.twoCorpsVariant || false;
  const playerCount = players.length;

  // Определяем победителя
  let winner = null;
  let maxVP = -Infinity;

  const playersData = players.map(p => {
    const vp = p.victoryPointsBreakdown?.total || 0;
    const classified = classifyTableau(p.tableau || [], twoCorps);

    const playerInfo = {
      name: (p.name || '').trim(),
      color: p.color,
      corps: classified.corps,
      totalVP: vp,
      terraformRating: p.terraformRating || p.victoryPointsBreakdown?.terraformRating || 0,
      cardsPlayed: (p.tableau || []).length,
      projectsPlayed: classified.projects.length,
      tableau: (p.tableau || []).map(c => c.name),
      projectCards: classified.projects.map(c => c.name),
      vpBreakdown: {
        tr: p.victoryPointsBreakdown?.terraformRating || 0,
        milestones: p.victoryPointsBreakdown?.milestones || 0,
        awards: p.victoryPointsBreakdown?.awards || 0,
        greenery: p.victoryPointsBreakdown?.greenery || 0,
        city: p.victoryPointsBreakdown?.city || 0,
        cardsVP: p.victoryPointsBreakdown?.victoryPoints || 0,
        escapeVelocity: p.victoryPointsBreakdown?.escapeVelocity || 0,
        planetaryTracks: p.victoryPointsBreakdown?.planetaryTracks || 0,
      },
      detailsCards: (p.victoryPointsBreakdown?.detailsCards || []),
      citiesCount: p.citiesCount || 0,
      coloniesCount: p.coloniesCount || 0,
    };

    if (vp > maxVP) {
      maxVP = vp;
      winner = playerInfo;
    }

    return playerInfo;
  });

  // Топ VP карты (VP >= 2) по всем игрокам
  const topVPCards = [];
  for (const p of playersData) {
    for (const dc of p.detailsCards) {
      if (dc.victoryPoint >= 2) {
        topVPCards.push({
          cardName: dc.cardName,
          vp: dc.victoryPoint,
          player: p.name,
          isWinner: p === winner,
        });
      }
    }
  }
  topVPCards.sort((a, b) => b.vp - a.vp);

  return {
    gameId,
    mapName,
    generation,
    playerCount,
    twoCorps,
    winner: {
      name: winner.name,
      color: winner.color,
      corps: winner.corps,
      totalVP: winner.totalVP,
      tableau: winner.tableau,
      projectCards: winner.projectCards,
    },
    players: playersData.map(p => ({
      name: p.name,
      corps: p.corps,
      tr: p.vpBreakdown.tr,
      totalVP: p.totalVP,
      cardsPlayed: p.cardsPlayed,
      projectsPlayed: p.projectsPlayed,
      vpBreakdown: p.vpBreakdown,
      isWinner: p === winner,
    })),
    topVPCards,
    allPlayersTableaux: playersData.map(p => ({
      name: p.name,
      isWinner: p === winner,
      projectCards: p.projectCards,
      detailsCards: p.detailsCards,
    })),
  };
}

function aggregateResults(games) {
  // 1. Частота карт у победителей
  const winnerCardFreq = {};
  // 2. Частота карт у всех игроков
  const allCardFreq = {};
  // 3. Средний VP карт (из detailsCards)
  const cardVPSum = {};  // { cardName: { totalVP, count } }
  // 4. Винрейты корпораций
  const corpStats = {};  // { corpName: { wins, total } }
  // 5. Средняя длина игры
  let totalGenerations = 0;
  // 6. Частота карт у проигравших
  const loserCardFreq = {};

  for (const game of games) {
    totalGenerations += game.generation;

    // Корпорации
    for (const player of game.players) {
      for (const corp of player.corps) {
        if (corp === 'Merger') continue; // Пропускаем Merger
        if (!corpStats[corp]) corpStats[corp] = { wins: 0, total: 0 };
        corpStats[corp].total++;
        if (player.isWinner) corpStats[corp].wins++;
      }
    }

    // Карты победителя
    for (const card of game.winner.projectCards) {
      winnerCardFreq[card] = (winnerCardFreq[card] || 0) + 1;
    }

    // Карты всех игроков + VP статистика
    for (const pt of game.allPlayersTableaux) {
      for (const card of pt.projectCards) {
        allCardFreq[card] = (allCardFreq[card] || 0) + 1;
        if (!pt.isWinner) {
          loserCardFreq[card] = (loserCardFreq[card] || 0) + 1;
        }
      }

      for (const dc of pt.detailsCards) {
        if (!cardVPSum[dc.cardName]) {
          cardVPSum[dc.cardName] = { totalVP: 0, count: 0 };
        }
        cardVPSum[dc.cardName].totalVP += dc.victoryPoint;
        cardVPSum[dc.cardName].count++;
      }
    }
  }

  // Сортированные результаты
  const winnerCardRanking = Object.entries(winnerCardFreq)
    .map(([card, freq]) => ({ card, freq }))
    .sort((a, b) => b.freq - a.freq);

  const allCardRanking = Object.entries(allCardFreq)
    .map(([card, freq]) => ({ card, freq }))
    .sort((a, b) => b.freq - a.freq);

  const avgVPRanking = Object.entries(cardVPSum)
    .filter(([_, v]) => v.count >= 2) // минимум 2 появления для надёжности
    .map(([card, v]) => ({
      card,
      avgVP: Math.round((v.totalVP / v.count) * 100) / 100,
      appearances: v.count,
      totalVP: v.totalVP,
    }))
    .sort((a, b) => b.avgVP - a.avgVP);

  const corpWinRates = Object.entries(corpStats)
    .map(([corp, stats]) => ({
      corp,
      wins: stats.wins,
      total: stats.total,
      winRate: Math.round((stats.wins / stats.total) * 100),
    }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total);

  // Карты-сюрпризы: сильно чаще у победителей vs проигравших
  const totalWinners = games.length;
  const totalLosers = games.reduce((sum, g) => sum + g.players.length - 1, 0);

  const winnerAdvantageCards = Object.keys({ ...winnerCardFreq, ...loserCardFreq })
    .map(card => {
      const wFreq = winnerCardFreq[card] || 0;
      const lFreq = loserCardFreq[card] || 0;
      const wRate = wFreq / totalWinners;
      const lRate = totalLosers > 0 ? lFreq / totalLosers : 0;
      const ratio = lRate > 0 ? wRate / lRate : (wFreq > 0 ? 999 : 0);
      return {
        card,
        winnerFreq: wFreq,
        loserFreq: lFreq,
        winnerRate: Math.round(wRate * 100),
        loserRate: Math.round(lRate * 100),
        advantageRatio: Math.round(ratio * 100) / 100,
      };
    })
    .filter(c => c.winnerFreq >= 2 || c.loserFreq >= 2)
    .sort((a, b) => b.advantageRatio - a.advantageRatio);

  return {
    totalGames: games.length,
    totalPlayers: games.reduce((s, g) => s + g.players.length, 0),
    averageGeneration: Math.round((totalGenerations / games.length) * 10) / 10,
    winnerCardRanking,
    allCardRanking,
    avgVPRanking,
    corpWinRates,
    winnerAdvantageCards,
    loserCardFreq: Object.entries(loserCardFreq)
      .map(([card, freq]) => ({ card, freq }))
      .sort((a, b) => b.freq - a.freq),
  };
}

// ===== Main =====

function main() {
  const files = fs.readdirSync(GAME_DATA_DIR)
    .filter(f => f.endsWith('.json') && f !== 'analysis.json');

  console.log(`Найдено ${files.length} JSON файлов`);

  const games = [];
  const skipped = { tooSmall: 0, notEnded: 0, noTableau: 0, parseError: 0 };

  for (const file of files) {
    const filePath = path.join(GAME_DATA_DIR, file);
    const stat = fs.statSync(filePath);

    if (stat.size < MIN_FILE_SIZE) {
      skipped.tooSmall++;
      console.log(`  ПРОПУСК (< 5KB): ${file} (${stat.size} байт)`);
      continue;
    }

    try {
      const result = analyzeGame(filePath);
      if (result) {
        games.push(result);
        console.log(`  OK: ${file} — Победитель: ${result.winner.name} (${result.winner.totalVP} VP), Gen ${result.generation}, ${result.playerCount}P, ${result.mapName}`);
      } else {
        skipped.notEnded++;
        console.log(`  ПРОПУСК (не завершена / нет данных): ${file}`);
      }
    } catch (e) {
      skipped.parseError++;
      console.log(`  ОШИБКА: ${file} — ${e.message}`);
    }
  }

  console.log(`\n===== РЕЗУЛЬТАТЫ =====`);
  console.log(`Обработано игр: ${games.length}`);
  console.log(`Пропущено: маленькие=${skipped.tooSmall}, не завершены=${skipped.notEnded}, ошибки=${skipped.parseError}`);

  if (games.length === 0) {
    console.log('Нет данных для агрегации.');
    return;
  }

  const aggregated = aggregateResults(games);

  // Вывод сводки
  console.log(`\nВсего игр: ${aggregated.totalGames}`);
  console.log(`Всего игроков: ${aggregated.totalPlayers}`);
  console.log(`Средняя длина игры: ${aggregated.averageGeneration} поколений`);

  console.log(`\n--- ТОП-20 карт победителей (частота) ---`);
  aggregated.winnerCardRanking.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.card} — ${c.freq} раз`);
  });

  console.log(`\n--- ТОП-20 карт по среднему VP ---`);
  aggregated.avgVPRanking.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.card} — ${c.avgVP} VP (${c.appearances} появлений)`);
  });

  console.log(`\n--- Винрейт корпораций ---`);
  aggregated.corpWinRates.forEach(c => {
    console.log(`  ${c.corp}: ${c.wins}/${c.total} (${c.winRate}%)`);
  });

  console.log(`\n--- Карты с преимуществом у победителей ---`);
  aggregated.winnerAdvantageCards.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.card} — у победителей: ${c.winnerRate}%, у проигравших: ${c.loserRate}% (x${c.advantageRatio})`);
  });

  // Полный output
  const output = {
    meta: {
      totalGames: aggregated.totalGames,
      totalPlayers: aggregated.totalPlayers,
      averageGeneration: aggregated.averageGeneration,
      analyzedAt: new Date().toISOString(),
    },
    games: games.map(g => ({
      gameId: g.gameId,
      mapName: g.mapName,
      generation: g.generation,
      playerCount: g.playerCount,
      twoCorps: g.twoCorps,
      winner: g.winner,
      players: g.players,
      topVPCards: g.topVPCards,
    })),
    aggregated: {
      winnerCardRanking: aggregated.winnerCardRanking,
      allCardRanking: aggregated.allCardRanking,
      avgVPRanking: aggregated.avgVPRanking,
      corpWinRates: aggregated.corpWinRates,
      winnerAdvantageCards: aggregated.winnerAdvantageCards,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nРезультаты записаны в: ${OUTPUT_FILE}`);
}

main();
