"""Regression checks for advisor game logger sessions."""

from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[3]
LOGGER_PATH = ROOT / "scripts" / "tm_advisor" / "game_logger.py"


def load_logger_module():
    spec = importlib.util.spec_from_file_location("game_logger_test", LOGGER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def make_state(game_id: str):
    me = SimpleNamespace(name="Ruslan")
    return SimpleNamespace(
        game_id=game_id,
        game_age=1370,
        me=me,
        opponents=[SimpleNamespace(name="Alice")],
        board_name="hellas",
        is_wgt=True,
        is_draft=True,
        has_colonies=True,
        has_turmoil=False,
        has_venus=True,
        has_pathfinders=False,
        has_ceos=False,
    )


def main() -> None:
    module = load_logger_module()

    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp) / "game_logs"
        offer_log = log_dir / "offers_log.jsonl"
        logger = module.GameLogger(str(log_dir), str(offer_log))
        logger.init_game_session(make_state("gbe04cd365122"))

        assert logger.game_session_id == "gbe04cd365122"
        assert logger.detail_log_path is not None
        game_log = Path(logger.detail_log_path)
        assert "gbe04cd365122" in game_log.name

        first_event = json.loads(game_log.read_text(encoding="utf-8").splitlines()[0])
        assert first_event["game_id"] == "gbe04cd365122"
        assert first_event["event"] == "game_start"

    assert module.GameLogger._stable_game_session_id(make_state("")) == "g1370_Ruslan"
    print("advisor game logger regression checks: OK")


if __name__ == "__main__":
    main()
