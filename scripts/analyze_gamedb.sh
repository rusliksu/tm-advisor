#!/bin/bash
# Analyze game.db on VPS — run via: ssh vps 'bash /tmp/analyze_gamedb.sh'
cd /home/openclaw/repos/terraforming-mars

echo "=== TABLES ==="
sqlite3 db/game.db ".tables" 2>/dev/null || echo "DB locked, trying WAL mode..."

echo "=== GAME COUNT ==="
sqlite3 db/game.db "SELECT count(*) as total FROM games;" 2>/dev/null

echo "=== COMPLETED COUNT ==="
sqlite3 db/game.db "SELECT count(*) FROM completed_game;" 2>/dev/null

echo "=== TABLE SIZES ==="
sqlite3 db/game.db "SELECT name, count(*) FROM (SELECT 'games' as name UNION ALL SELECT 'game_results' UNION ALL SELECT 'completed_game' UNION ALL SELECT 'participants'), (SELECT 1) GROUP BY name;" 2>/dev/null

echo "=== SCHEMA ==="
sqlite3 db/game.db ".schema games" 2>/dev/null
sqlite3 db/game.db ".schema game_results" 2>/dev/null
sqlite3 db/game.db ".schema completed_game" 2>/dev/null

echo "=== AVG SIZE PER GAME ==="
sqlite3 db/game.db "SELECT avg(length(save_game)) as avg_bytes FROM games;" 2>/dev/null

echo "=== OLDEST/NEWEST ==="
sqlite3 db/game.db "SELECT min(created_time), max(created_time) FROM games;" 2>/dev/null

echo "=== PLAYER COUNT DISTRIBUTION ==="
sqlite3 db/game.db "SELECT json_extract(save_game, '$.players') as p, count(*) FROM games GROUP BY p LIMIT 10;" 2>/dev/null

echo "=== GAMES BY STATUS ==="
sqlite3 db/game.db "SELECT json_extract(save_game, '$.phase') as phase, count(*) FROM games GROUP BY phase;" 2>/dev/null
