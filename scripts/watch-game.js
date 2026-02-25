#!/usr/bin/env node
/**
 * watch-game.js — мониторинг TM игры через spectator API.
 * Отслеживает: смену генераций, драфт, новые карты на столе, TR, ресурсы, глобалки.
 *
 * Usage: node scripts/watch-game.js <spectatorId> [intervalSec]
 */

const https = require('https');

const SPEC_ID = process.argv[2] || 's32cec31738fe';
const INTERVAL = (parseInt(process.argv[3]) || 15) * 1000;
const API_URL = `https://terraforming-mars.herokuapp.com/api/spectator?id=${SPEC_ID}`;

let prev = null;
let pollCount = 0;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function ts() {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function tableauNames(player) {
  return new Set(player.tableau.map(c => c.name));
}

function tableauResources(player) {
  const m = {};
  for (const c of player.tableau) {
    if (c.resources > 0) m[c.name] = c.resources;
  }
  return m;
}

function diffSets(oldSet, newSet) {
  const added = [...newSet].filter(x => !oldSet.has(x));
  const removed = [...oldSet].filter(x => !newSet.has(x));
  return { added, removed };
}

function diffResources(pName, oldP, newP) {
  const changes = [];
  const fields = [
    ['megaCredits', 'MC'], ['steel', 'St'], ['titanium', 'Ti'],
    ['plants', 'Pl'], ['energy', 'En'], ['heat', 'Ht'],
  ];
  for (const [f, label] of fields) {
    const d = newP[f] - oldP[f];
    if (d !== 0) changes.push(`${label}${d > 0 ? '+' : ''}${d}`);
  }
  const prodFields = [
    ['megaCreditProduction', 'MC-prod'], ['steelProduction', 'St-prod'],
    ['titaniumProduction', 'Ti-prod'], ['plantProduction', 'Pl-prod'],
    ['energyProduction', 'En-prod'], ['heatProduction', 'Ht-prod'],
  ];
  for (const [f, label] of prodFields) {
    const d = newP[f] - oldP[f];
    if (d !== 0) changes.push(`${label}${d > 0 ? '+' : ''}${d}`);
  }
  if (newP.terraformRating !== oldP.terraformRating) {
    changes.push(`TR${newP.terraformRating - oldP.terraformRating > 0 ? '+' : ''}${newP.terraformRating - oldP.terraformRating}`);
  }
  return changes;
}

function printGlobals(game) {
  return `T:${game.temperature}°C O2:${game.oxygenLevel}% Oc:${game.oceans}/9 V:${game.venusScaleLevel}%`;
}

async function poll() {
  pollCount++;
  try {
    const data = await fetch(API_URL);
    const game = data.game;
    const players = data.players;

    if (!prev) {
      // First fetch — print full state
      console.log(`\n[${ts()}] 🎮 Подключено к игре (poll #${pollCount})`);
      console.log(`  Gen ${game.generation} | ${printGlobals(game)} | Phase: ${game.phase}`);
      for (const p of players) {
        const active = p.isActive ? ' ◀ ACTIVE' : '';
        console.log(`  ${p.name} (${p.color})${active}: TR=${p.terraformRating} MC=${p.megaCredits} Hand=${p.cardsInHandNbr}`);
        console.log(`    Prod: ${p.megaCreditProduction}mc ${p.steelProduction}st ${p.titaniumProduction}ti ${p.plantProduction}pl ${p.energyProduction}en ${p.heatProduction}ht`);
        console.log(`    Tableau (${p.tableau.length}): ${p.tableau.map(c => c.name).join(', ')}`);
      }
      prev = data;
      return;
    }

    // Detect changes
    const prevGame = prev.game;
    const changes = [];

    // Generation change
    if (game.generation !== prevGame.generation) {
      changes.push(`═══ GEN ${prevGame.generation} → ${game.generation} ═══`);
    }

    // Phase change
    if (game.phase !== prevGame.phase) {
      changes.push(`Phase: ${prevGame.phase} → ${game.phase}`);
    }

    // Globals
    if (game.temperature !== prevGame.temperature) changes.push(`Temp: ${prevGame.temperature} → ${game.temperature}°C`);
    if (game.oxygenLevel !== prevGame.oxygenLevel) changes.push(`O2: ${prevGame.oxygenLevel} → ${game.oxygenLevel}%`);
    if (game.oceans !== prevGame.oceans) changes.push(`Oceans: ${prevGame.oceans} → ${game.oceans}/9`);
    if (game.venusScaleLevel !== prevGame.venusScaleLevel) changes.push(`Venus: ${prevGame.venusScaleLevel} → ${game.venusScaleLevel}%`);

    // Step change (action taken)
    const stepDiff = game.step - prevGame.step;

    // Per-player changes
    for (let i = 0; i < players.length; i++) {
      const np = players[i];
      const op = prev.players[i];
      if (!op) continue;

      // Active player change
      if (np.isActive !== op.isActive && np.isActive) {
        changes.push(`▶ ${np.name} теперь активен`);
      }

      // New cards in tableau
      const oldTab = tableauNames(op);
      const newTab = tableauNames(np);
      const { added, removed } = diffSets(oldTab, newTab);
      if (added.length > 0) {
        changes.push(`${np.name} сыграл: ${added.join(', ')}`);
      }

      // Hand size change
      if (np.cardsInHandNbr !== op.cardsInHandNbr) {
        const hd = np.cardsInHandNbr - op.cardsInHandNbr;
        changes.push(`${np.name} hand: ${op.cardsInHandNbr} → ${np.cardsInHandNbr} (${hd > 0 ? '+' : ''}${hd})`);
      }

      // Resource/production/TR changes
      const resDiff = diffResources(np.name, op, np);
      if (resDiff.length > 0) {
        changes.push(`${np.name}: ${resDiff.join(' ')}`);
      }

      // Card resources changed
      const oldRes = tableauResources(op);
      const newRes = tableauResources(np);
      for (const [card, val] of Object.entries(newRes)) {
        const oldVal = oldRes[card] || 0;
        if (val !== oldVal) {
          changes.push(`${np.name} ${card}: ${oldVal} → ${val} res`);
        }
      }

      // Colonies change
      if (np.coloniesCount !== op.coloniesCount) {
        changes.push(`${np.name} colonies: ${op.coloniesCount} → ${np.coloniesCount}`);
      }
    }

    // Colony track changes
    if (prev.game.colonies && game.colonies) {
      for (let i = 0; i < game.colonies.length; i++) {
        const nc = game.colonies[i];
        const oc = prev.game.colonies[i];
        if (!oc) continue;
        if (nc.trackPosition !== oc.trackPosition) {
          changes.push(`Colony ${nc.name} track: ${oc.trackPosition} → ${nc.trackPosition}`);
        }
        if (nc.colonies.length !== oc.colonies.length) {
          const newSettlers = nc.colonies.filter(c => !oc.colonies.includes(c));
          if (newSettlers.length > 0) changes.push(`${newSettlers.join(',')} settled on ${nc.name}`);
        }
      }
    }

    // Print changes
    if (changes.length > 0) {
      console.log(`\n[${ts()}] (step ${game.step}, +${stepDiff})`);
      for (const c of changes) console.log(`  ${c}`);
    }

    prev = data;
  } catch (e) {
    if (pollCount % 20 === 0) console.log(`[${ts()}] ⚠ ${e.message}`);
  }
}

console.log(`TM Game Watcher | Spectator: ${SPEC_ID} | Interval: ${INTERVAL/1000}s`);
console.log(`Ctrl+C для остановки\n`);

poll();
setInterval(poll, INTERVAL);
