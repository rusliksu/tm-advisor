#!/usr/bin/env python3
import unittest
from unittest.mock import Mock

from tm_auto_watcher import AutoWatcher


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
        ]))

        games = watcher._discover_active_games()

        self.assertEqual(games, [{"gameId": "g-1", "playerCount": 2, "phase": "action"}])
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


if __name__ == "__main__":
    unittest.main()
