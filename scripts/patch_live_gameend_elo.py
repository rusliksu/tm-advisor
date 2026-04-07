#!/usr/bin/env python3
from pathlib import Path
import re

path = Path("/home/openclaw/terraforming-mars/src/client/components/GameEnd.vue")
text = path.read_text(encoding="utf-8")

pattern = re.compile(
    r"\n    async fetchEloDelta\(\) \{.*?\n    \},\n    getEndGamePlayerRowColorClass",
    re.S,
)

replacement = """
    async fetchEloDelta() {
      try {
        const normalizeName = (name: string): string => {
          const raw = (name || '').trim().toLowerCase();
          if (raw === 'лёха' || raw === 'леха') return 'алексей';
          if (raw === 'genuinegold') return 'илья';
          return raw;
        };

        const colorByName: Record<string, string> = {};
        for (const p of this.players) {
          colorByName[normalizeName(p.name)] = p.color;
        }

        const resp = await fetch('/elo/data.json?' + Date.now(), {cache: 'no-store'});
        const data = await resp.json();
        const games = data?.games || [];
        const players = data?.players || {};
        const currentGameId = this.game.gameId;
        const currentGame = games.find((g: any) => g._key === currentGameId);
        if (!currentGame || !Array.isArray(currentGame.results) || currentGame.results.length === 0) return;

        const result = currentGame.results.map((r: any) => {
          const displayName = r.displayName || r.name || '?';
          const key = normalizeName(displayName);
          const player = players[key] || null;
          return {
            name: displayName,
            color: colorByName[key] || '',
            delta: Math.round(r.delta || 0),
            elo: Math.round(player?.elo ?? r.newElo ?? 1500),
          };
        });

        result.sort((a, b) => b.elo - a.elo);
        this._eloDelta = result;
      } catch (e) { /* silently fail */ }
    },
    getEndGamePlayerRowColorClass"""

new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("PATCH_TARGET_NOT_FOUND")

path.write_text(new_text, encoding="utf-8")
print("PATCHED")
