#!/usr/bin/env python3
"""Canonical tm-advisor-py CLI entrypoint."""

from __future__ import annotations

from _bootstrap import add_scripts_dir


add_scripts_dir()

from tm_advisor import main  # noqa: E402


if __name__ == "__main__":
    main()
