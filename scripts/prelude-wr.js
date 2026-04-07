const fs = require('fs');
const path = require('path');
const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/all_cards.json'), 'utf8'));
const preludeNames = new Set(cards.filter(c => c.type === 'prelude').map(c => c.name));

function loadJsonJs(targetPath, varName) {
  const full = path.isAbsolute(targetPath) ? targetPath : path.join(ROOT, targetPath);
  if (!fs.existsSync(full)) return {};
  const raw = fs.readFileSync(full, 'utf8');
  const fn = new Function(raw.replace(/^const /, 'var ') + `\nreturn ${varName};`);
  return fn();
}
const R = loadJsonJs(resolveGeneratedExtensionPath('ratings.json.js'), 'TM_RATINGS');

const logsDir = path.join(ROOT, 'data/game_logs');
const files = fs.readdirSync(logsDir).filter(f => f.startsWith('tm-fetch-') && f.endsWith('.json'));

const preludeStats = {};

for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(logsDir, f), 'utf8'));
  const playerData = raw._combined ? raw.players : [raw];

  // Determine places
  const allPlayers = [];
  for (const pd of playerData) {
    const finalScores = pd.finalScores || {};
    const myFinal = finalScores[pd.myColor];
    const me = pd.players.find(p => p.isMe);
    allPlayers.push({ color: pd.myColor, vp: myFinal ? myFinal.total : 0 });
  }
  allPlayers.sort((a, b) => b.vp - a.vp);
  allPlayers.forEach((p, i) => { p.place = i + 1; });

  for (const pd of playerData) {
    const genKeys = Object.keys(pd.generations || {});
    if (genKeys.length === 0) continue;
    const snap = pd.generations[genKeys[0]].snapshot;
    if (!snap) continue;
    const myColor = pd.myColor;
    const tableau = snap.players?.[myColor]?.tableau || [];
    const playerInfo = allPlayers.find(p => p.color === myColor);
    const place = playerInfo ? playerInfo.place : 0;
    const vp = playerInfo ? playerInfo.vp : 0;

    for (const card of tableau) {
      if (!preludeNames.has(card)) continue;
      if (card === 'Merger') continue;
      if (!preludeStats[card]) preludeStats[card] = { count: 0, wins: 0, totalVP: 0 };
      preludeStats[card].count++;
      preludeStats[card].totalVP += vp;
      if (place === 1) preludeStats[card].wins++;
    }
  }
}

console.log('Prelude                      │ Count │  WR% │ AvgVP │ Tier');
console.log('─'.repeat(65));

const sorted = Object.entries(preludeStats)
  .filter(([_, s]) => s.count >= 2)
  .sort((a, b) => (b[1].wins / b[1].count) - (a[1].wins / a[1].count));

for (const [name, s] of sorted) {
  const wr = Math.round(s.wins / s.count * 100);
  const avgVP = Math.round(s.totalVP / s.count);
  const r = R[name];
  const tier = r ? `${r.t}${r.s}` : '?';
  console.log(`${name.padEnd(28)} │ ${String(s.count).padStart(5)} │ ${String(wr).padStart(3)}% │ ${String(avgVP).padStart(5)} │ ${tier}`);
}
