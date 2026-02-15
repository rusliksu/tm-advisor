"""TM Advisor — модульный советник для Terraforming Mars."""

from colorama import init
init()

from .advisor import AdvisorBot
from .spy import SpyMode
from .main import main
from . import colony_advisor
from . import draft_play_advisor

__all__ = ["AdvisorBot", "SpyMode", "main", "colony_advisor", "draft_play_advisor"]
