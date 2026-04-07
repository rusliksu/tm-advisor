#!/bin/bash
# TM Match — создаёт игру, запускает логгер и бота
# Использование: ./tm-match.sh [--players N] [--interval SEC]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="/home/openclaw/repos/terraforming-mars"
LOGGER="$SCRIPT_DIR/tm-game-logger.py"
LOG_DIR="$SCRIPT_DIR/logs"

NUM_PLAYERS=2
LOG_INTERVAL=5

while [[ $# -gt 0 ]]; do
  case $1 in
    --players) NUM_PLAYERS="$2"; shift 2 ;;
    --interval) LOG_INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

COLORS=("red" "blue" "green" "yellow" "purple" "orange")
NAMES=("Alpha" "Beta" "Gamma" "Delta" "Epsilon" "Zeta")

PLAYERS_JSON=""
for i in $(seq 0 $((NUM_PLAYERS - 1))); do
  SEP=""
  [ $i -gt 0 ] && SEP=","
  FIRST="false"
  [ $i -eq 0 ] && FIRST="true"
  PLAYERS_JSON="${PLAYERS_JSON}${SEP}{\"name\":\"${NAMES[$i]}\",\"color\":\"${COLORS[$i]}\",\"beginner\":false,\"handicap\":0,\"first\":${FIRST},\"index\":$((i+1))}"
done

echo "=== TM Match ==="
echo "Creating ${NUM_PLAYERS}p game..."

RESULT=$(curl -s -X POST http://localhost:8081/api/creategame \
  -H "Content-Type: application/json" \
  -d "{
  \"players\": [${PLAYERS_JSON}],
  \"expansions\": {\"corpera\":true,\"promo\":false,\"venus\":false,\"colonies\":false,\"prelude\":true,\"prelude2\":false,\"turmoil\":false,\"community\":false,\"ares\":false,\"moon\":false,\"pathfinders\":false,\"ceo\":false,\"starwars\":false,\"underworld\":false},
  \"draftVariant\":true,\"initialDraft\":true,\"board\":\"tharsis\",\"seed\":$RANDOM,
  \"undoOption\":false,\"showTimers\":false,\"startingCorporations\":2,\"soloTR\":false,
  \"showOtherPlayersVP\":false,\"randomFirstPlayer\":false,
  \"customCorporationsList\":[],\"customColoniesList\":[],\"customPreludes\":[],
  \"bannedCards\":[],\"includedCards\":[],\"solarPhaseOption\":false,
  \"shuffleMapOption\":false,\"randomMA\":\"No randomization\",\"includeFanMA\":false,
  \"modularMA\":false,\"fastModeOption\":false,\"removeNegativeGlobalEventsOption\":false,
  \"requiresVenusTrackCompletion\":false,\"requiresMoonTrackCompletion\":false,
  \"moonStandardProjectVariant\":false,\"moonStandardProjectVariant1\":false,
  \"altVenusBoard\":false,\"twoCorpsVariant\":false,\"customCeos\":[],
  \"startingCeos\":3,\"startingPreludes\":4,\"preludeDraftVariant\":false,
  \"ceosDraftVariant\":false,\"aresExtremeVariant\":false,\"politicalAgendasExtension\":\"Standard\"
}")

GAME_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
PLAYERS_STR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(p['name']+':'+p['id'] for p in d['players']))")

echo "Game: $GAME_ID"
echo "Players: $PLAYERS_STR"
echo ""

# Start logger in background
echo "Starting logger (interval=${LOG_INTERVAL}s)..."
python3 "$LOGGER" "$GAME_ID" --interval "$LOG_INTERVAL" --log-dir "$LOG_DIR" &
LOGGER_PID=$!
sleep 2

# Start bot
echo "Starting bot..."
cd "$BOT_DIR"
node smartbot.js --game "$GAME_ID" --players "$PLAYERS_STR" || true
BOT_EXIT=$?

echo ""
echo "Bot finished (exit=$BOT_EXIT). Auto-finishing remaining phases..."

# Auto-finish: pass all players through remaining phases until game ends
python3 -c "
import json, time, sys
from urllib.request import urlopen, Request

API = 'http://localhost:8081'
GAME_ID = '$GAME_ID'
PLAYERS = '$PLAYERS_STR'.split(',')
pids = {p.split(':')[1]: p.split(':')[0] for p in PLAYERS}

def get(url):
    try:
        return json.loads(urlopen(Request(url, headers={'User-Agent':'tm-finish'}), timeout=10).read())
    except: return None

def post(url, data):
    try:
        req = Request(url, json.dumps(data).encode(), headers={'Content-Type':'application/json','User-Agent':'tm-finish'})
        urlopen(req, timeout=10)
        return True
    except: return False

def get_title(t):
    if isinstance(t, dict): return t.get('message', '')
    return str(t) if t else ''

for attempt in range(50):
    game = get(f'{API}/api/game?id={GAME_ID}')
    if not game:
        time.sleep(2); continue
    phase = game.get('phase', '')
    if phase == 'end':
        print('Game reached phase: end')
        break

    acted = False
    for pid, pname in pids.items():
        ps = get(f'{API}/api/player?id={pid}')
        if not ps: continue
        w = ps.get('waitingFor')
        if not w: continue

        wtype = w.get('type', '')

        if wtype == 'or':
            opts = w.get('options', [])
            chosen = len(opts) - 1  # default: last option
            for i, o in enumerate(opts):
                title = get_title(o.get('title', ''))
                if any(kw in title for kw in ['Don', 'Pass', 'Skip', 'End', 'not']):
                    chosen = i
                    break
            print(f'  {pname}: or option {chosen} (of {len(opts)})')
            post(f'{API}/player/input?id={pid}', {'type':'or','index':chosen,'response':{'type':'option'}})
            acted = True

        elif wtype == 'option':
            print(f'  {pname}: option (pass)')
            post(f'{API}/player/input?id={pid}', {'type':'option'})
            acted = True

        elif wtype == 'card':
            # Select no cards (skip buying)
            print(f'  {pname}: card (select none)')
            post(f'{API}/player/input?id={pid}', {'type':'card','cards':[]})
            acted = True

        elif wtype == 'space':
            # Cannot auto-select space, skip if possible
            print(f'  {pname}: space (cannot auto-finish, skipping)')

        else:
            print(f'  {pname}: unknown waitingFor type={wtype}')

    if not acted:
        time.sleep(1)
    time.sleep(0.5)
else:
    game = get(f'{API}/api/game?id={GAME_ID}')
    phase = game.get('phase', '') if game else '?'
    print(f'WARNING: Game did not reach end after 50 attempts (phase: {phase})')
" || true

echo "Waiting for logger to capture game_over..."
sleep 10

# Kill logger if still running
kill $LOGGER_PID 2>/dev/null && echo "Logger stopped." || echo "Logger already exited."

echo ""
LOGFILE=$(ls -t "$LOG_DIR"/tm_${GAME_ID}_*.jsonl 2>/dev/null | head -1)
if [ -n "$LOGFILE" ]; then
  EVENTS=$(wc -l < "$LOGFILE")
  echo "Log: $LOGFILE ($EVENTS events)"
  python3 -c "
import json, sys
from collections import Counter
evts = [json.loads(l) for l in open('$LOGFILE')]
c = Counter(e['type'] for e in evts)
go = [e for e in evts if e['type'] == 'game_over']
if go:
    for s in go[0]['final_scores']:
        vb = s['vp_breakdown']
        print(f\"  {s['player']}: {s['vp']} VP (TR:{vb['tr']} M:{vb['milestones']} A:{vb['awards']} G:{vb['greenery']} Ci:{vb['city']} Cards:{vb['cards']})\")
else:
    print('  (game_over not captured)')
print(f'  Events: {dict(c.most_common())}')
"
fi
