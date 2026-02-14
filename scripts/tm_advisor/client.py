"""TMClient — HTTP-клиент для Terraforming Mars API."""

import time

import requests

from .constants import BASE_URL


class TMClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TM-Advisor/2.0"
        self._last_request = 0.0

    def _rate_limit(self):
        elapsed = time.time() - self._last_request
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_request = time.time()

    def get_player_state(self, player_id: str) -> dict:
        self._rate_limit()
        resp = self.session.get(f"{BASE_URL}/api/player", params={"id": player_id})
        resp.raise_for_status()
        return resp.json()

    def get_game_info(self, game_id: str) -> dict | None:
        """Fetch game overview (includes all player IDs)."""
        self._rate_limit()
        try:
            resp = self.session.get(f"{BASE_URL}/api/game", params={"id": game_id})
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return None

    def discover_all_player_ids(self, identifier: str) -> list[str]:
        """Auto-discover all player IDs from a game ID, player ID, or spectator ID."""
        # If game ID (gXXX) — fetch directly
        if identifier.startswith("g"):
            game_info = self.get_game_info(identifier)
            if game_info and "players" in game_info:
                return [p["id"] for p in game_info["players"] if "id" in p]
            return []

        # If player ID (pXXX) — try to find game ID via spectatorId
        if identifier.startswith("p"):
            state_data = self.get_player_state(identifier)
            game = state_data.get("game", {})
            # spectatorId → game API doesn't accept it, but let's try game.id
            for candidate in [game.get("id"), state_data.get("runId")]:
                if candidate:
                    game_info = self.get_game_info(candidate)
                    if game_info and "players" in game_info:
                        all_ids = [p["id"] for p in game_info["players"] if "id" in p]
                        if identifier in all_ids:
                            all_ids.remove(identifier)
                            all_ids.insert(0, identifier)
                        return all_ids
            return [identifier]

        return [identifier]

    def poll_waiting_for(self, player_id: str, game_age: int, undo_count: int) -> dict:
        self._rate_limit()
        resp = self.session.get(
            f"{BASE_URL}/api/waitingfor",
            params={"id": player_id, "gameAge": game_age, "undoCount": undo_count},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
