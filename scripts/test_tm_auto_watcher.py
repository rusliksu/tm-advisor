#!/usr/bin/env python3
import unittest
from unittest.mock import Mock
from pathlib import Path

import tm_auto_watcher
from tm_auto_watcher import AutoWatcher, GameWatcher


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class AutoWatcherTests(unittest.TestCase):
    def test_discovery_skips_requests_without_server_id(self):
        watcher = AutoWatcher(server_id="")
        watcher.client.session.get = Mock()

        games = watcher._discover_active_games()

        self.assertEqual(games, [])
        watcher.client.session.get.assert_not_called()

    def test_discovery_uses_server_id_query_param(self):
        watcher = AutoWatcher(server_id="srv-123")
        watcher.client.session.get = Mock(return_value=FakeResponse(200, [
            {"gameId": "g-1", "playerCount": 2, "phase": "action"},
            {"gameId": "g-2", "playerCount": 1, "phase": "action"},
            {"gameId": "g-3", "playerCount": 3, "phase": "end"},
            {"gameId": "g-4", "participantIds": ["p1", "s1"], "phase": "preludes"},
            {"gameId": "g-4b", "participantIds": ["p1", "p2", "s1"], "phase": "preludes"},
            {"gameId": "g-5", "players": [{"id": "p1"}, {"id": "p2"}], "phase": "action"},
        ]))

        games = watcher._discover_active_games()

        self.assertEqual(games, [
            {"gameId": "g-1", "playerCount": 2, "phase": "action"},
            {"gameId": "g-4b", "participantIds": ["p1", "p2", "s1"], "phase": "preludes"},
            {"gameId": "g-5", "players": [{"id": "p1"}, {"id": "p2"}], "phase": "action"},
        ])
        watcher.client.session.get.assert_called_once_with(
            f"{watcher.client._base_url}/api/games",
            params={"serverId": "srv-123"},
            timeout=10,
        )

    def test_discovery_suppresses_unauthorized_loop(self):
        watcher = AutoWatcher(server_id="wrong-id")
        watcher.client.session.get = Mock(return_value=FakeResponse(403, []))

        games = watcher._discover_active_games()

        self.assertEqual(games, [])
        watcher.client.session.get.assert_called_once()

    def test_game_watcher_uses_canonical_entrypoint(self):
        watcher = GameWatcher("g-1", ["p-1"], {"p-1": "me"})
        popen = Mock()

        with unittest.mock.patch.object(tm_auto_watcher.subprocess, "Popen", popen), \
                unittest.mock.patch("builtins.open", unittest.mock.mock_open()):
            watcher.start()

        cmd = popen.call_args.kwargs["args"] if "args" in popen.call_args.kwargs else popen.call_args.args[0]
        self.assertEqual(Path(cmd[1]), tm_auto_watcher.ADVISOR_ENTRYPOINT)
        self.assertEqual(cmd[2:], ["p-1", "--events"])

    def test_build_advisor_cmd_falls_back_to_module_when_entrypoint_missing(self):
        missing = Path("Z:/definitely-missing/tm_advisor.py")
        with unittest.mock.patch.object(tm_auto_watcher, "ADVISOR_ENTRYPOINT", missing):
            cmd = tm_auto_watcher.build_advisor_cmd("p-1")

        self.assertEqual(cmd, [unittest.mock.ANY, "-m", "scripts.tm_advisor.main", "p-1", "--events"])

    def test_game_watcher_exposes_lifecycle_methods(self):
        watcher = GameWatcher("g-1", ["p-1"], {"p-1": "me"})

        self.assertTrue(hasattr(watcher, "is_alive"))
        self.assertTrue(hasattr(watcher, "stop"))
        self.assertTrue(hasattr(watcher, "extract_drafts"))


if __name__ == "__main__":
    unittest.main()
