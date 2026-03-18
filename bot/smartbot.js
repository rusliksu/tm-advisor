const http = require('http');
const CARD_TAGS = require('./card_tags');
const CARD_VP = require('./card_vp');
const CARD_DATA = require('./card_data');
const CARD_GLOBAL_REQS = require('./card_global_reqs');
const TM_BRAIN = require('./tm-brain');
TM_BRAIN.setCardData(CARD_TAGS, CARD_VP, CARD_DATA, CARD_GLOBAL_REQS);

const {
  VP_CARDS, ENGINE_CARDS, CITY_CARDS, PROD_CARDS, DYNAMIC_VP_CARDS,
  ANIMAL_VP_CARDS, MICROBE_VP_CARDS, FLOATER_VP_CARDS,
  COLONY_TRADE, COLONY_BUILD_PRIORITY, PREF_CORPS, PREF_PRELUDES,
  STATIC_VP, PAY_ZERO,
  remainingSteps, vpLead, shouldPushGlobe, isRedsRuling,
  scoreColonyTrade, scoreCard, smartPay,
} = TM_BRAIN;

const BASE = 'http://localhost:8081';

// === Server lifecycle management (OOM fix) ===
const { execSync, spawn } = require('child_process');
const SERVER_DIR = '/home/openclaw/terraforming-mars';
const RESTART_EVERY = 25;
let serverProc = null;

function stopServer() {
  try {
    const pids = execSync("pgrep -f 'node.*server[.]js' || true").toString().trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        if (pid) { try { process.kill(parseInt(pid), 'SIGKILL'); } catch(e) {} }
      }
      console.log('Server stopped (PIDs: ' + pids.replace(/\n/g, ', ') + ')');
    }
  } catch(e) { console.log('stopServer error: ' + e.message); }
}

function startServer() {
  return new Promise((resolve, reject) => {
    try { execSync('rm -f ' + SERVER_DIR + '/db/game.db'); } catch(e) {}
    serverProc = spawn('node', ['build/src/server/server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: '8081' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    serverProc.unref();
    let started = false;
    const timeout = setTimeout(() => { if (!started) reject(new Error('Server start timeout 15s')); }, 15000);
    const poll = setInterval(() => {
      const h = require('http');
      h.get('http://localhost:8081/', (res) => {
        if (!started) { started = true; clearTimeout(timeout); clearInterval(poll); console.log('Server started (PID ' + serverProc.pid + ')'); resolve(); }
      }).on('error', () => {});
    }, 500);
  });
}

async function restartServer() {
  stopServer();
  await new Promise(r => setTimeout(r, 1000));
  await startServer();
}
let GAME_ID = 'ged2417324426';
let PLAYERS = [
  { name: 'Alpha', id: 'pc5cc707ee10d' },
  { name: 'Beta',  id: 'pc14f0826371b' },
  { name: 'Gamma', id: 'p1f0b9a3711c0' },
];

function _fetchOnce(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Parse: ' + data.slice(0,100))); } });
    }).on('error', reject);
  });
}

async function fetch(url, retries) {
  retries = retries || 3;
  for (let i = 0; i < retries; i++) {
    try { return await _fetchOnce(url); }
    catch(e) {
      if (i < retries - 1 && (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.message.includes('socket hang up'))) {
        console.log('  [retry fetch ' + (i+1) + '] ' + e.code + ', waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
      } else throw e;
    }
  }
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => {
      if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.message.includes('socket hang up')) {
        console.log('  [post error] ' + e.code + ', resolving as 503');
        resolve({ status: 503, body: e.message });
      } else reject(e);
    });
    req.write(data);
    req.end();
  });
}


// All card sets, analytics, scoreCard, smartPay — from TM_BRAIN (tm-brain.js)

function getTitle(wf) {
  if (!wf) return '';
  if (typeof wf.title === 'string') return wf.title;
  if (wf.title?.message) return wf.title.message;
  if (wf.title && typeof wf.title === 'object') return JSON.stringify(wf.title);
  return wf.buttonLabel || '';
}

function corpCardBoost(cardName, corpName) { var tags = (typeof CARD_TAGS!=="undefined" ? CARD_TAGS[cardName] : null) || []; var boost = 0; if (corpName==="Ecoline"||corpName==="EcoLine") { if (tags.includes("plant")) boost += 4; } if (corpName==="PhoboLog") { if (tags.includes("space")) boost += 3; if (tags.includes("jovian")) boost += 2; } if (corpName==="Thorgate") { if (tags.includes("power")) boost += 4; } if (corpName==="Teractor") { if (tags.includes("earth")) boost += 3; } if (corpName==="Point Luna") { if (tags.includes("earth")) boost += 3; } if (corpName==="Saturn Systems") { if (tags.includes("jovian")) boost += 4; } if (corpName==="Interplanetary Cinematics") { if (tags.includes("event")) boost += 3; } if (corpName==="Arklight") { if (tags.includes("animal")||tags.includes("plant")) boost += 3; } if (corpName==="CrediCor") { var cd2=typeof CARD_DATA!=="undefined"?CARD_DATA[cardName]:null; if (cd2&&(cd2.cost||0)>=20) boost += 3; } return boost; }

// EV-based prelude scoring (preludes are free, played gen 0)
function scorePrelude(prelude, state, corpName) {
  var name = prelude.name || '';
  var cd = CARD_DATA[name] || {};
  var tags = CARD_TAGS[name] || [];
  var beh = cd.behavior || {};
  var act = cd.action || {};

  // Preludes have cost=0 and are played at gen 0 -> max compound benefit
  var GENS = 12; // expected total game length
  var ev = 0;

  // -- PRODUCTION (most valuable from prelude - compounds all game) --
  var PROD_V = { megacredits: 1, steel: 1.5, titanium: 1.8, plants: 1.2, energy: 1.0, heat: 0.4 };
  if (beh.production) {
    for (var k in beh.production) {
      var delta = beh.production[k];
      var val = PROD_V[k] || 1;
      if (delta < 0) {
        ev += delta * val * GENS * 1.5; // penalty for negative prod
      } else {
        ev += delta * val * GENS * 1.1; // 1.3x compound bonus (gen 0 start)
      }
    }
  }

  // -- STOCK (immediate resources) --
  var STOCK_V = { megacredits: 1.2, steel: 2.5, titanium: 3.5, plants: 2, energy: 1, heat: 0.5, cards: 4 };
  if (beh.stock) {
    for (var sk in beh.stock) {
      ev += (beh.stock[sk] || 0) * (STOCK_V[sk] || 1);
    }
  }

  // -- GLOBAL RAISES (TR + tempo) --
  var trVal = GENS + 5; // TR = income for GENS + 1 VP
  if (beh.global) {
    for (var gk in beh.global) {
      ev += (beh.global[gk] || 0) * trVal;
    }
  }
  if (beh.tr) ev += beh.tr * (GENS + 3); // pure TR (no tempo)
  if (beh.ocean) ev += (typeof beh.ocean === "number" ? beh.ocean : 1) * (trVal + 5); // TR + placement bonus
  if (beh.greenery) ev += (trVal + 5); // TR + 1VP
  if (beh.city) ev += 12; // city ~2 VP + positional value

  // -- DRAW CARDS --
  if (beh.drawCard) ev += beh.drawCard * 3.5;

  // -- COLONY --
  if (beh.colony) ev += 10; // colony slot from prelude = very early trades

  // -- BLUE ACTION (recurring from gen 0) --
  if (act.addResources) ev += GENS * 1.5;
  if (act.stock) {
    for (var ak in act.stock) {
      ev += GENS * (act.stock[ak] || 0) * (STOCK_V[ak] || 1) * 0.4;
    }
  }
  if (act.drawCard) ev += GENS * (act.drawCard || 1) * 3;

  // -- TAG JUMPSTART VALUE --
  for (var i = 0; i < tags.length; i++) {
    var t = tags[i];
    if (t === 'wild') ev += 3;
    else if (t === 'jovian') ev += 3;
    else if (t === 'science') ev += 2.5;
    else if (t === 'earth') ev += 2;
    else if (t === 'building') ev += 1.5;
    else if (t === 'space') ev += 1.5;
    else if (t === 'plant') ev += 2;
    else if (t === 'power') ev += 1.5;
    else if (t === 'city') ev += 1;
    else ev += 1;
  }

  // -- CORP SYNERGY --
  if (corpName) {
    if (corpName === 'Manutech' && beh.production) {
      for (var mk in beh.production) {
        if (beh.production[mk] > 0) ev += beh.production[mk] * (STOCK_V[mk] || 1);
      }
    }
    if ((corpName === 'Ecoline' || corpName === 'EcoLine') && beh.production && beh.production.plants > 0) {
      ev += beh.production.plants * 3;
    }
    if (corpName === 'Helion' && beh.production && beh.production.heat > 0) {
      ev += beh.production.heat * GENS * 0.5;
    }
    if (corpName === 'Thorgate' && tags.indexOf('power') >= 0) {
      ev += 3;
    }
    if (corpName === 'Saturn Systems' && tags.indexOf('jovian') >= 0) {
      ev += GENS;
    }
    if (corpName === 'Teractor' && tags.indexOf('earth') >= 0) {
      ev += 3;
    }
    if (corpName === 'Point Luna' && tags.indexOf('earth') >= 0) {
      ev += 3.5;
    }
    if (corpName === 'Arklight' && (tags.indexOf('animal') >= 0 || tags.indexOf('plant') >= 0)) {
      ev += 5;
    }
    if (corpName === 'Interplanetary Cinematics' && tags.indexOf('event') >= 0) {
      ev += 2;
    }
    if (corpName === 'Poseidon' && beh.colony) {
      ev += GENS;
    }
    if (corpName === 'Mining Guild' && beh.production && beh.production.steel > 0) {
      ev += 3;
    }
  }

  // -- MANUAL PRELUDE ADJUSTMENTS (effects not in card_data) --
  var PRELUDE_MANUAL = {
    'Mohole Excavation': 15,
    'Vital Colony': 22,
    'Robinson Industries': 8
  };
  if (PRELUDE_MANUAL[name]) ev += PRELUDE_MANUAL[name];

  return Math.round(ev * 10) / 10;
}

// === STRATEGY CLASSIFIER (v65) ===
const playerStrategies = new Map(); // color -> { generation, primary, secondary, confidence, archetypes }
const STRATEGY_TAGS = {
  science: ['science'], jovian: ['jovian'], cities: ['city'], plants: ['plant'],
  heat: ['power'], events: ['event'], colonies: ['earth'],
  animals: ['animal', 'microbe'], venus: ['venus'], production: ['building'],
};
const MILESTONE_STRATEGY = {
  science: 'scientist', jovian: 'rim', cities: 'mayor', plants: 'ecologist',
  events: 'legend', production: 'builder',
};
const AWARD_STRATEGY = {
  science: 'scientist', heat: 'thermalist', production: 'banker',
  cities: 'landlord', venus: 'venuphile',
};

function classifyStrategy(state) {
  try {
    var pid = (state && state.thisPlayer && state.thisPlayer.color) || 'unknown';
    var gen = (state && state.game && state.game.generation) || 1;
    var cached = playerStrategies.get(pid);
    if (cached && cached.generation === gen) return cached;

    var tp = (state && state.thisPlayer) || {};
    var hand = (state && state.cardsInHand) || [];
    var corpName = ((tp.tableau || [])[0] || {}).name || '';
    var myTags = tp.tags || {};

    // Hand tag counts
    var handTags = {};
    for (var hi = 0; hi < hand.length; hi++) {
      var htags = CARD_TAGS[hand[hi].name] || [];
      for (var hj = 0; hj < htags.length; hj++) {
        handTags[htags[hj]] = (handTags[htags[hj]] || 0) + 1;
      }
    }

    // Archetype scoring: tableau tags ×2, hand tags ×1, production levels
    var archetypes = {
      science: (myTags.science || 0) * 2 + (handTags.science || 0),
      jovian: (myTags.jovian || 0) * 2 + (handTags.jovian || 0),
      cities: (myTags.city || 0) * 2 + (tp.citiesCount || 0) * 2,
      plants: (myTags.plant || 0) * 2 + (handTags.plant || 0) + (tp.plantProduction || 0) * 2,
      heat: (myTags.power || 0) * 2 + (tp.heatProduction || 0) + (tp.energyProduction || 0),
      events: (myTags.event || 0) * 2 + (handTags.event || 0),
      colonies: 0,
      animals: (myTags.animal || 0) * 2 + (myTags.microbe || 0) * 2 + (handTags.animal || 0) + (handTags.microbe || 0),
      venus: (myTags.venus || 0) * 2 + (handTags.venus || 0),
      production: (tp.megaCreditProduction || 0) + (tp.steelProduction || 0) * 2 + (tp.titaniumProduction || 0) * 3,
    };

    // Corp signals (+10-15 for matching archetype)
    var CORP_SIGNALS = {
      'Point Luna': { science: 3 }, 'Saturn Systems': { jovian: 7 },
      'Arklight': { animals: 6 }, 'Ecoline': { plants: 7 }, 'EcoLine': { plants: 7 },
      'Helion': { heat: 6 }, 'Thorgate': { heat: 5 },
      'Tharsis Republic': { cities: 6 }, 'Interplanetary Cinematics': { events: 6 },
      'Poseidon': { colonies: 7 }, 'Aridor': { colonies: 5 },
      'Morning Star Inc': { venus: 7 }, 'Celestic': { venus: 5 },
      'Stormcraft Incorporated': { venus: 4, jovian: 4 },
      'Splice': { animals: 4 }, 'Inventrix': { science: 5 },
      'Phobolog': { jovian: 4 }, 'PhoboLog': { jovian: 4 },
    };
    var signals = CORP_SIGNALS[corpName] || {};
    for (var sk in signals) archetypes[sk] = (archetypes[sk] || 0) + signals[sk];

    // Production bonuses
    if ((tp.steelProduction || 0) >= 3) archetypes.production += 5;
    if ((tp.titaniumProduction || 0) >= 2) archetypes.production += 5;

    // Find primary and secondary
    var sorted = Object.entries(archetypes).sort(function(a, b) { return b[1] - a[1]; });
    var maxScore = (sorted[0] && sorted[0][1]) || 0;
    var primary = (sorted[0] && sorted[0][0]) || 'production';
    var secondary = sorted.length > 1 && sorted[1][1] >= maxScore * 0.5 ? sorted[1][0] : null;
    var confidence = maxScore > 0 ? Math.min(1, maxScore / 30) : 0;

    var result = { generation: gen, primary: primary, secondary: secondary, confidence: confidence, archetypes: archetypes };
    playerStrategies.set(pid, result);
    return result;
  } catch(e) {
    return { generation: 0, primary: 'production', secondary: null, confidence: 0, archetypes: {} };
  }
}

function handleInput(wf, state, depth = 0) {
  if (!wf || !wf.type) return { type: 'option' };
  if (depth > 10) return { type: 'option' };
  const t = wf.type;
  const corp = (state?.thisPlayer?.tableau || [])[0]?.name || "";

  if (t === 'option') return { type: 'option' };

  if (t === 'or') {
    const opts = wf.options || [];
    if (opts.length === 0) return { type: 'option' };

    const mc = state?.thisPlayer?.megaCredits ?? 0;
    const steel = state?.thisPlayer?.steel ?? 0;
    const titanium = state?.thisPlayer?.titanium ?? 0;
    const heat = state?.thisPlayer?.heat ?? 0;
    const plants = state?.thisPlayer?.plants ?? 0;
    const energy = state?.thisPlayer?.energy ?? 0;
    const cardsInHand = state?.cardsInHand || [];

    const titles = opts.map((o, i) => ({ i, t: getTitle(o).toLowerCase(), o }));
    // Filter out undo — bot should never undo
    const undoIdx = titles.findIndex(x => x.t.includes('undo'));
    const skip = state?._skipActions || new Set();
    const find = (kw) => titles.findIndex(x => x.t.includes(kw) && !skip.has(x.i));
    const pick = (idx) => {
      if (depth === 0) console.log(`    → ${titles[idx]?.t?.slice(0,40) || idx} (mc=${mc} pl=${plants} ht=${heat})`);
      return { type: 'or', index: idx, response: handleInput(opts[idx], state, depth+1) };
    };

    const passIdx = (() => {
      for (let i = opts.length - 1; i >= 0; i--) {
        const t = getTitle(opts[i]).toLowerCase();
        if (t.includes('pass') || t.includes('end turn') || t.includes('do nothing') || t.includes('skip')) return i;
      }
      return -1;
    })();

    const playCardIdx = find('play project card');
    const stdProjIdx = find('standard project');
    const greeneryIdx = find('plants into greenery');
    const heatIdx = find('convert 8 heat');
    const cardActionIdx = find('action from a played');
    const milestoneIdx = find('claim a milestone');
    const awardIdx = find('fund an award');
    const colonyIdx = find('build colony');
    const tradeIdx = find('trade');
    const delegateIdx = find('send a delegate');
    const sellIdx = find('sell');
    const worldGovIdx = find('world government');

    // World Government: pick terraform option considering VP position + engine synergy
    if (worldGovIdx >= 0 || titles.some(x => x.t.includes('increase temperature') || x.t.includes('increase venus') || x.t.includes('place an ocean'))) {
      var bestWGT = 0;
      var bestWGTScore = -999;
      var gm2 = state?.game || {};
      var tp2 = state?.thisPlayer || {};
      var wgtLead = vpLead(state);
      // Losing → penalize game-ending params (let engine catch up). Winning → push them.
      var endsGameBonus = wgtLead >= 0 ? 3 : (wgtLead >= -5 ? 0 : -3);
      for (var wi = 0; wi < opts.length; wi++) {
        var wt = getTitle(opts[wi]).toLowerCase();
        var wScore = 0;
        // Venus: doesn't end game → no penalty when losing
        if (wt.includes('venus')) wScore = 1;
        // Temperature: ends game
        if (wt.includes('temperature') || wt.includes('temp')) {
          wScore = 1 + endsGameBonus;
          if ((tp2.heatProduction || 0) >= 4) wScore += 3; // synergy: heat engine
          if ((gm2.temperature ?? -30) >= 4) wScore -= 2;  // almost done, low value
        }
        // Ocean: ends game
        if (wt.includes('ocean') || wt.includes('aquifer')) {
          wScore = 1 + endsGameBonus;
          if ((tp2.plantProduction || 0) >= 3) wScore += 2; // synergy: plant engine
        }
        // Greenery for us = always good (VP!)
        if (wt.includes('greenery') || wt.includes('forest')) wScore = 10;
        if (wScore > bestWGTScore) { bestWGTScore = wScore; bestWGT = wi; }
      }
      return pick(bestWGT);
    }

    // Final greenery placement (post-game): always place if possible (free VP!)
    const orTitle = getTitle(wf).toLowerCase();
    if (orTitle.includes('final greenery') || orTitle.includes('place any final')) {
      // Option 0 = place greenery (SelectSpace), Option 1 = don't place
      // Always place — it's free VP (no TR, but adjacency + greenery VP)
      return pick(0);
    }

    // Milestone selection: pick the one with most buffer (hardest for opponents to also qualify)
    if (orTitle.includes('claim a milestone') || orTitle.includes('milestone')) {
      const tp = state?.thisPlayer || {};
      const myTags2 = tp.tags || {};
      // Score each milestone option by how safe our claim is
      let bestMIdx = 0, bestMScore = -999;
      for (let i = 0; i < titles.length; i++) {
        const mt = titles[i].t.toLowerCase();
        let mScore = 0;
        // Mayor: 3+ cities
        if (mt.includes('mayor')) mScore = (tp.citiesCount || 0) - 3;
        // Builder: 8+ building tags
        else if (mt.includes('builder')) mScore = (myTags2.building || 0) - 8;
        // Planner: 16+ cards in hand → good indicator of engine strength
        else if (mt.includes('planner')) mScore = (state?.cardsInHand?.length || 0) - 16;
        // Terraformer: 35+ TR
        else if (mt.includes('terraformer')) mScore = (tp.terraformRating || 0) - 35;
        // Diversifier: 8+ different tags
        else if (mt.includes('diversifier')) mScore = Object.keys(myTags2).filter(t => myTags2[t] > 0).length - 8;
        // Rim Settler: 3+ jovian
        else if (mt.includes('rim')) mScore = (myTags2.jovian || 0) - 3;
        // Ecologist: 4+ bio tags (plant+animal+microbe)
        else if (mt.includes('ecologist')) mScore = ((myTags2.plant||0) + (myTags2.animal||0) + (myTags2.microbe||0)) - 4;
        // Legend: 5+ events
        else if (mt.includes('legend')) mScore = (myTags2.event || 0) - 5;
        // Hoverlord: 7+ floaters (hard to check, fallback)
        else if (mt.includes('hoverlord')) mScore = 0;
        // Default: just pick it
        else mScore = 1;
        if (mScore > bestMScore) { bestMScore = mScore; bestMIdx = i; }
      }
      return pick(bestMIdx);
    }

    // Award selection: pick award with best expected VP (lead + 2nd place value)
    if (orTitle.includes('fund an award') || orTitle.includes('fund -')) {
      const tp = state?.thisPlayer || {};
      const players = state?.players || [];
      const myColor = tp.color;
      const metrics = players.map(p => ({
        color: p.color,
        banker: p.megaCreditProduction ?? 0,
        thermalist: (p.heat ?? 0) + (p.energy ?? 0) + (p.heatProduction ?? 0),
        miner: (p.steel ?? 0) + (p.titanium ?? 0) + (p.steelProduction ?? 0) + (p.titaniumProduction ?? 0),
        scientist: p.tags?.science ?? 0,
        venuphile: p.tags?.venus ?? 0,
        landlord: p.citiesCount ?? 0,
      }));
      const my = metrics.find(m => m.color === myColor) || {};
      const others = metrics.filter(m => m.color !== myColor);

      let bestIdx = 0, bestEV = -999;
      for (let i = 0; i < titles.length; i++) {
        const aw = titles[i].t.toLowerCase().trim();
        const key = aw.includes('banker') ? 'banker'
          : aw.includes('thermalist') ? 'thermalist'
          : aw.includes('miner') ? 'miner'
          : aw.includes('scientist') ? 'scientist'
          : aw.includes('venuphile') ? 'venuphile'
          : aw.includes('landlord') ? 'landlord'
          : null;
        if (!key) continue;
        const myVal = my[key] ?? 0;
        const maxOther = Math.max(0, ...others.map(o => o[key] ?? 0));
        const lead = myVal - maxOther;
        // Expected VP: 5 for clear 1st, 4 for tied, 2 for 2nd
        let ev = lead > 2 ? 5 : (lead > 0 ? 4.5 : (lead === 0 ? 4 : (lead >= -1 ? 2.5 : (lead >= -2 ? 1.5 : 0))));
        if (ev > bestEV) { bestEV = ev; bestIdx = i; }
      }
      console.log(`    → award: ${titles[bestIdx]?.t} (ev=${bestEV})`);
      return pick(bestIdx);
    }

    // Turmoil: Choose ruling party (Chairman ability) → pick by priority, avoid Reds
    if (orTitle.includes('ruling party')) {
      const RULING_PRIO = ['Mars First', 'Greens', 'Scientists', 'Kelvinists', 'Unity', 'Reds'];
      for (const pName of RULING_PRIO) {
        const idx = titles.findIndex(x => x.t.toLowerCase().includes(pName.toLowerCase()));
        if (idx >= 0) return pick(idx);
      }
      return pick(0);
    }

    // === MAIN ACTION PRIORITY ===
    // EARLY (1-4): production/engine cards → build economy
    // MID (5-8): synergies, VP accumulators, cities, milestones gen 3-5, awards gen 5-7
    // LATE (9+): greeneries, SP terraforming, score points

    const gen = state?.game?.generation ?? 5;
    const redsTax = isRedsRuling(state) ? 3 : 0;
    const steps = remainingSteps(state);
    // Smooth urgency: 0 = early game, 1 = pure endgame
    // Ramps from ~0.2 at 12 steps to 1.0 at 0 steps
    const urgency = steps > 0 ? Math.max(0, Math.min(1, 1 - (steps - 2) / 14)) : 0;
    const endgameMode = steps > 0 && (steps <= 6 || gen >= 16);

    // Free conversions — always do (TR + VP for greenery, TR for heat)
    // Ecoline needs only 7 plants for greenery
    const corp = (state?.thisPlayer?.tableau || [])[0]?.name || '';
    const plantsNeeded = corp === 'EcoLine' ? 7 : 8;
    // Greenery: always convert — even under Reds (greenery VP is worth it)
    if (greeneryIdx >= 0 && plants >= plantsNeeded) return pick(greeneryIdx);
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) return pick(heatIdx);

    // === ENDGAME ===
    if (endgameMode) {
      // Play VP-dense cards before SP (cards with VP > SP value)
      if (playCardIdx >= 0) {
        const subWfE = opts[playCardIdx] || {};
        const handE = subWfE.cards?.length > 0 ? subWfE.cards : cardsInHand;
        const payOptsE = subWfE.paymentOptions || {};
        const extraMCE = (payOptsE.heat ? heat : 0);
        const budgetE = mc + extraMCE;
        const vpCards = handE.filter(c => {
          if (c.isDisabled) return false;
          const cost = c.calculatedCost ?? c.cost ?? 999;
          const cTags = CARD_TAGS[c.name] || [];
          let bgt = budgetE;
          if (cTags.includes('building')) bgt += (steel * (state?.thisPlayer?.steelValue || 2));
          if (cTags.includes('space')) bgt += (titanium * (state?.thisPlayer?.titaniumValue || 3));
          if (cost > bgt) return false;
          // Only prioritize cards with strong VP or high EV
          const ev = scoreCard(c, state);
          return ev >= 10; // high-value cards only
        }).sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
        if (vpCards.length > 0) {
          const card = vpCards[0];
          return { type: 'or', index: playCardIdx, response: { type: 'projectCard', card: card.name, payment: smartPay(card.calculatedCost || 0, state, subWfE, CARD_TAGS[card.name]) } };
        }
      }
      // SP for remaining globals + city
      if (stdProjIdx >= 0) {
        const spOpt = opts[stdProjIdx]; const spCards = spOpt?.cards || [];
        const gm = state?.game || {};
        const USEFUL = [];
        if ((gm.temperature ?? -30) < 8) USEFUL.push('asteroid');
        if ((gm.oceans ?? 0) < 9) USEFUL.push('aquifer');
        if ((gm.oxygenLevel ?? 0) < 14) USEFUL.push('greenery');
        USEFUL.push('air scrapping', 'city');
        if (spCards.some(c => !c.isDisabled && USEFUL.some(kw => c.name.toLowerCase().includes(kw))) || spCards.length === 0)
          return pick(stdProjIdx);
      }
      if (cardActionIdx >= 0) return pick(cardActionIdx);
      if (delegateIdx >= 0 && mc >= 5) return pick(delegateIdx);
      if (playCardIdx >= 0) {
        const subWf = opts[playCardIdx] || {};
        const hand = subWf.cards?.length > 0 ? subWf.cards : cardsInHand;
        const payOpts = subWf.paymentOptions || {};
        const extraMC = (payOpts.heat ? heat : 0) + (payOpts.lunaTradeFederationTitanium ? titanium * (state?.thisPlayer?.titaniumValue || 3) : 0);
        const totalBudget = mc + extraMC;
        // In endgame fallback: only play cards with positive EV (no production dumps)
        const affordable = hand
          .filter(c => {
            if (c.isDisabled) return false;
            const cost = c.calculatedCost ?? c.cost ?? 999;
            const cTags = CARD_TAGS[c.name] || [];
            let budget = totalBudget;
            if (cTags.includes('building')) budget += (steel * (state?.thisPlayer?.steelValue || 2));
            if (cTags.includes('space')) budget += (titanium * (state?.thisPlayer?.titaniumValue || 3));
            if (cost > budget) return false;
            return scoreCard(c, state) >= 0; // must have positive EV
          })
          .sort((a, b) => scoreCard(b, state) - scoreCard(a, state));
        if (affordable.length > 0) {
          const card = affordable[0];
          return { type: 'or', index: playCardIdx, response: { type: 'projectCard', card: card.name, payment: smartPay(card.calculatedCost || 0, state, subWf, CARD_TAGS[card.name]) } };
        }
      }
      if (sellIdx >= 0 && cardsInHand.length > 0 && mc > 3) return pick(sellIdx);
      if (passIdx >= 0) return pick(passIdx);
      // Avoid undo as fallback
      var fallbackIdx = 0;
      if (undoIdx === 0 && opts.length > 1) fallbackIdx = 1;
      return pick(fallbackIdx);
    }

    // === NORMAL MODE ===

    // Milestones: best ROI in game (8 MC = 5 VP), claim ASAP — even gen 1
    if (milestoneIdx >= 0 && mc >= 8) return pick(milestoneIdx);

    // Awards: fund if EV-positive (cost-aware, defensive, 2nd-place value)
    if (awardIdx >= 0 && gen >= 3) {
      const funded = state?.game?.fundedAwards || [];
      const awardCost = funded.length === 0 ? 8 : (funded.length === 1 ? 14 : 20);
      if (mc >= awardCost) {
        const tp = state?.thisPlayer || {};
        const players = state?.players || [];
        const myColor = tp.color;
        const metrics = players.map(p => ({
          color: p.color,
          banker: p.megaCreditProduction ?? 0,
          thermalist: (p.heat ?? 0) + (p.energy ?? 0) + (p.heatProduction ?? 0),
          miner: (p.steel ?? 0) + (p.titanium ?? 0) + (p.steelProduction ?? 0) + (p.titaniumProduction ?? 0),
          scientist: p.tags?.science ?? 0,
          venuphile: p.tags?.venus ?? 0,
          landlord: p.citiesCount ?? 0,
        }));
        const my = metrics.find(m => m.color === myColor) || {};
        const others = metrics.filter(m => m.color !== myColor);
        const awardNames = ['banker', 'thermalist', 'miner', 'scientist', 'venuphile', 'landlord'];
        const gensLeftNow = Math.max(1, Math.ceil(steps / Math.max(4, (players.length || 3) * 2)));
        const vpVal = gensLeftNow >= 6 ? 3 : (gensLeftNow >= 3 ? 5 : 8);
        // Estimate expected VP from each award
        let bestAwardEV = -999;
        for (const aw of awardNames) {
          const myVal = my[aw] ?? 0;
          if (myVal === 0) continue;
          const otherVals = others.map(o => o[aw] ?? 0).sort((a, b) => b - a);
          const maxOther = otherVals[0] || 0;
          let expectedVP = 0;
          if (myVal > maxOther) expectedVP = 5; // 1st place
          else if (myVal === maxOther) expectedVP = 4; // tied 1st → ~4 VP avg
          else if (myVal >= maxOther - 1) expectedVP = 3; // likely 2nd (close)
          else if (myVal >= maxOther - 2) expectedVP = 1.5; // maybe 2nd
          // Also: defensive value — if opponent leads by 3+, they get free 5 VP. Funding blocks that.
          // If we're 2nd and opponent leads, we at least get 2 VP for 2nd place
          const evMC = expectedVP * vpVal;
          if (evMC > bestAwardEV) bestAwardEV = evMC;
        }
        // Fund if expected VP value exceeds cost
        if (bestAwardEV >= awardCost * 0.8) {
          console.log(`    → FUNDING award! cost=${awardCost} expectedEV=${bestAwardEV.toFixed(0)} MC=${mc}`);
          return pick(awardIdx);
        }
      }
    }

    // === CARD vs SP COMPETITION ===
    // Cards and Standard Projects compete on EV. Best action wins.
    const bl = state?._blacklist || new Set();
    const gm = state?.game || {};
    // Rate includes WGT raises + player SPs. In 3P Venus: ~6-8 steps/gen total.
    const ratePerGen = Math.max(4, Math.min(8, (state?.players?.length || 3) * 2));
    const gensLeftNow = Math.max(1, Math.ceil(steps / ratePerGen));

    // Calculate best SP EV (if available)
    let bestSpEV = -999;
    const trMCNow = gensLeftNow + (gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7) - redsTax;
    const tempoNow = gensLeftNow >= 5 ? 12 : (gensLeftNow >= 3 ? 10 : 6);
    const spAvailable = stdProjIdx >= 0 && mc >= 14 + redsTax;
    if (spAvailable) {
      const tempDone = (gm.temperature ?? -30) >= 8;
      const o2Done = (gm.oxygenLevel ?? 0) >= 14;
      const oceansDone = (gm.oceans ?? 0) >= 9;
      // SP EV = TR value + tempo - cost
      if (!tempDone) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14); // asteroid
      if (!oceansDone && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18); // aquifer
      bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15); // air scrapping (Venus)
      if (!o2Done && mc >= 23 + redsTax) {
        const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
        bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23); // greenery SP
      }
    }

    // Calculate best card EV (if available)
    let bestCard = null;
    let bestCardEV = -999;
    if (playCardIdx >= 0) {
      const subWf = opts[playCardIdx] || {};
      const payOpts = subWf.paymentOptions || {};
      const hand = subWf.cards?.length > 0 ? subWf.cards : cardsInHand;
      if (hand.length > 0) {
        const extraMC = (payOpts.heat ? heat : 0) + (payOpts.lunaTradeFederationTitanium ? titanium * (state?.thisPlayer?.titaniumValue || 3) : 0);
        // No MC reserve — SP quota handles forced terraforming
        const totalBudget = mc + extraMC;
        const playable = hand
          .filter(c => {
            if (c.isDisabled || bl.has(c.name)) return false;
            const cost = c.calculatedCost ?? c.cost ?? 999;
            const cTags = CARD_TAGS[c.name] || [];
            let budget = totalBudget;
            if (cTags.includes('building')) budget += (steel * (state?.thisPlayer?.steelValue || 2));
            if (cTags.includes('space')) budget += (titanium * (state?.thisPlayer?.titaniumValue || 3));
            return cost <= budget;
          })
          .map(c => {
            let score = scoreCard(c, state);
            // VP and city cards: modest priority bonus (scoreCard already values VP via vpMC)
            if (VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name)) score += 3 + Math.round(urgency * 4);
            if (CITY_CARDS.has(c.name)) score += 2 + Math.round(urgency * 3);
            // Award proximity: boost cards that strengthen our award lead
            var fundedAwards = state?.game?.fundedAwards || [];
            if (fundedAwards.length > 0) {
              var cTags2 = CARD_TAGS[c.name] || [];
              var prod2 = (CARD_DATA[c.name]||{}).behavior?.production || {};
              var hasFunded = function(kw) { return fundedAwards.some(function(a) { return (a.name||a).toLowerCase().indexOf(kw) >= 0; }); };
              // Banker: MC production
              if (hasFunded('banker') && prod2.megacredits > 0) score += 3;
              // Scientist: science tags
              if (hasFunded('scientist') && cTags2.indexOf('science') >= 0) score += 3;
              // Thermalist: heat/energy production
              if (hasFunded('thermalist') && (prod2.heat > 0 || prod2.energy > 0)) score += 2;
              // Miner: steel/titanium production
              if (hasFunded('miner') && (prod2.steel > 0 || prod2.titanium > 0)) score += 3;
              // Venuphile: venus tags
              if (hasFunded('venuphile') && cTags2.indexOf('venus') >= 0) score += 3;
              // Landlord: city cards
              if (hasFunded('landlord') && CITY_CARDS.has(c.name)) score += 2;
            }
            // Discount cards: play first to reduce cost of subsequent cards this gen
            var ccd = CARD_DATA[c.name] || {};
            if (ccd.cardDiscount || ['Earth Office','Earth Catapult','Space Station',
                'Anti-Gravity Technology','Warp Drive','Cutting Edge Technology',
                'Sky Docks','Mass Converter','Shuttles','Research Outpost'].indexOf(c.name) >= 0) {
              score += cardsInHand.length * 2; // more cards in hand = bigger payoff
            }
            // Production cards: bonus decays with urgency (compounds early, useless late)
            if (PROD_CARDS.has(c.name)) score += Math.round(5 * Math.max(0, 1 - urgency * 1.5));
            return { ...c, _score: score };
          })
          .sort((a, b) => b._score - a._score);
        // Greedy: pick highest-scored playable card
        if (!bestCard && playable.length > 0 && playable[0]._score >= 0) {
          bestCard = playable[0];
          bestCardEV = playable[0]._score;
        }
      }
    }

    // Position-aware: adjust SP/card balance based on VP lead
    const lead = vpLead(state); // positive = winning, negative = losing
    // Winning: prefer SP (end game faster) — boost bestSpEV by lead bonus
    // Losing: prefer cards (need VP, not TR) — penalize SP when far behind
    const leadBonus = lead > 5 ? Math.min(lead - 5, 8) : (lead < -5 ? Math.max(lead + 5, -8) : 0);
    const adjustedSpEV = bestSpEV + leadBonus;

    // Pure EV competition: pick whichever is better
    if (bestCard && bestCardEV >= adjustedSpEV) {
      const subWf2 = opts[playCardIdx] || {};
      return {
        type: 'or', index: playCardIdx,
        response: { type: 'projectCard', card: bestCard.name, payment: smartPay(bestCard.calculatedCost ?? bestCard.cost ?? 0, state, subWf2, CARD_TAGS[bestCard.name]) }
      };
    }
    if (spAvailable && adjustedSpEV > -5) {
      return pick(stdProjIdx);
    }
    // Card is only option (SP not available/affordable)
    if (bestCard && bestCardEV >= 0) {
      const subWf2 = opts[playCardIdx] || {};
      return {
        type: 'or', index: playCardIdx,
        response: { type: 'projectCard', card: bestCard.name, payment: smartPay(bestCard.calculatedCost ?? bestCard.cost ?? 0, state, subWf2, CARD_TAGS[bestCard.name]) }
      };
    }

    // Blue card actions (VP accumulators, free resources)
    if (cardActionIdx >= 0) return pick(cardActionIdx);

    // Trade colonies (high-value trades first, lower threshold if paying with energy)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {
      const tradeOpt = opts[tradeIdx];
      const colonies = tradeOpt?.coloniesModel || tradeOpt?.colonies || [];
      if (colonies.length > 0) {
        const bestTradeVal = Math.max(...colonies.map(c => scoreColonyTrade(c, state)));
        // Energy payment = ~2.4 MC effective cost (3 energy × 0.8); MC payment = 9 MC
        const tradeThreshold = energy >= 3 ? 4 : (titanium >= 3 ? 6 : 8);
        if (bestTradeVal >= tradeThreshold) return pick(tradeIdx);
      }
    }

    // SP fallback when globals still far
    if (spAvailable && steps > 12) return pick(stdProjIdx);

    // Trade colonies (lower threshold)
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) return pick(tradeIdx);

    // Build colony (if game is still early enough to benefit from production)
    if (colonyIdx >= 0 && mc >= 17 && urgency < 0.7) return pick(colonyIdx);

    // Delegate (chairman VP, party leader VP, anti-Reds) — skip in late game
    if (delegateIdx >= 0 && mc >= 8 && urgency < 0.6) return pick(delegateIdx);

    // Sell excess cards (more aggressive as urgency rises: 8 cards early → 5 late)
    const sellThreshold = Math.max(4, Math.round(8 - urgency * 4));
    if (sellIdx >= 0 && cardsInHand.length > sellThreshold) return pick(sellIdx);

    // 13. Try first unhandled option (CEO actions, prelude-phase triggers, card effects, etc.)
    // Skip options already handled by dedicated steps above
    if (passIdx >= 0 && opts.length > 1) {
      const alreadyHandled = new Set([playCardIdx, stdProjIdx, greeneryIdx, heatIdx,
        cardActionIdx, milestoneIdx, awardIdx, colonyIdx, tradeIdx, delegateIdx, sellIdx,
        worldGovIdx, passIdx].filter(i => i >= 0));
      const idx = titles.findIndex(x => !alreadyHandled.has(x.i) && !skip.has(x.i));
      if (idx >= 0) return pick(idx);
    }

    // 14. Pass as absolute last resort
    if (passIdx >= 0) return pick(passIdx);

    return pick(0);
  }

  if (t === 'and') {
    const opts = wf.options || [];
    // Resource distribution: all children are 'amount' → distribute respecting per-option max
    // Options may have different exchange rates (e.g. "2 heat each" for Stormcraft floaters)
    if (opts.length > 0 && opts.every(o => o.type === 'amount')) {
      const titleData = wf.title?.data;
      const total = (titleData && titleData[0]?.value) ? parseInt(titleData[0].value) : (opts[0]?.max || 0);
      // Parse per-unit heat rate from option titles (e.g. "2 heat each" → rate=2)
      const rates = opts.map(o => {
        const m = getTitle(o).match(/(\d+)\s+heat\s+each/i);
        return m ? parseInt(m[1]) : 1;
      });
      let remaining = total; // in base heat units
      const amounts = new Array(opts.length).fill(0);
      // Pass 1: fill rate>1 options first using floor (no overspend)
      for (let i = 0; i < opts.length; i++) {
        if (rates[i] === 1 || remaining <= 0) continue;
        const r = rates[i];
        const use = Math.min(opts[i].max ?? 0, Math.floor(remaining / r));
        amounts[i] = use;
        remaining -= use * r;
      }
      // Pass 2: fill rate=1 options for exact remainder
      for (let i = 0; i < opts.length; i++) {
        if (rates[i] !== 1 || remaining <= 0) continue;
        const use = Math.min(opts[i].max ?? remaining, remaining);
        amounts[i] = use;
        remaining -= use;
      }
      // Pass 3: if still remaining (rate=1 options exhausted), overspend with rate>1
      for (let i = 0; i < opts.length; i++) {
        if (rates[i] === 1 || remaining <= 0) continue;
        const r = rates[i];
        const canAdd = (opts[i].max ?? 0) - amounts[i];
        if (canAdd <= 0) continue;
        const use = Math.min(canAdd, Math.ceil(remaining / r));
        amounts[i] += use;
        remaining -= use * r;
      }
      return { type: 'and', responses: opts.map((o, i) => ({ type: 'amount', amount: amounts[i] })) };
    }
    return { type: 'and', responses: opts.map(o => handleInput(o, state, depth+1)) };
  }

  if (t === 'card') {
    const cards = wf.cards || [];
    const min = Math.max(0, wf.min ?? 0);
    const max = Math.max(0, wf.max ?? cards.length);
    const title = getTitle(wf).toLowerCase();

    if (max <= 0 || cards.length === 0) {
      return { type: 'card', cards: [] };
    }

    // Buy cards phase: buy good cards, keep reserve for plays
    if (title.includes('buy') || title.includes('select card(s) to buy') || title.includes('select up to')) {
      const mc = state?.thisPlayer?.megaCredits ?? 40;
      const cardCost = state?.thisPlayer?.cardCost ?? 3;
      const gen = state?.game?.generation ?? 5;
      const steps = remainingSteps(state);
      const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
      // In endgame: stop buying — save MC for SPs and terraforming
      if (isEndgame) return { type: 'card', cards: [] };
      // Buy cards aggressively — cards are how you build economy AND score VP
      // Urgency-scaled reserves and thresholds: tighter buying as game ends
      const stepsNow = remainingSteps(state);
      const urg = stepsNow > 0 ? Math.max(0, Math.min(1, 1 - (stepsNow - 2) / 14)) : 0;
      // Reserve MC for SP: always keep enough for asteroid (14 MC) from gen 3+
      const reserve = gen <= 2 ? 0 : Math.max(14, Math.round(14 + urg * 6)); // 14 early → 20 late
      const spendable = Math.max(0, mc - reserve);
      const canAfford = Math.min(Math.floor(spendable / cardCost), max, cards.length);
      const sorted = [...cards].sort((a, b) => {
        let sa = scoreCard(a, state) + corpCardBoost(a.name, corp), sb = scoreCard(b, state) + corpCardBoost(b.name, corp);
        // VP/city priority: modest bonus (scoreCard handles EV, this is just ordering)
        const vpBonus = 3 + Math.round(urg * 4);
        if (VP_CARDS.has(a.name) || DYNAMIC_VP_CARDS.has(a.name)) sa += vpBonus;
        if (VP_CARDS.has(b.name) || DYNAMIC_VP_CARDS.has(b.name)) sb += vpBonus;
        if (CITY_CARDS.has(a.name)) sa += 2 + Math.round(urg * 3);
        if (CITY_CARDS.has(b.name)) sb += 2 + Math.round(urg * 3);
        // Engine bonus decays with urgency (engine useless late)
        const engineBonus = Math.round(6 * (1 - urg));
        if (gen <= 4 && ENGINE_CARDS.has(a.name)) sa += engineBonus;
        if (gen <= 4 && ENGINE_CARDS.has(b.name)) sb += engineBonus;
        // Strategy boost: mild tiebreaker for on-strategy cards (gen 4+, high confidence only)
        if (gen >= 4) {
          var draftStrat = classifyStrategy(state);
          if (draftStrat.confidence >= 0.7) {
            var dsTags = STRATEGY_TAGS[draftStrat.primary] || [];
            var aOnS = (CARD_TAGS[a.name]||[]).some(function(t){return dsTags.indexOf(t)>=0;});
            var bOnS = (CARD_TAGS[b.name]||[]).some(function(t){return dsTags.indexOf(t)>=0;});
            if (aOnS) sa += 1 + Math.round(draftStrat.confidence);
            if (bOnS) sb += 1 + Math.round(draftStrat.confidence);
          }
        }
        return sb - sa;
      });
      // Threshold rises with urgency: 2 early → 8 late (don't buy junk)
      const threshold = Math.round(2 + urg * 6);
      const worthBuying = sorted.filter(c => (scoreCard(c, state) + corpCardBoost(c.name, corp)) >= threshold);
      // Max buy decreases with urgency: 4 early → 1 late
      const maxBuy = Math.max(1, Math.round(4 - urg * 3));
      const count = Math.max(min, Math.min(canAfford, worthBuying.length, maxBuy));
      return { type: 'card', cards: sorted.slice(0, count).map(c => c.name) };
    }

    if (title.includes('cannot afford')) {
      return { type: 'card', cards: [] };
    }

    // Standard projects selection: pick best terraform (check isDisabled!)
    if (title.includes('standard project')) {
      const mc = state?.thisPlayer?.megaCredits ?? 0;
      const reds = isRedsRuling(state) ? 3 : 0; // extra cost per TR step
      const available = cards.filter(c => !c.isDisabled);
      // Remaining steps per parameter — skip SPs for maxed-out globals
      const g = state?.game || {};
      const tempDone = (g.temperature ?? -30) >= 8;
      const o2Done = (g.oxygenLevel ?? 0) >= 14;
      const oceansDone = (g.oceans ?? 0) >= 9;
      // Priority: TR-raising first, then VP-generating (city), then economy
      // SP priority: cheapest TR first (cards handle VP/cities better)
      // SP priority: terraforming + air scrapping
      // Removed: buffer gas (solo only), power plant (bad ROI)
      const spPriority = [
        !tempDone && { kw: 'asteroid', cost: 14 + reds },
        !oceansDone && { kw: 'aquifer', cost: 18 + reds },
        { kw: 'air scrapping', cost: 15 + reds },
        !o2Done && { kw: 'greenery', cost: 23 + reds },
      ].filter(Boolean);
      for (const { kw, cost } of spPriority) {
        const sp = available.find(c => c.name.toLowerCase().includes(kw));
        if (sp && mc >= cost) return { type: 'card', cards: [sp.name] };
      }
      // City SP as fallback (1 VP + production)
      const city = available.find(c => c.name.toLowerCase().includes('city'));
      if (city && mc >= 25) return { type: 'card', cards: [city.name] };
      return { type: 'card', cards: [] };
    }

    // Blue card action: EV-based scoring per action
    if (wf.selectBlueCardAction) {
      const active = cards.filter(c => !c.isDisabled);
      const pool = active.length > 0 ? active : cards;
      const stepsNow = remainingSteps(state);
      const gensLeftNow = Math.max(1, Math.ceil(stepsNow / Math.max(4, (state?.players?.length || 3) * 2)));
      const vpVal = gensLeftNow >= 6 ? 3 : (gensLeftNow >= 3 ? 5 : 8);
      const scored = [...pool].map(c => {
        let ev = 0;
        const vpd = CARD_VP[c.name];
        const manual = TM_BRAIN.MANUAL_EV ? TM_BRAIN.MANUAL_EV[c.name] : null;
        // per_resource VP accumulator: each action = 1/per VP
        if (vpd?.type === 'per_resource') ev += vpVal / (vpd.per || 1);
        // Dynamic VP cards (Ants, Birds, Fish, etc.)
        else if (DYNAMIC_VP_CARDS.has(c.name)) ev += vpVal * 0.8;
        // Manual EV perGen is the best estimate
        else if (manual?.perGen) ev += manual.perGen;
        // Production/engine: declining value
        else if (PROD_CARDS.has(c.name) || ENGINE_CARDS.has(c.name)) ev += 2;
        // Draw card actions: ~3-4 MC
        else ev += 1.5;
        // Bonus for resources already on card (invested value)
        if (c.resources > 0 && vpd?.type === 'per_resource') ev += 0.5;
        return { ...c, _actionEV: ev };
      }).sort((a, b) => b._actionEV - a._actionEV);
      return { type: 'card', cards: [scored[0].name] };
    }

    // Draft/keep: pick highest-scored card(s)
    if (title.includes('select a card') || title.includes('keep')) {
      const count = Math.max(1, min);
      const scored = [...cards].sort((a, b) => (scoreCard(b, state) + corpCardBoost(b.name, corp)) - (scoreCard(a, state) + corpCardBoost(a.name, corp)));
      return { type: 'card', cards: scored.slice(0, count).map(c => c.name) };
    }

    // Discard: discard least valuable (keep best cards in hand)
    if (title.includes('discard')) {
      const sorted = [...cards].sort((a, b) => scoreCard(a, state) - scoreCard(b, state)); // worst first
      return { type: 'card', cards: sorted.slice(0, Math.max(min, 1)).map(c => c.name) };
    }

    // Sell: sell lowest-scored cards, but KEEP VP cards
    if (title.includes('sell')) {
      const scored = [...cards].sort((a, b) => scoreCard(a, state) - scoreCard(b, state)); // worst first
      const gen = state?.game?.generation ?? 5;
      const steps = remainingSteps(state);
      const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
      // Never sell cards with VP potential
      const sellable = scored.filter(c => {
        const vpd = CARD_VP[c.name];
        if (vpd && (vpd.type !== 'static' || vpd.vp > 0)) return false;
        const vp = STATIC_VP[c.name] ?? 0;
        if (vp > 0 || DYNAMIC_VP_CARDS.has(c.name)) return false;
        return true;
      });
      const count = isEndgame ? Math.max(min, sellable.length) : Math.max(min, Math.floor(sellable.length / 2));
      return { type: 'card', cards: sellable.slice(0, count).map(c => c.name) };
    }

    // Default: min required
    return { type: 'card', cards: cards.slice(0, min).map(c => c.name) };
  }

  if (t === 'space') {
    const spaces = wf.spaces || wf.availableSpaces || [];
    if (spaces.length === 0) return { type: 'space', spaceId: '21' };
    const title = getTitle(wf).toLowerCase();
    const isCity = title.includes('city');
    const isGreenery = title.includes('greenery') || title.includes('forest');
    // Board adjacency data for VP optimization
    const boardSpaces = state?.game?.spaces || [];
    const adjMap = {};
    const coordMap = {};
    for (const bs of boardSpaces) {
      if (bs.id) adjMap[bs.id] = bs;
      if (bs.x !== undefined && bs.y !== undefined) coordMap[bs.x + ',' + bs.y] = bs.id;
    }
    // Compute adjacentSpaces from hex coordinates (API doesn't provide them)
    for (const bs of boardSpaces) {
      if (bs.x !== undefined && bs.y !== undefined && !bs.adjacentSpaces) {
        var deltas = [
          [-1, 0], [1, 0],
          [bs.y % 2 === 0 ? -1 : 0, -1], [bs.y % 2 === 0 ? 0 : 1, -1],
          [bs.y % 2 === 0 ? -1 : 0, 1], [bs.y % 2 === 0 ? 0 : 1, 1],
        ];
        bs.adjacentSpaces = [];
        for (var d of deltas) {
          var key = (bs.x + d[0]) + ',' + (bs.y + d[1]);
          if (coordMap[key]) bs.adjacentSpaces.push(coordMap[key]);
        }
      }
    }
    const myColor = state?.thisPlayer?.color;
    const scored = spaces.map(s => {
      const id = s.id || s;
      const bonus = s.bonus || [];
      let score = 0;
      // Placement bonuses
      for (const b of bonus) {
        if (b === 'plant' || b === 'plants' || b === 1) score += 2;
        if (b === 'steel' || b === 2) score += 2;
        if (b === 'titanium' || b === 3) score += 3;
        if (b === 'card' || b === 'draw' || b === 4) score += 3;
        if (b === 'heat' || b === 5) score += 1;
        if (b === 'ocean' || b === 6) score += 2; // ocean adjacency bonus (2 MC)
      }
      // Adjacency VP scoring
      const spaceData = adjMap[id];
      if (spaceData && spaceData.adjacentSpaces) {
        for (const adjId of spaceData.adjacentSpaces) {
          const adj = adjMap[adjId];
          if (!adj) continue;
          // For city: each adjacent greenery = 1 VP
          if (isCity && adj.tileType === 'greenery') score += 3;
          // For city: empty adjacent land = future greenery potential (1 VP each)
          if (isCity && !adj.tileType && adj.spaceType !== 'ocean') score += 1;
          // For city: adjacent to own city is bad (wasted adjacency)
          if (isCity && adj.tileType === 'city' && adj.color === myColor) score -= 2;
          // For greenery: adjacent to own city = 1 VP for that city
          if (isGreenery && adj.tileType === 'city' && adj.color === myColor) score += 4;
          // For greenery: adjacent to opponent city still gives THEM VP, prefer our cities
          if (isGreenery && adj.tileType === 'city' && adj.color !== myColor) score -= 1;
          // Adjacent ocean = 2 MC placement bonus
          if (adj.tileType === 'ocean') score += 1;
        }
      }
      return { id, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return { type: 'space', spaceId: scored[0].id };
  }

  if (t === 'amount') return { type: 'amount', amount: wf.max ?? wf.min ?? 0 };

  if (t === 'player') {
    const p = wf.players || [];
    return { type: 'player', player: p[0]?.color || p[0] || 'neutral' };
  }

  if (t === 'party') {
    const parties = wf.parties || wf.availableParties || [];
    // Priority: reinforce party where we already lead, else pick by value
    // Mars First > Greens > Scientists > Kelvinists > Unity > Reds
    // In endgame, anti-Reds is critical (Reds blocks WG terraform + taxes TR)
    const steps = remainingSteps(state);
    const gen = state?.game?.generation ?? 5;
    const isEndgame = steps > 0 && (steps <= 8 || gen >= 20);
    const PARTY_PRIO = isEndgame
      ? ['Greens', 'Mars First', 'Scientists', 'Kelvinists', 'Unity', 'Reds']
      : ['Mars First', 'Greens', 'Scientists', 'Kelvinists', 'Unity', 'Reds'];
    const turmoil = state?.game?.turmoil;
    const myColor = state?.thisPlayer?.color;
    if (turmoil && myColor) {
      // Find party where we are partyLeader → reinforce
      const myParty = turmoil.parties?.find(p =>
        p.partyLeader === myColor && parties.includes(p.name));
      if (myParty) return { type: 'party', partyName: myParty.name };
      // Find party where we have most delegates → grow
      let bestParty = null, bestCount = 0;
      for (const p of (turmoil.parties || [])) {
        if (!parties.includes(p.name)) continue;
        const myDel = (p.delegates || []).find(d => d.color === myColor);
        if (myDel && myDel.number > bestCount) { bestCount = myDel.number; bestParty = p.name; }
      }
      if (bestParty) return { type: 'party', partyName: bestParty };
    }
    // Fallback: priority list, skip Reds if possible
    const pick = PARTY_PRIO.find(p => parties.includes(p)) || parties[0] || 'Mars First';
    return { type: 'party', partyName: pick };
  }

  if (t === 'delegate') {
    const players = wf.players || [];
    // Always pick our own color to gain influence
    const myColor = state?.thisPlayer?.color;
    if (myColor && players.includes(myColor)) return { type: 'delegate', player: myColor };
    // Fall back: NEUTRAL, then first available
    if (players.includes('NEUTRAL')) return { type: 'delegate', player: 'NEUTRAL' };
    return { type: 'delegate', player: players[0] || 'NEUTRAL' };
  }

  if (t === 'colony') {
    const colonies = wf.coloniesModel || wf.colonies || [];
    if (colonies.length > 0) {
      const title = getTitle(wf).toLowerCase();
      const isTrade = title.includes('trade') || title.includes('income');
      let sorted;
      if (isTrade) {
        // Score by actual trade value at current track position
        sorted = [...colonies].sort((a, b) => scoreColonyTrade(b, state) - scoreColonyTrade(a, state));
      } else {
        // Build colony: priority by what the build gives
        sorted = [...colonies].sort((a, b) => {
          const an = a.name || a, bn = b.name || b;
          const ai = COLONY_BUILD_PRIORITY.indexOf(an), bi = COLONY_BUILD_PRIORITY.indexOf(bn);
          return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
        });
      }
      return { type: 'colony', colonyName: sorted[0].name || sorted[0] };
    }
    return { type: 'colony', colonyName: 'Luna' };
  }

  if (t === 'payment') {
    return { type: 'payment', payment: smartPay(wf.amount || 0, state, wf) };
  }

  if (t === 'projectCard') {
    const cards = wf.cards || [];
    if (cards.length > 0) {
      const mc = state?.thisPlayer?.megaCredits ?? 0;
      const tp = state?.thisPlayer || {};
      const payOpts = wf.paymentOptions || {};
      const heatAvail = payOpts.heat ? (tp.heat || 0) : 0;
      // Filter by affordability (heat as MC counts)
      const affordable = cards.filter(c => (c.calculatedCost ?? c.cost ?? 999) <= mc + heatAvail);
      const card = affordable.length > 0 ? affordable[0] : null;
      if (!card) return { type: 'option' };
      return { type: 'projectCard', card: card.name, payment: smartPay(card.calculatedCost || 0, state, wf, CARD_TAGS[card.name]) };
    }
    return { type: 'option' };
  }

  if (t === 'resource') {
    // "Gain X units of standard resource" — pick based on hand needs
    const include = wf.include || ['megacredits'];
    const tp = state?.thisPlayer || {};
    const hand = state?.cardsInHand || [];
    // Count space/building tags in hand to see what we need
    let spaceTags = 0, buildTags = 0;
    for (const c of hand) {
      const tags = CARD_TAGS[c.name] || [];
      if (tags.includes('space')) spaceTags++;
      if (tags.includes('building')) buildTags++;
    }
    // Prefer titanium if we have space cards and low ti, steel if building cards
    let pref = 'megacredits';
    if (include.includes('titanium') && spaceTags > 0 && (tp.titanium || 0) < 3) pref = 'titanium';
    else if (include.includes('steel') && buildTags > 0 && (tp.steel || 0) < 3) pref = 'steel';
    else if (include.includes('titanium') && (tp.titaniumProduction || 0) >= 1) pref = 'titanium';
    else if (include.includes('steel') && (tp.steelProduction || 0) >= 1) pref = 'steel';
    else if (include.includes('megacredits')) pref = 'megacredits';
    else pref = include[0];
    return { type: 'resource', resource: pref };
  }

  if (t === 'resources') {
    // Gain standard resources — smart allocation based on needs
    const count = wf.count ?? wf.max ?? wf.min ?? 1;
    const units = { megacredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 };
    const tp = state?.thisPlayer || {};
    const stepsNow = remainingSteps(state);
    // Near greenery: take plants if close (plants >= 5 with 8 needed)
    if ((tp.plants || 0) >= 5 && stepsNow > 3) {
      units.plants = count;
    } else {
      units.megacredits = count;
    }
    return { type: 'resources', units };
  }

  if (t === 'productionToLose') {
    // Lose least valuable production first
    const tp = state?.thisPlayer || {};
    const tolose = wf.count || wf.units || 1;
    const units = { megacredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 };
    // Priority: lose heat first (least valuable), then energy, then MC, then plants, then steel, then titanium
    const loseOrder = [
      { key: 'heat', prod: tp.heatProduction ?? 0 },
      { key: 'energy', prod: tp.energyProduction ?? 0 },
      { key: 'megacredits', prod: (tp.megaCreditProduction ?? 0) + 5 }, // MC prod can go negative in theory
      { key: 'plants', prod: tp.plantProduction ?? 0 },
      { key: 'steel', prod: tp.steelProduction ?? 0 },
      { key: 'titanium', prod: tp.titaniumProduction ?? 0 },
    ];
    let remaining = typeof tolose === 'number' ? tolose : 1;
    for (const { key, prod } of loseOrder) {
      if (remaining <= 0) break;
      const give = Math.min(remaining, Math.max(0, prod));
      if (give > 0) { units[key] = give; remaining -= give; }
    }
    return { type: 'productionToLose', units };
  }

  if (t === 'initialCards') {
    const opts = wf.options || [];

    // Gather all available project cards across all options for synergy scoring
    let allProjectCards = [];
    let allPreludes = [];
    for (const opt of opts) {
      const title = getTitle(opt).toLowerCase();
      if (title.includes('buy') || title.includes('initial cards')) {
        allProjectCards = opt.cards || [];
      }
      if (title.includes('prelude')) {
        allPreludes = (opt.cards || []).filter(c => c.name !== 'Merger');
      }
    }

    // EV-based corp scoring: base ability value + synergy with available cards
    // Base EV = how good the corp is standalone (starting MC delta vs avg 63 + ability value)
    const CORP_BASE_EV = {
      // S-tier
      'Point Luna': 18,       // 38 MC (-25) but +1 card/earth tag = ~3-4 cards/game ≈ +12. Net ~-13+12=-1 BUT earth discount combos push it
      'CrediCor': 16,          // 57 MC + 4 MC rebate on 20+ cost cards
      'Interplanetary Cinematics': 16, // 30 MC + 20 steel (-13) + 3 MC/event ≈ +9-12/game
      // A-tier
      'Phobolog': 14,          // 23 MC + 10 ti (-9) + titanium value 4 ≈ permanent +1 ti val
      'Inventrix': 13,         // 45 MC + 3 cards + -2 global req → opens cards
      'Thorgate': 13,          // 48 MC + -3 on power cards
      'Tharsis Republic': 12,  // 40 MC + 1 MC/city + first city
      'Robinson Industries': 12, // 47 MC + action: +1 any lowest prod
      'United Planetaries': 11, // 40 MC + 2 ti + ability varies
      // B-tier
      'Manutech': 10,          // 35 MC + prod gains = instant resource
      'Ecoline': 10,           // 36 MC + 2 plants + 7 plants for greenery
      'Vitor': 10,             // 45 MC + 3 MC per VP card + earth tag
      'Aridor': 9,             // 40 MC + 1 MC prod per new tag type
      'Morning Star Inc': 9,   // 53 MC + -2 Venus req + Venus cards
      'Viron': 9,              // 48 MC + double action per gen
      'Saturn Systems': 8,     // 42 MC + 1 MC prod per jovian
      'Pristar': 8,            // 53 MC + VP/TR control
      'Septum Tribus': 8,      // 36 MC + 2 MC per party leader
      // C-tier
      'Teractor': 7,           // 60 MC + -3 on earth cards (narrow)
      'Helion': 7,             // 42 MC + heat as MC
      'Poseidon': 7,           // 45 MC + colony prod bonus
      'Lakefront Resorts': 6,  // 54 MC + MC from oceans
      'Polyphemos': 6,         // 50 MC + card cost 5 (penalty!) + 5 MC/card action
      'Mons Insurance': 6,     // 48 MC + opponent penalty
      'Stormcraft Incorporated': 6, // 48 MC + floater to heat
      'Celestic': 5,           // 42 MC + VP per 3 floaters
      'Arklight': 5,           // 45 MC + VP per 2 animals
      'Splice': 5,             // 48 MC + 2 MC per microbe tag
      // D-tier
      'Mining Guild': 3,       // 30 MC + 5 steel + steel bonus
      'Terralabs Research': 3, // 14 MC + card cost 1 (massive discount but start broke)
      'Aphrodite': 3,          // 47 MC + venus-only bonus
      'Recyclon': 3,           // 38 MC + microbe gimmick
      'Utopia Invest': 2,      // 40 MC + production to resource
    };
    const projectTags = allProjectCards.flatMap(c => CARD_TAGS[c.name] || []);

    function scoreCorp(corpName) {
      let ev = CORP_BASE_EV[corpName] ?? 5; // unknown corps = average C-tier
      // Tag synergy with available project cards (only top ~5 relevant tags)
      const tagCount = (tag) => projectTags.filter(t => t === tag).length;
      if (corpName === 'Saturn Systems') ev += tagCount('jovian') * 2;
      if (corpName === 'Arklight') ev += (tagCount('animal') + tagCount('plant')) * 1.5;
      if (corpName === 'Teractor') ev += tagCount('earth') * 1.5;
      if (corpName === 'Point Luna') ev += tagCount('earth') * 2;
      if (corpName === 'Interplanetary Cinematics') ev += tagCount('event') * 1.5;
      if (corpName === 'Thorgate') ev += tagCount('power') * 2;
      if (corpName === 'Phobolog' || corpName === 'PhoboLog') ev += tagCount('space') * 1;
      if (corpName === 'Mining Guild') ev += tagCount('building') * 0.5;
      if (corpName === 'Stormcraft Incorporated') ev += tagCount('jovian') * 1.5;
      if (corpName === 'CrediCor') ev += allProjectCards.filter(c => (c.calculatedCost ?? c.cost ?? 0) >= 20).length * 1.5;
      if (corpName === 'Helion') ev += 2; // heat as MC always useful
      if (corpName === 'Ecoline') ev += tagCount('plant') * 1.5;
      if (corpName === 'Poseidon') ev += 3; // colonies always available
      if (corpName === 'Splice') ev += tagCount('microbe') * 1.5;
      if (corpName === 'Celestic') ev += tagCount('venus') * 1;
      // Prelude synergy: if available preludes match corp
      for (const p of allPreludes) {
        const ptags = CARD_TAGS[p.name] || [];
        if (corpName === 'Ecoline' && ptags.includes('plant')) ev += 2;
        if (corpName === 'Point Luna' && ptags.includes('earth')) ev += 2;
        if (corpName === 'Saturn Systems' && ptags.includes('jovian')) ev += 2;
        if (corpName === 'Thorgate' && ptags.includes('power')) ev += 2;
      }
      return { name: corpName, score: ev };
    }

    const responses = opts.map(opt => {
      const cards = opt.cards || [];
      const min = Math.max(0, opt.min ?? 0);
      const max = Math.max(0, opt.max ?? cards.length);
      const title = getTitle(opt).toLowerCase();

      if (title.includes('corporation')) {
        // Score each corp by synergy with available project cards
        const scored = cards.map(c => scoreCorp(c.name)).sort((a, b) => b.score - a.score);
        const best = scored[0]?.name || cards[0].name;
        console.log(`    → Corp pick: ${best} (scores: ${scored.map(s => `${s.name}=${s.score}`).join(', ')})`);
        return { type: 'card', cards: [best] };
      }
      if (title.includes('prelude')) {
        const valid = cards.filter(c => c.name !== 'Merger');
        const pool = valid.length >= min ? valid : cards;
        // EV-based prelude scoring with corp synergy
        const scored = pool.map(c => ({ name: c.name, ev: scorePrelude(c, state, corp) }));
        scored.sort((a, b) => b.ev - a.ev);
        const picks = scored.slice(0, min).map(c => c.name);
        console.log(`    → Prelude pick: ${picks.join(', ')} (scores: ${scored.map(s => s.name + '=' + s.ev).join(', ')})`);
        return { type: 'card', cards: picks };
      }
      if (title.includes('ceo')) return { type: 'card', cards: [cards[0].name] };
      if (title.includes('buy') || title.includes('initial cards')) {
        const scored = [...cards].sort((a, b) => (scoreCard(b, state) + corpCardBoost(b.name, corp)) - (scoreCard(a, state) + corpCardBoost(a.name, corp)));
        // Include corp boost in threshold — corp-synergy cards are worth buying even if base EV is low
        const worthBuying = scored.filter(c => (scoreCard(c, state) + corpCardBoost(c.name, corp)) >= 4);
        const count = Math.min(max, Math.max(min, worthBuying.length));
        return { type: 'card', cards: scored.slice(0, count).map(c => c.name) };
      }
      return { type: 'card', cards: cards.slice(0, min).map(c => c.name) };
    });
    return { type: 'initialCards', responses };
  }

  return { type: 'option' };
}

// Track consecutive card plays to force SP interleaving
const cardPlayCounter = new Map(); // playerId -> count of consecutive card plays

// Track cards that fail to play (unmet requirements)
const cardBlacklist = new Map(); // playerId -> Set<cardName>

function getBlacklist(pid) {
  if (!cardBlacklist.has(pid)) cardBlacklist.set(pid, new Set());
  return cardBlacklist.get(pid);
}

// ===== GAME LOOP =====
let genCounter = 0;

async function playAllWaiting() {
  let acted = false;
  for (const p of PLAYERS) {
    const state = await fetch(`${BASE}/api/player?id=${p.id}`);
    state._botName = p.name; // Tag for patched-vs-unpatched branching
    const wf = state.waitingFor;
    if (!wf) continue;

    const title = getTitle(wf).slice(0, 50);
    const input = handleInput(wf, state);
    const resp = await post(`${BASE}/player/input?id=${p.id}`, input);

    if (resp.status === 200) {
      console.log(`  ${p.name}: ${wf.type} "${title}" -> OK`);
      acted = true;
    } else {
      const err = resp.body.slice(0, 150);
      // Extract card name from error to blacklist
      const unknownMatch = err.match(/Unknown card name (.+?)"/);
      if (unknownMatch) getBlacklist(p.id).add(unknownMatch[1]);

      // Retry loop: blacklist failing card and try next best card (up to 5 retries)
      let retryOk = false;
      if (wf.type === 'or') {
        // Try to extract card from our input for blacklisting
        if (input.response?.card) getBlacklist(p.id).add(input.response.card);
        state._blacklist = getBlacklist(p.id);
        // Track tried OR indices to skip on retry
        state._skipActions = state._skipActions || new Set();
        if (typeof input.index === 'number') state._skipActions.add(input.index);

        for (let retry = 0; retry < 5; retry++) {
          const input2 = handleInput(wf, state);
          const r2 = await post(`${BASE}/player/input?id=${p.id}`, input2);
          if (r2.status === 200) {
            console.log(`  ${p.name}: retry #${retry+1} -> OK`);
            acted = true; retryOk = true; break;
          }
          // Blacklist failed card and action index
          if (input2.response?.card) getBlacklist(p.id).add(input2.response.card);
          if (typeof input2.index === 'number') state._skipActions.add(input2.index);
          state._blacklist = getBlacklist(p.id);
        }

        // All retries failed — pass
        if (!retryOk) {
          const opts = wf.options || [];
          for (let i = opts.length - 1; i >= 0; i--) {
            const t = getTitle(opts[i]).toLowerCase();
            if (t.includes('pass') || t.includes('end turn') || t.includes('do nothing') || t.includes('skip')) {
              const fb = { type: 'or', index: i, response: handleInput(opts[i], state, 1) };
              const r3 = await post(`${BASE}/player/input?id=${p.id}`, fb);
              if (r3.status === 200) { console.log(`  ${p.name}: pass (fallback: ${err.slice(0,50)})`); acted = true; break; }
            }
          }
          if (!acted) console.log(`  ${p.name}: ERR ${err}`);
        }
      } else if (wf.type === 'card') {
        const fb = { type: 'card', cards: [] };
        const r2 = await post(`${BASE}/player/input?id=${p.id}`, fb);
        if (r2.status === 200) { console.log(`  ${p.name}: card [] (fallback)`); acted = true; }
        else console.log(`  ${p.name}: ERR ${err}`);
      } else {
        console.log(`  ${p.name}: ERR ${err}`);
      }
    }
  }
  return acted;
}

async function main() {
  let lastPhase = '';
  let stuckCount = 0;

  for (let turn = 0; turn < 15000; turn++) {
    const game = await fetch(`${BASE}/api/game?id=${GAME_ID}`);
    const phase = game.phase;

    if (phase !== lastPhase) {
      if (phase === 'action') {
        genCounter++;
        cardBlacklist.clear();
        cardPlayCounter.clear();
        playerStrategies.clear();

        // Print VP scoreboard + remaining steps at start of each action phase
        try {
          const s0 = await fetch(`${BASE}/api/player?id=${PLAYERS[0].id}`);
          const steps = remainingSteps(s0);
          const g = s0?.game || {};
          const tempS = Math.max(0, Math.round((8 - (g.temperature ?? -30)) / 2));
          const o2S = Math.max(0, 14 - (g.oxygenLevel ?? 0));
          const ocS = Math.max(0, 9 - (g.oceans ?? 0));
          const ruling = g.turmoil?.ruling || '?';
          const vpLine = (s0.players || []).map(p => {
            const vp = p.victoryPointsBreakdown?.total ?? '?';
            return `${p.name||p.color}:${vp}VP`;
          }).join(' ');
          console.log(`\n=== GEN ${genCounter} — ACTION | steps=${steps} (temp=${tempS} o2=${o2S} oc=${ocS}) ruling=${ruling} [${vpLine}] ===`);
        } catch(_) {
          console.log(`\n=== GEN ${genCounter} — ACTION ===`);
        }
      } else if (phase === 'end') {
        console.log(`\n=== GEN ${genCounter} — END ===`);
      }
      lastPhase = phase;
      stuckCount = 0;
    }

    // Check isTerraformed from player API (SimpleGameModel from /api/game doesn't have it)
    const p0state = phase !== 'end' ? await fetch(`${BASE}/api/player?id=${PLAYERS[0].id}`) : null;
    const isTerraformed = p0state?.game?.isTerraformed ?? false;
    if (phase === 'end' || isTerraformed || genCounter >= 40) {
      if (genCounter >= 40 && phase !== 'end') {
        console.log(`\n========== GAME ABORTED (gen ${genCounter} cap) ==========`);
      } else {
        console.log('\n========== GAME OVER ==========');
      }
      const scores = [];
      for (const p of PLAYERS) {
        const s = await fetch(`${BASE}/api/player?id=${p.id}`);
        const tp = s.thisPlayer;
        const vp = tp.victoryPointsBreakdown || {};
        const corp = (tp.tableau || [])[0]?.name ?? '?';
        console.log(`\n${p.name} (${corp}): TOTAL=${vp.total??'?'} VP`);
        console.log(`  TR=${vp.terraformRating} milestones=${vp.milestones} awards=${vp.awards} greenery=${vp.greenery} city=${vp.city} cards=${vp.victoryPoints}`);
        const tableau = (tp.tableau || []).map(c => c.name);
        console.log(`  Tableau (${tableau.length}): ${tableau.slice(0, 12).join(', ')}...`);
        scores.push({ name: p.name, corp, vp: vp.total ?? 0, gens: genCounter,
          tr: vp.terraformRating ?? 0, milestones: vp.milestones ?? 0, awards: vp.awards ?? 0,
          greenery: vp.greenery ?? 0, city: vp.city ?? 0, cards: vp.victoryPoints ?? 0,
          tableau: tableau.length });
      }
      return scores;
    }

    const acted = await playAllWaiting();
    if (!acted) {
      stuckCount++;
      if (stuckCount > 30) {
        // Maybe game ended — check via player API (has isTerraformed)
        const gCheck = await fetch(`${BASE}/api/game?id=${GAME_ID}`);
        const pCheck = await fetch(`${BASE}/api/player?id=${PLAYERS[0].id}`);
        const isGameOver = gCheck.phase === 'end' || pCheck?.game?.isTerraformed;
        if (isGameOver) {
          console.log('\n========== GAME OVER ==========');
          const scores = [];
          for (const p of PLAYERS) {
            const s = await fetch(`${BASE}/api/player?id=${p.id}`);
            const tp = s.thisPlayer;
            const vp = tp.victoryPointsBreakdown || {};
            const corp = (tp.tableau || [])[0]?.name ?? '?';
            console.log(`\n${p.name} (${corp}): TOTAL=${vp.total??'?'} VP`);
            console.log(`  TR=${vp.terraformRating} milestones=${vp.milestones} awards=${vp.awards} greenery=${vp.greenery} city=${vp.city} cards=${vp.victoryPoints}`);
            const tableau = (tp.tableau || []).map(c => c.name);
            console.log(`  Tableau (${tableau.length}): ${tableau.slice(0, 12).join(', ')}...`);
            scores.push({ name: p.name, corp, vp: vp.total ?? 0, gens: genCounter });
          }
          return scores;
        }
        const gm = pCheck?.game || {};
        console.log(`\nSTUCK! phase=${gCheck.phase} gen=${genCounter} isTerraformed=${gm.isTerraformed} temp=${gm.temperature} o2=${gm.oxygenLevel} oceans=${gm.oceans}`);
        for (const p of PLAYERS) {
          const s = await fetch(`${BASE}/api/player?id=${p.id}`);
          if (s.waitingFor) {
            console.log(`${p.name}: ${s.waitingFor.type} "${getTitle(s.waitingFor).slice(0,60)}"`);
            if (s.waitingFor.options) s.waitingFor.options.forEach((o,i) => console.log(`  [${i}] ${o.type} "${getTitle(o).slice(0,50)}"`));
            console.log(`  RAW: ${JSON.stringify(s.waitingFor).slice(0, 400)}`);
          } else console.log(`${p.name}: idle`);
        }
        return;
      }
    } else stuckCount = 0;

    await new Promise(r => setTimeout(r, 15));
  }
}

async function createGame(firstPlayerIdx = 0) {
  const playerDefs = [
    { name: 'Alpha', color: 'red' },
    { name: 'Beta',  color: 'green' },
    { name: 'Gamma', color: 'blue' },
  ];
  const payload = {
    players: playerDefs.map((p, i) => ({ ...p, beginner: false, handicap: 0, first: i === firstPlayerIdx })),
    board: 'tharsis',
    seed: Math.random(),
    solarPhaseOption: false,
    shuffleMapOption: false,
    randomMA: 'No randomization',
    draftVariant: true,
    initialDraft: true,
    startingCorporations: 2,
    startingPreludes: 4,
    showTimers: false,
    showOtherPlayersVP: true,
    fastModeOption: true,
    undoOption: false,
    soloTR: false,
    includedCards: [],
    bannedCards: [],
    customCorporationsList: [],
    customColoniesList: [],
    customPreludes: [],
    customCeos: [],
    startingCeos: 3,
    expansions: {
      corpera: true, prelude: true, turmoil: true, colonies: true,
      venus: true, ares: false, moon: false, pathfinders: false,
      ceo: false, community: false, promo: true, starwars: false,
      underworld: false, prelude2: false,
    },
  };
  const data = JSON.stringify(payload);
  const result = await new Promise((res, rej) => {
    const req = require('http').request({
      hostname: 'localhost', port: 8081, path: '/api/creategame',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (r) => { let b=''; r.on('data', c=>b+=c); r.on('end', ()=>res({status:r.statusCode,body:b})); });
    req.on('error', rej); req.write(data); req.end();
  });
  if (result.status !== 200 && result.status !== 201) throw new Error(`Create game failed: ${result.body.slice(0,200)}`);
  const game = JSON.parse(result.body);
  console.log(`New game: ${game.id}`);
  console.log(`Players: ${game.players.map(p => `${p.name}=${p.id}`).join(', ')}`);
  return game;
}

async function runBatch(n) {
  const allResults = [];
  await restartServer();
  for (let i = 1; i <= n; i++) {
    if (i > 1 && (i - 1) % RESTART_EVERY === 0) {
      console.log('\n--- Restarting server (OOM prevention, every ' + RESTART_EVERY + ' games) ---');
      await restartServer();
    }
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`BATCH ${i}/${n}`);
    console.log('━'.repeat(60));
    const game = await createGame((i - 1) % 3);
    GAME_ID = game.id;
    PLAYERS = game.players.map(p => ({ name: p.name, id: p.id }));
    genCounter = 0;
    cardBlacklist.clear();
    cardPlayCounter.clear();
    playerStrategies.clear();
    const scores = await main();
    if (scores) allResults.push({ gameNum: i, id: game.id, scores, gens: genCounter });
  }

  // ===== STATISTICS =====
  const names = ['Alpha', 'Beta', 'Gamma'];
  stopServer();
  console.log('\n' + '═'.repeat(60));
  console.log(`BATCH COMPLETE — ${allResults.length} games`);
  console.log('═'.repeat(60));

  // Per-player stats
  const stats = {};
  for (const nm of names) {
    const vpList = allResults.map(r => r.scores.find(s => s.name === nm)?.vp ?? 0);
    const wins = allResults.filter(r => {
      const myVP = r.scores.find(s => s.name === nm)?.vp ?? 0;
      return r.scores.every(s => s.name === nm || s.vp <= myVP);
    }).length;
    stats[nm] = { vpList, wins, avg: (vpList.reduce((a,b)=>a+b,0)/vpList.length).toFixed(1), min: Math.min(...vpList), max: Math.max(...vpList) };
  }

  console.log('\nPlayer       Wins  Win%   Avg    Min  Max');
  console.log('─'.repeat(46));
  for (const nm of names) {
    const s = stats[nm];
    const pct = ((s.wins / allResults.length) * 100).toFixed(0);
    console.log(`${nm.padEnd(12)} ${String(s.wins).padStart(4)}  ${String(pct+'%').padStart(4)}  ${String(s.avg).padStart(5)}  ${String(s.min).padStart(3)}  ${s.max}`);
  }

  const avgGens = (allResults.reduce((a,r)=>a+r.gens,0)/allResults.length).toFixed(1);
  console.log(`\nAvg game length: ${avgGens} generations`);

  // VP Breakdown averages (across all players)
  const allScores = allResults.flatMap(r => r.scores);
  const avg = (key) => (allScores.reduce((a,s) => a + (s[key] ?? 0), 0) / allScores.length).toFixed(1);
  console.log(`\nVP Breakdown (avg all players):`);
  console.log(`  TR=${avg('tr')} milestones=${avg('milestones')} awards=${avg('awards')} greenery=${avg('greenery')} city=${avg('city')} cards=${avg('cards')} tableau=${avg('tableau')}`);

  // Per-game summary
  console.log('\n# | Alpha      | Beta       | Gamma      | Winner | Gens');
  console.log('─'.repeat(58));
  for (const r of allResults) {
    const row = names.map(nm => {
      const s = r.scores.find(x => x.name === nm);
      return `${s?.vp??'?'}VP(${s?.corp?.slice(0,8)??'?'})`.padEnd(10);
    });
    const winner = r.scores.reduce((a,b) => a.vp >= b.vp ? a : b).name;
    console.log(`${String(r.gameNum).padStart(1)} | ${row.join(' | ')} | ${winner.padEnd(5)} | ${r.gens}`);
  }
}

if (process.argv[2] === 'new') {
  createGame().then(g => {
    console.log(`\nTo run: update GAME_ID="${g.id}" and PLAYERS in smartbot.js`);
  }).catch(e => console.error('Fatal:', e));
} else if (process.argv[2] === 'batch') {
  const n = parseInt(process.argv[3]) || 5;
  runBatch(n).catch(e => console.error('Fatal:', e));
} else {
  console.log(`Smart Bot v65 (strategy+planner) | Game: ${GAME_ID}`);
  main().catch(e => console.error('Fatal:', e));
}
