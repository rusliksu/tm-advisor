"""TM Advisor — модульный советник для Terraforming Mars."""

from .colorama_compat import init
init()

from .advisor import AdvisorBot
from .spy import SpyMode
from . import colony_advisor
from . import draft_play_advisor


def main(*args, **kwargs):
    from .main import main as _main
    return _main(*args, **kwargs)


__all__ = ["AdvisorBot", "SpyMode", "main", "colony_advisor", "draft_play_advisor"]
