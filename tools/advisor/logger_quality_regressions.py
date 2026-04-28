#!/usr/bin/env python3
"""Regression checks for logger-quality diagnostics."""

from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOGGER_QUALITY = ROOT / "tools" / "advisor" / "logger-quality.py"


def load_logger_quality():
    spec = importlib.util.spec_from_file_location("logger_quality", LOGGER_QUALITY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def assert_empty_logs_are_not_trusted() -> None:
    logger_quality = load_logger_quality()
    report = logger_quality.build_quality_report("g-empty", [])

    assert report["quality_status"] == "no_logs", report
    assert "not usable for advisor/shadow calibration" in report["conclusion"], report


def assert_logs_without_card_events_are_not_calibration_data(tmp_path: Path) -> None:
    logger_quality = load_logger_quality()
    log_path = tmp_path / "watch_live_g-test.jsonl"
    log_path.write_text('{"type":"session_start","game_id":"g-test"}\n', encoding="utf-8")

    report = logger_quality.build_quality_report("g-test", [log_path])

    assert report["quality_status"] == "no_card_events", report
    assert "instrumentation/debug only" in report["conclusion"], report


def assert_auto_watch_ev_logs_are_counted(tmp_path: Path) -> None:
    logger_quality = load_logger_quality()
    log_dir = tmp_path / "auto_watch"
    log_dir.mkdir()
    log_path = log_dir / "watch_g-test_Alice_20260425_181440.jsonl"
    log_path.write_text(
        '{"ev":"turn_start","gen":1,"phase":"action"}\n'
        '{"ev":"card_played","card":"Research","gen":1,"phase":"action"}\n',
        encoding="utf-8",
    )

    report = logger_quality.build_quality_report("g-test", [log_path])

    assert report["event_counts"]["turn_start"] == 1, report
    assert report["event_counts"]["card_played"] == 1, report
    assert report["players"][0]["player"] == "Alice", report
    assert report["players"][0]["card_played"] == 1, report
    assert report["quality_status"] == "legacy_only", report


def main() -> int:
    assert_empty_logs_are_not_trusted()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        assert_logs_without_card_events_are_not_calibration_data(tmp_path)
        assert_auto_watch_ev_logs_are_counted(tmp_path)

    print("logger-quality regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
