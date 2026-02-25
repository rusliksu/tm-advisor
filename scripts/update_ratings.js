#!/usr/bin/env node
// Обновление рейтингов прелюдий и project cards по данным COTD + TFMStats + game logs
const fs = require('fs');
const path = require('path');

const RATINGS_FILE = path.join(__dirname, '..', 'extension', 'data', 'ratings.json.js');

// Читаем файл
let src = fs.readFileSync(RATINGS_FILE, 'utf8');
const prefix = 'const TM_RATINGS=';
if (!src.startsWith(prefix)) {
  console.error('Unexpected file format');
  process.exit(1);
}

let json = src.slice(prefix.length).trim();
// Убираем trailing semicolon если есть
if (json.endsWith(';')) json = json.slice(0, -1);

const data = JSON.parse(json);

// Функция для определения тира по score
function getTier(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// ═══════════════════════════════════════════════════
// ПРЕЛЮДИИ
// ═══════════════════════════════════════════════════
const preludeChanges = {
  // Поднять
  'Great Aquifer':          { s: 90, reason: 'TFMStats rank 1, WR 45.4%' },
  'Eccentric Sponsor':      { s: 76, reason: 'TFMStats rank 6, Elo +1.59' },
  'Supply Drop':            { s: 78, reason: 'TFMStats rank 2, WR 45%' },
  // Понизить
  'Huge Asteroid':          { s: 70, reason: 'TFMStats rank 15, Elo -0.26' },
  'Power Generation':       { s: 38, reason: 'TFMStats rank 31/35, WR 27.7%' },
  'Ecology Experts':        { s: 58, reason: 'TFMStats rank 20, WR 33.2%' },
  'Early Settlement':       { s: 35, reason: 'TFMStats rank 32, WR 27.7%' },
  'Acquired Space Agency':  { s: 70, reason: 'TFMStats rank 14, overbumped' },
  'Supplier':               { s: 52, reason: 'TFMStats rank 21, WR 32.7%' },
  'Mohole':                 { s: 42, reason: 'TFMStats rank 28, Elo -1.55' },
  'Biofuels':               { s: 32, reason: 'TFMStats rank 33, WR 24.9%' },
};

// ═══════════════════════════════════════════════════
// PROJECT CARDS
// ═══════════════════════════════════════════════════
const cardChanges = {
  // Поднять
  'Open City':              { s: 82, reason: 'COTD -18.5 + 59% WR, N=34' },
  'Fish':                   { s: 80, reason: 'COTD -18.5 + 59% WR (Ants proxy)' },
  'Ecology Research':       { s: 80, reason: 'COTD -20.5 + 60% WR, avg VP 127' },
  'Diversity Support':      { s: 72, reason: 'COTD -24.5 + 64% WR, N=25' },
  'Hi-Tech Lab':            { s: 72, reason: 'COTD S/A + card draw logic' },
  'Immigrant City':         { s: 68, reason: 'COTD -19.5 + cheap city tile' },
  'Corporate Stronghold':   { s: 70, reason: 'COTD -17.5 + steel-payable city' },
  'Floating Refinery':      { s: 70, reason: '51% WR, N=69 + Venus engine' },
  'Virus':                  { s: 78, reason: 'COTD "very strong" + 4 MC total' },
  // Понизить
  'Solar Reflectors':       { s: 48, reason: '10% WR (1/10) + energy bias trap' },
  'Sponsoring Nation':      { s: 60, reason: '0% WR (0/5) + req 4 Earth жёсткий' },
  'Static Harvesting':      { s: 62, reason: '24% WR, N=37 + energy component' },
  'Noctis City':            { s: 62, reason: 'COTD ниже + 26% WR, N=47' },
  'Robotic Workforce':      { s: 66, reason: '28% WR, N=53' },
  'Advertising':            { s: 54, reason: '23% WR, N=56 + no-tag penalty' },
};

// ═══════════════════════════════════════════════════
// ПРИМЕНЯЕМ ИЗМЕНЕНИЯ
// ═══════════════════════════════════════════════════
const allChanges = { ...preludeChanges, ...cardChanges };
let applied = 0;
let missing = [];

for (const [name, change] of Object.entries(allChanges)) {
  if (!data[name]) {
    missing.push(name);
    continue;
  }
  const old = data[name];
  const oldScore = old.s;
  const oldTier = old.t;
  const newTier = getTier(change.s);

  data[name].s = change.s;
  data[name].t = newTier;

  const dir = change.s > oldScore ? '↑' : '↓';
  console.log(`${dir} ${name}: ${oldScore}/${oldTier} → ${change.s}/${newTier}  (${change.reason})`);
  applied++;
}

if (missing.length > 0) {
  console.error('\n⚠ NOT FOUND:', missing.join(', '));
}

// Записываем обратно
const output = prefix + JSON.stringify(data);
fs.writeFileSync(RATINGS_FILE, output, 'utf8');

console.log(`\n✓ Applied ${applied} changes, ${missing.length} missing`);
