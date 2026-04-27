# Advisor Live Logging

Use this workflow at the start of every live Terraforming Mars game that should be useful for postgame advisor/shadow analysis.

## Start

```bash
cd C:\Users\Ruslan\tm\tm-tierlist
npm run advisor:start-live-logging -- <playerId-or-gameId> --server-url https://tm.knightbyte.win
```

The start command resolves the game and players, then starts two read-only observers:

- `scripts/watch_live_game.py` writes advisor-aware postgame events to `data/game_logs/watch_live_<gameId>_<timestamp>.jsonl`.
- `bot/shadow-bot.js` writes shadow decisions to `data/shadow/shadow-<gameId>.jsonl`.
- The TM server should write accepted player inputs to `data/shadow/server-inputs/input-<gameId>.jsonl` for exact bot-vs-player matching. For `tm.knightbyte.win`, the server writes this on the VPS under `/home/openclaw/repos/tm-tierlist/data/shadow/server-inputs/`; `finish-live-logging` downloads it before merging.

`watch_live_game.py` also writes two full all-player periodic checks on the first poll and then every 300 seconds by default:

- `advisor_check` — advisor snapshot output for every player, including best move, top options, alerts, and diagnostics for suspicious scoring/regression signals.
- `hand_check` — raw hand context used to debug advisor decisions.

Override them with `--advisor-check-interval SEC` and `--hand-check-interval SEC`, or set an interval to `0` to disable that check.

It also writes a manifest to `data/game_logs/live-logging/<gameId>-<timestamp>-manifest.json` with process PIDs, commands, and expected output paths.

For exact shadow merge, start the TM server with:

```bash
SHADOW_LOG=1
SHADOW_LOG_DIR=C:\Users\Ruslan\tm\tm-tierlist\data\shadow\server-inputs
SHADOW_LOG_FILE_PREFIX=input
```

Without this server-side input log, `shadow-analyze` can still show observed action patterns, but mismatch rates are heuristic and must not be used for score calibration.

If the game is already ended, the command refuses to start unless `--force` is passed. A forced start after game end is only useful for final-state smoke checks; it will not recover decision traces.

## Finish

```bash
npm run advisor:finish-live-logging -- <gameId> --server-url https://tm.knightbyte.win --json
```

The finish command:

- reads the latest start manifest for the game, if present;
- stops observer PIDs from the manifest;
- downloads `/home/openclaw/repos/tm-tierlist/data/shadow/server-inputs/input-<gameId>.jsonl` from the `vps` SSH alias unless `--no-input-download` is passed;
- runs `node bot/shadow-merge.js <gameId>`;
- runs `node bot/shadow-analyze.js data/shadow/merged/merged-<gameId>.jsonl`;
- runs `python tools/advisor/postgame-summary.py <gameId> --base-url <server>`;
- runs `python tools/advisor/logger-quality.py <gameId>`;
- writes reports to `data/game_logs/live-logging/`.

Expected report files:

- `data/game_logs/live-logging/<gameId>-shadow-analyze.txt`
- `data/game_logs/live-logging/<gameId>-postgame-summary.txt`
- `data/game_logs/live-logging/<gameId>-postgame-summary.json` when `--json` is used
- `data/game_logs/live-logging/<gameId>-logger-quality.txt`
- `data/game_logs/live-logging/<gameId>-logger-quality.json`
- `data/game_logs/live-logging/<gameId>-finish-<timestamp>.json`

## Interpreting Decision Traces

`Decision traces` is the main health check for shadow logging.

- `Decision traces > 0`: shadow saw actual decision prompts and produced useful replay material.
- `Decision traces = 0`: the logger probably started after game end, no decision prompts occurred while it was running, or server-input/shadow logs were not captured.

`finish-live-logging` prints a `WARNING` when decision traces are zero. Treat that as an instrumentation failure for advisor calibration, even if postgame summary still works.

`Matched exact inputs` is the health check for player-input capture.

- `Matched exact inputs > 0`: `shadow-merge` aligned bot decisions with real accepted player POST inputs.
- `Matched exact inputs = 0` with shadow turns present: server-side input logging is missing or pointed at the wrong directory; use the report for pattern hunting only, not calibration.

## Typical Cycle

```bash
npm run advisor:start-live-logging -- pa1f125887ebe --server-url https://tm.knightbyte.win

# play the game

npm run advisor:finish-live-logging -- g70d1cedea091 --server-url https://tm.knightbyte.win --json
```

Then read the generated postgame and shadow reports before changing advisor scores or bot logic.
