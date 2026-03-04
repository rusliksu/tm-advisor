/**
 * TM Game Watcher — мониторит игру Тагира, сохраняет снапшоты.
 * Запуск: node scripts/watch_game.js
 */
const https = require('https');
const fs = require('fs');

const PLAYER_ID = 'pb71fa3d9a87b';
const BASE = 'https://tm.knightbyte.win';
const POLL_SEC = 20;
const LOG_FILE = 'data/game_watch_log.jsonl';

let lastStep = -1;
let lastGen = -1;
let lastPhase = '';
let lastTableau = [];
let lastHand = 0;
let snapshots = [];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('ru-RU');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: Date.now(), msg }) + '\n');
}

function cardNames(arr) {
  return (arr || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
}

async function poll() {
  try {
    const d = await fetch(`${BASE}/api/player?id=${PLAYER_ID}`);
    const g = d.game;
    const tp = d.thisPlayer;
    const step = g.step;
    const gen = g.generation;
    const phase = g.phase;

    // Detect changes
    const tableau = (tp.tableau || []).map(c => c.name || c);
    const newCards = tableau.filter(c => !lastTableau.includes(c));
    const drafted = cardNames(d.draftedCards);
    const hand = cardNames(d.cardsInHand);
    const preludes = cardNames(d.preludeCardsInHand);

    if (step !== lastStep || phase !== lastPhase || gen !== lastGen) {
      log(`Gen ${gen} | Phase: ${phase} | Step ${step} | TR: ${tp.terraformRating}`);

      if (phase !== lastPhase) {
        log(`  Phase changed: ${lastPhase || '?'} → ${phase}`);
      }
      if (gen !== lastGen && gen > 1) {
        log(`  === GENERATION ${gen} START ===`);
        log(`  Тагир: MC=${tp.megaCredits} Steel=${tp.steel} Ti=${tp.titanium} Plants=${tp.plants} Energy=${tp.energy} Heat=${tp.heat}`);
        log(`  Prod: MC=${tp.megaCreditProduction} St=${tp.steelProduction} Ti=${tp.titaniumProduction} Pl=${tp.plantProduction} En=${tp.energyProduction} He=${tp.heatProduction}`);
        log(`  TR: ${tp.terraformRating} | Cards: ${tp.cardsInHandNbr} | Tableau: ${tableau.length}`);
      }

      if (newCards.length > 0) {
        log(`  NEW CARDS PLAYED: ${newCards.join(', ')}`);
      }

      // Save snapshot
      const snap = {
        ts: Date.now(),
        gen, phase, step,
        tr: tp.terraformRating,
        mc: tp.megaCredits,
        steel: tp.steel,
        titanium: tp.titanium,
        plants: tp.plants,
        energy: tp.energy,
        heat: tp.heat,
        prod: {
          mc: tp.megaCreditProduction,
          steel: tp.steelProduction,
          titanium: tp.titaniumProduction,
          plants: tp.plantProduction,
          energy: tp.energyProduction,
          heat: tp.heatProduction
        },
        tableau: tableau,
        hand: hand.length || tp.cardsInHandNbr,
        drafted: drafted,
        preludes: preludes,
        globals: {
          temp: g.temperature,
          oxygen: g.oxygenLevel,
          oceans: g.oceans,
          venus: g.venusScaleLevel
        },
        opponents: d.players.filter(p => p.color !== tp.color).map(p => ({
          name: p.name,
          color: p.color,
          tr: p.terraformRating,
          mc: p.megaCredits,
          tableau: (p.tableau || []).length,
          cards: p.cardsInHandNbr
        }))
      };
      snapshots.push(snap);

      lastStep = step;
      lastGen = gen;
      lastPhase = phase;
      lastTableau = tableau;
      lastHand = tp.cardsInHandNbr;
    }

    // Check for waiting state
    const wf = d.waitingFor;
    if (wf && Object.keys(wf).length > 0) {
      const wfType = wf.inputType || wf.playerInputType || '?';
      if (wf.cards && wf.cards.length > 0) {
        log(`  WAITING: ${wfType} — ${wf.cards.length} cards offered`);
      }
    }

  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

log('=== Game Watcher Started ===');
log(`Tracking: Тагир (${PLAYER_ID})`);
log(`Polling every ${POLL_SEC}s`);
poll();
setInterval(poll, POLL_SEC * 1000);
