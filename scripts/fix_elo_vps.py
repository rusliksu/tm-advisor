"""Patch GameEnd.vue on VPS: filter Elo delta to current game players only"""

path = "/home/openclaw/terraforming-mars/src/client/components/GameEnd.vue"
with open(path, "r") as f:
    content = f.read()

old = """        // Build delta for current game players
        const result: Array<{name: string; color: string; delta: number; elo: number}> = [];
        for (const [name, p] of Object.entries(pl)) {
          const delta = Math.round(p.elo - p.prevElo);
          if (delta !== 0 || p.prevElo !== SE) {
            result.push({name, color: p.color, delta, elo: Math.round(p.elo)});
          }
        }"""

new = """        // Build delta for current game players ONLY
        const currentPlayers = new Set<string>();
        const currentScores = (games.find((g: any) => g.gameId === currentGameId) || {}).scores || [];
        const useNamesCur = currentScores.length > 0 && currentScores.every((s: any) => s.playerName);
        for (const s of currentScores) {
          const k = useNamesCur ? s.playerName : (s.corporation || '').split('|')[0];
          if (k) currentPlayers.add(k);
        }
        const result: Array<{name: string; color: string; delta: number; elo: number}> = [];
        for (const [name, p] of Object.entries(pl)) {
          if (!currentPlayers.has(name)) continue;
          const delta = Math.round(p.elo - p.prevElo);
          result.push({name, color: p.color, delta, elo: Math.round(p.elo)});
        }"""

if old in content:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("PATCHED OK")
else:
    print("PATTERN NOT FOUND — check if code changed")
