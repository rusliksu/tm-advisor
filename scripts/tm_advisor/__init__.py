"""TM Advisor — модульный советник для Terraforming Mars."""

from colorama import init
init()

from .advisor import AdvisorBot
from .spy import SpyMode
from .main import main

__all__ = ["AdvisorBot", "SpyMode", "main"]
