#!/usr/bin/env python3
"""Run N bot-vs-bot PvP games and collect results.
Usage: python3 run-pvp-batch.py [N] [board]
Run on VPS: cd ~/repos/terraforming-mars && python3 run-pvp-batch.py 5 tharsis
"""
import json, subprocess, sys, os, re, time
import urllib.request

os.chdir(os.path.expanduser("~/repos/terraforming-mars"))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
BOARD = sys.argv[2] if len(sys.argv) > 2 else "tharsis"

CREATE_BODY = {
    "players": [
        {"name": "Alpha", "color": "red", "beginner": False, "first": True, "handicap": 0},
        {"name": "Beta", "color": "blue", "beginner": False, "first": False, "handicap": 0},
        {"name": "Gamma", "color": "green", "beginner": False, "first": False, "handicap": 0},
    ],
    "expansions": {
        "corpera": True, "prelude": True, "prelude2": True, "venus": True,
        "colonies": True, "turmoil": True, "promo": True,
        "ares": False, "moon": False, "pathfinders": False,
        "community": False, "ceo": False, "starwars": False, "underworld": False,
    },
    "draftVariant": True, "initialDraft": True, "randomMA": "Limited synergy",
    "board": BOARD, "undoOption": False, "showTimers": False, "showOtherPlayersVP": True,
    "startingCorporations": 4, "startingPreludes": 4, "politicalAgendasExtension": "Standard",
    "bannedCards": [], "customCorporationsList": [], "customColoniesList": [],
    "customPreludes": [], "customCeos": [], "includedCards": [],
    "shuffleMapOption": False, "soloTR": False, "fastModeOption": False,
    "twoCorpsVariant": False, "solarPhaseOption": False,
}

results = []
for i in range(N):
    print(f"\n=== Game {i+1}/{N} ===")
    req = urllib.request.Request(
        "http://localhost:8081/api/creategame",
        data=json.dumps(CREATE_BODY).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        game = json.loads(resp.read())
    except Exception as e:
        print(f"  FAILED to create: {e}")
        continue

    gid = game["id"]
    players = game["players"]
    print(f"  Game: {gid}")

    # Update smartbot.js with new game/player IDs
    with open("smartbot.js", "r") as f:
        code = f.read()
    code = re.sub(r"let GAME_ID = '[^']*'", f"let GAME_ID = '{gid}'", code)
    plist = ",\n".join([f"  {{ name: '{p['name']}', id: '{p['id']}' }}" for p in players])
    code = re.sub(r"let PLAYERS = \[[\s\S]*?\];", f"let PLAYERS = [\n{plist},\n];", code)
    with open("smartbot.js", "w") as f:
        f.write(code)

    # Run smartbot iterations until game ends
    game_over = False
    for j in range(150):
        try:
            r = subprocess.run(["node", "smartbot.js"], capture_output=True, text=True, timeout=30)
            out = r.stdout + r.stderr
        except subprocess.TimeoutExpired:
            print(f"  Iteration {j+1} timed out")
            continue

        if "GAME OVER" in out:
            game_results = {"game": gid, "board": BOARD}
            for line in out.split("\n"):
                m = re.search(r"(\w+) \((.+?)\): TOTAL=(\d+) VP", line)
                if m:
                    pname, corp, vp = m.group(1), m.group(2), int(m.group(3))
                    game_results[pname] = {"corp": corp, "vp": vp}
                    m2 = re.search(
                        r"TR=(\d+).*milestones=(\d+).*awards=(\d+).*greenery=(\d+).*city=(\d+).*cards=(\d+)",
                        line,
                    )
                    if m2:
                        game_results[pname].update({
                            "tr": int(m2.group(1)), "milestones": int(m2.group(2)),
                            "awards": int(m2.group(3)), "greenery": int(m2.group(4)),
                            "city": int(m2.group(5)), "cards": int(m2.group(6)),
                        })
            results.append(game_results)
            best = max(["Alpha", "Beta", "Gamma"],
                       key=lambda n: game_results.get(n, {}).get("vp", 0))
            bp = game_results.get(best, {})
            print(f"  Winner: {best} ({bp.get('corp', '?')}) {bp.get('vp', 0)} VP  (iter {j+1})")
            game_over = True
            break

    if not game_over:
        print(f"  TIMEOUT after 150 iterations")

# Summary
print(f"\n{'='*60}")
print(f"PvP Batch: {len(results)}/{N} games completed")
corp_wins = {}
for r in results:
    best = max(["Alpha", "Beta", "Gamma"], key=lambda n: r.get(n, {}).get("vp", 0))
    corp = r.get(best, {}).get("corp", "?")
    corp_wins[corp] = corp_wins.get(corp, 0) + 1
    vps = [f"{n}:{r.get(n, {}).get('vp', 0)}" for n in ["Alpha", "Beta", "Gamma"]]
    print(f"  {r['game']}: {' '.join(vps)} -> {best} ({corp})")

print(f"\nCorp wins: {json.dumps(corp_wins, indent=2)}")

all_vps = []
for r in results:
    for n in ["Alpha", "Beta", "Gamma"]:
        if n in r:
            all_vps.append(r[n]["vp"])
if all_vps:
    print(f"Avg VP: {sum(all_vps)/len(all_vps):.1f} | Min: {min(all_vps)} | Max: {max(all_vps)}")

with open("/tmp/pvp-results.json", "w") as f:
    json.dump(results, f, indent=2)
print(f"\nDetailed results: /tmp/pvp-results.json")
