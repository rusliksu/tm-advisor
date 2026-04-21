"""Colorama compatibility wrapper with graceful no-op fallback."""

from __future__ import annotations

try:
    from colorama import Back, Fore, Style, init  # type: ignore
except ModuleNotFoundError:
    class _ColorDummy:
        def __getattr__(self, name: str) -> str:
            return ""

    Back = _ColorDummy()
    Fore = _ColorDummy()
    Style = _ColorDummy()

    def init(*args, **kwargs) -> None:
        return None
