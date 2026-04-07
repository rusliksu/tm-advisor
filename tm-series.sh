#!/bin/bash
# TM Series — запуск серии матчей с агрегированной статистикой
# Использование: ./tm-series.sh [--matches N] [--players N] [--interval SEC]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MATCH_SCRIPT="$SCRIPT_DIR/tm-match.sh"
ANALYZE="$SCRIPT_DIR/tm-analyze.py"
LOG_DIR="$SCRIPT_DIR/logs"

NUM_MATCHES=5
NUM_PLAYERS=2
LOG_INTERVAL=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --matches) NUM_MATCHES="$2"; shift 2 ;;
    --players) NUM_PLAYERS="$2"; shift 2 ;;
    --interval) LOG_INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════╗"
echo "║       TM Series — ${NUM_MATCHES} matches         ║"
echo "║  ${NUM_PLAYERS} players | interval ${LOG_INTERVAL}s          ║"
echo "╚══════════════════════════════════════╝"
echo ""

STARTED=$(date +%s)
GAME_IDS=()
RESULTS=()

for i in $(seq 1 "$NUM_MATCHES"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Match $i/$NUM_MATCHES"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run match and capture output (strip ANSI codes)
  MATCH_OUTPUT=$(bash "$MATCH_SCRIPT" --players "$NUM_PLAYERS" --interval "$LOG_INTERVAL" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')

  # Extract game ID
  GAME_ID=$(echo "$MATCH_OUTPUT" | grep "^Game:" | head -1 | awk '{print $2}')
  GAME_IDS+=("$GAME_ID")

  # Extract winner from python summary (last block with "VP" lines)
  # Format: "  Alpha: 86 VP (...)"
  WINNER=$(echo "$MATCH_OUTPUT" | grep -P '^\s+\w+:\s+\d+ VP' | awk -F: '{name=$1; gsub(/^[ \t]+/,"",name); split($2,a," "); print a[1], name}' | sort -rn | head -1 | cut -d' ' -f2-)

  # Extract event count
  EVENTS=$(echo "$MATCH_OUTPUT" | grep -oP '\(\d+ events\)' | grep -oP '\d+' | tail -1 || echo "?")

  echo "  → Game $GAME_ID: Winner=$WINNER ($EVENTS events)"
  RESULTS+=("$GAME_ID:$WINNER")
  echo ""
done

ENDED=$(date +%s)
ELAPSED=$((ENDED - STARTED))
MINS=$((ELAPSED / 60))
SECS=$((ELAPSED % 60))

echo ""
echo "╔══════════════════════════════════════╗"
echo "║          Series Complete             ║"
echo "║  ${NUM_MATCHES} matches in ${MINS}m${SECS}s               ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Quick results
echo "Results:"
for r in "${RESULTS[@]}"; do
  GID="${r%%:*}"
  WIN="${r#*:}"
  echo "  $GID → $WIN"
done
echo ""

# Run full analysis
JSONL_FILES=$(ls -t "$LOG_DIR"/*.jsonl 2>/dev/null | head -"$NUM_MATCHES")
if [ -n "$JSONL_FILES" ]; then
  echo "Running analysis..."
  echo "$JSONL_FILES" | xargs python3 "$ANALYZE" --summary-only
fi
