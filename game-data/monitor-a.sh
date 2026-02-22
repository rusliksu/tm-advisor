#!/usr/bin/env bash
# Monitor 3 active Terraforming Mars games via spectator API
# Logs only changes (generation, TR, new cards played, game end)
# Runs every 60 seconds for up to 60 iterations (1 hour)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/monitor-a.log"
STATE_DIR="$SCRIPT_DIR/.monitor-state"

mkdir -p "$STATE_DIR"

GAME_IDS=("gf86c31fee0c9" "g57b294398a65" "ga1297d313ce5")
API_BASE="https://terraforming-mars.herokuapp.com/api/spectator?id="

MAX_ITERATIONS=60
INTERVAL=60

# Node.js script that extracts state, compares with previous, and outputs changes
read -r -d '' NODE_SCRIPT << 'NODEOF'
const fs = require('fs');

const gameId = process.argv[2];
const stateDir = process.argv[3];
const snapshotDir = process.argv[4];

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const raw = Buffer.concat(chunks).toString().trim();

  // Handle API errors
  if (!raw || raw === 'Not found' || raw.startsWith('<!') || raw.startsWith('<html')) {
    console.error('API_ERROR: ' + (raw.substring(0, 80) || 'empty response'));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('JSON_PARSE_ERROR: ' + e.message);
    process.exit(1);
  }

  // Save full snapshot
  fs.writeFileSync(snapshotDir + '/' + gameId + '_latest.json', JSON.stringify(data, null, 2));

  // Extract current state
  const game = data.game || {};
  const current = {
    generation: game.generation || 0,
    phase: game.phase || 'unknown',
    players: {}
  };

  (data.players || []).forEach(p => {
    const cards = (p.tableau || []).map(c => c.name);
    current.players[p.name] = {
      tr: p.terraformRating || 0,
      cardCount: cards.length,
      lastCard: cards.length > 0 ? cards[cards.length - 1] : null,
      allCards: cards
    };
  });

  // Load previous state
  const stateFile = stateDir + '/' + gameId + '.json';
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    // First run - no previous state
  }

  // Save current state
  fs.writeFileSync(stateFile, JSON.stringify(current, null, 2));

  // If no previous state, output initial state summary
  if (!prev) {
    const playerSummary = Object.entries(current.players)
      .map(([name, p]) => name + ' TR ' + p.tr + ' (' + p.cardCount + ' cards)')
      .join(' | ');
    console.log('INIT Gen ' + current.generation + ' ' + current.phase + ' | ' + playerSummary);
    return;
  }

  // Compare and build change log
  const changes = [];

  // Generation change
  if (current.generation !== prev.generation) {
    changes.push('Gen ' + prev.generation + '->' + current.generation);
  }

  // Phase change (only if generation didn't change, to avoid noise)
  if (current.phase !== prev.phase && current.generation === prev.generation) {
    changes.push('phase: ' + prev.phase + '->' + current.phase);
  }

  // Player changes
  for (const [name, cur] of Object.entries(current.players)) {
    const old = prev.players[name];
    if (!old) {
      changes.push(name + ' joined');
      continue;
    }

    // TR change
    if (cur.tr !== old.tr) {
      changes.push(name + ' TR ' + old.tr + '->' + cur.tr);
    }

    // New cards played
    if (cur.cardCount > old.cardCount) {
      const newCards = cur.allCards.slice(old.cardCount);
      newCards.forEach(card => {
        changes.push(name + ' played "' + card + '"');
      });
    }
  }

  // Game end detection
  if (current.phase === 'end' && prev.phase !== 'end') {
    let winner = null;
    let maxTr = -1;
    for (const [name, p] of Object.entries(current.players)) {
      if (p.tr > maxTr) {
        maxTr = p.tr;
        winner = name;
      }
    }
    changes.unshift('GAME ENDED | Winner: ' + winner + ' (TR ' + maxTr + ')');
    // Signal game ended
    console.log('ENDED ' + changes.join(' | '));
    return;
  }

  // Output changes (or nothing if no changes)
  if (changes.length > 0) {
    console.log('CHANGE ' + changes.join(' | '));
  }
  // If no changes, output nothing (silent)
});
NODEOF

# Track which games are still active
declare -A GAME_ACTIVE
for gid in "${GAME_IDS[@]}"; do
  GAME_ACTIVE[$gid]=1
done

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_msg() {
  local ts
  ts=$(timestamp)
  echo "[$ts] $1" >> "$LOG_FILE"
  echo "[$ts] $1"
}

log_msg "=== Monitor started: ${GAME_IDS[*]} ==="

for iteration in $(seq 1 $MAX_ITERATIONS); do
  # Check if all games ended
  all_ended=1
  for gid in "${GAME_IDS[@]}"; do
    if [[ "${GAME_ACTIVE[$gid]}" == "1" ]]; then
      all_ended=0
      break
    fi
  done

  if [[ "$all_ended" == "1" ]]; then
    log_msg "=== All games ended. Stopping monitor. ==="
    break
  fi

  for gid in "${GAME_IDS[@]}"; do
    # Skip ended games
    if [[ "${GAME_ACTIVE[$gid]}" != "1" ]]; then
      continue
    fi

    # Fetch API
    response=$(curl -s --max-time 15 "${API_BASE}${gid}" 2>&1)

    # Process with Node
    result=$(echo "$response" | node -e "$NODE_SCRIPT" -- "$gid" "$STATE_DIR" "$SCRIPT_DIR" 2>&1)
    exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
      # Only log API errors occasionally (not every 60s)
      if [[ $((iteration % 10)) -eq 1 ]]; then
        log_msg "$gid: API unavailable ($result)"
      fi
      continue
    fi

    # Parse result
    if [[ "$result" == INIT* ]]; then
      log_msg "$gid: ${result#INIT }"
    elif [[ "$result" == ENDED* ]]; then
      log_msg "$gid: ${result#ENDED }"
      GAME_ACTIVE[$gid]=0
    elif [[ "$result" == CHANGE* ]]; then
      log_msg "$gid: ${result#CHANGE }"
    fi
    # Empty result = no changes, silent
  done

  # Don't sleep after last iteration
  if [[ $iteration -lt $MAX_ITERATIONS ]]; then
    active_count=0
    for gid in "${GAME_IDS[@]}"; do
      [[ "${GAME_ACTIVE[$gid]}" == "1" ]] && ((active_count++))
    done
    if [[ $active_count -gt 0 ]]; then
      sleep $INTERVAL
    fi
  fi
done

log_msg "=== Monitor finished after $iteration iterations ==="
