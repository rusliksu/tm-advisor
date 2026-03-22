#!/usr/bin/env python3
"""Merge server + scraped games, compute Elo with VP breakdown + avg gens.
Run on VPS: python3 /home/openclaw/terraforming-mars/elo/merge_elo.py
"""
import json, sqlite3

SCRAPED = "/home/openclaw/terraforming-mars/elo/scraped_games.json"
DB_PATH = "/home/openclaw/terraforming-mars/db/game.db"
OUT = "/home/openclaw/terraforming-mars/elo/data.json"

DEFAULT = 1500; BK = 32
AL = {
    # Руслан
    "gydro": "GydRo", "руслан": "GydRo", "ruslan": "GydRo",
    # Linda/Lind/Lin
    "linda": "Linda", "lind": "Linda", "lin": "Linda", "li": "Linda",
    # MrFahrenheit
    "mrfahrenheit": "MrFahrenheit", "mrf": "MrFahrenheit", "farenhait": "MrFahrenheit", "mr.f": "MrFahrenheit",
    # death
    "death": "death", "death8killer": "death", "dea": "death",
    # MasterKeys
    "masterkeys": "MasterKeys", "mstrkeys": "MasterKeys", "mstrrkeys": "MasterKeys", "master": "MasterKeys",
    # Iropick
    "iropick": "Iropick", "iropikc": "Iropick", "iropic": "Iropick", "iro": "Iropick", "iropikс": "Iropick",
    # wdkymyms
    "wdkymyms": "wdkymyms", "wdk": "wdkymyms", "wdykmyms": "wdkymyms", "wdkmysms": "wdkymyms", "wd": "wdkymyms", "wdkym": "wdkymyms",
    # GeekDumb
    "geekdumb": "GeekDumb", "geek": "GeekDumb",
    # Eket
    "eket678": "Eket", "eket": "Eket",
    # reinforcement
    "reinforcements": "reinforcement", "reinforcement-": "reinforcement", "reinforcement": "reinforcement",
    # Somi
    "somi": "Somi",
    # tarun
    "taruntheo13": "tarun", "taruntheo": "tarun", "tarun": "tarun",
    # Simon
    "simon": "Simon", "s1234": "Simon",
    # J1234
    "j1234": "Simon",  # same as S1234? probably not — keep separate if unsure
    # Giasa
    "giasa_": "Giasa", "giasa": "Giasa",
    # Tersius
    "tersius": "Tersius",
    # Jackir
    "jackir": "Jackir",
    # Борис
    "борис": "Борис",
    # Тома
    "тома": "Тома",
    # Аня
    "аня": "Аня",
    # Серый
    "серый": "Серый",
}

def rs(n):
    k = n.strip().lower(); c = AL.get(k)
    return (c.lower(), c) if c else (k, n)

def gk(e):
    if e < 1400: return BK*1.2
    if e < 1600: return BK
    if e < 1800: return BK*0.8
    if e < 2000: return BK*0.6
    return BK*0.4

def ex(a, b): return 1/(1+10**((b-a)/400))

def load_server_games():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""SELECT gr.game_id, gr.generations, gr.scores, cg.completed_time,
                 json_extract(gr.game_options, '$.boardName')
                 FROM game_results gr JOIN completed_game cg ON gr.game_id = cg.game_id""")
    games = []
    for row in c.fetchall():
        gid, gen, sj, ts, mn = row
        scores = json.loads(sj)
        if not any("playerName" in s for s in scores): continue
        scores.sort(key=lambda s: s.get("playerScore", 0), reverse=True)
        pl = []
        for i, s in enumerate(scores):
            nm = s.get("playerName", "?")
            if nm == "?": continue
            place = i + 1
            if i > 0 and s.get("playerScore", 0) == scores[i-1].get("playerScore", 0):
                place = pl[-1]["place"]
            pl.append({"name": nm, "place": place, "vp": s.get("playerScore", 0),
                        "corp": s.get("corporation", ""), "vpBreakdown": {}})
        if len(pl) >= 2:
            games.append({"game_id": gid, "generation": gen or 0, "map": mn or "",
                          "playerCount": len(pl), "players": pl})
    conn.close()
    return games

def main():
    with open(SCRAPED) as f:
        scraped = json.load(f)
    server = load_server_games()

    ids = set()
    all_g = []
    for g in server: ids.add(g["game_id"]); all_g.append(g)
    for g in scraped:
        if g["game_id"] not in ids: ids.add(g["game_id"]); all_g.append(g)

    print(f"Server: {len(server)}, Scraped: {len(scraped)}, Merged: {len(all_g)}")

    db = {}; gl = []
    for g in all_g:
        pl = g["players"]; n = len(pl)
        if n < 2: continue
        gen = g.get("generation", 0) or 0
        # Place-based Elo
        results = []
        for i in range(n):
            nm, dn = rs(pl[i]["name"])
            me = db.get(nm, {}).get("elo", DEFAULT)
            k = gk(me)
            e = sum(ex(me, db.get(rs(pl[j]["name"])[0], {}).get("elo", DEFAULT)) for j in range(n) if j != i)
            a = sum(1.0 if pl[i]["place"] < pl[j]["place"] else 0.5 if pl[i]["place"] == pl[j]["place"] else 0 for j in range(n) if j != i)
            d = round(k/(n-1)*1.5*(a-e))
            results.append({"name": nm, "displayName": dn, "oldElo": me, "newElo": me+d,
                "delta": d, "place": pl[i]["place"], "corp": str(pl[i].get("corp","")),
                "vp": pl[i].get("vp",0), "vpBreakdown": pl[i].get("vpBreakdown", {})})

        # VP Margin Elo (separate rating)
        for i in range(n):
            nm, _ = rs(pl[i]["name"])
            me_vp = db.get(nm, {}).get("elo_vp", DEFAULT)
            k = gk(me_vp)
            my_vp = pl[i].get("vp", 0)
            e = sum(ex(me_vp, db.get(rs(pl[j]["name"])[0], {}).get("elo_vp", DEFAULT)) for j in range(n) if j != i)
            a = 0
            for j in range(n):
                if j == i: continue
                diff = my_vp - pl[j].get("vp", 0)
                margin = min(abs(diff) / 20.0, 1.0)
                a += 0.5 + (margin * 0.5 if diff > 0 else -margin * 0.5 if diff < 0 else 0)
            d_vp = round(k/(n-1)*1.5*(a-e))
            # Store temporarily to apply after place-based update
            results[i]["delta_vp"] = d_vp
            results[i]["newElo_vp"] = me_vp + d_vp
        for r in results:
            k2 = r["name"]
            if k2 not in db:
                db[k2] = {"elo": DEFAULT, "elo_vp": DEFAULT, "displayName": r["displayName"],
                    "games": 0, "wins": 0, "top3": 0, "totalVP": 0,
                    "totalGens": 0, "totalPlace": 0, "totalMargin": 0, "totalPercentile": 0,
                    "corps": {},
                    "avgBreakdown": {"tr": 0, "milestones": 0, "awards": 0,
                                     "greenery": 0, "city": 0, "cards": 0}}
            p = db[k2]; p["elo"] = r["newElo"]; p["elo_vp"] = r.get("newElo_vp", p["elo_vp"]); p["displayName"] = r["displayName"]
            p["games"] += 1
            if r["place"] == 1: p["wins"] += 1
            if r["place"] <= 3: p["top3"] += 1
            p["totalVP"] += r.get("vp", 0)
            p["totalGens"] += gen
            p["totalPlace"] += r["place"]
            # Percentile: 0% = 1st, 100% = last. Normalized across player counts.
            if n > 1:
                p["totalPercentile"] += (r["place"] - 1) / (n - 1) * 100
            # VP margin: difference from 2nd place (if 1st) or from 1st (if not)
            my_vp = r.get("vp", 0)
            sorted_vps = sorted([x.get("vp", 0) for x in pl], reverse=True)
            if r["place"] == 1 and len(sorted_vps) >= 2:
                p["totalMargin"] += my_vp - sorted_vps[1]  # margin over 2nd
            elif len(sorted_vps) >= 1:
                p["totalMargin"] += my_vp - sorted_vps[0]  # margin from 1st (negative)
            cc = r.get("corp", "")
            if cc: p["corps"][cc] = p["corps"].get(cc, 0) + 1
            # Accumulate VP breakdown
            bd = r.get("vpBreakdown", {})
            for cat in ("tr", "milestones", "awards", "greenery", "city", "cards"):
                p["avgBreakdown"][cat] += bd.get(cat, 0)
        gl.append({"_key": g["game_id"], "server": "mixed", "map": g.get("map",""),
            "generation": gen, "playerCount": n,
            "results": [{"name": r["name"], "displayName": r["displayName"],
                "place": r["place"], "delta": r["delta"],
                "oldElo": r["oldElo"], "newElo": r["newElo"],
                "corp": r.get("corp","")} for r in results]})

    # Compute averages
    for k, p in db.items():
        g = p["games"]
        if g > 0:
            p["avgGens"] = round(p["totalGens"] / g, 1)
            p["avgVP"] = round(p["totalVP"] / g)
            p["avgPlace"] = round(p["totalPlace"] / g, 1)
            p["avgMargin"] = round(p["totalMargin"] / g, 1)
            p["percentile"] = round(100 - p["totalPercentile"] / g)  # invert: 100% = always 1st, 0% = always last
            for cat in p["avgBreakdown"]:
                p["avgBreakdown"][cat] = round(p["avgBreakdown"][cat] / g, 1)

    with open(OUT, "w") as f:
        json.dump({"players": db, "games": gl}, f, ensure_ascii=False, indent=2)

    lb = sorted(db.items(), key=lambda x: x[1]["elo"], reverse=True)
    print(f"Players: {len(lb)}, Games: {len(gl)}")
    gyd = db.get("gydro")
    if gyd:
        print(f"GydRo: elo={gyd['elo']}, games={gyd['games']}, wins={gyd['wins']}, "
              f"avgVP={gyd['avgVP']}, avgGens={gyd['avgGens']}")
        print(f"  breakdown: {gyd['avgBreakdown']}")
    print(f"\nTop 15:")
    for i in range(min(15, len(lb))):
        k, p = lb[i]
        wr = round(p["wins"]/p["games"]*100) if p["games"] else 0
        print(f"{i+1:>3} {p['displayName']:<20} {p['elo']:>5} {p['games']:>3}g "
              f"{wr:>3}% {p['avgVP']:>3}vp {p['avgGens']:>4}gen")
    print("Saved!")

if __name__ == "__main__":
    main()
