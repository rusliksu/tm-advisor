#!/usr/bin/env python3
"""
TM Advisor v2 — Советник для Terraforming Mars (herokuapp).
Подключается к игре через player ID, поллит API и даёт рекомендации.
НЕ автоигрок — только советы (GET only).

Использование:
    python scripts/tm_advisor.py <player_id>              # ANSI-терминал
    python scripts/tm_advisor.py <player_id> --claude      # Markdown для Claude Code
    python scripts/tm_advisor.py <player_id> --snapshot     # Один snapshot и выход
"""

from tm_advisor import main

if __name__ == "__main__":
    main()
