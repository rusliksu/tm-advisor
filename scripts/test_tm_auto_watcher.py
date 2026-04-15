#!/usr/bin/env python3
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import tm_auto_watcher
from tm_auto_watcher import AutoWatcher, GameWatcher, build_advisor_cmd


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
            {"gameId": "g-4", "participantIds": ["p1", "spectator", "p2"], "phase": "action"},
        ]))

        games = watcher._discover_active_games()

        self.assertEqual(games, [
            {"gameId": "g-1", "playerCount": 2, "phase": "action"},
            {"gameId": "g-4", "participantIds": ["p1", "spectator", "p2"], "phase": "action"},
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

    def test_build_advisor_cmd_prefers_entrypoint_file(self):
        entrypoint = Path(__file__).resolve()
        with patch.object(tm_auto_watcher, "ADVISOR_ENTRYPOINT", entrypoint):
            cmd = build_advisor_cmd("p123")

        self.assertEqual(
            cmd,
            [tm_auto_watcher.sys.executable, str(entrypoint), "p123", "--events"],
        )

    def test_build_advisor_cmd_falls_back_to_module_mode(self):
        with patch.object(tm_auto_watcher, "ADVISOR_ENTRYPOINT", Path("/tmp/missing-entrypoint.py")):
            cmd = build_advisor_cmd("p123")

        self.assertEqual(
            cmd,
            [tm_auto_watcher.sys.executable, "-m", "scripts.tm_advisor.main", "p123", "--events"],
        )


class FakeProc:
    def __init__(self, poll_result):
        self._poll_result = poll_result

    def poll(self):
        return self._poll_result


class GameWatcherTests(unittest.TestCase):
    def test_is_alive_reaps_finished_processes(self):
        watcher = GameWatcher("g-1", ["p1"], {"p1": "Alice"})
        watcher.processes["p1"] = FakeProc(0)
        watcher.log_paths["p1"] = Path("/tmp/stdout.log")
        watcher.stderr_paths["p1"] = Path("/tmp/stderr.log")

        self.assertFalse(watcher.is_alive())
        self.assertEqual(watcher.processes, {})

    def test_is_alive_keeps_running_processes(self):
        watcher = GameWatcher("g-1", ["p1"], {"p1": "Alice"})
        watcher.processes["p1"] = FakeProc(None)

        self.assertTrue(watcher.is_alive())
        self.assertIn("p1", watcher.processes)


if __name__ == "__main__":
    unittest.main()
