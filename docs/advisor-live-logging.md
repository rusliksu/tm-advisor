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

It also writes a manifest to `data/game_logs/live-logging/<gameId>-<timestamp>-manifest.json` with process PIDs, commands, and expected output paths.

If the game is already ended, the command refuses to start unless `--force` is passed. A forced start after game end is only useful for final-state smoke checks; it will not recover decision traces.

## Finish

```bash
npm run advisor:finish-live-logging -- <gameId> --server-url https://tm.knightbyte.win --json
```

The finish command:

- reads the latest start manifest for the game, if present;
- stops observer PIDs from the manifest;
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

## Typical Cycle

```bash
npm run advisor:start-live-logging -- pa1f125887ebe --server-url https://tm.knightbyte.win

# play the game

npm run advisor:finish-live-logging -- g70d1cedea091 --server-url https://tm.knightbyte.win --json
```

Then read the generated postgame and shadow reports before changing advisor scores or bot logic.
