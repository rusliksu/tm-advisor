#!/usr/bin/env bash
# cleanup_gamedb.sh — Cleanup TM game.db (save points + abandoned games)
# Run via cron: 0 4 * * 0  bash /home/openclaw/repos/terraforming-mars/scripts/cleanup_gamedb.sh
#
# Schema: games(game_id, players, save_id INTEGER, game TEXT, status, created_time UNIX_SECONDS)
# Each game has 100-300+ save_ids (undo points), each ~79 KB = 8-24 MB per game
#
# Policy:
#   1. Old saves: keep only max(save_id) per game for games older than 1 day
#   2. Abandoned games (not completed, older than 3 days): delete entirely
#   3. Completed games older than 90 days: delete entirely

set -euo pipefail

DB="/home/openclaw/repos/terraforming-mars/db/game.db"
LOG="/home/openclaw/repos/terraforming-mars/logs/cleanup.log"

if [ ! -f "$DB" ]; then
  echo "DB not found: $DB" >> "$LOG"
  exit 1
fi

NOW=$(date +%s)
CUTOFF_1D=$((NOW - 86400))
CUTOFF_3D=$((NOW - 3 * 86400))
CUTOFF_90D=$((NOW - 90 * 86400))

echo "$(date): Starting cleanup" >> "$LOG"

# Count before
BEFORE=$(sqlite3 "$DB" "SELECT count(*) FROM games;" 2>/dev/null || echo "?")
GAMES_BEFORE=$(sqlite3 "$DB" "SELECT count(DISTINCT game_id) FROM games;" 2>/dev/null || echo "?")
echo "  Rows before: $BEFORE ($GAMES_BEFORE unique games)" >> "$LOG"

# 1. Trim old saves: keep only latest save_id per game (for games >1 day old)
#    This is the main space saver: 300 saves → 1 save = ~95% reduction per game
SAVES_DEL=$(sqlite3 "$DB" "
  DELETE FROM games
  WHERE created_time < $CUTOFF_1D
    AND save_id < (SELECT max(g2.save_id) FROM games g2 WHERE g2.game_id = games.game_id);
  SELECT changes();
" 2>/dev/null || echo "0")
echo "  Old save points trimmed: $SAVES_DEL" >> "$LOG"

# 2. Delete abandoned games (not completed, older than 3 days)
ABANDONED_DEL=$(sqlite3 "$DB" "
  DELETE FROM games
  WHERE created_time < $CUTOFF_3D
    AND game_id NOT IN (SELECT game_id FROM completed_game);
  SELECT changes();
" 2>/dev/null || echo "0")
echo "  Abandoned games deleted: $ABANDONED_DEL" >> "$LOG"

# 3. Delete completed games older than 90 days
OLD_DEL=$(sqlite3 "$DB" "
  DELETE FROM games
  WHERE created_time < $CUTOFF_90D
    AND game_id IN (SELECT game_id FROM completed_game);
  SELECT changes();
" 2>/dev/null || echo "0")
echo "  Old completed games deleted: $OLD_DEL" >> "$LOG"

# 4. Clean orphaned records
sqlite3 "$DB" "
  DELETE FROM game_results WHERE game_id NOT IN (SELECT game_id FROM games);
  DELETE FROM completed_game WHERE game_id NOT IN (SELECT game_id FROM games);
  DELETE FROM participants WHERE game_id NOT IN (SELECT game_id FROM games);
" 2>/dev/null

# Count after
AFTER=$(sqlite3 "$DB" "SELECT count(*) FROM games;" 2>/dev/null || echo "?")
GAMES_AFTER=$(sqlite3 "$DB" "SELECT count(DISTINCT game_id) FROM games;" 2>/dev/null || echo "?")
SIZE=$(du -sh "$DB" | cut -f1)
echo "  Rows after: $AFTER ($GAMES_AFTER unique games)" >> "$LOG"
echo "  Deleted: $((${BEFORE:-0} - ${AFTER:-0})) rows" >> "$LOG"
echo "  DB size: $SIZE (run VACUUM manually if needed)" >> "$LOG"
echo "  Done at $(date)" >> "$LOG"
echo "" >> "$LOG"
