#!/usr/bin/env python3
"""
Логгер партий Terraforming Mars — поллит API и записывает изменения.

Использование:
    python3 tm-game-logger.py GAME_ID
    python3 tm-game-logger.py GAME_ID --interval 15 --log-dir ./logs
    python3 tm-game-logger.py GAME_ID --base-url http://localhost:8081/api
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

DEFAULT_BASE_URL = "http://localhost:8081/api"
BASE_URL = DEFAULT_BASE_URL

# ANSI colors
C = {
    "cyan": "\033[36m", "green": "\033[32m", "yellow": "\033[33m",
    "red": "\033[31m", "magenta": "\033[35m", "gray": "\033[90m",
    "darkcyan": "\033[36;2m", "white": "\033[0m", "reset": "\033[0m",
}

RESOURCE_FIELDS = [
    ("TR", "TR"), ("MC", "MC"), ("MC_prod", "MCProd"),
    ("Steel", "Steel"), ("Steel_prod", "SteelProd"),
    ("Ti", "Titanium"), ("Ti_prod", "TitaniumProd"),
    ("Plants", "Plants"), ("Plant_prod", "PlantProd"),
    ("Energy", "Energy"), ("Energy_prod", "EnergyProd"),
    ("Heat", "Heat"), ("Heat_prod", "HeatProd"),
    ("Cards", "CardsInHand"), ("Tableau", "TableauSize"),
    ("Actions_game", "ActionsThisGame"),
    ("Actions_round", "ActionsThisRound"),
    ("Cities", "Cities"), ("Colonies", "Colonies"),
    ("VP", "VP"),
]

CORP_NAMES = {
    "Agricola Inc", "Aphrodite", "Arcadian Communities", "Aridor",
    "Arklight", "Astrodrill", "Athena", "Beginner Corporation",
    "Celestic", "Cheung Shing MARS", "CrediCor", "EcoLine",
    "Eris", "Factorum", "Helion", "Incite",
    "Interplanetary Cinematics", "Inventrix", "Junk Ventures", "Lakefront Resorts",
    "Manutech", "Midas", "Mining Guild", "Mons Insurance",
    "Morning Star Inc.", "Pharmacy Union", "Philares", "PhoboLog",
    "Playwrights", "Point Luna", "Polyphemos", "Poseidon",
    "Pristar", "Project Workshop", "Recyclon", "Robinson Industries",
    "Saturn Systems", "Septem Tribus", "Splice", "Stormcraft Incorporated",
    "Teractor", "Terralabs Research", "Tharsis Republic", "Thorgate",
    "United Nations Mars Initiative", "United Nations Mission One", "Utopia Invest", "Valley Trust",
    "Viron", "Vitor",
}

DISPLAY_LABELS = {


    "TR": "TR", "MC": "MC", "MC_prod": "MC prod",
    "Steel": "Steel", "Steel_prod": "Steel prod",
    "Ti": "Ti", "Ti_prod": "Ti prod",
    "Plants": "Plants", "Plant_prod": "Plant prod",
    "Energy": "Energy", "Energy_prod": "Energy prod",
    "Heat": "Heat", "Heat_prod": "Heat prod",
    "Cards": "Cards", "Tableau": "Tableau",
    "Actions_game": "Actions(game)", "Actions_round": "Actions(round)",
    "Cities": "Cities", "Colonies": "Colonies", "VP": "VP",
}


def ts():
    return datetime.now().strftime("%H:%M:%S")


def cprint(msg, color="white"):
    print(f"{C.get(color, '')}{msg}{C['reset']}", flush=True)


class GameLogger:
    def __init__(self, game_id, interval, log_dir):
        self.game_id = game_id
        self.interval = interval
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.log_file = self.log_dir / f"tm_{game_id}_{stamp}.log"
        self.json_file = self.log_dir / f"tm_{game_id}_{stamp}.jsonl"

        self.prev_snapshots = {}
        self.prev_globals = None
        self.prev_milestones = []
        self.prev_awards = []
        self.poll_count = 0
        self.current_phase = ""
        self.initial_draft_logged = set()

    # --- I/O ---

    def log(self, msg, color="white"):
        line = f"[{ts()}] {msg}"
        cprint(line, color)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    def json_event(self, event):
        event["ts"] = int(datetime.now(timezone.utc).timestamp() * 1000)
        with open(self.json_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    @staticmethod
    def fetch(url):
        try:
            req = Request(url, headers={"User-Agent": "tm-logger/2.0"})
            with urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except (URLError, json.JSONDecodeError, OSError):
            return None

    # --- Snapshot ---

    @staticmethod
    def player_snapshot(raw):
        p = raw.get("thisPlayer", {})
        g = raw.get("game", {})

        tableau_raw = p.get("tableau") or []
        tableau = sorted(c["name"] for c in tableau_raw)
        corp = next((c["name"] for c in tableau_raw if c["name"] in CORP_NAMES), "")
        hand = sorted(c["name"] for c in (raw.get("cardsInHand") or []))

        # Draft state
        draft_options = []
        waiting_for_type = ""
        initial_draft_data = None

        wf = raw.get("waitingFor") or {}
        if wf:
            waiting_for_type = wf.get("input_type") or wf.get("inputType") or wf.get("type") or ""

            if wf.get("cards"):
                draft_options = sorted(c["name"] for c in wf["cards"])

            if wf.get("options") and waiting_for_type in ("initialCards", "or"):
                idd = {}
                for opt in wf["options"]:
                    title = opt.get("title", "")
                    if isinstance(title, dict):
                        title = title.get("message", "")
                    title = str(title)
                    cards = [c["name"] for c in (opt.get("cards") or [])]
                    if re.search(r"corporation", title, re.I):
                        idd["corps"] = cards
                    elif re.search(r"[Pp]relude", title):
                        idd["preludes"] = cards
                    elif re.search(r"CEO", title):
                        idd["ceos"] = cards
                    elif re.search(r"cards to buy|initial cards", title, re.I):
                        idd["cards"] = cards
                if idd:
                    initial_draft_data = idd

            if wf.get("options") and not draft_options:
                for opt in wf["options"]:
                    if opt.get("cards"):
                        draft_options = sorted(c["name"] for c in opt["cards"])
                        break

        drafted = sorted(c["name"] for c in (raw.get("draftedCards") or []))

        # VP breakdown
        vp_bd = p.get("victoryPointsBreakdown") or {}
        vp_total = int(vp_bd.get("total", 0))

        # Milestones & Awards from game state
        milestones = []
        for m in (g.get("milestones") or []):
            if m.get("playerName"):
                milestones.append({"name": m.get("name", "?"), "player": m["playerName"]})

        awards = []
        for a in (g.get("awards") or []):
            if a.get("playerName"):
                awards.append({"name": a.get("name", "?"), "player": a["playerName"]})

        return {
            "Name": str(p.get("name", "?")),
            "Color": str(p.get("color", "?")),
            "Corp": corp,
            "TR": int(p.get("terraformRating", 0)),
            "MC": int(p.get("megaCredits", 0)),
            "MCProd": int(p.get("megaCreditProduction", 0)),
            "Steel": int(p.get("steel", 0)),
            "SteelProd": int(p.get("steelProduction", 0)),
            "Titanium": int(p.get("titanium", 0)),
            "TitaniumProd": int(p.get("titaniumProduction", 0)),
            "Plants": int(p.get("plants", 0)),
            "PlantProd": int(p.get("plantProduction", 0)),
            "Energy": int(p.get("energy", 0)),
            "EnergyProd": int(p.get("energyProduction", 0)),
            "Heat": int(p.get("heat", 0)),
            "HeatProd": int(p.get("heatProduction", 0)),
            "CardsInHand": int(p.get("cardsInHandNbr", 0)),
            "TableauSize": len(tableau),
            "ActionsThisGame": int(p.get("actionsTakenThisGame", 0)),
            "ActionsThisRound": int(p.get("actionsTakenThisRound", 0)),
            "Cities": int(p.get("citiesCount", 0)),
            "Colonies": int(p.get("coloniesCount", 0)),
            "VP": vp_total,
            "VPBreakdown": {
                "tr": int(vp_bd.get("terraformRating", 0)),
                "milestones": int(vp_bd.get("milestones", 0)),
                "awards": int(vp_bd.get("awards", 0)),
                "greenery": int(vp_bd.get("greenery", 0)),
                "city": int(vp_bd.get("city", 0)),
                "cards": int(vp_bd.get("victoryPoints", 0)),
            },
            "Generation": int(g.get("generation", 0)),
            "Phase": str(g.get("phase", "")),
            "Temp": int(g.get("temperature", 0)),
            "Oxygen": int(g.get("oxygenLevel", 0)),
            "Oceans": int(g.get("oceans", 0)),
            "Venus": int(g.get("venusScaleLevel", 0)),
            "Step": int(g.get("step", 0)),
            "TableauCards": tableau,
            "HandCards": hand,
            "DraftOptions": draft_options,
            "DraftedCards": drafted,
            "WaitingForType": waiting_for_type,
            "InitialDraftData": initial_draft_data,
            "Milestones": milestones,
            "Awards": awards,
        }

    # --- Compare ---

    @staticmethod
    def compare(old, new):
        changes = []
        deltas = {}
        for label, key in RESOURCE_FIELDS:
            ov, nv = old[key], new[key]
            if ov != nv:
                delta = nv - ov
                sign = "+" if delta > 0 else ""
                changes.append(f"{DISPLAY_LABELS[label]}: {ov} -> {nv} ({sign}{delta})")
                deltas[label] = delta

        new_cards = [c for c in new["TableauCards"] if c not in old["TableauCards"]]
        if new_cards:
            changes.append(f"NEW CARDS PLAYED: {', '.join(new_cards)}")

        gone = [c for c in old["HandCards"] if c not in new["HandCards"]]
        added = [c for c in new["HandCards"] if c not in old["HandCards"]]
        if gone:
            changes.append(f"CARDS GONE from hand: {', '.join(gone)}")
        if added:
            changes.append(f"CARDS ADDED to hand: {', '.join(added)}")

        old_dk = ",".join(old["DraftOptions"])
        new_dk = ",".join(new["DraftOptions"])
        if new_dk != old_dk:
            if new["DraftOptions"]:
                changes.append(f"DRAFT OPTIONS: {', '.join(new['DraftOptions'])}")
            elif old["DraftOptions"]:
                changes.append("DRAFT DONE")

        new_picks = [c for c in new["DraftedCards"] if c not in old["DraftedCards"]]
        if new_picks:
            changes.append(f"DRAFTED: {', '.join(new_picks)}")

        return changes, deltas, new_cards, gone, added

    # --- Main loop ---

    def run(self):
        cprint(f"\n=== TM Game Logger v2 ===", "cyan")
        cprint(f"Game: {self.game_id} | Interval: {self.interval}s", "cyan")
        cprint(f"API:  {BASE_URL}", "gray")
        cprint(f"Log:  {self.log_file}", "gray")
        cprint("Press Ctrl+C to stop.\n", "yellow")

        # Fetch game info
        cprint("Fetching game info...", "gray")
        info = self.fetch(f"{BASE_URL}/game?id={self.game_id}")
        if not info:
            cprint(f"ERROR: Could not fetch game {self.game_id}", "red")
            sys.exit(1)

        players = [
            {"Id": p["id"], "Name": p["name"], "Color": p["color"]}
            for p in info["players"]
        ]
        spectator = info.get("spectatorId", "")
        game_options = info.get("gameOptions", {})
        board = game_options.get("boardName", "?")

        self.log(f"Game {self.game_id} on {board}", "cyan")
        pnames = ", ".join(f"{p['Name']}({p['Color']})" for p in players)
        self.log(f"Players: {pnames}", "cyan")
        self.log(f"Spectator: {spectator}", "gray")
        self.log("=" * 60, "gray")

        # JSONL: game_start
        self.json_event({
            "type": "game_start",
            "game_id": self.game_id,
            "board": board,
            "players": [{"name": p["Name"], "color": p["Color"], "id": p["Id"]} for p in players],
            "spectator": spectator,
            "options": game_options,
        })

        try:
            while True:
                self._poll(players)
        except KeyboardInterrupt:
            pass

        cprint(f"\nDone. Log saved to:", "green")
        cprint(f"  {self.log_file}", "gray")

    def _poll(self, players):
        self.poll_count += 1
        any_change = False
        draft_phases = ("initial_drafting", "drafting")

        for pl in players:
            raw = self.fetch(f"{BASE_URL}/player?id={pl['Id']}")
            if not raw:
                self.log(f"{pl['Name']}: fetch failed", "red")
                continue

            snap = self.player_snapshot(raw)

            # Global params — first poll
            if self.prev_globals is None and self.poll_count == 1:
                self.log(
                    f"Gen {snap['Generation']} | Phase: {snap['Phase']} | "
                    f"Temp:{snap['Temp']} O2:{snap['Oxygen']} "
                    f"Oceans:{snap['Oceans']} Venus:{snap['Venus']}",
                    "green",
                )

            # Check globals
            if self.prev_globals:
                gc = []
                gd = {}
                pg = self.prev_globals
                for gkey in ("Generation", "Temp", "Oxygen", "Oceans", "Venus"):
                    if snap[gkey] != pg[gkey]:
                        label = {"Generation": "GEN", "Temp": "Temp", "Oxygen": "O2",
                                 "Oceans": "Oceans", "Venus": "Venus"}[gkey]
                        gc.append(f"{label}: {pg[gkey]} -> {snap[gkey]}")
                        gd[gkey.lower()] = {"from": pg[gkey], "to": snap[gkey]}
                if snap["Phase"] != pg["Phase"]:
                    gc.append(f"Phase: {pg['Phase']} -> {snap['Phase']}")
                if gc:
                    self.log(f"--- GLOBALS: {' | '.join(gc)} ---", "magenta")
                    any_change = True
                # JSONL: global_change
                if gd:
                    self.json_event({
                        "type": "global_change",
                        "gen": snap["Generation"],
                        "phase": snap["Phase"],
                        **gd,
                    })

            self.prev_globals = {
                "Generation": snap["Generation"], "Phase": snap["Phase"],
                "Temp": snap["Temp"], "Oxygen": snap["Oxygen"],
                "Oceans": snap["Oceans"], "Venus": snap["Venus"],
            }

            # Milestones & Awards tracking
            for m in snap["Milestones"]:
                if m not in self.prev_milestones:
                    self.log(f"  >> MILESTONE: {m['name']} claimed by {m['player']}", "green")
                    self.json_event({
                        "type": "milestone_claimed",
                        "gen": snap["Generation"],
                        "milestone": m["name"],
                        "player": m["player"],
                    })
            self.prev_milestones = snap["Milestones"]

            for a in snap["Awards"]:
                if a not in self.prev_awards:
                    self.log(f"  >> AWARD: {a['name']} funded by {a['player']}", "green")
                    self.json_event({
                        "type": "award_funded",
                        "gen": snap["Generation"],
                        "award": a["name"],
                        "player": a["player"],
                    })
            self.prev_awards = snap["Awards"]

            pid = pl["Id"]

            if pid in self.prev_snapshots:
                prev = self.prev_snapshots[pid]
                changes, deltas, new_cards, gone, added = self.compare(prev, snap)
                if changes:
                    any_change = True
                    self.log(f"{pl['Name']}:", "yellow")
                    for c in changes:
                        self.log(f"  {c}")

                # --- JSONL events ---

                # Resource delta
                if deltas:
                    self.json_event({
                        "type": "resource_delta",
                        "gen": snap["Generation"], "phase": snap["Phase"],
                        "player": pl["Name"], "color": pl["Color"],
                        "deltas": deltas,
                        "new_tableau": new_cards,
                        "cards_gone": gone,
                        "cards_added": added,
                    })

                # Card played — ANY phase (not just setup)
                if new_cards:
                    for card in new_cards:
                        card_type = "card_played"
                        if snap["Phase"] == "preludes" or prev["Phase"] == "preludes":
                            card_type = "prelude_played"
                        if snap["TableauSize"] == 1 and prev["TableauSize"] == 0:
                            card_type = "corp_selected"
                        self.json_event({
                            "type": card_type,
                            "gen": snap["Generation"], "phase": snap["Phase"],
                            "player": pl["Name"], "color": pl["Color"],
                            "card": card,
                        })

                # Initial draft options
                if snap["InitialDraftData"] and pid not in self.initial_draft_logged:
                    idd = snap["InitialDraftData"]
                    self.json_event({
                        "type": "initial_draft_options",
                        "gen": snap["Generation"], "phase": snap["Phase"],
                        "player": pl["Name"], "color": pl["Color"],
                        "corps": idd.get("corps"), "preludes": idd.get("preludes"),
                        "ceos": idd.get("ceos"), "cards": idd.get("cards"),
                    })
                    corps_str = ", ".join(idd.get("corps") or [])
                    self.log(f"  >> INITIAL DRAFT: corps={corps_str}", "darkcyan")
                    self.initial_draft_logged.add(pid)

                # Draft pick — only in draft phases
                old_dk = ",".join(prev["DraftOptions"])
                new_dk = ",".join(snap["DraftOptions"])
                if (old_dk != new_dk and prev["DraftOptions"]
                        and snap["Phase"] in draft_phases):
                    newly_drafted = [c for c in snap["DraftedCards"]
                                     if c not in prev["DraftedCards"]]
                    passed = [c for c in prev["DraftOptions"]
                              if c not in newly_drafted]
                    self.json_event({
                        "type": "draft_pick",
                        "gen": snap["Generation"], "phase": snap["Phase"],
                        "player": pl["Name"], "color": pl["Color"],
                        "from_pack": prev["DraftOptions"],
                        "picked": newly_drafted, "passed": passed,
                        "new_pack": snap["DraftOptions"],
                        "drafted_total": snap["DraftedCards"],
                    })
                    if newly_drafted:
                        self.log(
                            f"  >> DRAFT PICK: {', '.join(newly_drafted)} "
                            f"from [{', '.join(prev['DraftOptions'])}]",
                            "darkcyan",
                        )

                # Draft received — only in draft phases
                if (new_dk != old_dk and snap["DraftOptions"]
                        and not prev["DraftOptions"]
                        and snap["Phase"] in draft_phases):
                    self.json_event({
                        "type": "draft_received",
                        "gen": snap["Generation"], "phase": snap["Phase"],
                        "player": pl["Name"], "color": pl["Color"],
                        "new_pack": snap["DraftOptions"],
                        "drafted_total": snap["DraftedCards"],
                    })
                    self.log(
                        f"  >> DRAFT RECEIVED: [{', '.join(snap['DraftOptions'])}]",
                        "darkcyan",
                    )

                # Research complete
                if prev["Phase"] == "research" and snap["Phase"] != "research":
                    bought = [c for c in snap["HandCards"]
                              if c not in prev["HandCards"]]
                    skipped = [c for c in prev["DraftedCards"]
                               if c not in snap["DraftedCards"]
                               and c not in bought]
                    self.json_event({
                        "type": "research_complete",
                        "gen": snap["Generation"],
                        "player": pl["Name"], "color": pl["Color"],
                        "drafted": prev["DraftedCards"],
                        "bought": bought, "skipped": skipped,
                        "hand_size": snap["CardsInHand"],
                    })
                    if bought:
                        self.log(f"  >> BOUGHT: {', '.join(bought)}", "darkcyan")

                # Phase change
                if prev["Phase"] != snap["Phase"]:
                    self.json_event({
                        "type": "phase_change",
                        "gen": snap["Generation"],
                        "player": pl["Name"],
                        "from": prev["Phase"], "to": snap["Phase"],
                    })

                # Generation change — emit snapshot
                if prev["Generation"] != snap["Generation"]:
                    self.json_event({
                        "type": "generation_snapshot",
                        "gen": snap["Generation"],
                        "player": pl["Name"], "color": pl["Color"],
                        "corp": snap["Corp"],
                        "tr": snap["TR"], "mc": snap["MC"],
                        "mc_prod": snap["MCProd"],
                        "steel": snap["Steel"], "steel_prod": snap["SteelProd"],
                        "ti": snap["Titanium"], "ti_prod": snap["TitaniumProd"],
                        "plants": snap["Plants"], "plant_prod": snap["PlantProd"],
                        "energy": snap["Energy"], "energy_prod": snap["EnergyProd"],
                        "heat": snap["Heat"], "heat_prod": snap["HeatProd"],
                        "hand": snap["CardsInHand"],
                        "tableau": snap["TableauCards"],
                        "cities": snap["Cities"], "colonies": snap["Colonies"],
                        "vp": snap["VP"], "vp_breakdown": snap["VPBreakdown"],
                    })

            else:
                # First poll — full state
                self.log(
                    f"{pl['Name']} ({pl['Color']}) — TR:{snap['TR']} "
                    f"VP:{snap['VP']} Tableau:{snap['TableauSize']} "
                    f"Hand:{snap['CardsInHand']}",
                    "yellow",
                )
                res = (
                    f"  MC:{snap['MC']}({snap['MCProd']}) "
                    f"St:{snap['Steel']}({snap['SteelProd']}) "
                    f"Ti:{snap['Titanium']}({snap['TitaniumProd']}) "
                    f"Pl:{snap['Plants']}({snap['PlantProd']}) "
                    f"En:{snap['Energy']}({snap['EnergyProd']}) "
                    f"Ht:{snap['Heat']}({snap['HeatProd']})"
                )
                self.log(res, "gray")
                if snap["DraftOptions"]:
                    self.log(
                        f"  DRAFT OPTIONS: {', '.join(snap['DraftOptions'])}",
                        "darkcyan",
                    )
                if snap["DraftedCards"]:
                    self.log(
                        f"  ALREADY DRAFTED: {', '.join(snap['DraftedCards'])}",
                        "darkcyan",
                    )

                # JSONL init
                self.json_event({
                    "type": "player_init",
                    "gen": snap["Generation"], "phase": snap["Phase"],
                    "player": pl["Name"], "color": pl["Color"],
                    "corp": snap["Corp"],
                    "tr": snap["TR"], "mc": snap["MC"],
                    "mc_prod": snap["MCProd"],
                    "steel": snap["Steel"], "steel_prod": snap["SteelProd"],
                    "ti": snap["Titanium"], "ti_prod": snap["TitaniumProd"],
                    "plants": snap["Plants"], "plant_prod": snap["PlantProd"],
                    "energy": snap["Energy"], "energy_prod": snap["EnergyProd"],
                    "heat": snap["Heat"], "heat_prod": snap["HeatProd"],
                    "hand": snap["HandCards"],
                    "tableau": snap["TableauCards"],
                    "cities": snap["Cities"], "colonies": snap["Colonies"],
                    "vp": snap["VP"], "vp_breakdown": snap["VPBreakdown"],
                    "draft_opts": snap["DraftOptions"],
                    "drafted": snap["DraftedCards"],
                })
                if snap["InitialDraftData"] and pid not in self.initial_draft_logged:
                    idd = snap["InitialDraftData"]
                    self.json_event({
                        "type": "initial_draft_options",
                        "gen": snap["Generation"], "phase": snap["Phase"],
                        "player": pl["Name"], "color": pl["Color"],
                        "corps": idd.get("corps"), "preludes": idd.get("preludes"),
                        "ceos": idd.get("ceos"), "cards": idd.get("cards"),
                    })
                    self.initial_draft_logged.add(pid)

            self.prev_snapshots[pid] = snap

        # Track phase
        if self.prev_globals:
            self.current_phase = self.prev_globals["Phase"]

        # Game over
        if self.current_phase == "end":
            self.log("=== GAME OVER ===", "red")
            final_scores = []
            for pl in players:
                s = self.prev_snapshots.get(pl["Id"])
                if s:
                    self.log(
                        f"{pl['Name']}: {s['VP']} VP (TR:{s['VPBreakdown']['tr']} "
                        f"M:{s['VPBreakdown']['milestones']} A:{s['VPBreakdown']['awards']} "
                        f"G:{s['VPBreakdown']['greenery']} Ci:{s['VPBreakdown']['city']} "
                        f"Cards:{s['VPBreakdown']['cards']})",
                        "cyan",
                    )
                    final_scores.append({
                        "player": pl["Name"], "color": pl["Color"],
                        "vp": s["VP"], "tr": s["TR"],
                        "vp_breakdown": s["VPBreakdown"],
                        "corp": s["Corp"],
                        "tableau": s["TableauCards"],
                        "tableau_size": s["TableauSize"],
                        "cities": s["Cities"], "colonies": s["Colonies"],
                    })
            self.json_event({
                "type": "game_over",
                "gen": self.prev_globals.get("Generation", 0),
                "final_scores": final_scores,
                "milestones": self.prev_milestones,
                "awards": self.prev_awards,
            })
            sys.exit(0)

        if not any_change and self.poll_count > 1:
            print(".", end="", flush=True)

        # Adaptive polling
        fast_phases = ("drafting", "initial_drafting", "research", "preludes", "ceos")
        sleep = 3 if self.current_phase in fast_phases else self.interval
        time.sleep(sleep)


def main():
    parser = argparse.ArgumentParser(description="TM Game Logger v2")
    parser.add_argument("game_id", help="Game ID (e.g. gb5e67b20401)")
    parser.add_argument("--interval", type=int, default=30,
                        help="Poll interval in seconds (default: 30)")
    parser.add_argument("--base-url", default=None,
                        help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--log-dir", default=None,
                        help="Log directory (default: ./logs)")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = (args.base_url or DEFAULT_BASE_URL).rstrip("/")

    log_dir = args.log_dir or os.path.join(os.path.dirname(__file__) or ".", "logs")
    logger = GameLogger(args.game_id, args.interval, log_dir)
    logger.run()


if __name__ == "__main__":
    main()
