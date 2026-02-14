"""Entry point — CLI argument parsing and dispatch."""

import argparse

from colorama import Fore, Style

from .client import TMClient
from .spy import SpyMode
from .advisor import AdvisorBot


def main():
    parser = argparse.ArgumentParser(
        description="TM Advisor — советник для Terraforming Mars")
    parser.add_argument("player_id", help="Player ID (pXXX) или Game ID (gXXX) из URL игры")
    parser.add_argument("--spy", nargs="*", default=None,
                        help="SPY mode: без аргументов = авто (нужен game ID), или доп. player IDs")
    parser.add_argument("--claude", action="store_true",
                        help="Markdown вывод для Claude Code (AI анализ)")
    parser.add_argument("--snapshot", action="store_true",
                        help="Один snapshot и выход (для --claude)")
    parser.add_argument("--file", type=str, default=None,
                        help="Автообновляемый файл для Claude Code (перезаписывается при каждом изменении)")
    args = parser.parse_args()

    if args.spy is not None:
        if args.spy:
            all_ids = [args.player_id] + args.spy
        else:
            print(f"{Fore.CYAN}Автопоиск player IDs...{Style.RESET_ALL}")
            client = TMClient()
            all_ids = client.discover_all_player_ids(args.player_id)
            if not all_ids:
                print(f"{Fore.RED}Не удалось найти игроков{Style.RESET_ALL}")
                return
            print(f"{Fore.GREEN}Найдено {len(all_ids)} игроков{Style.RESET_ALL}")
        SpyMode(all_ids).run()
    else:
        player_id = args.player_id
        if player_id.startswith("g"):
            print(f"{Fore.CYAN}Game ID → ищу player ID...{Style.RESET_ALL}")
            client = TMClient()
            game_info = client.get_game_info(player_id)
            if game_info and "players" in game_info:
                player_id = game_info["players"][0]["id"]
                print(f"{Fore.GREEN}Играю за: {game_info['players'][0]['name']} ({player_id[:12]}...){Style.RESET_ALL}")
            else:
                print(f"{Fore.RED}Не удалось получить game info{Style.RESET_ALL}")
                return
        bot = AdvisorBot(player_id, claude_mode=args.claude,
                         snapshot_mode=args.snapshot, output_file=args.file)
        bot.run()
